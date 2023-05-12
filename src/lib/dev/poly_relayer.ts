import { newContainer, containerConfig, Container, containerFromId } from './docker'
import * as utils from '../utils/index.js'
import winston from 'winston'
import { ProcessOutput } from 'zx-cjs'
import {
  ChainSetsRunObj,
  CosmosChainSet,
  isCosmosChain,
  isEvmChain,
  PolyCoreContractDeployment,
  RelayerRunObj
} from './schemas'

export class PolyRelayer {
  container: Container
  logger: winston.Logger

  private readonly binary = '/polyrelayer/polyrelayer'

  private constructor(container: Container, logger: winston.Logger) {
    this.logger = logger
    this.container = container
  }

  static async create(workDir: string, logger: winston.Logger): Promise<PolyRelayer> {
    const containerDir = utils.ensureDir(utils.path.join(workDir, 'vibc-relayer'))
    const relayerLogger = utils.createLogger({
      Level: logger.level as any,
      Transports: [utils.path.join(containerDir, 'log')]
    })
    const relayerDockerConfig: containerConfig = {
      imageRepoTag: `ghcr.io/polymerdao/vibc-relayer:7df54e1`,
      detach: true,
      tty: true,
      workDir: '/tmp',
      entrypoint: 'sh',
      volumes: [[containerDir, '/tmp']]
    }
    const container = await newContainer(relayerDockerConfig, relayerLogger)
    logger.verbose(`host dir: ${containerDir}`)
    return new PolyRelayer(container, relayerLogger)
  }

  static async reuse(runtime: RelayerRunObj, logger: winston.Logger): Promise<PolyRelayer> {
    const container = await containerFromId(runtime.ContainerId, logger)
    return new PolyRelayer(container, logger)
  }

  async events(
    expected: number,
    eventTypes: string[] = [],
    retries: number = 20,
    delay: number = 5000
  ): Promise<any[]> {
    for (let i = 0; i < retries; i++) {
      const out = await this.container.exec([this.binary, 'event_log'])
      const allEvents = JSON.parse(out.stdout) as any[]
      this.logger.info(`Found ${allEvents.length} events`)
      const filteredEvents = allEvents.filter(
        (eventLog) => eventTypes.includes(eventLog.event_name) || eventTypes.length === 0
      )
      this.logger.info(`Found ${filteredEvents.length} events`)
      if (filteredEvents.length === expected) {
        return filteredEvents
      }
      await utils.sleep(delay)
    }
    // return something to signal the caller that we couldn't find the expected number of events
    return Array.from(Array(expected + 1).keys())
  }

  async exec(commands: string[], tty = false, detach = false): Promise<ProcessOutput> {
    return await this.container.exec(commands, tty, detach).then(
      (resolve) => resolve,
      (reject) => reject
    )
  }

  async setup(config: any): Promise<ProcessOutput> {
    this.logger.info(`Setting up relayer with config: ${JSON.stringify(config)}`)
    return await this.exec([this.binary, 'setup', '-c', JSON.stringify(config)])
  }

  /// TODO add schema for returning value
  public config(
    runObj: ChainSetsRunObj,
    dispatcherContracts: PolyCoreContractDeployment,
    paths: string[][],
    configSettings: any = {}
  ): any {
    Object.keys(dispatcherContracts).forEach((chainId) => {
      if (runObj.ChainSets.find((c) => c.Name === chainId) === undefined) {
        throw new Error(`Invalid dispatcher contract configuration: unknown chain ${chainId}`)
      }
    })

    for (const path of paths) {
      if (path.length !== 2) throw new Error(`Invalid path. Expected: ['src','dst'], goat: ${path}`)
    }

    return this.createConfigObject(runObj, dispatcherContracts, paths, configSettings)
  }

  private createConfigObject(
    runObj: ChainSetsRunObj,
    dispatcherContracts: PolyCoreContractDeployment,
    paths: string[][],
    configSettings: any = {}
  ): any {
    const relayerConfig = {
      global: { 'polling-idle-time': 10000 },
      chains: {},
      paths: {}
    }

    for (const chain of runObj.ChainSets) {
      // Only care about chains that are part of any path
      if (!paths.some((p) => p.some((s) => s === chain.Name))) continue

      // TODO: only work with EVM and Polymer chains. For that, we need the polymer chain type.
      // Eth2 would be handled by its own relayer
      let chainType = ''
      if (isEvmChain(chain.Type)) chainType = 'evm'
      else if (isCosmosChain(chain.Type)) chainType = 'cosmos'
      else continue

      relayerConfig.chains[chain.Name] = {
        'rpc-url': chain.Nodes[0].RpcContainer,
        'chain-type': chainType,
        'account-prefix': 'unsetPrefix',
        account: chain.Accounts![0]
      }
      if (chainType === 'cosmos') {
        relayerConfig.chains[chain.Name]['account-prefix'] = (chain as CosmosChainSet).Prefix
      }

      const dispatcher = dispatcherContracts[chain.Name]
      if (dispatcher) relayerConfig.chains[chain.Name].dispatcher = dispatcher
    }

    for (const path of paths) {
      const [src, dst] = path
      relayerConfig.paths[src + '-' + dst] = {
        src: {
          'chain-id': src,
          'client-id': configSettings.src_client_id || 'client-id-src',
          'forward-block-headers': configSettings['forward-block-headers'] || false
        },
        dst: {
          'chain-id': dst,
          'client-id': configSettings.dst_client_id || 'client-id-dst',
          'forward-block-headers': configSettings['forward-block-headers'] || false
        },
        'src-channel-filter': null
      }
    }
    return relayerConfig
  }

  async run(): Promise<ProcessOutput> {
    return await this.exec(['sh', '-c', `${this.binary} run 1>/proc/1/fd/1 2>/proc/1/fd/2`], true, true)
  }

  async restart(): Promise<ProcessOutput> {
    await this.exec(['killall', 'node'])
    await this.exec(['rm', '/data/eventlog.log'])
    return await this.run()
  }

  async getConfig(): Promise<ProcessOutput> {
    return await this.exec(['cat', '/data/config.json'])
  }

  async runtime(): Promise<RelayerRunObj> {
    const config = await this.getConfig()
    return {
      Name: 'vibc-relayer',
      ContainerId: this.container.containerId,
      // TODO: parse using the actual schema
      Configuration: JSON.parse(config.stdout)
    }
  }

  async createLightClient(srcChainId: string, dstChainId: string, lcType: string): Promise<ProcessOutput> {
    const path = `${srcChainId}-${dstChainId}`
    this.logger.info(`Creating light client type '${lcType}' on path '${path}'`)
    return await this.exec([this.binary, 'create-light-client', '--path', path, '--lc-type', lcType])
  }
}
