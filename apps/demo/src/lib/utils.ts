import { type Address } from 'viem';
import { 
  generateCommitment, 
  generateSalt,
  PrivacyLevel,
  AuctionPhase,
} from '@hushbid/sdk';
import { backupBidToIPFS, restoreBidFromIPFS, isPinataConfigured } from './ipfs-backup';

// Re-export SDK functions directly (SDK now uses viem-compatible 0x types)
export { generateSalt, generateCommitment };

/**
 * Store bid data locally and optionally backup to IPFS
 */
export async function storeBidLocally(
  auctionId: number,
  bidder: Address,
  amount: bigint,
  salt: `0x${string}`,
  paymentToken: Address
): Promise<{ ipfsCid?: string }> {
  const key = `hush-bid-${auctionId}-${bidder}`;
  const data = {
    auctionId,
    bidder,
    amount: amount.toString(),
    salt,
    paymentToken,
    timestamp: Date.now(),
  };
  localStorage.setItem(key, JSON.stringify(data));

  // Backup to IPFS if Pinata is configured
  let ipfsCid: string | undefined;
  if (isPinataConfigured()) {
    const result = await backupBidToIPFS(auctionId, bidder, amount, salt, paymentToken);
    if (result.success) {
      ipfsCid = result.cid;
    }
  }

  return { ipfsCid };
}

/**
 * Retrieve stored bid data
 * Tries localStorage first, then falls back to IPFS backup
 */
export async function getStoredBid(
  auctionId: number,
  bidder: Address
): Promise<{ amount: bigint; salt: `0x${string}`; paymentToken: Address } | null> {
  // Try localStorage first
  const key = `hush-bid-${auctionId}-${bidder}`;
  const data = localStorage.getItem(key);
  if (data) {
    const parsed = JSON.parse(data);
    return {
      amount: BigInt(parsed.amount),
      salt: parsed.salt,
      paymentToken: parsed.paymentToken,
    };
  }

  // Fall back to IPFS backup
  if (isPinataConfigured()) {
    const restored = await restoreBidFromIPFS(auctionId, bidder);
    if (restored) {
      // Re-save to localStorage for faster access
      localStorage.setItem(key, JSON.stringify({
        auctionId,
        bidder,
        amount: restored.amount.toString(),
        salt: restored.salt,
        paymentToken: restored.paymentToken,
        timestamp: Date.now(),
        restoredFromIPFS: true,
      }));
      return restored;
    }
  }

  return null;
}

/**
 * Format USD price (8 decimals) for display
 */
export function formatUsdPrice(price: bigint): string {
  const formatted = Number(price) / 1e8;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(formatted);
}

/**
 * Format ETH amount for display
 */
export function formatEth(wei: bigint): string {
  const eth = Number(wei) / 1e18;
  return `${eth.toFixed(4)} ETH`;
}

/**
 * Shorten address for display
 */
export function shortenAddress(address: Address): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Calculate time remaining for auction phase
 */
export function getTimeRemaining(endTimestamp: number): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
} {
  const now = Math.floor(Date.now() / 1000);
  const remaining = endTimestamp - now;
  
  if (remaining <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  }
  
  return {
    days: Math.floor(remaining / 86400),
    hours: Math.floor((remaining % 86400) / 3600),
    minutes: Math.floor((remaining % 3600) / 60),
    seconds: remaining % 60,
    expired: false,
  };
}

/**
 * Privacy level labels (from SDK enum)
 */
export const PRIVACY_LABELS: Record<PrivacyLevel, string> = {
  [PrivacyLevel.FULL_PRIVATE]: 'Full Private',
  [PrivacyLevel.AUDITABLE]: 'Auditable',
} as const;

/**
 * Auction phase labels (from SDK enum)
 */
export const PHASE_LABELS: Record<AuctionPhase, string> = {
  [AuctionPhase.CREATED]: 'Created',
  [AuctionPhase.BIDDING]: 'Bidding',
  [AuctionPhase.REVEAL]: 'Settlement Window',
  [AuctionPhase.SETTLING]: 'Settling',
  [AuctionPhase.SETTLED]: 'Settled',
  [AuctionPhase.COMPLETED]: 'Completed',
  [AuctionPhase.CANCELLED]: 'Cancelled',
} as const;

// Re-export SDK types for convenience
export { PrivacyLevel, AuctionPhase } from '@hushbid/sdk';
