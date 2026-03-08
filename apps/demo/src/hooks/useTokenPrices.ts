import { useState, useEffect, useCallback } from 'react';
import { useHushBidClient } from './useHushBidClient';
import { SUPPORTED_TOKENS } from '@hushbid/sdk';

const AGGREGATOR_V3_ABI = [
  {
    inputs: [],
    name: 'latestRoundData',
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Hook that fetches USD prices for all supported tokens via their
 * Chainlink price feeds on Ethereum Sepolia.
 *
 * Returns prices as 8-decimal bigints (same as Chainlink) and a
 * helper to compute the USD string for a given token + amount.
 */
export function useTokenPrices() {
  const client = useHushBidClient();
  const [prices, setPrices] = useState<Record<string, bigint>>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const pub = client.getPublicClient('sepolia');
      const newPrices: Record<string, bigint> = {};

      // Dedupe feeds — ETH and WETH share the same one
      const feedMap = new Map<string, string[]>();
      for (const [symbol, config] of Object.entries(SUPPORTED_TOKENS)) {
        const existing = feedMap.get(config.priceFeed) || [];
        existing.push(symbol);
        feedMap.set(config.priceFeed, existing);
      }

      // Read all feeds in parallel
      const entries = [...feedMap.entries()];
      const results = await Promise.allSettled(
        entries.map(([feed]) =>
          pub.readContract({
            address: feed as `0x${string}`,
            abi: AGGREGATOR_V3_ABI,
            functionName: 'latestRoundData',
          }),
        ),
      );

      results.forEach((res, idx) => {
        if (res.status === 'fulfilled') {
          const price = res.value[1]; // answer (int256, 8 decimals)
          for (const symbol of entries[idx][1]) {
            newPrices[symbol] = BigInt(price);
          }
        }
      });

      setPrices(newPrices);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Returns the USD-formatted value for a display-unit amount of a token,
   * e.g. getUsdValue('ETH', '1.5') → '$3,750.00'
   */
  const getUsdValue = useCallback(
    (symbol: string, amount: string): string | null => {
      const price = prices[symbol.toUpperCase()];
      if (!price || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) === 0) return null;
      const usdValue = (parseFloat(amount) * Number(price)) / 1e8;
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(usdValue);
    },
    [prices],
  );

  return { prices, loading, refresh, getUsdValue };
}
