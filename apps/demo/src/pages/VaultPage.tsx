import { useAccount } from 'wagmi';
import { motion } from 'framer-motion';
import { ShieldCheck, Lock } from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { VaultPanel } from '../components';

export function VaultPage() {
  const { isConnected } = useAccount();

  if (!isConnected) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-24"
      >
        <Lock className="w-12 h-12 text-zinc-600 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Privacy Vault</h2>
        <p className="text-zinc-500 mb-6">Connect your wallet to view your shielded balances</p>
        <ConnectButton />
      </motion.div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Privacy Vault</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Your shielded token balances in the Convergence vault
        </p>
      </div>

      {/* Explainer */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 p-4 rounded-xl border border-zinc-800/50"
        style={{ backgroundColor: '#111113' }}
      >
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
          <div className="space-y-1.5 text-xs text-zinc-400 leading-relaxed">
            <p>
              The <strong className="text-zinc-200">Convergence Privacy Vault</strong> shields your bid
              payments from on-chain observers. When you place a bid, tokens are deposited into the vault
              where they become invisible — deposits can't be correlated with bidder addresses.
            </p>
            <p>
              After settlement, <strong className="text-zinc-200">refunds</strong> (losing bids) and{' '}
              <strong className="text-zinc-200">payments</strong> (winning bid to seller) appear here
              automatically. Use <strong className="text-zinc-200">Withdraw</strong> to move tokens back
              to your regular wallet.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Vault Balances */}
      <div className="max-w-xl">
        <VaultPanel />
      </div>
    </div>
  );
}
