// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import './IbcReceiver.sol';

// UpdateClientMsg is used to update an existing Polymer client on an EVM chain
// TODO: replace bytes with explictly typed fields for gas cost saving
struct UpdateClientMsg {
    bytes consensusState;
    uint64 height;
    bytes zkProof;
}

interface ZKMintVerifier {
    function verifyUpdateClientMsg(
        bytes calldata lastConsensusState,
        UpdateClientMsg calldata newConsensusState
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
