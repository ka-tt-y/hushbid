# HushBid Demo App

A React front-end for the HushBid Protocol — sealed-bid auctions with on-chain privacy, World ID sybil resistance, and Chainlink Convergence private payments.

Built with **Vite + React + TypeScript + wagmi + RainbowKit + Tailwind CSS**.

## Quick Start

```bash
# From the monorepo root
npm install

# Build the SDK first (the demo depends on it)
cd packages/sdk && npm run build && cd ../..

# Start the demo dev server
cd apps/demo && npm run dev
```

The app runs at `http://localhost:3000` (or next available port).

### Environment Variables

Create a `.env` file in `apps/demo/`:

```env
# Contract addresses (Sepolia)
VITE_HUSH_BID_ADDRESS=0xf842c9a06e99f2b9fffa9d8ca10c42d7c3fc85d6
VITE_PRICE_NORMALIZER_ADDRESS=0x...

# Convergence Vault
VITE_CONVERGENCE_VAULT_ADDRESS=0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13
VITE_CONVERGENCE_API=https://convergence2026-token-api.cldev.cloud

# CRE (Confidential HTTP) — optional
VITE_CRE_ENDPOINT=
VITE_DON_PUBLIC_KEY=

# IPFS (Pinata) — optional, for encrypted bid backup
VITE_PINATA_JWT=

# World ID
VITE_WORLD_ID_APP_ID=app_9bf7f49b1cf8a9e6c0a90873574d9303

# WalletConnect
VITE_WALLETCONNECT_PROJECT_ID=...
```

## Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `UserDashboard` | Browse live auctions, view details, place sealed bids |
| `/` | `VaultPage` | View Convergence vault balances, withdraw tokens |
| `/create` | `CreateAuctionPage` | Create new sealed-bid auctions with privacy settings |
| `/activity` | `ActivityPage` | View your auction activity filtered by phase |
| `/history` | `HistoryPage` | Browse historical settled auctions |

## How the Demo Uses `@hushbid/sdk`

The demo app uses `@hushbid/sdk` as a workspace dependency (`"@hushbid/sdk": "*"` in package.json). Every on-chain interaction, cryptographic operation, and Convergence API call goes through the SDK.

### 1. Client Initialization — `useHushBidClient` hook

The `useHushBidClient` hook creates a singleton `HushBidClient` instance and wires it to wagmi's providers:

```ts
import { HushBidClient, type SupportedChain } from "@hushbid/sdk";

const client = new HushBidClient();
client.connectPublicClient("sepolia", publicClient);
client.connectWalletClient("sepolia", walletClient);
client.setContractAddresses("sepolia", { hushBid: addresses.hushBid });
client.configureCre({ endpoint, donPublicKey });
```

All page components access this shared client via the hook, ensuring consistent state and configuration.

### 2. Bid Submission — `BidModal` component

The `BidModal` orchestrates the full sealed-bid pipeline using multiple SDK modules:

**Pre-checks (before MetaMask opens):**
```ts
import { HUSH_BID_ABI } from "@hushbid/sdk";

// Check if address already bid
const hasBid = await publicClient.readContract({
  abi: HUSH_BID_ABI,
  functionName: "hasBid",
  args: [auctionId, bidderAddress],
});

// Check if World ID nullifier already used
const nullifierUsed = await publicClient.readContract({
  abi: HUSH_BID_ABI,
  functionName: "auctionNullifierHashes",
  args: [auctionId, nullifierHash],
});
```

**Convergence private payment flow:**
```ts
import {
  createConvergenceSigner,
  generateShieldedAddress,
  privateTransfer,
  approveVault,
  depositToVault,
  checkDepositAllowed,
} from "@hushbid/sdk";

// 1. Create EIP-712 signer for Convergence API auth
const signer = createConvergenceSigner(provider, account);

// 2. Generate shielded address for anonymous receiving
const { shieldedAddress } = await generateShieldedAddress(account, signer);

// 3. Approve vault → deposit tokens → private transfer to DON
await approveVault(walletClient, publicClient, { token: wethAddress });
await depositToVault(walletClient, publicClient, { token: wethAddress, amount });
const transfer = await privateTransfer(account, donAddress, wethAddress, amount, signer);
```

**CRE confidential submission:**
```ts
import { isCreConfigured, submitBidToCre, encryptForDon } from "@hushbid/sdk";

if (isCreConfigured(creConfig)) {
  const encrypted = encryptForDon(creConfig, bidDataBytes);
  await submitBidToCre(creConfig, bidSubmission, bidderAddress);
}
```

