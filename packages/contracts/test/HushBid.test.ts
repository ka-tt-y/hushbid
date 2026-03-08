import { describe, it } from "node:test";
import assert from "node:assert";
import hre from "hardhat";
import { getAddress, keccak256, toBytes, encodePacked, zeroAddress, zeroHash, parseEther } from "viem";

// ===========================================================================
// Helpers
// ===========================================================================

/** Build a commit hash the way the contract expects it. */
function makeCommitHash(bidder: `0x${string}`, amount: bigint, salt: `0x${string}`): `0x${string}` {
  return keccak256(encodePacked(["address", "uint256", "bytes32"], [bidder, amount, salt]));
}

const SALT_1 = keccak256(toBytes("salt1")) as `0x${string}`;
const SALT_2 = keccak256(toBytes("salt2")) as `0x${string}`;
const EMPTY_PROOF: readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] =
  [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];

// Enums (mirror Solidity)
const AssetType    = { ERC721: 0 } as const;
const PrivacyLevel = { FULL_PRIVATE: 0, AUDITABLE: 1 } as const;
const AuctionPhase = { CREATED: 0, BIDDING: 1, REVEAL: 2, SETTLING: 3, SETTLED: 4, COMPLETED: 5, CANCELLED: 6 } as const;

// ===========================================================================
// Test suite
// ===========================================================================
describe("HushBid", function () {

  // -------------------------------------------------------------------------
  // Common deploy fixture
  // -------------------------------------------------------------------------
  async function deployFixture() {
    const connection = await hre.network.connect();
    const [owner, seller, bidder1, bidder2, creCoordinator, auditor] =
      await connection.viem.getWalletClients();
    const publicClient = await connection.viem.getPublicClient();

    const hushBid = await connection.viem.deployContract("HushBid", [
      zeroAddress,
      creCoordinator.account.address,
      1n,
      "app_hushbid",
      "bid-verification",
    ]);

    const mockNft = await connection.viem.deployContract("MockNFT", []);

    return { hushBid, mockNft, owner, seller, bidder1, bidder2, creCoordinator, auditor, publicClient, connection };
  }

  /**
   * Helper: create an ERC721 / FULL_PRIVATE auction and return its ID.
   * Mints an NFT to the seller and approves it for escrow.
   */
  async function createSimpleAuction(
    hushBid: Awaited<ReturnType<typeof deployFixture>>["hushBid"],
    mockNft: Awaited<ReturnType<typeof deployFixture>>["mockNft"],
    seller: Awaited<ReturnType<typeof deployFixture>>["seller"],
    connection: Awaited<ReturnType<typeof deployFixture>>["connection"],
    overrides: Record<string, unknown> = {},
  ) {
    // Mint an NFT to the seller
    const nftAsSeller = await connection.viem.getContractAt("MockNFT", mockNft.address, { client: { wallet: seller } });
    await nftAsSeller.write.mint([seller.account.address]);
    const tokenId = await mockNft.read.tokenCounter();

    // Approve the HushBid contract to transfer the NFT
    await nftAsSeller.write.approve([hushBid.address, tokenId]);

    const asSeller = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: seller } });
    const params = {
      assetContract: mockNft.address as `0x${string}`,
      tokenId: tokenId,
      assetType: AssetType.ERC721,
      reservePrice: parseEther("0.01"),
      biddingDuration: 600n,
      revealDuration: 600n,
      privacyLevel: PrivacyLevel.FULL_PRIVATE,
      worldIdRequired: false,
      allowedTokensHash: zeroHash as `0x${string}`,
      auditor: zeroAddress as `0x${string}`,
      sellerShieldedAddress: zeroAddress as `0x${string}`,
      ...overrides,
    };
    await asSeller.write.createAuction([params]);
    const counter = await hushBid.read.auctionCounter();
    return counter;
  }

  /**
   * Helper: fast-forward past both bidding and reveal end times.
   */
  async function fastForwardPastRevealEnd(
    publicClient: Awaited<ReturnType<typeof deployFixture>>["publicClient"],
  ) {
    await publicClient.request({ method: "evm_increaseTime" as any, params: [1201] } as any);
    await publicClient.request({ method: "evm_mine" as any, params: [] } as any);
  }

  // =========================================================================
  //  1 — DEPLOYMENT
  // =========================================================================
  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { hushBid, owner } = await deployFixture();
      const contractOwner = await hushBid.read.owner();
      assert.strictEqual(getAddress(contractOwner), getAddress(owner.account.address));
    });

    it("Should set the CRE coordinator", async function () {
      const { hushBid, creCoordinator } = await deployFixture();
      const coordinator = await hushBid.read.creCoordinator();
      assert.strictEqual(getAddress(coordinator), getAddress(creCoordinator.account.address));
    });

    it("Should compute externalNullifierHash from appId and actionId", async function () {
      const { hushBid } = await deployFixture();
      const actual = await hushBid.read.externalNullifierHash();
      // Should be non-zero (computed from appId + actionId)
      assert.ok(actual !== 0n, "externalNullifierHash should be non-zero");
    });
  });

  // =========================================================================
  //  2 — AUCTION CREATION
  // =========================================================================
  describe("Auction Creation", function () {
    it("Should have correct initial auction counter", async function () {
      const { hushBid } = await deployFixture();
      const counter = await hushBid.read.auctionCounter();
      assert.strictEqual(counter, 0n);
    });

    it("Should create an ERC721 auction", async function () {
      const { hushBid, mockNft, seller, connection } = await deployFixture();
      const id = await createSimpleAuction(hushBid, mockNft, seller, connection);
      assert.strictEqual(id, 1n);
      const phase = await hushBid.read.auctionPhases([id]);
      assert.strictEqual(phase, AuctionPhase.BIDDING);
    });

    it("Should create an ERC721 auction and escrow the NFT", async function () {
      const { hushBid, mockNft, seller, connection } = await deployFixture();

      const nftAsSeller = await connection.viem.getContractAt("MockNFT", mockNft.address, { client: { wallet: seller } });
      await nftAsSeller.write.mint([seller.account.address]);
      await nftAsSeller.write.approve([hushBid.address, 1n]);

      const asSeller = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: seller } });
      await asSeller.write.createAuction([{
        assetContract: mockNft.address,
        tokenId: 1n,
        assetType: AssetType.ERC721,
        reservePrice: parseEther("0.01"),
        biddingDuration: 600n,
        revealDuration: 600n,
        privacyLevel: PrivacyLevel.FULL_PRIVATE,
        worldIdRequired: false,
        allowedTokensHash: zeroHash as `0x${string}`,
        auditor: zeroAddress as `0x${string}`,
        sellerShieldedAddress: zeroAddress as `0x${string}`,
      }]);

      const nftOwner = await mockNft.read.ownerOf([1n]);
      assert.strictEqual(getAddress(nftOwner), getAddress(hushBid.address));
    });

    it("Should reject AUDITABLE privacy without auditor address", async function () {
      const { hushBid, mockNft, seller, connection } = await deployFixture();
      await assert.rejects(
        createSimpleAuction(hushBid, mockNft, seller, connection, {
          privacyLevel: PrivacyLevel.AUDITABLE,
          auditor: zeroAddress,
        }),
        /AuditorRequired/,
      );
    });
  });

  // =========================================================================
  //  3 — BID COMMITMENT
  // =========================================================================
  describe("Bid Commitment", function () {
    it("Should reject commit for non-existent auction", async function () {
      const { hushBid, bidder1, connection } = await deployFixture();
      const hash = keccak256(toBytes("test"));
      const asBidder = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: bidder1 } });
      await assert.rejects(
        asBidder.write.commitBid([1n, hash, zeroHash as `0x${string}`, 0n, 0n, EMPTY_PROOF]),
        /AuctionNotFound/,
      );
    });

    it("Should accept a valid bid commitment", async function () {
      const { hushBid, mockNft, seller, bidder1, connection } = await deployFixture();
      const id = await createSimpleAuction(hushBid, mockNft, seller, connection);

      const hash = makeCommitHash(bidder1.account.address, parseEther("1"), SALT_1);
      const asBidder = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: bidder1 } });

      await asBidder.write.commitBid([id, hash, zeroHash as `0x${string}`, 0n, 0n, EMPTY_PROOF]);

      const count = await hushBid.read.getBidCount([id]);
      assert.strictEqual(count, 1n);
    });

    it("Should accept a bid commitment with IPFS CID", async function () {
      const { hushBid, mockNft, seller, bidder1, connection } = await deployFixture();
      const id = await createSimpleAuction(hushBid, mockNft, seller, connection);

      const hash = makeCommitHash(bidder1.account.address, parseEther("1"), SALT_1);
      const ipfsCid = keccak256(toBytes("QmSomeIPFSHash"));
      const asBidder = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: bidder1 } });

      await asBidder.write.commitBid([id, hash, ipfsCid, 0n, 0n, EMPTY_PROOF]);

      const count = await hushBid.read.getBidCount([id]);
      assert.strictEqual(count, 1n);
    });
  });

  // =========================================================================
  //  4 — SETTLEMENT (guard tests)
  // =========================================================================
  describe("Settlement", function () {
    it("Should reject settlement from non-CRE coordinator", async function () {
      const { hushBid, bidder1, connection } = await deployFixture();
      const hash = keccak256(toBytes("settlement"));
      const asBidder = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: bidder1 } });
      await assert.rejects(
        asBidder.write.settleAuction([1n, 0n, parseEther("1"), zeroAddress, hash, zeroAddress]),
        /NotAuthorized/,
      );
    });

    it("Should reject settlement before reveal end", async function () {
      const { hushBid, mockNft, seller, bidder1, creCoordinator, connection } = await deployFixture();
      const id = await createSimpleAuction(hushBid, mockNft, seller, connection);

      const amount = parseEther("1");
      const hash = makeCommitHash(bidder1.account.address, amount, SALT_1);
      const asBidder = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: bidder1 } });
      await asBidder.write.commitBid([id, hash, zeroHash as `0x${string}`, 0n, 0n, EMPTY_PROOF]);

      const asCre = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: creCoordinator } });
      await assert.rejects(
        asCre.write.settleAuction([id, 0n, amount, zeroAddress, keccak256(toBytes("s")), zeroAddress]),
        /RevealNotEnded/,
      );
    });

    it("Should reject settlement below reserve price", async function () {
      const { hushBid, mockNft, seller, bidder1, creCoordinator, connection, publicClient } = await deployFixture();
      const id = await createSimpleAuction(hushBid, mockNft, seller, connection);

      const amount = parseEther("1");
      const hash = makeCommitHash(bidder1.account.address, amount, SALT_1);
      const asBidder = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: bidder1 } });
      await asBidder.write.commitBid([id, hash, zeroHash as `0x${string}`, 0n, 0n, EMPTY_PROOF]);

      await fastForwardPastRevealEnd(publicClient);

      const asCre = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: creCoordinator } });
      await assert.rejects(
        asCre.write.settleAuction([id, 0n, parseEther("0.001"), zeroAddress, keccak256(toBytes("s")), zeroAddress]),
        /InvalidReservePrice/,
      );
    });
  });

  // =========================================================================
  //  6 — ADMIN
  // =========================================================================
  describe("Admin Functions", function () {
    it("Should allow owner to update CRE coordinator", async function () {
      const { hushBid, bidder1 } = await deployFixture();
      await hushBid.write.setCreCoordinator([bidder1.account.address]);
      const newCoordinator = await hushBid.read.creCoordinator();
      assert.strictEqual(getAddress(newCoordinator), getAddress(bidder1.account.address));
    });

    it("Should reject non-owner updating CRE coordinator", async function () {
      const { hushBid, bidder1, bidder2, connection } = await deployFixture();
      const asBidder = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: bidder1 } });
      await assert.rejects(
        asBidder.write.setCreCoordinator([bidder2.account.address]),
        /OwnableUnauthorizedAccount/,
      );
    });
  });

  // =========================================================================
  //  7 — HAPPY-PATH: ERC721 via helper, commit then CRE settle
  // =========================================================================
  describe("Happy Path — ERC721 (helper)", function () {
    it("Full lifecycle: create, commit, settle (CRE)", async function () {
      const { hushBid, mockNft, seller, bidder1, bidder2, creCoordinator, connection, publicClient } = await deployFixture();

      const id = await createSimpleAuction(hushBid, mockNft, seller, connection);
      assert.strictEqual(await hushBid.read.auctionPhases([id]), AuctionPhase.BIDDING);

      const amount1 = parseEther("1");
      const amount2 = parseEther("2");
      const hash1 = makeCommitHash(bidder1.account.address, amount1, SALT_1);
      const hash2 = makeCommitHash(bidder2.account.address, amount2, SALT_2);

      const asBidder1 = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: bidder1 } });
      const asBidder2 = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: bidder2 } });

      await asBidder1.write.commitBid([id, hash1, zeroHash as `0x${string}`, 0n, 0n, EMPTY_PROOF]);
      await asBidder2.write.commitBid([id, hash2, zeroHash as `0x${string}`, 0n, 0n, EMPTY_PROOF]);
      assert.strictEqual(await hushBid.read.getBidCount([id]), 2n);

      await fastForwardPastRevealEnd(publicClient);

      const settlementHash = keccak256(toBytes("settlement-proof"));
      const asCre = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: creCoordinator } });
      await asCre.write.settleAuction([id, 1n, amount2, zeroAddress, settlementHash, bidder2.account.address]);

      assert.strictEqual(await hushBid.read.auctionPhases([id]), AuctionPhase.COMPLETED);

      const result = await asCre.read.getAuctionResult([id], { account: creCoordinator.account });
      assert.strictEqual(result.winningBid, amount2);
      assert.strictEqual(result.settlementHash, settlementHash);

      // NFT should be transferred to winner
      const tokenId = await mockNft.read.tokenCounter();
      assert.strictEqual(getAddress(await mockNft.read.ownerOf([tokenId])), getAddress(bidder2.account.address));
    });
  });

  // =========================================================================
  //  8 — HAPPY-PATH: ERC721 asset, direct delivery and deferred claim
  // =========================================================================
  describe("Happy Path — ERC721 asset", function () {
    it("Full lifecycle: create, commit, settle with direct delivery", async function () {
      const { hushBid, mockNft, seller, bidder1, creCoordinator, connection, publicClient } = await deployFixture();

      const nftAsSeller = await connection.viem.getContractAt("MockNFT", mockNft.address, { client: { wallet: seller } });
      await nftAsSeller.write.mint([seller.account.address]);
      await nftAsSeller.write.approve([hushBid.address, 1n]);

      const asSeller = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: seller } });
      await asSeller.write.createAuction([{
        assetContract: mockNft.address,
        tokenId: 1n,
        assetType: AssetType.ERC721,
        reservePrice: parseEther("0.01"),
        biddingDuration: 600n,
        revealDuration: 600n,
        privacyLevel: PrivacyLevel.FULL_PRIVATE,
        worldIdRequired: false,
        allowedTokensHash: zeroHash as `0x${string}`,
        auditor: zeroAddress as `0x${string}`,
        sellerShieldedAddress: zeroAddress as `0x${string}`,
      }]);
      const id = await hushBid.read.auctionCounter();

      assert.strictEqual(getAddress(await mockNft.read.ownerOf([1n])), getAddress(hushBid.address));

      const amount = parseEther("1");
      const hash = makeCommitHash(bidder1.account.address, amount, SALT_1);
      const asBidder = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: bidder1 } });
      await asBidder.write.commitBid([id, hash, zeroHash as `0x${string}`, 0n, 0n, EMPTY_PROOF]);

      await fastForwardPastRevealEnd(publicClient);

      const asCre = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: creCoordinator } });
      const settlementHash = keccak256(toBytes("settlement-nft"));
      await asCre.write.settleAuction([id, 0n, amount, zeroAddress, settlementHash, bidder1.account.address]);

      assert.strictEqual(await hushBid.read.auctionPhases([id]), AuctionPhase.COMPLETED);
      assert.strictEqual(getAddress(await mockNft.read.ownerOf([1n])), getAddress(bidder1.account.address));
    });

    it("Full lifecycle: create, commit, settle, deferred claim", async function () {
      const { hushBid, mockNft, seller, bidder1, creCoordinator, connection, publicClient } = await deployFixture();

      const nftAsSeller = await connection.viem.getContractAt("MockNFT", mockNft.address, { client: { wallet: seller } });
      await nftAsSeller.write.mint([seller.account.address]);
      await nftAsSeller.write.approve([hushBid.address, 1n]);

      const asSeller = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: seller } });
      await asSeller.write.createAuction([{
        assetContract: mockNft.address,
        tokenId: 1n,
        assetType: AssetType.ERC721,
        reservePrice: parseEther("0.01"),
        biddingDuration: 600n,
        revealDuration: 600n,
        privacyLevel: PrivacyLevel.FULL_PRIVATE,
        worldIdRequired: false,
        allowedTokensHash: zeroHash as `0x${string}`,
        auditor: zeroAddress as `0x${string}`,
        sellerShieldedAddress: zeroAddress as `0x${string}`,
      }]);
      const id = await hushBid.read.auctionCounter();

      const amount = parseEther("1");
      const hash = makeCommitHash(bidder1.account.address, amount, SALT_1);
      const asBidder = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: bidder1 } });
      await asBidder.write.commitBid([id, hash, zeroHash as `0x${string}`, 0n, 0n, EMPTY_PROOF]);

      await fastForwardPastRevealEnd(publicClient);

      const asCre2 = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: creCoordinator } });
      const settlementHash2 = keccak256(toBytes("settlement-nft"));
      await asCre2.write.settleAuction([id, 0n, amount, zeroAddress, settlementHash2, zeroAddress]);

      assert.strictEqual(await hushBid.read.auctionPhases([id]), AuctionPhase.SETTLED);
      assert.strictEqual(getAddress(await mockNft.read.ownerOf([1n])), getAddress(hushBid.address));
    });

    it("Should return NFT to seller on cancel", async function () {
      const { hushBid, mockNft, seller, connection } = await deployFixture();

      const nftAsSeller = await connection.viem.getContractAt("MockNFT", mockNft.address, { client: { wallet: seller } });
      await nftAsSeller.write.mint([seller.account.address]);
      await nftAsSeller.write.approve([hushBid.address, 1n]);

      const asSeller = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: seller } });
      await asSeller.write.createAuction([{
        assetContract: mockNft.address,
        tokenId: 1n,
        assetAmount: 1n,
        assetType: AssetType.ERC721,
        reservePrice: parseEther("0.01"),
        biddingDuration: 600n,
        revealDuration: 600n,
        privacyLevel: PrivacyLevel.FULL_PRIVATE,
        worldIdRequired: false,
        allowedTokensHash: zeroHash as `0x${string}`,
        auditor: zeroAddress as `0x${string}`,
        sellerShieldedAddress: zeroAddress as `0x${string}`,
      }]);
      const id = await hushBid.read.auctionCounter();

      assert.strictEqual(getAddress(await mockNft.read.ownerOf([1n])), getAddress(hushBid.address));

      await asSeller.write.cancelAuction([id]);
      assert.strictEqual(await hushBid.read.auctionPhases([id]), AuctionPhase.CANCELLED);
      assert.strictEqual(getAddress(await mockNft.read.ownerOf([1n])), getAddress(seller.account.address));
    });
  });

  // =========================================================================
  //  9 — DOUBLE-SETTLE GUARD
  // =========================================================================
  describe("Double-Settle Protection", function () {
    it("Should prevent settling the same auction twice", async function () {
      const { hushBid, mockNft, seller, bidder1, creCoordinator, connection, publicClient } = await deployFixture();

      const id = await createSimpleAuction(hushBid, mockNft, seller, connection);

      const amount = parseEther("1");
      const hash = makeCommitHash(bidder1.account.address, amount, SALT_1);
      const asBidder = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: bidder1 } });
      await asBidder.write.commitBid([id, hash, zeroHash as `0x${string}`, 0n, 0n, EMPTY_PROOF]);

      await fastForwardPastRevealEnd(publicClient);

      const asCre = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: creCoordinator } });
      await asCre.write.settleAuction([id, 0n, amount, zeroAddress, keccak256(toBytes("s1")), zeroAddress]);

      await assert.rejects(
        asCre.write.settleAuction([id, 0n, amount, zeroAddress, keccak256(toBytes("s2")), zeroAddress]),
        /AuctionNotInPhase/,
      );
    });
  });

  // =========================================================================
  //  10 — PRIVACY-LEVEL TESTS: getAuctionResult()
  // =========================================================================
  describe("Privacy Levels — getAuctionResult()", function () {

    /** Helper: create, commit, settle; return auctionId. */
    async function setupSettledAuction(
      fixture: Awaited<ReturnType<typeof deployFixture>>,
      privacyLevel: number,
      overrides: Record<string, unknown> = {},
    ): Promise<bigint> {
      const { hushBid, mockNft, seller, bidder1, creCoordinator, connection, publicClient } = fixture;

      const id = await createSimpleAuction(hushBid, mockNft, seller, connection, {
        privacyLevel,
        ...overrides,
      });

      const amount = parseEther("1");
      const hash = makeCommitHash(bidder1.account.address, amount, SALT_1);
      const asBidder = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: bidder1 } });
      await asBidder.write.commitBid([id, hash, zeroHash as `0x${string}`, 0n, 0n, EMPTY_PROOF]);

      await fastForwardPastRevealEnd(publicClient);

      const asCre = await connection.viem.getContractAt("HushBid", hushBid.address, { client: { wallet: creCoordinator } });
      await asCre.write.settleAuction([
        id, 0n, amount, zeroAddress,
        keccak256(toBytes("settle")),
        bidder1.account.address,
      ]);

      return id;
    }

    // ------- FULL_PRIVATE -------
    it("FULL_PRIVATE: public caller sees zeroed result", async function () {
      const fixture = await deployFixture();
      const id = await setupSettledAuction(fixture, PrivacyLevel.FULL_PRIVATE);

      // Use low-level readContract with explicit account to ensure msg.sender is bidder2
      const asBidder2 = await fixture.connection.viem.getContractAt(
        "HushBid", fixture.hushBid.address, { client: { wallet: fixture.bidder2 } },
      );
      const result = await asBidder2.read.getAuctionResult([id], { account: fixture.bidder2.account });
      assert.strictEqual(result.winner, zeroAddress);
      assert.strictEqual(result.winningBid, 0n);
      assert.strictEqual(result.paymentToken, zeroAddress);
      assert.strictEqual(result.settlementHash, zeroHash);
    });

    it("FULL_PRIVATE: winner also sees zeroed result (no on-chain leakage)", async function () {
      const fixture = await deployFixture();
      const id = await setupSettledAuction(fixture, PrivacyLevel.FULL_PRIVATE);

      const asBidder1 = await fixture.connection.viem.getContractAt(
        "HushBid", fixture.hushBid.address, { client: { wallet: fixture.bidder1 } },
      );
      const result = await asBidder1.read.getAuctionResult([id]);
      assert.strictEqual(result.winner, zeroAddress);
      assert.strictEqual(result.winningBid, 0n);
      assert.strictEqual(result.settlementHash, zeroHash);
    });

    it("FULL_PRIVATE: CRE sees full result", async function () {
      const fixture = await deployFixture();
      const id = await setupSettledAuction(fixture, PrivacyLevel.FULL_PRIVATE);

      const asCre = await fixture.connection.viem.getContractAt(
        "HushBid", fixture.hushBid.address, { client: { wallet: fixture.creCoordinator } },
      );
      const result = await asCre.read.getAuctionResult([id], { account: fixture.creCoordinator.account });
      assert.strictEqual(getAddress(result.winner), getAddress(fixture.bidder1.account.address));
      assert.strictEqual(result.winningBid, parseEther("1"));
    });

    // ------- AUDITABLE -------
    it("AUDITABLE: public caller sees zeroed result", async function () {
      const fixture = await deployFixture();
      const id = await setupSettledAuction(fixture, PrivacyLevel.AUDITABLE, {
        auditor: fixture.auditor.account.address,
      });

      const asBidder2 = await fixture.connection.viem.getContractAt(
        "HushBid", fixture.hushBid.address, { client: { wallet: fixture.bidder2 } },
      );
      const result = await asBidder2.read.getAuctionResult([id], { account: fixture.bidder2.account });
      assert.strictEqual(result.winner, zeroAddress);
      assert.strictEqual(result.winningBid, 0n);
    });

    it("AUDITABLE: auditor sees full result", async function () {
      const fixture = await deployFixture();
      const id = await setupSettledAuction(fixture, PrivacyLevel.AUDITABLE, {
        auditor: fixture.auditor.account.address,
      });

      const asAuditor = await fixture.connection.viem.getContractAt(
        "HushBid", fixture.hushBid.address, { client: { wallet: fixture.auditor } },
      );
      const result = await asAuditor.read.getAuctionResult([id], { account: fixture.auditor.account });
      assert.strictEqual(getAddress(result.winner), getAddress(fixture.bidder1.account.address));
      assert.strictEqual(result.winningBid, parseEther("1"));
    });

    it("AUDITABLE: CRE sees full result", async function () {
      const fixture = await deployFixture();
      const id = await setupSettledAuction(fixture, PrivacyLevel.AUDITABLE, {
        auditor: fixture.auditor.account.address,
      });

      const asCre = await fixture.connection.viem.getContractAt(
        "HushBid", fixture.hushBid.address, { client: { wallet: fixture.creCoordinator } },
      );
      const result = await asCre.read.getAuctionResult([id], { account: fixture.creCoordinator.account });
      assert.strictEqual(getAddress(result.winner), getAddress(fixture.bidder1.account.address));
      assert.strictEqual(result.winningBid, parseEther("1"));
    });
  });
});
