import { useState, useEffect } from 'react';
import { useAccount, useWalletClient, usePublicClient } from 'wagmi';
import { ShieldCheck, ArrowDownToLine, Loader2, Eye, ExternalLink } from 'lucide-react';
import { formatEther, type Address } from 'viem';
import {
  getVaultBalances,
  withdrawFromVault,
  createConvergenceSigner,
  CONVERGENCE_VAULT_ABI,
  type VaultBalance,
  type ConvergenceConfig,
} from '@hushbid/sdk';
import { getConvergenceAddresses } from '../config/addresses';
import { StepProgress } from './StepProgress';

const TOKEN_LABELS: Record<string, string> = {
  '0x7b79995e5f793a07bc00c21412e50ecae098e7f9': 'WETH',
  '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238': 'USDC',
};

/** Cache for on-chain token name lookups */
const tokenNameCache: Record<string, string> = {};

/** Scan localStorage for bid deposits the current wallet has made */
function getLocalBidDeposits(address: string): { auctionId: number; amount: string; paymentToken: string; timestamp: number }[] {
  const deposits: { auctionId: number; amount: string; paymentToken: string; timestamp: number }[] = [];
  const prefix = 'hush-bid-';
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    try {
      const data = JSON.parse(localStorage.getItem(key) || '');
      if (data.bidder?.toLowerCase() === address.toLowerCase()) {
        deposits.push({
          auctionId: data.auctionId,
          amount: data.amount,
          paymentToken: data.paymentToken,
          timestamp: data.timestamp,
        });
      }
    } catch { /* skip malformed entries */ }
  }
  return deposits.sort((a, b) => b.timestamp - a.timestamp);
}

