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

// World ID configuration (IDKit v2 — no server-side signing needed)
export const WORLD_ID = {
  appId: import.meta.env.VITE_WORLD_ID_APP_ID || 'app_staging_7550bf79ac49e634e4eb502b94788a24',
  actionId: 'bid-verification',
};

