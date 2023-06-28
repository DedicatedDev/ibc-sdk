import * as ethers from 'ethers'

export function newJsonRpcProvider(url: string) {
  return new ethers.providers.JsonRpcProvider({ url: url, skipFetchSetup: true })
}

export function addressify(addr: string): string {
  if (ethers.utils.isAddress(addr)) return ethers.utils.getAddress(addr)
  return addr
}
