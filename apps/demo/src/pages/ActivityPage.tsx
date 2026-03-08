import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { motion } from 'framer-motion';
import {
  User, Package, BarChart3, CheckCircle, Lock,
} from 'lucide-react';
import { AuctionPhase } from '@hushbid/sdk';
import { useHushBidClient } from '../hooks/useHushBidClient';
import { AuctionCard } from '../components';

interface ActivityAuction {
  id: number;
  seller: string;
  assetContract: string;
  tokenAmount: bigint;
  reservePrice: bigint;
  biddingEnd: number;
  revealEnd: number;
  assetType: number;
  privacyLevel: number;
  worldIdRequired: boolean;
  phase: number;
  bidCount: number;
  userHasBid: boolean;
  settlementHash?: string;
  winningBid?: bigint;
  winner?: string;
}

export function ActivityPage() {
  const { isConnected, address } = useAccount();
  const client = useHushBidClient();
  const [loading, setLoading] = useState(true);
  const [myBids, setMyBids] = useState<ActivityAuction[]>([]);
  const [myAuctions, setMyAuctions] = useState<ActivityAuction[]>([]);
  const [stats, setStats] = useState({ bidsPlaced: 0, auctionsCreated: 0, won: 0, settled: 0 });

  useEffect(() => {
    if (!client || !address) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const count = await client.getAuctionCount();
        const bids: ActivityAuction[] = [];
        const created: ActivityAuction[] = [];
        let wonCount = 0;
        let settledCount = 0;

        for (let i = 1n; i <= count; i++) {
          const auction = await client.getAuction(i);
          const phase = await client.getAuctionPhase(i);
          const bidCount = await client.getBidCount(i);

          let userHasBid = false;
          try {
            userHasBid = await client.hasBid(i, address);
          } catch { /* ignore */ }

          let settlementHash: string | undefined;
          let winningBid: bigint | undefined;
          let winner: string | undefined;
          if (phase >= AuctionPhase.SETTLED) {
            settledCount++;
            try {
              const result = await client.getAuctionResult(i);
              settlementHash = result.settlementHash;
              winningBid = result.winningBid;
              winner = result.winner;
              if (winner?.toLowerCase() === address.toLowerCase()) wonCount++;
            } catch { /* not available */ }
          }

          const entry: ActivityAuction = {
            id: Number(i),
            seller: auction.seller,
            assetContract: auction.assetContract,
            tokenAmount: auction.tokenAmount,
            reservePrice: auction.reservePrice,
            biddingEnd: Number(auction.biddingEnd),
            revealEnd: Number(auction.revealEnd),
            assetType: auction.assetType,
            privacyLevel: auction.privacyLevel,
            worldIdRequired: auction.worldIdRequired,
            phase,
            bidCount: Number(bidCount),
            userHasBid,
            settlementHash,
            winningBid,
            winner,
          };

          if (userHasBid) bids.push(entry);
          if (auction.seller.toLowerCase() === address.toLowerCase()) created.push(entry);
        }

        if (!cancelled) {
          setMyBids(bids);
          setMyAuctions(created);
          setStats({
            bidsPlaced: bids.length,
            auctionsCreated: created.length,
            won: wonCount,
            settled: settledCount,
          });
        }
      } catch (err) {
        console.warn('Activity load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [client, address]);

  if (!isConnected) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-24"
      >
        <User className="w-12 h-12 text-zinc-600 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">My Activity</h2>
        <p className="text-zinc-500 mb-6">Connect your wallet to see your bids and auctions</p>
        <ConnectButton />
      </motion.div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">My Activity</h1>
        <p className="text-sm text-zinc-500 mt-1">Your bids and auctions</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Bids Placed', value: stats.bidsPlaced, icon: BarChart3, color: 'blue' },
          { label: 'Auctions Created', value: stats.auctionsCreated, icon: Package, color: 'purple' },
          { label: 'Won', value: stats.won, icon: CheckCircle, color: 'emerald' },
          { label: 'Total Settled', value: stats.settled, icon: CheckCircle, color: 'zinc' },
        ].map(({ label, value, icon: Icon, color }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-4 rounded-xl border border-zinc-800/50"
            style={{ backgroundColor: '#111113' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 text-${color}-400`} />
              <span className="text-xs text-zinc-500">{label}</span>
            </div>
            <p className="text-xl font-semibold text-white">{value}</p>
          </motion.div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* My Bids */}
          {myBids.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                <h2 className="text-lg font-semibold text-white">My Bids</h2>
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {myBids.length}
                </span>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {myBids.map((auction, i) => (
                  <motion.div
                    key={`bid-${auction.id}`}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                  >
                    <AuctionCard
                      auction={auction}
                      onBid={() => {}}
                      currentUser={address}
                    />
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* My Auctions */}
          {myAuctions.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <Package className="w-4 h-4 text-purple-400" />
                <h2 className="text-lg font-semibold text-white">My Auctions</h2>
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  {myAuctions.length}
                </span>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {myAuctions.map((auction, i) => (
                  <motion.div
                    key={`created-${auction.id}`}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                  >
                    <AuctionCard
                      auction={auction}
                      onBid={() => {}}
                      currentUser={address}
                    />
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {myBids.length === 0 && myAuctions.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-16 rounded-xl border border-zinc-800/50"
              style={{ backgroundColor: '#111113' }}
            >
              <Lock className="w-10 h-10 text-zinc-600 mb-3" />
              <p className="text-zinc-400 mb-1">No activity yet</p>
              <p className="text-xs text-zinc-600">Place a bid or create an auction to get started</p>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
