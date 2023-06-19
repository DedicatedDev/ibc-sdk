import { ChainSetsRunObj, isCosmosChain } from './schemas'
import { CosmosAccount, CosmosAccounts } from './accounts_config'
import { VIBCRelayer } from './relayers/vibc'
import * as self from './index'
import { EthRelayer } from './relayers/eth'
import { getLogger } from './utils/logger'
import { IBCRelayer } from './relayers/ibc'

const log = getLogger()

type Tuple = [string, string]

function findRelayerAccount(runtime: ChainSetsRunObj, src: string, dst: string): CosmosAccount | undefined {
  for (const chain of runtime.ChainSets) {
    if (chain.Name !== src && chain.Name !== dst) continue
    for (const account of chain.Accounts as CosmosAccounts) {
      if (account.Name === 'relayer') return account
    }
  }
  return undefined
}

async function setupIbcTsRelayer(runtime: ChainSetsRunObj, relayPath: Tuple) {
  const [src, dst] = relayPath
  log.info(`starting ibc-relayer with path ${src} -> ${dst}`)

  const chainRegistry = self.newChainRegistry(runtime, [src, dst], true)
  const chainPair = { src: { name: src }, dest: { name: dst } }

  const relayerAccount = findRelayerAccount(runtime, src, dst)
  if (relayerAccount === undefined || !relayerAccount.Mnemonic) {
    throw new Error('Missing relayer account or mnemonic')
  }
  const relayerConfig = self.newIbcRelayerConfig(chainRegistry, chainPair, { mnemonic: relayerAccount.Mnemonic })
  const relayer = await self.newIBCTsRelayer(runtime.Run.WorkingDir, `${src}-${dst}`)
  await relayer.init(relayerConfig).catch((reason) => {
    log.error(`Could not init ibc-relayer: ${reason}`)
    throw new Error(reason)
  })

  log.info(`creating IBC connections between ${src} and ${dst}`)
  // TODO: let's only set up connections for now. Maybe it could make sense to set up channels if
  //       the user is running only ibc enabled chains
  await relayer.connect().catch((reason) => {
    log.error(`Could not connect ibc-relayer: ${reason}`)
    throw new Error(reason)
  })

  const connections = await relayer.getConnections()
  log.info(`IBC connections created: ${src}: ${connections.srcConnection}, ${dst}: ${connections.destConnection}`)
  await relayer.relay()

  runtime.Relayers.push(await relayer.runtime())
  self.saveChainSetsRuntime(runtime)

  log.info('ibc-relayer started')
}

export async function setupIbcRelayer(runtime: ChainSetsRunObj, paths: Tuple[]) {
  log.info(`setting up ibc-relayer with path(s) ${paths.map((p) => `${p[0]} -> ${p[1]}`).join(', ')}`)

  const relayer = await IBCRelayer.create(runtime.Run.WorkingDir)
  await relayer.setup(runtime, paths).catch((reason) => {
    log.error(`Could not setup ibc-relayer: ${reason}`)
    throw new Error(reason)
  })

  await relayer.connect(paths).catch((reason) => {
    log.error(`Could not connect ibc-relayer: ${reason}`)
    throw new Error(reason)
  })

  runtime.Relayers.push(await relayer.runtime())
  self.saveChainSetsRuntime(runtime)

  log.info('ibc-relayer started')
}

async function setupVIbcRelayer(runtime: ChainSetsRunObj, paths: Tuple[]) {
  log.info(`setting up vibc-relayer with path(s) ${paths.map((p) => `${p[0]} -> ${p[1]}`).join(', ')}`)

  const relayer = await VIBCRelayer.create(runtime.Run.WorkingDir)
  await relayer.setup(runtime, paths)
  runtime.Relayers.push(await relayer.runtime())
  self.saveChainSetsRuntime(runtime)

  log.info('vibc-relayer set up')
}

async function setupEthRelayer(runtime: ChainSetsRunObj, paths: Tuple) {
  log.info(`starting eth-relayer with path ${paths[0]} -> ${paths[1]}`)
  const relayer = await EthRelayer.create(runtime, paths)
  const out = await relayer.run()
  if (out.exitCode !== 0) throw new Error(`Could not run the vibc-relayer: ${out.stderr}`)

  runtime.Relayers.push(relayer.runtime())
  self.saveChainSetsRuntime(runtime)

  log.info('eth-relayer started')
}

export type RelayingPaths = {
  vibc: Tuple[]
  eth2: Tuple[]
  ibc: Tuple[]
}

export function configurePaths(runtime: ChainSetsRunObj, connections: string[]): RelayingPaths {
  const ibcPaths = new Set<string>()
  const vibcPaths = new Set<string>()
  const eth2Paths = new Set<string>()
  const chainType: { [id: string]: string } = {}

  for (const chain of runtime.ChainSets) {
    chainType[chain.Name] = chain.Type
  }

  // if relaying paths were provided, respect them
  for (const connection of connections) {
    const [chainA, chainB] = connection.split(':')
    if (!chainType[chainA]) throw new Error(`Invalid path end: unknown chain ${chainA}`)
    if (!chainType[chainB]) throw new Error(`Invalid path end: unknown chain ${chainB}`)

    // cosmos to cosmos -> set up ibc relayer path
    if (isCosmosChain(chainType[chainA]) && isCosmosChain(chainType[chainB])) {
      ibcPaths.add(chainA + ':' + chainB)
      continue
    }

    // polymer to evm -> set up eth/vibc relayer path
    if (chainType[chainA] === 'polymer' && chainType[chainB] === 'ethereum') {
      vibcPaths.add(chainA + ':' + chainB)
      eth2Paths.add(chainB + ':' + chainA)
      continue
    }

    // evm to polymer -> set up eth/vibc relayer path
    if (chainType[chainA] === 'ethereum' && chainType[chainB] === 'polymer') {
      eth2Paths.add(chainA + ':' + chainB)
      vibcPaths.add(chainB + ':' + chainA)
      continue
    }

    // anything else, throw an error!
    throw new Error(`Invalid relaying path configuration: ${chainA} -> ${chainB}`)
  }

  const list = (s: Set<string>): Tuple[] => Array.from(s).map((a) => a.split(':')) as Tuple[]
  return { ibc: list(ibcPaths), vibc: list(vibcPaths), eth2: list(eth2Paths) }
}

export async function runRelayers(runtime: ChainSetsRunObj, connections: string[]): Promise<ChainSetsRunObj> {
  const paths = configurePaths(runtime, connections)
  const promises: Promise<void>[] = []

  if (paths.vibc.length > 0) {
    promises.push(setupVIbcRelayer(runtime, paths.vibc))
  }

  // TODO: what happens if we have more than one path here? Is the eth2 relayer going to be able to handle it?
  if (paths.eth2.length > 0) {
    promises.push(setupEthRelayer(runtime, paths.eth2[0]))
  }

  // TODO: create one instance of the ibc-relayer per path because the ts-relayer sucks
  for (const path of paths.ibc) {
    promises.push(setupIbcTsRelayer(runtime, path))
  }

  await Promise.all(promises)

  return runtime
}
