import * as utils from '../../lib/utils'
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing'
import * as self from '../../lib/index.js'
import { ethers } from 'ethers'
import { ChainConfig, ChainSetsRunObj } from '../../lib/schemas'
import { getLogger } from '../../lib/utils'
import anyTest, { ExecutionContext, TestFn } from 'ava'

const log = getLogger()

const configPath = utils.getRelativeFilePath('../../../src/tests/devnet/bsc_polymer_chains.config.yaml')
const parliaHeaderPath = utils.getRelativeFilePath('../../../../light-clients/parlia/testdata/')

export function getConfigs(chains: string[]): string {
  const chainsetsConfig = utils.readYaml(configPath)
  const configOverride = { chains: chains, cleanupMode: 'debug' }
  chainsetsConfig.ChainSets = chainsetsConfig.ChainSets.filter((cs: ChainConfig) =>
    configOverride.chains.includes(cs.Name)
  )
  return JSON.stringify(chainsetsConfig)
}

export async function createSignerClient(
  sender: self.schemas.CosmosAccounts[0],
  chainRpc: string
): Promise<self.cosmos.client.SigningStargateClient> {
  const offlineSigner = await DirectSecp256k1HdWallet.fromMnemonic(sender.Mnemonic!, { prefix: 'polymer' })
  log.verbose(`sender address: ${sender.Address}, mnemonic: ${sender.Mnemonic}`)
  const signerClient = await self.cosmos.client.SigningStargateClient.createWithSigner(
    await self.cosmos.client.newTendermintClient(chainRpc),
    offlineSigner,
    self.cosmos.client.signerOpts()
  )
  log.verbose(`Created the Signer Client`)
  return signerClient
}

export async function genEvmHeaders(
  evmRpcUrl: string,
  startBlock: number = 0
): Promise<{ blocks: any[]; height: number }> {
  const provider = self.newJsonRpcProvider(evmRpcUrl)
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

export type RuntimeContext = {
  runtime: ChainSetsRunObj
  workspace: string
}
export const runtimeTest = anyTest as TestFn<RuntimeContext>

export async function cleanupRuntime(t: ExecutionContext<RuntimeContext>) {
  if (t.context.runtime) {
    // after clean up, folders should be cleaned up and containers are stopped
    await self.cleanupRuntime(t.context.runtime, true)
  }
}

export function getWorkspace(prefix: string): string {
  return `/tmp/${prefix}-${(Math.random() + 1).toString(36).substring(2)}`
}

export async function showLogsBeforeExit(cli: string, workspace: string) {
  if (!process.env.TEST_IBCTL_LOGS_BEFORE_EXIT) return
  const components = ['polymer', 'eth', 'wasm', 'eth-relayer', 'vibc-relayer', 'ibc-relayer']
  for (const c of components) {
    log.info(`${c} logs ...`)
    try {
      await utils.$`${cli} -w ${workspace} logs ${c}`
    } catch {}
  }
}
