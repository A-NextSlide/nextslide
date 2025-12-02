/**
 * Credit Indicator Component
 *
 * Compact credit display for headers/sidebars.
 * Shows remaining credits with visual indicator.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCredits } from '@/context/CreditsContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface CreditIndicatorProps {
  className?: string;
  showLabel?: boolean;
  compact?: boolean;
}

export const CreditIndicator: React.FC<CreditIndicatorProps> = ({
  className,
  showLabel = true,
  compact = false
}) => {
  const navigate = useNavigate();
  const { balance, loading } = useCredits();

  if (loading || !balance) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <div className="w-4 h-4 rounded-full bg-black/10 dark:bg-white/10 animate-pulse" />
        {showLabel && <div className="w-12 h-4 bg-black/10 dark:bg-white/10 rounded animate-pulse" />}
      </div>
    );
  }

  const percentage = (balance.remaining_credits / balance.monthly_credits) * 100;
  const isLow = percentage < 20;
  const isCritical = percentage < 5;

  const getStatusColor = () => {
    if (isCritical) return 'text-red-500';
    if (isLow) return 'text-amber-500';
    return 'text-[#FF4301]';
  };

  const getBgColor = () => {
    if (isCritical) return 'bg-red-500/10';
    if (isLow) return 'bg-amber-500/10';
    return 'bg-[#FF4301]/10';
  };

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => navigate('/pricing')}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-full transition-colors',
              getBgColor(),
              'hover:opacity-80',
              className
            )}
          >
            <Zap className={cn('w-3.5 h-3.5', getStatusColor())} />
            <span className={cn('text-xs font-medium', getStatusColor())}>
              {balance.remaining_credits}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{balance.remaining_credits} credits remaining</p>
          <p className="text-xs text-muted-foreground">~{balance.estimated_presentations} presentations</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <button
      onClick={() => navigate('/pricing')}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg transition-all',
        getBgColor(),
        'hover:opacity-80 group',
        className
      )}
    >
      <Zap className={cn('w-4 h-4', getStatusColor())} />
      <div className="flex flex-col items-start">
        <span className={cn('text-sm font-semibold', getStatusColor())}>
          {balance.remaining_credits} credits
        </span>
        {showLabel && (
          <span className="text-xs text-black/50 dark:text-white/50">
            ~{balance.estimated_presentations} presentations
          </span>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-black/30 dark:text-white/30 group-hover:translate-x-0.5 transition-transform" />
    </button>
  );
};

export default CreditIndicator;
