// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import './IbcVerifier.sol';
import './IbcReceiver.sol';

contract Verifier is ZKMintVerifier {
    function verify(bytes calldata proof) external override returns (bool) {
        // TODO: replace with real merkle verification logic
        if (proof.length == 0) {
            return false;
        }
        return true;
    }
}
