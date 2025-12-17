/**
 * IntegrationMentionBubble Component
 *
 * Displays an integration mention as a compact pill/badge with icon.
 * Used in chat input to show selected integrations and in messages to display mentions.
 */

import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IntegrationIcon, getIntegrationColor } from '@/components/integrations/IntegrationIcon';

export interface IntegrationMentionBubbleProps {
  id: string;
  name: string;
  variant?: 'default' | 'input' | 'message';
  size?: 'sm' | 'md';
  onRemove?: () => void;
  onClick?: () => void;
  className?: string;
}

export function IntegrationMentionBubble({
  id,
  name,
  variant = 'default',
  size = 'md',
  onRemove,
  onClick,
  className,
}: IntegrationMentionBubbleProps) {
  const brandColor = getIntegrationColor(id);

  const isInteractive = !!onClick;
  const Component = isInteractive ? 'button' : 'span';

  return (
    <Component
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        'transition-all duration-150',

        // Size variants
        size === 'sm' && 'px-2 py-0.5 text-xs',
        size === 'md' && 'px-2.5 py-1 text-sm',

        // Style variants
        variant === 'default' && [
          'bg-muted/80 hover:bg-muted text-foreground',
        ],
        variant === 'input' && [
          'bg-primary/10 text-primary border border-primary/20',
          'hover:bg-primary/20',
        ],
        variant === 'message' && [
          'bg-accent/50 text-accent-foreground',
          isInteractive && 'hover:bg-accent cursor-pointer',
        ],

        className
      )}
      style={
        variant === 'input' && brandColor
          ? {
              backgroundColor: `${brandColor}15`,
              borderColor: `${brandColor}30`,
              color: brandColor,
            }
          : undefined
      }
    >
      {/* Icon */}
      <IntegrationIcon
        integrationId={id}
        size={size === 'sm' ? 'sm' : 'md'}
        variant={variant === 'input' ? 'colored' : 'default'}
      />

      {/* Name */}
      <span className="truncate max-w-[120px]">{name}</span>

      {/* Remove button (only for input variant) */}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className={cn(
            'flex-shrink-0 rounded-full p-0.5',
            'hover:bg-foreground/10 transition-colors',
            '-mr-0.5'
          )}
          aria-label={`Remove ${name}`}
        >
          <X className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
        </button>
      )}
    </Component>
  );
}

/**
 * Renders text with integration mentions as bubbles.
 * Parses @integrationId patterns and replaces them with bubble components.
 */
export interface RenderMentionsProps {
  text: string;
  integrations: Map<string, { id: string; name: string }>;
  onMentionClick?: (integrationId: string) => void;
}

export function renderTextWithMentions({
  text,
  integrations,
  onMentionClick,
}: RenderMentionsProps): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const mentionRegex = /@(\w+)/g;
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before mention
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const integrationId = match[1];
    const integration = integrations.get(integrationId);

    if (integration) {
      // Render as bubble
      parts.push(
        <IntegrationMentionBubble
          key={`${match.index}-${integrationId}`}
          id={integration.id}
          name={integration.name}
          variant="message"
          size="sm"
          onClick={onMentionClick ? () => onMentionClick(integrationId) : undefined}
        />
      );
    } else {
      // Keep as text if integration not found
      parts.push(match[0]);
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

export default IntegrationMentionBubble;