const ERC20_NAME_ABI = [
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

function tokenLabel(addr: string): string {
  const lower = addr.toLowerCase();
  return TOKEN_LABELS[lower] || tokenNameCache[lower] || `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatAmount(amount: string, token: string): string {
  const lower = token.toLowerCase();
  if (lower === '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238') {
    return (Number(amount) / 1e6).toFixed(4);
  }
  const eth = formatEther(BigInt(amount));
  return parseFloat(eth) < 0.0001 ? `${amount} wei` : `${parseFloat(eth).toFixed(6)}`;
}

export function VaultPanel() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [balances, setBalances] = useState<VaultBalance[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastWithdrawTx, setLastWithdrawTx] = useState<string | null>(null);
  const [step, setStep] = useState<{ current: number; total: number; message: string; description?: string } | null>(null);

  const convergence = getConvergenceAddresses();
  const config: ConvergenceConfig = {
    apiEndpoint: convergence.apiEndpoint,
    vaultAddress: convergence.vault,
  };

  // Reset all state when wallet address changes
  useEffect(() => {
    setBalances(null);
    setError(null);
    setLastWithdrawTx(null);
    setStep(null);
    setWithdrawing(null);
  }, [address]);

  /** Fetch vault balances — only called on user click */
  const fetchBalances = async () => {
    if (!address || !walletClient) return;
    setLoading(true);
    setError(null);
    setStep({ current: 1, total: 1, message: 'Sign to view shielded balance…', description: 'Signing a message to authenticate with the Convergence API. This costs no gas.' });
    try {
      const provider = (window as any).ethereum;
      if (!provider) throw new Error('No wallet provider');
      const signer = createConvergenceSigner(provider, address);
      const bals = await getVaultBalances(address, signer, config);
      const nonZero = bals.filter(b => BigInt(b.amount) > 0n);

      // Resolve names for unknown tokens
      if (publicClient) {
        for (const bal of nonZero) {
          const lower = bal.token.toLowerCase();
          if (!TOKEN_LABELS[lower] && !tokenNameCache[lower]) {
            try {
              const symbol = await publicClient.readContract({
                address: bal.token as Address,
                abi: ERC20_NAME_ABI,
                functionName: 'symbol',
              });
              tokenNameCache[lower] = symbol;
            } catch {
              // Fallback — leave as truncated hex
            }
          }
        }
      }

      setBalances(nonZero);
    } catch (err: any) {
      console.warn('Vault balance fetch failed:', err);
      if (err?.message?.includes('account not found') || err?.message?.includes('404')) {
        setBalances([]);
      } else if (err?.message?.includes('denied') || err?.message?.includes('rejected')) {
        setError('Signature rejected');
      } else {
        setError(err?.message?.slice(0, 100) || 'Failed to load');
      }
    } finally {
      setLoading(false);
      setStep(null);
    }
  };

  /**
   * Withdraw tokens from vault → on-chain wallet.
   * Two-step process:
   *   1. POST /withdraw API → get a signed ticket
   *   2. Call withdrawWithTicket(token, amount, ticket) on the vault contract
   */
  const handleWithdraw = async (token: Address, amount: string) => {
    if (!address || !walletClient || !publicClient) return;
    setWithdrawing(token);
    setError(null);
    const TOTAL = 3;
    setStep({ current: 1, total: TOTAL, message: 'Sign withdrawal request…', description: 'Requesting a withdrawal ticket from the Convergence API. This authorizes moving tokens out of the vault.' });
    try {
      const provider = (window as any).ethereum;
      if (!provider) throw new Error('No wallet provider');
      const signer = createConvergenceSigner(provider, address);

      // Step 1: Get withdrawal ticket from Convergence API
      const result = await withdrawFromVault(address, token, BigInt(amount), signer, config);
      if (!result.success || !result.ticket) {
        throw new Error(result.error || 'Withdraw failed — no ticket returned');
      }

      // Step 2: Submit on-chain withdrawWithTicket transaction
      setStep({ current: 2, total: TOTAL, message: 'Confirm on-chain withdrawal in wallet…', description: 'Submitting the withdrawal ticket to the vault contract. Once confirmed, tokens will appear in MetaMask.' });
      const ticketBytes = result.ticket.startsWith('0x')
        ? result.ticket as `0x${string}`
        : `0x${result.ticket}` as `0x${string}`;
      const txHash = await walletClient.writeContract({
        address: convergence.vault as Address,
        abi: CONVERGENCE_VAULT_ABI,
        functionName: 'withdrawWithTicket',
        args: [token, BigInt(amount), ticketBytes],
        chain: walletClient.chain,
        account: walletClient.account!,
        gas: 500_000n,
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      setLastWithdrawTx(txHash);
      console.log('Withdraw on-chain confirmed:', txHash);

      // Step 3: Refresh balances
      setStep({ current: 3, total: TOTAL, message: 'Withdrawal confirmed — refreshing…', description: 'Refreshing your vault balance to reflect the withdrawal.' });
      const bals = await getVaultBalances(address, signer, config);
      setBalances(bals.filter(b => BigInt(b.amount) > 0n));
    } catch (err: any) {
      if (err?.message?.includes('denied') || err?.message?.includes('rejected')) {
        setError('Transaction rejected');
      } else {
        setError(err?.message?.slice(0, 120) || 'Withdraw failed');
      }
    } finally {
      setWithdrawing(null);
      setStep(null);
    }
  };

  if (!isConnected) return null;

  return (
    <div className="p-5 rounded-xl border border-zinc-800/50" style={{ backgroundColor: '#111113' }}>
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="w-4 h-4 text-emerald-400" />
        <h3 className="text-sm font-medium text-white">Your Convergence Vault</h3>
      </div>

      {error && (
        <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          {error}
        </div>
      )}

      {step && (
        <div className="mb-3">
          <StepProgress current={step.current} total={step.total} message={step.message} description={step.description} />
        </div>
      )}

      {/* Not yet checked — show button to check */}
      {balances === null && (
        <button
          onClick={fetchBalances}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-medium rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-50"
        >
          <Eye className="w-3.5 h-3.5" />
          {loading ? 'Checking…' : 'Check Vault Balance'}
        </button>
      )}

      {/* Checked but empty */}
      {balances !== null && balances.length === 0 && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 py-2 text-center">
            No vault balance
          </p>
          <button
            onClick={fetchBalances}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2 text-[10px] font-medium rounded-lg bg-zinc-900 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
          >
            <Eye className="w-3 h-3" />
            Re-check
          </button>
        </div>
      )}

      {/* Has balances — show each with withdraw */}
      {balances !== null && balances.length > 0 && (
        <div className="space-y-2">
          {balances.map((bal) => {
            // Find matching bid deposits for this token
            const deposits = address
              ? getLocalBidDeposits(address).filter(
                  d => d.paymentToken.toLowerCase() === bal.token.toLowerCase()
                )
              : [];
            return (
              <div
                key={bal.token}
                className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {formatAmount(bal.amount, bal.token)} {tokenLabel(bal.token)}
                    </p>
                    <p className="text-[10px] text-zinc-600 font-mono mt-0.5">
                      Your shielded balance
                    </p>
                  </div>
                  <button
                    onClick={() => handleWithdraw(bal.token as Address, bal.amount)}
                    disabled={withdrawing === bal.token}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                    title="Withdraw to your wallet (visible in MetaMask)"
                  >
                    {withdrawing === bal.token ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <ArrowDownToLine className="w-3 h-3" />
                    )}
                    Withdraw
                  </button>
                </div>
                {/* Per-auction deposit breakdown from localStorage */}
                {deposits.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-zinc-800/40 space-y-1">
                    {deposits.map((d) => (
                      <div key={d.auctionId} className="flex items-center justify-between text-[10px]">
                        <span className="text-zinc-500">Auction #{d.auctionId} bid</span>
                        <span className="font-mono text-zinc-400">
                          {formatAmount(d.amount, d.paymentToken)} {tokenLabel(d.paymentToken)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {lastWithdrawTx && (
            <a
              href={`https://sepolia.etherscan.io/tx/${lastWithdrawTx}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 w-full py-2 text-[10px] font-mono text-emerald-400 hover:text-emerald-300 rounded-lg bg-emerald-500/5 border border-emerald-500/10 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Withdrawal confirmed: {lastWithdrawTx.slice(0, 10)}…{lastWithdrawTx.slice(-6)}
            </a>
          )}
          <button
            onClick={fetchBalances}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2 text-[10px] font-medium rounded-lg bg-zinc-900 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
          >
            <Eye className="w-3 h-3" />
            Refresh
          </button>
          <p className="text-[10px] text-zinc-600 text-center">
            Withdraw moves funds on-chain → visible in MetaMask
          </p>
          <div className="p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/10">
            <p className="text-[10px] text-blue-400/80 leading-relaxed">
              💡 After settlement, refunds (losing bids) and payments (winning bid to seller) appear here automatically. Use <strong>Withdraw</strong> to move tokens to your regular wallet.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
