import React from 'react';
import { Lock, Sparkles, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SlideModeSelectionProps {
  isProcessing: boolean;
  isBlocking?: boolean;
  blockingLabel?: string;
  isLocked?: boolean;
  lockedLabel?: string;
  onSelect: (mode: 'interactive' | 'static') => void;
  onContinueChat: () => void;
  showContinueChat?: boolean;
  compact?: boolean;
  className?: string;
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
  compact = false,
  className,
}) => {
  const showStatus = isProcessing || isBlocking || isLocked;
  const isDisabled = isProcessing || isBlocking || isLocked;
  const resolvedBlockingLabel = blockingLabel || (isProcessing ? 'Preparing your deck...' : 'Finishing theme...');
  const statusLabel = isLocked ? (lockedLabel || 'Keep chatting to unlock generation.') : resolvedBlockingLabel;
  const optionPadding = compact ? 'px-3 py-2.5' : 'px-4 py-3';
  const optionGap = compact ? 'gap-2' : 'gap-3';
  const iconSize = compact ? 'w-8 h-8' : 'w-9 h-9';
  const titleSize = compact ? 'text-xs' : 'text-sm';
  const subtitleSize = compact ? 'text-[9px]' : 'text-[10px]';
  const badgeSize = compact ? 'text-[8px]' : 'text-[9px]';
  const statusMargin = compact ? 'mt-3' : 'mt-4';

  return (
    <div className={cn("mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300", className)}>
      {/* Side-by-side grid layout */}
      <div className={cn("grid grid-cols-2 w-full", optionGap)}>
        {/* Next Gen Option */}
        <button
          onClick={() => onSelect('interactive')}
          disabled={isDisabled}
          className={cn(
            "group relative w-full rounded-xl overflow-hidden border border-transparent text-left transition-all duration-300 active:scale-[0.98] disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed bg-gradient-to-r from-[#FF4301] to-[#FF6B35] hover:from-[#E63D00] hover:to-[#FF4301] text-white shadow-[0_4px_14px_0_rgba(255,67,1,0.35)] hover:shadow-[0_6px_20px_rgba(255,67,1,0.45)]",
            optionPadding
          )}
          style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif' }}
        >
          {/* Content */}
          <div className={cn("relative flex flex-col z-10", optionGap)}>
            <div className="flex items-center justify-between">
              <div className={cn("rounded-lg bg-white/20 flex items-center justify-center shadow-inner", iconSize)}>
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className={cn("px-1.5 py-0.5 bg-white/20 rounded font-bold text-white uppercase tracking-wider", badgeSize)}>
                Rec
              </div>
            </div>
            <div>
              <h3 className={cn("font-bold text-white leading-tight", titleSize)}>Next Gen</h3>
              <div className={cn("text-white/80 font-semibold mt-0.5", subtitleSize)}>Interactive • Dynamic</div>
            </div>
          </div>
        </button>

        {/* Traditional Option */}
        <button
          onClick={() => onSelect('static')}
          disabled={isDisabled}
          className={cn(
            "group relative w-full rounded-xl overflow-hidden border border-orange-200/70 text-left transition-all duration-300 active:scale-[0.98] disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed bg-white shadow-[0_4px_14px_0_rgba(255,67,1,0.18)] hover:shadow-[0_6px_20px_rgba(255,67,1,0.28)]",
            optionPadding
          )}
          style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif' }}
        >
          <div className={cn("relative flex flex-col z-10", optionGap)}>
            <div className="flex items-center justify-between">
              <div className={cn("rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center", iconSize)}>
                <FileText className="w-4 h-4 text-orange-500" />
              </div>
            </div>
            <div>
              <h3 className={cn("font-bold text-zinc-900 leading-tight", titleSize)}>Traditional</h3>
              <div className={cn("text-zinc-500 font-semibold mt-0.5", subtitleSize)}>Static • PDF Export</div>
            </div>
          </div>
        </button>
      </div>

      {showContinueChat && (
        <div className={cn("text-center", statusMargin)}>
          <button
            onClick={onContinueChat}
            className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            or continue chatting to refine
          </button>
        </div>
      )}

      {showStatus && (
        <div className={cn("flex items-center justify-center", statusMargin)}>
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
