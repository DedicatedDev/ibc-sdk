import anyTest, { TestFn } from 'ava'
import { getTestingLogger } from '../../lib/utils/logger'
import { ProcessOutput } from 'zx-cjs'
import { utils } from '../../lib'
import { runningChainSetsSchema } from '../../lib/schemas'
import { fs, path, $ } from '../../lib/utils'

getTestingLogger()

const test = anyTest as TestFn<{
  workspace: string
  cli: string
}>

test.before(async (t) => {
  t.context.cli = path.resolve(__dirname, '..', '..', '..', 'bin', 'ibctl')
})

test.beforeEach((t) => {
  // Run tests on different workspaces every time since docker will not like
  // directories to be removed while these are mapped out as volumes.
  t.context.workspace = fs.mkdtempSync(path.join('/tmp', 'ibctl-tests-'))

  delete process.env.DO_NOT_DEPLOY_VIBC_SMART_CONTRACTS
})

test.afterEach(async (t) => {
  try {
    await $`${t.context.cli} stop --workspace ${t.context.workspace}`
  } catch {}
})

test.serial('cli can run', async (t) => {
  await $`${t.context.cli}`.then(
    () => t.fail('running with no commands or options should fail'),
    (reject) => {
      t.assert(reject.exitCode === 1)
      t.regex(reject.stderr, /.*Usage:.*/)
    }
  )

  const out = await $`${t.context.cli} --help`
  t.assert(out.exitCode === 0)
})

async function runInit(t: any): Promise<ProcessOutput> {
  return await $`${t.context.cli} init --workspace ${t.context.workspace}`
}

test.serial('the init command creates all files within workspace', async (t) => {
  const out = await runInit(t)
  t.assert(out.exitCode === 0)
  t.assert(fs.existsSync(t.context.workspace))
  t.assert(fs.existsSync(path.join(t.context.workspace, 'config.yaml')))
  t.assert(fs.existsSync(path.join(t.context.workspace, 'run')))
  t.assert(fs.existsSync(path.join(t.context.workspace, 'vibc-core-smart-contracts', 'Dispatcher.sol')))

  const config = utils.readYamlFile(path.join(t.context.workspace, 'config.yaml'))
  t.truthy(config)
})

test.serial('running the init command twice should fail', async (t) => {
  await runInit(t)
  await runInit(t).then(
    () => t.fail('second init on the same workspace should fail'),
    (reject) => {
      t.assert(reject.exitCode === 1)
      t.regex(reject.stderr, /.*refusing to override existing configuration file:.*/)
    }
  )
})

test.serial('the start command starts stack', async (t) => {
  t.assert((await runInit(t)).exitCode === 0)

  let out = await $`${t.context.cli} start --workspace ${t.context.workspace} --connection 'polymer:eth-execution'`
  t.assert(out.exitCode === 0)

  const runtime = runningChainSetsSchema.parse(
    JSON.parse(fs.readFileSync(path.join(t.context.workspace, 'run', 'run.json'), 'utf-8'))
  )
  t.assert(runtime.Relayers.length === 2)
  t.assert(runtime.Relayers.find((r) => r.Name === 'vibc-relayer'))
  t.assert(runtime.Relayers.find((r) => r.Name === 'eth-relayer'))
  t.assert(runtime.ChainSets.find((c) => c.Name === 'eth-execution')!.Contracts.length > 0)

  await $`${t.context.cli} -w ${t.context.workspace} logs vibc-relayer | grep -q -i error`.then(
    () => t.fail('grep should not find errors in vibc-relayer logs'),
    (reject) => {
      t.assert(reject.exitCode === 1)
    }
  )

  await $`${t.context.cli} -w ${t.context.workspace} logs eth-relayer | grep -q -i error`.then(
    () => t.fail('grep should not find errors in eth relayer logs'),
    (reject) => {
      t.assert(reject.exitCode === 1)
    }
  )

  const output = path.join(t.context.workspace, 'logs.tar.gz')
  out = await $`${t.context.cli} -w ${t.context.workspace} archive-logs -o ${output}`
  t.assert(out.exitCode === 0)
  t.assert(fs.existsSync(output))

  out = await $`tar zxvf ${output} -C ${t.context.workspace}`
  t.assert(out.exitCode === 0)
  const logs = [
    '', // so we can check the parent directory exists
    'eth-consensus.main.log',
    'eth-consensus.validator.log',
    'eth-execution.main.log',
    'eth-relayer.log',
    'polymer.main.log',
    'vibc-relayer.log'
  ]
  for (const l of logs) {
    const p = path.join(t.context.workspace, 'logs', l)
    t.assert(fs.existsSync(p), `File not found: ${p}`)
  }
})

