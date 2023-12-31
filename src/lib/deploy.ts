import { ethers } from 'ethers'
import { utils } from './deps'
import path from 'path'
import { ChainSetsRunObj, CosmosChainSet, DeployedContract, EvmChainSet, isCosmosChain, isEvmChain } from './schemas'
import { $, fs, getLogger } from './utils'
import { Attribute, Event } from '@cosmjs/stargate'
import { saveChainSetsRuntime } from './chainset'
import { newJsonRpcProvider } from './ethers'

const log = getLogger()

async function deployVIBCCoreContractsOnChain(
  runtime: ChainSetsRunObj,
  contractsDir: string,
  chain: EvmChainSet,
  useZkMint: boolean
) {
  const contracts: DeployedContract[] = []
  const account = chain.Accounts[0].Address

  log.info(`deploying vIBC core smart contracts on chain ${chain.Name}, type ${chain.Type}, using account ${account}`)

  let scpath = path.join(contractsDir, 'IbcDispatcher.sol', 'IbcDispatcher.json')
  contracts.push(await deployEvmSmartContract(chain, account, scpath))

  scpath = path.join(contractsDir, 'IbcReceiver.sol', 'IbcReceiver.json')
  contracts.push(await deployEvmSmartContract(chain, account, scpath))

  scpath = path.join(contractsDir, 'IbcVerifier.sol', 'ZKMintVerifier.json')
  contracts.push(await deployEvmSmartContract(chain, account, scpath))

  let verifier: DeployedContract
  if (useZkMint) {
    scpath = path.join(contractsDir, 'Verifier.sol', 'Verifier.json')
    verifier = await deployEvmSmartContract(chain, account, scpath)
  } else {
    scpath = path.join(contractsDir, 'DummyVerifier.sol', 'DummyVerifier.json')
    verifier = await deployEvmSmartContract(chain, account, scpath)
  }
  contracts.push(verifier)

  scpath = path.join(contractsDir, 'Dispatcher.sol', 'Dispatcher.json')
  // TODO: using the same account that deploys the contract as the escrow address
  // TODO: calculate the port prefix based on the actual chain id.
  const prefix = 'polyibc.Ethereum-Devnet.'
  const dispatcher = await deployEvmSmartContract(chain, account, scpath, verifier.Address, account, prefix)
  contracts.push(dispatcher)

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
  useZkMint: boolean
): Promise<ChainSetsRunObj> {
  const promises: Promise<void>[] = []
  for (const chain of runtime.ChainSets) {
    if (isEvmChain(chain.Type)) {
      promises.push(deployVIBCCoreContractsOnChain(runtime, contractsDir, chain as EvmChainSet, useZkMint))
    }
  }
  await Promise.all(promises)
  return runtime
}

function newContractFactory(contract: any, signer: ethers.Wallet) {
  if (!contract.abi) throw new Error('Cannot deploy contract: missing abi field')

  const bytecode = contract.bytecode ?? contract.data.bytecode.object
  if (!bytecode) throw new Error('Cannot deploy contract: missing bytecode field')

  return new ethers.ContractFactory(contract.abi, bytecode, signer)
}

async function deployEvmSmartContract(
  chain: EvmChainSet,
  account: string,
  scpath: string,
  ...scargs: string[]
): Promise<DeployedContract> {
  const provider = newJsonRpcProvider(chain.Nodes[0].RpcHost)

  const deployer = chain.Accounts.find((a) => a.Address === account)
  if (!deployer) throw new Error(`Could not find account '${account}' on chain ${chain.Name}`)

  const signer = new ethers.Wallet(deployer.PrivateKey!, provider)

  const contract = JSON.parse(fs.readFileSync(scpath, 'utf-8'))
  const factory = newContractFactory(contract, signer)
  const deploy = await factory.deploy(...scargs)
  const receipt = await deploy.deployTransaction.wait()

  return {
    Name: contract.contractName,
    Address: deploy.address,
    DeployerAddress: deployer.Address,
    Abi: JSON.stringify(contract.abi),
    TxHash: receipt.transactionHash
  }
}

// TODO: use the RPC endpoints or consolidate with chains/cosmos.ts
class Container {
  id: string
  address: string
  name: string

  constructor(id: string, portID: string, name: string) {
    this.id = id
    this.address = portID
    this.name = name
  }

  async tx(...args: string[]) {
    const cmds = [
      'docker',
      'container',
      'exec',
      this.id,
      'wasmd',
      '--home',
      '/home/heighliner/.wasmd',
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
      this.address,
      '--keyring-backend',
      'test',
      '--chain-id',
      this.name
    ]

    const out = await $`${cmds}`
    const receipt = JSON.parse(out.stdout)

    const queryCmds = [
      'docker',
      'container',
      'exec',
      this.id,
      'wasmd',
      '--home',
      '/home/heighliner/.wasmd',
      'query',
      'tx',
      `${receipt.txhash}`,
      '--output',
      'json'
    ]

    while (true) {
      try {
        const queryCmdsOut = await $`${queryCmds}`
        return JSON.parse(queryCmdsOut.stdout)
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
  account: string,
  scpath: string,
  scargs: string[]
): Promise<DeployedContract> {
  const deployer = chain.Accounts.find((a) => a.Name === account || a.Address === account)
  if (!deployer) throw new Error(`Could not find account '${account}' on chain ${chain.Name}`)

  const containerId = chain.Nodes[0].ContainerId

  await $`docker cp ${scpath} ${containerId}:/tmp/sc.wasm`
  const container = new Container(containerId, deployer.Address, chain.Name)

  // make sure we pass in an empty object at the very least
  if (scargs.length === 0) scargs.push('{}')

  const tx = await container.tx('store', '/tmp/sc.wasm')
  const storeCode = container.flat(tx, 'store_code')
  const instantiateTx = await container.tx('instantiate', storeCode.code_id, ...scargs, '--no-admin', '--label', 'demo')
  const contract = container.flat(instantiateTx, 'instantiate')

  return {
    Name: path.basename(scpath),
    Address: contract._contract_address,
    DeployerAddress: deployer.Address,
    TxHash: instantiateTx.txhash
  }
}

/**
 * Deploy a smart contracts on the given chain and return the smart contract address
 */
export async function deploySmartContract(
  runtime: ChainSetsRunObj,
  chainName: string,
  account: string,
  scpath: string,
  scargs: string[]
): Promise<DeployedContract> {
  const chain = runtime.ChainSets.find((c) => c.Name === chainName)
  if (!chain) throw new Error(`Could not find chain ${chainName} in chain sets`)

  let contract: DeployedContract | undefined
  if (isEvmChain(chain.Type)) {
    contract = await deployEvmSmartContract(chain as EvmChainSet, account, scpath, ...scargs)
  }

  if (isCosmosChain(chain.Type)) {
    contract = await deployCosmosSmartContract(chain as CosmosChainSet, account, scpath, scargs)
  }

  if (!contract) throw new Error(`Deploying contracts to chain type ${chain.Type} is currently not supported`)

  log.info(
    `Deployed contract ${contract.Name} on chain ${chain.Name} at ${contract.Address} with tx hash ${contract.TxHash} by address ${contract.DeployerAddress}`
  )

  chain.Contracts.push(contract)
  saveChainSetsRuntime(runtime)

  return contract
}
