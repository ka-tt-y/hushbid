# HushBid CRE Workflow — Confidential Auction Settlement

This is the **Chainlink CRE (Compute Runtime Environment) workflow** that powers HushBid's private auction settlement. It runs inside the DON's Trusted Execution Environment (TEE), where encrypted bids are decrypted, evaluated, and settled — without any party ever seeing the raw bid data.

## What This Workflow Does

1. **Detects auctions ready for settlement** — via cron (periodic sweep) and event-driven triggers
2. **Fetches encrypted bid metadata from IPFS** — using CRE's ConfidentialHTTPClient (auth headers never leave the TEE)
3. **Decrypts bids using ECIES** — the DON's private key is stored in VaultDON secrets and used only inside the TEE
4. **Normalizes multi-token bids to USD** — reads Chainlink Data Feeds via PriceNormalizer contract
5. **Determines the winner through DON consensus** — multiple nodes independently evaluate and agree
6. **Submits a DON-signed settlement transaction** — calls `settleAuction()` on the HushBid contract
7. **Optionally transfers assets atomically** — DON-direct-delivery sends the asset to the winner in the same tx

## CRE Capabilities Used

| Capability | Usage |
|---|---|
| `CronCapability` | Periodic sweep (every 60s) to find auctions past their reveal deadline |
| `EVMClient` (Log Triggers) | Real-time reaction to `AuctionCreated`, `BidCommitted`, and `AuctionSettled` events |
| `ConfidentialHTTPClient` | Fetches encrypted bid metadata from IPFS gateway — request/response data stays inside TEE |
| `VaultDON` Secrets | Stores IPFS gateway auth token and DON ECIES private key |
| `EVMClient.read()` | Reads auction state, bid commitments, and price feeds from on-chain contracts |
| `EVMClient.writeReport()` | Submits DON-signed settlement transaction with winner, amount, and destination address |
| Consensus / Aggregation | Multiple DON nodes independently decrypt and evaluate bids, then reach agreement |

## Workflow Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CRE TEE Environment                   │
│                                                          │
│  ┌──────────┐    ┌────────────────┐    ┌──────────────┐ │
│  │  Trigger  │    │  IPFS Fetch    │    │  Settlement  │ │
│  │  (Cron /  │───▶│  (Confidential │───▶│  (Decrypt,   │ │
│  │  Events)  │    │   HTTP)        │    │   Compare,   │ │
│  └──────────┘    └────────────────┘    │   Write)     │ │
│                                         └──────────────┘ │
│                                                          │
│  Secrets: DON private key, IPFS auth token               │
│  Never exposed outside TEE                               │
└──────────────────────────────────────────────────────────┘
         │                                      │
         │ Read events/state                    │ DON-signed tx
         ▼                                      ▼
┌─────────────────┐                   ┌─────────────────┐
│  HushBid.sol    │                   │  HushBid.sol    │
│  (read auction  │                   │  (settleAuction │
│   state, bids)  │                   │   + transfer)   │
└─────────────────┘                   └─────────────────┘
```

## Triggers

### Cron Trigger
Runs on a configurable schedule (default: every 60 seconds). Scans all active auctions and settles any that have passed their reveal deadline. This is the primary settlement mechanism — it catches everything.

### Event Triggers
React to specific on-chain events in real-time:
- **AuctionCreated** — Logs new auctions for tracking
- **BidCommitted** — Tracks incoming bids and their IPFS CIDs
- **AuctionSettled** — Confirms settlement completion

## Privacy Flow

```
Bidder                          IPFS                    CRE TEE
  │                              │                        │
  │ 1. Generate commitment       │                        │
  │    hash = keccak256(         │                        │
  │      bidder, amount, salt)   │                        │
  │                              │                        │
  │ 2. Encrypt bid metadata      │                        │
  │    with DON public key       │                        │
  │    (ECIES P-256)             │                        │
  │                              │                        │
  │ 3. Pin encrypted blob ──────▶│                        │
  │                              │                        │
  │ 4. Submit hash + CID         │                        │
  │    on-chain (no amounts!)    │                        │
  │                              │                        │
  │                              │  5. Fetch encrypted ◀──│
  │                              │     blob               │
  │                              │                        │
  │                              │     6. Decrypt with ───│
  │                              │        DON private key │
  │                              │                        │
  │                              │     7. Compare bids,   │
  │                              │        find winner     │
  │                              │                        │
  │                              │     8. Submit DON-     │
  │                              │        signed settle   │
  │                              │        transaction     │
```

## Configuration

### config.staging.json / config.production.json

```json
{
  "schedule": "0 */1 * * * *",
  "hushBidAddress": "0x...",
  "priceNormalizerAddress": "0x...",
  "chainSelectorName": "ethereum-testnet-sepolia-base-1"
}
```

### Secrets (VaultDON)

| Secret | Purpose |
|--------|---------|
| `IPFS_GATEWAY_AUTH` | Bearer token for authenticated IPFS gateway access |
| `DON_PRIVATE_KEY` | ECIES private key for decrypting bid metadata inside TEE |

## Running Locally

### Simulate with CRE CLI

```bash
# From the project root
cre workflow simulate ./packages/cre-workflow/sealed-bid-auction

# Select trigger type:
# 1. cron-trigger    — Simulates periodic settlement sweep
# 2. LogTrigger      — Simulates reaction to a specific on-chain event
```

### Install Dependencies

```bash
cd packages/cre-workflow/sealed-bid-auction
bun install
```

## Key Design Decisions

- **ECIES P-256** was chosen for bid encryption because the CRE TEE natively supports secp256r1 key operations
- **IPFS** is used as the transport layer for encrypted bid metadata because on-chain storage of encrypted blobs would be prohibitively expensive
- **Cron + Event dual-trigger** ensures no auction is missed — cron provides reliability, events provide responsiveness
- **DON-direct-delivery** eliminates a separate claim step, improving UX and reducing the window where a winner's identity could be linked to their claim transaction
