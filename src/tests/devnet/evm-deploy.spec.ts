import * as self from '../../lib/index'
import * as utils from '../../lib/utils/index'
import * as ethers from 'ethers'
import path from 'path'

import anyTest, { TestFn } from 'ava'

const test = anyTest as TestFn<{
  logger: utils.Logger
}>

test.before((t) => {
  const level: any = process.env.TEST_LOG_LEVEL ?? 'verbose'
  const logger = utils.createLogger({ Level: level })
  t.context.logger = logger
})

const gethConfigPath = utils.getRelativeFilePath('../../../src/tests/devnet/simple_geth.config.yaml')

test('deploy contracts on runtime chains', async (t) => {
  const logger = t.context.logger
  const chainsetsConfig = utils.readYaml(gethConfigPath)

  let { runObj: runtime, configObj: _ } = await self.dev.runChainSets(chainsetsConfig, logger)

  const contractsDir = path.resolve(__dirname, '..', '..', '..', 'tests', 'xdapp', 'artifacts', 'contracts')
  runtime = await self.dev.deployVIBCCoreContractsOnChainSets(runtime, contractsDir, logger)

  const assertions = runtime.ChainSets.map(async (chain) => {
    const provider = new ethers.providers.JsonRpcProvider(chain.Nodes[0].RpcHost)
    for (const contract of chain.Contracts) {
      // verify contract is deployed at given address
      const code = await provider.getCode(contract.Address)
      logger.verbose(`[${chain.Name}] code for ${contract.Name} at ${contract.Address}: length = ${code.length}`)
      t.truthy(code)
      t.truthy(code.length > 0)
    }
  })
  await Promise.all(assertions)
  // after clean up, folders should be cleaned up and containers are stopped
  await self.dev.cleanupChainSets(runtime)
})
