import { ethers, $, utils, Logger, zx } from './deps.js'
import { AccountsConfig, generateEvmAccounts } from './accounts_config.js'
import { ChainConfig, EvmChainConfig, imageByLabel, ImageLabelTypes } from './schemas.js'
import { EndPoint, RunningChain, RunningChainBase } from './running_chain.js'
import { newContainer } from './docker.js'

export class RunningGethChain extends RunningChainBase<EvmChainConfig> {
  static readonly rpcEndpoint = new EndPoint('http', '0.0.0.0', '8545')
  public static readonly authRpcEndpoint = new EndPoint('http', '0.0.0.0', '8551')
  public static readonly chainId = 32382
  public static readonly signer = '123463a4b065722e99115d6c222f267d9cabb524'
  // TODO: generate the token here and pass it along to prysm instead of putting it in the config in clear text
  public static readonly JWTToken = '05034ab3d5592713a504712139d38bb0e7b418a30d1005b8bcaa665ebc0850dd'
  static readonly genesis = {
    config: {
      ChainName: 'l1_chain',
      chainId: RunningGethChain.chainId,
      consensus: 'clique',
      homesteadBlock: 0,
      daoForkSupport: true,
      eip150Block: 0,
      eip150Hash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      eip155Block: 0,
      eip158Block: 0,
      byzantiumBlock: 0,
      constantinopleBlock: 0,
      petersburgBlock: 0,
      istanbulBlock: 0,
      muirGlacierBlock: 0,
      berlinBlock: 0,
      londonBlock: 0,
      terminalBlockHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      arrowGlacierBlock: 0,
      grayGlacierBlock: 0,
      clique: {
        period: 6,
        epoch: 30000
      },
      terminalTotalDifficulty: 5
    },
    difficulty: '1',
    gasLimit: '30000000',
    extraData: `0x0000000000000000000000000000000000000000000000000000000000000000${RunningGethChain.signer}0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000`,
    alloc: {
      '0x4242424242424242424242424242424242424242': {
        balance: '0',
        code: '0x60806040526004361061003f5760003560e01c806301ffc9a71461004457806322895118146100b6578063621fd130146101e3578063c5f2892f14610273575b600080fd5b34801561005057600080fd5b5061009c6004803603602081101561006757600080fd5b8101908080357bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916906020019092919050505061029e565b604051808215151515815260200191505060405180910390f35b6101e1600480360360808110156100cc57600080fd5b81019080803590602001906401000000008111156100e957600080fd5b8201836020820111156100fb57600080fd5b8035906020019184600183028401116401000000008311171561011d57600080fd5b90919293919293908035906020019064010000000081111561013e57600080fd5b82018360208201111561015057600080fd5b8035906020019184600183028401116401000000008311171561017257600080fd5b90919293919293908035906020019064010000000081111561019357600080fd5b8201836020820111156101a557600080fd5b803590602001918460018302840111640100000000831117156101c757600080fd5b909192939192939080359060200190929190505050610370565b005b3480156101ef57600080fd5b506101f8610fd0565b6040518080602001828103825283818151815260200191508051906020019080838360005b8381101561023857808201518184015260208101905061021d565b50505050905090810190601f1680156102655780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b34801561027f57600080fd5b50610288610fe2565b6040518082815260200191505060405180910390f35b60007f01ffc9a7000000000000000000000000000000000000000000000000000000007bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916827bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916148061036957507f85640907000000000000000000000000000000000000000000000000000000007bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916827bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916145b9050919050565b603087879050146103cc576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260268152602001806116ec6026913960400191505060405180910390fd5b60208585905014610428576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260368152602001806116836036913960400191505060405180910390fd5b60608383905014610484576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252602981526020018061175f6029913960400191505060405180910390fd5b670de0b6b3a76400003410156104e5576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260268152602001806117396026913960400191505060405180910390fd5b6000633b9aca0034816104f457fe5b061461054b576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260338152602001806116b96033913960400191505060405180910390fd5b6000633b9aca00348161055a57fe5b04905067ffffffffffffffff80168111156105c0576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260278152602001806117126027913960400191505060405180910390fd5b60606105cb82611314565b90507f649bbc62d0e31342afea4e5cd82d4049e7e1ee912fc0889aa790803be39038c589898989858a8a610600602054611314565b60405180806020018060200180602001806020018060200186810386528e8e82818152602001925080828437600081840152601f19601f82011690508083019250505086810385528c8c82818152602001925080828437600081840152601f19601f82011690508083019250505086810384528a818151815260200191508051906020019080838360005b838110156106a657808201518184015260208101905061068b565b50505050905090810190601f1680156106d35780820380516001836020036101000a031916815260200191505b508681038352898982818152602001925080828437600081840152601f19601f820116905080830192505050868103825287818151815260200191508051906020019080838360005b8381101561073757808201518184015260208101905061071c565b50505050905090810190601f1680156107645780820380516001836020036101000a031916815260200191505b509d505050505050505050505050505060405180910390a1600060028a8a600060801b6040516020018084848082843780830192505050826fffffffffffffffffffffffffffffffff19166fffffffffffffffffffffffffffffffff1916815260100193505050506040516020818303038152906040526040518082805190602001908083835b6020831061080e57805182526020820191506020810190506020830392506107eb565b6001836020036101000a038019825116818451168082178552505050505050905001915050602060405180830381855afa158015610850573d6000803e3d6000fd5b5050506040513d602081101561086557600080fd5b8101908080519060200190929190505050905060006002808888600090604092610891939291906115da565b6040516020018083838082843780830192505050925050506040516020818303038152906040526040518082805190602001908083835b602083106108eb57805182526020820191506020810190506020830392506108c8565b6001836020036101000a038019825116818451168082178552505050505050905001915050602060405180830381855afa15801561092d573d6000803e3d6000fd5b5050506040513d602081101561094257600080fd5b8101908080519060200190929190505050600289896040908092610968939291906115da565b6000801b604051602001808484808284378083019250505082815260200193505050506040516020818303038152906040526040518082805190602001908083835b602083106109cd57805182526020820191506020810190506020830392506109aa565b6001836020036101000a038019825116818451168082178552505050505050905001915050602060405180830381855afa158015610a0f573d6000803e3d6000fd5b5050506040513d6020811015610a2457600080fd5b810190808051906020019092919050505060405160200180838152602001828152602001925050506040516020818303038152906040526040518082805190602001908083835b60208310610a8e5780518252602082019150602081019050602083039250610a6b565b6001836020036101000a038019825116818451168082178552505050505050905001915050602060405180830381855afa158015610ad0573d6000803e3d6000fd5b5050506040513d6020811015610ae557600080fd5b810190808051906020019092919050505090506000600280848c8c604051602001808481526020018383808284378083019250505093505050506040516020818303038152906040526040518082805190602001908083835b60208310610b615780518252602082019150602081019050602083039250610b3e565b6001836020036101000a038019825116818451168082178552505050505050905001915050602060405180830381855afa158015610ba3573d6000803e3d6000fd5b5050506040513d6020811015610bb857600080fd5b8101908080519060200190929190505050600286600060401b866040516020018084805190602001908083835b60208310610c085780518252602082019150602081019050602083039250610be5565b6001836020036101000a0380198251168184511680821785525050505050509050018367ffffffffffffffff191667ffffffffffffffff1916815260180182815260200193505050506040516020818303038152906040526040518082805190602001908083835b60208310610c935780518252602082019150602081019050602083039250610c70565b6001836020036101000a038019825116818451168082178552505050505050905001915050602060405180830381855afa158015610cd5573d6000803e3d6000fd5b5050506040513d6020811015610cea57600080fd5b810190808051906020019092919050505060405160200180838152602001828152602001925050506040516020818303038152906040526040518082805190602001908083835b60208310610d545780518252602082019150602081019050602083039250610d31565b6001836020036101000a038019825116818451168082178552505050505050905001915050602060405180830381855afa158015610d96573d6000803e3d6000fd5b5050506040513d6020811015610dab57600080fd5b81019080805190602001909291905050509050858114610e16576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252605481526020018061162f6054913960600191505060405180910390fd5b6001602060020a0360205410610e77576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252602181526020018061160e6021913960400191505060405180910390fd5b60016020600082825401925050819055506000602054905060008090505b6020811015610fb75760018083161415610ec8578260008260208110610eb757fe5b018190555050505050505050610fc7565b600260008260208110610ed757fe5b01548460405160200180838152602001828152602001925050506040516020818303038152906040526040518082805190602001908083835b60208310610f335780518252602082019150602081019050602083039250610f10565b6001836020036101000a038019825116818451168082178552505050505050905001915050602060405180830381855afa158015610f75573d6000803e3d6000fd5b5050506040513d6020811015610f8a57600080fd5b8101908080519060200190929190505050925060028281610fa757fe5b0491508080600101915050610e95565b506000610fc057fe5b5050505050505b50505050505050565b6060610fdd602054611314565b905090565b6000806000602054905060008090505b60208110156111d057600180831614156110e05760026000826020811061101557fe5b01548460405160200180838152602001828152602001925050506040516020818303038152906040526040518082805190602001908083835b60208310611071578051825260208201915060208101905060208303925061104e565b6001836020036101000a038019825116818451168082178552505050505050905001915050602060405180830381855afa1580156110b3573d6000803e3d6000fd5b5050506040513d60208110156110c857600080fd5b810190808051906020019092919050505092506111b6565b600283602183602081106110f057fe5b015460405160200180838152602001828152602001925050506040516020818303038152906040526040518082805190602001908083835b6020831061114b5780518252602082019150602081019050602083039250611128565b6001836020036101000a038019825116818451168082178552505050505050905001915050602060405180830381855afa15801561118d573d6000803e3d6000fd5b5050506040513d60208110156111a257600080fd5b810190808051906020019092919050505092505b600282816111c057fe5b0491508080600101915050610ff2565b506002826111df602054611314565b600060401b6040516020018084815260200183805190602001908083835b6020831061122057805182526020820191506020810190506020830392506111fd565b6001836020036101000a0380198251168184511680821785525050505050509050018267ffffffffffffffff191667ffffffffffffffff1916815260180193505050506040516020818303038152906040526040518082805190602001908083835b602083106112a55780518252602082019150602081019050602083039250611282565b6001836020036101000a038019825116818451168082178552505050505050905001915050602060405180830381855afa1580156112e7573d6000803e3d6000fd5b5050506040513d60208110156112fc57600080fd5b81019080805190602001909291905050509250505090565b6060600867ffffffffffffffff8111801561132e57600080fd5b506040519080825280601f01601f1916602001820160405280156113615781602001600182028036833780820191505090505b50905060008260c01b90508060076008811061137957fe5b1a60f81b8260008151811061138a57fe5b60200101907effffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916908160001a905350806006600881106113c657fe5b1a60f81b826001815181106113d757fe5b60200101907effffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916908160001a9053508060056008811061141357fe5b1a60f81b8260028151811061142457fe5b60200101907effffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916908160001a9053508060046008811061146057fe5b1a60f81b8260038151811061147157fe5b60200101907effffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916908160001a905350806003600881106114ad57fe5b1a60f81b826004815181106114be57fe5b60200101907effffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916908160001a905350806002600881106114fa57fe5b1a60f81b8260058151811061150b57fe5b60200101907effffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916908160001a9053508060016008811061154757fe5b1a60f81b8260068151811061155857fe5b60200101907effffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916908160001a9053508060006008811061159457fe5b1a60f81b826007815181106115a557fe5b60200101907effffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916908160001a90535050919050565b600080858511156115ea57600080fd5b838611156115f757600080fd5b600185028301915084860390509450949250505056fe4465706f736974436f6e74726163743a206d65726b6c6520747265652066756c6c4465706f736974436f6e74726163743a207265636f6e7374727563746564204465706f7369744461746120646f6573206e6f74206d6174636820737570706c696564206465706f7369745f646174615f726f6f744465706f736974436f6e74726163743a20696e76616c6964207769746864726177616c5f63726564656e7469616c73206c656e6774684465706f736974436f6e74726163743a206465706f7369742076616c7565206e6f74206d756c7469706c65206f6620677765694465706f736974436f6e74726163743a20696e76616c6964207075626b6579206c656e6774684465706f736974436f6e74726163743a206465706f7369742076616c756520746f6f20686967684465706f736974436f6e74726163743a206465706f7369742076616c756520746f6f206c6f774465706f736974436f6e74726163743a20696e76616c6964207369676e6174757265206c656e677468a2646970667358221220230afd4b6e3551329e50f1239e08fa3ab7907b77403c4f237d9adf679e8e43cf64736f6c634300060b0033'
      },
      // TODO: find a way to inject this with a var
      '0x123463a4b065722e99115d6c222f267d9cabb524': {
        balance: '20000000000000000000000'
      },
      '0x5678E9E827B3be0E3d4b910126a64a697a148267': {
        balance: '20000000000000000000000'
      },
      '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266': {
        balance: '10000000000000000000000'
      },
      '0x70997970c51812dc3a010c7d01b50e0d17dc79c8': {
        balance: '10000000000000000000000'
      },
      '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc': {
        balance: '10000000000000000000000'
      },
      '0x90f79bf6eb2c4f870365e785982e1f101e93b906': {
        balance: '10000000000000000000000'
      },
      '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65': {
        balance: '10000000000000000000000'
      },
      '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc': {
        balance: '10000000000000000000000'
      },
      '0x976ea74026e726554db657fa54763abd0c3a0aa9': {
        balance: '10000000000000000000000'
      },
      '0x14dc79964da2c08b23698b3d3cc7ca32193d9955': {
        balance: '10000000000000000000000'
      },
      '0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f': {
        balance: '10000000000000000000000'
      },
      '0xa0ee7a142d267c1f36714e4a8f75612f20a79720': {
        balance: '10000000000000000000000'
      },
      '0xbcd4042de499d14e55001ccbb24a551f3b954096': {
        balance: '10000000000000000000000'
      },
      '0x71be63f3384f5fb98995898a86b02fb2426c5788': {
        balance: '10000000000000000000000'
      },
      '0xfabb0ac9d68b0b445fb7357272ff202c5651694a': {
        balance: '10000000000000000000000'
      },
      '0x1cbd3b2770909d4e10f157cabc84c7264073c9ec': {
        balance: '10000000000000000000000'
      },
      '0xdf3e18d64bc6a983f673ab319ccae4f1a57c7097': {
        balance: '10000000000000000000000'
      },
      '0xcd3b766ccdd6ae721141f452c550ca635964ce71': {
        balance: '10000000000000000000000'
      },
      '0x2546bcd3c84621e976d8185a91a922ae77ecec30': {
        balance: '10000000000000000000000'
      },
      '0xbda5747bfd65f08deb54cb465eb87d40e51b197e': {
        balance: '10000000000000000000000'
      },
      '0xdd2fd4581271e230360230f9337d5c0430bf44c0': {
        balance: '10000000000000000000000'
      },
      '0x8626f6940e2eb28930efb4cef49b2d1f2c9c1199': {
        balance: '10000000000000000000000'
      }
    }
  }

