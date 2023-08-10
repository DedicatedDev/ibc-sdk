import path from 'path'
import { images, newContainer, Container } from '../docker'
import { ProcessOutput } from 'zx-cjs'
import { ChainSetsRunObj, CosmosChainSet, isCosmosChain, RelayerRunObj } from '../schemas'
import { getLogger, sleep, ensureDir, waitUntil } from '../utils'
import { Path, tendermintClientPrefix } from '../ibc/path'

const log = getLogger()

function pathConfigs(path: Path): any {
  if (path.hop.length === 0) {
    return [
      {
        name: path.name,
        config: {
          src: {
            'chain-id': path.src.chainId
          },
          dst: {
            'chain-id': path.dst.chainId
          }
        }
      }
    ]
  }
  return [
    {
      name: `${path.src.name}-${path.hop[0].name}`,
      config: {
        src: path.src.config,
        dst: path.hop[0].config
      }
    },
    {
      name: `${path.hop[1].name}-${path.dst.name}`,
      config: {
        src: path.hop[1].config,
        dst: path.dst.config
      }
    },
    {
      name: path.name,
      config: {
        src: path.src.config,
        dst: path.dst.config,
        hops: [
          {
            'chain-id': path.hop[0].chainId,
            'path-ends': [path.hop[0].config, path.hop[1].config]
          }
        ]
      }
    }
  ]
}

export class IbcRelayer {
  container: Container

  private binary: string
  public paths: Path[]
  public pathConfigs: any = []

  private constructor(binary: string, container: Container, paths: Path[]) {
    this.binary = binary
    this.container = container
    this.paths = paths
  }

  static async create(workDir: string, paths: Path[]): Promise<IbcRelayer> {
    const containerDir = ensureDir(path.join(workDir, 'ibc-relayer'))
    const containerConfig = {
      imageRepoTag: images.ibcGoRelayer.full(),
      detach: true,
      tty: true,
      workDir: '/tmp',
      entrypoint: 'sh',
      volumes: [[containerDir, '/tmp']]
    }
    let binary = 'rly'
    if (process.env.IBC_RELAYER_BIN_DIR !== undefined) {
      containerConfig.volumes.push([process.env.IBC_RELAYER_BIN_DIR, '/usr/local/bin'])
      binary = '/usr/local/bin/rly'
    }
    const container = await newContainer(containerConfig)
    log.verbose(`host dir: ${containerDir}`)
    return new IbcRelayer(binary, container, paths)
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
    let connectPaths = false
    if (this.pathConfigs.length === 0) {
      // Assume paths need to be connected only when initializing, they should already be connected after
      connectPaths = true
      await this.exec([this.binary, 'config', 'init'])

      for (let chain of runtime.ChainSets) {
        if (!isCosmosChain(chain.Type)) {
          continue
        }
        chain = chain as CosmosChainSet
        template.value['chain-id'] = chain.Name
        template.value['rpc-addr'] = chain.Nodes[0].RpcContainer
        template.value['account-prefix'] = chain.Prefix
        template.value['gas-prices'] = '0stake' // TODO: get this from config
        const config = JSON.stringify(template)
        log.verbose(`rly: adding chain ${chain.Name} with config: ${config}`)
        await this.exec(['sh', '-c', `${this.binary} chains add --file <( echo '${config}' ) ${chain.Name}`])

        const account = chain.Accounts.find((a) => a.Name === 'relayer')
        if (!account) {
          const errMsg = `could not find relayer account on chain '${chain.Name}'`
          log.error(errMsg)
          throw new Error(errMsg)
        }
        await this.exec([this.binary, 'keys', 'restore', chain.Name, 'default', account.Mnemonic!])
      }
    } else {
      log.debug('cleaning up relay paths to reuse IBC relayer')
      for (const config of this.pathConfigs) {
        log.debug(`deleting path ${config.name}`)
        await this.exec([this.binary, 'paths', 'delete', config.name])
      }
      this.pathConfigs = []
    }

    for (const path of this.paths) {
      const configs = pathConfigs(path)
      for (const pathConfig of configs) {
        log.verbose(`adding path ${pathConfig.name} to ibc-relayer with config: ${JSON.stringify(pathConfig.config)}`)
        await this.exec([
          'sh',
          '-c',
          `${this.binary} paths add ${pathConfig.config.src['chain-id']} ${pathConfig.config.dst['chain-id']} ${
            pathConfig.name
          } --file <( echo '${JSON.stringify(pathConfig.config)}')`
        ]).catch((e) => {
          log.error(e)
          throw new Error(e)
        })
        if (connectPaths) {
          await this.connect(path, pathConfig)
        }
        this.pathConfigs.push(pathConfig)
      }
    }
  }

