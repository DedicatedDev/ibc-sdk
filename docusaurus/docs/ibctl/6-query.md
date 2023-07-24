---
sidebar_position: 6
sidebar_label: 'Read actions'
---

# Reading from the chain(s)

From last section we know that interacting with a blockhchain boils down to:

- writing state to the blockchain by executing transactions or messages
- reading state from the blockchain by performing queries to a node.

:::tip

Remember, the IBC SDK will orchestrate a lot under the hood to faciliate your development (so that you don't have to submit messages to or query different blockchain nodes, manage relayer and user wallets on those chains) but in essence the same principle holds. There's interactions that will submit transactions to the chain and queries that will read data from it, now just handled from the `ibctl` CLI instead of having to switch binaries and/or have a ton of terminal tabs open.

:::

The query commands available are:

<!-- provide terminal output after refactor -->

- `ibctl accounts <chain-name>` gives an overview of all the accounts that have been set up by the SDK on the various chains
- `ibctl <clients/connections/channels>` allows you to query IBC clients, connections and channels on specified chains
- `ibctl tx` provides for some metadata about a specific transaction

## Get accounts information

Remember: one of the great features of the IBC SDK is the fact that you don't need to take care of making sure the relayer has access to (private keys are added) funded accounts on each chain to submit the messages related to IBC. Additionally there's the traditional Alice and Bob accounts often used in the default chain configurations.

The help command shows the usage:

```bash
> ibctl accounts -h

# terminal output
Usage: ibctl accounts [options] <name>

Queries the auto-generated accounts on the selected chain. The chain name can be in the form of `name:label`.

Options:
  --json      Output in JSON format
  -h, --help  Display help command
```

This results in the following output when you query for accounts info:

```bash
> ibctl accounts polymer

# example output when using default setup and querying polymer chain
- Name: alice
  Address: polymer1amttsqfx2kt8qg0k6zfd4s2w7nx9aurjc2a8vz
  Coins:
    - 20000token
    - 200000000stake
    - <potentially more denoms>
  Mnemonic: >-
    illness romance hope home humor certain smart aspect evolve intact resemble
    fringe lonely clog stick juice shadow wood woman essence mirror glow pepper
    yard
- <more accounts>
  ...
```

The mnemonic being can be useful if you want to restore the account on a different chain, or during a different runtime.

:::info IBC denoms

As you'll be interacting with IBC interactions between chains, it is possible that when querying the accounts you will end up with a strange looking coin denom. They look something like `ibc/47cf1118cdf445a726991975135da2bade9acee64647d63c11bd06d490b10768` where the suffix represents a SHA256 hash.

This represents an IBC denom, which is how assets that have been transferred by IBC, are represented. You'll find all about it [here](https://tutorials.cosmos.network/tutorials/6-ibc-dev/).

:::

## Query IBC clients, connections and channels

Querying is pretty straightforward. Get some familiarity with the properties of channels, connections and clients, as they follow the specifications outlined in [the IBC section of the docs](../concepts/IBC/ibc.md).

To check, query for clients/connections/channels:

```bash
ibctl clients <chain-name>
ibctl connections <chain-name>
ibctl channels <chain-name>
```

:::note 🚧

The feature to query the channels on the virtual Ethereum chain is still in development, for now you can query the channel on Polymer instead...

:::
