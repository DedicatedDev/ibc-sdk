import { images, newContainer, containerConfig, Container, containerFromId } from './docker'
import * as utils from '../utils/index.js'
import winston from 'winston'
import { ProcessOutput } from 'zx-cjs'
import { ChainSetsRunObj, CosmosChainSet, isCosmosChain, isEvmChain, RelayerRunObj } from './schemas'

export class VIBCRelayer {
  container: Container
  logger: winston.Logger

  private readonly binary = '/vibc-relayer/vibc-relayer'

  private constructor(container: Container, logger: winston.Logger) {
    this.logger = logger
    this.container = container
  }

  static async create(workDir: string, logger: winston.Logger): Promise<VIBCRelayer> {
    const containerDir = utils.ensureDir(utils.path.join(workDir, 'vibc-relayer'))
    const relayerLogger = utils.createLogger({
      Level: logger.level as any,
      Transports: [utils.path.join(containerDir, 'log')]
    })
    const relayerDockerConfig: containerConfig = {
      imageRepoTag: images.vibc_relayer.full(),
      detach: true,
      tty: true,
      workDir: '/tmp',
      entrypoint: 'sh',
      volumes: [[containerDir, '/tmp']]
    }
    const container = await newContainer(relayerDockerConfig, relayerLogger)
    logger.verbose(`host dir: ${containerDir}`)
    return new VIBCRelayer(container, relayerLogger)
  }

  static async reuse(runtime: RelayerRunObj, logger: winston.Logger): Promise<VIBCRelayer> {
    const container = await containerFromId(runtime.ContainerId, logger)
    return new VIBCRelayer(container, logger)
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
  public config(runObj: ChainSetsRunObj, paths: string[][]): any {
    for (const path of paths) {
      if (path.length !== 2) throw new Error(`Invalid path. Expected: ['src','dst'], goat: ${path}`)
    }

    const relayerConfig = {
      global: { 'polling-idle-time': 10000 },
      chains: {},
      paths: {}
    }

    for (const chain of runObj.ChainSets) {
      // Only care about chains that are part of any path
      if (!paths.some((p) => p.some((s) => s === chain.Name))) continue

      if (!isEvmChain(chain.Type) && !isCosmosChain(chain.Type)) continue

      relayerConfig.chains[chain.Name] = {
        'rpc-url': chain.Nodes[0].RpcContainer,
        'chain-type': isEvmChain(chain.Type) ? 'evm' : 'cosmos',
        'account-prefix': 'unsetPrefix',
        account: chain.Accounts![0]
      }

      if (isCosmosChain(chain.Type)) {
        relayerConfig.chains[chain.Name]['account-prefix'] = (chain as CosmosChainSet).Prefix
        continue
      }

      const dispatcher = chain.Contracts.find((c) => c.Name === 'Dispatcher')
      if (!dispatcher) throw new Error(`Missing dispatcher contract on chain ${chain.Name}`)
      relayerConfig.chains[chain.Name].dispatcher = {
        address: dispatcher.Address,
        abi: dispatcher.Abi
      }
    }

    for (const path of paths) {
      const [src, dst] = path
      relayerConfig.paths[src + '-' + dst] = {
        src: {
          'chain-id': src,
          // TODO: update me with real client id
          'client-id': 'client-id-src'
        },
        dst: {
          'chain-id': dst,
          // TODO: update me with real client id
          'client-id': 'client-id-dst'
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
