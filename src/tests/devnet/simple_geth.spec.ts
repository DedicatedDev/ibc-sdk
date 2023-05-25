import * as self from '../../lib/index.js'
import { z } from 'zod'
import { AccountsConfigSchema, AccountsSchema } from '../../lib/dev/schemas.js'
import * as utils from '../../lib/utils/index.js'
import * as ethers from 'ethers'

import anyTest, { TestFn } from 'ava'

const test = anyTest as TestFn<{
  logger: utils.Logger
}>

test.before((t) => {
  const logLevel: any = process.env.TEST_LOG_LEVEL ?? 'debug'
  const logger = utils.createLogger({ Level: logLevel })
  t.context = { logger }
})

const gethConfigPath = utils.getRelativeFilePath('../../../src/tests/devnet/simple_geth.config.yaml', __filename)

test('start a geth chain from docker container', async (t) => {
  const logger = t.context.logger

  const rawConfig = utils.readYaml(gethConfigPath)
  t.truthy(rawConfig)
  // override test config
  const configOverride = { chains: ['eth', 'polygon'], cleanupMode: 'debug' }
  rawConfig.ChainSets = rawConfig.ChainSets.filter((cs) => configOverride.chains.includes(cs.Name))
  rawConfig.Run.CleanupMode = configOverride.cleanupMode
  const { runObj, configObj } = await self.dev.runChainSets(rawConfig, logger)

  for (let i = 0; i < runObj.ChainSets.length; i++) {
    const evmChain = runObj.ChainSets[i]

    // only test EVM chain for now
    if (evmChain.Type === 'cosmos') continue
    // single node only
    const chainNode = evmChain.Nodes[0]

    t.truthy(chainNode)

    const url = chainNode.RpcHost
    logger.verbose(`[${evmChain.Name}] connection to url: ${url}`)
    const ethClient = new ethers.providers.JsonRpcProvider(url)
    const height = await ethClient.getBlockNumber()

    t.true(height >= 0)
    t.truthy(chainNode.ContainerId)
    const accounts = configObj.ChainSets[i].Accounts! as any as z.infer<typeof AccountsConfigSchema.evm>
    t.deepEqual(accounts.Count, evmChain.Accounts!.length, `chain [${evmChain.Name}] accounts mismatch`)

    logger.verbose(`[${evmChain.Name}] running container id: ${chainNode.ContainerId}`)
    logger.verbose(`[${evmChain.Name}] block height: ${height} at url: ${url}`)
    for (const acct of evmChain.Accounts as any as z.infer<typeof AccountsSchema.evm>) {
      const balanceWei = await ethClient.getBalance(acct.Address)
      const balance = ethers.utils.formatEther(balanceWei)
      t.deepEqual(parseInt(balance), acct.Balance)
      logger.verbose(`[${evmChain.Name}] balance of ${acct.Address}: ${balance} ethers ${balanceWei} wei`)
    }
  }

  // after clean up, folders should be cleaned up and containers are stopped
  await self.dev.cleanupChainSets(runObj)
})
