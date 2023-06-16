#!/usr/bin/env node

import { Command, InvalidArgumentError, Option } from 'commander'
import { EndpointInfo } from '../lib/dev/query'
import * as commands from './commands'
import path from 'path'
import { homedir } from 'os'
import { version } from '../.package.json'
import { getLogger, levels } from '../lib/utils/logger'

const log = getLogger()

const nameDescription =
  'The name can be of the format `name:label` like the one in the `show` output. ' +
  'A partial match is enough to select the chain: i.e. use "poly" to match a container called "polymer-0:main". ' +
  'Only one match is allowed per command.'

const connectionOption = new Option(
  '-c, --connection <path...>',
  'A path must be in the form of "chain-id-a:chain-id-b". This tells ibctl how to configure the relayers between both chains'
)
  .default([], 'No connection between chains')
  .argParser((current, previous: string[]) => {
    if (!current.match(/^[\w-]+:[\w-]+$/)) {
      throw new InvalidArgumentError('Connection path must be of the form of "chain-id-a:chain-id-b"')
    }
    return previous.concat([current])
  })

const defaultWorkspace = path.join(homedir(), '.ibc-sdk')
const program = new Command()
  .helpOption('-h, --help', 'Display help command')
  .description('IBC SDK control')
  .addOption(new Option('-l, --log-level <level>', 'Log level').choices(levels).default('info'))
  .addOption(new Option('-w, --workspace <workspace>', 'Working directory').default(defaultWorkspace, defaultWorkspace))
  .version(version)
  .hook('preAction', (cmd) => (log.level = cmd.opts().logLevel))

const useZkMintOption = new Option('--use-zk-mint', 'Use ZK minting').default(false)

program
  .command('init')
  .description('Initializes the workspace')
  .allowExcessArguments(false)
  .action(async (opts) => await commands.init({ ...program.opts(), ...opts }))

program
  .command('start')
  .description('Start the local stack as defined in <workspace>/config.yaml')
  .addOption(connectionOption)
  .addOption(useZkMintOption)
  .allowExcessArguments(false)
  .action(async (opts) => await commands.start({ ...program.opts(), ...opts }))

program
  .command('show')
  .description('Shows the state of the local stack')
  .allowExcessArguments(false)
  .action(async (opts) => await commands.show({ ...program.opts(), ...opts }))

program
  .command('stop')
  .description('Stop the stack defined in the workspace')
  .allowExcessArguments(false)
  .option('-a, --all', 'Removes the entire workspace, including the configuration file. Implies `--clean`')
  .action(async (opts) => await commands.stop({ ...program.opts(), ...opts }))
// TODO: figure out a better way to do this without stepping outside the boundary of -w
// .option('-c, --clean', 'Removes stale containers created by previous executions.')

function parseChannelEnpoint(value: string) {
  const args = value.split(':')
  if (args.length !== 2)
    throw new Error('Invalid argument format. Expected a <chain_id:account_name_or_address> tuple separated by a `:`.')
  return { chainId: args[0], account: args[1] }
}

program
  .command('channel')
  .description(
    'Creates an IBC channel between two endpoints. The endpoint format must be `chain_id:account_name_or_address`'
  )
  .arguments('<endpoint-a> <endpoint-b>')
  .allowExcessArguments(false)
  .option('--a-channel-version <version>', 'IBC version to use during the channel handshake on endpoint A')
  .option('--b-channel-version <version>', 'IBC version to use during the channel handshake on endpoint B')
  .action(async (a, b, opts) => {
    const endpointA = parseChannelEnpoint(a)
    const endpointB = parseChannelEnpoint(b)
    await commands.channel({ ...program.opts(), endpointA, endpointB, ...opts })
  })

program
  .command('exec')
  .description('Runs a command on the container, selected by its name.' + nameDescription)
  .argument('<args...>')
  .allowExcessArguments(false)
  .action(async (opts) => {
    if (opts.length === 0) throw new Error('Name (name:label) is required')
    await commands.exec({ ...program.opts(), name: opts.shift(), args: opts })
  })

program
  .command('deploy')
  .description(
    'Deploys a smart contract on the selected chain. If the SC constructor needs arguments, list them in order'
  )
  .arguments('<chain-name> <account> <smart-contract-path> [args...]')
  .allowExcessArguments(false)
  .action(async (chain, account, scpath, scargs) => {
    await commands.deploy({ ...program.opts(), chain, account, scpath, scargs })
  })

program
  .command('archive-logs')
  .description('Fetches logs from all components in the stack and archives them in a tarball')
  .option('-o, --output <output>', 'Output file', 'logs.tar.gz')
  .allowExcessArguments(false)
  .action(async (opts) => {
    await commands.archiveLogs({ ...program.opts(), ...opts })
  })

