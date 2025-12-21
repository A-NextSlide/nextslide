import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ExtendedChatMessageProps } from '@/components/chat';
import { normalizeReferenceImages } from '@/utils/referenceImages';
import { normalizeDeckTitle } from '@/utils/normalizeDeckTitle';

interface UseInitialConversationalDataOptions {
  initialConversationalData?: any;
  deckId?: string;
  setMessages: Dispatch<SetStateAction<ExtendedChatMessageProps[]>>;
  onOutlineAgentToolCall?: (params: any) => void;
  onOutlineChatGeneratingChange?: (isGenerating: boolean) => void;
}

export function useInitialConversationalData({
  initialConversationalData,
  deckId,
  setMessages,
  onOutlineAgentToolCall,
  onOutlineChatGeneratingChange,
}: UseInitialConversationalDataOptions) {
  const hasProcessedConversationalDataRef = useRef(false);

  useEffect(() => {
    if (
      initialConversationalData &&
      !hasProcessedConversationalDataRef.current &&
      onOutlineAgentToolCall
    ) {
      hasProcessedConversationalDataRef.current = true;

      if (initialConversationalData.slides && initialConversationalData.slides.length > 0) {
        const normalizedReferenceImages = normalizeReferenceImages(initialConversationalData.slideScreenshots);

        onOutlineAgentToolCall({
          topic: initialConversationalData.topic,
          slide_count: initialConversationalData.slideCount,
          detail_level: initialConversationalData.detailLevel || 'standard',
          slides: initialConversationalData.slides,
          narrative: initialConversationalData.narrative,
          uploadedMedia: initialConversationalData.uploadedMedia,
          use_uploaded_images: initialConversationalData.use_uploaded_images,
          stylePreferences: {
            slideMode: initialConversationalData.slideMode || 'interactive',
            referenceImages: normalizedReferenceImages
          }
        });

        if (initialConversationalData.narrative) {
          setMessages(prev => [
            ...prev,
            {
              id: `narrative-${Date.now()}`,
              type: 'ai',
              message: initialConversationalData.narrative,
              timestamp: new Date(),
              feedback: null
            }
          ]);
        }

        const themeChanges = initialConversationalData.themeChanges;
        (async () => {
          try {
            const { outlineApi } = await import('@/services/outlineApi');

            const searchedColors = themeChanges?.colors || themeChanges?.palette || themeChanges?.color_palette;
            const searchedFont = themeChanges?.font || themeChanges?.typography?.heading?.fontFamily;

            const outlineForTheme = {
              id: deckId || `temp-${Date.now()}`,
              title: normalizeDeckTitle(initialConversationalData.topic) || 'Presentation',
              slides: initialConversationalData.slides.map((s: any, i: number) => ({
                id: `slide-${i}`,
                title: s.title,
                content: s.content || s.key_points?.join('\n') || ''
              })),
              stylePreferences: {
                initialIdea: initialConversationalData.topic,
                vibeContext: initialConversationalData.stylePreferences,
                slideMode: initialConversationalData.slideMode || 'interactive',
                referenceImages: normalizedReferenceImages,
                colors: searchedColors ? {
                  type: 'custom' as const,
                  background: searchedColors.background || searchedColors.primary_background || '#ffffff',
                  text: searchedColors.text || searchedColors.primary_text || '#1f2937',
                  accent: searchedColors.accent || searchedColors.accent_1 || searchedColors.primary || '#3b82f6',
                  secondary: searchedColors.secondary || searchedColors.accent_2 || '#6b7280',
                } : undefined,
                font: searchedFont
              }
            };

            window.dispatchEvent(new CustomEvent('theme_preview_update', {
              detail: { type: 'theme_loading', message: 'Generating theme...' }
            }));

            await outlineApi.generateThemeFromOutline(outlineForTheme as any, deckId, (evt) => {
              window.dispatchEvent(new CustomEvent('theme_preview_update', { detail: evt }));
            });
          } catch (err) {
            console.error('[ChatPanel] Theme generation failed:', err);
          }
        })();

        if (onOutlineChatGeneratingChange) {
          onOutlineChatGeneratingChange(false);
        }
      } else {
        let topic = initialConversationalData.topic;
        const slideCount = initialConversationalData.slideCount;
        const detailLevel = initialConversationalData.detailLevel || 'standard';
        const chatHistory = initialConversationalData.chatHistory;
        const uploadedFilesFromConversation = initialConversationalData.uploadedFiles || [];
        const uploadedMediaFromAgent = initialConversationalData.uploadedMedia || [];

        if (!topic && chatHistory && chatHistory.length > 0) {
          const firstUserMessage = chatHistory.find((msg: any) => msg.role === 'user');
          if (firstUserMessage?.content) {
            topic = firstUserMessage.content;
          }
        }

        let prompt = topic ? `Create a presentation about ${topic}.` : '';
        if (slideCount) {
          prompt += ` It should have approximately ${slideCount} slides.`;
        }

        if (!prompt.trim()) {
          console.warn('[ChatPanel] No valid topic provided, skipping generation');
          if (onOutlineChatGeneratingChange) {
            onOutlineChatGeneratingChange(false);
          }
          return;
        }

        let styleContext = '';
        if (chatHistory && chatHistory.length > 0) {
          const historyText = chatHistory.map((msg: any) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n');
          styleContext = `Context from conversation:\n${historyText}`;
        }

        setMessages(prev => [
          ...prev,
          {
            id: `user-${Date.now()}`,
            type: 'user',
            message: prompt + (chatHistory && chatHistory.length > 0 ? ' (using context from chat)' : ''),
            timestamp: new Date(),
            feedback: null
          }
        ]);

        (async () => {
          try {
            const { outlineApi } = await import('@/services/outlineApi');

            if (onOutlineChatGeneratingChange) {
              onOutlineChatGeneratingChange(true);
            }

            await outlineApi.generateOutlineStream(
              prompt,
              uploadedFilesFromConversation,
              {
                detailLevel: detailLevel,
                slideCount: slideCount,
                styleContext: styleContext,
                enableResearch: true,
                autoSelectImages: true,
                uploadedMedia: uploadedMediaFromAgent
              },
              (event: any) => {
                if (event.type === 'error') {
                  console.error('[ChatPanel] ❌ Stream error:', event.message);
                  setMessages(prev => [
                    ...prev,
                    {
                      id: `error-${Date.now()}`,
                      type: 'ai',
                      message: event.message || 'Sorry, I encountered an error generating your presentation. Please try again.',
                      timestamp: new Date(),
                      feedback: null
                    }
                  ]);

                  if (onOutlineChatGeneratingChange) {
                    onOutlineChatGeneratingChange(false);
                  }
                  return;
                }

                if (event.type === 'outline_structure') {
                  const placeholderSlides = (event.slideTitles || []).map((title: string, idx: number) => ({
                    id: `placeholder-${idx}`,
                    title: title,
                    content: '',
                    deepResearch: false,
                    status: 'pending'
                  }));

                  onOutlineAgentToolCall({
                    topic: event.title,
                    slide_count: event.slideCount,
                    detail_level: detailLevel,
                    slides: placeholderSlides
                  });
                } else if (event.type === 'slide_complete' && event.slide) {
                  onOutlineAgentToolCall({
                    topic: topic,
                    slide_count: slideCount,
                    detail_level: detailLevel,
                    slides: [event.slide],
                    slideIndex: event.slideIndex
                  });
                } else if (event.type === 'outline_complete') {
                  if (event.outline?.stylePreferences && onOutlineAgentToolCall) {
                    onOutlineAgentToolCall({
                      topic: event.outline.title || topic,
                      slide_count: event.outline.slides?.length || slideCount,
                      detail_level: detailLevel,
                      slides: [],
                      stylePreferences: event.outline.stylePreferences,
                      uploadedMedia: event.outline.uploadedMedia
                    });
                  }

                  if (onOutlineChatGeneratingChange) {
                    onOutlineChatGeneratingChange(false);
                  }
                }
              }
            );

            if (onOutlineChatGeneratingChange) {
              onOutlineChatGeneratingChange(false);
            }
          } catch (error) {
            console.error('[ChatPanel] Error generating outline:', error);
            setMessages(prev => [
              ...prev,
              {
                id: `error-${Date.now()}`,
                type: 'ai',
                message: 'Sorry, I encountered an error generating your presentation. Please try again.',
                timestamp: new Date(),
                feedback: null
              }
            ]);

            if (onOutlineChatGeneratingChange) {
              onOutlineChatGeneratingChange(false);
            }
          }
        })();
      }
    }
  }, [deckId, initialConversationalData, onOutlineAgentToolCall, onOutlineChatGeneratingChange, setMessages]);
}
