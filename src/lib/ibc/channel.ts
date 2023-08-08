import { ChainSet, ChainSetsRunObj, CosmosAccount, CosmosChainSet } from '../schemas'
import * as self from '../index'
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing'
import { SigningStargateClient } from '@cosmjs/stargate'
import Long from 'long'
import { Tendermint37Client } from '@cosmjs/tendermint-rpc'
import { EventsFilter, TxEvent } from '../query'
import { TextEncoder } from 'util'
import { flatCosmosEvent, getLogger, waitForBlocks } from '../utils'

const log = getLogger()

export type Endpoint = {
  chain: ChainSet
  portID: string
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

export class IbcChannelHandshaker {
  chain: CosmosChainSet
  account: CosmosAccount
  client: Tendermint37Client
  signer: SigningStargateClient
  version: string
  portid: string
  connectionHops: string[]
  channelId: string
  minHeight: number

  private constructor(
    chain: CosmosChainSet,
    version: string,
    portid: string,
    minHeight: number,
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
    this.minHeight = minHeight
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
    const minHeight = (await queryClient.block()).block.header.height
    return new IbcChannelHandshaker(chain, version, portid, minHeight, account, queryClient, signerClient)
  }

  async waitForBlocks(blocks: number) {
    await waitForBlocks(this.client, blocks)
  }

  async waitForEvent(name: string) {
    const filter: any = { minHeight: this.minHeight }

    log.info(`waiting for event '${name}' on ${this.chain.Name}`)
    log.debug(`using filter: ${JSON.stringify(filter)}`)
    return await self.utils.waitUntil(
      async () => {
        let found: any
        await self.events(this.chain, filter as EventsFilter, (event: TxEvent) => {
          if (found) return
          found = event.events.find((e) => e[name])
          filter.minHeight = event.height
        })
        if (found) {
          log.info(`event '${name}' found at height ${filter.minHeight}`)
          return found[name]
        }
        return false
      },
      20,
      10_000,
      `could not find event '${name}' on chain '${this.chain.Name}'`
    )
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
    this.connectionHops = openinit.connection_id.split(/[/.]/)
  }

  async channOpenTry(counter: IbcChannelHandshaker, connectionHops: string[], eventName: string) {
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
    this.setChannOpenTry(flatCosmosEvent(eventName, res))
    log.info(`ChanOpenTry on ${this.chain.Name}: done`)
  }

  setChannOpenTry(event: any) {
    const opentry = self.cosmos.client.polyibc.MsgOpenIBCChannelResponseSchema.parse(event)
    this.channelId = opentry.channel_id
  }

  async channOpenAck(counter: IbcChannelHandshaker, eventName: string) {
    log.info(`executing ChanOpenAck on ${this.chain.Name}`)
    const msg: self.cosmos.client.polyibc.MsgChannelOpenAckEncodeObject = {
      typeUrl: '/ibc.core.channel.v1.MsgChannelOpenAck',
      value: {
        portId: this.portid,
        counterpartyVersion: this.version,
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
    self.cosmos.client.polyibc.MsgConnectIBCChannelResponseSchema.parse(flatCosmosEvent(eventName, res))
    log.info(`ChanOpenAck on ${this.chain.Name}: done`)
  }

  async channOpenConfirm(eventName: string) {
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
    self.cosmos.client.polyibc.MsgConnectIBCChannelResponseSchema.parse(flatCosmosEvent(eventName, res))
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

export type HandshakeConfig = {
  runtime: ChainSetsRunObj
  a: Endpoint
  b: Endpoint
  poly: CosmosChainSet
}

// Ibc (A) <=> Ibc (B)
export async function ibcToIbc(_config: HandshakeConfig) {
  // TODO: configure and start relayer
  throw new Error('Not implemented yet')
}
