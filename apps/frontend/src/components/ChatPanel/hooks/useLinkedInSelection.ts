import { useCallback, useEffect, useRef, useState } from 'react';

interface LinkedInProfile {
  id: string;
  name: string;
  title?: string;
  company?: string;
  linkedin_url?: string;
  photo_url?: string;
}

interface UseLinkedInSelectionOptions {
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  sendMessageRef: React.MutableRefObject<((message?: string) => void) | null>;
}

export function useLinkedInSelection({
  input,
  setInput,
  sendMessageRef,
}: UseLinkedInSelectionOptions) {
  const [selectedLinkedInProfile, setSelectedLinkedInProfile] = useState<LinkedInProfile | null>(null);
  const selectedProfileForContinuationRef = useRef<LinkedInProfile | null>(null);
  const originalLinkedInRequestRef = useRef<string | null>(null);

  const handleSelectLinkedInProfile = useCallback((profile: any) => {
    const newProfile: LinkedInProfile = {
      id: profile.id || profile.name,
      name: profile.name,
      title: profile.title,
      company: profile.company,
      linkedin_url: profile.linkedin_url,
      photo_url: profile.photo_url,
    };

    selectedProfileForContinuationRef.current = newProfile;
    setSelectedLinkedInProfile(newProfile);

    const profileDesc = `${newProfile.name}${newProfile.company ? ` from ${newProfile.company}` : ''}`;
    const originalRequest = originalLinkedInRequestRef.current;

    let continuationMsg = `Use the selected profile (${profileDesc}) for the slide`;
    if (originalRequest) {
      const linkedinMentions = (originalRequest.match(/@linkedin/gi) || []).length;
      if (linkedinMentions > 1) {
        continuationMsg = `I selected ${profileDesc}. Continue with the original request: "${originalRequest}"`;
      }
    }

    setInput(continuationMsg);
  }, [setInput]);

  const handleSkipLinkedInSelection = useCallback(() => {
    selectedProfileForContinuationRef.current = null;
    setSelectedLinkedInProfile(null);

    const originalRequest = originalLinkedInRequestRef.current;
    let skipMsg = 'Skip the profile lookup and continue without adding profile info';

    if (originalRequest) {
      const linkedinMentions = (originalRequest.match(/@linkedin/gi) || []).length;
      if (linkedinMentions > 1) {
        skipMsg = `Skip this profile. Continue with the original request: "${originalRequest}"`;
      }
    }

    setInput(skipMsg);
  }, [setInput]);

  useEffect(() => {
    if (
      input.startsWith('Use the selected profile') ||
      input.startsWith('Skip the profile lookup') ||
      input.startsWith('I selected ') ||
      input.startsWith('Skip this profile')
    ) {
      setTimeout(() => {
        sendMessageRef.current?.();
      }, 50);
    }
  }, [input, sendMessageRef]);

  return {
    selectedLinkedInProfile,
    setSelectedLinkedInProfile,
    selectedProfileForContinuationRef,
    originalLinkedInRequestRef,
    handleSelectLinkedInProfile,
    handleSkipLinkedInSelection,
  };
}
