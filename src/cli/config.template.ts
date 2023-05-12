export const configTemplate = `#
# This is the IBC SDK configuration file. Edit it as you please before starting the stack with 'ibctl start'
#

# The ChainSets section defines teh chains to be started by the SDK.
# Each entry defines a different chain

ChainSets:
    # Can be any unique identifier. Internally is also used as the chain id.
  - Name: "eth-exec-0"

    # These are the chain type supported by the SDK.
    # Can be one of: bsc, ethereum, ethereum2, cosmos or polymer
    Type: "ethereum"

    # List of docker images used when starting up a chain.
    # Each one will become a running docker container.
    Images:

        # The image will be pulled from this repository.
      - Repository: "ethereum/client-go"

        # The tag is used to identify the docker image.
        Tag: "v1.10.26"

        # Name or path of the binary inside the docker image that starts up the chain.
        Bin: "geth"

        # This is used to keep track of the images when more than one is used.
        # Can be one of: main, genesis, validator. If not set it defaults to main.
        Label: "main"

    # This section is used to generate and fund accounts once the chain is started.
    Accounts:

      # A valid mnemonic to generate accounts deterministically
      Mnemonic: "develop test test test test only develop test test test test only"

      # These many accounts will be generated
      Count: 1

      # The accounts will be funded with these many tokens
      Balance: 1000

  - Name: "eth-consensus-0"
    Type: "ethereum2"
    DependsOn: "eth-exec-0"
    Images:
      - Label: "main"
        Repository: "ghcr.io/polymerdao/prysm-beacon-chain"
        Tag: "1eaa9a-debug"
        Bin: "/app/cmd/beacon-chain/beacon-chain.runfiles/prysm/cmd/beacon-chain/beacon-chain_/beacon-chain"
      - Label: "genesis"
        Repository: "ghcr.io/polymerdao/prysmctl"
        Tag: "1eaa9a-debug"
        Bin: "/app/cmd/prysmctl/prysmctl.runfiles/prysm/cmd/prysmctl/prysmctl_/prysmctl"
      - Label: "validator"
        Repository: "ghcr.io/polymerdao/prysm-validator"
        Tag: "1eaa9a-debug"
        Bin: "/app/cmd/validator/validator.runfiles/prysm/cmd/validator/validator_/validator"

  - Name: "polymer-0"
    Type: "polymer"
    Moniker: "polymerase"
    Prefix: "polymerase"
    Images:
      - Repository: "ghcr.io/polymerdao/polymerase"
        Tag: "d709b00"
        Bin: "polymerased"
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

  - Name: "wasm-0"
    Type: "cosmos"
    Moniker: "wasm"
    Prefix: "wasm"
    Images:
      - Repository: "ghcr.io/polymerdao/wasm"
        Tag: "v0.40.0-rc.0-ibcx-noproof-1"
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

    # Section to configure how the logger behaves.
    Logger:

      # The log level. Can be one of: debug, info, warn or error. It defaults to info
      Level: info

      # Whether the ouput is colorized or not.
      Colorize: true

      # Where the logs are going to.
      Transports:
        - 'log' # will use default level
        - FileName: critical.log
          Level: warn
          # add console logger for debugging
        - FileName: '-'
          Level: info
`
