import { images } from '../lib/dev/docker'

export const configTemplate = `#
# This is the IBC SDK configuration file. Edit it as you please before starting the stack with 'ibctl start'
#

# The ChainSets section defines teh chains to be started by the SDK.
# Each entry defines a different chain

ChainSets:
    # Can be any unique identifier. Internally is also used as the chain id.
  - Name: "eth-execution"

    # These are the chain type supported by the SDK.
    # Can be one of: bsc, ethereum, ethereum2, cosmos or polymer
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

    # This section is used to generate and fund accounts once the chain is started.
    Accounts:

      # A valid mnemonic to generate accounts deterministically
      Mnemonic: "develop test test test test only develop test test test test only"

      # These many accounts will be generated
      Count: 5

      # The accounts will be funded with these many tokens
      Balance: 1000

  - Name: "eth-consensus"
    Type: "ethereum2"
    DependsOn: "eth-execution"
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


# This section contains configuration relevant to the runtime.

Run:
    # This is the workspace directory where the runtime data will be stored. It's also the 'dirname' of this configuration file.
    # A '*' within the path will be expanded to a random timestamped suffix in the form of '<timestamp>-<random suffix>'.
    # This is useful for repeated runs, for example when executed from automated tests.
    # Example: '/tmp/run-*' will be expanded to something like '/tmp/run-20230304090145-7018ba624d/'
    WorkingDir: <working-dir>

    # Determines what happens to the runtime files when the workspace is stopped.
    # Can be one of: all, debug or log. It defaults to all
    CleanupMode: debug
`
