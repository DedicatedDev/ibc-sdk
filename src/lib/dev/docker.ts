import { Writable } from 'stream'
import { z } from 'zod'
import { $, Logger, zx } from './deps.js'

const stringPair = z.array(z.string()).length(2)

const containerSchema = z.object({
  imageRepoTag: z.string().min(1),
  args: z.array(z.string()).nullish().default([]),
  exposedPorts: z.array(z.string()).nullish().default([]),
  /** Attached container volumns. Array of length-2 arrays, [[hostPath, containerPath]*] */
  volumes: z.array(stringPair).nullish().default([]),
  detach: z.boolean().nullish().default(false),
  tty: z.boolean().nullish().default(false),
  workDir: z.string().nullish(),
  entrypoint: z.string().nullish(),
  publishAllPorts: z.boolean().nullish().default(true),
  label: z.string().nullish().default('<empty>')
})

export type containerConfig = z.input<typeof containerSchema>

// TODO: support non-detach mode? In two steps: First create a container instance, then start it, ie. `docker container
// create; docker container start`. Cannot use `docker run` directly
/**
 * Create a new Docker container instance. Currently only supports Docker run detach mode, where container ID is printed
 * to stdout.
 * @param config
 * @param logger
 * @returns
 */
export async function newContainer(
  config: containerConfig,
  logger: Logger,
  reuse: boolean = false
): Promise<Container> {
  const parsed = containerSchema.parse(config)

  if (reuse) {
    try {
      return await containerFromTag(parsed.imageRepoTag, logger)
    } catch {
      logger.info("couldn't find a running container. Will create a new one")
    }
  }
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
    args.push('--label', 'label=' + parsed.label)
  }
  args.push(parsed.imageRepoTag)
  if (parsed.args) {
    args.push(...parsed.args)
  }
  logger.verbose(`creating container: ${args.map($.quote).join(' ')}`)
  const process = $`${args}`
  process.child?.unref()
  const out = await process
  const containerId = out.stdout.trim()
  if (containerId.length < 2) {
    throw new Error(`didn't get a valid container ID with args: ${args.map($.quote).join(' ')}`)
  }
  logger.verbose(`created container with ${parsed.imageRepoTag}`)
  return new Container(containerId, logger)
}

async function reuseContainer(filters: string[], logger: Logger): Promise<Container> {
  const args = ['docker', 'container', 'ls', '--latest', '--quiet', '--filter', 'status=running']
  for (const filter of filters) args.push('--filter', filter)

  const out = await $`${args}`
  const containerId = out.stdout.trim()
  if (containerId.length < 2) {
    throw new Error(`didn't get a valid container ID with args: ${args.map($.quote).join(' ')}`)
  }
  return new Container(containerId, logger, true)
}

export async function containerFromTag(imageRepoTag: string, logger: Logger): Promise<Container> {
  return await reuseContainer([`ancestor=${imageRepoTag}`], logger)
}

export async function containerFromId(id: string, logger: Logger): Promise<Container> {
  return await reuseContainer([`id=${id}`], logger)
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
  readonly logger: Logger
  readonly reused: boolean

  constructor(containerId: string, logger: Logger, reused: boolean = false) {
    this.containerId = containerId.substring(0, 12)
    this.logger = logger
    this.reused = reused
  }

  async getPortMap(): Promise<Map<string, string>> {
    // sample output
    //  docker inspect containerId --format='{{(json .NetworkSettings.Ports) }}'
    // {"1318/tcp":[{"HostIp":"0.0.0.0","HostPort":"55394"}],"26657/tcp":[{"HostIp":"0.0.0.0","HostPort":"55393"}]}
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
    const out = await zx.nothrow($`${args}`)
    return out.stdout.split('\n').shift() || ''
  }

  async getLabel(): Promise<string> {
    const args = ['docker', 'inspect', this.containerId, '--format={{ .Config.Labels.label }}']
    const out = await zx.nothrow($`${args}`)
    return out.stdout.split('\n').shift() || ''
  }

  async isHealthy(): Promise<boolean> {
    const args = ['docker', 'inspect', this.containerId, '--format={{ .State.Health.Status }}']
    const out = await zx.nothrow($`${args}`)
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
    this.logger.verbose(allArgs.map($.quote).join(' '))
    try {
      const proc = $`${allArgs}`
      if (typeof stdincb !== 'undefined') stdincb(proc.stdin)
      const out = await proc
      this.logger.verbose(`stdout: ${out.stdout}`)
      this.logger.verbose(`stderr: ${out.stderr}`)
      return out
    } catch (e) {
      this.logger.error(allArgs.map($.quote).join(' '))
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
}

class DockerImage {
  public repo: string
  public tag: string
  public label: string

  constructor(repo: string, tag: string, label: string = 'main') {
    this.repo = repo
    this.tag = tag
    this.label = label
  }
  public full(): string {
    return this.repo + ':' + this.tag
  }
}

export const images = {
  polymer: new DockerImage('ghcr.io/polymerdao/polymerase', 'sha-360007b'),
  ethereum: new DockerImage('ethereum/client-go', 'v1.10.26'),
  prysm_main: new DockerImage('ghcr.io/polymerdao/prysm-beacon-chain', '1eaa9a-debug'),
  prysm_validator: new DockerImage('ghcr.io/polymerdao/prysm-validator', '1eaa9a-debug', 'validator'),
  prysm_genesis: new DockerImage('ghcr.io/polymerdao/prysmctl', '1eaa9a-debug', 'genesis'),
  wasm: new DockerImage('ghcr.io/polymerdao/wasm', 'v0.40.0-rc.0-ibcx-noproof'),
  eth_relayer: new DockerImage('ghcr.io/polymerdao/eth-relayer', 'sha-360007b'),
  vibc_relayer: new DockerImage('ghcr.io/polymerdao/vibc-relayer', 'sha-360007b'),
  ibc_relayer: new DockerImage('ghcr.io/polymerdao/ibc-relayer', 'sha-360007b'),
  chain_client: new DockerImage('ghcr.io/polymerdao/chain_client', '8bd1785')
}
