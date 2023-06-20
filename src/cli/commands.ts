import path from 'path'
import * as os from 'os'
import { utils, cleanupRuntime, newJsonRpcProvider } from '../lib'
import { $, extractSmartContracts, fs, getLogger } from '../lib/utils'
import { configTemplate } from './config.template'
import * as self from '../lib/index.js'
import { channelHandshake } from './channel'
import { EndpointInfo, Packet, TxEvent } from '../lib/query'
import { ChainSetsRunObj, ChainSetsRunConfig, imageByLabel, ImageLabelTypes, isCosmosChain, isEvmChain } from '../lib/schemas'
import { containerFromId, removeStaleContainers } from '../lib/docker'
import archiver from 'archiver'

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

  if (found.length === 0) throw new Error(`Could not find any container by the name ${name}`)
  if (found.length > 1) {
    throw new Error(`The name '${name}' selected ${found.length} container(s): ${found.map((f) => f.name).join(', ')}`)
  }
  return found[0]
}

export type WrapCommandsOpts = {
  workspace: string
  name: string
  json: boolean
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
  return await container.exec([bin, '--output', fmt, ...args])
}

function loadWorkspace(workdir: string): ChainSetsRunObj {
  const workspace = path.resolve(path.join(workdir, 'run'))
  const runPath = path.join(workspace, 'run.json')
  if (!fs.existsSync(runPath)) {
    throw new Error(`could not read runtime file: ${runPath}`)
  }
  return self.schemas.runningChainSetsSchema.parse(JSON.parse(utils.fs.readFileSync(runPath, 'utf-8')))
}

