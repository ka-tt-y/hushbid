import { useState, useCallback } from 'react';
import { IDKitRequestWidget, orbLegacy } from '@worldcoin/idkit';
import type { IDKitResult, IDKitErrorCodes, RpContext, ResponseItemV3 } from '@worldcoin/idkit';
import { Shield, Check, AlertCircle, Info, Loader2 } from 'lucide-react';
import { WORLD_ID } from '../config/wagmi';

// Check if a real app_id is configured (not the placeholder)
const isWorldIdConfigured = (() => {
  const id = WORLD_ID.appId;
  return id && id.startsWith('app_') && id !== 'app_hushbid';
})();

/**
 * World ID proof result — adapted to the shape expected by the rest of the app.
 * Maps v4 IDKitResult (orbLegacy / v3 protocol) fields to the legacy ISuccessResult shape.
 */
export interface WorldIdProof {
  proof: string;
  merkle_root: string;
  nullifier_hash: string;
  verification_level: string;
}

interface WorldIdVerifyProps {
  onSuccess: (result: WorldIdProof) => void;
  disabled?: boolean;
  /** Wallet address to use as signal — must match what the contract hashes */
  address?: string;
}

/**
 * Fetch RP context from the server-side signing endpoint.
 * The signing key never leaves the server (Vite Node.js process).
 */
async function fetchRpContext(): Promise<RpContext> {
  const res = await fetch('/api/rp-signature', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: WORLD_ID.actionId }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `RP signature request failed (${res.status})`);
  }

  const data = await res.json();
  return {
    rp_id: WORLD_ID.rpId,
    nonce: data.nonce,
    created_at: data.created_at,
    expires_at: data.expires_at,
    signature: data.sig,
  };
}

export function WorldIdVerify({ onSuccess, disabled, address }: WorldIdVerifyProps) {
  const [open, setOpen] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [loading, setLoading] = useState(false);

  /** Fetch a fresh RP context from the backend, then open the widget */
  const handleVerifyClick = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const ctx = await fetchRpContext();
      setRpContext(ctx);
      setOpen(true);
    } catch (err) {
      console.error('Failed to get RP context:', err);
      setError(err instanceof Error ? err.message : 'Failed to get RP signature');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSuccess = (result: IDKitResult) => {
    try {
      console.log('World ID v4 proof:', result);

      // orbLegacy preset returns IDKitResultV3
      if (result.protocol_version === '3.0' && result.responses.length > 0) {
        const response = result.responses[0] as ResponseItemV3;
        const adapted: WorldIdProof = {
          proof: response.proof,
          merkle_root: response.merkle_root,
          nullifier_hash: response.nullifier,
          verification_level: 'orb',
        };
        setVerified(true);
        setError(null);
        onSuccess(adapted);
      } else {
        throw new Error(`Unexpected protocol version: ${result.protocol_version}`);
      }
    } catch (err) {
      setError('Verification failed. Please try again.');
      console.error('World ID verification error:', err);
    }
  };

  const handleError = (errorCode: IDKitErrorCodes) => {
    console.error('World ID error:', errorCode);
    setError(`Verification error: ${errorCode}`);
    setOpen(false);
  };

  if (verified) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
        <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
          <Check className="w-4 h-4 text-green-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-green-400">Verified Human</p>
          <p className="text-xs text-zinc-500">World ID proof accepted</p>
        </div>
      </div>
    );
  }

  // Show setup guidance if app_id isn't configured
  if (!isWorldIdConfigured) {
    return (
      <div className="space-y-2">
        <div className="flex gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-amber-400">World ID not configured</p>
            <p className="text-xs text-amber-400/70 mt-1">
              To enable World ID verification, register your app at{' '}
              <a href="https://developer.world.org/" target="_blank" rel="noopener noreferrer" className="underline">
                developer.world.org
              </a>{' '}
              and set <code className="bg-amber-500/10 px-1 rounded">VITE_WORLD_ID_APP_ID</code> in your .env.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rpContext && (
        <IDKitRequestWidget
          app_id={WORLD_ID.appId as `app_${string}`}
          action={WORLD_ID.actionId}
          rp_context={rpContext}
          allow_legacy_proofs={true}
          environment="staging"
          open={open}
          onOpenChange={setOpen}
          preset={orbLegacy({ signal: address || '' })}
          onSuccess={handleSuccess}
          onError={handleError}
        />
      )}

      <button
        onClick={handleVerifyClick}
        disabled={disabled || loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
        ) : (
          <Shield className="w-4 h-4 text-zinc-400" />
        )}
        <span className="text-sm font-medium text-zinc-300">
          {loading ? 'Preparing…' : 'Verify with World ID'}
        </span>
      </button>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-xs">
          <AlertCircle className="w-3 h-3" />
          {error}
        </div>
      )}

      <p className="text-xs text-zinc-600 text-center">
        Orb-level verification — use the Simulator on testnet
      </p>
    </div>
  );
}
