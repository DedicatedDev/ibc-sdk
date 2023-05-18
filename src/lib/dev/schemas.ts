import { loggerSchema } from '../utils/index.js'
import { z } from 'zod'
import { AccountsConfigSchema, AccountsSchema } from './accounts_config.js'
export {
  AccountsConfigSchema,
  AccountsSchema,
  CosmosAccounts,
  Accounts,
  EvmAccounts,
  CosmosAccount
} from './accounts_config.js'
export { RelayerConfigSchema, RelayerConfig } from './relayer.js'

const EvmChains = ['ethereum', 'bsc'] as const
const CosmosChains = ['cosmos', 'polymer'] as const
const NoneChains = ['ethereum2'] as const

export function isCosmosChain(chainType: string): boolean {
  return Object.values(CosmosChains).some((c) => chainType === c.toString())
}

export function isEvmChain(chainType: string): boolean {
  return Object.values(EvmChains).some((c) => chainType === c.toString())
}

export function isNoneChain(chainType: string): boolean {
  return Object.values(NoneChains).some((c) => chainType === c.toString())
}

export enum ImageLabelTypes {
  Main = 'main',
  Genesis = 'genesis',
  Validator = 'validator'
}

export function imageByLabel(images: ImageConfigSchema[], label: ImageLabelTypes): ImageConfigSchema {
  const image = images.find((i) => i.Label === label)
  if (!image) throw new Error(`Could not find image by label ${label.toString()} in: ${JSON.stringify(images)}`)
  return image
}

export const imageConfigSchema = z.object({
  Label: z.nativeEnum(ImageLabelTypes).optional().default(ImageLabelTypes.Main),
  Repository: z.string(),
  Tag: z.string(),
  Bin: z.string().nullish()
})

export const ChainConfigSchema = (() => {
  const base = z.object({
    Name: z.string().min(1),
    DependsOn: z.string().optional(),
    Images: z.array(imageConfigSchema).min(1),
    Accounts: AccountsConfigSchema.evm.optional()
  })

  const evm = base.extend({
    Type: z.enum(EvmChains),
    ChainClientImage: imageConfigSchema.nullish(),
    Accounts: AccountsConfigSchema.evm
  })

  const none = base.extend({
    Type: z.enum(NoneChains)
  })

  const cosmos = base.extend({
    Type: z.enum(CosmosChains),
    Moniker: z.string(),
    Prefix: z.string(),
    Accounts: AccountsConfigSchema.cosmos,
    Validator: z.object({
      Name: z.string().min(1),
      Staked: z.string().min(2)
    })
  })

  const all = z.union([evm, cosmos, none])
  return Object.freeze({ evm, cosmos, all, none })
})()

export const chainSetsRunConfigSchema = z.object({
  ChainSets: z.array(ChainConfigSchema.all),
  Run: z.object({
    WorkingDir: z.string(),
    CleanupMode: z.enum(['all', 'debug', 'log', 'reuse']).nullish().default('all'),
    Logger: loggerSchema
  })
})

export const runningNodeConfigSchema = z.object({
  Label: z.string(),
  ContainerId: z.string(),
  /** full Rpc url accessible from host */
  RpcHost: z.string(),
  /** full Rpc url accessible from other docker containers */
  RpcContainer: z.string()
})

export const deployedContractSchema = z.object({
  Name: z.string(),
  Address: z.string(),
  DeployerAddress: z.string(),
  Abi: z.string().optional(),
  TxHash: z.string()
})

/** A running chainSet is a live blockchain network with 1+ nodes and prefunded accounts */
export const chainSetSchema = (() => {
  const base = z.object({
    Name: z.string(),
    Images: z.array(imageConfigSchema),
    Nodes: z.array(runningNodeConfigSchema),
    DependsOn: z.string().optional(),
    Accounts: AccountsSchema.evm.optional(),
    Contracts: z.array(deployedContractSchema).default([])
  })
  const evm = base.extend({
    Type: z.enum(EvmChains),
    Accounts: AccountsSchema.evm
  })
  const cosmos = base.extend({
    Type: z.enum(CosmosChains),
    Moniker: z.string(),
    Prefix: z.string(),
    Accounts: AccountsSchema.cosmos
  })
  const none = base.extend({
    Type: z.enum(NoneChains)
  })
  const all = z.union([evm, cosmos, none])
  return Object.freeze({ evm, cosmos, all, none })
})()

export const runningRelayerSchema = z.object({
  Name: z.string(),
  ContainerId: z.string(),
  // TODO This configuration would be unique for each relayer.
  //      We should have an union of all different schemas
  Configuration: z.any()
})

export const runningProverSchema = z.object({
  Name: z.string(),
  ContainerId: z.string(),
  RpcHost: z.string(),
  RpcContainer: z.string(),
  CleanupMode: z.enum(['all', 'reuse']).nullish().default('reuse')
})

export const runningChainSetsSchema = z.object({
  ChainSets: z.array(chainSetSchema.all),
  Relayers: z.array(runningRelayerSchema).default([]),
  Prover: runningProverSchema.nullish(),
  Run: z.object({
    WorkingDir: z.string(),
    CleanupMode: z.enum(['all', 'debug', 'log', 'reuse']).nullish().default('all')
  })
})

export type ChainConfig = z.infer<typeof ChainConfigSchema.all>
export type EvmChainConfig = z.infer<typeof ChainConfigSchema.evm>
export type CosmosChainConfig = z.infer<typeof ChainConfigSchema.cosmos>
export type NoneChainConfig = z.infer<typeof ChainConfigSchema.none>

export type ChainSetsRunConfig = z.infer<typeof chainSetsRunConfigSchema>
export type ChainSetsRunObj = z.infer<typeof runningChainSetsSchema>
export type RelayerRunObj = z.infer<typeof runningRelayerSchema>
export type ProverRunObj = z.infer<typeof runningProverSchema>
export type EvmChainSet = z.infer<typeof chainSetSchema.evm>
export type CosmosChainSet = z.infer<typeof chainSetSchema.cosmos>

export type DeployedContract = z.infer<typeof deployedContractSchema>
export type RunningNodeConfig = z.infer<typeof runningNodeConfigSchema>
export type ImageConfigSchema = z.infer<typeof imageConfigSchema>
