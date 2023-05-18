import { ethers } from 'ethers'
import * as winston from 'winston'
import { utils } from './deps'
import path from 'path'
import { ChainSetsRunObj, CosmosChainSet, DeployedContract, EvmChainSet, isCosmosChain, isEvmChain } from './schemas'
import { $, fs } from '../utils'
import { Attribute, Event } from '@cosmjs/stargate'
import { saveChainSetsRuntime } from './chainset'

async function deployVIBCCoreContractsOnChain(
  runtime: ChainSetsRunObj,
  contractsDir: string,
  chain: EvmChainSet,
  log: winston.Logger
) {
  const contracts: DeployedContract[] = []
  log.info(`deploying vIBC core smart contracts on chain ${chain.Name}, type ${chain.Type}`)

  let scpath = path.join(contractsDir, 'IbcDispatcher.sol', 'IbcDispatcher.json')
  contracts.push(await deployEvmSmartContract(chain, scpath))

  scpath = path.join(contractsDir, 'IbcReceiver.sol', 'IbcReceiver.json')
  contracts.push(await deployEvmSmartContract(chain, scpath))

  scpath = path.join(contractsDir, 'IbcVerifier.sol', 'ZKMintVerifier.json')
  contracts.push(await deployEvmSmartContract(chain, scpath))

  scpath = path.join(contractsDir, 'Earth.sol', 'Earth.json')
  contracts.push(await deployEvmSmartContract(chain, scpath))

  scpath = path.join(contractsDir, 'Mars.sol', 'Mars.json')
  contracts.push(await deployEvmSmartContract(chain, scpath))

  scpath = path.join(contractsDir, 'Verifier.sol', 'Verifier.json')
  const verifier = await deployEvmSmartContract(chain, scpath)
  contracts.push(verifier)

  scpath = path.join(contractsDir, 'Dispatcher.sol', 'Dispatcher.json')
  contracts.push(await deployEvmSmartContract(chain, scpath, verifier.Address))

  chain.Contracts = contracts
  saveChainSetsRuntime(runtime)

  log.verbose(`deployed ${contracts.length} contracts on ${chain.Name}`)
}

/**
 * Deploy smart contracts on chains launched from chainSets config and return the address of the
 * PolyCore Smart Contract on every EVM chain
 */
export async function deployVIBCCoreContractsOnChainSets(
  runtime: ChainSetsRunObj,
  contractsDir: string,
  log: winston.Logger
): Promise<ChainSetsRunObj> {
  const promises: Promise<void>[] = []
  for (let chain of runtime.ChainSets) {
    if (isEvmChain(chain.Type)) {
      promises.push(deployVIBCCoreContractsOnChain(runtime, contractsDir, chain as EvmChainSet, log))
    }
  }
  await Promise.all(promises)
  return runtime
}

async function deployEvmSmartContract(
  chain: EvmChainSet,
  scpath: string,
  ...scargs: string[]
): Promise<DeployedContract> {
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
    contract = await deployEvmSmartContract(chain as EvmChainSet, scpath, ...scargs)
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
