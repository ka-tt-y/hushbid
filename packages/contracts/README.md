# HushBid Smart Contracts

Solidity contracts powering the HushBid sealed-bid auction protocol. Deployed on **Base Sepolia**, with cross-chain support from Sepolia and Arbitrum Sepolia.

## Contracts

### HushBid.sol — Core Auction Contract

The main auction contract implementing a commit-reveal sealed-bid scheme with privacy-preserving settlement by Chainlink CRE.

**What it does:**
- Sellers create auctions with configurable privacy levels, asset types, and optional World ID requirements
- Bidders submit commitment hashes (not actual amounts) — bid values never touch the chain in plaintext
- The Chainlink DON settles auctions by submitting the winner and amount via a DON-signed transaction
- Assets (ERC-721, ERC-20, ERC-1155) are escrowed on creation and released to the winner on settlement

**Key mechanisms:**
- **Commit-reveal scheme** — `commitBid(auctionId, commitHash, ipfsCid)` stores only the hash. The encrypted bid metadata lives on IPFS, accessible only by the DON's TEE.
- **Privacy-gated getters** — View functions respect the auction's privacy level. `FULL_PRIVATE` auctions expose nothing; `PRICE_ONLY` reveals the winning amount but not the winner.
- **DON-direct-delivery** — `settleAuction()` accepts a `destinationAddress` parameter. When provided, the asset is transferred atomically during settlement — no separate claim step.
- **EIP-712 gasless claims** — `claimAssetFor()` lets a relayer claim on behalf of the winner using a typed signature, preserving the winner's anonymity.
- **World ID 4.0 integration** — When `worldIdRequired` is set, `commitBid` verifies a World ID v4 proof (via `IWorldIDVerifier.verify`), enforcing one-person-one-bid.
- **Cross-chain bid acceptance** — Bids from other chains arrive via the `CrossChainBidReceiver` and are recorded identically to local bids.

**Auction phases:**
```
CREATED → BIDDING → REVEAL → SETTLING → SETTLED → COMPLETED
                                           ↘ (DON-direct-delivery skips SETTLED, goes straight to COMPLETED)
                         CANCELLED ← (seller can cancel before settlement)
```

### PriceNormalizer.sol — Multi-Token Price Normalization

Uses **Chainlink Data Feeds** (AggregatorV3Interface) to normalize bids across different tokens to a common USD value.

- Supports ETH/USD, USDC/USD, DAI/USD price feeds
- `normalizeToUsd(token, amount)` returns the USD-equivalent value (8 decimals)
- `findHighestBid(tokens[], amounts[])` compares multiple bids and returns the index of the highest-value bid
- Includes staleness checks (`MAX_STALENESS = 1 hour`) to reject stale price data

### CrossChainBidSender.sol — CCIP Bid Forwarding

Enables bidders on other chains to participate in Base Sepolia auctions via **Chainlink CCIP**.

- Encodes `(auctionId, commitHash, ipfsCid, bidder)` into a CCIP message
- Sends via `IRouterClient.ccipSend()` to the `CrossChainBidReceiver` on Base Sepolia
- Supports fee payment in both native token and LINK

### CrossChainBidReceiver.sol — CCIP Bid Receiving

Receives cross-chain bids from `CrossChainBidSender` contracts on other chains.

- Implements `CCIPReceiver._ccipReceive()`
- Decodes the bid data and calls `HushBid.commitBid()` on behalf of the remote bidder
- Records the source chain selector for provenance tracking

### IBidTypes.sol — Shared Type Definitions

All shared enums and structs used across contracts:

| Type | Values |
|------|--------|
| `AssetType` | `NONE`, `ERC721`, `ERC20`, `ERC1155` |
| `PrivacyLevel` | `FULL_PRIVATE`, `PRICE_ONLY`, `AUDITABLE` |
| `AuctionPhase` | `CREATED`, `BIDDING`, `REVEAL`, `SETTLING`, `SETTLED`, `COMPLETED`, `CANCELLED` |

### MockNFT.sol

Test ERC-721 contract for local development and integration testing.

## Deployment

Contracts are deployed using Hardhat 3 + Ignition:

```bash
# Compile all contracts
npx hardhat compile

# Deploy to Base Sepolia
npx hardhat ignition deploy ignition/modules/HushBid.ts --network baseSepolia

# Run tests
npx hardhat test
```

## ABI Extraction

After compilation, ABIs are extracted to `abi/` for use by the SDK and CRE workflow:

```bash
npx hardhat run scripts/extract-abis.ts
```

## Architecture

```
                    ┌─────────────────────┐
                    │     HushBid.sol      │ ◄── Core auction logic
                    │   (Base Sepolia)     │
                    └─────┬──────┬────────┘
                          │      │
              ┌───────────┘      └────────────┐
              ▼                               ▼
┌──────────────────────┐         ┌─────────────────────────┐
│  PriceNormalizer.sol │         │ CrossChainBidReceiver.sol│
│  (Chainlink Feeds)   │         │ (Chainlink CCIP)         │
└──────────────────────┘         └────────────┬────────────┘
                                              │ CCIP messages
                                              │
                                 ┌────────────┴────────────┐
                                 │ CrossChainBidSender.sol  │
                                 │ (Sepolia / Arb Sepolia)  │
                                 └─────────────────────────┘
```
