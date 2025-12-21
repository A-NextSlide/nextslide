import React from 'react';
import { Loader2, Lock, Sparkles, FileText } from 'lucide-react';

interface SlideModeSelectionProps {
  isProcessing: boolean;
  isBlocking?: boolean;
  blockingLabel?: string;
  isLocked?: boolean;
  lockedLabel?: string;
  onSelect: (mode: 'interactive' | 'static') => void;
  onContinueChat: () => void;
  showContinueChat?: boolean;
}

const SlideModeSelection: React.FC<SlideModeSelectionProps> = ({
  isProcessing,
  isBlocking = false,
  blockingLabel,
  isLocked = false,
  lockedLabel,
  onSelect,
  onContinueChat,
  showContinueChat = true,
}) => {
  const showStatus = isProcessing || isBlocking || isLocked;
  const isDisabled = isProcessing || isBlocking || isLocked;
  const resolvedBlockingLabel = blockingLabel || (isProcessing ? 'Preparing your deck...' : 'Finishing theme...');
  const statusLabel = isLocked ? (lockedLabel || 'Keep chatting to unlock generation.') : resolvedBlockingLabel;

  return (
    <div className="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Side-by-side grid layout */}
      <div className="grid grid-cols-2 gap-3 w-full">
        {/* Next Gen Option */}
        <button
          onClick={() => onSelect('interactive')}
          disabled={isDisabled}
          className="group relative w-full rounded-xl overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/15 active:scale-[0.98] disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed text-left border border-zinc-200/50 dark:border-zinc-700/50 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900"
        >
          {/* Gradient Orbs */}
          <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/20 rounded-full blur-2xl" />
          <div className="absolute bottom-0 left-0 w-20 h-20 bg-purple-600/20 rounded-full blur-2xl" />

          {/* Content */}
          <div className="relative p-4 flex flex-col gap-3 z-10">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shadow-lg shadow-orange-500/20">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="px-1.5 py-0.5 bg-orange-500/90 rounded text-[9px] font-bold text-white uppercase tracking-wider">
                Rec
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">Next Gen</h3>
              <div className="text-[10px] text-zinc-400 font-medium mt-0.5">Interactive • Dynamic</div>
            </div>
          </div>
        </button>

        {/* Traditional Option */}
        <button
          onClick={() => onSelect('static')}
          disabled={isDisabled}
          className="group relative w-full rounded-xl overflow-hidden transition-all duration-300 hover:shadow-lg active:scale-[0.98] disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed text-left border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
        >
          <div className="relative p-4 flex flex-col gap-3 z-10">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center">
                <FileText className="w-4 h-4 text-zinc-500" />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-tight">Traditional</h3>
              <div className="text-[10px] text-zinc-400 font-medium mt-0.5">Static • PDF Export</div>
            </div>
          </div>
        </button>
      </div>

      {showContinueChat && (
        <div className="mt-4 text-center">
          <button
            onClick={onContinueChat}
            className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            or continue chatting to refine
          </button>
        </div>
      )}

      {showStatus && (
        <div className="mt-4 flex items-center justify-center">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-200/70 dark:border-zinc-700/80 bg-white/80 dark:bg-zinc-900/70 text-[11px] text-zinc-500 shadow-sm">
            {isLocked ? (
              <Lock className="w-3.5 h-3.5" />
            ) : (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            )}
            <span>{statusLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SlideModeSelection;
