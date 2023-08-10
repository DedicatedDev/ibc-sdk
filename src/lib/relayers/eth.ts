import * as self from '../index'
import { z } from 'zod'
import { utils } from '../deps'
import { Container, containerFromId, newContainer, images } from '../docker'
import { ChainSetsRunObj, CosmosChainSet, RelayerRunObj } from '../schemas'
import path from 'path'
import { $, ProcessOutput } from 'zx-cjs'
import { flatCosmosEvent, fs, waitForBlocks, getLogger } from '../utils'
import { Writable } from 'stream'
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing'
import { Tendermint37Client } from '@cosmjs/tendermint-rpc'
import { SigningStargateClient } from '@cosmjs/stargate'

const log = getLogger()

export const EthRelayerConfigSchema = z.object({
  consensusHostUrl: z.string().min(1),
  executionHostUrl: z.string().min(1),
  ibcCoreAddress: z.string().min(1),
  ibcCoreAbi: z.string().min(1),
  routerHostUrl: z.string().min(1),
  rpcAddressUrl: z.string().min(1),
  polymerMnemonic: z.string().min(1),
  localDevNet: z.boolean(),
  // TODO this feels hacky
  ethcontainer: z.string()
})

export const EthRelayerRuntimeSchema = z.object({
  config: EthRelayerConfigSchema,
  nativeClientId: z.string().nullish(),
  virtualClientId: z.string().nullish(),
  virtualConnectionId: z.string().nullish(),
  virtualCounterpartyConnectionId: z.string().nullish()
})

export type EthRelayerConfig = z.infer<typeof EthRelayerConfigSchema>
export type EthRelayerRuntime = z.infer<typeof EthRelayerRuntimeSchema>

export class EthRelayer {
  container: Container
  run: EthRelayerRuntime
  containerDir: string
  private readonly cmdPrefix = '/relayer/eth-relayer'

  private constructor(container: Container, run: EthRelayerRuntime, containerDir: string) {
    this.container = container
    this.containerDir = containerDir
    this.run = run
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
      polymerMnemonic: poly.Accounts[0].Mnemonic ?? '',
      localDevNet: true,
      ethcontainer: eth1.Nodes[0].ContainerId
    }

    const containerDir = utils.ensureDir(utils.path.join(runObj.WorkDir, 'eth-relayer'))
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

    // TODO: this is horribly hacky. The altair lc running on polymer expects to find a random config file
    //       with the smart contract abi and the dispatcher address. So, we are adding that file here.
    //       So this adding a file within the polymer container for the lc (running in there) to work.
    //       Let's get rid of this ASAP
    {
      const polyDir = path.join(runObj.WorkDir, poly.Name)
      fs.writeFileSync(path.join(polyDir, 'abi.json'), config.ibcCoreAbi, { encoding: 'utf-8' })
      const lcConfig: any = {
        sc_address: config.ibcCoreAddress,
        abi_path: '/tmp/abi.json'
      }
      fs.writeFileSync(path.join(polyDir, 'altair.json'), JSON.stringify(lcConfig), { encoding: 'utf-8' })
    }

