import hre from "hardhat";
import { zeroAddress, getAddress, padHex, keccak256, encodePacked } from "viem";
import "dotenv/config";

/**
 * Creates a test auction on the deployed HushBid contract.
 * This produces a real on-chain transaction with an AuctionCreated event,
 * which you can use with `cre workflow simulate` log triggers.
 *
 * Usage:
 *   npx hardhat run scripts/create-test-auction.ts --network sepolia
 */

const AUCTION_CONTRACT = getAddress(
  process.env.AUCTION_CONTRACT || "0xf842c9a06e99f2b9fffa9d8ca10c42d7c3fc85d6"
);

async function main() {
  const connection = await hre.network.connect();
  const [deployer] = await connection.viem.getWalletClients();
  const publicClient = await connection.viem.getPublicClient();

  console.log("Creating test auction...");
  console.log("Deployer:", deployer.account.address);
  console.log("Auction contract:", AUCTION_CONTRACT);

  const balance = await publicClient.getBalance({ address: deployer.account.address });
  console.log("Balance:", balance.toString(), "wei");

  // Create a simple ERC20/native auction (AssetType.NATIVE = 2)
  // This avoids needing an NFT contract or approvals
  const now = Math.floor(Date.now() / 1000);
  const biddingDuration = 120n;   // 2 minutes (short for testing)
  const revealDuration = 120n;    // 2 minutes (short for testing)

  // ERC-20 token for testing — use WETH on Sepolia
  const TOKEN_ADDRESS = getAddress(
    process.env.TOKEN_ADDRESS || "0x7b79995e5f793a07bc00c21412e50ecae098e7f9" // Sepolia WETH
  );

  // Allowed tokens hash — keccak256 of empty array means "any token"
  const allowedTokensHash = padHex("0x0", { size: 32 });

  const createAuctionParams = {
    assetContract: TOKEN_ADDRESS,         // ERC-20 token being auctioned
    tokenAmount: 10000000000000000n,      // 0.01 tokens (18 decimals)
    assetType: 1,                         // AssetType.ERC20
    reservePrice: 1000000000000000n,      // 0.001 ETH
    biddingDuration,
    revealDuration,
    privacyLevel: 1,                      // PRICE_ONLY (simplest — bids readable on-chain)
    worldIdRequired: false,
    allowedTokensHash,
    auditor: zeroAddress,
    sellerShieldedAddress: zeroAddress,   // No shielded address for test auctions
  };

  console.log("\nAuction params:");
  console.log("  Token:", TOKEN_ADDRESS, "amount: 0.01");
  console.log("  Reserve price: 0.001 ETH");
  console.log("  Bidding duration: 1 hour");
  console.log("  Reveal duration: 30 minutes");
  console.log("  Privacy level: PRICE_ONLY (1)");
  console.log("  World ID required: false");

  // Send the transaction
  const hash = await deployer.writeContract({
    address: AUCTION_CONTRACT,
    abi: [
      {
        inputs: [
          {
            components: [
              { name: "assetContract", type: "address" },
              { name: "tokenAmount", type: "uint256" },
              { name: "assetType", type: "uint8" },
              { name: "reservePrice", type: "uint256" },
              { name: "biddingDuration", type: "uint64" },
              { name: "revealDuration", type: "uint64" },
              { name: "privacyLevel", type: "uint8" },
              { name: "worldIdRequired", type: "bool" },
              { name: "allowedTokensHash", type: "bytes32" },
              { name: "auditor", type: "address" },
              { name: "sellerShieldedAddress", type: "address" },
            ],
            name: "p",
            type: "tuple",
          },
        ],
        name: "createAuction",
        outputs: [{ name: "auctionId", type: "uint256" }],
        stateMutability: "nonpayable",
        type: "function",
      },
    ],
    functionName: "createAuction",
    args: [createAuctionParams],
  });

  console.log("\n✅ Transaction sent!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TX HASH:", hash);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Wait for confirmation
  console.log("\nWaiting for confirmation...");
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("Status:", receipt.status);
  console.log("Block:", receipt.blockNumber);
  console.log("Gas used:", receipt.gasUsed.toString());
  console.log("Logs:", receipt.logs.length, "event(s) emitted");

  // Find the AuctionCreated event log index
  if (receipt.logs.length > 0) {
    console.log("\n📋 Event logs:");
    receipt.logs.forEach((log, i) => {
      console.log(`  [${i}] topic0: ${log.topics[0]?.slice(0, 18)}...`);
    });

    console.log("\n🎯 To simulate the AuctionCreated trigger:");
    console.log(`   cd packages/cre-workflow`);
    console.log(`   cre workflow simulate ./hush-bid \\`);
    console.log(`     --trigger-index 1 \\`);
    console.log(`     --evm-tx-hash ${hash} \\`);
    console.log(`     --evm-event-index 0 \\`);
    console.log(`     --non-interactive`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
