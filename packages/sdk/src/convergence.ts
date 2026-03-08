/**
 * Convergence Token API Client for HushBid
 *
 * Wraps the Convergence 2026 Token API endpoints for private token transfers.
 * All endpoints use EIP-712 signatures for authentication.
 *
 * API: https://convergence2026-token-api.cldev.cloud
 * Vault: 0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13 (Ethereum Sepolia)
 *
 * Endpoints:
 *  - POST /balances         — Get vault balances for an address
 *  - POST /transactions     — Get transaction history
 *  - POST /private-transfer — Offchain private token transfer
 *  - POST /shielded-address — Generate a server-side shielded address
 *  - POST /withdraw         — Withdraw from vault to on-chain address
 */

import { type Address, type Hex } from "viem";

// =============================================================================
// Constants
// =============================================================================

export const CONVERGENCE_API_BASE = "https://convergence2026-token-api.cldev.cloud";

export const CONVERGENCE_VAULT_ADDRESS = "0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13" as Address;

/**
 * EIP-712 domain for all Convergence API requests.
 * Always uses Sepolia chainId (11155111) — the vault contract lives on Sepolia.
 */
export const CONVERGENCE_EIP712_DOMAIN = {
  name: "CompliantPrivateTokenDemo",
  version: "0.0.1",
  chainId: 11155111,
  verifyingContract: CONVERGENCE_VAULT_ADDRESS,
} as const;

/**
 * EIP-712 types used by the Convergence API.
 * Type names and field names MUST match the API exactly (see /docs).
 */
export const CONVERGENCE_EIP712_TYPES = {
  "Retrieve Balances": [
    { name: "account", type: "address" },
    { name: "timestamp", type: "uint256" },
  ] as { name: string; type: string }[],
  "List Transactions": [
    { name: "account", type: "address" },
    { name: "timestamp", type: "uint256" },
  ] as { name: string; type: string }[],
  "Private Token Transfer": [
    { name: "sender", type: "address" },
    { name: "recipient", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "flags", type: "string[]" },
    { name: "timestamp", type: "uint256" },
  ] as { name: string; type: string }[],
  "Generate Shielded Address": [
    { name: "account", type: "address" },
    { name: "timestamp", type: "uint256" },
  ] as { name: string; type: string }[],
  "Withdraw Tokens": [
    { name: "account", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "timestamp", type: "uint256" },
  ] as { name: string; type: string }[],
};

// =============================================================================
// Types
// =============================================================================

export interface ConvergenceConfig {
  apiEndpoint: string;
  vaultAddress: Address;
}

/** Build the EIP-712 domain with the given vault address. */
function convergenceDomain(config: ConvergenceConfig) {
  return {
    name: CONVERGENCE_EIP712_DOMAIN.name,
    version: CONVERGENCE_EIP712_DOMAIN.version,
    chainId: CONVERGENCE_EIP712_DOMAIN.chainId,
    verifyingContract: config.vaultAddress,
  };
}

export interface VaultBalance {
  token: Address;
  amount: string;
}

export interface VaultTransaction {
  id: string;
  type: "deposit" | "transfer" | "withdrawal";
  account?: Address;
  sender?: Address;
  recipient?: Address;
  token: Address;
  amount: string;
  tx_hash?: string;
  is_incoming?: boolean;
}

export interface PrivateTransferResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

export interface ShieldedAddressResult {
  shieldedAddress: Address;
}

export interface WithdrawResult {
  success: boolean;
  ticket?: string;
  deadline?: number;
  error?: string;
}

/**
 * Signer function — takes typed data and returns a signature.
 *
 * For browser wallets on Tenderly (chainId 99911155111), use
 * `createConvergenceSigner()` which bypasses viem's chain validation
 * since the EIP-712 domain must use Sepolia's chainId (11155111).
 */
export type EIP712Signer = (params: {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}) => Promise<Hex>;

/**
 * Create an EIP-712 signer that handles chain switching for Convergence.
 *
 * MetaMask validates that the EIP-712 domain's chainId matches the wallet's
 * active chain. Since the Convergence vault is on Sepolia (11155111) but the
 * wallet may be on a different chain (e.g. Tenderly 99911155111), this signer:
 *   1. Detects the current chain
 *   2. Switches to Sepolia if needed
 *   3. Signs the EIP-712 message
 *   4. Switches back to the original chain
 */
