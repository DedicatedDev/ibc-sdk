// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import './IbcReceiver.sol';

interface ZKMintVerifier {
    function verifyConsensusState(
        bytes calldata lastConsensusState,
        bytes calldata newConsensusState
    ) external pure returns (bool);

    function verifyMembership(
        bytes calldata consensusState,
        Proof calldata proof,
        bytes calldata key,
        bytes calldata expectedValue
    ) external pure returns (bool);

    function verifyNonMembership(
        bytes calldata consensusState,
        Proof calldata proof,
        bytes calldata key
    ) external pure returns (bool);
}
