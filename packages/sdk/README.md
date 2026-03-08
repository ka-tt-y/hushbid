# @hushbid/sdk

TypeScript SDK for interacting with the **HushBid Protocol** — a sealed-bid auction system with on-chain privacy, World ID sybil resistance, and Chainlink Convergence private payments.

Deployed on **Ethereum Sepolia**. Built on [viem](https://viem.sh).

## Installation

```bash
npm install @hushbid/sdk
```

`viem` is a peer dependency — install it alongside the SDK:

```bash
npm install viem @hushbid/sdk
```

## Quick Start

```ts
import {
  HushBidClient,
  generateCommitment,
  generateSalt,
  HUSH_BID_ABI,
  PrivacyLevel,
  AssetType,
} from "@hushbid/sdk";
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { sepolia } from "viem/chains";

// 1. Create SDK client
const client = new HushBidClient();

// 2. Connect viem clients
const publicClient = createPublicClient({ chain: sepolia, transport: http() });
client.connectPublicClient("sepolia", publicClient);

// 3. Read auction data
const auction = await client.getAuction(1n);
const phase = await client.getAuctionPhase(1n);
const bidCount = await client.getBidCount(1n);
```

## Architecture

```
@hushbid/sdk
├── client.ts              # HushBidClient class + HUSH_BID_ABI + CRE functions
├── crypto.ts              # Commitment hashing, salt generation, token hashing
├── types.ts               # Enums, interfaces, type definitions
├── chains.ts              # Sepolia chain configuration + contract addresses
├── tokens.ts              # Supported token registry (ETH, WETH, USDC, USDT, LINK)
├── convergence.ts         # Convergence Token API client (private transfers)
├── convergence-deploy.ts  # Token deployment + vault registration (Foundry ports)
├── artifacts-*.ts         # Contract bytecode for Convergence deployments
└── index.ts               # Public API barrel export
```

## Modules

### HushBidClient

The main client class for reading and writing to the HushBid smart contract.

```ts
import { HushBidClient } from "@hushbid/sdk";

const client = new HushBidClient();

// Connect clients (required before any operations)
client.connectPublicClient("sepolia", publicClient);
client.connectWalletClient("sepolia", walletClient);

// Optionally override deployed contract addresses
client.setContractAddresses("sepolia", {
  hushBid: "0x...",
});
```

#### Read Methods

| Method | Description |
|--------|-------------|
| `getAuction(auctionId)` | Get full auction configuration |
| `getAuctionPhase(auctionId)` | Get current phase (Created, Bidding, Reveal, Settled, Cancelled) |
| `getAuctionResult(auctionId)` | Get settlement result (winner, amount, token) |
| `getBidCount(auctionId)` | Number of committed bids |
| `getBidCommitment(auctionId, index)` | Read a specific bid commitment |
| `hasBid(auctionId, bidder)` | Check if an address has already bid |
| `getAuctionCount()` | Total number of auctions created |
| `getAuctionAddress()` | HushBid contract address on Sepolia |
| `getChainConfig(chain)` | Chain configuration for a given chain |

#### Write Methods

| Method | Description |
|--------|-------------|
| `createAuction(params)` | Create a new sealed-bid auction |
| `commitBid(auctionId, commitHash, ipfsCid?, worldIdProof?)` | Submit a sealed bid commitment |
| `submitBid(params)` | Full pipeline: encrypt → IPFS pin → commit on-chain |
| `cancelAuction(auctionId)` | Cancel an auction (seller only, before any bids) |

#### CRE (Confidential HTTP)

```ts
import { isCreConfigured, submitBidToCre, encryptForDon } from "@hushbid/sdk";

// Configure CRE endpoint for confidential bid submission
client.configureCre({
  endpoint: "https://your-cre-endpoint.com",
  donPublicKey: "0x...", // 32-byte hex symmetric key for keccak256-CTR
});

// Check if CRE is configured
if (isCreConfigured(client.creConfig)) {
  // Encrypt payload for DON (TEE-protected)
  const encrypted = encryptForDon(client.creConfig, payloadBytes);

  // Submit bid via Confidential HTTP
  const result = await submitBidToCre(client.creConfig, bidSubmission, bidderAddress);
}
```

### Crypto Utilities

Pure functions for bid commitment cryptography. These match the Solidity contract's hashing exactly.

```ts
import { generateSalt, generateCommitment, verifyCommitment, hashAllowedTokens } from "@hushbid/sdk";

// Generate a random 32-byte salt
const salt = generateSalt();

// Compute commitment hash: keccak256(abi.encodePacked(bidder, amount, salt))
const commitHash = generateCommitment(bidderAddress, bidAmount, salt);

// Verify a commitment matches reveal data
const valid = verifyCommitment(commitHash, bidderAddress, bidAmount, salt);

// Hash allowed tokens for auction creation
const tokensHash = hashAllowedTokens([wethAddress, usdcAddress]);
```

> ⚠️ **Save the salt securely.** You need it to reveal your bid later. If you lose the salt, your bid cannot be revealed.

### Types & Enums

```ts
import { PrivacyLevel, AuctionPhase, AssetType, type WorldIdProof } from "@hushbid/sdk";

// Privacy levels
PrivacyLevel.BASIC;        // 0 — Bid amounts visible after reveal
PrivacyLevel.FULL_PRIVATE; // 1 — Bid amounts stay hidden, DON settles
PrivacyLevel.AUDITABLE;    // 2 — Like FULL_PRIVATE but with designated auditor

// Auction phases
AuctionPhase.Created;   // 0
AuctionPhase.Bidding;   // 1
AuctionPhase.Reveal;    // 2
AuctionPhase.Settled;   // 3
AuctionPhase.Cancelled; // 4

// Asset types
AssetType.ERC20; // 0

// World ID proof for on-chain submission
const proof: WorldIdProof = {
  root: 0n,              // 0 for Device proofs, real root for Orb proofs
  nullifierHash: 123n,   // Unique per user+action, prevents double-bidding
  proof: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n], // ZK proof (zeroed for Device)
};
```

#### Key Interfaces

| Interface | Description |
|-----------|-------------|
| `AuctionConfig` | Full auction parameters read from contract |
| `CreateAuctionParams` | Parameters for creating an auction |
| `SubmitBidParams` | Parameters for submitting a bid |
| `WorldIdProof` | World ID proof (Orb or Device) |
| `BidCommitment` | On-chain bid commitment data |
| `AuctionResult` | Settlement result |
| `BidCommitmentResult` | Return value from bid submission |
| `CreConfig` | CRE endpoint + DON encryption key |
| `ChainConfig` | Chain name, ID, RPC, contract addresses |

### Token Registry

Pre-configured token metadata with Chainlink price feed addresses for Sepolia.

```ts
import {
  SUPPORTED_TOKENS,
  getToken,
  getTokenAddress,
  getTokensForChain,
  isNativeToken,
} from "@hushbid/sdk";

// Get token config
const weth = getToken("WETH");
// → { symbol: "WETH", name: "Wrapped Ether", decimals: 18, priceFeed: "0x...", addresses: { sepolia: "0x..." } }

// Get token address on Sepolia
const addr = getTokenAddress("USDC", "sepolia");

// List all tokens available on Sepolia
const tokens = getTokensForChain("sepolia"); // ETH, WETH, USDC, USDT, LINK

// Check if native
isNativeToken("0x0000000000000000000000000000000000000000"); // true
```

### Chain Configuration

```ts
import { CHAIN_CONFIGS, getChainConfig, getSupportedChains } from "@hushbid/sdk";

const sepolia = getChainConfig("sepolia");
// → { name: "Ethereum Sepolia", chainId: 11155111, rpcUrl: "...", contracts: { hushBid: "0x...", convergenceVault: "0x..." } }

const chains = getSupportedChains(); // ["sepolia"]
```

### Convergence Token API (Private Payments)

Functions for interacting with the [Chainlink Convergence](https://convergence2026-token-api.cldev.cloud/docs) private token transfer system. All API calls are authenticated with EIP-712 signatures.

```ts
import {
  createConvergenceSigner,
  getVaultBalances,
  getVaultTransactions,
  privateTransfer,
  generateShieldedAddress,
  withdrawFromVault,
  CONVERGENCE_VAULT_ADDRESS,
  CONVERGENCE_VAULT_ABI,
  ERC20_APPROVE_ABI,
} from "@hushbid/sdk";

// Create an EIP-712 signer (handles chain switching for MetaMask)
const signer = createConvergenceSigner(window.ethereum, accountAddress);

// Check vault balances
const balances = await getVaultBalances(accountAddress, signer);

// Execute a private (off-chain) transfer — no on-chain trace
const result = await privateTransfer(
  fromAddress,
  toAddress,
  tokenAddress,
  amount,
  signer,
);

// Generate a shielded address for receiving
const { shieldedAddress } = await generateShieldedAddress(accountAddress, signer);

// Withdraw from vault back to on-chain
const withdrawal = await withdrawFromVault(accountAddress, tokenAddress, amount, signer);
```

#### On-Chain Vault Operations

For depositing tokens into the Convergence Vault, use the ABI constants with viem directly:

```ts
import { CONVERGENCE_VAULT_ABI, ERC20_APPROVE_ABI, CONVERGENCE_VAULT_ADDRESS } from "@hushbid/sdk";

// Approve vault to spend tokens
await walletClient.writeContract({
  address: tokenAddress,
  abi: ERC20_APPROVE_ABI,
  functionName: "approve",
  args: [CONVERGENCE_VAULT_ADDRESS, amount],
});

// Deposit tokens into vault
await walletClient.writeContract({
  address: CONVERGENCE_VAULT_ADDRESS,
  abi: CONVERGENCE_VAULT_ABI,
  functionName: "deposit",
  args: [tokenAddress, amount],
});
```

### Convergence Token Deployment

SDK ports of the 6 Foundry scripts from the [Compliant-Private-Transfer-Demo](https://github.com/smartcontractkit/Compliant-Private-Transfer-Demo). Use these to deploy new ERC-20 tokens and register them on the Convergence Vault.

```ts
import { setupNewToken, checkDepositAllowed, isTokenRegistered } from "@hushbid/sdk";

// All-in-one: deploy token → policy engine → mint → approve → register → deposit
const result = await setupNewToken(walletClient, publicClient, {
  name: "My Auction Token",
  symbol: "MAT",
  mintAmount: parseEther("1000000"),
  depositAmount: parseEther("500000"),
  onStatus: (step, total, msg) => console.log(`[${step}/${total}] ${msg}`),
});
// result.tokenAddress, result.policyEngineProxy, etc.

// Or call individual steps:
import {
  deploySimpleToken,
  deployPolicyEngine,
  mintTokens,
  approveVault,
  registerTokenOnVault,
  depositToVault,
} from "@hushbid/sdk";
```

## HUSH_BID_ABI

The SDK exports the full HushBid contract ABI as a `const` assertion for use with viem's `readContract` / `writeContract` directly (without the client class):

```ts
import { HUSH_BID_ABI } from "@hushbid/sdk";
import { useReadContract } from "wagmi";

// Use directly with wagmi hooks
const { data: auction } = useReadContract({
  address: hushBidAddress,
  abi: HUSH_BID_ABI,
  functionName: "getAuction",
  args: [auctionId],
});
```

The ABI includes these functions and events:

| Functions | Events |
|-----------|--------|
| `createAuction` | `AuctionCreated` |
| `commitBid` | `BidCommitted` |
| `settleAuction` | `AuctionSettled` |
| `cancelAuction` | `AuctionCancelled` |
| `getAuction` | `AssetClaimed` |
| `auctionPhases` | |
| `getAuctionResult` | |
| `getBidCount` | |
| `getBidCommitment` | |
| `hasBid` | |
| `auctionCounter` | |
| `auctionNullifierHashes` | |

## World ID Integration

HushBid supports World ID for sybil resistance. Auctions can require World ID verification to prevent duplicate bidding.

**Two verification paths:**

| Level | Root | On-Chain Verification | Nullifier Tracking |
|-------|------|----------------------|-------------------|
| **Orb** | Real Merkle root | ✅ WorldIDRouter.verifyProof | ✅ On-chain |
| **Device** | `0` | ❌ Skipped (cloud-verified by IDKit) | ✅ On-chain |

```ts
import type { WorldIdProof } from "@hushbid/sdk";

// Device proof (verified by IDKit widget, contract only tracks nullifier)
const deviceProof: WorldIdProof = {
  root: 0n,
  nullifierHash: BigInt(idkitProof.nullifier_hash),
  proof: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
};

// Orb proof (verified on-chain via WorldIDRouter)
const orbProof: WorldIdProof = {
  root: BigInt(idkitProof.merkle_root),
  nullifierHash: BigInt(idkitProof.nullifier_hash),
  proof: decodeProof(idkitProof.proof), // Split into 8 uint256 values
};

await client.commitBid(auctionId, commitHash, ipfsCid, deviceProof);
```

## Contract Addresses (Sepolia)

| Contract | Address |
|----------|---------|
| HushBid | `0xf842c9a06e99f2b9fffa9d8ca10c42d7c3fc85d6` |
| Convergence Vault | `0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13` |
| WorldID Router | `0x469449f251692E0779667583026b5A1E99B72157` |

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Clean dist
npm run clean
```

The SDK is built with [tsup](https://tsup.egoist.dev/) and outputs CJS, ESM, and TypeScript declaration files.

## License

MIT
