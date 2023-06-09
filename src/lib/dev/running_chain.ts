import { clone, utils } from './deps.js'
import { Logger, path } from '../utils/index.js'
import { Container } from './docker.js'
import { Accounts } from './accounts_config.js'
import { ChainConfig, ChainSetsRunObj, ImageLabelTypes, RunningNodeConfig } from './schemas.js'

export type NodeAccounts = ChainSetsRunObj['ChainSets'][number]

export interface RunningChain {
  start(dependencyRuntime: NodeAccounts[]): Promise<void>
  getRunObj(): Promise<NodeAccounts>
}

export type RunningChainCreator = (
  config: ChainConfig,
  hostDir: string,
  reuse: boolean,
  logger: Logger
) => Promise<RunningChain>

export class EndPoint {
  readonly protocol: string
  readonly host: string
  readonly port: string
  // suffix normally is nullish for most chains' rpc url.
  // suffix should starts with /, eg. 'ext/bc/C/rpc'
  readonly suffix?: string

  constructor(protocol: string, host: string, port: string, suffix?: string) {
    this.protocol = protocol
    this.host = host
    this.port = port
    this.suffix = suffix
  }

  /** Return a new EndPoint with a new host (host name or ip address) */
  withHost(host: string): EndPoint {
    return new EndPoint(this.protocol, host, this.port, this.suffix)
  }

  /** Return a new EndPoint with a new port */
  withPort(port: string): EndPoint {
    return new EndPoint(this.protocol, this.host, port, this.suffix)
  }

  get address(): string {
    return this.suffix
      ? `${this.protocol}://${this.host}:${this.port}${this.suffix}`
      : `${this.protocol}://${this.host}:${this.port}`
  }

  get addressNoProto(): string {
    return this.suffix ? `${this.host}:${this.port}${this.suffix}` : `${this.host}:${this.port}`
  }
}

export abstract class RunningChainBase<ConfigType extends ChainConfig> {
  /**  should set rpcEndpoint to the default chain rpc endpoint,
  eg. http://0.0.0.0:8545 for Geth; tcp://0.0.0.0:26657 for Cosmos chain */
  abstract rpcEndpoint: EndPoint
  protected logger: Logger
  protected config: ConfigType
  private containers: Map<ImageLabelTypes, Container>
  private runObj?: NodeAccounts
  // all I/O for host should be confined within hostWd
  protected hostWd: string
  // concrete accounts used in chain genesis
  protected accounts?: Accounts

  protected readonly entrypointStdout = '/proc/1/fd/1'
  protected readonly entrypointStderr = '/proc/1/fd/2'

  constructor(config: ConfigType, wd: string, logger: Logger) {
    this.containers = new Map()
    this.config = config
    this.hostWd = wd
    this.logger = logger
  }

  abstract start(dependencyRuntime: NodeAccounts[]): Promise<void>

  abstract generateAccounts(config: any): Promise<Accounts>

  protected setContainer(label: ImageLabelTypes, container: Container) {
    this.containers.set(label, container)
  }

  protected getContainer(label: ImageLabelTypes): Container {
    const container = this.containers.get(label)
    if (!container) throw new Error(`Chain ${this.config.Name} does not have a container labeled ${label.toString()}`)
    return container
  }

  static getContainerDataDir(label: ImageLabelTypes = ImageLabelTypes.Main): string {
    return utils.path.join('/tmp', label.toString())
  }

  protected async isReusingContainer(): Promise<boolean> {
    // if any container is not reused, then none are
    for (const container of this.containers.values()) {
      if (container.reused) continue
      this.logger.info(`Will not reuse containers because container ${container.containerId} is not reusing`)
      return false
    }
    const reusedWd = await this.getContainer(ImageLabelTypes.Main).getMountPath()
    if (!utils.fs.existsSync(reusedWd)) {
      this.logger.info(`previous wd '${reusedWd}' does not exist`)
      return false
    }
    utils.fs.rmSync(this.hostWd, { recursive: true })
    utils.fs.symlinkSync(reusedWd, this.hostWd, 'dir')
    this.hostWd = reusedWd
    this.logger.info(`Reusing wd: '${this.hostWd}'`)
    return true
  }

  protected checkAccounts() {
    if (!this.accounts) {
      throw new Error(`chain [${this.config.Name}] accounts are not initialized. ensure start() is called and awaited.`)
    }
  }

  async getRunObj(): Promise<NodeAccounts> {
    // return cached value if it exists
    if (this.runObj) return this.runObj
    this.checkAccounts()
    this.runObj = await this.createRunObj()
    return this.runObj
  }

  protected async createNodeConfig(): Promise<RunningNodeConfig[]> {
    const nodes: RunningNodeConfig[] = []
    for (const [label, container] of this.containers) {
      const portMap = await container.getPortMap()
      // ports bind to tcp by default, the case for chain rpc endpoints
      const conatinerPort = `${this.rpcEndpoint.port}/tcp`
      const rpcHostPort = portMap.get(conatinerPort)
      if (!rpcHostPort) {
        throw new Error(`Cannot find host port for port '${conatinerPort}' in container ${container.containerId}`)
      }
      const containerIp = await container.getIPAddress()
      nodes.push({
        Label: label,
        ContainerId: container.containerId,
        RpcHost: this.rpcEndpoint.withHost('localhost').withPort(rpcHostPort).address,
        RpcContainer: this.rpcEndpoint.withHost(containerIp).address
      })
    }
    return nodes
  }

  protected async createRunObj(): Promise<NodeAccounts> {
    const copyAny: any = clone(this.config)
    delete copyAny.Accounts
    const copy: NodeAccounts = copyAny

    copy.Nodes = await this.createNodeConfig()
    copy.Accounts = this.accounts!
    return copy
  }

  // get full path for a relative path on host
  protected hostPath(...paths: string[]): string {
    return path.normalize(path.join(this.hostWd, ...paths))
  }

  protected async loadAccounts(): Promise<void> {
    const accountsFile = utils.path.join(this.hostWd, 'accounts.json')
    try {
      this.accounts = JSON.parse(utils.fs.readFileSync(accountsFile, 'utf-8'))
      this.logger.info(`Accounts loaded from ${accountsFile}`)
    } catch {
      this.logger.info(`Could not load accounts. Will generate them`)
      this.accounts = await this.generateAccounts(this.config.Accounts!)
      utils.fs.writeFileSync(accountsFile, JSON.stringify(this.accounts))
      this.logger.info(`Accounts generated`)
    }
  }
}
