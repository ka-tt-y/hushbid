/**
 * High-level action helpers for HushBid Protocol
 *
 * These wrap the HushBidClient for common patterns.
 * The client itself uses viem — these helpers are thin wrappers
 * that generate salts, compute commitments, etc.
 */

import { generateCommitment, generateSalt, hashAllowedTokens } from "./crypto";


/**
 * Prepare a bid commitment locally (does NOT submit on-chain)
 *
 * Returns the commitment hash and salt. The caller is responsible
 * for submitting via wagmi/viem writeContract or the SDK client.
 *
 * @example
 * ```ts
 * const { commitHash, salt } = prepareBid("0xBidder...", parseEther("1.5"));
 * // Save salt securely! You need it to reveal later.
 * // Submit commitHash on-chain via writeContract
 * ```
 */
export function prepareBid(
  bidder: `0x${string}`,
  amount: bigint
): { commitHash: `0x${string}`; salt: `0x${string}` } {
  const salt = generateSalt();
  const commitHash = generateCommitment(bidder, amount, salt);
  return { commitHash, salt };
}

/**
 * Compute the allowed-tokens hash for auction creation
 */
export function computeAllowedTokensHash(
  tokens: `0x${string}`[]
): `0x${string}` {
  return hashAllowedTokens(tokens);
}

// Re-export for backwards compatibility
export { generateCommitment, generateSalt, hashAllowedTokens };
