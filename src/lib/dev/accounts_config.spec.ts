import test from 'ava'
import { generateEvmAccounts, AccountsConfigSchema } from './accounts_config.js'
import { ethers } from './deps.js'

const defaultAddrs = [
  '0x0c46c2cafe097b4f7e1bb868b89e5697ee65f934',
  '0x0620d6a5db39497386a37a90bc7a1a116bde314f',
  '0x0bc56841629fa3af87299f42c3a3bd12308d27eb',
  '0x338fe7f3844408fe50ef618d0dbc3c74203326f0',
  '0x50c1389ffdf0fc0c27bac88ecfd7046a5343c79a',
  '0x2245c59287b1f82abfb01470474a0d439d15019e',
  '0xbcd475e9ef70c1177d43fd44400c320fe64811f3',
  '0xfbb04776967e848323f7b77ccfda949266e45063',
  '0x8ed1b904fd5c62043d457805e1fdd4036bfd1cf2',
  '0x9c0eb1a2d2e19587c6644256993fe43ea9a2ea21'
]

const defaultConfig = {
  Mnemonic: 'develop test test test test only develop test test test test only',
  Count: 5
}

test('generate accounts from default config', (t) => {
  const accounts = generateEvmAccounts(
    AccountsConfigSchema.evm.parse(defaultConfig)
  )
  const expectedAddresses = defaultAddrs.slice(0, defaultConfig.Count)

  t.deepEqual(accounts.length, defaultConfig.Count)
  const hexlify = ethers.utils.hexlify
  t.deepEqual(
    accounts.map((act) => hexlify(act.Address)),
    expectedAddresses.map((addr) => hexlify(addr))
  )
})

test('config schema conformance', (t) => {
  const testConfigInput = (config) => {
    const parsed = AccountsConfigSchema.evm.parse(config)
    return generateEvmAccounts(parsed)
  }
  t.throws(() => {
    testConfigInput({ Count: 0 })
  })
  t.throws(() => {
    testConfigInput({ Mnemonic: 'invalid mnemonic words list', Count: 10 })
  })
  t.notThrows(() => {
    testConfigInput({ Count: 1 })
  })
})
