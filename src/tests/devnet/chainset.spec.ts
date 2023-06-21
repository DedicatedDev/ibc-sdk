import { ethers } from 'ethers'
import os from 'os'
import { newJsonRpcProvider, utils } from '../../lib'
import { RunningChainSets, runChainSets } from '../../lib/chainset'
import { ChainConfig, ImageLabelTypes } from '../../lib/schemas'
import { gethConfig } from './simple_geth_config'
import { getTestingLogger } from '../../lib/utils/logger'
import { cleanupRuntime, getWorkspace, runtimeTest } from './test_utils'

getTestingLogger()

const test = runtimeTest

test.afterEach.always(async (t) => {
  await cleanupRuntime(t)
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
  const tree = new RunningChainSets(config, os.tmpdir()).resolveDependencies()
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
  const tree = new RunningChainSets(config, os.tmpdir()).resolveDependencies()
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
  const tree = new RunningChainSets(config, os.tmpdir()).resolveDependencies()
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
  const tree = new RunningChainSets(config, os.tmpdir()).resolveDependencies()
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
  const tree = new RunningChainSets(config, os.tmpdir()).resolveDependencies()
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
  const tree = new RunningChainSets(config, os.tmpdir()).resolveDependencies()
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
  const tree = new RunningChainSets(config, os.tmpdir()).resolveDependencies()
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
  const err = t.throws(() => new RunningChainSets(config, os.tmpdir()).resolveDependencies())
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
  const err = t.throws(() => new RunningChainSets(config, os.tmpdir()).resolveDependencies())
  t.is(err?.message, 'Circular dependency')
})

test('unknown depends on chain', async (t) => {
  const baseConfig = `
ChainSets:
  - Name: A
    DependsOn: B
`
  const config = utils.readYamlText(baseConfig)
  const err = t.throws(() => new RunningChainSets(config, os.tmpdir()).resolveDependencies())
  t.is(err?.message, 'Unknown chain id B')
})

test('start eth node with labels and dependencies', async (t) => {
  const config = utils.readYamlText(gethConfig)
  config.ChainSets = config.ChainSets.filter((c: any) => c.Type !== 'bsc')
  const runtime = await runChainSets(config, getWorkspace('chainset-test'))
  t.context.runtime = runtime.runObj
  t.truthy(runtime)

  t.assert(runtime.runObj.ChainSets.length === 2)
  const eth = runtime.runObj.ChainSets[0]
  t.is(eth.Name, 'eth')
  t.is(eth.Images[0].Label, ImageLabelTypes.Main)
  t.is(eth.Nodes[0].Label, ImageLabelTypes.Main.toString())

  const prysm = runtime.runObj.ChainSets[1]
  t.is(prysm.Name, 'eth2')
  t.is(prysm.Images[0].Label, ImageLabelTypes.Main)
  t.is(prysm.Images[1].Label, ImageLabelTypes.Genesis)
  t.is(prysm.Images[2].Label, ImageLabelTypes.Validator)
  t.is(prysm.Nodes[0].Label, ImageLabelTypes.Main.toString())
  t.is(prysm.Nodes[1].Label, ImageLabelTypes.Validator.toString())

  const provider = newJsonRpcProvider(eth.Nodes[0].RpcHost)
  const wallet = new ethers.Wallet(eth.Accounts![0]['PrivateKey']).connect(provider)

  const receipt = await wallet.sendTransaction({
    to: eth.Accounts![0].Address,
    from: eth.Accounts![0].Address,
    data: '0x0bad'
  })
  const tx = await provider.getTransaction(receipt.hash)
  t.truthy(tx)
})