test.serial('running the start command with invalid relay path should fail', async (t) => {
  process.env.DO_NOT_DEPLOY_VIBC_SMART_CONTRACTS = '1'
  await $`${t.context.cli} start --workspace ${t.context.workspace} --connection foo`.then(
    () => t.fail('start with invalid path should fail'),
    (reject) => {
      t.assert(reject.exitCode === 1)
      t.regex(
        reject.stderr,
        /.*argument 'foo' is invalid. Connection path must be of the form of "chain-id-a:chain-id-b".*/
      )
    }
  )
})

test.serial('running the start command on a non-existing workspace should fail', async (t) => {
  await $`${t.context.cli} start --workspace non-existing-workspace`.then(
    () => t.fail('start unknown workspace should fail'),
    (reject) => {
      t.assert(reject.exitCode === 1)
      t.regex(reject.stderr, /.*could not read configuration file:.*/)
    }
  )
})

test.serial('running the start command on an invalid configuration file should fail', async (t) => {
  t.assert((await runInit(t)).exitCode === 0)

  const configPath = path.join(t.context.workspace, 'config.yaml')
  await $`grep -v '^ChainSets:' ${configPath} > ${configPath}.bak`
  await $`mv ${configPath}.bak ${configPath}`

  await $`${t.context.cli} start --workspace ${t.context.workspace}`.then(
    () => t.fail('start invalid config should fail'),
    (reject) => {
      t.assert(reject.exitCode === 1)
      // TODO change this when error handling is improved.
      t.regex(reject.stderr, /.*"code": "invalid_type".*/)
    }
  )
})

test.serial('running the start command twice should fail', async (t) => {
  process.env.DO_NOT_DEPLOY_VIBC_SMART_CONTRACTS = '1'
  t.assert((await runInit(t)).exitCode === 0)

  await $`${t.context.cli} start --workspace ${t.context.workspace}`
  await $`${t.context.cli} start --workspace ${t.context.workspace}`.then(
    () => t.fail('double start should fail'),
    (reject) => {
      t.assert(reject.exitCode === 1)
      t.regex(reject.stderr, /.*Workdir '.*' already in use.*/)
    }
  )
})

test.serial('the start command starts stack with vibc and ibc chains', async (t) => {
  t.assert((await runInit(t)).exitCode === 0)

  const juno = `  - Name: "juno"
    Type: "cosmos"
    Moniker: "juno"
    Prefix: "juno"
    Images:
      - Repository: "ghcr.io/strangelove-ventures/heighliner/juno"
        Tag: "v9.0.0"
        Bin: "junod"
    Accounts:
      - Name: bob
        Coins: ["10000token", "100000000stake"]
      - Name: relayer
        Mnemonic: "wait team asthma refuse situate crush kidney nature frown kid alpha boat engage test across cattle practice text olive level tag profit they veteran"
        Coins: ["1234567token", "200000000stake"]
      - Name: validatorRunner
        Coins: ["150000000stake"]
    Validator:
      Name: validatorRunner
      Staked: "100000000stake"

`
  const configPath = path.join(t.context.workspace, 'config.yaml')
  const allContents = fs.readFileSync(configPath, 'utf-8')
  const config = fs.createWriteStream(configPath)
  allContents.split(/\r?\n/).forEach((line) => {
    if (line.match(/- Name: "polymer"/)) config.write(juno)

    config.write(line + '\n')
  })
  config.close()

  const out =
    await $`${t.context.cli} start --workspace ${t.context.workspace} --connection 'polymer:juno' --connection 'polymer:eth-execution'`
  t.assert(out.exitCode === 0)

  const runtime = runningChainSetsSchema.parse(
    JSON.parse(fs.readFileSync(path.join(t.context.workspace, 'run', 'run.json'), 'utf-8'))
  )

  t.assert(runtime.Relayers.length === 3)
  t.assert(runtime.Relayers.find((r) => r.Name === 'vibc-relayer'))
  t.assert(runtime.Relayers.find((r) => r.Name === 'eth-relayer'))
  t.assert(runtime.Relayers.find((r) => r.Name === 'ibc-relayer-polymer-juno'))
  t.assert(runtime.ChainSets.find((c) => c.Name === 'eth-execution')!.Contracts.length > 0)

  await $`${t.context.cli} -w ${t.context.workspace} logs vibc-relayer | grep -q -i error`.then(
    () => t.fail('grep should not find errors in vibc-relayer logs'),
    (reject) => {
      t.assert(reject.exitCode === 1)
    }
  )
  await $`${t.context.cli} -w ${t.context.workspace} logs eth-relayer | grep -q -i error`.then(
    () => t.fail('grep should not find errors in eth relayer logs'),
    (reject) => {
      t.assert(reject.exitCode === 1)
    }
  )
  await $`${t.context.cli} -w ${t.context.workspace} logs ibc-relayer | grep -q -i error`.then(
    () => t.fail('grep should not find errors in ibc-relayer logs'),
    (reject) => {
      t.assert(reject.exitCode === 1)
    }
  )
})

