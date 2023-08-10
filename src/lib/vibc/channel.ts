import { ChainSetsRunObj, CosmosChainSet, EvmChainSet } from '../schemas'
import * as self from '../index'
import { VIBCRelayer } from '../relayers/vibc'
import { getLogger } from '../utils'
import { addressify } from '../ethers'
import { setupIbcRelayer } from '../relayers'
import { ibcPathFromChainClients, vibcPathFromChainClients } from '../ibc/path'
import { IbcChannelHandshaker, HandshakeConfig } from '../ibc/channel'

const log = getLogger()

function portIdToEvmAddress(portId: string) {
  const parts = portId.split('.')
  if (parts.length !== 3) throw new Error(`Invalid portID ${portId}`)
  return addressify(parts[2])
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

// vIbc (A) <=> Ibc (B) with IBC handshake handled by the IBC relayer, picking it up at chan open init
export async function vIbcToIbc(config: HandshakeConfig, connectionHops: string[]) {
  log.debug('vIbc (A) <=> Ibc (B) case')
  const polymer = await IbcChannelHandshaker.create(config.poly as CosmosChainSet, config.a.version, config.a.portID)
  const ibcB = await IbcChannelHandshaker.create(config.b.chain as CosmosChainSet, config.b.version, config.b.portID)

  const address = portIdToEvmAddress(config.a.portID)
  const vibcA = await VIbcChannelHandshaker.create(config.a.chain as EvmChainSet, config.runtime, address, polymer)

  // TODO: use grpc
  const polymerClient = self.cosmos.cliClient.CosmosChainClient.fromRunningContainer(polymer.chain)
  const dstClient = self.cosmos.cliClient.CosmosChainClient.fromRunningContainer(ibcB.chain)

  // step 1: fetch IBC-side clients/connections
  const singleHopPath = await ibcPathFromChainClients(polymerClient, dstClient, polymer.chain.Name, ibcB.chain.Name)
  // TODO: reuse relayer if there's a match
  // const relayer = runtime.Relayers.find((r: RelayerRunObj) => r.Name === 'ibc-relayer')
  const relayer = await setupIbcRelayer(undefined, config.runtime, [singleHopPath], false)

  connectionHops.push(relayer.pathConfigs[0].config.src['connection-id'])
  log.verbose(`creating channel with connection hops: ${connectionHops[0]} -> ${connectionHops[1]}`)

  // step 2: trigger channel init via vibc. This includes waiting for a channel_open_init event
  await vibcA.openIbcChannel(ibcB, connectionHops, config.a.version, 'unordered')
  // TODO: this starts a relayer per channel, we should have a running relayer (if any) react to config changes instead
  await vibcA.startRelaying(connectionHops)

  // step 3: setup the IBC relayer to relay the IBC portion of the path
  // This time we reuse the relayer we started and reinitialize it with the full path
  const ibcPath = await vibcPathFromChainClients(polymerClient, dstClient, polymer.chain.Name, ibcB.chain.Name)

  await setupIbcRelayer(relayer, config.runtime, [ibcPath])

  // step 4: watch for the rest of the channel handshake events
  await ibcB.waitForEvent('channel_open_try')
  await polymer.waitForEvent('channel_open_ack')
  await ibcB.waitForEvent('channel_open_confirm')
}

// Ibc (A) <=> vIbc (B)
export async function ibcTovIbc(
  config: HandshakeConfig,
  virtualConnectionId: string,
  virtualCounterpartyConnectionId: string
) {
  log.debug('Ibc (A) <=> vIbc (B) case')
  const ibcA = await IbcChannelHandshaker.create(config.a.chain as CosmosChainSet, config.a.version, config.a.portID)

  const polymer = await IbcChannelHandshaker.create(config.poly as CosmosChainSet, config.b.version, config.b.portID)

  const address = portIdToEvmAddress(config.b.portID)
  const vibcB = await VIbcChannelHandshaker.create(config.b.chain as EvmChainSet, config.runtime, address, polymer)
  // TODO: this starts a relayer per channel, we should have a running relayer (if any) react to config changes instead

  // step 1: fetch IBC-side clients/connections
  // TODO: use grpc
  const srcClient = self.cosmos.cliClient.CosmosChainClient.fromRunningContainer(ibcA.chain)
  const polymerClient = self.cosmos.cliClient.CosmosChainClient.fromRunningContainer(polymer.chain)
  const singleHopPath = await ibcPathFromChainClients(srcClient, polymerClient, ibcA.chain.Name, polymer.chain.Name)
  // This creates the following path:
  //              ibcA <-> polymer
  //
  // Typically, this would be:
  //   07-tendermint-0 <-> 07-tendermint-1
  //      connection-0 <-> connection-2
  //
  // It represents the first hop of:
  //              ibcA <->           polymer           <-> virtual
  //   07-tendermint-0 <-> 07-tendermint-1, altair-0-0 <-> polymer-0
  //      connection-0 <-> connection-2, connection-1  <-> connection-0

  // TODO: reuse relayer if there's a match
  // const relayer = runtime.Relayers.find((r: RelayerRunObj) => r.Name === 'ibc-relayer')

  const relayer = await setupIbcRelayer(undefined, config.runtime, [singleHopPath], false)

  // Since we need the connection hop from the virtual chain point of view, we need the connection going out of polymer
  // and into ibcA
  const connectionHops = [relayer.pathConfigs[0].config.src['connection-id'], virtualCounterpartyConnectionId]
  log.verbose(`creating channel with connection hops: ${connectionHops[0]} -> ${connectionHops[1]}`)

  // step 2: start vibc relayer and trigger channel init
  const counterpartyConnectionHops = [virtualConnectionId, relayer.pathConfigs[0].config.dst['connection-id']]
  log.verbose(
    `starting vibc relayer with connection hops: ${counterpartyConnectionHops[0]} -> ${counterpartyConnectionHops[1]}`
  )
  await vibcB.startRelaying(counterpartyConnectionHops)

  // TODO: use the relayer for this?
  await ibcA.channOpenInit(polymer, connectionHops)
  await ibcA.waitForEvent('channel_open_init')

  // step 3: setup the IBC relayer to relay the IBC portion of the path
  // This time we reuse the relayer we started and reinitialize it with the full path
  const reverseIbcPath = await vibcPathFromChainClients(polymerClient, srcClient, polymer.chain.Name, ibcA.chain.Name)
  const ibcPath = reverseIbcPath.reverse()
  await setupIbcRelayer(relayer, config.runtime, [ibcPath])

  // step 4: watch for the rest of the channel handshake events
  await polymer.waitForEvent('channel_open_try')
  await ibcA.waitForEvent('channel_open_ack')
  await polymer.waitForEvent('channel_open_confirm')
}

// vIbc (A) <=> vIbc (B)
export async function vIbcTovIbc(_config: HandshakeConfig) {
  throw new Error('Not implemented yet')
}
