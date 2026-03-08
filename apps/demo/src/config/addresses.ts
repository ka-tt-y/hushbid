/**
 * Centralized contract addresses configuration
 *
 * All contract addresses should be read from environment variables.
 * Single-chain deployment on Ethereum Sepolia.
 */

import { type Address } from 'viem';

// =============================================================================
// CONTRACT ADDRESSES (from environment)
// =============================================================================

export interface ContractAddresses {
  hushBid: Address;
  priceNormalizer: Address;
  mockNFT: Address;
}

export interface ChainlinkAddresses {
  // Price Feeds (Ethereum Sepolia)
  priceFeedEthUsd: Address;
  priceFeedUsdcUsd: Address;
  priceFeedDaiUsd: Address;

  // World ID v4
  worldIdVerifier: Address;
}

export interface TokenAddresses {
  weth: Address;
  usdc: Address;
  dai: Address;
}

export interface ConvergenceAddresses {
  vault: Address;
  apiEndpoint: string;
  /** DON wallet address — bidders private-transfer funds here at bid time */
  donWallet: Address;
}

// Zero address for undeployed contracts
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

/**
 * Get deployed contract addresses from environment
 */
export function getContractAddresses(): ContractAddresses {
  return {
    hushBid: (import.meta.env.VITE_HUSH_BID_ADDRESS || ZERO_ADDRESS) as Address,
    priceNormalizer: (import.meta.env.VITE_PRICE_NORMALIZER_ADDRESS || ZERO_ADDRESS) as Address,
    mockNFT: (import.meta.env.VITE_MOCK_NFT_ADDRESS || ZERO_ADDRESS) as Address,
  };
}

/**
 * Get Chainlink infrastructure addresses (constant per network)
 */
export function getChainlinkAddresses(): ChainlinkAddresses {
  return {
    // Price Feeds (Ethereum Sepolia)
    priceFeedEthUsd: (import.meta.env.VITE_PRICE_FEED_ETH_USD || '0x694AA1769357215DE4FAC081bf1f309aDC325306') as Address,
    priceFeedUsdcUsd: (import.meta.env.VITE_PRICE_FEED_USDC_USD || '0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E') as Address,
    priceFeedDaiUsd: (import.meta.env.VITE_PRICE_FEED_DAI_USD || '0x14866185B1962B63C3Ea9E03Bc1da838bab34C19') as Address,

    // World ID v4 Verifier (set via env once deployed)
    worldIdVerifier: (import.meta.env.VITE_WORLD_ID_VERIFIER || ZERO_ADDRESS) as Address,
  };
}

/**
 * Get token addresses (Ethereum Sepolia)
 */
export function getTokenAddresses(): TokenAddresses {
  return {
    weth: (import.meta.env.VITE_WETH_SEPOLIA || '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9') as Address,
    usdc: (import.meta.env.VITE_USDC_SEPOLIA || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238') as Address,
    dai: (import.meta.env.VITE_DAI_SEPOLIA || '0x3e622317f8C93f7328350cF0B56d9eD4C620C5d6') as Address,
  };
}

/**
 * Get Convergence Token API addresses
 */
export function getConvergenceAddresses(): ConvergenceAddresses {
  return {
    vault: (import.meta.env.VITE_CONVERGENCE_VAULT || '0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13') as Address,
    apiEndpoint: import.meta.env.VITE_CONVERGENCE_API || '/convergence-api',
    donWallet: (import.meta.env.VITE_DON_WALLET_ADDRESS || '0xf4c38aF1cecdb2A85d2b25E1278993e8ae04C8DA') as Address,
  };
}

/**
 * Get CRE/DON configuration
 */
export function getCreConfig() {
  return {
    endpoint: import.meta.env.VITE_CRE_ENDPOINT || '',
    donPublicKey: import.meta.env.VITE_DON_PUBLIC_KEY || '',
  };
}

/**
 * Check if contracts are deployed
 */
export function areContractsDeployed(): boolean {
  const addresses = getContractAddresses();
  return addresses.hushBid !== ZERO_ADDRESS;
}
