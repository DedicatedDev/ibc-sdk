<!--
order: 2
 -->

### Navigate

[Previous](./index.md) / [Go back HOME](../index.md) / [Next](./3-config.md)

# Setup commands

This file contains information on the commands for setup, that will prepare your environment and start it.

## Initialize with `ibctl init`

The `init` command is used to initialize your project. Concretely this means:

- A workspace for your project is created. By default this will be a hidden folder in your home directory: `~/.ibc-sdk`. You can also set a custom workspace by adding the path with the `-w` flag.
- A configuration file `config.yaml` is added to the workspace where you can configure parameters about the chains you wish to run. A separate section is dedicated to the configuration file in [insert link](insert-link.com).
- A folder that includes runtime data called `/run` is added to the workspace and will be updated with useful logs during runtime.
- A folder called `/vibc-smart-contracts` is created that contains the compiled contracts to deploy to the virtual chain upon start. More information about the vIBC smart contracts and why they are needed, can be found [insert link](insert-link.com)

> Note that by default the chain set in the configuration file will set up an ETH2 chain and a Wasmd chain (a minimal Cosmos SDK chain with the `x/wasm` module added), with Polymer in the middle.

After initialization and possibly tweaking the configuration file, you can move on to start the environment.

> Note that from here on out, if you decided to use a custom workspace, you'll need to add the path with the `-w` flag to every command from here on out, which will be omitted for simplicity's sake. Often times the same is true for the log-level with flag `-l`.

## Start with `ibctl start`

Before you start the environment, let's investigate in more detail the `start` command:

```sh
> ibctl start -h

# terminal output
Usage: ibctl start [options]

Start the local stack as defined in <workspace>/config.yaml

Options:
  -c, --connection <path...>  Relayer paths in the form of "src-chain-id:dst-chain-id" (default: Combination of chains of different type)
  --use-zk-mint               Use ZK minting (default: false)
  -h, --help                  Display help command
```

### Specify the connection path(s)

In normal use, on top of just starting the containers you'll likely also want to set up some IBC connections (and instantiate underlying clients) already. Then the only thing that is custom is the channel between the smart contracts you want to deploy.

Consider the default setup Ethereum <> Polymer <> Wasmd. If you want to read up more about the Polymer architecture, please refer to the [Polymer protocol section](../polymer/index.md) of the docs.

When using the IBC SDK, it suffices to add the IBC connections you want to have by specifying the chain names in the `<chain-name-1>:<chain-name2>` format. Under the hood, the IBC SDK is smart enough to figure out what type of relayers to use for each connection.

<!-- > Note that the Ethereum <> Polymer path requires two connections, in each direction to be specified, while the Polymer <> Wasmd path only needs one (that works bidirectionally). This is because under the hood two unidirectional relayers are monitoring the connection between the Polymer hub and a virtual chain. -->

### Enable zkMint

🚧 Currently work in progress... 🚧

### Navigate

[Previous](./index.md) / [Go back HOME](../index.md) / [Next](./3-config.md)
