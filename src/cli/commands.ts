import path from 'path'
import * as winston from 'winston'
import { utils } from '../lib'
import { $, fs } from '../lib/utils'
import { configTemplate } from './config.template'
import { contractsTemplate } from './contracts.template'
import * as self from '../lib/index.js'
import { channelHandshake } from './channel'
import { EndpointInfo, Packet } from '../lib/dev/query'
import { ChainSetsRunObj, imageByLabel, ImageLabelTypes, isCosmosChain, isEvmChain } from '../lib/dev/schemas'
import { containerFromId } from '../lib/dev/docker'
import { ProcessOutput } from 'zx-cjs'
import { ethers } from 'ethers'

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

async function wrapCosmosCommand(args: string[], opts: WrapCommandsOpts, log: winston.Logger) {
  const runtime = loadWorkspace(opts.workspace)

  const found = filterContainers(runtime, opts.name)
  const chain = runtime.ChainSets.find((c) => c.Name === found.name)
  if (!chain || !isCosmosChain(chain.Type)) {
    throw new Error(`Expected a cosmos chain, got ${chain?.Type}`)
  }

  const container = await containerFromId(chain.Nodes[0].ContainerId, log)
  const bin = imageByLabel(chain.Images, ImageLabelTypes.Main)!.Bin!
  const fmt = opts.json ? 'json' : 'text'
  printOutput(await container.exec([bin, '--output', fmt, ...args]))
}

function loadWorkspace(workdir: string): ChainSetsRunObj {
  const workspace = path.resolve(path.join(workdir, 'run'))
  const runPath = path.join(workspace, 'run.json')
  if (!fs.existsSync(runPath)) {
    throw new Error(`could not read runtime file: ${runPath}`)
  }
  return self.dev.schemas.runningChainSetsSchema.parse(JSON.parse(utils.fs.readFileSync(runPath, 'utf-8')))
}

function printOutput(out: ProcessOutput) {
  if (out.stdout.length > 0) process.stdout.write(out.stdout)
  if (out.stderr.length > 0) process.stderr.write(out.stderr)
}

type InitOpts = {
  workspace: string
}

const polyCoreContracts = 'polycore-smart-contracts'

