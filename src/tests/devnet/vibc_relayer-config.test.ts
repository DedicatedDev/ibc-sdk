import * as utils from '../../lib/utils/index.js'
import * as self from '../../lib/index.js'
import anyTest, { TestFn } from 'ava'

const test = anyTest as TestFn<{
  logger: self.utils.Logger
  relayer: self.dev.vibcRelayer.VIBCRelayer
  config: any
  run: any
}>

test.before(async (t) => {
  const logLevel: any = process.env.TEST_LOG_LEVEL ?? 'verbose'
  t.context.logger = utils.createLogger({ Level: logLevel, Colorize: true })
  t.context.relayer = await self.dev.vibcRelayer.VIBCRelayer.create('/tmp', t.context.logger)
})

test.beforeEach(async (t) => {
  t.context.config = utils.readYaml(`# this is a comment
global:
    polling-idle-time: 10000

chains:
    bsc-4:
        chain-type: evm
        rpc-url: http://bsc.org:1234
        account-prefix: unsetPrefix
        dispatcher:
          address: '0x338fE7f3844408fe50EF618d0DBC3C74203326F0'
          abi: '[]'
        account:
          Address: '0x50c1389FfDf0fc0c27BAC88EcFD7046A5343c79A'
          PrivateKey: '0xbaeb0652f541c24abdf69216fec5136bda1a013dea71ab24bb3b477143efa9ef'
          Balance: 1000

    polymer-2:
        chain-type: cosmos
        rpc-url: http://api.polymerdao.org:80
        account-prefix: polymer
        account:
          Name: 'alice'
          Address: 'polymer1lmm335gqcs82uearjcyt866756h6vae5qy8w9l'
          Coins: ["1000000000000000000stake"]
paths:
    bsc-4-polymer-2:
        src:
            chain-id: bsc-4
            client-id: client-id-src
        dst:
            chain-id: polymer-2
            client-id: client-id-dst
        src-channel-filter: # TODO
`)

  t.context.run = {
    ChainSets: [
      {
        Name: 'polymer-2',
        Type: 'cosmos',
        Prefix: 'polymer',
        Images: [
          {
            Repository: 'ghcr.io/polymerdao/polymer',
            Tag: 'latest',
            Bin: 'polymerd'
          }
        ],
        Nodes: [
          {
            RpcContainer: 'http://api.polymerdao.org:80',
            RpcHost: 'http://host.api.polymerdao.org:80'
          }
        ],
        Accounts: [
          {
            Name: 'alice',
            Address: 'polymer1lmm335gqcs82uearjcyt866756h6vae5qy8w9l',
            Coins: ['1000000000000000000stake']
          }
        ]
      },
      {
        Name: 'bsc-4',
        Type: 'bsc',
        Images: [
          {
            Repository: 'ghcr.io/polymerdao/bsc',
            Tag: '1.1.10',
            Bin: 'geth'
          }
        ],
        Nodes: [
          {
            RpcContainer: 'http://bsc.org:1234',
            RpcHost: 'http://host.bsc.org:1234'
          }
        ],
        Accounts: [
          {
            Address: '0x50c1389FfDf0fc0c27BAC88EcFD7046A5343c79A',
            PrivateKey: '0xbaeb0652f541c24abdf69216fec5136bda1a013dea71ab24bb3b477143efa9ef',
            Balance: 1000
          }
        ]
      }
    ],
    Run: {
      WorkingDir: '/tmp/test-chainsets/run-20230009135905-dl0jal3zgeh',
      CleanupMode: 'reuse'
    }
  }
})

test('vibc-relayer parses valid config', async (t) => {
  const got = await t.context.relayer.setup(t.context.config)
  t.assert(got.exitCode === 0)

  const out = await t.context.relayer.getConfig()

  t.deepEqual(JSON.parse(out.stdout), t.context.config)
})

test('vibc-relayer validates all src paths refer to chain ids in the chain set', async (t) => {
  t.context.config.paths['bsc-4-polymer-2'].src['chain-id'] = 'foo-1'
  const got = await t.context.relayer.setup(t.context.config)

  t.assert(got.exitCode === 1)
  const err = "Undefined chain ID 'foo-1' used in 'paths.bsc-4-polymer-2.src.chain-id'"
  t.assert(got.stderr.includes(err))
})

test('vibc-relayer validates all dst paths refer to chain ids in the chain set', async (t) => {
  t.context.config.paths['bsc-4-polymer-2'].dst['chain-id'] = 'foo-1'
  const got = await t.context.relayer.setup(t.context.config)

  t.assert(got.exitCode === 1)
  const err = "Undefined chain ID 'foo-1' used in 'paths.bsc-4-polymer-2.dst.chain-id'"
  t.assert(got.stderr.includes(err))
})

test('vibc-relayer validates dst and src paths are different type', async (t) => {
  t.context.config.chains['bsc-4']['chain-type'] = t.context.config.chains['polymer-2']['chain-type']
  const got = await t.context.relayer.setup(t.context.config)

  t.assert(got.exitCode === 1)
  const err = "Path 'bsc-4-polymer-2' src and dst of same type: 'cosmos'"
  t.assert(got.stderr.includes(err))
})

test('vibc-relayer validates dispatcher contract chain ids', (t) => {
  const error = t.throws(() => t.context.relayer.config(t.context.run, [['bsc-4', 'polymer-2']]))
  t.is(error?.message, 'Invalid dispatcher contract configuration: unknown chain foo')
})

test('vibc-relayer produces config from runObj', async (t) => {
  t.context.run.ChainSets[1].Contracts = [{ Address: '0x338fE7f3844408fe50EF618d0DBC3C74203326F0', Abi: '[]' }]

  const config = t.context.relayer.config(t.context.run, [['bsc-4', 'polymer-2']])
  const got = await t.context.relayer.setup(config)
  t.assert(got.exitCode === 0)

  const out = await t.context.relayer.getConfig()
  t.deepEqual(JSON.parse(out.stdout), t.context.config)
})
