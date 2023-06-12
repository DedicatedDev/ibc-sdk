import { ethers, $, utils, zx } from './deps.js'
import { AccountsConfig, generateEvmAccounts } from './accounts_config.js'
import { ChainConfig, EvmChainConfig, imageByLabel, ImageLabelTypes } from './schemas.js'
import { EndPoint, RunningChain, RunningChainBase } from './running_chain.js'
import { newContainer } from './docker.js'
import { getLogger } from '../utils/logger'

getLogger()

export class RunningBSCChain extends RunningChainBase<EvmChainConfig> {
  static readonly rpcEndpoint = new EndPoint('http', '0.0.0.0', '8545')
  static containerGethDataDir = '/tmp/gethDataDir'

  static async newNode(config: ChainConfig, hostDir: string, reuse: boolean): Promise<RunningChain> {
    const image = imageByLabel(config.Images, ImageLabelTypes.Main)
    const container = await newContainer(
      {
        label: image.Label.toString(),
        entrypoint: 'sh',
        exposedPorts: [RunningBSCChain.rpcEndpoint.port],
        imageRepoTag: `${image.Repository}:${image.Tag}`,
        detach: true,
        tty: true,
        volumes: [[hostDir, '/tmp']],
        binaries: [image.Bin!],
        remove: [RunningBSCChain.containerGethDataDir],
        workDir: '/tmp'
      },
      reuse
    )

    const chain = new RunningBSCChain(config as EvmChainConfig, hostDir)
    chain.setContainer(ImageLabelTypes.Main, container)
    return chain
  }

  readonly rpcEndpoint = RunningBSCChain.rpcEndpoint
  protected override accounts?: ReturnType<typeof generateEvmAccounts>

  override async start() {
    const reusing = await super.isReusingContainer()
    await this.loadAccounts()
    if (!reusing) {
      await this.init()
      await this.startChainDaemon()
    }
    await this.isChainReady()
  }

  override async generateAccounts(accounts: AccountsConfig) {
    return generateEvmAccounts(accounts)
  }

  protected async init() {
    utils.ensureDir(this.keyStoreDir, true)
    this.writeSignerFile()
    await this.writeGenesisFile(this.accounts!)
  }

  protected async isChainReady(): Promise<boolean> {
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

  protected hostDirPath(...relativePaths: string[]): string {
    return utils.path.join(this.hostWd, ...relativePaths)
  }

  async startChainDaemon() {
    const rawCmds = [
      imageByLabel(this.config.Images, ImageLabelTypes.Main).Bin!,
      '--nodiscover',
      '--lightkdf',
      '--http',
      '--http.addr',
      this.rpcEndpoint.host,
      '--datadir',
      RunningBSCChain.containerGethDataDir,
      '--password',
      utils.path.join(RunningBSCChain.containerGethDataDir, 'signerPwd'),
      '--keystore',
      utils.path.join(RunningBSCChain.containerGethDataDir, 'keystore'),
      '--dev'
    ]

    const cmds = ['sh', '-c', `${rawCmds.map($.quote).join(' ')} 1>${this.entrypointStdout} 2>${this.entrypointStderr}`]
    utils.fs.writeFileSync(this.hostDirPath('chain.d.cmd'), cmds.join(' '))
    await this.getContainer(ImageLabelTypes.Main).exec(cmds, true, true)
  }

  private writeSignerFile() {
    const genesisSignerData =
      '{"address":"f8d870bc1e24ab0485f3bbb78b6383b6762e1eaf","crypto":{"cipher":"aes-128-ctr","ciphertext":"ff4d79c400db20e0e87ad737a847c18951927383d99c66b3755dd27296119860","cipherparams":{"iv":"d5b057fa6f0d566d524dbbea713a3a1d"},"kdf":"scrypt","kdfparams":{"dklen":32,"n":262144,"p":1,"r":8,"salt":"14cd166bb2ca673d6115254109456f4f4fa4babead91e440ac810b4f4b2861f9"},"mac":"d7f574a37bf56dbe3904eb24cfdb14f2acb0c83995ed55015133a0f879c19e90"},"id":"76c665a9-b069-4280-9c4f-3d076016bb36","version":3}'
    // todo: change to the first account from config
    const signerFileName = 'UTC--2022-04-06T03-50-44.009975000Z--f8d870bc1e24ab0485f3bbb78b6383b6762e1eaf'
    utils.fs.writeFileSync(utils.path.join(this.keyStoreDir, signerFileName), genesisSignerData)
    utils.fs.writeFileSync(this.passwordFile, 'PwdThatsNotReallyASecret\n')
  }

  private async writeGenesisFile(accounts: ReturnType<typeof generateEvmAccounts>) {
    const genesis = {
      config: {
        chainId: 97,
        homesteadBlock: 0,
        eip150Block: 0,
        eip150Hash: '0x0000000000000000000000000000000000000000000000000000000000000000',
        eip155Block: 0,
        eip158Block: 0,
        byzantiumBlock: 0,
        constantinopleBlock: 0,
        petersburgBlock: 0,
        istanbulBlock: 0,
        muirGlacierBlock: 0,
        parlia: {
          period: 3,
          epoch: 200
        }
      },
      nonce: '0x0',
      timestamp: '0x5e9da7ce',
      gasLimit: '0x2625a00',
      difficulty: '0x1',
      mixHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      coinbase: '0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE',
      extradata: `0x0000000000000000000000000000000000000000000000000000000000000000f8d870bc1e24ab0485f3bbb78b6383b6762e1eaf0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000`,
      alloc: {
        // f8d870bc1e24ab0485f3bbb78b6383b6762e1eaf: {
        //   balance: '1000000000000000000000'
        // }
      }
    }
    for (const account of accounts) {
      if (!account.Balance) continue
      genesis.alloc[account.Address] = {
        balance: ethers.utils.parseEther(account.Balance.toString()).toString()
      }
    }
    utils.fs.writeFileSync(this.genesisFile, JSON.stringify(genesis))

    // Run `geth init` in container
    const hostGenesisFilePath = utils.path.join(RunningBSCChain.containerGethDataDir, 'genesis.json')
    // await this.container.exec(['mkdir', hostGenesisFilePath])
    await this.getContainer(ImageLabelTypes.Main).exec([
      imageByLabel(this.config.Images, ImageLabelTypes.Main).Bin!,
      'init',
      '--datadir',
      RunningBSCChain.containerGethDataDir,
      hostGenesisFilePath
    ])
  }

  private get dataDir(): string {
    return utils.path.join(this.hostWd, 'gethDataDir')
  }

  private get keyStoreDir(): string {
    return utils.path.join(this.dataDir, 'keystore')
  }

  private get genesisFile(): string {
    return utils.path.join(this.dataDir, 'genesis.json')
  }

  private get passwordFile(): string {
    return utils.path.join(this.dataDir, 'signerPwd')
  }
}
