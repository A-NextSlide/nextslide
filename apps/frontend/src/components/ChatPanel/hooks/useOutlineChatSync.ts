import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ExtendedChatMessageProps } from '@/components/chat';

interface UseOutlineChatSyncOptions {
  outlineMode: boolean;
  useOutlineAgent: boolean;
  outline: any;
  outlineMessages?: ExtendedChatMessageProps[];
  isGenerating: boolean;
  setIsGenerating: Dispatch<SetStateAction<boolean>>;
  onOutlineChatGeneratingChange?: (isGenerating: boolean) => void;
  outlineCurrentSlideIndex?: number;
  setOutlineSlideTarget: Dispatch<SetStateAction<number | 'all'>>;
  messagesLength: number;
  setMessages: Dispatch<SetStateAction<ExtendedChatMessageProps[]>>;
}

export function useOutlineChatSync({
  outlineMode,
  useOutlineAgent,
  outline,
  outlineMessages,
  isGenerating,
  setIsGenerating,
  onOutlineChatGeneratingChange,
  outlineCurrentSlideIndex,
  setOutlineSlideTarget,
  messagesLength,
  setMessages,
}: UseOutlineChatSyncOptions) {
  useEffect(() => {
    if (outlineMode && useOutlineAgent && outline?.stylePreferences && messagesLength === 0) {
      const prefs = outline.stylePreferences;
      const messageLines = [];

      if (prefs.initialIdea) {
        messageLines.push(`**Topic:** ${prefs.initialIdea}`);
      }

      if (prefs.vibeContext) {
        messageLines.push(`**Style:** ${prefs.vibeContext}`);
      }

      const toggles = [];
      if (prefs.autoSelectImages) toggles.push('Auto-select images');
      if (toggles.length > 0) {
        messageLines.push(`**Options:** ${toggles.join(', ')}`);
      }

      if (messageLines.length > 0) {
        setMessages([{
          id: 'initial-prompt',
          type: 'user',
          message: messageLines.join('\n'),
          timestamp: new Date(),
          feedback: null
        }]);
      }
    }
  }, [messagesLength, outline?.stylePreferences, outlineMode, setMessages, useOutlineAgent]);

  // Track last synced message IDs to prevent unnecessary re-renders
  const lastSyncedIdsRef = useRef<string>('');

  useEffect(() => {
    if (outlineMode && outlineMessages && outlineMessages.length > 0) {
      // Create a signature of message IDs to check if we actually need to update
      const newIds = outlineMessages.map(m => m.id).join(',');
      if (newIds !== lastSyncedIdsRef.current) {
        lastSyncedIdsRef.current = newIds;
        setMessages(outlineMessages);
      }
    }
  }, [outlineMode, outlineMessages, setMessages]);

  useEffect(() => {
    if (outlineMode && onOutlineChatGeneratingChange) {
      onOutlineChatGeneratingChange(isGenerating);
    }
  }, [isGenerating, onOutlineChatGeneratingChange, outlineMode]);

  useEffect(() => {
    if (outlineMode && isGenerating && outline?.slides && outline.slides.length > 0) {
      const allSlidesHaveContent = outline.slides.every((slide: any) =>
        slide.content && slide.content.trim() !== ''
      );
      if (allSlidesHaveContent) {
        setIsGenerating(false);
      }
    }
  }, [isGenerating, outline?.slides, outlineMode, setIsGenerating]);

  useEffect(() => {
    if (outlineCurrentSlideIndex !== undefined && outlineCurrentSlideIndex >= 0) {
      setOutlineSlideTarget(outlineCurrentSlideIndex);
    }
  }, [outlineCurrentSlideIndex, setOutlineSlideTarget]);
}
