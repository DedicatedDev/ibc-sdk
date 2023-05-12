import * as utils from '../../lib/utils/index.js'
import * as self from '../../lib/index.js'
import anyTest, { TestFn } from 'ava'
import { SimLightClient } from './simlc'
import { ethers } from 'ethers'
import { ChainSetsRunConfig, ChainSetsRunObj } from '../../lib/dev/schemas.js'
import winston from 'winston'
import path from 'path'
type PolyRelayer = self.dev.polyrelayer.PolyRelayer

const test = anyTest as TestFn<{
  logger: self.utils.Logger
  run: ChainSetsRunObj
  config: ChainSetsRunConfig
  lc: SimLightClient
  evmBlock: number
  cosmosBlock: number
  queryClient: self.cosmos.client.QueryClient & self.cosmos.client.PolyIbcExtension
}>

const configPath = utils.getRelativeFilePath('../../../src/tests/devnet/eth_polymer_chains.config.yaml')
test.before(async (t) => {
  const logLevel: any = 'verbose'
  const logger = utils.createLogger({ Level: logLevel, Colorize: true })
  const config = utils.readYaml(configPath)
  const { runObj, configObj } = await self.dev.runChainSets(config, logger)
  const lc = await SimLightClient.connect(runObj.ChainSets[0], logger)
  const tmClient = await self.cosmos.client.newTendermintClient(runObj.ChainSets[0].Nodes[0].RpcHost)
  t.context.queryClient = self.cosmos.client.QueryClient.withExtensions(
    tmClient,
    self.cosmos.client.setupPolyIbcExtension
  )
  t.context.logger = logger
  t.context.run = runObj
  t.context.config = configObj
  t.context.lc = lc
})

test.beforeEach(async (t) => {
  const [cosmos, evm] = await Promise.all([
    waitForCosmosBlock(t.context.run.ChainSets[0].Nodes[0].RpcHost, t.context.logger),
    waitForEvmBlock(t.context.run.ChainSets[1].Nodes[0].RpcHost, t.context.logger)
  ])
  t.context.cosmosBlock = cosmos
  t.context.evmBlock = evm
})

async function waitForBlock(name: string, logger: winston.Logger, start: number, provider: () => Promise<number>) {
  const end = (await provider()) + start + 1
  let height = 0
  logger.verbose(`Target ${name} height: ${end}`)
  while (height < end) {
    height = await provider()
    logger.verbose(`current ${name} height: ${height}`)
    await utils.sleep(1000)
  }
  logger.verbose(`Done waiting. Got ${name} height ${height}`)
  return height
}

async function waitForEvmBlock(endpoint: string, logger: winston.Logger, start: number = 0) {
  const provider = new ethers.providers.JsonRpcProvider(endpoint)
  return waitForBlock('EVM', logger, start, async () => await provider.getBlockNumber())
}

async function waitForCosmosBlock(endpoint: string, logger: winston.Logger, start: number = 0) {
  const provider = await self.cosmos.client.newTendermintClient(endpoint)
  return waitForBlock('COSMOS', logger, start, async () => (await provider.block()).block.header.height)
}

async function evmSendIbcPacket(
  chainset: any,
  dispatcherAddr: string,
  channelId: string,
  payload: string,
  timeout: ethers.BigNumber
) {
  const provider = new ethers.providers.JsonRpcProvider(chainset.Nodes[0].RpcHost)
  const wallet = new ethers.Wallet(chainset.Accounts[0]['PrivateKey'], provider)
  const ibcCoreModuleABI = [
    'function sendIbcPacket(bytes32 channelId, bytes calldata payload, uint64 timeoutBlockHeight)'
  ]
  const ibcCoreModule = new ethers.Contract(dispatcherAddr, ibcCoreModuleABI, wallet)
  const txnResponse = await ibcCoreModule.sendIbcPacket(
    ethers.utils.formatBytes32String(channelId),
    ethers.utils.toUtf8Bytes(payload),
    timeout
  )
  await txnResponse.wait()
}

async function evmRegisterPort(chainset: any, dispatcherAddr: string) {
  const provider = new ethers.providers.JsonRpcProvider(chainset.Nodes[0].RpcHost)
  const wallet = new ethers.Wallet(chainset.Accounts[0]['PrivateKey'], provider)
  const ibcCoreModuleABI = ['function registerPort()']
  const ibcCoreModule = new ethers.Contract(dispatcherAddr, ibcCoreModuleABI, wallet)
  const txnResponse = await ibcCoreModule.registerPort()
  await txnResponse.wait()
}

