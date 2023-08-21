---
sidebar_position: 2
sidebar_label: 'Race to send packets'
---

# Quickstart tutorial: Race to send packets

The claim made for IBC SDK is that it makes the cross-chain dapp developer's life much easier by automating a lot of the tasks normally executed by the developer just to set up the testing environment.

But we believe in the _show, don't tell_ philosophy, so we don't expect you to just take our word for it. Let's showcase with an example how effortlessly and easy this setup is for the developer from installation to sending IBC packets 📦.

The following assumptions are made before you start:

:::info Prerequisites

- you've gone through the installation process, if not please refer to the [installation instructions](../#installation-and-quick-start)
- you're comfortable with the basic IBC semantics, if not please refer to the [IBC high-level overview page](../concepts/IBC/ibc.md)
- you've got a healthy dose of enthusiasm ready to celebrate when that first packet arrives 🚀

:::

## Preparation steps

You've got the IBC SDK npm package installed. Now let's take care of a few other things before we start the IBC SDK.

### Prepare the contracts

Now, for the quickstart tutorial you can follow along with the simple example contracts we'll provide.

If instead you prefer to immediately follow along with your custom contracts, make sure you've prepped them according to the instructions on how to prepare your contract artifacts in the [dev enironment section](../dev-environment/index.md) of the docs.

If you've got the JSON artifact files ready, you're good to go on.

**Example contracts**:

