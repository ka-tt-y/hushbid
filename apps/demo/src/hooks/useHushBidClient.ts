/**
 * React hook for accessing a shared HushBidClient instance.
 *
 * Initialises the client once and connects public/wallet clients
 * from wagmi whenever the connected chain or account changes.
 */

import { useMemo, useEffect, useRef } from "react";
import { usePublicClient, useWalletClient } from "wagmi";
import {
  HushBidClient,
  type SupportedChain,
} from "@hushbid/sdk";
import { getContractAddresses } from "../config/addresses";
import { getCreConfig } from "../config/addresses";

// Map wagmi chain IDs → SDK chain names
const CHAIN_ID_MAP: Record<number, SupportedChain> = {
  11155111: "sepolia",
};

/**
 * Returns a singleton HushBidClient configured with the current
 * wagmi public + wallet clients and deployed contract addresses.
 */
export function useHushBidClient(): HushBidClient {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const addresses = getContractAddresses();

  // Create the client once
  const clientRef = useRef<HushBidClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = new HushBidClient();
  }
  const client = clientRef.current;

  // Keep contract addresses in sync
  useMemo(() => {
    client.setContractAddresses("sepolia", {
      hushBid: addresses.hushBid,
    });

    // CRE config
    const cre = getCreConfig();
    client.configureCre(cre);
  }, [addresses]);

  // Connect public client
  useEffect(() => {
    if (publicClient) {
      const chainName = CHAIN_ID_MAP[publicClient.chain?.id ?? 0];
      if (chainName) {
        client.connectPublicClient(chainName, publicClient as any);
      }
    }
  }, [publicClient]);

  // Connect wallet client
  useEffect(() => {
    if (walletClient) {
      const chainName = CHAIN_ID_MAP[walletClient.chain?.id ?? 0];
      if (chainName) {
        client.connectWalletClient(chainName, walletClient as any);
      }
    }
  }, [walletClient]);

  return client;
}
