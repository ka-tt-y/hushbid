import hre from "hardhat";
import { getAddress, parseAbi } from "viem";
import "dotenv/config";

/**
 * Register ERC-20 tokens with the Convergence Vault's PolicyEngine.
 *
 * The Convergence vault requires tokens to be registered before they can
 * be deposited or transferred privately. This script calls the vault's
 * PolicyEngine to whitelist tokens used by HushBid auctions.
 *
 * Tokens registered:
 *  - WETH (Sepolia)
 *  - USDC (Sepolia)
 *  - DAI (Sepolia)
 *
 * Prerequisites:
 *  - SEPOLIA_PRIVATE_KEY in .env (must be vault admin or PolicyEngine owner)
 *  - SEPOLIA_RPC_URL in .env
 *
 * Usage:
 *  npx hardhat run scripts/register-tokens.ts --network sepolia
 */

// Convergence Vault and PolicyEngine ABIs (minimal)
const VAULT_ABI = parseAbi([
  "function policyEngine() view returns (address)",
  "function deposit(address token, uint256 amount) external",
]);

const POLICY_ENGINE_ABI = parseAbi([
  "function addAllowedToken(address token) external",
  "function isTokenAllowed(address token) view returns (bool)",
  "function owner() view returns (address)",
]);

// Token addresses on Ethereum Sepolia
const TOKENS = {
  WETH: getAddress("0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9"),
  USDC: getAddress("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"),
  DAI: getAddress("0x3e622317f8C93f7328350cF0B56d9eD4C620C5d6"),
} as const;

const CONVERGENCE_VAULT = getAddress(
  process.env.CONVERGENCE_VAULT || "0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13"
);

async function main() {
  const connection = await hre.network.connect();
  const [deployer] = await connection.viem.getWalletClients();
  const publicClient = await connection.viem.getPublicClient();

  console.log("Account:", deployer.account.address);
  console.log("Convergence Vault:", CONVERGENCE_VAULT);

  // 1. Read the PolicyEngine address from the vault
  let policyEngineAddress: `0x${string}`;
  try {
    policyEngineAddress = await publicClient.readContract({
      address: CONVERGENCE_VAULT,
      abi: VAULT_ABI,
      functionName: "policyEngine",
    }) as `0x${string}`;
    console.log("PolicyEngine:", policyEngineAddress);
  } catch (err) {
    console.log(
      "\n⚠️  Could not read policyEngine() from vault.",
      "\n    The vault may not expose this function.",
      "\n    If tokens are already whitelisted, this script is not needed.",
      "\n    Error:", err
    );
    return;
  }

  // 2. Check ownership
  try {
    const owner = await publicClient.readContract({
      address: policyEngineAddress,
      abi: POLICY_ENGINE_ABI,
      functionName: "owner",
    });
    console.log("PolicyEngine owner:", owner);

    if (owner.toLowerCase() !== deployer.account.address.toLowerCase()) {
      console.log(
        "\n⚠️  Your account is not the PolicyEngine owner.",
        "\n    You may not have permission to register tokens.",
        "\n    Owner:", owner,
        "\n    Your account:", deployer.account.address
      );
    }
  } catch {
    console.log("Could not read PolicyEngine owner — continuing anyway");
  }

  // 3. Register each token
  console.log("\n📝 Registering tokens with PolicyEngine...\n");

  for (const [name, address] of Object.entries(TOKENS)) {
    try {
      // Check if already registered
      const isAllowed = await publicClient.readContract({
        address: policyEngineAddress,
        abi: POLICY_ENGINE_ABI,
        functionName: "isTokenAllowed",
        args: [address],
      });

      if (isAllowed) {
        console.log(`  ✅ ${name} (${address}) — already registered`);
        continue;
      }

      // Register the token
      const txHash = await deployer.writeContract({
        address: policyEngineAddress,
        abi: POLICY_ENGINE_ABI,
        functionName: "addAllowedToken",
        args: [address],
      });

      console.log(`  📤 ${name} (${address}) — tx: ${txHash}`);

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status === "success") {
        console.log(`  ✅ ${name} registered successfully`);
      } else {
        console.log(`  ❌ ${name} registration failed`);
      }
    } catch (err) {
      console.log(`  ❌ ${name} (${address}) — error: ${err}`);
    }
  }

  console.log("\n✅ Token registration complete");

  // 4. Summary
  console.log("\n═══════════════════════════════════════");
  console.log("  Token Registration Summary");
  console.log("═══════════════════════════════════════");
  console.log(`  Vault:         ${CONVERGENCE_VAULT}`);
  console.log(`  PolicyEngine:  ${policyEngineAddress}`);
  for (const [name, address] of Object.entries(TOKENS)) {
    try {
      const isAllowed = await publicClient.readContract({
        address: policyEngineAddress,
        abi: POLICY_ENGINE_ABI,
        functionName: "isTokenAllowed",
        args: [address],
      });
      console.log(`  ${name}: ${address} — ${isAllowed ? "✅ allowed" : "❌ not allowed"}`);
    } catch {
      console.log(`  ${name}: ${address} — ❓ unknown`);
    }
  }
  console.log("═══════════════════════════════════════\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
