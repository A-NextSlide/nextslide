/**
 * LinkedInSearchResults Component
 *
 * LinkedIn-specific implementation using the generic IntegrationResultsBlock.
 * Demonstrates how to build integration-specific blocks on top of the generic system.
 */

import React from 'react';
import { Building2, MapPin, Briefcase } from 'lucide-react';
import { IntegrationResultsBlock } from './IntegrationResultsBlock';
import { IntegrationResultCard } from './IntegrationResultCard';
import type { LinkedInProfile } from './LinkedInProfileCard';

export interface LinkedInSearchResultsProps {
  query: string;
  profiles: LinkedInProfile[];
  isLoading?: boolean;
  error?: string;
  selectedProfileId?: string;
  onSelectProfile?: (profile: LinkedInProfile) => void;
  onSkip?: () => void;  // Skip selection and continue
  className?: string;
}

export function LinkedInSearchResults({
  query,
  profiles,
  isLoading = false,
  error,
  selectedProfileId,
  onSelectProfile,
  onSkip,
  className,
}: LinkedInSearchResultsProps) {
  // Debug logging
  console.log('[LinkedInSearchResults] Rendering with:', {
    query,
    profileCount: profiles?.length,
    profiles,
    isLoading,
    error
  });

  // Transform profiles to include required 'id' field
  const resultsWithIds = profiles.map((profile, index) => ({
    ...profile,
    id: profile.id || `profile-${index}-${(profile.name || 'unknown').replace(/\s+/g, '-').toLowerCase()}`,
  }));

  return (
    <IntegrationResultsBlock
      integrationId="linkedin"
      integrationName="LinkedIn"
      query={query}
      results={resultsWithIds}
      isLoading={isLoading}
      error={error}
      selectedId={selectedProfileId}
      onSelect={onSelectProfile}
      onSkip={onSkip}
      emptyMessage={`No LinkedIn profiles found for "${query}"`}
      cardWidth={220}
      className={className}
      renderCard={(profile, isSelected, onSelect) => {
        // Build metadata rows
        const metadata = [];
        if (profile.company) {
          metadata.push({
            icon: <Building2 className="w-3.5 h-3.5" />,
            label: profile.company,
          });
        }
        if (profile.title && !profile.headline) {
          metadata.push({
            icon: <Briefcase className="w-3.5 h-3.5" />,
            label: profile.title,
          });
        }
        if (profile.location) {
          metadata.push({
            icon: <MapPin className="w-3.5 h-3.5" />,
            label: profile.location,
          });
        }

        return (
          <IntegrationResultCard
            id={profile.id}
            title={profile.name}
            subtitle={profile.headline || profile.title}
            imageUrl={profile.photo_url}
            externalUrl={profile.linkedin_url}
            metadata={metadata}
            isSelected={isSelected}
            onSelect={onSelect}
            accentColor="#0077B5"
            variant={profiles.length > 3 ? 'compact' : 'default'}
          />
        );
      }}
    />
  );
}

export default LinkedInSearchResults;
