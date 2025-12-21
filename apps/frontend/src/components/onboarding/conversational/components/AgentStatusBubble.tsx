import React from 'react';
import { cn } from '@/lib/utils';
import ThinkingIndicator from '@/components/common/ThinkingIndicator';
import { ThinkingStatusDisplay } from '@/components/chat';
import type { ThinkingStep } from '@/types/agentEvents';

interface AgentStatusBubbleProps {
  thinkingSteps: ThinkingStep[];
  streamingText: string;
  statusPhase: string | null;
  statusMessage: string | null;
}

const AgentStatusBubble: React.FC<AgentStatusBubbleProps> = ({
  thinkingSteps,
  streamingText,
  statusPhase,
  statusMessage,
}) => {
  return (
    <div className="flex w-full animate-in slide-in-from-bottom-4 duration-300 justify-start">
      <div className="max-w-[85%] rounded-2xl px-5 py-3.5 shadow-md bg-gradient-to-br from-white to-zinc-50 dark:from-zinc-800 dark:to-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200/50 dark:border-zinc-700/50">
        {thinkingSteps.length > 0 ? (
          <ThinkingStatusDisplay steps={thinkingSteps} isActive={true} />
        ) : streamingText ? (
          <div className="space-y-1">
            {streamingText
              .split('\n')
              .filter((line) => line.trim())
              .slice(-6)
              .map((line, index, arr) => {
                if (line.trim().startsWith('{') || line.trim().startsWith('"') || line.trim().startsWith('[')) {
                  return null;
                }
                const cleanLine = line
                  .replace(/\*\*/g, '')
                  .replace(/```json/g, '')
                  .replace(/```/g, '')
                  .trim();
                if (!cleanLine) return null;
                const isLatest = index === arr.length - 1;
                return (
                  <div
                    key={index}
                    className={cn(
                      'flex items-start gap-2 text-sm animate-in fade-in duration-200',
                      isLatest ? 'text-orange-600 dark:text-orange-400' : 'text-zinc-500 dark:text-zinc-500'
                    )}
                  >
                    <span className="mt-0.5 flex-shrink-0 text-xs">
                      {isLatest ? '>' : '-'}
                    </span>
                    <span className={cn('leading-relaxed', isLatest && 'font-medium')}>
                      {cleanLine.length > 100 ? `${cleanLine.slice(0, 100)}...` : cleanLine}
                    </span>
                  </div>
                );
              })
              .filter(Boolean)}
            <div className="pl-5">
              <ThinkingIndicator size="sm" />
            </div>
          </div>
        ) : (
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            {statusPhase === 'analyzing' ? (
              <ThinkingIndicator customText="Analyzing your files" size="sm" />
            ) : statusPhase === 'researching' ? (
              <ThinkingIndicator customText={`Researching: ${statusMessage || 'gathering info'}`} size="sm" />
            ) : statusPhase === 'scraping' ? (
              <ThinkingIndicator customText="Reading content" size="sm" />
            ) : statusMessage ? (
              <ThinkingIndicator customText={statusMessage} size="sm" />
            ) : (
              <ThinkingIndicator size="sm" />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentStatusBubble;
