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
  version: string
  name: string
  portid: string
  connectionHops: string[]
  channelId: string

  private constructor(
    name: string,
    version: string,
    portid: string,
    account: CosmosAccount,
    client: Tendermint37Client,
    signer: SigningStargateClient
  ) {
    this.name = name
    this.version = version
    this.account = account
    this.client = client
    this.signer = signer
    this.portid = portid
    this.channelId = ''
    this.connectionHops = []
  }

  static async create(account: CosmosAccount, chain: CosmosChainSet, version: string, portid: string) {
    const queryClient = await self.cosmos.client.newTendermintClient(chain.Nodes[0].RpcHost)
    const offlineSigner = await DirectSecp256k1HdWallet.fromMnemonic(account.Mnemonic!, { prefix: chain.Prefix })
    const signerClient = await self.cosmos.client.SigningStargateClient.createWithSigner(
      queryClient,
      offlineSigner,
      self.cosmos.client.signerOpts()
    )
    return new Client(chain.Name, version, portid, account, queryClient, signerClient)
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

  async channOpenInit(counter: Client, connectionHops: string[]) {
    log.info(`executing ChanOpenInit on ${this.name}`)
    this.connectionHops = connectionHops
    const msg: self.cosmos.client.polyibc.MsgChannelOpenInitEncodeObject = {
      typeUrl: '/ibc.core.channel.v1.MsgChannelOpenInit',
      value: {
        // TODO: this seems to be the only thing the ibc relayer knows about
        portId: this.portid,
        signer: this.account.Address,

        channel: {
          state: self.cosmos.client.polyibc.channel.State.STATE_INIT,
          // TODO it won't let me use ordered channels
          ordering: self.cosmos.client.polyibc.channel.Order.ORDER_UNORDERED,
          connectionHops: this.connectionHops,
          counterparty: self.cosmos.client.polyibc.channel.Counterparty.fromPartial({
            portId: counter.portid
          }),
          version: this.version
        }
      }
    }
    await this.waitForBlocks(2)
    const res = await this.signer.signAndBroadcast(this.account.Address, [msg], 'auto')
    const openinit = self.cosmos.client.polyibc.MsgOpenIBCChannelResponseSchema.parse(flat('channel_open_init', res))
    this.channelId = openinit.channel_id
    log.info(`ChanOpenInit on ${this.name}: done`)
  }

  async channOpenTry(counter: Client) {
    log.info(`executing ChanOpenTry on ${this.name}`)
    this.connectionHops = [...counter.connectionHops].reverse()
    const msg: self.cosmos.client.polyibc.MsgChannelOpenTryEncodeObject = {
      typeUrl: '/ibc.core.channel.v1.MsgChannelOpenTry',
      value: {
        portId: this.portid,
        previousChannelId: '',
        signer: this.account.Address,
        channel: {
          state: self.cosmos.client.polyibc.channel.State.STATE_TRYOPEN,
          ordering: self.cosmos.client.polyibc.channel.Order.ORDER_UNORDERED,
          connectionHops: this.connectionHops,
          counterparty: self.cosmos.client.polyibc.channel.Counterparty.fromPartial({
            channelId: counter.channelId,
            portId: counter.portid
          }),
          version: this.version
        },
        counterpartyVersion: counter.version,
        proofInit: new Uint8Array(Array(8).fill(0)),
        proofHeight: {
          revisionHeight: Long.fromNumber(100),
          revisionNumber: Long.fromNumber(0)
        }
      }
    }
    await this.waitForBlocks(2)
    const res = await this.signer.signAndBroadcast(this.account.Address, [msg], 'auto')
    const opentry = self.cosmos.client.polyibc.MsgOpenIBCChannelResponseSchema.parse(flat('channel_open_try', res))
    this.channelId = opentry.channel_id
    log.info(`ChanOpenTry on ${this.name}: done`)
  }

  async channOpenAck(counter: Client) {
    log.info(`executing ChanOpenAck on ${this.name}`)
    const msg: self.cosmos.client.polyibc.MsgChannelOpenAckEncodeObject = {
      typeUrl: '/ibc.core.channel.v1.MsgChannelOpenAck',
      value: {
        portId: this.portid,
        counterpartyVersion: counter.version,
        counterpartyChannelId: counter.channelId,
        channelId: this.channelId,
        signer: this.account.Address,
        proofTry: new Uint8Array(Array(8).fill(0)),
        proofHeight: {
          revisionHeight: Long.fromNumber(100),
          revisionNumber: Long.fromNumber(0)
        }
      }
    }
    await this.waitForBlocks(2)
    const res = await this.signer.signAndBroadcast(this.account.Address, [msg], 'auto')
    self.cosmos.client.polyibc.MsgConnectIBCChannelResponseSchema.parse(flat('channel_open_ack', res))
    log.info(`ChanOpenAck on ${this.name}: done`)
  }

  async channOpenConfirm() {
    log.info(`executing ChanOpenConfirm on ${this.name}`)

    const msg: self.cosmos.client.polyibc.MsgChannelOpenConfirmEncodeObject = {
      typeUrl: '/ibc.core.channel.v1.MsgChannelOpenConfirm',
      value: {
        portId: this.portid,
        signer: this.account.Address,
        channelId: this.channelId,
        proofAck: new Uint8Array(Array(8).fill(0)),
        proofHeight: {
          revisionHeight: Long.fromNumber(100),
          revisionNumber: Long.fromNumber(0)
        }
      }
    }
    await this.waitForBlocks(2)
    const res = await this.signer.signAndBroadcast(this.account.Address, [msg], 'auto')
    self.cosmos.client.polyibc.MsgConnectIBCChannelResponseSchema.parse(flat('channel_open_confirm', res))
    log.info(`ChanOpenConfirm on ${this.name}: done`)
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

  const portEth2 = `polyibc.Ethereum-Devnet.${src.address.toLowerCase().slice(2)}`
  const srcClient = await Client.create(srcAccount, src.chain, src.version, portEth2)

  const wasmPortId = 'wasm.' + dst.address
  const dstClient = await Client.create(dstAccount, dst.chain, dst.version, wasmPortId)

  const lc = await queryLightClient(src.chain.Nodes[0].RpcHost, '/polyibc.lightclients.altair.ClientState')
  log.info(`Found light client: ${lc}`)

  const vConnection = await srcClient.createVirtualConnection(lc)
  log.info(`Created virtual connection: ${vConnection.connection_id}`)

  const ibcRelayerRuntime = runtime.Relayers.find((r) => r.Name.startsWith('ibc-relayer-'))

  if (!ibcRelayerRuntime) throw new Error('Could not find ibc-relayer runtime')
  const ibcconnections = ibcRelayerRuntime.Configuration.connections

  // ChanOpenInit: on WASM
  await dstClient.channOpenInit(srcClient, [ibcconnections.srcConnection, vConnection.connection_id])

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
  await srcClient.channOpenTry(dstClient)

  // ChanOpenAck: on WASM
  await dstClient.channOpenAck(srcClient)

  // ChanOpenConfirm: on Polymer
  await srcClient.channOpenConfirm()

  // TODO: let's get rid of this once the real channel handshake is in place
  await setupChannel(
    runtime,
    origSrc,
    src.address,
    dstClient.channelId,
    srcClient.channelId,
    dstClient.connectionHops,
    srcClient.portid
  )

  const vibcruntime = runtime.Relayers.find((r) => r.Name === 'vibc-relayer')
  if (vibcruntime) {
    const relayer = await VIBCRelayer.reuse(vibcruntime)
    // this is counter intuitive but the original source was replaced by polymer
    // so we want to setup the path between polymer and the original source.
    await relayer.update(src.chain.Name, origSrc, dstClient.channelId, srcClient.channelId)
    await relayer.start()
  }

  log.info(`channel id on ${dstClient.name}: ${dstClient.channelId}`)
  log.info(`channel id on ${srcClient.name}: ${srcClient.channelId}`)
}

// TODO: do all this so the contract stores the channel id in one of its internal mappings.
// Otherwise, the next call to sendPacket() will fail with a 'Channel not owned by sender' error
async function setupChannel(
  runtime: ChainSetsRunObj,
  chainName: string,
  receiverAddress: string,
  srcChannel: string,
  dstChannel: string,
  connectionHops: string[],
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
    connectionHops,
    0,
    counterpartPortId,
    ethers.utils.formatBytes32String(dstChannel),
    ethers.utils.formatBytes32String('1.0'),
    { proofHeight: 0, proof: ethers.utils.toUtf8Bytes('1') }
  )
  await connect.wait()
}