export function createConvergenceSigner(
  provider: { request: (args: { method: string; params: unknown[] }) => Promise<unknown> },
  account: Address,
): EIP712Signer {
  return async (params) => {
    const targetChainId = params.domain.chainId;
    const targetChainHex = `0x${targetChainId.toString(16)}`;

    // 1. Get current chain
    const currentChainHex = (await provider.request({
      method: "eth_chainId",
      params: [],
    })) as string;

    const needsSwitch = currentChainHex.toLowerCase() !== targetChainHex.toLowerCase();

    // 2. Switch to the domain's chain if needed
    if (needsSwitch) {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: targetChainHex }],
        });
      } catch (switchError: unknown) {
        // 4902 = chain not added — try adding Sepolia
        if (
          switchError &&
          typeof switchError === "object" &&
          "code" in switchError &&
          (switchError as { code: number }).code === 4902
        ) {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: targetChainHex,
                chainName: "Sepolia Testnet",
                nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                rpcUrls: ["https://rpc.sepolia.org"],
                blockExplorerUrls: ["https://sepolia.etherscan.io"],
              },
            ],
          });
        } else {
          throw switchError;
        }
      }
    }

    try {
      // 3. Build and sign the typed data
      const typedData = {
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
          ],
          ...params.types,
        },
        domain: params.domain,
        primaryType: params.primaryType,
        message: params.message,
      };
      const json = JSON.stringify(typedData, (_, v) =>
        typeof v === "bigint" ? `0x${v.toString(16)}` : v,
      );
      const signature = (await provider.request({
        method: "eth_signTypedData_v4",
        params: [account, json],
      })) as Hex;

      return signature;
    } finally {
      // 4. Switch back to the original chain
      if (needsSwitch) {
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: currentChainHex }],
          });
        } catch {
          // Best-effort switch back — don't fail the signing
          console.warn("Could not switch back to original chain", currentChainHex);
        }
      }
    }
  };
}

// =============================================================================
// Helper: current timestamp (seconds)
// =============================================================================

function now(): number {
  return Math.floor(Date.now() / 1000);
}

// =============================================================================
// API Client
// =============================================================================

/**
 * Get vault balances for an address.
 */
export async function getVaultBalances(
  account: Address,
  sign: EIP712Signer,
  config: ConvergenceConfig = { apiEndpoint: CONVERGENCE_API_BASE, vaultAddress: CONVERGENCE_VAULT_ADDRESS },
): Promise<VaultBalance[]> {
  const timestamp = now();
  const message = { account, timestamp: BigInt(timestamp) };

  const signature = await sign({
    domain: convergenceDomain(config),
    types: { "Retrieve Balances": CONVERGENCE_EIP712_TYPES["Retrieve Balances"] },
    primaryType: "Retrieve Balances",
    message: message as unknown as Record<string, unknown>,
  });

  const res = await fetch(
    `${config.apiEndpoint}/balances`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account, timestamp, auth: signature }),
    },
  );
  if (!res.ok) throw new Error(`Convergence /balances failed: ${res.status}`);
  const data = (await res.json()) as { balances: VaultBalance[] };
  return data.balances;
}

/**
 * Get transaction history for an address.
 */
export async function getVaultTransactions(
  account: Address,
  sign: EIP712Signer,
  config: ConvergenceConfig = { apiEndpoint: CONVERGENCE_API_BASE, vaultAddress: CONVERGENCE_VAULT_ADDRESS },
): Promise<VaultTransaction[]> {
  const timestamp = now();
  const message = { account, timestamp: BigInt(timestamp) };

  const signature = await sign({
    domain: convergenceDomain(config),
    types: { "List Transactions": CONVERGENCE_EIP712_TYPES["List Transactions"] },
    primaryType: "List Transactions",
    message: message as unknown as Record<string, unknown>,
  });

  const res = await fetch(
    `${config.apiEndpoint}/transactions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account, timestamp, auth: signature }),
    },
  );
  if (!res.ok) throw new Error(`Convergence /transactions failed: ${res.status}`);
  const data = (await res.json()) as { transactions: VaultTransaction[] };
  return data.transactions;
}

/**
 * Execute a private (offchain) token transfer within the vault.
 *
 * This is the core privacy primitive:
 *  - No on-chain transaction
 *  - No link between sender and recipient visible on the blockchain
 *  - Compliance-checked via ACE PolicyEngine
 *
 * Requirements:
 *  - Sender must have deposited tokens into the vault first
 *  - Signature must be fresh (timestamp within 5 minutes)
 *  - Both addresses must be registered / compliant
 */
export async function privateTransfer(
  from: Address,
  to: Address,
  token: Address,
  amount: bigint,
  sign: EIP712Signer,
  config: ConvergenceConfig = { apiEndpoint: CONVERGENCE_API_BASE, vaultAddress: CONVERGENCE_VAULT_ADDRESS },
): Promise<PrivateTransferResult> {
  const timestamp = now();
  const flags: string[] = [];
  const message = {
    sender: from,
    recipient: to,
    token,
    amount,
    flags,
    timestamp: BigInt(timestamp),
  };

  const signature = await sign({
    domain: convergenceDomain(config),
    types: { "Private Token Transfer": CONVERGENCE_EIP712_TYPES["Private Token Transfer"] },
    primaryType: "Private Token Transfer",
    message: message as unknown as Record<string, unknown>,
  });

  const res = await fetch(`${config.apiEndpoint}/private-transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      account: from,
      recipient: to,
      token,
      amount: amount.toString(),
      flags,
      timestamp,
      auth: signature,
    }),
  });

  const data = (await res.json()) as { transaction_id?: string; error?: string };
  if (!res.ok) {
    return { success: false, error: data.error || `HTTP ${res.status}` };
  }
  return { success: true, transactionId: data.transaction_id };
}

