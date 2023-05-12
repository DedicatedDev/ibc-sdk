#!/usr/bin/env node

import { Command, InvalidArgumentError, Option } from 'commander'
import * as winston from 'winston'
import { EndpointInfo } from '../lib/dev/query'
import * as commands from './commands'

function newLogger(level: string) {
  const timestampFormat = 'HH:mm:ss.SSS'
  return winston.createLogger({
    level: level,
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({
        format: timestampFormat
      }),
      winston.format.splat(),
      winston.format.simple(),
      winston.format.printf(
        (info) =>
          `[${info.timestamp} ${info.level}]: ${info.message}` + (info.splat !== undefined ? `${info.splat}` : ' ')
      )
    ),
    transports: new winston.transports.Console({
      stderrLevels: ['error', 'warn', 'info', 'verbose']
    })
  })
}

const connectionOption = new Option(
  '-c, --connection <path...>',
  'Polyrelayer paths in the form of "src-chain-id:dst-chain-id"'
)
  .default([], 'Combination of chains of different type')
  .argParser((current, previous: string[]) => {
    if (!current.match(/^[\w-]+:[\w-]+$/)) {
      throw new InvalidArgumentError('Connection path must be of the form of "src-chain-id:dst-chain-id"')
    }
    return previous.concat([current])
  })

const program = new Command()
  .helpOption('-h, --help', 'Display help command')
  .description('IBC SDK control')
  .addOption(
    new Option('-l, --log-level <level>', 'Log level').choices(['error', 'warn', 'info', 'verbose']).default('info')
  )
  .addOption(
    new Option('-w, --workspace <workspace>', 'Working directory').default(process.cwd(), 'Current working directory')
  )

program
  .command('init')
  .description('Initializes the local stack')
  .allowExcessArguments(false)
  .action(async (opts) => await commands.init({ ...program.opts(), ...opts }, newLogger(program.opts().logLevel)))

program
  .command('start')
  .description('Start the local stack as defined in <workspace>/<config-file>')
  .addOption(connectionOption)
  .allowExcessArguments(false)
  .action(async (opts) => await commands.start({ ...program.opts(), ...opts }, newLogger(program.opts().logLevel)))

program
  .command('show')
  .description('Shows the state of the local stack')
  .allowExcessArguments(false)
  .action(async (opts) => await commands.show({ ...program.opts(), ...opts }))

program
  .command('stop')
  .description('Stop the stack defined in the working directory')
  .allowExcessArguments(false)
  .option('-a, --all', 'Remove the entire workspace, including the configuration file')
  .action(async (opts) => await commands.stop({ ...program.opts(), ...opts }, newLogger(program.opts().logLevel)))

program
  .command('channel')
  .description('Creates an IBC channel between two endpoints')
  .arguments('<src-chain> <dst-chain>')
  .option('--dst-address <src-address>', 'Address of the smart contract deployed on the destination chain')
  .option('--src-address <dst-address>', 'Address of the smart contract deployed on the source chain')
  .allowExcessArguments(false)
  .action(async (src, dst, opts) => {
    await commands.channel(
      { ...program.opts(), srcChain: src, dstChain: dst, ...opts },
      newLogger(program.opts().logLevel)
    )
  })

program
  .command('exec')
  .description(
    'Runs a command on the container, selected by name and label following the format `name:label`. ' +
      'The name and label can partially match: i.e. use "poly" to match a container called "polymer-0:main". ' +
      'Only one match is allowed per command.'
  )
  .argument('<args...>')
  .allowExcessArguments(false)
  .action(async (opts) => {
    if (opts.length === 0) throw new Error('Name and label (name:label) is required')
    await commands.exec({ ...program.opts(), name: opts.shift(), args: opts }, newLogger(program.opts().logLevel))
  })

