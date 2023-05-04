import { ethers } from 'ethers'
import * as winston from 'winston'
import { utils } from './deps'
import { z } from 'zod'
import path from 'path'
import { images, newContainer } from './docker'
import {
  ChainConfig,
  ChainSetsRunObj,
  contractByVmType,
  contractsArtifactsSchema,
  CosmosChainSet,
  deployedChainSchema,
  DeployedContract,
  DeployedContractsMap,
  EvmChainSet,
  isCosmosChain,
  isEvmChain,
  VIBCCoreContractDeployment
} from './schemas'
import { $, fs } from '../utils'
import { Attribute, Event } from '@cosmjs/stargate'
import * as self from '../index'

/*
 TODO:
  remove all this non-sense code here. Deploying contracts should be much simpler than having to
  construct this weird intermediate configuration so we can start a new container.
*/

/**
 * Deploy smart contracts on chains launched from chainSets config
 */
export async function deployOnChainSets(
  rawContractConfig: string | object,
  rawRunObj: string | object,
  logger: utils.Logger
) {
  const contractConfig = typeof rawContractConfig === 'object' ? rawContractConfig : utils.readYaml(rawContractConfig)
  const parsedContractConfig = contractsArtifactsSchema.parse(contractConfig)
  const chainClientImageRepoTag =
    parsedContractConfig.ChainClientImage.Repository + ':' + parsedContractConfig.ChainClientImage.Tag
  const runObj = typeof rawRunObj === 'object' ? rawRunObj : utils.readYaml(rawRunObj)
  for (const evmContractConfig of parsedContractConfig.ContractArtifacts) {
    if (evmContractConfig.VmType !== 'evm') throw new Error(`unsupported VmType ${evmContractConfig.VmType}`)
    await deployEvm(evmContractConfig, JSON.stringify(runObj), chainClientImageRepoTag, logger)
  }
}

/**
 * Deploy smart contracts on chains launched from chainSets config and return the address of the
 * vIBC Core Smart Contract on every EVM chain
 */
export async function deployVIBCCoreContractsOnChainSets(
  rawRunObj: string | object,
  rawContractConfig: string | object,
  logger: utils.Logger
): Promise<VIBCCoreContractDeployment> {
  logger.info('Deploying vIBC Smart Contracts...')
  const runObj = typeof rawRunObj === 'object' ? rawRunObj : utils.readYaml(rawRunObj)
  await deployOnChainSets(rawContractConfig, runObj, logger)

  return await runObj.ChainSets.reduce(async (accumulator: Promise<VIBCCoreContractDeployment>, chain: ChainConfig) => {
    if (isEvmChain(chain.Type)) {
      // need to await on the accumulator since the reduce callback is async 🤯
      const acc = await accumulator
      const evmDeployedPath = path.join(runObj.Run.WorkingDir, chain.Name, 'deployed-contracts.json')
      const deployedJson = JSON.parse(utils.fs.readFileSync(evmDeployedPath, 'utf8'))
      const deployed = deployedChainSchema.parse(deployedJson.Deployed)
      const dispatcherContract = deployed.Contracts.find((c: DeployedContract) => c.Name === 'Dispatcher.json')
      if (dispatcherContract) {
        acc[chain.Name] = { address: dispatcherContract.Address, abi: dispatcherContract.Abi ?? '[]' }
      } else {
        logger.warn(`Could not find Dispatcher.json deployment on chain '${chain.Name}'`)
      }
    }
    return accumulator
  }, Promise.resolve({}))
}

