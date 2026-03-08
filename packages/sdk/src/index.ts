/**
 * @hushbid/sdk
 * SDK for interacting with HushBid Protocol private auctions
 */

// Client & ABIs
export {
  HushBidClient,
  HUSH_BID_ABI,
  // CRE / Confidential HTTP
  isCreConfigured,
  submitBidToCre,
  encryptForDon,
  type BidSubmission,
  type BidSubmissionResponse,
} from "./client";

// Crypto utilities
export { generateCommitment, verifyCommitment, generateSalt, hashAllowedTokens } from "./crypto";

// Types
export {
  PrivacyLevel,
  AuctionPhase,
  AssetType,
  type AuctionConfig,
  type BidCommitment,
  type AuctionResult,
  type ChainConfig,
  type SupportedChain,
  type CreateAuctionParams,
  type SubmitBidParams,
  type BidCommitmentResult,
  type WorldIdProof,
  type CreConfig,
} from "./types";

// Chain configurations
export {
  CHAIN_CONFIGS,
  getChainConfig,
  isPrimaryChain,
  getSupportedChains,
} from "./chains";

// Token configurations
export {
  SUPPORTED_TOKENS,
  type TokenConfig,
  getToken,
  getTokenAddress,
  getTokensForChain,
  getTokenSymbolsForChain,
  isNativeToken,
  getAllTokenSymbols,
} from "./tokens";

// Convergence Token API (private payments)
export {
  CONVERGENCE_API_BASE,
  CONVERGENCE_VAULT_ADDRESS,
  CONVERGENCE_EIP712_DOMAIN,
  CONVERGENCE_EIP712_TYPES,
  CONVERGENCE_VAULT_ABI,
  ERC20_APPROVE_ABI,
  createConvergenceSigner,
  getVaultBalances,
  getVaultTransactions,
  privateTransfer,
  generateShieldedAddress,
  withdrawFromVault,
  type ConvergenceConfig,
  type VaultBalance,
  type VaultTransaction,
  type PrivateTransferResult,
  type ShieldedAddressResult,
  type WithdrawResult,
  type EIP712Signer,
} from "./convergence";

// Convergence Token Deployment & Registration
// Ports of the 6 Foundry scripts from the official Compliant-Private-Transfer-Demo
export {
  // Deploy functions (1-to-1 port of Foundry scripts)
  deploySimpleToken,
  deployPolicyEngine,
  mintTokens,
  approveVault,
  registerTokenOnVault,
  depositToVault,
  // All-in-one setup
  setupNewToken,
  // Vault query helpers
  getTokenPolicyEngine,
  isTokenRegistered,
  checkDepositAllowed,
  // Artifact re-exports
  SIMPLE_TOKEN_ABI,
  SIMPLE_TOKEN_BYTECODE,
  POLICY_ENGINE_ABI,
  POLICY_ENGINE_BYTECODE,
  ERC1967_PROXY_ABI,
  ERC1967_PROXY_BYTECODE,
  // Types
  type DeploySimpleTokenParams,
  type DeploySimpleTokenResult,
  type DeployPolicyEngineParams,
  type DeployPolicyEngineResult,
  type MintTokensParams,
  type ApproveVaultParams,
  type RegisterTokenOnVaultParams,
  type DepositToVaultParams,
  type SetupStatusCallback,
  type SetupNewTokenParams,
  type SetupNewTokenResult,
} from "./convergence-deploy";
