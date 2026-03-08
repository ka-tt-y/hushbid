import { useState, useEffect } from 'react';
import { X, Lock, Info, ChevronDown, ExternalLink } from 'lucide-react';
import { useAccount, useChainId, useWalletClient, usePublicClient } from 'wagmi';
import { parseEther, formatEther, type Address } from 'viem';
import { WorldIdVerify } from './WorldIdVerify';
import { StepProgress } from './StepProgress';
import { generateSalt, generateCommitment, storeBidLocally } from '../lib/utils';
import { isPinataConfigured } from '../lib/ipfs-backup';
import { isCreConfigured, submitBidToCre, encryptForDon, PrivacyLevel, HUSH_BID_ABI } from '@hushbid/sdk';
import { privateTransfer, createConvergenceSigner, generateShieldedAddress, approveVault, depositToVault, checkDepositAllowed, getVaultBalances } from '@hushbid/sdk';
import { getTokenAddress, type SupportedChain } from '@hushbid/sdk';
import { getCreConfig, getConvergenceAddresses } from '../config/addresses';
import { useTokenPrices } from '../hooks/useTokenPrices';
import type { WorldIdProof } from './WorldIdVerify';
import { WORLD_ID } from '../config/wagmi';

/** WETH ABI for wrapping ETH → WETH (deposit function) */
const WETH_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
] as const;

/** Minimal ERC-20 ABI for balance check */
const ERC20_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// Check if a real app_id is configured (not the placeholder)
const isWorldIdConfigured = (() => {
  const id = WORLD_ID.appId;
  return id && id.startsWith('app_') && id !== 'app_hushbid';
})();

interface BidModalProps {
  auctionId: number;
  biddingEnd: number;
  privacyLevel: number;
  worldIdRequired: boolean;
  onClose: () => void;
  onSubmit: (commitment: `0x${string}`, ipfsCid: string, proof?: WorldIdProof) => Promise<string>;
}

// Map chain IDs to SDK chain names
const chainIdToSdkChain: Record<number, SupportedChain> = {
  11155111: 'sepolia',
};

