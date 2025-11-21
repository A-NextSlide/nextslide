import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Sparkles, XCircle, Plus, Image, ArrowUp, ChevronUp, ChevronDown, Target, Loader2 } from 'lucide-react';
import ChatMessage, { ChatMessageProps, FeedbackType } from './ChatMessage';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SlideData } from '@/types/SlideTypes';
import { useDeckStore } from '../stores/deckStore';
import { useThemeStore } from '../stores/themeStore';
import { useNavigation } from '@/context/NavigationContext';
import { useOutlineAgent as useOutlineAgentHook } from '@/hooks/useOutlineAgent';
// ThemeToggle import removed
import { IconButton } from './ui/IconButton';
import { API_CONFIG } from '../config/environment';
import { DeckDiff, ChatMessage as ChatMessageType } from '@/utils/apiUtils';
import { saveFeedback } from '@/utils/feedbackService';
import { COLORS } from '@/utils/colors';
import { getOverlappingComponentIds, getComponentBounds } from '@/utils/overlapDetection';
import AgentChatClient from '@/services/agentChat';
import { applyDeckDiffPure } from '@/utils/deckDiffUtils';
import { createComponent } from '@/utils/componentUtils';
import { supabase } from '@/integrations/supabase/client';
import { uploadFile } from '@/utils/fileUploadUtils';
import { useEditor } from '@/hooks/useEditor';
import { useEditorStore } from '@/stores/editorStore';
import { v4 as uuidv4 } from 'uuid';
// Removed font optimization service
import { BROWSER } from '@/utils/browser';
import { streamOutlineAgentChat } from '@/services/outlineApi';




// API URL from environment configuration
const API_URL = API_CONFIG.CHAT_URL;

// Extended ChatMessageProps with an id field for feedback tracking
export interface ExtendedChatMessageProps extends ChatMessageProps {
  id: string;
  feedback?: FeedbackType;
  metadata?: {
    deckStateBefore?: any;
    deckStateAfter?: any;
    [key: string]: any;
  };
}

// Pool of suggestions; a random subset is shown on each load
const ALL_SUGGESTIONS: string[] = [
  'Use a retro 80s synthwave aesthetic',
  'Make it look like a vintage movie poster',
  'Add a psychedelic gradient background',
  'Use a cyberpunk neon theme',
  'Make the title glow with a neon effect',
  'Add floating animation effects',
  'Use a minimalist Japanese zen style',
  'Add a pie chart showing pizza toppings preferences',
  'Create a bar chart of coffee consumption by hour',
  'Insert a line chart of mood throughout the week',
  'Add a table comparing superheroes by power level',
  'Use a dark moody cinematic theme',
  'Add a galaxy space background',
  'Make the background look like old paper',
  'Add sparkle effects to the title',
  'Insert a meme-worthy reaction image',
  'Add dramatic spotlight effects',
  'Make text pop with 3D shadows',
  'Add a comic book style layout',
  'Create a newspaper front page vibe',
];

// Outline mode specific suggestions for slide generation
const OUTLINE_SUGGESTIONS: string[] = [
  'Add more detail to slide 3',
  'Expand the introduction with key statistics',
  'Create a conclusion slide summarizing main points',
  'Add a slide about implementation challenges',
  'Include more examples in the benefits section',
  'Add a timeline slide showing the roadmap',
  'Create a comparison table for alternatives',
  'Add speaker notes to all slides',
  'Rewrite slide 2 to be more concise',
  'Add a slide about next steps',
  'Include case studies or real-world examples',
  'Expand on the technical architecture',
  'Add a Q&A slide at the end',
  'Create an agenda slide after the title',
  'Add more context to the problem statement',
  'Use a professional minimalist theme',
  'Change to a dark modern theme',
  'Apply a vibrant tech startup style',
  'Use a corporate blue theme',
  'Switch to a creative gradient theme',
  'Apply a clean academic style',
  'Use a bold high-contrast theme',
  'Change to a warm earthy color palette',
];

function sampleArray<T>(items: T[], count: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, Math.min(count, copy.length)));
}

/**
 * Utility function to convert UI messages to API chat history format
 */
const convertMessagesToApiFormat = (messages: (ChatMessageProps | ExtendedChatMessageProps)[]): ChatMessageType[] => {
  return messages.map(msg => {
    // Handle timestamp - could be Date object, string, or undefined
    let timestampStr: string;
    if (!msg.timestamp) {
      timestampStr = new Date().toISOString();
    } else if (msg.timestamp instanceof Date) {
      timestampStr = msg.timestamp.toISOString();
    } else {
      // Already a string
      timestampStr = msg.timestamp as unknown as string;
    }

    return {
      content: msg.message,
      role: msg.type === 'user' ? 'user' : 'assistant',
      timestamp: timestampStr,
      // Convert feedback type: positive -> up, negative -> down
      ...(('feedback' in msg && msg.feedback) && {
        feedback: msg.feedback === 'positive' ? 'up' : msg.feedback === 'negative' ? 'down' : undefined
      })
    };
  });
};

/**
 * Utility function to send a chat message to the API
 */
const sendChatToApi = async (
  message: string,
  slideId: string | null,
  currentSlideIndex: number,
  deckData: any,
  messages: ChatMessageProps[],
  selections?: any[],
  attachments?: { name: string; type: string; size: number }[]
) => {
  // Convert UI messages to API format
  const chatHistory = convertMessagesToApiFormat(messages);

  const payload: Record<string, any> = {
    message,
    slide_id: slideId,
    current_slide_index: currentSlideIndex,
    deck_data: deckData,
    chat_history: chatHistory
  };
  if (selections && selections.length > 0) payload.selections = selections;
  if (attachments && attachments.length > 0) payload.attachments = attachments;

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`API responded with status: ${response.status}`);
  }

  return await response.json();
};

export interface ChatPanelProps {
  onCollapseChange?: (collapsed: boolean) => void;
  opacity?: number;
  isPending?: boolean;
  outline?: any;
  deckId?: string;
  newSystemMessage?: Omit<ExtendedChatMessageProps, 'id' | 'timestamp' | 'type' | 'feedback'> & { message: string };
  // Outline mode props
  outlineMode?: boolean;
  useOutlineAgent?: boolean; // Use conversational agent instead of direct generation
  initialPromptFromURL?: { prompt: string; autoImages: boolean; autoSlides: boolean; presentationMode: boolean } | null;
  onInitialPromptProcessed?: () => void;
  onOutlineAgentToolCall?: (params: any) => void; // Called when agent wants to generate
  onOutlineAgentEdit?: (params: any) => void; // Called when agent wants to edit
  onOutlineUpdate?: (outline: any) => void; // Called when agent provides updated outline directly
  onOutlineGenerate?: (prompt: string, preferences: any) => Promise<void>;
  onOutlineRefine?: (message: string) => Promise<void>;
  outlineMessages?: ExtendedChatMessageProps[]; // Messages from outline generation
  outlineIsGenerating?: boolean; // Is outline currently generating
  outlineCurrentSlideIndex?: number; // Current slide index in outline mode
  onOutlineChatGeneratingChange?: (isGenerating: boolean) => void; // Called when outline generation state changes
  initialConversationalData?: any; // Data passed from conversational onboarding
}