  static async newNode(config: ChainConfig, hostDir: string, reuse: boolean, logger: Logger): Promise<RunningChain> {
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
        exposedPorts: [RunningGethChain.rpcEndpoint.port, RunningGethChain.authRpcEndpoint.port],
        imageRepoTag: `${image.Repository}:${image.Tag}`,
        detach: true,
        tty: true,
        publishAllPorts: true,
        volumes: [[hostDir, '/tmp']],
        workDir: '/tmp'
      },
      chainLogger,
      reuse && false // TODO Implement reuse container
    )

    const chain = new RunningGethChain(config as EvmChainConfig, hostDir, chainLogger)
    chain.setContainer(ImageLabelTypes.Main, container)
    return chain
  }

  containerGethDataDir: string = '/tmp/gethDataDir'
  readonly rpcEndpoint = RunningGethChain.rpcEndpoint
  protected override accounts?: ReturnType<typeof generateEvmAccounts>

  override async generateAccounts(accounts: AccountsConfig) {
    return generateEvmAccounts(accounts)
  }

  override async start() {
    await this.loadAccounts()
    await this.init()
    await this.startChainDaemon()
    await this.isChainReady()
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
      10,
      5000,
      JSON.stringify(this.config, null, 2)
    )
    return true
  }

  protected hostDirPath(...relativePaths: string[]): string {
    return utils.path.join(this.hostWd, ...relativePaths)
  }

  async startChainDaemon() {
    utils.fs.writeFileSync(this.hostDirPath('jwt.hex'), RunningGethChain.JWTToken)

    // Based on https://github.com/rauljordan/eth-pos-devnet/blob/master/docker-compose.yml
    const rawCmds = [
      imageByLabel(this.config.Images, ImageLabelTypes.Main).Bin!,
      '--nodiscover',
      '--http',
      '--http.api',
      'eth,net,web3,debug',
      '--http.addr',
      '0.0.0.0',
      '--authrpc.vhosts',
      '*',
      '--authrpc.addr',
      '0.0.0.0',
      '--authrpc.jwtsecret',
      '/tmp/jwt.hex',
      '--datadir',
      this.containerGethDataDir,
      '--allow-insecure-unlock',
      '--unlock',
      RunningGethChain.signer,
      '--password',
      utils.path.join(this.containerGethDataDir, 'signerPwd'),
      '--keystore',
      utils.path.join(this.containerGethDataDir, 'keystore'),
      '--syncmode',
      'full',
      '--mine',
      '--networkid',
      RunningGethChain.chainId.toString()
    ]

    const cmds = ['sh', '-c', `${rawCmds.map($.quote).join(' ')} 1>${this.entrypointStdout} 2>${this.entrypointStderr}`]
    utils.fs.writeFileSync(this.hostDirPath('chain.d.cmd'), cmds.join(' '))
    await this.getContainer(ImageLabelTypes.Main).exec(cmds, true, true)
  }

  private writeSignerFile() {
    const genesisSignerData = `{"address":"${RunningGethChain.signer}","crypto":{"cipher":"aes-128-ctr","ciphertext":"93b90389b855889b9f91c89fd15b9bd2ae95b06fe8e2314009fc88859fc6fde9","cipherparams":{"iv":"9dc2eff7967505f0e6a40264d1511742"},"kdf":"scrypt","kdfparams":{"dklen":32,"n":262144,"p":1,"r":8,"salt":"c07503bb1b66083c37527cd8f06f8c7c1443d4c724767f625743bd47ae6179a4"},"mac":"6d359be5d6c432d5bbb859484009a4bf1bd71b76e89420c380bd0593ce25a817"},"id":"622df904-0bb1-4236-b254-f1b8dfdff1ec","version":3}`
    // todo: change to the first account from config
    const signerFileName = `UTC--2022-08-19T17-38-31.257380510Z--${RunningGethChain.signer}`
    utils.fs.writeFileSync(utils.path.join(this.keyStoreDir, signerFileName), genesisSignerData)
    utils.fs.writeFileSync(this.passwordFile, '')
  }

  private async writeGenesisFile(accounts: ReturnType<typeof generateEvmAccounts>) {
    for (const account of accounts) {
      if (!account.Balance) continue
      RunningGethChain.genesis.alloc[account.Address] = {
        balance: ethers.utils.parseEther(account.Balance.toString()).toString()
      }
    }
    utils.fs.writeFileSync(this.genesisFile, JSON.stringify(RunningGethChain.genesis))

    // Run `geth init` in container
    const hostGenesisFilePath = utils.path.join(this.containerGethDataDir, 'genesis.json')
    // await this.container.exec(['mkdir', hostGenesisFilePath])
    await this.getContainer(ImageLabelTypes.Main).exec([
      imageByLabel(this.config.Images, ImageLabelTypes.Main).Bin!,
      'init',
      '--datadir',
      this.containerGethDataDir,
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
