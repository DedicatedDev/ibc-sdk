import * as self from '../../lib/index.js'
import * as utils from '../../lib/utils/index.js'
import anyTest, { TestFn } from 'ava'
import { images } from '../../lib/dev/docker'
import { getTestingLogger } from '../../lib/utils/logger'
import { setupIbcRelayer } from '../../lib/dev/relayers'

getTestingLogger()

const test = anyTest as TestFn<{}>

const mnemonic =
  'wait team asthma refuse situate crush kidney nature ' +
  'frown kid alpha boat engage test across cattle practice ' +
  'text olive level tag profit they veteran'

const configPrefix = `# applicable to all cosmos chains; use polymer
ChainSets:
`

const configSufix = `
Run:
  WorkingDir: "/tmp/test-chainsets/run-*"
  CleanupMode: debug
`

const ibcConnectionsTest = test.macro(async (t, config: string) => {
  const { runObj: runtime, configObj: _ } = await self.dev.runChainSets(utils.readYaml(config))
  t.truthy(runtime)
  const chain = runtime.ChainSets[0]
  await setupIbcRelayer(runtime, [[chain.Name, chain.Name]])
})

const polymerConfig = `
  - Name: "polymer"
    Type: "polymer"
    Moniker: "polymer"
    Prefix: "polymer"
    Images:
      - Repository: "${images.polymer.repo}"
        Tag: "${images.polymer.tag}"
        Bin: "polymerd"
    Accounts:
      - Name: alice
        Coins: ["20000token", "200000000stake"]
      - Name: relayer
        Mnemonic: "${mnemonic}"
        Coins: ["1234567token", "200000000stake"]
      - Name: validatorRunner
        Coins: ["150000000stake"]
    Validator:
      Name: validatorRunner
      Staked: "100000000stake"
`

test(
  'poly-ibc-relayer creates IBC connections with polymer chain',
  ibcConnectionsTest,
  configPrefix + polymerConfig + configSufix
)

const gaiaConfig = `
  - Name: "gaia"
    Type: "cosmos"
    Moniker: "gaia"
    Prefix: "cosmos"
    Images:
      - Repository: "ghcr.io/strangelove-ventures/heighliner/gaia"
        Tag: "v7.0.3"
        Bin: "gaiad"
    Accounts:
      - Name: bob
        Coins: ["10000token", "100000000stake"]
      - Name: relayer
        Mnemonic: "${mnemonic}"
        Coins: ["1234567token", "200000000stake"]
      - Name: validatorRunner
        Coins: ["150000000stake"]
    Validator:
      Name: validatorRunner
      Staked: "100000000stake"
`

const junoConfig = `
  - Name: "juno"
    Type: "cosmos"
    Moniker: "juno"
    Prefix: "juno"
    Images:
      - Repository: "ghcr.io/strangelove-ventures/heighliner/juno"
        Tag: "v9.0.0"
        Bin: "junod"
    Accounts:
      - Name: charlie
        Coins: ["10000token", "100000000stake"]
      - Name: relayer
        Mnemonic: "${mnemonic}"
        Coins: ["1234567token", "200000000stake"]
      - Name: validatorRunner
        Coins: ["150000000stake"]
    Validator:
      Name: validatorRunner
      Staked: "100000000stake"
`
test(
  'poly-ibc-relayer creates IBC connections with gaia chain',
  ibcConnectionsTest,
  configPrefix + gaiaConfig + configSufix
)

const ibcConnectionsTest2 = test.macro(async (t, config: string) => {
  const rawConfig = configPrefix + config + configSufix
  const { runObj: runtime, configObj: _ } = await self.dev.runChainSets(rawConfig)
  t.truthy(runtime)

  const chain0 = runtime.ChainSets[0] as self.dev.schemas.CosmosChainSet
  const chain1 = runtime.ChainSets[1] as self.dev.schemas.CosmosChainSet
  await setupIbcRelayer(runtime, [[chain0.Name, chain1.Name]])
})

test('IBC connections between polymer and gaia', ibcConnectionsTest2, polymerConfig + gaiaConfig)
test.only('IBC connections between juno and gaia', ibcConnectionsTest2, junoConfig + gaiaConfig)
