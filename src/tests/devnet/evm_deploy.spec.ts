import * as self from '../../lib/index'
import path from 'path'
import anyTest, { TestFn } from 'ava'
import { gethConfig } from './simple_geth_config'
import { getTestingLogger } from '../../lib/utils/logger'

const log = getTestingLogger()

const test = anyTest as TestFn<{}>

// TODO: fix https://github.com/polymerdao/ibc-sdk/issues/32
test.skip('deploy contracts on runtime chains', async (t) => {
  let { runObj: runtime, configObj: _ } = await self.dev.runChainSets(gethConfig)

  const contractsDir = path.resolve(__dirname, '..', '..', '..', 'tests', 'xdapp', 'artifacts', 'contracts')
  runtime = await self.dev.deployVIBCCoreContractsOnChainSets(runtime, contractsDir)

  const assertions = runtime.ChainSets.map(async (chain) => {
    const provider = self.dev.newJsonRpcProvider(chain.Nodes[0].RpcHost)
    for (const contract of chain.Contracts) {
      // verify contract is deployed at given address
      const code = await provider.getCode(contract.Address)
      log.verbose(`[${chain.Name}] code for ${contract.Name} at ${contract.Address}: length = ${code.length}`)
      t.truthy(code)
      t.truthy(code.length > 0)
    }
  })
  await Promise.all(assertions)
  // after clean up, folders should be cleaned up and containers are stopped
  await self.dev.cleanupRuntime(runtime)
})
