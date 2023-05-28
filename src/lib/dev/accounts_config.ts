import { z } from 'zod'
import { ethers } from './deps.js'

/**
 * AccountsConfig => Accounts
AccountsConfig may or may not have actuall addresses. Random addresses are generated if not already provided for testing purposes.
Accounts are concrete accounts. Each Account must have a address.

Account conventions vary across blockchains/VMs, eg. cosmos vs EVM chains.
 */

const DefaultMnemonic = 'develop test test test test only develop test test test test only'

// types that can be converted into BigNumber, e.g. 1234, '1234', '0xfffff'
const bigNumberish = z.union([z.number(), z.string()])

const Types = { evm: 'evm', cosmos: 'cosmos' }

export const AccountsConfigSchema = (() => {
  // for ethereum, bsc, fantom, polygon, etc
  const evm = z.object({
    Mnemonic: z.string().nullish().default(DefaultMnemonic),
    Count: z.number().min(1),
    // balance in Ether, NOT Wei, for simplicity
    Balance: bigNumberish.nullish().default(1000),
    type: z.literal(Types.evm).optional().default(Types.evm)
  })

  // for cosmos-sdk chains including Polymerase
  const cosmos = z
    .array(
      z.object({
        Name: z.string().min(1),
        Address: z.string().min(40).optional(),
        Coins: z.array(z.string().min(2)).optional().default([]),
        Mnemonic: z.string().min(1).optional()
      })
    )
    .transform((accountList) => {
      return { List: accountList, type: Types.cosmos }
    })
  const all = z.union([evm, cosmos])
  return Object.freeze({ evm, cosmos, all })
})()

// eslint-disable-next-line no-redeclare
export type CosmosAccountsConfig = z.infer<typeof AccountsConfigSchema.cosmos>
export type EvmAccountsConfig = z.infer<typeof AccountsConfigSchema.evm>
export type AccountsConfig = z.infer<typeof AccountsConfigSchema.all>

export const CosmosAccountSchema = z.object({
  Name: z.string().min(1),
  Address: z.string().min(40),
  Coins: z.array(z.string().min(2)),
  Mnemonic: z.string().nullish()
})

export const EvmAccountSchema = z.object({
  Address: z.string(),
  PrivateKey: z.string().nullish(),
  Balance: bigNumberish.nullish()
})

export const AccountsSchema = (() => {
  const evm = z.array(EvmAccountSchema)
  const cosmos = z.array(CosmosAccountSchema)
  const all = z.union([evm, cosmos])
  return Object.freeze({ evm, cosmos, all })
})()

// eslint-disable-next-line no-redeclare
export type Accounts = z.infer<typeof AccountsSchema.all>
export type EvmAccounts = z.infer<typeof AccountsSchema.evm>
export type EvmAccount = z.infer<typeof EvmAccountSchema>
export type CosmosAccounts = z.infer<typeof AccountsSchema.cosmos>
export type CosmosAccount = z.infer<typeof CosmosAccountSchema>

export function generateEvmAccounts(accountsConfig: AccountsConfig): EvmAccounts {
  const config = accountsConfig as EvmAccountsConfig
  if (config.type !== Types.evm) {
    throw new Error(`wrong account config type '${config.type}'. expect 'evm'`)
  }

  const mnemonic = config.Mnemonic || ethers.Wallet.createRandom().mnemonic.phrase
  if (!ethers.utils.isValidMnemonic(mnemonic)) {
    throw new Error(`invalid mnemonic: '${config.Mnemonic}'`)
  }
  const getPath = (index: number): string => `m/44'/60'/0'/0/${index}`
  const accounts: z.infer<typeof AccountsSchema.evm> = []
  for (let i = 0; i < config.Count; i++) {
    const account = ethers.Wallet.fromMnemonic(mnemonic, getPath(i))
    accounts.push({
      Address: account.address,
      Balance: config.Balance,
      PrivateKey: account.privateKey
    })
  }
  return accounts
}
