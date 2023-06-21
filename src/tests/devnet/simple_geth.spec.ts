import * as self from '../../lib/index.js'
import { z } from 'zod'
import { AccountsConfigSchema, AccountsSchema } from '../../lib/schemas'
import * as utils from '../../lib/utils/index.js'
import * as ethers from 'ethers'
import { gethConfig } from './simple_geth_config'
import { getTestingLogger } from '../../lib/utils/logger'
import { cleanupRuntime, getWorkspace, runtimeTest } from './test_utils'

const log = getTestingLogger()

const test = runtimeTest

test.afterEach.always(async (t) => {
  await cleanupRuntime(t)
})

test('start a geth chain from docker container', async (t) => {
  const rawConfig = utils.readYaml(gethConfig)
  t.truthy(rawConfig)
  // override test config
  const configOverride = { chains: ['eth', 'polygon'], cleanupMode: 'all' }
  rawConfig.ChainSets = rawConfig.ChainSets.filter((cs) => configOverride.chains.includes(cs.Name))
  const workspace = getWorkspace('test-geth')
  const { runObj, configObj } = await self.runChainSets(rawConfig, workspace)
  t.context.runtime = runObj

  for (let i = 0; i < runObj.ChainSets.length; i++) {
    const evmChain = runObj.ChainSets[i]

    // only test EVM chain for now
    if (evmChain.Type === 'cosmos') continue
    // single node only
    const chainNode = evmChain.Nodes[0]

    t.truthy(chainNode)

    const url = chainNode.RpcHost
    log.verbose(`[${evmChain.Name}] connection to url: ${url}`)
    const ethClient = self.newJsonRpcProvider(url)
    const height = await ethClient.getBlockNumber()

    t.true(height >= 0)
    t.truthy(chainNode.ContainerId)
    const accounts = configObj.ChainSets[i].Accounts! as any as z.infer<typeof AccountsConfigSchema.evm>
    t.deepEqual(accounts.Count, evmChain.Accounts!.length, `chain [${evmChain.Name}] accounts mismatch`)

    log.verbose(`[${evmChain.Name}] running container id: ${chainNode.ContainerId}`)
    log.verbose(`[${evmChain.Name}] block height: ${height} at url: ${url}`)
    for (const acct of evmChain.Accounts as any as z.infer<typeof AccountsSchema.evm>) {
      const balanceWei = await ethClient.getBalance(acct.Address)
      const balance = ethers.utils.formatEther(balanceWei)
      t.deepEqual(parseInt(balance), acct.Balance)
      log.verbose(`[${evmChain.Name}] balance of ${acct.Address}: ${balance} ethers ${balanceWei} wei`)
    }
  }
})
