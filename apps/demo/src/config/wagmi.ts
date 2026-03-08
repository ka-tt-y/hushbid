import { http } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { defineChain } from 'viem';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { getContractAddresses, getChainlinkAddresses, getConvergenceAddresses } from './addresses';

/**
 * Ethereum Sepolia testnet.
 * Uses a custom RPC if provided via env, otherwise the default.
 */
const customRpc = import.meta.env.VITE_RPC_URL_SEPOLIA;

const activeChain = customRpc
  ? defineChain({
      ...sepolia,
      rpcUrls: { default: { http: [customRpc] } },
    })
  : sepolia;

const allChains = [activeChain] as const;

export const config = getDefaultConfig({
  appName: 'HushBid Protocol',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'demo-project-id',
  chains: allChains,
  transports: {
    [activeChain.id]: http(customRpc || undefined),
  },
});

/** The chain ID the app is configured to use */
export const ACTIVE_CHAIN_ID = activeChain.id;

// Get contract addresses from environment (centralized)
const contractAddresses = getContractAddresses();
const chainlinkAddresses = getChainlinkAddresses();
const convergenceAddresses = getConvergenceAddresses();

// Contract addresses — active chain
export const CONTRACTS = {
  [ACTIVE_CHAIN_ID]: {
    hushBid: contractAddresses.hushBid,
    priceNormalizer: contractAddresses.priceNormalizer,
    mockNFT: contractAddresses.mockNFT,
    convergenceVault: convergenceAddresses.vault,
  },
} as const;

// Chainlink Price Feed addresses
export const PRICE_FEEDS = {
  [ACTIVE_CHAIN_ID]: {
    ethUsd: chainlinkAddresses.priceFeedEthUsd,
    usdcUsd: chainlinkAddresses.priceFeedUsdcUsd,
  },
} as const;

// World ID v4 configuration (client-side only — signing key stays on server)
export const WORLD_ID = {
  appId: import.meta.env.VITE_WORLD_ID_APP_ID || 'app_9bf7f49b1cf8a9e6c0a90873574d9303',
  actionId: 'bid-verification',
  rpId: import.meta.env.VITE_WORLD_ID_RP_ID || 'rp_0fad302d2bcdf0ef',
};

