import { $, Logger, utils, zx } from './deps.js'
import { ChainConfig, imageByLabel, ImageLabelTypes, NoneChainConfig } from './schemas.js'
import { EndPoint, NodeAccounts, RunningChain, RunningChainBase } from './running_chain.js'
import { newContainer, runContainer } from './docker'
import { RunningGethChain } from './geth_chain'

export class RunningPrysmChain extends RunningChainBase<NoneChainConfig> {
  static readonly rpcEndpoint = new EndPoint('http', '0.0.0.0', '4000')
  static readonly grpcEndpoint = new EndPoint('http', '0.0.0.0', '3500')

  static async newNode(config: ChainConfig, hostDir: string, reuse: boolean, logger: Logger): Promise<RunningChain> {
    // create a new logger based off the ChainSets' logger

    const chainLogger = utils.createLogger({
      Level: logger.level as any,
      Transports: [utils.path.join(hostDir, 'log')]
    })

    reuse = false // TODO: implement reuse container
    const mainImage = config.Images.find((i) => i.Label === ImageLabelTypes.Main)
    const genesisImage = config.Images.find((i) => i.Label === ImageLabelTypes.Genesis)
    const validatorImage = config.Images.find((i) => i.Label === ImageLabelTypes.Validator)

    if (!mainImage || !genesisImage || !validatorImage) {
      throw new Error('Need three images: main, validator and genesis!')
    }

    const mainContainer = await newContainer(
      {
        label: mainImage.Label.toString(),
        entrypoint: 'sh',
        exposedPorts: [RunningPrysmChain.rpcEndpoint.port, RunningPrysmChain.grpcEndpoint.port],
        imageRepoTag: `${mainImage.Repository}:${mainImage.Tag}`,
        detach: true,
        publishAllPorts: true,
        tty: true,
        volumes: [[hostDir, '/tmp']],
        workDir: '/tmp'
      },
      chainLogger,
      reuse
    )

    const validatorLogger = utils.createLogger({
      Level: logger.level as any,
      Transports: [utils.path.join(hostDir, 'validatorLog')]
    })
    const validatorContainer = await newContainer(
      {
        label: validatorImage.Label.toString(),
        entrypoint: 'sh',
        exposedPorts: [RunningPrysmChain.rpcEndpoint.port, RunningPrysmChain.grpcEndpoint.port],
        imageRepoTag: `${validatorImage.Repository}:${validatorImage.Tag}`,
        detach: true,
        tty: true,
        volumes: [[hostDir, '/tmp']],
        publishAllPorts: true,
        workDir: '/tmp'
      },
      validatorLogger,
      reuse
    )

    const chain = new RunningPrysmChain(config as NoneChainConfig, hostDir, chainLogger)
    chain.setContainer(ImageLabelTypes.Main, mainContainer)
    chain.setContainer(ImageLabelTypes.Validator, validatorContainer)
    return chain
  }

  configFileName = 'config.yml'

  containerConfigFilePath: string = utils.path.join(this.getContainerDataDir(), this.configFileName)

  readonly rpcEndpoint = RunningPrysmChain.rpcEndpoint

  generateAccounts(_config: any): Promise<any> {
    throw new Error('Method not implemented.')
  }

  override async start(dependencyRuntime: NodeAccounts[]) {
    await this.init()

    // Commands based on https://github.com/rauljordan/eth-pos-devnet/blob/master/docker-compose.yml
    await this.startChainDaemon(dependencyRuntime)
    await this.startValidatorDaemon()
    await this.isChainReady()
  }

  protected override checkAccounts() {
    // do not check accounts
  }

  protected async init() {
    await this.writeConfigFile()
  }

  protected async isChainReady(): Promise<boolean> {
    const runObj: any = await this.getRunObj()
    this.logger.info(`Verifying prysm readiness at ${runObj.Nodes[0].RpcHost}`)
    await utils.waitUntil(
      async () => {
        const out = await zx.nothrow($`curl -sf ${runObj.Nodes[0].RpcHost}`)
        // 1 means the protocol is wrong but the port is reachable, it's a trick to use curl and not depend on other
        // tools
        return out.exitCode === 1
      },
      3,
      5000,
      `Failed to reach prysm RPC endpoint`
    )
    // TODO: verify validator readiness
    return true
  }

  protected hostDirPath(...relativePaths: string[]): string {
    return utils.path.join(this.hostWd, ...relativePaths)
  }

