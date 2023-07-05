import * as self from './index'
import { IbcExtension, logs, QueryClient, setupIbcExtension } from '@cosmjs/stargate'
import { ChainSet, CosmosChainSet, EvmChainSet, isCosmosChain, isEvmChain, isIbcChain } from './schemas'
import { ethers } from 'ethers'
import { newJsonRpcProvider } from './ethers'
import { getLogger } from './utils'
import * as channel from 'cosmjs-types/ibc/core/channel/v1/channel'
import Long from 'long'

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

function extractPackets(
  packetCommits: channel.PacketState[],
  packetReceipts: channel.PacketState[],
  packetAcks: channel.PacketState[],
  chainA: EndpointInfo,
  chainB: EndpointInfo
) {
  const packets: Packet[] = []

  log.info(`Packet commits: ${packetCommits.length}`)
  log.info(`Packet acks: ${packetAcks.length}`)

  packetCommits.forEach((sent) => {
    log.info(`Packet commit: ${JSON.stringify(sent)}`)
    packets.push({
      chainID: chainA.chainID,
      channelID: sent.channelId,
      portID: sent.portId,
      sequence: sent.sequence,
      state: PacketState.Sent
    })
  })

  packetAcks.forEach((ack) => {
    log.info(`Packet ack: ${JSON.stringify(ack)}`)
    for (let i = 0; i < packets.length; i++) {
      if (packets[i].sequence.equals(ack.sequence) && packets[i].state === PacketState.Sent && packets[i].portID === ack.portId) {
        packets[i].state = PacketState.Acknowledged
        return
      }
    }
    packets.push({
      chainID: chainA.chainID,
      channelID: ack.channelId,
      portID: ack.portId,
      sequence: ack.sequence,
      state: PacketState.Acknowledged
    })
  })

  packetReceipts.forEach((receipt) => {
    log.info(`Packet receipt: ${JSON.stringify(receipt)}`)
    packets.push({
      chainID: chainB.chainID,
      channelID: receipt.channelId,
      portID: receipt.portId,
      sequence: receipt.sequence,
      state: PacketState.Received
    })
  })

  return packets
}

export type TxEvent = {
  height: number
  events: { [k: string]: {} }
}

async function queryVibc2IbcPacketsDirectional(
  chainSetA: ChainSet,
  clientB: QueryClient & IbcExtension,
  chainA: EndpointInfo,
  chainB: EndpointInfo
) {
  log.info("Querying packets from Vibc to IBC")
  const packetCommits: channel.PacketState[] = []
  const packetAcks: channel.PacketState[] = []

  await evmEvents(
    chainSetA as EvmChainSet,
    {
      height: null,
      minHeight: 0,
      maxHeight: await getLatestBlockNumber(chainSetA.Nodes[0].RpcHost)
    },
    (event: TxEvent) => {
      const sendPacketEvent = event.events.SendPacket
      const ackPacketEvent = event.events.Acknowledgement

      if (sendPacketEvent) {
        packetCommits.push({
          channelId: chainA.channelID,
          portId: chainA.portID,
          sequence: Long.fromString(sendPacketEvent['sequence']),
          data: sendPacketEvent['packet']
        })
      }
      if (ackPacketEvent) {
        packetAcks.push({
          channelId: chainA.channelID,
          portId: chainA.portID,
          sequence: Long.fromString(ackPacketEvent['sequence']),
          data: ackPacketEvent['AckPacket']['data']
        })
      }
    }
  )

  const packetReceipts: channel.PacketState[] = []

  const promises = packetCommits.map(async (commit) => {
    log.info(`Packet commitment: ${JSON.stringify(commit)}`)
    const receipt = await clientB.ibc.channel.packetReceipt(chainB.portID, chainB.channelID, commit.sequence.toNumber())
    if (receipt.received) {
      const packetReceipt = {
        channelId: chainB.channelID,
        portId: chainB.portID,
        sequence: commit.sequence,
        data: commit.data
      }
      packetReceipts.push(packetReceipt)
      log.info(`Packet receipts: ${JSON.stringify(packetReceipts)}`)
    }
  })

  await Promise.all(promises)

  return extractPackets(packetCommits, packetReceipts, packetAcks, chainA, chainB)
}

async function queryIbc2VibcPacketsDirectional(
  clientA: QueryClient & IbcExtension,
  chainSetB: ChainSet,
  chainA: EndpointInfo,
  chainB: EndpointInfo
) {
  log.info("Querying packets from IBC to Vibc")
  const packetAcks = await clientA.ibc.channel.allPacketAcknowledgements(chainA.portID, chainA.channelID)
  const packetCommits = await clientA.ibc.channel.allPacketCommitments(chainA.portID, chainA.channelID)

  const packetReceipts: channel.PacketState[] = []

  await evmEvents(
    chainSetB as EvmChainSet,
    {
      height: null,
      minHeight: 0,
      maxHeight: await getLatestBlockNumber(chainSetB.Nodes[0].RpcHost)
    },
    (event: TxEvent) => {
      const recvPacketEvent = event.events.RecvPacket
      if (recvPacketEvent) {
        packetReceipts.push({
          channelId: chainB.channelID,
          portId: chainB.portID,
          sequence: Long.fromString(recvPacketEvent['sequence']),
          data: Uint8Array.from([])
        })
      }
    }
  )

  return extractPackets(packetCommits.commitments, packetReceipts, packetAcks.acknowledgements, chainA, chainB)
}

