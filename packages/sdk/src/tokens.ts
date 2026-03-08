/**
 * Supported tokens and their configurations on Ethereum Sepolia
 *
 * Each token needs:
 * - Address on Sepolia
 * - Chainlink price feed address (for normalization)
 * - Decimals
 */

import { SupportedChain } from "./types";

export interface TokenConfig {
  symbol: string;
  name: string;
  decimals: number;
  /** Chainlink price feed on Ethereum Sepolia */
  priceFeed: string;
  /** Token address per chain (address(0) = native token) */
  addresses: Partial<Record<SupportedChain, string>>;
}

/**
 * All supported tokens for bidding
 */
export const SUPPORTED_TOKENS: Record<string, TokenConfig> = {
  // ==========================================================================
  // NATIVE TOKENS
  // ==========================================================================
  ETH: {
    symbol: "ETH",
    name: "Ether",
    decimals: 18,
    priceFeed: "0x694AA1769357215DE4FAC081bf1f309aDC325306", // ETH/USD on Sepolia
    addresses: {
      sepolia: "0x0000000000000000000000000000000000000000",
    },
  },

  // ==========================================================================
  // WRAPPED TOKENS
  // ==========================================================================
  WETH: {
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    priceFeed: "0x694AA1769357215DE4FAC081bf1f309aDC325306", // Same as ETH
    addresses: {
      sepolia: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9",
    },
  },

  // ==========================================================================
  // STABLECOINS
  // ==========================================================================
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    priceFeed: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E", // USDC/USD on Sepolia
    addresses: {
      sepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    },
  },

  USDT: {
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    priceFeed: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E", // Use USDC feed (pegged)
    addresses: {
      sepolia: "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0",
    },
  },


  // ==========================================================================
  // OTHER TOKENS
  // ==========================================================================
  LINK: {
    symbol: "LINK",
    name: "Chainlink",
    decimals: 18,
    priceFeed: "0xc59E3633BAAC79493d908e63626716e204A45EdF", // LINK/USD on Sepolia
    addresses: {
      sepolia: "0x779877A7B0D9E8603169DdbD7836e478b4624789",
    },
  },
};

/**
 * Get token config by symbol
 */
export function getToken(symbol: string): TokenConfig | undefined {
  return SUPPORTED_TOKENS[symbol.toUpperCase()];
}

/**
 * Get token address on a specific chain
 */
export function getTokenAddress(symbol: string, chain: SupportedChain): string | undefined {
  const token = getToken(symbol);
  return token?.addresses[chain];
}

/**
 * Get all tokens available on a specific chain
 */
export function getTokensForChain(chain: SupportedChain): TokenConfig[] {
  return Object.values(SUPPORTED_TOKENS).filter(token => token.addresses[chain]);
}

/**
 * Get token symbols available on a specific chain
 */
export function getTokenSymbolsForChain(chain: SupportedChain): string[] {
  return Object.entries(SUPPORTED_TOKENS)
    .filter(([_, config]) => config.addresses[chain])
    .map(([symbol]) => symbol);
}

/**
 * Check if a token is a native token (ETH, MATIC, AVAX, etc.)
 */
export function isNativeToken(address: string): boolean {
  return address === "0x0000000000000000000000000000000000000000";
}

/**
 * Get all supported token symbols
 */
export function getAllTokenSymbols(): string[] {
  return Object.keys(SUPPORTED_TOKENS);
}
