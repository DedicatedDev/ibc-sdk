import { $, utils, Logger, zx } from './deps.js'
import { AccountsConfig, generateEvmAccounts } from './accounts_config.js'
import { ChainConfig, EvmChainConfig, imageByLabel, ImageLabelTypes } from './schemas.js'
import { EndPoint, RunningChain, RunningChainBase } from './running_chain.js'
import { newContainer } from './docker.js'

export class RunningPolygonChain extends RunningChainBase<EvmChainConfig> {
  static readonly rpcEndpoint = new EndPoint('http', '0.0.0.0', '8545')
  static readonly containerDataDir = '/tmp/polygon'

  static async newNode(config: ChainConfig, hostDir: string, reuse: boolean, logger: Logger): Promise<RunningChain> {
    // create a new logger based off the ChainSets' logger
    const chainLogger = utils.createLogger({
      Level: logger.level as any,
      Transports: [utils.path.join(hostDir, 'log')]
    })

    const chainDataDirHost = utils.ensureDir(utils.path.join(hostDir, 'chainData'), true)

    const self = RunningPolygonChain

    const image = imageByLabel(config.Images, ImageLabelTypes.Main)
    const container = await newContainer(
      {
        label: image.Label.toString(),
        args: [
          '--http',
          '--http.addr',
          self.rpcEndpoint.host,
          '--datadir',
          self.containerDataDir,
          '--nodiscover',
          '--bor.withoutheimdall',
          '--lightkdf',
          '--dev'
        ],
        exposedPorts: [self.rpcEndpoint.port],
        imageRepoTag: `${image.Repository}:${image.Tag}`,
        detach: true,
        tty: true,
        volumes: [[chainDataDirHost, self.containerDataDir]]
      },
      chainLogger,
      reuse && false // TODO Implement reuse container
    )

    const chain = new RunningPolygonChain(config as EvmChainConfig, hostDir, chainLogger)
    chain.chainDataDirHost = chainDataDirHost
    chain.setContainer(ImageLabelTypes.Main, container)
    return chain
  }

  readonly rpcEndpoint = RunningPolygonChain.rpcEndpoint
  protected override accounts?: ReturnType<typeof generateEvmAccounts>
  protected chainDataDirHost: string = ''

  override async generateAccounts(accounts: AccountsConfig) {
    return generateEvmAccounts(accounts)
  }

  override async start() {
    await this.loadAccounts()
    await this.isChainReady()
    await this.fundAccounts()
  }

  protected async isChainReady(): Promise<boolean> {
    const runObj: any = await this.getRunObj()
    await utils.waitUntil(
      async () => {
        const out = await zx.nothrow($`curl -sf ${runObj.Nodes[0].RpcHost}`)
        return out.exitCode === 0
      },
      5,
      1000,
      JSON.stringify(this.config, null, 2)
    )
    return true
  }

  async fundAccounts() {
    // convert accounts to json for chainClient cli
    const accounts = this.accounts!.map((a) => {
      return { address: a.Address, balance: a.Balance ?? 0 }
    })
    const accountsJson = JSON.stringify(accounts)
    this.logger.debug(accountsJson)
    const runObj = await this.getRunObj()

    const clientImage = this.config.ChainClientImage
    if (!clientImage) {
      throw new Error(`chain ${this.config.Type} must have a ChainClientImage`)
    }
    const dataDirContainer = '/tmp/polygon'
    await newContainer(
      {
        imageRepoTag: `${clientImage.Repository}:${clientImage.Tag}`,
        volumes: [[this.chainDataDirHost, dataDirContainer]],
        args: ['polygon', 'fund', '--rpc', runObj.Nodes[0].RpcContainer, accountsJson, dataDirContainer]
      },
      utils.createLogger({ Level: 'debug' })
    )
  }
}