    log.verbose(`host dir: ${containerDir}`)
    const runtime: EthRelayerRuntime = {
      config: config
    }
    return new EthRelayer(container, runtime, containerDir)
  }

  async waitForPoS() {
    let found = false
    const eth = await containerFromId(this.run.config.ethcontainer)

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

  async start(): Promise<ProcessOutput> {
    // We can only start the relayer once the eth chain has reached the merge point.
    // This here waits for that to happen by looking into the logs. It's not great but it's all we
    // have for now. It times out after 10 minutes
    await this.waitForPoS()

    const rawCmds = [
      this.cmdPrefix,
      '--consensus-host',
      this.run.config.consensusHostUrl,
      '--execution-host',
      this.run.config.executionHostUrl,
      '--ibc-core-address',
      this.run.config.ibcCoreAddress,
      '--ibc-core-abi',
      path.join('/tmp', 'abi.json'),
      '--router-host',
      this.run.config.routerHostUrl,
      '--polymer-rpc-addr',
      this.run.config.rpcAddressUrl,
      '--polymer-account-mnemonic',
      this.run.config.polymerMnemonic
    ]
    if (this.run.config.localDevNet) rawCmds.push('--local-dev-net')

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

  private async createVirtualLightClient(address: string, signer: SigningStargateClient, client: Tendermint37Client) {
    log.info(`Creating virtual light client for native client ${this.run.nativeClientId}`)
    const createClientMsg: self.cosmos.client.polyibc.MsgCreateVibcClientEncodeObject = {
      typeUrl: '/polyibc.core.MsgCreateVibcClient',
      value: {
        creator: address,
        nativeClientID: this.run.nativeClientId!,
        params: Buffer.from(JSON.stringify({ finalized_only: false, delay_period: 2 }))
      }
    }
    await waitForBlocks(client, 2)
    const res = await signer.signAndBroadcast(address, [createClientMsg], 'auto')
    const virtualLightClient = self.cosmos.client.polyibc.MsgCreateVibcClientResponseSchema.parse(
      flatCosmosEvent('create_vibc_client', res)
    )
    this.run.virtualClientId = virtualLightClient.client_id
  }

  private async createVirtualConnection(address: string, signer: SigningStargateClient, client: Tendermint37Client) {
    log.info('Creating virtual connection...')
    const createConnectionMsg: self.cosmos.client.polyibc.MsgCreateVibcConnectionEncodeObject = {
      typeUrl: '/polyibc.core.MsgCreateVibcConnection',
      value: {
        creator: address,
        vibcClientID: this.run.virtualClientId!,
        delayPeriod: '0'
      }
    }
    await waitForBlocks(client, 2)
    const res = await signer.signAndBroadcast(address, [createConnectionMsg], 'auto')
    const vConnection = self.cosmos.client.polyibc.MsgCreateVibcConnectionResponseSchema.parse(
      flatCosmosEvent('create_vibc_connection', res)
    )
    this.run.virtualConnectionId = vConnection.connection_id
    this.run.virtualCounterpartyConnectionId = vConnection.counterparty_connection_id
  }

  async connect(runtime: ChainSetsRunObj) {
    const poly = runtime.ChainSets.find((c) => c.Type === 'polymer') as CosmosChainSet
    if (!poly) throw new Error('could not find polymer chain')
    const account = poly.Accounts.find((a) => a.Name === 'relayer')
    if (!account) throw new Error(`Could not find relayer account in polymer chain`)

    const client = await self.cosmos.client.newTendermintClient(poly.Nodes[0].RpcHost)
    const queryClient = self.cosmos.client.QueryClient.withExtensions(client, self.cosmos.client.setupPolyIbcExtension)

    const offlineSigner = await DirectSecp256k1HdWallet.fromMnemonic(account.Mnemonic!, { prefix: poly.Prefix })
    const signer = await self.cosmos.client.SigningStargateClient.createWithSigner(
      client,
      offlineSigner,
      self.cosmos.client.signerOpts()
    )

    const clients = await queryClient.polyibc.ClientStates(
      self.cosmos.client.polyibc.query.QueryClientStatesRequest.fromPartial({})
    )

    if (!clients.clientStates) throw new Error('No client states found')
    for (const state of clients.clientStates) {
      if (state.clientState?.typeUrl === '/polyibc.lightclients.altair.ClientState') {
        this.run.nativeClientId = state.clientId
        break
      }
    }
    if (!this.run.nativeClientId) throw new Error(`could not find altair light client`)

    for (let i = 0; i < 3; i++) {
      try {
        await this.createVirtualLightClient(account.Address, signer, client)
        break
      } catch (e) {
        log.warn(`could not create virtual light client: ${e}, retrying...`)
      }
    }

    for (let i = 0; i < 3; i++) {
      try {
        await this.createVirtualConnection(account.Address, signer, client)
        break
      } catch (e) {
        log.warn(`could not create virtual connection: ${e}, retrying...`)
      }
    }
  }

  public runtime(): RelayerRunObj {
    return {
      Name: 'eth-relayer',
      ContainerId: this.container.containerId,
      Configuration: this.run
    }
  }
}
