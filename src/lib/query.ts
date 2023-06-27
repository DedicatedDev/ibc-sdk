import * as self from './index'
import { IbcExtension, logs, QueryClient, setupIbcExtension } from '@cosmjs/stargate'
import { ChainSet, CosmosChainSet, EvmChainSet, isCosmosChain, isEvmChain } from './schemas'
import { ethers } from 'ethers'
import { newJsonRpcProvider } from './ethers'
import { getLogger } from './utils'

const log = getLogger()

export enum PacketState {
  Sent = 'sent',
  Received = 'received',
  Acknowledged = 'acknowledged',
  Timeout = 'timeout'
}

export type Packet = {
  chainID: string
  channelID: string
  portID: string
  sequence: Long
  state: PacketState
}

export type EndpointInfo = {
  chainID: string
  channelID: string
  portID: string
}

async function getClient(rpc: string): Promise<QueryClient & IbcExtension> {
  const tmClient = await self.cosmos.client.newTendermintClient(rpc)
  return self.cosmos.client.QueryClient.withExtensions(tmClient, setupIbcExtension)
}

async function queryPacketsDirectional(
  clientA: QueryClient & IbcExtension,
  clientB: QueryClient & IbcExtension,
  chainA: EndpointInfo,
  chainB: EndpointInfo
): Promise<Packet[]> {
  const packetCommits = await clientA.ibc.channel.allPacketCommitments(chainA.portID, chainA.channelID)
  const packetAcks = await clientB.ibc.channel.allPacketAcknowledgements(chainB.portID, chainB.channelID)

  // NB: Packet data is from the perspective of the sending channel.
  const packets: Packet[] = []

  packetCommits.commitments.forEach((sent) => {
    packets.push({
      chainID: chainA.chainID,
      channelID: sent.channelId,
      portID: sent.portId,
      sequence: sent.sequence,
      state: PacketState.Sent
    })
  })

  packetAcks.acknowledgements.forEach((ack) => {
    for (let i = 0; i < packets.length; i++) {
      if (packets[i].sequence === ack.sequence) {
        packets[i].state = PacketState.Acknowledged
        return
      }
    }
    // Acks are committed on the receiving chain using chainB port/channel
    // but we're writing the data from the perspective of the sender to be consistent.
    // TODO: Is this the right UX for visualizing packets?
    packets.push({
      chainID: chainA.chainID,
      channelID: chainA.channelID,
      portID: chainA.portID,
      sequence: ack.sequence, // The sequence should be the same.
      state: PacketState.Received
    })
  })

  return packets
}

export async function tracePackets(
  hostA: string,
  hostB: string,
  chainA: EndpointInfo,
  chainB: EndpointInfo
): Promise<Packet[]> {
  const clientA = await getClient(hostA)
  const clientB = await getClient(hostB)

  log.info(`endpoint A: chainID: ${chainA.chainID}, portID: ${chainA.portID}, channelID: ${chainA.channelID}`)
  log.info(`endpoint B: chainID: ${chainB.chainID}, portID: ${chainB.portID}, channelID: ${chainB.channelID}`)

  let packets: Packet[] = await queryPacketsDirectional(clientA, clientB, chainA, chainB)
  packets = packets.concat(await queryPacketsDirectional(clientB, clientA, chainB, chainA))
  // TODO: This won't work for larger numbers.
  packets.sort((a, b) => a.sequence.compare(b.sequence))

  log.info(`Traced ${packets.length} packets`)

  return packets
}

export type EventsFilter = {
  height: number
  minHeight: number
  maxHeight: number
}

export type TxEvent = {
  height: number
  events: { [k: string]: {} }
}

type TxEventCb = (e: TxEvent) => void

async function cosmosEvents(chain: CosmosChainSet, opts: EventsFilter, cb: TxEventCb) {
  const tmClient = await self.cosmos.client.newTendermintClient(chain.Nodes[0].RpcHost)
  const query: string[] = []

  if (opts.height) {
    query.push(`tx.height=${opts.height}`)
  } else {
    if (opts.minHeight) query.push(`tx.height>=${opts.minHeight}`)
    if (opts.maxHeight) query.push(`tx.height<=${opts.maxHeight}`)
  }

  const result = await tmClient.txSearchAll({ query: query.join(' AND ') })

  result.txs.map(({ height, result }) => {
    const rawLogs = (() => {
      try {
        return logs.parseRawLog(result.log)
      } catch {
        log.warn(`could not parse logs at height ${height}: ${result.log}`)
        return []
      }
    })()
    if (rawLogs.length === 0) return
    const kv = {}
    for (const log of rawLogs) {
      for (const ev of log.events) {
        kv[ev.type] = {}
        ev.attributes.forEach((e: any) => (kv[ev.type][e.key] = e.value))
      }
    }
    cb({ height, events: kv })
  })
}

function doParseOne(param: ethers.utils.ParamType, value: any) {
  if (ethers.BigNumber.isBigNumber(value)) return ethers.BigNumber.from(value).toString()
  if (param.type === 'bytes32') return ethers.utils.parseBytes32String(value)
  if (param.type === 'bytes') return ethers.utils.toUtf8String(value)
  if (param.type === 'tuple') return doParse({}, param.components, value, 0)
  return value
}

function doParse(kv: any, params: ethers.utils.ParamType[], args: ethers.utils.Result, index: number) {
  for (const param of params) {
    const value = args[index++]
    kv[param.name] = param.type.endsWith('[]') ? value.map((v: any) => doParseOne(param, v)) : doParseOne(param, value)
  }
  return kv
}

function parse(event: ethers.utils.LogDescription) {
  return doParse({}, event.eventFragment.inputs, event.args, 0)
}

async function evmEvents(chain: EvmChainSet, opts: EventsFilter, cb: TxEventCb) {
  const provider = newJsonRpcProvider(chain.Nodes[0].RpcHost)
  const dispatcher = chain.Contracts.find((c) => c.Name === 'Dispatcher')
  if (!dispatcher) throw new Error('dispatcher contract not found')

  const contract = new ethers.Contract(dispatcher.Address, dispatcher.Abi!, provider)
  const iface = new ethers.utils.Interface(dispatcher.Abi!)

  const filter = { fromBlock: opts.minHeight, toBlock: opts.maxHeight }
  if (opts.height) filter.fromBlock = filter.toBlock = opts.height

  const logs = await contract.provider.getLogs(filter)
  if (logs.length === 0) return

  let event: TxEvent = { height: logs[0].blockNumber, events: {} }
  for (const l of logs) {
    const parsed = iface.parseLog(l)
    if (l.blockNumber === event.height) {
      event.events[parsed.name] = parse(parsed)
      continue
    }

    cb(event)
    event = { height: l.blockNumber, events: {} }
    event.events[parsed.name] = parse(parsed)
  }
  cb(event)
}

export async function events(chain: ChainSet, opts: EventsFilter, cb: TxEventCb) {
  if (isEvmChain(chain.Type)) return await evmEvents(chain as EvmChainSet, opts, cb)
  if (isCosmosChain(chain.Type)) return await cosmosEvents(chain as CosmosChainSet, opts, cb)
  throw new Error(`Unknown type of chain ${chain.Type}`)
}
