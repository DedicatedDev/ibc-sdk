import { dev, utils } from '@polymerdao/devkit'
import { HardhatUserConfig } from 'hardhat/config'
import assert from 'assert'
import { describe, it, setup, teardown } from 'mocha'
import * as zx from 'zx-cjs'
import { $ } from 'zx-cjs'

$.verbose = false

describe('dummy test ', function () {
  let ans = 0

  // setup and tear are run before/after each test in 'it'

  setup(function () {
    console.log(`[setup ${this.test?.title}] ans = ${ans}`)
    ans = 42
  })

  teardown(function () {
    console.log(`[teardown ${this.test?.title}] ans = ${ans}`)
    ans = -100
  })

  it('t1', function () {
    console.log(`[${this.test?.title}] ans = ${ans}`)
    assert.deepEqual(utils.dumpYaml({}), '{}\n')
    assert.deepEqual(utils.dumpYaml([]), '[]\n')
  })

  it('t2', function () {
    console.log(`[${this.test?.title}] ans = ${ans}`)
    assert.deepEqual(utils.dumpYaml({}), '{}\n')
    assert.deepEqual(utils.dumpYaml([]), '[]\n')
  })
})

async function assertPortOpen(rpc: string) {
  const out = await zx.nothrow($`curl -sf ${rpc}`)
  assert.deepStrictEqual(out.exitCode, 0)
}

describe('start a chainset', function () {
  // const logger = utils.createLogger({ Colorize: true, Level: 'debug' })

  it('can connects to all chain rpc', async function () {
    const logger = utils.createLogger({ Colorize: true, Level: 'debug' })
    const rawConfig = utils.readYamlFile(utils.getRelativeFilePath('chainset.config.yml', __filename))
    const { runObj } = await dev.runChainSets(rawConfig, logger)

    logger.verbose(utils.dumpYaml(runObj))
    for (const chain of runObj.ChainSets) {
      const node = chain.Nodes[0]
      const rpc = node.RpcHost
      logger.verbose(`chain [${chain.Name}] rpc at ${rpc}`)
      await assertPortOpen(rpc)
    }

    // create a network json loaded by hardhat config: integration_test.config.ts
    const config: any = {}
    for (const cs of runObj.ChainSets) {
      config[cs.Name] = {
        url: cs.Nodes[0].RpcHost,
        accounts: cs.Accounts.map((a) => (a as any).PrivateKey).filter((priKey) => priKey)
      }
    }
    const configPath = utils.getRelativeFilePath('./temp.hardhat.config.json', __filename)
    utils.fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

    await dev.cleanupChainSets(runObj)
  }).timeout(1000 * 100)
})