async function setupPolyrelayer(
  t: any,
  paths: string[] = [],
  forwardBlockHeaders: boolean = false
): Promise<[PolyRelayer, any]> {
  const contractsDir = path.resolve(__dirname, '..', '..', '..', 'tests', 'xdapp', 'artifacts', 'contracts')
  const contractsConfig = self.dev.createContractsConfig(contractsDir)
  const dispatcherContracts = await self.dev.deployPolyCoreContractsOnChainSets(
    t.context.run,
    contractsConfig,
    t.context.logger
  )
  const polyrelayer = await self.dev.polyrelayer.PolyRelayer.create(t.context.run.Run.WorkingDir, t.context.logger)

  let relayerConfig = polyrelayer.config(t.context.run, dispatcherContracts, [paths], {
    dst_client_id: 'sim-0',
    src_client_id: 'sim-0',
    'account-prefix': 'polymerase',
    'forward-block-headers': forwardBlockHeaders
  })
  relayerConfig.global = { 'log-level': 'verbose', 'polling-idle-time': 1000 }
  const out = await polyrelayer.setup(relayerConfig)
  t.assert(out.exitCode == 0, out.stderr)

  return [polyrelayer, dispatcherContracts]
}

// TODO: skip until we implement the evm -> polymer path
test.serial.skip('Check second chain to confirm e2e packet routing', async (t) => {
  // Put a port registrations on BSC
  // Confirm that the port registration shows up on Polymerase
  const [polyrelayer, contracts] = await setupPolyrelayer(t, ['bsc', 'polymerase'], true)

  let events = await polyrelayer.events(0)
  t.assert(events.length === 0, 'There should be no events')
  const preClientState = t.context.queryClient.polyibc.RegistryAll(
    self.cosmos.client.polyibc.query.QueryAllRegistryRequest.fromPartial({})
  )
  const out = await polyrelayer.run()
  t.assert(out.exitCode === 0, 'Docker did not produce a valid output')
  // Figure out how to query the LC for recent packets committed to it
  await evmRegisterPort(t.context.run.ChainSets[1], contracts.bsc)

  // Need to confirm if other side can see it
  events = await polyrelayer.events(2, ['PortRegistration'], 10, 50000)
  t.assert(events[0].event_name === 'PortRegistration', 'Port Registration not received')
  t.assert(events[0].event_type === 'Received', 'Port Registration not received')
  t.assert(events[1].event_type === 'Processed', 'Port Registration not processed')

  // Poly Relayer needs to actively transmit the Consensus State to the LC
  // See Parlia Test to figure out how to do this.

  // Query the LC for the port registration
  const postClientState = await t.context.queryClient.polyibc.RegistryAll(
    self.cosmos.client.polyibc.query.QueryAllRegistryRequest.fromPartial({})
  )
  t.notDeepEqual(postClientState, preClientState, "Ports didn't update")
  const port = postClientState.RegistryAddr[0].registry?.port

  // This is a very hacky way of creating a channel. We need to find a way to create a channel w/o the ibc-relayer
  const chain = t.context.run.ChainSets[0] as self.dev.schemas.CosmosChainSet
  const chainName = chain.Name
  const chainRegistry = self.dev.newChainRegistry(t.context.run, [chainName, chainName], true)
  const chainPair = { src: { name: chainName }, dest: { name: chainName } }
  const ibcRelayerAccount = { mnemonic: chain.Accounts[1].Mnemonic! }
  const relayerConfig = self.dev.newIbcRelayerConfig(chainRegistry, chainPair, ibcRelayerAccount)
  const ibcrelayer = await self.dev.newIBCRelayer(t.context.run.Run.WorkingDir, 'foo', t.context.logger)

  // set up an IBC channel between chains
  await ibcrelayer.init(relayerConfig)
  await ibcrelayer.connect()

  await ibcrelayer.channel({
    srcPort: port,
    dstPort: port,
    version: 'polyibc-1'
  })
  const channels = await ibcrelayer.getChannels({ chain: 'polymerase' })
  console.log(JSON.stringify(channels, null, 4))
  const channel = channels[0].channel_id
  const payload = 'this is the payload'
  const timeout = ((Date.now() + 100000) * 1000000).toString()
  await evmSendIbcPacket(t.context.run.ChainSets[1], contracts.bsc, channel, payload, ethers.BigNumber.from(timeout))

  events = await polyrelayer.events(2, ['IbcPacket'], 15, 25000)
  t.assert(events[0].event_type === 'Received', 'IBC Packet not received')
  t.assert(events[1].event_type === 'Processed', 'IBC Packet not processed')
})

