import * as self from '../../lib/index.js'
import { DeliverTxResponse, SigningStargateClient } from '@cosmjs/stargate'
import { Random } from '@cosmjs/crypto'
import { toBech32, toBase64, fromHex } from '@cosmjs/encoding'
import { TextEncoder } from 'util'
import { toAny } from '../../lib/cosmos/client'
import { createSignerClient } from './test-utils'
import winston from 'winston'

export function randomAddress(prefix: string): string {
  return toBech32(prefix, Random.getBytes(20))
}

async function createLightClient(
  chainId: string,
  signer: SigningStargateClient,
  address: string,
  header: Uint8Array
): Promise<string> {
  const clientState: self.cosmos.client.polyibc.lightclients.SimClientStateEncodeObject = {
    typeUrl: '/polyibc.lightclients.sim.ClientState',
    value: {
      chainId: chainId,
      chainMemo: 'simLC',
      latestHeight: { revisionHeight: '0', revisionNumber: '0' }
    }
  }

  const consensusState: self.cosmos.client.polyibc.lightclients.SimConsensusStateEncodeObject = {
    typeUrl: '/polyibc.lightclients.sim.ConsensusState',
    value: {
      header: header
    }
  }

  const msgCreateClient: self.cosmos.client.polyibc.MsgCreateClientEncodeObject = {
    typeUrl: '/polyibc.core.MsgCreateClient',
    value: {
      chainMemo: clientState.value.chainMemo,
      creator: address,
      clientState: toAny(clientState, self.cosmos.client.polyibc.lightclients.sim.ClientState),
      consensusState: toAny(consensusState, self.cosmos.client.polyibc.lightclients.sim.ConsensusState)
    }
  }

  const res = await signer.signAndBroadcast(address, [msgCreateClient], 'auto')
  // TODO: there's probably a more elegant way of doing this
  const createClientEvent = res.events.filter((event) => {
    return event.type === 'create_client'
  })[0]
  const clientID = createClientEvent?.attributes.filter((attr) => {
    return attr.key === 'client_id'
  })[0].value
  if (clientID === undefined) {
    throw new Error('Could not create sim light client')
  }
  return clientID
}

export class SimLightClient {
  logger: winston.Logger
  signer: SigningStargateClient
  header: Uint8Array
  sender: any
  clientID: string
  chainID: string

  private static async queryLightClient(chain: self.dev.schemas.CosmosChainSet) {
    const tmClient = await self.cosmos.client.newTendermintClient(chain.Nodes[0].RpcHost)
    const queryClient = self.cosmos.client.QueryClient.withExtensions(
      tmClient,
      self.cosmos.client.setupPolyIbcExtension
    )

    const clients = await queryClient.polyibc.ClientStates(
      self.cosmos.client.polyibc.query.QueryClientStatesRequest.fromPartial({})
    )

    for (const state of clients.clientStates) {
      if (state.clientState?.typeUrl !== '/polyibc.lightclients.sim.ClientState') continue
      return state.clientId
    }
    return undefined
  }

  public static async connect(config: any, logger: winston.Logger, reuse: boolean = true): Promise<SimLightClient> {
    const chain = self.dev.schemas.chainSetSchema.cosmos.parse(config)
    const sender = chain.Accounts.find((a) => a.Name === 'relayer')
    if (!sender) throw new Error('cannot find relayer account')
    console.log(sender)
    const signerClient = await createSignerClient(sender, chain.Nodes[0].RpcHost, logger)

    const header = new TextEncoder().encode(
      JSON.stringify({ raw: Buffer.from('abc').toString('base64'), type: 2, height: 0, revision: 0 })
    )

    const chainId = `chain-${Math.floor(Math.random() * 1_000_000)}`
    const clientID = await (async () => {
      if (reuse) {
        let clientID = await this.queryLightClient(chain)
        if (clientID) return clientID
      }
      return await createLightClient(chainId, signerClient, sender.Address, header)
    })()

    return new SimLightClient(signerClient, chainId, clientID, sender, header, logger)
  }

  private constructor(
    signer: SigningStargateClient,
    chainID: string,
    clientID: string,
    sender: any,
    header: any,
    logger: winston.Logger
  ) {
    this.signer = signer
    this.chainID = chainID
    this.clientID = clientID
    this.sender = sender
    this.logger = logger
    this.header = header
  }

  async sendIbcPacket(channelID: string, payload: string, timeout: string): Promise<any> {
    const enc = new TextEncoder()
    const msg: self.cosmos.client.polyibc.MsgSendIbcPacketEncodeObject = {
      typeUrl: '/polyibc.core.MsgSendIbcPacket',
      value: {
        creator: this.sender.Address,
        channelID: channelID,
        remoteSenderAddress: enc.encode(randomAddress('cosmos')),
        payload: enc.encode(payload),
        timeoutTimestamp: timeout,
        proof: {
          proof: enc.encode('hash:abc'),
          key: new Uint8Array(Array(8).fill(0)),
          value: this.header,
          height: { revisionNumber: '0', revisionHeight: '0' }
        }
      }
    }
    const res = await this.signer.signAndBroadcast(this.sender.Address, [msg], 'auto')
    return this.flat('send_packet', res)
  }

  private flat(name: string, res: DeliverTxResponse) {
    const rawLog = JSON.parse(res?.rawLog ?? '')
    const event = rawLog[0].events.find((e: any) => e.type === name)
    const kv = {}
    event.attributes.forEach((e: any) => (kv[e.key] = e.value))
    return kv
  }

  async sendIbcAck(channelID: string, packet: any): Promise<any> {
    const enc = new TextEncoder()
    const ack = {
      result: toBase64(
        enc.encode(
          JSON.stringify({
            moduleName: 'polyibc',
            packetId: packet.packet_sequence
          })
        )
      )
    }
    this.logger.verbose(`ack: ${JSON.stringify(ack, null, 4)}`)

    const msg: self.cosmos.client.polyibc.MsgAcknowledgementEncodeObject = {
      typeUrl: '/polyibc.core.MsgAcknowledgement',
      value: {
        creator: this.sender.Address,
        channelID: channelID,
        remoteSenderAddress: enc.encode(randomAddress('cosmos')),
        ack: enc.encode(JSON.stringify(ack)),
        packet: {
          sequence: packet.packet_sequence,
          sourcePort: packet.packet_src_port,
          sourceChannel: packet.packet_src_channel,
          destinationPort: packet.packet_dst_port,
          destinationChannel: packet.packet_dst_channel,
          timeoutTimestamp: packet.packet_timeout_timestamp,
          data: fromHex(packet.packet_data_hex)
        },
        proof: {
          proof: enc.encode('hash:abc'),
          key: new Uint8Array(Array(8).fill(0)),
          value: this.header,
          height: { revisionNumber: '0', revisionHeight: '0' }
        }
      }
    }
    const res = await this.signer.signAndBroadcast(this.sender.Address, [msg], 'auto')
    return this.flat('write_acknowledgement', res)
  }
}
