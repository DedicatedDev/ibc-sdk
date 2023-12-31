import anyTest, { TestFn } from 'ava'
import { ethers } from 'ethers'
import { utils } from '../../lib'
import { ProcessOutput } from 'zx-cjs'
import { ChainConfig, RelayerRunObj, CosmosAccount, EvmChainSet } from '../../lib/schemas'
import { fs, path, $, getTestingLogger } from '../../lib/utils'
import { showLogsBeforeExit } from './test_utils'
import { newTendermintClient } from '../../lib/cosmos/client'

const log = getTestingLogger()

const test = anyTest as TestFn<{
  workspace: string
  cli: string
}>

test.beforeEach((t) => {
  t.context.cli = path.resolve(__dirname, '..', '..', '..', 'bin', 'ibctl')
  $.verbose = true
  process.env.TEST_LOG_LEVEL = 'verbose'
  t.context.workspace = process.env.TEST_IBCTL_WORKSPACE ?? fs.mkdtempSync(path.join('/tmp', 'ibctl-tests-'))
})

test.afterEach(async (t) => {
  await showLogsBeforeExit(t.context.cli, t.context.workspace)
  if (!process.env.TEST_IBCTL_WORKSPACE) {
    const out = await runCommand(t, 'stop')
    t.assert(out.exitCode === 0)
  }
})

async function runCommand(t: any, ...args: string[]): Promise<ProcessOutput> {
  const cmds = [t.context.cli, '-l', process.env.TEST_LOG_LEVEL, '-w', t.context.workspace, ...args]
  return await $`${cmds}`
}

async function getChannelsFrom(t: any, chain: string) {
  const out = await runCommand(t, 'channels', chain)
  return utils.readYamlText(out.stdout.trim())
}

async function latestEvmHeight(url: string): Promise<string> {
  const client = new ethers.providers.JsonRpcProvider(url)
  const block = await client.send('eth_getBlockByNumber', ['latest', true])
  return parseInt(block.number).toString()
}

async function latestCosmosHeight(url: string): Promise<string> {
  const client = await newTendermintClient(url)
  const block = await client.block()
  return block.block.header.height.toString()
}

async function waitForEvent(t: any, chainName: string, minHeight: string, eventName: string, cb: (e: any) => boolean) {
  log.info(`querying event '${eventName}' from ${chainName}`)
  await utils.waitUntil(
    async () => {
      const out = await runCommand(t, 'events', chainName, '--min-height', minHeight, '--json')
      t.assert(out.exitCode === 0)
      const events = JSON.parse(out.stdout.trim())
      let event = events.find((e: any) => e.events.find((e1: any) => e1[eventName]))
      if (!event) return false
      log.info(`got event from ${chainName}: ${JSON.stringify(event)}`)
      return cb(event.events)
    },
    10,
    6_000,
    `failed to find event '${eventName}' on ${chainName}`
  )
}

