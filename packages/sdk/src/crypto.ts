import { encodePacked, keccak256, encodeAbiParameters, parseAbiParameters } from "viem";

/**
 * Generate a bid commitment hash
 * Matches Solidity: keccak256(abi.encodePacked(bidder, amount, salt))
 *
 * @param bidder The bidder's address
 * @param amount The bid amount in wei
 * @param salt Random salt for hiding the bid (32 bytes hex)
 * @returns The commitment hash (0x-prefixed)
 */
export function generateCommitment(
  bidder: `0x${string}`,
  amount: bigint,
  salt: `0x${string}`
): `0x${string}` {
  return keccak256(
    encodePacked(
      ["address", "uint256", "bytes32"],
      [bidder, amount, salt]
    )
  );
}

/**
 * Verify a bid commitment matches the reveal data
 */
export function verifyCommitment(
  commitHash: `0x${string}`,
  bidder: `0x${string}`,
  amount: bigint,
  salt: `0x${string}`
): boolean {
  const computed = generateCommitment(bidder, amount, salt);
  return computed.toLowerCase() === commitHash.toLowerCase();
}

/**
 * Generate a random salt for bid commitment
 * @returns A 32-byte hex string (0x-prefixed)
 */
export function generateSalt(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Hash allowed tokens for auction creation
 */
export function hashAllowedTokens(tokens: `0x${string}`[]): `0x${string}` {
  if (tokens.length === 0) {
    return "0x0000000000000000000000000000000000000000000000000000000000000000";
  }

  // Sort tokens for deterministic hash
  const sorted = [...tokens].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );

  return keccak256(
    encodeAbiParameters(
      parseAbiParameters("address[]"),
      [sorted]
    )
  );
}
