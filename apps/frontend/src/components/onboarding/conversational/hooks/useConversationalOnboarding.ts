import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { billingApi } from '@/services/billingApi';
import { API_CONFIG } from '@/config/environment';
import {
  streamOutlineAgentChat,
  type OutlineData,
  type FileAttachment,
  type UploadedMedia,
} from '@/services/outlineAgentService';
import { useThemeStore } from '@/stores/themeStore';
import { useIntegrationMentions, type IntegrationMention } from '@/hooks/useIntegrationMentions';
import { useAgentStatus } from './useAgentStatus';
import { useChatMessages } from './useChatMessages';
import { useFileUploads } from './useFileUploads';
import { useOutlineState } from './useOutlineState';
import { useSlideContentLoader } from './useSlideContentLoader';
import { useThemeBlock } from './useThemeBlock';
import { useAutoResizeTextarea } from './useAutoResizeTextarea';
import { useAutoScroll } from './useAutoScroll';
import { buildAttachmentPreviews, convertUploadsToAttachments } from '../utils/files';
import { buildStylePreferencesFromTheme, buildThemePayload, mergeThemeBlockWithGenerated } from '../utils/theme';
import { extractDomainFromText } from '../utils/domain';
import { extractButtons, stripAssistantMarkup } from '../utils/chatFormatting';
import { MAX_FILE_SIZE } from '../constants';
import type { CollectedData, ConversationStage, ConversationalOnboardingProps } from '../types';
import type { CreditWarningMode } from '@/components/billing/CreditWarningDialog';

interface CreditWarningState {
  remaining: number;
  required: number;
  slideCount: number;
  planName: string;
  mode: CreditWarningMode;
  pendingSlideMode?: 'interactive' | 'static';
}

