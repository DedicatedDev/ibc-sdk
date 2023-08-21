import { ethers, $, utils } from '../deps'
import { AccountsConfig, generateEvmAccounts } from '../accounts_config'
import { ChainConfig, EvmChainConfig, imageByLabel, ImageLabelTypes, nodeByLabel } from '../schemas'
import { EndPoint, RunningChain, RunningChainBase } from './running_chain'
import { newContainer, runContainer } from '../docker'
import { newJsonRpcProvider } from '../ethers'
import { beaconConfig, ethGgenesis } from './eth_helper'
import path from 'path'
import { getLogger } from '../utils'

const prysmRpcEndpoint = new EndPoint('http', '0.0.0.0', '4000')
const prysmGrpcEndpoint = new EndPoint('http', '0.0.0.0', '3500')
const ethRpcEndpoint = new EndPoint('http', '0.0.0.0', '8545')
const ethAuthRpcEndpoint = new EndPoint('http', '0.0.0.0', '8551')

const chainId = '32382'
const signer = '123463a4b065722e99115d6c222f267d9cabb524'

// TODO: generate the token here and pass it along to prysm instead of putting it in the config in clear text
const JWTToken = '05034ab3d5592713a504712139d38bb0e7b418a30d1005b8bcaa665ebc0850dd'

const log = getLogger()

/*
 The class below and the configuration around it is based on:
	- https://github.com/OffchainLabs/eth-pos-devnet/blob/900209059fece4e339cce9a1557c699572354c5a/docker-compose.yml
*/
export class RunningEthChain extends RunningChainBase<EvmChainConfig> {
  protected override accounts?: ReturnType<typeof generateEvmAccounts>

  override getRpcEndpointPort(label: string): EndPoint {
    if (label === ImageLabelTypes.Main) return ethRpcEndpoint
    if (label === ImageLabelTypes.Beacon || label === ImageLabelTypes.Validator) return prysmRpcEndpoint
    throw new Error(`Cannot get endpooint. Unknown label: ${label}`)
  }

  static async newNode(config: ChainConfig, hostDir: string): Promise<RunningChain> {
    const image = imageByLabel(config.Images, ImageLabelTypes.Main)
    const ethExecContainer = await newContainer({
      label: image.Label.toString(),
      entrypoint: 'sh',
      exposedPorts: [ethRpcEndpoint.port, ethAuthRpcEndpoint.port],
      imageRepoTag: `${image.Repository}:${image.Tag}`,
      detach: true,
      tty: true,
      publishAllPorts: true,
      volumes: [[hostDir, '/tmp']],
      binaries: [image.Bin!],
      remove: ['/tmp/geth', '/tmp/geth.ipc'],
      workDir: '/tmp'
    })

    const prysmImage = config.Images.find((i) => i.Label === ImageLabelTypes.Beacon)
    const validatorImage = config.Images.find((i) => i.Label === ImageLabelTypes.Validator)

    if (!prysmImage || !validatorImage) {
      throw new Error('Need images: beacon and validator!')
    }

    const prysmContainer = await newContainer({
      label: prysmImage.Label.toString(),
      entrypoint: 'sh',
      exposedPorts: [prysmRpcEndpoint.port, prysmGrpcEndpoint.port],
      imageRepoTag: `${prysmImage.Repository}:${prysmImage.Tag}`,
      detach: true,
      publishAllPorts: true,
      tty: true,
      volumes: [[hostDir, '/tmp']],
      binaries: [prysmImage.Bin!],
      remove: [RunningChainBase.getContainerDataDir(prysmImage.Label)],
      workDir: '/tmp'
    })

    const validatorContainer = await newContainer({
      label: validatorImage.Label.toString(),
      entrypoint: 'sh',
      exposedPorts: [prysmRpcEndpoint.port, prysmGrpcEndpoint.port],
      imageRepoTag: `${validatorImage.Repository}:${validatorImage.Tag}`,
      detach: true,
      tty: true,
      volumes: [[hostDir, '/tmp']],
      publishAllPorts: true,
      binaries: [validatorImage.Bin!],
      remove: [RunningChainBase.getContainerDataDir(validatorImage.Label)],
      workDir: '/tmp'
    })
    const chain = new RunningEthChain(config as EvmChainConfig, hostDir)

    chain.setContainer(ImageLabelTypes.Main, ethExecContainer)
    chain.setContainer(ImageLabelTypes.Beacon, prysmContainer)
    chain.setContainer(ImageLabelTypes.Validator, validatorContainer)

    return chain
  }

