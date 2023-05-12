import anyTest, { TestFn } from 'ava'
import { ProcessOutput } from 'zx-cjs'
import { utils } from '../../lib'
import { runningChainSetsSchema } from '../../lib/dev/schemas'
import { fs, path, $ } from '../../lib/utils'

const test = anyTest as TestFn<{
  workspace: string
  cli: string
}>

test.before(async (t) => {
  t.context.cli = path.resolve(__dirname, '..', '..', '..', 'bin', 'ibctl')
  $.verbose = process.env.TEST_LOG_LEVEL === 'verbose'
})

test.beforeEach((t) => {
  // Run tests on different workspaces every time since docker will not like
  // directories to be removed while these are mapped out as volumes.
  t.context.workspace = fs.mkdtempSync(path.join('/tmp', 'ibctl-tests-'))
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
  t.assert(fs.existsSync(path.join(t.context.workspace, 'polycore-smart-contracts.yaml')))
  t.assert(fs.existsSync(path.join(t.context.workspace, 'run')))
  t.assert(fs.existsSync(path.join(t.context.workspace, 'polycore-smart-contracts', 'Dispatcher.sol')))

  const config = utils.readYamlFile(path.join(t.context.workspace, 'config.yaml'))
  t.truthy(config)
  t.assert(config.Run.WorkingDir, path.join(t.context.workspace, 'run'))
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

  const out =
    await $`${t.context.cli} start --workspace ${t.context.workspace} --connection 'polymer-0:eth-exec-0' --connection 'eth-exec-0:polymer-0'`
  t.assert(out.exitCode === 0)

  const runtime = runningChainSetsSchema.parse(
    JSON.parse(fs.readFileSync(path.join(t.context.workspace, 'run', 'run.json'), 'utf-8'))
  )
  t.assert(runtime.Relayers.length === 2)
  t.assert(runtime.Relayers.find((r) => r.Name === 'vibc-relayer'))
  t.assert(runtime.Relayers.find((r) => r.Name === 'eth2-relayer'))
  t.assert(fs.existsSync(path.join(t.context.workspace, 'run', 'eth-exec-0', 'deployed-contracts.json')))

  await $`grep -q -i error ${t.context.workspace}/run/vibc-relayer/std*.log`.then(
    () => t.fail('grep should not find errors in vibc-relayer logs'),
    (reject) => {
      t.assert(reject.exitCode === 1)
    }
  )

  await $`grep -q -i error ${t.context.workspace}/run/eth2-relayer/std*.log`.then(
    () => t.fail('grep should not find errors in eth2 relayer logs'),
    (reject) => {
      t.assert(reject.exitCode === 1)
    }
  )
})

test.serial('running the start command with invalid relay path should fail', async (t) => {
  await $`${t.context.cli} start --workspace ${t.context.workspace} --connection foo`.then(
    () => t.fail('start with invalid path should fail'),
    (reject) => {
      t.assert(reject.exitCode === 1)
      t.regex(
        reject.stderr,
        /.*argument 'foo' is invalid. Connection path must be of the form of "src-chain-id:dst-chain-id".*/
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
  await $`sed -i 's/^Run://' ${configPath}`

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
      - Repository: "ghcr.io/polymerdao/juno"
        Tag: "latest"
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
    if (line.match(/- Name: "polymer-0"/)) config.write(juno)

    config.write(line + '\n')
  })
  config.close()

  const out =
    await $`${t.context.cli} start --workspace ${t.context.workspace} --connection 'polymer-0:juno' --connection 'polymer-0:eth-exec-0' --connection 'eth-exec-0:polymer-0'`
  t.assert(out.exitCode === 0)

  const runtime = runningChainSetsSchema.parse(
    JSON.parse(fs.readFileSync(path.join(t.context.workspace, 'run', 'run.json'), 'utf-8'))
  )

  t.assert(runtime.Relayers.length === 3)
  t.assert(runtime.Relayers.find((r) => r.Name === 'vibc-relayer'))
  t.assert(runtime.Relayers.find((r) => r.Name === 'eth2-relayer'))
  t.assert(runtime.Relayers.find((r) => r.Name === 'ibc-relayer-polymer-0-juno'))

  t.assert(fs.existsSync(path.join(t.context.workspace, 'run', 'eth-exec-0', 'deployed-contracts.json')))

  await $`grep -q -i error ${t.context.workspace}/run/vibc-relayer/std*.log`.then(
    () => t.fail('grep should not find errors in vibc-relayer logs'),
    (reject) => {
      t.assert(reject.exitCode === 1)
    }
  )
  await $`grep -q -i error ${t.context.workspace}/run/eth2-relayer/std*.log`.then(
    () => t.fail('grep should not find errors in eth2 relayer logs'),
    (reject) => {
      t.assert(reject.exitCode === 1)
    }
  )
  await $`grep -q -i error ${t.context.workspace}/run/ibc-relayer-polymer-0-juno/*.log`.then(
    () => t.fail('grep should not find errors in ibc-relayer logs'),
    (reject) => {
      t.assert(reject.exitCode === 1)
    }
  )
})

test.serial('the stop command resets the workspace', async (t) => {
  t.assert((await runInit(t)).exitCode === 0)

  let out = await $`${t.context.cli} start --workspace ${t.context.workspace} --connection 'polymer-0:eth-exec-0'`
  t.assert(out.exitCode === 0)

  // after this, the workspace will be ready to be start again.
  out = await $`${t.context.cli} stop --workspace ${t.context.workspace}`
  t.assert(out.exitCode === 0)

  t.assert(!fs.existsSync(path.join(t.context.workspace, 'run')))
  t.assert(fs.existsSync(path.join(t.context.workspace, 'config.yaml')))
  t.assert(fs.existsSync(path.join(t.context.workspace, 'polycore-smart-contracts')))
  t.assert(fs.existsSync(path.join(t.context.workspace, 'polycore-smart-contracts.yaml')))

  // run start on the stopped workspace again
  out = await $`${t.context.cli} start --workspace ${t.context.workspace} --connection 'polymer-0:eth-exec-0'`
  t.assert(out.exitCode === 0)
  await $`grep -q -i error ${t.context.workspace}/run/vibc-relayer/std*.log`.then(
    () => t.fail('grep should not find errors in vibc-relayer logs'),
    (reject) => {
      t.assert(reject.exitCode === 1)
    }
  )
})

// TODO remove me
test.serial.skip('create parlia light client', async (t) => {
  t.assert((await runInit(t)).exitCode === 0)

  const configPath = path.join(t.context.workspace, 'config.yaml')
  const bscConfigPath = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'src',
    'tests',
    'devnet',
    'bsc_polymer_chains.config.yaml'
  )
  await $`cp ${bscConfigPath} ${configPath}`
  await $`sed -i '/WorkingDir:/ s|".*"|"${t.context.workspace}/run"|' ${configPath}`

  let out = await $`${t.context.cli} start --workspace ${t.context.workspace} --connection bsc:polymer-0`
  t.assert(out.exitCode === 0)

  await $`${t.context.cli} create-light-client --workspace ${t.context.workspace} --path bsc:polymer-0 --lc-type parlia`.then(
    (resolve) => {
      t.assert(resolve.exitCode === 0)
      t.regex(resolve.stdout, /.*parlia-\d+.*/)
    },
    () => t.fail('create-light-client command should have returned zero')
  )
})
