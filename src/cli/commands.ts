import path from 'path'
import { $, extractSmartContracts, fs, readYamlFile, readYamlText, getLogger } from '../lib/utils'
import { configTemplate } from './config.template'
import { channelHandshake } from './channel'
import { EndpointInfo, Packet, TxEvent, tracePackets as sdkTracePackets } from '../lib/query'
import {
  ChainSetsRunObj,
  imageByLabel,
  ImageLabelTypes,
  isCosmosChain,
  isEvmChain,
  runningChainSetsSchema
} from '../lib/schemas'
import { containerFromId, removeStaleContainers } from '../lib/docker'
import {
  cleanupRuntime,
  deploySmartContract,
  deployVIBCCoreContractsOnChainSets,
  events as sdkEvents,
  newJsonRpcProvider,
  runChainSets,
  runProver,
  runRelayers,
  utils
} from '../lib'
import { tmpdir } from 'os'
import archiver from 'archiver'
import { ProcessOutput } from 'zx-cjs'
import { addressify } from '../lib/ethers'

const log = getLogger()

const configFile = 'config.yaml'

function filterContainers(runtime: ChainSetsRunObj, name: string) {
  const found = runtime.ChainSets.reduce((acc: any[], c: any) => {
    for (const node of c.Nodes) {
      const fullname = `${c.Name}:${node.Label}`
      if (fullname.startsWith(name)) acc.push({ name: c.Name, id: node.ContainerId })
    }
    return acc
  }, [])

  runtime.Relayers.forEach((r: any) => r.Name.startsWith(name) && found.push({ name: r.Name, id: r.ContainerId }))

  if (found.length === 0)
    throw new Error(`Could not find any container by the name ${name}, use 'ibctl show' to list all containers`)
  if (found.length > 1) {
    throw new Error(`The name '${name}' selected ${found.length} container(s): ${found.map((f) => f.name).join(', ')}`)
  }
  return found[0]
}

async function wrapCosmosCommand(args: string[], opts: WrapCommandsOpts) {
  const runtime = loadWorkspace(opts.workspace)

  const found = filterContainers(runtime, opts.name)
  const chain = runtime.ChainSets.find((c) => c.Name === found.name)
  if (!chain || !isCosmosChain(chain.Type)) {
    throw new Error(`Expected a cosmos chain, got ${chain?.Type}`)
  }

  const container = await containerFromId(chain.Nodes[0].ContainerId)
  const bin = imageByLabel(chain.Images, ImageLabelTypes.Main)!.Bin!
  const fmt = opts.json ? 'json' : 'text'
  printOutput(await container.exec([bin, '--output', fmt, ...args]))
}

function loadWorkspace(workspace: string): ChainSetsRunObj {
  // TODO: this run subdir is assumed in mulitple places
  const workdir = path.resolve(path.join(workspace, 'run'))
  const runPath = path.join(workdir, 'run.json')
  if (!fs.existsSync(runPath)) {
    throw new Error(`could not read runtime file: ${runPath}`)
  }
  const runObj = runningChainSetsSchema.parse(JSON.parse(utils.fs.readFileSync(runPath, 'utf-8')))
  runObj.WorkDir = workdir
  return runObj
}

function printOutput(out: ProcessOutput) {
  if (out.stdout.length > 0) process.stdout.write(out.stdout)
  if (out.stderr.length > 0) process.stderr.write(out.stderr)
}

type InitOpts = {
  workspace: string
  configFile: string
}

const vibcCoreContracts = 'vibc-core-smart-contracts'

export async function init(opts: InitOpts) {
  const workspace = path.resolve(opts.workspace)
  if (!fs.existsSync(workspace)) {
    log.verbose(`creating workspace: ${workspace}`)
    fs.mkdirSync(workspace, { recursive: true })
  }

  const configPath = path.join(opts.workspace, configFile)
  if (fs.existsSync(configPath)) {
    throw new Error(`refusing to override existing configuration file: ${configPath}`)
  }

  const runDir = path.join(workspace, 'run')
  fs.mkdirSync(runDir)
  let config = configTemplate
  if (opts.configFile) {
    const configYaml = readYamlText(config)
    const userConfigYaml = readYamlFile(opts.configFile)
    const chainSetsKey = 'ChainSets'
    if (userConfigYaml[chainSetsKey]) {
      configYaml[chainSetsKey] = userConfigYaml[chainSetsKey]
      config = utils.dumpYamlSafe(configYaml)
    }
  }
  fs.writeFileSync(configPath, config, 'utf-8')

  const contractsDir = path.join(workspace, vibcCoreContracts)
  fs.mkdirSync(contractsDir)

  await extractSmartContracts(contractsDir)

  log.info('workspace created at: %s', workspace)
  log.info('configuration file is available at: %s', configPath)
  log.info('when ready, run: ibctl start --workspace %s', workspace)
}

const thenClause = [
  (resolve: any) => resolve,
  (error: any) => {
    throw new Error(error)
  }
]

type StartOpts = {
  workspace: string
  connection: string[]
  useZkMint: boolean
}