  override async generateAccounts(accounts: AccountsConfig) {
    return generateEvmAccounts(accounts)
  }

  override async start() {
    await this.init()

    await this.beaconChainGenesis()
    await this.gethChainGenesis()

    await this.startEth()
    await this.startPrysm()
    await this.startValidator()

    await this.isChainReady()
  }

  protected async init() {
    utils.fs.writeFileSync(this.hostDirPath('jwt.hex'), JWTToken)
    await this.loadAccounts()
    this.writeSignerFile()
    this.writeGenesisFile()
  }

  protected async isChainReady(): Promise<boolean> {
    const eth = nodeByLabel(await this.getRunObj(), ImageLabelTypes.Main)

    await utils.waitUntil(
      async () => {
        try {
          const provider = newJsonRpcProvider(eth.RpcHost)
          const block = await provider.send('eth_getBlockByNumber', ['latest', true])
          return parseInt(block.number) > 1
        } catch {
          return false
        }
      },
      10,
      5000,
      JSON.stringify(this.config, null, 2)
    )
    return true
  }

  protected hostDirPath(...relativePaths: string[]): string {
    return utils.path.join(this.hostWd, ...relativePaths)
  }

  private async gethChainGenesis() {
    const image = imageByLabel(this.config.Images, ImageLabelTypes.Main)
    const genesisPath = path.join('/tmp', 'genesis.json')
    await this.getContainer(ImageLabelTypes.Main).exec([image.Bin!, 'init', '--datadir', '/tmp', genesisPath])
  }

  private async beaconChainGenesis() {
    log.verbose('running beacon genesis')
    utils.fs.writeFileSync(this.hostDirPath('config.yaml'), beaconConfig)

    const args = [
      'testnet',
      'generate-genesis',
      '--fork=bellatrix', // change to 'capella' to generate a Capella genesis.
      '--num-validators=64',
      '--output-ssz=/tmp/genesis.ssz',
      '--chain-config-file=/tmp/config.yaml',
      '--geth-genesis-json-in=/tmp/genesis.json',
      '--geth-genesis-json-out=/tmp/genesis.json'
    ]

    const genesisImage = this.config.Images.find((i) => i.Label === ImageLabelTypes.Genesis)
    if (!genesisImage) throw new Error('genesis image is undefined?')

    await runContainer({
      entrypoint: imageByLabel(this.config.Images, ImageLabelTypes.Genesis).Bin!,
      imageRepoTag: `${genesisImage.Repository}:${genesisImage.Tag}`,
      volumes: [[this.hostWd, '/tmp']],
      workDir: '/tmp',
      args: args
    })
    log.verbose('beacon genesis done')
  }

  async startEth() {
    log.verbose('starting eth container')
    const image = imageByLabel(this.config.Images, ImageLabelTypes.Main)

    const rawCmds = [
      image.Bin!,
      '--nodiscover',
      '--http',
      '--http.api=eth,net,web3,debug',
      '--http.addr=0.0.0.0',
      '--authrpc.vhosts=*',
      '--authrpc.addr=0.0.0.0',
      '--authrpc.jwtsecret=/tmp/jwt.hex',
      '--datadir=/tmp',
      '--allow-insecure-unlock',
      `--unlock=${signer}`,
      '--password=/tmp/signerPwd',
      '--keystore=/tmp/keystore',
      '--syncmode=full',
      `--networkid=${chainId}`
    ]

    const cmds = ['sh', '-c', `${rawCmds.map($.quote).join(' ')} 1>${this.entrypointStdout} 2>${this.entrypointStderr}`]
    utils.fs.writeFileSync(this.hostDirPath('main.d.cmd'), cmds.join(' '))
    await this.getContainer(ImageLabelTypes.Main).exec(cmds, true, true)
    log.verbose('eth container started')
  }