async function testEndToEnd(t: any, vIbcToIbc: boolean) {
  t.assert((await runCommand(t, 'init')).exitCode === 0)
  t.assert((await runCommand(t, 'start', '-c', 'wasm:polymer', '-c', 'polymer:eth')).exitCode === 0)

  let runtime = JSON.parse(fs.readFileSync(path.join(t.context.workspace, 'run', 'run.json'), 'utf-8'))
  t.assert(runtime)

  let eth1Chain: EvmChainSet = runtime.ChainSets.find((c: ChainConfig) => c.Name === 'eth')
  t.assert(eth1Chain)

  const vibcRelayer = runtime.Relayers.find((r: RelayerRunObj) => r.Name === 'vibc-relayer')
  t.assert(vibcRelayer)

  // Do not use account[0] since that's reserved for the vibc relayer
  const eth1Account = eth1Chain.Accounts[1]
  t.assert(eth1Account)

  const wasmChain = runtime.ChainSets.find((c: ChainConfig) => c.Name === 'wasm')
  t.assert(wasmChain)

  const wasmAccount = wasmChain.Accounts.find((a: CosmosAccount) => a.Name === 'relayer')
  t.assert(wasmAccount)

  const dispatcher = eth1Chain.Contracts.find((c: any) => c.Name === 'Dispatcher')
  t.assert(dispatcher)

  // deploy wasm contract
  const wasm = path.resolve(__dirname, '..', '..', '..', 'src', 'tests', 'devnet', 'demo.wasm')
  t.assert(fs.existsSync(wasm))
  let out = await runCommand(t, 'deploy', 'wasm', wasmAccount.Address, wasm)
  t.assert(out.exitCode === 0)
  const wasmAddress = out.stdout.trim()
  t.assert(wasmAddress.startsWith('wasm'))

  // deploy evm contract
  const marsPath = path.join(t.context.workspace, 'vibc-core-smart-contracts', 'Mars.sol', 'Mars.json')
  t.assert(fs.existsSync(marsPath))
  const out1 = await runCommand(t, 'deploy', 'eth', eth1Account.Address, marsPath)
  t.assert(out1.exitCode === 0)

  runtime = JSON.parse(fs.readFileSync(path.join(t.context.workspace, 'run', 'run.json'), 'utf-8'))
  t.assert(runtime)
  eth1Chain = runtime.ChainSets.find((c: ChainConfig) => c.Name === 'eth')
  t.assert(eth1Chain)

  const mars = eth1Chain.Contracts.find((c: any) => c.Name === 'Mars')
  t.assert(mars)

  // check there's no channels after chains are started
  t.deepEqual((await getChannelsFrom(t, 'polymer')).channels, [])
  t.deepEqual((await getChannelsFrom(t, 'wasm')).channels, [])

  const version = '1.0'
  const evmEndpoint = 'eth:polyibc.Ethereum-Devnet.' + mars!.Address.slice(2) + ':' + version
  const wasmEndpoint = 'wasm:wasm.' + wasmAddress + ':' + version
  let channels = [evmEndpoint, wasmEndpoint]
  if (!vIbcToIbc) {
    channels = [wasmEndpoint, evmEndpoint]
  }

  log.info(`Creating channel between ${channels.map((e) => e.split(':')[0]).join(' and ')}`)
  out = await runCommand(t, 'channel', ...channels)
  t.assert(out.exitCode === 0)

  // check the channels have been correctly created
  const newPolyChannel = await getChannelsFrom(t, 'polymer')
  const newWasmChannel = await getChannelsFrom(t, 'wasm')

  const numExpectedChannels = 1
  t.assert(newPolyChannel.channels.length === numExpectedChannels)
  t.assert(newWasmChannel.channels.length === numExpectedChannels)

  const wasmChannel = newWasmChannel.channels[0]
  const polyChannel = newPolyChannel.channels[0]

  t.assert(polyChannel.channel_id === wasmChannel.counterparty.channel_id)
  t.assert(wasmChannel.channel_id === polyChannel.counterparty.channel_id)

  t.assert(polyChannel.state === 'STATE_OPEN')
  t.assert(polyChannel.version === version)
  t.assert(wasmChannel.state === 'STATE_OPEN')
  t.assert(wasmChannel.version === version)

  const config = {
    runtime: runtime,
    vibcRelayer: vibcRelayer,
    eth1Chain: eth1Chain,
    eth1Account: eth1Account,
    wasmChain: wasmChain,
    wasmAccount: wasmAccount,
    wasmChannel: wasmChannel,
    wasmAddress: wasmAddress,
    polyChannel: polyChannel,
    dispatcher: dispatcher,
    receiver: mars
  }

  await testMessagesFromWasmToEth(t, config)
  await testMessagesFromEthToWasm(t, config)
  await testTracePackets(t, config)

  await runCommand(t, 'show')
  await runCommand(t, 'logs', 'polymer', '-n', '5')
  await runCommand(t, 'logs', 'wasm', '-n', '5')
  await runCommand(t, 'logs', 'eth:main', '-n', '5')
}

test.serial('cli end to end: eth -> polymer -> wasm', async (t) => {
  await testEndToEnd(t, true)
})

test.serial('cli end to end: wasm -> polymer -> eth', async (t) => {
  await testEndToEnd(t, false)
})

async function testTracePackets(t: any, c: any) {
  const endpointA = `${c.wasmChain.Name}:${c.wasmChannel.channel_id}:${c.wasmChannel.port_id}`
  const endpointB = `eth:${c.polyChannel.channel_id}:${c.receiver.Address}`

  const out = await runCommand(t, 'trace-packets', '--json', endpointA, endpointB)
  t.assert(out.exitCode === 0)
  const packets = JSON.parse(out.stdout.trim())

  t.assert(packets.length === 4)
  t.assert(packets.filter((p: any) => p.state === 'acknowledged').length === 2)
  t.assert(packets.filter((p: any) => p.state === 'received').length === 2)
  t.assert(packets.find((c: any) => c.chainID === 'wasm'))
  t.assert(packets.find((c: any) => c.chainID === 'eth'))
}

