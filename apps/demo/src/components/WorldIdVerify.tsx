import { useState } from 'react';
import { IDKitWidget, VerificationLevel } from '@worldcoin/idkit';
import type { ISuccessResult, IErrorState } from '@worldcoin/idkit';
import { Shield, Check, AlertCircle, Info } from 'lucide-react';
import { WORLD_ID } from '../config/wagmi';

// Check if a real app_id is configured (not the placeholder)
const isWorldIdConfigured = (() => {
  const id = WORLD_ID.appId;
  return id && id.startsWith('app_') && id !== 'app_hushbid';
})();

/**
 * World ID proof result — the shape expected by the rest of the app.
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

export function WorldIdVerify({ onSuccess, disabled, address }: WorldIdVerifyProps) {
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSuccess = (result: ISuccessResult) => {
    console.log('World ID proof:', result);
    const adapted: WorldIdProof = {
      proof: result.proof,
      merkle_root: result.merkle_root,
      nullifier_hash: result.nullifier_hash,
      verification_level: result.verification_level,
    };
    setVerified(true);
    setError(null);
    onSuccess(adapted);
  };

  const handleError = (error: IErrorState) => {
    console.error('World ID error:', error);
    setError(`Verification error: ${error.code}`);
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
      <IDKitWidget
        app_id={WORLD_ID.appId as `app_${string}`}
        action={WORLD_ID.actionId}
        signal={address || ''}
        onSuccess={handleSuccess}
        onError={handleError}
        verification_level={VerificationLevel.Device}
      >
        {({ open }) => (
          <button
            onClick={open}
            disabled={disabled}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Shield className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-300">Verify with World ID</span>
          </button>
        )}
      </IDKitWidget>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-xs">
          <AlertCircle className="w-3 h-3" />
          {error}
        </div>
      )}

      <p className="text-xs text-zinc-600 text-center">
        Device-level verification — use the{' '}
        <a href="https://simulator.worldcoin.org/" target="_blank" rel="noopener noreferrer" className="underline">
          Simulator
        </a>{' '}
        on staging
      </p>
    </div>
  );
}
