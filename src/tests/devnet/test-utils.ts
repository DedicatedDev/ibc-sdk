import * as utils from '../../lib/utils/index.js'
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing'
import * as self from '../../lib/index.js'
import { ethers } from 'ethers'
import { ChainConfig } from '../../lib/dev/schemas.js'

const configPath = utils.getRelativeFilePath('../../../src/tests/devnet/bsc_polymer_chains.config.yaml')
const parliaHeaderPath = utils.getRelativeFilePath('../../../../light-clients/parlia/testdata/')

export function getConfigs(chains: string[]): string {
  const chainsetsConfig = utils.readYaml(configPath)
  const configOverride = { chains: chains, cleanupMode: 'debug' }
  chainsetsConfig.ChainSets = chainsetsConfig.ChainSets.filter((cs: ChainConfig) =>
    configOverride.chains.includes(cs.Name)
  )
  chainsetsConfig.Run.CleanupMode = configOverride.cleanupMode

  return JSON.stringify(chainsetsConfig)
}

export async function createSignerClient(
  sender: self.dev.schemas.CosmosAccounts[0],
  chainRpc: string,
  logger: utils.Logger
): Promise<self.cosmos.client.SigningStargateClient> {
  const offlineSigner = await DirectSecp256k1HdWallet.fromMnemonic(sender.Mnemonic!, { prefix: 'polymerase' })
  logger.verbose(`sender address: ${sender.Address}, mnemonic: ${sender.Mnemonic}`)
  const signerClient = await self.cosmos.client.SigningStargateClient.createWithSigner(
    await self.cosmos.client.newTendermintClient(chainRpc),
    offlineSigner,
    self.cosmos.client.signerOpts()
  )
  logger.verbose(`Created the Signer Client`)
  return signerClient
}

export async function genEvmHeaders(
  evmRpcUrl: string,
  startBlock: number = 0
): Promise<{ blocks: any[]; height: number }> {
  const provider = new ethers.providers.JsonRpcProvider(evmRpcUrl)
  const rawBlock = await provider.send('eth_getBlockByNumber', [ethers.utils.hexValue(startBlock), true])
  return {
    blocks: [rawBlock],
    height: startBlock
  }
}

export function readParliaHeaders(start: number, take: number = 1): any[] {
  const paths = [...Array(take).keys()].map((i) => getParliaFilePath(i + start))
  return paths.map((path) => {
    return JSON.parse(utils.fs.readFileSync(path, 'utf-8'))
  })
}

function getParliaFilePath(index: number): string {
  return `${parliaHeaderPath}parlia-header-${index}.json`
}
