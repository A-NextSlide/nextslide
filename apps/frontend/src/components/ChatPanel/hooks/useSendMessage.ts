import { useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useThemeStore } from '@/stores/themeStore';
import { useDeckStore } from '@/stores/deckStore';
import type { SlideData } from '@/types/SlideTypes';
import { API_CONFIG } from '@/config/environment';
import { sendChatToApi } from '@/components/chat/utils/messageUtils';
import { chatWithFiles, fileToBase64 } from '@/services/fileAnalysisService';
import { streamOutlineAgentChat } from '@/services/outlineApi';
import { convertMessagesToApiFormat } from '@/components/chat';
import { captureTinySlideScreenshot, shouldCaptureScreenshotForEdit } from '@/utils/slideScreenshot';
import { revokeImagePreview } from '@/services/fileAnalysisService';
import { normalizeDeckTitle } from '@/utils/normalizeDeckTitle';
import type { ExtendedChatMessageProps } from '@/components/chat';
import type AgentChatClient from '@/services/agentChat';
import type { Attachment, PendingAttachment, RegisteredAttachment, SelectedElement } from '../types';
import type { DeckDiff } from '@/utils/apiUtils';
import { trackAIChatMessage } from '@/services/analytics';

interface UseSendMessageOptions {
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  messages: ExtendedChatMessageProps[];
  setMessages: React.Dispatch<React.SetStateAction<ExtendedChatMessageProps[]>>;
  addPendingMessage: (id: string) => void;
  removePendingMessage: (id: string) => void;
  selectedElements: SelectedElement[];
  clearSelections: () => void;
  selectedMentions: Array<{ id: string; name: string }>;
  clearMentions: () => void;
  attachmentsRef: React.MutableRefObject<Attachment[]>;
  setAttachmentsSafe: (next: Attachment[]) => void;
  processAndRegisterFiles: (files: File[]) => Promise<void>;
  outlineMode: boolean;
  useOutlineAgent: boolean;
  outlineSlideTarget: number | 'all';
  outline?: any;
  outlineIsGenerating: boolean;
  onOutlineAgentToolCall?: (args: any) => void;
  onOutlineGenerate?: (prompt: string, context: any) => Promise<void>;
  onOutlineUpdate?: (outline: any) => void;
  onOutlineChatGeneratingChange?: (val: boolean) => void;
  setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSelecting: React.Dispatch<React.SetStateAction<boolean>>;
  slides: SlideData[];
  currentSlideIndex: number;
  ensureAgentSession: () => Promise<boolean>;
  agentClientRef: React.MutableRefObject<AgentChatClient | null>;
  selectedLinkedInProfile: any | null;
  selectedProfileForContinuationRef: React.MutableRefObject<any>;
  originalLinkedInRequestRef: React.MutableRefObject<string | null>;
  applyDeckDiffRespectingEditMode: (diff: DeckDiff, isEditDiff?: boolean) => void;
  deckId?: string;
}

