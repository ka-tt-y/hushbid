import { useState, useEffect } from 'react';
import { Lock, EyeOff, Shield, Users, Gavel, Timer, Hash, Wallet, ExternalLink, Trophy } from 'lucide-react';
import { formatEther } from 'viem';
import { getTimeRemaining, PRIVACY_LABELS, PHASE_LABELS, shortenAddress, PrivacyLevel, AuctionPhase } from '../lib/utils';

const ASSET_LABELS: Record<number, string> = {
  0: 'ERC-20',
};

interface Auction {
  id: number;
  seller: string;
  assetContract: string;
  tokenAmount: bigint;
  reservePrice: bigint;
  biddingEnd: number;
  revealEnd: number; // settlement window end (named revealEnd on-chain)
  assetType?: number;
  privacyLevel: PrivacyLevel;
  worldIdRequired: boolean;
  phase: AuctionPhase;
  bidCount?: number;
  userHasBid?: boolean;
  // Settlement result (populated after settlement)
  settlementHash?: string;
  winningBid?: bigint;
  winner?: string;
}

interface AuctionCardProps {
  auction: Auction;
  onBid: (auctionId: number) => void;
  currentUser?: string;
}

export function AuctionCard({ auction, onBid, currentUser }: AuctionCardProps) {
  const now = Math.floor(Date.now() / 1000);
  const biddingEnded = now > auction.biddingEnd;
  const revealEnded = now > auction.revealEnd;

  // Compute effective phase from timestamps (contract uses lazy phase transitions)
  const effectivePhase = (() => {
    if (auction.phase >= AuctionPhase.SETTLED) return auction.phase;
    if (auction.phase === AuctionPhase.CANCELLED) return auction.phase;
    if (revealEnded) return AuctionPhase.SETTLING;
    if (biddingEnded) return AuctionPhase.REVEAL;
    return AuctionPhase.BIDDING;
  })();

  const activeEndTime = effectivePhase === AuctionPhase.BIDDING
    ? auction.biddingEnd
    : auction.revealEnd;

  const [timeLeft, setTimeLeft] = useState(getTimeRemaining(activeEndTime));

  useEffect(() => {
    const timer = setInterval(() => {
      const endTime = effectivePhase === AuctionPhase.BIDDING
        ? auction.biddingEnd
        : auction.revealEnd;
      setTimeLeft(getTimeRemaining(endTime));
    }, 1000);
    return () => clearInterval(timer);
  }, [auction, effectivePhase]);

  const privacyConfig: Record<PrivacyLevel, { icon: React.ReactNode; color: string }> = {
    [PrivacyLevel.FULL_PRIVATE]: { icon: <EyeOff className="w-3 h-3" />, color: 'text-red-400 bg-red-500/10 border-red-500/20' },
    [PrivacyLevel.AUDITABLE]: { icon: <Lock className="w-3 h-3" />, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  };

  const phaseColors: Record<number, string> = {
    [AuctionPhase.BIDDING]: 'text-green-400 bg-green-500/10',
    [AuctionPhase.REVEAL]: 'text-amber-400 bg-amber-500/10',
    [AuctionPhase.SETTLING]: 'text-blue-400 bg-blue-500/10',
    [AuctionPhase.SETTLED]: 'text-zinc-400 bg-zinc-500/10',
    [AuctionPhase.COMPLETED]: 'text-zinc-500 bg-zinc-500/10',
    [AuctionPhase.CANCELLED]: 'text-red-400 bg-red-500/10',
  };

  const formatTime = () => {
    if (timeLeft.expired) return 'Ended';
    if (timeLeft.days > 0) return `${timeLeft.days}d ${timeLeft.hours}h`;
    if (timeLeft.hours > 0) return `${timeLeft.hours}h ${timeLeft.minutes}m`;
    return `${timeLeft.minutes}m ${timeLeft.seconds}s`;
  };

  const reserveEth = formatEther(auction.reservePrice);
  const reserveDisplay = parseFloat(reserveEth) < 0.0001
    ? `${auction.reservePrice.toString()} wei`
    : `${parseFloat(reserveEth).toFixed(4)} ETH`;

  const pCfg = privacyConfig[auction.privacyLevel];
  const isFullPrivate = auction.privacyLevel === PrivacyLevel.FULL_PRIVATE;

  const showBidButton = effectivePhase === AuctionPhase.BIDDING;
  const hasBids = (auction.bidCount ?? 0) > 0;
  const showWaitingForSettlement = effectivePhase === AuctionPhase.REVEAL && hasBids;
  const showNoBids = (effectivePhase === AuctionPhase.REVEAL || effectivePhase === AuctionPhase.SETTLING) && !hasBids;
  const showSettling = effectivePhase === AuctionPhase.SETTLING && hasBids;
  const showSettled = effectivePhase >= AuctionPhase.SETTLED;

  return (
    <div
      className="group rounded-xl border border-zinc-800/50 overflow-hidden transition-all hover:border-zinc-700/50"
      style={{ backgroundColor: '#111113' }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Hash className="w-3.5 h-3.5 text-zinc-600" />
          <span className="text-sm font-semibold text-white">Auction #{auction.id}</span>
        </div>
        <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${phaseColors[effectivePhase] || 'text-zinc-500 bg-zinc-800'}`}>
          {effectivePhase === AuctionPhase.SETTLING ? 'Awaiting Settlement' : PHASE_LABELS[effectivePhase] || 'Unknown'}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-md border ${pCfg.color}`}>
            {pCfg.icon}
            {PRIVACY_LABELS[auction.privacyLevel]}
          </span>
          {auction.assetType !== undefined && (
            <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-zinc-800 text-zinc-400 border border-zinc-700/50">
              {ASSET_LABELS[auction.assetType] || `Type ${auction.assetType}`}
            </span>
          )}
          {auction.worldIdRequired && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Shield className="w-3 h-3" /> World ID
            </span>
          )}
        </div>

        {/* Reserve + Bids */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Reserve</p>
            <p className="text-lg font-semibold text-white font-mono">{reserveDisplay}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Bids</p>
            <p className="text-lg font-semibold text-white flex items-center gap-1.5 justify-end">
              <Users className="w-4 h-4 text-zinc-500" />
              {auction.bidCount ?? 0}
            </p>
          </div>
        </div>

        {/* Seller */}
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Wallet className="w-3 h-3" />
          <span>Seller: Private</span>
        </div>

        {/* Timers */}
        <div className="grid grid-cols-2 gap-2">
          <div className={`p-2 rounded-lg ${effectivePhase === AuctionPhase.BIDDING ? 'bg-green-500/5 border border-green-500/10' : 'bg-zinc-900/50'}`}>
            <p className="text-[10px] text-zinc-600 mb-0.5">Bidding</p>
            <p className={`text-xs font-mono ${biddingEnded ? 'text-zinc-500' : 'text-green-400'}`}>
              {biddingEnded ? 'Closed' : formatTime()}
            </p>
          </div>
          <div className={`p-2 rounded-lg ${effectivePhase === AuctionPhase.REVEAL ? 'bg-amber-500/5 border border-amber-500/10' : 'bg-zinc-900/50'}`}>
            <p className="text-[10px] text-zinc-600 mb-0.5">Settle After</p>
            <p className={`text-xs font-mono ${revealEnded ? 'text-zinc-500' : biddingEnded ? 'text-amber-400' : 'text-zinc-600'}`}>
              {revealEnded ? 'Ready' : biddingEnded
                ? (() => { const r = getTimeRemaining(auction.revealEnd); return r.expired ? 'Ready' : r.hours > 0 ? `${r.hours}h ${r.minutes}m` : `${r.minutes}m ${r.seconds}s`; })()
                : 'After bidding'}
            </p>
          </div>
        </div>

        {/* User bid indicator */}
        {auction.userHasBid && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/5 border border-blue-500/10 text-xs text-blue-400">
            <Gavel className="w-3 h-3" />
            You placed a bid on this auction
          </div>
        )}

        {/* Actions */}
        {showBidButton && !auction.userHasBid && (
          <button
            onClick={() => onBid(auction.id)}
            className="w-full py-2.5 text-sm font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
          >
            Place Sealed Bid
          </button>
        )}
        {showBidButton && auction.userHasBid && (
          <div className="w-full py-2.5 text-xs font-medium rounded-lg bg-blue-500/5 border border-blue-500/10 text-blue-400 text-center flex items-center justify-center gap-2">
            <Gavel className="w-3.5 h-3.5" />
            Bid submitted — awaiting settlement
          </div>
        )}

        {showSettling && (
          <div className="w-full py-2.5 text-xs font-medium rounded-lg bg-blue-500/5 border border-blue-500/10 text-blue-400 text-center flex items-center justify-center gap-2">
            <Timer className="w-3.5 h-3.5 animate-spin" />
            Awaiting CRE settlement…
          </div>
        )}
        {showNoBids && (
          <div className="w-full py-2.5 text-xs font-medium rounded-lg bg-zinc-800/50 text-zinc-500 text-center">
            No bids received
          </div>
        )}
        {showSettled && (
          <div className="space-y-2">
            <div className="w-full py-2.5 text-xs font-medium rounded-lg bg-green-500/5 border border-green-500/10 text-green-400 text-center flex items-center justify-center gap-2">
              <Trophy className="w-3.5 h-3.5" />
              {PHASE_LABELS[effectivePhase] || 'Settled'}
            </div>

            {/* Personalized outcome for current user — phase-based (winner data is privacy-gated) */}
            {currentUser && (() => {
              const isSeller = auction.seller.toLowerCase() === currentUser.toLowerCase();
              const isBidder = auction.userHasBid;
              if (isSeller) {
                return (
                  <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-purple-400 space-y-1">
                    <p className="font-semibold">💰 Your auction has been settled</p>
                    <p className="text-purple-400/70">If a winning bid met the reserve, payment was privately transferred to your vault. Check your Convergence Vault for the proceeds.</p>
                  </div>
                );
              }
              if (isBidder) {
                return (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 space-y-1">
                    <p className="font-semibold">🔒 Auction settled — check your vault</p>
                    <p className="text-amber-400/70">If you won, the auctioned tokens were sent to your vault. If not, your bid funds were refunded. Check your Convergence Vault to see the outcome.</p>
                  </div>
                );
              }
              return null;
            })()}

            {/* Winner & winning bid (respects privacy level) */}
            {auction.winningBid != null && auction.winningBid > 0n && (
              <div className="p-2 rounded-lg bg-zinc-900/50 space-y-1">
                {!isFullPrivate && auction.winner && auction.winner !== '0x0000000000000000000000000000000000000000' && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">Winner</span>
                    <span className="text-white font-mono">{shortenAddress(auction.winner as `0x${string}`)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Winning Bid</span>
                  <span className="text-white font-mono">
                    {parseFloat(formatEther(auction.winningBid)) < 0.0001
                      ? `${auction.winningBid.toString()} wei`
                      : `${parseFloat(formatEther(auction.winningBid)).toFixed(4)} ETH`}
                  </span>
                </div>
              </div>
            )}

            {/* Settlement tx hash */}
            {auction.settlementHash && auction.settlementHash !== '0x0000000000000000000000000000000000000000000000000000000000000000' && (
              <a
                href={`https://sepolia.etherscan.io/tx/${auction.settlementHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 w-full py-1.5 text-[10px] font-mono text-blue-400 hover:text-blue-300 rounded-lg bg-blue-500/5 border border-blue-500/10 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                {auction.settlementHash.slice(0, 10)}…{auction.settlementHash.slice(-8)}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
