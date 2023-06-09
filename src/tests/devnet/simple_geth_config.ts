import { images } from '../../lib/dev/docker'

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
      - Label: "${images.prysm_main.label}"
        Repository: "${images.prysm_main.repo}"
        Tag: "${images.prysm_main.tag}"
        Bin: "beacon-chain"
      - Label: "${images.prysm_genesis.label}"
        Repository: "${images.prysm_genesis.repo}"
        Tag: "${images.prysm_genesis.tag}"
        Bin: "prysmctl"
      - Label: "${images.prysm_validator.label}"
        Repository: "${images.prysm_validator.repo}"
        Tag: "${images.prysm_validator.tag}"
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

Run:
  WorkingDir: "/tmp/test-chainsets/run-*"
  CleanupMode: all
  Logger:
    Level: debug
    Transports:
      - 'log' # will use default level
      - FileName: critical.log
        Level: warn
      - FileName: '-'
        Level: verbose
`
