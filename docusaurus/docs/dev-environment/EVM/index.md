---
sidebar_position: 1
sidebar_label: 'EVM dev ecosystem'
---

# EVM and Solidity dev environment essentials

Ethereum, launched in 2015 by Vitalik Buterin, has revolutionized the blockchain landscape by introducing a decentralized, programmable platform for building decentralized applications (dApps). Ethereum's development history showcases an evolution of tools and resources that have empowered developers to create smart contracts and dApps on the network.

At the core of Ethereum's smart contract development is [Solidity](https://soliditylang.org/), a high-level programming language specifically designed for Ethereum. Solidity enables developers to write smart contracts that govern the behavior of dApps and execute on the Ethereum Virtual Machine (EVM). It has played a vital role in shaping the Ethereum ecosystem.

**Structure of this section**:

- In this Solidity and EVM development essentials section we'll cover:
  - An overview of most commonly used tooling and resources by EVM developers.
  - How to **prepare your EVM dev environment** to use IBC SDK.
- The next section will cover how to **encorporate IBC** functionality into your smart contracts.
- The last section will cover **how to interact with smart contracts deployed onto the EVM** (even if you don't have access to the source code).

## Ethereum developer tooling

Alongside Solidity, a suite of developer tooling has emerged to facilitate Ethereum development.

### Compilers

[Solc](https://solidity.readthedocs.io/en/latest/using-the-compiler.html) (Solidity Compiler) is the official Solidity compiler that transforms Solidity source code into bytecode that can be executed on the Ethereum Virtual Machine (EVM). It provides various optimizations and versioning support.

### Wallets

[Metamask](https://metamask.io/) is a popular browser extension wallet that enables users to interact with Ethereum dApps directly from their web browsers. It simplifies the process of managing accounts, executing transactions, and interacting with smart contracts.

### Web client libraries

[Web3.js](https://web3js.readthedocs.io/) is a JavaScript library that has been instrumental in bridging the gap between web applications and the Ethereum blockchain. It provides a set of APIs that allow developers to interact with Ethereum nodes, send transactions, and read data from smart contracts.

[Ethers.js](https://docs.ethers.io/v5/) is a powerful JavaScript library that simplifies interactions with Ethereum. It offers a clean and intuitive API for sending transactions, querying smart contracts, and managing Ethereum accounts.

### Development environments & frameworks

[Remix](https://remix.ethereum.org/) is a web-based integrated development environment (IDE) that allows developers to write, test, and debug Solidity smart contracts. It offers a user-friendly interface with built-in compilation and deployment capabilities.

[Truffle](https://www.trufflesuite.com/truffle) is a widely used development framework that offers a suite of tools for building, testing, and deploying Ethereum dApps. It provides a development environment, testing framework, and asset pipeline, streamlining the entire development lifecycle.

[Ganache](https://www.trufflesuite.com/ganache) (formerly known as TestRPC) is a personal Ethereum blockchain for development and testing purposes. It allows developers to simulate an Ethereum network locally, providing a sandbox environment for testing smart contracts and dApps.

[Hardhat](https://hardhat.org/) is a developer-oriented Ethereum tool suite that assists in compiling, deploying, testing, and debugging smart contracts. It provides an extensible plugin system and a local development environment.

[Brownie](https://www.brownie.dev/) is a Python-based development framework for Ethereum smart contracts. It offers an intuitive and efficient workflow for compiling, testing, and deploying contracts, along with a built-in testing and debugging environment.

[Embark](https://embark.dev/) is a framework that simplifies the development and deployment of decentralized applications. It offers a unified development environment with built-in testing, deployment, and integration capabilities.

### Contract libraries

[OpenZeppelin](https://openzeppelin.com/) offers a library of secure and audited smart contracts that developers can use as building blocks. It provides reusable, community-vetted code for implementing common functionality in smart contracts, enhancing security and efficiency.

### Indexing

[The Graph](https://thegraph.com/) is an indexing protocol that enables developers to query and retrieve data from the Ethereum blockchain efficiently. It provides a decentralized infrastructure for building subgraphs, which are data indexing and querying layers for dApps.

### Infrastructure providers

[Infura](https://infura.io/) is a scalable and reliable infrastructure provider that offers Ethereum and IPFS (InterPlanetary File System) APIs. It enables developers to interact with the Ethereum network without running their own Ethereum node, simplifying the development process.

[Alchemy](https://alchemy.com/) is an infrastructure provider for blockchain developers, offering a range of developer-focused tools and services. It provides developers with an API suite that simplifies the integration of Ethereum into applications, offering reliable and scalable infrastructure.

These tools and resources, including the ones mentioned earlier, further expand the Ethereum development ecosystem, providing developers with a diverse range of options to enhance their workflow and streamline the creation of decentralized applications.

## Preparing your contracts to deploy with IBC SDK

The .json file generated when you compile your Solidity contract, which typically **includes the ABI (Application Binary Interface) and bytecode**, is commonly referred to as a **contract artifact file**. While there is no strict standardization enforced by the Solidity compiler or the Ethereum network, there are widely adopted conventions for the structure and content of these artifact files.

### Some examples

One of the most prevalent conventions is the usage of the JSON format for these files, which allows for easy parsing and consumption by programming languages and tools. The specific structure and keys within the JSON file can vary slightly depending on the development tools or frameworks being used.

For example, when using tools like Truffle or Hardhat, the generated artifact file typically follows a specific format known as the Truffle Contract ABI. This format includes the contract's ABI (including function signatures and input/output types) and bytecode, along with other metadata such as the contract's name, compiler version, and optimization settings.

Here's an example of a simplified Truffle Contract ABI format:

```json
{
  "contractName": "MyContract",
  "compiler": {
    "version": "0.8.7+commit.e28d00a7",
    "settings": {
      "optimizer": {
        "enabled": true,
        "runs": 200
      }
    }
  },
  "abi": [
    // Contract's ABI definition
  ],
  "bytecode": "0x..."
}
```

And to compare, this is the default Hardhat format:

```json
{
  "_format": "hh-sol-artifact-1",
  "contractName": "MyContract",
  "sourceName": "contracts/MyContract.sol",
  "abi": [
    // Contract's ABI definition
  ],
  "bytecode": "0x60...",
  "deployedBytecode": "0x60...",
  "linkReferences": {},
  "deployedLinkReferences": {}
}
```

### Deploy Solidity smart contract with IBC SDK

The ABI and the bytecode are thus what the IBC SDK will look for when you pass it the 'smart contract path' in the [`deploy` command](../../ibctl/5-tx.md/#deploying-smart-contracts):

Let's inspect the `deploy` command:

```bash
> ibctl deploy -h

# terminal output
Usage: ibctl deploy [options] <chain> <account> <smart-contract-path> [args...]

Deploys a smart contract on the selected chain. If the SC constructor needs arguments, list them in order
```

It's worth noting that other development tools, libraries, or frameworks might have their own specific conventions or variations in the structure of the artifact file.

However, the general idea is to include the necessary information for interacting with the contract:

- the ABI for encoding and decoding function calls
- the bytecode for deploying the contract on the Ethereum network
