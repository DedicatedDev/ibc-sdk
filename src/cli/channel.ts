import { ChainSetsRunObj, CosmosAccount, CosmosChainSet, EvmChainSet, isIbcChain, isVIbcChain } from '../lib/schemas'
import * as self from '../lib/index'
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing'
import { SigningStargateClient } from '@cosmjs/stargate'
import Long from 'long'
import { Tendermint37Client } from '@cosmjs/tendermint-rpc'
import { VIBCRelayer } from '../lib/relayers/vibc'
import { EventsFilter, TxEvent } from '../lib/query'
import { TextEncoder } from 'util'
import { getLogger, flatCosmosEvent, waitForBlocks } from 'src/lib/utils'

const log = getLogger()

type Endpoint = {
  chain: CosmosChainSet | EvmChainSet
  address: string
  version: string
}

function proof(): any {
  return {
    proof: new TextEncoder().encode('hash:abc'),
    key: new Uint8Array(Array(8).fill(0)),
    value: new TextEncoder().encode(
      JSON.stringify({ raw: Buffer.from('abc').toString('base64'), type: 2, height: 0, revision: 0 })
    ),
    height: { revisionNumber: '0', revisionHeight: '0' }
  }
}

class VIbcChannelHandshaker {
  polymer: IbcChannelHandshaker
  relayer: VIBCRelayer
  chain: EvmChainSet
  address: string
  pathname: string

  private constructor(chain: EvmChainSet, relayer: VIBCRelayer, address: string, polymer: IbcChannelHandshaker) {
    this.polymer = polymer
    this.relayer = relayer
    this.chain = chain
    this.address = address
    this.pathname = `${polymer.chain.Name}-${chain.Name}`
  }

  static async create(chain: EvmChainSet, runtime: ChainSetsRunObj, address: string, polymer: IbcChannelHandshaker) {
    const vibcruntime = runtime.Relayers.find((r) => r.Name === 'vibc-relayer')
    if (!vibcruntime) throw new Error('could not find vibc-relayer runtime')
    const relayer = await VIBCRelayer.reuse(vibcruntime)
    return new VIbcChannelHandshaker(chain, relayer, address, polymer)
  }

  // TODO add interface so counter can be ibc or vibc
  async openIbcChannel(counter: IbcChannelHandshaker, connectionHops: string[], version: string, order: string) {
    log.info(`executing OpenIbcChannel on ${this.chain.Name}`)
    await this.relayer.channel(
      this.pathname,
      this.address,
      version,
      order,
      connectionHops,
      counter.version,
      counter.portid,
      counter.channelId
    )

    this.polymer.setChannOpenInit(await this.polymer.waitForEvent('channel_open_init'))
    log.info(`OpenIbcChannel on ${this.chain.Name}: done`)
  }

  async startRelaying(connectionHops: string[]) {
    await this.relayer.update(this.pathname, connectionHops.join('/'))
    await this.relayer.start()
  }
}

class IbcChannelHandshaker {
  chain: CosmosChainSet
  account: CosmosAccount
  client: Tendermint37Client
  signer: SigningStargateClient
  version: string
  portid: string
  connectionHops: string[]
  channelId: string

  private constructor(
    chain: CosmosChainSet,
    version: string,
    portid: string,
    account: CosmosAccount,
    client: Tendermint37Client,
    signer: SigningStargateClient
  ) {
    this.chain = chain
    this.version = version
    this.account = account
    this.client = client
    this.signer = signer
    this.portid = portid
    this.channelId = ''
    this.connectionHops = []
  }

  static async create(chain: CosmosChainSet, version: string, portid: string) {
    const account = chain.Accounts.find((a) => a.Name === 'relayer')
    if (!account) throw new Error(`Could not find relayer account in '${chain.Name}' chain`)

    const queryClient = await self.cosmos.client.newTendermintClient(chain.Nodes[0].RpcHost)
    const offlineSigner = await DirectSecp256k1HdWallet.fromMnemonic(account.Mnemonic!, { prefix: chain.Prefix })
    const signerClient = await self.cosmos.client.SigningStargateClient.createWithSigner(
      queryClient,
      offlineSigner,
      self.cosmos.client.signerOpts()
    )
    return new IbcChannelHandshaker(chain, version, portid, account, queryClient, signerClient)
  }

  async waitForBlocks(blocks: number) {
    await waitForBlocks(this.client, blocks)
  }

  async waitForEvent(name: string) {
    const filter: any = { minHeight: 1 }

    log.info(`waiting for event '${name}' on ${this.chain.Name}`)
    let event: any
    await self.utils.waitUntil(
      async () => {
        await self.events(this.chain, filter as EventsFilter, (e: TxEvent) => {
          if (!event && e.events[name]) event = e.events[name]
          filter.minHeight = e.height
        })
        return event !== undefined
      },
      20,
      10_000,
      `could not find event '${name}' on chain '${this.chain.Name}'`
    )
    log.info(`waiting for event '${name}' on ${this.chain.Name} done`)
    return event
  }

