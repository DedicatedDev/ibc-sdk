import path from 'path'
import { images, newContainer, Container } from '../docker'
import { ProcessOutput } from 'zx-cjs'
import { ChainSetsRunObj, CosmosChainSet, isCosmosChain, RelayerRunObj } from '../schemas'
import { getLogger, sleep, ensureDir } from '../utils'

const log = getLogger()

export class IBCRelayer {
  container: Container

  private readonly binary = 'rly'
  private paths: string[][]

  private constructor(container: Container, paths: string[][]) {
    this.container = container
    this.paths = paths
  }

  static async create(workDir: string, paths: string[][]): Promise<IBCRelayer> {
    const containerDir = ensureDir(path.join(workDir, 'ibc-relayer'))
    const container = await newContainer({
      imageRepoTag: images.ibcGoRelayer.full(),
      detach: true,
      tty: true,
      workDir: '/tmp',
      entrypoint: 'sh',
      volumes: [[containerDir, '/tmp']]
    })
    log.verbose(`host dir: ${containerDir}`)
    return new IBCRelayer(container, paths)
  }

  async exec(commands: string[], tty = false, detach = false): Promise<ProcessOutput> {
    return await this.container.exec(commands, tty, detach).then(
      (resolve) => resolve,
      (reject) => reject
    )
  }

  async init(runtime: ChainSetsRunObj) {
    const template = {
      type: 'cosmos',
      value: {
        key: 'default',
        'chain-id': '',
        'rpc-addr': '',
        'account-prefix': '',
        'keyring-backend': 'test',
        'gas-adjustment': 1.2,
        'gas-prices': '',
        debug: true,
        timeout: '20s',
        'output-format': 'json',
        'sign-mode': 'direct'
      }
    }
    await this.exec([this.binary, 'config', 'init'])

    for (let chain of runtime.ChainSets) {
      if (!isCosmosChain(chain.Type)) return
      chain = chain as CosmosChainSet
      template.value['chain-id'] = chain.Name
      template.value['rpc-addr'] = chain.Nodes[0].RpcContainer
      template.value['account-prefix'] = chain.Prefix
      template.value['gas-prices'] = '0stake' // TODO: get this from config
      const config = JSON.stringify(template)
      await this.exec(['sh', '-c', `${this.binary} chains add --file <( echo '${config}' ) ${chain.Name}`])

      const account = chain.Accounts.find((a) => a.Name === 'relayer')
      if (!account) {
        log.error(`could not find relayer account on chain '${chain.Name}'`)
        continue
      }

      await this.exec([this.binary, 'keys', 'restore', chain.Name, 'default', account.Mnemonic!])
    }

    for (const path of this.paths) {
      const [src, dst] = path
      const x = JSON.stringify({
        src: {
          'chain-id': src
        },
        dst: {
          'chain-id': dst
        },
        'src-channel-filter': {
          rule: null,
          'channel-list': []
        }
      })

      const name = `${src}-${dst}`
      log.verbose(`adding path ${name} to ibc-relayer`)
      await this.exec(['sh', '-c', `${this.binary} paths add  ${src} ${dst} ${name} --file <( echo '${x}')`]).catch(
        (e) => {
          log.error(e)
          throw new Error(e)
        }
      )
    }
    await this.connect()
  }

  async connect() {
    for (const path of this.paths) {
      await this.exec([this.binary, 'transact', 'clients', path.join('-')]).catch((e) => {
        log.error(e)
        throw new Error(e)
      })
    }
    // TODO: this is hacky
    await sleep(10_000)

    for (const path of this.paths) {
      await this.exec([this.binary, 'transact', 'connection', path.join('-')]).catch((e) => {
        log.error(e)
        throw new Error(e)
      })
    }
  }

  async start(): Promise<ProcessOutput> {
    const start = this.exec(['sh', '-c', `${this.binary} start 1>/proc/1/fd/1 2>/proc/1/fd/2`], true, true)
    log.info('ibc-relayer started')
    return start
  }

  async getConfig(): Promise<ProcessOutput> {
    return await this.exec([this.binary, 'config', 'show', '--json'])
  }

  async runtime(): Promise<RelayerRunObj> {
    const config = await this.getConfig()
    return {
      Name: 'ibc-relayer',
      ContainerId: this.container.containerId,
      Configuration: JSON.parse(config.stdout)
    }
  }
}