async function queryIbc2IbcPacketsDirectional(
  clientA: QueryClient & IbcExtension,
  clientB: QueryClient & IbcExtension,
  chainA: EndpointInfo,
  chainB: EndpointInfo
): Promise<Packet[]> {
  const packetCommits = await clientA.ibc.channel.allPacketCommitments(chainA.portID, chainA.channelID)
  const packetAcks = await clientB.ibc.channel.allPacketAcknowledgements(chainB.portID, chainB.channelID)

  const packetReceipts: channel.PacketState[] = []

  const promises = packetCommits.commitments.map(async (commit) => {
    log.info(`Packet commitment: ${JSON.stringify(commit)}`)
    const receipt = await clientB.ibc.channel.packetReceipt(chainB.portID, chainB.channelID, commit.sequence.toNumber())
    if (receipt.received) {
      const packetReceipt = {
        channelId: chainB.channelID,
        portId: chainB.portID,
        sequence: commit.sequence,
        data: commit.data
      }
      packetReceipts.push(packetReceipt)
      log.info(`Packet receipts: ${JSON.stringify(packetReceipts)}`)
    }
  })

  await Promise.all(promises)

  // NB: Packet data is from the perspective of the sending channel.
  return extractPackets(packetCommits.commitments, packetReceipts, packetAcks.acknowledgements, chainA, chainB)
}

async function getLatestBlockNumber(host: string) {
  // Connect to an Ethereum node using ethers.js
  const provider = new ethers.providers.JsonRpcProvider(host)

  // Get the latest block number
  return await provider.getBlockNumber()
}

export async function tracePackets(
  chainSetA: ChainSet,
  chainSetB: ChainSet,
  chainA: EndpointInfo,
  chainB: EndpointInfo
): Promise<Packet[]> {
  const hostA = chainSetA.Nodes[0].RpcHost
  const hostB = chainSetB.Nodes[0].RpcHost

  let packets: Packet[]
  let clientA: QueryClient & IbcExtension
  let clientB: QueryClient & IbcExtension

  if (isEvmChain(chainSetA.Type) && isEvmChain(chainSetB.Type)) {
    throw new Error('EVM tracing is not yet supported')
  } else if (isIbcChain(chainSetA.Type) && isIbcChain(chainSetB.Type)) {
    clientA = await getClient(hostA)
    clientB = await getClient(hostB)
    packets = await queryIbc2IbcPacketsDirectional(clientA, clientB, chainA, chainB)
    packets = packets.concat(await queryIbc2IbcPacketsDirectional(clientB, clientA, chainB, chainA))
  } else if (isEvmChain(chainSetA.Type) && isIbcChain(chainSetB.Type)) {
    clientB = await getClient(hostB)
    packets = await queryVibc2IbcPacketsDirectional(chainSetA as EvmChainSet, clientB, chainA, chainB)
    packets = packets.concat(await queryIbc2VibcPacketsDirectional(clientB, chainSetA as EvmChainSet, chainB, chainA))
  } else if (isIbcChain(chainSetA.Type) && isEvmChain(chainSetB.Type)) {
    clientA = await getClient(hostA)
    packets = await queryVibc2IbcPacketsDirectional(chainSetB as EvmChainSet, clientA, chainB, chainA)
    packets = packets.concat(await queryIbc2VibcPacketsDirectional(clientA, chainSetB as EvmChainSet, chainA, chainB))
  } else {
    throw new Error('Unsupported chain types')
  }

  log.info(`endpoint A: chainID: ${chainA.chainID}, portID: ${chainA.portID}, channelID: ${chainA.channelID}`)
  log.info(`endpoint B: chainID: ${chainB.chainID}, portID: ${chainB.portID}, channelID: ${chainB.channelID}`)

  // TODO: This won't work for larger numbers.
  const stateOrder: { [key in PacketState]: number } = {
    [PacketState.Sent]: 1,
    [PacketState.Received]: 2,
    [PacketState.Acknowledged]: 3,
    [PacketState.Timeout]: 4
  }

  packets.sort((a, b) => {
    if (stateOrder[a.state] !== stateOrder[b.state]) {
      return stateOrder[a.state] - stateOrder[b.state]
    }
    return a.sequence.compare(b.sequence)
  })

  const uniquePacketSet = new Set()
  packets.forEach((packet) => {
    uniquePacketSet.add(packet.sequence.toString() + '-' + packet.portID)
  })
  const uniquePacketCount = uniquePacketSet.size
  log.info(`Traced ${uniquePacketCount} packets`)

  return packets
}

export type EventsFilter = {
  height: number | null
  minHeight: number
  maxHeight: number
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
