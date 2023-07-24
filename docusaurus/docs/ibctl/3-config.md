---
sidebar_position: 3
sidbar_label: 'Configuration'
---

# Configuration file

<!-- Make a decision post private testnet to provide a link or to inject automatically without having to manually update each time -->

The IBC SDK takes care of a whole list of concerns for you as an xDapp developer that you don’t need to worry about during runtime.

However, you may want to configure your setup to include the parameters of your choosing. The configuration file is the main entry point for those needs. You’ll find it as `config.yaml` in your workspace after you’ve initialized with `ibctl`.

The configuration file has the format as shown below. It includes sections on:

- the set of chains to spin up
- runtime configuration parameters

```yaml
#
# This is the IBC SDK configuration file. Edit it as you please before starting the stack with 'ibctl start'
#

# The ChainSets section defines the chains to be started by the SDK.
# Each entry defines a different chain

ChainSets:
  # Name can be any unique identifier. Is also used internally as the chain name.
  # For Cosmos chains, a default revision number of 0 is added to the chainID.
  - Name: '<chain-name>'

    # These are the chain types supported by the SDK.
    # Can be one of: ethereum, cosmos or polymer
    Type: '<chain-type>'

    # List of docker images used when starting up a chain.
    # Each one will become a running docker container.
    Images:
      # The image will be pulled from this repository.
      - Repository: '<docker-image-repo>'

        # The tag is used to identify the docker image.
        Tag: '<docker-image-tag>'

        # Name or path of the binary inside the docker image that starts up the chain.
        Bin: '<chain-binary>'

        # This is used to keep track of the images when more than one is used.
        # Can be one of: main, genesis, validator. If not set it defaults to main.
        Label: '<main/genesis/validator>'

    # This section is used to generate and fund accounts once the chain is started.
    # For chains of type: Cosmos
    Accounts:
      - # Name to refer to the account
        Name:

        # The account will be funded with these coins listed here by denomination and amount
        Count: ['<amount><denomination>', ...]

        # A valid mnemonic to generate accounts deterministically
        Mnemonic: '<12 or 24 word mnemonic>'
    # Validator accounts are special accounts in Cosmos chains
    Validator:
      # Can be any name to refer to the account
      Name: validatorRunner

      # Needs to be an amount of the staking denomination of the chain
      Staked: '100000000stake'
```

The initial release of the IBC SDK is focused on supporting ETH2 and CosmWasm enabled Cosmos chains, so let's take a closer look at an example of the chain set section of the config for each type of chain.

:::note

For more real-life examples, check out the [examples folder](https://github.com/open-ibc/ibc-sdk/tree/main/examples) of the IBC SDK repo.

:::
