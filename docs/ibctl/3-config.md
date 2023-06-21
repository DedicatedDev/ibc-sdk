<!--
order: 3
 -->

### Navigate

[Previous](./2-setup.md) / [Go back HOME](../index.md) / [Next](./4-docker.md)

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

## ETH2 example

This is the default configuration for the chain of type 'ethereum2'.

```yaml
- Name: 'eth-consensus'
  Type: 'ethereum2'
  DependsOn: 'eth-execution'
  Images:
    - Label: 'main'
      Repository: 'ghcr.io/polymerdao/prysm-beacon-chain'
      Tag: '00a618-debug'
      Bin: '/app/cmd/beacon-chain/beacon-chain.runfiles/prysm/cmd/beacon-chain/beacon-chain_/beacon-chain'
    - Label: 'genesis'
      Repository: 'ghcr.io/polymerdao/prysm-prysmctl'
      Tag: '00a618-debug'
      Bin: '/app/cmd/prysmctl/prysmctl.runfiles/prysm/cmd/prysmctl/prysmctl_/prysmctl'
    - Label: 'validator'
      Repository: 'ghcr.io/polymerdao/prysm-validator'
      Tag: '00a618-debug'
      Bin: '/app/cmd/validator/validator.runfiles/prysm/cmd/validator/validator_/validator'
```

## Cosmos example

This is the default configuration for the chains of type 'cosmos'.

> Note that this is a CosmWasm enabled chain (i.e. including the `x/wasm` module) but the config is the same as for a regular Cosmos SDK chain.

```yaml
- Name: 'wasm'
  Type: 'cosmos'
  Moniker: 'wasm'
  Prefix: 'wasm'
  Images:
    - Repository: 'ghcr.io/polymerdao/wasm'
      Tag: 'v0.40.0-rc.0-ibcx-noproof'
      Bin: 'wasmd'
  Accounts:
    - Name: bob
      Coins: ['10000token', '100000000stake']
    - Name: relayer
      Mnemonic: 'wait team asthma refuse situate crush kidney nature frown kid alpha boat engage test across cattle practice text olive level tag profit they veteran'
      Coins: ['1234567token', '200000000stake']
    - Name: randomUser
      Coins: ['0token']
    - Name: validatorRunner
      Coins: ['150000000stake']
  Validator:
    Name: validatorRunner
    Staked: '100000000stake'
```

### Navigate

[Previous](./2-setup.md) / [Go back HOME](../index.md) / [Next](./4-docker.md)