### 3. Bid Commitments — `lib/utils.ts`

Cryptographic commitment generation uses the SDK's crypto module (matches Solidity hashing exactly):

```ts
import { generateSalt, generateCommitment } from "@hushbid/sdk";

const salt = generateSalt();
const commitHash = generateCommitment(bidderAddress, amount, salt);
// Save salt to localStorage + optional IPFS backup
```

### 4. World ID Verification — `UserDashboard`

The dashboard converts IDKit widget proofs into the SDK's `WorldIdProof` format:

```ts
// Device proofs: root=0, zeroed proof array (cloud-verified by IDKit)
// Contract only tracks nullifierHash for sybil resistance
const worldIdProof: WorldIdProof = {
  root: 0n,
  nullifierHash: BigInt(proof.nullifier_hash),
  proof: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
};

// Orb proofs: real root + decoded proof (verified on-chain via WorldIDRouter)
const worldIdProof: WorldIdProof = {
  root: BigInt(proof.merkle_root),
  nullifierHash: BigInt(proof.nullifier_hash),
  proof: decodeWorldIdProof(proof.proof), // Split hex into 8 uint256 values
};

await client.commitBid(auctionId, commitHash, ipfsCid, worldIdProof);
```

### 5. Auction Creation — `AdminDashboard`

Uses SDK enums for privacy level and asset type configuration, plus Convergence deployment functions for setting up new tokens:

```ts
import {
  PrivacyLevel, AssetType, generateShieldedAddress,
  setupNewToken, isTokenRegistered, checkDepositAllowed,
  CONVERGENCE_VAULT_ABI, CONVERGENCE_VAULT_ADDRESS,
} from "@hushbid/sdk";

// Check if seller's token is vault-ready
const registered = await isTokenRegistered(publicClient, tokenAddress);

// One-click token setup: deploy → policy engine → mint → approve → register → deposit
const result = await setupNewToken(walletClient, publicClient, {
  name: "My Token", symbol: "MTK",
  mintAmount: parseEther("1000000"),
  depositAmount: parseEther("500000"),
});
```

### 6. Token Prices — `useTokenPrices` hook

Reads Chainlink price feeds for all supported tokens using the SDK's token registry:

```ts
import { SUPPORTED_TOKENS } from "@hushbid/sdk";

// Iterates SUPPORTED_TOKENS to read each token's Chainlink price feed
Object.entries(SUPPORTED_TOKENS).forEach(([symbol, config]) => {
  // Read Chainlink AggregatorV3 at config.priceFeed
});
```

### 7. Vault Management — `VaultPanel` component

Displays shielded vault balances and supports withdrawals:

```ts
import {
  getVaultBalances, withdrawFromVault, createConvergenceSigner,
  CONVERGENCE_VAULT_ABI, type VaultBalance,
} from "@hushbid/sdk";

const signer = createConvergenceSigner(provider, account);
const balances = await getVaultBalances(account, signer);
await withdrawFromVault(account, tokenAddress, amount, signer);
```

### 8. IPFS Backup — `lib/ipfs-backup.ts`

Encrypts bid data before pinning to IPFS:

```ts
import { encryptForDon } from "@hushbid/sdk";

const encrypted = encryptForDon(creConfig, bidDataBytes);
// Pin encrypted payload to Pinata IPFS
```

## Component Architecture

```
App.tsx (Router)
├── Layout (nav + outlet)
│   ├── UserDashboard (/)
│   │   ├── AuctionCard × N
│   │   ├── BidModal
│   │   │   ├── WorldIdVerify (IDKit widget)
│   │   │   └── StepProgress
│   ├── VaultPage (/vault)
│   │   └── VaultPanel
│   ├── CreateAuctionPage (/create)
│   │   └── AdminDashboard
│   ├── ActivityPage (/activity)
│   └── HistoryPage (/history)
```

## Tech Stack

| Dependency | Purpose |
|-----------|---------|
| `@hushbid/sdk` | Protocol SDK — contracts, crypto, Convergence, tokens |
| `viem` | Ethereum client library |
| `wagmi` | React hooks for Ethereum |
| `@rainbow-me/rainbowkit` | Wallet connection UI |
| `@worldcoin/idkit` | World ID verification widget |
| `@tanstack/react-query` | Async state management |
| `tailwindcss` | Utility-first CSS |
| `react-router-dom` | Client-side routing |
| `lucide-react` | Icon library |

## Development

```bash
# Dev server with hot reload
npm run dev

# Type check
npx tsc --noEmit

# Build for production
npm run build

# Preview production build
npm run preview
```

## License

MIT
