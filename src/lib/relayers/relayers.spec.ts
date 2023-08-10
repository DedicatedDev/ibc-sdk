import test from 'ava'
import * as relayers from '../relayers'
import { ChainSetsRunObj } from '../schemas'

function checkPaths(t: any, got: any, vibc: string[][], ibc: string[][], eth2: string[][]) {
  t.assert(got.vibc.length === vibc.length)
  t.deepEqual(vibc.sort(), got.vibc.sort())
  t.assert(got.ibc.length === ibc.length)
  t.deepEqual(ibc.sort(), got.ibc.sort())
  t.assert(got.eth2.length === eth2.length)
  t.deepEqual(eth2.sort(), got.eth2.sort())
}

const runWithVchains = {
  ChainSets: [
    {
      Name: 'poly',
      Type: 'polymer'
    },
    {
      Name: 'bsc',
      Type: 'bsc'
    },
    {
      Name: 'eth',
      Type: 'ethereum'
    },
    {
      Name: 'prysm',
      Type: 'ethereum2'
    }
  ]
}

test('configure empty paths with virtual chains', (t) => {
  const got = relayers.configurePaths(runWithVchains as ChainSetsRunObj, [])
  checkPaths(t, got, [], [], [])
})

test('configure paths with virtual chains and polymer', (t) => {
  const got = relayers.configurePaths(runWithVchains as ChainSetsRunObj, ['poly:eth', 'eth:poly'])
  const vibc = [['poly', 'eth']]
  const eth2 = [['eth', 'poly']]
  checkPaths(t, got, vibc, [], eth2)
})

test('configure duplicated paths with virtual chains and polymer', (t) => {
  const got = relayers.configurePaths(runWithVchains as ChainSetsRunObj, [
    'poly:eth',
    'eth:poly',
    'poly:eth',
    'eth:poly'
  ])
  const vibc = [['poly', 'eth']]
  const eth2 = [['eth', 'poly']]
  checkPaths(t, got, vibc, [], eth2)
})

test('configuring with unsupported virtual chains should fail', (t) => {
  let err = t.throws(() => relayers.configurePaths(runWithVchains as ChainSetsRunObj, ['bsc:poly']))
  t.assert(err?.message === 'Invalid relay path configuration: bsc (type: bsc) -> poly (type: polymer)', err?.message)

  err = t.throws(() => relayers.configurePaths(runWithVchains as ChainSetsRunObj, ['poly:bsc']))
  t.assert(err?.message === 'Invalid relay path configuration: poly (type: polymer) -> bsc (type: bsc)', err?.message)

  err = t.throws(() => relayers.configurePaths(runWithVchains as ChainSetsRunObj, ['prysm:poly']))
  t.assert(
    err?.message === 'Invalid relay path configuration: prysm (type: ethereum2) -> poly (type: polymer)',
    err?.message
  )

  err = t.throws(() => relayers.configurePaths(runWithVchains as ChainSetsRunObj, ['poly:prysm']))
  t.assert(
    err?.message === 'Invalid relay path configuration: poly (type: polymer) -> prysm (type: ethereum2)',
    err?.message
  )
})

test('configuring paths only with virtual chains should fail', (t) => {
  const err = t.throws(() => relayers.configurePaths(runWithVchains as ChainSetsRunObj, ['bsc:eth']))
  t.assert(err?.message === 'Invalid relay path configuration: bsc (type: bsc) -> eth (type: ethereum)', err?.message)
})

test('configuring paths with unkonwn virutal chain ids', (t) => {
  let err = t.throws(() => relayers.configurePaths(runWithVchains as ChainSetsRunObj, ['foo:eth']))
  t.assert(err?.message === 'Invalid path end: unknown chain foo', err?.message)

  err = t.throws(() => relayers.configurePaths(runWithVchains as ChainSetsRunObj, ['eth:foo']))
  t.assert(err?.message === 'Invalid path end: unknown chain foo', err?.message)
})

const runWithIbcChains = {
  ChainSets: [
    {
      Name: 'poly',
      Type: 'polymer'
    },
    {
      Name: 'gaia',
      Type: 'cosmos'
    },
    {
      Name: 'juno',
      Type: 'cosmos'
    }
  ]
}

test('configure empty paths with ibc chains', (t) => {
  const got = relayers.configurePaths(runWithIbcChains as ChainSetsRunObj, [])
  checkPaths(t, got, [], [], [])
})

test('configure paths with ibc chains and polymer', (t) => {
  const got = relayers.configurePaths(runWithIbcChains as ChainSetsRunObj, ['gaia:poly', 'poly:juno'])
  const ibc = [
    ['poly', 'juno'],
    ['gaia', 'poly']
  ]
  checkPaths(t, got, [], ibc, [])
})

test('configuring paths with ibc chain ids', (t) => {
  let err = t.throws(() => relayers.configurePaths(runWithIbcChains as ChainSetsRunObj, ['foo:poly']))
  t.assert(err?.message === 'Invalid path end: unknown chain foo')

  err = t.throws(() => relayers.configurePaths(runWithIbcChains as ChainSetsRunObj, ['poly:foo']))
  t.assert(err?.message === 'Invalid path end: unknown chain foo')
})

const runWithMixedChains = {
  ChainSets: [
    {
      Name: 'poly',
      Type: 'polymer'
    },
    {
      Name: 'eth',
      Type: 'ethereum'
    },
    {
      Name: 'bsc',
      Type: 'bsc'
    },
    {
      Name: 'gaia',
      Type: 'cosmos'
    }
  ]
}

test('configure empty paths with ibc and virtual chains', (t) => {
  const got = relayers.configurePaths(runWithMixedChains as ChainSetsRunObj, [])
  checkPaths(t, got, [], [], [])
})

test('configure paths with ibc and virtual chains', (t) => {
  const got = relayers.configurePaths(runWithMixedChains as ChainSetsRunObj, ['poly:gaia', 'eth:poly'])
  const vibc = [['poly', 'eth']]
  const ibc = [['poly', 'gaia']]
  const eth2 = [['eth', 'poly']]
  checkPaths(t, got, vibc, ibc, eth2)
})
