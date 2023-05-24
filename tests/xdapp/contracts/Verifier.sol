// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import './IbcVerifier.sol';
import './IbcReceiver.sol';

contract Verifier is ZKMintVerifier {
    function verifyConsensusState(
        bytes calldata lastConsensusState,
        bytes calldata newConsensusState
    ) external pure override returns (bool) {
        // TODO: replace with real Polymer header/consensus verification logic
        // For now, a dummy verification is implemented that requries newer states is not smaller than the last state
        require(newConsensusState.length > 0, 'Invalid Polymer consensus state');
        return newConsensusState.length >= lastConsensusState.length;
    }

    function verifyMembership(
        bytes calldata consensusState,
        Proof calldata proof,
        bytes calldata key,
        bytes calldata expectedValue
    ) external pure override returns (bool) {
        require(consensusState.length > 0, 'Invalid Polymer consensus state');
        require(key.length > 0, 'Key cannot be empty');
        require(expectedValue.length > 0, 'Expected value cannot be empty');

        // TODO: replace with real merkle verification logic
        // For now, a dummy proof verification is implemented
        return proof.proof.length > 0;
    }

    function verifyNonMembership(
        bytes calldata consensusState,
        Proof calldata proof,
        bytes calldata key
    ) external pure override returns (bool) {
        require(consensusState.length > 0, 'Invalid Polymer consensus state');
        require(key.length > 0, 'Key cannot be empty');

        // TODO: replace with real merkle verification logic
        // For now, a dummy proof verification is implemented
        return proof.proof.length > 0;
    }
}
