import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Sparkles, XCircle, Plus, Image as ImageIcon, ChevronUp, ChevronDown, ChevronRight, Loader2, FileText, Table, Presentation, File, History } from 'lucide-react';
import { VoiceRecorder } from '@/components/voice/VoiceRecorder';
import ChatMessage, { ChatMessageProps, FeedbackType } from './ChatMessage';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDeckStore } from '../stores/deckStore';
import { useNavigation } from '@/context/NavigationContext';
import { useOutlineAgent as useOutlineAgentHook } from '@/hooks/useOutlineAgent';
import { IconButton } from './ui/IconButton';
import { DeckDiff, ChatMessage as ChatMessageType } from '@/utils/apiUtils';
import { saveFeedback } from '@/utils/feedbackService';
import { COLORS } from '@/utils/colors';
import { getOverlappingComponentIds, getComponentBounds } from '@/utils/overlapDetection';
import AgentChatClient from '@/services/agentChat';
import { applyDeckDiffPure, isValidDeckDiff } from '@/utils/deckDiffUtils';
import { supabase } from '@/integrations/supabase/client';
import { uploadFile } from '@/utils/fileUploadUtils';
import { deckSyncService } from '@/lib/deckSyncService';
import { useEditor } from '@/hooks/useEditor';
import { useEditorStore } from '@/stores/editorStore';
import { useThemeStore } from '@/stores/themeStore';
import { API_CONFIG } from '@/config/environment';
import type { SlideData } from '@/types/SlideTypes';
import { v4 as uuidv4 } from 'uuid';
import { BROWSER } from '@/utils/browser';
import { streamOutlineAgentChat } from '@/services/outlineApi';
import {
  getFileCategory,
  formatFileSize,
  createImagePreview,
  revokeImagePreview,
  fileToBase64,
  chatWithFiles,
  FileInput
} from '@/services/fileAnalysisService';
// Shared chat utilities and types
import {
  ExtendedChatMessageProps,
  ChatPanelProps,
  ALL_SUGGESTIONS,
  DEFAULT_SUGGESTION,
  OUTLINE_SUGGESTIONS,
  sampleArray,
  convertMessagesToApiFormat,
  getWelcomeMessage,
} from './chat';
import { sendChatToApi } from '@/components/chat/utils/messageUtils';
import { captureTinySlideScreenshot, shouldCaptureScreenshotForEdit } from '@/utils/slideScreenshot';
// SlideSnapshotThumbnail is now rendered inside ChatMessage component

// Integration mentions
import { useIntegrationMentions } from '@/hooks/useIntegrationMentions';
import { IntegrationMentionPopover, IntegrationMentionBubble } from '@/components/chat';

// Re-export types for consumers of this file
export type { ExtendedChatMessageProps, ChatPanelProps };

/**
 * ChatPanel component that provides the AI-driven interface
 */
