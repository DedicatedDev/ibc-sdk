import anyTest, { TestFn } from 'ava'
import { utils } from '../../lib'
import { fs, path } from '../../lib/utils'
import * as self from '../../lib/index'
import os from 'os'

const test = anyTest as TestFn<{
  contractsDir: string
}>

test.before(async (t) => {
  t.context.contractsDir = path.resolve(__dirname, '..', '..', '..', 'tests', 'xdapp', 'artifacts', 'contracts')
})

test('create contracts config from directory', async (t) => {
  const config = utils.readYamlText(self.dev.createContractsConfig(t.context.contractsDir))
  const expected = {
    ContractArtifacts: [
      {
        VmType: 'evm',
        Contracts: [
          {
            Name: 'Dispatcher.json',
            Source: 'Dispatcher.sol',
            Path: 'Dispatcher.sol/Dispatcher.json'
          },
          {
            Name: 'Earth.json',
            Source: 'Earth.sol',
            Path: 'Earth.sol/Earth.json'
          },
          {
            Name: 'IbcDispatcher.json',
            Source: 'IbcDispatcher.sol',
            Path: 'IbcDispatcher.sol/IbcDispatcher.json'
          },
          {
            Name: 'IbcReceiver.json',
            Source: 'IbcReceiver.sol',
            Path: 'IbcReceiver.sol/IbcReceiver.json'
          },
          {
            Name: 'Mars.json',
            Source: 'Mars.sol',
            Path: 'Mars.sol/Mars.json'
          }
        ],
        ArtifactsDir: t.context.contractsDir
      }
    ],
    ChainClientImage: {
      Repository: 'ghcr.io/polymerdao/chain_client',
      Tag: '8bd1785'
    }
  }
  t.deepEqual(expected, config)
})

test.only('check corner cases', async (t) => {
  const contractsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foo'))

  // test empty contracts dir
  const err = t.throws(() => self.dev.createContractsConfig(contractsDir))
  t.is(err?.message, `Could not find any Smart Contract API definition in ${contractsDir}`)

  // test contracts dir with not .json api definition
  const dir = path.join(contractsDir, 'foo')
  fs.mkdirSync(dir)
  const err1 = t.throws(() => self.dev.createContractsConfig(contractsDir))
  t.is(err1?.message, `Could not find any Smart Contract API definition in ${dir}`)

  // test contracts dir with too many .json api definitions
  fs.writeFileSync(path.join(dir, 'foo1.json'), '')
  fs.writeFileSync(path.join(dir, 'foo2.json'), '')
  const err2 = t.throws(() => self.dev.createContractsConfig(contractsDir))
  t.is(err2?.message, `Expecting a single Smart Contract API definition in ${dir}. Found: foo1.json,foo2.json`)
})
