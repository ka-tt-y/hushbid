#!/usr/bin/env node
/**
 * HushBid CRE Simulation Agent (LLM-Powered)
 *
 * An AI agent that continuously monitors the HushBid auction contract,
 * reasons about the current state using Groq LLM, and drives the CRE
 * workflow simulator with intelligent decision-making.
 *
 * Architecture:
 *   ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
 *   │  Gather     │────▶│  LLM Brain   │────▶│  Execute    │
 *   │  (chain)    │     │  (Groq)      │     │  (cre sim)  │
 *   └─────────────┘     └──────────────┘     └─────────────┘
 *          │                    ▲                    │
 *          └────────────────────┴────────────────────┘
 *                       feedback loop
 *
 * Usage:
 *   GROQ_API_KEY=gsk_... node scripts/cre-agent.mjs [flags]
 *
 * Flags:
 *   --broadcast   Pass --broadcast to CRE simulate (sends real txs)
 *   --interval N  Base poll interval in seconds (default: 15)
 *   --verbose     Show full CRE simulator + LLM output
 *   --dry-run     Log what would be triggered without spawning CRE
 */

import { createPublicClient, createWalletClient, defineChain, http, parseAbiItem, formatEther, encodeFunctionData, keccak256, encodeAbiParameters } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve as pathResolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = pathResolve(__dirname, '..');
const CRE_WORKFLOW_DIR = pathResolve(PROJECT_ROOT, 'packages/cre-workflow');
const STATE_FILE = pathResolve(PROJECT_ROOT, '.cre-agent-state.json');