program
  .command('logs')
  .description(
    'Fetches the logs from any component of the stack. It mimics the `docker logs` functionality with similar options.'
  )
  .argument('<chain-name>', nameDescription)
  .addOption(
    new Option(
      '--since <since>',
      'Show logs since timestamp (e.g. "2013-01-02T13:23:37Z") or relative (e.g. "42m" for 42 minutes)'
    )
  )
  .addOption(new Option('-n, --tail <tail>', 'Number of lines to show from the end of the logs (default "all")'))
  .addOption(new Option('-f, --follow', 'Follow log output'))
  .addOption(new Option('-t, --timestamps', 'Show timestamps'))
  .addOption(
    new Option(
      '--until <until>',
      'Show logs before a timestamp (e.g. "2013-01-02T13:23:37Z") or relative (e.g. "42m" for 42 minutes)'
    )
  )

  .allowExcessArguments(false)
  .action(async (name, opts) => {
    await commands.logs({ ...program.opts(), name: name, ...opts })
  })

function parseEndpointInfo(value: string): EndpointInfo {
  const args = value.split(':')
  if (args.length !== 3) {
    throw new Error('Invalid argument format. Expected a <chain_id:channel_id:port_id> tuple separated by a :.')
  }
  return {
    chainID: args[0],
    channelID: args[1],
    portID: args[2]
  }
}

program
  .command('trace-packets')
  .description(
    'Trace packet execution over the specified endpoints. The endpoint format must be `chain_id:channel_id:port_id`'
  )
  .allowExcessArguments(false)
  .arguments('<endpoint-a> <endpoint-b>')
  .option('--json', 'Output in JSON format', false)
  .action(async (a, b, opts) => {
    const endpointA = parseEndpointInfo(a)
    const endpointB = parseEndpointInfo(b)
    await commands.tracePackets({ ...program.opts(), endpointA, endpointB, ...opts })
  })

program
  .command('channels')
  .description(
    'Queries the IBC channels on the selected Cosmos chain. The chain name can be in the form of `name:label`.'
  )
  .argument('<chain-name>')
  .option('--json', 'Output in JSON format')
  .allowExcessArguments(false)
  .action(async (name, opts) => {
    await commands.channels({ ...program.opts(), name: name, ...opts })
  })

program
  .command('connections')
  .description(
    'Queries the IBC connections on the selected Cosmos chain. The chain name can be in the form of `name:label`.'
  )
  .argument('<chain-name>')
  .option('--json', 'Output in JSON format')
  .allowExcessArguments(false)
  .action(async (name, opts) => {
    await commands.connections({ ...program.opts(), name: name, ...opts })
  })

program
  .command('clients')
  .description(
    'Queries the IBC clients on the selected Cosmos chain. The chain name can be in the form of `name:label`.'
  )
  .argument('<chain-name>')
  .option('--json', 'Output in JSON format')
  .allowExcessArguments(false)
  .action(async (name, opts) => {
    await commands.clients({ ...program.opts(), name: name, ...opts })
  })

program
  .command('tx')
  .description('Queries a transaction on the selected chain. The chain name can be in the form of `name:label`.')
  .argument('<chain-name>')
  .argument('<tx-hash>')
  .option('--json', 'Output in JSON format')
  .allowExcessArguments(false)
  .action(async (name, tx, opts) => {
    await commands.tx({ ...program.opts(), name: name, tx: tx, ...opts })
  })

program
  .command('accounts')
  .description(
    'Queries the auto-generated accounts on the selected chain. The chain name can be in the form of `name:label`.'
  )
  .argument('<chain-name>')
  .option('--json', 'Output in JSON format')
  .allowExcessArguments(false)
  .action(async (name, opts) => {
    await commands.accounts({ ...program.opts(), name: name, ...opts })
  })

function parseNumber(value: string): number {
  const n = Number(value)
  if (isNaN(n)) throw new InvalidArgumentError('Not a number')
  return n
}

program
  .command('events')
  .description('Queries events from a chain, given the provided height ranges and prints them out in a readable way')
  .argument('<chain-name>')
  .option('-m, --min-height <min-height>', 'Get events starting from this height', parseNumber, 1)
  .option('-M, --max-height <max-height>', 'Get events until this height', parseNumber)
  .option('-H, --height <height>', 'Get events from this height', parseNumber)
  .option('-x, --extended', 'Show the full content of the events instead of their type', false)
  .option('-j, --json', 'Output in json format', false)
  .allowExcessArguments(false)
  .action(async (name, opts) => {
    if (opts.minHeight && opts.maxHeight && opts.minHeight >= opts.maxHeight)
      throw new Error(`max-height (${opts.maxHeight}) must be greater than min-height (${opts.minHeight})`)
    await commands.events({ ...program.opts(), name: name, ...opts })
  })

process.stdout.on('error', (err) => err.code === 'EPIPE' ?? process.exit(0))
process.stderr.on('error', (err) => err.code === 'EPIPE' ?? process.exit(0))

program
  .parseAsync()
  .then(() => process.exit())
  .catch((error: Error) => {
    log.error(error.message)
    process.exit(1)
  })
