import { z } from 'zod'
import { utils } from './deps'
import { Container, containerFromId, newContainer, images } from './docker'
import { ChainSetsRunObj, RelayerRunObj } from './schemas'
import path from 'path'
import { $, ProcessOutput } from 'zx-cjs'
import { fs } from '../utils'
import { Writable } from 'stream'
import { getLogger } from '../utils/logger'

const log = getLogger()

export const EthRelayerConfigSchema = z.object({
  consensusHostUrl: z.string().min(1),
  executionHostUrl: z.string().min(1),
  ibcCoreAddress: z.string().min(1),
  ibcCoreAbi: z.string().min(1),
  routerHostUrl: z.string().min(1),
  rpcAddressUrl: z.string().min(1),
  accountName: z.string().min(1),
  polymerHomeDir: z.string().min(1),
  localDevNet: z.boolean(),
  // TODO this feels hacky
  ethcontainer: z.string()
})

export type EthRelayerConfig = z.infer<typeof EthRelayerConfigSchema>

export class EthRelayer {
  container: Container
  config: EthRelayerConfig
  containerDir: string
  private readonly cmdPrefix = '/relayer/eth-relayer'

  private constructor(container: Container, config: EthRelayerConfig, containerDir: string) {
    this.container = container
    this.containerDir = containerDir
    this.config = config
  }

  static async create(runObj: ChainSetsRunObj, paths: string[]): Promise<EthRelayer> {
    const [src, dst] = paths

    const eth1 = runObj.ChainSets.find((c) => c.Name === src)
    if (!eth1 || eth1.Type !== 'ethereum') throw new Error('Expected to find an ethereum chain as source!')

    const poly = runObj.ChainSets.find((c) => c.Name === dst)
    if (!poly || poly.Type !== 'polymer') throw new Error('Expected to find a polymer chain as destination!')

    const eth2 = runObj.ChainSets.find((c) => c.Type === 'ethereum2')
    if (!eth2) throw new Error('Expected to find an ethereum2 chain!')

    const dispatcher = eth1.Contracts.find((c) => c.Name === 'Dispatcher')
    if (!dispatcher) throw new Error(`Dispatcher contract not deployed on ${eth1.Name}?`)

    const config = {
      consensusHostUrl: eth2.Nodes[0].RpcContainer.replace(/:[0-9]+$/, ':3500'),
      executionHostUrl: eth1.Nodes[0].RpcContainer,
      ibcCoreAddress: dispatcher.Address,
      ibcCoreAbi: dispatcher.Abi ?? '',
      rpcAddressUrl: poly.Nodes[0].RpcContainer,
      routerHostUrl: poly.Nodes[0].RpcContainer.replace(/:[0-9]+$/, ':9090'),
      accountName: 'alice',
      polymerHomeDir: path.join(runObj.Run.WorkingDir, poly.Name),
      localDevNet: true,
      ethcontainer: eth1.Nodes[0].ContainerId
    }

    const containerDir = utils.ensureDir(utils.path.join(runObj.Run.WorkingDir, 'eth-relayer'))
    const container = await newContainer({
      entrypoint: 'sh',
      imageRepoTag: images.ethRelayer.full(),
      detach: true,
      tty: true,
      workDir: '/tmp',
      volumes: [[containerDir, '/tmp']]
    })

    // make the vIBC SC ABI available to the relayer
    fs.writeFileSync(path.join(containerDir, 'abi.json'), config.ibcCoreAbi, { encoding: 'utf-8' })

    // TODO: remove this once the relayer won't need to access the accounts in polymer home dir
    await $`docker cp ${poly.Nodes[0].ContainerId}:/home/heighliner/.polymer /tmp`
    await $`docker cp /tmp/.polymer ${container.containerId}:/tmp/polymer-home`
    await $`rm -rf /tmp/.polymer`

    // TODO: this is horribly hacky. The altair lc running on polymer expects to find a random config file
    //       with the smart contract abi and the dispatcher address. So, we are adding that file here.
    //       So this adding a file within the polymer container for the lc (running in there) to work.
    //       Let's get rid of this ASAP
    {
      const polyDir = path.join(runObj.Run.WorkingDir, poly.Name)
      fs.writeFileSync(path.join(polyDir, 'abi.json'), config.ibcCoreAbi, { encoding: 'utf-8' })
      const lcConfig: any = {
        sc_address: config.ibcCoreAddress,
        abi_path: '/tmp/abi.json'
      }
      fs.writeFileSync(path.join(polyDir, 'altair.json'), JSON.stringify(lcConfig), { encoding: 'utf-8' })
    }

    log.verbose(`host dir: ${containerDir}`)
    return new EthRelayer(container, config, containerDir)
  }

  async waitForPoS() {
    let found = false
    const eth = await containerFromId(this.config.ethcontainer)

    const stream = new Writable({
      write: (chunk: any, _enc: BufferEncoding, cb: (err?: Error) => void) => {
        found ||= chunk.toString('utf-8').includes('Entered PoS stage')
        process.nextTick(cb)
      }
    })

    // first, check for the message in all logs so far
    await eth.logs({ stderr: stream, stdout: stream })

    // check the rest of the logs in increments of 15s to avoid missing data in between
    for (let i = 0; i < 60 && !found; i++) {
      await eth.logs({ stderr: stream, stdout: stream, since: '15s' })
      if (!found) await utils.sleep(10_000)
    }

    if (!found) throw new Error('Ethereum did not enter PoS stage after 10 minutes')
  }

  async run(): Promise<ProcessOutput> {
    // We can only start the relayer once the eth chain has reached the merge point.
    // This here waits for that to happen by looking into the logs. It's not great but it's all we
    // have for now. It times out after 10 minutes
    await this.waitForPoS()

    const rawCmds = [
      this.cmdPrefix,
      '--consensus-host',
      this.config.consensusHostUrl,
      '--execution-host',
      this.config.executionHostUrl,
      '--ibc-core-address',
      this.config.ibcCoreAddress,
      '--ibc-core-abi',
      path.join('/tmp', 'abi.json'),
      '--router-host',
      this.config.routerHostUrl,
      '--polymer-rpc-addr',
      this.config.rpcAddressUrl,
      '--polymer-account',
      this.config.accountName,
      '--polymer-home',
      '/tmp/polymer-home'
    ]
    if (this.config.localDevNet) rawCmds.push('--local-dev-net')

    {
      // Even after eth has entered the PoS stage, the relayer can't create the LC just yet.
      // So, the following command retries every 10 seconds
      const cmds = [...rawCmds, '--create-client-mode'].map($.quote).join(' ')
      log.info(`Creating Altair Light Client with commands: ${cmds}`)
      await this.container.exec([
        'sh',
        '-c',
        `for i in $(seq 10); do ${cmds} 1>/proc/1/fd/1 2>/proc/1/fd/2 && break || sleep 10; done`
      ])
    }

    {
      const cmds = rawCmds.map($.quote).join(' ')
      log.info(`starting relayer with commands: ${cmds}`)
      return await this.container.exec(['sh', '-c', `${cmds} 1>/proc/1/fd/1 2>/proc/1/fd/2`], true, true)
    }
  }

  public runtime(): RelayerRunObj {
    return {
      Name: 'eth-relayer',
      ContainerId: this.container.containerId,
      Configuration: this.config
    }
  }
}
