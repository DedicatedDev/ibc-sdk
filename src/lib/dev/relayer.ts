import assert from 'assert'
import { z } from 'zod'
import { utils } from './deps'
import { Container, newContainer, images } from './docker'
import { ChainSetsRunObj, RelayerRunObj } from './schemas'

export const CosmosChainRegistryItemSchema = z.object({
  name: z.string().min(1),
  chainId: z.string().min(1),
  prefix: z.string().min(1),
  gasPrice: z.string().nullish(),
  rpc: z.array(z.string().min(5)).min(1)
})

export const CosmosChainConnEndSchema = z.object({
  /** chain name that matches the name in the registry */
  name: z.string().min(1),
  /** if null, connection will be established with this chain;
  otherwise use existing connections */
  connectionId: z.string().min(1).nullish()
})

export const RelayerConfigSchema = z.object({
  chainRegistry: z.array(CosmosChainRegistryItemSchema).min(1),
  chainPair: z.object({
    src: CosmosChainConnEndSchema,
    dest: CosmosChainConnEndSchema
  }),
  relayerAccount: z.object({ mnemonic: z.string().min(1) })
})

export type RelayerConfig = z.infer<typeof RelayerConfigSchema>

export function newChainRegistry(
  runObj: ChainSetsRunObj,
  names: string[],
  rpcFromContainer: boolean
): RelayerConfig['chainRegistry'] {
  assert(names.length >= 2, `Need at least 2 chains to generate relayer config, but got ${names}`)

  const chainSets = runObj.ChainSets.filter((cs) => names.includes(cs.Name))
  // matched chain sets should be the same as unique `names`
  assert(chainSets.length === new Set(names).size, `cannot find all chains in ChainSetsRunObj by names: ${names}`)

  const chainRegistry = chainSets.map((cs: any) => ({
    name: cs.Name,
    chainId: cs.Name,
    prefix: cs.Prefix,
    gasPrice: '0stake',
    rpc: rpcFromContainer ? cs.Nodes.map((n) => n.RpcContainer) : cs.Nodes.map((n) => n.RpcHost)
  }))

  return chainRegistry
}

export function newIbcRelayerConfig(
  chainRegistry: RelayerConfig['chainRegistry'],
  chainPair: RelayerConfig['chainPair'],
  relayerAccount: RelayerConfig['relayerAccount']
): RelayerConfig {
  return { chainRegistry, chainPair, relayerAccount }
}

export async function newIBCTsRelayer(workDir: string, id: string): Promise<IBCTsRelayer> {
  const containerDir = utils.ensureDir(utils.path.join(workDir, `ibc-relayer-${id}`))
  const container = await newContainer({
    entrypoint: 'sh',
    imageRepoTag: images.ibc_relayer.full(),
    detach: true,
    tty: true,
    workDir: '/tmp',
    volumes: [[containerDir, '/tmp']]
  })
  // TODO: will change to generic relayer implementation once we support more than one relayers
  // use confio-ts-relayer for now
  const cmdPrefixes = ['/ts-relayer/poly-ibc-relayer', 'confio-ts-relayer']
  return new IBCTsRelayer(id, container, cmdPrefixes)
}

// type RelayerConfig = ReturnType<typeof generateIbcRelayerConfig>

class IBCTsRelayer {
  name: string
  container: Container
  cmdPrefixes: string[]

  constructor(name: string, container: Container, cmdPrefixes: string[]) {
    this.name = name
    this.container = container
    this.cmdPrefixes = cmdPrefixes
  }

  async init(relayerConfig: RelayerConfig) {
    const cmds = [...this.cmdPrefixes, 'init', '-c', JSON.stringify(relayerConfig)]
    await this.container.exec(cmds)
  }

  async connect() {
    const cmds = [...this.cmdPrefixes, 'connect']
    await this.container.exec(cmds)
  }

  async channel(config: any) {
    const cmds = [...this.cmdPrefixes, 'channel', '-c', JSON.stringify(config)]
    await this.container.exec(cmds)
  }

  async getConnections() {
    const cmds = [...this.cmdPrefixes, 'connections']
    const out = await this.container.exec(cmds)
    return JSON.parse(out.stdout)
  }

  async getChannels(config: any) {
    const cmds = [...this.cmdPrefixes, 'channels', '-c', JSON.stringify(config)]
    const out = await this.container.exec(cmds)
    return JSON.parse(out.stdout)
  }

  async relayOnce() {
    const cmds = [...this.cmdPrefixes, 'relay-once']
    return await this.container.exec(cmds)
  }

  async relay() {
    const cmds = [...this.cmdPrefixes, 'relay']
    return await this.container.exec(cmds, true, true)
  }

  public async runtime(): Promise<RelayerRunObj> {
    return {
      Name: `ibc-relayer-${this.name}`,
      ContainerId: this.container.containerId,
      Configuration: {
        connections: await this.getConnections()
      }
    }
  }
}