// ── Load CRE workflow .env FIRST — this has the real DON key ────────────
const CRE_ENV_PATH = pathResolve(CRE_WORKFLOW_DIR, '.env');
if (existsSync(CRE_ENV_PATH)) {
  const envContent = readFileSync(CRE_ENV_PATH, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

// ── Load contracts .env for RPC URLs and other infra secrets ────────────
const CONTRACTS_ENV_PATH = pathResolve(PROJECT_ROOT, 'packages/contracts/.env');
if (existsSync(CONTRACTS_ENV_PATH)) {
  const envContent = readFileSync(CONTRACTS_ENV_PATH, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;   // don't override CRE .env
  }
}

// ── DON key MUST come from CRE .env (same key the frontend sends funds to) ──
if (!process.env.DON_ETH_PRIVATE_KEY) {
  console.error('\n╔══════════════════════════════════════════════════════════════╗');
  console.error('║  FATAL: DON_ETH_PRIVATE_KEY not found.                      ║');
  console.error('║                                                              ║');
  console.error('║  The agent must use the SAME DON key the frontend sends      ║');
  console.error('║  bid deposits to. Set it in:                                 ║');
  console.error(`║    ${CRE_ENV_PATH}`);
  console.error('║                                                              ║');
  console.error('║  DO NOT fall back to the deployer/SEPOLIA_PRIVATE_KEY —      ║');
  console.error('║  that is a different wallet and has no vault funds.           ║');
  console.error('╚══════════════════════════════════════════════════════════════╝\n');
  process.exit(1);
}
// Derive DON_WALLET_ADDRESS from the private key (if not explicitly set)
if (!process.env.DON_WALLET_ADDRESS) {
  const acct = privateKeyToAccount(
    process.env.DON_ETH_PRIVATE_KEY.startsWith('0x')
      ? process.env.DON_ETH_PRIVATE_KEY
      : `0x${process.env.DON_ETH_PRIVATE_KEY}`
  );
  process.env.DON_WALLET_ADDRESS = acct.address;
}

const RPC_URL = process.env.SEPOLIA_RPC_URL || process.env.RPC_URL_SEPOLIA || 'https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY';
const CONTRACT = (process.env.HUSH_BID_ADDRESS || '0xf842c9a06e99f2b9fffa9d8ca10c42d7c3fc85d6').toLowerCase();
// Also load demo .env for PINATA_JWT
const DEMO_ENV_PATH = pathResolve(PROJECT_ROOT, 'apps/demo/.env');
if (existsSync(DEMO_ENV_PATH)) {
  const envContent = readFileSync(DEMO_ENV_PATH, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    // Only grab PINATA_JWT and VITE_PINATA_JWT
    if (key === 'VITE_PINATA_JWT' && !process.env.PINATA_JWT) {
      process.env.PINATA_JWT = val;
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

// (CRE workflow .env already loaded at top — before DON key derivation)

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

const args = process.argv.slice(2);
const BROADCAST = args.includes('--broadcast');
const VERBOSE = args.includes('--verbose');
const DRY_RUN = args.includes('--dry-run');
const intervalIdx = args.indexOf('--interval');
const BASE_INTERVAL_S = intervalIdx !== -1 ? parseInt(args[intervalIdx + 1], 10) : 300; // 5min idle default

/**
 * Compute a smart sleep interval based on nearest auction deadline.
 * Instead of polling frequently, we sleep until the next interesting
 * event (bidding end or settlement end) so we wake up exactly when
 * action is needed.  No unnecessary invocations.
 */
function computeSmartInterval(chainState) {
  const now = Math.floor(Date.now() / 1000);
  const activeAuctions = chainState.auctions.filter(a => !a.skipped && !a.error);

  // If there are settleable auctions right now, act fast
  if (activeAuctions.some(a => a.isSettleable)) return 15;

  // Find the nearest future deadline across all active auctions
  let nearestDeadline = Infinity;
  for (const a of activeAuctions) {
    if (a._biddingEnd && a._biddingEnd > now) {
      nearestDeadline = Math.min(nearestDeadline, a._biddingEnd - now);
    }
    if (a._revealEnd && a._revealEnd > now) {
      nearestDeadline = Math.min(nearestDeadline, a._revealEnd - now);
    }
  }

  if (nearestDeadline === Infinity) {
    // No active auctions — long idle
    return BASE_INTERVAL_S;
  }

  // Sleep until 5s after the deadline so the phase has transitioned,
  // clamped to a minimum of 15s to avoid busy-spinning on near deadlines
  const sleepUntil = nearestDeadline + 5;
  return Math.max(15, sleepUntil);
}

// CRE trigger indices (must match handler registration order in main.ts)
const TRIGGER = { CRON: 0, AUCTION_CREATED: 1, BID_COMMITTED: 2 };

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const PHASES = ['CREATED', 'BIDDING', 'REVEAL', 'SETTLING', 'SETTLED', 'COMPLETED', 'CANCELLED'];
const PRIVACY = ['FULL_PRIVATE', 'AUDITABLE'];
const ASSET_TYPES = ['ERC721'];

const ABI = [
  { type: 'function', name: 'auctionCounter', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  {
    type: 'function', name: 'getAuction',
    inputs: [{ name: 'auctionId', type: 'uint256' }],
    outputs: [{
      name: '', type: 'tuple', components: [
        { name: 'seller', type: 'address' },
        { name: 'assetContract', type: 'address' },
        { name: 'tokenAmount', type: 'uint256' },
        { name: 'reservePrice', type: 'uint256' },
        { name: 'biddingEnd', type: 'uint64' },
        { name: 'revealEnd', type: 'uint64' },
        { name: 'assetType', type: 'uint8' },
        { name: 'privacyLevel', type: 'uint8' },
        { name: 'worldIdRequired', type: 'bool' },
        { name: 'allowedTokensHash', type: 'bytes32' },
        { name: 'auditor', type: 'address' },
        { name: 'sellerShieldedAddress', type: 'address' },
      ],
    }],
    stateMutability: 'view',
  },
  { type: 'function', name: 'auctionPhases', inputs: [{ name: 'auctionId', type: 'uint256' }], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'getBidCount', inputs: [{ name: 'auctionId', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  {
    type: 'function', name: 'settleAuction',
    inputs: [
      { name: 'auctionId', type: 'uint256' },
      { name: 'winnerBidIndex', type: 'uint256' },
      { name: 'winningBid', type: 'uint256' },
      { name: 'paymentToken', type: 'address' },
      { name: 'settlementHash', type: 'bytes32' },
      { name: 'destinationAddress', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
];

const EVENT_AUCTION_CREATED = parseAbiItem('event AuctionCreated(uint256 indexed auctionId, address indexed seller, address assetContract, uint256 tokenAmount, uint8 privacyLevel)');
const EVENT_BID_COMMITTED = parseAbiItem('event BidCommitted(uint256 indexed auctionId, bytes32 indexed commitHash, uint64 sourceChain)');
const EVENT_AUCTION_SETTLED = parseAbiItem('event AuctionSettled(uint256 indexed auctionId, address indexed winner, uint256 winningBid, bytes32 settlementHash)');

// ═══════════════════════════════════════════════════════════════════════════
// STATE + MEMORY
// ═══════════════════════════════════════════════════════════════════════════

let state = {
  lastProcessedBlock: 0n,
  processedEvents: new Set(),
  settledAuctions: new Set(),
};

/** Rolling memory of recent events/actions — gives LLM context across ticks */
const memory = [];
const MAX_MEMORY = 30;

function addMemory(entry) {
  memory.push({ ts: new Date().toISOString().slice(11, 19), ...entry });
  if (memory.length > MAX_MEMORY) memory.shift();
}

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      const raw = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
      state.lastProcessedBlock = BigInt(raw.lastProcessedBlock || 0);
      state.processedEvents = new Set(raw.processedEvents || []);
      state.settledAuctions = new Set((raw.settledAuctions || []).map(Number));
      if (raw.memory) memory.push(...raw.memory.slice(-MAX_MEMORY));
      log(`📂 Loaded state — block ${state.lastProcessedBlock}, ${memory.length} memories`);
    }
  } catch {
    log('⚠️  Could not load state file, starting fresh');
  }
}

function saveState() {
  writeFileSync(STATE_FILE, JSON.stringify({
    lastProcessedBlock: state.lastProcessedBlock.toString(),
    processedEvents: [...state.processedEvents].slice(-500),
    settledAuctions: [...state.settledAuctions],
    memory: memory.slice(-MAX_MEMORY),
  }, null, 2));
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════════════════════════════════════

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

/** Print a compact auction state table — quick glance at what's happening */
function logAuctionTable(chainState) {
  const active = chainState.auctions.filter(a => !a.skipped && !a.error);
  if (active.length === 0) {
    log('📋 No active auctions');
    return;
  }
  const header = '  #  │ Phase     │ Bids │ Bidding        │ Settlement     │ Status';
  const sep    = '─────┼───────────┼──────┼────────────────┼────────────────┼─────────────';
  log(`📋 Active auctions (${active.length}):`);
  console.log(`     ${header}`);
  console.log(`     ${sep}`);
  for (const a of active) {
    const id = String(a.id).padStart(3);
    const phase = (a.phase || '???').padEnd(9);
    const bids = String(a.bidCount ?? 0).padStart(4);
    const bidTime = (a.biddingTimeLeft || '—').padEnd(14);
    const revTime = (a.revealTimeLeft || '—').padEnd(14);
    const status = a.isSettleable ? '🔥 SETTLEABLE' : a.isBiddingOpen ? '📝 open' : a.isInReveal ? '⏳ reveal' : '—';
    console.log(`     ${id}  │ ${phase} │ ${bids} │ ${bidTime} │ ${revTime} │ ${status}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CHAIN CLIENT
// ═══════════════════════════════════════════════════════════════════════════

const activeChain = defineChain({
  ...sepolia,
  rpcUrls: { default: { http: [RPC_URL] } },
});

const viemClient = createPublicClient({
  chain: activeChain,
  transport: http(RPC_URL),
});

// Wallet client for sending settlement transactions directly when CRE
// simulation can't broadcast (writeReport is mocked in simulate mode).
// Uses the DON key — same address that the frontend sends bid deposits to.
let walletClient = null;
const DON_PRIVATE_KEY = process.env.DON_ETH_PRIVATE_KEY;
if (DON_PRIVATE_KEY) {
  try {
    const prefixedKey = DON_PRIVATE_KEY.startsWith('0x') ? DON_PRIVATE_KEY : `0x${DON_PRIVATE_KEY}`;
    const donAccount = privateKeyToAccount(prefixedKey);
    walletClient = createWalletClient({
      account: donAccount,
      chain: activeChain,
      transport: http(RPC_URL),
    });
  } catch (err) {
    log(`⚠️  Could not create wallet client: ${err.message}`);
  }
}

/**
 * Finalize an auction on-chain by calling settleAuction via the DON wallet.
 *
 * IMPORTANT: This is purely an on-chain phase transition — settleAuction
 * records the winner and moves the auction to COMPLETED. It does NOT
 * transfer any tokens. All actual payment (winner bid → seller, loser
 * refunds, asset delivery) happens privately through the Convergence
 * Privacy Vault in the CRE workflow's settlePrivatePayments step.
 *
 * Used when CRE simulation identifies a winner but can't broadcast
 * (simulation mode mocks writeReport → zero tx hash).
 *
 * Returns the tx hash on success, or throws on failure.
 */
async function finalizeOnChain(settlement) {
  if (!walletClient) {
    throw new Error('No wallet client — DON_ETH_PRIVATE_KEY not set in packages/cre-workflow/.env');
  }

  const {
    auctionId, winnerBidIndex, winningBid,
    paymentToken, settlementHash,
    destinationAddress,
  } = settlement;

  log(`🔧 Finalizing auction #${auctionId} on-chain (phase transition only) — bidIndex=${winnerBidIndex} bid=${winningBid}`);

  const txHash = await walletClient.writeContract({
    address: CONTRACT,
    abi: ABI,
    functionName: 'settleAuction',
    args: [
      BigInt(auctionId),
      BigInt(winnerBidIndex),
      BigInt(winningBid),
      paymentToken,
      settlementHash,
      destinationAddress,
    ],
  });

  // Wait for the tx to be mined
  const receipt = await viemClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status === 'reverted') {
    throw new Error(`Settlement tx ${txHash} reverted`);
  }

  log(`✅ On-chain finalization confirmed: ${txHash} (block ${receipt.blockNumber})`);
  return txHash;
}

/**
 * Verify that an auction's on-chain phase actually changed to SETTLED (4)
 * or COMPLETED (5). Returns the current phase number.
 */
async function verifyOnChainPhase(auctionId) {
  const phase = await viemClient.readContract({
    address: CONTRACT,
    abi: ABI,
    functionName: 'auctionPhases',
    args: [BigInt(auctionId)],
  });
  return Number(phase);
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA GATHERING — Pure data collection, no decisions
// ═══════════════════════════════════════════════════════════════════════════

async function getLogsInBatches(event, fromBlock, toBlock, batchSize = 10n) {
  const allLogs = [];
  for (let start = fromBlock; start <= toBlock; start += batchSize) {
    const end = (start + batchSize - 1n) > toBlock ? toBlock : start + batchSize - 1n;
    const logs = await viemClient.getLogs({ address: CONTRACT, event, fromBlock: start, toBlock: end });
    allLogs.push(...logs);
  }
  return allLogs;
}

/** Collect all on-chain state into a structured snapshot for the LLM */
async function gatherChainState() {
  const currentBlock = await viemClient.getBlockNumber();
  const now = Math.floor(Date.now() / 1000);

  // ── Scan for new events ──
  const fromBlock = state.lastProcessedBlock > 0n
    ? state.lastProcessedBlock + 1n
    : currentBlock - 50n;

  const newEvents = [];
  if (fromBlock <= currentBlock) {
    const [createdLogs, commitLogs, settledLogs] = await Promise.all([
      getLogsInBatches(EVENT_AUCTION_CREATED, fromBlock, currentBlock),
      getLogsInBatches(EVENT_BID_COMMITTED, fromBlock, currentBlock),
      getLogsInBatches(EVENT_AUCTION_SETTLED, fromBlock, currentBlock),
    ]);

    // Cache tx receipts to compute tx-relative log indices.
    // The CRE CLI's --evm-event-index expects the log's index within the
    // transaction, not the global logIndex within the block.
    const receiptCache = new Map();
    async function getTxRelativeLogIndex(txHash, globalLogIndex) {
      if (!receiptCache.has(txHash)) {
        const receipt = await viemClient.getTransactionReceipt({ hash: txHash });
        receiptCache.set(txHash, receipt);
      }
      const receipt = receiptCache.get(txHash);
      const idx = receipt.logs.findIndex(l => l.logIndex === globalLogIndex);
      return idx >= 0 ? idx : globalLogIndex; // fallback to global if not found
    }

    for (const l of createdLogs) {
      const key = `${l.transactionHash}:${l.logIndex}`;
      if (!state.processedEvents.has(key)) {
        const txLogIndex = await getTxRelativeLogIndex(l.transactionHash, l.logIndex);
        newEvents.push({
          type: 'AuctionCreated',
          auctionId: Number(l.args.auctionId),
          seller: l.args.seller,
          privacyLevel: PRIVACY[l.args.privacyLevel] || String(l.args.privacyLevel),
          txHash: l.transactionHash,
          logIndex: txLogIndex,
          _key: key,
        });
      }
    }

    for (const l of commitLogs) {
      const key = `${l.transactionHash}:${l.logIndex}`;
      if (!state.processedEvents.has(key)) {
        const txLogIndex = await getTxRelativeLogIndex(l.transactionHash, l.logIndex);
        newEvents.push({
          type: 'BidCommitted',
          auctionId: Number(l.args.auctionId),
          sourceChain: l.args.sourceChain === 0n ? 'local' : `chain:${l.args.sourceChain}`,
          txHash: l.transactionHash,
          logIndex: txLogIndex,
          _key: key,
        });
      }
    }

    for (const l of settledLogs) {
      const key = `${l.transactionHash}:${l.logIndex}`;
      if (!state.processedEvents.has(key)) {
        state.settledAuctions.add(Number(l.args.auctionId));
        newEvents.push({
          type: 'AuctionSettled',
          auctionId: Number(l.args.auctionId),
          winner: l.args.winner,
          winningBid: formatEther(l.args.winningBid),
          txHash: l.transactionHash,
          logIndex: l.logIndex,
          _key: key,
        });
      }
    }

    state.lastProcessedBlock = currentBlock;
  }

  // ── Read auction states ──
  let auctionCount = 0n;
  try {
    auctionCount = await viemClient.readContract({ address: CONTRACT, abi: ABI, functionName: 'auctionCounter' });
  } catch { /* contract may not be deployed */ }

  const auctions = [];
  const scanStart = auctionCount > 20n ? auctionCount - 20n + 1n : 1n;

  for (let i = auctionCount; i >= scanStart; i--) {
    if (state.settledAuctions.has(Number(i))) {
      auctions.push({ id: Number(i), phase: 'COMPLETED', skipped: true });
      continue;
    }
    try {
      const [auction, phase, bidCount] = await Promise.all([
        viemClient.readContract({ address: CONTRACT, abi: ABI, functionName: 'getAuction', args: [i] }),
        viemClient.readContract({ address: CONTRACT, abi: ABI, functionName: 'auctionPhases', args: [i] }),
        viemClient.readContract({ address: CONTRACT, abi: ABI, functionName: 'getBidCount', args: [i] }),
      ]);

      // If settled/completed/cancelled, mark and skip future reads
      if (phase >= 4) {
        state.settledAuctions.add(Number(i));
        auctions.push({ id: Number(i), phase: PHASES[phase], skipped: true });
        continue;
      }

      const biddingEnd = Number(auction.biddingEnd);
      const revealEnd = Number(auction.revealEnd);

      auctions.push({
        id: Number(i),
        phase: PHASES[phase],
        privacyLevel: PRIVACY[auction.privacyLevel],
        assetType: ASSET_TYPES[auction.assetType],
        reservePrice: formatEther(auction.reservePrice),
        worldIdRequired: auction.worldIdRequired,
        bidCount: Number(bidCount),
        seller: auction.seller,
        _biddingEnd: biddingEnd,
        _revealEnd: revealEnd,
        biddingTimeLeft: biddingEnd > now ? `${Math.round((biddingEnd - now) / 60)}min left` : `ended ${Math.round((now - biddingEnd) / 60)}min ago`,
        revealTimeLeft: revealEnd > now ? `${Math.round((revealEnd - now) / 60)}min left` : `ended ${Math.round((now - revealEnd) / 60)}min ago`,
        isSettleable: now > revealEnd && bidCount > 0n && phase < 4,
        isBiddingOpen: now <= biddingEnd && phase <= 1,
        isInReveal: now > biddingEnd && now <= revealEnd,
      });
    } catch (err) {
      auctions.push({ id: Number(i), error: err.message });
    }
  }

  return {
    currentBlock: Number(currentBlock),
    now: new Date().toISOString(),
    auctionCount: Number(auctionCount),
    auctions,
    newEvents,
    queueLength: simulationQueue.length,
    simulationRunning,
    broadcast: BROADCAST,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GROQ LLM — The Brain
// ═══════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are the AI brain of the HushBid CRE Simulation Agent. You monitor a sealed-bid auction smart contract on Ethereum Sepolia and decide when and how to trigger Chainlink CRE workflow simulations.

## HushBid Protocol
Sellers create auctions with escrowed assets (ERC-721, ERC-20, ERC-1155, or NONE for pure price discovery). Bidders submit encrypted commitment hashes on-chain — bid amounts stay hidden. Encrypted bid metadata (including ECIES-encrypted amounts and vault transaction IDs) is stored on IPFS. After the reveal period ends, the CRE workflow fetches the IPFS metadata inside a Trusted Execution Environment (TEE), decrypts bid amounts, determines the winner via on-chain PriceNormalizer (Chainlink Data Feeds), and settles the auction — delivering the asset and executing private payments via the Convergence Token API.

Privacy levels control what is PUBLIC after settlement:
- FULL_PRIVATE → winner address + amount suppressed in event; AuctionResult gated to winner only
- AUDITABLE → designated auditor sees full data; public sees zeros

## Private Payment Architecture (Convergence Token API)
1. Bidder deposits ERC-20 tokens into the Convergence vault on Ethereum Sepolia
2. Bidder privately transfers their bid amount to the DON wallet via /private-transfer
3. The vault transaction ID goes into the encrypted IPFS metadata
4. At settlement, the CRE workflow (inside TEE) privately transfers winner's bid to seller's shielded address
5. Losing bidders are refunded via private transfer back to their addresses
6. All private transfers use EIP-712 signed requests to the Convergence API

The BidCommitted event deliberately EXCLUDES ipfsCid (prevents on-chain correlation). The CRE reads ipfsCid from contract storage via an access-gated getter (getBidCommitmentFull).

## Auction Phases
CREATED(0) → BIDDING(1) → REVEAL(2) → SETTLING(3) → SETTLED(4) → COMPLETED(5) | CANCELLED(6)
- BIDDING: accepting encrypted bid commitments
- REVEAL: reveal period (time window after bidding closes)
- After revealEnd: CRE settles — fetches IPFS metadata, decrypts, picks winner
- DON-direct-delivery skips SETTLED and goes straight to COMPLETED

## Available CRE Triggers
- **Index 0 — CRON**: Settlement sweep. Scans all auctions and settles any past the reveal deadline with bids. THIS IS HOW YOU SETTLE AUCTIONS. Max 2 settlements per cron run (chain read budget).
- **Index 1 — AUCTION_CREATED**: Log trigger for a specific AuctionCreated event. Validates and logs the new auction. Requires txHash + logIndex from the event.
- **Index 2 — BID_COMMITTED**: Log trigger for a specific BidCommitted event. Reads the latest bid commitment from contract storage, fetches encrypted metadata from IPFS via Confidential HTTP, and validates it. Requires txHash + logIndex from the event.

## Settlement Rules
An auction is settleable when ALL of: revealEnd < now, bidCount > 0, phase < 4 (SETTLED).
If bidCount is 0, it cannot be settled (no bids to evaluate).

## Your Responsibilities
1. React to new events by triggering the appropriate log-event simulation
2. Trigger CRON settlement sweeps when auctions are ready
3. Adapt the polling interval based on urgency (auctions near deadline → faster; nothing happening → slower)
4. Track outcomes via memory and avoid redundant actions
5. Provide clear status updates

## Response Format (STRICT JSON)
{
  "thinking": "Brief reasoning about the current situation",
  "actions": [
    { "type": "TRIGGER_CRON", "priority": "high", "reason": "..." },
    { "type": "TRIGGER_EVENT", "triggerIndex": 1, "txHash": "0x...", "logIndex": 0, "reason": "..." },
    { "type": "SET_INTERVAL", "seconds": 10, "reason": "..." },
    { "type": "LOG", "message": "..." }
  ],
  "status": "One-line summary for the operator"
}

## Rules
- TRIGGER_CRON needs no txHash. Use it to settle auctions.
- TRIGGER_EVENT needs triggerIndex (1 or 2), txHash, and logIndex from the event data.
- SET_INTERVAL: minimum 10s, maximum 300s. The agent auto-calculates optimal intervals from auction deadlines, so only override if you have a good reason.
- Only trigger CRON if there's at least one settleable auction and no cron is already queued/running.
- Always trigger event simulations for new AuctionCreated and BidCommitted events.
- Check memory to avoid re-triggering things you already triggered.
- If a previous simulation failed, you can retry but note it in your reasoning.
- actions can be an empty array if there is genuinely nothing to do.`;

let currentInterval = BASE_INTERVAL_S;

async function askLLM(chainState) {
  if (!GROQ_API_KEY) return fallbackDecision(chainState);

  const userMsg = JSON.stringify({
    chainState: {
      ...chainState,
      // Strip internal keys the LLM doesn't need
      newEvents: chainState.newEvents.map(({ _key, ...rest }) => rest),
    },
    recentMemory: memory.slice(-15),
    currentInterval,
  }, null, 2);

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMsg },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.15,
        max_completion_tokens: 1024,
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`Groq ${resp.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from Groq');

    const decision = JSON.parse(content);

    // Always show LLM reasoning (truncated)
    if (decision.thinking) {
      const thought = decision.thinking.length > 150 ? decision.thinking.slice(0, 150) + '…' : decision.thinking;
      log(`🧠 ${thought}`);
    }

    addMemory({
      type: 'llm_decision',
      thinking: decision.thinking?.slice(0, 120),
      actions: (decision.actions || []).map(a => `${a.type}${a.auctionId ? '#' + a.auctionId : ''}`).join(', ') || 'none',
    });

    return decision;
  } catch (err) {
    log(`⚠️  LLM error: ${err.message} — using fallback rules`);
    addMemory({ type: 'llm_error', error: err.message.slice(0, 100) });
    return fallbackDecision(chainState);
  }
}

/** Deterministic fallback when LLM is unavailable */
function fallbackDecision(chainState) {
  const actions = [];

  for (const evt of chainState.newEvents) {
    if (evt.type === 'BidCommitted') {
      actions.push({ type: 'TRIGGER_EVENT', triggerIndex: TRIGGER.BID_COMMITTED, txHash: evt.txHash, logIndex: evt.logIndex, reason: `New bid on #${evt.auctionId}` });
    }
  }

  const settleable = chainState.auctions.filter(a => a.isSettleable);
  if (settleable.length > 0 && !chainState.simulationRunning && chainState.queueLength === 0) {
    actions.push({ type: 'TRIGGER_CRON', priority: 'high', reason: `${settleable.length} auction(s) ready` });
  }

  // Smart interval: compute from nearest auction deadline
  const interval = computeSmartInterval(chainState);
  if (interval !== currentInterval) {
    actions.push({ type: 'SET_INTERVAL', seconds: interval, reason: interval >= BASE_INTERVAL_S ? 'Nothing active — idle' : `Next deadline in ~${interval}s` });
  }

  return {
    thinking: 'Fallback rules (no LLM)',
    actions,
    status: `${chainState.auctionCount} auctions | ${chainState.newEvents.length} events | ${settleable.length} settleable`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CRE SIMULATION EXECUTOR
// ═══════════════════════════════════════════════════════════════════════════

let simulationRunning = false;
const simulationQueue = [];

function queueSimulation(label, triggerIndex, evmTxHash = null, evmEventIndex = null) {
  const key = evmTxHash ? `${triggerIndex}:${evmTxHash}:${evmEventIndex}` : `${triggerIndex}:cron`;
  if (simulationQueue.some(s => s.key === key)) return;
  simulationQueue.push({ label, triggerIndex, evmTxHash, evmEventIndex, key });
  log(`📥 Queued: ${label}`);
  drainQueue();
}

async function drainQueue() {
  if (simulationRunning || simulationQueue.length === 0) return;
  simulationRunning = true;
  const job = simulationQueue.shift();
  try {
    const result = await runSimulation(job);

    // After CRE simulation, finalize on-chain and verify private payments
    if (result.settlements?.length > 0) {
      await handleSettlements(result.settlements);
    }

    addMemory({ type: 'sim_result', label: job.label, success: result.success, settled: result.settledCount || 0 });
  } catch (err) {
    log(`❌ Simulation failed: ${job.label} — ${err.message}`);
    addMemory({ type: 'sim_error', label: job.label, error: err.message.slice(0, 100) });
  } finally {
    simulationRunning = false;
    if (simulationQueue.length > 0) setTimeout(drainQueue, 1000);
  }
}

/**
 * After CRE simulation identifies winners, verify on-chain state and
 * finalize on-chain if needed.
 *
 * The CRE simulation correctly handles all the complex logic (IPFS fetch,
 * DON-key decryption, bid comparison, PriceNormalizer fallback) but its
 * writeReport is mocked in simulate mode — no tx is actually sent.
 *
 * This function bridges the gap: it checks if the on-chain phase actually
 * transitioned, and if not, sends the settleAuction tx using the DON wallet
 * key. NOTE: settleAuction only transitions the phase — NO token transfers
 * happen on-chain. All payments go through the Convergence Privacy Vault.
 */
async function handleSettlements(settlements) {
  for (const s of settlements) {
    const auctionId = parseInt(s.auctionId);

    // 1. Check on-chain phase — did the CRE simulation actually broadcast?
    const phase = await verifyOnChainPhase(auctionId);

    if (phase >= 4) {
      // Phase is SETTLED(4), COMPLETED(5), or CANCELLED(6) — already done on-chain
      if (s.paymentSuccess) {
        log(`✅ Auction #${auctionId} already settled on-chain — phase=${PHASES[phase]}, private payments ${s.paymentSuccess ? 'completed ✓' : 'still pending'}`);
        state.settledAuctions.add(auctionId);
        saveState();
      } else {
        log(`⚠️ Auction #${auctionId} on-chain phase=${PHASES[phase]} but private vault payments failed`);
        log(`   DON wallet: ${s.destinationAddress ? 'settlement dest=' + s.destinationAddress : 'unknown'}`);
        log(`   Likely cause: bidder→DON private transfer failed at bid time, or seller didn't deposit auctioned asset into vault`);
        log(`   Token: ${s.paymentToken}, Amount: ${s.winningBid}`);
        // Don't cache — agent will retry payments on next cron cycle
      }
      continue;
    }

    // 2. Not settled on-chain — the simulation's writeReport was mocked.
    //    Execute the settlement directly using the DON key.
    log(`📡 Auction #${auctionId} on-chain phase=${PHASES[phase]} — writeReport was mocked in simulation mode. Finalizing on-chain via DON wallet (phase transition only, no token transfers)…`);

    try {
      await finalizeOnChain(s);

      // 3. Verify the phase changed after our tx
      const newPhase = await verifyOnChainPhase(auctionId);
      if (newPhase >= 4) {
        if (s.paymentSuccess) {
          log(`🏆 Auction #${auctionId} finalized — on-chain phase=${PHASES[newPhase]}, private vault payments ${s.paymentSuccess ? 'completed ✓' : 'pending (will retry)'}`);  
          state.settledAuctions.add(auctionId);
          saveState();
        } else {
          log(`⚠️ Auction #${auctionId} on-chain settled (phase=${PHASES[newPhase]}) but private vault payments failed`);
          log(`   Payment token: ${s.paymentToken}, Winning bid: ${s.winningBid}`);
          log(`   Winner dest: ${s.destinationAddress}`);
          log(`   Root cause: DON wallet has insufficient vault balance. Ensure bidders completed all 5 vault pipeline steps (wrap→approve→deposit→private-transfer→commit).`);
        }
      } else {
        log(`❌ Auction #${auctionId} still phase=${PHASES[newPhase]} after on-chain finalization — something is wrong`);
      }
    } catch (err) {
      log(`❌ On-chain finalization failed for auction #${auctionId}: ${err.message}`);
      // Don't mark as settled — will retry on next cron cycle
    }
  }
}

function runSimulation({ label, triggerIndex, evmTxHash, evmEventIndex }) {
  return new Promise((resolve, reject) => {
    // Resolve ${VAR} placeholders in config.staging.json → config.staging.resolved.json
    // CRE simulation reads config values literally (no env substitution).
    const configPath = pathResolve(CRE_WORKFLOW_DIR, 'hush-bid/config.staging.json');
    const resolvedPath = pathResolve(CRE_WORKFLOW_DIR, 'hush-bid/config.staging.resolved.json');
    try {
      let configText = readFileSync(configPath, 'utf8');
      configText = configText.replace(/\$\{([^}]+)\}/g, (_, varName) => {
        const val = process.env[varName];
        if (!val) log(`⚠️  Warning: env var ${varName} not set for config substitution`);
        return val || '';
      });
      writeFileSync(resolvedPath, configText, 'utf8');
    } catch (err) {
      log(`❌ Failed to resolve config secrets: ${err.message}`);
      return reject(err);
    }

    const creArgs = [
      'workflow', 'simulate', './hush-bid',
      '--non-interactive',
      '--trigger-index', String(triggerIndex),
      '--target', 'staging-simulate',
    ];
    if (evmTxHash) {
      creArgs.push('--evm-tx-hash', evmTxHash, '--evm-event-index', String(evmEventIndex));
    }
    if (BROADCAST) creArgs.push('--broadcast');

    if (DRY_RUN) {
      log(`🏃 [DRY RUN] cre ${creArgs.join(' ')}`);
      return resolve({ success: true, dryRun: true, settledCount: 0, settlements: [] });
    }

    log(`🚀 Running: ${label}`);

    const child = spawn('cre', creArgs, {
      cwd: CRE_WORKFLOW_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '', stderr = '';
    child.stdout.on('data', d => {
      stdout += d.toString();
      if (VERBOSE) d.toString().split('\n').filter(Boolean).forEach(l => log(`    ${l}`));
    });
    child.stderr.on('data', d => {
      stderr += d.toString();
      if (VERBOSE) d.toString().split('\n').filter(Boolean).forEach(l => log(`    ${l}`));
    });

    child.on('close', code => {
      // Parse structured JSON result from the CRE workflow.
      // The workflow now returns: {"settled":N,"settlements":[{...}]}
      // The CRE CLI double-encodes this as a JSON string in its output:
      //   ✓ Workflow Simulation Result:
      //   "{\"settled\":1,\"settlements\":[...]}"
      let settledCount = 0;
      let settlements = [];

      const resultLine = stdout.match(/Workflow Simulation Result:\s*\n(.+)/m);
      if (resultLine) {
        try {
          // First JSON.parse removes outer quotes and unescapes inner quotes
          const innerStr = JSON.parse(resultLine[1].trim());
          // Second JSON.parse gives us the actual object
          const parsed = JSON.parse(innerStr);
          settledCount = parsed.settled || 0;
          settlements = parsed.settlements || [];
        } catch {
          // Fall back to legacy settled:N format
          const legacyMatch = stdout.match(/settled:(\d+)/);
          settledCount = legacyMatch ? parseInt(legacyMatch[1]) : 0;
        }
      } else {
        // Fall back to legacy format for backward compatibility
        const legacyMatch = stdout.match(/settled:(\d+)/);
        settledCount = legacyMatch ? parseInt(legacyMatch[1]) : 0;
      }

      // NOTE: We no longer mark auctions as settled here based on stdout
      // parsing. Settlement marking happens in handleSettlements() AFTER
      // on-chain verification. This prevents the false-positive bug where
      // CRE simulation reports "settled:1" but writeReport was mocked.

      if (code === 0) {
        log(`✅ Done: ${label}${settledCount > 0 ? ` — 🏆 CRE identified ${settledCount} settlement(s)` : ''}`);
        resolve({ success: true, exitCode: 0, settledCount, settlements, snippet: stdout.slice(-200) });
      } else {
        const benign = stdout.includes('no-auctions') || stdout.includes('"settled":0') || stdout.includes('settled:0');
        if (!benign) {
          log(`⚠️  Exit ${code}: ${label}`);
          if (!VERBOSE && stderr) stderr.trim().split('\n').slice(-3).forEach(l => log(`    ${l}`));
        }
        resolve({ success: false, exitCode: code, benign, settledCount: 0, settlements: [], snippet: (stderr || stdout).slice(-200) });
      }
    });

    child.on('error', err => reject(new Error(`Spawn: ${err.message}`)));
    setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Timeout 120s')); }, 120_000);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION EXECUTOR — Translates LLM decisions into real actions
// ═══════════════════════════════════════════════════════════════════════════

function executeActions(decision, chainState) {
  if (!decision.actions?.length) return;

  for (const action of decision.actions) {
    switch (action.type) {
      case 'TRIGGER_CRON':
        log(`🧠 → Settlement sweep (${action.priority || 'normal'}): ${action.reason}`);
        queueSimulation(`Cron: ${action.reason}`, TRIGGER.CRON);
        break;

      case 'TRIGGER_EVENT': {
        const name = action.triggerIndex === 1 ? 'AuctionCreated' : 'BidCommitted';
        log(`🧠 → ${name} event: ${action.reason}`);
        queueSimulation(`${name}: ${action.reason}`, action.triggerIndex, action.txHash, action.logIndex);
        break;
      }

      case 'SET_INTERVAL': {
        const next = Math.max(15, action.seconds);
        if (next !== currentInterval) {
          log(`🧠 → Interval ${currentInterval}s → ${next}s: ${action.reason}`);
          currentInterval = next;
        }
        break;
      }

      case 'LOG':
        log(`🧠 ${action.message}`);
        break;
    }
  }

  // Mark all new events as processed
  for (const evt of chainState.newEvents) {
    state.processedEvents.add(evt._key);
    addMemory({ type: `event:${evt.type}`, auctionId: evt.auctionId });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════════════════════════════════════════════

let tickCount = 0;

async function tick() {
  tickCount++;
  try {
    // 1. Gather all chain data (pure observation)
    const chainState = await gatherChainState();

    const hasNews = chainState.newEvents.length > 0;
    const hasActive = chainState.auctions.some(a => a.isSettleable || a.isBiddingOpen || a.isInReveal);

    // Log a concise tick summary
    const evtSummary = hasNews ? ` | ${chainState.newEvents.length} new event(s)` : '';
    log(`──── tick #${tickCount} | block ${chainState.currentBlock} | ${chainState.auctionCount} auctions${evtSummary} ────`);

    // Show compact table every tick (it's cheap and gives quick context)
    logAuctionTable(chainState);

    // 2. Consult the LLM when there's something to reason about,
    //    or periodically as a check-in (every ~4 ticks)
    if (hasNews || hasActive || tickCount % 4 === 0) {
      const decision = await askLLM(chainState);
      if (decision.status) log(`📊 ${decision.status}`);
      executeActions(decision, chainState);
    } else {
      // Quiet tick — just mark events and move on
      for (const evt of chainState.newEvents) state.processedEvents.add(evt._key);
    }

    saveState();
  } catch (err) {
    log(`❌ Tick error: ${err.message}`);
    addMemory({ type: 'tick_error', error: err.message.slice(0, 100) });
  }
}

async function main() {
  if (!GROQ_API_KEY) {
    console.log('\n⚠️  GROQ_API_KEY not set — running in fallback (rule-based) mode');
    console.log('   export GROQ_API_KEY=gsk_... for LLM-powered decisions\n');
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║        🤫 HushBid CRE Agent (LLM-Powered)                  ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Contract:  ${CONTRACT.slice(0, 20)}…${CONTRACT.slice(-6)}                    ║`);
  console.log(`║  DON wallet:${(process.env.DON_WALLET_ADDRESS || 'MISSING').padEnd(48)}║`);
  console.log(`║  Model:     ${(GROQ_API_KEY ? GROQ_MODEL : 'fallback (no key)').padEnd(38)}       ║`);
  console.log(`║  Interval:  ${String(BASE_INTERVAL_S).padEnd(5)}s idle (deadline-aware, auto-wakes)       ║`);
  console.log(`║  Broadcast: ${BROADCAST ? 'YES (real txs)' : 'NO (dry sim) '}                              ║`);
  console.log(`║  Direct tx: ${walletClient ? 'YES (DON key loaded)' : 'NO (no key)         '}                        ║`);
  console.log(`║  Dry run:   ${DRY_RUN ? 'YES' : 'NO '}                                            ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  loadState();

  log('🔍 Initial scan…');
  await tick();

  log(`🔄 Main loop started — Ctrl+C to stop`);

  const loop = async () => {
    await tick();
    const humanTime = currentInterval >= 120
      ? `${(currentInterval / 60).toFixed(0)}min`
      : `${currentInterval}s`;
    log(`💤 Next check in ${humanTime}`);
    setTimeout(loop, currentInterval * 1000);
  };
  setTimeout(loop, 5000); // short initial delay

  const shutdown = () => { log('👋 Shutting down…'); saveState(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