test.serial('run polyrelayer before EVM port registration', async (t) => {
  const [polyrelayer, dispatcherContracts] = await setupPolyrelayer(t, ['eth', 'polymerase'])
  let events = await polyrelayer.events(0, ['PortRegistration'])
  t.assert(events.length === 0, 'There should be no events')

  const out = await polyrelayer.run()
  t.assert(out.exitCode === 0, 'Docker did not produce a valid output')

  await evmRegisterPort(t.context.run.ChainSets[1], dispatcherContracts.eth)

  events = await polyrelayer.events(2, ['PortRegistration'])
  t.assert(events.length === 2, 'There should be two events')
  t.assert(events[0].event_name === 'PortRegistration', 'Port Registration not received')
  t.assert(events[0].event_type === 'Received', 'Port Registration not received')
  t.assert(events[1].event_type === 'Processed', 'Port Registration not processed')
})

test.serial.skip('run polyrelayer after EVM port registration', async (t) => {
  const [polyrelayer, dispatcherContracts] = await setupPolyrelayer(t, ['bsc', 'polymerase'])
  await evmRegisterPort(t.context.run.ChainSets[1], dispatcherContracts.bsc)

  const out = await polyrelayer.run()
  t.assert(out.exitCode === 0, 'Docker did not produce a valid output')

  const events = await polyrelayer.events(2, ['PortRegistration'])
  t.assert(events.length === 2, 'There should be 2 events')
  t.assert(events[0].event_name === 'PortRegistration', 'Port Registration not received')
  t.assert(events[0].event_type === 'Received', 'Port Registration not received')
  t.assert(events[1].event_type === 'Processed', 'Port Registration not processed')
  t.assert(events[1].event_data.args[0] === t.context.run.ChainSets[1].Accounts![0].Address, 'Missing sender address')
})

test.serial.skip('run polyrelayer starting at a later height', async (t) => {
  t.context.evmBlock += 5

  const [polyrelayer, dispatcherContracts] = await setupPolyrelayer(t, ['bsc', 'polymerase'])

  const out = await polyrelayer.run()
  t.assert(out.exitCode === 0, 'Docker did not produce a valid output')

  // even though there is a port registration event happening here, the
  // polyrelayer won't pick it up since it's only searching from height `block`
  await evmRegisterPort(t.context.run.ChainSets[1], dispatcherContracts.bsc)

  let events = await polyrelayer.events(0, ['PortRegistration'])
  t.assert(events.length === 0, 'There should be no events')

  // wait for new blocks to be generated
  await waitForEvmBlock(t.context.run.ChainSets[1].Nodes[0].RpcHost, t.context.logger, 5)

  // only this new port registration event will be found
  await evmRegisterPort(t.context.run.ChainSets[1], dispatcherContracts.bsc)

  events = await polyrelayer.events(2, ['PortRegistration'])
  t.assert(events.length === 2, 'There should be two events')
  t.assert(events[0].event_name === 'PortRegistration', 'Port Registration not received')
  t.assert(events[0].event_type === 'Received', 'Port Registration not received')
  t.assert(events[1].event_type === 'Processed', 'Port Registration not processed')
  t.assert(events[1].event_data.args[0] === t.context.run.ChainSets[1].Accounts![0].Address, 'Missing sender address')
})

test.serial.skip('Start EVM and send ibc packet', async (t) => {
  const [polyrelayer, dispatcherContracts] = await setupPolyrelayer(t, ['bsc', 'polymerase'])

  let events = await polyrelayer.events(0, ['IbcPacket'])
  t.assert(events.length === 0, 'There should be no events')
  const out = await polyrelayer.run()
  t.assert(out.exitCode === 0, 'Docker did not produce a valid output')

  const channel = 'channel-id-1'
  const payload = 'this is the payload'
  const timeout = ((Date.now() + 100000) * 1000000).toString()

  await evmSendIbcPacket(
    t.context.run.ChainSets[1],
    dispatcherContracts.bsc,
    channel,
    payload,
    ethers.BigNumber.from(timeout)
  )

  events = await polyrelayer.events(2, ['IbcPacket'])
  t.assert(events.length === 2, 'There should be no events')
  t.assert(events[0].event_name === 'IbcPacket', 'IBC packet not received')
  t.assert(events[0].event_type === 'Received', 'IBC packet not received')
  t.assert(events[1].event_type === 'Processed', 'IBC packet not processed')

  const event = events[1].event_data
  t.assert(event.args[0] === t.context.run.ChainSets[1].Accounts![0].Address, 'Invalid sender address')
  t.assert(event.args[1] === channel, 'Invalid channel id')
  t.assert(ethers.utils.toUtf8String(event.args[2]) === payload, 'Invalid payload')
  t.assert(event.args[3] === timeout, 'Invalid timeout')
})