export async function init(opts: InitOpts, log: winston.Logger) {
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

  const contractsDir = path.join(workspace, polyCoreContracts)
  fs.mkdirSync(contractsDir)

  // TODO: tidy up output?
  await $`echo -e ${contractsTemplate.trim()} | base64 -d | tar zxv -C ${contractsDir}`.catch((reason) => {
    throw new Error(reason)
  })

  const contractsConfig = self.dev.createContractsConfig(contractsDir)
  fs.writeFileSync(path.join(workspace, `${polyCoreContracts}.yaml`), contractsConfig, 'utf-8')

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

export async function start(opts: StartOpts, log: winston.Logger) {
  const configPath = path.join(opts.workspace, configFile)
  if (!fs.existsSync(configPath)) {
    throw new Error(`could not read configuration file: ${configPath}`)
  }
  const config = fs.readFileSync(configPath, 'utf-8')

  const contractsPath = path.join(opts.workspace, `${polyCoreContracts}.yaml`)
  if (!fs.existsSync(contractsPath)) {
    throw new Error(`could not read contracts file: ${contractsPath}`)
  }

  const { runObj: runtime } = await self.dev.runChainSets(config, log).then(...thenClause)
  const contracts = await self.dev.deployPolyCoreContractsOnChainSets(runtime, contractsPath, log).then(...thenClause)

  if (opts.useZkMint) {
    await self.dev.runProver(runtime, log).then(...thenClause)
  }

  await self.dev.runRelayers(runtime, contracts, opts.connection, log).then(...thenClause)
}

export async function show(opts: any) {
  const runtime = loadWorkspace(opts.workspace)

  const line = async (name: string, node: any) => {
    if (node.Label) name = `${name}:${node.Label}`
    let out = { Name: name, 'Container ID': node.ContainerId }

    out['Endpoint'] = node.RpcHost ?? 'N/A'

    const state = await $`docker inspect ${node.ContainerId}  --format='{{.State.Status}}'`
    out['Status'] = state.stdout.trim()

    return out
  }

  const rows: any = []
  for (const chain of runtime.ChainSets) {
    for (const node of chain.Nodes) {
      rows.push(await line(chain.Name, node))
    }
  }

  for (const relayer of runtime.Relayers) {
    rows.push(await line(relayer.Name, relayer))
  }

  if (runtime.Prover) {
    rows.push(await line(runtime.Prover.Name, runtime.Prover));
  }

  console.table(rows)
}

type StopOpts = {
  workspace: string
  prover: boolean
  all: boolean
}

export async function stop(opts: StopOpts, log: winston.Logger) {
  let runtime: ChainSetsRunObj
  try {
    runtime = loadWorkspace(opts.workspace)
  } catch {
    log.warn('Looks like you have already stopped the workspace?')
    return
  }

  for (const relayer of runtime.Relayers) {
    log.info(`Removing '${relayer.Name}' container...`)
    await $`docker container rm -f ${relayer.ContainerId}`
  }

  for (const chain of runtime.ChainSets) {
    for (const node of chain.Nodes) {
      log.info(`Removing '${chain.Name}:${node.Label}' container...`)
      await $`docker container rm -f ${node.ContainerId}`
    }
  }

  if (runtime.Prover && runtime.Prover.CleanupMode !== 'reuse' ) {
    log.info(`Removing zkmint prover container...`)
    try {
      await $`docker container rm -f ${runtime.Prover.ContainerId}`
    } catch (e) {
      log.warn(`Could not remove zkmint prover container: ${e}`)
    }
  }

  fs.rmSync(runtime.Run.WorkingDir, { force: true, recursive: true })

  if (opts.all) {
    log.info('Removing the entire workspace!')
    fs.rmSync(opts.workspace, { force: true, recursive: true })
  }
}

type ExecOpts = {
  workspace: string
  args: string[]
  name: string
}

export async function exec(opts: ExecOpts, log: winston.Logger) {
  const runtime = loadWorkspace(opts.workspace)
  const containerId = filterContainers(runtime, opts.name).id
  const container = await containerFromId(containerId, log)
  printOutput(await container.exec(opts.args))
}

type CreateLightClientOpts = {
  workspace: string
  path: string
  lcType: string
}

export async function createLightClient(opts: CreateLightClientOpts, log: winston.Logger) {
  const runtime = loadWorkspace(opts.workspace)
  const relayer = runtime.Relayers.find((r) => r.Name === 'polyrelayer')
  if (!relayer) throw new Error('Could not find polyrelayer runtime object!')
  await self.dev.createLightClient(relayer, opts.path, opts.lcType, log).then(...thenClause)
}

type DeployOpts = {
  workspace: string
  chain: string
  scpath: string
  scargs: string[]
}

export async function deploy(opts: DeployOpts, log: winston.Logger) {
  const runtime = loadWorkspace(opts.workspace)
  const deployed = await self.dev.deploySmartContract(runtime, opts.chain, opts.scpath, opts.scargs, log)
  console.log(deployed.Address)
}

type ChannelOpts = {
  workspace: string
  srcChain: string
  dstChain: string
  srcAddress: string
  dstAddress: string
}

export async function channel(opts: ChannelOpts, log: winston.Logger) {
  const runtime = loadWorkspace(opts.workspace)

  let src = runtime.ChainSets.find((c) => c.Name === opts.srcChain)
  if (!src) throw new Error(`Could not find endpoint ${src} is chain sets`)

  let dst = runtime.ChainSets.find((c) => c.Name === opts.dstChain)
  if (!dst) throw new Error(`Could not find endpoint ${dst} is chain sets`)

  const poly = runtime.ChainSets.find((c) => c.Type === 'polymer')
  if (!poly) throw new Error('Could not find polymer chain is chain sets')

  const valid = new Set<string>(['cosmos:ethereum', 'ethereum:cosmos'])

  if (!valid.has(`${src.Type}:${dst.Type}`))
    throw new Error(
      `Only the following combinations are currently supported: ${new Array(...valid).join(', ')}. Got: ${src.Type}:${
        dst.Type
      }`
    )

  // replace the ethereum chain with polymer
  src = src.Type === 'ethereum' ? poly : src
  dst = dst.Type === 'ethereum' ? poly : dst

  // always keep polymer as the src chain for convenience
  if (src.Type !== 'polymer') [src, dst] = [dst, src]

  await channelHandshake(
    runtime,
    src as self.dev.schemas.CosmosChainSet,
    opts.srcAddress,
    dst as self.dev.schemas.CosmosChainSet,
    opts.dstAddress,
    log
  )
}

type TracePacketsOpts = {
  workspace: string
  source: EndpointInfo
  destination: EndpointInfo
}

export async function tracePackets(opts: TracePacketsOpts, log: winston.Logger) {
  const runtime = loadWorkspace(opts.workspace)
  if (!opts.source || !opts.destination)
    throw new Error('Invalid argument format. Need to specify both a source and a destination')
  const src = runtime.ChainSets.find((c) => c.Name === opts.source.chainID)
  const dst = runtime.ChainSets.find((c) => c.Name === opts.destination.chainID)
  if (!src || !dst) {
    throw new Error('Could not find chain runtime object!')
  }
  const packets = await self.dev
    .tracePackets(src.Nodes[0].RpcHost, dst.Nodes[0].RpcHost, opts.source, opts.destination, log)
    .then(...thenClause)

  console.table(
    packets.map(
      (packet: Packet) => ({
        ...packet,
        sequence: packet.sequence.toString()
      }),
      ['channelID', 'portID', 'sequence', 'state']
    )
  )
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

export async function logs(opts: LogsOpts, log: winston.Logger) {
  const runtime = loadWorkspace(opts.workspace)
  const containerId = filterContainers(runtime, opts.name).id
  const container = await containerFromId(containerId, log)
  await container.logs({ stdout: process.stdout, stderr: process.stderr, ...opts }).then(...thenClause)
}

type WrapCommandsOpts = {
  workspace: string
  name: string
  json: boolean
}

export async function channels(opts: WrapCommandsOpts, log: winston.Logger) {
  await wrapCosmosCommand(['query', 'ibc', 'channel', 'channels'], opts, log)
}

export async function connections(opts: WrapCommandsOpts, log: winston.Logger) {
  await wrapCosmosCommand(['query', 'ibc', 'connection', 'connections'], opts, log)
}

export async function clients(opts: WrapCommandsOpts, log: winston.Logger) {
  await wrapCosmosCommand(['query', 'ibc', 'client', 'states'], opts, log)
}

export async function tx(opts: WrapCommandsOpts & { tx: string }, log: winston.Logger) {
  const runtime = loadWorkspace(opts.workspace)
  const found = filterContainers(runtime, opts.name)
  const chain = runtime.ChainSets.find((c) => c.Name === found.name)
  if (!chain) throw new Error(`Expected any chain`)

  if (isCosmosChain(chain.Type)) {
    const container = await containerFromId(chain.Nodes[0].ContainerId, log)
    const bin = imageByLabel(chain.Images, ImageLabelTypes.Main)!.Bin!
    const fmt = opts.json ? 'json' : 'text'
    printOutput(await container.exec([bin, '--output', fmt, 'query', 'tx', opts.tx]))
    return
  }

  if (isEvmChain(chain.Type)) {
    const eth = new ethers.providers.JsonRpcProvider(chain.Nodes[0].RpcHost)
    const tx = await eth.getTransaction(opts.tx)
    process.stdout.write(opts.json ? JSON.stringify(tx) : utils.dumpYamlSafe(tx))
    return
  }

  throw new Error(`Cannot query transactions on chain type: ${chain.Type}`)
}

