import React from 'react';
import { Lock, Sparkles, FileText } from 'lucide-react';

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
          className="group relative w-full rounded-xl overflow-hidden border border-transparent px-4 py-3 text-left transition-all duration-300 active:scale-[0.98] disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed bg-gradient-to-r from-[#FF4301] to-[#FF6B35] hover:from-[#E63D00] hover:to-[#FF4301] text-white shadow-[0_4px_14px_0_rgba(255,67,1,0.35)] hover:shadow-[0_6px_20px_rgba(255,67,1,0.45)]"
          style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif' }}
        >
          {/* Content */}
          <div className="relative flex flex-col gap-3 z-10">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shadow-inner">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="px-1.5 py-0.5 bg-white/20 rounded text-[9px] font-bold text-white uppercase tracking-wider">
                Rec
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">Next Gen</h3>
              <div className="text-[10px] text-white/80 font-semibold mt-0.5">Interactive • Dynamic</div>
            </div>
          </div>
        </button>

        {/* Traditional Option */}
        <button
          onClick={() => onSelect('static')}
          disabled={isDisabled}
          className="group relative w-full rounded-xl overflow-hidden border border-orange-200/70 px-4 py-3 text-left transition-all duration-300 active:scale-[0.98] disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed bg-white shadow-[0_4px_14px_0_rgba(255,67,1,0.18)] hover:shadow-[0_6px_20px_rgba(255,67,1,0.28)]"
          style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif' }}
        >
          <div className="relative flex flex-col gap-3 z-10">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center">
                <FileText className="w-4 h-4 text-orange-500" />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 leading-tight">Traditional</h3>
              <div className="text-[10px] text-zinc-500 font-semibold mt-0.5">Static • PDF Export</div>
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
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-200/70 bg-white/90 text-[11px] text-zinc-500 shadow-sm">
            {isLocked && <Lock className="w-3.5 h-3.5" />}
            <span>{statusLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SlideModeSelection;
