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

### 📊 Chainlink Data Feeds

The `PriceNormalizer` contract uses Chainlink Data Feeds (ETH/USD, USDC/USD, DAI/USD) to normalize bids across different tokens to a common USD value. This means a bid of 1 ETH and a bid of 3,500 USDC are directly comparable — the DON picks the highest-value bid regardless of token denomination.

---

## Key Features

### 🔒 Three Privacy Levels
Auction creators choose their privacy model:
- **Full Private** — Winner and amount are never publicly revealed. Only the winner knows they won.
- **Auditable** — A designated auditor address can inspect all bid details for compliance.

### 🎭 Shielded Addresses (ERC-5564)
Winners can receive assets at a shielded address — a one-time address derived from their keys that can't be linked to their main wallet. All participants can claim (get refunded) without revealing their identity on-chain.

### 🌐 Single-Chain Deployment
Currently deployed on **Ethereum Sepolia** with all contracts and Convergence Vault on the same chain. The contract architecture will support future cross-chain expansion via Chainlink CCIP.

### 💱 Multi-Token Bidding
Bid in any of multiple supported ERC20 tokens including **, WETH, CUSTOM TOKEN**. All bids are normalized to USD using Chainlink Data Feeds so they're directly comparable.

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
- **ERC-20** — Fungible tokens

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity ^0.8.28, Hardhat 3 |
| Oracle Network | Chainlink CRE, CCIP, Data Feeds |
| SDK | TypeScript, viem |
| Frontend | React, Vite, wagmi, RainbowKit |
| Identity | World ID (Worldcoin) |
| Storage | IPFS (Pinata) for encrypted bid metadata |
| Cryptography | ECIES (secp256r1/P-256), keccak256-CTR, EIP-712 typed signatures |

## Deployed Contracts (Ethereum Sepolia)

| Contract | Address | Description |
|---|---|---|
| `HushBid` | `0xf842c9a06e99f2b9fffa9d8ca10c42d7c3fc85d6` | Core sealed-bid auction contract |
| `PriceNormalizer` | — | Multi-token price normalization via Chainlink Data Feeds |
| Convergence Vault | `0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13` | Shielded ERC-20 transfer layer |
| WorldID Router | `0x469449f251692E0779667583026b5A1E99B72157` | World ID on-chain verification (Orb) |

## Quick Start

```bash
# Install dependencies
npm install

# Build SDK (required before running the demo)
cd packages/sdk && npm run build && cd ../..

# Run demo app
npm run dev:demo
```

## How to Use

1. **Create an auction** — Go to the Admin page, select your asset, set privacy level, and create
2. **Place a bid** — Browse auctions on the main page. Your bid is encrypted and committed on-chain. Nobody can see it.
3. **Wait for settlement** — The CRE workflow automatically detects when bidding ends, decrypts all bids inside the TEE, and settles the auction
4. **Claim your asset** — If you won, claim the escrowed asset (or receive it automatically via DON-direct-delivery)
---

*Built for the Chainlink CRE Convergence Hackathon*