/**
 * Generate a server-side shielded address.
 *
 * Shielded addresses are 20-byte Ethereum-style addresses that
 * cannot be linked to the owner's real address. The Convergence
 * server maintains the mapping internally.
 */
export async function generateShieldedAddress(
  account: Address,
  sign: EIP712Signer,
  config: ConvergenceConfig = { apiEndpoint: CONVERGENCE_API_BASE, vaultAddress: CONVERGENCE_VAULT_ADDRESS },
): Promise<ShieldedAddressResult> {
  const timestamp = now();
  const message = { account, timestamp: BigInt(timestamp) };

  const signature = await sign({
    domain: convergenceDomain(config),
    types: { "Generate Shielded Address": CONVERGENCE_EIP712_TYPES["Generate Shielded Address"] },
    primaryType: "Generate Shielded Address",
    message: message as unknown as Record<string, unknown>,
  });

  const res = await fetch(`${config.apiEndpoint}/shielded-address`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      account,
      timestamp,
      auth: signature,
    }),
  });

  if (!res.ok) throw new Error(`Convergence /shielded-address failed: ${res.status}`);
  const data = (await res.json()) as { address: string };
  return { shieldedAddress: data.address as Address };
}

/**
 * Withdraw tokens from the vault to an on-chain address.
 */
export async function withdrawFromVault(
  account: Address,
  token: Address,
  amount: bigint,
  sign: EIP712Signer,
  config: ConvergenceConfig = { apiEndpoint: CONVERGENCE_API_BASE, vaultAddress: CONVERGENCE_VAULT_ADDRESS },
): Promise<WithdrawResult> {
  const timestamp = now();
  const message = {
    account,
    token,
    amount,
    timestamp: BigInt(timestamp),
  };

  const signature = await sign({
    domain: convergenceDomain(config),
    types: { "Withdraw Tokens": CONVERGENCE_EIP712_TYPES["Withdraw Tokens"] },
    primaryType: "Withdraw Tokens",
    message: message as unknown as Record<string, unknown>,
  });

  const res = await fetch(`${config.apiEndpoint}/withdraw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      account,
      token,
      amount: amount.toString(),
      timestamp,
      auth: signature,
    }),
  });

  const data = (await res.json()) as { ticket?: string; deadline?: number; error?: string };
  if (!res.ok) {
    return { success: false, error: data.error || `HTTP ${res.status}` };
  }
  return { success: true, ticket: data.ticket, deadline: data.deadline };
}

/**
 * ERC-20 ABI fragment for vault deposit (approve + deposit)
 */
export const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/**
 * Convergence Vault ABI fragment — matches the official contract at
 * 0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13 on Ethereum Sepolia.
 *
 * register(token, policyEngine) registers a TOKEN with its ACE PolicyEngine.
 * It is NOT user registration — it's first-come-first-served per token.
 * See: https://convergence2026-token-api.cldev.cloud/docs
 * See: https://github.com/smartcontractkit/Compliant-Private-Transfer-Demo/blob/main/script/05_RegisterVault.s.sol
 */
export const CONVERGENCE_VAULT_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "policyEngine", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "sPolicyEngines",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "sRegistrars",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "checkDepositAllowed",
    stateMutability: "view",
    inputs: [
      { name: "depositor", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawWithTicket",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "ticket", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "depositWithPermit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;