  async connect(path: Path, pathConfig: any): Promise<any> {
    const existingSrcConnections = new Set<string>()
    const allSrcConnections = (await path.src.chainClient.ibcConnections()).connections
    allSrcConnections.forEach((obj) => {
      if (obj.clientId.startsWith(tendermintClientPrefix)) {
        existingSrcConnections.add(obj.id)
      }
    })
    const existingDstConnections = new Set<string>()
    const allDstConnections = (await path.dst.chainClient.ibcConnections()).connections
    allDstConnections.forEach((obj) => {
      if (obj.clientId.startsWith(tendermintClientPrefix)) {
        existingDstConnections.add(obj.id)
      }
    })
    log.verbose(`creating client for ${pathConfig.name}`)
    await this.exec([this.binary, 'transact', 'clients', pathConfig.name]).catch((e) => {
      log.error(e)
      throw new Error(e)
    })
    // TODO: this is hacky, we should instead query for the clients and wait for them to show up
    await sleep(10_000)

    log.verbose(`creating connection for ${pathConfig.name}`)
    await this.exec([this.binary, 'transact', 'connection', pathConfig.name]).catch((e) => {
      log.error(e)
      throw new Error(e)
    })
    let newSrcConnectionId: string | undefined
    let newSrcClientId: string | undefined
    let newDstConnectionId: string | undefined
    let newDstClientId: string | undefined
    await waitUntil(
      async () => {
        const srcConnections = (await path.src.chainClient.ibcConnections()).connections
        for (const connection of srcConnections) {
          if (!existingSrcConnections.has(connection.id) && connection.clientId.startsWith(tendermintClientPrefix)) {
            log.verbose(
              `found new src connection ${connection.id} (client: ${connection.clientId}) for ${pathConfig.name}`
            )
            newSrcConnectionId = connection.id
            newSrcClientId = connection.clientId
            break
          }
        }
        if (newSrcConnectionId === undefined) {
          return false
        }
        const dstConnections = (await path.dst.chainClient.ibcConnections()).connections
        for (const connection of dstConnections) {
          if (!existingDstConnections.has(connection.id) && connection.clientId.startsWith(tendermintClientPrefix)) {
            log.verbose(
              `found new dst connection ${connection.id} (client: ${connection.clientId}) for ${pathConfig.name}`
            )
            newDstConnectionId = connection.id
            newDstClientId = connection.clientId
          }
        }
        if (newDstConnectionId === undefined) {
          return false
        }
        return true
      },
      20,
      10_000,
      `could not find new src or dst connections'`
    )
    pathConfig.config.src['connection-id'] = newSrcConnectionId
    pathConfig.config.src['client-id'] = newSrcClientId
    pathConfig.config.dst['connection-id'] = newDstConnectionId
    pathConfig.config.dst['client-id'] = newDstClientId
    return pathConfig
  }

  async start(): Promise<ProcessOutput> {
    // This is a hack to query the chan open init that already happened internally in polymer
    // TODO: use the chan_open_init height detected by the vibc code to calculate the offset from them latest height
    const blockHistory = 100
    const start = this.exec(
      ['sh', '-c', `${this.binary} start -d -b ${blockHistory} 1>/proc/1/fd/1 2>/proc/1/fd/2`],
      true,
      true
    )
    log.info('ibc-relayer started')
    return start
  }

  async getConfig(): Promise<ProcessOutput> {
    return await this.exec([this.binary, 'config', 'show', '--json'])
  }

  async runtime(): Promise<RelayerRunObj> {
    const config = await this.getConfig()
    log.verbose(config.stdout)
    return {
      Name: 'ibc-relayer',
      ContainerId: this.container.containerId
      // TODO: get rid of this output so we can parse the config
      // WARNING: proto: file name query.proto does not start with expected testdata/; please make sure your folder structure matches the proto files fully-qualified names
      // WARNING: proto: file name testdata.proto does not start with expected testdata/; please make sure your folder structure matches the proto files fully-qualified names
      // WARNING: proto: file name tx.proto does not start with expected testdata/; please make sure your folder structure matches the proto files fully-qualified names
      // WARNING: proto: file name unknonwnproto.proto does not start with expected testdata/; please make sure your folder structure matches the proto files fully-qualified names
      // Configuration: JSON.parse(config.stdout)
    }
  }
}
