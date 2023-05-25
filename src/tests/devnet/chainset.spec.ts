import anyTest, { TestFn } from 'ava'
import { ethers } from 'ethers'
import os from 'os'
import { utils } from '../../lib'
import { RunningChainSets, runChainSets, cleanupChainSets } from '../../lib/dev/chainset'
import { ChainConfig, ImageLabelTypes } from '../../lib/dev/schemas'

const test = anyTest as TestFn<{
  logger: utils.Logger
}>

test.before((t) => {
  const logLevel: any = process.env.TEST_LOG_LEVEL ?? 'debug'
  const logger = utils.createLogger({ Level: logLevel })
  t.context = { logger }
})

function is(x: ChainConfig[][], y: string[][]): boolean {
  if (x.length !== y.length) return false
  for (let i = 0; i < x.length; i++) {
    const got = x[i]
    const exp = y[i]
    if (got.length !== exp.length) return false
    if (got.find((g) => !exp.includes(g.Name))) return false
  }
  return true
}

test('no dependency', async (t) => {
  const baseConfig = `
ChainSets:
  - Name: B
  - Name: A
`
  const config = utils.readYamlText(baseConfig)
  const tree = new RunningChainSets(config, os.tmpdir(), t.context.logger).resolveDependencies()
  t.assert(is(tree, [['A', 'B']]))
})

test('simple dependency', async (t) => {
  // A -> B
  const baseConfig = `
ChainSets:
  - Name: B
    DependsOn: A
  - Name: A
`
  const config = utils.readYamlText(baseConfig)
  const tree = new RunningChainSets(config, os.tmpdir(), t.context.logger).resolveDependencies()
  t.assert(is(tree, [['A'], ['B']]))
})

test('simple dependency backwards', async (t) => {
  // A -> B
  const baseConfig = `
ChainSets:
  - Name: A
  - Name: B
    DependsOn: A
`
  const config = utils.readYamlText(baseConfig)
  const tree = new RunningChainSets(config, os.tmpdir(), t.context.logger).resolveDependencies()
  t.assert(is(tree, [['A'], ['B']]))
})

test('double dependency', async (t) => {
  // A -> B -> C
  const baseConfig = `
ChainSets:
  - Name: B
    DependsOn: A
  - Name: C
    DependsOn: B
  - Name: A
`
  const config = utils.readYamlText(baseConfig)
  const tree = new RunningChainSets(config, os.tmpdir(), t.context.logger).resolveDependencies()
  t.assert(is(tree, [['A'], ['B'], ['C']]))
})

test('triple dependency', async (t) => {
  // A -> B -> D
  //  `-> C
  const baseConfig = `
ChainSets:
  - Name: D
    DependsOn: B
  - Name: B
    DependsOn: A
  - Name: C
    DependsOn: A
  - Name: A
`
  const config = utils.readYamlText(baseConfig)
  const tree = new RunningChainSets(config, os.tmpdir(), t.context.logger).resolveDependencies()
  t.assert(is(tree, [['A'], ['B', 'C'], ['D']]))
})

test('messed up dependency', async (t) => {
  // A -> B -> C
  // D -> E -> F
  const baseConfig = `
ChainSets:
  - Name: A
  - Name: D
  - Name: B
    DependsOn: A
  - Name: C
    DependsOn: B
  - Name: E
    DependsOn: D
  - Name: F
    DependsOn: E
`
  const config = utils.readYamlText(baseConfig)
  const tree = new RunningChainSets(config, os.tmpdir(), t.context.logger).resolveDependencies()
  t.assert(
    is(tree, [
      ['A', 'D'],
      ['B', 'E'],
      ['C', 'F']
    ])
  )
})

test('exercise a merge of branches', async (t) => {
  // D -> E -> F
  const baseConfig = `
ChainSets:
  - Name: D
  - Name: F
    DependsOn: E
  - Name: E
    DependsOn: D
`
  // after the first two rules, the tree would look like this: nil -> D,  E -> F
  // so by the time it gets to link D -> E it's gotta merge the current two branches into one
  const config = utils.readYamlText(baseConfig)
  const tree = new RunningChainSets(config, os.tmpdir(), t.context.logger).resolveDependencies()
  t.assert(is(tree, [['D'], ['E'], ['F']]))
})

