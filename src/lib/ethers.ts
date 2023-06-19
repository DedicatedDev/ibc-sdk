import * as ethers from 'ethers'

export function newJsonRpcProvider(url: string) {
  return new ethers.providers.JsonRpcProvider({ url: url, skipFetchSetup: true })
}
