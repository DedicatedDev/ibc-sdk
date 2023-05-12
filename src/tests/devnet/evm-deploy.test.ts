import * as self from '../../lib/index.js'
import * as utils from '../../lib/utils/index.js'
import * as ethers from 'ethers'
import path from 'path'

import anyTest, { TestFn } from 'ava'

const test = anyTest as TestFn<{
  logger: utils.Logger
}>

test.before((t) => {
  const logLevel: any = process.env.TEST_LOG_LEVEL ?? 'debug'
  const logger = utils.createLogger({ Level: logLevel })
  t.context = { logger }
})

const gethConfigPath = utils.getRelativeFilePath('../../../src/tests/devnet/simple_geth.config.yaml')

test('deploy contracts on chains from chainSet runobj', async (t) => {
  const logger = t.context.logger
  const chainsetsConfig = utils.readYaml(gethConfigPath)
  chainsetsConfig.Run.CleanupMode = 'debug'
  const { runObj, configObj: _ } = await self.dev.runChainSets(chainsetsConfig, logger)

  const contractsDir = path.resolve(__dirname, '..', '..', '..', 'tests', 'xdapp', 'artifacts', 'contracts')
  const contractsConfig = self.dev.createContractsConfig(contractsDir)
  // start deploy contracts
  await self.dev.deployOnChainSets(contractsConfig, runObj, logger)

  const assertions = runObj.ChainSets.map(async (chain: any) => {
    const deployedPath = path.join(runObj.Run.WorkingDir, chain.Name, 'deployed-contracts.json')
    // TODO: parse into a strict typing
    const deployed = JSON.parse(utils.fs.readFileSync(deployedPath, 'utf8')).Deployed

    const provider = new ethers.providers.JsonRpcProvider(deployed.RpcHost)
    for (const contract of deployed.Contracts) {
      // verify contract is deployed at given address
      const code = await provider.getCode(contract.Address)
      logger.verbose(
        `[${deployed.ChainName}] code for ${contract.Name} at ${contract.Address}: length = ${code.length}`
      )
      t.truthy(code)
      t.truthy(code.length > 0)
    }
  })
  await Promise.all(assertions)
  // after clean up, folders should be cleaned up and containers are stopped
  await self.dev.cleanupChainSets(runObj)
})
