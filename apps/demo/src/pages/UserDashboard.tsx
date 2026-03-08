import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { AuctionCard, BidModal } from '../components';
import { useHushBidClient } from '../hooks/useHushBidClient';
import type { WorldIdProof } from '../components/WorldIdVerify';

/**
 * Decode World ID packed proof hex string into 8 uint256 values (Groth16 proof).
 * The proof is a single hex string encoding 8 × 32-byte (256-bit) values.
 */
function decodeWorldIdProof(proofHex: string): [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] {
  const hex = proofHex.startsWith('0x') ? proofHex.slice(2) : proofHex;
  const result: bigint[] = [];
  for (let i = 0; i < 8; i++) {
    result.push(BigInt('0x' + hex.slice(i * 64, (i + 1) * 64)));
  }
  return result as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
}

/** Local type for auction display data (derived from SDK reads) */
interface AuctionData {
  id: number;
  seller: string;
  assetContract: string;
  tokenAmount: string;
  reservePrice: string;
  biddingEnd: number;
  revealEnd: number;
  assetType: number;
  privacyLevel: number;
  worldIdRequired: boolean;
  phase: number;
  bidCount: number;
  userHasBid: boolean;
  // Settlement result fields
  settlementHash?: string;
  winningBid?: string;
  winner?: string;
}

export function UserDashboard() {
  const { isConnected, address } = useAccount();
  const client = useHushBidClient();
  const [selectedAuction, setSelectedAuction] = useState<number | null>(null);
  const [auctions, setAuctions] = useState<AuctionData[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Load auctions directly from chain via SDK ──
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const count = await client.getAuctionCount();

      const liveAuctions: AuctionData[] = [];
      // Read the last 10 auctions (or all if fewer)
      const start = count > 10n ? count - 10n : 1n;
      for (let i = start; i <= count; i++) {
        const auction = await client.getAuction(i);
        const phase = await client.getAuctionPhase(i);
        const bidCount = await client.getBidCount(i);
        // On-chain duplicate bid check
        let userHasBid = false;
        if (address) {
          try {
            userHasBid = await client.hasBid(i, address);
          } catch { /* contract may not support hasBid yet */ }
        }

        // Load settlement result for settled auctions
        let settlementHash: string | undefined;
        let winningBid: string | undefined;
        let winner: string | undefined;
        if (phase >= 4) { // AuctionPhase.SETTLED
          try {
            const result = await client.getAuctionResult(i);
            settlementHash = result.settlementHash;
            winningBid = result.winningBid.toString();
            winner = result.winner;
          } catch { /* settlement result not available yet */ }
        }

        liveAuctions.push({
          id: Number(i),
          seller: auction.seller,
          assetContract: auction.assetContract,
          tokenAmount: auction.tokenAmount.toString(),
          reservePrice: auction.reservePrice.toString(),
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
        });
      }
      setAuctions(liveAuctions);
    } catch (err) {
      console.warn('Could not load auctions from contract:', err);
    } finally {
      setLoading(false);
    }
  }, [client, address]);

  useEffect(() => {
    if (!isConnected) return;
    load();
  }, [load, isConnected]);

  // ── Auto-refresh every 60s when any auction is past its bidding/reveal window ──
  // This catches settlement by the CRE agent without requiring manual refresh
  useEffect(() => {
    const now = Math.floor(Date.now() / 1000);
    const hasSettleable = auctions.some(a =>
      a.phase < 4 && a.revealEnd < now // past reveal window but not yet settled
    );
    if (!hasSettleable) return;

    const interval = setInterval(() => {
      console.log('[auto-refresh] Checking for settlement updates…');
      load();
    }, 60_000);
    return () => clearInterval(interval);
  }, [auctions, load]);



  const handleBid = (auctionId: number) => setSelectedAuction(auctionId);

  /**
   * Commit a bid using HushBidClient.commitBid()
   *
   * The BidModal generates the commitment hash and optional World ID proof,
   * then passes them here. We also receive the IPFS CID from the modal's
   * storeBidLocally() call via the second param.
   */
  const handleBidSubmit = async (
    commitment: `0x${string}`,
    ipfsCid: string,
    proof?: WorldIdProof
  ): Promise<string> => {
    if (!address) throw new Error('Not connected');
    try {
      // Convert WorldIdProof → SDK WorldIdProof for the contract.
      // Device proofs are verified off-chain via the World ID cloud API
      // (see WorldIdVerify.tsx handleVerify). On-chain we pass root=0 to
      // skip the WorldIDRouter.verifyProof call (which only supports Orb).
      // Orb proofs pass the real root for full on-chain verification.
      const isOrbProof = proof?.verification_level === 'orb';
      const worldIdProof = proof
        ? {
            root: isOrbProof ? BigInt(proof.merkle_root) : 0n,
            nullifierHash: BigInt(proof.nullifier_hash),
            proof: isOrbProof
              ? decodeWorldIdProof(proof.proof)
              : [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n] as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
          }
        : undefined;

      const tx = await client.commitBid(
        BigInt(selectedAuction!),
        commitment,
        ipfsCid,
        worldIdProof
      );

      console.log('Bid committed:', tx);
      return tx; // Return tx hash to BidModal for tx log persistence
    } catch (err: any) {
      console.error('On-chain commit failed:', err);
      throw err; // Let BidModal handle the error display
    }
  };

  const selectedAuctionData = auctions.find(a => a.id === selectedAuction);

  // Derive stats from live data
  const activeCount = auctions.filter(a => a.phase < 4).length;
  const settledCount = auctions.filter(a => a.phase >= 4).length;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Live Auctions</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {auctions.length} auction{auctions.length !== 1 ? 's' : ''} — sealed bids, private settlement
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
            {activeCount} active
          </span>
          <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
            {settledCount} settled
          </span>
        </div>
      </div>

      {/* Auctions Grid */}
      {isConnected ? (
            loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : auctions.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-4">
              {auctions.map((auction, index) => (
                <motion.div
                  key={auction.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  whileHover={{ scale: 1.02 }}
                >
                  <AuctionCard
                    auction={{
                      ...auction,
                      tokenAmount: BigInt(auction.tokenAmount),
                      reservePrice: BigInt(auction.reservePrice),
                      userHasBid: auction.userHasBid,
                      settlementHash: auction.settlementHash,
                      winningBid: auction.winningBid ? BigInt(auction.winningBid) : undefined,
                      winner: auction.winner,
                    }}
                    onBid={handleBid}
                    currentUser={address}
                  />
                </motion.div>
              ))}
            </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-zinc-800/50" style={{ backgroundColor: '#111113' }}>
                <p className="text-zinc-400">No auctions yet. Create one from the Admin page.</p>
              </div>
            )
          ) : (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center justify-center py-16 rounded-xl border border-zinc-800/50"
              style={{ backgroundColor: '#111113' }}
            >
              <motion.div 
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-4"
              >
                <Lock className="w-5 h-5 text-zinc-500" />
              </motion.div>
              <p className="text-zinc-400 mb-4">Connect wallet to view auctions</p>
              <ConnectButton />
            </motion.div>
          )}

      {/* Bid Modal */}
      {selectedAuction && selectedAuctionData && (
        <BidModal
          auctionId={selectedAuction}
          biddingEnd={selectedAuctionData.biddingEnd}
          privacyLevel={selectedAuctionData.privacyLevel}
          worldIdRequired={selectedAuctionData.worldIdRequired}
          onClose={() => setSelectedAuction(null)}
          onSubmit={handleBidSubmit}
        />
      )}
    </>
  );
}
