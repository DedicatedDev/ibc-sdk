import { Container, CosmosChainSet } from './deps'

export class CosmosChainClient {
  static fromRunningContainer(chain: CosmosChainSet): CosmosChainClient {
    return new CosmosChainClient(chain)
  }

  chain: CosmosChainSet
  chainBinary: string
  container: Container

  constructor(chain: CosmosChainSet) {
    this.chain = chain
    this.chainBinary = chain.Images[0].Bin!
    this.container = new Container(chain.Nodes[0].ContainerId)
  }

  async query(args: string[]) {
    return await this.container.exec([this.chainBinary, 'query', ...args, '-o', 'json'])
  }

  async balance(address: string): Promise<{ denom: string; amount: string }[]> {
    const out = await this.query(['bank', 'balances', address])
    const parsed = JSON.parse(out.stdout.trim())
    return parsed.balances
  }

  async ibcConnections(): Promise<{
    connections: string[]
    pagination: { next_key?: string; total: string }
    height: { revision_number: string; revision_height: string }
  }> {
    const out = await this.query(['ibc', 'connection', 'connections'])
    const parsed = JSON.parse(out.stdout.trim())
    return parsed
  }
}
