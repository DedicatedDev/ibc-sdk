import { logs } from '@cosmjs/stargate'
import { Tendermint37Client } from '@cosmjs/tendermint-rpc'
import anyTest, { TestFn } from 'ava'
import { ethers } from 'ethers'
import { ProcessOutput } from 'zx-cjs'
import { utils } from '../../lib'
import { ChainConfig, RelayerRunObj, CosmosAccount } from '../../lib/dev/schemas'
import { fs, path, $ } from '../../lib/utils'

const test = anyTest as TestFn<{
  workspace: string
  cli: string
}>

test.before(async (t) => {
  t.context.cli = path.resolve(__dirname, '..', '..', '..', 'bin', 'ibctl')
  $.verbose = true
  process.env.TEST_LOG_LEVEL = 'verbose'
})

test.beforeEach((t) => {
  // Run tests on different workspaces every time since docker will not like
  // directories to be removed while these are mapped out as volumes.
  t.context.workspace = fs.mkdtempSync(path.join('/tmp', 'ibctl-tests-'))
})

async function runCommand(t: any, ...args: string[]): Promise<ProcessOutput> {
  const cmds = [t.context.cli, '-l', process.env.TEST_LOG_LEVEL, '-w', t.context.workspace, ...args]
  return await $`${cmds}`
}

async function getChannelsFrom(t: any, chain: string) {
  const out = await runCommand(t, 'channels', chain)
  return utils.readYamlText(out.stdout.trim())
}

test('cli end to end: eth <-> polymer <-> wasm', async (t) => {
  t.assert((await runCommand(t, 'init')).exitCode === 0)
  t.assert(
    (await runCommand(t, 'start', '-c', 'wasm-0:polymer-0', '-c', 'polymer-0:eth-exec-0', '-c', 'eth-exec-0:polymer-0'))
      .exitCode === 0
  )

  // deploy wasm contract
  const wasm = path.resolve(__dirname, '..', '..', '..', 'src', 'tests', 'devnet', 'demo.wasm')
  t.assert(fs.existsSync(wasm))
  const out = await runCommand(t, 'deploy', 'wasm-0', wasm)
  t.assert(out.exitCode === 0)
  const wasmAddress = out.stdout.trim()
  t.assert(wasmAddress.startsWith('wasm'))

  // check there's no channels after chains are started
  t.deepEqual((await getChannelsFrom(t, 'polymer-0')).channels, [])
  t.deepEqual((await getChannelsFrom(t, 'wasm-0')).channels, [])

  t.assert((await runCommand(t, 'channel', 'eth-exec-0', 'wasm-0', '--dst-address', wasmAddress)).exitCode === 0)

  // check the channels have been correctly created
  const polyChannel = await getChannelsFrom(t, 'polymer-0')
  const wasmChannel = await getChannelsFrom(t, 'wasm-0')

  t.assert(polyChannel.channels.length === 1)
  t.assert(wasmChannel.channels.length === 1)

  t.assert(polyChannel.channels[0].channel_id === wasmChannel.channels[0].counterparty.channel_id)
  t.assert(wasmChannel.channels[0].channel_id === polyChannel.channels[0].counterparty.channel_id)

  t.assert(polyChannel.channels[0].state === 'STATE_OPEN')
  t.assert(wasmChannel.channels[0].state === 'STATE_OPEN')

  const runtime = JSON.parse(fs.readFileSync(path.join(t.context.workspace, 'run', 'run.json'), 'utf-8'))
  t.assert(runtime)

  const vibcRelayer = runtime.Relayers.find((r: RelayerRunObj) => r.Name === 'vibc-relayer')
  t.assert(vibcRelayer)

  const eth1Chain = runtime.ChainSets.find((c: ChainConfig) => c.Name === 'eth-exec-0')
  t.assert(eth1Chain)

  const eth1Account = eth1Chain.Accounts[0]
  t.assert(eth1Account)

  const wasmChain = runtime.ChainSets.find((c: ChainConfig) => c.Name === 'wasm-0')
  t.assert(wasmChain)

  const wasmAccount = wasmChain.Accounts.find((a: CosmosAccount) => a.Name === 'relayer')
  t.assert(wasmAccount)

  // test sending messages from WASM to ETH
  const dispatcherAddr = vibcRelayer.Configuration.chains['eth-exec-0'].dispatcher.address

  // TODO: we can deploy our own SC that uses the dispatcher. That would test a more realistic scenario
  const dispatcher = JSON.parse(
    fs.readFileSync(
      path.join(t.context.workspace, 'polycore-smart-contracts', 'Dispatcher.sol', 'Dispatcher.json'),
      'utf-8'
    )
  )

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
    ethContractAbi: dispatcher.abi,
    ethContractAddr: dispatcherAddr
  }

  await testMessagesFromWasmToEth(t, config)
  await testMessagesFromEthToWasm(t, config)

  await runCommand(t, 'logs', 'polymer', '-n', '5')
  await runCommand(t, 'logs', 'wasm', '-n', '5')
  await runCommand(t, 'logs', 'eth-exec', '-n', '5')

  t.assert(await runCommand(t, 'stop'))
})

