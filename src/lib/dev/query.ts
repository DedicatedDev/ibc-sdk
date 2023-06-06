import winston from 'winston'
import * as self from '../../lib/index.js'
import { IbcExtension, QueryClient, setupIbcExtension } from '@cosmjs/stargate'

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
  chainB: EndpointInfo,
  log: winston.Logger
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
