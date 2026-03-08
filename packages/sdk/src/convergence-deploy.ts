/**
 * Convergence Token Deployment & Registration
 *
 * Ports of the 6 Foundry scripts from:
 *   https://github.com/smartcontractkit/Compliant-Private-Transfer-Demo/tree/main/script
 *
 * Flow (per the official demo):
 *   1. Deploy SimpleToken (ERC20 + ERC20Permit + Ownable)
 *   2. Deploy PolicyEngine (behind ERC1967Proxy, defaultAllow = true)
 *   3. Mint tokens to the deployer
 *   4. Approve the Vault to spend tokens
 *   5. Register the token + PolicyEngine on the Vault
 *   6. Deposit tokens into the Vault
 *
 * All functions accept standard viem WalletClient + PublicClient and return
 * transaction hashes / deployed addresses.
 */

import {
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  encodeAbiParameters,
  parseAbiParameters,
  encodeFunctionData,
  getContractAddress,
  zeroAddress,
} from "viem";

import { SIMPLE_TOKEN_ABI, SIMPLE_TOKEN_BYTECODE } from "./artifacts-simple-token";
import { POLICY_ENGINE_ABI, POLICY_ENGINE_BYTECODE } from "./artifacts-policy-engine";
import { ERC1967_PROXY_BYTECODE } from "./artifacts-proxy";
import { CONVERGENCE_VAULT_ABI, CONVERGENCE_VAULT_ADDRESS, ERC20_APPROVE_ABI } from "./convergence";

// Re-export artifacts for direct use
export { SIMPLE_TOKEN_ABI, SIMPLE_TOKEN_BYTECODE } from "./artifacts-simple-token";
export { POLICY_ENGINE_ABI, POLICY_ENGINE_BYTECODE } from "./artifacts-policy-engine";
export { ERC1967_PROXY_ABI, ERC1967_PROXY_BYTECODE } from "./artifacts-proxy";

// =============================================================================
// Types
// =============================================================================

export interface DeploySimpleTokenParams {
  name: string;
  symbol: string;
  owner?: Address; // defaults to walletClient.account
}

export interface DeploySimpleTokenResult {
  tokenAddress: Address;
  txHash: Hex;
}

export interface DeployPolicyEngineParams {
  owner?: Address; // defaults to walletClient.account
  defaultAllow?: boolean; // defaults to true (allow-all)
}

export interface DeployPolicyEngineResult {
  proxyAddress: Address;
  implAddress: Address;
  txHash: Hex; // proxy deploy tx
}

export interface MintTokensParams {
  token: Address;
  to?: Address; // defaults to walletClient.account
  amount: bigint;
}

export interface ApproveVaultParams {
  token: Address;
  amount?: bigint; // defaults to MaxUint256
  vault?: Address; // defaults to CONVERGENCE_VAULT_ADDRESS
}

export interface RegisterTokenOnVaultParams {
  token: Address;
  policyEngine: Address;
  vault?: Address; // defaults to CONVERGENCE_VAULT_ADDRESS
}

export interface DepositToVaultParams {
  token: Address;
  amount: bigint;
  vault?: Address; // defaults to CONVERGENCE_VAULT_ADDRESS
}

/** Callback for progress updates during multi-step setup. */
export type SetupStatusCallback = (step: number, total: number, message: string) => void;

export interface SetupNewTokenParams {
  /** Token name — the user chooses this (e.g. "My Auction Token") */
  name: string;
  /** Token symbol — the user chooses this (e.g. "MAT") */
  symbol: string;
  /** Amount to mint (in wei, 18 decimals) */
  mintAmount: bigint;
  /** Amount to deposit into the vault (in wei) */
  depositAmount: bigint;
  /** Vault address — defaults to CONVERGENCE_VAULT_ADDRESS */
  vault?: Address;
  /** Progress callback */
  onStatus?: SetupStatusCallback;
}

export interface SetupNewTokenResult {
  tokenAddress: Address;
  policyEngineProxy: Address;
  policyEngineImpl: Address;
  mintTxHash: Hex;
  approveTxHash: Hex;
  registerTxHash: Hex;
  depositTxHash: Hex;
}

// =============================================================================
// Helpers
// =============================================================================

function getAccount(walletClient: WalletClient): Address {
  const account = walletClient.account;
  if (!account) throw new Error("WalletClient has no account");
  return account.address;
}

