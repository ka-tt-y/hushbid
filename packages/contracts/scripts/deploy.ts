import hre from "hardhat";
import { getAddress } from "viem";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

/**
 *
 * Deploys:
 *  1. HushBid — main auction contract
 *  2. PriceNormalizer — Chainlink Data Feeds for multi-token bid comparison
 *  3. MockNFT — test asset for demo auctions
 */
async function main() {
  const connection = await hre.network.connect();
  const [deployer] = await connection.viem.getWalletClients();
  const publicClient = await connection.viem.getPublicClient();

  console.log("Deploying contracts with account:", deployer.account.address);

  const balance = await publicClient.getBalance({ address: deployer.account.address });
  console.log("Account balance:", balance.toString());

  const chainId = await publicClient.getChainId();
  console.log("Chain ID:", chainId);


  // World ID v3 Router — Ethereum Sepolia
  const WORLD_ID_ROUTER = getAddress(
    process.env.WORLD_ID_ROUTER || "0x469449f251692E0779667583026b5A1E99512157"
  );
  const WORLD_ID_GROUP_ID = BigInt(process.env.WORLD_ID_GROUP_ID || "1");
  const WORLD_ID_APP_ID = process.env.WORLD_ID_APP_ID || "app_hushbid";
  const WORLD_ID_ACTION_ID = process.env.WORLD_ID_ACTION_ID || "bid-verification";

  // Chainlink Price Feeds (Ethereum Sepolia)
  const ETH_USD_FEED = getAddress(process.env.PRICE_FEED_ETH_USD || "0x694AA1769357215DE4FAC081bf1f309aDC325306");
  const USDC_USD_FEED = getAddress(process.env.PRICE_FEED_USDC_USD || "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E");
  const DAI_USD_FEED = getAddress(process.env.PRICE_FEED_DAI_USD || "0x14866185B1962B63C3Ea9E03Bc1da838bab34C19");

  // Tokens (Ethereum Sepolia)
  const WETH_ADDRESS = getAddress(process.env.WETH_SEPOLIA || "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9");
  const USDC_ADDRESS = getAddress(process.env.USDC_SEPOLIA || "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238");
  const DAI_ADDRESS = getAddress(process.env.DAI_SEPOLIA || "0x3e622317f8C93f7328350cF0B56d9eD4C620C5d6");

  // Convergence Vault (Ethereum Sepolia)
  const CONVERGENCE_VAULT = getAddress(
    process.env.CONVERGENCE_VAULT || "0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13"
  );

  console.log("\n Deploying Contracts\n");

  // 1. Deploy HushBid
  console.log("Deploying HushBid...");
  const hushBid = await connection.viem.deployContract("HushBid", [
    WORLD_ID_ROUTER,
    deployer.account.address, // CRE coordinator (will update later)
    WORLD_ID_GROUP_ID,
    WORLD_ID_APP_ID,
    WORLD_ID_ACTION_ID,
  ]);
  console.log("HushBid deployed to:", hushBid.address);

  // 2. Deploy PriceNormalizer
  console.log("\nDeploying PriceNormalizer...");
  const priceNormalizer = await connection.viem.deployContract("PriceNormalizer", [
    ETH_USD_FEED,
    USDC_USD_FEED,
    WETH_ADDRESS,
    USDC_ADDRESS,
  ]);
  console.log("PriceNormalizer deployed to:", priceNormalizer.address);

  // 3. Deploy MockNFT for testing
  console.log("\nDeploying MockNFT...");
  const mockNft = await connection.viem.deployContract("MockNFT", []);
  console.log("MockNFT deployed to:", mockNft.address);

  // 4. Mint some test NFTs
  console.log("\nMinting test NFTs...");
  await mockNft.write.mintBatch([deployer.account.address, 5n]);
  console.log("Minted 5 test NFTs to deployer");

  // 5. Approve HushBid to transfer NFTs
  await mockNft.write.setApprovalForAll([hushBid.address, true]);
  console.log("Approved HushBid for NFT transfers");

  console.log(`\nNetwork:           Chain ${chainId}`);
  console.log("HushBid:          ", hushBid.address);
  console.log("PriceNormalizer:  ", priceNormalizer.address);
  console.log("MockNFT:          ", mockNft.address);
  console.log("World ID Router:", WORLD_ID_ROUTER);
  console.log("Convergence Vault:", CONVERGENCE_VAULT);

  // ── Auto-update addresses across the monorepo ──
  const __filename = fileURLToPath(import.meta.url);
  const ROOT = resolve(dirname(__filename), "../../..");
  const updateScript = resolve(ROOT, "scripts/update-addresses.mjs");
  console.log("\n🔄 Updating addresses across the monorepo...\n");
  try {
    execSync(
      `node ${updateScript} --hushBid ${hushBid.address} --priceNormalizer ${priceNormalizer.address} --mockNFT ${mockNft.address}`,
      { cwd: ROOT, stdio: "inherit" }
    );
  } catch (err) {
    console.error("⚠️  Address update script failed — update manually:");
    console.error(`   node scripts/update-addresses.mjs --hushBid ${hushBid.address} --priceNormalizer ${priceNormalizer.address} --mockNFT ${mockNft.address}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
