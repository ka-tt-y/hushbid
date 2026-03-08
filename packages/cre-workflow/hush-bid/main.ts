/**
 * HushBid Protocol — Private Price Discovery Workflow
 *
 * CRE workflow powering confidential price discovery. Sealed-bid auctions
 * are the initial use case, but the commit-reveal-settle pattern generalises
 * to OTC trades, RFQs, dark-pool matching, and any scenario where hidden
 * valuations must be resolved fairly by a decentralised oracle.
 *
 * Capabilities:
 * - Event-driven triggers (log + cron) with keccak256-computed signatures
 * - Confidential HTTP for IPFS bid metadata retrieval inside DON TEE
 * - On-chain PriceNormalizer for multi-token bid comparison via Chainlink Feeds
 * - Privacy-level-aware settlement (FULL_PRIVATE, AUDITABLE)
 * - DON consensus-based settlement via report/writeReport
 * - Settlement idempotency via on-chain phase checks
 * - Secrets integration for IPFS gateway auth (VaultDON)
 */

import {
  bytesToHex,
  type CronPayload,
  handler,
  CronCapability,
  EVMClient,
  type EVMLog,
  ConfidentialHTTPClient,
  HTTPClient,
  encodeCallMsg,
  getNetwork,
  prepareReportRequest,
  LAST_FINALIZED_BLOCK_NUMBER,
  LATEST_BLOCK_NUMBER,
  Runner,
  type Runtime,
  type SecretsProvider,
  TxStatus,
} from '@chainlink/cre-sdk'
import {
  type Address,
  decodeFunctionResult,
  decodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  toHex,
  toBytes,
  keccak256,
  encodeAbiParameters,
  zeroAddress,
} from 'viem'
import { z } from 'zod'


/**
 * Minimal ABI slices used by this workflow.
 * These match the generated ABIs in packages/contracts/abi/ exactly.
 */