// Test the following sequence
//  - Call sendIbcPacket() on the vIBC contract running on ethereum
//  - Expect the eth relayer to relay it polymer
//  - Expect the ibc relayer to relay it to wasm
//  - Receive the message on wasm
async function testMessagesFromEthToWasm(t: any, c: any) {
  const evmHeight = await latestEvmHeight(c.eth1Chain.Nodes[0].RpcHost)
  const wasmHeight = await latestCosmosHeight(c.wasmChain.Nodes[0].RpcHost)

  const provider = new ethers.providers.JsonRpcProvider(c.eth1Chain.Nodes[0].RpcHost)
  const signer = new ethers.Wallet(c.eth1Account.PrivateKey).connect(provider)

  log.info('Sending message from ETH to WASM...')
  const msg = `Hello from ETH, iteration ${c.iteration}`
  const receiver = new ethers.Contract(c.receiver.Address, c.receiver.Abi, signer)
  const response = await receiver.greet(
    c.dispatcher.Address,
    JSON.stringify({ message: { m: msg } }),
    ethers.utils.formatBytes32String(c.polyChannel.channel_id),
    ((Date.now() + 60 * 60 * 1000) * 1_000_000).toString(),
    {
      recvFee: 0,
      ackFee: 0,
      timeoutFee: 0
    }
  )
  // Get the sequence number from the emitted SendPacket event
  const receipt = await response.wait()
  const iface = new ethers.utils.Interface(c.dispatcher.Abi)
  const parsed = iface.parseLog(receipt.logs[0])
  const [_sourcePortAddress, _sourceChannelId, _packet, sendPacketSequence, _timeout, _fee] = parsed.args
  log.info(`sent tx on eth ${_packet}`)

  await waitForEvent(t, c.wasmChain.Name, wasmHeight, 'recv_packet', (events: any) => {
    const e = events.find((e: any) => e.recv_packet).recv_packet
    t.assert(e)
    t.assert(JSON.parse(e.packet_data).message.m === msg)
    t.assert(e.packet_src_channel === c.polyChannel.channel_id)
    t.assert(e.packet_dst_channel === c.polyChannel.counterparty.channel_id)
    t.assert(e.packet_src_port === c.polyChannel.port_id)
    t.assert(e.packet_dst_port === c.polyChannel.counterparty.port_id)
    return true
  })

  await waitForEvent(t, c.eth1Chain.Name + ':main', evmHeight, 'Acknowledgement', (events: any) => {
    const e = events.find((e: any) => e.Acknowledgement).Acknowledgement
    t.assert(e)
    t.assert(e.sourcePortAddress === c.receiver.Address)
    t.assert(e.sourceChannelId === c.polyChannel.channel_id)
    t.assert(e.sequence === ethers.BigNumber.from(sendPacketSequence).toString())
    return true
  })
}

// Test the following sequence
//  - Call the wasm contract running on wasm
//  - Expect the ibc relayer to relay it polymer
//  - Expect the vibc relayer to relay it to ethereum
//  - Receive the message on ethereum
async function testMessagesFromWasmToEth(t: any, c: any) {
  const evmHeight = await latestEvmHeight(c.eth1Chain.Nodes[0].RpcHost)
  const wasmHeight = await latestCosmosHeight(c.wasmChain.Nodes[0].RpcHost)

  const msg = JSON.stringify({
    send_msg: {
      channel_id: c.wasmChannel.channel_id,
      msg: `Hello from WASM, iteration ${c.iteration}`
    }
  })

  const cmds = ['wasm', 'wasmd', 'tx', 'wasm', 'execute', c.wasmAddress, msg]
  cmds.push(...['--', '--gas', 'auto', '--gas-adjustment', '1.2', '--output', 'json'])
  cmds.push(...['--yes', '--from', c.wasmAccount.Address, '--keyring-backend', 'test'])
  cmds.push(...['--chain-id', c.wasmChain.Name])

  log.info('Sending message from WASM to ETH...')
  const out = await runCommand(t, 'exec', ...cmds)
  t.assert(out.exitCode === 0)

  await waitForEvent(t, c.eth1Chain.Name + ':main', evmHeight, 'RecvPacket', (events: any) => {
    const e = events.find((e: any) => e.RecvPacket).RecvPacket
    t.assert(e)
    t.assert(e.destChannelId === c.wasmChannel.counterparty.channel_id)
    t.assert(e.destPortAddress === c.receiver.Address)
    t.assert(e.sequence === '1')
    return true
  })

  await waitForEvent(t, c.wasmChain.Name, wasmHeight, 'acknowledge_packet', (events: any) => {
    const e = events.find((e: any) => e.acknowledge_packet).acknowledge_packet
    t.assert(e)
    t.assert(e.packet_dst_channel === c.polyChannel.channel_id)
    t.assert(e.packet_src_channel === c.polyChannel.counterparty.channel_id)
    t.assert(e.packet_dst_port === c.polyChannel.port_id)
    t.assert(e.packet_src_port === c.polyChannel.counterparty.port_id)

    const w = events.find((e: any) => e.wasm).wasm
    t.assert(w)
    t.assert(w.reply === 'got the message')
    return true
  })
}
