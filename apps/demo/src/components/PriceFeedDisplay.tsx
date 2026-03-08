import { RefreshCw } from 'lucide-react';
import { formatUsdPrice } from '../lib/utils';

interface PriceFeedDisplayProps {
  ethPrice: bigint | undefined;
  usdcPrice: bigint | undefined;
  isLoading: boolean;
  onRefresh: () => void;
}

export function PriceFeedDisplay({ ethPrice, usdcPrice, isLoading, onRefresh }: PriceFeedDisplayProps) {
  return (
    <div 
      className="p-5 rounded-xl border border-zinc-800/50"
      style={{ backgroundColor: '#111113' }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-white">Price Feeds</h3>
          <p className="text-xs text-zinc-500">Chainlink Data Feeds</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 text-zinc-400 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-3">
        {/* ETH/USD */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <span className="text-sm font-bold text-blue-400">Ξ</span>
            </div>
            <div>
              <p className="text-sm font-medium text-white">ETH / USD</p>
              <p className="text-xs text-zinc-500">Ethereum</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-white font-mono">
              {ethPrice ? formatUsdPrice(ethPrice) : '—'}
            </p>
            <p className="text-xs text-zinc-500">Live</p>
          </div>
        </div>

        {/* USDC/USD */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
              <span className="text-sm font-bold text-green-400">$</span>
            </div>
            <div>
              <p className="text-sm font-medium text-white">USDC / USD</p>
              <p className="text-xs text-zinc-500">USD Coin</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-white font-mono">
              {usdcPrice ? formatUsdPrice(usdcPrice) : '—'}
            </p>
            <p className="text-xs text-zinc-500">Live</p>
          </div>
        </div>
      </div>

      <p className="text-xs text-zinc-600 mt-4 text-center">
        Used for multi-token bid normalization
      </p>
    </div>
  );
}
