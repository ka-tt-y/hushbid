import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { motion } from 'framer-motion';
import {
  History, CheckCircle, Clock, Users, Wallet, Hash, Shield, ExternalLink,
  Lock, EyeOff, Trophy, Gavel, XCircle, ChevronDown,
} from 'lucide-react';
import { formatEther } from 'viem';
import { AuctionPhase } from '@hushbid/sdk';
import { useHushBidClient } from '../hooks/useHushBidClient';
import { PRIVACY_LABELS, PHASE_LABELS, shortenAddress, PrivacyLevel } from '../lib/utils';

interface AuctionHistoryEntry {
  auctionId: number;
  seller: string;
  assetContract: string;
  tokenAmount: string;
  reservePrice: bigint;
  biddingEnd: number;
  revealEnd: number;
  privacyLevel: number;
  worldIdRequired: boolean;
  phase: number;
  bidCount: number;
  // settlement
  winner: string;
  winningBid: bigint;
  paymentToken: string;
  settlementHash: string;
}

const TOKEN_LABELS: Record<string, string> = {
  '0x7b79995e5f793a07bc00c21412e50ecae098e7f9': 'WETH',
  '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238': 'USDC',
  '0x0000000000000000000000000000000000000000': 'ETH',
};

function tokenLabel(addr: string): string {
  return TOKEN_LABELS[addr.toLowerCase()] || shortenAddress(addr as `0x${string}`);
}

function formatBidAmount(amount: bigint, token: string): string {
  const lower = token.toLowerCase();
  if (lower === '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238') {
    return `${(Number(amount) / 1e6).toFixed(4)} USDC`;
  }
  const eth = formatEther(amount);
  if (parseFloat(eth) < 0.0001 && amount > 0n) return `${amount.toString()} wei`;
  return `${parseFloat(eth).toFixed(6)} ${tokenLabel(token)}`;
}

function formatTimestamp(ts: number): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Read persisted tx hashes for a bid from localStorage */
function getTxLog(auctionId: number, bidder: string): { label: string; hash: string; isOnChain: boolean }[] {
  try {
    const key = `hush-bid-${auctionId}-${bidder}`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data.txHashes) ? data.txHashes : [];
  } catch { return []; }
}