export const useConversationalOnboarding = ({
  onComplete,
  onProcessingChange,
  initialMessage,
  slideCount,
  initialUploadedFiles = [],
}: ConversationalOnboardingProps) => {
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOutlinePrefetching, setIsOutlinePrefetching] = useState(false);
  const [stage, setStage] = useState<ConversationStage>('conversing');
  const [collectedData, setCollectedData] = useState<CollectedData>({ slideCount });
  const [showCreditWarning, setShowCreditWarning] = useState(false);
  const [creditWarningData, setCreditWarningData] = useState<CreditWarningState | null>(null);

  const agentStatus = useAgentStatus();
  const chatMessages = useChatMessages({
    onAgentTypingChange: agentStatus.actions.setIsAgentTyping,
  });
  const fileUploads = useFileUploads({
    initialUploadedFiles,
    maxFileSize: MAX_FILE_SIZE,
    onOversizedFiles: (message) => chatMessages.addMessage('assistant', message),
  });
  const outlineState = useOutlineState();
  const slideContentLoader = useSlideContentLoader({
    outlineBlock: outlineState.outlineBlock,
    outlineFlow: outlineState.outlineFlow,
    chatHistory: chatMessages.chatHistory,
    fileAnalysisContext: fileUploads.fileAnalysisContext,
  });
  const themeState = useThemeBlock({
    onThinkingStart: agentStatus.actions.addThinkingStep,
    onThinkingComplete: agentStatus.actions.completeThinkingStep,
  });
  const { setOutlineDeckTheme } = useThemeStore();
  const outlineInitializedRef = useRef(false);
  const slideModePromptedRef = useRef(false);
  const brandConfirmationPromptedRef = useRef(false);
  const fileImagePromptedRef = useRef(false);
  const pendingContextRef = useRef({
    scraped_context: '',
    reference_sources: [] as Array<{ url?: string; title?: string }>,
    research_context: '',
    research_citations: [] as string[],
  });
  const prefetchSlidesRef = useRef(false);
  const contentContextSignatureRef = useRef('');
  const forceOutlineAfterClarificationRef = useRef(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { anchorRef: messagesEndRef, scrollContainerRef } = useAutoScroll([
    chatMessages.messages,
    agentStatus.state.thinkingSteps,
    agentStatus.state.isAgentTyping,
    agentStatus.state.streamingText,
  ]);

  const {
    mentionState,
    selectedMentions,
    handleTextChange: handleMentionTextChange,
    handleKeyDown: handleMentionKeyDown,
    selectMention,
    closeMentionPopover,
    removeMention,
  } = useIntegrationMentions();

  useAutoResizeTextarea(inputRef, input);

  const hashContext = useCallback((value: string) => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0;
    }
    return String(hash);
  }, []);

  const shouldRegenerateOutline = useCallback((message: string) => {
    const normalized = message.toLowerCase();
    return /\b(regenerate|re-?generate|start over|start again|redo|do over|reset|from scratch|new outline|fresh outline)\b/.test(normalized);
  }, []);

  const extractedImages = useMemo(() => {
    const images = outlineState.outlineFlow?.extracted_images;
    if (!Array.isArray(images)) return [];
    return images.filter((url) => typeof url === 'string' && url.trim() !== '');
  }, [outlineState.outlineFlow?.extracted_images]);

  const needsFileImageConfirmation = useMemo(() => (
    extractedImages.length > 0 && collectedData.use_uploaded_images === undefined
  ), [collectedData.use_uploaded_images, extractedImages.length]);

  const fileImageDefaultValue = useMemo(() => {
    return extractedImages.length > 0 ? 'Find best images' : undefined;
  }, [extractedImages.length]);

  const mergeExtractedMedia = useCallback((
    existing: UploadedMedia[] | undefined,
    extractedUrls: string[]
  ) => {
    const existingList = Array.isArray(existing) ? existing : [];
    const seen = new Set(
      existingList
        .map((item) => item.url || item.previewUrl)
        .filter((url): url is string => typeof url === 'string' && url.trim() !== '')
    );
    const additions = extractedUrls
      .filter((url) => /^https?:\/\//i.test(url) && !seen.has(url))
      .map((url, index) => ({
        id: `extracted-${index + 1}`,
        name: `extracted-image-${index + 1}.png`,
        filename: `extracted-image-${index + 1}.png`,
        type: 'image/png',
        url,
        metadata: { source: 'file_extract', usePolicy: 'explicit' },
      }));
    return existingList.concat(additions);
  }, []);

  const applyFileImagePreference = useCallback((useImages: boolean) => {
    outlineState.setOutlineFlow((prev) => {
      if (!prev) return prev;
      const next = { ...prev, use_uploaded_images: useImages };
      if (useImages && extractedImages.length > 0) {
        next.uploadedMedia = mergeExtractedMedia(prev.uploadedMedia, extractedImages);
      } else if (!useImages && Array.isArray(prev.uploadedMedia)) {
        next.uploadedMedia = prev.uploadedMedia.filter(
          (media) => media?.metadata?.source !== 'file_extract'
        );
      }
      return next;
    });
    setCollectedData((prev) => ({ ...prev, use_uploaded_images: useImages }));
  }, [extractedImages, mergeExtractedMedia, outlineState, setCollectedData]);

  const parseFileImagePreference = useCallback((text: string) => {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return null;
    if (normalized.includes('no additional details')) return false;

    const hasLabel = normalized.includes('use images from') ||
      normalized.includes('uploaded files') ||
      normalized.includes('file images');

    if (!hasLabel && fileImagePromptedRef.current) {
      if (/^yes\b/.test(normalized)) return true;
      if (/^no\b/.test(normalized)) return false;
    }

    if (!hasLabel) return null;

    if (normalized.includes('find best') || normalized.includes('no')) return false;
    if (normalized.includes('use extracted') || normalized.includes('use them') || normalized.includes('yes')) return true;
    return null;
  }, []);

  const buildCurrentOutlineContext = useCallback(() => {
    const outlineFlow = outlineState.outlineFlow;
    if (outlineFlow?.slides && outlineFlow.slides.length > 0) {
      const fallbackTitle = outlineFlow.topic || outlineState.outlineBlock?.title || 'Presentation';
      return {
        title: fallbackTitle,
        slides: outlineFlow.slides.map((slide, index) => ({
          index,
          title: slide.title || '',
          subtitle: (slide as any).subtitle || '',
          content: (slide as any).content || '',
          key_points: (slide as any).key_points || (slide as any).keyPoints || [],
        })),
      };
    }

    const outlineBlock = outlineState.outlineBlock;
    if (outlineBlock?.slides && outlineBlock.slides.length > 0) {
      return {
        title: outlineBlock.title || 'Presentation',
        slides: outlineBlock.slides.map((slide, index) => ({
          index,
          title: slide.title || '',
          subtitle: slide.subtitle || '',
          content: slide.content || '',
          key_points: slide.keyPoints || [],
        })),
      };
    }

    return undefined;
  }, [outlineState.outlineBlock, outlineState.outlineFlow]);

  useEffect(() => {
    onProcessingChange?.(isProcessing || agentStatus.state.isAgentTyping || isOutlinePrefetching);
  }, [agentStatus.state.isAgentTyping, isOutlinePrefetching, isProcessing, onProcessingChange]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (slideModePromptedRef.current) return;
    if (!outlineInitializedRef.current) return;
    if (stage !== 'planning') return;
    if (!outlineState.outlineFlow) return;
    if (needsFileImageConfirmation) return;
    // Brand confirmation is optional - don't block slide mode selection
    if (isOutlinePrefetching) return;
    if (themeState.isThemeLoading) return;

    const timer = setTimeout(() => {
      if (slideModePromptedRef.current) return;
      slideModePromptedRef.current = true;
      setStage('slide_mode_selection');
      chatMessages.addMessage('assistant', 'Your presentation is ready to generate!', {
        showSlideModeSelection: true,
      });
    }, 800);

    return () => clearTimeout(timer);
  }, [
    chatMessages,
    outlineState.outlineFlow,
    needsFileImageConfirmation,
    isOutlinePrefetching,
    stage,
    themeState.isThemeLoading,
  ]);

  useEffect(() => {
    if (fileImagePromptedRef.current) return;
    if (!outlineInitializedRef.current) return;
    if (stage !== 'planning') return;
    if (!outlineState.outlineFlow) return;
    if (!needsFileImageConfirmation) return;
    // Brand confirmation is optional - don't block file image prompt

    const fileImageField = {
      key: 'use_file_images',
      label: 'Use images from your uploads?',
      type: 'choice',
      options: ['Use extracted images', 'Find best images'],
      ...(fileImageDefaultValue ? { value: fileImageDefaultValue } : {}),
    };

    fileImagePromptedRef.current = true;
    chatMessages.addAgentMessage(
      'Do you want to use images extracted from your uploaded files? If not, I will find the best images for you.',
      {
        metadata: {
          clarification: {
            fields: [fileImageField],
          },
        },
      }
    );
  }, [
    chatMessages,
    fileImageDefaultValue,
    needsFileImageConfirmation,
    outlineState.outlineFlow,
    stage,
  ]);

  useEffect(() => {
    if (!outlineState.outlineBlock?.slides?.length) return;
    if (stage !== 'planning' && stage !== 'slide_mode_selection') return;
    if (prefetchSlidesRef.current) return;

    const contextPayload = [
      outlineState.outlineFlow?.research_context,
      outlineState.outlineFlow?.scraped_context,
      fileUploads.fileAnalysisContext,
    ]
      .map((segment) => (segment || '').trim())
      .filter(Boolean)
      .join('\n---\n');
    const contextSignature = hashContext(contextPayload);
    const shouldRefreshContent = Boolean(contextPayload) &&
      contentContextSignatureRef.current &&
      contentContextSignatureRef.current !== contextSignature;

    const slidesToLoad = outlineState.outlineBlock.slides
      .map((slide, index) => ({ slide, index }))
      .filter(({ slide }) =>
        (!slide.isContentLoaded && !slide.content) ||
        (shouldRefreshContent && !slide.isContentEdited)
      );

    if (slidesToLoad.length === 0) {
      contentContextSignatureRef.current = contextSignature;
      return;
    }

    let cancelled = false;
    prefetchSlidesRef.current = true;
    setIsOutlinePrefetching(true);

    (async () => {
      for (const { slide, index } of slidesToLoad) {
        if (cancelled) break;
        try {
          const contentData = await slideContentLoader(slide.id, index);
          if (cancelled) break;
          outlineState.handleSlideEdit(slide.id, {
            content: contentData.content,
            keyPoints: contentData.keyPoints,
            generationContext: contentData.generationContext,
            isContentLoaded: true,
            isContentEdited: slide.isContentEdited ?? false,
          });
        } catch (error) {
          console.error('[ConversationalOnboarding] Failed to prefetch slide content', error);
        }
      }
    })().finally(() => {
      prefetchSlidesRef.current = false;
      setIsOutlinePrefetching(false);
      if (!cancelled) {
        contentContextSignatureRef.current = contextSignature;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    outlineState.outlineBlock,
    outlineState.outlineFlow?.research_context,
    outlineState.outlineFlow?.scraped_context,
    fileUploads.fileAnalysisContext,
    hashContext,
    outlineState.handleSlideEdit,
    slideContentLoader,
    stage,
  ]);

  // Brand domain confirmation - merge into existing clarification or show as separate message
  useEffect(() => {
    if (brandConfirmationPromptedRef.current) return;
    const needsConfirm = themeState.themeBlock?.branding?.needsBrandDomainConfirmation;
    if (!needsConfirm) return;

    const candidate = themeState.themeBlock?.branding?.brandDomain ||
      themeState.themeBlock?.branding?.brandDomainCandidates?.[0];
    const brandDomainField = {
      key: 'brand_domain',
      label: 'What is the brand domain?',
      type: 'text' as const,
      value: candidate || '',
    };

    // Check if there's already a clarification card showing
    const lastMessage = chatMessages.messages[chatMessages.messages.length - 1];
    const hasPendingClarification = lastMessage?.role === 'assistant' &&
      lastMessage?.metadata?.clarification?.fields?.length > 0;

    if (hasPendingClarification) {
      // Check if brand domain is already in the clarification
      const existingFields = lastMessage.metadata?.clarification?.fields || [];
      const brandAlreadyInFields = existingFields.some(
        (f: { key: string }) => f.key === 'brand_domain' || f.key === 'brandDomain'
      );

      if (!brandAlreadyInFields) {
        // Append brand domain to existing clarification by updating the message
        chatMessages.setMessages((prev) =>
          prev.map((msg, idx) =>
            idx === prev.length - 1 && msg.id === lastMessage.id
              ? {
                  ...msg,
                  metadata: {
                    ...msg.metadata,
                    clarification: {
                      ...msg.metadata?.clarification,
                      fields: [...existingFields, brandDomainField],
                    },
                  },
                }
              : msg
          )
        );
      }
      brandConfirmationPromptedRef.current = true;
      return;
    }

    // No clarification showing - add brand domain as separate message
    chatMessages.addAgentMessage('Confirm the brand domain to fetch the logo and colors.', {
      metadata: { clarification: { fields: [brandDomainField] } },
    });
    brandConfirmationPromptedRef.current = true;
  }, [chatMessages, themeState.themeBlock]);

  const applyThemeToStore = useCallback(() => {
    if (!themeState.themeBlock) return;

    const themePayload = buildThemePayload(themeState.themeBlock);
    const outlineId = outlineState.outlineFlow?.id || outlineState.outlineBlock?.outlineId || 'onboarding';
    setOutlineDeckTheme(outlineId, themePayload);

    setCollectedData((prev) => ({
      ...prev,
      stylePreferences: JSON.stringify(buildStylePreferencesFromTheme(themeState.themeBlock)),
    }));
  }, [outlineState.outlineBlock, outlineState.outlineFlow, setOutlineDeckTheme, themeState.themeBlock]);

  const applyPendingContextToOutline = useCallback(() => {
    const pending = pendingContextRef.current;
    if (!outlineState.outlineFlow) return;
    if (!pending.scraped_context && !pending.research_context) return;

    outlineState.setOutlineFlow((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        scraped_context: pending.scraped_context || prev.scraped_context,
        reference_sources: pending.reference_sources.length > 0 ? pending.reference_sources : prev.reference_sources,
        research_context: pending.research_context || prev.research_context,
        research_citations: pending.research_citations.length > 0 ? pending.research_citations : prev.research_citations,
      };
    });
  }, [outlineState]);

  const applyThemeChangesFromAgent = useCallback(async (themeChanges?: OutlineData['theme_changes']) => {
    console.log('[ConvOnboarding] applyThemeChangesFromAgent called with:', themeChanges);
    if (!themeChanges) {
      console.log('[ConvOnboarding] No theme_changes provided, skipping');
      return;
    }
    const outlineId = outlineState.outlineFlow?.id || outlineState.outlineBlock?.outlineId || 'onboarding';

    themeState.setIsThemeLoading(true);
    themeState.setThemeBlock((prev) => (prev ? { ...prev, loadingMessage: 'Updating theme...' } : prev));

    try {
      console.log('[ConvOnboarding] Calling /api/outline-theme/apply with:', { outline_id: outlineId, theme_changes: themeChanges });
      const response = await fetch(`${API_CONFIG.AGENT_BASE_URL}/api/outline-theme/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outline_id: outlineId,
          theme_changes: themeChanges,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ConvOnboarding] Theme update failed:', response.status, errorText);
        throw new Error(`Theme update failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[ConvOnboarding] Theme update response:', result);

      if (result.style_preferences) {
        console.log('[ConvOnboarding] Applying style_preferences:', result.style_preferences);
        outlineState.setOutlineFlow((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            stylePreferences: {
              ...(prev.stylePreferences || {}),
              ...result.style_preferences,
            },
          };
        });
      }

      if (result.theme_updates) {
        console.log('[ConvOnboarding] Applying theme_updates:', result.theme_updates);
        themeState.setThemeBlock((prev) => {
          if (!prev) return prev;

          const mergedTheme = mergeThemeBlockWithGenerated(prev, result.theme_updates);
          const nextTheme = result.theme_updates.remove_logo
            ? {
              ...mergedTheme,
              branding: {
                ...mergedTheme.branding,
                logoUrl: undefined,
              },
            }
            : mergedTheme;

          setCollectedData((prevData) => ({
            ...prevData,
            stylePreferences: JSON.stringify(buildStylePreferencesFromTheme(nextTheme)),
          }));

          return {
            ...nextTheme,
            loadingMessage: undefined,
          };
        });
      } else {
        console.log('[ConvOnboarding] No theme_updates in response');
      }
    } catch (error) {
      console.error('[ConversationalOnboarding] Failed to apply theme changes:', error);
    } finally {
      themeState.setIsThemeLoading(false);
      themeState.setThemeBlock((prev) => (prev ? { ...prev, loadingMessage: undefined } : prev));
    }
  }, [
    outlineState.outlineBlock?.outlineId,
    outlineState.outlineFlow?.id,
    outlineState.setOutlineFlow,
    themeState,
    setCollectedData,
  ]);

  const appendResearchContext = useCallback((content?: string, citations?: string[], query?: string) => {
    if (!content) return;
    const pending = pendingContextRef.current;
    const label = query ? `Research: ${query}` : 'Research';
    const segment = `${label}\n${content}`.trim();
    if (!pending.research_context.includes(content)) {
      pending.research_context = pending.research_context
        ? `${pending.research_context}\n\n${segment}`
        : segment;
    }
    if (citations && citations.length > 0) {
      const merged = new Set([...(pending.research_citations || []), ...citations]);
      pending.research_citations = Array.from(merged);
    }
    applyPendingContextToOutline();
  }, [applyPendingContextToOutline]);

  const handleSendMessage = useCallback(async (messageText?: string) => {
    const userMessage = messageText || input.trim();
    const currentFiles = [...fileUploads.uploadedFiles];
    const hasFiles = currentFiles.length > 0;

    if ((!userMessage && !hasFiles) || isProcessing) return;

    const hasExistingOutline = Boolean(
      (outlineState.outlineFlow?.slides && outlineState.outlineFlow.slides.length > 0) ||
      (outlineState.outlineBlock?.slides && outlineState.outlineBlock.slides.length > 0)
    );
    const allowOutlineRegeneration = Boolean(userMessage && shouldRegenerateOutline(userMessage));

    const messageAttachments = buildAttachmentPreviews(currentFiles);
    setInput('');
    setIsProcessing(true);

    chatMessages.addMessage(
      'user',
      userMessage || (hasFiles ? `Shared ${currentFiles.length} file${currentFiles.length > 1 ? 's' : ''}` : ''),
      { attachments: messageAttachments.length > 0 ? messageAttachments : undefined }
    );

    fileUploads.clearUploads();

    // Start theme generation in parallel with outline generation (for first message only)
    // This reduces perceived latency by fetching brand colors while outline is being generated
    if (!hasExistingOutline && userMessage && !themeState.themeBlock?.hasExplicitColors) {
      themeState.prefetchThemeFromPrompt(userMessage);
    }

    try {
      agentStatus.actions.setIsAgentTyping(true);
      agentStatus.actions.setStreamingText('');
      agentStatus.actions.setStatusPhase('thinking');
      agentStatus.actions.setStatusMessage('Thinking...');
      agentStatus.actions.clearThinkingSteps();

      let newFilesToAdd: FileAttachment[] = [];
      if (hasFiles) {
        newFilesToAdd = await convertUploadsToAttachments(currentFiles);
        fileUploads.setPersistentFiles((prev) => [...prev, ...newFilesToAdd]);
      }

      const allPersistentFiles = [...fileUploads.persistentFiles, ...newFilesToAdd];
      const filesToSend = allPersistentFiles.filter((file) => !fileUploads.analyzedFileNames.has(file.name));

      const currentOutlineContext = buildCurrentOutlineContext();
      const forceOutline = forceOutlineAfterClarificationRef.current;
      forceOutlineAfterClarificationRef.current = false;
      const outlineContext = outlineState.outlineFlow;
      const persistedScrapeContext = outlineContext?.scraped_context || pendingContextRef.current.scraped_context;
      const persistedReferenceSources = outlineContext?.reference_sources?.length
        ? outlineContext.reference_sources
        : pendingContextRef.current.reference_sources;
      const persistedResearchContext = outlineContext?.research_context || pendingContextRef.current.research_context;
      const persistedResearchCitations = outlineContext?.research_citations?.length
        ? outlineContext.research_citations
        : pendingContextRef.current.research_citations;
      const contextWithFileAnalysis = {
        ...collectedData,
        ...(fileUploads.fileAnalysisContext && filesToSend.length === 0
          ? { previousFileAnalysis: fileUploads.fileAnalysisContext }
          : {}),
        ...(persistedScrapeContext ? { scraped_context: persistedScrapeContext } : {}),
        ...(persistedReferenceSources.length > 0 ? { reference_sources: persistedReferenceSources } : {}),
        ...(persistedResearchContext ? { research_context: persistedResearchContext } : {}),
        ...(persistedResearchCitations.length > 0 ? { research_citations: persistedResearchCitations } : {}),
        ...(currentOutlineContext ? { current_outline: currentOutlineContext } : {}),
        ...(forceOutline ? { force_outline: true } : {}),
      };

      const generator = streamOutlineAgentChat({
        message: userMessage || 'Please analyze these files for my presentation.',
        chat_history: chatMessages.chatHistory,
        context: contextWithFileAnalysis,
        files: filesToSend.length > 0 ? filesToSend : undefined,
      });

      let assistantMessage = '';
      let outlineData: OutlineData | null = null;

      for await (const event of generator) {
        if (event.type === 'text') {
          assistantMessage += event.content;
          agentStatus.actions.appendStreamingText(event.content);
          agentStatus.actions.setStatusMessage(null);
          agentStatus.actions.setStatusPhase(null);
        } else if (event.type === 'reference_content') {
          pendingContextRef.current.scraped_context = event.content || '';
          pendingContextRef.current.reference_sources = event.sources || [];
          applyPendingContextToOutline();
        } else if (event.type === 'research' || event.type === 'research_results') {
          appendResearchContext(event.content, event.citations, (event as any).query);
        } else if (event.type === 'research_error') {
          agentStatus.actions.setStatusPhase('error');
          agentStatus.actions.setStatusMessage(event.message || 'Research failed');
        } else if (event.type === 'status') {
          const status = (event as any).status;
          const message = (event as any).message;
          const query = (event as any).query;

          // Add thinking step with actual message from backend
          agentStatus.actions.addThinkingStep(status, message || query, query);

          // Set phase and pass through actual message (or null for phase-only display)
          agentStatus.actions.setStatusPhase(status);
          agentStatus.actions.setStatusMessage(message || null);

          // Handle file analysis state updates
          if (status === 'files_analyzed') {
            const analyses = (event as any).analyses || [];
            const analyzedNames = analyses
              .map((analysis: any) => analysis.name || analysis.filename)
              .filter(Boolean);
            if (analyzedNames.length > 0) {
              fileUploads.setAnalyzedFileNames((prev) => new Set([...prev, ...analyzedNames]));
            }

            const fileContext = (event as any).file_context || (event as any).content_context;
            if (fileContext) {
              fileUploads.setFileAnalysisContext(fileContext);
            } else if (analyses.length > 0) {
              const summaries = analyses
                .map((analysis: any) => `${analysis.name || analysis.filename}: ${analysis.summary || 'analyzed'}`)
                .join('\n');
              fileUploads.setFileAnalysisContext(summaries);
            }
          }
        } else if (event.type === 'outline') {
          console.log('[ConvOnboarding] Received outline event:', {
            action: event.data?.action,
            hasSlides: Boolean(event.data?.slides?.length),
            hasThemeChanges: Boolean(event.data?.theme_changes),
            currentOutlineAction: outlineData?.action,
          });

          if (!outlineData || outlineData.action !== 'generate_outline') {
            outlineData = event.data;
          } else if (event.data?.action === 'update_theme' && outlineData.action === 'generate_outline') {
            outlineData.theme_changes = event.data.theme_changes;
          }
          agentStatus.actions.setStatusMessage(null);
          agentStatus.actions.setStatusPhase(null);

          // Route by action type for granular updates
          const action = event.data?.action as string | undefined;
          const isGenerateOutline = action === 'generate_outline';
          const isUpdateOutline = action === 'update_outline';
          const isUpdateSlides = action === 'update_slides';
          const isUpdateTheme = action === 'update_theme';
          const hasDirectSlides = Array.isArray(event.data?.slides) && event.data.slides.length > 0;
          const hasOutlineAction = isGenerateOutline || isUpdateOutline || isUpdateSlides;

          // Handle theme-only updates separately (keep slides interactive)
          if (isUpdateTheme && !hasDirectSlides) {
            console.log('[ConvOnboarding] Handling update_theme action (theme only)');
            outlineState.setOutlineAction('update_theme', 'Updating theme...');
            // Theme application is handled separately after stream ends
            // Store for later processing
            outlineData = event.data;
            continue; // Don't treat as outline update
          }

          // Handle update_slides action - granular slide updates
          if (isUpdateSlides && event.data?.updated_slides?.length > 0) {
            console.log('[ConvOnboarding] Handling update_slides action (granular)');
            const slideUpdates = event.data.updated_slides.map((s: any) => ({
              index: s.index,
              title: s.title,
              subtitle: s.subtitle,
              content: s.content,
              key_points: s.key_points || s.keyPoints,
            }));
            const indices = slideUpdates.map((s: any) => s.index).filter((i: any) => typeof i === 'number');
            outlineState.setOutlineAction('update_slides', 'Updating slides...', indices);
            outlineState.updateSpecificSlides(slideUpdates);
            outlineState.clearLoadingStates();
            continue; // Don't fall through to full outline handling
          }

          // Handle update_outline from tool results — backend sends the full slides
          // array with changes baked in. Convert to granular updates so titles/content
          // are applied directly (mergeOutline would preserve old titles).
          if (isUpdateOutline && hasDirectSlides) {
            console.log('[ConvOnboarding] Handling update_outline action (tool result slides)');
            const incomingSlides = event.data.slides as any[];
            const slideUpdates = incomingSlides.map((s: any, i: number) => ({
              index: i,
              title: s.title,
              subtitle: s.subtitle,
              content: s.content,
              key_points: s.key_points || s.keyPoints || s.key_points,
              keyPoints: s.key_points || s.keyPoints,
            }));
            outlineState.setOutlineAction('update_slides', 'Updating slides...');
            outlineState.updateSpecificSlides(slideUpdates);
            outlineState.clearLoadingStates();
            continue;
          }

          if (hasOutlineAction || hasDirectSlides) {
            const pendingContext = pendingContextRef.current;
            // Flatten nested data structure - backend sends slides in different locations:
            // 1. event.data.slides (direct)
            // 2. event.data.data.slides (nested in data property)
            // 3. event.data.outline.slides (nested in outline property)
            const nestedData = event.data.data && typeof event.data.data === 'object' ? event.data.data : {};
            const outlineData = event.data.outline && typeof event.data.outline === 'object' ? event.data.outline : {};

            // Debug: Log raw data structure to understand where slides are
            console.log('[ConvOnboarding] Raw event.data structure:', {
              keys: Object.keys(event.data || {}),
              directSlides: event.data?.slides?.length,
              nestedSlides: nestedData?.slides?.length,
              outlineSlides: outlineData?.slides?.length,
            });

            const flattenedEventData = {
              ...event.data,
              ...nestedData, // Merge nested data to top level
              ...outlineData, // Merge outline data to top level (includes slides)
            };
            const enrichedOutline = {
              ...flattenedEventData,
              scraped_context: flattenedEventData.scraped_context || pendingContext.scraped_context,
              reference_sources: flattenedEventData.reference_sources?.length ? flattenedEventData.reference_sources : pendingContext.reference_sources,
              research_context: flattenedEventData.research_context || pendingContext.research_context,
              research_citations: flattenedEventData.research_citations?.length ? flattenedEventData.research_citations : pendingContext.research_citations,
            };
            pendingContextRef.current = {
              ...pendingContext,
              scraped_context: enrichedOutline.scraped_context || pendingContext.scraped_context,
              reference_sources: enrichedOutline.reference_sources || pendingContext.reference_sources,
              research_context: enrichedOutline.research_context || pendingContext.research_context,
              research_citations: enrichedOutline.research_citations || pendingContext.research_citations,
            };

            const isFirstOutline = !outlineInitializedRef.current;
            const shouldRegenerate = Boolean(
              !isFirstOutline &&
              hasExistingOutline &&
              allowOutlineRegeneration &&
              (hasOutlineAction || hasDirectSlides)
            );
            const shouldInitialize = isFirstOutline || shouldRegenerate;

            console.log('[ConvOnboarding] outline event - stream phase:', {
              action: event.data?.action,
              hasOutlineAction,
              hasDirectSlides,
              isFirstOutline,
              shouldRegenerate,
              shouldInitialize,
              outlineInitializedRef: outlineInitializedRef.current,
              hasSlides: Boolean(enrichedOutline?.slides?.length),
              slideCount: enrichedOutline?.slides?.length || 0,
            });

            if (shouldInitialize) {
              console.log('[ConvOnboarding] Calling initializeOutline from stream');
              outlineInitializedRef.current = true;
              setStage('planning');
              outlineState.initializeOutline(enrichedOutline);
              themeState.initializeThemeFromOutline(enrichedOutline);
              slideModePromptedRef.current = false;
              brandConfirmationPromptedRef.current = false;
              fileImagePromptedRef.current = false;
              setCollectedData((prev) => ({ ...prev, use_uploaded_images: undefined }));
              if (isFirstOutline) {
                chatMessages.addMessage(
                  'assistant',
                  'Review the outline and theme to the right. Edit anything you want before choosing a mode.',
                  { skipHistory: true }
                );
              }
            } else {
              const allowReplace = !(event.data?.action === 'generate_outline' && !allowOutlineRegeneration);
              outlineState.mergeOutline(enrichedOutline, { allowReplace });
            }
          }
        } else if (event.type === 'error') {
          agentStatus.actions.setStatusMessage(null);
          agentStatus.actions.setStatusPhase(null);
          chatMessages.addAgentMessage(
            "I apologize, but I encountered an error. Let's try again. What would you like your presentation to be about?"
          );
          agentStatus.actions.setIsAgentTyping(false);
          setIsProcessing(false);
          return;
        }
      }

      agentStatus.actions.setIsAgentTyping(false);
      agentStatus.actions.resetStatus();
      agentStatus.actions.clearThinkingSteps();

      if (outlineData && outlineData.action === 'clarify') {
        const toText = (value: unknown): string => (typeof value === 'string' ? value : '');
        const clarificationMessage = toText(outlineData.message) ||
          toText(outlineData.clarification?.message) ||
          'Quick check before I build the deck.';
        let clarificationFields = outlineData.clarification?.fields ? [...outlineData.clarification.fields] : [];

        // Check if brand domain confirmation is also needed - merge it as the last question
        // Check both theme state AND outline response stylePreferences (theme state may not be ready yet)
        const needsBrandConfirm = themeState.themeBlock?.branding?.needsBrandDomainConfirmation ||
          outlineData.stylePreferences?.needsBrandDomainConfirmation;
        const brandAlreadyInFields = clarificationFields.some(
          (f) => f.key === 'brand_domain' || f.key === 'brandDomain'
        );
        if (needsBrandConfirm && !brandAlreadyInFields && !brandConfirmationPromptedRef.current) {
          const candidate = themeState.themeBlock?.branding?.brandDomain ||
            themeState.themeBlock?.branding?.brandDomainCandidates?.[0] ||
            outlineData.stylePreferences?.brandDomain ||
            outlineData.stylePreferences?.brandDomainCandidates?.[0];
          clarificationFields.push({
            key: 'brand_domain',
            label: 'What is the brand domain?',
            type: 'text',
            value: candidate || '',
          });
          // Mark as prompted so the separate useEffect doesn't trigger
          brandConfirmationPromptedRef.current = true;
        }

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
        chatMessages.addAgentMessage(displayMessage, {
          metadata: hasClarificationFields
            ? { clarification: { fields: clarificationFields } }
            : undefined,
        });

        setIsProcessing(false);
        return;
      }

      if (outlineData && outlineData.action === 'generate_outline') {
        const pendingContext = pendingContextRef.current;
        const enrichedOutline = {
          ...outlineData,
          scraped_context: outlineData.scraped_context || pendingContext.scraped_context,
          reference_sources: outlineData.reference_sources?.length ? outlineData.reference_sources : pendingContext.reference_sources,
          research_context: outlineData.research_context || pendingContext.research_context,
          research_citations: outlineData.research_citations?.length ? outlineData.research_citations : pendingContext.research_citations,
        };
        pendingContextRef.current = {
          ...pendingContext,
          scraped_context: enrichedOutline.scraped_context || pendingContext.scraped_context,
          reference_sources: enrichedOutline.reference_sources || pendingContext.reference_sources,
          research_context: enrichedOutline.research_context || pendingContext.research_context,
          research_citations: enrichedOutline.research_citations || pendingContext.research_citations,
        };

        const isFirstOutline = !outlineInitializedRef.current;
        const shouldRegenerate = Boolean(!isFirstOutline && hasExistingOutline && allowOutlineRegeneration);

        console.log('[ConvOnboarding] outline - post-stream phase:', {
          action: outlineData?.action,
          isFirstOutline,
          shouldRegenerate,
          outlineInitializedRef: outlineInitializedRef.current,
          hasSlides: Boolean(enrichedOutline?.slides?.length),
          hasExistingOutline,
          allowOutlineRegeneration,
        });

        if (isFirstOutline || shouldRegenerate) {
          console.log('[ConvOnboarding] Calling initializeOutline from post-stream');
          setStage('planning');
          outlineState.initializeOutline(enrichedOutline);
          themeState.initializeThemeFromOutline(enrichedOutline);
          if (isFirstOutline) {
            chatMessages.addMessage(
              'assistant',
              'Review the outline and theme to the right. Edit anything you want before choosing a mode.',
              { skipHistory: true }
            );
          }
          slideModePromptedRef.current = false;
          brandConfirmationPromptedRef.current = false;
          fileImagePromptedRef.current = false;
          setCollectedData((prev) => ({ ...prev, use_uploaded_images: undefined }));
          outlineInitializedRef.current = true;
        } else {
          outlineState.mergeOutline(enrichedOutline, { allowReplace: false });
        }

        fileUploads.resetPersistentFiles();

        const detailLevel = enrichedOutline.detail_level || 'standard';
        setCollectedData((prev) => ({ ...prev, presentationType: 'simple', detailLevel }));

        // Brand domain confirmation is now merged into clarification fields in the clarify handler
        // No separate prompt needed here - if we're at generate_outline, proceed with the theme
      } else if (outlineData && outlineData.action === 'update_theme') {
        console.log('[ConvOnboarding] Detected update_theme action:', {
          action: outlineData.action,
          theme_changes: outlineData.theme_changes,
          hasThemeChanges: Boolean(outlineData.theme_changes),
        });

        setCollectedData((prev) => ({
          ...prev,
          themeChanges: outlineData?.theme_changes,
        }));

        if (outlineData.theme_changes) {
          await applyThemeChangesFromAgent(outlineData.theme_changes);
        } else {
          console.log('[ConvOnboarding] update_theme action but no theme_changes object');
        }

        const cleanedMessage = stripAssistantMarkup(assistantMessage);
        chatMessages.addAgentMessage(cleanedMessage || "I've noted your branding preferences.");
      } else {
        const buttons = extractButtons(assistantMessage);
        const cleanedMessage = stripAssistantMarkup(assistantMessage);
        const fallbackMessage = buttons.length > 0 ? 'Choose an option:' : '';

        if (cleanedMessage || buttons.length > 0) {
          chatMessages.addMessage('assistant', cleanedMessage || fallbackMessage, {
            buttons: buttons.length > 0 ? buttons : undefined,
          });
        }
      }
    } catch (error) {
      console.error('[ConversationalOnboarding] Error:', error);
      chatMessages.addAgentMessage("I'm sorry, I encountered an issue. Could you please try rephrasing that?");
    } finally {
      setIsProcessing(false);
      agentStatus.actions.resetStatus();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [
    agentStatus.actions,
    appendResearchContext,
    applyThemeChangesFromAgent,
    applyPendingContextToOutline,
    buildCurrentOutlineContext,
    chatMessages,
    collectedData,
    fileUploads,
    input,
    isProcessing,
    outlineState,
    shouldRegenerateOutline,
    themeState,
  ]);

  const proceedWithGeneration = useCallback((slideMode: 'interactive' | 'static') => {
    const modeLabel = slideMode === 'interactive' ? 'NextGen' : 'Traditional';

    chatMessages.addMessage('user', modeLabel);
    setCollectedData((prev) => ({ ...prev, slideMode }));
    setStage('confirmed');

    applyThemeToStore();

    const confirmMessage = slideMode === 'interactive'
      ? 'Creating your next-generation interactive presentation...'
      : 'Creating your beautifully designed traditional presentation...';

    chatMessages.addAgentMessage(confirmMessage);

    setTimeout(() => {
      const stylePreferencesFromTheme = themeState.themeBlock
        ? buildStylePreferencesFromTheme(themeState.themeBlock)
        : null;

      onComplete({
        ...collectedData,
        topic: outlineState.outlineFlow?.topic || collectedData.topic,
        style: outlineState.outlineFlow?.brandContext ||
          outlineState.outlineFlow?.stylePreferences?.vibeContext ||
          outlineState.outlineFlow?.style ||
          collectedData.style,
        stylePreferences: stylePreferencesFromTheme ? JSON.stringify(stylePreferencesFromTheme) : collectedData.stylePreferences,
        slideCount: collectedData.slideCount || outlineState.outlineFlow?.slide_count,
        detailLevel: collectedData.detailLevel || 'quick',
        presentationType: 'simple',
        slideMode,
        chatHistory: chatMessages.chatHistory,
        themeChanges: collectedData.themeChanges || outlineState.outlineFlow?.theme_changes,
        uploadedFiles: fileUploads.uploadedFiles.map((file) => file.file),
        uploadedMedia: outlineState.outlineFlow?.uploadedMedia,
        slideScreenshots: outlineState.outlineFlow?.slide_screenshots,
        slides: outlineState.outlineFlow?.slides,
        scrapedVideos: outlineState.outlineFlow?.scraped_videos,
        use_uploaded_images: collectedData.use_uploaded_images === true,
        scraped_context: outlineState.outlineFlow?.scraped_context,
        research_context: outlineState.outlineFlow?.research_context,
        reference_sources: outlineState.outlineFlow?.reference_sources,
        research_citations: outlineState.outlineFlow?.research_citations,
      });
    }, 1500);
  }, [
    applyThemeToStore,
    chatMessages,
    collectedData,
    fileUploads.uploadedFiles,
    onComplete,
    outlineState.outlineFlow,
    themeState.themeBlock,
  ]);

  const handleSlideModeSelect = useCallback(async (slideMode: 'interactive' | 'static') => {
    setIsProcessing(true);

    if (prefetchSlidesRef.current) {
      agentStatus.actions.setStatusMessage('Generating your outline...');
      agentStatus.actions.setStatusPhase('compiling');
      agentStatus.actions.setIsAgentTyping(true);

      while (prefetchSlidesRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      agentStatus.actions.setIsAgentTyping(false);
      agentStatus.actions.setStatusMessage(null);
      agentStatus.actions.setStatusPhase(null);
    }

    if (themeState.isThemeLoadingRef.current) {
      const loadingMsg = themeState.themeBlock?.loadingMessage || 'Generating theme...';
      agentStatus.actions.setStatusMessage(loadingMsg);
      agentStatus.actions.setStatusPhase('fetching_brand');
      agentStatus.actions.setIsAgentTyping(true);

      while (themeState.isThemeLoadingRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      agentStatus.actions.setIsAgentTyping(false);
      agentStatus.actions.setStatusMessage(null);
      agentStatus.actions.setStatusPhase(null);
    }

    // Check credits and show appropriate popup if needed
    try {
      const balance = await billingApi.getBalance();
      const remainingCredits = balance.remaining_credits;
      const planName = balance.plan_name || 'free';
      const isPaidPlan = ['starter', 'pro', 'enterprise'].includes(planName.toLowerCase());

      const numSlides = outlineState.outlineFlow?.slides?.length ||
        outlineState.outlineBlock?.slides?.length ||
        collectedData.slideCount ||
        15;
      const requiredCredits = numSlides * 5; // 5 credits per slide

      if (isPaidPlan) {
        // Paid user: proceed regardless of credits
        // Backend will check credits and return INSUFFICIENT_CREDITS error if needed
        // DeckList's CreditWarningDialog will handle the overage confirmation flow
        proceedWithGeneration(slideMode);
      } else {
        // Free user: block only if 0 credits
        if (remainingCredits <= 0) {
          setCreditWarningData({
            remaining: 0,
            required: requiredCredits,
            slideCount: numSlides,
            planName,
            mode: 'free_no_credits',
            pendingSlideMode: slideMode,
          });
          setShowCreditWarning(true);
          setIsProcessing(false);
          return;
        }
        // Free user with credits - proceed (backend locks slides 11+)
        proceedWithGeneration(slideMode);
      }
    } catch (error) {
      console.error('[ConversationalOnboarding] Failed to check credits:', error);
      // On error, proceed anyway - backend will handle it
      proceedWithGeneration(slideMode);
    }
  }, [
    agentStatus.actions,
    collectedData.slideCount,
    outlineState.outlineBlock,
    outlineState.outlineFlow,
    proceedWithGeneration,
    themeState.isThemeLoadingRef,
    themeState.themeBlock,
  ]);

  const handleAction = useCallback((action: string) => {
    if (action === 'interactive' || action === 'static') {
      handleSlideModeSelect(action);
      return;
    }
    handleSendMessage(action);
  }, [handleSendMessage, handleSlideModeSelect]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (handleMentionKeyDown(e)) {
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleMentionKeyDown, handleSendMessage]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPosition = e.target.selectionStart || newValue.length;
    setInput(newValue);
    handleMentionTextChange(newValue, cursorPosition, setInput);
  }, [handleMentionTextChange]);

  const handleMentionSelect = useCallback((integration: IntegrationMention) => {
    selectMention(integration, input, setInput);
  }, [input, selectMention]);

  const handleContinueChat = useCallback(() => {
    setStage('chat');
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleSkipChat = useCallback(() => {
    handleSendMessage('Continue');
  }, [handleSendMessage]);

  const handleClarificationConfirm = useCallback((text: string) => {
    if (!text.trim()) return;
    forceOutlineAfterClarificationRef.current = true;
    const needsBrandConfirmation = Boolean(outlineState.outlineFlow?.stylePreferences?.needsBrandDomainConfirmation);
    if (needsBrandConfirmation) {
      const domain = extractDomainFromText(text);
      if (domain && outlineState.outlineFlow) {
        const nextOutline = {
          ...outlineState.outlineFlow,
          stylePreferences: {
            ...(outlineState.outlineFlow.stylePreferences || {}),
            brandDomain: domain,
            brandDomainCandidates: [domain],
            needsBrandDomainConfirmation: false,
          },
        };
        outlineState.setOutlineFlow(nextOutline);
        themeState.initializeThemeFromOutline(nextOutline);
      }
    }
    const fileImagePreference = fileImagePromptedRef.current
      ? parseFileImagePreference(text)
      : null;
    if (fileImagePreference !== null) {
      applyFileImagePreference(fileImagePreference);
      fileImagePromptedRef.current = false;
    }
    handleSendMessage(text);
  }, [applyFileImagePreference, handleSendMessage, outlineState, parseFileImagePreference, themeState]);

  const handleClarificationEdit = useCallback((text: string) => {
    setInput(text);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [setInput]);

  const handleVoiceTranscript = useCallback((text: string) => {
    setInput((prev) => (prev.trim() ? `${prev} ${text}` : text));
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    if (initialMessage) {
      handleSendMessage(initialMessage);
      return;
    }
    const timer = setTimeout(() => {
      chatMessages.addAgentMessage('What would you like to create a presentation about?');
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generationStatus = useMemo(() => {
    // Brand confirmation is optional - colors are already loaded, so don't block generation
    // User can still confirm domain to refine brand, but it's not required
    const needsBrandConfirmation = Boolean(
      outlineState.outlineFlow?.stylePreferences?.needsBrandDomainConfirmation ||
      themeState.themeBlock?.branding?.needsBrandDomainConfirmation
    );
    const needsFileImageChoice = needsFileImageConfirmation;
    const hasOutline = Boolean(
      outlineState.outlineFlow?.slides?.length ||
      outlineState.outlineBlock?.slides?.length ||
      outlineState.outlineFlow?.slide_count
    );
    // Don't block on brand confirmation - it's optional since colors are already showing
    const canGenerate = hasOutline && !needsFileImageChoice;
    const outlineBlocking = !hasOutline && isOutlinePrefetching;
    const isBlocking = Boolean(
      isProcessing ||
      outlineBlocking ||
      themeState.isThemeLoading ||
      agentStatus.state.isAgentTyping
    );
    const blockingLabel = outlineBlocking
      ? 'Generating your outline...'
      : themeState.isThemeLoading
        ? (themeState.themeBlock?.loadingMessage || 'Generating theme...')
        : 'Preparing your deck...';
    const lockedLabel = needsFileImageChoice
      ? 'Choose whether to use uploaded images to unlock generation.'
      : 'Keep chatting to finalize the outline.';

    return {
      canGenerate,
      hasOutline,
      needsBrandConfirmation,
      needsFileImageConfirmation: needsFileImageChoice,
      isBlocking,
      blockingLabel,
      lockedLabel,
    };
  }, [
    agentStatus.state.isAgentTyping,
    isOutlinePrefetching,
    isProcessing,
    needsFileImageConfirmation,
    outlineState.outlineBlock,
    outlineState.outlineFlow,
    themeState.isThemeLoading,
    themeState.themeBlock,
  ]);

  return {
    state: {
      input,
      stage,
      isProcessing,
      isOutlinePrefetching,
      messages: chatMessages.messages,
      isAgentTyping: agentStatus.state.isAgentTyping,
      thinkingSteps: agentStatus.state.thinkingSteps,
      streamingText: agentStatus.state.streamingText,
      statusMessage: agentStatus.state.statusMessage,
      statusPhase: agentStatus.state.statusPhase,
      outlineBlock: outlineState.outlineBlock,
      themeBlock: themeState.themeBlock,
      isThemeLoading: themeState.isThemeLoading,
      uploadedFiles: fileUploads.uploadedFiles,
      isDraggingOver: fileUploads.isDraggingOver,
      showCreditWarning,
      creditWarningData,
      mentionState,
      selectedMentions,
      generationStatus,
    },
    refs: {
      inputRef,
      fileInputRef: fileUploads.fileInputRef,
      messagesEndRef,
      scrollContainerRef,
    },
    handlers: {
      handleInputChange,
      handleKeyPress,
      handleSendMessage,
      handleAction,
      handleSlideModeSelect,
      handleContinueChat,
      handleSkipChat,
      handleClarificationConfirm,
      handleClarificationEdit,
      handleVoiceTranscript,
      handleFileUpload: fileUploads.handleFileUpload,
      handleRemoveFile: fileUploads.handleRemoveFile,
      handleDragOver: fileUploads.handleDragOver,
      handleDragLeave: fileUploads.handleDragLeave,
      handleDrop: fileUploads.handleDrop,
      handleSlideEdit: outlineState.handleSlideEdit,
      handleSlideAdd: outlineState.handleSlideAdd,
      handleSlideDelete: outlineState.handleSlideDelete,
      handleSlideReorder: outlineState.handleSlideReorder,
      handleLoadContent: slideContentLoader,
      handleThemeColorChange: themeState.handleThemeColorChange,
      handleThemeFontChange: themeState.handleThemeFontChange,
      handleThemeLogoChange: themeState.handleLogoChange,
      handleBrandNameChange: themeState.handleBrandNameChange,
      handleMentionSelect,
      closeMentionPopover,
      removeMention,
      closeCreditWarning: () => {
        setShowCreditWarning(false);
        setCreditWarningData(null);
      },
      confirmCreditWarning: () => {
        if (creditWarningData?.pendingSlideMode) {
          proceedWithGeneration(creditWarningData.pendingSlideMode);
        }
        setShowCreditWarning(false);
        setCreditWarningData(null);
      },
      openFileDialog: () => fileUploads.fileInputRef.current?.click(),
    },
  };
};