const ChatPanel: React.FC<ChatPanelProps> = ({
  onCollapseChange,
  opacity = 1,
  newSystemMessage,
  outline,
  deckId,
  isExistingDeck = false,
  outlineMode = false,
  useOutlineAgent = false,
  initialPromptFromURL,
  onInitialPromptProcessed,
  onOutlineAgentToolCall,
  onOutlineAgentEdit,
  onOutlineUpdate,
  onOutlineGenerate,
  onOutlineRefine,
  outlineMessages,
  outlineIsGenerating = false,
  outlineCurrentSlideIndex = 0,
  onOutlineChatGeneratingChange,
  initialConversationalData
}) => {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<{ label: string; prompt: string }[]>([]);

  // Integration @ mentions hook
  const {
    mentionState,
    selectedMentions,
    handleTextChange: handleMentionTextChange,
    handleKeyDown: handleMentionKeyDown,
    selectMention,
    closeMentionPopover,
    removeMention,
    clearMentions,
    extractMentionsFromText,
  } = useIntegrationMentions();

  // Integration command palette state - disabled until integrations are set up
  // const [showIntegrationPalette, setShowIntegrationPalette] = useState(false);
  // const [showIntegrationsDialog, setShowIntegrationsDialog] = useState(false);
  // const [selectedIntegration, setSelectedIntegration] = useState<{ id: string; action: string } | null>(null);

  // Initialize messages based on mode
  const getInitialMessages = (): ExtendedChatMessageProps[] => {
    // If outline has stylePreferences, show what the user submitted
    if (outlineMode && useOutlineAgent && outline?.stylePreferences) {
      const prefs = outline.stylePreferences;
      const messageLines = [];

      if (prefs.initialIdea) {
        messageLines.push(`**Topic:** ${prefs.initialIdea}`);
      }

      if (prefs.vibeContext) {
        messageLines.push(`**Style:** ${prefs.vibeContext}`);
      }

      // Add toggles if available
      const toggles = [];
      if (prefs.autoSelectImages) toggles.push('Auto-select images');
      if (toggles.length > 0) {
        messageLines.push(`**Options:** ${toggles.join(', ')}`);
      }

      if (messageLines.length > 0) {
        return [{
          id: 'initial-prompt',
          type: 'user',
          message: messageLines.join('\n'),
          timestamp: new Date(),
          feedback: null
        }];
      }
    }

    // If using outline agent, don't show any initial messages (agent hook handles it)
    if (outlineMode && useOutlineAgent) {
      return [];
    }

    // Use provided outline messages
    if (outlineMode && outlineMessages && outlineMessages.length > 0) {
      return outlineMessages;
    }

    // For slide editing mode, don't show welcome message until deck loads (handled by effect)
    // This prevents the typewriter animation from competing with deck loading
    return [];
  };

  const [messages, setMessages] = useState<ExtendedChatMessageProps[]>(getInitialMessages());

  // Track if welcome message has been shown
  const welcomeMessageShownRef = useRef(false);

  // Track if generation actually started in this session (prevents showing completion for existing decks)
  const generationStartedInSessionRef = useRef(false);

  // Track pending messages by ID for parallel processing (replaces single isLoading boolean)
  // Using ref + forceUpdate pattern to avoid closure issues with state batching
  const pendingMessageIdsRef = useRef<Set<string>>(new Set());
  const [, forceUpdate] = useState(0);
  const isLoading = pendingMessageIdsRef.current.size > 0; // Backwards compatibility for UI elements

  // Helper functions for pending message tracking (closure-safe)
  const addPendingMessage = useCallback((msgId: string) => {
    pendingMessageIdsRef.current.add(msgId);
    forceUpdate(n => n + 1);
  }, []);

  const removePendingMessage = useCallback((msgId: string) => {
    pendingMessageIdsRef.current.delete(msgId);
    forceUpdate(n => n + 1);
  }, []);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  // Old chat history - hidden by default, shown when user clicks "Load older messages"
  const [oldMessages, setOldMessages] = useState<ExtendedChatMessageProps[]>([]);
  const [showOldMessages, setShowOldMessages] = useState(false);
  const hasOldMessages = oldMessages.length > 0;
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const [outlineSlideTarget, setOutlineSlideTarget] = useState<number | 'all'>('all');

  // Selected LinkedIn profile for follow-up context
  const [selectedLinkedInProfile, setSelectedLinkedInProfile] = useState<{
    id: string;
    name: string;
    title?: string;
    company?: string;
    linkedin_url?: string;
    photo_url?: string;
  } | null>(null);

  // Ref to store selected profile for continuation (avoids race condition with state)
  const selectedProfileForContinuationRef = useRef<any>(null);

  // Ref to track the original request that triggered LinkedIn lookup (for multi-person sequential handling)
  const originalLinkedInRequestRef = useRef<string | null>(null);

  // Handler for selecting a LinkedIn profile from search results
  // Auto-continues with the task instead of asking user what to do next
  const handleSelectLinkedInProfile = useCallback((profile: any) => {
    const newProfile = {
      id: profile.id || profile.name,
      name: profile.name,
      title: profile.title,
      company: profile.company,
      linkedin_url: profile.linkedin_url,
      photo_url: profile.photo_url,
    };

    // Store in ref immediately (no race condition)
    selectedProfileForContinuationRef.current = newProfile;
    setSelectedLinkedInProfile(newProfile);

    // Build continuation message
    // If we have an original request with more @linkedin mentions, include it
    const profileDesc = `${newProfile.name}${newProfile.company ? ` from ${newProfile.company}` : ''}`;
    const originalRequest = originalLinkedInRequestRef.current;

    // Check if original request has more @linkedin mentions that weren't for this person
    let continuationMsg = `Use the selected profile (${profileDesc}) for the slide`;
    if (originalRequest) {
      // Count @linkedin mentions in original request
      const linkedinMentions = (originalRequest.match(/@linkedin/gi) || []).length;
      if (linkedinMentions > 1) {
        // Include original request so agent knows about remaining people
        continuationMsg = `I selected ${profileDesc}. Continue with the original request: "${originalRequest}"`;
      }
    }

    setInput(continuationMsg);
  }, []);

  // Handler for skipping LinkedIn profile selection
  const handleSkipLinkedInSelection = useCallback(() => {
    selectedProfileForContinuationRef.current = null;
    setSelectedLinkedInProfile(null);

    // If we have an original request with more @linkedin mentions, include it so we continue with remaining people
    const originalRequest = originalLinkedInRequestRef.current;
    let skipMsg = 'Skip the profile lookup and continue without adding profile info';

    if (originalRequest) {
      const linkedinMentions = (originalRequest.match(/@linkedin/gi) || []).length;
      if (linkedinMentions > 1) {
        skipMsg = `Skip this profile. Continue with the original request: "${originalRequest}"`;
      }
    }

    setInput(skipMsg);
  }, []);

  // Ref to hold sendMessage function for continuation trigger
  const sendMessageRef = useRef<(() => void) | null>(null);

  // Effect to auto-send when input changes from profile selection/skip
  useEffect(() => {
    // Only auto-send for our specific continuation messages
    // Include new messages for multi-person handling ("I selected...", "Skip this profile...")
    if (
      input.startsWith('Use the selected profile') ||
      input.startsWith('Skip the profile lookup') ||
      input.startsWith('I selected ') ||
      input.startsWith('Skip this profile')
    ) {
      // Trigger send after a microtask to ensure state is settled
      setTimeout(() => {
        sendMessageRef.current?.();
      }, 50);
    }
  }, [input]);

  // Get deck data for slide dropdown in outline mode
  const deckData = useDeckStore(state => state.deckData);

  // Add welcome message after deck finishes loading (prevents animation competing with render)
  // Use slides length as dependency to avoid re-renders on every slides array reference change
  const slideCount = deckData?.slides?.length ?? 0;
  useEffect(() => {
    // Only for slide editing mode (not outline mode)
    if (outlineMode || useOutlineAgent) return;

    // Only show once and only after deck loads
    if (slideCount > 0 && !welcomeMessageShownRef.current) {
      welcomeMessageShownRef.current = true;
      // Small delay to let the UI settle after deck render
      const timer = setTimeout(() => {
        setMessages(prev => {
          // Don't add if already has messages (e.g., from chat history)
          if (prev.length > 0) return prev;
          return [{
            id: 'welcome-message',
            type: 'ai',
            message: getWelcomeMessage(false, isExistingDeck),
            timestamp: new Date(),
            feedback: null
          }];
        });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [slideCount, outlineMode, useOutlineAgent, isExistingDeck]);

  // Outline agent for conversational outline generation (only when enabled)
  const outlineAgentData = useOutlineAgentHook();
  const outlineAgent = (outlineMode && useOutlineAgent) ? outlineAgentData : null;

  // Handle initial conversational data from onboarding
  const hasProcessedConversationalDataRef = useRef(false);
  useEffect(() => {
    if (
      initialConversationalData &&
      !hasProcessedConversationalDataRef.current &&
      onOutlineAgentToolCall
      // Remove outlineAgent requirement - we're calling the API directly now
    ) {
      hasProcessedConversationalDataRef.current = true;

      // If we already have slides (e.g. from a narrative flow that generated them), use them directly
      if (initialConversationalData.slides && initialConversationalData.slides.length > 0) {

        onOutlineAgentToolCall({
          topic: initialConversationalData.topic,
          slide_count: initialConversationalData.slideCount,
          detail_level: initialConversationalData.detailLevel || 'standard',
          slides: initialConversationalData.slides,
          narrative: initialConversationalData.narrative
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

        // CRITICAL: Trigger theme generation for pre-generated slides!
        // Without this, theme is never generated when using conversational onboarding
        const themeChanges = initialConversationalData.themeChanges;
        (async () => {
          try {
            const { outlineApi } = await import('@/services/outlineApi');

            // If conversation already found colors (from search), use them in stylePreferences
            const searchedColors = themeChanges?.colors || themeChanges?.palette || themeChanges?.color_palette;
            const searchedFont = themeChanges?.font || themeChanges?.typography?.heading?.fontFamily;

            // Build minimal outline for theme generation
            const outlineForTheme = {
              id: deckId || `temp-${Date.now()}`,
              title: initialConversationalData.topic || 'Presentation',
              slides: initialConversationalData.slides.map((s: any, i: number) => ({
                id: `slide-${i}`,
                title: s.title,
                content: s.content || s.key_points?.join('\n') || ''
              })),
              stylePreferences: {
                initialIdea: initialConversationalData.topic,
                vibeContext: initialConversationalData.stylePreferences,
                // Pass any colors found during conversation search - these take priority!
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

            // Dispatch theme_loading event so UI shows loading state
            window.dispatchEvent(new CustomEvent('theme_preview_update', {
              detail: { type: 'theme_loading', message: 'Generating theme...' }
            }));

            await outlineApi.generateThemeFromOutline(outlineForTheme as any, deckId, (evt) => {
              // Relay theme events to the UI
              window.dispatchEvent(new CustomEvent('theme_preview_update', { detail: evt }));
            });
          } catch (err) {
            console.error('[ChatPanel] Theme generation failed:', err);
          }
        })();

        // Clear loading state since we're using pre-generated slides
        if (onOutlineChatGeneratingChange) {
          onOutlineChatGeneratingChange(false);
        }
      } else {
        // No slides yet - we need to generate using the REAL streaming endpoint with Perplexity
        // Construct a prompt from the collected data
        let topic = initialConversationalData.topic;
        const slideCount = initialConversationalData.slideCount;
        const detailLevel = initialConversationalData.detailLevel || 'standard';
        const chatHistory = initialConversationalData.chatHistory;
        const themeChanges = initialConversationalData.themeChanges;
        const uploadedFilesFromConversation = initialConversationalData.uploadedFiles || [];
        const uploadedMediaFromAgent = initialConversationalData.uploadedMedia || [];


        // If no topic, try to extract from chat history (user's first message)
        if (!topic && chatHistory && chatHistory.length > 0) {
          const firstUserMessage = chatHistory.find((msg: any) => msg.role === 'user');
          if (firstUserMessage?.content) {
            topic = firstUserMessage.content;
          }
        }

        // Only create a prompt if we have a valid topic
        let prompt = topic ? `Create a presentation about ${topic}.` : '';
        if (slideCount) {
          prompt += ` It should have approximately ${slideCount} slides.`;
        }

        // If no valid prompt, don't proceed with generation
        if (!prompt.trim()) {
          console.warn('[ChatPanel] No valid topic provided, skipping generation');
          // CRITICAL: Clear loading state to prevent frozen UI
          if (onOutlineChatGeneratingChange) {
            onOutlineChatGeneratingChange(false);
          }
          return;
        }

        // Build style context from chat history if available
        let styleContext = '';
        if (chatHistory && chatHistory.length > 0) {
          const historyText = chatHistory.map((msg: any) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n');
          styleContext = `Context from conversation:\n${historyText}`;
        }

        // Add user message to chat (show the simple prompt to keep UI clean, but indicate context usage)
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

        // Call the REAL streaming outline endpoint
        (async () => {
          try {
            const { outlineApi } = await import('@/services/outlineApi');

            // Notify parent that generation is starting
            if (onOutlineChatGeneratingChange) {
              onOutlineChatGeneratingChange(true);
            }


            // Start streaming generation (API expects raw File objects, it handles base64 conversion)
            const outline = await outlineApi.generateOutlineStream(
              prompt,
              uploadedFilesFromConversation,
              {
                detailLevel: detailLevel,
                slideCount: slideCount,
                styleContext: styleContext,
                enableResearch: true, // Always enable research for conversational mode
                autoSelectImages: true, // Default to true - auto-populate images
                uploadedMedia: uploadedMediaFromAgent // Pre-processed media from agent
              },
              (event: any) => {

                // Handle error events from backend
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

                  // Clear loading state on error
                  if (onOutlineChatGeneratingChange) {
                    onOutlineChatGeneratingChange(false);
                  }
                  return;
                }

                // Forward events to parent for display
                if (event.type === 'outline_structure') {
                  // Emit initial structure with placeholder slides
                  const placeholderSlides = (event.slideTitles || []).map((title: string, idx: number) => ({
                    id: `placeholder-${idx}`,
                    title: title,
                    content: '', // Empty for now
                    deepResearch: false,
                    status: 'pending'
                  }));
                  
                  onOutlineAgentToolCall({
                    topic: event.title,
                    slide_count: event.slideCount,
                    detail_level: detailLevel,
                    slides: placeholderSlides // Pre-populate with placeholders
                  });
                } else if (event.type === 'slide_complete' && event.slide) {
                  // Stream individual slides as they complete
                  
                  onOutlineAgentToolCall({
                    topic: topic,
                    slide_count: slideCount,
                    detail_level: detailLevel,
                    slides: [event.slide], // Single slide update
                    slideIndex: event.slideIndex // Index to merge at
                  });
                } else if (event.type === 'outline_complete') {
                  // Slides were already streamed, but we need to pass stylePreferences from outline_complete!
                  // This is where the backend sends the theme colors (e.g., Pikachu yellow)
                  
                  // CRITICAL: Pass stylePreferences to DeckList so theme colors are applied!
                  if (event.outline?.stylePreferences && onOutlineAgentToolCall) {
                    onOutlineAgentToolCall({
                      topic: event.outline.title || topic,
                      slide_count: event.outline.slides?.length || slideCount,
                      detail_level: detailLevel,
                      slides: [], // Don't re-pass slides, just the stylePreferences
                      stylePreferences: event.outline.stylePreferences // 🎨 PASS THE THEME COLORS AND FONT!
                    });
                  }
                  
                  if (onOutlineChatGeneratingChange) {
                    onOutlineChatGeneratingChange(false);
                  }
                }
              }
            );
            
            
            // Ensure loading state is cleared
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
            
            // Clear loading state on error
            if (onOutlineChatGeneratingChange) {
              onOutlineChatGeneratingChange(false);
            }
          }
        })();
      }
    }
  }, [initialConversationalData, onOutlineAgentToolCall, onOutlineChatGeneratingChange]);

  // Auto-send initial prompt from URL when in outline agent mode
  const hasProcessedInitialPromptRef = useRef(false);
  useEffect(() => {
    if (
      initialPromptFromURL &&
      outlineAgent &&
      !hasProcessedInitialPromptRef.current &&
      !outlineAgent.isProcessing
    ) {
      hasProcessedInitialPromptRef.current = true;

      // Use the clean prompt - no need to add preferences to the agent message
      const cleanPrompt = initialPromptFromURL.prompt;

      // Send the message through the outline agent
      setTimeout(async () => {
        // Add user message to chat with full details
        const userMessageId = `user-${Date.now()}`;

        // Build detailed message showing all inputs
        const messageLines = [`**Topic:** ${initialPromptFromURL.prompt}`];

        // Add toggle values
        const toggles = [];
        if (initialPromptFromURL.autoImages) toggles.push('Auto-select images');
        if (initialPromptFromURL.autoSlides) toggles.push('Auto-generate slides');
        if (initialPromptFromURL.presentationMode) toggles.push('Presentation mode');

        if (toggles.length > 0) {
          messageLines.push(`**Options:** ${toggles.join(', ')}`);
        }

        const detailedMessage = messageLines.join('\n');

        setMessages(prev => [
          ...prev,
          {
            id: userMessageId,
            type: 'user',
            message: detailedMessage,
            timestamp: new Date(),
            feedback: null
          }
        ]);

        // Prepare outline context if available
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

        // Send message through outline agent
        await outlineAgent.sendMessage(
          cleanPrompt,
          (outlineData) => {
            // Agent generated/updated outline

            if (outlineData.action === 'update_outline' && outline && onOutlineUpdate) {
              const updatedSlides = outlineData.slides.map((slide, index) => ({
                ...outline.slides[index],
                title: slide.title || outline.slides[index]?.title || '',
                subtitle: slide.subtitle || outline.slides[index]?.subtitle || '',
                content: slide.key_points && slide.key_points.length > 0
                  ? slide.key_points.join('\n')
                  : outline.slides[index]?.content || ''
              }));
              onOutlineUpdate({ ...outline, slides: updatedSlides });
            } else if (outlineData.action === 'generate_outline' && onOutlineAgentToolCall) {
              // Trigger outline generation - the generation process will create the full outline
              onOutlineAgentToolCall({
                topic: outlineData.topic || initialPromptFromURL.prompt,
                slide_count: outlineData.slide_count,
                detail_level: outlineData.detail_level || 'standard',
              });
            }
          },
          context
        );
      }, 500);

      // Notify parent that we processed the initial prompt
      if (onInitialPromptProcessed) {
        onInitialPromptProcessed();
      }
    }
  }, [initialPromptFromURL, outlineAgent, onInitialPromptProcessed, outline, onOutlineUpdate, onOutlineAgentToolCall]);

  const [selectedElements, setSelectedElements] = useState<Array<{
    elementId: string;
    elementType?: string | null;
    slideId?: string | null;
    label: string;
    overlaps: string[];
    bounds?: { x: number; y: number; width: number; height: number } | null;
  }>>([]);
  type PendingAttachment = { name: string; type: string; size: number; file: File; previewUrl?: string };
  type RegisteredAttachment = { name: string; mimeType: string; size: number; url: string; attachmentId?: string; previewUrl?: string };
  const [attachments, setAttachments] = useState<Array<PendingAttachment | RegisteredAttachment>>([]);
  // Ref to mirror attachments state - ensures sendMessage always gets latest value
  const attachmentsRef = useRef<Array<PendingAttachment | RegisteredAttachment>>([]);
  // Keep ref in sync with state
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);
  const [filePreviewUrls, setFilePreviewUrls] = useState<Map<string, string>>(new Map());
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  // File intent is inferred by the model from chat + selection + file metadata (no confirmation UI).
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounterRef = useRef<number>(0);
  const isUploadingRef = useRef<boolean>(false);
  const agentClientRef = useRef<AgentChatClient | null>(null);
  const streamingAiMsgIdRef = useRef<string | null>(null);
  const [agentSessionId, setAgentSessionId] = useState<string | null>(null);
  const sessionSlideIdRef = useRef<string | null>(null);
  const connectingRef = useRef<Promise<boolean> | null>(null);
  const planMsgIdRef = useRef<string | null>(null);
  const planCreatedAtRef = useRef<number | null>(null);
  const planTimersRef = useRef<number[]>([]);
  const agentProgressMsgIdRef = useRef<string | null>(null);
  const agentFlowLockoutUntilRef = useRef<number>(0);
  const proposedDiffsRef = useRef<Map<string, any>>(new Map());
  const pendingDiffsByMessageIdRef = useRef<Map<string, DeckDiff>>(new Map());
  const pendingSlidesByMessageIdRef = useRef<Map<string, any[]>>(new Map());
  const toolDedupRef = useRef<Map<string, number>>(new Map());
  const TOOL_DEDUP_WINDOW_MS = 2500;
  // Track processed edit events to prevent duplicate handling from multiple subscriptions
  const processedEditEventsRef = useRef<Set<string>>(new Set());
  const styleToolStateRef = useRef<{ active: boolean; name: string; lastStartTs: number; lastFinishTs: number }>({ active: false, name: '', lastStartTs: 0, lastFinishTs: 0 });

  // Access slide editor edit mode to coordinate mutual exclusivity
  const { isEditing: isSlideEditing, setIsEditing: setSlideEditing } = useEditor();

  // ---- Helpers (component scope) ----
  const clearPlanTimers = useCallback(() => {
    try {
      planTimersRef.current.forEach((id) => clearTimeout(id));
    } catch { }
    planTimersRef.current = [];
  }, []);

  const animatePlanMessage = useCallback((steps: string[]) => {
    if (!steps || steps.length === 0) return;
    clearPlanTimers();
    const now = Date.now();
    const createNew = !planMsgIdRef.current || (planCreatedAtRef.current !== null && (now - planCreatedAtRef.current) > 2000);
    if (createNew) {
      const id = `plan-${now}`;
      planMsgIdRef.current = id;
      planCreatedAtRef.current = now;
      // Start with the first step and progressively accumulate - full display (no compactRow)
      setMessages(prev => [...prev, { id, type: 'system', message: 'Planning', timestamp: new Date(), feedback: null, metadata: { type: 'agent_plan', steps: [steps[0]] } }]);
    } else {
      const id = planMsgIdRef.current!;
      // Preserve any already shown steps; if none, seed with the first incoming step
      setMessages(prev => prev.map(m => {
        if (m.id !== id) return m;
        const existingSteps = Array.isArray(m.metadata?.steps) ? m.metadata.steps as string[] : [];
        const nextSteps = existingSteps.length > 0 ? existingSteps : [steps[0]];
        return { ...m, message: 'Planning', metadata: { ...m.metadata, type: 'agent_plan', steps: nextSteps } };
      }));
    }
    for (let i = 1; i < steps.length; i++) {
      const timeoutId = window.setTimeout(() => {
        const mid = planMsgIdRef.current;
        if (!mid) return;
        // Accumulate steps up to the current index so the full plan is visible
        setMessages(prev => prev.map(m => m.id === mid ? { ...m, metadata: { ...m.metadata, steps: steps.slice(0, i + 1) } } : m));
      }, i * 1500);
      planTimersRef.current.push(timeoutId);
    }
  }, [clearPlanTimers, setMessages]);

  // Convert raw selection labels (which may include UUIDs) into friendly names
  const formatSelectionLabel = useCallback((rawLabel: string): string => {
    try {
      const label = String(rawLabel || '').trim();
      if (!label) return 'selection';

      const deckData = (useDeckStore as any).getState().deckData;
      const rawSlides = Array.isArray(deckData?.slides) ? deckData.slides : [];
      // CRITICAL: Sort slides by order field to match visual display order
      const slidesArr = [...rawSlides].sort((a: any, b: any) => (a?.order ?? 0) - (b?.order ?? 0));

      // Helper to format slide label
      const formatSlide = (slideIndex: number) => {
        const s = slidesArr[slideIndex];
        const slideNumber = slideIndex + 1;
        const hasTitle = typeof s?.title === 'string' && s.title.trim().length > 0;
        return hasTitle ? `Slide ${slideNumber} — ${s.title.trim()}` : `Slide ${slideNumber}`;
      };

      // First: Check for slide-N pattern IDs (e.g., "slide-18")
      // Use word boundary to avoid "slide-1" matching "slide-18"
      const slideIdMatch = label.match(/\bslide-(\d+)\b/i);
      if (slideIdMatch) {
        const slideId = slideIdMatch[0].toLowerCase();
        const slideIndex = slidesArr.findIndex((s: any) => s?.id?.toLowerCase() === slideId);
        if (slideIndex >= 0) {
          return formatSlide(slideIndex);
        }
      }

      // Second: Check for UUID patterns
      const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig;
      const matches = label.match(uuidRegex) || [];

      // If any UUID corresponds to a slide, prefer that and show Slide N — Title
      for (const id of matches) {
        const slideIndex = slidesArr.findIndex((s: any) => s?.id === id);
        if (slideIndex >= 0) {
          return formatSlide(slideIndex);
        }
      }

      // Third: try to resolve component UUID to a friendly type on a slide
      for (const id of matches) {
        let found: any = null;
        let slideIndex = -1;
        for (let i = 0; i < slidesArr.length; i++) {
          const comps = Array.isArray(slidesArr[i]?.components) ? slidesArr[i].components : [];
          const comp = comps.find((c: any) => c?.id === id);
          if (comp) { found = comp; slideIndex = i; break; }
        }
        if (found) {
          const typeMap: Record<string, string> = {
            TiptapTextBlock: 'Text',
            TextBlock: 'Text',
            Shape: 'Shape',
            ShapeWithText: 'Shape',
            Image: 'Image',
            Logo: 'Logo',
            Icon: 'Icon',
            Chart: 'Chart',
            Table: 'Table',
            Video: 'Video',
          };
          const typeName = typeMap[found.type] || found.type || 'Element';
          return `${typeName} on ${formatSlide(slideIndex)}`;
        }
      }

      // Fourth: Check for exact slide ID match (with word boundaries to avoid substring issues)
      for (let i = 0; i < slidesArr.length; i++) {
        const s = slidesArr[i];
        if (s?.id) {
          // Use word boundary regex to avoid "slide-1" matching "slide-18"
          const idRegex = new RegExp(`\\b${s.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          if (idRegex.test(label)) {
            return formatSlide(i);
          }
        }
      }

      // Finally: strip UUIDs and cleanup if nothing matched
      const cleaned = label
        .replace(uuidRegex, '')
        .replace(/\s*@\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleaned.length > 0 && cleaned.length <= 100) return cleaned;
      return 'selection';
    } catch {
      return 'selection';
    }
  }, []);

  const appendSelectionRow = useCallback((label: string) => {
    const now = Date.now();
    const friendly = formatSelectionLabel(label);
    setMessages(prev => [...prev, {
      id: `sel-${now}-${Math.random().toString(36).slice(2, 6)}`, type: 'system', message: `Using selection: ${friendly}`,
      timestamp: new Date(), feedback: null, metadata: { type: 'agent_selection', compactRow: true }
    }]);
  }, [formatSelectionLabel]);

  // Sanitize agent text to replace raw IDs in phrases like "Using selection: ..."
  const humanizeSystemPhrases = useCallback((inputText: string): string => {
    try {
      const text = String(inputText ?? '');
      if (!text) return text;
      // Replace occurrences in a streaming-safe way
      return text.replace(/Using selection:\s*([^\n]+)/g, (_m, raw) => {
        const friendly = formatSelectionLabel(String(raw || ''));
        return `Using selection: ${friendly}`;
      });
    } catch {
      return String(inputText ?? '');
    }
  }, [formatSelectionLabel]);

  // Friendly action-oriented tool name variations for display
  const funToolNames: Record<string, string[]> = useMemo(() => ({
    'custom_component_str_replace': [
      'Making a quick tweak',
      'Sprucing up the content',
      'Polishing the details',
      'Touching things up',
    ],
    'custom_component_rewrite': [
      'Giving it a fresh look',
      'Reworking the design',
      'Shaking things up',
      'Breathing new life into it',
    ],
    'apply_theme_to_custom_components': [
      'Spreading the style love',
      'Making everything match',
      'Syncing up the styles',
      'Painting with your palette',
    ],
    'apply_theme': [
      'Setting the mood',
      'Dressing things up',
      'Adding some flair',
      'Styling it out',
    ],
    'edit_slide': [
      'Working on your slide',
      'Giving it some attention',
      'Spicing things up',
      'Making it shine',
    ],
    'create_slide': [
      'Crafting a new slide',
      'Spinning up fresh content',
      'Building something new',
      'Whipping up a slide',
    ],
    'delete_slide': [
      'Tidying up the deck',
      'Clearing that out',
      'Making some room',
    ],
    'search_images': [
      'Hunting for the perfect image',
      'Scouting some visuals',
      'Finding you something nice',
      'Browsing the gallery',
    ],
    'edit_image_with_ai': [
      'Working some AI magic',
      'Transforming your image',
      'Giving the image a makeover',
      'Letting AI do its thing',
    ],
    'replace_image': [
      'Swapping in a new image',
      'Freshening up the visuals',
      'Switching things out',
    ],
    'view_component': [
      'Taking a closer look',
      'Scoping out the details',
      'Checking things out',
    ],
    'edit_component': [
      'Fine-tuning the element',
      'Tweaking the details',
      'Making some adjustments',
    ],
    'component_prop_update': [
      'Dialing in the settings',
      'Adjusting the knobs',
      'Fine-tuning things',
    ],
    'duplicate_slide': [
      'Making a copy',
      'Cloning the slide',
      'Doubling up',
    ],
    'reorder_slides': [
      'Shuffling things around',
      'Rearranging the deck',
      'Finding the right order',
    ],
    'create_component': [
      'Adding something new',
      'Dropping in an element',
      'Building a new piece',
    ],
    'delete_component': [
      'Clearing that out',
      'Tidying things up',
      'Making some space',
    ],
  }), []);

  const getFunToolName = useCallback((tool: string): string => {
    const variations = funToolNames[tool];
    if (variations && variations.length > 0) {
      return variations[Math.floor(Math.random() * variations.length)];
    }
    // Fallback: format nicely
    return tool.replace(/_/g, ' ').replace(/\./g, ' › ');
  }, [funToolNames]);

  const appendToolRow = useCallback((tool: string, status: string) => {
    const now = Date.now();
    if (now < agentFlowLockoutUntilRef.current) return;
    const key = `${status}:${tool}`;
    const last = toolDedupRef.current.get(key) || 0;
    if (now - last < TOOL_DEDUP_WINDOW_MS) return;
    toolDedupRef.current.set(key, now);
    toolDedupRef.current.forEach((t, k) => { if (now - t > TOOL_DEDUP_WINDOW_MS * 3) toolDedupRef.current.delete(k); });

    // Show tool calls for transparency - helps users understand what the agent is doing
    if (status === 'start' && tool) {
      // Get fun tool name with random variation
      const funName = getFunToolName(tool);
      setMessages(prev => [...prev, {
        id: `tool-${now}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'system',
        message: funName,
        timestamp: new Date(),
        feedback: null,
        metadata: { type: 'agent_tool', tool, status }
      }]);
    }
  }, [getFunToolName]);

  const isStyleTool = useCallback((toolName?: string): boolean => {
    const t = (toolName || '').toLowerCase();
    // Be permissive: match typical style tool names
    return (
      t.includes('style') && (t.includes('slide') || t.includes('deck') || t.includes('theme'))
    ) || t === 'style_slide' || t === 'style_slides' || t === 'apply_style' || t === 'apply_theme';
  }, []);

  const normalizeSlidesPayload = useCallback((payloadSlides: any[]): any[] => {
    if (!Array.isArray(payloadSlides) || payloadSlides.length === 0) return [];
    try {
      return payloadSlides
        .map((entry: any) => {
          if (!entry) return null;
          if (entry.slide && typeof entry.slide === 'object') return entry.slide;
          return typeof entry === 'object' ? entry : null;
        })
        .filter((slide: any) => slide && typeof slide.id === 'string');
    } catch {
      return [];
    }
  }, []);

  // Apply deck diff respecting edit mode
  const applyDeckDiffRespectingEditMode = useCallback((deckDiff: DeckDiff, isEditDiff = false) => {
    if (!deckDiff) {
      return;
    }

    // HARD GUARD: If deck is already completed, do not process any generation diffs
    // BUT: Always allow edit diffs through (component updates from editing agent)
    try {
      const deckData = (useDeckStore as any).getState().deckData;
      const allCompleted = Array.isArray(deckData?.slides) && deckData.slides.length > 0 && deckData.slides.every((s: any) => s.status === 'completed');
      if (allCompleted && !isEditDiff) {
        setIsGenerating(false);
        return;
      }
    } catch (e) {
      // Ignore errors
    }

    const isEditing = typeof window !== 'undefined' && (window as any).__isEditMode === true;

    if (isEditing) {
      // Skip applying diffs while actively interacting (drag/resize)
      try {
        const interacting = (typeof window !== 'undefined') && (
          (window as any).__isDragging === true ||
          (window as any).__isDraggingCharts === true ||
          (window as any).__isResizingCharts === true
        );
        if (interacting) {
          return;
        }
      } catch { }
      // In edit mode: apply to editor drafts
      try {
        const editorStore = useEditorStore.getState();
        const slidesToUpdate = (deckDiff as any).slides_to_update || [];
        const slidesToAdd = (deckDiff as any).slides_to_add || [];
        const slidesToRemove = (deckDiff as any).slides_to_remove || [];

        // Apply component updates to drafts
        slidesToUpdate.forEach((slideDiff: any) => {
          const slideId = slideDiff?.slide_id;
          if (!slideId) return;

          // CRITICAL: Always process removals first, even if slide has local changes
          // Removals are explicit user actions that must be applied immediately
          (slideDiff.components_to_remove || []).forEach((compId: string) => {
            editorStore.removeDraftComponent(slideId, compId, true);
          });

          // For updates and additions, check if slide has unsaved LOCAL (user manual) changes
          // If so, skip to avoid overwriting user edits - BUT only for non-agent edits
          // Agent edits (isEditDiff=true) should always be applied to overwrite previous agent changes
          if (!isEditDiff) {
            try {
              const hasLocal = typeof editorStore.hasSlideChanged === 'function' && editorStore.hasSlideChanged(slideId);
              if (hasLocal) {
                return;
              }
            } catch { }
          } else {
          }

          // Apply component updates
          let needsDraftResync = false;
          (slideDiff.components_to_update || []).forEach((compDiff: any) => {
            // Check if component exists in draft BEFORE updating
            const draftBefore = editorStore.getDraftComponents(slideId);
            const existsInDraft = draftBefore?.some((c: any) => c.id === compDiff.id);

            if (!existsInDraft) {
              console.warn('[ChatPanel] Component not found in draft, will resync after main deck update', {
                slideId,
                componentId: compDiff.id,
                draftIds: draftBefore?.map((c: any) => c.id) || []
              });
              needsDraftResync = true;
            }

            editorStore.updateDraftComponent(
              slideId,
              compDiff.id,
              {
                ...(compDiff.type ? { type: compDiff.type } : {}),
                props: compDiff.props || {}
              },
              true // skipHistory
            );
          });

          // If component wasn't found in draft, flag for resync
          if (needsDraftResync) {
            (slideDiff as any)._needsDraftResync = true;
          }

          // Add new components
          (slideDiff.components_to_add || []).forEach((comp: any) => {
            editorStore.addDraftComponent(slideId, comp, true);
          });
        });

        // Apply deck-level changes to main store
        const { deckData, updateDeckData } = (useDeckStore as any).getState();
        const updated = applyDeckDiffPure(deckData, deckDiff as any);
        if (updated !== deckData) {
          // CRITICAL FIX: Backend auto-apply has ALREADY persisted deck-level changes
          // So we should ALWAYS skip backend here to avoid double-saving
          // Just update local state for instant preview
          // Always skip backend since backend auto-apply already persisted
          updateDeckData(updated, { skipBackend: true });

          // CRITICAL FIX: Resync drafts from main deck for slides where component wasn't found
          // This ensures that when a component ID doesn't exist in the draft, we refresh
          // the draft from the now-updated main deck so the UI reflects the changes
          const slidesToResync = ((deckDiff as any).slides_to_update || [])
            .filter((s: any) => s._needsDraftResync)
            .map((s: any) => s.slide_id);

          if (slidesToResync.length > 0) {
            // Use a small delay to ensure the main deck update has propagated
            setTimeout(() => {
              // Get fresh references to stores inside the callback
              const freshEditorStore = useEditorStore.getState();
              slidesToResync.forEach((slideId: string) => {
                const freshDeckData = (useDeckStore as any).getState().deckData;
                const slideFromDeck = freshDeckData.slides?.find((s: any) => s.id === slideId);
                if (slideFromDeck?.components) {
                  // Clear existing draft and reinitialize from main deck
                  freshEditorStore.clearDraftComponents(slideId);
                  freshEditorStore.initializeDraftComponents(slideId);
                }
              });
            }, 50);
          }
        }
        return;
      } catch (e) {
        console.warn('[AgentChat] Failed to apply diff to drafts', e);
      }
    }

    // Not in edit mode: apply directly to deck store
    try {
      const { deckData, updateDeckData } = (useDeckStore as any).getState();
      const updated = applyDeckDiffPure(deckData, deckDiff as any);
      if (updated !== deckData) {
        updateDeckData(updated, { skipBackend: true });
      }
    } catch (e) {
      console.error('[AgentChat] Failed to apply diff', e);
    }
  }, []);

  // Apply compact preview slides without refreshing whole deck
  const applyPreviewSlidesRespectingEditMode = useCallback((previewSlides: any[], isAgentEdit = false) => {
    if (!Array.isArray(previewSlides) || previewSlides.length === 0) return;
    // HARD GUARD: If deck is already completed and this is NOT an agent edit, do not apply preview slides
    // Agent edits should ALWAYS be applied to show thumbnails and changes in chat
    try {
      const deckData = (useDeckStore as any).getState().deckData;
      const allCompleted = Array.isArray(deckData?.slides) && deckData.slides.length > 0 && deckData.slides.every((s: any) => s.status === 'completed');
      if (allCompleted && !isAgentEdit) {
        setIsGenerating(false);
        return;
      }
    } catch { }
    const isEditing = typeof window !== 'undefined' && (window as any).__isEditMode === true;
    if (!isEditing) {
      // Not editing: merge into deck store as a normal state change
      try {
        const s = (useDeckStore as any).getState();
        const curr = s.deckData;
        const previewSlidesMap = new Map(previewSlides.map((sl: any) => [sl.id, sl]));
        const mergedSlides = curr.slides.map((sl: any) => previewSlidesMap.get(sl.id) || sl);
        previewSlides.forEach((ps: any) => {
          if (!curr.slides.some((sl: any) => sl.id === ps.id)) mergedSlides.push(ps);
        });
        s.updateDeckData({
          slides: mergedSlides,
          lastModified: new Date().toISOString(),
          version: `${curr.version || ''}-preview-${Date.now()}`
        }, { skipBackend: true });
      } catch { }
      return;
    }

    // Editing: update editor drafts only (component-level), avoid deck store refresh
    // Guard: skip while user is interacting to prevent snapping back
    try {
      const interacting = (typeof window !== 'undefined') && (
        (window as any).__isDragging === true ||
        (window as any).__isDraggingCharts === true ||
        (window as any).__isResizingCharts === true
      );
      if (interacting) {
        return;
      }
    } catch { }
    try {
      const editorStore = useEditorStore.getState();
      previewSlides.forEach((previewSlide: any) => {
        const slideId = previewSlide?.id;
        if (!slideId) return;
        // If this slide has local unsaved changes, don't overwrite its draft
        // BUT allow agent edits to always go through
        if (!isAgentEdit) {
          try {
            const hasLocal = typeof editorStore.hasSlideChanged === 'function' && editorStore.hasSlideChanged(slideId);
            if (hasLocal) {
              return;
            }
          } catch { }
        } else {
        }
        const previewComponents: any[] = Array.isArray(previewSlide.components) ? previewSlide.components : [];
        const draftComponents: any[] = editorStore.getDraftComponents(slideId) || [];

        const draftById = new Map(draftComponents.map(c => [c.id, c]));
        const previewById = new Map(previewComponents.map(c => [c.id, c]));

        // Update and add
        previewComponents.forEach((pc) => {
          const current = draftById.get(pc.id);
          if (!current) {
            editorStore.addDraftComponent(slideId, pc, true);
            return;
          }
          // Shallow compare basic fields then deep compare props to avoid jitter
          const typeChanged = current.type !== pc.type;
          const propsChanged = JSON.stringify(current.props || {}) !== JSON.stringify(pc.props || {});
          if (typeChanged || propsChanged) {
            editorStore.updateDraftComponent(slideId, pc.id, { type: pc.type, props: pc.props || {} }, true);
          }
        });

        // Remove components no longer present
        draftComponents.forEach((dc) => {
          if (!previewById.has(dc.id)) {
            editorStore.removeDraftComponent(slideId, dc.id, true);
          }
        });
      });
    } catch (e) {
      console.warn('[AgentChat] Failed to apply preview slides to drafts', e);
    }
  }, []);

  const [currentGeneratingSlide, setCurrentGeneratingSlide] = useState(0);
  const [processedMessageIds, setProcessedMessageIds] = useState<Set<string>>(new Set());

  // Try to use the store and navigation hooks, but catch any errors
  let slides: SlideData[] = [];
  let currentSlideIndex = 0;
  let setCurrentSlideIndexSafe: (index: number) => void = () => {};

  try {
    // Use Zustand store directly
    const deckData = useDeckStore(state => state.deckData);
    // CRITICAL: Sort slides by order field to match visual display order
    // Without this, slides[currentSlideIndex] returns wrong slide after reordering
    slides = [...(deckData.slides || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const navigationContext = useNavigation();
    currentSlideIndex = navigationContext.currentSlideIndex;
    setCurrentSlideIndexSafe = navigationContext.setCurrentSlideIndex;
  } catch (error) {
    console.error("ChatPanel: Context hook error (possibly rendered outside providers)", error);
    // Continue with default values if hook fails
  }

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollHeightBeforeLoadRef = useRef<number>(0);

  // Reliable scroll to bottom function
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior });
    });
  }, []);

  // Handler for "Load older messages" - saves scroll height before loading
  const handleLoadOlderMessages = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollHeightBeforeLoadRef.current = scrollContainerRef.current.scrollHeight;
    }
    setShowOldMessages(true);
  }, []);

  // After old messages load, adjust scroll to keep current view in place
  useEffect(() => {
    if (showOldMessages && scrollContainerRef.current && scrollHeightBeforeLoadRef.current > 0) {
      // Calculate how much new content was added above
      const newScrollHeight = scrollContainerRef.current.scrollHeight;
      const heightDiff = newScrollHeight - scrollHeightBeforeLoadRef.current;

      // Scroll down by the height of the newly loaded content to maintain position
      if (heightDiff > 0) {
        scrollContainerRef.current.scrollTop = heightDiff;
      }

      // Reset the ref so this only runs once
      scrollHeightBeforeLoadRef.current = 0;
    }
  }, [showOldMessages]);

  const previousMessageCountRef = useRef(messages.length);
  const lastMessageTypeRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // Initialize themePreview from outline's stylePreferences if available
  // This ensures colors from outline generation are displayed in chat panel
  const getInitialThemePreview = (): { theme?: any; palette?: any; typography?: any; tools?: Array<{ label: string; status: string }>; images?: any[]; logo?: { url?: string; light_variant?: string; dark_variant?: string; source?: string } } | null => {
    const sp = outline?.stylePreferences;
    if (!sp) return null;
    
    const colors = sp.colors;
    if (!colors) return null;
    
    // Build palette from outline colors
    const palette: any = {
      primary_background: colors.background || '#FFFFFF',
      primary_text: colors.text || '#1F2937',
      colors: [colors.accent1, colors.accent2, colors.accent3].filter(Boolean),
      metadata: sp.logoUrl ? { logo_url: sp.logoUrl } : {}
    };
    
    // Build typography from outline font preference
    const typography = sp.font ? {
      hero_title: { family: sp.font },
      body_text: { family: sp.font }
    } : undefined;
    
    // Build logo if available
    const logo = sp.logoUrl ? { url: sp.logoUrl, source: 'style_preferences' } : undefined;
    
    return {
      palette,
      typography,
      logo,
      theme: {
        theme_name: sp.vibeContext ? `${sp.vibeContext} Theme` : 'Brand Theme',
        color_palette: palette,
        typography
      }
    };
  };
  
  const [themePreview, setThemePreview] = useState<{ theme?: any; palette?: any; typography?: any; tools?: Array<{ label: string; status: string }>; images?: any[]; logo?: { url?: string; light_variant?: string; dark_variant?: string; source?: string } } | null>(getInitialThemePreview);
  const [isThemePreviewOpen, setIsThemePreviewOpen] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);

  // Sync themePreview when outline's stylePreferences changes (e.g., navigating from outline page)
  useEffect(() => {
    const sp = outline?.stylePreferences;
    if (!sp?.colors) return;
    
    // Only update if we don't have a theme yet OR if this is a new outline
    if (!themePreview?.palette?.colors?.length) {
      const initialTheme = getInitialThemePreview();
      if (initialTheme) {
        setThemePreview(initialTheme);
      }
    }
  }, [outline?.stylePreferences?.colors?.accent1, outline?.stylePreferences?.colors?.background]);

  // Helpers to normalize palette data safely
  const getColorValue = (val: any): string | null => {
    if (!val) return null;
    if (typeof val === 'string') return val;
    // Common shapes: { color: '#fff' } or { hex: '#fff' }
    if (typeof val === 'object') {
      if (typeof val.color === 'string') return val.color;
      if (typeof val.hex === 'string') return val.hex;
      // Gradient-like: { stops: [{ color: '#fff' }, ...] }
      if (Array.isArray(val.stops) && val.stops.length > 0) {
        const first = val.stops.find((s: any) => typeof s?.color === 'string');
        if (first?.color) return first.color as string;
      }
      // Array of strings
      if (Array.isArray(val)) {
        const firstStr = val.find((v: any) => typeof v === 'string');
        if (firstStr) return firstStr as string;
      }
    }
    return null;
  };
  // Convert snake_case or camelCase to Title Case for display
  const humanizeLabel = (key: string): string => {
    if (!key) return '';
    try {
      // Replace underscores and hyphens with spaces
      const withSpaces = key
        .replace(/[_-]+/g, ' ')
        // Insert spaces before camelCase capitals
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .trim();
      // Title case words and keep numbers as-is
      return withSpaces
        .split(/\s+/)
        .map(w => w.length === 0 ? '' : w[0].toUpperCase() + w.slice(1))
        .join(' ');
    } catch {
      return key;
    }
  };

  const toSwatches = (palette: any): Array<{ key: string; color: string }> => {
    const entries: Array<{ key: string; color: string }> = [];
    try {
      const raw = palette && typeof palette === 'object' ? Object.entries(palette) : [];
      raw.forEach(([k, v]: [string, any]) => {
        // If the value is an array (e.g., colors: ["#...", "#..."]), include all items
        if (Array.isArray(v)) {
          v.forEach((val: any, idx: number) => {
            const c = getColorValue(val) || (typeof val === 'string' ? val : null);
            if (typeof c === 'string' && c.trim()) {
              entries.push({ key: `${k}_${idx + 1}`, color: c });
            }
          });
          return;
        }
        const c = getColorValue(v);
        if (typeof c === 'string' && c.trim()) entries.push({ key: k || 'color', color: c });
      });
    } catch { }
    return entries;
  };

  // Handle add_system_message events
  useEffect(() => {
    const handleAddSystemMessage = (event: CustomEvent) => {
      const { message, metadata } = event.detail;

      // Check if this is a completion message
      const isCompletion = metadata?.type === 'generation_complete' ||
                          metadata?.stage === 'generation_complete' ||
                          metadata?.progress === 100;

      if (isCompletion) {
        // CRITICAL: Replace the progress message with completion message
        // Don't add a new message - update the existing 'generation-progress' one
        setIsGenerating(false);
        setMessages(prev => {
          // Check if we already have a completion message
          const hasCompletion = prev.some(m =>
            m.metadata?.type === 'generation_complete' ||
            (typeof m.message === 'string' && m.message.includes('Your presentation is ready!'))
          );
          if (hasCompletion) return prev; // Don't add duplicate

          const completionMessage: ExtendedChatMessageProps = {
            id: 'generation-complete',
            type: 'ai',
            message: 'Your presentation is ready!',
            timestamp: new Date(),
            feedback: null,
            metadata: { ...metadata, type: 'generation_complete', stage: 'generation_complete', progress: 100 }
          } as any;

          // Find and replace the progress message
          const progressIdx = prev.findIndex(msg => msg.id === 'generation-progress');
          if (progressIdx !== -1) {
            const updated = [...prev];
            updated[progressIdx] = completionMessage;
            return updated;
          }
          // If no progress message found, just add completion
          return [...prev, completionMessage];
        });
        setCurrentPhase('generation_complete');
        return;
      }

      // Add the system message to the chat
      const newMessage: ExtendedChatMessageProps = {
        id: `system-${Date.now()}`,
        type: 'system',
        message,
        timestamp: new Date(),
        metadata,
        feedback: null
      };

      setMessages(prev => [...prev, newMessage]);

      // Track phase to auto-expand/contract the preview with stages
      try {
        const phase = metadata?.phase || metadata?.stage || null;
        const isStreaming = metadata?.isStreamingUpdate === true;
        if (isStreaming && phase) {
          setCurrentPhase(String(phase));
        }
      } catch { }
    };

    window.addEventListener('add_system_message', handleAddSystemMessage as EventListener);

    // Also listen for deck_finalized as a backup to ensure completion message is shown
    const handleDeckFinalized = (event: CustomEvent) => {
      const { deckId } = event.detail || {};
      console.log('[ChatPanel] Received deck_finalized event:', deckId);

      // Mark generation as complete
      setIsGenerating(false);

      // Check if we already have a completion message
      setMessages(prev => {
        const hasCompletion = prev.some(m =>
          m.metadata?.type === 'generation_complete' ||
          (typeof m.message === 'string' && m.message.includes('Your presentation is ready!'))
        );
        if (hasCompletion) return prev;

        // No completion message yet - add one
        const completionMessage: ExtendedChatMessageProps = {
          id: 'generation-complete',
          type: 'ai',
          message: 'Your presentation is ready!',
          timestamp: new Date(),
          feedback: null,
          metadata: { type: 'generation_complete', stage: 'generation_complete', progress: 100, deckId }
        } as any;

        // Find and replace the progress message
        const progressIdx = prev.findIndex(msg => msg.id === 'generation-progress');
        if (progressIdx !== -1) {
          const updated = [...prev];
          updated[progressIdx] = completionMessage;
          return updated;
        }
        // If no progress message found, just add completion
        return [...prev, completionMessage];
      });
      setCurrentPhase('generation_complete');

      // After showing completion, add the welcome/typing message with a delay
      // This creates the same experience as when entering the slide editor
      setTimeout(() => {
        setMessages(prev => {
          // Don't add if we already have a welcome message
          const hasWelcome = prev.some(m => m.id === 'post-generation-welcome');
          if (hasWelcome) return prev;

          // Add the welcome message that invites users to edit
          const welcomeMessage: ExtendedChatMessageProps = {
            id: 'post-generation-welcome',
            type: 'ai',
            message: getWelcomeMessage(false, true), // true = existing deck
            timestamp: new Date(),
            feedback: null,
            metadata: { isTyping: false }
          } as any;

          return [...prev, welcomeMessage];
        });
      }, 800); // Small delay after completion message
    };

    window.addEventListener('deck_finalized', handleDeckFinalized as EventListener);

    return () => {
      window.removeEventListener('add_system_message', handleAddSystemMessage as EventListener);
      window.removeEventListener('deck_finalized', handleDeckFinalized as EventListener);
    };
  }, []);

  // Handle chat:prefill_with_component events (from CustomComponentEditOverlay AI edit)
  // Supports autoSend option to immediately send the message
  const pendingAutoSendRef = useRef<{ prompt: string; componentId: string; slideId: string | null; label: string; elementType: string } | null>(null);

  useEffect(() => {
    const handlePrefillWithComponent = (event: CustomEvent) => {
      const { componentId, slideId, label, prompt, elementType, autoSend } = event.detail || {};

      if (!componentId) return;

      // Add component to selections
      setSelectedElements(prev => {
        // Don't add if already selected
        if (prev.some(s => s.elementId === componentId)) return prev;

        return [...prev, {
          elementId: componentId,
          elementType: elementType || 'CustomComponent',
          slideId: slideId || null,
          label: label || 'Custom Component',
          overlaps: [],
          bounds: null
        }];
      });

      // Set the input text (if prompt provided)
      if (prompt) {
        setInput(prompt);
      }

      // If autoSend is requested, store the pending send info
      // We need to wait for state to update before sending
      if (autoSend && prompt) {
        pendingAutoSendRef.current = {
          prompt,
          componentId,
          slideId: slideId || null,
          label: label || 'Custom Component',
          elementType: elementType || 'CustomComponent'
        };
      } else {
        // Focus the input after a short delay to ensure state is updated
        setTimeout(() => {
          inputRef.current?.focus();
        }, 50);
      }
    };

    window.addEventListener('chat:prefill_with_component', handlePrefillWithComponent as EventListener);

    return () => {
      window.removeEventListener('chat:prefill_with_component', handlePrefillWithComponent as EventListener);
    };
  }, []);

  // Effect to handle auto-send after state updates
  useEffect(() => {
    if (pendingAutoSendRef.current && input && selectedElements.length > 0) {
      const pending = pendingAutoSendRef.current;
      // Verify the component was added to selections
      const hasSelection = selectedElements.some(s => s.elementId === pending.componentId);
      if (hasSelection && input === pending.prompt) {
        pendingAutoSendRef.current = null;
        // Trigger send after a brief delay to ensure all state is synced
        setTimeout(() => {
          sendMessage();
        }, 100);
      }
    }
  }, [input, selectedElements]);

  // Show initial prompt message when outline with stylePreferences loads
  useEffect(() => {
    if (outlineMode && useOutlineAgent && outline?.stylePreferences && messages.length === 0) {
      const prefs = outline.stylePreferences;
      const messageLines = [];

      if (prefs.initialIdea) {
        messageLines.push(`**Topic:** ${prefs.initialIdea}`);
      }

      if (prefs.vibeContext) {
        messageLines.push(`**Style:** ${prefs.vibeContext}`);
      }

      // Add toggles if available
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
  }, [outlineMode, useOutlineAgent, outline?.stylePreferences, messages.length]);

  // Sync outline messages when in outline mode
  useEffect(() => {
    if (outlineMode && outlineMessages && outlineMessages.length > 0) {
      setMessages(outlineMessages);
    }
  }, [outlineMode, outlineMessages]);

  // Notify parent when outline generation state changes (one-way only, no sync back)
  useEffect(() => {
    if (outlineMode && onOutlineChatGeneratingChange) {
      onOutlineChatGeneratingChange(isGenerating);
    }
  }, [outlineMode, isGenerating, onOutlineChatGeneratingChange]);

  // Auto-stop generating when outline slides get content
  useEffect(() => {
    if (outlineMode && isGenerating && outline?.slides && outline.slides.length > 0) {
      const allSlidesHaveContent = outline.slides.every((slide: any) =>
        slide.content && slide.content.trim() !== ''
      );
      if (allSlidesHaveContent) {
        setIsGenerating(false);
      }
    }
  }, [outlineMode, isGenerating, outline?.slides]);

  // Sync outline slide target with current slide index (works in both outline and slide modes)
  useEffect(() => {
    if (outlineCurrentSlideIndex !== undefined && outlineCurrentSlideIndex >= 0) {
      setOutlineSlideTarget(outlineCurrentSlideIndex);
    }
  }, [outlineCurrentSlideIndex]);

  // REMOVED: Complex syncing logic - we handle messages directly now

  // Live Theme & Assets preview updates
  useEffect(() => {
    const onThemePreview = (e: CustomEvent) => {
      const d = e.detail || {};
      setThemePreview(prev => {
        const next = { ...(prev || {}), ...d } as any;
        // Derive logo if not explicitly provided
        try {
          const isUrl = (v: any) => typeof v === 'string' && /^(https?:|data:image\/)\S+/i.test(v);
          const deriveLogo = (obj: any): { url?: string; light_variant?: string; dark_variant?: string } => {
            const out: { url?: string; light_variant?: string; dark_variant?: string } = {};
            if (!obj) return out;
            const setIf = (k: 'url' | 'light_variant' | 'dark_variant', v?: any) => { if (isUrl(v) && !out[k]) (out as any)[k] = String(v); };
            const brandInfo = (obj as any).brandInfo || {};
            const logoInfo = (obj as any).logo_info || {};
            const themeLogo = (obj as any).logo || {};
            const paletteMeta = (obj as any).color_palette?.metadata || (obj as any).palette?.metadata || {};
            setIf('url', themeLogo.url);
            setIf('light_variant', themeLogo.light_variant);
            setIf('dark_variant', themeLogo.dark_variant);
            setIf('url', logoInfo.url);
            setIf('light_variant', logoInfo.light_variant);
            setIf('dark_variant', logoInfo.dark_variant);
            setIf('url', brandInfo.logoUrl || brandInfo.logo_url);
            setIf('light_variant', brandInfo.logo_url_light);
            setIf('dark_variant', brandInfo.logo_url_dark);
            setIf('url', paletteMeta.logo_url);
            setIf('light_variant', paletteMeta.logo_url_light);
            setIf('dark_variant', paletteMeta.logo_url_dark);
            // Generic shallow scan for common fields
            for (const k of ['logo', 'logo_url', 'brand_logo', 'brand_logo_url']) {
              const v = (obj as any)[k];
              if (isUrl(v)) setIf('url', v);
              if (v && typeof v === 'object') {
                setIf('url', (v as any).url);
                setIf('url', (v as any).src);
              }
            }
            return out;
          };
          const existing = (next.logo || {}) as any;
          if (!existing.url) {
            const fromTheme = deriveLogo(next.theme || {});
            const fromPalette = deriveLogo({ palette: next.palette });
            const url = existing.url || fromTheme.url || fromPalette.url;
            const light = existing.light_variant || fromTheme.light_variant || fromPalette.light_variant;
            const dark = existing.dark_variant || fromTheme.dark_variant || fromPalette.dark_variant;
            if (url || light || dark) {
              next.logo = { url, light_variant: light, dark_variant: dark, source: (existing.source || 'derived') };
            }
          }
        } catch { }
        if (d?.tool && d.tool.label) {
          const incoming = { label: String(d.tool.label), status: String(d.tool.status || 'start') };
          const key = incoming.label.toLowerCase().trim();
          const prevTools = Array.isArray(prev?.tools) ? prev!.tools : [];
          // Upsert by label (latest status wins), avoid duplicates
          const updated = [] as Array<{ label: string; status: string }>;
          let merged = false;
          for (const t of prevTools) {
            const tk = String(t.label || '').toLowerCase().trim();
            if (tk === key) {
              if (!merged) {
                // Replace existing with incoming (prefer finish over start)
                updated.push({ label: t.label, status: incoming.status });
                merged = true;
              }
              // skip any additional duplicates with same label
              continue;
            }
            updated.push(t);
          }
          if (!merged) {
            updated.push(incoming);
          }
          // Keep the most recent few
          next.tools = updated.slice(-8);
        }
        return next;
      });
      if (!isThemePreviewOpen) setIsThemePreviewOpen(true);
    };
    window.addEventListener('theme_preview_update', onThemePreview as EventListener);
    return () => window.removeEventListener('theme_preview_update', onThemePreview as EventListener);
  }, [isThemePreviewOpen]);

  // Auto-open during theme/image collection, contract on slide generation/finalization
  useEffect(() => {
    if (!currentPhase) return;
    const p = String(currentPhase);
    if (p === 'theme_generation' || p === 'image_collection') {
      if (themePreview) setIsThemePreviewOpen(true);
    } else if (p === 'slide_generation' || p === 'finalization' || p === 'generation_complete') {
      setIsThemePreviewOpen(false);
    }
  }, [currentPhase, themePreview]);

  // Scroll to bottom when messages change or are updated
  // Track message changes with a hash of the last message
  const lastMessage = messages[messages.length - 1];
  const lastMessageHash = lastMessage ? `${lastMessage.id}-${typeof lastMessage.message === 'string' ? lastMessage.message.length : 0}-${lastMessage.metadata?.isTyping}` : '';

  useEffect(() => {
    // Check if we're just updating an existing images_collected message
    const isJustUpdatingImages = messages.length === previousMessageCountRef.current &&
      messages.some(msg => msg.metadata?.type === 'images_collected') &&
      lastMessageTypeRef.current === 'images_collected';

    // Only scroll if we're not just updating images
    if (!isJustUpdatingImages) {
      scrollToBottom();
    }

    // Update refs for next comparison
    previousMessageCountRef.current = messages.length;
    lastMessageTypeRef.current = lastMessage?.metadata?.type || null;
  }, [messages.length, lastMessageHash, scrollToBottom]);

  // Also scroll during active streaming/typing - poll every 500ms
  useEffect(() => {
    const isStreaming = lastMessage?.metadata?.isTyping || lastMessage?.metadata?.isStreamingUpdate;
    if (!isStreaming) return;

    const interval = setInterval(() => {
      scrollToBottom();
    }, 500);

    return () => clearInterval(interval);
  }, [lastMessage?.metadata?.isTyping, lastMessage?.metadata?.isStreamingUpdate, scrollToBottom]);

  // Sync local collapse state with parent component
  useEffect(() => {
    // When the collapse change handler exists, notify parent of local state changes
    if (onCollapseChange && isCollapsed) {
      onCollapseChange(isCollapsed);
    }
  }, [isCollapsed, onCollapseChange]);

  // Initialize agent session and WS (first mount). Slide changes are handled by ensureAgentSession.
  useEffect(() => {
    // Note: helper functions are defined at component scope with useCallback

    // Update a single compact progress row for agent progress
    const upsertAgentProgressRow = (phase?: string, percent?: number) => {
      const existingId = agentProgressMsgIdRef.current;
      const text = `${phase || 'Working'}… ${percent ?? 0}%`;
      if (existingId) {
        setMessages(prev => prev.map(m => m.id === existingId ? { ...m, message: text, metadata: { ...m.metadata, type: 'progress', compactRow: true, phase, percent } } : m));
      } else {
        const id = `progress-${Date.now()}`;
        agentProgressMsgIdRef.current = id;
        setMessages(prev => [...prev, { id, type: 'system', message: text, timestamp: new Date(), feedback: null, metadata: { type: 'progress', compactRow: true, phase, percent } }]);
      }
    };

    (async () => {
      try {
        const deckData = useDeckStore.getState().deckData;
        const deckId = deckData?.uuid || deckData?.id;
        const slideId = slides[currentSlideIndex]?.id;
        if (!deckId || !slideId) return;
        // Require explicit agent backend config in prod; otherwise, skip
        if (!API_CONFIG.AGENT_BASE_URL) {
          throw new Error('Agent backend not configured');
        }
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const client = new AgentChatClient({
          onEvent: (evt) => {
            if (!evt || !evt.type) return;
            // Handle streaming tokens
            if (evt.type === 'assistant.message.delta') {
              const rawDelta = (evt as any).data?.delta || '';
              const trimmed = String(rawDelta).trim();
              // If this is the very first token and it's numeric-only or empty, ignore it
              if (!streamingAiMsgIdRef.current && (trimmed === '' || /^\d+$/.test(trimmed))) {
                return;
              }
              const id = streamingAiMsgIdRef.current || `ai-stream-${Date.now()}`;
              if (!streamingAiMsgIdRef.current) {
                streamingAiMsgIdRef.current = id;
                setMessages(prev => [...prev, { id, type: 'ai', message: '', timestamp: new Date(), feedback: null }]);
              }
              setMessages(prev => prev.map(m => {
                if (m.id !== id) return m;
                const current = String(m.message || '');
                if (current.trim().length === 0 && /^\d+$/.test(trimmed)) {
                  // Skip numeric-only first token
                  return m;
                }
                const next = humanizeSystemPhrases(current + rawDelta);
                return { ...m, message: next };
              }));
              return;
            }
            if (evt.type === 'assistant.message.complete') {
              const doneId = (evt as any).data?.messageId || streamingAiMsgIdRef.current;
              if (doneId) {
                setMessages(prev => {
                  const msg = prev.find(m => m.id === doneId);
                  if (!msg) return prev;
                  const text = String(msg.message ?? '').trim();
                  // Remove empty or numeric-only streaming crumbs (e.g., "0")
                  if (text === '' || /^\d+$/.test(text)) {
                    return prev.filter(m => m.id !== doneId);
                  }
                  // Humanize any system phrases
                  const humanized = humanizeSystemPhrases(text);
                  return prev.map(m => m.id === doneId ? { ...m, message: humanized } : m);
                });
              }
              streamingAiMsgIdRef.current = null;

              // CRITICAL: Clean up plan message when assistant completes
              clearPlanTimers();
              if (planMsgIdRef.current) {
                const planId = planMsgIdRef.current;
                setMessages(prev => prev.filter(m => m.id !== planId));
                planMsgIdRef.current = null;
                planCreatedAtRef.current = null;
              }
              return;
            }
            // LinkedIn profile search results
            if (evt.type === 'assistant.linkedin_profiles') {
              const { query, profiles: rawProfiles, isLoading, note, error } = (evt as any).data || {};
              const profiles = rawProfiles || [];
              console.log('[LinkedIn] Event received:', { query, profileCount: profiles.length, isLoading, profiles, note, error });
              console.log('[LinkedIn] Profiles data:', JSON.stringify(profiles, null, 2));
              const linkedinMsgId = `linkedin-${Date.now()}`;

              if (isLoading) {
                // Show loading state
                setMessages(prev => [...prev, {
                  id: linkedinMsgId,
                  type: 'ai',
                  message: `Searching LinkedIn for "${query}"...`,
                  timestamp: new Date(),
                  feedback: null,
                  metadata: {
                    type: 'linkedin_profiles',
                    query,
                    profiles: [],
                    isLoading: true
                  }
                }]);
              } else {
                // Update or add results - find existing loading message and update it
                setMessages(prev => {
                  const loadingMsgIndex = prev.findIndex(m =>
                    m.metadata?.type === 'linkedin_profiles' &&
                    m.metadata?.query === query &&
                    m.metadata?.isLoading === true
                  );

                  const resultMsg = {
                    id: loadingMsgIndex >= 0 ? prev[loadingMsgIndex].id : linkedinMsgId,
                    type: 'ai' as const,
                    message: profiles.length > 0
                      ? `Found ${profiles.length} profile${profiles.length === 1 ? '' : 's'} for "${query}"`
                      : `No profiles found for "${query}"`,
                    timestamp: new Date(),
                    feedback: null,
                    metadata: {
                      type: 'linkedin_profiles',
                      query,
                      profiles,
                      isLoading: false
                    }
                  };

                  if (loadingMsgIndex >= 0) {
                    // Replace loading message with results
                    return prev.map((m, i) => i === loadingMsgIndex ? resultMsg : m);
                  } else {
                    // Add new message
                    return [...prev, resultMsg];
                  }
                });
              }
              return;
            }
            // Plan updates: show lightweight typing indicator under chat box
            if (evt.type === 'agent.plan.update') {
              const steps: string[] = (evt as any).data?.plan?.map((s: any) => s.title) || [];
              animatePlanMessage(steps);
              return;
            }
            if ((evt as any).type === 'agent.selection.using' || (evt as any).type === 'agent.selection') {
              const label = (evt as any).data?.label || (evt as any).data?.selection || 'selection';
              appendSelectionRow(label);
              return;
            }
            // Tool lifecycle - append one minimal line per event
            if (evt.type?.startsWith('agent.tool.')) {
              const { tool } = (evt as any).data || {};
              // Extract status from event type (e.g., 'agent.tool.start' -> 'start')
              const statusFromType = evt.type.replace('agent.tool.', '');
              const status = (evt as any).data?.status || statusFromType;
              console.log('[ChatPanel] Tool event:', { type: evt.type, tool, status });
              appendToolRow(tool, status);
              if (isStyleTool(tool)) {
                if (status === 'start') {
                  styleToolStateRef.current = { active: true, name: tool, lastStartTs: Date.now(), lastFinishTs: styleToolStateRef.current.lastFinishTs };
                } else if (status === 'finish' || status === 'error') {
                  styleToolStateRef.current = { active: false, name: tool, lastStartTs: styleToolStateRef.current.lastStartTs, lastFinishTs: Date.now() };
                }
              }
              return;
            }
            if (evt.type === 'deck.edit.proposed') {
              const edit = (evt as any).data?.edit;
              const summary = edit?.summary || 'Proposed edit available';
              if (edit?.id && edit?.diff) {
                try {
                  proposedDiffsRef.current.set(edit.id, edit.diff);
                } catch (e) {
                  console.warn('[AgentChat] Failed to store proposed diff', e);
                }
                // Apply preview diff immediately for real-time preview, respecting edit mode
                try {
                  applyDeckDiffRespectingEditMode(edit.diff, true);  // Pass true - this is an edit proposal
                } catch { }
              }
              setMessages(prev => [...prev, { id: `proposed-${Date.now()}`, type: 'system', message: `✨ ${summary}`, timestamp: new Date(), feedback: null, metadata: { type: 'edit_proposed', compactRow: true } }]);
              return;
            }
            if ((evt as any).type === 'deck.preview.diff' || (evt as any).type === 'deck.edit.proposed') {
              const payloadData = (evt as any).data || {};
              const diff = payloadData.diff;
              const editId = payloadData.editId || payloadData.edit?.id;
              const previewSlidesPayload = payloadData.slides;
              const previewMessageId = (evt as any).messageId;
              if (previewMessageId && diff) {
                pendingDiffsByMessageIdRef.current.set(previewMessageId, diff);
              }
              try {
                // IMPORTANT: Capture slide state BEFORE applying the diff for restore functionality
                try {
                  const deckStore = useDeckStore.getState();
                  const slides = deckStore.deckData?.slides || [];

                  // Get the slide IDs being modified from the diff (uses slide_id field)
                  const slidesToUpdate = diff?.slides_to_update || [];
                  const modifiedSlideIds = slidesToUpdate.map((s: any) => s.slide_id || s.id).filter(Boolean);

                  // Also check preview slides for IDs
                  const previewSlideIds = (previewSlidesPayload || []).map((s: any) => s.id).filter(Boolean);
                  const targetSlideIds = modifiedSlideIds.length > 0 ? modifiedSlideIds : previewSlideIds;


                  if (targetSlideIds.length > 0) {
                    // Capture the FIRST modified slide (typically only one slide is edited at a time)
                    const targetSlideId = targetSlideIds[0];
                    const originalSlide = slides.find((s: any) => s.id === targetSlideId);
                    if (originalSlide) {
                      (window as any).__preEditSlideSnapshot = JSON.parse(JSON.stringify(originalSlide));
                    } else {
                      console.warn('[AgentChat] Could not find slide with id:', targetSlideId, 'in deck slides:', slides.map((s: any) => s.id));
                    }
                  } else {
                    // Fallback: use current slide from navigation context
                    const navContext = (window as any).__navigationContext;
                    const currentSlideIdx = navContext?.currentSlideIndex || 0;
                    const currentSlide = slides[currentSlideIdx];
                    if (currentSlide) {
                      (window as any).__preEditSlideSnapshot = JSON.parse(JSON.stringify(currentSlide));
                    }
                  }
                } catch (e) {
                  console.warn('[AgentChat] Failed to capture pre-edit snapshot:', e);
                }

                // Only set preview guards for preview-type events to avoid suppressing realtime DB updates
                const now = Date.now();
                (window as any).__pendingPreviewTs = now;
                if (editId) (window as any).__pendingPreviewEditId = editId;
                // CRITICAL: Mark that an AI edit is in progress to prevent loadDeck() from
                // overwriting local changes when user enters edit mode during an active edit
                (window as any).__agentEditInProgress = true;

                // If backend provided compact slides, prefer component-level updates during edit mode
                const normalizedPreviewSlides = normalizeSlidesPayload(previewSlidesPayload);
                if (previewMessageId && normalizedPreviewSlides.length > 0) {
                  pendingSlidesByMessageIdRef.current.set(previewMessageId, normalizedPreviewSlides);
                }
                if (normalizedPreviewSlides.length > 0) {
                  applyPreviewSlidesRespectingEditMode(normalizedPreviewSlides);

                  // If there's also a diff, apply deck-level props without touching components (already done)
                  if (diff && (diff.deck_properties || diff.slides_to_remove)) {
                    const deckLevelOnlyDiff = {
                      ...diff,
                      slides_to_update: [],
                      slides_to_add: []
                    } as DeckDiff;
                    applyDeckDiffRespectingEditMode(deckLevelOnlyDiff, true);  // Pass true - this is an edit
                  }
                  // If style tool is active or just finished, optimize fonts for those slides now
                  return;
                }

                // Fallback to diff-based updates if no preview slides
                if (diff) {
                  applyDeckDiffRespectingEditMode(diff, true);  // Pass true - this is an edit preview
                } else {
                  console.warn('[Realtime][preview.diff] No diff or slides in payload', { editId });
                }
              } catch (e) {
                console.error('[Realtime][preview.diff] Error applying preview', e);
              }
              return;
            }
            if (evt.type === 'deck.edit.applied') {
              // WRAP ENTIRE HANDLER IN TRY-CATCH to prevent silent failures
              try {

              // CRITICAL: Clear plan message immediately when edit is applied
              clearPlanTimers();
              if (planMsgIdRef.current) {
                const planId = planMsgIdRef.current;
                setMessages(prev => prev.filter(m => m.id !== planId));
                planMsgIdRef.current = null;
                planCreatedAtRef.current = null;
              }

              const rawDiff = (evt as any).data?.deck_diff;
              // DEDUP: Prevent duplicate handling from multiple subscriptions
              // Safety check: ensure ref is initialized as a Set
              if (!processedEditEventsRef.current) {
                processedEditEventsRef.current = new Set();
              }
              const eventKey = `${(evt as any).data?.editId || ''}-${(evt as any).timestamp || Date.now()}`;
              if (processedEditEventsRef.current.has(eventKey)) {
                return;
              }
              processedEditEventsRef.current.add(eventKey);
              // Clean up old entries after 10 seconds to prevent memory leak
              setTimeout(() => processedEditEventsRef.current?.delete(eventKey), 10000);

              const appliedEditId = (evt as any).data?.editId;
              const appliedMessageId = (evt as any).messageId;
              let normalizedAppliedSlides = normalizeSlidesPayload((evt as any).data?.slides);

              // CRITICAL FIX: Actually apply the deck_diff to the store!
              // The event contains the diff but it was never being applied
              const deckDiff = (evt as any).data?.deck_diff;
              if (deckDiff && isValidDeckDiff(deckDiff)) {
                applyDeckDiffRespectingEditMode(deckDiff, true);
              }
              if (appliedMessageId) {
                pendingDiffsByMessageIdRef.current.delete(appliedMessageId);
                if (normalizedAppliedSlides.length === 0) {
                  const cachedSlides = pendingSlidesByMessageIdRef.current.get(appliedMessageId);
                  if (Array.isArray(cachedSlides) && cachedSlides.length > 0) {
                    normalizedAppliedSlides = cachedSlides;
                  }
                }
                pendingSlidesByMessageIdRef.current.delete(appliedMessageId);
              }
              // Keep pre-edit snapshot for potential restoration
              const preEditSnapshot = (window as any).__preEditSlideSnapshot || null;
              (window as any).__preEditSlideSnapshot = null;

              // Try to get summary from event
              const editSummary = (evt as any).data?.summary || '';

              // Get the slide ID that was edited/added from the diff
              const diffSlidesToUpdate = (evt as any).data?.deck_diff?.slides_to_update || [];
              const diffSlidesToAdd = (evt as any).data?.deck_diff?.slides_to_add || [];
              // Prefer newly added slides for thumbnail (they're the most interesting), then updated, then fallback to preEdit
              const editedSlideId = diffSlidesToAdd[0]?.id || diffSlidesToUpdate[0]?.slide_id || diffSlidesToUpdate[0]?.id || preEditSnapshot?.id;
              const isNewSlide = diffSlidesToAdd.length > 0;

              // Store info to capture post-edit snapshot after diff is applied
              const messageId = `applied-${Date.now()}`;
              (window as any).__pendingPostEditCapture = {
                messageId,
                editedSlideId,
                preEditSnapshot,
                editId: appliedEditId,
                editSummary
              };

              // Get the EDITED slide from the store (not the current viewed slide)
              let immediateSnapshot = null;
              try {
                const deckStore = useDeckStore.getState();
                const slides = deckStore.deckData?.slides || [];

                // For new slides, use the diff data directly
                if (isNewSlide && diffSlidesToAdd[0]) {
                  immediateSnapshot = JSON.parse(JSON.stringify(diffSlidesToAdd[0]));
                } else {
                  // Find the edited slide by ID, fall back to current view slide
                  const editedSlide = editedSlideId ? slides.find((s: any) => s.id === editedSlideId) : null;
                  const currentIdx = deckStore.currentSlideIndex || 0;
                  const targetSlide = editedSlide || slides[currentIdx] || slides[0];
                  if (targetSlide) {
                    immediateSnapshot = JSON.parse(JSON.stringify(targetSlide));
                  }
                }
              } catch (e) {
                console.error('[AgentChat] Snapshot capture failed:', e);
              }

              // AUTO-NAVIGATE to newly created slide so user can see it
              if (isNewSlide && editedSlideId) {
                setTimeout(() => {
                  try {
                    const deckStore = useDeckStore.getState();
                    const slides = deckStore.deckData?.slides || [];
                    const newSlideIndex = slides.findIndex((s: any) => s.id === editedSlideId);
                    if (newSlideIndex >= 0) {
                      setCurrentSlideIndexSafe(newSlideIndex);
                    }
                  } catch (e) {
                    console.warn('[AgentChat] Failed to auto-navigate to new slide:', e);
                  }
                }, 700); // After deck is updated
              }

              // Add message with immediate snapshot (will be updated after diff applied if available)
              console.log('[AgentChat:primary] Creating edit_applied message:', {
                hasImmediateSnapshot: !!immediateSnapshot,
                immediateSnapshotId: immediateSnapshot?.id,
                componentCount: immediateSnapshot?.components?.length || 0,
                hasPreEditSnapshot: !!preEditSnapshot,
                editId: appliedEditId
              });

              // Insert edit_applied message RIGHT AFTER the last AI message (not at end of array)
              // This ensures the rendering pairing logic works: AI message + adjacent edit_applied
              setMessages(prev => {
                const newMsg = {
                  id: messageId,
                  type: 'system' as const,
                  message: `✅ Edit applied`,
                  timestamp: new Date(),
                  feedback: null,
                  metadata: {
                    type: 'edit_applied',
                    compactRow: false,
                    showIcon: false,
                    slideSnapshot: immediateSnapshot, // Use immediate snapshot as fallback
                    preEditSnapshot, // For restoration
                    editId: appliedEditId,
                    editSummary
                  }
                };

                // Find the last AI message index
                let lastAiIndex = -1;
                for (let i = prev.length - 1; i >= 0; i--) {
                  if (prev[i].type === 'ai') {
                    lastAiIndex = i;
                    break;
                  }
                }

                // If found, insert right after it; otherwise append at end
                if (lastAiIndex >= 0) {
                  const result = [...prev];
                  result.splice(lastAiIndex + 1, 0, newMsg);
                  return result;
                }
                return [...prev, newMsg];
              });

              // Persist immediate snapshot as fallback (will be overwritten if diff-based capture succeeds)
              if (immediateSnapshot && agentClientRef.current && agentSessionId) {
                // Use a small delay to allow the diff-based capture to potentially run first
                setTimeout(() => {
                  // Only persist if the pendingPostEditCapture wasn't already handled
                  const pendingCapture = (window as any).__pendingPostEditCapture;
                  if (pendingCapture && pendingCapture.messageId === messageId) {
                    agentClientRef.current?.saveSlideSnapshot(agentSessionId, immediateSnapshot, editSummary, appliedEditId, preEditSnapshot)
                      .catch(err => console.warn('[AgentChat] Failed to persist immediate slideSnapshot:', err));
                  }
                }, 500);
              }

              // Prevent any trailing tool/progress lines from appearing after this
              agentFlowLockoutUntilRef.current = Date.now() + 1500;

              // NOTE: Preview guards are cleared in the diff application path below
              // This allows Supabase realtime updates to come through after backend persistence

              // Apply diff locally if we have it for instant component update; fallback to refresh
              try {
                const editId = appliedEditId;
                let diff = editId ? proposedDiffsRef.current.get(editId) : undefined;

                // CRITICAL FIX: Try to get deck_diff from the event data directly
                if (!diff && (evt as any).data?.deck_diff) {
                  diff = (evt as any).data.deck_diff;
                }

                if (diff) {
                  const before = useDeckStore.getState().deckData;
                  applyDeckDiffRespectingEditMode(diff, true);  // Pass true to indicate this is an edit diff

                  // Capture post-edit snapshot and update message with thumbnail
                  setTimeout(() => {
                    const after = useDeckStore.getState().deckData;

                    // Capture the post-edit state for thumbnail display
                    const pendingCapture = (window as any).__pendingPostEditCapture;
                    if (pendingCapture) {
                      const { messageId, editedSlideId, preEditSnapshot, editId: capturedEditId, editSummary } = pendingCapture;
                      delete (window as any).__pendingPostEditCapture;

                      // Find the edited slide in the updated deck
                      const slides = after?.slides || [];
                      const postEditSlide = editedSlideId
                        ? slides.find((s: any) => s.id === editedSlideId)
                        : slides[0]; // Fallback to first slide

                      if (postEditSlide) {
                        const postEditSnapshot = JSON.parse(JSON.stringify(postEditSlide));

                        // Update the message with the post-edit snapshot
                        setMessages(prev => prev.map(msg =>
                          msg.id === messageId
                            ? {
                                ...msg,
                                metadata: {
                                  ...msg.metadata,
                                  slideSnapshot: postEditSnapshot, // Show current state
                                  preEditSnapshot, // Keep for restoration
                                }
                              }
                            : msg
                        ));

                        // Persist to database (include preEditSnapshot for restore functionality)
                        if (agentClientRef.current && agentSessionId) {
                          agentClientRef.current.saveSlideSnapshot(agentSessionId, postEditSnapshot, editSummary, capturedEditId, preEditSnapshot)
                            .catch(err => console.warn('[AgentChat] Failed to persist slideSnapshot:', err));
                        }
                      }
                    }
                  }, 100); // Small delay to ensure state is fully updated

                  proposedDiffsRef.current.delete(editId);

                  // CRITICAL FIX: Mark slides as unchanged since backend has already persisted them
                  // This prevents false "unsaved changes" warnings and allows subsequent agent edits
                  try {
                    const editorStore = useEditorStore.getState();
                    ((diff as any).slides_to_update || []).forEach((slideDiff: any) => {
                      if (slideDiff?.slide_id && typeof editorStore.markSlideAsUnchanged === 'function') {
                        editorStore.markSlideAsUnchanged(slideDiff.slide_id);
                      }
                    });
                  } catch { }

                  // CRITICAL FIX: Keep preview guards active for 2 seconds to prevent Supabase realtime
                  // from overwriting agent-applied changes with stale data
                  // The local diff has already been applied, and we need to give the database time to commit
                  try {
                    const agentEditTimestamp = Date.now();
                    (window as any).__lastAgentEditTs = agentEditTimestamp;
                    // Clear the in-progress flag - edit is now complete
                    (window as any).__agentEditInProgress = false;

                    // CRITICAL FIX: If user entered edit mode during this AI edit, force a full draft resync
                    // This ensures drafts are properly initialized from the final deck state
                    if ((window as any).__enteredEditModeDuringAgentEdit && (window as any).__isEditMode) {
                      const freshEditorStore = useEditorStore.getState();
                      const freshDeckData = useDeckStore.getState().deckData;
                      const navContext = (window as any).__navigationContext;
                      const currentSlideIdx = navContext?.currentSlideIndex || 0;
                      const currentSlide = freshDeckData.slides?.[currentSlideIdx];
                      if (currentSlide?.id) {
                        // Clear and reinitialize drafts from the now-complete deck
                        freshEditorStore.clearDraftComponents(currentSlide.id);
                        freshEditorStore.initializeDraftComponents(currentSlide.id);
                      }
                      delete (window as any).__enteredEditModeDuringAgentEdit;
                    }

                    // Clear guards after 2 seconds to allow Supabase realtime to sync
                    setTimeout(() => {
                      if ((window as any).__pendingPreviewTs) delete (window as any).__pendingPreviewTs;
                      if ((window as any).__pendingPreviewEditId) delete (window as any).__pendingPreviewEditId;
                    }, 2000);
                  } catch { }

                  // NOTE: Don't force reload - let Supabase realtime handle it after the delay
                  // The local diff has already been applied for instant preview
                } else {
                  if (!diff && appliedMessageId) {
                    diff = pendingDiffsByMessageIdRef.current.get(appliedMessageId);
                    if (diff) {
                      pendingDiffsByMessageIdRef.current.delete(appliedMessageId);
                    }
                  }
                  // CRITICAL FIX: Try deck_diff from event data as final fallback
                  if (!diff && (evt as any).data?.deck_diff) {
                    diff = (evt as any).data.deck_diff;
                  }
                  if (diff) {
                    applyDeckDiffRespectingEditMode(diff, true);  // Pass true to indicate this is an edit diff

                    // CRITICAL FIX: Mark slides as unchanged since backend has already persisted them
                    try {
                      const editorStore = useEditorStore.getState();
                      ((diff as any).slides_to_update || []).forEach((slideDiff: any) => {
                        if (slideDiff?.slide_id && typeof editorStore.markSlideAsUnchanged === 'function') {
                          editorStore.markSlideAsUnchanged(slideDiff.slide_id);
                        }
                      });
                    } catch { }

                    // CRITICAL FIX: Keep preview guards active for 2 seconds
                    try {
                      const agentEditTimestamp = Date.now();
                      (window as any).__lastAgentEditTs = agentEditTimestamp;
                      // Clear the in-progress flag - edit is now complete
                      (window as any).__agentEditInProgress = false;

                      // CRITICAL FIX: If user entered edit mode during this AI edit, force a full draft resync
                      if ((window as any).__enteredEditModeDuringAgentEdit && (window as any).__isEditMode) {
                        const freshEditorStore = useEditorStore.getState();
                        const freshDeckData = useDeckStore.getState().deckData;
                        const navContext = (window as any).__navigationContext;
                        const currentSlideIdx = navContext?.currentSlideIndex || 0;
                        const currentSlide = freshDeckData.slides?.[currentSlideIdx];
                        if (currentSlide?.id) {
                          freshEditorStore.clearDraftComponents(currentSlide.id);
                          freshEditorStore.initializeDraftComponents(currentSlide.id);
                        }
                        delete (window as any).__enteredEditModeDuringAgentEdit;
                      }

                      // Clear guards after delay
                      setTimeout(() => {
                        if ((window as any).__pendingPreviewTs) delete (window as any).__pendingPreviewTs;
                        if ((window as any).__pendingPreviewEditId) delete (window as any).__pendingPreviewEditId;
                      }, 2000);
                    } catch { }

                    // NOTE: Backend has already persisted changes via auto-apply
                    // Don't call applyDraftChanges() here as it would pause subscriptions
                    // and block the incoming Supabase realtime update with the persisted data
                  } else {
                    // CRITICAL FIX: Clear preview guards even when no diff is found
                    // This allows Supabase realtime updates to come through
                    try {
                      if ((window as any).__pendingPreviewTs) delete (window as any).__pendingPreviewTs;
                      if ((window as any).__pendingPreviewEditId) delete (window as any).__pendingPreviewEditId;
                      // Clear the in-progress flag - edit is now complete (even without diff)
                      (window as any).__agentEditInProgress = false;

                      // CRITICAL FIX: If user entered edit mode during this AI edit, force a full draft resync
                      if ((window as any).__enteredEditModeDuringAgentEdit && (window as any).__isEditMode) {
                        const freshEditorStore = useEditorStore.getState();
                        const freshDeckData = useDeckStore.getState().deckData;
                        const navContext = (window as any).__navigationContext;
                        const currentSlideIdx = navContext?.currentSlideIndex || 0;
                        const currentSlide = freshDeckData.slides?.[currentSlideIdx];
                        if (currentSlide?.id) {
                          freshEditorStore.clearDraftComponents(currentSlide.id);
                          freshEditorStore.initializeDraftComponents(currentSlide.id);
                        }
                        delete (window as any).__enteredEditModeDuringAgentEdit;
                      }

                    } catch { }

                    const isEditing = typeof window !== 'undefined' && (window as any).__isEditMode === true;
                    if (normalizedAppliedSlides.length > 0) {
                      applyPreviewSlidesRespectingEditMode(normalizedAppliedSlides, true);  // Pass true - this is an agent edit
                    } else {
                      // CRITICAL FIX: Force reload deck from database since no local diff is available
                      // This ensures changes are visible regardless of edit mode or realtime status
                      setTimeout(() => {
                        (async () => {
                          try {
                            const deckStore = useDeckStore.getState();
                            const deckIdToRefresh = deckStore.deckData?.uuid || (deckStore.deckData as any)?.id;
                            if (!deckIdToRefresh) return;
                            const latest = await deckSyncService.getFullDeck(String(deckIdToRefresh));
                            if (latest && (latest as any).slides) {
                              deckStore.updateDeckData(latest as any, { skipBackend: true, isRealtimeUpdate: true });
                              return;
                            }
                          } catch (e) {
                            console.warn('[Realtime][edit.applied] Forced refetch failed (non-fatal)', e);
                          }
                          // Fallback to legacy store reload if available
                          try {
                            const deckStore = useDeckStore.getState();
                            if ((deckStore as any).loadDeck) {
                              (deckStore as any).loadDeck();
                            }
                          } catch { }
                        })();
                      }, 500); // Small delay to ensure backend write completes
                    }
                  }
                }
                // NOTE: Don't force reload here.
                // Let Supabase realtime handle it naturally since guards are cleared.
                // Forcing a reload can fetch stale data and replace the locally applied changes.
              } catch { }

              // Extra safety: for structural edits (add/remove/reorder slides), schedule a lightweight refetch.
              // This eliminates "I have to refresh the whole page to see the new slide" even if local diff
              // application was blocked by guards or realtime delivery was delayed.
              try {
                const deckStore = useDeckStore.getState();
                const deckIdToRefresh = deckStore.deckData?.uuid || (deckStore.deckData as any)?.id;
                const editId = appliedEditId;
                const diffMaybe = editId ? proposedDiffsRef.current.get(editId) : undefined;
                const needsStructuralRefresh =
                  !!(diffMaybe as any)?.slides_to_add?.length ||
                  !!(diffMaybe as any)?.slides_to_remove?.length ||
                  !!(diffMaybe as any)?.slide_order;

                if (deckIdToRefresh && needsStructuralRefresh) {
                  setTimeout(async () => {
                    try {
                      const latest = await deckSyncService.getFullDeck(String(deckIdToRefresh));
                      if (latest && (latest as any).slides) {
                        deckStore.updateDeckData(latest as any, { skipBackend: true, isRealtimeUpdate: true });
                      }
                    } catch (e) {
                      console.warn('[Realtime][edit.applied] Structural refetch failed (non-fatal)', e);
                    }
                  }, 600);
                }
              } catch { }

              } catch (handlerError) {
                // CRITICAL: Log any error in the handler so we know what's failing
                console.error('[ChatPanel:primary] ❌❌❌ deck.edit.applied HANDLER CRASHED!', handlerError);

                // Still try to create a basic edit_applied message so user sees something
                try {
                  setMessages(prev => [...prev, {
                    id: `applied-error-${Date.now()}`,
                    type: 'system',
                    message: `✅ Edit applied`,
                    timestamp: new Date(),
                    feedback: null,
                    metadata: {
                      type: 'edit_applied',
                      compactRow: false,
                      slideSnapshot: null,
                      preEditSnapshot: null,
                      editId: (evt as any).data?.editId
                    }
                  }]);
                } catch { }
              }
              return;
            }
            if (evt.type === 'progress.update') {
              const { phase, percent } = (evt as any).data || {};
              if (Date.now() < agentFlowLockoutUntilRef.current) return;
              upsertAgentProgressRow(phase, percent);
              return;
            }
          }
        }, token || undefined);
        // Use getOrCreateSession to resume existing sessions
        const sid = await client.getOrCreateSession(String(deckId), String(slideId), { agentProfile: 'authoring' });
        client.openWebSocket();
        agentClientRef.current = client;
        setAgentSessionId(sid);
        sessionSlideIdRef.current = slideId;

        // Load existing chat history ASYNC (store in oldMessages, don't auto-display)
        // This keeps the chat clean on load - user can click "Load older messages" to see history
        (async () => {
          try {
            const { messages: historyMessages } = await client.getMessages(sid, 50);
            if (historyMessages && historyMessages.length > 0) {
              const restoredMessages: ExtendedChatMessageProps[] = historyMessages
                .map((msg: any): ExtendedChatMessageProps | null => {
                  // Check for slideSnapshot attachment (for version restore)
                  const snapshotAttachment = msg.attachments?.find((a: any) => a.type === 'slide_snapshot');
                  if (snapshotAttachment) {
                    // Reconstruct edit_applied message with slideSnapshot thumbnail
                    // preEditData contains the state before the edit for restoration
                    return {
                      id: msg.id,
                      type: 'system' as const,
                      message: msg.text || '✅ Edit applied',
                      timestamp: new Date(msg.created_at),
                      feedback: null,
                      metadata: {
                        type: 'edit_applied',
                        compactRow: false,
                        slideSnapshot: snapshotAttachment.data,
                        preEditSnapshot: snapshotAttachment.preEditData, // For restore button
                        editId: snapshotAttachment.editId
                      }
                    };
                  }

                  // Filter out useless "Done! Proposed edit" messages without thumbnails
                  const text = (msg.text || '').trim();
                  if (msg.role === 'assistant' && (
                    text.startsWith('Done!') ||
                    text.includes('Proposed edit') ||
                    text === '✅ Edit applied' ||
                    text === ''
                  )) {
                    return null; // Will be filtered out
                  }

                  // Regular message (user or meaningful AI response)
                  const msgType: 'user' | 'ai' = msg.role === 'user' ? 'user' : 'ai';
                  return {
                    id: msg.id,
                    type: msgType,
                    message: msg.text || '',
                    timestamp: new Date(msg.created_at),
                    feedback: null,
                    metadata: {
                      attachments: msg.attachments || [],
                      selections: msg.selections || []
                    }
                  };
                })
                .filter((msg): msg is ExtendedChatMessageProps => msg !== null);
              // Store in oldMessages - don't auto-display, user can click to load
              setOldMessages(restoredMessages);
            }
          } catch (historyErr) {
            console.warn('[AgentChat] Failed to load chat history:', historyErr);
          }
        })();
      } catch (e) {
        console.warn('[AgentChat] init skipped:', e);
      }
    })();
    return () => {
      // Mark unmounting to help other monitors avoid background activity during navigation
      try { (window as any).__isUnmounting = true; } catch { }
      // Clear plan timers on unmount
      try { planTimersRef.current.forEach((id) => clearTimeout(id)); } catch { }
      planTimersRef.current = [];

      // Ensure we fully disconnect any active chat connections on unmount
      try {
        if (agentClientRef.current) {
          agentClientRef.current.disconnect();
        }
      } catch { }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ensure chat session/WS opens once deck/slide are available (handles late-loading data)
  useEffect(() => {
    try {
      if (agentClientRef.current || agentSessionId) return;
      const deckData = useDeckStore.getState().deckData;
      const deckId = deckData?.uuid || deckData?.id;
      const slideId = slides[currentSlideIndex]?.id;
      if (!deckId || !slideId) return;
      // Attempt to establish the session; internal guard prevents duplicate connects
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      ensureAgentSession();
    } catch { }
    // Re-run when slides list or current index change, or when we get a session
  }, [slides, currentSlideIndex, agentSessionId]);

  // Selection mode: attach global listeners to highlight/collect components
  useEffect(() => {
    const root = document;
    if (!isSelecting) {
      document.body.classList.remove('agent-select-mode');
      // Clear transient hover highlight
      if (hoveredElementId) {
        const prev = (document.querySelector(`.component-wrapper[data-component-id="${hoveredElementId}"]`) || document.querySelector(`[data-component-id="${hoveredElementId}"]`)) as HTMLElement | null;
        if (prev) prev.removeAttribute('data-agent-hover');
        setHoveredElementId(null);
      }
      return;
    }

    document.body.classList.add('agent-select-mode');

    const getRootForId = (id: string): HTMLElement | null => {
      return (
        document.querySelector(`.component-wrapper[data-component-id="${id}"]`) as HTMLElement | null ||
        document.querySelector(`[data-component-id="${id}"]`) as HTMLElement | null
      );
    };

    const applyHoverStyles = (node: HTMLElement | null) => {
      if (!node) return;
      // If already selected, keep selected visuals; don't downgrade to hover
      if (node.getAttribute('data-agent-selected') === 'true') return;
      node.setAttribute('data-agent-hover', 'true');
      node.style.outline = '2px dashed #22c55e';
      node.style.outlineOffset = '2px';
      node.style.boxShadow = 'inset 0 0 0 2px rgba(34,197,94,0.35)';
      node.style.position = node.style.position || 'relative';
      node.style.zIndex = String(Math.max(1000, Number(node.style.zIndex) || 0));
    };

    const clearHoverStyles = (node: HTMLElement | null) => {
      if (!node) return;
      node.removeAttribute('data-agent-hover');
      // If still selected, keep selected visuals
      if (node.getAttribute('data-agent-selected') === 'true') {
        node.style.outline = '2px solid #22c55e';
        node.style.outlineOffset = '2px';
        node.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.25)';
      } else {
        node.style.outline = '';
        node.style.outlineOffset = '';
        node.style.boxShadow = '';
      }
    };

    const applySelectedStyles = (node: HTMLElement | null) => {
      if (!node) return;
      node.setAttribute('data-agent-selected', 'true');
      node.style.outline = '2px solid #22c55e';
      node.style.outlineOffset = '2px';
      node.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.25)';
      node.style.position = node.style.position || 'relative';
      node.style.zIndex = String(Math.max(1000, Number(node.style.zIndex) || 0));
    };

    const clearSelectedStyles = (node: HTMLElement | null) => {
      if (!node) return;
      node.removeAttribute('data-agent-selected');
      node.style.outline = '';
      node.style.outlineOffset = '';
      node.style.boxShadow = '';
    };

    const handleMouseMove = (e: MouseEvent) => {
      // Always look up topmost element at cursor to avoid bubbling quirks/overlaps
      const elAtPoint = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const el = elAtPoint?.closest?.('[data-component-id]') as HTMLElement | null;
      const currentId = el?.getAttribute('data-component-id') || null;
      if (currentId === hoveredElementId) return;
      if (hoveredElementId) {
        const prev = getRootForId(hoveredElementId);
        clearHoverStyles(prev);
      }
      if (el && currentId) {
        const rootEl = getRootForId(currentId);
        // Don't show hover if already selected in our chips
        const isSelected = selectedElements.some(s => s.elementId === currentId);
        if (!isSelected) applyHoverStyles(rootEl);
        setHoveredElementId(currentId);
      } else {
        setHoveredElementId(null);
      }
    };

    const handleClickCapture = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const el = target?.closest?.('[data-component-id]') as HTMLElement | null;
      if (!el) return;
      const elementId = el.getAttribute('data-component-id') || '';
      const elementType = el.getAttribute('data-component-type');
      const slideContainer = el.closest('[data-slide-id]') as HTMLElement | null;
      const slideId = slideContainer?.getAttribute('data-slide-id') || null;

      // Collect bounds and overlaps for context
      const bounds = getComponentBounds(elementId);
      let overlaps: string[] = [];
      try {
        const deck = useDeckStore.getState().deckData;
        const slide = deck?.slides?.find((s: any) => s.id === slideId);
        const comps = Array.isArray(slide?.components) ? slide.components : [];
        overlaps = getOverlappingComponentIds(elementId, comps);
      } catch { }

      // Persist visual selection
      const rootEl = getRootForId(elementId);
      applySelectedStyles(rootEl);

      // Add to UI chips if not already added
      setSelectedElements(prev => {
        if (prev.some(s => s.elementId === elementId)) return prev; // de-dupe
        // Create a human-friendly label for the chip
        let chipLabel = '';
        try {
          const deckData = (useDeckStore as any).getState().deckData;
          const slidesArr = Array.isArray(deckData?.slides) ? deckData.slides : [];
          const slideIndex = slideId ? slidesArr.findIndex((s: any) => s?.id === slideId) : -1;
          const slideNumber = slideIndex >= 0 ? slideIndex + 1 : null;
          const slideTitle = slideIndex >= 0 && typeof slidesArr[slideIndex]?.title === 'string' ? slidesArr[slideIndex].title.trim() : '';
          const hasTitle = Boolean(slideTitle);
          const typeMap: Record<string, string> = {
            TiptapTextBlock: 'Text',
            TextBlock: 'Text',
            Shape: 'Shape',
            ShapeWithText: 'Shape',
            Image: 'Image',
            Logo: 'Logo',
            Icon: 'Icon',
            Chart: 'Chart',
            Table: 'Table',
            Video: 'Video',
            Slide: 'Slide',
          };
          const typeName = typeMap[String(elementType || '')] || String(elementType || 'Element');
          if (typeName === 'Slide' && slideNumber) {
            chipLabel = hasTitle ? `Slide ${slideNumber} — ${slideTitle}` : `Slide ${slideNumber}`;
          } else if (slideNumber) {
            chipLabel = hasTitle ? `${typeName} on Slide ${slideNumber} — ${slideTitle}` : `${typeName} on Slide ${slideNumber}`;
          } else {
            chipLabel = typeName;
          }
        } catch {
          chipLabel = `${elementType || 'Element'}`;
        }
        return [...prev, { elementId, elementType, slideId, label: chipLabel, overlaps, bounds }];
      });
    };

    const handleMouseOver = (e: MouseEvent) => handleMouseMove(e);

    const handleMouseOut = (e: MouseEvent) => {
      const related = (e as MouseEvent).relatedTarget as HTMLElement | null;
      const stillInsideComponent = related?.closest?.('[data-component-id]');
      if (!stillInsideComponent && hoveredElementId) {
        const prev = document.querySelector(`[data-component-id="${hoveredElementId}"]`) as HTMLElement | null;
        clearHoverStyles(prev);
        setHoveredElementId(null);
      }
    };

    root.addEventListener('mousemove', handleMouseMove, true);
    root.addEventListener('mouseover', handleMouseOver, true);
    root.addEventListener('mouseout', handleMouseOut, true);
    root.addEventListener('mouseleave', handleMouseOut, true);
    root.addEventListener('click', handleClickCapture, true);
    return () => {
      root.removeEventListener('mousemove', handleMouseMove, true);
      root.removeEventListener('mouseover', handleMouseOver, true);
      root.removeEventListener('mouseout', handleMouseOut, true);
      root.removeEventListener('mouseleave', handleMouseOut, true);
      root.removeEventListener('click', handleClickCapture, true);
      document.body.classList.remove('agent-select-mode');
    };
  }, [isSelecting, hoveredElementId]);

  // Ensure selected highlights persist across React re-renders of slide/components
  useEffect(() => {
    if (!isSelecting || selectedElements.length === 0) return;

    // Helper to get the canonical element for a component id
    const getRootEl = (id: string): HTMLElement | null => {
      return (
        document.querySelector(`.component-wrapper[data-component-id="${id}"]`) as HTMLElement | null ||
        document.querySelector(`[data-component-id="${id}"]`) as HTMLElement | null
      );
    };

    // Re-apply the selected attribute/styles so the bounding outline sticks
    const reapplySelections = () => {
      selectedElements.forEach(sel => {
        const el = getRootEl(sel.elementId);
        if (!el) return;
        if (el.getAttribute('data-agent-selected') !== 'true') {
          el.setAttribute('data-agent-selected', 'true');
        }
        // Keep these defensive style hints to ensure visibility above neighbors
        if (!el.style.position) {
          el.style.position = 'relative';
        }
        const currentZ = Number(el.style.zIndex) || 0;
        if (currentZ < 1000) {
          el.style.zIndex = String(1000);
        }
      });
    };

    // Initial apply in case a render just happened
    reapplySelections();

    // Observe slide container subtree for DOM replacements and re-apply as needed
    const containers = Array.from(document.querySelectorAll('.slide-container'));
    const observers: MutationObserver[] = [];
    containers.forEach(container => {
      const observer = new MutationObserver((mutations) => {
        // Cheap debounce via requestAnimationFrame
        if (mutations && mutations.length > 0) {
          requestAnimationFrame(reapplySelections);
        }
      });
      observer.observe(container, { childList: true, subtree: true });
      observers.push(observer);
    });

    return () => {
      observers.forEach(o => o.disconnect());
    };
  }, [isSelecting, selectedElements]);

  // Keep modes mutually exclusive: if slide edit mode turns on, exit chat selection
  useEffect(() => {
    if (isSlideEditing && isSelecting) {
      setIsSelecting(false);
      clearSelections();
    }
  }, [isSlideEditing]);

  // Broadcast chat selection mode to other UI (e.g., header) for hiding its Edit button
  useEffect(() => {
    try {
      window.dispatchEvent(new CustomEvent('chat:selection-mode-changed', { detail: { selecting: isSelecting } }));
    } catch { }
  }, [isSelecting]);

  const removeSelection = useCallback((elementId: string) => {
    setSelectedElements(prev => prev.filter(s => s.elementId !== elementId));
    const el = document.querySelector(`[data-component-id="${elementId}"]`) as HTMLElement | null;
    if (el) {
      el.removeAttribute('data-agent-selected');
      // Only clear visuals if not hovered anymore
      if (el.getAttribute('data-agent-hover') !== 'true') {
        el.style.outline = '';
        el.style.outlineOffset = '';
        el.style.boxShadow = '';
      } else {
        // keep hover visuals
        el.style.outline = '2px dashed #22c55e';
        el.style.outlineOffset = '2px';
        el.style.boxShadow = 'inset 0 0 0 2px rgba(34,197,94,0.35)';
      }
    }
  }, []);

  const clearSelections = useCallback(() => {
    setSelectedElements(prev => {
      prev.forEach(s => {
        const el = document.querySelector(`[data-component-id="${s.elementId}"]`) as HTMLElement | null;
        if (el) {
          el.removeAttribute('data-agent-selected');
          el.style.outline = '';
          el.style.outlineOffset = '';
          el.style.boxShadow = '';
        }
      });
      return [];
    });
    setHoveredElementId(null);
  }, []);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Ensure agent session exists before sending or registering uploads
  const ensureAgentSession = useCallback(async (): Promise<boolean> => {
    // IMPORTANT: Don't kill the session when switching slides!
    // The session should stay alive to receive edit completion events.
    // The diff contains the target slide_id, so edits apply to the correct slide.
    // We only create a new session if none exists.
    try {
      if (agentClientRef.current && agentSessionId) {
        // Session exists and is connected - keep it alive
        // Update the tracked slide ID for future messages
        const expectedSlideId = slides[currentSlideIndex]?.id;
        if (expectedSlideId) {
          sessionSlideIdRef.current = expectedSlideId;
        }
        return true;
      }
    } catch { }
    if (connectingRef.current) return connectingRef.current;
    connectingRef.current = (async () => {
      const deckData = useDeckStore.getState().deckData;
      const deckId = deckData?.uuid || deckData?.id;
      const slideId = slides[currentSlideIndex]?.id;
      if (!deckId || !slideId) { connectingRef.current = null; return false; }
      if (!API_CONFIG.AGENT_BASE_URL) { connectingRef.current = null; return false; }
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const client = new AgentChatClient({
          onEvent: (evt) => {
            if (!evt || !evt.type) return;
            // Debug: log ALL events to trace missing events
            if (evt.type === 'assistant.message.delta') {
              const rawDelta = (evt as any).data?.delta || '';
              const trimmed = String(rawDelta).trim();
              if (!streamingAiMsgIdRef.current && (trimmed === '' || /^\d+$/.test(trimmed))) {
                return;
              }
              const id = streamingAiMsgIdRef.current || `ai-stream-${Date.now()}`;
              if (!streamingAiMsgIdRef.current) {
                streamingAiMsgIdRef.current = id;
                setMessages(prev => [...prev, { id, type: 'ai', message: '', timestamp: new Date(), feedback: null }]);
              }
              setMessages(prev => prev.map(m => {
                if (m.id !== id) return m;
                const current = String(m.message || '');
                if (current.trim().length === 0 && /^\d+$/.test(trimmed)) {
                  return m;
                }
                const next = humanizeSystemPhrases(current + rawDelta);
                return { ...m, message: next };
              }));
              return;
            }
            if (evt.type === 'assistant.message.complete') {
              const doneId = (evt as any).data?.messageId || streamingAiMsgIdRef.current;
              if (doneId) {
                setMessages(prev => {
                  const msg = prev.find(m => m.id === doneId);
                  if (!msg) return prev;
                  const text = String(msg.message ?? '').trim();
                  if (text === '' || /^\d+$/.test(text)) {
                    return prev.filter(m => m.id !== doneId);
                  }
                  const humanized = humanizeSystemPhrases(text);
                  return prev.map(m => m.id === doneId ? { ...m, message: humanized } : m);
                });
              }
              streamingAiMsgIdRef.current = null;

              // CRITICAL: Clean up plan message when assistant completes
              clearPlanTimers();
              if (planMsgIdRef.current) {
                const planId = planMsgIdRef.current;
                setMessages(prev => prev.filter(m => m.id !== planId));
                planMsgIdRef.current = null;
                planCreatedAtRef.current = null;
              }
              return;
            }
            // LinkedIn profile search results (secondary client)
            if (evt.type === 'assistant.linkedin_profiles') {
              const { query, profiles: rawProfiles, isLoading } = (evt as any).data || {};
              const profiles = rawProfiles || [];
              console.log('[LinkedIn-Secondary] Event received:', { query, profileCount: profiles.length, isLoading, profiles });
              const linkedinMsgId = `linkedin-${Date.now()}`;

              if (isLoading) {
                setMessages(prev => [...prev, {
                  id: linkedinMsgId,
                  type: 'ai',
                  message: `Searching LinkedIn for "${query}"...`,
                  timestamp: new Date(),
                  feedback: null,
                  metadata: { type: 'linkedin_profiles', query, profiles: [], isLoading: true }
                }]);
              } else {
                setMessages(prev => {
                  const loadingMsgIndex = prev.findIndex(m =>
                    m.metadata?.type === 'linkedin_profiles' &&
                    m.metadata?.query === query &&
                    m.metadata?.isLoading === true
                  );
                  const resultMsg = {
                    id: loadingMsgIndex >= 0 ? prev[loadingMsgIndex].id : linkedinMsgId,
                    type: 'ai' as const,
                    message: profiles.length > 0
                      ? `Found ${profiles.length} profile${profiles.length === 1 ? '' : 's'} for "${query}"`
                      : `No profiles found for "${query}"`,
                    timestamp: new Date(),
                    feedback: null,
                    metadata: { type: 'linkedin_profiles', query, profiles, isLoading: false }
                  };
                  if (loadingMsgIndex >= 0) {
                    return prev.map((m, i) => i === loadingMsgIndex ? resultMsg : m);
                  }
                  return [...prev, resultMsg];
                });
              }
              return;
            }
            if ((evt as any).type === 'agent.plan.update') {
              const steps: string[] = (evt as any).data?.plan?.map((s: any) => s.title) || [];
              animatePlanMessage(steps);
              return;
            }
            if ((evt as any).type === 'agent.selection.using' || (evt as any).type === 'agent.selection') {
              const label = (evt as any).data?.label || (evt as any).data?.selection || 'selection';
              appendSelectionRow(label);
              return;
            }
            if (evt.type?.startsWith('agent.tool.')) {
              const { tool } = (evt as any).data || {};
              // Extract status from event type (e.g., 'agent.tool.start' -> 'start')
              const statusFromType = evt.type.replace('agent.tool.', '');
              const status = (evt as any).data?.status || statusFromType;
              console.log('[ChatPanel] Tool event (secondary):', { type: evt.type, tool, status });
              appendToolRow(tool, status);
              if (isStyleTool(tool)) {
                if (status === 'start') {
                  styleToolStateRef.current = { active: true, name: tool, lastStartTs: Date.now(), lastFinishTs: styleToolStateRef.current.lastFinishTs };
                } else if (status === 'finish' || status === 'error') {
                  styleToolStateRef.current = { active: false, name: tool, lastStartTs: styleToolStateRef.current.lastStartTs, lastFinishTs: Date.now() };
                }
              }
              return;
            }
            if (evt.type === 'deck.edit.proposed') {
              const summary = (evt as any).data?.edit?.summary || 'Proposed edit available';
              setMessages(prev => [...prev, { id: `proposed-${Date.now()}`, type: 'system', message: `✨ ${summary}`, timestamp: new Date(), feedback: null, metadata: { type: 'edit_proposed' } }]);
              return;
            }
            if (evt.type === 'deck.preview.diff') {
              const diff = (evt as any).data?.diff;
              try {
                // IMPORTANT: Capture slide state BEFORE applying the diff for restore functionality
                try {
                  const deckStore = useDeckStore.getState();
                  const slides = deckStore.deckData?.slides || [];

                  // Get the slide IDs being modified from the diff (uses slide_id field)
                  const slidesToUpdate = diff?.slides_to_update || [];
                  const modifiedSlideIds = slidesToUpdate.map((s: any) => s.slide_id || s.id).filter(Boolean);


                  if (modifiedSlideIds.length > 0) {
                    // Capture the FIRST modified slide
                    const targetSlideId = modifiedSlideIds[0];
                    const originalSlide = slides.find((s: any) => s.id === targetSlideId);
                    if (originalSlide) {
                      (window as any).__preEditSlideSnapshot = JSON.parse(JSON.stringify(originalSlide));
                    } else {
                      console.warn('[AgentChat] Could not find slide with id:', targetSlideId, 'in deck slides:', slides.map((s: any) => s.id));
                    }
                  } else {
                    // Fallback: use current slide from navigation context
                    const navContext = (window as any).__navigationContext;
                    const currentSlideIdx = navContext?.currentSlideIndex || 0;
                    const currentSlide = slides[currentSlideIdx];
                    if (currentSlide) {
                      (window as any).__preEditSlideSnapshot = JSON.parse(JSON.stringify(currentSlide));
                    }
                  }
                } catch (e) {
                  console.warn('[AgentChat] Failed to capture pre-edit snapshot:', e);
                }

                // Mark that a preview has been applied so realtime DB updates older than this are ignored
                try {
                  (window as any).__pendingPreviewTs = Date.now();
                  // CRITICAL: Mark that an AI edit is in progress
                  (window as any).__agentEditInProgress = true;
                } catch { }
                if (diff) {
                  applyDeckDiffRespectingEditMode(diff, true);  // Pass true - this is an edit preview
                }
              } catch { }
              return;
            }
            if (evt.type === 'deck.edit.applied') {
              // WRAP ENTIRE HANDLER IN TRY-CATCH to prevent silent failures
              try {
                console.warn('[ChatPanel:secondary] 🎯🎯🎯 deck.edit.applied EVENT RECEIVED (secondary)! 🎯🎯🎯', evt);

                // CRITICAL: Clear plan message immediately when edit is applied
                clearPlanTimers();
                if (planMsgIdRef.current) {
                  const planId = planMsgIdRef.current;
                  setMessages(prev => prev.filter(m => m.id !== planId));
                  planMsgIdRef.current = null;
                  planCreatedAtRef.current = null;
                }

                const rawDiff2 = (evt as any).data?.deck_diff;

                // DEDUP: Prevent duplicate handling from multiple subscriptions
                // Safety check: ensure ref is initialized as a Set
                if (!processedEditEventsRef.current) {
                  processedEditEventsRef.current = new Set();
                }
                const eventKey = `${(evt as any).data?.editId || ''}-${(evt as any).timestamp || Date.now()}`;
                if (processedEditEventsRef.current.has(eventKey)) {
                  return;
                }
                processedEditEventsRef.current.add(eventKey);
                setTimeout(() => processedEditEventsRef.current?.delete(eventKey), 10000);

                // CRITICAL FIX: Actually apply the deck_diff to the store!
                const deckDiff = (evt as any).data?.deck_diff;
                if (deckDiff && isValidDeckDiff(deckDiff)) {
                  applyDeckDiffRespectingEditMode(deckDiff, true);
                }

                // Keep pre-edit snapshot for restoration
                const preEditSnapshot = (window as any).__preEditSlideSnapshot || null;
                (window as any).__preEditSlideSnapshot = null;

                const editId = (evt as any).data?.editId;

                // Capture post-edit state (current slide after edit applied)
                let postEditSnapshot = null;
                try {
                  const deckStore = useDeckStore.getState();
                  const diffSlidesToUpdate = (evt as any).data?.deck_diff?.slides_to_update || [];
                  const diffSlidesToAdd = (evt as any).data?.deck_diff?.slides_to_add || [];
                  // Prefer newly added slides for thumbnail
                  const editedSlideId = diffSlidesToAdd[0]?.id || diffSlidesToUpdate[0]?.slide_id || diffSlidesToUpdate[0]?.id || preEditSnapshot?.id;
                  const isNewSlide = diffSlidesToAdd.length > 0;

                  const slides = deckStore.deckData?.slides || [];
                  const currentIdx = deckStore.currentSlideIndex || 0;

                  // For new slides, get the slide data directly from the diff
                  if (isNewSlide && diffSlidesToAdd[0]) {
                    postEditSnapshot = JSON.parse(JSON.stringify(diffSlidesToAdd[0]));
                    console.log('[AgentChat:secondary] Using new slide from diff:', postEditSnapshot?.id);
                  } else {
                    // Use current slide index as better fallback
                    const postEditSlide = editedSlideId
                      ? slides.find((s: any) => s.id === editedSlideId)
                      : slides[currentIdx] || slides[0];
                    if (postEditSlide) {
                      postEditSnapshot = JSON.parse(JSON.stringify(postEditSlide));
                      console.log('[AgentChat:secondary] Using slide for snapshot:', postEditSlide.id);
                    }
                  }

                  // ULTIMATE FALLBACK
                  if (!postEditSnapshot && slides.length > 0) {
                    postEditSnapshot = JSON.parse(JSON.stringify(slides[currentIdx] || slides[0]));
                    console.log('[AgentChat:secondary] ULTIMATE FALLBACK:', postEditSnapshot?.id);
                  }

                  console.log('[AgentChat:secondary] Snapshot result:', {
                    hasSnapshot: !!postEditSnapshot,
                    snapshotId: postEditSnapshot?.id,
                    hasComponents: !!postEditSnapshot?.components,
                    componentCount: postEditSnapshot?.components?.length || 0
                  });

                  // AUTO-NAVIGATE to newly created slide
                  if (isNewSlide && editedSlideId) {
                    setTimeout(() => {
                      const newSlideIndex = deckStore.deckData?.slides?.findIndex((s: any) => s.id === editedSlideId);
                      if (newSlideIndex !== undefined && newSlideIndex >= 0) {
                        setCurrentSlideIndexSafe(newSlideIndex);
                      }
                    }, 700);
                  }
                } catch (e) {
                  console.error('[AgentChat] Failed to capture post-edit snapshot (secondary):', e);
                }

                console.log('[AgentChat:secondary] Creating edit_applied message:', {
                  hasPostEditSnapshot: !!postEditSnapshot,
                  postEditSnapshotId: postEditSnapshot?.id,
                  componentCount: postEditSnapshot?.components?.length || 0,
                  hasPreEditSnapshot: !!preEditSnapshot,
                  editId
                });

                // Insert edit_applied message RIGHT AFTER the last AI message (not at end of array)
                // This ensures the rendering pairing logic works: AI message + adjacent edit_applied
                setMessages(prev => {
                  const newMsg = {
                    id: `applied-${Date.now()}`,
                    type: 'system' as const,
                    message: `✅ Edit applied`,
                    timestamp: new Date(),
                    feedback: null,
                    metadata: {
                      type: 'edit_applied',
                      compactRow: false,
                      slideSnapshot: postEditSnapshot, // Show current state (may be null)
                      preEditSnapshot, // For restoration
                      editId
                    }
                  };

                  // Find the last AI message index
                  let lastAiIndex = -1;
                  for (let i = prev.length - 1; i >= 0; i--) {
                    if (prev[i].type === 'ai') {
                      lastAiIndex = i;
                      break;
                    }
                  }

                  // If found, insert right after it; otherwise append at end
                  if (lastAiIndex >= 0) {
                    const result = [...prev];
                    result.splice(lastAiIndex + 1, 0, newMsg);
                    return result;
                  }
                  return [...prev, newMsg];
                });

                // Persist postEditSnapshot to database for chat history (include preEditSnapshot for restore)
                if (postEditSnapshot && agentClientRef.current && agentSessionId) {
                  agentClientRef.current.saveSlideSnapshot(agentSessionId, postEditSnapshot, '', editId, preEditSnapshot)
                    .catch(err => console.warn('[AgentChat] Failed to persist slideSnapshot (secondary):', err));
                }

                // NOTE: Do NOT clear preview guards here - the primary handler keeps them active for 2 seconds
                // to protect against stale Supabase realtime updates overwriting the edit
                // The guards are cleared in the primary handler after a 2-second delay

                // Persist immediately in edit mode to avoid losing AI changes when toggling modes
                try {
                  const isEditing = typeof window !== 'undefined' && (window as any).__isEditMode === true;
                  if (isEditing) {
                    const editorStore = useEditorStore.getState();
                    if (typeof editorStore.applyDraftChanges === 'function') {
                      editorStore.applyDraftChanges();
                    }
                  }
                } catch { }

              } catch (handlerError) {
                // CRITICAL: Log any error in the handler so we know what's failing
                console.error('[ChatPanel:secondary] ❌❌❌ deck.edit.applied HANDLER CRASHED!', handlerError);

                // Still try to create a basic edit_applied message so user sees something
                try {
                  setMessages(prev => [...prev, {
                    id: `applied-error-${Date.now()}`,
                    type: 'system',
                    message: `✅ Edit applied`,
                    timestamp: new Date(),
                    feedback: null,
                    metadata: {
                      type: 'edit_applied',
                      compactRow: false,
                      slideSnapshot: null,
                      preEditSnapshot: null,
                      editId: (evt as any).data?.editId
                    }
                  }]);
                } catch { }
              }

              return;
            }
            if (evt.type === 'progress.update') {
              const { phase, percent } = (evt as any).data || {};
              const existingId = agentProgressMsgIdRef.current;
              const text = `${phase || 'Working'}… ${percent ?? 0}%`;
              if (existingId) {
                setMessages(prev => prev.map(m => m.id === existingId ? { ...m, message: text, metadata: { ...m.metadata, type: 'progress', compactRow: true, phase, percent } } : m));
              } else {
                const id3 = `progress-${Date.now()}`;
                agentProgressMsgIdRef.current = id3;
                setMessages(prev => [...prev, { id: id3, type: 'system', message: text, timestamp: new Date(), feedback: null, metadata: { type: 'progress', compactRow: true, phase, percent } }]);
              }
              return;
            }
          }
        }, token || undefined);
        // Use getOrCreateSession to resume existing sessions
        const sid = await client.getOrCreateSession(String(deckId), String(slideId), { agentProfile: 'authoring' });
        client.openWebSocket();
        agentClientRef.current = client;
        setAgentSessionId(sid);
        sessionSlideIdRef.current = slideId;

        // Load existing chat history ASYNC (store in oldMessages, don't auto-display)
        (async () => {
          try {
            const { messages: historyMessages } = await client.getMessages(sid, 50);
            if (historyMessages && historyMessages.length > 0) {
              const restoredMessages: ExtendedChatMessageProps[] = historyMessages
                .map((msg: any): ExtendedChatMessageProps | null => {
                  // Check for slideSnapshot attachment (for version restore)
                  const snapshotAttachment = msg.attachments?.find((a: any) => a.type === 'slide_snapshot');
                  if (snapshotAttachment) {
                    // Reconstruct edit_applied message with slideSnapshot thumbnail
                    // preEditData contains the state before the edit for restoration
                    return {
                      id: msg.id,
                      type: 'system' as const,
                      message: msg.text || '✅ Edit applied',
                      timestamp: new Date(msg.created_at),
                      feedback: null,
                      metadata: {
                        type: 'edit_applied',
                        compactRow: false,
                        slideSnapshot: snapshotAttachment.data,
                        preEditSnapshot: snapshotAttachment.preEditData, // For restore button
                        editId: snapshotAttachment.editId
                      }
                    };
                  }

                  // Filter out useless "Done! Proposed edit" messages without thumbnails
                  const text = (msg.text || '').trim();
                  if (msg.role === 'assistant' && (
                    text.startsWith('Done!') ||
                    text.includes('Proposed edit') ||
                    text === '✅ Edit applied' ||
                    text === ''
                  )) {
                    return null; // Will be filtered out
                  }

                  // Regular message (user or meaningful AI response)
                  const msgType: 'user' | 'ai' = msg.role === 'user' ? 'user' : 'ai';
                  return {
                    id: msg.id,
                    type: msgType,
                    message: msg.text || '',
                    timestamp: new Date(msg.created_at),
                    feedback: null,
                    metadata: {
                      attachments: msg.attachments || [],
                      selections: msg.selections || []
                    }
                  };
                })
                .filter((msg): msg is ExtendedChatMessageProps => msg !== null);
              // Store in oldMessages - don't auto-display
              setOldMessages(prev => {
                const existingIds = new Set(prev.map(m => m.id));
                const newMsgs = restoredMessages.filter(m => !existingIds.has(m.id));
                return [...newMsgs, ...prev];
              });
            }
          } catch (historyErr) {
            console.warn('[AgentChat] Failed to load chat history:', historyErr);
          }
        })();

        connectingRef.current = null;
        return true;
      } catch (err) {
        console.warn('[AgentChat] ensureAgentSession failed:', err);
        connectingRef.current = null;
        return false;
      }
    })();
    return connectingRef.current;
  }, [currentSlideIndex, slides]);

  const processAndRegisterFiles = useCallback(async (files: File[]) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    isUploadingRef.current = true;
    try {
      const hasSession = await ensureAgentSession();
      if (!hasSession || !agentClientRef.current || !agentSessionId) {
        setMessages(prev => [...prev, { id: `sys-${Date.now()}`, type: 'system', message: 'Upload skipped: agent session unavailable', timestamp: new Date(), feedback: null }]);
        return;
      }
      const client = agentClientRef.current;
      const uploaded = await Promise.all(files.map(async (file) => {
        const url = await uploadFile(file);
        const meta = {
          sessionId: agentSessionId,
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          url,
        };
        try {
          const res = await client.registerUploadComplete(meta);
          const att = res.attachment;
          return { name: att.name, mimeType: att.mimeType, size: att.size, url: att.url, attachmentId: att.id } as RegisteredAttachment;
        } catch {
          // If registration fails, still keep the uploaded file so agent can use URL
          return { name: meta.name, mimeType: meta.mimeType, size: meta.size, url: meta.url } as RegisteredAttachment;
        }
      }));
      // Replace pending attachments with the registered ones, but PRESERVE the file and previewUrl
      // Build the new attachments array synchronously from current ref
      const next = [...attachmentsRef.current];
      uploaded.forEach(reg => {
        const idx = next.findIndex(a => (a as any).file && a.name === reg.name && (a as any).size === reg.size);
        if (idx !== -1) {
          // IMPORTANT: Preserve the file reference and previewUrl from the original pending attachment
          // These are needed for base64 conversion and visual preview
          const original = next[idx] as any;
          next[idx] = {
            ...reg,
            file: original.file,
            previewUrl: original.previewUrl,
            type: original.type || reg.mimeType // Ensure type is preserved
          };
        } else {
          next.push(reg);
        }
      });

      // CRITICAL: Update ref SYNCHRONOUSLY before React batches the setState
      attachmentsRef.current = next;

      setAttachments(next);
    } catch (err) {
      console.error('Attachment upload/register failed', err);
      setMessages(prev => [...prev, { id: `sys-${Date.now()}`, type: 'system', message: 'File upload failed. Please try again.', timestamp: new Date(), feedback: null }]);
    } finally {
      setIsUploading(false);
      isUploadingRef.current = false;
    }
  }, [ensureAgentSession, agentSessionId, setMessages]);

  // (removed file intent confirmation flow)

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Create file objects with previews
    const filesWithPreviews = files.map(file => ({
      file,
      previewUrl: file.type.startsWith('image/') ? createImagePreview(file) : undefined
    }));

    // Add directly without asking; model will infer how to use the files.
    const pending: PendingAttachment[] = filesWithPreviews.map(({ file, previewUrl }) => ({
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      file,
      previewUrl
    }));

    // CRITICAL: Update ref SYNCHRONOUSLY before React batches the setState
    const newAttachments = [...attachmentsRef.current, ...pending];
    attachmentsRef.current = newAttachments;

    setAttachments(newAttachments);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    processAndRegisterFiles(files);
    // reset for same-name file selection again
    e.target.value = '';
  }, [processAndRegisterFiles]);

  // Panel-wide drag & drop handlers to allow dropping anywhere on the chat panel
  const onDragEnterPanel = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    setIsDraggingOver(true);
  }, []);
  const onDragOverPanel = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  }, [isDraggingOver]);
  const onDragLeavePanel = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDraggingOver(false);
    }
  }, []);
  const onDropPanel = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;

    // Create file objects with previews
    const filesWithPreviews = files.map(file => ({
      file,
      previewUrl: file.type.startsWith('image/') ? createImagePreview(file) : undefined
    }));

    // Add directly without asking; model will infer how to use the files.
    const pending: PendingAttachment[] = filesWithPreviews.map(({ file, previewUrl }) => ({
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      file,
      previewUrl
    }));

    // CRITICAL: Update ref SYNCHRONOUSLY before React batches the setState
    const newAttachments = [...attachmentsRef.current, ...pending];
    attachmentsRef.current = newAttachments;

    setAttachments(newAttachments);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    processAndRegisterFiles(files);
  }, [processAndRegisterFiles, setMessages]);

  // (duplicate definition removed)

  // Effect to add/update system messages (streaming progress and normal)
  useEffect(() => {
    if (!newSystemMessage) return;
    const isStreaming = Boolean((newSystemMessage as any).metadata?.isStreamingUpdate || typeof (newSystemMessage as any).metadata?.progress === 'number');
    const hasText = typeof newSystemMessage.message === 'string' && newSystemMessage.message.length > 0;
    // Only skip when no text and not a streaming update
    if (!hasText && !isStreaming) return;
    // Always upsert streaming progress into a single row to avoid duplicates
    if (isStreaming) {
      const meta = (newSystemMessage.metadata || {}) as any;
      const percent = typeof meta.progress === 'number' ? meta.progress : undefined;
      const text = String(newSystemMessage.message || '');
      const looksLikeDone = (typeof percent === 'number' && percent >= 100) || /generated\s+\d+\s+of\s+\d+\s+slides/i.test(text) || /\b100%\b/.test(text);
      if (looksLikeDone) {
        // CRITICAL: Skip completion messages if generation didn't start in this session
        // This prevents showing "Your presentation is ready!" when opening existing decks
        if (!generationStartedInSessionRef.current && isExistingDeck) {
          console.log('[ChatPanel] Skipping completion message - existing deck, no generation in session');
          return;
        }
        // Convert to a single completion message + immediate instructions
        setIsGenerating(false);
        setMessages(prevMessages => {
          // If we already have a completion message, don't add another
          const hasCompletion = prevMessages.some(m => m.metadata?.type === 'generation_complete' || (typeof m.message === 'string' && m.message.includes('Your presentation is ready!')));
          const completionMessage: ExtendedChatMessageProps = {
            id: 'generation-complete',
            type: 'ai',
            message: 'Your presentation is ready!',
            timestamp: new Date(),
            feedback: null,
            metadata: { ...meta, type: 'generation_complete', stage: 'generation_complete', progress: 100, isStreamingUpdate: true }
          } as any;
          const instructionMessage: ExtendedChatMessageProps = {
            id: `instruction-${Date.now()}`,
            type: 'ai',
            message: "I can refine, redesign, or fix anything here. Drop an image for inspiration, data to chart, or a screenshot to inspire me. Try: 'Make this cleaner,' 'Redesign this slide,' or 'Add a chart from this data.'",
            timestamp: new Date(),
            feedback: null,
            metadata: { type: 'info', isSystemEvent: true }
          } as any;
          const idx = prevMessages.findIndex(msg => msg.id === 'generation-progress');
          if (idx !== -1) {
            const updated = [...prevMessages];
            updated[idx] = completionMessage;
            if (!hasCompletion) {
              updated.splice(idx + 1, 0, instructionMessage);
            }
            return updated;
          }
          if (hasCompletion) {
            return prevMessages; // Already handled
          }
          return [...prevMessages, completionMessage, instructionMessage];
        });
        return;
      }
      // Normal streaming progress upsert
      const systemMessageToAdd: ExtendedChatMessageProps = {
        id: 'generation-progress',
        type: 'ai',
        message: newSystemMessage.message || '',
        timestamp: new Date(),
        feedback: null,
        metadata: { ...(newSystemMessage.metadata || {}), isStreamingUpdate: true }
      } as any;
      setMessages(prevMessages => {
        const existingProgressIndex = prevMessages.findIndex(msg => msg.id === 'generation-progress');
        if (existingProgressIndex !== -1) {
          const updated = [...prevMessages];
          updated[existingProgressIndex] = { ...systemMessageToAdd, timestamp: updated[existingProgressIndex].timestamp } as any;
          return updated;
        }
        // Replace a welcome row if present; otherwise append
        if (prevMessages.length >= 1 && (prevMessages[0].id === 'welcome-message')) {
          return [{ ...systemMessageToAdd, id: 'generation-progress' }];
        }
        return [...prevMessages, { ...systemMessageToAdd, id: 'generation-progress' }];
      });
      return;
    }
    {
      // Log all incoming messages for debugging

      // Create a unique ID for this message based on content and metadata
      const messageKey = `${newSystemMessage.message}-${JSON.stringify(newSystemMessage.metadata)}`;
      const messageId = `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Check if we've already processed this exact message
      if (processedMessageIds.has(messageKey)) {
        return;
      }

      // Add to processed messages
      setProcessedMessageIds(prev => new Set([...prev, messageKey]));

      const systemMessageToAdd: ExtendedChatMessageProps = {
        id: messageId,
        type: 'ai',
        message: newSystemMessage.message,
        timestamp: new Date(),
        feedback: null,
        metadata: newSystemMessage.metadata || { isSystemEvent: true }
      };
      // Suppress stray numeric-only messages except for streaming updates
      try {
        const just = String(systemMessageToAdd.message ?? '').trim();
        const streaming = Boolean(systemMessageToAdd.metadata?.isStreamingUpdate);
        if (just === '0' && !streaming) {
          return;
        }
      } catch { }

      // Special handling for images_collected events - update existing message or add new one
      if (systemMessageToAdd.metadata?.type === 'images_collected') {

        setMessages(prevMessages => {
          // Find existing images_collected message
          const existingImagesIndex = prevMessages.findIndex(msg =>
            msg.metadata?.type === 'images_collected'
          );

          if (existingImagesIndex !== -1) {
            // Update existing images_collected message

            const updatedMessages = [...prevMessages];
            updatedMessages[existingImagesIndex] = {
              ...updatedMessages[existingImagesIndex],
              message: systemMessageToAdd.message,
              metadata: {
                ...updatedMessages[existingImagesIndex].metadata,
                ...systemMessageToAdd.metadata
              },
              timestamp: new Date()
            };
            return updatedMessages;
          } else {
            // Add new images_collected message if none exists

            return [...prevMessages, systemMessageToAdd];
          }
        });
        return;
      }



      // Skip "Deck composition completed successfully!" messages with 0% progress
      if ((systemMessageToAdd.message.includes('Deck composition completed successfully') ||
        systemMessageToAdd.message.includes('Deck generation complete')) &&
        systemMessageToAdd.metadata?.progress === 0) {
        console.log('🚫 Skipping duplicate/incorrect completion message with 0% progress');
        return;
      }

      // Also skip any "Deck composition completed successfully!" messages that shouldn't appear
      // This message should be replaced with the user-friendly completion message
      if (systemMessageToAdd.message === 'Deck composition completed successfully!' ||
        systemMessageToAdd.message === 'Deck generation complete!') {
        console.log('🚫 Skipping raw completion message - should use user-friendly version');
        return;
      }

      setMessages(prevMessages => {
        // Update generation state based on message type
        if (systemMessageToAdd.metadata?.isStreamingUpdate) {
          // If deck already completed, ignore streaming updates and set isGenerating false
          try {
            const deckData = (useDeckStore as any).getState().deckData;
            const allCompleted = Array.isArray(deckData?.slides) && deckData.slides.length > 0 && deckData.slides.every((s: any) => s.status === 'completed');
            if (allCompleted) {
              setIsGenerating(false);
              return prevMessages;
            }
          } catch { }
          if (systemMessageToAdd.metadata?.type === 'generation_complete' ||
            systemMessageToAdd.metadata?.progress === 100) {
            setIsGenerating(false);
          } else if (systemMessageToAdd.metadata?.type === 'generation_status' ||
            systemMessageToAdd.metadata?.stage) {
            setIsGenerating(true);
            // Mark that generation actually started in this session
            generationStartedInSessionRef.current = true;
          }
        }

        // Skip info messages if we're still generating
        // But allow info messages after generation is complete
        if (systemMessageToAdd.metadata?.type === 'info') {
          const progressMessage = prevMessages.find(msg => msg.id === 'generation-progress');
          const hasActiveGeneration = progressMessage &&
            progressMessage.metadata?.type !== 'generation_complete' &&
            progressMessage.metadata?.progress < 100;

          if (hasActiveGeneration) {
            console.log('🔄 Skipping info message during generation');
            return prevMessages;
          }
        }

        // Always consolidate streaming updates into a single progress message
        if (systemMessageToAdd.metadata?.isStreamingUpdate &&
          systemMessageToAdd.metadata?.type !== 'generation_complete' &&
          systemMessageToAdd.metadata?.type !== 'info') {
          const existingProgressIndex = prevMessages.findIndex(msg =>
            msg.id === 'generation-progress' ||
            (msg.metadata?.isStreamingUpdate && msg.metadata?.type !== 'generation_complete' && msg.metadata?.type !== 'info')
          );

          if (existingProgressIndex !== -1) {
            // Update existing progress message
            const updatedMessages = [...prevMessages];
            updatedMessages[existingProgressIndex] = {
              ...systemMessageToAdd,
              id: 'generation-progress',
              timestamp: updatedMessages[existingProgressIndex].timestamp // Keep original timestamp
            };
            return updatedMessages;
          } else {
            // First progress message - replace welcome if exists
            if (prevMessages.length >= 1 && (prevMessages[0].id === 'welcome-message' || prevMessages[0].id === 'generation-progress')) {
              return [{ ...systemMessageToAdd, id: 'generation-progress' }];
            }
            // Add as new progress message
            return [...prevMessages, { ...systemMessageToAdd, id: 'generation-progress' }];
          }
        }

        // Check if this is a progress update (but NOT a completion message)
        const isProgressUpdate = systemMessageToAdd.metadata?.isStreamingUpdate === true &&
          systemMessageToAdd.metadata?.type !== 'generation_complete' &&
          systemMessageToAdd.metadata?.type !== 'info';

        // Check if this is a completion message
        const isCompletionMessage = systemMessageToAdd.metadata?.type === 'generation_complete' ||
          systemMessageToAdd.metadata?.stage === 'generation_complete' ||
          systemMessageToAdd.message.includes('Your presentation is ready!');


        // If it's a completion message, replace the progress message
        if (isCompletionMessage) {
          // Check if we already have a completion message
          const existingCompletionIndex = prevMessages.findIndex(msg =>
            msg.metadata?.type === 'generation_complete' ||
            msg.metadata?.stage === 'generation_complete' ||
            msg.message.includes('Your presentation is ready!')
          );

          if (existingCompletionIndex !== -1) {
            // We already have a completion message, don't add another
            console.log('🚫 Skipping duplicate completion message');
            return prevMessages;
          }

          // Find and replace the progress message
          const progressMessageIndex = prevMessages.findIndex(msg =>
            msg.id === 'generation-progress' ||
            (msg.metadata?.type === 'progress' && msg.metadata?.isStreamingUpdate)
          );

          if (progressMessageIndex !== -1) {
            // Replace the progress message with the completion message
            const updatedMessages = [...prevMessages];
            updatedMessages[progressMessageIndex] = systemMessageToAdd;
            return updatedMessages;
          }
        }

        // Progress updates are already handled above in the streaming update block
        // This prevents any duplicate handling
        if (isProgressUpdate && !isCompletionMessage) {
          console.log('⚠️ Progress update reached secondary handler - should be handled above');
          return prevMessages;
        }

        // For non-progress streaming messages (completion, errors, etc), skip them
        if (systemMessageToAdd.metadata?.isStreamingUpdate &&
          !isProgressUpdate &&
          !isCompletionMessage) {
          // Skip if it's a duplicate streaming update
          return prevMessages;
        }

        // Handle completion messages specially
        if (isCompletionMessage) {
          // CRITICAL: Skip completion messages if generation didn't start in this session
          if (!generationStartedInSessionRef.current && isExistingDeck) {
            console.log('[ChatPanel] Skipping completion message (secondary) - existing deck');
            return prevMessages;
          }

          console.log('📍 Processing completion message:', {
            message: systemMessageToAdd.message,
            metadata: systemMessageToAdd.metadata
          });

          // Check if we already have a completion message
          const hasCompletionMessage = prevMessages.some(msg =>
            msg.metadata?.type === 'generation_complete' ||
            msg.message.includes('Your presentation is ready!')
          );
          if (hasCompletionMessage) {
            console.log('🔄 Skipping duplicate completion message');
            return prevMessages;
          }

          // Replace the progress message with completion message
          const progressIndex = prevMessages.findIndex(msg => msg.id === 'generation-progress');
          if (progressIndex !== -1) {
            console.log('📍 Replacing progress message with completion');
            const updatedMessages = [...prevMessages];
            updatedMessages[progressIndex] = {
              ...systemMessageToAdd,
              id: 'generation-complete',
              timestamp: updatedMessages[progressIndex].timestamp // Keep original timestamp
            };
            return updatedMessages;
          } else {
            // No progress message to replace, add as new
            console.log('📍 Adding completion message as new');
            return [...prevMessages, { ...systemMessageToAdd, id: 'generation-complete' }];
          }
        }

        // Check for duplicate non-progress messages
        const lastFewMessages = prevMessages.slice(-5);
        const isDuplicate = lastFewMessages.some(msg => {
          const timeDiff = new Date().getTime() - (msg.timestamp?.getTime() || 0);
          const isSameMessage = msg.message === systemMessageToAdd.message;
          const isSameStage = msg.metadata?.stage === systemMessageToAdd.metadata?.stage;
          const isSameType = msg.metadata?.type === systemMessageToAdd.metadata?.type;
          return timeDiff < 3000 && (isSameMessage || (isSameStage && isSameType));
        });

        if (isDuplicate) {
          console.log('🔄 Skipping duplicate system message:', systemMessageToAdd.message.substring(0, 50) + '...');
          return prevMessages;
        }

        // Debug log for info messages
        if (systemMessageToAdd.metadata?.type === 'info') {
          console.log('ℹ️ Adding info message:', systemMessageToAdd.message);
        }

        return [...prevMessages, systemMessageToAdd];
      });
    }
  }, [newSystemMessage]);

  // Handle processing of deck diffs from API response
  const handleDeckDiff = (deckDiff: DeckDiff) => {
    if (!deckDiff) return;
    applyDeckDiffRespectingEditMode(deckDiff, true);  // Pass true - these are edit diffs from the API
  };

  // Handle feedback for AI messages
  const handleMessageFeedback = async (messageId: string, feedback: FeedbackType) => {
    // Find the message that received feedback
    const targetMessage = messages.find(msg => msg.id === messageId);
    if (!targetMessage) {
      console.error('Message not found:', messageId);
      return;
    }

    // Update the message with the feedback in local state
    setMessages(prevMessages =>
      prevMessages.map(msg =>
        msg.id === messageId
          ? { ...msg, feedback }
          : msg
      )
    );

    try {
      // Simplify chat history to avoid large payloads
      const simplifiedHistory = messages.map(msg => ({
        id: msg.id,
        type: msg.type,
        message: msg.message,
        timestamp: msg.timestamp
      }));

      // Extract before/after states from message metadata if available
      const beforeJson = targetMessage.metadata?.deckStateBefore;
      const afterJson = targetMessage.metadata?.deckStateAfter;

      // Save feedback to Supabase
      const result = await saveFeedback({
        messageId: messageId,
        feedbackType: feedback,
        beforeJson: beforeJson || null,
        afterJson: afterJson || null,
        chatHistory: simplifiedHistory, // Use simplified chat history
        messageText: targetMessage.message,
        metadata: {
          timestamp: new Date().toISOString(),
          currentSlideIndex: currentSlideIndex
        }
      });

      if (!result.success) {
        console.error('Failed to save feedback:', result.error);
      }
    } catch (error) {
      console.error('Error saving feedback:', error);
    }
  };

  // Determine if we should show the fallback "Generate" button
  // Shows after 2+ user messages when no outline is being generated and no slides exist yet
  const userMessageCount = messages.filter(m => m.type === 'user').length;
  const hasOutlineSlides = outline?.slides && outline.slides.length > 0 && outline.slides.some((s: any) => s.content || s.title);
  const showFallbackGenerate = outlineMode && useOutlineAgent && onOutlineAgentToolCall &&
    userMessageCount >= 2 &&
    !isGenerating &&
    !outlineIsGenerating &&
    !hasOutlineSlides;

  // Handle fallback generate - extract topic from conversation and trigger generation
  const handleFallbackGenerate = async () => {
    if (!onOutlineAgentToolCall) return;


    // Extract topic from conversation - look for user messages
    const userMessages = messages.filter(m => m.type === 'user').map(m => m.message);
    const topic = userMessages.join(' ').substring(0, 500); // Combine all user inputs as context

    // Add a system message indicating we're generating
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
      const { outlineApi } = await import('@/services/outlineApi');

      // Use the conversation as context for the outline generation
      const chatHistory = messages.map(m => ({
        role: m.type === 'user' ? 'user' : 'assistant',
        content: m.message
      }));

      await outlineApi.generateOutlineStream(
        topic,
        [],
        {
          detailLevel: 'standard',
          styleContext: `Context from conversation:\n${chatHistory.map(m => `${m.role}: ${m.content}`).join('\n')}`,
          enableResearch: true,
          autoSelectImages: true
        },
        (event: any) => {

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
        }
      );
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
  };

  // Send message to AI assistant via API
  const sendMessage = async () => {
    if (!input.trim()) return;

    // Track original request for multi-person LinkedIn handling
    // Store the input if it contains @linkedin mentions (for sequential person lookup)
    if (input.toLowerCase().includes('@linkedin')) {
      originalLinkedInRequestRef.current = input;
    }

    // Create timestamp now for consistency
    const timestamp = new Date();
    const userMessageId = `user-${Date.now()}`;

    // Snapshot current selections/attachments for tagging in the message
    // CRITICAL: Use attachmentsRef.current to get latest value and avoid stale closure
    const currentAttachments = attachmentsRef.current;
    const previewSelections = selectedElements.map(s => ({ id: s.elementId, label: s.label }));
    const previewAttachments = currentAttachments.map(a => a.name);
    // Include full attachment data for nice display in chat AND for file analysis
    // IMPORTANT: Store the file reference so we can convert to base64 later
    const fullAttachments = currentAttachments.map(a => ({
      name: a.name,
      type: (a as any).type || (a as any).mimeType,
      size: a.size,
      url: (a as any).url,
      previewUrl: (a as any).previewUrl || (a as any).url,
      file: (a as any).file // Keep file reference for base64 conversion
    }));

    // Snapshot selected mentions before clearing
    const currentMentions = [...selectedMentions];

    // Create the user message object
    const userMessage: ExtendedChatMessageProps = {
      id: userMessageId,
      type: 'user',
      message: input,
      timestamp,
      feedback: null,
      metadata: {
        selectionsPreview: previewSelections,
        attachmentNames: previewAttachments,
        attachments: fullAttachments,
        // Include integration mentions if any
        integrationMentions: currentMentions.length > 0
          ? currentMentions.map(m => ({ id: m.id, name: m.name }))
          : undefined
      }
    };

    // Clear integration mentions after sending
    if (currentMentions.length > 0) {
      clearMentions();
    }

    // Handle outline mode with conversational agent
    if (outlineMode && useOutlineAgent && onOutlineAgentToolCall) {
      const currentInput = input;

      // STEP 1: Add user message to UI IMMEDIATELY
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
      // Clear attachments and revoke preview URLs ONLY for attachments with uploaded URLs
      currentAttachments.forEach(a => {
        const preview = (a as any).previewUrl;
        const hasUploadedUrl = !!(a as any).url;
        // Only revoke blob URLs if we have an uploaded URL to use instead
        if (preview && hasUploadedUrl) revokeImagePreview(preview);
      });
      setAttachments([]);
      attachmentsRef.current = []; // Also clear the ref immediately
      // NOTE: Don't set isGenerating(true) here - it causes all slides to show loading
      // We only set isGenerating when the agent actually triggers generation (generate_outline action)

      // STEP 2: Add AI placeholder message with thinking indicator
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

      // STEP 3: Build context
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

      // Include reference links from stylePreferences if available
      const stylePrefs = (outline as any)?.stylePreferences;
      if (stylePrefs?.referenceLinks && Array.isArray(stylePrefs.referenceLinks) && stylePrefs.referenceLinks.length > 0) {
        context.reference_links = stylePrefs.referenceLinks;
      }

      // STEP 4: Stream response from agent
      try {
        let fullResponse = '';
        let outlineData: any = null;


        // Prepare files for analysis if any are attached
        // Use fullAttachments snapshot since attachments state is cleared before this runs
        const filesToAnalyze = fullAttachments.length > 0 ? await Promise.all(
          fullAttachments.map(async (att) => {
            const file = att.file as File | undefined;
            let content: string | undefined;

            // Convert file to base64 if we have the raw file
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
          // Debug: log all events

          if (event.type === 'status') {
            // Handle status events (researching, scraping, etc.)

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
            // Research completed - show brief "processing" then continue
            setMessages(prev => prev.map(m =>
              m.id === aiMessageId
                ? { ...m, message: 'found relevant info', metadata: { isTyping: true, isResearching: false, thinkingPhase: 'processing', isStreamingUpdate: true } }
                : m
            ));
          } else if (event.type === 'text') {
            fullResponse += event.content;

            // Remove JSON from display - use robust bracket matching
            let displayText = fullResponse;

            // Remove ```json...``` code blocks
            displayText = displayText.replace(/```json[\s\S]*?```/g, '');

            // Remove standalone JSON objects that look like our action format
            // Use bracket counting for proper matching
            const removeActionJson = (text: string): string => {
              let result = '';
              let i = 0;
              while (i < text.length) {
                // Look for potential JSON start
                if (text[i] === '{') {
                  // Check if this looks like an action JSON by peeking ahead
                  const remaining = text.slice(i);
                  if (remaining.includes('"action"') && (remaining.includes('"update_slides"') || remaining.includes('"updated_slides"') || remaining.includes('"slides"'))) {
                    // Find matching closing brace using bracket counting
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
                            // Found the complete JSON object - skip it
                            i = j + 1;
                            break;
                          }
                        }
                      }
                      j++;
                    }

                    if (braceCount !== 0) {
                      // Incomplete JSON - skip to end (still streaming)
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

            // Update AI message in real-time, but preserve thinking/researching states
            setMessages(prev => prev.map(m => {
              if (m.id !== aiMessageId) return m;

              // Preserve thinking/researching states when there's no meaningful text yet
              const isInThinkingState = m.metadata?.isResearching || m.metadata?.thinkingPhase;
              if (isInThinkingState && !displayText) {
                return m; // Keep the current thinking/researching message
              }

              // Only clear thinking state when we have substantial content (more than just whitespace)
              const hasSubstantialContent = displayText.length > 10;

              return {
                ...m,
                message: displayText || m.message, // Keep existing message if displayText is empty
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

        // STEP 5: Finalize message
        setMessages(prev => prev.map(m =>
          m.id === aiMessageId
            ? { ...m, metadata: { ...m.metadata, isTyping: false, isStreamingUpdate: false, thinkingPhase: undefined, isResearching: false } }
            : m
        ));

        // STEP 6: Handle outline updates
        if (outlineData) {
          if (outlineData.action === 'update_theme' && outline && outlineData.theme_changes) {
            // Apply theme changes

            try {
              // Call the backend to process theme changes
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

                // Update stylePreferences if provided
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

                // Update deck theme if provided
                if (result.theme_updates && outline.id) {
                  const currentTheme = useThemeStore.getState().outlineDeckThemes?.[outline.id];

                  // Handle logo removal
                  if (result.theme_updates.remove_logo && currentTheme) {
                    const updatedTheme = { ...currentTheme };

                    // Remove logo from all locations
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
                    // Merge theme updates (or create new theme if none exists)
                    const updatedTheme = currentTheme ? { ...currentTheme } : {};

                    if (result.theme_updates.color_palette) {
                      // Deep merge color_palette to preserve metadata
                      const existingCP = updatedTheme.color_palette || {};
                      const newCP = result.theme_updates.color_palette;

                      updatedTheme.color_palette = {
                        ...existingCP,
                        ...newCP,
                        // Deep merge metadata specifically
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

                    // Also update the workspace theme so the font picker and preview update
                    const currentWorkspaceTheme = useThemeStore.getState().getWorkspaceTheme();
                    const updatedWorkspaceTheme: any = { ...currentWorkspaceTheme };

                    // Apply color palette changes to workspace theme
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

                    // Apply typography changes to workspace theme
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

                    // Add the updated theme as a custom theme and set it as workspace theme
                    const newThemeId = useThemeStore.getState().addCustomTheme(updatedWorkspaceTheme);
                    useThemeStore.getState().setWorkspaceTheme(newThemeId);
                    useThemeStore.getState().setOutlineTheme(outline.id, { ...updatedWorkspaceTheme, id: newThemeId, isCustom: true });
                  }
                }

                // Show success message
              } else {
                console.error('[ChatPanel] Failed to apply theme changes:', response.statusText);
              }
            } catch (error) {
              console.error('[ChatPanel] Error applying theme changes:', error);
            }
          } else if (outlineData.action === 'update_slides' && outline && onOutlineUpdate) {
            // Diff-based update - only update specific slides

            const updatedSlides = [...outline.slides];
            const updatedIndices = new Set<number>();

            for (const update of outlineData.updated_slides) {
              const idx = update.index;
              if (idx >= 0 && idx < updatedSlides.length) {
                // Format key_points with bullets and line breaks
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
                  _justUpdated: true // Mark for animation
                };
                updatedIndices.add(idx);
              }
            }

            onOutlineUpdate({ ...outline, slides: updatedSlides });
          } else if (outlineData.action === 'update_outline' && outline && onOutlineUpdate) {
            // Legacy full update (deprecated, but keep for backwards compatibility)
            const updatedSlides = outlineData.slides.map((slide: any, index: number) => ({
              ...outline.slides[index],
              title: slide.title || outline.slides[index]?.title || '',
              subtitle: slide.subtitle || outline.slides[index]?.subtitle || '',
              content: slide.key_points && slide.key_points.length > 0
                ? slide.key_points.join('\n')
                : outline.slides[index]?.content || ''
            }));
            onOutlineUpdate({ ...outline, slides: updatedSlides });
          } else if (outlineData.action === 'generate_outline' && onOutlineUpdate) {
            // NOW we set isGenerating because actual generation is starting
            setIsGenerating(true);

            const newOutline = {
              id: outline?.id || uuidv4(),
              title: outlineData.topic || 'Presentation',
              slides: outlineData.slides.map((slide: any) => ({
                id: uuidv4(),
                title: slide.title || '',
                subtitle: slide.subtitle || '',
                content: slide.key_points && slide.key_points.length > 0
                  ? slide.key_points.join('\n')
                  : '',
                deep_research: false
              }))
            };
            onOutlineUpdate(newOutline);

            onOutlineAgentToolCall({
              topic: outlineData.topic || outline?.title || 'Presentation',
              presentation_type: 'standard',
              slide_count: outlineData.slides?.length || outlineData.slide_count || 5,
              detail_level: outlineData.detail_level || 'standard',
              tone: outlineData.tone,
            });

            // Check if created slides actually have content
            const slidesWithoutContent = newOutline.slides.filter((s: any) => !s.content || s.content.trim() === '');

            // Keep isGenerating true if slides are empty (will be filled by streaming or other mechanism)
            if (slidesWithoutContent.length > 0) {
              return; // Don't set isGenerating to false yet
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

    // Handle outline mode without agent (legacy/fallback)
    if (outlineMode && onOutlineGenerate) {

      const outlineMsgId = `user-${Date.now()}`;

      // Add user message immediately
      setMessages(prev => [...prev, {
        id: outlineMsgId,
        type: 'user',
        message: input,
        timestamp: new Date(),
        feedback: null
      }]);

      setInput('');
      // Track this message as pending (allows parallel messages)
      addPendingMessage(outlineMsgId);

      try {
        // Call outline generation - parent will handle adding messages
        await onOutlineGenerate(input, {});
        removePendingMessage(outlineMsgId);
      } catch (error) {
        console.error('Error generating outline:', error);
        setMessages(prev => [...prev, {
          id: `error-${Date.now()}`,
          type: 'ai',
          message: "I encountered an error while generating your outline. Please try again.",
          timestamp: new Date(),
          feedback: null
        }]);
        removePendingMessage(outlineMsgId);
      }
      return;
    }

    // Define message ID before try block so it's available in finally
    const userMsgId = `user-${Date.now()}`;

    try {

      // STEP 1: Add user message to UI IMMEDIATELY (just like outline mode)
      setMessages(prev => [...prev, {
        id: userMsgId,
        type: 'user',
        message: input,
        timestamp: new Date(),
        feedback: null,
        metadata: {
          selectionsPreview: previewSelections,
          attachmentNames: previewAttachments,
          attachments: fullAttachments
        }
      }]);

      // Clear input immediately
      setInput('');
      // Track this message as pending (allows parallel messages)
      addPendingMessage(userMsgId);

      // Get current slide ID if available
      const currentSlide = slides[currentSlideIndex];
      const slideId = currentSlide?.id || null;

      // Get the complete deck data
      const deckData = useDeckStore.getState().deckData;

      // Store the deck state before changes for feedback comparison
      const deckStateBefore = JSON.parse(JSON.stringify(deckData));

      // Prepare selection context for API (match backend schema)
      const selectionContext = selectedElements.map(s => ({
        elementId: s.elementId,
        elementType: s.elementType,
        slideId: s.slideId,
        overlaps: s.overlaps,
        boundingRect: s.bounds ? { x: s.bounds.x, y: s.bounds.y, width: s.bounds.width, height: s.bounds.height } : undefined,
        domPath: s.slideId ? `#slide_${s.slideId} [data-component-id="${s.elementId}"]` : `[data-component-id="${s.elementId}"]`
      }));

      // If the user didn't select any specific component, implicitly target the current slide for better context
      const effectiveSelections = (selectionContext.length > 0 || !slideId)
        ? selectionContext
        : [{
          elementId: slideId,
          elementType: 'Slide',
          slideId: slideId,
          overlaps: [],
          domPath: `#slide_${slideId}`,
          implicit: true
        } as any];

      // Prepare lightweight attachment metadata
      // Ensure any pending attachments without URL are processed now
      // Use currentAttachments which was captured at the start of sendMessage
      const pending = currentAttachments.filter((a: any) => (a as any).file && !(a as any).url) as PendingAttachment[];
      if (pending.length > 0) {
        try {
          await processAndRegisterFiles(pending.map(p => p.file));
        } catch { }
      }

      // Re-read from ref after potential registration update
      const latestAttachments = attachmentsRef.current;
      const finalized = (latestAttachments as Array<PendingAttachment | RegisteredAttachment>).filter((a: any) => (a as any).url) as RegisteredAttachment[];
      const attachmentMeta = finalized.map(a => ({
        name: a.name,
        mimeType: a.mimeType,
        size: a.size,
        url: a.url,
        attachmentId: (a as any).attachmentId // Include attachment ID if available
      }));

      // 📸 AUTO-CAPTURE TINY SCREENSHOT for visual context when editing slides/CustomComponents
      // This helps the AI "see" the current slide state for visual/layout issues
      // Triggers for both explicit CustomComponent selection AND implicit Slide selection (which contains CustomComponents)
      const shouldCaptureVisualContext = effectiveSelections.some(
        s => s.elementType === 'CustomComponent' || s.elementType === 'Slide'
      );
      if (shouldCaptureVisualContext && shouldCaptureScreenshotForEdit(input, true)) {
        try {
          // Find the slide viewport container
          const slideViewport = document.querySelector('[data-slide-viewport]') as HTMLElement;
          if (slideViewport) {
            const screenshotDataUrl = await captureTinySlideScreenshot(slideViewport);
            if (screenshotDataUrl) {
              // Add screenshot as a special attachment
              attachmentMeta.push({
                name: '_slide_context.jpg',
                mimeType: 'image/jpeg',
                size: Math.ceil((screenshotDataUrl.length - 'data:image/jpeg;base64,'.length) * 0.75),
                url: screenshotDataUrl, // Data URL will be processed by backend
                attachmentId: `screenshot-${Date.now()}`
              });
            }
          }
        } catch (screenshotError) {
          console.warn('[ChatPanel] Screenshot capture failed (non-blocking):', screenshotError);
        }
      }

      // IMPORTANT: Update the user message in state with the uploaded URLs
      // This MERGES finalized attachments, preserving any that are still pending
      // This ensures pending attachments stay visible (with loading indicator) until upload completes
      setMessages(prev => prev.map(msg => {
        if (msg.id !== userMsgId || !msg.metadata?.attachments) return msg;

        const existingAttachments = msg.metadata.attachments as any[];
        const mergedAttachments = existingAttachments.map(existing => {
          // Find the corresponding finalized attachment by name and size
          const uploaded = finalized.find(f =>
            f.name === existing.name && f.size === existing.size
          );

          if (uploaded) {
            // Replace with uploaded version (has real URL)
            return {
              name: uploaded.name,
              type: (uploaded as any).type || uploaded.mimeType,
              size: uploaded.size,
              url: uploaded.url,
              previewUrl: uploaded.url, // Use uploaded URL since blob will be revoked
            };
          }
          // Keep existing (still pending or failed) - preserves blob previewUrl and file ref
          return existing;
        });

        return { ...msg, metadata: { ...msg.metadata, attachments: mergedAttachments } };
      }));

      // Immediately clear UI selection bubbles and highlights before network call
      clearSelections();

      // Clear attachments state FIRST (so input area clears immediately)
      setAttachments([]);
      attachmentsRef.current = []; // Also clear the ref immediately
      setIsSelecting(false);

      // Revoke blob preview URLs AFTER a short delay to ensure React has rendered the updated message
      // This prevents the image from showing broken while React re-renders
      setTimeout(() => {
        latestAttachments.forEach(a => {
          const preview = (a as any).previewUrl;
          const hasUploadedUrl = !!(a as any).url;
          // Only revoke blob URLs (not data URLs or uploaded URLs)
          if (preview && hasUploadedUrl && preview.startsWith('blob:')) {
            revokeImagePreview(preview);
          }
        });
      }, 100);

      // Send the message to the API with selections and attachments
      let data: any = null;
      const hasSession = await ensureAgentSession();
      if (hasSession && agentClientRef.current) {
        // Use new agent backend
        data = await agentClientRef.current.sendMessage({
          role: 'user',
          text: input,
          stream: true,
          selections: effectiveSelections,
          attachments: attachmentMeta,
          context: {
            preferredInsertAfterSlideId: slideId || undefined,
            styleFromSlideId: slideId || undefined,
            // Explicitly include slide and deck context for upstream targeting
            slide_id: slideId || undefined,
            current_slide_index: currentSlideIndex,
            deck_data: deckData,
            // Include selected LinkedIn profile for follow-up context
            // Use ref value first (for continuation) then fall back to state
            selected_linkedin_profile: selectedProfileForContinuationRef.current || selectedLinkedInProfile || undefined,
          },
        });
        // Clear the continuation ref after sending to avoid stale data
        selectedProfileForContinuationRef.current = null;
      } else {
        // Fallback to legacy chat endpoint
        data = await sendChatToApi(
          input,
          slideId,
          currentSlideIndex,
          deckData,
          messages,
          effectiveSelections,
          attachmentMeta.map(a => ({ name: a.name, type: a.mimeType, size: a.size }))
        );
      }

      // Check for insufficient credits response
      if (data.message === '__INSUFFICIENT_CREDITS__' || data.response === '__INSUFFICIENT_CREDITS__') {
        const creditsMessageId = `credits-${Date.now()}`;
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
        removePendingMessage(userMsgId);
        return;
      }

      // Create timestamp for assistant response
      const responseTimestamp = new Date(data.timestamp);
      const aiMessageId = `ai-${Date.now()}`;

      // Add AI response from API to UI
      const aiMessage: ExtendedChatMessageProps = {
        id: aiMessageId,
        type: 'ai',
        message: data.message,
        timestamp: responseTimestamp,
        feedback: null,
        // Store the before state in the message for feedback
        metadata: {
          deckStateBefore
        }
      };

      // Process deck diff if available
      if (data.deck_diff) {
        handleDeckDiff(data.deck_diff);
      }

      // Get the updated deck state after changes
      const deckStateAfter = useDeckStore.getState().deckData;

      // Update the AI message with the after state
      aiMessage.metadata = {
        ...aiMessage.metadata,
        deckStateAfter
      };

      // Add the complete AI message to the UI
      setMessages(prevMessages => [...prevMessages, aiMessage]);

      // Clear uploaded attachments after sending (already revoked preview URLs above)
      // Already cleared above; nothing else to do here

    } catch (error) {
      console.error('Error sending message to API:', error);

      // Add error message to UI
      const errorTimestamp = new Date();
      const errorMessage = "I'm having trouble connecting to the server. Please try again later.";
      const errorMessageId = `error-${Date.now()}`;

      setMessages(prevMessages => [
        ...prevMessages,
        {
          id: errorMessageId,
          type: 'ai',
          message: errorMessage,
          timestamp: errorTimestamp,
          feedback: null,
          metadata: {
            isError: true
          }
        }
      ]);

    } finally {
      // Remove this message from pending (allows parallel messages to complete independently)
      removePendingMessage(userMsgId);
    }
  };

  // Keep ref updated so continuation trigger can call sendMessage
  sendMessageRef.current = sendMessage;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle integration @ mention keyboard navigation
    if (handleMentionKeyDown(e)) {
      return; // Event was handled by mention system
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Handle input change with mention detection
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPosition = e.target.selectionStart || newValue.length;
    setInput(newValue);
    handleMentionTextChange(newValue, cursorPosition, setInput);
  };

  const handleSuggestedPrompt = (prompt: string) => {
    setInput(prompt);
  };

  // Style with dynamic opacity based on panel width
  const panelStyle = {
    opacity: opacity,
    transition: 'opacity 150ms ease-out'
  };

  // Pick a random set of suggestions on mount and when mode changes
  // Always show "Redesign this slide" first in editing mode
  useEffect(() => {
    if (outlineMode && useOutlineAgent) {
      // Convert string[] to { label, prompt }[] for outline mode
      const sampled = sampleArray(OUTLINE_SUGGESTIONS, 4);
      setSuggestions(sampled.map(s => ({ label: s, prompt: s })));
    } else {
      // Always show DEFAULT_SUGGESTION first, then sample 3 more from the pool
      const sampled = sampleArray(ALL_SUGGESTIONS, 3);
      setSuggestions([DEFAULT_SUGGESTION, ...sampled]);
    }
  }, [outlineMode, useOutlineAgent]);

  // Pre-compute edit_applied pairings and sorted messages for rendering
  const { sortedMessages, editAppliedMap } = useMemo(() => {
    // Build a map of AI message IDs to their edit_applied data
    const editAppliedMap = new Map<string, any>();

    // Iterate through edit_applied messages and find the BEST AI message to pair with
    // Key: prefer AI messages with actual content over empty ones
    for (let editIdx = 0; editIdx < messages.length; editIdx++) {
      const editMsg = messages[editIdx];
      if (editMsg?.metadata?.type !== 'edit_applied') continue;

      // Find nearby AI messages (within 5 positions forward and backward)
      // Include BOTH streaming (ai-stream-*) and final (ai-*) messages
      const candidates: Array<{ idx: number; msg: any; hasContent: boolean; distance: number; isStreaming: boolean }> = [];

      // Search backward
      for (let lookBack = 1; lookBack <= 5 && editIdx - lookBack >= 0; lookBack++) {
        const candidateMsg = messages[editIdx - lookBack];
        if (candidateMsg?.type === 'user') break; // Stop at user message boundary
        if (candidateMsg?.type === 'ai') {
          const text = typeof candidateMsg.message === 'string' ? candidateMsg.message : '';
          const isStreaming = candidateMsg.id?.startsWith('ai-stream-') || false;
          candidates.push({
            idx: editIdx - lookBack,
            msg: candidateMsg,
            hasContent: text.trim().length > 0,
            distance: lookBack,
            isStreaming
          });
        }
      }

      // Search forward
      for (let lookAhead = 1; lookAhead <= 5 && editIdx + lookAhead < messages.length; lookAhead++) {
        const candidateMsg = messages[editIdx + lookAhead];
        if (candidateMsg?.type === 'user') break; // Stop at user message boundary
        if (candidateMsg?.type === 'ai') {
          const text = typeof candidateMsg.message === 'string' ? candidateMsg.message : '';
          const isStreaming = candidateMsg.id?.startsWith('ai-stream-') || false;
          candidates.push({
            idx: editIdx + lookAhead,
            msg: candidateMsg,
            hasContent: text.trim().length > 0,
            distance: lookAhead,
            isStreaming
          });
        }
      }

      // Sort candidates: prefer content > non-streaming > closer distance
      candidates.sort((a, b) => {
        // First priority: has content
        if (a.hasContent && !b.hasContent) return -1;
        if (!a.hasContent && b.hasContent) return 1;
        // Second priority: prefer non-streaming (final messages) if both have content
        if (a.hasContent && b.hasContent) {
          if (!a.isStreaming && b.isStreaming) return -1;
          if (a.isStreaming && !b.isStreaming) return 1;
        }
        // Third priority: closer distance
        return a.distance - b.distance;
      });

      // Pair with the best candidate that hasn't been paired yet
      for (const candidate of candidates) {
        if (!editAppliedMap.has(candidate.msg.id)) {
          editAppliedMap.set(candidate.msg.id, editMsg.metadata);
          break;
        }
      }
    }

    // Sort messages by timestamp - purely chronological, newest at bottom
    // This ensures every new message appears at the end naturally
    const sortedMessages = [...messages].sort((a, b) => {
      const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() :
                   typeof a.timestamp === 'number' ? a.timestamp : 0;
      const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() :
                   typeof b.timestamp === 'number' ? b.timestamp : 0;
      return timeA - timeB;
    });

    return { sortedMessages, editAppliedMap };
  }, [messages, messages.length, messages.map(m => `${m.id}:${m.type}:${m.metadata?.type || ''}:${(m.message || '').slice(0, 20)}`).join(',')]);

  return (
    <div
      data-tour="chat-panel"
      className={`
        flex flex-col h-full rounded-lg overflow-hidden transition-opacity duration-150 backdrop-blur-md min-w-0 shrink-0
        ${isCollapsed ? 'w-0 opacity-0' : 'w-full max-w-full min-w-[320px]'}
      `}
      style={panelStyle}
      onDragEnter={onDragEnterPanel}
      onDragOver={onDragOverPanel}
      onDragLeave={onDragLeavePanel}
      onDrop={onDropPanel}
    >
      {!isCollapsed && (
        <>
          {/* Load older messages - small text above scroll area */}
          {hasOldMessages && !showOldMessages && (
            <button
              onClick={handleLoadOlderMessages}
              className="flex items-center justify-center gap-1.5 py-1 px-2 mx-auto text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <History className="w-3 h-3" />
              <span>Load older messages ({oldMessages.length})</span>
            </button>
          )}

          {/* Messages */}
          <div ref={scrollContainerRef} className="overflow-y-auto overflow-x-hidden p-2.5 pr-3 flex-1 min-h-0 min-w-0" style={{ scrollbarGutter: 'stable both-edges' }}>
            {/* Safari-specific: ensure bubbles don't inherit a dark gradient/mask */}
            {BROWSER.isSafari && (
              <style>{`.glass-panel{background-color:rgba(255,255,255,0.06) !important; background-image:none !important;}`}</style>
            )}
            {/* Collapsible Theme & Assets preview */}
            {themePreview && (
              <div className="mb-2">
                {/* Render inline inside the current streaming message bubble via inlineBelow */}
                {/* We'll pass this down below to the active streaming row only */}
              </div>
            )}

            {/* Old messages - only shown when user clicks to load */}
            {showOldMessages && oldMessages.map((msg, idx) => {
              // Skip transient numeric-only AI/system crumbs
              const txt = typeof msg.message === 'string' ? msg.message : '';
              if ((msg.type === 'ai' || msg.type === 'system') && /^\s*\d+\s*$/.test(txt)) {
                return null;
              }

              // Skip standalone edit_applied messages - they'll be rendered within a nearby AI bubble
              if (msg.metadata?.type === 'edit_applied') {
                const prevMsg = idx > 0 ? oldMessages[idx - 1] : null;
                if (prevMsg?.type === 'ai') {
                  return null;
                }
                // Look forward for final AI message (handles: ai-stream → edit_applied → ai-final order)
                const nextMsg = idx + 1 < oldMessages.length ? oldMessages[idx + 1] : null;
                if (nextMsg?.type === 'ai' && !nextMsg.id?.startsWith('ai-stream-')) {
                  return null;
                }
              }

              // Look for nearby edit_applied that belongs to this AI message
              let editAppliedData: any = null;
              if (msg.type === 'ai') {
                const isStreamingMsg = msg.id?.startsWith('ai-stream-');
                const isFinalMsg = !isStreamingMsg;

                // Search forward (up to 3 messages)
                for (let lookAhead = 1; lookAhead <= 3 && idx + lookAhead < oldMessages.length; lookAhead++) {
                  const candidate = oldMessages[idx + lookAhead];
                  if (candidate?.metadata?.type === 'edit_applied') {
                    let claimedByCloserAI = false;
                    for (let between = 1; between < lookAhead; between++) {
                      const betweenMsg = oldMessages[idx + between];
                      if (betweenMsg?.type === 'ai' && !betweenMsg.id?.startsWith('ai-stream-')) {
                        claimedByCloserAI = true;
                        break;
                      }
                    }
                    if (!claimedByCloserAI) {
                      editAppliedData = candidate.metadata;
                      break;
                    }
                  }
                  if (candidate?.type === 'user') break;
                }

                // Search backward (for final messages only)
                if (!editAppliedData && isFinalMsg) {
                  for (let lookBack = 1; lookBack <= 3 && idx - lookBack >= 0; lookBack++) {
                    const candidate = oldMessages[idx - lookBack];
                    if (candidate?.metadata?.type === 'edit_applied') {
                      const beforeEditApplied = idx - lookBack > 0 ? oldMessages[idx - lookBack - 1] : null;
                      const isFromSameResponse = beforeEditApplied?.type === 'ai' &&
                        beforeEditApplied.id?.startsWith('ai-stream-');
                      if (isFromSameResponse) {
                        editAppliedData = candidate.metadata;
                        break;
                      }
                    }
                    if (candidate?.type === 'user') break;
                  }
                }

                // If streaming message but final message exists nearby, don't claim
                if (editAppliedData && isStreamingMsg) {
                  const nextMsg = idx + 1 < oldMessages.length ? oldMessages[idx + 1] : null;
                  const nextNextMsg = idx + 2 < oldMessages.length ? oldMessages[idx + 2] : null;
                  if ((nextMsg?.type === 'ai' && !nextMsg.id?.startsWith('ai-stream-')) ||
                      (nextNextMsg?.type === 'ai' && !nextNextMsg.id?.startsWith('ai-stream-'))) {
                    editAppliedData = null;
                  }
                }
              }

              // Get slide number for user-friendly naming
              const getSlideNumber = (slideId: string | undefined): number | null => {
                if (!slideId || !deckData?.slides) return null;
                const index = deckData.slides.findIndex((s: any) => s.id === slideId);
                return index >= 0 ? index + 1 : null;
              };

              const slideNumber = editAppliedData?.slideSnapshot?.id
                ? getSlideNumber(editAppliedData.slideSnapshot.id)
                : null;

              return (
                <div key={`${msg.id}-${editAppliedData ? 'with-edit' : 'no-edit'}`} className="opacity-70">
                  <ChatMessage
                    {...msg}
                    onFeedback={(feedback) => handleMessageFeedback(msg.id, feedback)}
                    editAppliedData={editAppliedData ? { ...editAppliedData, slideNumber } : undefined}
                    onSelectLinkedInProfile={handleSelectLinkedInProfile}
                    onSkipLinkedInSelection={handleSkipLinkedInSelection}
                    selectedLinkedInProfileId={selectedLinkedInProfile?.id}
                  />
                </div>
              );
            })}

            {/* Divider between old and new messages */}
            {showOldMessages && oldMessages.length > 0 && messages.length > 1 && (
              <div className="flex items-center gap-2 my-3">
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                <span className="text-[10px] text-gray-400 dark:text-gray-500">New messages</span>
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              </div>
            )}

            {/* Render sorted messages with pre-computed edit_applied pairings */}
            {sortedMessages.map((msg) => {
              // Skip transient numeric-only AI/system crumbs (e.g., "0")
              const txt = typeof msg.message === 'string' ? msg.message : '';
              if ((msg.type === 'ai' || msg.type === 'system') && /^\s*\d+\s*$/.test(txt)) {
                return null;
              }

              // Skip edit_applied messages - they're rendered within AI bubbles
              if (msg.metadata?.type === 'edit_applied') {
                return null;
              }

              // Get edit_applied data from pre-computed map
              const editAppliedData = msg.type === 'ai' ? editAppliedMap.get(msg.id) : null;

              // Otherwise render normal chat message
              const inline = (msg.metadata?.isStreamingUpdate && themePreview) ? (
                <div className="mt-1">
                  <button
                    className="w-full text-left text-[10px] px-2 py-1 rounded bg-white/5 border border-zinc-300/50 dark:border-neutral-700/50 hover:bg-white/10 transition-colors"
                    onClick={() => setIsThemePreviewOpen(v => !v)}
                    aria-expanded={isThemePreviewOpen}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-muted-foreground">Theme & assets</span>
                      <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${isThemePreviewOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {isThemePreviewOpen && (
                    <div className="mt-1.5 p-2 rounded bg-white/5 border border-zinc-300/50 dark:border-neutral-700/50 space-y-2">
                      {/* Colors */}
                      {themePreview?.palette && (() => {
                        const palette = themePreview.palette;
                        const swatches: Array<{ label: string; color: string }> = [];
                        const bgColor = palette.primary_background || (Array.isArray(palette.backgrounds) ? palette.backgrounds[0] : null);
                        if (bgColor) swatches.push({ label: 'BG', color: String(bgColor) });
                        const textColor = palette.primary_text;
                        if (textColor) swatches.push({ label: 'Text', color: String(textColor) });
                        const reservedSet = new Set([String(bgColor || '').toLowerCase(), String(textColor || '').toLowerCase()].filter(Boolean));
                        const brandColors: string[] = Array.isArray(palette.colors) ? palette.colors.map(String) : [];
                        const seen = new Set<string>();
                        let brandIdx = 0;
                        for (let i = 0; i < brandColors.length && swatches.length < 8; i++) {
                          const hex = String(brandColors[i] || '').toLowerCase();
                          if (!hex || reservedSet.has(hex) || seen.has(hex)) continue;
                          seen.add(hex);
                          swatches.push({ label: `A${brandIdx + 1}`, color: brandColors[i] });
                          brandIdx++;
                        }
                        if (swatches.length === 0) return null;
                        return (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] text-muted-foreground w-10 flex-shrink-0">Colors</span>
                            <div className="flex gap-1">
                              {swatches.map((s, i) => (
                                <div key={`${s.label}-${i}`} className="w-5 h-5 rounded-sm border border-zinc-300/50 dark:border-neutral-600/50" style={{ background: s.color }} title={`${s.label}: ${s.color}`} />
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                      {/* Fonts */}
                      {themePreview?.typography && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-muted-foreground w-10 flex-shrink-0">Fonts</span>
                          <div className="flex gap-1.5 text-[10px]">
                            <span className="px-1.5 py-0.5 rounded-sm bg-zinc-100/50 dark:bg-white/5 border border-zinc-200/50 dark:border-neutral-700/50" style={{ fontFamily: `${themePreview.typography?.hero_title?.family || 'Inter'}, sans-serif`, fontWeight: 600 }}>
                              {themePreview.typography?.hero_title?.family || 'H'}
                            </span>
                            <span className="px-1.5 py-0.5 rounded-sm bg-zinc-100/50 dark:bg-white/5 border border-zinc-200/50 dark:border-neutral-700/50" style={{ fontFamily: `${themePreview.typography?.body_text?.family || 'Inter'}, sans-serif` }}>
                              {themePreview.typography?.body_text?.family || 'B'}
                            </span>
                          </div>
                        </div>
                      )}
                      {/* Logo */}
                      {themePreview?.logo?.url && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-muted-foreground w-10 flex-shrink-0">Logo</span>
                          <img src={themePreview.logo.url} alt="Logo" className="h-5 object-contain rounded-sm border border-zinc-200/50 dark:border-neutral-700/50 bg-white" />
                        </div>
                      )}
                      {/* Tools status */}
                      {Array.isArray(themePreview?.tools) && themePreview.tools.length > 0 && (
                        <div className="flex items-start gap-1.5">
                          <span className="text-[9px] text-muted-foreground w-10 flex-shrink-0 pt-0.5">Tools</span>
                          <div className="flex flex-wrap gap-1">
                            {themePreview.tools.map((t, i) => (
                              <span key={`${t.label}-${i}`} className={`text-[9px] px-1 py-0.5 rounded-sm ${t.status === 'finish' ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-zinc-100/50 dark:bg-white/5 text-muted-foreground'}`}>
                                {t.status === 'finish' ? '✓' : '...'} {t.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : undefined;

              // Show thinking status when isTyping and message has thinking content
              const isThinkingStatus = msg.metadata?.isTyping && msg.metadata?.thinkingPhase;
              const showAsLoading = msg.metadata?.isTyping && !msg.message?.trim();

              // Get slide index for user-friendly naming (e.g., "Slide 1" instead of "slide-0")
              const getSlideNumber = (slideId: string | undefined): number | null => {
                if (!slideId || !deckData?.slides) return null;
                const index = deckData.slides.findIndex((s: any) => s.id === slideId);
                return index >= 0 ? index + 1 : null;
              };

              const slideNumber = editAppliedData?.slideSnapshot?.id
                ? getSlideNumber(editAppliedData.slideSnapshot.id)
                : null;

              return (
                <ChatMessage
                  key={`${msg.id}-${editAppliedData ? 'with-edit' : 'no-edit'}`}
                  {...msg}
                  // Override message to show thinking status with nice formatting
                  message={isThinkingStatus && msg.message ? msg.message : msg.message}
                  isLoading={showAsLoading}
                  inlineBelow={inline}
                  onFeedback={(feedback) => handleMessageFeedback(msg.id, feedback)}
                  editAppliedData={editAppliedData ? { ...editAppliedData, slideNumber } : undefined}
                  onSelectLinkedInProfile={handleSelectLinkedInProfile}
                  onSkipLinkedInSelection={handleSkipLinkedInSelection}
                  selectedLinkedInProfileId={selectedLinkedInProfile?.id}
                />
              );
            })}

            {/* File intent confirmation removed — model infers usage from chat + selection + file metadata */}

            {/* Fallback generate button - subtle, appears after 2+ messages without generation */}
            {showFallbackGenerate && (
              <div className="flex justify-start ml-11 mb-2 animate-fade-in">
                <button
                  onClick={handleFallbackGenerate}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 group"
                >
                  <span>Ready to generate?</span>
                  <Sparkles size={12} className="opacity-50 group-hover:opacity-100 transition-opacity" style={{ color: COLORS.SUGGESTION_PINK }} />
                </button>
              </div>
            )}

            {isLoading && <ChatMessage type="ai" message="" isLoading={true} timestamp={new Date()} />}

            <div ref={messagesEndRef} />
          </div>

          {/* Input and buttons area - contained in a box */}
          <div className="px-2.5 pb-2.5 pt-6 min-w-0">
            <div
              className={
                `relative border rounded-xl px-3.5 pb-3.5 flex flex-col justify-between min-h-[230px] min-w-0 transition-colors ${isDraggingOver ? 'border-orange-500 border-dashed border-2 bg-orange-50/10 dark:bg-orange-900/10' : 'border-zinc-300 dark:border-[#929292]'
                }`
              }
              onDragEnter={onDragEnterPanel}
              onDragOver={onDragOverPanel}
              onDragLeave={onDragLeavePanel}
              onDrop={onDropPanel}
            >
              {/* Drop zone indicator */}
              {isDraggingOver && (
                <div className="absolute inset-0 flex items-center justify-center bg-orange-50/80 dark:bg-orange-900/40 rounded-xl z-10 pointer-events-none">
                  <div className="flex flex-col items-center gap-2 text-orange-600 dark:text-orange-400">
                    <Plus size={32} className="animate-bounce" />
                    <span className="text-sm font-medium">Drop files here</span>
                  </div>
                </div>
              )}

              {/* Voice recording overlay */}
              {isVoiceRecording && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/95 dark:bg-zinc-900/95 rounded-xl z-10">
                  <div className="flex items-center gap-1 px-4 py-2 bg-orange-500/10 rounded-full">
                    <span className="text-lg font-medium text-orange-600 dark:text-orange-400">
                      Listening
                    </span>
                    <span className="text-lg font-medium text-orange-600 dark:text-orange-400 animate-pulse">
                      ...
                    </span>
                  </div>
                </div>
              )}

              {/* Selection bubbles */}
              {selectedElements.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-3">
                  {selectedElements.map(sel => (
                    <div key={sel.elementId} className="flex items-center gap-2 px-2 py-1 rounded-full bg-neutral-900/5 dark:bg-white/10 text-xs border border-neutral-300/60 dark:border-neutral-700">
                      <span className="truncate max-w-[160px]">{sel.label}</span>
                      <button
                        aria-label="Remove selection"
                        className="hover:opacity-80"
                        onClick={() => removeSelection(sel.elementId)}
                      >
                        <XCircle size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Attachment previews */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-3 pb-2">
                  {attachments.map((att, idx) => {
                    const pending = (att as any).file && !(att as any).url;
                    const fileType = (att as any).type || (att as any).mimeType || '';
                    const isImage = fileType.startsWith('image/');
                    // IMPORTANT: Prefer uploaded URL over blob previewUrl since blob URLs get revoked
                    const previewUrl = (att as any).url || (att as any).previewUrl || null;
                    const category = getFileCategory({ name: att.name, type: fileType });

                    // Get appropriate icon for file type
                    const FileIcon = category === 'image' ? ImageIcon
                      : category === 'document' ? FileText
                      : category === 'spreadsheet' ? Table
                      : category === 'presentation' ? Presentation
                      : File;

                    return (
                      <div
                        key={`${att.name}-${idx}`}
                        className={`relative group rounded-lg overflow-hidden border transition-all ${pending
                          ? 'border-orange-300/70 dark:border-orange-700/60 bg-orange-50/40 dark:bg-orange-900/20'
                          : 'border-neutral-300/60 dark:border-neutral-700 bg-neutral-900/5 dark:bg-white/10 hover:border-neutral-400 dark:hover:border-neutral-600'
                          }`}
                        style={{ minWidth: isImage && previewUrl ? 80 : 'auto' }}
                      >
                        {/* Image preview */}
                        {isImage && previewUrl ? (
                          <div className="relative">
                            <img
                              src={previewUrl}
                              alt={att.name}
                              className="w-20 h-16 object-cover"
                            />
                            {pending && (
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                <Loader2 className="w-5 h-5 animate-spin text-white" />
                              </div>
                            )}
                            {/* File name overlay */}
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1">
                              <span className="text-[10px] text-white truncate block">{att.name}</span>
                            </div>
                          </div>
                        ) : (
                          /* Non-image file display */
                          <div className="flex items-center gap-2 px-3 py-2">
                            <div className={`flex-shrink-0 w-8 h-8 rounded flex items-center justify-center ${
                              category === 'document' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
                              category === 'spreadsheet' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                              category === 'presentation' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' :
                              'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
                            }`}>
                              {pending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <FileIcon className="w-4 h-4" />
                              )}
                            </div>
                            <div className="flex flex-col min-w-0 max-w-[120px]">
                              <span className="text-xs font-medium truncate">{att.name}</span>
                              <span className="text-[10px] text-muted-foreground">{formatFileSize(att.size)}</span>
                            </div>
                          </div>
                        )}

                        {/* Remove button */}
                        <button
                          aria-label="Remove attachment"
                          className={`absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-opacity ${
                            pending ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (pending) return;
                            // Revoke preview URL if it exists
                            const preview = (att as any).previewUrl;
                            if (preview) revokeImagePreview(preview);
                            // CRITICAL: Update ref SYNCHRONOUSLY before React batches the setState
                            const next = attachmentsRef.current.filter((_, i) => i !== idx);
                            attachmentsRef.current = next;
                            setAttachments(next);
                          }}
                        >
                          <XCircle size={12} className="text-white" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Input Area */}
              <div className="relative">
                {/* Integration badge when selected - disabled until integrations are set up
                {selectedIntegration && (
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-500 border border-orange-500/20">
                      Using: {selectedIntegration.id}
                    </span>
                    <button
                      onClick={() => setSelectedIntegration(null)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <XCircle size={12} />
                    </button>
                  </div>
                )}
                */}
                {/* Integration Mention Popover */}
                <IntegrationMentionPopover
                  state={mentionState}
                  onSelect={(integration) => selectMention(integration, input, setInput)}
                  onClose={closeMentionPopover}
                />

                {/* Selected Integration Mentions */}
                {selectedMentions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedMentions.map((mention) => (
                      <IntegrationMentionBubble
                        key={mention.id}
                        id={mention.id}
                        name={mention.name}
                        variant="input"
                        size="sm"
                        onRemove={() => removeMention(mention.id)}
                      />
                    ))}
                  </div>
                )}

                <div className={cn("flex items-center min-w-0", selectedMentions.length > 0 ? "mt-2" : "mt-4")}>
                  <div className="w-px mr-2 h-8" style={{ backgroundColor: COLORS.SUGGESTION_PINK }}></div>
                  <Textarea
                    ref={inputRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={(outlineMode && useOutlineAgent)
                        ? "Refine your slides..."
                        : selectedMentions.length > 0
                          ? `Ask about ${selectedMentions.map(m => m.name).join(', ')}...`
                          : "Design, edit, or enhance your deck..."}
                    className="bg-transparent border-none flex-grow text-foreground text-sm placeholder:text-muted-foreground placeholder:text-sm focus-visible:ring-0 focus-visible:ring-offset-0 pl-0 resize-none overflow-hidden"
                    data-tour="chat-input"
                  />
                </div>

                {/* Integration Command Palette - disabled until integrations are set up
                <IntegrationCommandPalette
                  open={showIntegrationPalette}
                  onOpenChange={setShowIntegrationPalette}
                  onSelectAction={(action) => {
                    setSelectedIntegration({ id: action.integrationId, action: action.action });
                    setShowIntegrationPalette(false);
                    inputRef.current?.focus();
                  }}
                  onManageIntegrations={() => {
                    setShowIntegrationPalette(false);
                    setShowIntegrationsDialog(true);
                  }}
                  position="above"
                />
                */}

                {/* Integrations Dialog - disabled until integrations are set up
                <IntegrationsDialog
                  open={showIntegrationsDialog}
                  onOpenChange={setShowIntegrationsDialog}
                />
                */}
              </div>

              {/* Bottom Row: Suggestions and Buttons */}
              <div className="mt-auto pt-2 relative flex flex-col min-w-0" onClick={() => inputRef.current?.focus()}>
                {/* Suggestions (top-left) with fade/collapse when typing */}
                {!isLoading && messages.length <= 1 && (
                  <div
                    className="mr-2 overflow-visible"
                    style={{
                      transition: 'opacity 180ms ease, max-height 180ms ease, margin-bottom 180ms ease',
                      opacity: input.trim().length > 0 ? 0 : 1,
                      maxHeight: input.trim().length > 0 ? 0 : 120,
                      marginBottom: input.trim().length > 0 ? 0 : 8,
                      pointerEvents: input.trim().length > 0 ? 'none' : 'auto'
                    }}
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map((s) => (
                        <button
                          key={s.label}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setInput(s.prompt); inputRef.current?.focus(); }}
                          className="py-1.5 px-3 rounded-full text-xs leading-none border transition-all duration-150 hover:bg-[#FF4301]/5"
                          style={{
                            borderColor: 'rgba(255, 67, 1, 0.3)',
                            color: '#FF4301',
                          }}
                          aria-label={`Use suggestion: ${s.label}`}
                          title={s.prompt}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Under-input plan indicator removed; plan shows as compact chat row */}

                {/* Divider and Buttons Area (bottom-right) */}
                <div className="flex flex-row flex-nowrap items-center justify-end relative shrink-0 w-full min-w-0" onClick={(e) => e.stopPropagation()}> {/* Container for divider + buttons */}
                  {/* Divider */}
                  <div className="h-8 w-px bg-zinc-600 mx-3"></div>

                  {/* Buttons */}
                  <div className="flex items-center gap-1.5">
                    {/* Plus Button - Larger Icon */}
                    <IconButton
                      variant="ghost"
                      size="xs"
                      className="hover:bg-transparent w-6 h-6 flex items-center justify-center"
                      style={{ color: COLORS.SUGGESTION_PINK }}
                      onClick={(e) => { e.stopPropagation(); handleUploadClick(); }}
                    >
                      <Plus size={16} />
                    </IconButton>

                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileChange}
                    />

                    {/* Outline mode: Slide/All dropdown */}
                    {outlineMode ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px] font-semibold hover:bg-transparent"
                            style={{ color: COLORS.SUGGESTION_PINK }}
                          >
                            {outlineSlideTarget === 'all' ? 'All' : `Slide ${outlineSlideTarget + 1}`}
                            <ChevronDown className="h-3 w-3 ml-1" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[100px]">
                          <DropdownMenuItem
                            onClick={() => setOutlineSlideTarget('all')}
                            className="text-xs"
                          >
                            All
                          </DropdownMenuItem>
                          {deckData?.slides?.map((_, index) => (
                            <DropdownMenuItem
                              key={index}
                              onClick={() => setOutlineSlideTarget(index)}
                              className="text-xs"
                            >
                              Slide {index + 1}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      /* Slides mode: Voice recorder button */
                      <VoiceRecorder
                        onTranscript={(text) => {
                          // Append transcribed text to input
                          setInput(prev => {
                            const newText = prev.trim() ? `${prev} ${text}` : text;
                            return newText;
                          });
                          // Focus input after transcription
                          setTimeout(() => inputRef.current?.focus(), 100);
                        }}
                        onRecordingStart={() => setIsVoiceRecording(true)}
                        onRecordingEnd={() => setIsVoiceRecording(false)}
                        onError={(error) => {
                          console.error('Voice recording error:', error);
                        }}
                        disabled={isLoading}
                        size="sm"
                        variant="default"
                        className="hover:bg-transparent"
                      />
                    )}

                    {/* Send Button - Matching outline pink, allows parallel messages */}
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); sendMessage(); }}
                      disabled={!input.trim()}
                      className="h-8 w-8 transition-all flex items-center justify-center rounded-full text-white hover:opacity-80"
                      style={{
                        backgroundColor: COLORS.SUGGESTION_PINK
                      }}
                    >
                      <ChevronUp size={16} />
                    </IconButton>
                  </div>
                </div>
              </div>
            </div>

            {/* Component Context Viewer - shows when elements are selected */}
            {selectedElements.length > 0 && (
              <div className="mt-2 border-t pt-2">
                <details className="group">
                  <summary className="flex items-center gap-1.5 cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
                    <ChevronRight size={12} className="transition-transform group-open:rotate-90" />
                    <span>Selected component context ({selectedElements.length})</span>
                  </summary>
                  <div className="mt-1.5 max-h-24 overflow-auto rounded bg-muted/30 p-2">
                    <pre className="text-[9px] text-muted-foreground font-mono whitespace-pre-wrap break-all">
                      {JSON.stringify(
                        selectedElements.map(sel => {
                          // Try to find the full component data
                          const slidesArr = Array.isArray(deckData?.slides) ? deckData.slides : [];
                          for (const slide of slidesArr) {
                            const comps = Array.isArray(slide?.components) ? slide.components : [];
                            const comp = comps.find((c: any) => c.id === sel.elementId);
                            if (comp) {
                              return {
                                type: comp.type,
                                id: comp.id,
                                props: comp.type === 'CustomComponent'
                                  ? { ...comp.props, render: comp.props?.render ? `[HTML: ${comp.props.render.length} chars]` : undefined }
                                  : comp.props
                              };
                            }
                          }
                          return { id: sel.elementId, label: sel.label, type: sel.elementType };
                        }),
                        null,
                        2
                      )}
                    </pre>
                  </div>
                </details>
              </div>
            )}

          </div>
        </>
      )}
    </div>
  );
};

export default ChatPanel;

