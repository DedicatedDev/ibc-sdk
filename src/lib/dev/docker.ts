import { Writable } from 'stream'
import { z } from 'zod'
import { $, nothrow, ProcessOutput } from 'zx-cjs'
import { getLogger } from '../../lib/utils/logger'

const log = getLogger()

const stringPair = z.array(z.string()).length(2)

const containerSchema = z.object({
  imageRepoTag: z.string().min(1),
  args: z.array(z.string()).nullish().default([]),
  exposedPorts: z.array(z.string()).nullish().default([]),
  /** Attached container volumes. Array of length-2 arrays, [[hostPath, containerPath]*] */
  volumes: z.array(stringPair).nullish().default([]),
  detach: z.boolean().nullish().default(false),
  tty: z.boolean().nullish().default(false),
  workDir: z.string().nullish(),
  entrypoint: z.string().nullish(),
  publishAllPorts: z.boolean().nullish().default(true),
  binaries: z.array(z.string()).nullish().default([]),
  remove: z.array(z.string()).nullish().default([]),
  label: z.string().nullish().default('main')
})

export type containerConfig = z.input<typeof containerSchema>

function metadata(config: containerConfig): string {
  return JSON.stringify({ binaries: config.binaries, remove: config.remove })
}

function parseConfig(config: containerConfig): [containerConfig, string[]] {
  const parsed = containerSchema.parse(config)
  const args = ['docker', 'container', 'run', '--log-driver', 'local', '--log-opt', 'mode=non-blocking']

  if (parsed.entrypoint) {
    args.push('--entrypoint', parsed.entrypoint)
  }
  if (parsed.workDir) {
    args.push('--workdir', parsed.workDir)
  }
  for (const [hostPath, containerPath] of parsed.volumes!) {
    args.push('--volume', `${hostPath}:${containerPath}`)
  }
  for (const exposedPort of parsed.exposedPorts!) {
    args.push('--expose', exposedPort)
  }
  if (parsed.publishAllPorts) {
    args.push('--publish-all')
  }
  if (parsed.detach) {
    args.push('--detach')
  }
  if (parsed.tty) {
    args.push('--tty')
  }
  if (parsed.label) {
    args.push('--label', 'org.polymerlabs.label=' + parsed.label)
  }
  args.push('--label', 'org.polymerlabs.runner=ibc-sdk')
  args.push('--label', 'org.polymerlabs.metadata=' + metadata(parsed))
  args.push(parsed.imageRepoTag)
  if (parsed.args) {
    args.push(...parsed.args)
  }

  return [parsed, args]
}

/**
 * Runs a new Docker container and returns
 * to stdout.
 * @param config
 * @returns
 */
export async function runContainer(config: containerConfig): Promise<ProcessOutput> {
  const [_, args] = parseConfig(config)
  log.debug(`running container: ${args.map($.quote).join(' ')}`)
  return await $`${args}`
}

/**
 * Create a new Docker container instance. Currently only supports Docker run detach mode, where container ID is printed
 * to stdout.
 * @param config
 * @returns
 */
export async function newContainer(config: containerConfig, reuse: boolean = false): Promise<Container> {
  const [parsed, args] = parseConfig(config)

  if (reuse) {
    try {
      return await containerFromTag(parsed.imageRepoTag)
    } catch {
      log.debug("couldn't find a running container. Will create a new one")
    }
  }

  log.debug(`creating container: ${args.map($.quote).join(' ')}`)
  const process = $`${args}`
  process.child?.unref()
  const out = await process
  const containerId = out.stdout.trim()
  if (containerId.length < 2) {
    throw new Error(`didn't get a valid container ID with args: ${args.map($.quote).join(' ')}`)
  }
  log.debug(`created container with ${parsed.imageRepoTag}`)
  return new Container(containerId)
}

async function reuseContainer(filters: string[]): Promise<Container> {
  const args = ['docker', 'container', 'ls', '--latest', '--quiet', '--filter', 'status=running']
  for (const filter of filters) args.push('--filter', filter)

  const out = await $`${args}`
  const containerId = out.stdout.trim()
  if (containerId.length < 2) {
    throw new Error(`didn't get a valid container ID with args: ${args.map($.quote).join(' ')}`)
  }
  return new Container(containerId, true)
}

export async function containerFromTag(imageRepoTag: string): Promise<Container> {
  return await reuseContainer([`ancestor=${imageRepoTag}`])
}

export async function containerFromId(id: string): Promise<Container> {
  return await reuseContainer([`id=${id}`])
}