export type InitOpts = {
  workspace: string
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
  const config = configTemplate.replace('<working-dir>', runDir)

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

export type StartOpts = {
  workspace: string
  connection: string[]
  useZkMint: boolean
}

export async function start(opts: StartOpts): Promise<{ runObj: ChainSetsRunObj; configObj: ChainSetsRunConfig }> {
  const configPath = path.join(opts.workspace, configFile)
  if (!fs.existsSync(configPath)) {
    throw new Error(`could not read configuration file: ${configPath}`)
  }
  const config = fs.readFileSync(configPath, 'utf-8')

  const contractsPath = path.join(opts.workspace, vibcCoreContracts)

  let { runObj: runtime } = await self.runChainSets(config).then(...thenClause)
  if (!process.env.DO_NOT_DEPLOY_VIBC_SMART_CONTRACTS) {
    runtime = await self.deployVIBCCoreContractsOnChainSets(runtime, contractsPath, opts.useZkMint).then(...thenClause)
  }

  if (opts.useZkMint) {
    await self.runProver(runtime).then(...thenClause)
  }

  await self.runRelayers(runtime, opts.connection).then(...thenClause)
  return runtime
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

  return rows
}

export type StopOpts = {
  workspace: string
  prover: boolean
  clean: boolean
  all: boolean
}

export async function stop(opts: StopOpts) {
  const removeAll = async () => {
    fs.rmSync(path.join(opts.workspace, 'run'), { force: true, recursive: true })
    if (!opts.all && !opts.clean) return
    log.info('removing stale containers')
    await removeStaleContainers()
    if (!opts.all) return
    log.info('removing the entire workspace')
    fs.rmSync(opts.workspace, { force: true, recursive: true })
  }

  let runtime: ChainSetsRunObj
  try {
    runtime = loadWorkspace(opts.workspace)
  } catch {
    log.warn('Looks like you have already stopped the workspace?')
    return await removeAll()
  }

  runtime.Run.CleanupMode = 'all'
  await cleanupRuntime(runtime)
  await removeAll()
}

export type ExecOpts = {
  workspace: string
  args: string[]
  name: string
}

export async function exec(opts: ExecOpts) {
  const runtime = loadWorkspace(opts.workspace)
  const containerId = filterContainers(runtime, opts.name).id
  const container = await containerFromId(containerId)
  return await container.exec(opts.args)
}

export type DeployOpts = {
  workspace: string
  chain: string
  account: string
  scpath: string
  scargs: string[]
}

export async function deploy(opts: DeployOpts) {
  const runtime = loadWorkspace(opts.workspace)
  return await self.deploySmartContract(runtime, opts.chain, opts.account, opts.scpath, opts.scargs)
}

export type ChannelOpts = {
  workspace: string
  endpointA: { chainId: string; account: string }
  endpointB: { chainId: string; account: string }
  aChannelVersion: string
  bChannelVersion: string
}

export async function channel(opts: ChannelOpts) {
  const runtime = loadWorkspace(opts.workspace)

  let endpointA = runtime.ChainSets.find((c) => c.Name === opts.endpointA.chainId)
  if (!endpointA) throw new Error(`Could not find endpoint ${opts.endpointA.chainId} is chain sets`)

  let endpointB = runtime.ChainSets.find((c) => c.Name === opts.endpointB.chainId)
  if (!endpointB) throw new Error(`Could not find endpoint ${opts.endpointB.chainId} is chain sets`)

  const poly = runtime.ChainSets.find((c) => c.Type === 'polymer')
  if (!poly) throw new Error('Could not find polymer chain is chain sets')

  const valid = new Set<string>(['cosmos:ethereum', 'ethereum:cosmos'])

  if (!valid.has(`${endpointA.Type}:${endpointB.Type}`))
    throw new Error(
      `Only the following combinations are currently supported: ${new Array(...valid).join(', ')}. ` +
        `Got: ${endpointA.Type}:${endpointB.Type}`
    )

  const origEndpointA = endpointA.Name
  // replace the ethereum chain with polymer
  endpointA = endpointA.Type === 'ethereum' ? poly : endpointA
  endpointB = endpointB.Type === 'ethereum' ? poly : endpointB

  // always keep polymer as the endpoint A for convenience
  if (endpointA.Type !== 'polymer') [endpointA, endpointB] = [endpointB, endpointA]

  await channelHandshake(
    runtime,
    origEndpointA,
    {
      chain: endpointA as self.schemas.CosmosChainSet,
      address: opts.endpointA.account,
      version: opts.aChannelVersion
    },
    {
      chain: endpointB as self.schemas.CosmosChainSet,
      address: opts.endpointB.account,
      version: opts.bChannelVersion
    }
  )
}

export type TracePacketsOpts = {
  workspace: string
  endpointA: EndpointInfo
  endpointB: EndpointInfo
  json: boolean
}

export async function tracePackets(opts: TracePacketsOpts) {
  const runtime = loadWorkspace(opts.workspace)

  const chainA = runtime.ChainSets.find((c) => c.Name === opts.endpointA.chainID)
  const chainB = runtime.ChainSets.find((c) => c.Name === opts.endpointB.chainID)
  if (!chainA || !chainB) {
    throw new Error('Could not find chain runtime object!')
  }

  const packetsRaw = await self
    .tracePackets(chainA.Nodes[0].RpcHost, chainB.Nodes[0].RpcHost, opts.endpointA, opts.endpointB)
    .then(...thenClause)
  return packetsRaw.map((p: Packet) => ({ ...p, sequence: p.sequence.toString() }))
}

export type LogsOpts = {
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
  return await container.logs({ stdout: process.stdout, stderr: process.stderr, ...opts }).then(...thenClause)
}

export type ArchiveOpts = {
  workspace: string
  output: string
}

export async function archiveLogs(opts: ArchiveOpts) {
  const runtime = loadWorkspace(opts.workspace)

  const components = runtime.ChainSets.map((c) =>
    c.Nodes.map((n) => ({ name: `${c.Name}.${n.Label}`, id: n.ContainerId }))
  ).flat()
  components.push(...runtime.Relayers.map((r) => ({ name: r.Name, id: r.ContainerId })))

  const archive = new Promise(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logs'))
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

export async function channels(opts: WrapCommandsOpts) {
  return await wrapCosmosCommand(['query', 'ibc', 'channel', 'channels'], opts)
}

export async function connections(opts: WrapCommandsOpts) {
  return await wrapCosmosCommand(['query', 'ibc', 'connection', 'connections'], opts)
}

export async function clients(opts: WrapCommandsOpts) {
  return await wrapCosmosCommand(['query', 'ibc', 'client', 'states'], opts)
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
    return await container.exec([bin, '--output', fmt, 'query', 'tx', opts.tx])
  }

  if (isEvmChain(chain.Type)) {
    const eth = newJsonRpcProvider(chain.Nodes[0].RpcHost)
    const tx = await eth.getTransaction(opts.tx)
    return opts.json ? JSON.stringify(tx) : utils.dumpYamlSafe(tx)
  }

  throw new Error(`Cannot query transactions on chain type: ${chain.Type}`)
}

export async function accounts(opts: WrapCommandsOpts) {
  const runtime = loadWorkspace(opts.workspace)
  const found = filterContainers(runtime, opts.name)
  const chain = runtime.ChainSets.find((c) => c.Name === found.name)
  if (!chain) throw new Error(`Expected any chain`)

  return opts.json ? JSON.stringify(chain.Accounts) : utils.dumpYamlSafe(chain.Accounts)
}

export type EventsOpts = {
  workspace: string
  name: string
  height: number
  minHeight: number
  maxHeight: number
  extended: boolean
  json: boolean
}

export async function events(opts: EventsOpts): Promise<TxEvent[]> {
  const runtime = loadWorkspace(opts.workspace)
  const found = filterContainers(runtime, opts.name)
  const chain = runtime.ChainSets.find((c) => c.Name === found.name)
  if (!chain) throw new Error(`Expected any chain`)

  const events: TxEvent[] = []

  await self.events(chain, opts, (event: TxEvent) => {
    events.push(event)
  })

  return events
}
