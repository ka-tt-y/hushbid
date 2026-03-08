import { Loader2, CheckCircle } from 'lucide-react';

interface StepProgressProps {
  current: number;
  total: number;
  message: string;
  /** Optional longer description explaining what this step does */
  description?: string;
}

/**
 * Shared step-progress indicator for multi-step wallet interactions.
 * Shows segmented progress bar, step label with spinner, and optional description.
 */
export function StepProgress({ current, total, message, description }: StepProgressProps) {
  const done = current > total;
  return (
    <div className="space-y-2.5 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
      {/* Segmented progress bar */}
      <div className="flex items-center gap-1.5">
        {Array.from({ length: total }, (_, i) => {
          const step = i + 1;
          const isComplete = step < current;
          const isActive = step === current;
          return (
            <div
              key={i}
              className={`h-2 flex-1 rounded-full transition-colors ${
                isComplete
                  ? 'bg-blue-500'
                  : isActive
                    ? 'bg-blue-400 animate-pulse'
                    : 'bg-zinc-700'
              }`}
            />
          );
        })}
      </div>
      {/* Step label */}
      <div className="flex items-center gap-2">
        {done ? (
          <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
        ) : (
          <Loader2 className="w-4 h-4 text-blue-400 shrink-0 animate-spin" />
        )}
        <p className="text-sm text-blue-400 font-medium">
          <span className="text-zinc-500">Step {Math.min(current, total)}/{total}</span>{' '}
          — {message}
        </p>
      </div>
      {/* Description */}
      {description && (
        <p className="text-xs text-zinc-400 leading-relaxed pl-6">
          {description}
        </p>
      )}
    </div>
  );
}
