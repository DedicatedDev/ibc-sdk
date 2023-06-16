import { ChainSetsRunObj, CosmosAccount, CosmosChainSet } from '../lib/schemas'
import * as self from '../lib/index.js'
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing'
import { DeliverTxResponse, SigningStargateClient } from '@cosmjs/stargate'
import Long from 'long'
import { Tendermint37Client } from '@cosmjs/tendermint-rpc'
import { VIBCRelayer } from '../lib/relayers/vibc'
import { ethers } from 'ethers'
import { EvmAccount } from '../lib/accounts_config'
import { getLogger } from '../lib/utils/logger'

const log = getLogger()

class Client {
  account: CosmosAccount
  client: Tendermint37Client
  signer: SigningStargateClient
  name: string

  private constructor(name: string, account: CosmosAccount, client: Tendermint37Client, signer: SigningStargateClient) {
    this.name = name
    this.account = account
    this.client = client
    this.signer = signer
  }

  static async create(account: CosmosAccount, chain: CosmosChainSet) {
    const queryClient = await self.cosmos.client.newTendermintClient(chain.Nodes[0].RpcHost)
    const offlineSigner = await DirectSecp256k1HdWallet.fromMnemonic(account.Mnemonic!, { prefix: chain.Prefix })
    const signerClient = await self.cosmos.client.SigningStargateClient.createWithSigner(
      queryClient,
      offlineSigner,
      self.cosmos.client.signerOpts()
    )
    return new Client(chain.Name, account, queryClient, signerClient)
  }

  async waitForBlocks(blocks: number) {
    const end = (await this.client.block()).block.header.height + blocks
    do {
      await self.utils.sleep(1000)
    } while ((await this.client.block()).block.header.height < end)
  }

  async createVirtualConnection(nativeClientID: string) {
    log.info(`Creating virtual light client for native client ${nativeClientID}`)
    const createClientMsg: self.cosmos.client.polyibc.MsgCreateVibcClientEncodeObject = {
      typeUrl: '/polyibc.core.MsgCreateVibcClient',
      value: {
        creator: this.account.Address,
        nativeClientID: nativeClientID,
        params: Buffer.from(JSON.stringify({ finalized_only: false, delay_period: 2 }))
      }
    }
    await this.waitForBlocks(2)
    let res = await this.signer.signAndBroadcast(this.account.Address, [createClientMsg], 'auto')
    const vLC = self.cosmos.client.polyibc.MsgCreateVibcClientResponseSchema.parse(flat('create_vibc_client', res))

    log.info('Creating virtual connection...')
    const createConnectionMsg: self.cosmos.client.polyibc.MsgCreateVibcConnectionEncodeObject = {
      typeUrl: '/polyibc.core.MsgCreateVibcConnection',
      value: {
        creator: this.account.Address,
        vibcClientID: vLC.client_id,
        delayPeriod: '0'
      }
    }
    await this.waitForBlocks(2)
    res = await this.signer.signAndBroadcast(this.account.Address, [createConnectionMsg], 'auto')
    return self.cosmos.client.polyibc.MsgCreateVibcConnectionResponseSchema.parse(flat('create_vibc_connection', res))
  }
}

function flat(name: string, res: DeliverTxResponse) {
  if (res.code !== 0) throw new Error(`Response contains an error: ${res}`)
  const rawLog = JSON.parse(res?.rawLog ?? '')
  const event = rawLog[0].events.find((e: any) => e.type === name)
  const kv = {}
  event.attributes.forEach((e: any) => (kv[e.key] = e.value))
  return kv
}

type EndpointInfo = {
  chain: self.schemas.CosmosChainSet
  address: string
  version: string
}

async function queryLightClient(url: string, typeUrl: string) {
  const queryClient = self.cosmos.client.QueryClient.withExtensions(
    await self.cosmos.client.newTendermintClient(url),
    self.cosmos.client.setupPolyIbcExtension
  )

  const clients = await queryClient.polyibc.ClientStates(
    self.cosmos.client.polyibc.query.QueryClientStatesRequest.fromPartial({})
  )
  if (!clients.clientStates) throw new Error('No client states found')
  for (const state of clients.clientStates) {
    if (state.clientState?.typeUrl === typeUrl) return state.clientId
  }

  throw new Error(`could not find light client type: ${typeUrl}`)
}