export async function deployCoreContractsOnChainSets(
  runtime: ChainSetsRunObj,
  contractsDir: string,
  log: winston.Logger
): Promise<DeployedContractsMap> {
  const contractsConfig = self.dev.createContractsConfig(contractsDir)
  const runPath = utils.path.join(runtime.Run.WorkingDir, 'run.json')
  const artifactsPath = utils.path.join(runtime.Run.WorkingDir, '..', 'polycore-smart-contracts')

  if (!fs.existsSync(runPath)) {
    throw new Error(`could not read runtime file: ${runPath}`)
  }

  const deployedContracts: DeployedContractsMap = {}
  const contractsWithDeps: string[] = ['Dispatcher.json']

  const chainSetsPromises = runtime.ChainSets.filter((chainSet) => isEvmChain(chainSet.Type)).map(async (chainSet) => {
    for (const contractConfig of contractsConfig) {
      if (contractsWithDeps.includes(contractConfig.Name)) {
        continue
      }
      const scpath = path.join(artifactsPath, contractConfig.Path)
      try {
        deployedContracts[contractConfig.Name] = await self.dev.deploySmartContract(
          runtime,
          chainSet.Name,
          scpath,
          [],
          log
        )
      } catch (e) {
        console.error(`Failed to deploy ${contractConfig.Name}; ${e}`)
      }
    }

    const deployDependentContract = async (contractName, scargs) => {
      const contractConfig = contractsConfig.find((c) => c.Name === contractName)
      if (!contractConfig) {
        throw new Error(`Could not find ${contractName}'s contract in contractsConfig`)
      }

      const scpath = path.join(artifactsPath, contractConfig.Path)
      return await self.dev.deploySmartContract(runtime, chainSet.Name, scpath, scargs, log)
    }

    deployedContracts['Dispatcher.json'] = await deployDependentContract('Dispatcher.json', [
      deployedContracts['Verifier.json'].Address
    ])
  })

  await Promise.all(chainSetsPromises)
  return deployedContracts
}

async function deployEvm(
  evmContractConfig: z.infer<typeof contractByVmType>,
  runObjJson: string,
  chainClientImageRepoTag: string,
  logger: utils.Logger
) {
  const runObj: ChainSetsRunObj = JSON.parse(runObjJson)
  runObj.ChainSets = runObj.ChainSets.filter((chain) => {
    const p = path.join(runObj.Run.WorkingDir, chain.Name, 'deployed-contracts.json')
    return isEvmChain(chain.Type) && !fs.existsSync(p)
  })

  if (runObj.ChainSets.length === 0) {
    logger.info('Smart contracts already deployed to all chains in the chain set.')
    return
  }

  const hostDir = path.resolve(evmContractConfig.ArtifactsDir)
  const containerDir = '/tmp/contracts'
  evmContractConfig.ArtifactsDir = containerDir
  const contractJson = JSON.stringify(evmContractConfig)

  const containerOutput = '/tmp/output'
  const config = {
    args: ['evm-deploy', '-c', contractJson, '-r', runObjJson, '-o', containerOutput],
    imageRepoTag: chainClientImageRepoTag,
    volumes: [[hostDir, containerDir]]
  }

  for (const chain of runObj.ChainSets) {
    config.volumes.push([path.join(runObj.Run.WorkingDir, chain.Name), path.join(containerOutput, chain.Name)])
  }
  await newContainer(config, logger)
}

export function createContractsConfig(contractsDir: string) {
  const contracts: any[] = []
  fs.readdirSync(contractsDir).forEach((dir) => {
    const p = path.join(contractsDir, dir)
    const contractNames = fs.readdirSync(p).filter((f) => f.endsWith('.json') && !f.endsWith('.dbg.json'))
    if (contractNames.length === 0) {
      throw new Error(`Could not find any Smart Contract API definition in ${p}`)
    }

    for (let i = 0; i < contractNames.length; i++) {
      const name = contractNames[i]
      contracts.push({
        Name: name,
        Source: dir,
        Path: path.join(dir, name)
      })
    }
  })

  if (contracts.length === 0) throw new Error(`Could not find any Smart Contract API definition in ${contractsDir}`)

  return contracts
}

export function createContractsConfigStr(contractsDir: string): string {
  const contracts = createContractsConfig(contractsDir)

  return utils.dumpYamlSafe({
    ContractArtifacts: [
      {
        VmType: 'evm',
        Contracts: contracts,
        ArtifactsDir: contractsDir
      }
    ],
    ChainClientImage: {
      Repository: images.chain_client.repo,
      Tag: images.chain_client.tag
    }
  })
}