export function BidModal({ auctionId, biddingEnd, privacyLevel, worldIdRequired, onClose, onSubmit }: BidModalProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { getUsdValue } = useTokenPrices();
  const [amount, setAmount] = useState('');
  const [paymentToken, setPaymentToken] = useState<string>('ETH');
  const [worldIdProof, setWorldIdProof] = useState<WorldIdProof | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vaultTxId, setVaultTxId] = useState<string | null>(null);
  const [txLog, setTxLog] = useState<{ label: string; hash: string; isOnChain: boolean }[]>([]);
  const [showTxLog, setShowTxLog] = useState(false);
  const [step, setStep] = useState<{ current: number; total: number; message: string; description?: string } | null>(null);
  const [wethBalance, setWethBalance] = useState<string | null>(null);

  // Fetch WETH balance when paying with WETH
  useEffect(() => {
    if (paymentToken !== 'WETH' || !address || !publicClient) return;
    const wethAddr = getTokenAddr('WETH');
    publicClient.readContract({
      address: wethAddr,
      abi: ERC20_BALANCE_ABI,
      functionName: 'balanceOf',
      args: [address],
    }).then((bal) => {
      setWethBalance(formatEther(bal as bigint));
    }).catch(() => setWethBalance(null));
  }, [paymentToken, address, publicClient]);

  // Get chain name and available tokens
  const chainName: SupportedChain = chainIdToSdkChain[chainId] || 'sepolia';
  // Get token address from SDK
  const getTokenAddr = (symbol: string): Address => {
    const addr = getTokenAddress(symbol, chainName);
    return (addr || '0x0000000000000000000000000000000000000000') as Address;
  };

  const handleSubmit = async () => {
    if (!address || !amount || !walletClient || !publicClient) return;

    // Check if bidding deadline has passed
    const now = Math.floor(Date.now() / 1000);
    if (now > biddingEnd) {
      setError('Bidding period has ended for this auction.');
      return;
    }

    // On-chain duplicate bid check before hitting the contract
    try {
      const { getContractAddresses } = await import('../config/addresses');
      const { createPublicClient, http } = await import('viem');
      const rpcUrl = import.meta.env.VITE_RPC_URL_SEPOLIA;
      const { hushBid } = getContractAddresses();
      const pc = createPublicClient({ transport: http(rpcUrl) });
      const alreadyBid = await pc.readContract({
        address: hushBid,
        abi: HUSH_BID_ABI,
        functionName: 'hasBid',
        args: [BigInt(auctionId), address],
      });
      if (alreadyBid) {
        setError('You have already placed a bid on this auction. Only one bid per address is allowed.');
        return;
      }
    } catch (e) {
      console.warn('hasBid pre-check failed, proceeding:', e);
    }

    // World ID nullifier duplicate check before hitting the contract
    if (worldIdRequired && worldIdProof) {
      try {
        const { getContractAddresses } = await import('../config/addresses');
        const { createPublicClient, http } = await import('viem');
        const rpcUrl = import.meta.env.VITE_RPC_URL_SEPOLIA;
        const { hushBid } = getContractAddresses();
        const pc = createPublicClient({ transport: http(rpcUrl) });
        const nullifierUsed = await pc.readContract({
          address: hushBid,
          abi: HUSH_BID_ABI,
          functionName: 'auctionNullifierHashes',
          args: [BigInt(auctionId), BigInt(worldIdProof.nullifier_hash)],
        });
        if (nullifierUsed) {
          setError('Your World ID has already been used to bid on this auction. Each verified human can only bid once per auction.');
          return;
        }
      } catch (e) {
        console.warn('nullifier pre-check failed, proceeding:', e);
      }
    }
    
    try {
      setIsSubmitting(true);
      setError(null);
      setStep(null);

      const bidAmount = paymentToken === 'USDC' || paymentToken === 'USDT'
        ? BigInt(parseFloat(amount) * 1e6) // 6 decimals for stablecoins
        : parseEther(amount);
      
      const salt = generateSalt();
      const commitment = generateCommitment(address, bidAmount, salt);

      // For ETH bids, we wrap to WETH first (the vault requires ERC-20)
      const isNativeEth = paymentToken === 'ETH';
      const vaultTokenAddress: Address = isNativeEth
        ? getTokenAddr('WETH')   // vault uses WETH
        : getTokenAddr(paymentToken);

      const convergence = getConvergenceAddresses();
      const donWallet = convergence.donWallet;

      // ═══════════════════════════════════════════════════════════════
      // VAULT DEPOSIT PIPELINE
      // Step 1 (if ETH): Wrap ETH → WETH
      // Step 2: Pre-flight deposit check
      // Step 3: Approve ERC-20 to Convergence vault
      // Step 4: Deposit ERC-20 into Convergence vault
      // Step 5: Private-transfer from bidder → DON wallet inside vault
      // ═══════════════════════════════════════════════════════════════

      // Total steps: ETH payments get 9 (wrap included), non-ETH get 8
      const TOTAL = isNativeEth ? 9 : 8;
      let s = 0; // step counter (incremented before each step)

      // Step 1: Wrap ETH → WETH if paying with native ETH
      if (isNativeEth) {
        s++;
        setStep({ current: s, total: TOTAL, message: 'Wrapping ETH → WETH — confirm in wallet…', description: 'The Convergence vault only accepts ERC-20 tokens. This converts your ETH to WETH (Wrapped ETH) — same value, just a token wrapper.' });
        const wrapTx = await walletClient.writeContract({
          address: vaultTokenAddress,
          abi: WETH_ABI,
          functionName: 'deposit',
          value: bidAmount,
          chain: walletClient.chain,
          account: walletClient.account!,
        });
        await publicClient.waitForTransactionReceipt({ hash: wrapTx });
        setTxLog(prev => [...prev, { label: 'Wrap ETH → WETH', hash: wrapTx, isOnChain: true }]);
        console.log('Wrapped ETH → WETH:', wrapTx);
      }

      // Step 2: Pre-flight deposit check
      s++;
      setStep({ current: s, total: TOTAL, message: 'Checking vault deposit eligibility…', description: 'Verifying this token is registered on the Convergence vault and your deposit amount is within policy limits.' });
      const depositCheck = await checkDepositAllowed(publicClient, address, vaultTokenAddress, bidAmount);
      if (!depositCheck.allowed) {
        throw new Error(
          `Token ${vaultTokenAddress} is not eligible for vault deposit: ${depositCheck.reason}. ` +
          'The token must be registered with a PolicyEngine on the Convergence vault.'
        );
      }

      // Step 3: Approve ERC-20 to vault (using SDK function)
      s++;
      setStep({ current: s, total: TOTAL, message: 'Approving token to vault — confirm in wallet…', description: 'Granting the Convergence vault permission to receive your tokens. This is a standard ERC-20 approve transaction.' });
      const approveTxHash = await approveVault(walletClient, publicClient, {
        token: vaultTokenAddress,
        amount: bidAmount,
      });
      setTxLog(prev => [...prev, { label: 'Approve vault', hash: approveTxHash, isOnChain: true }]);
      console.log('Token approved to vault:', approveTxHash);

      // Step 4: Deposit into Convergence vault (using SDK function)
      s++;
      setStep({ current: s, total: TOTAL, message: 'Depositing into Convergence vault — confirm in wallet…', description: 'Moving your tokens into the privacy-preserving vault. Once inside, balances and transfers are shielded from on-chain observers.' });
      const depositTxHash = await depositToVault(walletClient, publicClient, {
        token: vaultTokenAddress,
        amount: bidAmount,
      });
      setTxLog(prev => [...prev, { label: 'Deposit to vault', hash: depositTxHash, isOnChain: true }]);
      console.log('Deposited into vault:', depositTxHash);

      // Step 5: Private-transfer from bidder → DON wallet
      let transferResult: { success: boolean; transactionId?: string; error?: string };

      {
        s++;
        setStep({ current: s, total: TOTAL, message: 'Private transfer to DON — sign in wallet…', description: 'Privately transferring your bid amount to the Chainlink DON escrow address inside the vault. This transfer is invisible on-chain.' });
        const provider = (window as any).ethereum;
        if (!provider) throw new Error('No wallet provider found');
        const signer = createConvergenceSigner(provider, address);
        transferResult = await privateTransfer(
          address,
          donWallet,
          vaultTokenAddress,
          bidAmount,
          signer,
          { apiEndpoint: convergence.apiEndpoint, vaultAddress: convergence.vault },
        );
      }

      if (!transferResult.success) {
        throw new Error(`Vault transfer failed: ${transferResult.error}`);
      }

      // Verify the bidder's vault balance decreased (confirms funds left their account)
      try {
        const verifySigner = createConvergenceSigner(
          (window as any).ethereum,
          address,
        );
        const balances = await getVaultBalances(address, verifySigner, {
          apiEndpoint: convergence.apiEndpoint,
          vaultAddress: convergence.vault,
        });
        const tokenBalance = balances.find(
          (b) => b.token.toLowerCase() === vaultTokenAddress.toLowerCase()
        );
        const remaining = tokenBalance ? BigInt(tokenBalance.amount) : 0n;
        console.log(`Bidder vault balance after transfer: ${remaining.toString()} (deposited ${bidAmount.toString()}, expect ~0 remaining)`);
        // If the bidder still holds the full amount, the private transfer to DON may not have gone through
        if (remaining >= bidAmount) {
          console.warn('⚠️ Bidder vault balance did not decrease — private transfer to DON may have failed');
        }
      } catch (e) {
        console.warn('Vault balance verification failed (non-blocking):', e);
      }

      setVaultTxId(transferResult.transactionId || 'confirmed');
      if (transferResult.transactionId) {
        setTxLog(prev => [...prev, { label: 'Private transfer to DON', hash: transferResult.transactionId!, isOnChain: false }]);
      }
      setStep({ current: s, total: TOTAL, message: 'Vault deposit complete ✓' });
      console.log('Private transfer to DON:', transferResult.transactionId);

      // ═══════════════════════════════════════════════════════════════
      // IPFS BACKUP + CRE SUBMISSION + ON-CHAIN COMMIT
      // ═══════════════════════════════════════════════════════════════

      // Prepare IPFS CID for on-chain (backup to IPFS but don't persist locally yet)
      let ipfsCid: string | undefined;
      if (isPinataConfigured()) {
        try {
          s++;
          setStep({ current: s, total: TOTAL, message: 'Backing up bid to IPFS…', description: 'Uploading an encrypted copy of your bid to IPFS so the Chainlink DON can fetch and decrypt it during settlement.' });
          const { backupBidToIPFS } = await import('../lib/ipfs-backup');
          const result = await backupBidToIPFS(auctionId, address, bidAmount, salt, vaultTokenAddress);
          if (result.success) ipfsCid = result.cid;
        } catch (e) {
          console.warn('IPFS backup failed, continuing:', e);
        }
      }

      // Submit to CRE if configured (Confidential HTTP)
      const creConfig = getCreConfig();
      if (isCreConfigured(creConfig)) {
        s++;
        setStep({ current: s, total: TOTAL, message: 'Generating your shielded address…', description: 'Creating a private delivery address so the auctioned tokens can be sent to you confidentially if you win.' });
        // Generate a shielded address for the bidder to receive the auctioned
        // asset privately if they win (ERC-20 delivery via Convergence)
        let bidderShieldedAddr = address; // Fallback
        try {
          const bidderProvider = (window as any).ethereum;
          if (bidderProvider) {
            const bidderSigner = createConvergenceSigner(bidderProvider, address);
            const shieldedResult = await generateShieldedAddress(address, bidderSigner, {
              apiEndpoint: convergence.apiEndpoint,
              vaultAddress: convergence.vault,
            });
            bidderShieldedAddr = shieldedResult.shieldedAddress;
            console.log('Bidder shielded address:', bidderShieldedAddr);
          }
        } catch (e) {
          console.warn('Shielded address generation failed, using plain address:', e);
        }

        s++;
        setStep({ current: s, total: TOTAL, message: 'Encrypting bid for DON…', description: 'Encrypting your bid details (amount, payment token, delivery address) with the DON\'s public key. Only the secure enclave can decrypt this.' });
        // Build metadata blob and encrypt everything (not just amount)
        const metadata = {
          bidder: address,
          amount: bidAmount.toString(),
          paymentToken: vaultTokenAddress,  // Always ERC-20 address (never native 0x0)
          sourceChain: chainId.toString(),
          timestamp: Math.floor(Date.now() / 1000),
          destinationAddress: bidderShieldedAddr,
          vaultTransactionId: transferResult.transactionId,
        };
        const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
        const encryptedPayload = await encryptForDon(creConfig, metadataBytes);

        const creResult = await submitBidToCre(
          creConfig,
          {
            auctionId: auctionId.toString(),
            commitment,
            encryptedAmount: encryptedPayload,
            paymentToken: vaultTokenAddress,
            sourceChain: chainId,
            worldIdProof: worldIdProof ? {
              nullifierHash: worldIdProof.nullifier_hash,
              proof: worldIdProof.proof,
              merkleRoot: worldIdProof.merkle_root,
              verificationLevel: worldIdProof.verification_level,
            } : undefined,
          },
          address
        );
        
        if (creResult.success) {
          console.log('Bid submitted to CRE:', creResult);
        } else {
          console.warn('CRE submission failed, proceeding with on-chain only:', creResult.error);
        }
      }

      // Submit on-chain FIRST — only persist to localStorage after tx succeeds
      s++;
      setStep({ current: s, total: TOTAL, message: 'Submitting bid on-chain — confirm in wallet…', description: 'Publishing your bid commitment hash to the HushBid contract. The hash proves you bid without revealing the amount.' });
      const commitTxHash = await onSubmit(commitment, ipfsCid || '', worldIdProof || undefined);

      // Build final tx log including the commit hash
      const finalTxLog = [
        ...txLog,
        { label: 'Commit bid on-chain', hash: commitTxHash, isOnChain: true },
      ];
      setTxLog(finalTxLog);

      // Tx confirmed — now safe to mark bid in localStorage (with tx hashes)
      await storeBidLocally(auctionId, address, bidAmount, salt, vaultTokenAddress);
      // Persist tx log alongside bid data
      const bidKey = `hush-bid-${auctionId}-${address}`;
      try {
        const existing = JSON.parse(localStorage.getItem(bidKey) || '{}');
        existing.txHashes = finalTxLog.map(t => ({ label: t.label, hash: t.hash, isOnChain: t.isOnChain }));
        localStorage.setItem(bidKey, JSON.stringify(existing));
      } catch { /* best-effort */ }
      console.log('Bid persisted to localStorage after on-chain confirmation');

      onClose();
    } catch (err: any) {
      console.error('Bid submission error:', err);
      // Extract revert reason for better UX
      const reason = err?.shortMessage || err?.message || 'Unknown error';
      if (reason.includes('WorldIdAlreadyUsed')) {
        setError('Your World ID has already been used to bid on this auction. Each verified human can only bid once per auction to prevent sybil attacks.');
      } else if (reason.includes('InvalidProof') || reason.includes('verifyProof')) {
        setError('World ID proof verification failed on-chain. This can happen if you verified with a different wallet address or the proof expired. Please re-verify and try again.');
      } else if (reason.includes('AlreadyBid')) {
        setError('You have already placed a bid on this auction. Only one bid per address is allowed.');
      } else if (reason.includes('AuctionExpired')) {
        setError('Bidding period has ended for this auction.');
      } else if (reason.includes('AuctionNotInPhase')) {
        setError('Auction is not in the bidding phase.');
      } else if (reason.includes('AuctionNotFound')) {
        setError('Auction not found on-chain.');
      } else if (reason.includes('InvalidCommitment')) {
        setError('Invalid bid commitment.');
      } else if (reason.includes('User rejected') || reason.includes('denied')) {
        setError('Transaction rejected by wallet.');
      } else if (reason.includes('Vault transfer failed')) {
        setError(`Private vault transfer failed: ${reason.slice(0, 150)}`);
      } else if (reason.includes('insufficient') || reason.includes('exceeds balance')) {
        setError('Insufficient balance for this bid amount.');
      } else {
        setError(`Bid failed: ${reason.slice(0, 120)}`);
      }
    } finally {
      setIsSubmitting(false);
      setStep(null);
    }
  };

  const canSubmit = amount && parseFloat(amount) > 0 && (!worldIdRequired || worldIdProof || !isWorldIdConfigured);

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-zinc-800"
        style={{ backgroundColor: '#111113' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Lock className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Place Sealed Bid</h2>
              <p className="text-xs text-zinc-500">Auction #{auctionId}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5 text-zinc-500" />
          </button>
        </div>

        {/* Step Progress — always visible above fold */}
        {step && isSubmitting && (
          <div className="px-4 pt-3">
            <StepProgress current={step.current} total={step.total} message={step.message} description={step.description} />
          </div>
        )}

        <div className="p-4 space-y-4 max-h-[55vh] overflow-y-auto">
          {/* World ID */}
          {worldIdRequired && (
            <WorldIdVerify
              onSuccess={setWorldIdProof}
              disabled={isSubmitting}
              address={address}
            />
          )}

          {/* Token Selection */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-2">
              Pay with
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['ETH', 'WETH'] as const).map((token) => (
                <button
                  key={token}
                  onClick={() => setPaymentToken(token)}
                  disabled={isSubmitting}
                  className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    paymentToken === token
                      ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                      : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  {token}
                </button>
              ))}
            </div>
            {paymentToken === 'ETH' && (
              <p className="text-[10px] text-zinc-600 mt-1.5">ETH is auto-wrapped to WETH for the Convergence vault</p>
            )}
            {paymentToken === 'WETH' && wethBalance !== null && (
              <p className="text-[10px] text-zinc-600 mt-1.5">WETH balance: <span className="text-zinc-400 font-mono">{parseFloat(wethBalance).toFixed(6)}</span></p>
            )}
          </div>

          {/* Amount Input */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-2">
              Bid Amount
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.001"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-3 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white text-lg font-mono placeholder-zinc-600 focus:outline-none focus:border-blue-500/50 transition-colors"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                {paymentToken}
              </span>
            </div>
            {amount && parseFloat(amount) > 0 && (
              <p className="text-xs text-zinc-500 mt-1.5 font-mono">
                ≈ {getUsdValue(paymentToken, amount) || '...'} USD
              </p>
            )}
          </div>

          {/* Private Payment Indicator */}
          {vaultTxId && (
            <div className="flex gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-emerald-400">🔒 Private Payment Deposited</p>
                <p className="text-xs text-emerald-400/70 mt-0.5">
                  Your bid funds are in the Convergence vault. Payment will be privately transferred to the seller if you win.
                </p>
              </div>
            </div>
          )}

          {/* Transaction Log — proof that privacy operations happened */}
          {txLog.length > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
              <button
                onClick={() => setShowTxLog(!showTxLog)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <ExternalLink className="w-3 h-3" />
                  🔗 Transaction Log ({txLog.length})
                </span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showTxLog ? 'rotate-180' : ''}`} />
              </button>
              {showTxLog && (
                <div className="px-3 pb-2.5 space-y-1.5 border-t border-zinc-800/50">
                  {txLog.map((tx, i) => (
                    <div key={i} className="flex items-center justify-between text-[10px]">
                      <span className="text-zinc-500">{tx.label}</span>
                      {tx.isOnChain ? (
                        <a
                          href={`https://sepolia.etherscan.io/tx/${tx.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          {tx.hash.slice(0, 10)}…{tx.hash.slice(-6)}
                        </a>
                      ) : (
                        <span className="font-mono text-emerald-400 break-all text-right" title="Convergence vault internal transfer (private)">
                          {tx.hash}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* FULL_PRIVATE + no Pinata warning */}
          {privacyLevel === PrivacyLevel.FULL_PRIVATE && !isPinataConfigured() && (
            <div className="flex gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-400">
                <strong>Warning:</strong> This is a FULL_PRIVATE auction but IPFS (Pinata) is not configured.
                Your bid will be stored locally only and <strong>cannot be settled by the CRE</strong>.
                Set <code>VITE_PINATA_JWT</code> in your .env to enable encrypted IPFS backup.
              </p>
            </div>
          )}

          {/* Info Box */}
          <div className="flex gap-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
            <Info className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-500">
              Your bid is encrypted on-chain and backed up to IPFS. The Chainlink DON automatically decrypts and settles after the auction window closes — no action needed from you.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="w-full py-3 text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: canSubmit && !isSubmitting ? '#3b82f6' : '#27272a',
              color: canSubmit && !isSubmitting ? 'white' : '#71717a',
            }}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Submitting...
              </span>
            ) : (
              'Submit Bid'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
