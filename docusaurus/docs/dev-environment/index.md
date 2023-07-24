---
sidebar_position: 1
sidebar_label: 'Overview'
---

# Prepare your application development environment to use IBC SDK

The IBC SDK simplifies the development process for xdapps by automating various tasks and providing essential functionalities

**What the IBC SDK does not cover**

The IBC SDK is not a smart contract development platform, i.e. we assume you have smart contracts available (either written yourself or discovered on an explorer) to deploy on the (local) testnet.

<!-- :::info IBC SDK as library

Despite not being a smart contract development platform, the IBC SDK _can_ act as a library that you can easily integrate with your smart contract development environment of choice.

::: -->

**Supported chains/virtual machines:**

- Cosmos chains with CosmWasm support: [get started here](./CosmWasm/index.md)
- Ethereum with EVM support: [get started here](./EVM/index.md)

Each supported environment has documenation following **this template**:

- `<environment>` essentials file with some high-level overview and resources to learn more
- how to set up IBC enabled contracts and methods
- how to interact with `<environment>` contracts as consumer, rather than creator of contracts. e.g. ABI in EVM and schema in CW