export async function removeStaleContainers() {
  const args = ['docker', 'ps', '--filter=label=org.polymerlabs.runner=ibc-sdk', '--format={{ .ID }}']
  const out = await nothrow($`${args}`)
  if (out.exitCode !== 0) {
    log.warn(`could not remove stale containers: ${out.stderr.trim()}`)
    return
  }
  const containers = out.stdout.trim()
  if (containers.length === 0) {
    log.debug('no stale containers were found')
    return
  }
  for (const c of containers.split('\n')) {
    log.debug(`removing stale container: ${c}`)
    await $`docker container rm -f ${c}`
  }
}

export type ExecStdinCallback = (stdin: Writable) => void

export type LogsConfiguration = {
  stdout: Writable
  stderr: Writable
  follow?: boolean
  timestamps?: boolean
  since?: string
  until?: string
  tail?: string
}

export class Container {
  readonly containerId: string
  readonly reused: boolean

  constructor(containerId: string, reused: boolean = false) {
    this.containerId = containerId.substring(0, 12)
    this.reused = reused
  }

  async getPortMap(): Promise<Map<string, string>> {
    const args = ['docker', 'inspect', this.containerId, `--format={{(json .NetworkSettings.Ports) }}`]
    const out = await $`${args}`
    const parsed = JSON.parse(out.stdout.trim())
    const m = new Map<string, string>()
    for (const key of Object.getOwnPropertyNames(parsed)) {
      const first = parsed[key][0]
      if (!first) continue
      if (!first.HostPort) throw new Error(`no HostPort found for port '${key}'`)
      m.set(key, first.HostPort)
    }
    return m
  }

  async copyFileToContainer(hostFilePath: string, containerFilePath: string) {
    const args = ['docker', 'cp', hostFilePath, this.containerId + ':' + containerFilePath]
    const out = await $`${args}`
    if (out.exitCode !== 0) {
      throw Error(
        `Non-0 exit code when copying host [${hostFilePath}] to container ${containerFilePath} in container [${this.containerId}]`
      )
    }
    return out
  }

  /**
   * Get the container ip within docker network.
   * @param network docker network name. Default 'bridge' if no network arg provided with `docker run`
   * @returns IP address within docker network which can be used by another container within the same network
   */
  async getIPAddress(network = 'bridge'): Promise<string> {
    const args = [
      'docker',
      'inspect',
      this.containerId,
      `--format={{( json .NetworkSettings.Networks.${network}.IPAddress) }}`
    ]
    const out = await $`${args}`
    const ipAddress = JSON.parse(out.stdout.trim())
    if (ipAddress.length < 3) {
      throw new Error(`cannot get IP address of container ${this.containerId} in network '${network}'`)
    }
    return ipAddress
  }

  /**
   * Return the host dir mounted on the container
   */
  async getMountPath(): Promise<string> {
    const args = ['docker', 'inspect', this.containerId, '--format={{range .Mounts}}{{.Source}}{{end}}']
    const out = await nothrow($`${args}`)
    return out.stdout.split('\n').shift() || ''
  }

  async getLabel(label: string): Promise<string> {
    const args = ['docker', 'inspect', this.containerId, `--format={{ index .Config.Labels "${label}" }}`]
    const out = await nothrow($`${args}`)
    return out.stdout.split('\n').shift() || ''
  }

  async isHealthy(): Promise<boolean> {
    const args = ['docker', 'inspect', this.containerId, '--format={{ .State.Health.Status }}']
    const out = await nothrow($`${args}`)
    return out.stdout.trim() === 'healthy'
  }

  /**
   * Run `docker exec` command in current container
   * @param cmds full command args to execute in container. Unlike `docer run`, `docker exec` does not take
   * `--entrypoint` arg into consideration. So the first arg should be the executable to run.
   * @param tty default false means no tty allocated
   * @param detach default false means wait for command to finish and capture stdout/stderr
   * @param stdincb default null. When set, this callback is called with a reference to the child process' stdin
   * @returns zx.ProcessOutput where stdout/stderr are captured
   */
  async exec(cmds: string[], tty = false, detach = false, stdincb?: ExecStdinCallback) {
    const allArgs = ['docker', 'container', 'exec']
    if (typeof stdincb !== 'undefined') allArgs.push('--interactive')
    if (tty) allArgs.push('--tty')
    if (detach) allArgs.push('--detach')
    allArgs.push(this.containerId)
    allArgs.push(...cmds)
    log.debug(allArgs.map($.quote).join(' '))
    try {
      const proc = $`${allArgs}`
      if (typeof stdincb !== 'undefined') stdincb(proc.stdin)
      const out = await proc
      log.debug(`stdout: ${out.stdout}`)
      log.debug(`stderr: ${out.stderr}`)
      return out
    } catch (e) {
      log.error(allArgs.map($.quote).join(' '))
      throw e
    }
  }