Clone [this repo](https://github.com/open-ibc/quickstart-ibc-sdk) to obtain:

- A CosmWasm project or a simple IBC messenger app, taken from [the ibc-go wiki](https://github.com/cosmos/ibc-go/wiki/Cosmwasm-and-IBC). You'll find the contract .wasm bytecode in the `/artifacts` folder.
- An folder with EVM artifacts for the `Mars.sol` contract from the [vIBC core smart contract repo](https://github.com/open-ibc/vibc-core-smart-contracts/tree/main).

:::note

Set the path to the root directory of this project as an environment variable `ROOT_DIR` to be able to follow along with the tutorial by copy-pasting the commands.

:::

## Starting the IBC SDK

### Initialization

To start the SDK, you'll first initialize the workspace, like so:

```bash
ibctl init [-w <custom-directory>]
```

This will (by default, unless otherwise specified) initialiaze a workspace in your `$HOME/.ibc-sdk` directory.

Among others, this workspace directory will include the `config.yaml` configuration file. In the quickstart tutorial we won't be editing any of the workspace files, but more information can be found in the [docs on IBC SDK setup](../ibctl/2-setup.md).

#### Error not to overwrite configuration file

If you ran the SDK before, it's possible you encounter this error:

```bash
[08:00:46.950 error]: refusing to override existing configuration file: <workspace-dir>.ibc-sdk/config.yaml
```

:::danger

This is an important safety measure in case you've got a production configuration saved.

:::

In case you haven't got any important configuration for production saved you can clean up the earlier workspace with a `make` command if you are in the source code root directory or simply remove the folder:

```bash
make clean-docker
#or
rm -rf $HOME/.ibc-sdk
```

Now your initialization should deliver the desired result.

:::info Defaults from here onwards

During the remainder of the tutorial it is assumed you've taken the defaults both for your workspace directory and the config file. If not, make sure to update your commands accordingly!

:::

### Start the SDK

Once the workspace is initialized we can start the SDK with the `start` command:

```bash
ibctl start \
  --connection polymer:eth-execution \
  --connection wasm:polymer
```

For the purposes of the quickstart you'll be using the default setup Ethereum <-> Polymer <-> Wasmd. If you want to read up more about the Polymer architecture, please refer to the [Polymer protocol section](../concepts/polymer/index.md) of the docs.

:::tip How to set up connections?

When using the IBC SDK, it suffices to add the IBC connections you want to have by specifying the chain names in the `<chain-name-1>:<chain-name2>` format. Under the hood, the IBC SDK is smart enough to figure out what type of relayers to use for each connection.

:::

### Watch the terminal output

The setup behind the scenes (especially if it's the first time pulling the docker images and building the containers) could take some minutes. Relax, take some time to stand up from your desk and stare into the distance to relax your eyes (think about your health too, not just how awesome the IBC SDK is 💚).

In the meantime, keep an eye on the terminal output and see if you understand the flow. If not, take a look at the [Polymer protocol section](../concepts/polymer/index.md) of the docs.

## Deploying smart contracts

To interact with the contracts, first you'll need to deploy them. The SDK offers that functionality through the [`deploy` command](../ibctl/5-tx.md/#deploying-smart-contracts).

### EVM

You can always check the (funded) accounts that have been created and are at your disposal to interact with the chain:

```bash
# (optional) check the dev accounts created
ibctl accounts eth-execution
```

Copy one of the accounts from the output and use it as the address to deploy the contract, along with the path to the contract artifact JSON file:

For the tutorial, we picked the first account (it's deterministic).

```bash
# deploy the contract with this command
ibctl deploy eth-execution 0x0C46c2cAFE097b4f7e1BB868B89e5697eE65f934 $ROOT_DIR/race-to-send-packets-EVM/artifacts/contracts/Mars.sol/Mars.json

# resuts in this terminal output
[08:41:16.587 info]: Deployed contract Mars on chain eth-execution at 0xB10c73e50B9bdB51f3504F7104a411174B9C3aa3 with tx hash 0x6ad71b0617bb6c03c4404bd2fa117fb1b524b04259853362e66a459a53e9adb9 by address 0x0C46c2cAFE097b4f7e1BB868B89e5697eE65f934
0xB10c73e50B9bdB51f3504F7104a411174B9C3aa3
```

Now, let's do the same thing on the Wasmd chain

### CosmWasm

Also on the wasmd chain, we can query the generated (and funded) accounts:

```bash
# check the dev accounts created
 ibctl accounts wasm
```

Copy one of the accounts from the output and use it as the address to deploy the contract, along with the path to the contract `.wasm` file.

For the tutorial, we've picked the 'relayer' account that is deterministic.

```bash
# deploy the contract with this command
ibctl deploy wasm wasm158z04naus5r3vcanureh7u0ngs5q4l0gkwegr4 $ROOT_DIR/race-to-send-packets-CW/artifacts/race_to_send_packets.wasm

# resuts in this terminal output
[09:01:17.820 info]: Deployed contract ibc_messenger.wasm on chain wasm at wasm14hj2tavq8fpesdwxxcu44rty3hh90vhujrvcmstl4zr3txmfvw9s0phg4d with tx hash <tx-hash> by address <owner-address>
wasm14hj2tavq8fpesdwxxcu44rty3hh90vhujrvcmstl4zr3txmfvw9s0phg4d
```

That's it! The contracts are deployed and we're ready to move on to the next step.

## Create a channel

Now that both contract on either side are deployed, we need to create an IBC channel to connect them before you can send packets between the contracts.

```bash
ibctl channel eth-execution:polyibc.Ethereum-Devnet.B10c73e50B9bdB51f3504F7104a411174B9C3aa3:1.0 wasm:wasm.wasm14hj2tavq8fpesdwxxcu44rty3hh90vhujrvcmstl4zr3txmfvw9s0phg4d:1.0
```

:::tip

Note that here you'll override the channel-version with the specified version. In the CosmWasm IBC template, the contract has an internal expected `IBC_VERSION` parameter, so this will have to match with the argument passed in the `channel` command above. In the `Mars.sol` contract there is a supported version list including "1.0" and "2.0".

:::

The terminal output will show you the channel hanshake steps (`ChanOpenInit`,`ChanOpenTry`,`ChanOpenAck` and `ChanOpenConfirm`). If successful, you've created the IBC channel to send packets over.

The channel creation, in the context of the setup is displayed in the following diagram. Pay attention to the fact that for you as a cross-chain application developer, only the top part (the channel creation between the virtual chain and chain B) is of real concern. The IBC SDK takes care of the rest.

![multi-hop channel creation](../../static/img/poly-arch/26.jpg)

To check, query for channels:

```bash
ibctl channels wasm

# terminal output, if you followed along
channels:
- channel_id: channel-0
  connection_hops:
  - connection-0
  - connection-<n>
  counterparty:
    channel_id: channel-0
    port_id: polyibc.Ethereum-Devnet.B10c73e50B9bdB51f3504F7104a411174B9C3aa3
  ordering: ORDER_UNORDERED
  port_id: wasm.wasm14hj2tavq8fpesdwxxcu44rty3hh90vhujrvcmstl4zr3txmfvw9s0phg4d
  state: STATE_OPEN
  version: 1.0
```

🚧 The feature to query the channels on the virtual Ethereum chain is still in development, for now you can query the channel on Polymer instead...

## Send a packet

Now, in your development flow, this may be the moment when you switch back to your development environment (Hardhat, Truffle, CosmWasm ts-codegen,...) to interact with the contract from your client library.

Here we'll continue to work in the CLI to send a packet though for simplicity.

Let's prepare the JSON file we need to execute a message on Wasmd:

```bash
export EXECUTE_MSG='{"send_message":{"channel":"channel-0","message":"hello IBC"}}'
```

And similarly use the channel query from above to set the port IDs as environment variables: `ETH_PORT` and `WASM_PORT`.

Now use the following command to send the packet from the Wasmd chain (pay attention to have all the args present!):

```bash
ibctl exec wasm wasmd tx wasm execute wasm14hj2tavq8fpesdwxxcu44rty3hh90vhujrvcmstl4zr3txmfvw9s0phg4d $EXECUTE_MSG -- --from wasm158z04naus5r3vcanureh7u0ngs5q4l0gkwegr4 --keyring-backend test --chain-id wasm --gas auto --gas-adjustment 1.2 --yes
```

You should see the transaction confirmed in the terminal output, although this does not show you much about the IBC packet yet.

Instead, run the `ibctl tx` command with the transaction hash from the output:

```bash
ibctl tx wasm <tx-hash>
```

The terminal output here will show you a lot of information about the transaction, and more importantly, it shows the packet data... .

But this only means that the sending chain has including a commitment to send the packet. How do you know if it got received??

## Events and packet tracing

How to check the status of your IBC packet (with the channel and portIDs from above and sequence number 1)?

There's two types of queries that can help out:

- The `ibctl events` command will give an overall view of IBC related events for one particular chain.
- The `trace-packets` command will give an aggregate overview of all packet related (so excluding handshake events) event data for a specific pair of endpoints (chain:channel:port).

Let's try out the packet tracing one:

```bash
ibctl trace-packets $'eth-execution:channel-0:polyibc.Ethereum-Devnet.B10c73e50B9bdB51f3504F7104a411174B9C3aa3' $'wasm:channel-0:wasm.wasm.wasm14hj2tavq8fpesdwxxcu44rty3hh90vhujrvcmstl4zr3txmfvw9s0phg4d'
```

There, you should find confirmation that the packet has been received.

That's it, you've got a packet sent over IBC!

## Conclusion

Hopefully this simple example showcases the benefits of the IBC SDK for cross-chain dapp developers. In a matter of minutes you could run through the setup, mostly work done under the hood by the SDK, and start sending packets to test your applications.