export function HistoryPage() {
  const { isConnected, address } = useAccount();
  const client = useHushBidClient();
  const [entries, setEntries] = useState<AuctionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTxLogs, setExpandedTxLogs] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const count = await client.getAuctionCount();
        const all: AuctionHistoryEntry[] = [];

        for (let i = 1n; i <= count; i++) {
          const auction = await client.getAuction(i);
          const phase = await client.getAuctionPhase(i);
          const bidCount = await client.getBidCount(i);

          let winner = '', winningBid = 0n, paymentToken = '', settlementHash = '';
          if (phase >= AuctionPhase.SETTLED) {
            try {
              const result = await client.getAuctionResult(i);
              winner = result.winner;
              winningBid = result.winningBid;
              paymentToken = result.paymentToken;
              settlementHash = result.settlementHash;
            } catch { /* not settled yet */ }
          }

          all.push({
            auctionId: Number(i),
            seller: auction.seller,
            assetContract: auction.assetContract,
            tokenAmount: auction.tokenAmount.toString(),
            reservePrice: auction.reservePrice,
            biddingEnd: Number(auction.biddingEnd),
            revealEnd: Number(auction.revealEnd),
            privacyLevel: auction.privacyLevel,
            worldIdRequired: auction.worldIdRequired,
            phase,
            bidCount: Number(bidCount),
            winner,
            winningBid,
            paymentToken,
            settlementHash,
          });
        }

        if (!cancelled) setEntries(all.reverse()); // newest first
      } catch {
        // Contract not deployed yet
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [client, isConnected]);

  const settled = entries.filter(e => e.phase >= AuctionPhase.SETTLED);
  const active = entries.filter(e => e.phase < AuctionPhase.SETTLED && e.phase !== AuctionPhase.CANCELLED);
  const cancelled = entries.filter(e => e.phase === AuctionPhase.CANCELLED);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Auction History</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {settled.length} settled auction{settled.length !== 1 ? 's' : ''}
            {active.length > 0 && ` — ${active.length} still active`}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : settled.length > 0 ? (
        <div className="space-y-4">
          {settled.map((e, i) => {
            const isSettled = e.phase >= AuctionPhase.SETTLED;
            const isCancelled = e.phase === AuctionPhase.CANCELLED;
            const reserveEth = formatEther(e.reservePrice);
            const reserveDisplay = parseFloat(reserveEth) < 0.0001
              ? `${e.reservePrice.toString()} wei`
              : `${parseFloat(reserveEth).toFixed(6)} ETH`;
            const isFullPrivate = e.privacyLevel === PrivacyLevel.FULL_PRIVATE;
            const hasValidSettlement = e.settlementHash && e.settlementHash !== '0x0000000000000000000000000000000000000000000000000000000000000000';
            const hasWinner = e.winner && e.winner !== '0x0000000000000000000000000000000000000000';

            return (
              <motion.div
                key={e.auctionId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="rounded-xl border border-zinc-800/50 overflow-hidden"
                style={{ backgroundColor: '#111113' }}
              >
                {/* Header */}
                <div className="px-5 py-3 border-b border-zinc-800/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isSettled ? 'bg-green-500/10 border border-green-500/20' :
                      isCancelled ? 'bg-red-500/10 border border-red-500/20' :
                      'bg-blue-500/10 border border-blue-500/20'
                    }`}>
                      {isSettled ? <Trophy className="w-4 h-4 text-green-400" /> :
                       isCancelled ? <XCircle className="w-4 h-4 text-red-400" /> :
                       <Gavel className="w-4 h-4 text-blue-400" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Auction #{e.auctionId}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded ${
                          isSettled ? 'bg-green-500/10 text-green-400' :
                          isCancelled ? 'bg-red-500/10 text-red-400' :
                          'bg-blue-500/10 text-blue-400'
                        }`}>
                          {PHASE_LABELS[e.phase as AuctionPhase] || 'Unknown'}
                        </span>
                        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-medium rounded ${
                          isFullPrivate ? 'bg-red-500/10 text-red-400' : 'bg-purple-500/10 text-purple-400'
                        }`}>
                          {isFullPrivate ? <EyeOff className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                          {PRIVACY_LABELS[e.privacyLevel as PrivacyLevel]}
                        </span>
                        {e.worldIdRequired && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-medium rounded bg-blue-500/10 text-blue-400">
                            <Shield className="w-2.5 h-2.5" /> World ID
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Details grid */}
                <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  {/* Seller */}
                  <div>
                    <p className="text-zinc-600 mb-0.5 flex items-center gap-1"><Wallet className="w-3 h-3" /> Seller</p>
                    <p className="text-white font-mono">Private</p>
                  </div>

                  {/* Asset */}
                  <div>
                    <p className="text-zinc-600 mb-0.5 flex items-center gap-1"><Hash className="w-3 h-3" /> Token</p>
                    <p className="text-white font-mono">
                      {shortenAddress(e.assetContract as `0x${string}`)} ×{e.tokenAmount}
                    </p>
                  </div>

                  {/* Reserve */}
                  <div>
                    <p className="text-zinc-600 mb-0.5">Reserve Price</p>
                    <p className="text-white font-mono">{reserveDisplay}</p>
                  </div>

                  {/* Bids */}
                  <div>
                    <p className="text-zinc-600 mb-0.5 flex items-center gap-1"><Users className="w-3 h-3" /> Bids</p>
                    <p className="text-white font-semibold">{e.bidCount}</p>
                  </div>

                  {/* Bidding window */}
                  <div>
                    <p className="text-zinc-600 mb-0.5 flex items-center gap-1"><Clock className="w-3 h-3" /> Bidding End</p>
                    <p className="text-white">{formatTimestamp(e.biddingEnd)}</p>
                  </div>

                  {/* Settlement window */}
                  <div>
                    <p className="text-zinc-600 mb-0.5 flex items-center gap-1"><Clock className="w-3 h-3" /> Settle After</p>
                    <p className="text-white">{formatTimestamp(e.revealEnd)}</p>
                  </div>

                  {/* Winner */}
                  {isSettled && (
                    <div>
                      <p className="text-zinc-600 mb-0.5 flex items-center gap-1"><Trophy className="w-3 h-3" /> Winner</p>
                      <p className="text-white font-mono">
                        {isFullPrivate ? (
                          <span className="text-zinc-500 italic">Private</span>
                        ) : hasWinner ? (
                          shortenAddress(e.winner as `0x${string}`)
                        ) : (
                          <span className="text-zinc-500">—</span>
                        )}
                      </p>
                    </div>
                  )}

                  {/* Winning bid */}
                  {isSettled && e.winningBid > 0n && (
                    <div>
                      <p className="text-zinc-600 mb-0.5">Winning Bid</p>
                      <p className="text-emerald-400 font-mono font-semibold">
                        {formatBidAmount(e.winningBid, e.paymentToken)}
                      </p>
                    </div>
                  )}
                </div>

                {/* Settlement proof footer */}
                {isSettled && hasValidSettlement && (
                  <div className="px-5 py-2.5 border-t border-zinc-800/50 flex items-center justify-between">
                    <span className="text-[10px] text-zinc-600 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      Settlement proof on-chain
                    </span>
                    <a
                      href={`https://sepolia.etherscan.io/tx/${e.settlementHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[10px] font-mono text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {e.settlementHash.slice(0, 10)}…{e.settlementHash.slice(-8)}
                    </a>
                  </div>
                )}

                {/* Per-user transaction log from localStorage */}
                {address && (() => {
                  const txLogs = getTxLog(e.auctionId, address);
                  if (txLogs.length === 0) return null;
                  const isExpanded = expandedTxLogs.has(e.auctionId);
                  return (
                    <div className="border-t border-zinc-800/50">
                      <button
                        onClick={() => setExpandedTxLogs(prev => {
                          const next = new Set(prev);
                          isExpanded ? next.delete(e.auctionId) : next.add(e.auctionId);
                          return next;
                        })}
                        className="w-full flex items-center justify-between px-5 py-2 text-[10px] text-zinc-500 hover:text-zinc-400 transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <ExternalLink className="w-3 h-3" />
                          🔗 Your Transaction Log ({txLogs.length})
                        </span>
                        <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                      {isExpanded && (
                        <div className="px-5 pb-3 space-y-1.5">
                          {txLogs.map((tx, j) => (
                            <div key={j} className="flex items-center justify-between text-[10px]">
                              <span className="text-zinc-500">{tx.label}</span>
                              {tx.isOnChain ? (
                                <a
                                  href={`https://sepolia.etherscan.io/tx/${tx.hash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-mono text-blue-400 hover:text-blue-300 transition-colors"
                                >
                                  {tx.hash.slice(0, 10)}…{tx.hash.slice(-6)}
                                </a>
                              ) : (
                                <span className="font-mono text-emerald-400" title="Convergence vault internal transfer (private)">
                                  🔒 {tx.hash.slice(0, 12)}…
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </motion.div>
            );
          })}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 rounded-xl border border-zinc-800/50"
          style={{ backgroundColor: '#111113' }}
        >
          <History className="w-12 h-12 text-zinc-600 mb-4" />
          <h3 className="text-lg font-medium text-white mb-1">No Settled Auctions Yet</h3>
          <p className="text-sm text-zinc-500">
            Settled auctions will appear here after the CRE agent processes them
          </p>
        </motion.div>
      )}
    </div>
  );
}
