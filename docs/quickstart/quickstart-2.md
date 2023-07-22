# Quickstart tutorial 2: Vote cross-chain on asset to borrow

[EVM project](https://github.com/tmsdkeys/hardhat-ibc-sdk-tutorial/tree/main) (make sure to run `npm install` first)
[CosmWasm project](https://github.com/tmsdkeys/ibc-sdk-cw-tutorial/tree/main)

Ensure you've got the `ibctl` binary installed (see README).

Start the CLI tool:

```bash
ibctl start -c wasm:polymer -c polymer:eth-execution
```

when everything is set up, check the running containers:

```bash
ibctl show
```

Find the endpoint where 'eth-execution' is exposed and add it to the hardhat config file:

```js
require('@nomicfoundation/hardhat-toolbox');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: '0.8.19',
  networks: {
    localibcsdk: {
      url: 'http://localhost:<fill-in-port>',
      accounts: [
        '0x826cccccf88094269e637c816d8895f138b89e03dfa2fdd8b5d9e1feea1cb9aa',
        '0x15188f87d4fd462b13c8f3b81c3a818ceb68fb596da273d6b7ee9f05f588e207',
        '0x75558cf96f6f28bb489fd33cbfc38aa2311bcb6586a9742f9586da809dd57fe2',
        '0xea6ad02a06e84b195f65a7e01ab32440a8914e523d53be71aba370167ce94ae9',
        '0xbaeb0652f541c24abdf69216fec5136bda1a013dea71ab24bb3b477143efa9ef',
      ],
    },
  },
};
```

The accounts (unless you want to add more) can be left as is.

Now, you can deploy the contracts on the EVM:

```bash
npx hardhat run scripts/deploy.js --network localibcsdk
```

and on the Cosmos side:

```bash
ibctl deploy wasm wasm158z04naus5r3vcanureh7u0ngs5q4l0gkwegr4 /Users/thomasdekeyser/cw-projects/ibc-poll-messenger/artifacts/ibc_poll_messenger.wasm
```

Create a channel between the IBC enabled contracts on the EVM and Wasm side:

```bash
ibctl channel $'eth-execution:polyibc.Ethereum-Devnet.B10c73e50B9bdB51f3504F7104a411174B9C3aa3:1.0' $'wasm:wasm.wasm14hj2tavq8fpesdwxxcu44rty3hh90vhujrvcmstl4zr3txmfvw9s0phg4d:1.0'
```

## Contract interaction

On the EVM side, we need to prepare the following:

- For the three possible assets we can vote to borrow, we first need to supply funds to the `IbcLendingBorrowing` contract
- Then we need to supply some collateral, to borrow the winner of the vote on Wasm chain

This is captured in the following script:

```bash
npx hardhat run scripts/interact.js --network localibcsdk
```

To let the Wasm chain know that we've provided collateral, we can use the IBC `sendMessage` functionality.

It's included in the `scripts/send-message.js` script:

```bash
npx hardhat run scripts/send-message.js --network localibcsdk
```

It will send the message "Collateral has been supplied".

On the Wasm side, we need to do the following:

- The admin (who deployed the contract) can create a poll (with the 3 options corresponding to the 3 tokens to borrow).
- Every user can vote on one of the options
- Only the admin can end the poll
- Once the poll is ended, we can send the result over IBC to trigger the borrowing on Ethereum

This functionality is included in the `polling.sh` script.

```bash
sh ./polling.sh
```

This should send a packet with the information of the poll to execute the loan on the EVM side.

We can check the events and trace packets to see if we succeeded.

## Packet tracing and Events

A first quick check to see if the packet has been successfully relayed and the loan executed, run:

```bash
npx hardhat run scripts/check-balances.js --network localibcsdk
```

To look at the events:

```bash
ibctl events polymer <-x>
ibctl events wasm <-x>
ibctl events eth-execution <-x>
```

alternatively you can trace the packets:

```bash
ibctl trace-packets $'eth-execution:channel-0:polyibc.Ethereum-Devnet.B10c73e50B9bdB51f3504F7104a411174B9C3aa3' $'wasm:channel-0:wasm.wasm.wasm14hj2tavq8fpesdwxxcu44rty3hh90vhujrvcmstl4zr3txmfvw9s0phg4d'
```
