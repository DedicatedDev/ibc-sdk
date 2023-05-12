import winston from 'winston'
import { ChainSetsRunObj, CosmosAccount } from '../lib/dev/schemas'
import * as self from '../lib/index.js'
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing'
import { toHex } from '@cosmjs/encoding'
import { DeliverTxResponse, SigningStargateClient } from '@cosmjs/stargate'
import { TextEncoder } from 'util'
import Long from 'long'
import { Tendermint37Client } from '@cosmjs/tendermint-rpc'

async function createSignerClient(
  sender: CosmosAccount,
  prefix: string,
  chainRpc: string
): Promise<[Tendermint37Client, SigningStargateClient]> {
  const offlineSigner = await DirectSecp256k1HdWallet.fromMnemonic(sender.Mnemonic!, { prefix: prefix })

  const queryClient = await self.cosmos.client.newTendermintClient(chainRpc)
  const signerClient = await self.cosmos.client.SigningStargateClient.createWithSigner(
    queryClient,
    offlineSigner,
    self.cosmos.client.signerOpts()
  )
  return [queryClient, signerClient]
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

function flat(name: string, res: DeliverTxResponse) {
  if (res.code !== 0) throw new Error(`Response contains an error: ${res}`)
  const rawLog = JSON.parse(res?.rawLog ?? '')
  const event = rawLog[0].events.find((e: any) => e.type === name)
  const kv = {}
  event.attributes.forEach((e: any) => (kv[e.key] = e.value))
  return kv
}

async function waitOneBlock(client: Tendermint37Client) {
  const end = (await client.block()).block.header.height + 1
  do {
    await self.utils.sleep(1000)
  } while ((await client.block()).block.header.height < end)
}

export async function channelHandshake(
  runtime: ChainSetsRunObj,
  src: self.dev.schemas.CosmosChainSet,
  srcAddress: string,
  dst: self.dev.schemas.CosmosChainSet,
  dstAddress: string,
  log: winston.Logger
) {
  self.utils.ignoreUnused(srcAddress)

  log.info(`Creating channel between '${src.Name}' and '${dst.Name}'`)

  const srcAccount = src.Accounts.find((a) => a.Name === 'relayer')
  if (!srcAccount) throw new Error(`Could not find relayer account in '${src.Name}' chain`)

  const dstAccount = dst.Accounts.find((a) => a.Name === 'relayer')
  if (!dstAccount) throw new Error(`Could not find relayer account in '${dst.Name}' chain`)

  const [srcQuery, srcClient] = await createSignerClient(srcAccount, src.Prefix, src.Nodes[0].RpcHost)
  const [dstQuery, dstClient] = await createSignerClient(dstAccount, dst.Prefix, dst.Nodes[0].RpcHost)

  let lc = ''
  {
    const queryClient = self.cosmos.client.QueryClient.withExtensions(
      await self.cosmos.client.newTendermintClient(src.Nodes[0].RpcHost),
      self.cosmos.client.setupPolyIbcExtension
    )

    const clients = await queryClient.polyibc.ClientStates(
      self.cosmos.client.polyibc.query.QueryClientStatesRequest.fromPartial({})
    )

    for (const state of clients.clientStates) {
      if (state.clientState?.typeUrl !== '/polyibc.lightclients.altair.ClientState') continue
      lc = state.clientId
      break
    }
  }

  if (lc.length === 0) throw new Error('Could not find ETH2 light client')

  log.info(`Found ETH2 light client: ${lc}`)

  log.info('Creating virtual light client')
  let vLC: any = undefined
  {
    const msg: self.cosmos.client.polyibc.MsgCreateVibcClientEncodeObject = {
      typeUrl: '/polyibc.core.MsgCreateVibcClient',
      value: {
        creator: srcAccount.Address,
        nativeClientID: lc,
        params: Buffer.from(JSON.stringify({ finalized_only: false, delay_period: 2 }))
      }
    }
    await waitOneBlock(srcQuery)
    const res = await srcClient.signAndBroadcast(srcAccount.Address, [msg], 'auto')
    vLC = self.cosmos.client.polyibc.MsgCreateVibcClientResponseSchema.parse(flat('create_vibc_client', res))
  }

  let vConnection: any = undefined
  {
    const msg: self.cosmos.client.polyibc.MsgCreateVibcConnectionEncodeObject = {
      typeUrl: '/polyibc.core.MsgCreateVibcConnection',
      value: {
        creator: srcAccount.Address,
        vibcClientID: vLC.client_id,
        delayPeriod: '0'
      }
    }
    await waitOneBlock(srcQuery)
    const res = await srcClient.signAndBroadcast(srcAccount.Address, [msg], 'auto')
    vConnection = self.cosmos.client.polyibc.MsgCreateVibcConnectionResponseSchema.parse(
      flat('create_vibc_connection', res)
    )
  }

  const enc = new TextEncoder()
  const portEth2 = `polyibc.Ethereum-Devnet.${toHex(enc.encode(srcAccount.Address))}`

  const ibcRelayerRuntime = runtime.Relayers.find((r) => r.Name.startsWith('ibc-relayer-'))

  if (!ibcRelayerRuntime) throw new Error('Could not find ibc-relayer runtime')
  const ibcconnections = ibcRelayerRuntime.Configuration.connections

  const wasmPortId = 'wasm.' + dstAddress

  // ChanOpenInit: on WASM
  let openinit: self.cosmos.client.polyibc.MsgOpenIBCChannelResponse
  {
    log.info(`executing ChanOpenInit on ${dst.Name}`)
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
          version: 'polymer-demo-v1'
        }
      }
    }
    await waitOneBlock(dstQuery)
    const res = await dstClient.signAndBroadcast(dstAccount.Address, [msg], 'auto')
    openinit = self.cosmos.client.polyibc.MsgOpenIBCChannelResponseSchema.parse(flat('channel_open_init', res))
  }
  log.info(`ChanOpenInit on ${dst.Name}: done`)

  // ChanOpenTry: on Polymer
  let opentry: self.cosmos.client.polyibc.MsgOpenIBCChannelResponse
  {
    log.info(`executing ChanOpenTry on ${src.Name}`)
    const msg: self.cosmos.client.polyibc.MsgOpenIBCChannelEncodeObject = {
      typeUrl: '/polyibc.core.MsgOpenIBCChannel',
      value: {
        nativeClientId: lc,
        creator: srcAccount.Address,
        portId: portEth2,
        channel: self.cosmos.client.polyibc.channel.Channel.fromPartial({
          version: 'polymer-demo-v1',
          ordering: self.cosmos.client.polyibc.channel.Order.ORDER_UNORDERED,
          connectionHops: [vConnection.connection_id, ibcconnections.srcConnection],
          counterparty: self.cosmos.client.polyibc.channel.Counterparty.fromPartial({
            channelId: openinit.channel_id,
            portId: openinit.port_id
          }),
          state: self.cosmos.client.polyibc.channel.State.STATE_TRYOPEN
        }),

        counterpartyVersion: 'polymer-demo-v1',
        proofInit: new Uint8Array(Array(8).fill(0)),
        proofInitHeight: self.cosmos.client.polyibc.client.Height.fromPartial({
          revisionHeight: '100',
          revisionNumber: '0'
        }),
        virtualProof: proof()
      }
    }
    await waitOneBlock(srcQuery)
    const res = await srcClient.signAndBroadcast(srcAccount.Address, [msg], 'auto')
    opentry = self.cosmos.client.polyibc.MsgOpenIBCChannelResponseSchema.parse(flat('channel_open_try', res))
  }
  log.info(`ChanOpenTry on ${src.Name}: done`)

  // ChanOpenAck: on WASM
  let openack: self.cosmos.client.polyibc.MsgConnectIBCChannelResponse
  {
    log.info(`executing ChanOpenAck on ${dst.Name}`)
    const msg: self.cosmos.client.polyibc.MsgChannelOpenAckEncodeObject = {
      typeUrl: '/ibc.core.channel.v1.MsgChannelOpenAck',
      value: {
        // TODO: this seems to be the only thing the ibc relayer knows about
        portId: wasmPortId,
        counterpartyVersion: 'polymer-demo-v1',
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
    await waitOneBlock(dstQuery)
    const res = await dstClient.signAndBroadcast(dstAccount.Address, [msg], 'auto')
    openack = self.cosmos.client.polyibc.MsgConnectIBCChannelResponseSchema.parse(flat('channel_open_ack', res))
  }
  log.info(`ChanOpenAck on ${dst.Name}: done`)

  // ChanOpenConfirm: on Polymer
  let openconfirm: self.cosmos.client.polyibc.MsgConnectIBCChannelResponse
  {
    log.info(`executing ChanOpenConfirm on ${src.Name}`)
    const msg: self.cosmos.client.polyibc.MsgConnectIBCChannelEncodeObject = {
      typeUrl: '/polyibc.core.MsgConnectIBCChannel',
      value: {
        portId: portEth2,
        creator: srcAccount.Address,
        channelId: opentry.channel_id,
        // leave these two commented out to force the ChanOpenConfirm
        counterpartyChannelId: '',
        counterpartyVersion: '',
        proof: new Uint8Array(Array(8).fill(0)),
        proofHeight: self.cosmos.client.polyibc.client.Height.fromPartial({
          revisionHeight: '100',
          revisionNumber: '0'
        }),
        nativeClientId: lc,
        virtualProof: proof()
      }
    }
    await waitOneBlock(srcQuery)
    const res = await srcClient.signAndBroadcast(srcAccount.Address, [msg], 'auto')
    openconfirm = self.cosmos.client.polyibc.MsgConnectIBCChannelResponseSchema.parse(flat('channel_open_confirm', res))
  }
  log.info(`ChanOpenConfirm on ${src.Name}: done`)
  log.info(`channel id on ${src.Name}: ${openack.channel_id}`)
  log.info(`channel id on ${dst.Name}: ${openconfirm.channel_id}`)
}
