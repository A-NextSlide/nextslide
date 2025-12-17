/**
 * LinkedInProfileCard Component
 *
 * Displays a LinkedIn profile as an interactive card with:
 * - Profile photo (or placeholder)
 * - Name, title, company
 * - Location
 * - Select button for confirmation
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Check, MapPin, Building2, Briefcase, ExternalLink, User } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface LinkedInProfile {
  id?: string;
  name: string;
  title?: string;
  company?: string;
  location?: string;
  linkedin_url?: string;
  photo_url?: string;
  email?: string;
  headline?: string;
}

export interface LinkedInProfileCardProps {
  profile: LinkedInProfile;
  isSelected?: boolean;
  onSelect?: (profile: LinkedInProfile) => void;
  variant?: 'default' | 'compact' | 'selected';
  className?: string;
}

export function LinkedInProfileCard({
  profile,
  isSelected = false,
  onSelect,
  variant = 'default',
  className,
}: LinkedInProfileCardProps) {
  const hasPhoto = !!profile.photo_url;

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-xl border bg-card overflow-hidden transition-all duration-200',
        'hover:shadow-md hover:border-primary/30',
        isSelected && 'ring-2 ring-primary border-primary shadow-md',
        variant === 'compact' ? 'w-[200px]' : 'w-[240px]',
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

      {/* Profile header with photo */}
      <div className="p-4 pb-3">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className={cn(
            'flex-shrink-0 rounded-full overflow-hidden bg-muted flex items-center justify-center',
            variant === 'compact' ? 'w-12 h-12' : 'w-14 h-14'
          )}>
            {hasPhoto ? (
              <img
                src={profile.photo_url}
                alt={profile.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Fallback to placeholder on error
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <User className={cn(
              'text-muted-foreground',
              hasPhoto ? 'hidden' : '',
              variant === 'compact' ? 'w-6 h-6' : 'w-7 h-7'
            )} />
          </div>

          {/* Name and headline */}
          <div className="flex-1 min-w-0">
            <h4 className={cn(
              'font-semibold text-foreground truncate',
              variant === 'compact' ? 'text-sm' : 'text-base'
            )}>
              {profile.name}
            </h4>
            {(profile.title || profile.headline) && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                {profile.headline || profile.title}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="px-4 pb-3 space-y-1.5">
        {profile.company && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{profile.company}</span>
          </div>
        )}
        {profile.title && !profile.headline && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Briefcase className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{profile.title}</span>
          </div>
        )}
        {profile.location && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{profile.location}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 pt-2 mt-auto flex items-center gap-2">
        {onSelect && (
          <Button
            size="sm"
            variant={isSelected ? 'default' : 'outline'}
            className={cn(
              'flex-1 h-8 text-xs',
              isSelected && 'bg-primary hover:bg-primary/90'
            )}
            onClick={() => onSelect(profile)}
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
        {profile.linkedin_url && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            asChild
          >
            <a
              href={profile.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              title="View on LinkedIn"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

export default LinkedInProfileCard;
