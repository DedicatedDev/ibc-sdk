import { images } from '../../lib/docker'

export const gethConfig = `
ChainSets:
  - Name: "eth"
    Type: "ethereum"
    Images:
      - Repository: "${images.ethereum.repo}"
        Tag: "${images.ethereum.tag}"
        Bin: "geth"
      - Label: "${images.prysm.label}"
        Repository: "${images.prysm.repo}"
        Tag: "${images.prysm.tag}"
        Bin: "beacon-chain"
      - Label: "${images.prysmGenesis.label}"
        Repository: "${images.prysmGenesis.repo}"
        Tag: "${images.prysmGenesis.tag}"
        Bin: "prysmctl"
      - Label: "${images.prysmValidator.label}"
        Repository: "${images.prysmValidator.repo}"
        Tag: "${images.prysmValidator.tag}"
        Bin: "validator"
    Accounts:
      Mnemonic: "develop test test test test only develop test test test test only"
      Count: 10
  - Name: "bsc"
    Type: "bsc"
    Images:
      - Repository: "${images.bsc.repo}"
        Tag: "${images.bsc.tag}"
        Bin: "geth"
    Accounts:
      Mnemonic: "develop test test test test only develop test test test test only"
      Count: 1
`