test.serial('the stop command resets the workspace', async (t) => {
  t.assert((await runInit(t)).exitCode === 0)

  let out = await $`${t.context.cli} start --workspace ${t.context.workspace} --connection 'polymer:eth-execution'`
  t.assert(out.exitCode === 0)

  // after this, the workspace will be ready to be start again.
  out = await $`${t.context.cli} stop --workspace ${t.context.workspace}`
  t.assert(out.exitCode === 0)

  t.assert(!fs.existsSync(path.join(t.context.workspace, 'run')))
  t.assert(fs.existsSync(path.join(t.context.workspace, 'config.yaml')))
  t.assert(fs.existsSync(path.join(t.context.workspace, 'vibc-core-smart-contracts')))

  // run start on the stopped workspace again
  out = await $`${t.context.cli} start --workspace ${t.context.workspace} --connection 'polymer:eth-execution'`
  t.assert(out.exitCode === 0)
  await $`${t.context.cli} -w ${t.context.workspace} logs vibc-relayer | grep -q -i error`.then(
    () => t.fail('grep should not find errors in vibc-relayer logs'),
    (reject) => {
      t.assert(reject.exitCode === 1)
    }
  )
})

test.serial('the stop command always kills the containers', async (t) => {
  process.env.DO_NOT_DEPLOY_VIBC_SMART_CONTRACTS = '1'
  t.assert((await runInit(t)).exitCode === 0)

  let out = await $`${t.context.cli} start --workspace ${t.context.workspace}`
  t.assert(out.exitCode === 0)

  out = await $`${t.context.cli} --workspace ${t.context.workspace} exec eth-consensus:main killall beacon-chain`
  t.assert(out.exitCode === 0)

  await $`${t.context.cli} stop --workspace ${t.context.workspace}`.then(
    (out) => t.assert(out.exitCode === 0),
    () => t.fail('stop should not have failed')
  )
})

test.serial('the show command ignores missing containers', async (t) => {
  process.env.DO_NOT_DEPLOY_VIBC_SMART_CONTRACTS = '1'
  t.assert((await runInit(t)).exitCode === 0)

  let out = await $`${t.context.cli} start --workspace ${t.context.workspace}`
  t.assert(out.exitCode === 0)

  const runtime = runningChainSetsSchema.parse(
    JSON.parse(fs.readFileSync(path.join(t.context.workspace, 'run', 'run.json'), 'utf-8'))
  )
  t.assert(runtime)
  const polymer = runtime.ChainSets.find((c) => c.Name === 'polymer')
  t.assert(polymer)
  $`docker container rm -f ${polymer!.Nodes[0].ContainerId}`

  await $`${t.context.cli} show --workspace ${t.context.workspace}`.then(
    (out) => t.assert(out.exitCode === 0),
    () => t.fail('show should not have failed')
  )
})