export async function start(opts: StartOpts) {
  const configPath = path.join(opts.workspace, configFile)
  if (!fs.existsSync(configPath)) {
    throw new Error(`could not read configuration file: ${configPath}`)
  }
  const config = fs.readFileSync(configPath, 'utf-8')

  const contractsPath = path.join(opts.workspace, vibcCoreContracts)

  let { runObj: runtime } = await runChainSets(config, opts.workspace).then(...thenClause)
  if (!process.env.DO_NOT_DEPLOY_VIBC_SMART_CONTRACTS) {
    runtime = await deployVIBCCoreContractsOnChainSets(runtime, contractsPath, opts.useZkMint).then(...thenClause)
  }

  if (opts.useZkMint) {
    await runProver(runtime).then(...thenClause)
  }

  await runRelayers(runtime, opts.connection).then(...thenClause)
}

export async function show(opts: any) {
  const runtime = loadWorkspace(opts.workspace)

  const line = async (name: string, node: any, rows: any) => {
    if (node.Label) name = `${name}:${node.Label}`
    const out = { Name: name, 'Container ID': node.ContainerId, Endpoint: '', Status: '' }

    out.Endpoint = node.RpcHost ?? 'N/A'

    await $`docker inspect ${node.ContainerId}  --format='{{.State.Status}}'`.then(
      (state) => {
        out.Status = state.stdout.trim()
        rows.push(out)
      },
      () => log.warn(`could not find container '${node.ContainerId}'`)
    )
  }

  const rows: any = []
  for (const chain of runtime.ChainSets) {
    for (const node of chain.Nodes) {
      await line(chain.Name, node, rows)
    }
  }

  for (const relayer of runtime.Relayers) {
    await line(relayer.Name, relayer, rows)
  }

  if (runtime.Prover) {
    await line(runtime.Prover.Name, runtime.Prover, rows)
  }

  console.table(rows)
}

type StopOpts = {
  workspace: string
  prover: boolean
  all: boolean
}

export async function stop(opts: StopOpts) {
  const removeAll = async () => {
    fs.rmSync(path.join(opts.workspace, 'run'), { force: true, recursive: true })
    if (!opts.all) return
    log.info('removing stale containers')
    await removeStaleContainers()
    fs.rmSync(opts.workspace, { force: true, recursive: true })
  }

  let runtime: ChainSetsRunObj
  try {
    runtime = loadWorkspace(opts.workspace)
  } catch {
    log.warn('Looks like you have already stopped the workspace?')
    return await removeAll()
  }

  await cleanupRuntime(runtime, opts.all)
  await removeAll()
}

type ExecOpts = {
  workspace: string
  args: string[]
  name: string
}

export async function exec(opts: ExecOpts) {
  const runtime = loadWorkspace(opts.workspace)
  const containerId = filterContainers(runtime, opts.name).id
  const container = await containerFromId(containerId)
  printOutput(await container.exec(opts.args))
}

type DeployOpts = {
  workspace: string
  chain: string
  account: string
  scpath: string
  scargs: string[]
}

export async function deploy(opts: DeployOpts) {
  const runtime = loadWorkspace(opts.workspace)
  const deployed = await deploySmartContract(runtime, opts.chain, addressify(opts.account), opts.scpath, opts.scargs)
  console.log(deployed.Address)
}

type ChannelOpts = {
  workspace: string
  chainA: { chainId: string; portID: string; version: string }
  chainB: { chainId: string; portID: string; version: string }
}

export async function channel(opts: ChannelOpts) {
  const runtime = loadWorkspace(opts.workspace)

  const chainA = runtime.ChainSets.find((c) => c.Name === opts.chainA.chainId)
  if (!chainA) throw new Error(`Could not find chain ${opts.chainA.chainId} is chain sets`)

  const chainB = runtime.ChainSets.find((c) => c.Name === opts.chainB.chainId)
  if (!chainB) throw new Error(`Could not find chain ${opts.chainB.chainId} is chain sets`)

  await channelHandshake(
    runtime,
    {
      chain: chainA,
      portID: opts.chainA.portID,
      version: opts.chainA.version
    },
    {
      chain: chainB,
      portID: opts.chainB.portID,
      version: opts.chainB.version
    }
  )
}

type TracePacketsOpts = {
  workspace: string
  endpointA: EndpointInfo
  endpointB: EndpointInfo
  json: boolean
}

export async function tracePackets(opts: TracePacketsOpts) {
  const runtime = loadWorkspace(opts.workspace)

  const chainA = runtime.ChainSets.find((c) => c.Name === opts.endpointA.chainID)
  const chainB = runtime.ChainSets.find((c) => c.Name === opts.endpointB.chainID)
  const polymerChain = runtime.ChainSets.find((c) => c.Name === 'polymer')
  if (!chainA || !chainB || !polymerChain) {
    throw new Error('Could not find chain runtime object!')
  }

  const packetsRaw = await sdkTracePackets(chainA, chainB, opts.endpointA, opts.endpointB).then(
    ...thenClause
  )
  const packets = packetsRaw.map((p: Packet) => ({ ...p, sequence: p.sequence.toString() }))

  if (opts.json) console.log(JSON.stringify(packets))
  else console.table(packets, ['channelID', 'portID', 'sequence', 'state'])
}

