import { $, utils, clone } from '../deps'
import { ChainConfig, CosmosChainConfig, imageByLabel, ImageLabelTypes } from '../schemas'
import { AccountsConfig, CosmosAccount, CosmosAccounts, CosmosAccountsConfig } from '../accounts_config'
import { EndPoint, RunningChain, RunningChainBase } from './running_chain'
import { ExecStdinCallback, newContainer } from '../docker'
import { Writable } from 'stream'
import { Tendermint37Client } from '@cosmjs/tendermint-rpc'
import { getLogger } from '../utils'

const log = getLogger()

export class RunningCosmosChain extends RunningChainBase<CosmosChainConfig> {
  static readonly rpcEndpoint = new EndPoint('tcp', '0.0.0.0', '26657')
  static readonly grpcEndpoint = new EndPoint('tcp', '0.0.0.0', '9090')

  static async newNode(config: ChainConfig, hostDir: string): Promise<RunningChain> {
    const image = imageByLabel(config.Images, ImageLabelTypes.Main)
    const container = await newContainer({
      label: image.Label.toString(),
      entrypoint: 'sh',
      exposedPorts: [RunningCosmosChain.rpcEndpoint.port, RunningCosmosChain.grpcEndpoint.port],
      imageRepoTag: `${image.Repository}:${image.Tag}`,
      detach: true,
      tty: true,
      volumes: [[hostDir, '/tmp']],
      publishAllPorts: true,
      workDir: '/tmp'
    })

    const chain = new RunningCosmosChain(config as CosmosChainConfig, hostDir)
    chain.setContainer(ImageLabelTypes.Main, container)
    return chain
  }

  readonly rpcEndpoint: EndPoint = RunningCosmosChain.rpcEndpoint

  async start() {
    const reusing = await super.isReusingContainer()
    await this.loadAccounts()
    if (!reusing) {
      await this.init()
      await this.startChainDaemon()
    }
    await this.isChainReady()
  }

  async isChainReady(): Promise<boolean> {
    const runObj: any = await this.getRunObj()
    await utils.waitUntil(
      async () => {
        try {
          const client = await Tendermint37Client.connect(runObj.Nodes[0].RpcHost)
          const status = await client.status()
          return status.syncInfo.latestBlockHeight > 1
        } catch {
          return false
        }
      },
      5,
      3000,
      `Chain ${runObj.Name} is not ready with config: ${JSON.stringify(this.config, null, 2)}`
    )
    return true
  }

  private get home(): string {
    return `/home/heighliner/.${imageByLabel(this.config.Images, ImageLabelTypes.Main).Bin!}`
  }

  private async exec(args: string[], tty = false, detach = false, stdincb?: ExecStdinCallback) {
    return this.getContainer(ImageLabelTypes.Main).exec(
      [imageByLabel(this.config.Images, ImageLabelTypes.Main).Bin!, '--home', this.home, ...args],
      tty,
      detach,
      stdincb
    )
  }

  private async initGenesis() {
    log.debug(`initializing chain [${this.config.Name}]`)
    await this.exec(['init', this.config.Moniker, '-o', '--chain-id', this.config.Name])
    const relativeConfigPath = 'config/config.toml'
    const container = this.getContainer(ImageLabelTypes.Main)
    const configStr = (await container.exec(['cat', `${this.home}/${relativeConfigPath}`])).stdout
    const config = utils.readTomlText(configStr)
    // TODO: make this configurable
    config.consensus.timeout_propose = '200ms'
    config.consensus.timeout_prevote = '200ms'
    config.consensus.timeout_precommit = '200ms'
    config.consensus.timeout_commit = '1s'
    const newConfig = utils.dumpToml(config)
    const echoCmd = ['echo', newConfig].map($.quote).join(' ')
    const cmds = ['sh', '-c', `${echoCmd} > ${this.home}/${relativeConfigPath}`]
    await this.getContainer(ImageLabelTypes.Main).exec(cmds)
  }

  private async addNewAccount(account: CosmosAccount) {
    const args = ['keys', 'add', account.Name, '--output', 'json', '--keyring-backend', 'test']
    let out: any = null
    if (account.Mnemonic) {
      args.push('--interactive')
      out = await this.exec(args, false, false, (stdin: Writable) => {
        // write the mnemonic
        stdin.write(account.Mnemonic + '\n')
        // and leave an empty passphrase
        stdin.write('\n')
        stdin.end()
      })
    } else {
      out = await this.exec(args)
    }

    let parsed: any = {}
    if (out.stdout.length > 0) {
      parsed = JSON.parse(out.stdout)
    } else if (out.stderr.length > 0) {
      parsed = JSON.parse(out.stderr)
    } else {
      throw new Error('could not add new account')
    }
    log.debug(`created new account [${parsed.name}] with address [${parsed.address}] and mnemonic [${parsed.mnemonic}]`)
    const newAccount = clone(account)

    newAccount.Mnemonic = parsed.mnemonic
    newAccount.Address = parsed.address
    return newAccount
  }

  override async generateAccounts(accountsConfig: AccountsConfig) {
    const accounts = accountsConfig as CosmosAccountsConfig

    const result : any[] = []
    for (const actConfig of accounts.List) {
      const createNew = !actConfig.Address
      const account = createNew ? await this.addNewAccount(actConfig as CosmosAccount) : actConfig
      result.push(account)
    }

    return result
  }

  private async addGenesisAccounts(generatedAccounts: CosmosAccounts) {
    const cmdArgs = ['--keyring-backend', 'test', 'add-genesis-account']
    for (const account of generatedAccounts) {
      if (account.Coins) {
        await this.exec(cmdArgs.concat(account.Address, account.Coins.join(',')))
      }
    }
  }

  private async addValidatorGentx(validator: any) {
    await this.exec([
      'gentx',
      '--chain-id',
      this.config.Name,
      validator.Name,
      validator.Staked,
      '--keyring-backend',
      'test'
    ])
  }

  async init() {
    await this.initGenesis()
    await this.addGenesisAccounts(this.accounts as CosmosAccounts)
    await this.addValidatorGentx(this.config.Validator)
    await this.exec(['collect-gentxs'])
  }

  protected hostDirPath(...relativePaths: string[]): string {
    return utils.path.join(this.hostWd, ...relativePaths)
  }

  async startChainDaemon() {
    const binary = imageByLabel(this.config.Images, ImageLabelTypes.Main).Bin!
    const rawCmds = [
      binary,
      'start',
      '--home',
      this.home,
      '--rpc.laddr',
      RunningCosmosChain.rpcEndpoint.address,
      '--grpc.address',
      RunningCosmosChain.grpcEndpoint.addressNoProto
    ]
      .map($.quote)
      .join(' ')
    const cmds = ['sh', '-c', `${rawCmds} 1>${this.entrypointStdout} 2>${this.entrypointStderr}`]
    utils.fs.writeFileSync(this.hostDirPath('chain.d.cmd'), cmds.join(' '))
    await this.getContainer(ImageLabelTypes.Main).exec(cmds, true, true)
  }
}