/**
 * ChatPanel component that provides the AI-driven interface
 */
const ChatPanel: React.FC<ChatPanelProps> = ({
  onCollapseChange,
  opacity = 1,
  newSystemMessage,
  outline,
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
  const [suggestions, setSuggestions] = useState<string[]>([]);

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

    // Default welcome message
    return [{
      id: 'welcome-message',
      type: 'ai',
      message: outlineMode
        ? "Hi! I'll help you create your presentation. What would you like to create? Tell me about your topic, audience, or goal."
        : "Hi there! What kind of presentation are you looking to create? Drag and drop anything you want to add to your presentation in the chat.",
      timestamp: new Date(),
      feedback: null
    }];
  };

  const [messages, setMessages] = useState<ExtendedChatMessageProps[]>(getInitialMessages());
  const [isLoading, setIsLoading] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const [outlineSlideTarget, setOutlineSlideTarget] = useState<number | 'all'>('all');

  // Get deck data for slide dropdown in outline mode
  const deckData = useDeckStore(state => state.deckData);

  // Outline agent for conversational outline generation (only when enabled)
  const outlineAgentData = useOutlineAgentHook();
  const outlineAgent = (outlineMode && useOutlineAgent) ? outlineAgentData : null;

  // Handle initial conversational data from onboarding
  const hasProcessedConversationalDataRef = useRef(false);
  useEffect(() => {
    if (
      initialConversationalData &&
      !hasProcessedConversationalDataRef.current &&
      onOutlineAgentToolCall &&
      outlineAgent
    ) {
      console.log('[ChatPanel] Processing initial conversational data:', initialConversationalData);
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
      } else {
        // No slides yet - we need to generate the outline using the agent
        // Construct a prompt from the collected data
        const topic = initialConversationalData.topic;
        const slideCount = initialConversationalData.slideCount;
        const detailLevel = initialConversationalData.detailLevel || 'standard';
        const chatHistory = initialConversationalData.chatHistory;
        const themeChanges = initialConversationalData.themeChanges;

        let prompt = `Create a presentation about ${topic}.`;
        if (slideCount) {
          prompt += ` It should have approximately ${slideCount} slides.`;
        }

        // Construct full prompt with context for the agent
        let fullPrompt = prompt;
        if (chatHistory && chatHistory.length > 0) {
          const historyText = chatHistory.map((msg: any) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n');
          fullPrompt += `\n\nContext from previous conversation:\n${historyText}\n\nPlease use this context to create a detailed outline that addresses the user's specific requirements discussed above.`;
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

        // Trigger agent generation with full context
        outlineAgent.sendMessage(
          fullPrompt,
          (outlineData) => {
            console.log('[ChatPanel] Agent generated outline from conversational data:', outlineData);
            onOutlineAgentToolCall({
              topic: outlineData.topic || topic,
              slide_count: outlineData.slide_count || slideCount,
              detail_level: outlineData.detail_level || detailLevel,
              slides: outlineData.slides, // The agent returns 'slides' in the data
              narrative: outlineData.narrative,
              theme_changes: outlineData.theme_changes || themeChanges // Use agent's theme or passed theme
            });
          },
          {
            // Pass context if needed
            slide_count: slideCount,
            detail_level: detailLevel
          }
        );
      }
    }
  }, [initialConversationalData, onOutlineAgentToolCall, outlineAgent]);

  // Auto-send initial prompt from URL when in outline agent mode
  const hasProcessedInitialPromptRef = useRef(false);
  useEffect(() => {
    if (
      initialPromptFromURL &&
      outlineAgent &&
      !hasProcessedInitialPromptRef.current &&
      !outlineAgent.isProcessing
    ) {
      console.log('[ChatPanel] Auto-sending initial prompt from URL:', initialPromptFromURL);
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
            console.log('[ChatPanel] Initial prompt outline data received:', outlineData);

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
  type PendingAttachment = { name: string; type: string; size: number; file: File };
  type RegisteredAttachment = { name: string; mimeType: string; size: number; url: string; attachmentId?: string };
  const [attachments, setAttachments] = useState<Array<PendingAttachment | RegisteredAttachment>>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
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
  const styleToolStateRef = useRef<{ active: boolean; name: string; lastStartTs: number; lastFinishTs: number }>({ active: false, name: '', lastStartTs: 0, lastFinishTs: 0 });
  const recentOptimizedSlidesRef = useRef<Map<string, number>>(new Map());
  // Removed under-input plan indicator; plan is rendered as a compact chat row

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
      // Start with the first step and progressively accumulate
      setMessages(prev => [...prev, { id, type: 'system', message: 'Planning', timestamp: new Date(), feedback: null, metadata: { type: 'agent_plan', compactRow: true, steps: [steps[0]] } }]);
    } else {
      const id = planMsgIdRef.current!;
      // Preserve any already shown steps; if none, seed with the first incoming step
      setMessages(prev => prev.map(m => {
        if (m.id !== id) return m;
        const existingSteps = Array.isArray(m.metadata?.steps) ? m.metadata.steps as string[] : [];
        const nextSteps = existingSteps.length > 0 ? existingSteps : [steps[0]];
        return { ...m, message: 'Planning', metadata: { ...m.metadata, type: 'agent_plan', compactRow: true, steps: nextSteps } };
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
      const slidesArr = Array.isArray(deckData?.slides) ? deckData.slides : [];

      const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig;
      const matches = label.match(uuidRegex) || [];

      // First: if any UUID corresponds to a slide, prefer that and show Slide N — Title
      for (const id of matches) {
        const slideIndex = slidesArr.findIndex((s: any) => s?.id === id);
        if (slideIndex >= 0) {
          const s = slidesArr[slideIndex];
          const slideNumber = slideIndex + 1;
          const hasTitle = typeof s?.title === 'string' && s.title.trim().length > 0;
          return hasTitle ? `Slide ${slideNumber} — ${s.title.trim()}` : `Slide ${slideNumber}`;
        }
      }

      // Second: try to resolve component UUID to a friendly type on a slide
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
          const s = slidesArr[slideIndex];
          const slideNumber = slideIndex + 1;
          const hasTitle = typeof s?.title === 'string' && s.title.trim().length > 0;
          const slideLabel = hasTitle ? `Slide ${slideNumber} — ${s.title.trim()}` : `Slide ${slideNumber}`;
          return `${typeName} on ${slideLabel}`;
        }
      }

      // Third: if label mentions any known slide id (not matched as regex for some reason)
      for (let i = 0; i < slidesArr.length; i++) {
        const s = slidesArr[i];
        if (s?.id && label.includes(s.id)) {
          const slideNumber = i + 1;
          const hasTitle = typeof s?.title === 'string' && s.title.trim().length > 0;
          return hasTitle ? `Slide ${slideNumber} — ${s.title.trim()}` : `Slide ${slideNumber}`;
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

  const appendToolRow = useCallback((tool: string, status: string) => {
    const now = Date.now();
    if (now < agentFlowLockoutUntilRef.current) return;
    const text = status === 'start' ? `Using tool: ${tool}` : status === 'finish' ? `Tool finished: ${tool}` : `⚠️ ${tool} error`;
    const key = `${status}:${tool}`;
    const last = toolDedupRef.current.get(key) || 0;
    if (now - last < TOOL_DEDUP_WINDOW_MS) return;
    toolDedupRef.current.set(key, now);
    toolDedupRef.current.forEach((t, k) => { if (now - t > TOOL_DEDUP_WINDOW_MS * 3) toolDedupRef.current.delete(k); });
    setMessages(prev => [...prev, { id: `tool-${now}-${Math.random().toString(36).slice(2, 6)}`, type: 'system', message: text, timestamp: new Date(), feedback: null, metadata: { type: 'agent_tool', status, tool, compactRow: true } }]);
  }, [setMessages]);

  const isStyleTool = useCallback((toolName?: string): boolean => {
    const t = (toolName || '').toLowerCase();
    // Be permissive: match typical style tool names
    return (
      t.includes('style') && (t.includes('slide') || t.includes('deck') || t.includes('theme'))
    ) || t === 'style_slide' || t === 'style_slides' || t === 'apply_style' || t === 'apply_theme';
  }, []);

  const getSlideIdsFromDiff = useCallback((diff: any): string[] => {
    if (!diff || typeof diff !== 'object') return [];
    const ids = new Set<string>();
    try {
      const upd = Array.isArray(diff.slides_to_update) ? diff.slides_to_update : [];
      upd.forEach((s: any) => { if (s && typeof s.slide_id === 'string') ids.add(s.slide_id); });
      const add = Array.isArray(diff.slides_to_add) ? diff.slides_to_add : [];
      add.forEach((s: any) => { if (s && typeof s.id === 'string') ids.add(s.id); });
    } catch { }
    return Array.from(ids);
  }, []);

  const optimizeSlidesByIdSequential = useCallback(async (slideIds: string[]) => {
    // Font optimization removed
    return;
  }, []);

  const maybeOptimizeFontsForDiff = useCallback(async (diff?: any) => {
    // Font optimization removed
    return;
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
      console.log('[applyDeckDiff] No diff provided, returning');
      return;
    }

    console.log('[applyDeckDiff] Starting diff application', {
      hasSlides: !!(deckDiff as any).slides_to_update?.length,
      slidesCount: (deckDiff as any).slides_to_update?.length,
      isEditDiff
    });

    // HARD GUARD: If deck is already completed, do not process any generation diffs
    // BUT: Always allow edit diffs through (component updates from editing agent)
    try {
      const deckData = (useDeckStore as any).getState().deckData;
      const allCompleted = Array.isArray(deckData?.slides) && deckData.slides.length > 0 && deckData.slides.every((s: any) => s.status === 'completed');
      console.log('[applyDeckDiff] Completion check', {
        hasSlides: Array.isArray(deckData?.slides),
        slideCount: deckData?.slides?.length,
        allCompleted,
        isEditDiff
      });
      if (allCompleted && !isEditDiff) {
        console.log('[ChatPanel] Deck is completed; skipping generation diff application');
        setIsGenerating(false);
        return;
      }
      if (allCompleted && isEditDiff) {
        console.log('[ChatPanel] Deck is completed but this is an edit diff; allowing through');
      }
    } catch (e) {
      console.log('[applyDeckDiff] Error checking completion status', e);
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
          console.log('[AgentChat] Skipping diff due to active interaction');
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
            console.log('[ChatPanel] Removing component from draft', { slideId, compId });
            editorStore.removeDraftComponent(slideId, compId, true);
          });

          // For updates and additions, check if slide has unsaved local changes
          // If so, skip to avoid overwriting user edits
          try {
            const hasLocal = typeof editorStore.hasSlideChanged === 'function' && editorStore.hasSlideChanged(slideId);
            if (hasLocal) {
              console.log('[ChatPanel] Skipping updates/additions for slide with local changes', { slideId });
              return;
            }
          } catch { }

          // Apply component updates
          (slideDiff.components_to_update || []).forEach((compDiff: any) => {
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

          // Add new components
          (slideDiff.components_to_add || []).forEach((comp: any) => {
            editorStore.addDraftComponent(slideId, comp, true);
          });
        });

        // Apply deck-level changes to main store
        const { deckData, updateDeckData } = (useDeckStore as any).getState();
        console.log('[ChatPanel] Applying deck diff to main store', {
          isEditing,
          hasRemoves: !!(deckDiff as any).slides_to_update?.some((s: any) => s.components_to_remove?.length > 0)
        });
        const updated = applyDeckDiffPure(deckData, deckDiff as any);
        if (updated !== deckData) {
          // CRITICAL FIX: Backend auto-apply has ALREADY persisted deck-level changes
          // So we should ALWAYS skip backend here to avoid double-saving
          // Just update local state for instant preview
          const hasSlideAdditions = (deckDiff as any).slides_to_add && (deckDiff as any).slides_to_add.length > 0;
          const hasSlideRemovals = (deckDiff as any).slides_to_remove && (deckDiff as any).slides_to_remove.length > 0;
          const hasDeckProps = (deckDiff as any).deck_properties && Object.keys((deckDiff as any).deck_properties).length > 0;

          console.log('[ChatPanel][applyDeckDiff] Applying deck-level changes locally', {
            hasSlideAdditions,
            hasSlideRemovals,
            hasDeckProps,
            slidesInUpdated: updated.slides?.length,
            slidesInCurrent: deckData.slides?.length
          });

          // Always skip backend since backend auto-apply already persisted
          updateDeckData(updated, { skipBackend: true });
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
  const applyPreviewSlidesRespectingEditMode = useCallback((previewSlides: any[]) => {
    if (!Array.isArray(previewSlides) || previewSlides.length === 0) return;
    // HARD GUARD: If deck is already completed, do not apply preview slides
    try {
      const deckData = (useDeckStore as any).getState().deckData;
      const allCompleted = Array.isArray(deckData?.slides) && deckData.slides.length > 0 && deckData.slides.every((s: any) => s.status === 'completed');
      if (allCompleted) {
        console.log('[ChatPanel] Deck is completed; skipping preview merge');
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
        console.log('[AgentChat] Skipping preview merge due to active interaction');
        return;
      }
    } catch { }
    try {
      const editorStore = useEditorStore.getState();
      previewSlides.forEach((previewSlide: any) => {
        const slideId = previewSlide?.id;
        if (!slideId) return;
        // If this slide has local unsaved changes, don't overwrite its draft
        try {
          const hasLocal = typeof editorStore.hasSlideChanged === 'function' && editorStore.hasSlideChanged(slideId);
          if (hasLocal) {
            return;
          }
        } catch { }
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

  try {
    // Use Zustand store directly
    const deckData = useDeckStore(state => state.deckData);
    slides = deckData.slides;

    const navigationContext = useNavigation();
    currentSlideIndex = navigationContext.currentSlideIndex;
  } catch (error) {
    console.error("ChatPanel: Context hook error (possibly rendered outside providers)", error);
    // Continue with default values if hook fails
  }

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(messages.length);
  const lastMessageTypeRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [themePreview, setThemePreview] = useState<{ theme?: any; palette?: any; typography?: any; tools?: Array<{ label: string; status: string }>; images?: any[]; logo?: { url?: string; light_variant?: string; dark_variant?: string; source?: string } } | null>(null);
  const [isThemePreviewOpen, setIsThemePreviewOpen] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);

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

    return () => {
      window.removeEventListener('add_system_message', handleAddSystemMessage as EventListener);
    };
  }, []);

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
      console.log('[ChatPanel] Notifying parent of generation state change:', isGenerating);
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
        console.log('[ChatPanel] All slides now have content, stopping isGenerating');
        setIsGenerating(false);
      }
    }
  }, [outlineMode, isGenerating, outline?.slides]);

  // Sync outline slide target with current slide index (works in both outline and slide modes)
  useEffect(() => {
    console.log('[ChatPanel] outlineCurrentSlideIndex changed:', outlineCurrentSlideIndex);
    console.log('[ChatPanel] Current outlineSlideTarget:', outlineSlideTarget);
    if (outlineCurrentSlideIndex !== undefined && outlineCurrentSlideIndex >= 0) {
      console.log('[ChatPanel] Setting dropdown to slide:', outlineCurrentSlideIndex + 1);
      setOutlineSlideTarget(outlineCurrentSlideIndex);
      console.log('[ChatPanel] Dropdown should now show: Slide', outlineCurrentSlideIndex + 1);
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

  // Scroll to bottom when messages change
  useEffect(() => {
    // Check if we're just updating an existing images_collected message
    const isJustUpdatingImages = messages.length === previousMessageCountRef.current &&
      messages.some(msg => msg.metadata?.type === 'images_collected') &&
      lastMessageTypeRef.current === 'images_collected';

    // Only scroll if we're not just updating images
    if (!isJustUpdatingImages) {
      messagesEndRef.current?.scrollIntoView({
        behavior: 'smooth'
      });
    }

    // Update refs for next comparison
    previousMessageCountRef.current = messages.length;
    const lastMessage = messages[messages.length - 1];
    lastMessageTypeRef.current = lastMessage?.metadata?.type || null;
  }, [messages]);

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
              const { tool, status } = (evt as any).data || {};
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
              console.log('[AgentChat] deck.edit.proposed received', {
                editId: edit?.id,
                hasDiff: Boolean(edit?.diff),
                diffKeys: edit?.diff ? Object.keys(edit.diff) : [],
              });
              const summary = edit?.summary || 'Proposed edit available';
              if (edit?.id && edit?.diff) {
                try {
                  proposedDiffsRef.current.set(edit.id, edit.diff);
                  console.log('[AgentChat] Stored proposed diff for edit', edit.id);
                } catch (e) {
                  console.warn('[AgentChat] Failed to store proposed diff', e);
                }
                // Apply preview diff immediately for real-time preview, respecting edit mode
                try {
                  const before = useDeckStore.getState().deckData;
                  console.log('[AgentChat] Applying preview diff', {
                    slidesBefore: before?.slides?.length,
                    versionBefore: (before as any)?.version,
                  });
                  applyDeckDiffRespectingEditMode(edit.diff, true);  // Pass true - this is an edit proposal
                  // Trigger font optimization for slides touched by style tool
                  // eslint-disable-next-line @typescript-eslint/no-floating-promises
                  maybeOptimizeFontsForDiff(edit.diff);
                  setTimeout(() => {
                    const after = useDeckStore.getState().deckData;
                    console.log('[AgentChat] Preview diff applied', {
                      slidesAfter: after?.slides?.length,
                      versionAfter: (after as any)?.version,
                    });
                  }, 0);
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
                // Only set preview guards for preview-type events to avoid suppressing realtime DB updates
                const now = Date.now();
                (window as any).__pendingPreviewTs = now;
                if (editId) (window as any).__pendingPreviewEditId = editId;

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
                  try {
                    const state = styleToolStateRef.current;
                    const recentlyFinished = Date.now() - (state.lastFinishTs || 0) <= 15000;
                    if (state.active || recentlyFinished) {
                      const ids = normalizedPreviewSlides.map((ps: any) => ps?.id).filter((v: any) => typeof v === 'string');
                      // eslint-disable-next-line @typescript-eslint/no-floating-promises
                      optimizeSlidesByIdSequential(ids);
                    }
                  } catch { }
                  return;
                }

                // Fallback to diff-based updates if no preview slides
                if (diff) {
                  console.log('[Realtime][preview.diff] Applying diff', { editId, hasSlides: !!(diff.slides_to_update?.length) });
                  applyDeckDiffRespectingEditMode(diff, true);  // Pass true - this is an edit preview
                  // Trigger font optimization for slides touched by style tool
                  // eslint-disable-next-line @typescript-eslint/no-floating-promises
                  maybeOptimizeFontsForDiff(diff);
                  // No version bump; drafts updated component-wise during edit mode
                } else {
                  console.warn('[Realtime][preview.diff] No diff or slides in payload', { editId });
                }
              } catch (e) {
                console.error('[Realtime][preview.diff] Error applying preview', e);
              }
              return;
            }
            if (evt.type === 'deck.edit.applied') {
              const appliedEditId = (evt as any).data?.editId;
              const appliedMessageId = (evt as any).messageId;
              let normalizedAppliedSlides = normalizeSlidesPayload((evt as any).data?.slides);
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
              const deckRevision = (evt as any).data?.deckRevision;
              const ts = Date.now();
              console.log('[Realtime][edit.applied] received', { editId: appliedEditId, deckRevision, ts });
              console.log('[Realtime][edit.applied] full event data:', JSON.stringify((evt as any).data, null, 2));
              console.log('[Realtime][edit.applied] has deck_diff?', !!(evt as any).data?.deck_diff);
              if ((evt as any).data?.deck_diff) {
                console.log('[Realtime][edit.applied] deck_diff details:', JSON.stringify((evt as any).data.deck_diff, null, 2));
              }
              setMessages(prev => [
                ...prev,
                { id: `applied-${Date.now()}`, type: 'system', message: `✅ Edit applied`, timestamp: new Date(), feedback: null, metadata: { type: 'edit_applied', compactRow: true, showIcon: false } }
              ]);
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
                  console.log('[Realtime][edit.applied] using deck_diff from event data', { editId, diff });
                }

                if (diff) {
                  console.log('[Realtime][edit.applied] applying diff', { editId, diffKeys: Object.keys(diff), slidesToUpdate: diff.slides_to_update?.length });
                  const before = useDeckStore.getState().deckData;
                  applyDeckDiffRespectingEditMode(diff, true);  // Pass true to indicate this is an edit diff
                  // Trigger font optimization for slides touched by style tool
                  // eslint-disable-next-line @typescript-eslint/no-floating-promises
                  maybeOptimizeFontsForDiff(diff);
                  setTimeout(() => {
                    const after = useDeckStore.getState().deckData;
                    console.log('[AgentChat] Stored diff applied', {
                      slidesBefore: before?.slides?.length,
                      slidesAfter: after?.slides?.length,
                      versionBefore: (before as any)?.version,
                      versionAfter: (after as any)?.version,
                    });
                  }, 0);
                  proposedDiffsRef.current.delete(editId);

                  // CRITICAL FIX: Keep preview guards active for 2 seconds to prevent Supabase realtime
                  // from overwriting agent-applied changes with stale data
                  // The local diff has already been applied, and we need to give the database time to commit
                  try {
                    const agentEditTimestamp = Date.now();
                    (window as any).__lastAgentEditTs = agentEditTimestamp;

                    // Clear guards after 2 seconds to allow Supabase realtime to sync
                    setTimeout(() => {
                      if ((window as any).__pendingPreviewTs) delete (window as any).__pendingPreviewTs;
                      if ((window as any).__pendingPreviewEditId) delete (window as any).__pendingPreviewEditId;
                      console.log('[Realtime][edit.applied] Preview guards cleared after 2s delay');
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
                    console.log('[Realtime][edit.applied] using deck_diff from event data (message fallback)', { messageId: appliedMessageId });
                  }
                  if (diff) {
                    console.log('[Realtime][edit.applied] applying message-based diff', { messageId: appliedMessageId });
                    applyDeckDiffRespectingEditMode(diff, true);  // Pass true to indicate this is an edit diff
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    maybeOptimizeFontsForDiff(diff);

                    // CRITICAL FIX: Keep preview guards active for 2 seconds
                    try {
                      const agentEditTimestamp = Date.now();
                      (window as any).__lastAgentEditTs = agentEditTimestamp;

                      // Clear guards after delay
                      setTimeout(() => {
                        if ((window as any).__pendingPreviewTs) delete (window as any).__pendingPreviewTs;
                        if ((window as any).__pendingPreviewEditId) delete (window as any).__pendingPreviewEditId;
                        console.log('[Realtime][edit.applied] Preview guards cleared after 2s (message-based diff path)');
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
                      console.log('[Realtime][edit.applied] Preview guards cleared (no diff fallback path)');
                    } catch { }

                    const isEditing = typeof window !== 'undefined' && (window as any).__isEditMode === true;
                    if (normalizedAppliedSlides.length > 0) {
                      console.log('[Realtime][edit.applied] applying slide payload fallback', { count: normalizedAppliedSlides.length });
                      applyPreviewSlidesRespectingEditMode(normalizedAppliedSlides);
                      try {
                        const ids = normalizedAppliedSlides.map((sl: any) => sl?.id).filter((v: any) => typeof v === 'string');
                        if (ids.length > 0) {
                          // eslint-disable-next-line @typescript-eslint/no-floating-promises
                          optimizeSlidesByIdSequential(ids);
                        }
                      } catch { }
                    } else if (!isEditing) {
                      console.log('[Realtime][edit.applied] no cached diff; relying on Supabase realtime (guards cleared)');
                      // NOTE: Don't force loadDeck() here - let Supabase realtime handle it
                      // Guards are cleared, so realtime updates will come through naturally
                    } else {
                      console.log('[Realtime][edit.applied] no cached diff; in edit mode, relying on Supabase realtime');
                    }
                  }
                }
                // NOTE: Even if backend provided a deckRevision, don't force loadDeck()
                // Let Supabase realtime handle it naturally since guards are cleared
                // Forcing a reload here can fetch stale data and replace the locally applied changes
                if (deckRevision) {
                  console.log('[Realtime][edit.applied] deckRevision provided; relying on Supabase realtime', { deckRevision });
                }
              } catch { }
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
        const sid = await client.createSession(String(deckId), String(slideId), { agentProfile: 'authoring' });
        client.openWebSocket();
        agentClientRef.current = client;
        setAgentSessionId(sid);
        sessionSlideIdRef.current = slideId;
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
    // If we already have a session but the active slide changed, re-create the session
    try {
      const expectedSlideId = slides[currentSlideIndex]?.id;
      if (agentClientRef.current && agentSessionId) {
        if (sessionSlideIdRef.current !== expectedSlideId) {
          try { agentClientRef.current.disconnect(); } catch { }
          agentClientRef.current = null;
          setAgentSessionId(null);
        } else {
          return true;
        }
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
              const { tool, status } = (evt as any).data || {};
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
                // Mark that a preview has been applied so realtime DB updates older than this are ignored
                try { (window as any).__pendingPreviewTs = Date.now(); } catch { }
                if (diff) {
                  applyDeckDiffRespectingEditMode(diff, true);  // Pass true - this is an edit preview
                  // Trigger font optimization for slides touched by style tool
                  // eslint-disable-next-line @typescript-eslint/no-floating-promises
                  maybeOptimizeFontsForDiff(diff);
                }
              } catch { }
              return;
            }
            if (evt.type === 'deck.edit.applied') {
              setMessages(prev => [...prev, { id: `applied-${Date.now()}`, type: 'system', message: `✅ Edit applied`, timestamp: new Date(), feedback: null, metadata: { type: 'edit_applied', compactRow: true } }]);

              // CRITICAL FIX: Clear preview guards immediately to allow Supabase realtime updates
              // Backend has already persisted changes, so we want realtime to sync them
              try {
                if ((window as any).__pendingPreviewTs) delete (window as any).__pendingPreviewTs;
                if ((window as any).__pendingPreviewEditId) delete (window as any).__pendingPreviewEditId;
                console.log('[Realtime][edit.applied][secondary] Preview guards cleared to allow database sync');
              } catch { }

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

              // CRITICAL FIX: Reload deck from database after backend has persisted changes
              // The backend has already saved the changes, but frontend draft/subscription system is broken
              // Simple solution: just reload from DB after giving backend time to write
              console.log('[deck.edit.applied] 🔄 Scheduling deck reload in 2 seconds...');
              setTimeout(() => {
                console.log('[deck.edit.applied] 🔄 RELOADING DECK FROM DATABASE NOW');
                const deckStore = useDeckStore.getState();
                if (deckStore.loadDeck) {
                  deckStore.loadDeck();
                  console.log('[deck.edit.applied] ✅ Deck reload triggered');
                } else {
                  console.error('[deck.edit.applied] ❌ loadDeck function not found!');
                }
              }, 2000); // 2 second delay to ensure backend write completes

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
        const sid = await client.createSession(String(deckId), String(slideId), { agentProfile: 'authoring' });
        client.openWebSocket();
        agentClientRef.current = client;
        setAgentSessionId(sid);
        sessionSlideIdRef.current = slideId;
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
      // Replace pending attachments with the registered ones
      setAttachments(prev => {
        const next = [...prev];
        uploaded.forEach(reg => {
          const idx = next.findIndex(a => (a as any).file && a.name === reg.name && (a as any).size === reg.size);
          if (idx !== -1) {
            next[idx] = reg;
          } else {
            next.push(reg);
          }
        });
        return next;
      });
    } catch (err) {
      console.error('Attachment upload/register failed', err);
      setMessages(prev => [...prev, { id: `sys-${Date.now()}`, type: 'system', message: 'File upload failed. Please try again.', timestamp: new Date(), feedback: null }]);
    } finally {
      setIsUploading(false);
      isUploadingRef.current = false;
    }
  }, [ensureAgentSession, agentSessionId, setMessages]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    // Immediately add pending attachments as badges and start upload + registration
    const pending = files.map(file => ({ name: file.name, type: file.type || 'application/octet-stream', size: file.size, file }));
    setAttachments(prev => [...prev, ...pending]);
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
    // Show pending badges immediately and start upload
    const pending = files.map(file => ({ name: file.name, type: file.type || 'application/octet-stream', size: file.size, file }));
    setAttachments(prev => [...prev, ...pending]);
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
            message: 'You can type any command here to edit your presentation, or click directly on elements in the slides to modify them.',
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
        console.log('[ChatPanel] Processing new system message:', {
          message: systemMessageToAdd.message.substring(0, 50),
          type: systemMessageToAdd.metadata?.type,
          stage: systemMessageToAdd.metadata?.stage,
          isStreamingUpdate: systemMessageToAdd.metadata?.isStreamingUpdate,
          progress: systemMessageToAdd.metadata?.progress,
          existingProgressMessage: prevMessages.some(m => m.id === 'generation-progress')
        });

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

  // Send message to AI assistant via API
  const sendMessage = async () => {
    if (!input.trim()) return;

    console.log('[ChatPanel] sendMessage called', {
      outlineMode,
      useOutlineAgent,
      hasOnOutlineAgentToolCall: !!onOutlineAgentToolCall,
      input: input.substring(0, 50)
    });

    // Create timestamp now for consistency
    const timestamp = new Date();
    const userMessageId = `user-${Date.now()}`;

    // Snapshot current selections/attachments for tagging in the message
    const previewSelections = selectedElements.map(s => ({ id: s.elementId, label: s.label }));
    const previewAttachments = attachments.map(a => a.name);

    // Create the user message object
    const userMessage: ExtendedChatMessageProps = {
      id: userMessageId,
      type: 'user',
      message: input,
      timestamp,
      feedback: null,
      metadata: {
        selectionsPreview: previewSelections,
        attachmentNames: previewAttachments
      }
    };

    // Handle outline mode with conversational agent
    if (outlineMode && useOutlineAgent && onOutlineAgentToolCall) {
      console.log('[ChatPanel] Entering outline agent mode');
      const currentInput = input;

      // STEP 1: Add user message to UI IMMEDIATELY
      const userMessageId = `user-${Date.now()}`;
      setMessages(prev => [...prev, {
        id: userMessageId,
        type: 'user',
        message: currentInput,
        timestamp: new Date(),
        feedback: null
      }]);

      setInput('');
      setIsGenerating(true);

      // STEP 2: Add AI placeholder message
      const aiMessageId = `ai-${Date.now()}`;
      setMessages(prev => [...prev, {
        id: aiMessageId,
        type: 'ai',
        message: '',
        timestamp: new Date(),
        feedback: null,
        metadata: { isTyping: true }
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

      // STEP 4: Stream response from agent
      try {
        let fullResponse = '';
        let outlineData: any = null;

        console.log('[ChatPanel] Starting stream with context:', context);

        for await (const event of streamOutlineAgentChat({
          message: currentInput,
          chat_history: convertMessagesToApiFormat(messages),
          context: context
        })) {
          if (event.type === 'text') {
            fullResponse += event.content;

            // Remove JSON from display
            let displayText = fullResponse.replace(/```json\s*[\s\S]*?\s*```/g, '');
            displayText = displayText.replace(/^json\s*$[\s\S]*?^\}$/gm, '');
            if (displayText.includes('"action"') && displayText.includes('"slides"')) {
              displayText = displayText.replace(/\{[\s\S]*"action"[\s\S]*\}/g, '');
            }
            displayText = displayText.trim();

            // Update AI message in real-time
            setMessages(prev => prev.map(m =>
              m.id === aiMessageId
                ? { ...m, message: displayText, metadata: { isTyping: true } }
                : m
            ));
          } else if (event.type === 'outline') {
            outlineData = event.data;
          }
        }

        // STEP 5: Finalize message
        setMessages(prev => prev.map(m =>
          m.id === aiMessageId
            ? { ...m, metadata: { isTyping: false } }
            : m
        ));

        // STEP 6: Handle outline updates
        if (outlineData) {
          if (outlineData.action === 'update_theme' && outline && outlineData.theme_changes) {
            // Apply theme changes
            console.log('[ChatPanel] Applying theme changes:', outlineData.theme_changes);

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
                console.log('[ChatPanel] Theme changes applied:', result);

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
                console.log('[ChatPanel] Theme update complete:', result.message);
              } else {
                console.error('[ChatPanel] Failed to apply theme changes:', response.statusText);
              }
            } catch (error) {
              console.error('[ChatPanel] Error applying theme changes:', error);
            }
          } else if (outlineData.action === 'update_slides' && outline && onOutlineUpdate) {
            // Diff-based update - only update specific slides
            console.log('[ChatPanel] Applying diff-based slide updates:', outlineData.updated_slides);

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

            console.log(`[ChatPanel] Updated ${updatedIndices.size} slides:`, Array.from(updatedIndices).map(i => i + 1).join(', '));
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
            console.log('[ChatPanel] Creating outline with slides:', newOutline.slides.map(s => ({ title: s.title, hasContent: !!s.content, content: s.content?.substring(0, 50) })));
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
            console.log('[ChatPanel] Created outline - slides without content:', slidesWithoutContent.length, '/', newOutline.slides.length);

            // Keep isGenerating true if slides are empty (will be filled by streaming or other mechanism)
            if (slidesWithoutContent.length > 0) {
              console.log('[ChatPanel] Outline has empty slides, keeping isGenerating true');
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
      console.log('[ChatPanel] Outline generation mode (non-agent)');

      // Add user message immediately
      setMessages(prev => [...prev, {
        id: `user-${Date.now()}`,
        type: 'user',
        message: input,
        timestamp: new Date(),
        feedback: null
      }]);

      setInput('');
      setIsLoading(true);

      try {
        // Call outline generation - parent will handle adding messages
        await onOutlineGenerate(input, {});
        setIsLoading(false);
      } catch (error) {
        console.error('Error generating outline:', error);
        setMessages(prev => [...prev, {
          id: `error-${Date.now()}`,
          type: 'ai',
          message: "I encountered an error while generating your outline. Please try again.",
          timestamp: new Date(),
          feedback: null
        }]);
        setIsLoading(false);
      }
      return;
    }

    try {
      console.log('[ChatPanel] Slide edit mode - sending message');

      // STEP 1: Add user message to UI IMMEDIATELY (just like outline mode)
      const userMsgId = `user-${Date.now()}`;
      setMessages(prev => [...prev, {
        id: userMsgId,
        type: 'user',
        message: input,
        timestamp: new Date(),
        feedback: null,
        metadata: {
          selectionsPreview: previewSelections,
          attachmentNames: previewAttachments
        }
      }]);

      // Clear input immediately
      setInput('');
      setIsLoading(true);

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
      const pending = attachments.filter((a: any) => (a as any).file && !(a as any).url) as PendingAttachment[];
      if (pending.length > 0) {
        try {
          await processAndRegisterFiles(pending.map(p => p.file));
        } catch { }
      }

      const finalized = (attachments as Array<PendingAttachment | RegisteredAttachment>).filter((a: any) => (a as any).url) as RegisteredAttachment[];
      const attachmentMeta = finalized.map(a => ({ name: a.name, mimeType: a.mimeType, size: a.size, url: a.url }));

      // Immediately clear UI selection bubbles and highlights before network call
      clearSelections();
      setAttachments([]);
      setIsSelecting(false);

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
          },
        });
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

      // Clear uploaded attachments after sending
      setAttachments([]);
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
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
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
  useEffect(() => {
    const suggestionsPool = (outlineMode && useOutlineAgent) ? OUTLINE_SUGGESTIONS : ALL_SUGGESTIONS;
    setSuggestions(sampleArray(suggestionsPool, 4));
  }, [outlineMode, useOutlineAgent]);

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
      {/* Header */}
      <div className="flex items-center justify-between p-3 min-w-0 whitespace-nowrap">
        {!isCollapsed && <div className="flex items-center">
          {/* ThemeToggle removed */}
        </div>}
      </div>

      {!isCollapsed && (
        <>

          {/* Messages - Fixed height to prevent resizing during streaming */}
          <div className="overflow-y-auto overflow-x-hidden p-2.5 pr-3 h-[calc(100vh-380px)] min-w-0" style={{ scrollbarGutter: 'stable both-edges' }}>
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
            {messages.map((msg) => {
              // Skip transient numeric-only AI/system crumbs (e.g., "0")
              const txt = typeof msg.message === 'string' ? msg.message : '';
              if ((msg.type === 'ai' || msg.type === 'system') && /^\s*\d+\s*$/.test(txt)) {
                return null;
              }
              // Don't show SlideGeneratingUI for generation status messages
              // Let them render as normal chat messages

              // Otherwise render normal chat message
              const inline = (msg.metadata?.isStreamingUpdate && themePreview) ? (
                <div>
                  <button
                    className="w-full text-left text-[11px] px-2 py-1 rounded-md glass-panel border border-[#929292]"
                    onClick={() => setIsThemePreviewOpen(v => !v)}
                    aria-expanded={isThemePreviewOpen}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Theme & assets</span>
                      <ChevronDown className={`w-3 h-3 transition-transform ${isThemePreviewOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {isThemePreviewOpen && (
                    <div className="mt-2 p-2 rounded-md glass-panel border border-[#929292]">
                      {themePreview?.palette && (() => {
                        // Build clean swatch list: Background, Text, and brand colors (no duplicates)
                        const palette = themePreview.palette;
                        const swatches: Array<{ label: string; color: string }> = [];

                        // Background color
                        const bgColor = palette.primary_background || (Array.isArray(palette.backgrounds) ? palette.backgrounds[0] : null);
                        if (bgColor) swatches.push({ label: 'Background', color: String(bgColor) });

                        // Text color
                        const textColor = palette.primary_text;
                        if (textColor) swatches.push({ label: 'Text', color: String(textColor) });

                        // Brand colors from the colors array (skip duplicates)
                        const reservedSet = new Set([
                          String(bgColor || '').toLowerCase(),
                          String(textColor || '').toLowerCase()
                        ].filter(Boolean));

                        const brandColors: string[] = Array.isArray(palette.colors) ? palette.colors.map(String) : [];
                        const seen = new Set<string>();
                        let brandIdx = 0;

                        for (let i = 0; i < brandColors.length && swatches.length < 14; i++) {
                          const hex = String(brandColors[i] || '').toLowerCase();
                          if (!hex) continue;
                          if (reservedSet.has(hex)) continue; // Skip if it's background or text
                          if (seen.has(hex)) continue; // Skip duplicates
                          seen.add(hex);

                          // Label first two as "Accent 1" and "Accent 2", rest as "Color 3", "Color 4", etc.
                          const label = brandIdx === 0 ? 'Accent 1' : brandIdx === 1 ? 'Accent 2' : `Color ${brandIdx + 1}`;

                          swatches.push({ label, color: brandColors[i] });
                          brandIdx++;
                        }

                        if (swatches.length === 0) return null;
                        return (
                          <div className="mb-2">
                            <div className="text-xs mb-1 opacity-80">Colors</div>
                            <div className="overflow-x-auto" style={{ WebkitMaskImage: 'none', maskImage: 'none' }}>
                              <div className="flex gap-2 min-w-max pr-2">
                                {swatches.map((s, i) => {
                                  return (
                                    <div key={`${s.label}-${i}`} className="flex flex-col items-center w-10">
                                      <div className="w-7 h-7 rounded border border-zinc-200 dark:border-neutral-700" style={{ background: s.color }} title={`${s.label}: ${s.color}`} />
                                      <div className="text-[9px] mt-0.5 opacity-70 truncate max-w-[40px]" title={s.label}>{s.label}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                      {themePreview?.typography && (
                        <div className="mb-2">
                          <div className="text-xs mb-1 opacity-80">Fonts</div>
                          <div className="flex gap-3 text-[11px] items-center">
                            <span
                              className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/10 border border-zinc-200 dark:border-neutral-700"
                              style={{ fontFamily: `${themePreview.typography?.hero_title?.family || 'Inter'}, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`, fontWeight: 700 }}
                            >
                              {themePreview.typography?.hero_title?.family || 'Heading'}
                            </span>
                            <span
                              className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/10 border border-zinc-200 dark:border-neutral-700"
                              style={{ fontFamily: `${themePreview.typography?.body_text?.family || 'Inter'}, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`, fontWeight: 500 }}
                            >
                              {themePreview.typography?.body_text?.family || 'Body'}
                            </span>
                          </div>
                        </div>
                      )}
                      {/* Logo preview (if extracted) */}
                      {themePreview?.logo?.url && (
                        <div className="mb-2">
                          <div className="text-xs mb-1 opacity-80">Logo</div>
                          <div className="h-8 flex items-center">
                            <img src={themePreview.logo.url} alt="Brand logo" className="h-8 object-contain rounded border border-zinc-200 dark:border-neutral-700 bg-white" />
                          </div>
                        </div>
                      )}
                      {Array.isArray(themePreview?.tools) && themePreview.tools.length > 0 && (
                        <div className="mb-2">
                          <div className="text-xs mb-1 opacity-80">Tools</div>
                          <div className="flex flex-wrap gap-1">
                            {themePreview.tools.map((t, i) => (
                              <span key={`${t.label}-${i}`} className={`text-[10px] px-1.5 py-0.5 rounded border ${t.status === 'finish' ? 'border-green-300 bg-green-50/50 dark:border-green-700/60 dark:bg-green-900/20' : 'border-zinc-300 bg-zinc-50/50 dark:border-neutral-700 dark:bg-white/5'}`}>{t.status === 'finish' ? '✓' : '…'} {t.label}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : undefined;

              return (
                <ChatMessage
                  key={msg.id}
                  {...msg}
                  inlineBelow={inline}
                  onFeedback={(feedback) => handleMessageFeedback(msg.id, feedback)}
                />
              );
            })}

            {isLoading && <ChatMessage type="ai" message="" isLoading={true} timestamp={new Date()} />}

            <div ref={messagesEndRef} />
          </div>

          {/* Input and buttons area - contained in a box */}
          <div className="px-2.5 pb-2.5 pt-6 min-w-0">
            <div
              className={
                `border rounded-xl px-3.5 pb-3.5 flex flex-col justify-between min-h-[230px] min-w-0 ${isDraggingOver ? 'border-orange-500 border-dashed border-2' : 'border-zinc-300 dark:border-[#929292]'
                }`
              }
            >
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

              {/* Attachment chips */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-3">
                  {attachments.map((att, idx) => {
                    const pending = (att as any).file && !(att as any).url;
                    return (
                      <div
                        key={`${att.name}-${idx}`}
                        className={`flex items-center gap-2 px-2 py-1 rounded-full text-xs border ${pending
                          ? 'bg-orange-50/40 dark:bg-orange-900/20 border-orange-300/70 dark:border-orange-700/60 text-orange-700 dark:text-orange-300'
                          : 'bg-neutral-900/5 dark:bg-white/10 border-neutral-300/60 dark:border-neutral-700'
                          }`}
                        aria-busy={pending}
                      >
                        {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span className="truncate max-w-[180px]">
                          {pending ? `Processing ${att.name}` : att.name}
                        </span>
                        <button
                          aria-label="Remove attachment"
                          className={`hover:opacity-80 ${pending ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
                          onClick={() => {
                            if (pending) return;
                            setAttachments(prev => prev.filter((_, i) => i !== idx));
                          }}
                        >
                          <XCircle size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Input Area */}
              <div>
                <div className="flex items-center mt-4 min-w-0">
                  <div className="w-px mr-2 h-8" style={{ backgroundColor: COLORS.SUGGESTION_PINK }}></div>
                  <Textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={(outlineMode && useOutlineAgent) ? "Refine your slides..." : "Design, edit, or enhance your deck..."}
                    className="bg-transparent border-none flex-grow text-foreground text-sm placeholder:text-muted-foreground placeholder:text-sm focus-visible:ring-0 focus-visible:ring-offset-0 pl-0 resize-none overflow-hidden"
                    data-tour="chat-input"
                  />
                </div>
              </div>

              {/* Bottom Row: Suggestions and Buttons */}
              <div className="mt-auto pt-2 relative flex flex-col min-w-0" onClick={() => inputRef.current?.focus()}>
                {/* Suggestions (top-left) with fade/collapse when typing */}
                {!isLoading && messages.length === 1 && (
                  <div
                    className="mr-2 overflow-hidden"
                    style={{
                      transition: 'opacity 180ms ease, max-height 180ms ease, margin-bottom 180ms ease',
                      opacity: input.trim().length > 0 ? 0 : 1,
                      maxHeight: input.trim().length > 0 ? 0 : 40,
                      marginBottom: input.trim().length > 0 ? 0 : 4,
                      pointerEvents: input.trim().length > 0 ? 'none' : 'auto'
                    }}
                  >
                    <div className="text-[11px] leading-none text-zinc-600 dark:text-zinc-400 opacity-70 mb-1">Try:</div>
                    <div className="flex flex-wrap gap-1">
                      {suggestions.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setInput(p); inputRef.current?.focus(); }}
                          className="h-6 px-1.5 rounded-full text-[11px] leading-none border border-transparent hover:border-zinc-300/70 dark:hover:border-neutral-700 hover:bg-transparent text-zinc-700 dark:text-zinc-200 transition-colors"
                          aria-label={`Use suggestion: ${p}`}
                        >
                          {p}
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
                      /* Slides mode: Edit/select toggle */
                      !isSlideEditing && (
                        <IconButton
                          variant="ghost"
                          size="xs"
                          className={`hover:bg-transparent h-6 w-auto px-2 gap-1 flex items-center justify-center transition-opacity ${isSelecting ? 'opacity-40' : 'opacity-100'}`}
                          style={{ color: isSelecting ? '#16a34a' : COLORS.SUGGESTION_PINK }}
                          data-tour="chat-target"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Toggling Target: if turning off, clear all selections/highlights
                            setIsSelecting(prev => {
                              const next = !prev;
                              if (next) {
                                // Turning ON chat targeting: ensure slide editing is OFF
                                try { setSlideEditing(false); } catch { }
                              } else {
                                // Turning OFF chat targeting: clear visuals
                                clearSelections();
                              }
                              return next;
                            });
                          }}
                          title={isSelecting ? 'Exit target mode' : 'Target elements'}
                        >
                          <Target size={14} />
                          <span className="text-[11px] font-semibold">Target</span>
                        </IconButton>
                      )
                    )}

                    {/* Send Button - Matching outline pink, no visual disabled state */}
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); sendMessage(); }}
                      disabled={!input.trim() || isLoading}
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


          </div>
        </>
      )}
    </div>
  );
};

export default ChatPanel;