type LogsOpts = {
  workspace: string
  name: string
  follow: boolean
  timestamps: boolean
  since: string
  until: string
  tail: string
}

export async function logs(opts: LogsOpts) {
  const runtime = loadWorkspace(opts.workspace)
  const containerId = filterContainers(runtime, opts.name).id
  const container = await containerFromId(containerId)
  await container.logs({ stdout: process.stdout, stderr: process.stderr, ...opts }).then(...thenClause)
}

type ArchiveOpts = {
  workspace: string
  output: string
}

export async function archiveLogs(opts: ArchiveOpts) {
  const runtime = loadWorkspace(opts.workspace)

  const components = runtime.ChainSets.map((c) =>
    c.Nodes.map((n) => ({ name: `${c.Name}.${n.Label}`, id: n.ContainerId }))
  ).flat()
  components.push(...runtime.Relayers.map((r) => ({ name: r.Name, id: r.ContainerId })))

  // eslint-disable-next-line no-async-promise-executor
  const archive = new Promise(async () => {
    const dir = fs.mkdtempSync(path.join(tmpdir(), 'logs'))
    const archive = archiver('tar', { gzip: true })
    const output = fs.createWriteStream(opts.output)
    archive.pipe(output)

    archive.on('error', (err) => {
      throw err
    })
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') throw err
      log.warning(err)
    })

    output.on('close', () => {
      fs.rmSync(dir, { force: true, recursive: true })
      log.info(`logs have been saved to ${opts.output}`)
    })

    for (const comp of components) {
      const container = await containerFromId(comp.id)
      const out = fs.createWriteStream(path.join(dir, `${comp.name}.log`))
      await container.logs({ stdout: out, stderr: out })
    }

    archive.directory(dir, 'logs')
    await archive.finalize()
  }).then(...thenClause)

  await archive
}

type WrapCommandsOpts = {
  workspace: string
  name: string
  json: boolean
}

export async function channels(opts: WrapCommandsOpts) {
  await wrapCosmosCommand(['query', 'ibc', 'channel', 'channels'], opts)
}

export async function connections(opts: WrapCommandsOpts) {
  await wrapCosmosCommand(['query', 'ibc', 'connection', 'connections'], opts)
}

export async function clients(opts: WrapCommandsOpts) {
  await wrapCosmosCommand(['query', 'ibc', 'client', 'states'], opts)
}

export async function tx(opts: WrapCommandsOpts & { tx: string }) {
  const runtime = loadWorkspace(opts.workspace)
  const found = filterContainers(runtime, opts.name)
  const chain = runtime.ChainSets.find((c) => c.Name === found.name)
  if (!chain) throw new Error(`Expected any chain`)

  if (isCosmosChain(chain.Type)) {
    const container = await containerFromId(chain.Nodes[0].ContainerId)
    const bin = imageByLabel(chain.Images, ImageLabelTypes.Main)!.Bin!
    const fmt = opts.json ? 'json' : 'text'
    printOutput(await container.exec([bin, '--output', fmt, 'query', 'tx', opts.tx]))
    return
  }

  if (isEvmChain(chain.Type)) {
    const eth = newJsonRpcProvider(chain.Nodes[0].RpcHost)
    const tx = await eth.getTransaction(opts.tx)
    process.stdout.write(opts.json ? JSON.stringify(tx) : utils.dumpYamlSafe(tx))
    return
  }

  throw new Error(`Cannot query transactions on chain type: ${chain.Type}`)
}

export async function accounts(opts: WrapCommandsOpts) {
  const runtime = loadWorkspace(opts.workspace)
  const found = filterContainers(runtime, opts.name)
  const chain = runtime.ChainSets.find((c) => c.Name === found.name)
  if (!chain) throw new Error(`Expected any chain`)

  process.stdout.write(opts.json ? JSON.stringify(chain.Accounts) : utils.dumpYamlSafe(chain.Accounts))
}

type EventsOpts = {
  workspace: string
  name: string
  height: number
  minHeight: number
  maxHeight: number
  extended: boolean
  json: boolean
}

export async function events(opts: EventsOpts) {
  const runtime = loadWorkspace(opts.workspace)
  const found = filterContainers(runtime, opts.name)
  const chain = runtime.ChainSets.find((c) => c.Name === found.name)
  if (!chain) throw new Error(`Expected any chain`)

  const events: TxEvent[] = []
  await sdkEvents(chain, opts, (event: TxEvent) => {
    if (!opts.extended) return console.log(event.height, ':', Object.keys(event.events).join(' '))
    if (!opts.json) return console.log(event.height, ':', event.events)
    // this will use more memory since we are buffering all events instead of flushing them to stdout
    // but it's non-trivial to print a valid json array otherwise.
    events.push(event)
  })
  if (opts.extended && opts.json) console.log(JSON.stringify(events))
}
