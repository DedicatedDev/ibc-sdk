import winston from 'winston'
import * as self from '../../lib/index.js'
import { IbcExtension, QueryClient, setupIbcExtension } from '@cosmjs/stargate'

export enum PacketState {
  Sent = "sent",
  Received = "received",
  Acknowledged = "acknowledged",
  Timeout = "timeout"
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
  return self.cosmos.client.QueryClient.withExtensions(
    tmClient,
    setupIbcExtension,
  )
}

async function queryPacketsDirectional(
  sourceClient: QueryClient & IbcExtension,
  destClient: QueryClient & IbcExtension,
  source: EndpointInfo,
  dest: EndpointInfo,
): Promise<Packet[]> {
  const packetCommits = await sourceClient.ibc.channel.allPacketCommitments(source.portID, source.channelID)
  const packetAcks = await destClient.ibc.channel.allPacketAcknowledgements(dest.portID, dest.channelID)

  // NB: Packet data is from the perspective of the sending channel.
  const packets: Packet[] = []

  packetCommits.commitments.forEach((sent) => {
    packets.push({
      chainID: source.chainID,
      channelID: sent.channelId,
      portID: sent.portId,
      sequence: sent.sequence,
      state: PacketState.Sent,
    })
  })

  packetAcks.acknowledgements.forEach((ack) => {
    for (let i = 0; i < packets.length; i++) {
      if (packets[i].sequence === ack.sequence) {
        packets[i].state = PacketState.Acknowledged
        return
      }
    }
    // Acks are committed on the receiving chain using dest port/channel
    // but we're writing the data from the perspective of the sender to be consistent.
    // TODO: Is this the right UX for visualizing packets?
    packets.push({
      chainID: source.chainID,
      channelID: source.channelID,
      portID: source.portID,
      sequence: ack.sequence, // The sequence should be the same.
      state: PacketState.Received,
    })
  })

  return packets
}

export async function tracePackets(
  sourceRpc: string,
  destRpc: string,
  source: EndpointInfo,
  dest: EndpointInfo,
  log: winston.Logger,
): Promise<Packet[]> {
  const sourceClient = await getClient(sourceRpc)
  const destClient = await getClient(destRpc)

  let packets: Packet[] = await queryPacketsDirectional(sourceClient, destClient, source, dest)
  packets = packets.concat(await queryPacketsDirectional(destClient, sourceClient, dest, source))
  // TODO: This won't work for larger numbers.
  packets.sort((a, b) => a.sequence.compare(b.sequence))

  log.info(`Traced ${packets.length} packets`)

  return packets
}