  async startChainDaemon(runtime: NodeAccounts[]) {
    // TODO: this needs to be generated on the fly in geth and passed to prysm in code
    const JWTToken = '05034ab3d5592713a504712139d38bb0e7b418a30d1005b8bcaa665ebc0850dd'

    utils.fs.writeFileSync(utils.path.join(this.dataDir, 'jwt.hex'), JWTToken)

    const eth = runtime.find((c) => c.Type === 'ethereum')
    if (eth === undefined) throw new Error('Need an eth node to run execution')

    const executionContainer = `${eth.Nodes[0].RpcContainer.split(':', 2).join(':')}:${
      RunningGethChain.authRpcEndpoint.port
    }`
    const image = imageByLabel(this.config.Images, ImageLabelTypes.Main)
    const containerDataDir = this.getContainerDataDir()
    const rawCmds = [
      image.Bin!,
      `--datadir=${containerDataDir}`,
      '--min-sync-peers=0',
      `--interop-genesis-state=${utils.path.join(containerDataDir, 'genesis.ssz')}`,
      '--interop-eth1data-votes',
      '--bootstrap-node=',
      `--chain-config-file=${this.containerConfigFilePath}`,
      `--chain-id=${RunningGethChain.chainId.toString()}`,
      `--execution-endpoint=${executionContainer!}`,
      '--accept-terms-of-use',
      `--jwt-secret=${utils.path.join(containerDataDir, 'jwt.hex')}`,
      '--rpc-host=0.0.0.0',
      '--grpc-gateway-host=0.0.0.0',
      '--suggested-fee-recipient=0x0C46c2cAFE097b4f7e1BB868B89e5697eE65f934',
      '--enable-polymer-devnet-mode'
    ]
    const cmds = ['sh', '-c', `${rawCmds.map($.quote).join(' ')} 1>${this.entrypointStdout} 2>${this.entrypointStderr}`]
    utils.fs.writeFileSync(this.hostDirPath('chain.d.cmd'), cmds.join(' '))
    await this.getContainer(ImageLabelTypes.Main).exec(cmds, true, true)
  }

  async startValidatorDaemon() {
    const prysmContainer = await this.getRunObj()
    const image = imageByLabel(this.config.Images, ImageLabelTypes.Validator)
    const containerDataDir = this.getContainerDataDir(ImageLabelTypes.Validator)
    const rawCmds = [
      image.Bin!,
      `--beacon-rpc-provider=${prysmContainer.Nodes[0].RpcContainer.split('//')[1]}`,
      `--datadir=${containerDataDir}`,
      '--accept-terms-of-use',
      '--interop-num-validators=36',
      '--interop-start-index=0',
      '--force-clear-db',
      `--chain-config-file=${this.containerConfigFilePath}`,
      `--config-file=${this.containerConfigFilePath}`,
      '--suggested-fee-recipient=0x0C46c2cAFE097b4f7e1BB868B89e5697eE65f934',
      '--enable-polymer-devnet-mode'
    ]
    const cmds = ['sh', '-c', `${rawCmds.map($.quote).join(' ')} 1>${this.entrypointStdout} 2>${this.entrypointStderr}`]
    utils.fs.writeFileSync(this.hostDirPath('validator.d.cmd'), cmds.join(' '))
    await this.getContainer(ImageLabelTypes.Validator).exec(cmds, true, true)
  }

  private async writeConfigFile() {
    const config = `CONFIG_NAME: interop
PRESET_BASE: interop
GENESIS_FORK_VERSION: 0x20000089
ALTAIR_FORK_EPOCH: 1
ALTAIR_FORK_VERSION: 0x20000090
BELLATRIX_FORK_EPOCH: 2
BELLATRIX_FORK_VERSION: 0x20000091
TERMINAL_TOTAL_DIFFICULTY: 5
CAPELLA_FORK_VERSION: 0x20000092
SECONDS_PER_SLOT: 3
SLOTS_PER_EPOCH: 3
SQR_ROOT_SLOTS_PER_EPOCH: 1
SAFE_SLOTS_TO_UPDATE_JUSTIFIED: 0
SECONDS_PER_ETH1_BLOCK: 3
DEPOSIT_CONTRACT_ADDRESS: 0x4242424242424242424242424242424242424242
`
    const prysmDataDir = this.getContainerDataDir()

    utils.fs.mkdirSync(this.dataDir)
    utils.fs.writeFileSync(this.configFile, config)

    const args = [
      'testnet',
      'generate-genesis',
      '--num-validators=36',
      `--output-ssz=${utils.path.join(prysmDataDir, 'genesis.ssz')}`,
      `--chain-config-file=${this.containerConfigFilePath}`
    ]

    const genesisImage = this.config.Images.find((i) => i.Label === ImageLabelTypes.Genesis)
    if (!genesisImage) throw new Error('genesis image is undefined?')

    await runContainer(
      {
        entrypoint: imageByLabel(this.config.Images, ImageLabelTypes.Genesis).Bin!,
        exposedPorts: [RunningPrysmChain.rpcEndpoint.port, RunningPrysmChain.grpcEndpoint.port],
        imageRepoTag: `${genesisImage.Repository}:${genesisImage.Tag}`,
        volumes: [[this.hostWd, '/tmp']],
        workDir: '/tmp',
        args: args
      },
      this.logger
    )
  }

  private get dataDir(): string {
    const dataDirPrefix = '/tmp/'
    const containerDataDir = this.getContainerDataDir()
    if (!containerDataDir.startsWith(dataDirPrefix)) {
      throw new Error('prysm beacon chain data dir must be in /tmp')
    }
    return utils.path.join(this.hostWd, containerDataDir.substring(dataDirPrefix.length))
  }

  private get configFile(): string {
    return utils.path.join(this.dataDir, this.configFileName)
  }
}
