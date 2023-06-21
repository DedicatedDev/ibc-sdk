import { images } from '../../lib/docker'

export const gethConfig = `
ChainSets:
  - Name: "eth"
    Type: "ethereum"
    Images:
      - Repository: "${images.ethereum.repo}"
        Tag: "${images.ethereum.tag}"
        Bin: "geth"
    Accounts:
      Mnemonic: "develop test test test test only develop test test test test only"
      Count: 10
  - Name: "eth2"
    Type: "ethereum2"
    DependsOn: "eth"
    Images:
      - Label: "${images.prysmMain.label}"
        Repository: "${images.prysmMain.repo}"
        Tag: "${images.prysmMain.tag}"
        Bin: "beacon-chain"
      - Label: "${images.prysmGenesis.label}"
        Repository: "${images.prysmGenesis.repo}"
        Tag: "${images.prysmGenesis.tag}"
        Bin: "prysmctl"
      - Label: "${images.prysmValidator.label}"
        Repository: "${images.prysmValidator.repo}"
        Tag: "${images.prysmValidator.tag}"
        Bin: "validator"
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
