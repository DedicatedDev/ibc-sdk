import anyTest, { TestFn } from 'ava'
import { ethers } from 'ethers'
import { utils } from '../../lib'
import { ProcessOutput } from 'zx-cjs'
import { ChainConfig, RelayerRunObj, CosmosAccount, EvmChainSet } from '../../lib/schemas'
import { fs, path, $, getTestingLogger } from '../../lib/utils'

const log = getTestingLogger()

const test = anyTest as TestFn<{
  workspace: string
  cli: string
}>

test.before((t) => {
  t.context.cli = path.resolve(__dirname, '..', '..', '..', 'bin', 'ibctl')
  $.verbose = true
  process.env.TEST_LOG_LEVEL = 'verbose'
  t.context.workspace = process.env.TEST_IBCTL_WORKSPACE ?? fs.mkdtempSync(path.join('/tmp', 'ibctl-tests-'))
})

test.after.always(async (t) => {
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

async function waitForEvent(t: any, chainName: string, eventName: string, cb: (e: any) => boolean) {
  log.info(`querying event '${eventName}' from ${chainName}`)
  await utils.waitUntil(
    async () => {
      const out = await runCommand(t, 'events', chainName, '--json', '--extended')
      t.assert(out.exitCode === 0)
      const events = JSON.parse(out.stdout.trim())
      const event = events.find((e: any) => e.events[eventName])
      if (!event) return false
      log.info(`got event from ${chainName}: ${JSON.stringify(event)}`)
      return cb(event.events)
    },
    10,
    6_000
  )
}

test('cli end to end: eth <-> polymer <-> wasm', async (t) => {
  t.assert((await runCommand(t, 'init')).exitCode === 0)
  t.assert((await runCommand(t, 'start', '-c', 'wasm:polymer', '-c', 'polymer:eth-execution')).exitCode === 0)

  let runtime = JSON.parse(fs.readFileSync(path.join(t.context.workspace, 'run', 'run.json'), 'utf-8'))
  t.assert(runtime)

  let eth1Chain: EvmChainSet = runtime.ChainSets.find((c: ChainConfig) => c.Name === 'eth-execution')
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
  const out = await runCommand(t, 'deploy', 'wasm', wasmAccount.Address, wasm)
  t.assert(out.exitCode === 0)
  const wasmAddress = out.stdout.trim()
  t.assert(wasmAddress.startsWith('wasm'))

  // deploy evm contract
  const marsPath = path.join(t.context.workspace, 'vibc-core-smart-contracts', 'Mars.sol', 'Mars.json')
  t.assert(fs.existsSync(marsPath))
  const out1 = await runCommand(t, 'deploy', 'eth-execution', eth1Account.Address, marsPath)
  t.assert(out1.exitCode === 0)

  runtime = JSON.parse(fs.readFileSync(path.join(t.context.workspace, 'run', 'run.json'), 'utf-8'))
  t.assert(runtime)
  eth1Chain = runtime.ChainSets.find((c: ChainConfig) => c.Name === 'eth-execution')
  t.assert(eth1Chain)

  const mars = eth1Chain.Contracts.find((c: any) => c.Name === 'Mars')
  t.assert(mars)

  // check there's no channels after chains are started
  t.deepEqual((await getChannelsFrom(t, 'polymer')).channels, [])
  t.deepEqual((await getChannelsFrom(t, 'wasm')).channels, [])

  const out2 = await runCommand(
    t,
    'channel',
    'eth-execution:' + mars!.Address + ':1.0',
    'wasm:' + wasmAddress + ':polymer-demo-v1'
  )
  t.assert(out2.exitCode === 0)

  // check the channels have been correctly created
  const polyChannel = await getChannelsFrom(t, 'polymer')
  const wasmChannel = await getChannelsFrom(t, 'wasm')

  t.assert(polyChannel.channels.length === 1)
  t.assert(wasmChannel.channels.length === 1)

  t.assert(polyChannel.channels[0].channel_id === wasmChannel.channels[0].counterparty.channel_id)
  t.assert(wasmChannel.channels[0].channel_id === polyChannel.channels[0].counterparty.channel_id)

  t.assert(polyChannel.channels[0].state === 'STATE_OPEN')
  t.assert(wasmChannel.channels[0].state === 'STATE_OPEN')

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
  await runCommand(t, 'logs', 'eth-exec', '-n', '5')
})

async function testTracePackets(t: any, c: any) {
  // TODO: endpoint will throw an invalid port error otherwise
  const portid = c.wasmChannel.channels[0].port_id.replace(/^wasm\./, '')
  const endpointA = `${c.wasmChain.Name}:${c.wasmChannel.channels[0].channel_id}:${portid}`
  const endpointB = `polymer:${c.polyChannel.channels[0].channel_id}:${c.polyChannel.channels[0].port_id}`

  const out = await runCommand(t, 'trace-packets', '--json', endpointA, endpointB)
  t.assert(out.exitCode === 0)
  const packets = JSON.parse(out.stdout.trim())

  // TODO: this should say "2 packets were received"
  t.assert(packets.length === 1)
  t.assert(packets.filter((p: any) => p.state === 'received').length === packets.length)
}

// Test the following sequence
//  - Call sendIbcPacket() on the vIBC contract running on ethereum
//  - Expect the eth relayer to relay it polymer
//  - Expect the ibc relayer to relay it to wasm
//  - Receive the message on wasm
async function testMessagesFromEthToWasm(t: any, c: any) {
  const provider = new ethers.providers.JsonRpcProvider(c.eth1Chain.Nodes[0].RpcHost)
  const signer = new ethers.Wallet(c.eth1Account.PrivateKey).connect(provider)

  log.info('Sending message from ETH to WASM...')
  const receiver = new ethers.Contract(c.receiver.Address, c.receiver.Abi, signer)
  const response = await receiver.greet(
    c.dispatcher.Address,
    JSON.stringify({ message: { m: 'Hello from ETH' } }),
    ethers.utils.formatBytes32String(c.polyChannel.channels[0].channel_id),
    ((Date.now() + 60 * 60 * 1000) * 1_000_000).toString(),
    0
  )
  // Get the sequence number from the emitted SendPacket event
  const receipt = await response.wait()
  const iface = new ethers.utils.Interface(c.dispatcher.Abi)
  const parsed = iface.parseLog(receipt.logs[0])
  const [_sourcePortAddress, _sourceChannelId, _packet, sendPacketSequence, _timeout, _fee] = parsed.args

  await waitForEvent(t, c.wasmChain.Name, 'recv_packet', (events: any) => {
    const e = events.recv_packet
    t.assert(e)
    t.assert(JSON.parse(e.packet_data).message.m === 'Hello from ETH')
    t.assert(e.packet_src_channel === c.polyChannel.channels[0].channel_id)
    t.assert(e.packet_dst_channel === c.polyChannel.channels[0].counterparty.channel_id)
    t.assert(e.packet_src_port === c.polyChannel.channels[0].port_id)
    t.assert(e.packet_dst_port === c.polyChannel.channels[0].counterparty.port_id)
    return true
  })

  await waitForEvent(t, c.eth1Chain.Name, 'Acknowledgement', (events: any) => {
    const e = events.Acknowledgement
    t.assert(e)
    t.assert(JSON.parse(e.AckPacket.data).ok.reply === 'Got the message!')
    t.assert(e.AckPacket.success === true)
    t.assert(e.sourcePortAddress === c.receiver.Address)
    t.assert(e.sourceChannelId === c.polyChannel.channels[0].channel_id)
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
  const msg = JSON.stringify({
    send_msg: {
      channel_id: c.wasmChannel.channels[0].channel_id,
      msg: 'Hello from WASM'
    }
  })

  const cmds = ['wasm', 'wasmd', 'tx', 'wasm', 'execute', c.wasmAddress, msg]
  cmds.push(...['--', '--gas', 'auto', '--gas-adjustment', '1.2', '--output', 'json'])
  cmds.push(...['--yes', '--from', c.wasmAccount.Address, '--keyring-backend', 'test'])
  cmds.push(...['--chain-id', c.wasmChain.Name])

  log.info('Sending message from WASM to ETH...')
  const out = await runCommand(t, 'exec', ...cmds)
  t.assert(out.exitCode === 0)

  await waitForEvent(t, c.eth1Chain.Name, 'RecvPacket', (events: any) => {
    const e = events.RecvPacket
    t.assert(e)
    t.assert(e.srcChannelId === c.wasmChannel.channels[0].channel_id)
    t.assert(e.destChannelId === c.wasmChannel.channels[0].counterparty.channel_id)
    t.assert(e.srcPortId === c.wasmChannel.channels[0].port_id)
    t.assert(e.destPortAddress === c.receiver.Address)
    t.assert(e.sequence === '1')
    return true
  })

  await waitForEvent(t, c.wasmChain.Name, 'acknowledge_packet', (events: any) => {
    const e = events.acknowledge_packet
    t.assert(e)
    t.assert(e.packet_dst_channel === c.polyChannel.channels[0].channel_id)
    t.assert(e.packet_src_channel === c.polyChannel.channels[0].counterparty.channel_id)
    t.assert(e.packet_dst_port === c.polyChannel.channels[0].port_id)
    t.assert(e.packet_src_port === c.polyChannel.channels[0].counterparty.port_id)
    t.assert(events.wasm.reply === 'got the message')
    return true
  })
}
