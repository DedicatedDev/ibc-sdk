import winston from 'winston'
import { ChainSetsRunObj, isCosmosChain, isEvmChain, VIBCCoreContractDeployment, RelayerRunObj } from './schemas'
import { CosmosAccount, CosmosAccounts } from './accounts_config.js'
import { VIBCRelayer } from './vibc_relayer'
import * as self from '../../lib/index.js'
import { EthRelayer } from './eth_relayer.js'

function findRelayerAccount(runtime: ChainSetsRunObj, src: string, dst: string): CosmosAccount | undefined {
  for (const chain of runtime.ChainSets) {
    if (chain.Name !== src && chain.Name !== dst) continue
    for (const account of chain.Accounts as CosmosAccounts) {
      if (account.Name === 'relayer') return account
    }
  }
  return undefined
}

async function setupIbcRelayer(runtime: ChainSetsRunObj, relayPath: string[], log: winston.Logger) {
  const [src, dst] = relayPath
  log.info(`starting ibc-relayer with path ${src} -> ${dst}`)

  const chainRegistry = self.dev.newChainRegistry(runtime, [src, dst], true)
  const chainPair = { src: { name: src }, dest: { name: dst } }

  const relayerAccount = findRelayerAccount(runtime, src, dst)
  if (relayerAccount === undefined || !relayerAccount.Mnemonic) {
    throw new Error('Missing relayer account or mnemonic')
  }
  const relayerConfig = self.dev.newIbcRelayerConfig(chainRegistry, chainPair, { mnemonic: relayerAccount.Mnemonic })
  const relayer = await self.dev.newIBCRelayer(runtime.Run.WorkingDir, `${src}-${dst}`, log)
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
  log.info('ibc-relayer started')
}

async function setupVIbcRelayer(
  runtime: ChainSetsRunObj,
  dispatcherContracts: VIBCCoreContractDeployment,
  paths: string[][],
  log: winston.Logger
) {
  log.info(`starting vibc-relayer with path(s) ${paths.map((p) => `${p[0]} -> ${p[1]}`).join(', ')}`)
  const relayer = await VIBCRelayer.create(runtime.Run.WorkingDir, log)
  const relayerConfig = relayer.config(runtime, dispatcherContracts, paths)
  let out = await relayer.setup(relayerConfig)
  if (out.exitCode !== 0) throw new Error(`Could not setup the vibc-relayer: ${out.stderr}`)

  out = await relayer.run()
  if (out.exitCode !== 0) throw new Error(`Could not run the vibc-relayer: ${out.stderr}`)

  runtime.Relayers.push(await relayer.runtime())
  log.info('vibc-relayer started')
}

async function setupEthRelayer(
  runtime: ChainSetsRunObj,
  dispatcherContracts: VIBCCoreContractDeployment,
  paths: string[],
  log: winston.Logger
) {
  log.info(`starting vibc-relayer with path ${paths[0]} -> ${paths[1]}`)
  const relayer = await EthRelayer.create(runtime, dispatcherContracts, paths, log)
  const out = await relayer.run()
  if (out.exitCode !== 0) throw new Error(`Could not run the vibc-relayer: ${out.stderr}`)

  runtime.Relayers.push(relayer.runtime())
  log.info('vibc-relayer started')
}

export type RelayingPaths = {
  vibc: string[][]
  eth2: string[][]
  ibc: string[][]
}

export function configurePaths(runtime: ChainSetsRunObj, paths: string[]): RelayingPaths {
  const ibcPaths: string[][] = []
  const vibcPaths: string[][] = []
  const eth2Paths: string[][] = []
  const chainType: { [id: string]: string } = {}

  for (const chain of runtime.ChainSets) {
    chainType[chain.Name] = chain.Type
  }

  // if relaying paths were provided, respect them
  for (const path of paths) {
    const [src, dst] = path.split(':')
    if (!chainType[src]) throw new Error(`Invalid source path end: unknown chain ${src}`)
    if (!chainType[dst]) throw new Error(`Invalid destination path end: unknown chain ${dst}`)

    // cosmos to cosmos -> set up ibc relayer path
    if (isCosmosChain(chainType[src]) && isCosmosChain(chainType[dst])) {
      ibcPaths.push([src, dst])
      continue
    }

    // polymer to evm -> set up eth relayer path
    if (chainType[src] === 'polymer' && isEvmChain(chainType[dst])) {
      vibcPaths.push([src, dst])
      continue
    }

    if (isEvmChain(chainType[src]) && chainType[dst] === 'polymer') {
      eth2Paths.push([src, dst])
      continue
    }

    // anything else, throw an error!
    throw new Error(`Invalid relaying path configuration: ${src} -> ${dst}`)
  }

  return { ibc: ibcPaths, vibc: vibcPaths, eth2: eth2Paths }
}

export async function runRelayers(
  runtime: ChainSetsRunObj,
  dispatcherContracts: VIBCCoreContractDeployment,
  relayingPaths: string[],
  logger: winston.Logger
): Promise<ChainSetsRunObj> {
  const paths = configurePaths(runtime, relayingPaths)
  const promises: Promise<void>[] = []

  if (paths.vibc.length > 0) {
    promises.push(setupVIbcRelayer(runtime, dispatcherContracts, paths.vibc, logger))
  }

  // TODO: what happens if we have more than one path here? Is the eth2 relayer going to be able to handle it?
  if (paths.eth2.length > 0) {
    promises.push(setupEthRelayer(runtime, dispatcherContracts, paths.eth2[0], logger))
  }

  // TODO: create one instance of the ibc-relayer per path because the ts-relayer sucks
  for (const path of paths.ibc) {
    promises.push(setupIbcRelayer(runtime, path, logger))
  }

  await Promise.all(promises)

  self.dev.saveChainSetsRuntime(runtime)
  return runtime
}

export async function createLightClient(runtime: RelayerRunObj, path: string, lcType: string, log: winston.Logger) {
  const [src, dst] = path.split(':')
  if (!runtime.Configuration.chains[src]) throw new Error(`Invalid source path end: unknown chain ${src}`)
  if (!runtime.Configuration.chains[dst]) throw new Error(`Invalid destination path end: unknown chain ${dst}`)

  const vibcRelayer = await VIBCRelayer.reuse(runtime, log)
  const out = await vibcRelayer.createLightClient(src, dst, lcType)
  if (out.exitCode !== 0) throw new Error(`Could not create light client: ${out.stderr}`)
  log.info(`Light Client created: ${out.stdout.trim()}`)
}
