// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IWorldIDVerifier
 * @notice Interface for World ID v3 on-chain proof verification.
 *
 * Wraps the WorldIDRouter's verifyProof function.
 * See: https://docs.world.org/world-id/reference/contracts
 *
 * @dev The router is deployed on Ethereum Sepolia at:
 *      0x469449f251692E0779667583026b5A1E99B72157
 */
interface IWorldIDVerifier {
    /// @notice Verify a World ID v3 zero-knowledge proof.
    /// @param root The Merkle root of the identity group
    /// @param groupId The World ID group (1 = Orb-verified)
    /// @param signalHash Hash of the signal (e.g. keccak256(abi.encodePacked(bidder)))
    /// @param nullifierHash Unique nullifier for this proof
    /// @param externalNullifierHash Hash of (appId, actionId) to scope nullifiers
    /// @param proof The zero-knowledge proof (8 uint256 values)
    function verifyProof(
        uint256 root,
        uint256 groupId,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) external view;
}
