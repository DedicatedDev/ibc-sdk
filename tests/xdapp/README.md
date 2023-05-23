# xDapp Project

This project includes

- Polymer Core Smart Contracts (CoreSC)
- a few demo contracts that simulate dev users protocol contracts, eg. Earth, Mars, etc.

## Quick Start

```shell
# set up ibc-sdk project
pushd ../../
npm install

# set up xDapp project
popd
npm install

# Run CoreSC tests
npx hardhat test
```

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
GAS_REPORT=true npx hardhat test
npx hardhat node
npx hardhat run scripts/deploy.ts
```