export async function channelHandshake(
  runtime: ChainSetsRunObj,
  origSrc: string,
  src: EndpointInfo,
  dst: EndpointInfo
) {
  const srcAccount = src.chain.Accounts.find((a) => a.Name === 'relayer')
  if (!srcAccount) throw new Error(`Could not find relayer account in '${src.chain.Name}' chain`)

  const dstAccount = dst.chain.Accounts.find((a) => a.Name === 'relayer')
  if (!dstAccount) throw new Error(`Could not find relayer account in '${dst.chain.Name}' chain`)

  const srcClient = await Client.create(srcAccount, src.chain)
  const dstClient = await Client.create(dstAccount, dst.chain)

  const lc = await queryLightClient(src.chain.Nodes[0].RpcHost, '/polyibc.lightclients.altair.ClientState')
  log.info(`Found light client: ${lc}`)

  const vConnection = await srcClient.createVirtualConnection(lc)
  log.info(`Created virtual connection: ${vConnection}`)

  const portEth2 = `polyibc.Ethereum-Devnet.${src.address.toLowerCase().slice(2)}`
  const ibcRelayerRuntime = runtime.Relayers.find((r) => r.Name.startsWith('ibc-relayer-'))

  if (!ibcRelayerRuntime) throw new Error('Could not find ibc-relayer runtime')
  const ibcconnections = ibcRelayerRuntime.Configuration.connections

  const wasmPortId = 'wasm.' + dst.address

  // ChanOpenInit: on WASM
  let openinit: self.cosmos.client.polyibc.MsgOpenIBCChannelResponse
  {
    log.info(`executing ChanOpenInit on ${dst.chain.Name}`)
    const msg: self.cosmos.client.polyibc.MsgChannelOpenInitEncodeObject = {
      typeUrl: '/ibc.core.channel.v1.MsgChannelOpenInit',
      value: {
        // TODO: this seems to be the only thing the ibc relayer knows about
        portId: wasmPortId,
        signer: dstAccount.Address,

        channel: {
          state: self.cosmos.client.polyibc.channel.State.STATE_INIT,
          // TODO it won't let me use ordered channels
          ordering: self.cosmos.client.polyibc.channel.Order.ORDER_UNORDERED,
          connectionHops: [ibcconnections.srcConnection, vConnection.connection_id],
          counterparty: self.cosmos.client.polyibc.channel.Counterparty.fromPartial({
            portId: portEth2
          }),
          version: dst.version
        }
      }
    }
    await dstClient.waitForBlocks(2)
    const res = await dstClient.signer.signAndBroadcast(dstAccount.Address, [msg], 'auto')
    openinit = self.cosmos.client.polyibc.MsgOpenIBCChannelResponseSchema.parse(flat('channel_open_init', res))
  }
  log.info(`ChanOpenInit on ${dst.chain.Name}: done`)

  // Currently do not use vIBC OpenIbcChannel / ConnectIbcChannel endpoints, due to `ts-relayer` isn't multihop aware.
  // We directly setup the multi-hop channel on Polymer. In order to do so, we need to register port first.

  // RegisterPort: on Polymer
  {
    log.info(`executing RegisterPort on ${src.chain.Name}`)
    const msg: self.cosmos.client.polyibc.MsgRegisterPortEncodeObject = {
      typeUrl: '/polyibc.core.MsgRegisterPort',
      value: {
        remoteSenderAddress: Buffer.from(src.address.toLowerCase().slice(2), 'hex'),
        creator: srcAccount.Address,
        clientID: lc
      }
    }
    await srcClient.waitForBlocks(2)
    const res = await srcClient.signer.signAndBroadcast(srcAccount.Address, [msg], 'auto')
    log.debug('register_port', res)
    log.info(`RegisterPort on ${src.chain.Name}: done`)
  }

  // ChanOpenTry: on Polymer
  let opentry: self.cosmos.client.polyibc.MsgOpenIBCChannelResponse
  {
    log.info(`executing ChanOpenTry on ${src.chain.Name}`)

    const msg: self.cosmos.client.polyibc.MsgChannelOpenTryEncodeObject = {
      typeUrl: '/ibc.core.channel.v1.MsgChannelOpenTry',
      value: {
        portId: portEth2,
        previousChannelId: '',
        signer: srcAccount.Address,
        channel: {
          state: self.cosmos.client.polyibc.channel.State.STATE_TRYOPEN,
          ordering: self.cosmos.client.polyibc.channel.Order.ORDER_UNORDERED,
          connectionHops: [vConnection.connection_id, ibcconnections.srcConnection],
          counterparty: self.cosmos.client.polyibc.channel.Counterparty.fromPartial({
            channelId: openinit.channel_id,
            portId: openinit.port_id
          }),
          version: src.version
        },
        counterpartyVersion: dst.version,
        proofInit: new Uint8Array(Array(8).fill(0)),
        proofHeight: {
          revisionHeight: Long.fromNumber(100),
          revisionNumber: Long.fromNumber(0)
        }
      }
    }
    await srcClient.waitForBlocks(2)
    const res = await srcClient.signer.signAndBroadcast(srcAccount.Address, [msg], 'auto')
    opentry = self.cosmos.client.polyibc.MsgOpenIBCChannelResponseSchema.parse(flat('channel_open_try', res))
  }
  log.info(`ChanOpenTry on ${src.chain.Name}: done`)

  // ChanOpenAck: on WASM
  let openack: self.cosmos.client.polyibc.MsgConnectIBCChannelResponse
  {
    log.info(`executing ChanOpenAck on ${dst.chain.Name}`)
    const msg: self.cosmos.client.polyibc.MsgChannelOpenAckEncodeObject = {
      typeUrl: '/ibc.core.channel.v1.MsgChannelOpenAck',
      value: {
        // TODO: this seems to be the only thing the ibc relayer knows about
        portId: wasmPortId,
        counterpartyVersion: src.version,
        channelId: openinit.channel_id,
        counterpartyChannelId: opentry.channel_id,
        proofTry: new Uint8Array(Array(8).fill(0)),
        proofHeight: {
          revisionHeight: Long.fromNumber(100),
          revisionNumber: Long.fromNumber(0)
        },
        signer: dstAccount.Address
      }
    }
    await dstClient.waitForBlocks(2)
    const res = await dstClient.signer.signAndBroadcast(dstAccount.Address, [msg], 'auto')
    openack = self.cosmos.client.polyibc.MsgConnectIBCChannelResponseSchema.parse(flat('channel_open_ack', res))
  }
  log.info(`ChanOpenAck on ${dst.chain.Name}: done`)

  // ChanOpenConfirm: on Polymer
  let openconfirm: self.cosmos.client.polyibc.MsgConnectIBCChannelResponse
  {
    log.info(`executing ChanOpenConfirm on ${src.chain.Name}`)

    const msg: self.cosmos.client.polyibc.MsgChannelOpenConfirmEncodeObject = {
      typeUrl: '/ibc.core.channel.v1.MsgChannelOpenConfirm',
      value: {
        portId: portEth2,
        signer: srcAccount.Address,
        channelId: opentry.channel_id,
        proofAck: new Uint8Array(Array(8).fill(0)),
        proofHeight: {
          revisionHeight: Long.fromNumber(100),
          revisionNumber: Long.fromNumber(0)
        }
      }
    }
    await srcClient.waitForBlocks(2)
    const res = await srcClient.signer.signAndBroadcast(srcAccount.Address, [msg], 'auto')
    openconfirm = self.cosmos.client.polyibc.MsgConnectIBCChannelResponseSchema.parse(flat('channel_open_confirm', res))
  }

  // TODO: let's get rid of this once the real channel handshake is in place
  await setupChannel(
    runtime,
    origSrc,
    src.address,
    openack.channel_id,
    openconfirm.channel_id,
    openack.connection_id,
    openack.counterparty_port_id!
  )

  const vibcruntime = runtime.Relayers.find((r) => r.Name === 'vibc-relayer')
  if (vibcruntime) {
    const relayer = await VIBCRelayer.reuse(vibcruntime)
    // this is counter intuitive but the original source was replaced by polymer
    // so we want to setup the path between polymer and the original source.
    await relayer.update(src.chain.Name, origSrc, openack.channel_id, openconfirm.channel_id)
    await relayer.start()
  }

  log.info(`ChanOpenConfirm on ${src.chain.Name}: done`)
  log.info(`channel id on ${src.chain.Name}: ${openack.channel_id}`)
  log.info(`channel id on ${dst.chain.Name}: ${openconfirm.channel_id}`)
}