  async logs(config: LogsConfiguration) {
    const cmds = ['docker', 'logs', this.containerId]
    if (config.follow) cmds.push('--follow')
    if (config.timestamps) cmds.push('--timestamps')
    if (config.since) cmds.push('--since', config.since)
    if (config.until) cmds.push('--until', config.until)
    if (config.tail) cmds.push('--tail', config.tail)

    // this is not optimal. we are converting the byte stream into a string so we can then apply a regex.
    // there's probably a more efficient way of doing it but it is not critical.
    // the trick here is that we need to remove this weird sequence that causes havoc in the output.
    const cleaner = (stream: Writable, data: any) => {
      stream.write(data.toString('utf-8').replace(/\u001b\u005b\u0036\u006e/g, ''))
    }

    const logs = $`${cmds}`
    logs.stdout.on('data', (chunk: any) => cleaner(config.stdout, chunk))
    logs.stderr.on('data', (chunk: any) => cleaner(config.stderr, chunk))
    return logs
  }

  async kill() {
    const metadata = await (async () => {
      try {
        return JSON.parse(await this.getLabel('org.polymerlabs.metadata'))
      } catch {
        return null
      }
    })()

    if (metadata) {
      if (metadata.binaries.length > 0)
        await this.exec(['killall', ...metadata.binaries]).catch((e) => log.warn(e.toString().trim()))
      if (metadata.remove.length > 0)
        await this.exec(['rm', '-rf', ...metadata.remove]).catch((e) => log.warn(e.toString().trim()))
    }

    await $`docker container rm -f ${this.containerId}`
  }
}

class DockerImage {
  public repo: string
  public tag: string
  public label: string

  constructor(repo: string, defaultTag: string, envTag: string, label: string = 'main') {
    this.repo = repo
    this.label = label
    this.tag = process.env[envTag] || defaultTag
  }

  public full(): string {
    return this.repo + ':' + this.tag
  }
}

const prysmDefaultTag = 'v4.0.3-light-client-1'
export const images = {
  bsc: new DockerImage('ghcr.io/polymerdao/bsc', '1.1.10', 'BSC_DOCKER_IMAGE_TAG'),
  ethereum: new DockerImage('ethereum/client-go', 'v1.10.26', 'ETH_DOCKER_IMAGE_TAG'),
  ethRelayer: new DockerImage('ghcr.io/polymerdao/eth-relayer', 'v0.0.1-rc2', 'ETH_RELAYER_DOCKER_IMAGE_TAG'),
  ibcRelayer: new DockerImage(
    'ghcr.io/polymerdao/ts-relayer',
    'v0.8.0-packet-data-hex-1',
    'IBC_RELAYER_DOCKER_IMAGE_TAG'
  ),
  ibcGoRelayer: new DockerImage('ghcr.io/polymerdao/relayer', 'v2.2.0-multihop-1', 'IBC_GO_RELAYER_DOCKER_IMAGE_TAG'),
  polymer: new DockerImage('ghcr.io/polymerdao/polymer', 'v0.0.1-rc2', 'POLYMER_DOCKER_IMAGE_TAG'),
  prysmMain: new DockerImage('ghcr.io/polymerdao/prysm-beacon-chain', prysmDefaultTag, 'PRYSM_BEACON_DOCKER_IMAGE_TAG'),
  prysmValidator: new DockerImage(
    'ghcr.io/polymerdao/prysm-validator',
    prysmDefaultTag,
    'PRYSM_VALIDATOR_DOCKER_IMAGE_TAG',
    'validator'
  ),
  prysmGenesis: new DockerImage(
    'ghcr.io/polymerdao/prysm-prysmctl',
    prysmDefaultTag,
    'PRYSM_GENESIS_DOCKER_IMAGE_TAG',
    'genesis'
  ),
  vibcRelayer: new DockerImage('ghcr.io/polymerdao/vibc-relayer', 'v0.0.1-rc1', 'VIBC_RELAYER_DOCKER_IMAGE_TAG'),
  wasm: new DockerImage('ghcr.io/polymerdao/wasm', 'v0.40.0-multihop-1', 'WASM_DOCKER_IMAGE_TAG')
}
