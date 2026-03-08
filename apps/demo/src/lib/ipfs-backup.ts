import { PinataSDK } from 'pinata';
import { keccak256, toBytes, type Address } from 'viem';
import { signMessage } from '@wagmi/core';
import { config } from '../config/wagmi';
import { encryptForDon } from '@hushbid/sdk';
import { getCreConfig } from '../config/addresses';

// Initialize Pinata client
const pinata = new PinataSDK({
  pinataJwt: import.meta.env.VITE_PINATA_JWT || '',
  pinataGateway: import.meta.env.VITE_PINATA_GATEWAY || 'gateway.pinata.cloud',
});

/**
 * Encrypted bid backup stored on IPFS (v2 with AES-GCM)
 */
export interface EncryptedBidBackup {
  version: 2;
  auctionId: number;
  bidder: Address;
  // AES-GCM encrypted data (base64)
  encryptedData: string;
  // AES-GCM initialization vector (base64)
  iv: string;
  // Hash of plaintext for integrity verification
  dataHash: string;
  timestamp: number;
}

/**
 * Bid data before encryption
 */
interface BidData {
  auctionId: number;
  bidder: Address;
  amount: string;
  salt: `0x${string}`;
  paymentToken: Address;
}

/**
 * Deterministic message for key derivation - user signs this to create encryption key
 */
function getSigningMessage(auctionId: number, bidder: Address): string {
  return `HushBid Protocol Bid Encryption Key\n\nAuction: ${auctionId}\nBidder: ${bidder}\n\nSign this message to encrypt/decrypt your bid data. This signature is used locally and never sent to any server.`;
}

/**
 * Derive a 256-bit AES key from a wallet signature
 */
async function deriveKeyFromSignature(signature: `0x${string}`): Promise<CryptoKey> {
  // Hash the signature to get 32 bytes for AES-256
  const keyMaterial = keccak256(signature);
  const keyBytes = toBytes(keyMaterial);

  // Convert to ArrayBuffer for Web Crypto API
  const keyBuffer = new Uint8Array(keyBytes).buffer;

  return crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Request user to sign message for key derivation
 * Caches the signature in sessionStorage for the session
 */
async function getEncryptionKey(auctionId: number, bidder: Address): Promise<CryptoKey> {
  const cacheKey = `hush-bid-sig-${auctionId}-${bidder}`;
  
  // Check session cache first
  let signature = sessionStorage.getItem(cacheKey) as `0x${string}` | null;
  
  if (!signature) {
    // Request signature from wallet
    const message = getSigningMessage(auctionId, bidder);
    const signed = await signMessage(config, { message });
    if (!signed) throw new Error('Wallet signature required for bid encryption');
    signature = signed;
    
    // Cache for this session only (cleared on browser close)
    sessionStorage.setItem(cacheKey, signature);
  }

  return deriveKeyFromSignature(signature);
}

/**
 * Decrypt bid data using AES-256-GCM
 */
async function decryptBidData(
  encrypted: string,
  iv: string,
  key: CryptoKey
): Promise<BidData> {
  const encryptedBytes = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0));

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    encryptedBytes
  );

  const json = new TextDecoder().decode(decryptedBuffer);
  return JSON.parse(json);
}

/**
 * Create a deterministic filename for bid backup
 */
function getBidFileName(auctionId: number, bidder: Address): string {
  const hash = keccak256(toBytes(`${auctionId}-${bidder}`));
  return `hush-bid-${hash.slice(0, 16)}.json`;
}

/**
 * Upload encrypted bid data to IPFS via Pinata
 * User signs a message to derive the encryption key
 */
