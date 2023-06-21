import { newContainer, Container } from './docker'
import * as utils from './utils'
import { $, zx } from './deps'
import { EndPoint } from './chains/running_chain'
import { ChainSetsRunObj, ProverRunObj } from './schemas'
import * as self from './index'
import { getLogger } from './utils/logger'

const log = getLogger()

export async function runProver(runtime: ChainSetsRunObj) {
  log.info(`Starting a zkmint prover... It might take a while`)

  const prover = await ZkMintProver.create()
  await prover.isReady()

  runtime.Prover = await prover.runtime()
  self.saveChainSetsRuntime(runtime)
}

export class ZkMintProver {
  container: Container
  static readonly rpcEndpoint = new EndPoint('http', '0.0.0.0', '8080')
  private rpcPort?: string

  private constructor(container: Container) {
    this.container = container
  }

  static async create(): Promise<ZkMintProver> {
    const container = await newContainer({
      imageRepoTag: 'ghcr.io/polymerdao/zkmint-prover:full',
      exposedPorts: [ZkMintProver.rpcEndpoint.port],
      detach: true,
      tty: true
    })
    return new ZkMintProver(container)
  }

  async getRPCPort(): Promise<string> {
    if (this.rpcPort) {
      return this.rpcPort
    }
    const portMap = await this.container.getPortMap()

    const containerPort = `${ZkMintProver.rpcEndpoint.port}/tcp`
    const rpcHostPort = portMap.get(containerPort)
    if (!rpcHostPort) {
      throw new Error(`Cannot find host port for port '${containerPort}' in container ${this.container.containerId}`)
    }

    this.rpcPort = rpcHostPort
    return rpcHostPort
  }

  async isReady(): Promise<boolean> {
    const rpcPort = await this.getRPCPort()
    await utils.waitUntil(
      async () => {
        const out = await zx.nothrow($`curl -sf http://localhost:${rpcPort}`)
        // 22 means the prover is accepting requests but the parameters are not correct
        return out.exitCode === 22
      },
      15,
      60000,
      'Zkmint Prover is not ready'
    )
    return true
  }

  async runtime(): Promise<ProverRunObj> {
    const containerIp = await this.container.getIPAddress()
    return {
      Name: 'zkmint-prover',
      ContainerId: this.container.containerId,
      RpcHost: ZkMintProver.rpcEndpoint.withHost('localhost').withPort(await this.getRPCPort()).address,
      RpcContainer: ZkMintProver.rpcEndpoint.withHost(containerIp).address
    }
  }
}
