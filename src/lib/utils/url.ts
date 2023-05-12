const RE_PORT = /^:?(?<port>\d+)$/
const RE_FULL = /^((?<protocol>\w+):\/\/)?(?<host>\S+):(?<port>\d+)$/

export class UrlResolver {
  /** Create a new UrlResolver from an address string.
  Valid format include:
    - a single port. Eg. `8080`
    - a port with a leading colon. Eg. `:8080`
    - address with host and port. Eg. `127.0.0.1:8080` or `localhost:8080`
    - full address. E.g. `http://localhost:8080`
   */
  static fromAddress(addr: string): UrlResolver {
    const mPort = addr.match(RE_PORT)
    if (mPort) {
      return new UrlResolver(mPort.groups!.port)
    }
    const match = addr.match(RE_FULL)
    if (match) {
      const groups = match.groups!
      return new UrlResolver(groups.port, groups.host, groups.protocol)
    }
    throw new Error(`invalid host-port address: ${addr}`)
  }

  static format(
    port: number | string,
    host: string,
    protocol?: string
  ): string {
    return protocol ? `${protocol}://${host}:${port}` : `${host}:${port}`
  }

  protocol?: string
  host?: string
  port: string

  constructor(port: string, host?: string, protocol?: string) {
    this.port = port
    this.protocol = protocol
    this.host = host
  }

  /** Get a full address includeing protocol, host and port.
  @param defaultProtocol letters only. : and // are added automatically
  @param defaultHost ip address or host name
   */
  full(defaultProtocol: string, defaultHost: string): string {
    const protocol = this.protocol ? this.protocol : defaultProtocol
    const host = this.host ? this.host : defaultHost
    return UrlResolver.format(this.port, host, protocol)
  }

  /** Get a address with host and port only.
  @param defaultHost ip address or host name
   */
  hostPort(defaultHost: string = '127.0.0.1'): string {
    const host = this.host ? this.host : defaultHost
    return UrlResolver.format(this.port, host)
  }
}
