import { images } from '../lib/docker'

export const configTemplate = `#
# This is the IBC SDK configuration file. Edit it as you please before starting the stack with 'ibctl start'
#

# The ChainSets section defines teh chains to be started by the SDK.
# Each entry defines a different chain

ChainSets:
    # Can be any unique identifier. Internally is also used as the chain id.
  - Name: "eth"

    # These are the chain type supported by the SDK.
    # Can be one of: bsc, ethereum, cosmos or polymer
    Type: "ethereum"

    # List of docker images used when starting up a chain.
    # Each one will become a running docker container.
    Images:

        # The image will be pulled from this repository.
      - Repository: "${images.ethereum.repo}"

        # The tag is used to identify the docker image.
        Tag: "${images.ethereum.tag}"

        # Name or path of the binary inside the docker image that starts up the chain.
        Bin: "geth"

        # This is used to keep track of the images when more than one is used.
        # Can be one of: main, genesis, validator. If not set it defaults to main.
        Label: "${images.ethereum.label}"

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

    # This section is used to generate and fund accounts once the chain is started.
    Accounts:

      # A valid mnemonic to generate accounts deterministically
      Mnemonic: "develop test test test test only develop test test test test only"

      # These many accounts will be generated
      Count: 5

      # The accounts will be funded with these many tokens
      Balance: 1000

  - Name: "polymer"
    Type: "polymer"
    Moniker: "polymer"
    Prefix: "polymer"
    Images:
      - Repository: "${images.polymer.repo}"
        Tag: "${images.polymer.tag}"
        Bin: "polymerd"
    Accounts:
      - Name: alice
        Coins: ["20000token", "200000000stake"]
        Mnemonic: "short eager annual love dress board buffalo enemy material awful quit analyst develop steel pave consider amazing coyote physical crew goat blind improve raven"
      - Name: bob
        Coins: ["10000token", "100000000stake"]
      - Name: relayer
        Mnemonic: "wait team asthma refuse situate crush kidney nature frown kid alpha boat engage test across cattle practice text olive level tag profit they veteran"
        Coins: ["1234567token", "200000000stake"]
      - Name: randomUser
        Coins: ["0token"]
      - Name: validatorRunner
        Coins: ["150000000stake"]
    Validator:
      Name: validatorRunner
      Staked: "100000000stake"

  - Name: "wasm"
    Type: "cosmos"
    Moniker: "wasm"
    Prefix: "wasm"
    Images:
      - Repository: "${images.wasm.repo}"
        Tag: "${images.wasm.tag}"
        Bin: "wasmd"
    Accounts:
      - Name: bob
        Coins: ["10000token", "100000000stake"]
      - Name: relayer
        Mnemonic: "wait team asthma refuse situate crush kidney nature frown kid alpha boat engage test across cattle practice text olive level tag profit they veteran"
        Coins: ["1234567token", "200000000stake"]
      - Name: randomUser
        Coins: ["0token"]
      - Name: validatorRunner
        Coins: ["150000000stake"]
    Validator:
      Name: validatorRunner
      Staked: "100000000stake"
`