// TODO: do all this so the contract stores the channel id in one of its internal mappings.
// Otherwise, the next call to sendPacket() will fail with a 'Channel not owned by sender' error
async function setupChannel(
  runtime: ChainSetsRunObj,
  chainName: string,
  receiverAddress: string,
  srcChannel: string,
  dstChannel: string,
  connectionHops: string,
  counterpartPortId: string
) {
  const chain = runtime.ChainSets.find((c) => c.Name === chainName)!
  const dispatcher = chain.Contracts.find((c: any) => c.Name === 'Dispatcher')!
  // Do not use account[0] since that's reserved for the vibc relayer
  const account = chain.Accounts![1] as EvmAccount

  const provider = new ethers.providers.JsonRpcProvider(chain.Nodes[0].RpcHost)
  const signer = new ethers.Wallet(account.PrivateKey!).connect(provider)
  const contract = new ethers.Contract(dispatcher.Address, dispatcher.Abi!, signer)
  const connect = await contract.connectIbcChannel(
    receiverAddress,
    ethers.utils.formatBytes32String(srcChannel),
    connectionHops.split('.'),
    0,
    counterpartPortId,
    ethers.utils.formatBytes32String(dstChannel),
    ethers.utils.formatBytes32String('1.0'),
    { proofHeight: 0, proof: ethers.utils.toUtf8Bytes('1') }
  )
  await connect.wait()
}
