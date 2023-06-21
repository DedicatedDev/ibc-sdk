import * as self from '../../lib/index'
import path from 'path'
import anyTest, { TestFn } from 'ava'
import { gethConfig } from './simple_geth_config'
import { getTestingLogger } from '../../lib/utils/logger'
import { ChainSetsRunObj } from '../../lib/schemas'
import { extractSmartContracts } from '../../lib/utils'
import os from 'os'
import fs from 'fs'
import { getWorkspace } from './test_utils'

const log = getTestingLogger()

const test = anyTest as TestFn<{
  runtime: ChainSetsRunObj
  contractsDir: string
  workspace: string
}>

test.beforeEach(async (t) => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'contracts-'))
  t.context.contractsDir = tempDir
  await extractSmartContracts(tempDir)
  t.context.workspace = getWorkspace('test-evm-deploy')
})

test.afterEach.always(async (t) => {
  if (t.context.runtime) {
    // after clean up, folders should be cleaned up and containers are stopped
    await self.cleanupRuntime(t.context.runtime, true)
  }
  await fs.promises.rm(t.context.contractsDir, { recursive: true })
})

test('deploy contracts on runtime chains', async (t) => {
  const { runObj: runtime, configObj: _ } = await self.runChainSets(gethConfig, t.context.workspace)
  t.context.runtime = runtime
  t.context.runtime = await self.deployVIBCCoreContractsOnChainSets(t.context.runtime, t.context.contractsDir, false)

  const assertions = runtime.ChainSets.map(async (chain) => {
    const provider = self.newJsonRpcProvider(chain.Nodes[0].RpcHost)
    for (const contract of chain.Contracts) {
      // verify contract is deployed at given address
      const code = await provider.getCode(contract.Address)
      log.verbose(`[${chain.Name}] code for ${contract.Name} at ${contract.Address}: length = ${code.length}`)
      t.truthy(code)
      t.truthy(code.length > 0)
    }
  })
  await Promise.all(assertions)
})
