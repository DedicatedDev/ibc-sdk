# IBC SDK

![Tests](https://github.com/open-ibc/ibc-sdk/actions/workflows/test.yml/badge.svg?branch=main)

The IBC SDK is a powerful NodeJS package designed to streamline cross-chain dapp (xdapp) development using the [Inter-Blockchain Communication (IBC) protocol](https://ibcprotocol.org/).

### Navigate the docs

- [Quickstart tutorials](./docusaurus/docs/quickstart/index.md)
- [Concepts](./docusaurus/docs/concepts/index.md)
- [Supported dev environments](./docusaurus/docs/dev-environment/index.md)
- [ibctl CLI tool](./docusaurus/docs/ibctl/index.md)

To run the docs locally at `localhost:3000`, run:

```bash
cd docusaurus && npm start
```

## What does this package do?

The IBC SDK simplifies the development process for xdapps by automating various tasks and providing essential functionalities in only a few API/CLI calls.

Here's an overview of what the package offers:

### Automation of laborious tasks

- **Chain Setup Management**: Launches multiple chains (dev target chains, e.g. Ethereum, wasmd + the Polymer hub) in separate Docker containers based on a simple configuration.
- **Account Funding**: Automatically funds developer accounts for testing and relaying purposes.
- **Off-chain Relayers**: Starts off-chain relayer processes to facilitate cross-chain communication and have them monitor the right channels.
- **IBC Connectivity**: Establishes IBC clients and connections (configurable) to prepare for cross-chain communication between xdapps.
- **Virtual IBC integration**: Deploys the required [smart contracts on _virtual chains_](./docusaurus/docs/concepts/polymer/vibc.md) to establish quick and easy IBC integration.

### Essential functionality

- **CLI Commands**: easy-to-use [CLI tool `ibctl`](./docusaurus/docs/ibctl/index.md) to cover most use cases, and the ability to exec into the docker containers for more granular control
- **Providing API endpoints**: interact with the IBC SDK from your client environment
- **Status Queries**: Provides convenient queries for monitoring the status of xdapp ports and messages.

> **🔋 The guiding principle through all of this?**
>
> _Batteries included, customization at your service!_ Start with the default configuration, deploy and get to testing. Customize later.

### Who uses this package?

The IBC SDK is designed to cater to two primary user groups:

1. **xDapp Developers**: Developers who utilize the IBC SDK to test their xdapps before releasing them on public testnets or mainnets.
2. **Polymer Developers**: Developers working on the [Polymer Protocol](./docusaurus/docs/concepts/index.md) who rely on the IBC SDK to ensure compliance with specifications.

## Supported chains

| Chain                 | Resources                                                     | Dev environment docs                                        |
| --------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| Ethereum              | [Ethereum Developer Hub](https://ethereum.org/en/developers/) | [Link](./docusaurus/docs/dev-environment/EVM/index.md)      |
| CosmWasm (Cosmos SDK) | [wasmd GitHub](https://github.com/cosmwasm/wasmd)             | [Link](./docusaurus/docs/dev-environment/CosmWasm/index.md) |

> **Note**
> In theory, any Cosmos SDK with CosmWasm enabled can be used. However, an image should be available to list in the configuration file.

Additionally, **if you want to connect to a [virtual chain](./docusaurus/docs/concepts/polymer/vibc.md) through Polymer, the Cosmos chain will have to support multi-hop**.

## Installation and quick start

Prerequisites:

- Have [Node.js](https://nodejs.org/en/download) (including npm) installed
- Have [Docker](https://docs.docker.com/get-docker/) installed

To quickly get started with the IBC SDK, follow these steps:

**Run the `npm install` command in your terminal:**

```bash
npm install -g @open-ibc/ibc-sdk
```

If you prefer to install from source, use the command `make` and execute it from the root of your workspace.

> **Warning**
> Windows is not explicitly supported at the moment, although we will gladly accept feedback from brave explorers!

You're all set to go! But maybe you want an example run to showcase a testing workflow? Then go the [quickstart tutorials page](./docusaurus/docs/quickstart/index.md)...

## Key Benefits

By leveraging the IBC SDK, developers can overcome several pain points associated with xdapp development and IBC integration. Take a seat and relax while IBC SDK does all the hard work in terms of set-up for you! 🏖️

Here are some of the key benefits:

### Simplified Testing Setup

As a xdapp developer, you often face multiple prerequisites when testing xdapps. These include launching supported chains, setting up the hub (e.g. Polymer chain), funding developer accounts, deploying smart contracts, configuring and launching off-chain relayers, and ensuring the correct monitoring of smart contracts and IBC clients.

The IBC SDK **simplifies this cumbersome and error-prone process into a single API call**, allowing you to quickly set up the necessary environment for xdapp testing.

### Streamlined Status Tracking

Tracking the status changes of IBC ports, channels, and xdapp smart contracts typically involves querying multiple processes across different chains and relayers. The **IBC SDK offers a unified query entrypoint that consolidates the status information from all relevant sources.** This saves time and effort by providing a single interface to monitor and analyze the status of your xdapp components.

### Production-Ready Capabilities

The IBC SDK is not only valuable during local development and testing but also offers essential features for (public) testnet and production environments. xdapp developers can continue to utilize the SDK's query API to monitor the status of their smart contracts and IBC packages.

### 🚧 Roadmap 🚧

- **Starship integration**:[Starship](https://github.com/cosmology-tech/starship) is similar interchain development tooling, with an initial focus on Cosmos chains. Work is ongoing to integrate the project with the current IBC SDK support.

- **Starting from snapshots**: support for bootstrapping from chain snapshots, allowing dapp developers to test their application logic locally against existing state and applications that exist on mainnet.

- **IBC Dashboards**: We can leverage the IBC SDK's query API to gather high-level data related to the [Polymer Protocol](./docusuarus/docs/concepts/index.md), IBC, and vIBC that's running under the hood.This aggregated data can be visualized in a dashboard, providing valuable insights into the traffic and performance of your cross-chain communication.

## Want to contribute or need support?

To contribute, report issues, or explore the source code, check out the [contribution guidelines](./CONTRIBUTOR_GUIDLINES.md).

Follow the [OpenIBC forum](https://forum.openibc.com/) to stay up-to-date on all developments regarding IBC, including IBC SDK.
