# 🤫 HushBid Protocol

**Private Price Discovery Engine for On-Chain Assets**

> Sealed-bid auctions where nobody — not even the auctioneer — can see the bids until settlement. Powered by Chainlink CRE.

---

## The Problem

On-chain auctions today are fundamentally broken for price discovery. Every bid is publicly visible the moment it hits the mempool, which means:

- **Front-running** — Bots copy your bid and outbid you by 1 wei
- **Bid sniping** — Bidders wait until the last second, watching everyone else's bids
- **Strategic suppression** — Whales discourage competition by posting large bids early
- **No true price discovery** — You're not bidding what you think something is worth; you're bidding based on what everyone else bid

Traditional auctions solve this with sealed envelopes. HushBid brings that to the blockchain.

## The Solution

HushBid is a sealed-bid auction protocol where bids are **encrypted, committed on-chain, and only revealed inside a Chainlink CRE Trusted Execution Environment (TEE)**. The Decentralized Oracle Network (DON) decrypts bids, determines the winner, and settles the auction — all without any single party ever seeing the raw bid data.

### How It Works

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────────────────┐
│   Bidder A   │     │   Bidder B   │     │   Bidder C (other chain)    │
│  Base Sepolia│     │ Base Sepolia │     │   Arbitrum Sepolia          │
└──────┬───────┘     └──────┬───────┘     └─────────────┬───────────────┘
       │                    │                           │
       │ commit(hash)       │ commit(hash)              │ CCIP cross-chain bid
       │                    │                           │
       ▼                    ▼                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      HushBid Smart Contract                         │
│                         (Base Sepolia)                               │
│  • Stores only commitment hashes — no amounts visible on-chain      │
│  • Accepts bids in ETH, WETH, USDC, DAI, LINK, WBTC, USDT          │
│  • Optional World ID verification (one-person-one-bid)              │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
                           │ BidCommitted events
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Chainlink CRE Workflow (TEE)                      │
│                                                                      │
│  1. Detects auctions ready for settlement (cron + event triggers)   │
│  2. Fetches encrypted bid metadata from IPFS (ConfidentialHTTP)     │
│  3. Decrypts bids using ECIES inside the TEE — never exposed       │
│  4. Normalizes multi-token bids to USD via Chainlink Data Feeds     │
│  5. Determines the winner through DON consensus                     │
│  6. Submits DON-signed settlement transaction on-chain              │
│  7. Optionally transfers the asset atomically (DON-direct-delivery) │
└──────────────────────────────────────────────────────────────────────┘
```

**The result:** A fair auction where the true market price emerges, because every bidder submits what they genuinely believe the asset is worth — not a reaction to what others bid.

---

## Chainlink Products Used

### 🔗 Chainlink CRE (Compute Runtime Environment) — Core Engine

CRE is the backbone of HushBid. The entire settlement process runs inside the DON's TEE:

| CRE Capability | How HushBid Uses It |
|---|---|
| **ConfidentialHTTPClient** | Fetches encrypted bid metadata from IPFS — auth headers and response data never leave the TEE |
| **ECIES Encryption/Decryption** | Bids are encrypted with the DON's public key on the client side. Only the TEE can decrypt them |
| **CronCapability** | Periodic sweep checks for auctions that have passed their reveal deadline and need settlement |
| **EVMClient (Log Triggers)** | Listens for `AuctionCreated`, `BidCommitted`, and `AuctionSettled` events to react in real-time |
| **VaultDON Secrets** | Stores IPFS gateway credentials and the DON private key securely — never exposed to any party |
| **Consensus & Aggregation** | Multiple DON nodes independently decrypt and evaluate bids, then reach consensus on the winner |
| **Report / WriteReport** | Submits the DON-signed settlement transaction on-chain with full cryptographic proof |

### 🌉 Chainlink CCIP (Cross-Chain Interoperability)

Bidders don't need to be on the same chain as the auction. HushBid uses CCIP to forward bids from **Sepolia** and **Arbitrum Sepolia** to the auction contract on **Base Sepolia**. The `CrossChainBidSender` encodes the commitment hash and IPFS CID, sends them via CCIP's `IRouterClient`, and the `CrossChainBidReceiver` on Base records the bid as if it were local.

### 📊 Chainlink Data Feeds

The `PriceNormalizer` contract uses Chainlink Data Feeds (ETH/USD, USDC/USD, DAI/USD) to normalize bids across different tokens to a common USD value. This means a bid of 1 ETH and a bid of 3,500 USDC are directly comparable — the DON picks the highest-value bid regardless of token denomination.

---

## Key Features

### 🔒 Three Privacy Levels
Auction creators choose their privacy model:
- **Full Private** — Winner and amount are never publicly revealed. Only the winner knows they won.
- **Price Only** — The winning amount is revealed, but the winner's identity stays private.
- **Auditable** — A designated auditor address can inspect all bid details for compliance.

### 🎭 Stealth Addresses (ERC-5564)
Winners can receive assets at a stealth address — a one-time address derived from their keys that can't be linked to their main wallet. Combined with EIP-712 gasless claims (`claimAssetFor`), the winner can claim without revealing their identity on-chain.

### ⚡ DON-Direct-Delivery
When the CRE workflow settles an auction, it can transfer the escrowed asset directly to the winner in the same transaction — no separate claim step needed. The settlement and asset transfer happen atomically.

### 🌐 Cross-Chain Bidding
Bid from any supported chain. Currently supports:
- **Base Sepolia** (primary auction chain)
- **Sepolia** → Base Sepolia via CCIP
- **Arbitrum Sepolia** → Base Sepolia via CCIP

### 💱 Multi-Token Bidding
Bid in any of 7 supported tokens: **ETH, WETH, USDC, USDT, DAI, LINK, WBTC**. All bids are normalized to USD using Chainlink Data Feeds so they're directly comparable.

### 🆔 World ID Sybil Resistance
Auction creators can require World ID verification, ensuring one-person-one-bid. Prevents sock puppet attacks where a single entity places multiple bids to manipulate the auction.

### 🤖 AI Agent Orchestration
HushBid includes an LLM-powered agent (`cre-agent.mjs`) that autonomously monitors and settles auctions using a **Gather → Reason → Execute** loop:

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Gather     │────▶│  LLM Brain   │────▶│  Execute    │
│  (chain)    │     │  (Groq)      │     │  (cre sim)  │
└─────────────┘     └──────────────┘     └─────────────┘
       │                    ▲                    │
       └────────────────────┴────────────────────┘
                    feedback loop
```

