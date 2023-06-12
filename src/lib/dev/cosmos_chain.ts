import { $, utils, clone } from './deps.js'
import { ChainConfig, CosmosChainConfig, imageByLabel, ImageLabelTypes } from './schemas.js'
import { AccountsConfig, CosmosAccount, CosmosAccounts, CosmosAccountsConfig } from './accounts_config'
import { EndPoint, RunningChain, RunningChainBase } from './running_chain.js'
import { newContainer } from './docker.js'
import { Writable } from 'stream'
import { Tendermint37Client } from '@cosmjs/tendermint-rpc'
import { getLogger } from '../../lib/utils/logger'

const log = getLogger()

export class RunningCosmosChain extends RunningChainBase<CosmosChainConfig> {
  static readonly rpcEndpoint = new EndPoint('tcp', '0.0.0.0', '26657')
  static readonly grpcEndpoint = new EndPoint('tcp', '0.0.0.0', '9090')

  static async newNode(config: ChainConfig, hostDir: string, reuse: boolean): Promise<RunningChain> {
    const image = imageByLabel(config.Images, ImageLabelTypes.Main)
    const container = await newContainer(
      {
        label: image.Label.toString(),
        entrypoint: 'sh',
        exposedPorts: [RunningCosmosChain.rpcEndpoint.port, RunningCosmosChain.grpcEndpoint.port],
        imageRepoTag: `${image.Repository}:${image.Tag}`,
        detach: true,
        tty: true,
        volumes: [[hostDir, '/tmp']],
        publishAllPorts: true,
        workDir: '/tmp'
      },
      reuse
    )

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
          return status.syncInfo.latestBlockHeight > 0
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

  private async initGenesis() {
    log.debug(`init chain db and configs`)
    await this.getContainer(ImageLabelTypes.Main).exec([
      imageByLabel(this.config.Images, ImageLabelTypes.Main).Bin!,
      'init',
      this.config.Moniker,
      '-o',
      '--chain-id',
      this.config.Name
    ])
    const script = `
    set -e;
    config="$( find "$HOME" -name config.toml -print0 )";
    if [ -z "$config" ]; then exit 0; fi;
    sed -i '/^timeout_propose /s/[0-9]\\+[a-z]\\+/200ms/'   "$config";
    sed -i '/^timeout_prevote /s/[0-9]\\+[a-z]\\+/200ms/'   "$config";
    sed -i '/^timeout_precommit /s/[0-9]\\+[a-z]\\+/200ms/' "$config";
    sed -i '/^timeout_commit /s/[0-9]\\+[a-z]\\+/1s/'       "$config";
    `
    await this.getContainer(ImageLabelTypes.Main)
      .exec(['sh', '-c', script])
      .catch(() => log.warn(`Could not change blocktime on ${this.config.Name} chain`))
  }

  private async addNewAccount(account: CosmosAccount) {
    const cmds = [
      imageByLabel(this.config.Images, ImageLabelTypes.Main).Bin!,
      'keys',
      'add',
      account.Name,
      '--output',
      'json',
      '--keyring-backend',
      'test'
    ]
    const container = this.getContainer(ImageLabelTypes.Main)
    let out: any = null
    if (account.Mnemonic) {
      cmds.push('--interactive')
      out = await container.exec(cmds, false, false, (stdin: Writable) => {
        // write the mnemonic
        stdin.write(account.Mnemonic + '\n')
        // and leave an empty passphrase
        stdin.write('\n')
        stdin.end()
      })
    } else {
      out = await container.exec(cmds)
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
    const generatedAccounts = accounts.List.map(async (actConfig: any) => {
      const createNew = !actConfig.Address
      return createNew ? await this.addNewAccount(actConfig) : actConfig
    })
    return await Promise.all(generatedAccounts)
  }

  private async addGenesisAccounts(generatedAccounts: CosmosAccounts) {
    const binary = imageByLabel(this.config.Images, ImageLabelTypes.Main).Bin!
    const cmdArgs = [binary, '--keyring-backend', 'test', 'add-genesis-account']
    const container = this.getContainer(ImageLabelTypes.Main)
    for (const account of generatedAccounts) {
      if (account.Coins) {
        await container.exec(cmdArgs.concat(account.Address, account.Coins.join(',')))
      }
    }
  }

  private async addValidatorGentx(validator: any) {
    await this.getContainer(ImageLabelTypes.Main).exec([
      imageByLabel(this.config.Images, ImageLabelTypes.Main).Bin!,
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
    const binary = imageByLabel(this.config.Images, ImageLabelTypes.Main).Bin!
    await this.getContainer(ImageLabelTypes.Main).exec([binary, 'collect-gentxs'])
  }

  protected hostDirPath(...relativePaths: string[]): string {
    return utils.path.join(this.hostWd, ...relativePaths)
  }

  async startChainDaemon() {
    const binary = imageByLabel(this.config.Images, ImageLabelTypes.Main).Bin!
    const rawCmds = [
      binary,
      'start',
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