export function useSendMessage({
  input,
  setInput,
  messages,
  setMessages,
  addPendingMessage,
  removePendingMessage,
  selectedElements,
  clearSelections,
  selectedMentions,
  clearMentions,
  attachmentsRef,
  setAttachmentsSafe,
  processAndRegisterFiles,
  outlineMode,
  useOutlineAgent,
  outlineSlideTarget,
  outline,
  outlineIsGenerating,
  onOutlineAgentToolCall,
  onOutlineGenerate,
  onOutlineUpdate,
  onOutlineChatGeneratingChange,
  setIsGenerating,
  setIsSelecting,
  slides,
  currentSlideIndex,
  ensureAgentSession,
  agentClientRef,
  selectedLinkedInProfile,
  selectedProfileForContinuationRef,
  originalLinkedInRequestRef,
  applyDeckDiffRespectingEditMode,
  deckId,
}: UseSendMessageOptions) {
  const userMessageCount = useMemo(() => messages.filter(m => m.type === 'user').length, [messages]);
  const hasOutlineSlides = useMemo(() => Boolean(outline?.slides && outline.slides.length > 0 && outline.slides.some((s: any) => s.content || s.title)), [outline]);

  const showFallbackGenerate = outlineMode && useOutlineAgent && onOutlineAgentToolCall &&
    userMessageCount >= 2 &&
    !outlineIsGenerating &&
    !hasOutlineSlides;

  const handleFallbackGenerate = useCallback(async () => {
    if (!onOutlineAgentToolCall) return;

    const userMessages = messages.filter(m => m.type === 'user').map(m => m.message);
    const topic = userMessages.join(' ').substring(0, 500);

    setMessages(prev => [...prev, {
      id: `fallback-gen-${Date.now()}`,
      type: 'ai',
      message: 'Great, let me generate your presentation now...',
      timestamp: new Date(),
      feedback: null
    }]);

    setIsGenerating(true);
    if (onOutlineChatGeneratingChange) {
      onOutlineChatGeneratingChange(true);
    }

    try {
      const placeholderSlides = Array.from({ length: 10 }).map((_, idx) => ({
        id: uuidv4(),
        title: idx === 0 ? 'Title Slide' : `Slide ${idx}`,
        subtitle: '',
        content: '',
        deep_research: false,
        citations: [],
        footnotes: [],
        taggedMedia: [],
      }));

      onOutlineAgentToolCall({
        topic: topic,
        slide_count: 10,
        detail_level: 'standard',
        slides: placeholderSlides,
        initial: true
      });

      await chatWithFiles(topic, [], async (event) => {
        if (event.type === 'topic') {
          const titleSlide = placeholderSlides[0];
          titleSlide.title = event.topic;
          onOutlineAgentToolCall({
            topic: event.topic,
            slide_count: 10,
            detail_level: 'standard',
            slides: placeholderSlides
          });
        } else if (event.type === 'slide_complete' && event.slide) {
          onOutlineAgentToolCall({
            topic: topic,
            slide_count: 10,
            detail_level: 'standard',
            slides: [event.slide],
            slideIndex: event.slideIndex
          });
        } else if (event.type === 'outline_complete') {
          if (event.outline?.stylePreferences && onOutlineAgentToolCall) {
            onOutlineAgentToolCall({
              topic: event.outline.title || topic,
              slide_count: event.outline.slides?.length || 10,
              detail_level: 'standard',
              slides: [],
              stylePreferences: event.outline.stylePreferences
            });
          }

          setIsGenerating(false);
          if (onOutlineChatGeneratingChange) {
            onOutlineChatGeneratingChange(false);
          }
        }
      });
    } catch (error) {
      console.error('[ChatPanel] Fallback generate error:', error);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        type: 'ai',
        message: 'Sorry, I encountered an error generating your presentation. Please try again.',
        timestamp: new Date(),
        feedback: null
      }]);
      setIsGenerating(false);
      if (onOutlineChatGeneratingChange) {
        onOutlineChatGeneratingChange(false);
      }
    }
  }, [messages, onOutlineAgentToolCall, onOutlineChatGeneratingChange, setIsGenerating, setMessages]);

  const isDeckWideRequest = useCallback((text: string): boolean => {
    const normalized = (text || '').toLowerCase();
    return (
      normalized.includes('all slides') ||
      normalized.includes('every slide') ||
      normalized.includes('entire deck') ||
      normalized.includes('whole deck') ||
      normalized.includes('update the deck') ||
      normalized.includes('across the deck') ||
      normalized.includes('entire presentation') ||
      normalized.includes('whole presentation') ||
      normalized.includes('across all slides') ||
      normalized.includes('across the slides') ||
      normalized.includes('all pages')
    );
  }, []);

  const sendMessage = useCallback(async (overrideMessage?: string) => {
    const messageText = (overrideMessage ?? input).trim();
    if (!messageText) return;

    // Track chat message in PostHog
    trackAIChatMessage({ messageType: 'user', deckId: deckId });

    if (messageText.toLowerCase().includes('@linkedin')) {
      originalLinkedInRequestRef.current = messageText;
    }

    const timestamp = new Date();

    const currentAttachments = attachmentsRef.current;
    const previewSelections = selectedElements.map(s => ({ id: s.elementId, label: s.label }));
    const previewAttachments = currentAttachments.map(a => a.name);
    const fullAttachments = currentAttachments.map(a => ({
      name: a.name,
      type: (a as any).type || (a as any).mimeType,
      size: a.size,
      url: (a as any).url,
      previewUrl: (a as any).previewUrl || (a as any).url,
      file: (a as any).file
    }));

    const currentMentions = [...selectedMentions];

    if (currentMentions.length > 0) {
      clearMentions();
    }

    if (outlineMode && useOutlineAgent && onOutlineAgentToolCall) {
      const currentInput = messageText;

      const userMessageId = `user-${Date.now()}`;
      setMessages(prev => [...prev, {
        id: userMessageId,
        type: 'user',
        message: currentInput,
        timestamp: new Date(),
        feedback: null,
        metadata: {
          selectionsPreview: previewSelections,
          attachmentNames: previewAttachments,
          attachments: fullAttachments,
          integrationMentions: currentMentions.length > 0
            ? currentMentions.map(m => ({ id: m.id, name: m.name }))
            : undefined
        }
      }]);

      setInput('');
      currentAttachments.forEach(a => {
        const preview = (a as any).previewUrl;
        const hasUploadedUrl = !!(a as any).url;
        if (preview && hasUploadedUrl) revokeImagePreview(preview);
      });
      setAttachmentsSafe([]);

      const aiMessageId = `ai-${Date.now()}`;
      const thinkingMessages = [
        'Hmm, let me think about this...',
        'Analyzing your request...',
        'Processing your idea...',
        'Cooking up something good...',
        'Working on it...',
        'Let me figure this out...',
        'Considering the best approach...',
      ];
      const initialThinking = thinkingMessages[Math.floor(Math.random() * thinkingMessages.length)];
      setMessages(prev => [...prev, {
        id: aiMessageId,
        type: 'ai',
        message: initialThinking,
        timestamp: new Date(),
        feedback: null,
        metadata: { isTyping: true, thinkingPhase: 'initial', isStreamingUpdate: true }
      }]);

      const context: { [key: string]: any } = {};

      if (outline?.slides && outline.slides.length > 0) {
        context.current_outline = {
          title: outline.title,
          slides: outline.slides.map((slide: any, index: number) => ({
            index: index,
            title: slide.title,
            subtitle: slide.subtitle,
            type: slide.type,
            content: slide.content,
            key_points: slide.key_points || []
          }))
        };
      }

      if (outlineSlideTarget !== 'all') {
        context.target_slide_index = outlineSlideTarget;
      }

      const stylePrefs = (outline as any)?.stylePreferences;
      if (stylePrefs?.referenceLinks && Array.isArray(stylePrefs.referenceLinks) && stylePrefs.referenceLinks.length > 0) {
        context.reference_links = stylePrefs.referenceLinks;
      }
      if (outline?.scraped_context) {
        context.scraped_context = outline.scraped_context;
      }
      if (Array.isArray(outline?.reference_sources) && outline.reference_sources.length > 0) {
        context.reference_sources = outline.reference_sources;
      }
      if (outline?.research_context) {
        context.research_context = outline.research_context;
      }
      if (Array.isArray(outline?.research_citations) && outline.research_citations.length > 0) {
        context.research_citations = outline.research_citations;
      }

      try {
        let fullResponse = '';
        let outlineData: any = null;

        const filesToAnalyze = fullAttachments.length > 0 ? await Promise.all(
          fullAttachments.map(async (att) => {
            const file = att.file as File | undefined;
            let content: string | undefined;

            if (file) {
              content = await fileToBase64(file);
            }

            return {
              id: `file-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              name: att.name,
              type: att.type || 'application/octet-stream',
              content: content,
              url: att.url,
              size: att.size
            };
          })
        ) : undefined;

        for await (const event of streamOutlineAgentChat({
          message: currentInput,
          chat_history: convertMessagesToApiFormat(messages),
          context: context,
          files: filesToAnalyze
        })) {
          if (event.type === 'status') {
            if (event.status === 'thinking') {
              setMessages(prev => prev.map(m =>
                m.id === aiMessageId
                  ? { ...m, message: (event as any).message || 'about your request', metadata: { isTyping: true, thinkingPhase: 'thinking', isStreamingUpdate: true } }
                  : m
              ));
            } else if (event.status === 'researching') {
              const query = (event as any).query || 'your topic';
              setMessages(prev => prev.map(m =>
                m.id === aiMessageId
                  ? { ...m, message: `for "${query}"`, metadata: { isTyping: true, isResearching: true, thinkingPhase: 'researching', isStreamingUpdate: true } }
                  : m
              ));
            } else if (event.status === 'scraping') {
              const url = (event as any).message || '';
              setMessages(prev => prev.map(m =>
                m.id === aiMessageId
                  ? { ...m, message: url, metadata: { isTyping: true, isResearching: true, thinkingPhase: 'scraping', isStreamingUpdate: true } }
                  : m
              ));
            } else if (event.status === 'scraped') {
              setMessages(prev => prev.map(m =>
                m.id === aiMessageId
                  ? { ...m, message: 'done, now processing', metadata: { isTyping: true, isResearching: false, thinkingPhase: 'processing', isStreamingUpdate: true } }
                  : m
              ));
            } else if (event.status === 'research_failed') {
              setMessages(prev => prev.map(m =>
                m.id === aiMessageId
                  ? { ...m, message: 'couldn\'t find info, improvising', metadata: { isTyping: true, isResearching: false, thinkingPhase: 'thinking', isStreamingUpdate: true } }
                  : m
              ));
            } else if (event.status === 'analyzing_file') {
              const fileName = (event as any).file_name || 'file';
              const fileIndex = ((event as any).file_index || 0) + 1;
              const totalFiles = (event as any).total_files || 1;
              setMessages(prev => prev.map(m =>
                m.id === aiMessageId
                  ? { ...m, message: `${fileName} (${fileIndex}/${totalFiles})`, metadata: { isTyping: true, isAnalyzingFiles: true, thinkingPhase: 'analyzing', isStreamingUpdate: true } }
                  : m
              ));
            } else if (event.status === 'files_analyzed') {
              const analyses = (event as any).analyses || [];
              const fileCount = analyses.length;
              setMessages(prev => prev.map(m =>
                m.id === aiMessageId
                  ? { ...m, message: `${fileCount} file(s) ready`, metadata: { isTyping: true, isAnalyzingFiles: false, fileAnalyses: analyses, thinkingPhase: 'generating', isStreamingUpdate: true } }
                  : m
              ));
            } else if (event.status === 'file_analysis_error') {
              setMessages(prev => prev.map(m =>
                m.id === aiMessageId
                  ? { ...m, message: 'some files skipped, continuing', metadata: { isTyping: true, isAnalyzingFiles: false, thinkingPhase: 'generating', isStreamingUpdate: true } }
                  : m
              ));
            }
          } else if (event.type === 'research') {
            setMessages(prev => prev.map(m =>
              m.id === aiMessageId
                ? { ...m, message: 'found relevant info', metadata: { isTyping: true, isResearching: false, thinkingPhase: 'processing', isStreamingUpdate: true } }
                : m
            ));
          } else if (event.type === 'text') {
            fullResponse += event.content;

            let displayText = fullResponse;
            displayText = displayText.replace(/```json[\s\S]*?```/g, '');

            const removeActionJson = (text: string): string => {
              let result = '';
              let i = 0;
              while (i < text.length) {
                if (text[i] === '{') {
                  const remaining = text.slice(i);
                  if (remaining.includes('"action"') && (remaining.includes('"update_slides"') || remaining.includes('"updated_slides"') || remaining.includes('"slides"'))) {
                    let braceCount = 0;
                    let j = i;
                    let inString = false;
                    let escapeNext = false;

                    while (j < text.length) {
                      const char = text[j];

                      if (escapeNext) {
                        escapeNext = false;
                        j++;
                        continue;
                      }

                      if (char === '\\' && inString) {
                        escapeNext = true;
                        j++;
                        continue;
                      }

                      if (char === '"' && !escapeNext) {
                        inString = !inString;
                      } else if (!inString) {
                        if (char === '{') braceCount++;
                        else if (char === '}') {
                          braceCount--;
                          if (braceCount === 0) {
                            i = j + 1;
                            break;
                          }
                        }
                      }
                      j++;
                    }

                    if (braceCount !== 0) {
                      break;
                    }
                    continue;
                  }
                }
                result += text[i];
                i++;
              }
              return result;
            };

            displayText = removeActionJson(displayText);
            displayText = displayText.trim();

            setMessages(prev => prev.map(m => {
              if (m.id !== aiMessageId) return m;

              const isInThinkingState = m.metadata?.isResearching || m.metadata?.thinkingPhase;
              if (isInThinkingState && !displayText) {
                return m;
              }

              const hasSubstantialContent = displayText.length > 10;

              return {
                ...m,
                message: displayText || m.message,
                metadata: {
                  ...m.metadata,
                  isTyping: true,
                  isResearching: hasSubstantialContent ? false : m.metadata?.isResearching,
                  thinkingPhase: hasSubstantialContent ? undefined : m.metadata?.thinkingPhase,
                  isStreamingUpdate: hasSubstantialContent ? false : m.metadata?.isStreamingUpdate
                }
              };
            }));
          } else if (event.type === 'outline') {
            outlineData = event.data;
          }
        }

        setMessages(prev => prev.map(m =>
          m.id === aiMessageId
            ? { ...m, metadata: { ...m.metadata, isTyping: false, isStreamingUpdate: false, thinkingPhase: undefined, isResearching: false } }
            : m
        ));

        if (outlineData) {
          if (outlineData.action === 'clarify') {
            const toText = (value: unknown): string => (typeof value === 'string' ? value : '');
            const clarificationMessage = toText(outlineData.message) ||
              toText(outlineData.clarification?.message) ||
              'Quick check before I build the deck.';
            const clarificationFields = outlineData.clarification?.fields;
            const hasClarificationFields = Boolean(clarificationFields && clarificationFields.length > 0);
            const normalizeClarificationText = (value: string) => (
              value
                .toLowerCase()
                .replace(/[*_`]/g, '')
                .replace(/[?.!]/g, '')
                .replace(/\s+/g, ' ')
                .trim()
            );
            const shouldUseGenericIntro = (message: string, fields: typeof clarificationFields) => {
              if (!fields || fields.length === 0) return false;
              const normalizedMessage = normalizeClarificationText(message);
              if (!normalizedMessage) return true;
              return fields.some((field) => {
                const label = (field.label || field.key || '').toString();
                const normalizedLabel = normalizeClarificationText(label);
                if (!normalizedLabel) return false;
                return normalizedMessage === normalizedLabel ||
                  normalizedMessage.startsWith(normalizedLabel) ||
                  normalizedLabel.startsWith(normalizedMessage);
              });
            };
            const clarificationIntro = 'A few quick questions to make sure this is right.';
            const displayMessage = hasClarificationFields && shouldUseGenericIntro(clarificationMessage, clarificationFields)
              ? clarificationIntro
              : clarificationMessage;
            setMessages(prev => prev.map(m =>
              m.id === aiMessageId
                ? {
                  ...m,
                  message: displayMessage,
                  metadata: {
                    ...m.metadata,
                    isTyping: false,
                    clarification: hasClarificationFields ? { fields: clarificationFields } : undefined
                  }
                }
                : m
            ));

            setIsGenerating(false);
            return;
          }

          if (outlineData.action === 'update_theme' && outline && outlineData.theme_changes) {
            try {
              const response = await fetch(`${API_CONFIG.AGENT_BASE_URL}/api/outline-theme/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  outline_id: outline.id,
                  theme_changes: outlineData.theme_changes
                })
              });

              if (response.ok) {
                const result = await response.json();

                if (result.style_preferences && onOutlineUpdate) {
                  const updatedOutline = {
                    ...outline,
                    stylePreferences: {
                      ...(outline as any).stylePreferences,
                      ...result.style_preferences
                    }
                  };
                  onOutlineUpdate(updatedOutline);
                }

                if (result.theme_updates && outline.id) {
                  const currentTheme = useThemeStore.getState().outlineDeckThemes?.[outline.id];

                  if (result.theme_updates.remove_logo && currentTheme) {
                    const updatedTheme = { ...currentTheme };

                    if (updatedTheme.brandInfo) {
                      const { logoUrl: _1, logo_url: _2, ...restBrandInfo } = updatedTheme.brandInfo as any;
                      updatedTheme.brandInfo = Object.keys(restBrandInfo).length > 0 ? restBrandInfo : undefined;
                    }

                    if (updatedTheme.metadata) {
                      const { logo_url: _1, logo_url_light: _2, logo_url_dark: _3, ...restMetadata } = updatedTheme.metadata as any;
                      updatedTheme.metadata = Object.keys(restMetadata).length > 0 ? restMetadata : undefined;
                    }

                    if (updatedTheme.color_palette?.metadata) {
                      const { logo_url: _1, logo_url_light: _2, logo_url_dark: _3, ...restCPMetadata } = (updatedTheme.color_palette as any).metadata;
                      (updatedTheme.color_palette as any).metadata = Object.keys(restCPMetadata).length > 0 ? restCPMetadata : undefined;
                    }

                    if (updatedTheme.logo_info) updatedTheme.logo_info = undefined;
                    if (updatedTheme.logo) updatedTheme.logo = undefined;

                    useThemeStore.getState().setOutlineDeckTheme(outline.id, updatedTheme);
                  } else {
                    const updatedTheme = currentTheme ? { ...currentTheme } : {};

                    if (result.theme_updates.color_palette) {
                      const existingCP = updatedTheme.color_palette || {};
                      const newCP = result.theme_updates.color_palette;

                      updatedTheme.color_palette = {
                        ...existingCP,
                        ...newCP,
                        metadata: {
                          ...(existingCP.metadata || {}),
                          ...(newCP.metadata || {})
                        }
                      };
                    }

                    if (result.theme_updates.typography) {
                      updatedTheme.typography = {
                        ...(updatedTheme.typography || {}),
                        ...result.theme_updates.typography
                      };
                    }

                    if (result.theme_updates.brandInfo) {
                      updatedTheme.brandInfo = {
                        ...(updatedTheme.brandInfo || {}),
                        ...result.theme_updates.brandInfo
                      };
                    }

                    useThemeStore.getState().setOutlineDeckTheme(outline.id, updatedTheme);

                    const currentWorkspaceTheme = useThemeStore.getState().getWorkspaceTheme();
                    const updatedWorkspaceTheme: any = { ...currentWorkspaceTheme };

                    if (result.theme_updates.color_palette) {
                      const cp = result.theme_updates.color_palette;
                      if (cp.primary_background) {
                        updatedWorkspaceTheme.page = {
                          ...updatedWorkspaceTheme.page,
                          backgroundColor: cp.primary_background
                        };
                      }
                      if (cp.primary_text) {
                        updatedWorkspaceTheme.typography = {
                          ...updatedWorkspaceTheme.typography,
                          heading: {
                            ...updatedWorkspaceTheme.typography?.heading,
                            color: cp.primary_text
                          },
                          paragraph: {
                            ...updatedWorkspaceTheme.typography?.paragraph,
                            color: cp.primary_text
                          }
                        };
                      }
                      if (cp.accent_1) {
                        updatedWorkspaceTheme.accent1 = cp.accent_1;
                      }
                    }

                    if (result.theme_updates.typography) {
                      const typo = result.theme_updates.typography;
                      if (typo.hero_title?.family) {
                        updatedWorkspaceTheme.typography = {
                          ...updatedWorkspaceTheme.typography,
                          heading: {
                            ...updatedWorkspaceTheme.typography?.heading,
                            fontFamily: typo.hero_title.family
                          }
                        };
                      }
                      if (typo.body_text?.family) {
                        updatedWorkspaceTheme.typography = {
                          ...updatedWorkspaceTheme.typography,
                          paragraph: {
                            ...updatedWorkspaceTheme.typography?.paragraph,
                            fontFamily: typo.body_text.family
                          }
                        };
                      }
                    }

                    const newThemeId = useThemeStore.getState().addCustomTheme(updatedWorkspaceTheme);
                    useThemeStore.getState().setWorkspaceTheme(newThemeId);
                    useThemeStore.getState().setOutlineTheme(outline.id, { ...updatedWorkspaceTheme, id: newThemeId, isCustom: true });
                  }
                }
              } else {
                console.error('[ChatPanel] Failed to apply theme changes:', response.statusText);
              }
            } catch (error) {
              console.error('[ChatPanel] Error applying theme changes:', error);
            }
          } else if (outlineData.action === 'update_slides' && outline && onOutlineUpdate) {
            const updatedSlides = [...outline.slides];
            const updatedIndices = new Set<number>();

            for (const update of outlineData.updated_slides) {
              const idx = update.index;
              if (idx >= 0 && idx < updatedSlides.length) {
                let formattedContent = '';
                if (update.key_points && update.key_points.length > 0) {
                  formattedContent = update.key_points.map((point: string) => `• ${point}`).join('\n\n');
                } else {
                  formattedContent = updatedSlides[idx].content || '';
                }

                updatedSlides[idx] = {
                  ...updatedSlides[idx],
                  title: update.title || updatedSlides[idx].title,
                  subtitle: update.subtitle || updatedSlides[idx].subtitle || '',
                  content: formattedContent,
                  citations: update.citations ?? updatedSlides[idx].citations,
                  footnotes: update.footnotes ?? updatedSlides[idx].footnotes,
                  taggedMedia: update.taggedMedia ?? updatedSlides[idx].taggedMedia,
                  assignedVideo: update.assignedVideo ?? updatedSlides[idx].assignedVideo,
                  _justUpdated: true
                };
                updatedIndices.add(idx);
              }
            }

            onOutlineUpdate({
              ...outline,
              slides: updatedSlides,
              stylePreferences: outlineData.stylePreferences ? {
                ...(outline as any).stylePreferences,
                ...outlineData.stylePreferences
              } : (outline as any).stylePreferences,
              uploadedMedia: outlineData.uploadedMedia ?? (outline as any).uploadedMedia
            });
          } else if (outlineData.action === 'update_outline' && outline && onOutlineUpdate) {
            const updatedSlides = outlineData.slides.map((slide: any, index: number) => ({
              ...outline.slides[index],
              title: slide.title || outline.slides[index]?.title || '',
              subtitle: slide.subtitle || outline.slides[index]?.subtitle || '',
              content: slide.key_points && slide.key_points.length > 0
                ? slide.key_points.join('\n')
                : outline.slides[index]?.content || '',
              citations: slide.citations ?? outline.slides[index]?.citations,
              footnotes: slide.footnotes ?? outline.slides[index]?.footnotes,
              taggedMedia: slide.taggedMedia ?? outline.slides[index]?.taggedMedia,
              assignedVideo: slide.assignedVideo ?? outline.slides[index]?.assignedVideo
            }));
            onOutlineUpdate({
              ...outline,
              slides: updatedSlides,
              stylePreferences: outlineData.stylePreferences ? {
                ...(outline as any).stylePreferences,
                ...outlineData.stylePreferences
              } : (outline as any).stylePreferences,
              uploadedMedia: outlineData.uploadedMedia ?? (outline as any).uploadedMedia
            });
          } else if (outlineData.action === 'generate_outline' && onOutlineUpdate) {
            setIsGenerating(true);

            const newOutline = {
              id: outline?.id || uuidv4(),
              title: normalizeDeckTitle(outlineData.title || outlineData.topic) || 'Presentation',
              slides: outlineData.slides.map((slide: any) => ({
                id: uuidv4(),
                title: slide.title || '',
                subtitle: slide.subtitle || '',
                content: slide.key_points && slide.key_points.length > 0
                  ? slide.key_points.join('\n')
                  : '',
                deep_research: false,
                citations: slide.citations || [],
                footnotes: slide.footnotes || [],
                taggedMedia: slide.taggedMedia || [],
                assignedVideo: slide.assignedVideo
              })),
              stylePreferences: outlineData.stylePreferences,
              uploadedMedia: outlineData.uploadedMedia,
              notes: outlineData.scraped_videos
                ? { videos: outlineData.scraped_videos }
                : undefined
            };
            onOutlineUpdate(newOutline);

            onOutlineAgentToolCall({
              topic: outlineData.topic || outline?.title || 'Presentation',
              presentation_type: 'standard',
              slide_count: outlineData.slides?.length || outlineData.slide_count || 5,
              detail_level: outlineData.detail_level || 'standard',
              tone: outlineData.tone,
              stylePreferences: outlineData.stylePreferences,
              uploadedMedia: outlineData.uploadedMedia
            });

            const slidesWithoutContent = newOutline.slides.filter((s: any) => !s.content || s.content.trim() === '');
            if (slidesWithoutContent.length > 0) {
              return;
            }
          }
        }

        setIsGenerating(false);
      } catch (error) {
        console.error('[ChatPanel] Error caught:', error);
        console.error('[ChatPanel] Error stack:', (error as Error)?.stack);
        console.error('[ChatPanel] Error message:', (error as Error)?.message);

        setMessages(prev => prev.map(m =>
          m.id === aiMessageId
            ? {
              ...m,
              message: `Error: ${(error as Error)?.message || 'Unknown error'}. Check console for details.`,
              metadata: { isTyping: false }
            }
            : m
        ));
        setIsGenerating(false);
      }

      return;
    }

    if (outlineMode && onOutlineGenerate) {
      const outlineMsgId = `user-${Date.now()}`;

      setMessages(prev => [...prev, {
        id: outlineMsgId,
        type: 'user',
        message: messageText,
        timestamp: new Date(),
        feedback: null
      }]);

      setInput('');
      addPendingMessage(outlineMsgId);

      try {
        await onOutlineGenerate(messageText, {});
        removePendingMessage(outlineMsgId);
      } catch (error) {
        console.error('Error generating outline:', error);
        setMessages(prev => [...prev, {
          id: `error-${Date.now()}`,
          type: 'ai',
          message: 'I encountered an error while generating your outline. Please try again.',
          timestamp: new Date(),
          feedback: null
        }]);
        removePendingMessage(outlineMsgId);
      }
      return;
    }

    const userMsgId = `user-${Date.now()}`;

    try {
      setMessages(prev => [...prev, {
        id: userMsgId,
        type: 'user',
        message: messageText,
        timestamp,
        feedback: null,
        metadata: {
          selectionsPreview: previewSelections,
          attachmentNames: previewAttachments,
          attachments: fullAttachments
        }
      }]);

      setInput('');
      addPendingMessage(userMsgId);

      const currentSlide = slides[currentSlideIndex];
      const slideId = currentSlide?.id || null;

      const deckData = useDeckStore.getState().deckData;
      const deckStateBefore = JSON.parse(JSON.stringify(deckData));

      const selectionContext = selectedElements.map(s => ({
        elementId: s.elementId,
        elementType: s.elementType,
        slideId: s.slideId,
        overlaps: s.overlaps,
        boundingRect: s.bounds ? { x: s.bounds.x, y: s.bounds.y, width: s.bounds.width, height: s.bounds.height } : undefined,
        domPath: s.slideId ? `#slide_${s.slideId} [data-component-id="${s.elementId}"]` : `[data-component-id="${s.elementId}"]`
      }));

      const deckScope = isDeckWideRequest(messageText);
      let filteredSelections = selectionContext;
      if (slideId && selectionContext.length > 0) {
        const selectionsOnCurrentSlide = selectionContext.filter(sel => !sel.slideId || sel.slideId === slideId);
        if (selectionsOnCurrentSlide.length > 0) {
          filteredSelections = selectionsOnCurrentSlide;
        } else {
          filteredSelections = [];
        }
      }

      const effectiveSelections = (filteredSelections.length > 0 || !slideId || deckScope)
        ? filteredSelections
        : [{
          elementId: slideId,
          elementType: 'Slide',
          slideId: slideId,
          overlaps: [],
          domPath: `#slide_${slideId}`,
          implicit: true
        } as any];

      const pending = currentAttachments.filter((a: any) => (a as any).file && !(a as any).url) as PendingAttachment[];
      if (pending.length > 0) {
        try {
          await processAndRegisterFiles(pending.map(p => p.file));
        } catch { }
      }

      const latestAttachments = attachmentsRef.current;
      const finalized = (latestAttachments as Array<PendingAttachment | RegisteredAttachment>)
        .filter((a: any) => (a as any).url) as RegisteredAttachment[];
      const attachmentMeta = finalized.map(a => ({
        name: a.name,
        mimeType: a.mimeType,
        size: a.size,
        url: a.url,
        attachmentId: (a as any).attachmentId
      }));

      const shouldCaptureVisualContext = effectiveSelections.some(
        s => s.elementType === 'CustomComponent' || s.elementType === 'Slide'
      );
      if (shouldCaptureVisualContext && shouldCaptureScreenshotForEdit(messageText, true)) {
        try {
          const slideViewport = document.querySelector('[data-slide-viewport]') as HTMLElement;
          if (slideViewport) {
            const screenshotDataUrl = await captureTinySlideScreenshot(slideViewport);
            if (screenshotDataUrl) {
              attachmentMeta.push({
                name: '_slide_context.jpg',
                mimeType: 'image/jpeg',
                size: Math.ceil((screenshotDataUrl.length - 'data:image/jpeg;base64,'.length) * 0.75),
                url: screenshotDataUrl,
                attachmentId: `screenshot-${Date.now()}`
              });
            }
          }
        } catch (screenshotError) {
          console.warn('[ChatPanel] Screenshot capture failed (non-blocking):', screenshotError);
        }
      }

      setMessages(prev => prev.map(msg => {
        if (msg.id !== userMsgId || !msg.metadata?.attachments) return msg;

        const existingAttachments = msg.metadata.attachments as any[];
        const mergedAttachments = existingAttachments.map(existing => {
          const uploaded = finalized.find(f =>
            f.name === existing.name && f.size === existing.size
          );

          if (uploaded) {
            return {
              name: uploaded.name,
              type: (uploaded as any).type || uploaded.mimeType,
              size: uploaded.size,
              url: uploaded.url,
              previewUrl: uploaded.url,
            };
          }
          return existing;
        });

        return { ...msg, metadata: { ...msg.metadata, attachments: mergedAttachments } };
      }));

      clearSelections();
      setAttachmentsSafe([]);
      setIsSelecting(false);

      setTimeout(() => {
        latestAttachments.forEach(a => {
          const preview = (a as any).previewUrl;
          const hasUploadedUrl = !!(a as any).url;
          if (preview && hasUploadedUrl && preview.startsWith('blob:')) {
            revokeImagePreview(preview);
          }
        });
      }, 100);

      let data: any = null;
      const hasSession = await ensureAgentSession();
      if (hasSession && agentClientRef.current) {
        data = await agentClientRef.current.sendMessage({
          role: 'user',
          text: messageText,
          stream: true,
          selections: effectiveSelections,
          attachments: attachmentMeta,
          context: {
            preferredInsertAfterSlideId: slideId || undefined,
            styleFromSlideId: slideId || undefined,
            slide_id: slideId || undefined,
            current_slide_index: currentSlideIndex,
            deck_data: deckData,
            scope: deckScope ? 'deck' : 'slide',
            apply_to_all_slides: deckScope,
            selected_linkedin_profile: selectedProfileForContinuationRef.current || selectedLinkedInProfile || undefined,
          },
        });
        selectedProfileForContinuationRef.current = null;
      } else {
        data = await sendChatToApi(
          messageText,
          slideId,
          currentSlideIndex,
          deckData,
          messages,
          effectiveSelections,
          attachmentMeta.map(a => ({ name: a.name, type: a.mimeType, size: a.size }))
        );
      }

      if (data.message === '__INSUFFICIENT_CREDITS__' || data.response === '__INSUFFICIENT_CREDITS__') {
        const creditsMessageId = `credits-${Date.now()}`;
        // Remove loading state BEFORE adding message to prevent flicker
        removePendingMessage(userMsgId);
        setMessages(prevMessages => [
          ...prevMessages,
          {
            id: creditsMessageId,
            type: 'ai',
            message: '',
            timestamp: new Date(),
            feedback: null,
            metadata: {
              isCreditsExhausted: true,
              remaining: data.debug_info?.remaining || 0,
              required: data.debug_info?.required || 1
            }
          }
        ]);
        return;
      }

      // When using agent backend, WebSocket events already handle message streaming
      // via handleAssistantMessageDelta - don't add duplicate message here
      if (hasSession && agentClientRef.current) {
        // Just remove loading state - WebSocket already added the AI message
        removePendingMessage(userMsgId);

        // Still apply deck_diff if present in response
        if (data.deck_diff) {
          applyDeckDiffRespectingEditMode(data.deck_diff, true);
        }
        return;
      }

      // Fallback path (non-agent backend) - add AI message manually
      const responseTimestamp = new Date(data.timestamp);
      const aiMessageId = `ai-${Date.now()}`;

      const aiMessage: ExtendedChatMessageProps = {
        id: aiMessageId,
        type: 'ai',
        message: data.message,
        timestamp: responseTimestamp,
        feedback: null,
        metadata: {
          deckStateBefore
        }
      };

      if (data.deck_diff) {
        applyDeckDiffRespectingEditMode(data.deck_diff, true);
      }

      const deckStateAfter = useDeckStore.getState().deckData;

      aiMessage.metadata = {
        ...aiMessage.metadata,
        deckStateAfter
      };

      // Remove loading state BEFORE adding AI message to prevent flicker
      removePendingMessage(userMsgId);
      setMessages(prevMessages => [...prevMessages, aiMessage]);

    } catch (error) {
      console.error('[ChatPanel] Error sending message:', error);

      const errorTimestamp = new Date();
      const errorMessageId = `error-${Date.now()}`;

      removePendingMessage(userMsgId);
      setMessages(prevMessages => [
        ...prevMessages,
        {
          id: errorMessageId,
          type: 'ai',
          message: "I'm having trouble connecting to the server. Please try again later.",
          timestamp: errorTimestamp,
          feedback: null,
          metadata: {
            isError: true
          }
        }
      ]);
    }
  }, [
    addPendingMessage,
    agentClientRef,
    applyDeckDiffRespectingEditMode,
    attachmentsRef,
    clearMentions,
    clearSelections,
    currentSlideIndex,
    deckId,
    ensureAgentSession,
    input,
    isDeckWideRequest,
    messages,
    onOutlineAgentToolCall,
    onOutlineChatGeneratingChange,
    onOutlineGenerate,
    onOutlineUpdate,
    outline,
    outlineMode,
    outlineSlideTarget,
    processAndRegisterFiles,
    removePendingMessage,
    selectedElements,
    selectedLinkedInProfile,
    selectedMentions,
    selectedProfileForContinuationRef,
    setAttachmentsSafe,
    setInput,
    setIsGenerating,
    setIsSelecting,
    setMessages,
    slides,
    useOutlineAgent,
    userMessageCount,
    hasOutlineSlides,
    originalLinkedInRequestRef,
  ]);

  return {
    sendMessage,
    showFallbackGenerate,
    handleFallbackGenerate,
  };
}
