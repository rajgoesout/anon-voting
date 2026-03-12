// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/IVerifier.sol";

/// @notice MockVerifier always returns true. Used in tests only.
/// Replace with the snarkjs-generated Groth16Verifier for production.
contract MockVerifier is IVerifier {
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[7] calldata
    ) external pure override returns (bool) {
        return true;
    }
}