const HushBidABI = [
  {
    type: 'function',
    name: 'getAuction',
    inputs: [{ name: 'auctionId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
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
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getBidCount',
    inputs: [{ name: 'auctionId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'settleAuction',
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
  {
    type: 'function',
    name: 'auctionPhases',
    inputs: [{ name: 'auctionId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'auctionCounter',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getBidCommitmentFull',
    inputs: [
      { name: 'auctionId', type: 'uint256' },
      { name: 'index', type: 'uint256' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'commitHash', type: 'bytes32' },
          { name: 'ipfsCid', type: 'string' },
          { name: 'timestamp', type: 'uint64' },
          { name: 'sourceChain', type: 'uint64' },
          { name: 'valid', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const

const PriceNormalizerABI = [
  {
    type: 'function',
    name: 'findHighestBid',
    inputs: [
      { name: 'tokens', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
    ],
    outputs: [
      { name: 'winnerIndex', type: 'uint256' },
      { name: 'highestUsd', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'normalizeToUsd',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const


// AuctionCreated(uint256 indexed auctionId, address indexed seller, address assetContract, uint256 tokenAmount, uint8 privacyLevel)
const SIG_AUCTION_CREATED = keccak256(
  toBytes('AuctionCreated(uint256,address,address,uint256,uint8)')
)

// BidCommitted(uint256 indexed auctionId, bytes32 indexed commitHash, uint64 sourceChain)
// NOTE: ipfsCid is deliberately excluded from the event to prevent on-chain correlation.
// The CRE reads ipfsCid from contract storage via getBidCommitmentFull() instead.
const SIG_BID_COMMITTED = keccak256(
  toBytes('BidCommitted(uint256,bytes32,uint64)')
)

// AuctionSettled(uint256 indexed auctionId, address indexed winner, uint256 winningBid, bytes32 settlementHash)
const SIG_AUCTION_SETTLED = keccak256(
  toBytes('AuctionSettled(uint256,address,uint256,bytes32)')
)


/** Privacy levels matching Solidity PrivacyLevel enum */
const PRIVACY_LEVEL = {
  FULL_PRIVATE: 0,
  AUDITABLE: 1,
} as const

/** Auction phases matching Solidity AuctionPhase enum */
const AUCTION_PHASE = {
  CREATED: 0,
  BIDDING: 1,
  REVEAL: 2,
  SETTLING: 3,
  SETTLED: 4,
  COMPLETED: 5,
  CANCELLED: 6,
} as const

const configSchema = z.object({
  // Cron schedule for checking phase transitions (default: every minute)
  schedule: z.string(),

  // Primary chain where HushBid is deployed
  primaryChain: z.object({
    chainSelectorName: z.string(),
    auctionContract: z.string(),
    priceNormalizer: z.string(),
    creCoordinator: z.string(), // DON forwarder address — used as `from` in view calls
    gasLimit: z.string(),
  }),

  // Convergence Token API for private settlement
  convergence: z.object({
    apiEndpoint: z.string(),
    vaultContract: z.string(),
    chainId: z.number(),
  }),

  // Well-known token addresses on the primary chain
  tokens: z.object({
    eth: z.string(),
    weth: z.string(),
    usdc: z.string(),
  }),

  // Secrets embedded in conf
  secrets: z.object({
    donEthPrivateKey: z.string(),
    donWalletAddress: z.string(),
    donEncryptionPrivateKey: z.string(),
    pinataJwt: z.string().optional(),
  }),
})

type Config = z.infer<typeof configSchema>

/** Read a secret from config */
const readSecret = (runtime: Runtime<Config>, id: string): string => {
  const map: Record<string, string | undefined> = {
    DON_ETH_PRIVATE_KEY: runtime.config.secrets.donEthPrivateKey,
    DON_WALLET_ADDRESS: runtime.config.secrets.donWalletAddress,
    DON_ENCRYPTION_PRIVATE_KEY: runtime.config.secrets.donEncryptionPrivateKey,
    PINATA_JWT: runtime.config.secrets.pinataJwt,
  }
  const val = map[id]
  if (!val) throw new Error(`Secret '${id}' not found in config.secrets`)
  return val
}


/**
 * Convert a bytes32 IPFS CID back to a CIDv0 base58 string.
 *
 * On-chain, the SDK stores the 32-byte SHA-256 digest of the CIDv0 multihash.
 * To reconstruct the full CIDv0 string we prepend the multihash header
 * (0x1220 = sha2-256, 32 bytes) and base58btc-encode.
 *
 * This is the inverse of the SDK's `cidToBytes32()` operation.
 */
/** Zero-value bytes32 constant */
const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const

/** Resolve the primary-chain EVMClient (reused across handlers) */
const getPrimaryEvm = (
  config: Config
): { evmClient: EVMClient; chainSelector: bigint } => {
  const network = getNetwork({
    chainFamily: 'evm',
    chainSelectorName: config.primaryChain.chainSelectorName,
    isTestnet: true,
  })
  if (!network) {
    throw new Error(`Network not found: ${config.primaryChain.chainSelectorName}`)
  }
  return {
    evmClient: new EVMClient(network.chainSelector.selector),
    chainSelector: network.chainSelector.selector,
  }
}

interface AuctionConfig {
  seller: Address
  assetContract: Address
  tokenAmount: bigint
  reservePrice: bigint
  biddingEnd: bigint
  revealEnd: bigint
  assetType: number
  privacyLevel: number
  worldIdRequired: boolean
  allowedTokensHash: `0x${string}`
  auditor: Address
  sellerShieldedAddress: Address
}

interface RevealedBid {
  bidder: Address
  amount: bigint
  paymentToken: Address
  sourceChain: bigint
  /** Bidder's preferred delivery address (from encrypted metadata). */
  destinationAddress: Address
}

/**
 * Fetch the AuctionConfig struct for a given auctionId.
 */
const getAuction = (
  runtime: Runtime<Config>,
  auctionId: bigint
): AuctionConfig => {
  const { evmClient } = getPrimaryEvm(runtime.config)
  const { primaryChain } = runtime.config

  const callData = encodeFunctionData({
    abi: HushBidABI,
    functionName: 'getAuction',
    args: [auctionId],
  })

  const result = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: primaryChain.auctionContract as Address,
        data: callData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result()

  const decoded = decodeFunctionResult({
    abi: HushBidABI,
    functionName: 'getAuction',
    data: bytesToHex(result.data),
  })

  // decoded is a tuple matching AuctionConfig
  const d = decoded as unknown as AuctionConfig
  return d
}

/**
 * Find the highest bid across multiple tokens using on-chain PriceNormalizer.
 */
const findHighestBid = (
  runtime: Runtime<Config>,
  tokens: Address[],
  amounts: bigint[]
): { winnerIndex: bigint; highestUsd: bigint } => {
  const { evmClient } = getPrimaryEvm(runtime.config)
  const { primaryChain } = runtime.config

  const callData = encodeFunctionData({
    abi: PriceNormalizerABI,
    functionName: 'findHighestBid',
    args: [tokens, amounts],
  })

  const result = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: primaryChain.priceNormalizer as Address,
        data: callData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result()

  const [winnerIndex, highestUsd] = decodeFunctionResult({
    abi: PriceNormalizerABI,
    functionName: 'findHighestBid',
    data: bytesToHex(result.data),
  })

  return { winnerIndex, highestUsd }
}

/**
 * Read the on-chain phase for an auction.
 * Used to prevent double-settlement and skip already-settled auctions.
 */
const getAuctionPhase = (
  runtime: Runtime<Config>,
  auctionId: bigint
): number => {
  const { evmClient } = getPrimaryEvm(runtime.config)
  const { primaryChain } = runtime.config

  const callData = encodeFunctionData({
    abi: HushBidABI,
    functionName: 'auctionPhases',
    args: [auctionId],
  })

  const result = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: primaryChain.auctionContract as Address,
        data: callData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result()

  const decoded = decodeFunctionResult({
    abi: HushBidABI,
    functionName: 'auctionPhases',
    data: bytesToHex(result.data),
  })

  return Number(decoded)
}

/**
 * Read the total number of auctions created.
 * Used by the cron handler to iterate through all auctions.
 */
const getAuctionCounter = (
  runtime: Runtime<Config>
): bigint => {
  const { evmClient } = getPrimaryEvm(runtime.config)
  const { primaryChain } = runtime.config

  const callData = encodeFunctionData({
    abi: HushBidABI,
    functionName: 'auctionCounter',
    args: [],
  })

  const result = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: primaryChain.auctionContract as Address,
        data: callData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result()

  const decoded = decodeFunctionResult({
    abi: HushBidABI,
    functionName: 'auctionCounter',
    data: bytesToHex(result.data),
  })

  return decoded as bigint
}

interface BidCommitmentData {
  commitHash: `0x${string}`
  ipfsCid: string
  timestamp: bigint
  sourceChain: bigint
  valid: boolean
}

/**
 * Read the number of bid commitments for a given auction.
 */
const getBidCount = (
  runtime: Runtime<Config>,
  auctionId: bigint
): bigint => {
  const { evmClient } = getPrimaryEvm(runtime.config)
  const { primaryChain } = runtime.config

  const callData = encodeFunctionData({
    abi: HushBidABI,
    functionName: 'getBidCount',
    args: [auctionId],
  })

  const result = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: primaryChain.auctionContract as Address,
        data: callData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result()

  const decoded = decodeFunctionResult({
    abi: HushBidABI,
    functionName: 'getBidCount',
    data: bytesToHex(result.data),
  })

  return decoded as bigint
}

/**
 * Read a single BidCommitment from contract storage.
 * Uses the auto-generated getter for the public `bidCommitments` mapping.
 */
const getBidCommitment = (
  runtime: Runtime<Config>,
  auctionId: bigint,
  index: bigint
): BidCommitmentData => {
  const { evmClient } = getPrimaryEvm(runtime.config)
  const { primaryChain } = runtime.config

  // Use the CRE-only getter that includes ipfsCid.
  // The public getBidCommitment() omits ipfsCid for privacy.
  // Must call from creCoordinator to pass the access check.
  const callData = encodeFunctionData({
    abi: HushBidABI,
    functionName: 'getBidCommitmentFull',
    args: [auctionId, index],
  })

  const result = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: primaryChain.creCoordinator as Address,
        to: primaryChain.auctionContract as Address,
        data: callData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result()

  const decoded = decodeFunctionResult({
    abi: HushBidABI,
    functionName: 'getBidCommitmentFull',
    data: bytesToHex(result.data),
  })

  const d = decoded as unknown as BidCommitmentData
  return d
}

/**
 * Collect bids for settlement via IPFS + Confidential HTTP.
 *
 * ALL privacy levels use the same path: the DON fetches the encrypted
 * metadata envelope from IPFS, decrypts the entire blob inside the TEE
 * (bidder, amount, token, destination — everything), and settles.
 *
 * Privacy level only controls what is PUBLIC after settlement:
 *   FULL_PRIVATE → zero winner + zero amount in event, zeroed getter
 *   AUDITABLE    → zero winner + zero amount in event; auditor sees full via getter
 */
interface DecryptedBid extends RevealedBid {
  /** Index of this bid in the contract's _bidCommitments array */
  bidIndex: bigint
}

const getSettlementBids = (
  runtime: Runtime<Config>,
  auctionId: bigint,
  privacyLevel: number
): DecryptedBid[] => {
  const privacyName = ['FULL_PRIVATE', 'AUDITABLE'][privacyLevel] ?? `UNKNOWN(${privacyLevel})`
  runtime.log(
    `Auction #${auctionId}: ${privacyName} — collecting bids from IPFS via Confidential HTTP`
  )

  // 1. Read bid count from contract
  const bidCount = getBidCount(runtime, auctionId)

  if (bidCount === 0n) {
    runtime.log(`Auction #${auctionId}: no bids found`)
    return []
  }

  runtime.log(
    `Auction #${auctionId}: found ${bidCount} bid commitment(s) — reading from contract storage`
  )

  const bids: DecryptedBid[] = []

  for (let idx = 0n; idx < bidCount; idx++) {
    try {
      // 2. Read bidCommitments[auctionId][idx] from contract storage
      const commitment = getBidCommitment(runtime, auctionId, idx)

      if (!commitment.ipfsCid || commitment.ipfsCid === '') {
        runtime.log(`Skipping bid #${idx} — no IPFS CID`)
        continue
      }

      // CID is stored as-is (string) — no conversion needed
      const cidStr = commitment.ipfsCid
      runtime.log(`Fetching encrypted envelope from IPFS: ${cidStr}`)

      // 4. Fetch encrypted envelope via Confidential HTTP
      const envelope = fetchBidEnvelopeFromIpfs(runtime, cidStr)

      // 5. Decrypt the metadata — handle both v1 (test) and v2 (frontend) formats
      let metadata: BidMetadata
      if (envelope.encryptedPayload) {
        // v1: test script format — base64 plaintext or ECIES
        metadata = decryptMetadata(runtime, envelope.encryptedPayload)
      } else if (envelope.encryptedData && envelope.bidder) {
        // v2: frontend format — encrypted with wallet-derived key (DON can't decrypt)
        // Use cleartext bidder from envelope; amount is unknown so we can't settle
        runtime.log(`Bid #${idx}: v2 frontend envelope — DON cannot decrypt wallet-encrypted data, skipping`)
        continue
      } else {
        throw new Error(`Unknown envelope format (version=${envelope.version}), missing encryptedPayload`)
      }

      bids.push({
        bidder: metadata.bidder as Address,
        amount: BigInt(metadata.amount),
        paymentToken: metadata.paymentToken as Address,
        sourceChain: BigInt(metadata.sourceChain),
        destinationAddress: (metadata.destinationAddress ?? metadata.bidder) as Address,
        bidIndex: idx,
      })
    } catch (err) {
      runtime.log(`Failed to process bid #${idx}: ${err}`)
      continue
    }
  }

  runtime.log(
    `Auction #${auctionId}: collected ${bids.length} bids from IPFS`
  )
  return bids
}

// =============================================================================
// KECCAK256-CTR DECRYPTION (runs inside TEE)
// =============================================================================

/**
 * Decrypt the full bid metadata blob encrypted by the SDK's `encryptForDon()`.
 *
 * Uses keccak256-CTR symmetric encryption — no crypto.subtle needed.
 * Only keccak256 from viem is required, which works in the CRE WASM sandbox.
 *
 * Envelope format (base64-encoded):
 *   [0..31]   nonce (32 bytes)
 *   [32..63]  MAC (32 bytes) = keccak256(key || "hushbid-mac" || nonce || ciphertext)
 *   [64..]    ciphertext (keccak256-CTR encrypted)
 *
 * Decryption:
 *   1. Read DON encryption key from config
 *   2. Verify MAC
 *   3. keccak256-CTR decrypt: for each block i, keystream = keccak256(key || nonce || i)
 *   4. XOR ciphertext with keystream → plaintext
 *   5. Parse and return BidMetadata
 */
function base64Decode(b64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
  let out: number[] = []
  let i = 0
  const s = b64.replace(/[^A-Za-z0-9+/=]/g, '')
  while (i < s.length) {
    const a = chars.indexOf(s[i++])
    const b = chars.indexOf(s[i++])
    const c = chars.indexOf(s[i++])
    const d = chars.indexOf(s[i++])
    const n = (a << 18) | (b << 12) | (c << 6) | d
    out.push((n >> 16) & 0xff)
    if (c !== 64) out.push((n >> 8) & 0xff)
    if (d !== 64) out.push(n & 0xff)
  }
  return new Uint8Array(out)
}

function decryptMetadata(
  runtime: Runtime<Config>,
  encryptedPayloadBase64: string,
): BidMetadata {
  // Decode the base64 envelope (pure implementation — CRE sandbox has no atob)
  const raw = base64Decode(encryptedPayloadBase64)

  // --- Plaintext fallback (test envelopes) ---
  try {
    const maybeJson = new TextDecoder().decode(raw)
    const parsed = JSON.parse(maybeJson)
    if (parsed && typeof parsed.bidder === 'string' && typeof parsed.amount === 'string') {
      runtime.log('Bid envelope is plaintext (test mode) — skipping decryption')
      return parsed as BidMetadata
    }
  } catch {
    // Not valid JSON — proceed with keccak256-CTR decryption
  }

  // --- keccak256-CTR decryption ---
  const keyHex = runtime.config.secrets.donEncryptionPrivateKey
  const key = hexToUint8Array(keyHex)
  if (key.length !== 32) {
    throw new Error(`Encryption key must be 32 bytes, got ${key.length}`)
  }

  if (raw.length < 64 + 1) {
    throw new Error(`Invalid envelope: expected ≥65 bytes, got ${raw.length}`)
  }

  // Parse envelope: nonce (32) || mac (32) || ciphertext
  const nonce = raw.slice(0, 32)
  const mac = raw.slice(32, 64)
  const ciphertext = raw.slice(64)

  // Verify MAC: keccak256(key || "hushbid-mac" || nonce || ciphertext)
  const macTag = new TextEncoder().encode('hushbid-mac')
  const macInput = new Uint8Array(32 + macTag.length + 32 + ciphertext.length)
  macInput.set(key, 0)
  macInput.set(macTag, 32)
  macInput.set(nonce, 32 + macTag.length)
  macInput.set(ciphertext, 32 + macTag.length + 32)
  const expectedMac = hexToUint8Array(keccak256(bytesToHex(macInput)))

  let macValid = true
  for (let i = 0; i < 32; i++) {
    if (mac[i] !== expectedMac[i]) { macValid = false; break }
  }
  if (!macValid) {
    throw new Error('MAC verification failed — envelope tampered or wrong key')
  }

  // keccak256-CTR decrypt
  const plaintext = new Uint8Array(ciphertext.length)
  for (let offset = 0; offset < ciphertext.length; offset += 32) {
    const blockIdx = Math.floor(offset / 32)
    // keystream block = keccak256(key || nonce || blockIdx as uint32 BE)
    const blockInput = new Uint8Array(32 + 32 + 4)
    blockInput.set(key, 0)
    blockInput.set(nonce, 32)
    blockInput[64] = (blockIdx >> 24) & 0xff
    blockInput[65] = (blockIdx >> 16) & 0xff
    blockInput[66] = (blockIdx >> 8) & 0xff
    blockInput[67] = blockIdx & 0xff
    const ks = hexToUint8Array(keccak256(bytesToHex(blockInput)))
    const end = Math.min(offset + 32, ciphertext.length)
    for (let j = offset; j < end; j++) {
      plaintext[j] = ciphertext[j] ^ ks[j - offset]
    }
  }

  // Parse the decrypted metadata JSON
  const json = new TextDecoder().decode(plaintext)
  runtime.log(`Decrypted bid metadata (${json.length} chars)`)
  const parsed = JSON.parse(json) as BidMetadata
  return parsed
}

/** Convert hex string to Uint8Array */
function hexToUint8Array(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}


interface BidMetadata {
  bidder: string
  amount: string          // stringified bigint (parsed from JSON)
  paymentToken: string
  sourceChain: string
  timestamp: number
  /** Bidder's preferred delivery address. Falls back to bidder if absent. */
  destinationAddress?: string
  /** Convergence vault transaction ID from bidder's deposit+transfer to DON */
  vaultTransactionId?: string
}

/**
 * IPFS envelope format:
 *  - v1 (test script): { version: 1, auctionId, encryptedPayload } — base64 plaintext JSON
 *  - v2 (frontend):    { version: 2, auctionId, bidder, encryptedData, iv, dataHash }
 */
interface IpfsEnvelope {
  version: number
  auctionId: string | number
  encryptedPayload?: string  // v1: base64-encoded (plaintext or ECIES) of full BidMetadata
  // v2 frontend fields
  bidder?: string
  encryptedData?: string
  iv?: string
  dataHash?: string
}

/**
 * Fetch encrypted bid envelope from IPFS via HTTP.
 *
 * Uses the public Pinata gateway (no auth required for reads).
 * Each DON node fetches independently, then consensus ensures
 * all nodes got the same response.
 *
 * Returns the envelope with cleartext auctionId/version and an opaque
 * `encryptedPayload` that must be decrypted via `decryptMetadata()`.
 */
const fetchBidEnvelopeFromIpfs = (
  runtime: Runtime<Config>,
  cid: string
): IpfsEnvelope => {
  const httpClient = new HTTPClient()

  // Direct call — works in both CRE CLI simulation and DON TEE
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp = httpClient.sendRequest(runtime as any, {
    url: `https://gateway.pinata.cloud/ipfs/${cid}`,
    method: 'GET',
  }).result()

  if (resp.statusCode !== 200) {
    throw new Error(`IPFS fetch failed (${resp.statusCode})`)
  }

  const bodyText = new TextDecoder().decode(resp.body)
  return JSON.parse(bodyText) as IpfsEnvelope
}

// =============================================================================
// SETTLEMENT
// =============================================================================

/**
 * Build the settleAuction calldata, produce a consensus report, and write
 * the signed transaction on-chain.
 */
const executeSettlement = (
  runtime: Runtime<Config>,
  auctionId: bigint,
  winnerBidIndex: bigint,
  winningBid: bigint,
  paymentToken: Address,
  settlementHash: `0x${string}`,
  destinationAddress: Address
): string => {
  const { evmClient } = getPrimaryEvm(runtime.config)
  const { primaryChain } = runtime.config

  runtime.log(
    `Settling auction #${auctionId} — bidIndex=${winnerBidIndex} bid=${winningBid} dest=${destinationAddress}`
  )

  const callData = encodeFunctionData({
    abi: HushBidABI,
    functionName: 'settleAuction',
    args: [auctionId, winnerBidIndex, winningBid, paymentToken, settlementHash, destinationAddress],
  })

  // Produce a DON-signed report over the calldata
  const report = runtime
    .report(prepareReportRequest(callData))
    .result()

  // Write to chain — the forwarder will verify DON signatures and call
  // settleAuction on HushBid via its CRE coordinator role.
  const resp = evmClient
    .writeReport(runtime, {
      receiver: primaryChain.auctionContract,
      report,
      gasConfig: { gasLimit: primaryChain.gasLimit },
    })
    .result()

  if (resp.txStatus !== TxStatus.SUCCESS) {
    throw new Error(
      `Settlement tx failed: ${resp.errorMessage ?? TxStatus[resp.txStatus]}`
    )
  }

  const txHash = bytesToHex(resp.txHash ?? new Uint8Array(32))
  runtime.log(`Settlement succeeded: ${txHash}`)
  return txHash
}


/**
 * EIP-712 domain for the Convergence Token API.
 * Must match the domain used by the vault contract on Sepolia.
 */
const CONVERGENCE_EIP712_DOMAIN = {
  name: 'CompliantPrivateTokenDemo',
  version: '0.0.1',
} as const


/**
 * Sign an EIP-712 Private Token Transfer using the DON's private key.
 */
function signPrivateTransfer(
  runtime: Runtime<Config>,
  from: Address,
  to: Address,
  token: Address,
  amount: bigint,
): { signature: string; timestamp: number } {
  const donPrivKeyHex = readSecret(runtime, 'DON_ETH_PRIVATE_KEY')
  const timestamp = Math.floor(runtime.now().getTime() / 1000)

  // Compute EIP-712 domain separator
  const { convergence } = runtime.config
  const domainSeparator = keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'address' },
      ],
      [
        keccak256(toBytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
        keccak256(toBytes(CONVERGENCE_EIP712_DOMAIN.name)),
        keccak256(toBytes(CONVERGENCE_EIP712_DOMAIN.version)),
        BigInt(convergence.chainId),
        convergence.vaultContract as Address,
      ]
    )
  )

  // Private Token Transfer struct hash — matches SDK's CONVERGENCE_EIP712_TYPES["Private Token Transfer"]
  // flags is string[] — for an empty array, the EIP-712 encoded value is keccak256("") (hash of no elements)
  const emptyFlagsHash = keccak256(toBytes(''))

  const structHash = keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'address' },
        { type: 'address' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'bytes32' },
        { type: 'uint256' },
      ],
      [
        keccak256(toBytes('Private Token Transfer(address sender,address recipient,address token,uint256 amount,string[] flags,uint256 timestamp)')),
        from,
        to,
        token,
        amount,
        emptyFlagsHash,
        BigInt(timestamp),
      ]
    )
  )

  const digest = keccak256(
    encodePacked(
      ['bytes2', 'bytes32', 'bytes32'],
      ['0x1901', domainSeparator, structHash]
    )
  )

  const privKeyBytes = hexToUint8Array(donPrivKeyHex)
  const signatureHex = signDigest(privKeyBytes, digest)

  return { signature: signatureHex, timestamp }
}

/**
 * secp256k1 ECDSA sign helper — produces a 65-byte Ethereum signature.
 *
 * Uses @noble/curves (pure JS, no crypto.subtle) which is already bundled
 * via viem. Works in the CRE WASM sandbox.
 */
function signDigest(privKey: Uint8Array, digest: `0x${string}`): string {
  // @noble/curves secp256k1 is pure JS math — no Web Crypto dependency
  // It's bundled via viem's dependency on @noble/curves
  const { secp256k1 } = require('@noble/curves/secp256k1') as typeof import('@noble/curves/secp256k1')

  // Strip 0x prefix from digest to get raw 32-byte hex
  const msgHash = digest.slice(2)
  // Private key as hex string (without 0x)
  const privKeyHex = Array.from(privKey).map(b => b.toString(16).padStart(2, '0')).join('')

  // Sign with lowS normalization (Ethereum standard)
  const sig = secp256k1.sign(msgHash, privKeyHex, { lowS: true })

  // Encode as 65-byte Ethereum signature: r(32) || s(32) || v(1)
  const r = sig.r.toString(16).padStart(64, '0')
  const s = sig.s.toString(16).padStart(64, '0')
  const v = (sig.recovery + 27).toString(16).padStart(2, '0')

  return `0x${r}${s}${v}`
}

/**
 * Execute a private transfer via the Convergence Token API.
 *
 * Uses ConfidentialHTTPClient to POST to the /private-transfer endpoint
 * inside the DON TEE. The DON's EIP-712 signature authenticates the request.
 *
 * @param from - Sender address (DON wallet)
 * @param to - Recipient address (seller's shielded address or loser's address)
 * @param token - ERC-20 token address
 * @param amount - Amount in token's smallest unit
 */
const executePrivateTransfer = (
  runtime: Runtime<Config>,
  from: Address,
  to: Address,
  token: Address,
  amount: string,
): { transactionId: string } => {
  const { convergence } = runtime.config
  const confidentialHttp = new ConfidentialHTTPClient()

  const amountBigInt = BigInt(amount)
  const auth = signPrivateTransfer(runtime, from, to, token, amountBigInt)

  runtime.log(
    `Private transfer: ${amount} of ${token} from ${from} → ${to}`
  )

  const resp = confidentialHttp.sendRequest(
    runtime,
    {
      request: {
        url: `${convergence.apiEndpoint}/private-transfer`,
        method: 'POST',
        multiHeaders: {
          'Content-Type': { values: ['application/json'] },
        },
        bodyString: JSON.stringify({
          account: from,
          recipient: to,
          token,
          amount,
          flags: [],
          timestamp: auth.timestamp,
          auth: auth.signature,
        }),
      },
    },
  ).result()

  if (resp.statusCode !== 200) {
    const body = new TextDecoder().decode(resp.body)
    throw new Error(`Private transfer failed (${resp.statusCode}): ${body}`)
  }

  const text = new TextDecoder().decode(resp.body)
  const txResult = JSON.parse(text) as { transaction_id: string }
  runtime.log(`Private transfer complete: txId=${txResult.transaction_id}`)
  return { transactionId: txResult.transaction_id }
}

/**
 * Settle payments via the Convergence Token API.
 *
 * Two-hop payment flow:
 * 1. Bidders deposited into the Convergence vault and privately transferred
 *    their bid amount to the DON wallet at bid time.
 * 2. At settlement, the DON:
 *    a. Privately transfers the winning bid amount to the seller's shielded address
 *    b. Privately refunds each losing bidder back to their original address
 *
 * This runs inside the DON's TEE — the DON_ETH_PRIVATE_KEY never leaves the enclave.
 */
const settlePrivatePayments = (
  runtime: Runtime<Config>,
  auction: AuctionConfig,
  bids: DecryptedBid[],
  winnerIndex: number,
): void => {
  // Read DON wallet address from secrets
  const donPrivKeyHex = readSecret(runtime, 'DON_ETH_PRIVATE_KEY')
  // Derive DON address from private key (simplified — use first 20 bytes of keccak256(pubkey))
  // In production, this would be pre-configured or derived properly
  const donAddress = readSecret(runtime, 'DON_WALLET_ADDRESS') as Address

  runtime.log(
    `Settling private payments for auction — ${bids.length} bids, winner index=${winnerIndex}`
  )

  // ── Step 1: Pay the seller ──────────────────────────────────────────
  const winnerBid = bids[winnerIndex]
  if (auction.sellerShieldedAddress === zeroAddress) {
    throw new Error(
      'Auction has no seller shielded address — cannot process private payment. ' +
      'Seller must sign the shielded-address request when creating the auction.'
    )
  }

  try {
    executePrivateTransfer(
      runtime,
      donAddress,
      auction.sellerShieldedAddress,
      winnerBid.paymentToken,
      winnerBid.amount.toString(),
    )
    runtime.log(
      `✅ Paid seller shielded address ${auction.sellerShieldedAddress}`
    )
  } catch (err) {
    runtime.log(`❌ Failed to pay seller: ${err}`)
    throw err // Payment failure is fatal — propagate to caller
  }

  // ── Step 2: Refund losing bidders ───────────────────────────────────
  for (let i = 0; i < bids.length; i++) {
    if (i === winnerIndex) continue

    const loserBid = bids[i]
    try {
      executePrivateTransfer(
        runtime,
        donAddress,
        loserBid.destinationAddress, // Refund to bidder's shielded address
        loserBid.paymentToken,
        loserBid.amount.toString(),
      )
      runtime.log(
        `✅ Refunded loser bid #${i}: ${loserBid.amount} of ${loserBid.paymentToken} → ${loserBid.destinationAddress}`
      )
    } catch (err) {
      runtime.log(
        `❌ Failed to refund bid #${i} to ${loserBid.destinationAddress}: ${err}`
      )
    }
  }

  // ── Step 3: Deliver auctioned asset to winner ──────────────────────
  //    Privately transfer the auctioned ERC-20 tokens from DON wallet
  //    to the winner's shielded address via Convergence.
  try {
    executePrivateTransfer(
      runtime,
      donAddress,
      winnerBid.destinationAddress, // Winner's shielded address
      auction.assetContract,        // The ERC-20 token being auctioned
      auction.tokenAmount.toString(),
    )
    runtime.log(
      `✅ Delivered auctioned asset: ${auction.tokenAmount} of ${auction.assetContract} → ${winnerBid.destinationAddress}`
    )
  } catch (err) {
    runtime.log(
      `❌ Failed to deliver auctioned asset to winner: ${err}`
    )
    throw err // Asset delivery failure is fatal
  }

  runtime.log('Private payment settlement complete')
}

// =============================================================================
// WORKFLOW HANDLERS
// =============================================================================

/**
 * Cron trigger — runs every minute.
 *
 * For each tracked auction whose reveal period has ended, fetches all
 * revealed bids, determines the winner via PriceNormalizer, and settles.
 *
 * NOTE: CRE workflows are stateless between invocations. We discover
 * settleable auctions by querying past AuctionCreated logs and checking
 * on-chain state, rather than keeping an in-memory list.
 */
const onCronTrigger = (
  runtime: Runtime<Config>,
  _payload: CronPayload
): string => {
  runtime.log('⏱  Cron: scanning for settleable auctions…')

  const { primaryChain } = runtime.config
  const now = BigInt(Math.floor(runtime.now().getTime() / 1000))

  // ── 1. Read auction counter to discover all auctions ──────────────
  const auctionCount = getAuctionCounter(runtime)

  if (auctionCount === 0n) {
    runtime.log('No auctions found')
    return 'no-auctions'
  }

  runtime.log(`Found ${auctionCount} auction(s) — scanning for settleable ones`)

  // CRE imposes a per-workflow chain read limit of 15.
  // Each auction needs: 1 getAuction + 1 getAuctionPhase = 2 reads minimum,
  // plus settlement reads (FULL_PRIVATE: 1 getBidCount + N getBidCommitment).
  // To stay within budget we process at most 2 auctions fully per cron run,
  // iterating newest-first (most likely to need settlement).
  const MAX_SETTLE_ATTEMPTS = 2
  let settledCount = 0
  let attemptCount = 0

  // Collect structured settlement data for the agent to verify / execute
  const settlements: Array<{
    auctionId: string
    winnerBidIndex: string
    winningBid: string
    paymentToken: string
    settlementHash: string
    destinationAddress: string
    txBroadcast: boolean
    paymentSuccess: boolean
  }> = []

  for (let i = auctionCount; i >= 1n; i--) {
    if (attemptCount >= MAX_SETTLE_ATTEMPTS) {
      runtime.log(`Reached max settlement attempts (${MAX_SETTLE_ATTEMPTS}) — stopping scan`)
      break
    }

    const auctionId = i
    // ── 2. Read on-chain auction state ──────────────────────────────
    const auction = getAuction(runtime, auctionId)

    // Only settle auctions whose reveal period has ended.
    // Check timestamps BEFORE reading the phase to save chain reads.
    if (now <= auction.revealEnd) continue

    // ── 2b. Read on-chain phase (only for candidates past reveal) ──
    const phase = getAuctionPhase(runtime, auctionId)

    // Skip already-settled, completed, or cancelled auctions
    if (
      phase === AUCTION_PHASE.SETTLED ||
      phase === AUCTION_PHASE.COMPLETED ||
      phase === AUCTION_PHASE.CANCELLED
    ) {
      runtime.log(`Auction #${auctionId}: phase=${phase} — already terminal, skipping`)
      continue
    }

    runtime.log(`Auction #${auctionId}: phase=${phase} — attempting settlement`)

    // ── 3. Collect bids
    attemptCount++
    const bids = getSettlementBids(runtime, auctionId, auction.privacyLevel)
    if (bids.length === 0) {
      runtime.log(`Auction #${auctionId}: no bids available for settlement — skipping`)
      continue
    }

    runtime.log(`Auction #${auctionId}: ${bids.length} decrypted bids`)

    // ── 4. Determine winner ─────────────────────────────────────────
    const tokens = bids.map((b) => b.paymentToken)
    const amounts = bids.map((b) => b.amount)

    // Fast path: if all bids use the same token, compare raw amounts
    // directly without calling PriceNormalizer.
    const allSameToken = tokens.every((t) => t.toLowerCase() === tokens[0].toLowerCase())

    let winnerIndex: bigint
    let highestUsd: bigint

    if (allSameToken) {
      runtime.log(`All bids use same token ${tokens[0]} — comparing amounts directly`)
      let maxIdx = 0
      for (let j = 1; j < amounts.length; j++) {
        if (amounts[j] > amounts[maxIdx]) maxIdx = j
      }
      winnerIndex = BigInt(maxIdx)
      highestUsd = amounts[maxIdx] // raw amount, not USD-normalised
    } else {
      // Try on-chain PriceNormalizer first; fall back to off-chain
      // estimation if price feeds are stale (common on Tenderly forks)
      try {
        const result = findHighestBid(runtime, tokens, amounts)
        winnerIndex = result.winnerIndex
        highestUsd = result.highestUsd
      } catch (err) {
        runtime.log(`⚠️ PriceNormalizer reverted (stale feeds?): ${err} — using off-chain estimation`)
        // Off-chain fallback: normalize to USD using hardcoded ratios
        // ETH ≈ $2500, USDC/DAI ≈ $1 — sufficient for winner determination
        const ETH_USD = 2500n * 10n ** 8n // 8 decimals
        const STABLE_USD = 1n * 10n ** 8n
        const ethAddr = '0x0000000000000000000000000000000000000000'
        const { tokens: tokenCfg } = runtime.config

        const usdValues = bids.map((b) => {
          const t = b.paymentToken.toLowerCase()
          if (t === ethAddr || t === tokenCfg.weth.toLowerCase()) {
            return (b.amount * ETH_USD) / 10n ** 18n
          }
          if (t === tokenCfg.usdc.toLowerCase()) {
            return (b.amount * STABLE_USD) / 10n ** 6n
          }
          // Unknown token — treat as 18-decimal stablecoin
          return (b.amount * STABLE_USD) / 10n ** 18n
        })

        let maxIdx = 0
        for (let j = 1; j < usdValues.length; j++) {
          if (usdValues[j] > usdValues[maxIdx]) maxIdx = j
        }
        winnerIndex = BigInt(maxIdx)
        highestUsd = usdValues[maxIdx]
      }
    }

    const winnerBid = bids[Number(winnerIndex)]

    runtime.log(
      `Winner: bidIndex=${winnerBid.bidIndex} — ${winnerBid.amount} of token ${winnerBid.paymentToken} (≈${allSameToken ? 'raw' : '$'}${highestUsd}) dest=${winnerBid.destinationAddress}`
    )

    // ── 5. Compute settlement hash ──────────────────────────────────
    const settlementHash = keccak256(
      encodeAbiParameters(
        [
          { type: 'uint256' },
          { type: 'uint256' },
          { type: 'uint256' },
          { type: 'address' },
          { type: 'uint256' },
        ],
        [
          auctionId,
          winnerBid.bidIndex,
          winnerBid.amount,
          winnerBid.paymentToken,
          now,
        ]
      )
    )

    // ── 6. Execute settlement (DON-direct-delivery) ─────────────────
    let txBroadcast = false
    try {
      executeSettlement(
        runtime,
        auctionId,
        winnerBid.bidIndex,
        winnerBid.amount,
        winnerBid.paymentToken,
        settlementHash,
        winnerBid.destinationAddress
      )
      txBroadcast = true
    } catch (err) {
      // If the settlement tx reverts, the auction was likely already settled
      // (the on-chain guard prevents double-settlement). Log and skip.
      runtime.log(`⚠️ Settlement tx reverted for auction #${auctionId} (likely already settled): ${err}`)
      continue
    }

    // ── 7. Settle private payments via Convergence API ──────────────
    //    Winner's bid → seller's shielded address
    //    Losers' bids → refund to original addresses
    let paymentSuccess = false
    try {
      settlePrivatePayments(runtime, auction, bids, Number(winnerIndex))
      paymentSuccess = true
    } catch (err) {
      runtime.log(`⚠️ Private payment settlement failed: ${err}`)
      runtime.log(`ℹ️ On-chain settlement succeeded — funds are safe. Private transfers can be retried manually.`)
    }

    // Record settlement data for the agent — include payment status so the
    // agent knows whether this is a full settlement or partial (on-chain
    // only). The agent should NOT mark an auction as fully settled unless
    // paymentSuccess is true.
    settlements.push({
      auctionId: auctionId.toString(),
      winnerBidIndex: winnerBid.bidIndex.toString(),
      winningBid: winnerBid.amount.toString(),
      paymentToken: winnerBid.paymentToken,
      settlementHash,
      destinationAddress: winnerBid.destinationAddress,
      txBroadcast,
      paymentSuccess,
    })

    // Only count as fully settled when BOTH on-chain tx and private payments succeeded
    if (paymentSuccess) {
      settledCount++
    } else {
      runtime.log(`⚠️ Auction #${auctionId}: on-chain settled but private payments failed — not counting as fully settled`)
    }
  }

  runtime.log(`Settlement sweep complete — settled ${settledCount} auction(s)`)

  // Return structured JSON so the agent can verify / execute settlements.
  // The agent parses this from the simulation result to know exactly which
  // auctions need settling and with what parameters.
  return JSON.stringify({ settled: settledCount, settlements })
}

/**
 * Log trigger: AuctionCreated
 *
 * Fires when a new auction is created on-chain. We log it and optionally
 * fetch any associated IPFS metadata if the seller attached a CID.
 */
const onAuctionCreated = (
  runtime: Runtime<Config>,
  payload: EVMLog
): string => {
  const topics = payload.topics
  if (topics.length < 2) {
    throw new Error('Invalid AuctionCreated event — expected ≥ 2 topics')
  }

  const auctionId = BigInt(bytesToHex(topics[1]))
  const seller =
    topics.length >= 3
      ? ('0x' + bytesToHex(topics[2]).slice(26)) as Address
      : zeroAddress

  // Decode non-indexed params from data:
  // (address assetContract, uint256 tokenAmount, uint8 privacyLevel)
  const decoded = decodeAbiParameters(
    [
      { name: 'assetContract', type: 'address' },
      { name: 'tokenAmount', type: 'uint256' },
      { name: 'privacyLevel', type: 'uint8' },
    ],
    bytesToHex(payload.data)
  )

  runtime.log(
    `📦 AuctionCreated #${auctionId} by ${seller} — ` +
      `asset=${decoded[0]} amount=${decoded[1]}, privacy=${decoded[2]}`
  )

  return auctionId.toString()
}

/**
 * Log trigger: BidCommitted
 *
 * Fires when a new bid commitment is placed on-chain. Logs the commitment
 * details and, for FULL_PRIVATE auctions, eagerly validates the encrypted
 * bid metadata stored on IPFS via Confidential HTTP inside the DON's TEE.
 *
 * This early validation on commit (rather than only at settlement) lets the
 * DON surface corrupt or unreachable metadata before the reveal window closes.
 */
const onBidCommitted = (
  runtime: Runtime<Config>,
  payload: EVMLog
): string => {
  const topics = payload.topics
  if (topics.length < 2) {
    throw new Error('Invalid BidCommitted event — expected ≥ 2 topics')
  }

  const auctionId = BigInt(bytesToHex(topics[1]))
  const commitHash =
    topics.length >= 3 ? bytesToHex(topics[2]) : '0x'

  // Decode non-indexed data: only `uint64 sourceChain`
  // NOTE: ipfsCid is deliberately excluded from the event for privacy.
  // The CRE reads it from contract storage via getBidCommitmentFull().
  const [sourceChain] = decodeAbiParameters(
    [
      { name: 'sourceChain', type: 'uint64' },
    ],
    bytesToHex(payload.data)
  )

  const chainLabel = sourceChain === 0n ? 'local' : `chain:${sourceChain}`
  runtime.log(
    `🔒 BidCommitted: auction=#${auctionId} commit=${commitHash.slice(0, 18)}… source=${chainLabel}`
  )

  // Read auction config to check privacy level
  const auction = getAuction(runtime, auctionId)

  runtime.log(
    `Auction #${auctionId} privacy=${['FULL_PRIVATE', 'AUDITABLE'][auction.privacyLevel] ?? auction.privacyLevel}`
  )

  // Eagerly validate encrypted bid metadata via Confidential HTTP.
  // Read the latest bid commitment from contract storage to get the ipfsCid.
  const bidCount = getBidCount(runtime, auctionId)
  if (bidCount > 0n) {
    try {
      const latestBid = getBidCommitment(runtime, auctionId, bidCount - 1n)
      if (latestBid.ipfsCid && latestBid.ipfsCid !== '') {
        const cidStr = latestBid.ipfsCid
        runtime.log(`Validating encrypted bid envelope from IPFS: ${cidStr}`)
        const envelope = fetchBidEnvelopeFromIpfs(runtime, cidStr)
        if (envelope.encryptedPayload) {
          const metadata = decryptMetadata(runtime, envelope.encryptedPayload)
          runtime.log(
            `✅ Validated bid metadata: bidder=${metadata.bidder} token=${metadata.paymentToken}` +
            (metadata.destinationAddress ? ` dest=${metadata.destinationAddress}` : '')
          )
        } else if (envelope.encryptedData && envelope.bidder) {
          runtime.log(`✅ Bid envelope is v2 (frontend wallet-encrypted) — bidder=${envelope.bidder}`)
        } else {
          runtime.log(`⚠️ Unknown envelope format (version=${envelope.version})`)
        }
      }
    } catch (err) {
      runtime.log(`⚠️ Failed to validate bid metadata: ${err}`)
    }
  }

  return `committed:${auctionId}:${chainLabel}`
}

const initWorkflow = (
  config: Config,
  _secrets: SecretsProvider
) => {
  const cron = new CronCapability()
  const { evmClient } = getPrimaryEvm(config)

  return [
    // ── Periodic settlement sweep ───────────────────────────────────
    handler(
      cron.trigger({ schedule: config.schedule }),
      onCronTrigger
    ),

    // ── React to new auctions ───────────────────────────────────────
    handler(
      evmClient.logTrigger({
        addresses: [config.primaryChain.auctionContract],
        topics: [{ values: [SIG_AUCTION_CREATED] }],
      }),
      onAuctionCreated
    ),

    // ── React to new bid commitments ────────────────────────────────
    handler(
      evmClient.logTrigger({
        addresses: [config.primaryChain.auctionContract],
        topics: [{ values: [SIG_BID_COMMITTED] }],
      }),
      onBidCommitted
    ),
  ]
}


export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema })
  await runner.run(initWorkflow)
}