  private writeSignerFile() {
    const genesisSignerData = {
      address: signer,
      crypto: {
        cipher: 'aes-128-ctr',
        ciphertext: '93b90389b855889b9f91c89fd15b9bd2ae95b06fe8e2314009fc88859fc6fde9',
        cipherparams: { iv: '9dc2eff7967505f0e6a40264d1511742' },
        kdf: 'scrypt',
        kdfparams: {
          dklen: 32,
          n: 262144,
          p: 1,
          r: 8,
          salt: 'c07503bb1b66083c37527cd8f06f8c7c1443d4c724767f625743bd47ae6179a4'
        },
        mac: '6d359be5d6c432d5bbb859484009a4bf1bd71b76e89420c380bd0593ce25a817'
      },
      id: '622df904-0bb1-4236-b254-f1b8dfdff1ec',
      version: 3
    }
    // TODO: change to the first account from config
    const signerFileName = `UTC--2022-08-19T17-38-31.257380510Z--${signer}`
    utils.fs.writeFileSync(utils.path.join(this.keyStoreDir, signerFileName), JSON.stringify(genesisSignerData))
    utils.fs.writeFileSync(this.passwordFile, '')
  }

  private writeGenesisFile() {
    const genesis = ethGgenesis(parseInt(chainId), signer)
    for (const account of this.accounts!) {
      if (!account.Balance) continue
      genesis.alloc[account.Address] = {
        balance: ethers.utils.parseEther(account.Balance.toString()).toString()
      }
    }
    utils.fs.writeFileSync(this.genesisFile, JSON.stringify(genesis))
  }

  async startPrysm() {
    log.verbose('starting beacon container')

    const eth = nodeByLabel(await this.getRunObj(), ImageLabelTypes.Main)
    const executionContainer = `${eth.RpcContainer.split(':', 2).join(':')}:${ethAuthRpcEndpoint.port}`

    utils.ensureDir(this.hostDirPath(ImageLabelTypes.Beacon))
    const image = imageByLabel(this.config.Images, ImageLabelTypes.Beacon)
    const rawCmds = [
      image.Bin!,
      `--datadir=${RunningChainBase.getContainerDataDir(ImageLabelTypes.Beacon)}`,
      '--min-sync-peers=0',
      `--genesis-state=/tmp/genesis.ssz`,
      '--bootstrap-node=',
      '--chain-config-file=/tmp/config.yaml',
      `--chain-id=${chainId}`,
      `--execution-endpoint=${executionContainer!}`,
      '--accept-terms-of-use',
      '--jwt-secret=/tmp/jwt.hex',
      '--rpc-host=0.0.0.0',
      '--contract-deployment-block=0',
      '--grpc-gateway-host=0.0.0.0',
      '--suggested-fee-recipient=0x0C46c2cAFE097b4f7e1BB868B89e5697eE65f934',
      '--accept-terms-of-use',
      '--enable-polymer-devnet-mode'
    ]
    const cmds = ['sh', '-c', `${rawCmds.map($.quote).join(' ')} 1>${this.entrypointStdout} 2>${this.entrypointStderr}`]
    utils.fs.writeFileSync(this.hostDirPath('beacon.d.cmd'), cmds.join(' '))
    await this.getContainer(ImageLabelTypes.Beacon).exec(cmds, true, true)
    log.verbose('beacon container started')
  }

  async startValidator() {
    log.verbose('starting validator container')
    const beacon = nodeByLabel(await this.getRunObj(), ImageLabelTypes.Beacon)

    utils.ensureDir(this.hostDirPath('validator'))
    const image = imageByLabel(this.config.Images, ImageLabelTypes.Validator)
    const rawCmds = [
      image.Bin!,
      `--beacon-rpc-provider=${beacon.RpcContainer.split('//')[1]}`,
      `--datadir=${RunningChainBase.getContainerDataDir(ImageLabelTypes.Validator)}`,
      '--accept-terms-of-use',
      '--interop-num-validators=64',
      '--interop-start-index=0',
      '--force-clear-db',
      '--chain-config-file=/tmp/config.yaml',
      '--suggested-fee-recipient=0x0C46c2cAFE097b4f7e1BB868B89e5697eE65f934',
      '--enable-polymer-devnet-mode'
    ]
    const cmds = ['sh', '-c', `${rawCmds.map($.quote).join(' ')} 1>${this.entrypointStdout} 2>${this.entrypointStderr}`]
    utils.fs.writeFileSync(this.hostDirPath('validator.d.cmd'), cmds.join(' '))
    await this.getContainer(ImageLabelTypes.Validator).exec(cmds, true, true)
    log.verbose('validator container started')
  }

  private get keyStoreDir(): string {
    const keystoreDir = path.join(this.hostWd, 'keystore')
    utils.ensureDir(keystoreDir)
    return keystoreDir
  }

  private get genesisFile(): string {
    return path.join(this.hostWd, 'genesis.json')
  }

  private get passwordFile(): string {
    return path.join(this.hostWd, 'signerPwd')
  }
}