test.serial.skip('polyrelayer saves height in case of restart', async (t) => {
  const [polyrelayer, dispatcherContracts] = await setupPolyrelayer(t, ['bsc', 'polymerase'])

  await evmRegisterPort(t.context.run.ChainSets[1], dispatcherContracts.bsc)
  {
    const out = await polyrelayer.run()
    t.assert(out.exitCode === 0, 'Docker did not produce a valid output')

    const events = await polyrelayer.events(2, ['PortRegistration'])
    t.assert(events.length === 2, 'There should be two events')
    t.assert(events[0].event_name === 'PortRegistration', 'Port Registration not received')
    t.assert(events[0].event_type === 'Received', 'Port Registration not received')
    t.assert(events[1].event_type === 'Processed', 'Port Registration not processed')
    t.assert(events[1].event_data.args[0] === t.context.run.ChainSets[1].Accounts![0].Address, 'Missing sender address')
  }

  {
    // at this point, the polyrelayer should start query txs since the last height
    // it checked before being killed. Since no events happened since, we should
    // get none below.
    const out = await polyrelayer.restart()
    t.assert(out.exitCode === 0, 'Docker did not produce a valid output')

    const events = await polyrelayer.events(0, ['PortRegistration'])
    t.assert(events.length === 0, 'There should be no events')
  }
})

// This test is cheating a bit. It's supposed to exercise the polyrelayer with an IBC, a non IBC and the polymer chain.
// However, to make things a bit easier the IBC and Polymer chain are the same chain. Not a big deal but there's
// some caveats like extra events the polyrelayer isn't supposed to be seeing at times.
//TODO: skip until we implement more than the send_packet
test.serial.skip('simulate IBC to Non-IBC packet flow', async (t) => {
  // TODO: connection ids should be part of polymerase genesis
  const [polyrelayer] = await setupPolyrelayer(t, ['polymerase', 'bsc'])

  const portId = 'port-remove-me'
  t.truthy(portId, 'Port could not be registered')
  const out = await polyrelayer.run()
  t.assert(out.exitCode === 0, 'Docker did not produce a valid output')

  const chain = t.context.run.ChainSets[0] as self.dev.schemas.CosmosChainSet
  const chainName = chain.Name
  const chainRegistry = self.dev.newChainRegistry(t.context.run, [chainName, chainName], true)
  const chainPair = { src: { name: chainName }, dest: { name: chainName } }
  const relayerAccount = { mnemonic: chain.Accounts[0].Mnemonic! }
  const relayerConfig = self.dev.newIbcRelayerConfig(chainRegistry, chainPair, relayerAccount)
  const ibcrelayer = await self.dev.newIBCRelayer(t.context.run.Run.WorkingDir, 'foo', t.context.logger)

  // set up an IBC channel between chains
  await ibcrelayer.init(relayerConfig)
  await ibcrelayer.connect()
  const connections = await ibcrelayer.getConnections()
  await ibcrelayer.channel({
    srcPort: portId,
    dstPort: portId,
    version: 'polyibc-1'
  })
  const channels: any[] = await ibcrelayer.getChannels({ chain: 'polymerase' })
  channels.sort((a, b) => parseInt(a.connection_id.split('-')[1]) - parseInt(b.connection_id.split('-')[1]))

  t.assert(channels.length >= 2, 'Missing channels')
  t.assert(channels.at(-2).connection_id === connections.srcConnection, 'Wrong src connection id')
  t.assert(channels.at(-2).state === 'Open', 'Wrong src channel state')
  t.assert(channels.at(-2).port_id === portId, 'Wrong src channel port id')

  t.assert(channels.at(-1).connection_id === connections.destConnection, 'Wrong dst connection id')
  t.assert(channels.at(-1).port_id === portId, 'Wrong dst channel port id')
  t.assert(channels.at(-1).state === 'Open', 'Wrong dst channel state')

  // send the IBC packet over the newly created channel
  const payload = 'this is the payload'
  const timeout = ((Date.now() + 60 * 60 * 1000) * 1_000_000).toString() // ns
  const packet = await t.context.lc.sendIbcPacket(channels.at(-2).channel_id, payload, timeout)
  t.truthy(packet, 'IBC packet not sent')

  await ibcrelayer.relayOnce()

  // There should be only be 2 recv_packet events here but there are four, the 2 recv and 2 send_packet.
  // This is because we are cheating and reusing the same polymer chain as the src IBC chain.
  // We are only going to pay attention to the recv_packet event since it's the one that matters here.
  let events = await polyrelayer.events(2, ['ReceivePacket'])
  t.assert(events.length === 2, 'There should be 2 events')
  t.assert(events[1].event_name === 'ReceivePacket', 'Invalid event name')
  // make the assert easier
  packet.packet_connection = channels[1].connection_id
  t.deepEqual(events[1].event_data, packet, 'Invalid packet')

  // TODO: this should work as follows:
  // - polyrelayer picks up the "recv_packet" event from polymer
  // - polyrelayer relays the packet to the non-ibc chain
  // - non-ibc chain receives the packet and emits WriteAckEvent
  // - polyrelayer picks up the "write_ack_event" from non-ibc chain
  // - polyrelayer calls /polyibc.core.MsgAcknowledgement on Polymer
  //
  // instead, we are omitting all those steps and faking the /polyibc.core.MsgAcknowledgement call
  const ack = await t.context.lc.sendIbcAck(channels.at(-2).channel_id, packet)
  t.truthy(ack, 'IBC ack not sent')

  // TODO: this will not be needed eventually.
  await ibcrelayer.relayOnce()

  events = await polyrelayer.events(2, ['AckPacket'])
  t.assert(events.length === 2, 'There should be 2 events')

  const event = events[1]
  t.assert(event.event_name === 'AckPacket', 'Invalid type')

  // make the assert easier
  packet.packet_connection = channels.at(-2).connection_id
  delete packet.packet_data_hex
  delete packet.packet_data
  t.deepEqual(event.event_data, packet, 'Invalid packet')
})

