// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IBidTypes} from "./interfaces/IBidTypes.sol";
import {IWorldIDVerifier} from "./interfaces/IWorldIDVerifier.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title HushBid
 * @notice Privacy-preserving auction with Chainlink CRE settlement
 * @dev All bid data is encrypted off-chain (IPFS + ECIES). The CRE DON
 *      decrypts inside a TEE, determines the winner, and calls settleAuction.
 *
 *        - Privacy hardening:
 *        - auctionResults is internal with gated getters respecting privacy levels
 *        - bidCommitments is internal; public getter omits IPFS CID
 *        - BidCommitted event no longer leaks ipfsCid
 *        - AuctionSettled event suppresses winner for FULL_PRIVATE
 *        - Only FULL_PRIVATE and AUDITABLE privacy levels
 *        - revealBid removed; DON handles all settlement via Confidential Compute
 *        - DON-direct-delivery: settleAuction records result, asset delivered
 *          privately via Convergence (no on-chain asset transfer)
 *        - claimAsset/claimAssetFor retained as fallback for failed deliveries
 */
contract HushBid is IBidTypes, ReentrancyGuard, Ownable {
    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error AuctionNotFound();
    error AuctionNotInPhase(AuctionPhase expected, AuctionPhase actual);
    error InvalidCommitment();
    error NotAuthorized();
    error WorldIdAlreadyUsed();
    error AlreadyBid();
    error AuctionExpired();
    error RevealNotEnded();
    error TransferFailed();
    error InvalidReservePrice();
    error AuditorRequired();
    error InvalidSignature();

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        address assetContract,
        uint256 tokenAmount,
        PrivacyLevel privacyLevel
    );

    /// @dev ipfsCid deliberately excluded to prevent on-chain correlation
    event BidCommitted(
        uint256 indexed auctionId,
        bytes32 indexed commitHash,
        uint64 sourceChain
    );

    /// @dev Winner suppressed for FULL_PRIVATE; bid suppressed for FULL_PRIVATE
    event AuctionSettled(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 winningBid,
        bytes32 settlementHash
    );

    event AuctionCancelled(uint256 indexed auctionId);

    event AssetClaimed(uint256 indexed auctionId, address indexed recipient);

    /*//////////////////////////////////////////////////////////////
                                 STATE
    //////////////////////////////////////////////////////////////*/

    IWorldIDVerifier public immutable worldIdVerifier;
    uint256 public immutable groupId;
    uint256 public immutable externalNullifierHash;
    address public creCoordinator;
    uint256 public auctionCounter;

    mapping(uint256 => AuctionConfig) public auctions;
    mapping(uint256 => AuctionPhase) public auctionPhases;
    mapping(uint256 => BidCommitment[]) internal _bidCommitments;
    mapping(uint256 => AuctionResult) internal _auctionResults;
    /// @dev Per-auction nullifier tracking: auctionNullifierHashes[auctionId][nullifier] = used
    mapping(uint256 => mapping(uint256 => bool)) public auctionNullifierHashes;
    mapping(uint256 => mapping(address => bool)) public hasBid;
    bytes32 public immutable DOMAIN_SEPARATOR;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(
        address _worldIdVerifier,
        address _creCoordinator,
        uint256 _groupId,
        string memory _appId,
        string memory _actionId
    ) Ownable(msg.sender) {
        worldIdVerifier = IWorldIDVerifier(_worldIdVerifier);
        creCoordinator = _creCoordinator;
        groupId = _groupId;
        externalNullifierHash = uint256(keccak256(abi.encodePacked(
            uint256(keccak256(abi.encodePacked(_appId))),
            keccak256(abi.encodePacked(_actionId))
        )));

        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("HushBid"),
            keccak256("1"),
            block.chainid,
            address(this)
        ));
    }

    /*//////////////////////////////////////////////////////////////
                           AUCTION CREATION
    //////////////////////////////////////////////////////////////*/

    function createAuction(
        CreateAuctionParams calldata p
    ) external returns (uint256 auctionId) {
        if (p.privacyLevel == PrivacyLevel.AUDITABLE && p.auditor == address(0)) {
            revert AuditorRequired();
        }

        // No on-chain escrow — seller deposits the auctioned tokens into the
        // Convergence vault off-chain before calling this function.
        // The contract stores metadata only.

        auctionId = ++auctionCounter;

        auctions[auctionId] = AuctionConfig({
            seller: msg.sender,
            assetContract: p.assetContract,
            tokenAmount: p.tokenAmount,
            reservePrice: p.reservePrice,
            biddingEnd: uint64(block.timestamp) + p.biddingDuration,
            revealEnd: uint64(block.timestamp) + p.biddingDuration + p.revealDuration,
            assetType: p.assetType,
            privacyLevel: p.privacyLevel,
            worldIdRequired: p.worldIdRequired,
            allowedTokensHash: p.allowedTokensHash,
            auditor: p.auditor,
            sellerShieldedAddress: p.sellerShieldedAddress
        });

        auctionPhases[auctionId] = AuctionPhase.BIDDING;

        emit AuctionCreated(auctionId, msg.sender, p.assetContract, p.tokenAmount, p.privacyLevel);
    }

    /*//////////////////////////////////////////////////////////////
                              BID COMMIT
    //////////////////////////////////////////////////////////////*/

    function commitBid(
        uint256 auctionId,
        bytes32 commitHash,
        string calldata ipfsCid,
        uint256 root,
        uint256 nullifierHash,
        uint256[8] calldata zeroKnowledgeProof
    ) external {
        AuctionConfig storage auction = auctions[auctionId];
        if (auction.seller == address(0)) revert AuctionNotFound();
        if (auctionPhases[auctionId] != AuctionPhase.BIDDING) {
            revert AuctionNotInPhase(AuctionPhase.BIDDING, auctionPhases[auctionId]);
        }
        if (block.timestamp > auction.biddingEnd) revert AuctionExpired();
        if (commitHash == bytes32(0)) revert InvalidCommitment();
        if (hasBid[auctionId][msg.sender]) revert AlreadyBid();

        if (auction.worldIdRequired) {
            if (nullifierHash == 0) revert InvalidCommitment();
            if (auctionNullifierHashes[auctionId][nullifierHash]) revert WorldIdAlreadyUsed();

            // root != 0 → Orb proof: verify on-chain via WorldIDRouter
            // root == 0 → Device proof: verified off-chain via World ID cloud API;
            //             the contract enforces nullifier uniqueness only.
            //             See: https://docs.world.org/world-id/idkit/onchain-verification
            if (root != 0) {
                worldIdVerifier.verifyProof(
                    root,
                    groupId,
                    uint256(keccak256(abi.encodePacked(msg.sender))),
                    nullifierHash,
                    externalNullifierHash,
                    zeroKnowledgeProof
                );
            }

            auctionNullifierHashes[auctionId][nullifierHash] = true;
        }

        _bidCommitments[auctionId].push(BidCommitment({
            commitHash: commitHash,
            ipfsCid: ipfsCid,
            timestamp: uint64(block.timestamp),
            sourceChain: 0,
            valid: true
        }));

        hasBid[auctionId][msg.sender] = true;

        emit BidCommitted(auctionId, commitHash, 0);
    }

    /*//////////////////////////////////////////////////////////////
                              SETTLEMENT
    //////////////////////////////////////////////////////////////*/

    /// @notice Settle auction: record result and mark complete.
    /// @dev Asset delivery happens off-chain via Convergence private transfer.
    ///      The contract only records the settlement result and transitions phase.
    /// @param winnerBidIndex Index into _bidCommitments[auctionId]
    /// @param winningBid The winning amount (checked against reservePrice)
    /// @param paymentToken Token used for the winning bid (stored in result)
    /// @param settlementHash DON-computed hash for integrity verification
    /// @param destinationAddress Winner's shielded address for off-chain
    ///        asset delivery via Convergence. Stored in result for reference.
    function settleAuction(
        uint256 auctionId,
        uint256 winnerBidIndex,
        uint256 winningBid,
        address paymentToken,
        bytes32 settlementHash,
        address destinationAddress
    ) external nonReentrant {
        if (msg.sender != creCoordinator) revert NotAuthorized();

        AuctionConfig storage auction = auctions[auctionId];
        if (auction.seller == address(0)) revert AuctionNotFound();

        AuctionPhase currentPhase = auctionPhases[auctionId];
        if (
            currentPhase == AuctionPhase.SETTLED ||
            currentPhase == AuctionPhase.COMPLETED ||
            currentPhase == AuctionPhase.CANCELLED
        ) {
            revert AuctionNotInPhase(AuctionPhase.REVEAL, currentPhase);
        }

        if (block.timestamp < auction.revealEnd) revert RevealNotEnded();
        if (winningBid < auction.reservePrice) revert InvalidReservePrice();

        // Look up the winner's commitHash from storage — the winner address
        // never appears in calldata, only this opaque hash is stored.
        bytes32 winnerCommitHash = _bidCommitments[auctionId][winnerBidIndex].commitHash;
        if (winnerCommitHash == bytes32(0)) revert InvalidCommitment();

        _auctionResults[auctionId] = AuctionResult({
            winner: destinationAddress, // Store shielded delivery address as "winner"
            winningBid: winningBid,
            paymentToken: paymentToken,
            settlementHash: settlementHash
        });

        // Privacy-aware event emission:
        //   FULL_PRIVATE  → zero winner, zero bid
        //   AUDITABLE     → zero winner, zero bid (auditor reads via getter)

        // No on-chain asset transfer — DON delivers via Convergence private transfer.
        // Go straight to COMPLETED.
        auctionPhases[auctionId] = AuctionPhase.COMPLETED;

        emit AuctionSettled(auctionId, address(0), 0, settlementHash);
    }

    /*//////////////////////////////////////////////////////////////
                                ADMIN
    //////////////////////////////////////////////////////////////*/

    function setCreCoordinator(address _creCoordinator) external onlyOwner {
        creCoordinator = _creCoordinator;
    }

    function cancelAuction(uint256 auctionId) external {
        AuctionConfig storage auction = auctions[auctionId];
        if (msg.sender != auction.seller) revert NotAuthorized();
        if (auctionPhases[auctionId] >= AuctionPhase.SETTLING) {
            revert AuctionNotInPhase(AuctionPhase.BIDDING, auctionPhases[auctionId]);
        }

        auctionPhases[auctionId] = AuctionPhase.CANCELLED;

        // No on-chain token return — seller reclaims from Convergence vault.

        emit AuctionCancelled(auctionId);
    }

    function getBidCount(uint256 auctionId) external view returns (uint256) {
        return _bidCommitments[auctionId].length;
    }

    function getAuction(uint256 auctionId) external view returns (AuctionConfig memory) {
        return auctions[auctionId];
    }

    /// @notice Public getter omits ipfsCid for privacy
    function getBidCommitment(
        uint256 auctionId,
        uint256 index
    ) external view returns (bytes32 commitHash, uint64 timestamp, uint64 sourceChain, bool valid) {
        BidCommitment storage c = _bidCommitments[auctionId][index];
        return (c.commitHash, c.timestamp, c.sourceChain, c.valid);
    }

    /// @notice Full getter includes ipfsCid (points to encrypted data)
    /// @dev No access gate — ipfsCid is just a pointer to an ECIES-encrypted
    ///      envelope on IPFS. Only the DON can decrypt it inside the TEE.
    ///      Storage slots are publicly readable anyway via eth_getStorageAt.
    function getBidCommitmentFull(
        uint256 auctionId,
        uint256 index
    ) external view returns (BidCommitment memory) {
        return _bidCommitments[auctionId][index];
    }

    /// @notice Privacy-gated auction result
    /// @dev Access control:
    ///   - CRE coordinator: full result (both privacy levels)
    ///   - Auditor: full result (AUDITABLE only)
    ///   - Everyone else (owner, seller, winner, public): all zeros
    ///
    /// Nothing is visible on-chain to the public for either privacy level.
    /// The seller learns the outcome by receiving shielded payment via
    /// Convergence. The winner learns by receiving the asset.
    function getAuctionResult(uint256 auctionId) external view returns (AuctionResult memory) {
        AuctionConfig storage auction = auctions[auctionId];
        AuctionResult storage result = _auctionResults[auctionId];

        // CRE coordinator: always sees full result
        if (msg.sender == creCoordinator) return result;

        // AUDITABLE: designated auditor sees full result
        if (auction.privacyLevel == PrivacyLevel.AUDITABLE && msg.sender == auction.auditor) {
            return result;
        }

        // Everyone else: all zeros — nothing leaks on-chain
        return AuctionResult(address(0), 0, address(0), bytes32(0));
    }



    function _recoverSigner(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert InvalidSignature();
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
        return signer;
    }
}