  async registerPort(clientID: string, remoteSenderAddress: string) {
    log.info(`executing RegisterPort on ${this.chain.Name}`)
    const msg: self.cosmos.client.polyibc.MsgRegisterPortEncodeObject = {
      typeUrl: '/polyibc.core.MsgRegisterPort',
      value: {
        remoteSenderAddress: Buffer.from(remoteSenderAddress.slice(2), 'hex'),
        creator: this.account.Address,
        clientID: clientID
      }
    }
    await this.waitForBlocks(2)
    const res = await this.signer.signAndBroadcast(this.account.Address, [msg], 'auto')
    log.debug('register_port', res)
    log.info(`RegisterPort on ${this.chain.Name}: done`)
  }

  async channOpenInit(counter: IbcChannelHandshaker, connectionHops: string[]) {
    log.info(`executing ChanOpenInit on ${this.chain.Name}`)
    const msg: self.cosmos.client.polyibc.MsgChannelOpenInitEncodeObject = {
      typeUrl: '/ibc.core.channel.v1.MsgChannelOpenInit',
      value: {
        portId: this.portid,
        signer: this.account.Address,

        channel: {
          state: self.cosmos.client.polyibc.channel.State.STATE_INIT,
          ordering: self.cosmos.client.polyibc.channel.Order.ORDER_UNORDERED,
          connectionHops: connectionHops,
          counterparty: self.cosmos.client.polyibc.channel.Counterparty.fromPartial({
            portId: counter.portid
          }),
          version: this.version
        }
      }
    }
    await this.waitForBlocks(2)
    log.debug(`sending ChanOpenInit message to ${this.chain.Name}: ${JSON.stringify(msg, null, 2)}`)
    const res = await this.signer.signAndBroadcast(this.account.Address, [msg], 'auto')
    this.setChannOpenInit(flatCosmosEvent('channel_open_init', res))
    log.info(`ChanOpenInit on ${this.chain.Name}: done`)
  }

  setChannOpenInit(event: any) {
    const openinit = self.cosmos.client.polyibc.MsgOpenIBCChannelResponseSchema.parse(event)
    log.debug(`openinit: ${JSON.stringify(openinit, null, 2)}`)
    this.channelId = openinit.channel_id
    this.connectionHops = openinit.connection_id.split(/[/\.]/)
  }

  async channOpenTry(counter: IbcChannelHandshaker, connectionHops: string[]) {
    log.info(`executing ChanOpenTry on ${this.chain.Name}`)

    const msg: self.cosmos.client.polyibc.MsgChannelOpenTryEncodeObject = {
      typeUrl: '/ibc.core.channel.v1.MsgChannelOpenTry',
      value: {
        portId: this.portid,
        previousChannelId: '', // this is DEPRECATED
        signer: this.account.Address,
        channel: {
          state: self.cosmos.client.polyibc.channel.State.STATE_TRYOPEN,
          ordering: self.cosmos.client.polyibc.channel.Order.ORDER_UNORDERED,
          connectionHops: connectionHops,
          counterparty: self.cosmos.client.polyibc.channel.Counterparty.fromPartial({
            channelId: counter.channelId,
            portId: counter.portid
          }),
          version: '' // this is DEPRECATED
        },
        // this SHOULD be the counter party version since the other version is deprecated
        // the cw wasm uses this? all very confusing.
        counterpartyVersion: this.version,
        proofInit: new Uint8Array(Array(8).fill(0)),
        proofHeight: {
          revisionHeight: Long.fromNumber(100),
          revisionNumber: Long.fromNumber(0)
        }
      }
    }
    log.debug(`sending ChanOpenTry message to ${this.chain.Name}: ${JSON.stringify(msg, null, 2)}`)
    await this.waitForBlocks(2)
    const res = await this.signer.signAndBroadcast(this.account.Address, [msg], 'auto')
    this.setChannOpenTry(flatCosmosEvent('channel_open_try', res))
    log.info(`ChanOpenTry on ${this.chain.Name}: done`)
  }

  setChannOpenTry(event: any) {
    const opentry = self.cosmos.client.polyibc.MsgOpenIBCChannelResponseSchema.parse(event)
    this.channelId = opentry.channel_id
  }

  async channOpenAck(counter: IbcChannelHandshaker) {
    log.info(`executing ChanOpenAck on ${this.chain.Name}`)
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
    log.debug(`sending ChanOpenAck message to ${this.chain.Name}: ${JSON.stringify(msg, null, 2)}`)
    await this.waitForBlocks(2)
    const res = await this.signer.signAndBroadcast(this.account.Address, [msg], 'auto')
    self.cosmos.client.polyibc.MsgConnectIBCChannelResponseSchema.parse(
      flatCosmosEvent('channel_open_ack_pending', res)
    )
    log.info(`ChanOpenAck on ${this.chain.Name}: done`)
  }

  async channOpenConfirm() {
    log.info(`executing ChanOpenConfirm on ${this.chain.Name}`)
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
    log.debug(`sending ChanOpenConfirm message to ${this.chain.Name}: ${JSON.stringify(msg, null, 2)}`)
    await this.waitForBlocks(2)
    const res = await this.signer.signAndBroadcast(this.account.Address, [msg], 'auto')
    self.cosmos.client.polyibc.MsgConnectIBCChannelResponseSchema.parse(flatCosmosEvent('channel_open_confirm', res))
    log.info(`ChanOpenConfirm on ${this.chain.Name}: done`)
  }

