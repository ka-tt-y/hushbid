import { useAccount } from 'wagmi';
import { motion } from 'framer-motion';
import { Plus, Lock } from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { CreateAuctionForm } from './AdminDashboard';

export function CreateAuctionPage() {
  const { isConnected } = useAccount();

  if (!isConnected) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-24"
      >
        <Plus className="w-12 h-12 text-zinc-600 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Create Auction</h2>
        <p className="text-zinc-500 mb-6">Connect your wallet to create a new auction</p>
        <ConnectButton />
      </motion.div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Create Auction</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Set up a new sealed-bid auction with privacy controls
        </p>
      </div>

      <div className="max-w-2xl">
        <CreateAuctionForm />
      </div>
    </div>
  );
}
