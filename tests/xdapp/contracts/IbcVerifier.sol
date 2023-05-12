// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import './IbcReceiver.sol';


interface ZKMintVerifier {
    function verify(bytes calldata consensusState) external returns (bool);
}