async function testMessagesFromEthToWasm(t: any, c: any) {
  const provider = new ethers.providers.JsonRpcProvider(c.eth1Chain.Nodes[0].RpcHost)
  const signer = new ethers.Wallet(c.eth1Account.PrivateKey).connect(provider)
  const contract = new ethers.Contract(c.ethContractAddr, c.ethContractAbi, signer)

  const res = await contract.sendIbcPacket(
    ethers.utils.formatBytes32String(c.polyChannel.channels[0].channel_id),
    ethers.utils.toUtf8Bytes(JSON.stringify({ message: { m: 'Hello from ETH' } })),
    ((Date.now() + 60 * 60 * 1000) * 1_000_000).toString()
  )
  t.truthy(res)

  const client = await Tendermint37Client.connect(c.wasmChain.Nodes[0].RpcHost)

  let h = 1
  t.assert(
    await utils.waitUntil(
      async () => {
        const query = `recv_packet.packet_sequence EXISTS AND tx.height>=${h}`
        const result = await client.txSearchAll({ query: query })
        const events: any[] = []

        result.txs.map(({ height, result }) => {
          h = Math.max(height, h)
          const rawLogs = logs.parseRawLog(result.log)
          for (const log of rawLogs) {
            log.events.forEach((e) => {
              if (e.type !== 'recv_packet') return
              const kv: any = {}
              e.attributes.forEach((e) => (kv[e.key] = e.value))
              events.push(kv)
            })
          }
        })
        h++
        if (events.length === 0) return false
        const kv = events[0]
        console.log(`got event from WASM: ${JSON.stringify(kv)}`)
        const msg = JSON.parse(kv.packet_data)
        t.assert(msg.message.m === 'Hello from ETH')
        t.assert(kv.packet_src_channel === c.polyChannel.channels[0].channel_id)
        t.assert(kv.packet_dst_channel === c.polyChannel.channels[0].counterparty.channel_id)
        t.assert(kv.packet_src_port === c.polyChannel.channels[0].port_id)
        t.assert(kv.packet_dst_port === c.polyChannel.channels[0].counterparty.port_id)
        return true
      },
      20,
      10_000
    )
  )
}

async function testMessagesFromWasmToEth(t: any, c: any) {
  const msg = JSON.stringify({
    send_msgs: {
      channel_id: c.wasmChannel.channels[0].channel_id,
      msg: 'Hello from WASM'
    }
  })

  const cmds = ['wasm-0', 'wasmd', 'tx', 'wasm', 'execute', c.wasmAddress, msg]
  cmds.push(...['--', '--gas', 'auto', '--gas-adjustment', '1.2', '--output', 'json'])
  cmds.push(...['--yes', '--from', c.wasmAccount.Address, '--keyring-backend', 'test'])
  cmds.push(...['--chain-id', c.wasmChain.Name])

  const out = await runCommand(t, 'exec', ...cmds)
  t.assert(out.exitCode === 0)

  const provider = new ethers.providers.JsonRpcProvider(c.eth1Chain.Nodes[0].RpcHost)
  const contract = new ethers.Contract(c.ethContractAddr, c.ethContractAbi, provider)
  t.assert(
    await utils.waitUntil(
      async () => {
        const result = await contract.queryFilter('OnRecvPacket')
        const event = result[0]
        if (!event) return false

        console.log(`got event from ETH: ${JSON.stringify(event)}`)
        const [srcChannelId, srcPortId, dstChannelId, dstPortId, data] = event.args!
        const msg = JSON.parse(ethers.utils.toUtf8String(data))
        t.assert(msg.message.m === 'Hello from WASM')
        t.assert(ethers.utils.parseBytes32String(srcChannelId) === c.wasmChannel.channels[0].channel_id)
        t.assert(ethers.utils.parseBytes32String(dstChannelId) === c.wasmChannel.channels[0].counterparty.channel_id)
        t.assert(srcPortId === c.wasmChannel.channels[0].port_id)
        t.assert(dstPortId === c.wasmChannel.channels[0].counterparty.port_id)
        return true
      },
      20,
      10_000
    )
  )
}
