import * as ethers from 'ethers'
import { getLogger } from './utils'

const log = getLogger()

export function newJsonRpcProvider(url: string) {
  try {
    return new ethers.providers.JsonRpcProvider({ url: url, skipFetchSetup: true })
  } catch (e) {
    log.error(`could not get eth provider with url '${url}': ${e}`)
    throw e
  }
}

export function addressify(addr: string): string {
  if (ethers.utils.isAddress(addr)) return ethers.utils.getAddress(addr)
  return addr
}
