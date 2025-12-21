import React from 'react';
import { cn } from '@/lib/utils';

interface SkipChatPromptProps {
  onSkip: () => void;
  label?: string;
  helperText?: string;
  className?: string;
}

const SkipChatPrompt: React.FC<SkipChatPromptProps> = ({
  onSkip,
  label = 'Skip chat',
  helperText = '(i might miss some important details, answer below.)',
  className,
}) => {
  return (
    <div className={cn('flex flex-col items-center mt-4 animate-in fade-in', className)}>
      <button
        onClick={onSkip}
        className="text-zinc-400 hover:text-zinc-500 text-sm font-medium transition-colors flex items-center gap-1"
      >
        {label}
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <span className="text-xs text-zinc-400 mt-1">{helperText}</span>
    </div>
  );
};

export default SkipChatPrompt;
