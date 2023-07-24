---
sidebar_position: 4
sidebar_label: 'Docker orchestration'
---

# Docker container commands

The IBC SDK takes care of the Docker container orchestration under the hood for you. Yet, there are a few commands which enable some interaction with the containers.

To show all the containers that are running:

```bash
> ibctl show

# Example output when running with default parameters
 ─────────┬────────────────────────────────┬────────────────┬──────────────────────────┬───────────┐
│ (index) │              Name              │  Container ID  │         Endpoint         │  Status   │
├─────────┼────────────────────────────────┼────────────────┼──────────────────────────┼───────────┤
│    0    │       'eth-exec:main'          │ '923ec84898ab' │ 'http://localhost:33029' │ 'running' │
│    1    │     'eth-consensus:main'       │ '5fc40c18c62d' │ 'http://localhost:33030' │ 'running' │
│    2    │   'eth-consensus:genesis'      │ '9cdeec9fd8ca' │ 'http://localhost:33032' │ 'running' │
│    3    │  'eth-consensus:validator'     │ 'e4e7f63b5f3a' │ 'http://localhost:33034' │ 'running' │
│    4    │        'polymer:main'          │ '9b27937fd7d2' │ 'tcp://localhost:33024'  │ 'running' │
│    5    │         'wasm:main'            │ '2a0256f6a383' │ 'tcp://localhost:33020'  │ 'running' │
│    6    │         'vibc-relayer'         │ 'dc5a07fa3133' │          'N/A'           │ 'running' │
│    7    │ 'ibc-relayer-wasm-polymer'     │ '225a0cffc6da' │          'N/A'           │ 'running' │
│    8    │         'eth-relayer'          │ '067fef03f176' │          'N/A'           │ 'running' │
└─────────┴────────────────────────────────┴────────────────┴──────────────────────────┴───────────┘
```

The table shows an overview of all running containers, including the name, container ID and endpoints. This includes the chains and the relayers.

:::tip

Note that for the ETH2 chain, we have multiple clients running in their separate container, as ETH2 separates execution and conensus layers. To interact with EVM, you'll mostly be concerned with the execution layer 'eth-exec'.

:::

:::info

Additionally, the ETH2 <-> Polymer connection requires two relayer implementations for each direction, the vIBC relayer Polymer -> ETH2, the ETH relayer for the opposite direction.

:::

When you're done using IBC SDK, there's a simple stop command that stops the running containers.

```bash
> ibctl stop

# Example output related to above container setup.
[12:31:45.510 info]: Removing 'vibc-relayer' container...
[12:31:45.818 info]: Removing 'ibc-relayer-wasm-polymer' container...
[12:31:46.037 info]: Removing 'eth-relayer' container...
[12:31:46.269 info]: Removing 'eth-exec:main' container...
[12:31:46.522 info]: Removing 'eth-consensus:main' container...
[12:31:47.424 info]: Removing 'eth-consensus:genesis' container...
[12:31:47.609 info]: Removing 'eth-consensus:validator' container...
[12:31:47.914 info]: Removing 'polymer:main' container...
[12:31:48.215 info]: Removing 'wasm:main' container...
```

Finally if you want to interact with any of the running containers by 'docker exec-ing' into them, you can either use directly the `docker exec` command and grab the container id from the table after running `ibctl show`. On the other hand, we also provide a dedicated command that allows you
to refer to the container by name:

```bash
> ibctl exec [name] [command]

# name format: "name:label"

# command likely: chain binary, e.g. `polymerd` or relayer binary, e.g. `rly``
```

<!-- TODO: update relayer binary to TS relayer?? -->

:::tip `ibctl exec` for power users

For most everyday usage of the IBC SDK you will likely not need to exec into the containers as the `ibctl` tool provides commands that cover 95% of the use cases needed, especially when used in combination with a client library for contract interaction. However, power users may want to exercise more granular control and access to the chain or relayer binaries.

:::