  async connectIbcChannel(clientID: string, counter: IbcChannelHandshaker) {
    log.info(`executing ConnectIBCChannel on ${this.chain.Name}`)

    const msg: self.cosmos.client.polyibc.MsgConnectIBCChannelEncodeObject = {
      typeUrl: '/polyibc.core.MsgConnectIBCChannel',
      value: {
        portId: this.portid,
        counterpartyVersion: counter.version,
        counterpartyChannelId: counter.channelId,
        nativeClientId: clientID,
        virtualProof: proof(),
        channelId: this.channelId,
        creator: this.account.Address
      }
    }
    log.debug(`sending ConnectIBCChannel message to ${this.chain.Name}: ${JSON.stringify(msg, null, 2)}`)
    await this.waitForBlocks(2)
    const res = await this.signer.signAndBroadcast(this.account.Address, [msg], 'auto')
    self.cosmos.client.polyibc.MsgConnectIBCChannelResponseSchema.parse(flatCosmosEvent('channel_open_ack', res))
    log.info(`ConnectIBCChannel on ${this.chain.Name}: done`)
  }
}

type HandshakeConfig = {
  runtime: ChainSetsRunObj
  a: Endpoint
  b: Endpoint
  poly: CosmosChainSet
}

// vIBC (A) <=> IBC (B)
async function vIBC2IBC(config: HandshakeConfig, connectionHops: string[]) {
  // TODO this needs to come from the user or we need to get more clever about it.
  // leaving like this for now but this is far from being ok
  const portidA = `polyibc.Ethereum-Devnet.${config.a.address.slice(2)}`
  const polymer = await IbcChannelHandshaker.create(config.poly as CosmosChainSet, config.a.version, portidA)

  const portidB = 'wasm.' + config.b.address
  const ibcB = await IbcChannelHandshaker.create(config.b.chain as CosmosChainSet, config.b.version, portidB)

  const vibcA = await VIbcChannelHandshaker.create(
    config.a.chain as EvmChainSet,
    config.runtime,
    config.a.address,
    polymer
  )

  // step 1
  await vibcA.openIbcChannel(ibcB, connectionHops, config.a.version, 'unordered')
  await vibcA.startRelaying(connectionHops)

  // step 2
  await ibcB.channOpenTry(polymer, [...connectionHops].reverse())

  // step 3
  await ibcB.waitForEvent('channel_open_try')
  await polymer.channOpenAck(ibcB)

  // step 4
  await polymer.waitForEvent('channel_open_ack')
  await ibcB.channOpenConfirm()
  await ibcB.waitForEvent('channel_open_confirm')
}

// vIBC (A) <=> vIBC (B)
async function vIBC2vIBC(_config: HandshakeConfig) {
  throw new Error('Not implemented yet')
}

// IBC (A) <=> vIBC (B)
async function IBC2vIBC(_config: HandshakeConfig) {
  throw new Error('Not implemented yet')
}

// IBC (A) <=> IBC (B)
async function IBC2IBC(_config: HandshakeConfig) {
  throw new Error('Not implemented yet')
}

export async function channelHandshake(runtime: ChainSetsRunObj, endpointA: Endpoint, endpointB: Endpoint) {
  const poly = runtime.ChainSets.find((c) => c.Type === 'polymer') as CosmosChainSet
  if (!poly) throw new Error('could not find polymer chain is chain sets')

  const ibcRelayer = runtime.Relayers.find((r) => r.Name.startsWith('ibc-relayer-'))
  if (!ibcRelayer) throw new Error('could not find ibc-relayer runtime')

  const ethRelayer = runtime.Relayers.find((r) => r.Name === 'eth-relayer')
  if (!ethRelayer) throw new Error('could not find eth-relayer runtime')

  const vIbcConn = ethRelayer.Configuration.virtualConnectionId
  if (!vIbcConn) throw new Error('could not find virtual connection')

  const ibcConn = ibcRelayer.Configuration.connections.srcConnection
  if (!ibcConn) throw new Error('could not find ibc connection')

  const config: HandshakeConfig = { runtime, a: endpointA, b: endpointB, poly }

  // vIBC (A) <=> vIBC (B)
  if (isVIbcChain(endpointA.chain.Type) && isVIbcChain(endpointB.chain.Type)) {
    return vIBC2vIBC(config)
  }

  // vIBC (A) <=> IBC (B)
  if (isVIbcChain(endpointA.chain.Type) && isIbcChain(endpointB.chain.Type)) {
    return vIBC2IBC(config, [vIbcConn, ibcConn])
  }

  // IBC (A) <=> vIBC (B)
  if (isIbcChain(endpointA.chain.Type) && isVIbcChain(endpointB.chain.Type)) {
    return IBC2vIBC(config)
  }

  // IBC (A) <=> IBC (B)
  if (isIbcChain(endpointA.chain.Type) && isIbcChain(endpointB.chain.Type)) {
    return IBC2IBC(config)
  }
}
