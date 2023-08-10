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

  // TODO: this is a hack, we should be using grpc instead and return IdentifiedConnection
  // https://github.com/open-ibc/ibc-sdk/issues/162
  async ibcConnections(): Promise<{
    connections: [
      {
        id: string
        clientId: string
        counterparty: {
          clientId: string
          connectionId: string
        }
      }
    ]
    // eslint-disable-next-line camelcase
    pagination: { next_key?: string; total: string }
    // eslint-disable-next-line camelcase
    height: { revision_number: string; revision_height: string }
  }> {
    const out = await this.query(['ibc', 'connection', 'connections'])
    const parsed = JSON.parse(out.stdout.trim())
    for (const connection of parsed.connections) {
      // Use protobuf attribute names so when we fix callers don't need to change
      connection.clientId = connection.client_id
      connection.counterparty.connectionId = connection.counterparty.connection_id
      connection.counterparty.clientId = connection.counterparty.client_id
    }
    return parsed
  }
}