function getChain(walletClient: WalletClient) {
  const chain = walletClient.chain;
  if (!chain) throw new Error("WalletClient has no chain configured");
  return chain;
}

/**
 * Deploy a contract via raw bytecode and wait for the receipt.
 * Returns the deployed contract address.
 */
async function deployContract(
  walletClient: WalletClient,
  publicClient: PublicClient,
  bytecode: Hex,
): Promise<{ address: Address; txHash: Hex }> {
  const account = getAccount(walletClient);
  const chain = getChain(walletClient);

  const txHash = await walletClient.sendTransaction({
    data: bytecode,
    chain,
    account: walletClient.account!,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status === "reverted") {
    throw new Error(`Contract deployment reverted (tx: ${txHash})`);
  }
  if (!receipt.contractAddress) {
    throw new Error(`No contract address in deployment receipt (tx: ${txHash})`);
  }

  return { address: receipt.contractAddress, txHash };
}

// =============================================================================
// Script 1: Deploy SimpleToken (01_DeployToken.s.sol)
// =============================================================================

/**
 * Deploy a new SimpleToken ERC-20 contract.
 *
 * Equivalent to `forge script script/01_DeployToken.s.sol:DeployToken`
 *
 * The token has:
 * - Custom name and symbol (user-defined)
 * - ERC-2612 permit support
 * - Owner-only mint function
 */
export async function deploySimpleToken(
  walletClient: WalletClient,
  publicClient: PublicClient,
  params: DeploySimpleTokenParams,
): Promise<DeploySimpleTokenResult> {
  const owner = params.owner ?? getAccount(walletClient);

  // Encode constructor arguments: (string name_, string symbol_, address initialOwner)
  const constructorArgs = encodeAbiParameters(
    parseAbiParameters("string, string, address"),
    [params.name, params.symbol, owner],
  );

  const deployBytecode = (SIMPLE_TOKEN_BYTECODE + constructorArgs.slice(2)) as Hex;
  const { address, txHash } = await deployContract(walletClient, publicClient, deployBytecode);

  return { tokenAddress: address, txHash };
}

// =============================================================================
// Script 2: Deploy PolicyEngine (02_DeployPolicyEngine.s.sol)
// =============================================================================

/**
 * Deploy a Chainlink ACE PolicyEngine behind an ERC1967 proxy.
 *
 * Equivalent to `forge script script/02_DeployPolicyEngine.s.sol:DeployPolicyEngine`
 *
 * Initializes with `defaultAllow = true` — all operations permitted by default
 * unless specific policies are attached to reject them.
 */
export async function deployPolicyEngine(
  walletClient: WalletClient,
  publicClient: PublicClient,
  params: DeployPolicyEngineParams = {},
): Promise<DeployPolicyEngineResult> {
  const owner = params.owner ?? getAccount(walletClient);
  const defaultAllow = params.defaultAllow ?? true;

  // Step 1: Deploy the PolicyEngine implementation
  const { address: implAddress, txHash: implTxHash } = await deployContract(
    walletClient,
    publicClient,
    POLICY_ENGINE_BYTECODE,
  );

  // Step 2: Encode initialization data: initialize(bool defaultAllow, address initialOwner)
  const initData = encodeFunctionData({
    abi: POLICY_ENGINE_ABI,
    functionName: "initialize",
    args: [defaultAllow, owner],
  });

  // Step 3: Deploy ERC1967Proxy pointing to the implementation with init data
  // Constructor: ERC1967Proxy(address implementation, bytes memory _data)
  const proxyConstructorArgs = encodeAbiParameters(
    parseAbiParameters("address, bytes"),
    [implAddress, initData],
  );

  const proxyBytecode = (ERC1967_PROXY_BYTECODE + proxyConstructorArgs.slice(2)) as Hex;
  const { address: proxyAddress, txHash } = await deployContract(
    walletClient,
    publicClient,
    proxyBytecode,
  );

  return { proxyAddress, implAddress, txHash };
}

// =============================================================================
// Script 3: Mint Tokens (03_MintTokens.s.sol)
// =============================================================================

/**
 * Mint tokens using the SimpleToken's owner-only mint function.
 *
 * Equivalent to `forge script script/03_MintTokens.s.sol:MintTokens`
 */
export async function mintTokens(
  walletClient: WalletClient,
  publicClient: PublicClient,
  params: MintTokensParams,
): Promise<Hex> {
  const to = params.to ?? getAccount(walletClient);
  const chain = getChain(walletClient);

  const txHash = await walletClient.writeContract({
    address: params.token,
    abi: SIMPLE_TOKEN_ABI,
    functionName: "mint",
    args: [to, params.amount],
    chain,
    account: walletClient.account!,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status === "reverted") {
    throw new Error(`Mint transaction reverted (tx: ${txHash})`);
  }

  return txHash;
}

// =============================================================================
// Script 4: Approve Vault (04_ApproveVault.s.sol)
// =============================================================================

const MAX_UINT256 = 2n ** 256n - 1n;

/**
 * Approve the Convergence Vault to spend tokens on behalf of the caller.
 *
 * Equivalent to `forge script script/04_ApproveVault.s.sol:ApproveVault`
 *
 * Defaults to max approval (type(uint256).max) like the demo.
 */
export async function approveVault(
  walletClient: WalletClient,
  publicClient: PublicClient,
  params: ApproveVaultParams,
): Promise<Hex> {
  const vault = params.vault ?? CONVERGENCE_VAULT_ADDRESS;
  const amount = params.amount ?? MAX_UINT256;
  const chain = getChain(walletClient);

  const txHash = await walletClient.writeContract({
    address: params.token,
    abi: ERC20_APPROVE_ABI,
    functionName: "approve",
    args: [vault, amount],
    chain,
    account: walletClient.account!,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status === "reverted") {
    throw new Error(`Approve transaction reverted (tx: ${txHash})`);
  }

  return txHash;
}

// =============================================================================
// Script 5: Register Token on Vault (05_RegisterVault.s.sol)
// =============================================================================

/**
 * Register a token and its PolicyEngine on the Convergence Vault.
 *
 * Equivalent to `forge script script/05_RegisterVault.s.sol:RegisterVault`
 *
 * This is a TOKEN registration — associates the token address with a
 * PolicyEngine for compliance enforcement. It is NOT user registration.
 * First-come-first-served: only the original registrar can update.
 *
 * Must be called BEFORE any deposits of this token can succeed.
 */
export async function registerTokenOnVault(
  walletClient: WalletClient,
  publicClient: PublicClient,
  params: RegisterTokenOnVaultParams,
): Promise<Hex> {
  const vault = params.vault ?? CONVERGENCE_VAULT_ADDRESS;
  const chain = getChain(walletClient);

  const txHash = await walletClient.writeContract({
    address: vault,
    abi: CONVERGENCE_VAULT_ABI,
    functionName: "register",
    args: [params.token, params.policyEngine],
    chain,
    account: walletClient.account!,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status === "reverted") {
    throw new Error(`Register transaction reverted (tx: ${txHash}). Token may already be registered by another address.`);
  }

  return txHash;
}

// =============================================================================
// Script 6: Deposit to Vault (06_DepositToVault.s.sol)
// =============================================================================

/**
 * Deposit tokens into the Convergence Vault.
 *
 * Equivalent to `forge script script/06_DepositToVault.s.sol:DepositToVault`
 *
 * Prerequisites:
 * - Token must be registered on the vault (via registerTokenOnVault)
 * - Caller must have approved the vault to spend their tokens
 * - PolicyEngine must allow the deposit
 */
export async function depositToVault(
  walletClient: WalletClient,
  publicClient: PublicClient,
  params: DepositToVaultParams,
): Promise<Hex> {
  const vault = params.vault ?? CONVERGENCE_VAULT_ADDRESS;
  const chain = getChain(walletClient);

  const txHash = await walletClient.writeContract({
    address: vault,
    abi: CONVERGENCE_VAULT_ABI,
    functionName: "deposit",
    args: [params.token, params.amount],
    chain,
    account: walletClient.account!,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status === "reverted") {
    throw new Error(
      "Vault deposit transaction reverted. " +
      "Ensure the token is registered on the vault and the PolicyEngine allows deposits.",
    );
  }

  return txHash;
}

// =============================================================================
// Vault Query Helpers
// =============================================================================

/**
 * Check if a token is registered on the Convergence Vault by reading its PolicyEngine.
 * Returns the PolicyEngine address, or zeroAddress if not registered.
 */
export async function getTokenPolicyEngine(
  publicClient: PublicClient,
  token: Address,
  vault: Address = CONVERGENCE_VAULT_ADDRESS,
): Promise<Address> {
  try {
    const policyEngine = await publicClient.readContract({
      address: vault,
      abi: CONVERGENCE_VAULT_ABI,
      functionName: "sPolicyEngines",
      args: [token],
    });
    return policyEngine as Address;
  } catch {
    return zeroAddress;
  }
}

/**
 * Check if a token is registered on the Convergence Vault.
 */
export async function isTokenRegistered(
  publicClient: PublicClient,
  token: Address,
  vault: Address = CONVERGENCE_VAULT_ADDRESS,
): Promise<boolean> {
  const pe = await getTokenPolicyEngine(publicClient, token, vault);
  return pe !== zeroAddress;
}

/**
 * Pre-flight check: can this depositor deposit this amount of this token?
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */
export async function checkDepositAllowed(
  publicClient: PublicClient,
  depositor: Address,
  token: Address,
  amount: bigint,
  vault: Address = CONVERGENCE_VAULT_ADDRESS,
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    await publicClient.readContract({
      address: vault,
      abi: CONVERGENCE_VAULT_ABI,
      functionName: "checkDepositAllowed",
      args: [depositor, token, amount],
    });
    return { allowed: true };
  } catch (err: any) {
    const reason = err?.shortMessage || err?.message || "Deposit not allowed by policy";
    return { allowed: false, reason };
  }
}

// =============================================================================
// All-in-One: Setup New Token (SetupAll.s.sol)
// =============================================================================

/**
 * All-in-one setup for a new auctionable token.
 *
 * Equivalent to `forge script script/SetupAll.s.sol:SetupAll`
 *
 * Executes all 6 steps in sequence:
 *   1. Deploy SimpleToken (ERC20)
 *   2. Deploy PolicyEngine (behind ERC1967 proxy, defaultAllow = true)
 *   3. Mint tokens to the deployer
 *   4. Approve Vault to spend tokens (max approval)
 *   5. Register token + PolicyEngine on Vault
 *   6. Deposit tokens into Vault
 *
 * After completion, the token is ready for private transfers via the
 * Convergence API.
 */
export async function setupNewToken(
  walletClient: WalletClient,
  publicClient: PublicClient,
  params: SetupNewTokenParams,
): Promise<SetupNewTokenResult> {
  const vault = params.vault ?? CONVERGENCE_VAULT_ADDRESS;
  const onStatus = params.onStatus ?? (() => {});

  // Step 1: Deploy SimpleToken
  onStatus(1, 6, `Deploying ${params.symbol} token — confirm in wallet...`);
  const { tokenAddress } = await deploySimpleToken(walletClient, publicClient, {
    name: params.name,
    symbol: params.symbol,
  });

  // Step 2: Deploy PolicyEngine (behind proxy)
  onStatus(2, 6, "Deploying PolicyEngine — confirm in wallet...");
  const { proxyAddress: policyEngineProxy, implAddress: policyEngineImpl } =
    await deployPolicyEngine(walletClient, publicClient);

  // Step 3: Mint tokens
  onStatus(3, 6, `Minting ${params.symbol} tokens — confirm in wallet...`);
  const mintTxHash = await mintTokens(walletClient, publicClient, {
    token: tokenAddress,
    amount: params.mintAmount,
  });

  // Step 4: Approve Vault
  onStatus(4, 6, "Approving Vault to spend tokens — confirm in wallet...");
  const approveTxHash = await approveVault(walletClient, publicClient, {
    token: tokenAddress,
    vault,
  });

  // Step 5: Register token + PolicyEngine on Vault
  onStatus(5, 6, "Registering token on Vault — confirm in wallet...");
  const registerTxHash = await registerTokenOnVault(walletClient, publicClient, {
    token: tokenAddress,
    policyEngine: policyEngineProxy,
    vault,
  });

  // Step 6: Deposit tokens into Vault
  onStatus(6, 6, "Depositing tokens into Vault — confirm in wallet...");
  const depositTxHash = await depositToVault(walletClient, publicClient, {
    token: tokenAddress,
    amount: params.depositAmount,
    vault,
  });

  return {
    tokenAddress,
    policyEngineProxy,
    policyEngineImpl,
    mintTxHash,
    approveTxHash,
    registerTxHash,
    depositTxHash,
  };
}
