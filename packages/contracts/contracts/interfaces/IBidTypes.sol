// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IBidTypes
 * @notice Shared types for the HushBid Protocol private price discovery system
 */
interface IBidTypes {
    /// @notice Asset types supported
    enum AssetType {
        ERC20          // Fungible token (private delivery via Convergence)
    }

    /// @notice Privacy levels for auction reveal policies
    /// This controls what information is revealed and when, balancing transparency with bidder privacy. The CRE uses this to determine how to handle bid data and what to reveal in the final auction result.
    enum PrivacyLevel {
        FULL_PRIVATE,    // Nothing revealed ever — DON settles via Confidential Compute
        AUDITABLE        // Hidden from public, readable by designated auditor + CRE
    }

    /// @notice Auction phases
    enum AuctionPhase {
        CREATED,         // Auction created, not started
        BIDDING,         // Accepting bid commitments
        REVEAL,          // Reveal phase (for commit-reveal)
        SETTLING,        // CRE determining winner
        SETTLED,         // Winner determined, pending claim
        COMPLETED,       // Asset transferred
        CANCELLED        // Auction cancelled
    }

    /// @notice Auction configuration
    struct AuctionConfig {
        address seller;
        address assetContract;
        uint256 tokenAmount;
        uint256 reservePrice;
        uint64 biddingEnd;
        uint64 revealEnd;
        AssetType assetType;
        PrivacyLevel privacyLevel;
        bool worldIdRequired;
        bytes32 allowedTokensHash; // Hash of accepted payment tokens
        address auditor;           // Authorized auditor address (AUDITABLE mode only)
        address sellerShieldedAddress; // Convergence shielded address for private payment receipt
    }

    /// @notice Input params for createAuction
    struct CreateAuctionParams {
        address assetContract;
        uint256 tokenAmount;
        AssetType assetType;
        uint256 reservePrice;
        uint64 biddingDuration;
        uint64 revealDuration;
        PrivacyLevel privacyLevel;
        bool worldIdRequired;
        bytes32 allowedTokensHash;
        address auditor;
        address sellerShieldedAddress; // Convergence shielded address for receiving payment
    }

    /// @notice Bid commitment (encrypted bid)
    struct BidCommitment {
        bytes32 commitHash;      // keccak256(bidder, amount, salt)
        string ipfsCid;          // CID of encrypted bid metadata on IPFS
        uint64 timestamp;
        uint64 sourceChain;      // CCIP chain selector
        bool valid;
    }

    /// @notice Auction result (stored internally, exposed via gated getters)
    struct AuctionResult {
        address winner;
        uint256 winningBid;
        address paymentToken;
        bytes32 settlementHash; // For privacy verification
    }
}