test.serial('polymer to eth end-to-end ', async (t) => {
  // TODO: connection ids should be part of polymerase genesis
  const [polyrelayer] = await setupPolyrelayer(t, ['polymerase', 'eth'])

  const portId = 'change-me'
  const out = await polyrelayer.run()
  t.assert(out.exitCode === 0, 'Docker did not produce a valid output')

  const chain = t.context.run.ChainSets[0] as self.dev.schemas.CosmosChainSet
  const chainName = chain.Name
  const chainRegistry = self.dev.newChainRegistry(t.context.run, [chainName, chainName], true)
  const chainPair = { src: { name: chainName }, dest: { name: chainName } }
  const relayerAccount = { mnemonic: chain.Accounts[0].Mnemonic! }
  const relayerConfig = self.dev.newIbcRelayerConfig(chainRegistry, chainPair, relayerAccount)
  const ibcrelayer = await self.dev.newIBCRelayer(t.context.run.Run.WorkingDir, 'foo', t.context.logger)

  // set up an IBC channel between chains
  await ibcrelayer.init(relayerConfig)
  await ibcrelayer.connect()
  await ibcrelayer.channel({
    srcPort: portId,
    dstPort: portId,
    version: 'polyibc-1'
  })
  const channels: any[] = await ibcrelayer.getChannels({ chain: 'polymerase' })
  channels.sort((a, b) => parseInt(a.connection_id.split('-')[1]) - parseInt(b.connection_id.split('-')[1]))

  // send the IBC packet over the newly created channel
  const payload = 'this is the payload'
  const timeout = ((Date.now() + 60 * 60 * 1000) * 1_000_000).toString() // ns
  const packet = await t.context.lc.sendIbcPacket(channels.at(-2).channel_id, payload, timeout)
  t.truthy(packet, 'IBC packet not sent')

  await ibcrelayer.relayOnce()
  const events = await polyrelayer.events(2, ['SendPacket'])

  const receipt = JSON.parse(events[1].event_data)
  t.context.logger.verbose(`receipt ${JSON.stringify(receipt, null, 2)}`)
  t.assert(receipt.status === 1)

  // confirm the transaction was sent by querying it directly from the chain
  const eth = new ethers.providers.JsonRpcProvider(t.context.run.ChainSets[1].Nodes[0].RpcHost)
  const tx = await eth.getTransaction(receipt.transactionHash)
  t.truthy(tx)
  t.context.logger.verbose(`tx ${JSON.stringify(tx, null, 2)}`)
})
