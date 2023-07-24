---
sidebar_position: 1
sidebar_label: 'Overview'
---

# IBCTL CLI tool

Developers can interact with the IBC SDK either through the API or the CLI tool, `ibctl`. In this section we review how to use the CLI to use the IBC SDK and speed up your development and testing cycles.

## The help command

As with many CLI tools, the help (`-h` or `--help`) commmand will become your new best friend. Let's get to know what's out there to discover.

When you run the help command on `ibctl`, you get an overview of the available commands:

:::note `ibctl` binary

You'll need to have the binary built and available in your `$PATH` for this to work.

:::

```bash
> ibctl -h

# terminal output
Usage: ibctl [options] [command]

IBC SDK control

Options:
  -l, --log-level <level>                                        Log level (choices: "error", "warn", "info", "verbose", "debug", default: "info")
  -w, --workspace <workspace>                                    Working directory (default: /Users/thomasdekeyser/.ibc-sdk)
  -V, --version                                                  output the version number
  -h, --help                                                     Display help command

Commands:
  init [options]                                                 Initializes the workspace
  start [options]                                                Start the local stack as defined in <workspace>/config.yaml
  show                                                           Shows the state of the local stack
  stop [options]                                                 Stop the stack defined in the workspace
  channel <endpoint-a> <endpoint-b>                              Creates an IBC channel between two endpoints. The endpoint format must be
                                                                 `chain_id:port_id:version`
  exec <args...>                                                 Runs a command on the container, selected by its name.The name can be of the format
                                                                 `name:label` like the one in the `show` output. A partial match is enough to select the
                                                                 chain: i.e. use "poly" to match a container called "polymer-0:main". Only one match is
                                                                 allowed per command.
  deploy <chain-name> <account> <smart-contract-path> [args...]  Deploys a smart contract on the selected chain. If the SC constructor needs arguments, list
                                                                 them in order
  archive-logs [options]                                         Fetches logs from all components in the stack and archives them in a tarball
  logs [options] <component-name>                                Fetches the logs from any component of the stack. It mimics the `docker logs` functionality
                                                                 with similar options.
  trace-packets [options] <endpoint-a> <endpoint-b>              Trace packet execution over the specified endpoints. The endpoint format must be
                                                                 `chain_id:channel_id:port_id`
  channels [options] <chain-name>                                Queries the IBC channels on the selected Cosmos chain. The chain name can be in the form of
                                                                 `name:label`.
  connections [options] <chain-name>                             Queries the IBC connections on the selected Cosmos chain. The chain name can be in the form
                                                                 of `name:label`.
  clients [options] <chain-name>                                 Queries the IBC clients on the selected Cosmos chain. The chain name can be in the form of
                                                                 `name:label`.
  tx [options] <chain-name> <tx-hash>                            Queries a transaction on the selected chain. The chain name can be in the form of
                                                                 `name:label`.
  accounts [options] <chain-name>                                Queries the auto-generated accounts on the selected chain. The chain name can be in the
                                                                 form of `name:label`.
  events [options] <chain-name>                                  Queries events from a chain, given the provided height ranges and prints them out in a
                                                                 readable way
  help [command]                                                 display help for command
```

Let's discuss the commands one by one in the following sections or get to work if the commands seem self-explanatory to you.