test('circular dependency', async (t) => {
  // A -> B
  // B -> A
  const baseConfig = `
ChainSets:
  - Name: B
    DependsOn: A
  - Name: A
    DependsOn: B
`
  const config = utils.readYamlText(baseConfig)
  const err = t.throws(() => new RunningChainSets(config, os.tmpdir(), t.context.logger).resolveDependencies())
  t.is(err?.message, 'Circular dependency')
})

test('larger circular dependency', async (t) => {
  // A -> B
  // B -> C
  // C -> A
  const baseConfig = `
ChainSets:
  - Name: A
    DependsOn: B
  - Name: B
    DependsOn: C
  - Name: C
    DependsOn: A
`
  const config = utils.readYamlText(baseConfig)
  const err = t.throws(() => new RunningChainSets(config, os.tmpdir(), t.context.logger).resolveDependencies())
  t.is(err?.message, 'Circular dependency')
})

test('unknown depends on chain', async (t) => {
  const baseConfig = `
ChainSets:
  - Name: A
    DependsOn: B
`
  const config = utils.readYamlText(baseConfig)
  const err = t.throws(() => new RunningChainSets(config, os.tmpdir(), t.context.logger).resolveDependencies())
  t.is(err?.message, 'Unknown chain id B')
})

test('start eth node with labels and dependencies', async (t) => {
  const baseConfig = `
ChainSets:
  - Name: "eth"
    Type: "ethereum"
    Images:
      - Repository: "ethereum/client-go"
        Tag: "v1.10.26"
        Bin: "geth"
    Accounts:
      Mnemonic: "develop test test test test only develop test test test test only"
      Count: 1
  - Name: "prysm"
    Type: "ethereum2"
    DependsOn: "eth"
    Images:
      - Label: "main"
        Repository: "ghcr.io/polymerdao/prysm-beacon-chain"
        Tag: "polymer-v0.0.1-debug"
        Bin: "/app/cmd/beacon-chain/beacon-chain.runfiles/prysm/cmd/beacon-chain/beacon-chain_/beacon-chain"
      - Label: "genesis"
        Repository: "ghcr.io/polymerdao/prysmctl"
        Tag: "polymer-v0.0.1-debug"
        Bin: "/app/cmd/prysmctl/prysmctl.runfiles/prysm/cmd/prysmctl/prysmctl_/prysmctl"
      - Label: "validator"
        Repository: "ghcr.io/polymerdao/prysm-validator"
        Tag: "polymer-v0.0.1-debug"
        Bin: "/app/cmd/validator/validator.runfiles/prysm/cmd/validator/validator_/validator"
Run:
  WorkingDir: "/tmp/test-chainsets/run-*"
  CleanupMode: all
  Logger:
    Level: debug
    Transports: log
`
  const config = utils.readYamlText(baseConfig)
  const runtime = await runChainSets(config, t.context.logger)
  t.truthy(runtime)

  t.assert(runtime.runObj.ChainSets.length === 2)
  const eth = runtime.runObj.ChainSets[0]
  t.is(eth.Name, 'eth')

  const prysm = runtime.runObj.ChainSets[1]
  t.is(prysm.Name, 'prysm')
  t.is(prysm.Images[0].Label, ImageLabelTypes.Main)
  t.is(prysm.Nodes[0].Label, ImageLabelTypes.Main.toString())
  t.is(prysm.Images[1].Label, ImageLabelTypes.Genesis)
  t.is(prysm.Nodes[1].Label, ImageLabelTypes.Genesis.toString())
  t.is(prysm.Images[2].Label, ImageLabelTypes.Validator)
  t.is(prysm.Nodes[2].Label, ImageLabelTypes.Validator.toString())

  const provider = new ethers.providers.JsonRpcProvider(eth.Nodes[0].RpcHost)
  const wallet = new ethers.Wallet(eth.Accounts![0]['PrivateKey']).connect(provider)

  const receipt = await wallet.sendTransaction({
    to: eth.Accounts![0].Address,
    from: eth.Accounts![0].Address,
    data: '0x0bad'
  })
  const tx = await provider.getTransaction(receipt.hash)
  t.truthy(tx)

  cleanupChainSets(runtime.runObj)
})
