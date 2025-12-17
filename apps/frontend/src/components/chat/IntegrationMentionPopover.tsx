/**
 * IntegrationMentionPopover Component
 *
 * Autocomplete popover for @ mentions of integrations in chat.
 * Shows a scrollable list of enabled integrations filtered by search query.
 */

import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { IntegrationIcon } from '@/components/integrations/IntegrationIcon';
import type { IntegrationMention, MentionState } from '@/hooks/useIntegrationMentions';

export interface IntegrationMentionPopoverProps {
  state: MentionState;
  onSelect: (integration: IntegrationMention) => void;
  onClose: () => void;
  className?: string;
}

export function IntegrationMentionPopover({
  state,
  onSelect,
  onClose,
  className,
}: IntegrationMentionPopoverProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedRef.current && listRef.current) {
      selectedRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [state.selectedIndex]);

  if (!state.isOpen) {
    return null;
  }

  return (
    <div
      className={cn(
        'absolute z-50 min-w-[240px] max-w-[300px] rounded-lg border bg-popover shadow-lg',
        'animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2',
        'bottom-full mb-2',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b">
        <span className="text-[11px] font-medium text-muted-foreground">
          Integrations
        </span>
      </div>

      {/* Loading state */}
      {state.isLoading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!state.isLoading && state.integrations.length === 0 && (
        <div className="py-4 px-2.5 text-center">
          <p className="text-xs text-muted-foreground">
            {state.query
              ? `No integrations matching "${state.query}"`
              : 'No integrations available'}
          </p>
        </div>
      )}

      {/* Integration list */}
      {!state.isLoading && state.integrations.length > 0 && (
        <div
          ref={listRef}
          className="max-h-[180px] overflow-y-auto py-0.5"
        >
          {state.integrations.map((integration, index) => (
            <button
              key={integration.id}
              ref={index === state.selectedIndex ? selectedRef : null}
              onClick={() => onSelect(integration)}
              className={cn(
                'w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left',
                'transition-colors duration-150',
                'hover:bg-accent/50',
                index === state.selectedIndex && 'bg-accent'
              )}
            >
              {/* Icon with brand color */}
              <div className="flex-shrink-0 w-6 h-6 rounded-md bg-muted/50 flex items-center justify-center">
                <IntegrationIcon
                  integrationId={integration.id}
                  size="md"
                  variant="colored"
                />
              </div>

              {/* Name and description */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-xs truncate">
                  {integration.name}
                </div>
                <div className="text-[10px] text-muted-foreground truncate leading-tight">
                  {integration.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Footer hint - more compact */}
      <div className="flex items-center gap-3 px-2.5 py-1.5 border-t text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">↑↓</kbd>
          navigate
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">↵</kbd>
          select
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">esc</kbd>
          close
        </span>
      </div>
    </div>
  );
}

export default IntegrationMentionPopover;
