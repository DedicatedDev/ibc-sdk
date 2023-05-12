import { $, utils, Logger, zx, ethers } from './deps.js'
import { AccountsConfig, generateEvmAccounts } from './accounts_config.js'
import { ChainConfig, EvmChainConfig, imageByLabel, ImageLabelTypes } from './schemas.js'
import { EndPoint, RunningChain, RunningChainBase } from './running_chain.js'
import { newContainer } from './docker.js'

export class RunningFantomChain extends RunningChainBase<EvmChainConfig> {
  static readonly rpcEndpoint = new EndPoint('http', '0.0.0.0', '18545')

  // config within container
  static readonly containerConfig = {
    // mount to host wd
    wd: '/tmp/fantom',
    // where docker init script read data from, relative to wd
    dataDir: 'fantom',
    // where we store genesis accounts.json
    accountFile: 'accounts.json'
  }

  static async newNode(config: ChainConfig, hostDir: string, reuse: boolean, logger: Logger): Promise<RunningChain> {
    const self = RunningFantomChain
    // create a new logger based off the ChainSets' logger
    const chainLogger = utils.createLogger({
      Level: logger.level as any,
      Transports: [utils.path.join(hostDir, 'log')]
    })
    const image = imageByLabel(config.Images, ImageLabelTypes.Main)
    const container = await newContainer(
      {
        label: image.Label.toString(),
        entrypoint: 'sh',
        exposedPorts: [self.rpcEndpoint.port],
        imageRepoTag: `${image.Repository}:${image.Tag}`,
        detach: true,
        tty: true,
        volumes: [[hostDir, self.containerConfig.wd]]
      },
      chainLogger,
      reuse && false // TODO Implement reuse container
    )

    const chain = new RunningFantomChain(config as EvmChainConfig, hostDir, chainLogger)
    chain.setContainer(ImageLabelTypes.Main, container)
    return chain
  }

  readonly rpcEndpoint = RunningFantomChain.rpcEndpoint
  protected override accounts?: ReturnType<typeof generateEvmAccounts>

  override async generateAccounts(accounts: AccountsConfig) {
    return generateEvmAccounts(accounts)
  }

  override async start() {
    await this.loadAccounts()
    await this.init()
    await this.startGeth()
    await this.isChainReady()
  }

  async init() {
    const config = RunningFantomChain.containerConfig

    // write genesis accounts.json so that accounts will be funded
    // utils.ensureDir(this.hostPath(config.dataDir), true)
    const accounts: any = []
    for (const acct of this.accounts!) {
      accounts.push({
        address: acct.Address,
        balance: ethers.utils.parseEther(acct.Balance!.toString()).toString()
      })
    }
    utils.fs.writeFileSync(this.hostPath(config.accountFile), JSON.stringify(accounts, null, 2))
  }

  protected async isChainReady(): Promise<boolean> {
    const c = this.getContainer(ImageLabelTypes.Main)
    const check = c.isHealthy.bind(c)
    await utils.waitUntil(check, 5, 7000, JSON.stringify(this.config, null, 2))

    const runObj: any = await this.getRunObj()
    await utils.waitUntil(
      async () => {
        const out = await zx.nothrow($`curl -sf ${runObj.Nodes[0].RpcHost}`)
        return out.exitCode === 0
      },
      3,
      5000,
      JSON.stringify(this.config, null, 2)
    )
    return true
  }

  async startGeth() {
    /**
     * Run the Fantom node by mounting a volume to /tmp/fantom and ensuring that it includes
    an accounts.json (see example_accounts.json) for custom accounts to be created and funded:

    mkdir $dataDir
    cp ./accounts.json $dataDir/
    docker run -d --rm -t --name fantom -p 18545:18545 --volume $dataDir:/tmp/fantom
    ghcr.io/polymerdao/fantom:latest --http --http.addr 0.0.0.0 --nodiscover --lightkdf --fakenet 1/1
     */
    const rawCmds = [
      imageByLabel(this.config.Images, ImageLabelTypes.Main).Bin!,
      '--nodiscover',
      '--lightkdf',
      '--http',
      '--http.addr',
      this.rpcEndpoint.host,
      '--fakenet',
      '1/1'
    ]
      .map($.quote)
      .join(' ')
    const cmds = ['sh', '-c', `${rawCmds} 1>${this.entrypointStdout} 2>${this.entrypointStderr}`]
    utils.fs.writeFileSync(this.hostPath('chain.d.cmd'), cmds.join(' '))
    await this.getContainer(ImageLabelTypes.Main).exec(cmds, true, true)
  }
}
