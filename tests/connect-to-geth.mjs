import { ethers } from 'ethers'

export async function checkBlockNumber(port) {
  let defaultAddrs = [
    '0x0c46c2cafe097b4f7e1bb868b89e5697ee65f934',
    '0x0620d6a5db39497386a37a90bc7a1a116bde314f',
    '0x0bc56841629fa3af87299f42c3a3bd12308d27eb',
    '0x338fe7f3844408fe50ef618d0dbc3c74203326f0',
    '0x50c1389ffdf0fc0c27bac88ecfd7046a5343c79a',
    '0x2245c59287b1f82abfb01470474a0d439d15019e',
    '0xbcd475e9ef70c1177d43fd44400c320fe64811f3',
    '0xfbb04776967e848323f7b77ccfda949266e45063',
    '0x8ed1b904fd5c62043d457805e1fdd4036bfd1cf2',
    '0x9c0eb1a2d2e19587c6644256993fe43ea9a2ea21'
  ]
  defaultAddrs = [
    // coinbase
    '0x239fa7623354ec26520de878b52f13fe84b06971',
    // first default account
    '0x0c46c2cafe097b4f7e1bb868b89e5697ee65f934',
    // another account with different mnemonic
    '0xf74ebf4b174119fb9d3bb48821b0161508cdd40e'
  ]
  const client = new ethers.providers.JsonRpcProvider(
    `http://127.0.0.1:${port}/ext/bc/C/rpc`
  )
  console.log('current block number: ', await client.getBlockNumber())
  for (const adr of defaultAddrs) {
    const balanceWei = await client.getBalance(adr)
    const balanceEther = ethers.utils.formatEther(balanceWei)
    console.log(
      `balance of ${adr}: ${balanceEther} ethers and ${balanceWei} wei`
    )
  }
}

export function mnemonicToSeed(mnemonic) {
  const seed = ethers.utils.mnemonicToSeed(mnemonic)
  console.log(`menomic to seed: \n${mnemonic}\n${seed}`)
}

// provide actual dynamically assigned port number
checkBlockNumber(55183)
// checkBlockNumber(18545)
// checkBlockNumber(8545)
