<!--
order: 5
 -->

### Navigate

[Previous](./4-docker.md) / [Go back HOME](../index.md) / [Next](./6-query.md)

# Write to the chain(s)

As you likely know, interacting with a blockhchain boils down to:

- writing state to the blockchain by executing transactions or messages
- reading state from the blockchain by performing queries to a node.

The IBC SDK will orchestrate a lot under the hood to faciliate your development (so that you don't have to submit messages to or query different blockchain nodes, manage relayer and user wallets on those chains) but in essence the same principle holds. There's interactions that will submit transactions to the chain and queries that will read data from it, now just handled from the `ibctl` CLI instead of having to switch binaries and/or have a ton of terminal tabs open.

The transaction commands available are:

- `ibctl deploy` allows you to deploy smart contracts to the chain (provided the chain you're targeting provides smart contract support)
- `ibctl channel` allows you to create channels on specified paths

## Deploying smart contracts

Let's inspect the `deploy` command:

```sh
> ibctl deploy -h

# terminal output
Usage: ibctl deploy [options] <chain> <account> <smart-contract-path> [args...]

Deploys a smart contract on the selected chain. If the SC constructor needs arguments, list them in order

Options:
  -h, --help  Display help command
```

You'll note that in order to deploy your smart contract you'll need to specify:

- the chain to deploy it on (format: 'chain-name[:label]')
- the account that will submit the message to deploy (make sure to use an account that has some funds, you can check this with the [`accounts` command](insert-link.com))
- the path to the file containing the data to deploy
- potential arguments you need to pass

The file you'll be using to deploy your smart contract will depend on the environment you're developing in (e.g. Remix, Truffle, Hardhat for EVM, CosmWasm for Wasm VM). More information on how to prep your specific environment to work with the IBC SDK is provided in [this dedicated section](../dev-environment/EVM-solidity.md).

> Note that for the EVM, deployment equals storing the contract code on chain and instantiating it. For CosmWasm contracts, the 'deployment' is split up into two phases: storing the contract (with the `tx wasm store` command) and instantiating the contract (with the `tx wasm instantiate` command). The IBC SDK combines these two steps in the `deploy` command.

When successfully deploying a contract you'll get an output like this:

```sh
# after deploying a contract
[16:32:29.605 info]: Deployed <contract-name>.wasm on chain wasm-0 at wasm14hj2tavq8fpesdwxxcu44rty3hh90vhujrvcmstl4zr3txmfvw9s0phg4d with tx hash 9243BB68EB59C99B767DC6BC70D18A088B238113DAF2E8450D6BBCE11165E0EA by address wasm158z04naus5r3vcanureh7u0ngs5q4l0gkwegr4
wasm14hj2tavq8fpesdwxxcu44rty3hh90vhujrvcmstl4zr3txmfvw9s0phg4d
```

The contract address is part of the output of the terminal. Further granular information about the wasm contract can be found by using the `ibctl exec wasm-0 q wasm [subcommand]`, in case you need it.

## Creating IBC channels

When contracts on either side are deployed, you can create an IBC channel to connect them before you can send packets between the contracts. For this purpose, there's the `channel` command:

```sh
ibctl channel eth-execution:<contract-address> wasm:<contract-address> --a-channel-version <version> --b-channel-version <version>
```

The versions will have to match if you want to successfully go through the channel handshake.

The terminal output will show you the channel hanshake steps (`ChanOpenInit`,`ChanOpenTry`,`ChanOpenAck` and `ChanOpenConfirm`). If successful, you've created the IBC channel to send packets over.

### Navigate

[Previous](./4-docker.md) / [Go back HOME](../index.md) / [Next](./6-query.md)
