import * as self from '../../lib/index.js'
import * as utils from '../../lib/utils/index.js'

import anyTest, { TestFn } from 'ava'
import { ChainSetsRunObj } from '../../lib/dev/schemas.js'
import winston from 'winston'

const test = anyTest as TestFn<{
  logger: utils.Logger
}>

const mnemonic =
  'wait team asthma refuse situate crush kidney nature ' +
  'frown kid alpha boat engage test across cattle practice ' +
  'text olive level tag profit they veteran'

const configPrefix = `# applicable to all cosmos chains; use polymerase
ChainSets:
`

const configSufix = `
Run:
  WorkingDir: "/tmp/test-chainsets/run-*"
  # valid modes: ['all', 'debug', 'log'], default 'all'
  CleanupMode: debug
  Logger:
    # valid levels: [deubg, info, warn, error]
    Level: debug
    # Colorize: false
    # Transports can take a single str with the default log love above
    # Transports: 'log'
    Transports:
      - 'log' # will use default level
      - FileName: critial.log
        Level: warn
      # add console logger for debugging
      - FileName: '-'
        Level: verbose
`

test.before((t) => {
  const logLevel: any = process.env.TEST_LOG_LEVEL ?? 'debug'
  const logger = utils.createLogger({ Level: logLevel, Colorize: true })
  t.context = { logger }
})

async function createIBCconnections(runObj: ChainSetsRunObj, src: string, dst: string, logger: winston.Logger) {
  const chainRegistry = self.dev.newChainRegistry(runObj, [src, dst], true)
  const chainPair = { src: { name: src }, dest: { name: dst } }
  const relayerAccount = { mnemonic: mnemonic }
  const relayerConfig = self.dev.newIbcRelayerConfig(chainRegistry, chainPair, relayerAccount)
  const relayer = await self.dev.newIBCRelayer(runObj.Run.WorkingDir, src + dst, logger)
  await relayer.init(relayerConfig)
  await relayer.connect()
  return await relayer.getConnections()
}

const ibcConnectionsTest = test.macro(async (t, config: string) => {
  const rawConfig = utils.readYaml(config)
  const { runObj, configObj: _ } = await self.dev.runChainSets(rawConfig, t.context.logger)
  t.truthy(runObj)

  const chain = runObj.ChainSets[0] as self.dev.schemas.CosmosChainSet
  const conns = await createIBCconnections(runObj, chain.Name, chain.Name, t.context.logger)
  t.truthy(conns)
})

const polymerConfig = `
  - Name: "polymerase"
    Type: "polymer"
    Moniker: "polymerase"
    Prefix: "polymerase"
    Images:
      - Repository: "ghcr.io/polymerdao/polymerase"
        Tag: "latest"
        Bin: "polymerased"
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
      - Repository: "ghcr.io/polymerdao/gaia"
        Tag: "latest"
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
      - Repository: "ghcr.io/polymerdao/juno"
        Tag: "latest"
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
  const { runObj, configObj: _ } = await self.dev.runChainSets(rawConfig, t.context.logger)
  t.truthy(runObj)

  const chain0 = runObj.ChainSets[0] as self.dev.schemas.CosmosChainSet
  const chain1 = runObj.ChainSets[1] as self.dev.schemas.CosmosChainSet
  const conns = await createIBCconnections(runObj, chain0.Name, chain1.Name, t.context.logger)
  t.truthy(conns)
})

test('IBC connections between polymer and gaia', ibcConnectionsTest2, polymerConfig + gaiaConfig)
test('IBC connections between juno and gaia', ibcConnectionsTest2, junoConfig + gaiaConfig)
