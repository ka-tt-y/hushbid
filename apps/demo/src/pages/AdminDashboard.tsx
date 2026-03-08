import { useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { parseEther, type Address, zeroAddress } from 'viem';
import {
  privateTransfer,
  createConvergenceSigner,
  setupNewToken,
  isTokenRegistered,
  approveVault,
  depositToVault,
} from '@hushbid/sdk';
import { motion } from 'framer-motion';
import {
  Plus,
  Settings,
  Shield,
  EyeOff,
  Lock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Package,
  HelpCircle,
} from 'lucide-react';
import { PrivacyLevel, AssetType, generateShieldedAddress } from '@hushbid/sdk';
import { getConvergenceAddresses } from '../config/addresses';
import { useHushBidClient } from '../hooks/useHushBidClient';
import { useTokenPrices } from '../hooks/useTokenPrices';
import { StepProgress } from '../components/StepProgress';


export function CreateAuctionForm() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const client = useHushBidClient();
  const { getUsdValue } = useTokenPrices();
  const [isPending, setIsPending] = useState(false);
  const [step, setStep] = useState<{ current: number; total: number; message: string; description?: string } | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Known ERC-20 tokens on Sepolia for the dropdown
  const TOKEN_OPTIONS = [
    { symbol: '__CUSTOM__', address: '' },
    { symbol: '__DEPLOY_NEW__', address: '' },
  ];

  const [form, setForm] = useState({
    assetContract: TOKEN_OPTIONS[0]?.address || '',
    tokenAmount: '0.01',
    reservePrice: '0.001',
    biddingDuration: '300',  // 5 minutes
    revealDuration: '120',   // 2 minutes
    privacyLevel: PrivacyLevel.FULL_PRIVATE,
    worldIdRequired: false,
    auditor: '',
  });

  // Custom token address mode
  const [useCustomToken, setUseCustomToken] = useState(false);
  const [customTokenAddress, setCustomTokenAddress] = useState('');

  // Deploy-new-token form fields
  const [deployNewToken, setDeployNewToken] = useState(true);
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenSymbol, setNewTokenSymbol] = useState('');
  const [newTokenMintAmount, setNewTokenMintAmount] = useState('100');

  const handleCreate = async () => {
    if (!address || !publicClient || !walletClient) return;
    setIsPending(true);
    setError(null);
    setTxHash(null);
    setStep(null);

    try {
      const provider = (window as any).ethereum;
      if (!provider) throw new Error('No wallet provider found');
      const signer = createConvergenceSigner(provider, address);
      const convergence = getConvergenceAddresses();
      const donWallet = convergence.donWallet;

      let tokenAddr: Address;
      let tokenAmount: bigint;

      if (deployNewToken) {
        // ═══════════════════════════════════════════════════════════
        // DEPLOY NEW TOKEN FLOW — runs all 6 Convergence setup steps:
        //   1. Deploy SimpleToken (ERC20 + Permit)
        //   2. Deploy PolicyEngine behind ERC1967Proxy
        //   3. Mint tokens to deployer
        //   4. Approve vault to spend tokens
        //   5. Register token with PolicyEngine on vault
        //   6. Deposit tokens into vault
        // ═══════════════════════════════════════════════════════════
        if (!newTokenName || !newTokenSymbol) {
          throw new Error('Please provide a name and symbol for the new token');
        }

        const mintAmount = parseEther(newTokenMintAmount);
        const depositAmount = parseEther(form.tokenAmount);

        if (depositAmount > mintAmount) {
          throw new Error('Deposit amount cannot exceed mint amount');
        }

        const DEPLOY_EXTRA_STEPS = 3; // private-transfer, shielded-addr, create-auction
        const result = await setupNewToken(walletClient, publicClient, {
          name: newTokenName,
          symbol: newTokenSymbol,
          mintAmount,
          depositAmount,
          onStatus: (s: number, t: number, msg: string) =>
            setStep({ current: s, total: t + DEPLOY_EXTRA_STEPS, message: msg }),
        });

        tokenAddr = result.tokenAddress;
        tokenAmount = depositAmount;
        console.log('New token deployed:', tokenAddr);
        console.log('PolicyEngine deployed:', result.policyEngineProxy);
      } else {
        // ═══════════════════════════════════════════════════════════
        // EXISTING TOKEN FLOW — verify registration, approve, deposit
        // ═══════════════════════════════════════════════════════════
        tokenAddr = form.assetContract as Address;
        tokenAmount = parseEther(form.tokenAmount);

        const EXISTING_TOTAL = 6;
        // Verify token is registered with a PolicyEngine on the vault
        setStep({ current: 1, total: EXISTING_TOTAL, message: 'Checking vault registration…', description: 'Verifying this token has a PolicyEngine registered on the Convergence vault.' });
        const registered = await isTokenRegistered(publicClient, tokenAddr);
        if (!registered) {
          throw new Error(
            `Token ${tokenAddr} is not registered on the Convergence vault. ` +
            'Please deploy a new token with the "Deploy New Token" option, or register this token with a PolicyEngine first.'
          );
        }

        // Approve vault to spend tokens
        setStep({ current: 2, total: EXISTING_TOTAL, message: 'Approving token to vault — confirm in wallet…', description: 'Granting the Convergence vault permission to receive your auction tokens.' });
        await approveVault(walletClient, publicClient, {
          token: tokenAddr,
          amount: tokenAmount,
        });

        // Deposit into vault
        setStep({ current: 3, total: EXISTING_TOTAL, message: 'Depositing tokens into vault — confirm in wallet…', description: 'Moving your auction tokens into the privacy-preserving vault for escrow.' });
        await depositToVault(walletClient, publicClient, {
          token: tokenAddr,
          amount: tokenAmount,
        });
      }

      // Private-transfer from seller → DON wallet
      const total = step?.total ?? 6;
      const base = total - 3; // last 3 steps are shared
      setStep({ current: base + 1, total, message: 'Private transfer to DON — sign in wallet…', description: 'Privately transferring the auctioned tokens to the Chainlink DON escrow inside the vault.' });
      const transferResult = await privateTransfer(
        address,
        donWallet,
        tokenAddr,
        tokenAmount,
        signer,
        { apiEndpoint: convergence.apiEndpoint, vaultAddress: convergence.vault },
      );
      if (!transferResult.success) {
        throw new Error(`Vault transfer failed: ${transferResult.error}`);
      }
      console.log('Asset deposited to DON:', transferResult.transactionId);

      // Generate seller shielded address for receiving payment
      setStep(prev => ({ current: (prev?.current ?? 0) + 1, total: prev?.total ?? 6, message: 'Requesting shielded address — please sign in wallet…', description: 'Creating your private address so the winning bid payment can be delivered to you confidentially.' }));
      const shieldedResult = await generateShieldedAddress(address, signer, {
        apiEndpoint: convergence.apiEndpoint,
        vaultAddress: convergence.vault,
      });
      const sellerShieldedAddr = shieldedResult.shieldedAddress;
      // (shielded address generated, continue to next step)
      console.log('Seller shielded address:', sellerShieldedAddr);

      // Create the auction on-chain (metadata only — no on-chain escrow)
      setStep(prev => ({ current: (prev?.current ?? 0) + 1, total: prev?.total ?? 6, message: 'Creating auction — confirm in wallet…', description: 'Publishing the auction to the HushBid contract on-chain. This sets the bidding window, reserve price, and privacy level.' }));
      const hash = await client.createAuction({
        assetContract: tokenAddr,
        tokenAmount,
        assetType: AssetType.ERC20,
        reservePrice: parseEther(form.reservePrice),
        biddingDurationSeconds: Number(form.biddingDuration),
        revealDurationSeconds: Number(form.revealDuration),
        privacyLevel: form.privacyLevel as PrivacyLevel,
        worldIdRequired: form.worldIdRequired,
        auditor: form.privacyLevel === PrivacyLevel.AUDITABLE
          ? (form.auditor || address) as Address
          : zeroAddress,
        sellerShieldedAddress: sellerShieldedAddr,
      });
      console.log('Hash:', hash);

      // Wait for receipt and verify the tx actually succeeded on-chain
      setStep(prev => ({ current: (prev?.total ?? 6) + 1, total: prev?.total ?? 6, message: 'Confirmed ✓' }));
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === 'reverted') {
        throw new Error(`Auction creation transaction reverted on-chain (tx: ${hash})`);
      }
      setTxHash(hash);
    } catch (err: any) {
      setError(err);
    } finally {
      setIsPending(false);
      setStep(null);
    }
  };

  const privacyOptions = [
    { value: PrivacyLevel.FULL_PRIVATE, label: 'Full Private', icon: EyeOff, desc: 'Nothing revealed' },
    { value: PrivacyLevel.AUDITABLE, label: 'Auditable', icon: Lock, desc: 'Verifiable by auditors' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 rounded-xl border border-zinc-800/50"
      style={{ backgroundColor: '#111113' }}
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
          <Plus className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Create Auction</h2>
          <p className="text-xs text-zinc-500">Set up a new private auction</p>
        </div>
      </div>

      {/* Step Progress — always visible at top */}
      {step && (
        <div className="mb-4">
          <StepProgress current={step.current} total={step.total} message={step.message} description={step.description} />
        </div>
      )}

      <div className="space-y-5">
        {/* Token Details */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-2">Token to Sell</label>
            <select
              value={deployNewToken ? '__DEPLOY_NEW__' : useCustomToken ? '__CUSTOM__' : form.assetContract}
              onChange={(e) => {
                if (e.target.value === '__DEPLOY_NEW__') {
                  setDeployNewToken(true);
                  setUseCustomToken(false);
                  setForm({ ...form, assetContract: '' });
                } else if (e.target.value === '__CUSTOM__') {
                  setDeployNewToken(false);
                  setUseCustomToken(true);
                  setForm({ ...form, assetContract: customTokenAddress });
                } else {
                  setDeployNewToken(false);
                  setUseCustomToken(false);
                  setForm({ ...form, assetContract: e.target.value });
                }
              }}
              className="w-full px-4 py-3 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
            >
              {TOKEN_OPTIONS.filter(t => t.symbol !== '__DEPLOY_NEW__' && t.symbol !== '__CUSTOM__').map(t => (
                <option key={t.address} value={t.address}>{t.symbol}</option>
              ))}
              <option value="__CUSTOM__">Custom Token Address</option>
              <option value="__DEPLOY_NEW__">Deploy New Token</option>
            </select>
            {useCustomToken && !deployNewToken && (
              <input
                type="text"
                value={customTokenAddress}
                onChange={(e) => {
                  setCustomTokenAddress(e.target.value);
                  setForm({ ...form, assetContract: e.target.value });
                }}
                placeholder="0x... ERC-20 token contract address"
                className="w-full mt-2 px-4 py-3 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white text-sm font-mono placeholder-zinc-600 focus:outline-none focus:border-blue-500/50 transition-colors"
              />
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-2">
              {deployNewToken ? 'Amount to Deposit & Sell' : 'Amount to Sell'}
            </label>
            <input
              type="number"
              step="0.001"
              min="0"
              value={form.tokenAmount}
              onChange={(e) => setForm({ ...form, tokenAmount: e.target.value })}
              placeholder="0.01"
              className="w-full px-4 py-3 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white text-sm font-mono placeholder-zinc-600 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>
        </div>

        {/* Deploy New Token Fields */}
        {deployNewToken && (
          <div className="p-4 rounded-lg border border-blue-500/20 bg-blue-500/5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-blue-400" />
              <p className="text-sm font-medium text-blue-400">New Token Configuration</p>
            </div>
            <p className="text-xs text-zinc-500 -mt-2">
              Deploys a new ERC-20 token with a PolicyEngine and registers it on the Convergence vault.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-2">Token Name</label>
                <input
                  type="text"
                  value={newTokenName}
                  onChange={(e) => setNewTokenName(e.target.value)}
                  placeholder="e.g. My Auction Token"
                  className="w-full px-4 py-3 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-blue-500/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-2">Token Symbol</label>
                <input
                  type="text"
                  value={newTokenSymbol}
                  onChange={(e) => setNewTokenSymbol(e.target.value.toUpperCase())}
                  placeholder="e.g. MAT"
                  maxLength={8}
                  className="w-full px-4 py-3 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white text-sm font-mono placeholder-zinc-600 focus:outline-none focus:border-blue-500/50 transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-2">Total Supply to Mint</label>
              <input
                type="number"
                step="1"
                min="1"
                value={newTokenMintAmount}
                onChange={(e) => setNewTokenMintAmount(e.target.value)}
                placeholder="100"
                className="w-full px-4 py-3 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white text-sm font-mono placeholder-zinc-600 focus:outline-none focus:border-blue-500/50 transition-colors"
              />
              <p className="text-xs text-zinc-600 mt-1">
                Tokens minted to your wallet. The "Amount to Deposit & Sell" above will be deposited into the vault.
              </p>
            </div>
          </div>
        )}

        {/* Reserve Price */}
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-2">Reserve Price (ETH)</label>
          <input
            type="number"
            step="0.001"
            value={form.reservePrice}
            onChange={(e) => setForm({ ...form, reservePrice: e.target.value })}
            className="w-full px-4 py-3 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white text-sm font-mono placeholder-zinc-600 focus:outline-none focus:border-blue-500/50 transition-colors"
          />
          {form.reservePrice && parseFloat(form.reservePrice) > 0 && (
            <p className="text-xs text-zinc-500 mt-1 font-mono">
              ≈ {getUsdValue('ETH', form.reservePrice) || '...'} USD
            </p>
          )}
        </div>

        {/* Durations */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="relative group/bid inline-flex items-center gap-1.5 mb-2">
              <label className="text-xs font-medium text-zinc-500">Bidding Duration</label>
              <HelpCircle className="w-3.5 h-3.5 text-zinc-600 cursor-help" />
              <div className="hidden group-hover/bid:block absolute left-0 top-full mt-1 z-10 w-72 p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 shadow-xl leading-relaxed">
                <span className="font-semibold text-zinc-100">How long bidders can place sealed bids.</span>{' '}
                After this window closes, no new bids are accepted and the settlement countdown begins.
              </div>
            </div>
            <select
              value={form.biddingDuration}
              onChange={(e) => setForm({ ...form, biddingDuration: e.target.value })}
              className="w-full px-4 py-3 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
            >
              <option value="120">2 minutes</option>
              <option value="300">5 minutes</option>
              <option value="600">10 minutes</option>
              <option value="900">15 minutes</option>
              <option value="1800">30 minutes</option>
              <option value="3600">1 hour</option>
              <option value="7200">2 hours</option>
              <option value="14400">4 hours</option>
              <option value="86400">24 hours</option>
            </select>
          </div>
          <div>
            <div className="relative group/rev inline-flex items-center gap-1.5 mb-2">
              <label className="text-xs font-medium text-zinc-500">Settlement Window</label>
              <HelpCircle className="w-3.5 h-3.5 text-zinc-600 cursor-help" />
              <div className="hidden group-hover/rev:block absolute left-0 top-full mt-1 z-10 w-72 p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 shadow-xl leading-relaxed">
                <span className="font-semibold text-zinc-100">Grace period before the DON settles.</span>{' '}
                After bidding ends, the Chainlink DON waits this long to collect all encrypted bids from IPFS, decrypt them, and settle the auction on-chain. Longer windows give the DON more time if traffic is high.
              </div>
            </div>
            <select
              value={form.revealDuration}
              onChange={(e) => setForm({ ...form, revealDuration: e.target.value })}
              className="w-full px-4 py-3 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
            >
              <option value="60">1 minute</option>
              <option value="120">2 minutes</option>
              <option value="300">5 minutes</option>
              <option value="600">10 minutes</option>
              <option value="900">15 minutes</option>
              <option value="1800">30 minutes</option>
              <option value="3600">1 hour</option>
              <option value="7200">2 hours</option>
              <option value="86400">24 hours</option>
            </select>
          </div>
        </div>

        {/* Privacy Level */}
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-2">Privacy Level</label>
          <div className="grid grid-cols-3 gap-2">
            {privacyOptions.map(({ value, label, icon: Icon, desc }) => (
              <button
                key={value}
                onClick={() => setForm({ ...form, privacyLevel: value })}
                className={`p-3 rounded-lg border text-left transition-all ${
                  form.privacyLevel === value
                    ? 'border-blue-500/30 bg-blue-500/5'
                    : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                }`}
              >
                <Icon className={`w-4 h-4 mb-1 ${form.privacyLevel === value ? 'text-blue-400' : 'text-zinc-500'}`} />
                <p className={`text-xs font-medium ${form.privacyLevel === value ? 'text-blue-400' : 'text-zinc-300'}`}>{label}</p>
                <p className="text-[10px] text-zinc-600">{desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Auditor address — only for AUDITABLE */}
        {form.privacyLevel === PrivacyLevel.AUDITABLE && (
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-2">Auditor Address</label>
            <input
              type="text"
              value={form.auditor}
              onChange={(e) => setForm({ ...form, auditor: e.target.value })}
              placeholder={address || '0x...'}
              className="w-full px-4 py-3 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white text-sm font-mono placeholder-zinc-600 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
            <p className="text-xs text-zinc-600 mt-1">Leave blank to use your own address as auditor.</p>
          </div>
        )}

        {/* World ID */}
        <div className="flex items-center justify-between p-4 rounded-lg border border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-blue-400" />
            <div>
              <p className="text-sm font-medium text-white">Require World ID</p>
              <p className="text-xs text-zinc-500">Sybil-resistant bidding via Worldcoin proof-of-personhood</p>
            </div>
          </div>
          <button
            onClick={() => setForm(prev => ({ ...prev, worldIdRequired: !prev.worldIdRequired }))}
            className={`w-12 h-6 rounded-full relative transition-colors ${
              form.worldIdRequired ? 'bg-blue-500' : 'bg-zinc-700'
            }`}
          >
            <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
              form.worldIdRequired ? 'translate-x-6' : 'translate-x-0.5'
            }`} />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error.message.slice(0, 200)}
          </div>
        )}
        {txHash && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            Auction created successfully! TX: {txHash.slice(0, 18)}...
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleCreate}
          disabled={isPending || !address}
          className="w-full py-3 text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: '#3b82f6', color: 'white' }}
        >
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Confirm in Wallet...
            </span>
          ) : (
            'Create Auction'
          )}
        </button>
      </div>
    </motion.div>
  );
}

// =============================================================================
// Admin Dashboard Page — redirects to dedicated pages
// =============================================================================

export function AdminDashboard() {
  const { isConnected } = useAccount();

  if (!isConnected) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-24"
      >
        <Settings className="w-12 h-12 text-zinc-600 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Admin Dashboard</h2>
        <p className="text-zinc-500 mb-6">Connect your wallet to manage auctions</p>
        <div className="flex justify-center">
          <button className="px-6 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium">
            Connect Wallet
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Create Auction</h1>
          <p className="text-sm text-zinc-500 mt-1">Set up a new sealed-bid auction</p>
        </div>
      </div>

      <div className="max-w-2xl">
        <CreateAuctionForm />
      </div>
    </div>
  );
}
