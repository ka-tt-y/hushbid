import { ChainConfig, SupportedChain } from "./types";

/**
 * Chain configuration — single-chain deployment on Ethereum Sepolia.
 *
 * All contracts and Convergence Vault are on this chain.
 * World ID v4 verifier address will be set once deployed.
 */
export const CHAIN_CONFIGS: Record<SupportedChain, ChainConfig> = {
  sepolia: {
    name: "Ethereum Sepolia",
    chainId: 11155111,
    rpcUrl: "https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY",
    isPrimary: true,
    contracts: {
      hushBid: "0x7fe88e9bc38085d53a11d7d311b0c48ce511efd3",
      worldIdVerifier: "",
      convergenceVault: "0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13",
    },
  },
};

/**
 * Get all supported chain names
 */
export function getSupportedChains(): SupportedChain[] {
  return Object.keys(CHAIN_CONFIGS) as SupportedChain[];
}

/**
 * Get chain config by chain ID or name
 */
export function getChainConfig(chainIdOrName: number | SupportedChain): ChainConfig | undefined {
  if (typeof chainIdOrName === "string") {
    return CHAIN_CONFIGS[chainIdOrName];
  }
  return Object.values(CHAIN_CONFIGS).find((c) => c.chainId === chainIdOrName);
}

/**
 * Check if chain is the primary auction chain
 */
export function isPrimaryChain(chainId: number): boolean {
  const config = getChainConfig(chainId);
  return config?.isPrimary ?? false;
}
