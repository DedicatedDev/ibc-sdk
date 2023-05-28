import { images, newContainer, containerConfig, Container, containerFromId } from './docker'
import * as utils from '../utils/index.js'
import winston from 'winston'
import { ProcessOutput } from 'zx-cjs'
import { ChainSetsRunObj, isCosmosChain, isEvmChain, RelayerRunObj } from './schemas'
import { CosmosAccount, EvmAccount } from './accounts_config'

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

  async setup(runtime: ChainSetsRunObj, paths: string[][]) {
    for (const p of paths) if (p.length !== 2) throw new Error(`Invalid path. Expected: ['src','dst'], got: ${p}`)

    for (const chain of runtime.ChainSets) {
      const args = {
        '--name': chain.Name,
        '--rpc-url': chain.Nodes[0].RpcContainer,
        '--gas-price': '0.0stake'
      }

      if (isCosmosChain(chain.Type)) {
        const account = chain.Accounts![0] as CosmosAccount
        args['--account'] = account.Address
        args['--key'] = account.Mnemonic
        args['--type'] = 'cosmos'
      } else if (isEvmChain(chain.Type)) {
        const account = chain.Accounts![0] as EvmAccount
        const dispatcher = chain.Contracts.find((c) => c.Name === 'Dispatcher')
        if (!dispatcher) throw new Error(`Missing dispatcher contract on chain ${chain.Name}`)
        args['--account'] = account.Address
        args['--key'] = account.PrivateKey
        args['--type'] = 'evm'
        args['--contract-addr'] = dispatcher.Address
        args['--contract-abi'] = dispatcher.Abi
      } else {
        continue
      }

      this.logger.verbose(`adding chain ${chain.Name} to vibc-relayer`)
      await this.exec([this.binary, 'chains', 'add', ...Object.entries(args).flat()]).catch((e) => {
        this.logger.error(e)
        throw new Error(e)
      })

      await this.exec([this.binary, 'config', 'set', 'global.polling-idle-time', '10000']).catch((e) => {
        this.logger.error(e)
        throw new Error(e)
      })
    }

    for (const path of paths) {
      const [src, dst] = path
      const name = `${src}-${dst}`
      this.logger.verbose(`adding path ${name} to vibc-relayer`)
      await this.exec([this.binary, 'paths', 'add', src, dst, name]).catch((e) => {
        this.logger.error(e)
        throw new Error(e)
      })
    }
  }

  async update(srcChain: string, dstChain: string, srcChannel: string, dstChannel: string) {
    const args = [`${srcChain}-${dstChain}`, '--src-channel', srcChannel, '--dst-channel', dstChannel]
    await this.exec([this.binary, 'paths', 'update', ...args]).catch((e) => {
      this.logger.error(e)
      throw new Error(e)
    })
  }

  async start(): Promise<ProcessOutput> {
    const start = this.exec(['sh', '-c', `${this.binary} start 1>/proc/1/fd/1 2>/proc/1/fd/2`], true, true)
    this.logger.info('vibc-relayer started')
    return start
  }

  async getConfig(): Promise<ProcessOutput> {
    return await this.exec([this.binary, 'config', 'show'])
  }

  async runtime(): Promise<RelayerRunObj> {
    const config = await this.getConfig()
    return {
      Name: 'vibc-relayer',
      ContainerId: this.container.containerId,
      Configuration: JSON.parse(config.stdout)
    }
  }
}
