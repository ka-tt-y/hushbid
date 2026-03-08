import { type Address } from 'viem';

// =============================================================================
// API Client — Connects frontend to the backend API
// =============================================================================

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error: ${res.status}`);
  }
  return res.json();
}

// =============================================================================
// Auctions
// =============================================================================

export interface AuctionData {
  id: number;
  seller: string;
  assetContract: string;
  tokenAmount: string;
  reservePrice: string;
  biddingEnd: number;
  revealEnd: number;
  privacyLevel: number;
  worldIdRequired: boolean;
  phase: number;
  bidCount: number;
  blockNumber?: number;
}

export interface AuctionDetail extends AuctionData {
  revealedBids: RevealedBid[];
}

export interface RevealedBid {
  bidder: string;
  amount: string;
  paymentToken: string;
  sourceChain: string;
}

export interface BidCommitment {
  auctionId: number;
  bidder: string;
  commitHash: string;
  sourceChain: string;
  blockNumber: number;
  transactionHash: string;
}

export async function fetchAuctions(): Promise<{ auctions: AuctionData[]; total: number }> {
  return apiFetch('/auctions');
}

export async function fetchAuction(id: number): Promise<AuctionDetail> {
  return apiFetch(`/auctions/${id}`);
}

export async function fetchAuctionBids(id: number): Promise<{ commitments: BidCommitment[]; total: number }> {
  return apiFetch(`/auctions/${id}/bids`);
}

// =============================================================================
// Bids / IPFS Backup
// =============================================================================

export interface EncryptedBidBackup {
  version: 2;
  auctionId: number;
  bidder: Address;
  encryptedData: string;
  iv: string;
  dataHash: string;
  timestamp: number;
}

export async function backupBid(
  auctionId: number,
  bidder: Address,
  encryptedPayload: EncryptedBidBackup
): Promise<{ success: boolean; cid?: string; error?: string }> {
  return apiFetch('/bids/backup', {
    method: 'POST',
    body: JSON.stringify({ auctionId, bidder, encryptedPayload }),
  });
}

export async function getBidBackup(cid: string): Promise<EncryptedBidBackup | null> {
  try {
    return await apiFetch(`/bids/backup/${cid}`);
  } catch {
    return null;
  }
}

// =============================================================================
// Settlement
// =============================================================================

export interface SettlementStatus {
  auctionId: number;
  phase: number;
  isSettled: boolean;
  phaseLabel: string;
  settlement: {
    winner: string;
    winningBid: string;
    paymentToken: string;
    blockNumber: number;
    transactionHash: string;
  } | null;
}

export async function fetchSettlementStatus(auctionId: number): Promise<SettlementStatus> {
  return apiFetch(`/settlement/${auctionId}`);
}

export async function fetchAllSettlements(): Promise<{ settlements: any[]; total: number }> {
  return apiFetch('/settlement');
}

// =============================================================================
// Health
// =============================================================================

export async function checkHealth(): Promise<{ status: string; uptime: number }> {
  return apiFetch('/health');
}
