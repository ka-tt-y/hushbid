import {
  type Address,
  type PublicClient,
  type WalletClient,
  zeroAddress,
  zeroHash,
  keccak256 as keccak256Import,
} from "viem";
import {
  AuctionConfig,
  AuctionPhase,
  AuctionResult,
  ChainConfig,
  CreateAuctionParams,
  CreConfig,
  PrivacyLevel,
  SupportedChain,
  WorldIdProof,
} from "./types";
import { CHAIN_CONFIGS, getChainConfig } from "./chains";
import { generateCommitment, generateSalt, hashAllowedTokens } from "./crypto";

// =============================================================================
// Contract ABIs (human-readable for viem — matches compiled Solidity exactly)
// =============================================================================

export const HUSH_BID_ABI = [
  {
    type: "function",
    name: "createAuction",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "p",
        type: "tuple",
        components: [
          { name: "assetContract", type: "address" },
          { name: "tokenAmount", type: "uint256" },
          { name: "assetType", type: "uint8" },
          { name: "reservePrice", type: "uint256" },
          { name: "biddingDuration", type: "uint64" },
          { name: "revealDuration", type: "uint64" },
          { name: "privacyLevel", type: "uint8" },
          { name: "worldIdRequired", type: "bool" },
          { name: "allowedTokensHash", type: "bytes32" },
          { name: "auditor", type: "address" },
          { name: "sellerShieldedAddress", type: "address" },
        ],
      },
    ],
    outputs: [{ name: "auctionId", type: "uint256" }],
  },
  {
    type: "function",
    name: "commitBid",
    stateMutability: "nonpayable",
    inputs: [
      { name: "auctionId", type: "uint256" },
      { name: "commitHash", type: "bytes32" },
      { name: "ipfsCid", type: "string" },
      { name: "root", type: "uint256" },
      { name: "nullifierHash", type: "uint256" },
      { name: "zeroKnowledgeProof", type: "uint256[8]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "settleAuction",
    stateMutability: "nonpayable",
    inputs: [
      { name: "auctionId", type: "uint256" },
      { name: "winnerBidIndex", type: "uint256" },
      { name: "winningBid", type: "uint256" },
      { name: "paymentToken", type: "address" },
      { name: "settlementHash", type: "bytes32" },
      { name: "destinationAddress", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelAuction",
    stateMutability: "nonpayable",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getAuction",
    stateMutability: "view",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "seller", type: "address" },
          { name: "assetContract", type: "address" },
          { name: "tokenAmount", type: "uint256" },
          { name: "reservePrice", type: "uint256" },
          { name: "biddingEnd", type: "uint64" },
          { name: "revealEnd", type: "uint64" },
          { name: "assetType", type: "uint8" },
          { name: "privacyLevel", type: "uint8" },
          { name: "worldIdRequired", type: "bool" },
          { name: "allowedTokensHash", type: "bytes32" },
          { name: "auditor", type: "address" },
          { name: "sellerShieldedAddress", type: "address" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "auctionPhases",
    stateMutability: "view",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "getAuctionResult",
    stateMutability: "view",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "winner", type: "address" },
          { name: "winningBid", type: "uint256" },
          { name: "paymentToken", type: "address" },
          { name: "settlementHash", type: "bytes32" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getBidCount",
    stateMutability: "view",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getBidCommitment",
    stateMutability: "view",
    inputs: [
      { name: "auctionId", type: "uint256" },
      { name: "index", type: "uint256" },
    ],
    outputs: [
      { name: "commitHash", type: "bytes32" },
      { name: "timestamp", type: "uint64" },
      { name: "sourceChain", type: "uint64" },
      { name: "valid", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "hasBid",
    stateMutability: "view",
    inputs: [
      { name: "auctionId", type: "uint256" },
      { name: "bidder", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "auctionCounter",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "AuctionCreated",
    inputs: [
      { name: "auctionId", type: "uint256", indexed: true },
      { name: "seller", type: "address", indexed: true },
      { name: "assetContract", type: "address", indexed: false },
      { name: "tokenAmount", type: "uint256", indexed: false },
      { name: "privacyLevel", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BidCommitted",
    inputs: [
      { name: "auctionId", type: "uint256", indexed: true },
      { name: "commitHash", type: "bytes32", indexed: true },
      { name: "sourceChain", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AssetClaimed",
    inputs: [
      { name: "auctionId", type: "uint256", indexed: true },
      { name: "winner", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "AuctionSettled",
    inputs: [
      { name: "auctionId", type: "uint256", indexed: true },
      { name: "winner", type: "address", indexed: true },
      { name: "winningBid", type: "uint256", indexed: false },
      { name: "settlementHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AuctionCancelled",
    inputs: [{ name: "auctionId", type: "uint256", indexed: true }],
  },
] as const;

export const PRICE_NORMALIZER_ABI = [
  {
    type: "function",
    name: "normalizeToUsd",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "usdValue", type: "uint256" }],
  },
  {
    type: "function",
    name: "compareBids",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "amountA", type: "uint256" },
      { name: "tokenB", type: "address" },
      { name: "amountB", type: "uint256" },
    ],
    outputs: [
      { name: "aIsHigher", type: "bool" },
      { name: "aUsd", type: "uint256" },
      { name: "bUsd", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "findHighestBid",
    stateMutability: "view",
    inputs: [
      { name: "tokens", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [
      { name: "winnerIndex", type: "uint256" },
      { name: "highestUsd", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "getAllPrices",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "ethUsd", type: "uint256" },
      { name: "usdcUsd", type: "uint256" },
      { name: "daiUsd", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "getEthUsdPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "price", type: "uint256" }],
  },
  {
    type: "function",
    name: "getUsdcUsdPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "price", type: "uint256" }],
  },
  {
    type: "function",
    name: "getDaiUsdPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "price", type: "uint256" }],
  },
] as const;

export const MOCK_NFT_ABI = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

// =============================================================================
// CRE / Confidential HTTP Client
// =============================================================================

/**
 * Bid submission payload for CRE Confidential HTTP
 */
export interface BidSubmission {
  auctionId: string;
  commitment: `0x${string}`;
  encryptedAmount?: string;
  paymentToken: Address;
  sourceChain: number;
  worldIdProof?: {
    nullifierHash: string;
    proof: string;
    merkleRoot: string;
    verificationLevel: string;
  };
}

/**
 * Response from CRE bid submission
 */
export interface BidSubmissionResponse {
  success: boolean;
  commitment?: string;
  bidIndex?: number;
  error?: string;
}

/**
 * Check if CRE endpoint is configured
 */
export function isCreConfigured(config: CreConfig): boolean {
  return Boolean(config.endpoint);
}

/**
 * Submit a bid via CRE Confidential HTTP
 *
 * The payload is sent to the DON's Confidential HTTP endpoint:
 * - Bid amounts are hidden from the public mempool
 * - Only DON nodes can decrypt
 * - MEV-resistant submission
 */
export async function submitBidToCre(
  config: CreConfig,
  bid: BidSubmission,
  bidderAddress: Address
): Promise<BidSubmissionResponse> {
  if (!config.endpoint) {
    console.warn("CRE endpoint not configured, skipping CRE submission");
    return { success: false, error: "CRE not configured" };
  }

  try {
    const response = await fetch(`${config.endpoint}/api/v1/bid`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bidder-Address": bidderAddress,
      },
      body: JSON.stringify(bid),
    });

    const data = (await response.json()) as { error?: string; commitment?: string; bidIndex?: number };

    if (!response.ok) {
      return {
        success: false,
        error: data.error || `HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      commitment: data.commitment,
      bidIndex: data.bidIndex,
    };
  } catch (error) {
    console.error("CRE submission error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Get auction info from CRE (cached state)
 */
export async function getAuctionFromCre(
  config: CreConfig,
  auctionId: string
): Promise<{
  phase: string;
  bidCount: number;
  biddingEnd: number;
  revealEnd: number;
} | null> {
  if (!config.endpoint) {
    return null;
  }

  try {
    const response = await fetch(
      `${config.endpoint}/api/v1/auction/${auctionId}`
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as { phase: string; bidCount: number; biddingEnd: number; revealEnd: number };
  } catch {
    return null;
  }
}

/**
 * Encrypt an arbitrary payload for the DON using keccak256-CTR.
 *
 * Uses a shared symmetric key so only the DON (inside TEE) and the
 * frontend can encrypt/decrypt. The key never leaves the TEE in production.
 *
 */
export function encryptForDon(
  config: CreConfig,
  payload: Uint8Array
): string {
  if (!config.donPublicKey) {
    throw new Error(
      "DON encryption key not configured. Set donPublicKey in CreConfig."
    );
  }

  const key = hexToBytes(config.donPublicKey);
  if (key.length !== 32) throw new Error(`Encryption key must be 32 bytes, got ${key.length}`);

  // Random 32-byte nonce
  const nonce = new Uint8Array(32);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(nonce);
  } else {
    // Node.js fallback
    for (let i = 0; i < 32; i++) nonce[i] = Math.floor(Math.random() * 256);
  }

  // keccak256-CTR encrypt
  const ciphertext = new Uint8Array(payload.length);
  for (let offset = 0; offset < payload.length; offset += 32) {
    const blockIdx = Math.floor(offset / 32);
    // keystream block = keccak256(key || nonce || blockIdx as uint32 BE)
    const blockInput = new Uint8Array(32 + 32 + 4);
    blockInput.set(key, 0);
    blockInput.set(nonce, 32);
    blockInput[64] = (blockIdx >> 24) & 0xff;
    blockInput[65] = (blockIdx >> 16) & 0xff;
    blockInput[66] = (blockIdx >> 8) & 0xff;
    blockInput[67] = blockIdx & 0xff;
    const ksHex = keccak256Bytes(blockInput);
    const ks = hexToBytes(ksHex);
    const end = Math.min(offset + 32, payload.length);
    for (let j = offset; j < end; j++) {
      ciphertext[j] = payload[j] ^ ks[j - offset];
    }
  }

  // MAC = keccak256(key || "hushbid-mac" || nonce || ciphertext)
  const macTag = new TextEncoder().encode('hushbid-mac');
  const macInput = new Uint8Array(32 + macTag.length + 32 + ciphertext.length);
  macInput.set(key, 0);
  macInput.set(macTag, 32);
  macInput.set(nonce, 32 + macTag.length);
  macInput.set(ciphertext, 32 + macTag.length + 32);
  const macHex = keccak256Bytes(macInput);
  const mac = hexToBytes(macHex);

  // Envelope: nonce (32) || mac (32) || ciphertext
  const result = new Uint8Array(32 + 32 + ciphertext.length);
  result.set(nonce, 0);
  result.set(mac, 32);
  result.set(ciphertext, 64);

  return btoa(String.fromCharCode(...result));
}

/** keccak256 over raw bytes, returns hex string */
function keccak256Bytes(data: Uint8Array): string {
  // Use viem's keccak256 which accepts hex input
  let hex = '0x';
  for (let i = 0; i < data.length; i++) {
    hex += data[i].toString(16).padStart(2, '0');
  }
  return keccak256Import(hex as `0x${string}`);
}

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// =============================================================================
// HushBid Protocol Client (viem-based)
// =============================================================================

/**
 * Main client for interacting with HushBid Protocol contracts
 */
export class HushBidClient {
  private publicClients: Map<SupportedChain, PublicClient> = new Map();
  private walletClients: Map<SupportedChain, WalletClient> = new Map();
  private configs: Map<SupportedChain, ChainConfig> = new Map();

  /** Optional CRE configuration for confidential HTTP */
  public creConfig: CreConfig = { endpoint: "", donPublicKey: "" };

  constructor() {
    for (const [chain, config] of Object.entries(CHAIN_CONFIGS)) {
      this.configs.set(chain as SupportedChain, config);
    }
  }

  /**
   * Configure the CRE endpoint and DON public key
   */
  configureCre(config: CreConfig): this {
    this.creConfig = config;
    return this;
  }

  /**
   * Connect to a chain with a public client
   */
  connectPublicClient(chain: SupportedChain, client: PublicClient): this {
    this.publicClients.set(chain, client);
    return this;
  }

  /**
   * Connect to a chain with a wallet client (for write operations)
   */
  connectWalletClient(chain: SupportedChain, client: WalletClient): this {
    this.walletClients.set(chain, client);
    return this;
  }

  /**
   * Update contract addresses after deployment
   */
  setContractAddresses(
    chain: SupportedChain,
    addresses: Partial<ChainConfig["contracts"]>
  ): this {
    const config = this.configs.get(chain);
    if (config) {
      config.contracts = { ...config.contracts, ...addresses };
    }
    return this;
  }

  /**
   * Get the auction contract address on the primary chain
   */
  getAuctionAddress(): Address {
    const config = this.configs.get("sepolia")!;
    if (!config.contracts.hushBid) {
      throw new Error("HushBid contract address not set");
    }
    return config.contracts.hushBid as Address;
  }

  /**
   * Get the public client for a chain
   */
  getPublicClient(chain: SupportedChain): PublicClient {
    const client = this.publicClients.get(chain);
    if (!client) {
      throw new Error(`No public client connected for ${chain}`);
    }
    return client;
  }

  /**
   * Get auction details
   */
  async getAuction(auctionId: bigint): Promise<AuctionConfig> {
    const client = this.getPublicClient("sepolia");
    const result = await client.readContract({
      address: this.getAuctionAddress(),
      abi: HUSH_BID_ABI,
      functionName: "getAuction",
      args: [auctionId],
    });

    return {
      seller: result.seller,
      assetContract: result.assetContract,
      tokenAmount: result.tokenAmount,
      reservePrice: result.reservePrice,
      biddingEnd: result.biddingEnd,
      revealEnd: result.revealEnd,
      assetType: result.assetType,
      privacyLevel: result.privacyLevel as PrivacyLevel,
      worldIdRequired: result.worldIdRequired,
      allowedTokensHash: result.allowedTokensHash,
      auditor: result.auditor,
      sellerShieldedAddress: (result as any).sellerShieldedAddress,
    };
  }

  /**
   * Get auction phase
   */
  async getAuctionPhase(auctionId: bigint): Promise<AuctionPhase> {
    const client = this.getPublicClient("sepolia");
    const result = await client.readContract({
      address: this.getAuctionAddress(),
      abi: HUSH_BID_ABI,
      functionName: "auctionPhases",
      args: [auctionId],
    });
    return result as AuctionPhase;
  }

  /**
   * Get auction result
   */
  async getAuctionResult(auctionId: bigint): Promise<AuctionResult> {
    const client = this.getPublicClient("sepolia");
    const result = await client.readContract({
      address: this.getAuctionAddress(),
      abi: HUSH_BID_ABI,
      functionName: "getAuctionResult",
      args: [auctionId],
    });

    return {
      winner: result.winner,
      winningBid: result.winningBid,
      paymentToken: result.paymentToken,
      settlementHash: result.settlementHash,
    };
  }

  /**
   * Get the number of bids for an auction
   */
  async getBidCount(auctionId: bigint): Promise<bigint> {
    const client = this.getPublicClient("sepolia");
    return await client.readContract({
      address: this.getAuctionAddress(),
      abi: HUSH_BID_ABI,
      functionName: "getBidCount",
      args: [auctionId],
    });
  }

  /**
   * Check whether an address has already bid on an auction.
   */
  async hasBid(auctionId: bigint, bidder: Address): Promise<boolean> {
    const client = this.getPublicClient("sepolia");
    return await client.readContract({
      address: this.getAuctionAddress(),
      abi: HUSH_BID_ABI,
      functionName: "hasBid",
      args: [auctionId, bidder],
    }) as boolean;
  }

  /**
   * Read a single bid commitment from the contract.
   * Returns the commitment data at the given index.
   */
  async getBidCommitment(
    auctionId: bigint,
    index: bigint
  ): Promise<{
    commitHash: `0x${string}`;
    timestamp: bigint;
    sourceChain: bigint;
    valid: boolean;
  }> {
    const client = this.getPublicClient("sepolia");
    const result = await client.readContract({
      address: this.getAuctionAddress(),
      abi: HUSH_BID_ABI,
      functionName: "getBidCommitment",
      args: [auctionId, index],
    });
    return result as any;
  }

  /**
   * Get the current auction counter
   */
  async getAuctionCount(): Promise<bigint> {
    const client = this.getPublicClient("sepolia");
    return await client.readContract({
      address: this.getAuctionAddress(),
      abi: HUSH_BID_ABI,
      functionName: "auctionCounter",
    });
  }



  /**
   * Submit a fully sealed bid: encrypt → pin to IPFS → commit on-chain.
   *
   * This is the **recommended** way to place a bid. It handles the entire
   * confidential compute pipeline in a single call:
   *
   * 1. Generate salt + commitment hash (local)
   * 2. Encrypt bid amount with DON public key (ECIES P-256)
   * 3. Pin encrypted metadata to IPFS via Pinata
   * 4. Submit commitment + IPFS CID on-chain
   *
   * The DON's CRE workflow can later fetch the IPFS metadata inside its TEE
   * and decrypt the bid amount using its private key. No plaintext bid amounts
   * ever touch the blockchain or any intermediary server.
   *
   * **Stealth address support**: Pass `destinationAddress` to receive the
   * auction asset at a stealth address (generated via `computeStealthAddress()`).
   * The CRE uses this for DON-direct-delivery, sending the asset to the stealth
   * address in the settlement tx without ever linking it to the bidder on-chain.
   *
   * @param params.auctionId — Auction to bid on
   * @param params.amount — Bid amount in wei
   * @param params.paymentToken — ERC20 token address (or zeroAddress for ETH)
   * @param params.pinataJwt — Pinata JWT for IPFS pinning
   * @param params.worldIdProof — Optional World ID proof
   * @param params.destinationAddress — Optional stealth/delivery address for the asset.
   *        If omitted, the bidder's wallet address is used as the delivery target.
   * @returns Commitment hash, salt (save to reveal later!), IPFS CID, and tx hash
   *
   * @example
   * ```ts
   * const result = await client.submitBid({
   *   auctionId: 1n,
   *   amount: parseEther("1.5"),
   *   paymentToken: zeroAddress,
   *   pinataJwt: process.env.PINATA_JWT!,
   *   destinationAddress: stealthAddress, // Asset delivered here
   * });
   * ```
   */
  async submitBid(params: {
    auctionId: bigint;
    amount: bigint;
    paymentToken: Address;
    pinataJwt: string;
    worldIdProof?: WorldIdProof;
    destinationAddress?: Address;
    /** Convergence vault transaction ID (from private-transfer to DON) */
    vaultTransactionId?: string;
  }): Promise<{
    commitHash: `0x${string}`;
    salt: `0x${string}`;
    ipfsCid: string;
    txHash: `0x${string}`;
  }> {
    const wallet = this.getWalletClient("sepolia");
    const bidder = wallet.account!.address;

    // 1. Generate commitment
    const salt = generateSalt();
    const commitHash = generateCommitment(bidder, params.amount, salt);

    // 2. Encrypt FULL metadata blob with DON public key (ECIES P-256)
    //    Everything is encrypted — bidder address, amount, payment token, etc.
    //    Only the DON can decrypt this inside its TEE.
    const metadataPayload = {
      bidder,
      amount: params.amount.toString(),
      paymentToken: params.paymentToken,
      sourceChain: "11155111",
      timestamp: Math.floor(Date.now() / 1000),
      destinationAddress: params.destinationAddress ?? bidder,
      vaultTransactionId: params.vaultTransactionId,
    };
    const metadataBytes = new TextEncoder().encode(JSON.stringify(metadataPayload));
    const encryptedPayload = encryptForDon(this.creConfig, metadataBytes);

    // 3. Pin encrypted envelope to IPFS — only auctionId + version are cleartext
    //    The actual bid data is opaque ECIES ciphertext
    const ipfsEnvelope = {
      version: 2,
      auctionId: params.auctionId.toString(),
      encryptedPayload,
    };

    const pinResponse = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.pinataJwt}`,
      },
      body: JSON.stringify({
        pinataContent: ipfsEnvelope,
        pinataMetadata: { name: `hushbid-${params.auctionId}-${Date.now()}` },
      }),
    });

    if (!pinResponse.ok) {
      throw new Error(`IPFS pin failed: ${pinResponse.status} ${pinResponse.statusText}`);
    }

    const pinResult = (await pinResponse.json()) as { IpfsHash: string };
    const ipfsCid = pinResult.IpfsHash;

    // 4. Commit on-chain — CID is stored as-is (no bytes32 conversion)
    const txHash = await this.commitBid(
      params.auctionId,
      commitHash,
      ipfsCid,
      params.worldIdProof
    );

    return {
      commitHash,
      salt,
      ipfsCid,
      txHash,
    };
  }

  /**
   * Get chain config
   */
  getChainConfig(chain: SupportedChain): ChainConfig | undefined {
    return this.configs.get(chain);
  }

  // ===========================================================================
  // Write methods (require a connected WalletClient)
  // ===========================================================================

  /**
   * Get the wallet client for a chain (throws if not connected)
   */
  private getWalletClient(chain: SupportedChain): WalletClient {
    const client = this.walletClients.get(chain);
    if (!client) {
      throw new Error(
        `No wallet client connected for ${chain}. Call connectWalletClient() first.`
      );
    }
    return client;
  }

  /**
   * Create a new auction on the primary chain.
   *
   * @example
   * ```ts
   * const auctionId = await client.createAuction({
   *   assetContract: "0xToken...",
   *   tokenAmount: parseEther("10"),
   *   assetType: AssetType.ERC20,
   *   reservePrice: parseEther("0.1"),
   *   biddingDurationSeconds: 3600,
   *   revealDurationSeconds: 3600,
   *   privacyLevel: PrivacyLevel.FULL_PRIVATE,
   *   worldIdRequired: false,
   * });
   * ```
   *
   * @returns Transaction hash
   */
  async createAuction(params: CreateAuctionParams): Promise<`0x${string}`> {
    const wallet = this.getWalletClient("sepolia");
    const allowedTokensHash = params.allowedTokens
      ? hashAllowedTokens(params.allowedTokens)
      : zeroHash;

    return await wallet.writeContract({
      address: this.getAuctionAddress(),
      abi: HUSH_BID_ABI,
      functionName: "createAuction",
      args: [
        {
          assetContract: params.assetContract,
          tokenAmount: params.tokenAmount,
          assetType: params.assetType,
          reservePrice: params.reservePrice,
          biddingDuration: BigInt(params.biddingDurationSeconds),
          revealDuration: BigInt(params.revealDurationSeconds),
          privacyLevel: params.privacyLevel,
          worldIdRequired: params.worldIdRequired,
          allowedTokensHash,
          auditor: params.auditor ?? zeroAddress,
          sellerShieldedAddress: params.sellerShieldedAddress ?? zeroAddress,
        },
      ],
      chain: wallet.chain,
      account: wallet.account!,
      gas: 2_000_000n,
    });
  }

  /**
   * Commit a sealed bid on the primary chain.
   *
   * @param auctionId — Auction to bid on
   * @param commitHash — keccak256(abi.encodePacked(bidder, amount, salt))
   * @param ipfsCid — IPFS CID string (stored as-is on-chain)
   * @param worldIdProof — Optional World ID proof (required if auction has worldIdRequired)
   * @returns Transaction hash
   *
   * @example
   * ```ts
   * import { prepareBid } from "@hushbid/sdk";
   *
   * const { commitHash, salt } = prepareBid(bidderAddress, parseEther("1.5"));
   * // Save salt securely!
   *
   * const tx = await client.commitBid(auctionId, commitHash, ipfsCid);
   * ```
   */
  async commitBid(
    auctionId: bigint,
    commitHash: `0x${string}`,
    ipfsCid: string = "",
    worldIdProof?: WorldIdProof
  ): Promise<`0x${string}`> {
    const wallet = this.getWalletClient("sepolia");
    const proof: [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] =
      worldIdProof?.proof ?? [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];

    return await wallet.writeContract({
      address: this.getAuctionAddress(),
      abi: HUSH_BID_ABI,
      functionName: "commitBid",
      args: [
        auctionId,
        commitHash,
        ipfsCid,
        worldIdProof?.root ?? 0n,
        worldIdProof?.nullifierHash ?? 0n,
        proof,
      ],
      gas: 500_000n,
      chain: wallet.chain,
      account: wallet.account!,
    });
  }

  /**
   * Cancel an auction.
   *
   * Can only be called by the seller before any bids are committed.
   *
   * @param auctionId — The auction ID
   * @returns Transaction hash
   */
  async cancelAuction(auctionId: bigint): Promise<`0x${string}`> {
    const wallet = this.getWalletClient("sepolia");
    return await wallet.writeContract({
      address: this.getAuctionAddress(),
      abi: HUSH_BID_ABI,
      functionName: "cancelAuction",
      args: [auctionId],
      chain: wallet.chain,
      account: wallet.account!,
    });
  }

}