async function deployEvmSmartContract(chain: EvmChainSet, scpath: string, scargs: string[]): Promise<DeployedContract> {
  const provider = new ethers.providers.JsonRpcProvider(chain.Nodes[0].RpcHost)
  // TODO: need to check if the account exists?
  const signer = new ethers.Wallet(chain.Accounts[0].PrivateKey!, provider)

  const contract = JSON.parse(fs.readFileSync(scpath, 'utf-8'))
  const factory = new ethers.ContractFactory(contract.abi, contract.bytecode, signer)
  const deploy = await factory.deploy(...scargs)
  const receipt = await deploy.deployTransaction.wait()

  const deployerAddress = await signer.getAddress()

  return {
    Name: contract.contractName,
    Address: deploy.address,
    DeployerAddress: deployerAddress,
    Abi: JSON.stringify(contract.abi),
    TxHash: receipt.transactionHash
  }
}

// TODO: use the RPC endpoints
class Container {
  id: string
  account: string
  name: string

  constructor(id: string, account: string, name: string) {
    this.id = id
    this.account = account
    this.name = name
  }

  async tx(...args: string[]) {
    const cmds = [
      'docker',
      'container',
      'exec',
      this.id,
      'wasmd',
      'tx',
      'wasm',
      ...args,
      '--gas',
      'auto',
      '--gas-adjustment',
      '1.2',
      '--output',
      'json',
      '--yes',
      '--from',
      this.account,
      '--keyring-backend',
      'test',
      '--chain-id',
      this.name
    ]

    const out = await $`${cmds}`
    const receipt = JSON.parse(out.stdout)

    const query_cmds = [
      'docker',
      'container',
      'exec',
      this.id,
      'wasmd',
      'query',
      'tx',
      `${receipt.txhash}`,
      '--output',
      'json'
    ]

    while (true) {
      try {
        const query_cmds_out = await $`${query_cmds}`
        return JSON.parse(query_cmds_out.stdout)
      } catch {
        await utils.sleep(2000)
      }
    }
  }

  public flat(res: any, eventName: string): any {
    if (res.code !== 0) throw new Error('Will not flat response, code is not zero')
    const raw = JSON.parse(res.raw_log ?? '')
    const event = raw[0].events.find((e: Event) => e.type === eventName)
    const kv = {}
    event.attributes.forEach((e: Attribute) => (kv[e.key] = e.value))
    return kv
  }
}

async function deployCosmosSmartContract(
  chain: CosmosChainSet,
  scpath: string,
  scargs: string[]
): Promise<DeployedContract> {
  const relayer_account = chain.Accounts.find((a) => a.Name === 'relayer')
  if (!relayer_account) throw new Error('Could not find relayer account')

  const container_id = chain.Nodes[0].ContainerId

  await $`docker cp ${scpath} ${container_id}:/tmp/sc.wasm`
  const container = new Container(container_id, relayer_account.Address, chain.Name)

  const tx = await container.tx('store', '/tmp/sc.wasm', ...scargs)
  const store_code = container.flat(tx, 'store_code')
  const instantiate_tx = await container.tx('instantiate', store_code.code_id, '{}', '--no-admin', '--label', 'demo')
  const contract = container.flat(instantiate_tx, 'instantiate')

  return {
    Name: path.basename(scpath),
    Address: contract._contract_address,
    DeployerAddress: relayer_account.Address,
    TxHash: instantiate_tx.txhash
  }
}

/**
 * Deploy a smart contracts on the given chain and return the smart contract address
 */
export async function deploySmartContract(
  runtime: ChainSetsRunObj,
  chainName: string,
  scpath: string,
  scargs: string[],
  log: winston.Logger
): Promise<DeployedContract> {
  const chain = runtime.ChainSets.find((c) => c.Name === chainName)
  if (!chain) throw new Error(`Could not find chain ${chainName} in chain sets`)

  let contract: DeployedContract | undefined
  if (isEvmChain(chain.Type)) {
    contract = await deployEvmSmartContract(chain as EvmChainSet, scpath, scargs)
  }

  if (isCosmosChain(chain.Type)) {
    contract = await deployCosmosSmartContract(chain as CosmosChainSet, scpath, scargs)
  }

  if (!contract) throw new Error(`Deploying contracts to chain type ${chain.Type} is currently not supported`)

  log.info(
    `Deployed contract ${contract.Name} on chain ${chain.Name} at ${contract.Address} with tx hash ${contract.TxHash} by address ${contract.DeployerAddress}`
  )
  return contract
}