- **Gather**: Reads on-chain auction state (phases, deadlines, bid counts) via viem
- **Reason**: Sends structured context to Groq/Llama 3.3 70B, which decides which auctions need action, what CRE triggers to fire, and optimal timing
- **Execute**: Spawns the CRE workflow simulator with the correct trigger index and auction parameters, broadcasting settlement transactions on-chain
- **Smart Scheduling**: Computes sleep intervals based on nearest auction deadline — no wasteful polling

The agent demonstrates how AI can consume and orchestrate CRE workflows as autonomous blockchain infrastructure, abstracting away the complexity of monitoring events, managing state transitions, and coordinating multi-step settlement processes.

### 🔐 Convergence Vault (Private Payments)
Bid payments flow through the Convergence Privacy Vault — a shielded ERC-20 transfer layer. Bidders deposit tokens into the vault, where they become invisible on-chain. The vault executes private transfers to the auction contract during settlement, ensuring bid amounts can't be correlated with bidder addresses through deposit/withdrawal patterns.

### 🖼️ Multi-Asset Support
Auction any type of on-chain asset:
- **ERC-721** — NFTs
- **ERC-20** — Fungible tokens
- **ERC-1155** — Semi-fungible tokens
- **None** — Pure price discovery (no asset escrowed)

---

## Project Structure

```
hushmarket/
├── packages/
│   ├── contracts/          # Solidity smart contracts (Hardhat 3)
│   │   ├── HushBid.sol              — Core auction contract
│   │   ├── PriceNormalizer.sol       — Chainlink Data Feeds integration
│   │   ├── CrossChainBidSender.sol   — CCIP bid forwarding
│   │   ├── CrossChainBidReceiver.sol — CCIP bid receiving
│   │   └── interfaces/IBidTypes.sol  — Shared type definitions
│   │
│   ├── sdk/                # TypeScript SDK (@hushbid/sdk)
│   │   ├── client.ts       — HushBidClient for all contract interactions
│   │   ├── crypto.ts       — Commitment generation, ECIES encryption
│   │   ├── stealth.ts      — ERC-5564 stealth address implementation
│   │   ├── tokens.ts       — Supported tokens + Chainlink feed addresses
│   │   └── ipfs.ts         — CID ↔ bytes32 conversion for on-chain storage
│   │
│   └── cre-workflow/       # Chainlink CRE Workflow
│       └── sealed-bid-auction/
│           ├── main.ts     — Full CRE workflow (cron + event triggers)
│           ├── workflow.yaml
│           └── config.*.json
│
└── apps/
    └── demo/               # React + Vite demo frontend
        ├── UserDashboard   — Browse auctions, place bids, reveal, claim
        ├── AdminDashboard  — Create auctions, manage settings
        └── HistoryPage     — View past auction results
```

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity ^0.8.28, Hardhat 3 |
| Oracle Network | Chainlink CRE, CCIP, Data Feeds |
| SDK | TypeScript, viem |
| Frontend | React, Vite, wagmi, RainbowKit |
| Identity | World ID (Worldcoin) |
| Storage | IPFS (Pinata) for encrypted bid metadata |
| Cryptography | ECIES (secp256r1/P-256), ERC-5564 stealth addresses, EIP-712 typed signatures |

## Deployed Contracts (Base Sepolia)

| Contract | Description |
|---|---|
| `HushBid` | Core sealed-bid auction contract |
| `PriceNormalizer` | Multi-token price normalization via Chainlink Data Feeds |
| `CrossChainBidReceiver` | Receives CCIP cross-chain bids |
| `MockNFT` | Test ERC-721 for demo auctions |

## Quick Start

```bash
# Install dependencies
npm install

# Compile contracts
npm run compile

# Build SDK
cd packages/sdk && npx tsup

# Run demo app
npm run dev:demo
```

## How to Use

1. **Create an auction** — Go to the Admin page, select your asset, set privacy level, and create
2. **Place a bid** — Browse auctions on the main page. Your bid is encrypted and committed on-chain. Nobody can see it.
3. **Wait for settlement** — The CRE workflow automatically detects when bidding ends, decrypts all bids inside the TEE, and settles the auction
4. **Claim your asset** — If you won, claim the escrowed asset (or receive it automatically via DON-direct-delivery)

---

## License

MIT

---

*Built for the Chainlink CRE Convergence Hackathon*
