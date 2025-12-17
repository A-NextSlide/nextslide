/**
 * IntegrationResultCard Component
 *
 * A generic card for displaying individual integration results.
 * Provides consistent styling with customizable content areas.
 *
 * Use this as a base for specific integration cards (LinkedIn, Salesforce, etc.)
 * or use it directly with the renderContent prop for simple cases.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Check, ExternalLink, User } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface IntegrationResultCardProps {
  // Core data
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  imageUrl?: string;
  externalUrl?: string;

  // Metadata rows
  metadata?: Array<{
    icon: React.ReactNode;
    label: string;
  }>;

  // Selection
  isSelected?: boolean;
  onSelect?: () => void;
  selectable?: boolean;

  // Appearance
  variant?: 'default' | 'compact';
  accentColor?: string;
  className?: string;

  // Custom content
  children?: React.ReactNode;
}

export function IntegrationResultCard({
  id,
  title,
  subtitle,
  description,
  imageUrl,
  externalUrl,
  metadata = [],
  isSelected = false,
  onSelect,
  selectable = true,
  variant = 'default',
  accentColor,
  className,
  children,
}: IntegrationResultCardProps) {
  const isCompact = variant === 'compact';

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-xl border bg-card overflow-hidden transition-all duration-200',
        'hover:shadow-md hover:border-primary/30',
        isSelected && 'ring-2 ring-primary border-primary shadow-md',
        className
      )}
    >
      {/* Selected badge */}
      {isSelected && (
        <div className="absolute top-2 right-2 z-10">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
            <Check className="w-3 h-3" />
            Selected
          </div>
        </div>
      )}

      {/* Header with image */}
      <div className="p-4 pb-3">
        <div className="flex items-start gap-3">
          {/* Avatar/Image */}
          <div
            className={cn(
              'flex-shrink-0 rounded-full overflow-hidden bg-muted flex items-center justify-center',
              isCompact ? 'w-10 h-10' : 'w-12 h-12'
            )}
            style={accentColor ? { backgroundColor: `${accentColor}15` } : undefined}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <User
                className={cn(
                  'text-muted-foreground',
                  isCompact ? 'w-5 h-5' : 'w-6 h-6'
                )}
                style={accentColor ? { color: accentColor } : undefined}
              />
            )}
          </div>

          {/* Title and subtitle */}
          <div className="flex-1 min-w-0">
            <h4
              className={cn(
                'font-semibold text-foreground truncate',
                isCompact ? 'text-sm' : 'text-base'
              )}
            >
              {title}
            </h4>
            {subtitle && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {description && (
        <div className="px-4 pb-2">
          <p className="text-xs text-muted-foreground line-clamp-2">
            {description}
          </p>
        </div>
      )}

      {/* Metadata rows */}
      {metadata.length > 0 && (
        <div className="px-4 pb-3 space-y-1.5">
          {metadata.map((item, index) => (
            <div key={index} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex-shrink-0 w-3.5 h-3.5">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Custom content */}
      {children}

      {/* Actions */}
      <div className="px-4 pb-4 pt-2 mt-auto flex items-center gap-2">
        {selectable && onSelect && (
          <Button
            size="sm"
            variant={isSelected ? 'default' : 'outline'}
            className={cn(
              'flex-1 h-8 text-xs',
              isSelected && 'bg-primary hover:bg-primary/90'
            )}
            onClick={onSelect}
          >
            {isSelected ? (
              <>
                <Check className="w-3 h-3 mr-1" />
                Selected
              </>
            ) : (
              'Select'
            )}
          </Button>
        )}
        {externalUrl && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            asChild
          >
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open external link"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

export default IntegrationResultCard;
