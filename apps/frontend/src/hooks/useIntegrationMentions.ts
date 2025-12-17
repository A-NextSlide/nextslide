/**
 * useIntegrationMentions Hook
 *
 * Handles @ mention functionality for integrations in chat inputs.
 * Detects "@" trigger, fetches enabled integrations, and manages selection.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { getEnabledIntegrations, type EnabledIntegration } from '@/services/integrationsApi';

export interface IntegrationMention {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export interface MentionState {
  isOpen: boolean;
  query: string;
  position: number | null;
  integrations: IntegrationMention[];
  selectedIndex: number;
  isLoading: boolean;
}

export interface UseIntegrationMentionsReturn {
  // State
  mentionState: MentionState;
  selectedMentions: IntegrationMention[];

  // Handlers
  handleTextChange: (
    text: string,
    cursorPosition: number,
    setText: (text: string) => void
  ) => void;
  handleKeyDown: (e: React.KeyboardEvent) => boolean; // Returns true if event was handled
  selectMention: (
    integration: IntegrationMention,
    currentText: string,
    setText: (text: string) => void
  ) => void;
  closeMentionPopover: () => void;
  removeMention: (integrationId: string) => void;
  clearMentions: () => void;

  // Utilities
  extractMentionsFromText: (text: string) => string[];
  getTextWithoutMentions: (text: string) => string;
}

// Cache for enabled integrations
let cachedIntegrations: EnabledIntegration[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute

async function fetchIntegrations(): Promise<EnabledIntegration[]> {
  const now = Date.now();
  if (cachedIntegrations && now - cacheTimestamp < CACHE_TTL) {
    return cachedIntegrations;
  }

  try {
    cachedIntegrations = await getEnabledIntegrations();
    cacheTimestamp = now;
    return cachedIntegrations;
  } catch (error) {
    console.error('Failed to fetch enabled integrations:', error);
    return cachedIntegrations || [];
  }
}

export function useIntegrationMentions(): UseIntegrationMentionsReturn {
  const [mentionState, setMentionState] = useState<MentionState>({
    isOpen: false,
    query: '',
    position: null,
    integrations: [],
    selectedIndex: 0,
    isLoading: false,
  });

  const [selectedMentions, setSelectedMentions] = useState<IntegrationMention[]>([]);
  const allIntegrationsRef = useRef<EnabledIntegration[]>([]);

  // Preload integrations on mount
  useEffect(() => {
    fetchIntegrations().then((integrations) => {
      allIntegrationsRef.current = integrations;
    });
  }, []);

  const closeMentionPopover = useCallback(() => {
    setMentionState((prev) => ({
      ...prev,
      isOpen: false,
      query: '',
      position: null,
      selectedIndex: 0,
    }));
  }, []);

  const filterIntegrations = useCallback((query: string): IntegrationMention[] => {
    const integrations = allIntegrationsRef.current;
    if (!query) {
      return integrations.map((i) => ({
        id: i.id,
        name: i.name,
        icon: i.icon,
        description: i.description,
      }));
    }

    const lowerQuery = query.toLowerCase();
    return integrations
      .filter(
        (i) =>
          i.id.toLowerCase().includes(lowerQuery) ||
          i.name.toLowerCase().includes(lowerQuery) ||
          i.description.toLowerCase().includes(lowerQuery)
      )
      .map((i) => ({
        id: i.id,
        name: i.name,
        icon: i.icon,
        description: i.description,
      }));
  }, []);

  const handleTextChange = useCallback(
    (text: string, cursorPosition: number, setText: (text: string) => void) => {
      // Check for @ trigger
      const beforeCursor = text.slice(0, cursorPosition);
      const mentionMatch = beforeCursor.match(/@([\w]*)$/);

      if (mentionMatch) {
        const query = mentionMatch[1];
        const position = mentionMatch.index!;

        // Fetch integrations if not loaded
        if (allIntegrationsRef.current.length === 0) {
          setMentionState((prev) => ({ ...prev, isLoading: true }));
          fetchIntegrations().then((integrations) => {
            allIntegrationsRef.current = integrations;
            const filtered = filterIntegrations(query);
            setMentionState({
              isOpen: true,
              query,
              position,
              integrations: filtered,
              selectedIndex: 0,
              isLoading: false,
            });
          });
        } else {
          const filtered = filterIntegrations(query);
          setMentionState({
            isOpen: true,
            query,
            position,
            integrations: filtered,
            selectedIndex: 0,
            isLoading: false,
          });
        }
      } else {
        // Close popover if no @ trigger
        if (mentionState.isOpen) {
          closeMentionPopover();
        }
      }
    },
    [mentionState.isOpen, filterIntegrations, closeMentionPopover]
  );

  const selectMention = useCallback(
    (
      integration: IntegrationMention,
      currentText: string,
      setText: (text: string) => void
    ) => {
      if (mentionState.position === null) return;

      // Replace @query with @integrationId (including space after)
      const beforeMention = currentText.slice(0, mentionState.position);
      const afterMention = currentText.slice(
        mentionState.position + 1 + mentionState.query.length
      );
      const newText = `${beforeMention}@${integration.id} ${afterMention}`;

      setText(newText);

      // Add to selected mentions if not already there
      setSelectedMentions((prev) => {
        if (prev.some((m) => m.id === integration.id)) {
          return prev;
        }
        return [...prev, integration];
      });

      closeMentionPopover();
    },
    [mentionState.position, mentionState.query, closeMentionPopover]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!mentionState.isOpen || mentionState.integrations.length === 0) {
        return false;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setMentionState((prev) => ({
            ...prev,
            selectedIndex: Math.min(
              prev.selectedIndex + 1,
              prev.integrations.length - 1
            ),
          }));
          return true;

        case 'ArrowUp':
          e.preventDefault();
          setMentionState((prev) => ({
            ...prev,
            selectedIndex: Math.max(prev.selectedIndex - 1, 0),
          }));
          return true;

        case 'Enter':
        case 'Tab':
          e.preventDefault();
          const selected = mentionState.integrations[mentionState.selectedIndex];
          if (selected) {
            // Get current text from the target element
            const target = e.target as HTMLTextAreaElement | HTMLInputElement;
            selectMention(selected, target.value, (newText) => {
              // Trigger a synthetic input event
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype,
                'value'
              )?.set || Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
              )?.set;

              if (nativeInputValueSetter) {
                nativeInputValueSetter.call(target, newText);
              } else {
                target.value = newText;
              }

              // Dispatch input event
              const event = new Event('input', { bubbles: true });
              target.dispatchEvent(event);
            });
          }
          return true;

        case 'Escape':
          e.preventDefault();
          closeMentionPopover();
          return true;

        default:
          return false;
      }
    },
    [mentionState, selectMention, closeMentionPopover]
  );

  const removeMention = useCallback((integrationId: string) => {
    setSelectedMentions((prev) => prev.filter((m) => m.id !== integrationId));
  }, []);

  const clearMentions = useCallback(() => {
    setSelectedMentions([]);
  }, []);

  const extractMentionsFromText = useCallback((text: string): string[] => {
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      const integrationId = match[1];
      // Verify it's a valid integration
      if (allIntegrationsRef.current.some((i) => i.id === integrationId)) {
        mentions.push(integrationId);
      }
    }

    return [...new Set(mentions)]; // Remove duplicates
  }, []);

  const getTextWithoutMentions = useCallback((text: string): string => {
    // Remove @integrationId patterns
    return text.replace(/@(\w+)\s?/g, '').trim();
  }, []);

  return {
    mentionState,
    selectedMentions,
    handleTextChange,
    handleKeyDown,
    selectMention,
    closeMentionPopover,
    removeMention,
    clearMentions,
    extractMentionsFromText,
    getTextWithoutMentions,
  };
}
