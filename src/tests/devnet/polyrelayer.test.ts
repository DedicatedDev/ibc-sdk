import * as utils from '../../lib/utils/index.js'
import * as self from '../../lib/index.js'
import anyTest, { TestFn } from 'ava'
import { fs, path } from '../../lib/utils'
type PolyRelayer = self.dev.polyrelayer.PolyRelayer

const test = anyTest as TestFn<{
  logger: self.utils.Logger
  run: object
}>

test.before(async (t) => {
  const logLevel: any = 'verbose'
  const logger = utils.createLogger({ Level: logLevel, Colorize: true })
  t.context.logger = logger
  t.context.run = {
    Run: { WorkingDir: fs.mkdtempSync(path.join('/tmp', 'polyrelayer')) },
    ChainSets: []
  }
})

async function setupPolyrelayer(t: any): Promise<PolyRelayer> {
  const polyrelayer = await self.dev.polyrelayer.PolyRelayer.create(t.context.run.Run.WorkingDir, t.context.logger)
  let relayerConfig = polyrelayer.config(t.context.run, {}, [], {
    dst_client_id: 'sim-0',
    src_client_id: 'sim-0',
    'account-prefix': 'polymerase',
    'forward-block-headers': false
  })
  relayerConfig.global = { 'log-level': 'verbose', 'polling-idle-time': 1000 }
  const out = await polyrelayer.setup(relayerConfig)
  t.assert(out.exitCode == 0, out.stdout)

  return polyrelayer
}

test('polyrelayer can run all light clients proof generators', async (t) => {
  const polyrelayer = await setupPolyrelayer(t)
  t.truthy(polyrelayer)

  const lightClients = ['bor', 'ethclique', 'parlia']
  for (const lc of lightClients) {
    t.context.logger.verbose(`Checking ${lc} proof generator`)
    const out = await polyrelayer.exec([`/polyrelayer/${lc}-proof-gen`])
    t.assert(out.exitCode === 0)
  }
})
