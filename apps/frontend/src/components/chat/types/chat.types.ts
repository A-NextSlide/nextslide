/**
 * Chat component types
 * Extracted from ChatPanel.tsx for reusability
 */

import { ChatMessageProps, FeedbackType } from '@/components/ChatMessage';

// Extended ChatMessageProps with an id field for feedback tracking
export interface ExtendedChatMessageProps extends ChatMessageProps {
  id: string;
  feedback?: FeedbackType | null;
  metadata?: {
    deckStateBefore?: any;
    deckStateAfter?: any;
    [key: string]: any;
  };
}

export interface ChatPanelProps {
  onCollapseChange?: (collapsed: boolean) => void;
  onUserMessageSend?: (message: string) => void;
  opacity?: number;
  isPending?: boolean;
  enableResponseTabs?: boolean;
  outline?: any;
  deckId?: string;
  isExistingDeck?: boolean; // True if this is an existing/completed deck (not actively generating)
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

// API message format
export interface ChatApiMessage {
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
  feedback?: 'up' | 'down';
}

// File attachment types
export interface ChatAttachment {
  name: string;
  type: string;
  size: number;
  preview?: string;
  content?: string;
}

export interface PendingAttachment extends ChatAttachment {
  id: string;
  file: File;
  isUploading?: boolean;
  uploadProgress?: number;
  error?: string;
}

// Chat state types
export interface ChatState {
  messages: ExtendedChatMessageProps[];
  isLoading: boolean;
  isCollapsed: boolean;
  input: string;
  attachments: PendingAttachment[];
}