export async function backupBidToIPFS(
  auctionId: number,
  bidder: Address,
  amount: bigint,
  _salt: `0x${string}`,
  paymentToken: Address
): Promise<{ cid: string; success: boolean }> {
  try {
    // Build metadata that the CRE DON needs for settlement
    const metadata = {
      bidder,
      amount: amount.toString(),
      paymentToken,
      sourceChain: '11155111',
      timestamp: Math.floor(Date.now() / 1000),
      destinationAddress: bidder,
    };

    // keccak256-CTR encrypt with DON shared key
    // Only the DON inside the TEE can decrypt this with the matching key.
    const creConfig = getCreConfig();
    let encryptedPayload: string;
    if (creConfig.donPublicKey) {
      const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
      encryptedPayload = encryptForDon(creConfig, metadataBytes);
    } else {
      // Fallback: base64 plaintext (dev/test only — no DON key configured)
      encryptedPayload = btoa(JSON.stringify(metadata));
    }

    const envelope = {
      version: 1,
      auctionId,
      encryptedPayload,
    };

    // Upload to IPFS
    const upload = await pinata.upload.public
      .json(envelope)
      .name(getBidFileName(auctionId, bidder))
      .keyvalues({
        type: 'hush-bid-backup',
        auctionId: auctionId.toString(),
        bidder,
      });

    console.log('Bid backed up to IPFS:', upload.cid);

    // Also store locally with wallet encryption for user recovery
    localStorage.setItem(
      `hush-bid-cid-${auctionId}-${bidder}`,
      upload.cid
    );

    return { cid: upload.cid, success: true };
  } catch (error) {
    console.error('Failed to backup bid to IPFS:', error);
    return { cid: '', success: false };
  }
}

/**
 * Restore bid data from IPFS backup
 * User signs a message to derive the decryption key
 */
export async function restoreBidFromIPFS(
  auctionId: number,
  bidder: Address,
  cid?: string
): Promise<{
  amount: bigint;
  salt: `0x${string}`;
  paymentToken: Address;
} | null> {
  try {
    // Try to get CID from localStorage if not provided
    const storedCid = cid || localStorage.getItem(`hush-bid-cid-${auctionId}-${bidder}`);

    if (!storedCid) {
      console.log('No backup CID found');
      return null;
    }

    // Fetch from IPFS via gateway
    const response = await pinata.gateways.public.get(storedCid);
    const backup = response.data as unknown as EncryptedBidBackup;

    // Verify this is for the right auction and bidder
    if (backup.auctionId !== auctionId || backup.bidder !== bidder) {
      console.error('Backup mismatch');
      return null;
    }

    // Check version - v2 uses AES-GCM
    if (backup.version !== 2) {
      console.error('Unsupported backup version:', backup.version);
      return null;
    }

    // Get decryption key from wallet signature
    const key = await getEncryptionKey(auctionId, bidder);

    // Decrypt the data
    const bidData = await decryptBidData(backup.encryptedData, backup.iv, key);

    // Verify hash
    const expectedHash = keccak256(toBytes(JSON.stringify(bidData)));
    if (expectedHash !== backup.dataHash) {
      console.error('Data integrity check failed');
      return null;
    }

    return {
      amount: BigInt(bidData.amount),
      salt: bidData.salt,
      paymentToken: bidData.paymentToken,
    };
  } catch (error) {
    console.error('Failed to restore bid from IPFS:', error);
    return null;
  }
}

/**
 * Get the IPFS gateway URL for a backup
 */
export function getBackupUrl(cid: string): string {
  const gateway = import.meta.env.VITE_PINATA_GATEWAY || 'gateway.pinata.cloud';
  return `https://${gateway}/ipfs/${cid}`;
}

/**
 * Check if Pinata is configured
 */
export function isPinataConfigured(): boolean {
  return Boolean(import.meta.env.VITE_PINATA_JWT);
}

/**
 * Clear cached encryption signatures (call on disconnect)
 */
export function clearEncryptionCache(): void {
  // Clear all hush-bid signature caches
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const key = sessionStorage.key(i);
    if (key?.startsWith('hush-bid-sig-')) {
      sessionStorage.removeItem(key);
    }
  }
}
