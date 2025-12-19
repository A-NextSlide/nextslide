import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDeckStore } from '../../stores/deckStore';
import { useNavigation } from '@/context/NavigationContext';
import { useOutlineAgent as useOutlineAgentHook } from '@/hooks/useOutlineAgent';
import type { SlideData } from '@/types/SlideTypes';
import type AgentChatClient from '@/services/agentChat';
import {
  ExtendedChatMessageProps,
  ChatPanelProps,
} from '../chat';
import { ChatInputArea, ChatMessageList } from './components';
import {
  useAgentEvents,
  useAgentSession,
  useChatAttachmentsManager,
  useChatMessageFeedback,
  useChatPendingMessages,
  useChatPrefillWithComponent,
  useChatScroll,
  useChatSelections,
  useChatSuggestions,
  useChatSystemMessages,
  useChatWelcomeMessage,
  useDeckDiffHandler,
  useInitialConversationalData,
  useLinkedInSelection,
  useOutlineChatSync,
  useOutlineInitialPrompt,
  useSendMessage,
  useThemePreviewState,
} from './hooks';
import { useIntegrationMentions } from '@/hooks/useIntegrationMentions';

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
  onOutlineUpdate,
  onOutlineGenerate,
  outlineMessages,
  outlineIsGenerating = false,
  outlineCurrentSlideIndex = 0,
  onOutlineChatGeneratingChange,
  initialConversationalData
}) => {
  const [input, setInput] = useState('');

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
  } = useIntegrationMentions();

  const suggestions = useChatSuggestions(outlineMode, useOutlineAgent);

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

  const {
    isLoading,
    addPendingMessage,
    removePendingMessage,
  } = useChatPendingMessages();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  // Old chat history - hidden by default, shown when user clicks "Load older messages"
  const [oldMessages, setOldMessages] = useState<ExtendedChatMessageProps[]>([]);
  const [showOldMessages, setShowOldMessages] = useState(false);
  const hasOldMessages = oldMessages.length > 0;
  const [outlineSlideTarget, setOutlineSlideTarget] = useState<number | 'all'>('all');

  // Ref to hold sendMessage function for continuation trigger
  const sendMessageRef = useRef<(() => void) | null>(null);

  const {
    selectedLinkedInProfile,
    selectedProfileForContinuationRef,
    originalLinkedInRequestRef,
    handleSelectLinkedInProfile,
    handleSkipLinkedInSelection,
  } = useLinkedInSelection({ input, setInput, sendMessageRef });

  // Get deck data for slide dropdown in outline mode
  const deckData = useDeckStore(state => state.deckData);

  // Add welcome message after deck finishes loading (prevents animation competing with render)
  // Use slides length as dependency to avoid re-renders on every slides array reference change
  const slideCount = deckData?.slides?.length ?? 0;
  useChatWelcomeMessage({
    outlineMode,
    useOutlineAgent,
    slideCount,
    isExistingDeck,
    setMessages,
  });

  // Outline agent for conversational outline generation (only when enabled)
  const outlineAgentData = useOutlineAgentHook();
  const outlineAgent = (outlineMode && useOutlineAgent) ? outlineAgentData : null;

  useInitialConversationalData({
    initialConversationalData,
    deckId,
    setMessages,
    onOutlineAgentToolCall,
    onOutlineChatGeneratingChange,
  });

  useOutlineInitialPrompt({
    initialPromptFromURL,
    outlineAgent,
    outline,
    setMessages,
    onOutlineUpdate,
    onOutlineAgentToolCall,
    onInitialPromptProcessed,
  });

  const {
    selectedElements,
    setSelectedElements,
    setIsSelecting,
    removeSelection,
    clearSelections,
  } = useChatSelections();
  const {
    applyDeckDiffRespectingEditMode,
    applyPreviewSlidesRespectingEditMode,
  } = useDeckDiffHandler({ setIsGenerating });

  let slides: SlideData[] = [];
  let currentSlideIndex = 0;
  let setCurrentSlideIndexSafe: (index: number) => void = () => {};

  try {
    slides = [...(deckData?.slides || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const navigationContext = useNavigation();
    currentSlideIndex = navigationContext.currentSlideIndex;
    setCurrentSlideIndexSafe = navigationContext.setCurrentSlideIndex;
  } catch (error) {
    console.error("ChatPanel: Context hook error (possibly rendered outside providers)", error);
  }

  const agentClientRef = useRef<AgentChatClient | null>(null);
  const [agentSessionId, setAgentSessionId] = useState<string | null>(null);

  const {
    handleCommonAgentEvent,
    handleDeckEditApplied,
    handleDeckEditProposed,
    handleDeckPreviewDiff,
    clearPlanTimers,
  } = useAgentEvents({
    setMessages,
    applyDeckDiffRespectingEditMode,
    applyPreviewSlidesRespectingEditMode,
    setCurrentSlideIndexSafe,
    agentClientRef,
    agentSessionId,
  });

  const { ensureAgentSession } = useAgentSession({
    slides,
    currentSlideIndex,
    setMessages,
    setOldMessages,
    agentClientRef,
    agentSessionId,
    setAgentSessionId,
    handleCommonAgentEvent,
    handleDeckEditApplied,
    handleDeckEditProposed,
    handleDeckPreviewDiff,
    clearPlanTimers,
  });

  const {
    attachments,
    attachmentsRef,
    setAttachmentsSafe,
    isDraggingOver,
    fileInputRef,
    onDragEnterPanel,
    onDragOverPanel,
    onDragLeavePanel,
    onDropPanel,
    handleFileChange,
    handleUploadClick,
    handleRemoveAttachment,
    processAndRegisterFiles,
  } = useChatAttachmentsManager({
    ensureAgentSession,
    agentClientRef,
    agentSessionId,
    setMessages,
  });

  const {
    messagesEndRef,
    scrollContainerRef,
    handleLoadOlderMessages,
  } = useChatScroll({ messages, showOldMessages, setShowOldMessages });

  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
  const { themePreview, isThemePreviewOpen, setIsThemePreviewOpen } = useThemePreviewState({ outline, currentPhase });

  const { sendMessage, showFallbackGenerate, handleFallbackGenerate } = useSendMessage({
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
  });

  const { handleMessageFeedback } = useChatMessageFeedback({ messages, setMessages });

  useChatSystemMessages({
    newSystemMessage,
    setMessages,
    setIsGenerating,
    setCurrentPhase,
  });

  useChatPrefillWithComponent({
    setSelectedElements,
    setInput,
    input,
    selectedElements,
    sendMessage,
    inputRef,
  });

  useOutlineChatSync({
    outlineMode,
    useOutlineAgent,
    outline,
    outlineMessages,
    isGenerating,
    setIsGenerating,
    onOutlineChatGeneratingChange,
    outlineCurrentSlideIndex,
    setOutlineSlideTarget,
    messagesLength: messages.length,
    setMessages,
  });

  // Sync local collapse state with parent component
  useEffect(() => {
    // When the collapse change handler exists, notify parent of local state changes
    if (onCollapseChange && isCollapsed) {
      onCollapseChange(isCollapsed);
    }
  }, [isCollapsed, onCollapseChange]);

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

  const handleVoiceTranscript = useCallback((text: string) => {
    setInput(prev => {
      const newText = prev.trim() ? `${prev} ${text}` : text;
      return newText;
    });
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleVoiceError = useCallback((error: unknown) => {
    console.error('Voice recording error:', error);
  }, []);

  // Style with dynamic opacity based on panel width
  const panelStyle = {
    opacity: opacity,
    transition: 'opacity 150ms ease-out'
  };

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
          <ChatMessageList
            messages={messages}
            oldMessages={oldMessages}
            showOldMessages={showOldMessages}
            hasOldMessages={hasOldMessages}
            onLoadOlderMessages={handleLoadOlderMessages}
            scrollContainerRef={scrollContainerRef}
            messagesEndRef={messagesEndRef}
            themePreview={themePreview}
            isThemePreviewOpen={isThemePreviewOpen}
            onToggleThemePreview={() => setIsThemePreviewOpen(v => !v)}
            onFeedback={handleMessageFeedback}
            onSelectLinkedInProfile={handleSelectLinkedInProfile}
            onSkipLinkedInSelection={handleSkipLinkedInSelection}
            selectedLinkedInProfileId={selectedLinkedInProfile?.id}
            deckData={deckData}
            showFallbackGenerate={showFallbackGenerate}
            onFallbackGenerate={handleFallbackGenerate}
            isLoading={isLoading}
          />
          <ChatInputArea
            input={input}
            onInputChange={handleInputChange}
            onKeyDown={handleKeyDown}
            inputRef={inputRef}
            isDraggingOver={isDraggingOver}
            isVoiceRecording={isVoiceRecording}
            selectedElements={selectedElements}
            onRemoveSelection={removeSelection}
            attachments={attachments}
            onRemoveAttachment={handleRemoveAttachment}
            onDragEnter={onDragEnterPanel}
            onDragOver={onDragOverPanel}
            onDragLeave={onDragLeavePanel}
            onDrop={onDropPanel}
            onUploadClick={handleUploadClick}
            onFileChange={handleFileChange}
            fileInputRef={fileInputRef}
            outlineMode={outlineMode}
            useOutlineAgent={useOutlineAgent}
            outlineSlideTarget={outlineSlideTarget}
            onOutlineSlideTargetChange={setOutlineSlideTarget}
            deckSlides={deckData?.slides}
            isLoading={isLoading}
            onSend={sendMessage}
            suggestions={suggestions}
            showSuggestions={!isLoading && messages.length <= 1}
            onSuggestionSelect={handleSuggestedPrompt}
            mentionState={mentionState}
            selectedMentions={selectedMentions}
            onSelectMention={(integration) => selectMention(integration, input, setInput)}
            onCloseMentionPopover={closeMentionPopover}
            onRemoveMention={removeMention}
            onVoiceTranscript={handleVoiceTranscript}
            onVoiceStart={() => setIsVoiceRecording(true)}
            onVoiceEnd={() => setIsVoiceRecording(false)}
            onVoiceError={handleVoiceError}
            deckData={deckData}
          />
        </>
      )}
    </div>
  );
};

export default ChatPanel;
