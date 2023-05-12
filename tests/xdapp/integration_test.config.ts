// npx hardhat run --config integration_test.config.ts --network eth scripts/deploy.ts

import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import * as fs from 'fs'

const config: HardhatUserConfig = {
  solidity: '0.8.9',
  networks: JSON.parse(
    fs.readFileSync('integration_tests/temp.hardhat.config.json', {
      encoding: 'utf-8'
    })
  )
}

export default config