program
  .command('deploy')
  .description(
    'Deploys a smart contract on the selected chain. If the SC constructor needs arguments, list them in order'
  )
  .arguments('<chain> <smart-contract-path> [args...]')
  .allowExcessArguments(false)
  .action(async (chain, scpath, scargs) => {
    await commands.deploy({ ...program.opts(), chain, scpath, scargs }, newLogger(program.opts().logLevel))
  })

program
  .command('logs')
  .description(
    'Fetches the logs from any component of the stack. It mimics the `docker logs` functionality with similar options.'
  )
  .argument('<name>')
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
    await commands.logs({ ...program.opts(), name: name, ...opts }, newLogger(program.opts().logLevel))
  })

program
  .command('create-light-client')
  .description('Creates a new Light Client on the destination chain')
  .allowExcessArguments(false)
  .option('-p, --path <path>', 'The path used to create the light client')
  .addOption(new Option('-t, --lc-type <light-client-type>', 'Light Client type').choices(['parlia']))
  .action(
    async (opts) => await commands.createLightClient({ ...program.opts(), ...opts }, newLogger(program.opts().logLevel))
  )

const parseEndpointInfo = (value: string): EndpointInfo => {
  const args = value.split(':')
  if (args.length !== 3) {
    throw new Error('Invalid argument format. Expected a <chain_id:channel_id:port_id> tuple separated by a :.')
  }
  return {
    chainID: args[0],
    portID: args[1],
    channelID: args[2]
  }
}

program
  .command('trace-packets')
  .description('Trace packet execution over the specified channel')
  .allowExcessArguments(false)
  // TODO: Can prob come up w/ better naming than source <> destination as communication is bidirectional.
  .option(
    '-s, --source <chain_id:port_id:channel_id>',
    'The source chain/port/channel to trace packets from',
    parseEndpointInfo
  )
  .option(
    '-d, --destination <chain_id:port_id:channel_id>',
    'The destination chain/port/channel to trace packets to',
    parseEndpointInfo
  )
  .action(
    async (opts) => await commands.tracePackets({ ...program.opts(), ...opts }, newLogger(program.opts().logLevel))
  )

program
  .command('channels')
  .description(
    'Queries the IBC channels on the selected Cosmos chain. The chain name can be in the form of `name:label`.'
  )
  .argument('<name>')
  .option('--json', 'Output in JSON format')
  .allowExcessArguments(false)
  .action(async (name, opts) => {
    await commands.channels({ ...program.opts(), name: name, ...opts }, newLogger(program.opts().logLevel))
  })

program
  .command('connections')
  .description(
    'Queries the IBC connections on the selected Cosmos chain. The chain name can be in the form of `name:label`.'
  )
  .argument('<name>')
  .option('--json', 'Output in JSON format')
  .allowExcessArguments(false)
  .action(async (name, opts) => {
    await commands.connections({ ...program.opts(), name: name, ...opts }, newLogger(program.opts().logLevel))
  })

program
  .command('clients')
  .description(
    'Queries the IBC clients on the selected Cosmos chain. The chain name can be in the form of `name:label`.'
  )
  .argument('<name>')
  .option('--json', 'Output in JSON format')
  .allowExcessArguments(false)
  .action(async (name, opts) => {
    await commands.clients({ ...program.opts(), name: name, ...opts }, newLogger(program.opts().logLevel))
  })

program
  .command('tx')
  .description('Queries a transaction on the selected chain. The chain name can be in the form of `name:label`.')
  .argument('<name>')
  .argument('<tx-hash>')
  .option('--json', 'Output in JSON format')
  .allowExcessArguments(false)
  .action(async (name, tx, opts) => {
    await commands.tx({ ...program.opts(), name: name, tx: tx, ...opts }, newLogger(program.opts().logLevel))
  })

process.stdout.on('error', (err) => err.code === 'EPIPE' ?? process.exit(0))
process.stderr.on('error', (err) => err.code === 'EPIPE' ?? process.exit(0))

program
  .parseAsync()
  .then(() => process.exit())
  .catch((error: Error) => {
    newLogger('error').error(error.message)
    process.exit(1)
  })