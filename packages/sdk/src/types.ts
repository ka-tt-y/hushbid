/**
 * Asset types supported for escrow
 */
export enum AssetType {
  ERC20 = 0,          // Fungible token (private delivery via Convergence)
}

/**
 * Privacy levels for auction reveal policies
 */
export enum PrivacyLevel {
  FULL_PRIVATE = 0,   // Nothing revealed ever — DON settles via Confidential Compute
  AUDITABLE = 1,      // Hidden from public, readable by designated auditor + CRE
}

/**
 * Auction phases
 */
export enum AuctionPhase {
  CREATED = 0,
  BIDDING = 1,
  REVEAL = 2,
  SETTLING = 3,
  SETTLED = 4,
  COMPLETED = 5,
  CANCELLED = 6,
}

/**
 * Auction configuration
 */
export interface AuctionConfig {
  seller: string;
  assetContract: string;
  tokenAmount: bigint;
  reservePrice: bigint;
  biddingEnd: bigint;
  revealEnd: bigint;
  assetType: AssetType;
  privacyLevel: PrivacyLevel;
  worldIdRequired: boolean;
  allowedTokensHash: string;
  auditor: string;
  sellerShieldedAddress?: string;
}

/**
 * Bid commitment (sealed bid)
 */
export interface BidCommitment {
  commitHash: string;
  timestamp: bigint;
  sourceChain: bigint;
  valid: boolean;
}

/**
 * Auction result
 */
export interface AuctionResult {
  winner: string;
  winningBid: bigint;
  paymentToken: string;
  settlementHash: string;
}

/**
 * Supported chains — single-chain deployment on Ethereum Sepolia
 */
export type SupportedChain = "sepolia";

/**
 * Chain configuration
 */
export interface ChainConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  isPrimary: boolean;
  contracts: {
    hushBid?: string;
    worldIdVerifier?: string;
    convergenceVault?: string;
  };
}

/**
 * Create auction parameters
 */
export interface CreateAuctionParams {
  assetContract: `0x${string}`;
  tokenAmount: bigint;
  assetType: AssetType;
  reservePrice: bigint;
  biddingDurationSeconds: number;
  revealDurationSeconds: number;
  privacyLevel: PrivacyLevel;
  worldIdRequired: boolean;
  allowedTokens?: `0x${string}`[];
  auditor?: `0x${string}`;      // Required for AUDITABLE mode
  sellerShieldedAddress?: `0x${string}`; // Convergence shielded address for payment
}

/**
 * Submit bid parameters
 */
export interface SubmitBidParams {
  auctionId: bigint;
  amount: bigint;
  paymentToken: `0x${string}`;
  worldIdProof?: WorldIdProof;
}

/**
 * CRE / DON configuration for confidential HTTP
 */
export interface CreConfig {
  endpoint: string;
  /** Shared symmetric key (32-byte hex) for keccak256-CTR bid encryption */
  donPublicKey: string;
}

/**
 * World ID v3 proof
 */
export interface WorldIdProof {
  root: bigint;
  nullifierHash: bigint;
  proof: [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
}

/**
 * Bid commitment result (returned after submitting)
 */
export interface BidCommitmentResult {
  commitHash: `0x${string}`;
  salt: `0x${string}`; // Must be saved to reveal later
  txHash: string;
}
