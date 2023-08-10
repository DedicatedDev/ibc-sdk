import { getLogger, waitUntil } from '../utils'
import { CosmosChainClient } from '../cosmos/cli_client'

const log = getLogger()

export const tendermintClientPrefix = '07-tendermint-'

export class PathEnd {
  chainClient: CosmosChainClient
  chainId: string
  clientId: string
  connectionId: string
  alias: string

  constructor(client: CosmosChainClient, chainId: string, clientId: string, connectionId: string, alias: string = '') {
    this.chainClient = client
    this.chainId = chainId
    this.clientId = clientId
    this.connectionId = connectionId
    this.alias = alias
  }

  get name(): string {
    if (this.alias !== '') {
      return this.alias
    }
    return this.chainId
  }

  get config(): any {
    return {
      'chain-id': this.chainId,
      'client-id': this.clientId,
      'connection-id': this.connectionId
    }
  }

  toString(): string {
    return JSON.stringify(this.config)
  }
}

// Path allows to have a relayer-agnostic path view, that then each relayer can map to its own config format
export class Path {
  src: PathEnd
  dst: PathEnd
  // TODO: support more than 1 hop making the hop its own type. For now we have a list here but it's expected to be of
  // static size 2 and hold the path ends to the left and to the right of the hop
  hop: PathEnd[] = []

  constructor(src: PathEnd, dst: PathEnd, hop: PathEnd[] = []) {
    this.src = src
    this.dst = dst
    this.hop = hop
  }

  get name(): string {
    return `${this.src.name}-${this.dst.name}`
  }

  reverse() {
    return new Path(this.dst, this.src, this.hop.reverse())
  }

  toString(): string {
    const output = { src: this.src.toString(), dst: this.dst.toString(), hops: this.hop.map((h) => h.toString()) }
    return JSON.stringify(output)
  }
}

export async function waitForPathConnection(
  srcClient: CosmosChainClient,
  dstClient: CosmosChainClient,
  srcChainName: string,
  dstChainName: string
): Promise<Path> {
  let srcPathEnd: PathEnd | undefined
  let dstPathEnd: PathEnd | undefined

  await waitUntil(
    async () => {
      let response = await srcClient.ibcConnections()
      for (const connection of response.connections) {
        if (connection.clientId.startsWith(tendermintClientPrefix)) {
          srcPathEnd = new PathEnd(srcClient, srcChainName, connection.clientId, connection.id, 'virtual')
        }
      }
      response = await dstClient.ibcConnections()
      for (const connection of response.connections) {
        if (connection.clientId.startsWith(tendermintClientPrefix)) {
          dstPathEnd = new PathEnd(dstClient, dstChainName, connection.clientId, connection.id)
        }
      }
      if (srcPathEnd !== undefined && dstPathEnd !== undefined) {
        log.verbose(
          `found src/dst connections for ${srcPathEnd.clientId} and ${dstPathEnd.clientId} (${srcPathEnd.connectionId} and ${dstPathEnd.connectionId}`
        )
        return true
      }
      return false
    },
    20,
    10_000,
    `could not find new src or dst connections'`
  )
  return new Path(srcPathEnd!, dstPathEnd!)
}

export async function ibcPathFromChainClients(
  srcClient: CosmosChainClient,
  dstClient: CosmosChainClient,
  srcChainName: string,
  dstChainName: string
): Promise<Path> {
  const srcPathEnd = new PathEnd(srcClient, srcChainName, '', '')
  const dstPathEnd = new PathEnd(dstClient, dstChainName, '', '')
  return new Path(srcPathEnd!, dstPathEnd!)
}

export async function vibcPathFromChainClients(
  polymerClient: CosmosChainClient,
  dstClient: CosmosChainClient,
  polymerChainName: string,
  dstChainName: string
): Promise<Path> {
  // Find the clients and connection IDs for the following hops:
  // - virtual (query Polymer for connection to virtual -> polymer)
  // - polymer (query Polymer for both connections: polymer -> virtual and polymer -> dst IBC chain)
  // - dst IBC chain (query dst for connection to dst -> polymer)
  let srcPathEnd: PathEnd | undefined
  // This path ends are the two sides of the polymer hop: the src side faces virtual and the dst side faces the dst IBC
  // chain
  let srcHopPathEnd: PathEnd | undefined
  let dstHopPathEnd: PathEnd | undefined
  let dstPathEnd: PathEnd | undefined
  let response = await polymerClient.ibcConnections()
  // TODO: parametrize light client prefix based on virtual chain type
  const virtualPrefix = 'altair-'
  const polymerPrefix = 'polymer-'
  for (const connection of response.connections) {
    if (connection.clientId.startsWith(polymerPrefix) && connection.counterparty!.clientId.startsWith(virtualPrefix)) {
      log.verbose(`found src connection for ${connection.clientId}`)
      srcPathEnd = new PathEnd(polymerClient, polymerChainName, connection.clientId, connection.id, 'virtual')
    } else if (
      connection.clientId.startsWith(virtualPrefix) &&
      connection.counterparty!.clientId.startsWith(polymerPrefix)
    ) {
      log.verbose(`found src hop connection for ${connection.clientId}`)
      srcHopPathEnd = new PathEnd(polymerClient, polymerChainName, connection.clientId, connection.id)
    } else if (connection.clientId.startsWith(tendermintClientPrefix)) {
      log.verbose(`found dst hop connection for ${connection.clientId}`)
      dstHopPathEnd = new PathEnd(polymerClient, polymerChainName, connection.clientId, connection.id)
    } else {
      log.debug(`skipping connection ${connection.id} (client: ${connection.clientId})`)
    }
  }
  response = await dstClient.ibcConnections()
  for (const connection of response.connections) {
    if (connection.clientId.startsWith(tendermintClientPrefix)) {
      log.verbose(`found dst connection for ${connection.clientId}`)
      dstPathEnd = new PathEnd(dstClient, dstChainName, connection.clientId, connection.id)
    } else {
      log.debug(`skipping connection ${connection.id} (client: ${connection.clientId})`)
    }
  }

  // The bidirectional IBC path ends up being: virtual <-> polymer <-> dst IBC chain
  return new Path(srcPathEnd!, dstPathEnd!, [srcHopPathEnd!, dstHopPathEnd!])
}
