/**
 * Types for chat components and hooks
 */

import { ChatMessageProps, FeedbackType } from '../ChatMessage';

// Extended ChatMessageProps with an id field for feedback tracking
export interface ExtendedChatMessageProps extends ChatMessageProps {
  id: string;
  feedback?: FeedbackType;
  metadata?: {
    deckStateBefore?: any;
    deckStateAfter?: any;
    selectionsPreview?: Array<{ id: string; label: string }>;
    attachmentNames?: string[];
    attachments?: Array<{
      name: string;
      type?: string;
      size?: number;
      url?: string;
      previewUrl?: string;
      file?: File;
    }>;
    isTyping?: boolean;
    isResearching?: boolean;
    isAnalyzingFiles?: boolean;
    thinkingPhase?: string;
    [key: string]: any;
  };
}

// Attachment types
export interface PendingAttachment {
  name: string;
  type: string;
  size: number;
  file: File;
  previewUrl?: string;
}

export interface RegisteredAttachment {
  name: string;
  mimeType: string;
  size: number;
  url: string;
  attachmentId?: string;
  previewUrl?: string;
  file?: File; // Preserved for base64 conversion
  type?: string; // Preserved for file type detection
}

export type Attachment = PendingAttachment | RegisteredAttachment;

// Selection type for element targeting
export interface SelectedElement {
  elementId: string;
  elementType?: string | null;
  slideId?: string | null;
  label: string;
  overlaps: string[];
  bounds?: { x: number; y: number; width: number; height: number } | null;
}

// File attachment for API
export interface FileAttachment {
  id: string;
  name: string;
  type: string;
  content?: string; // base64 encoded
  url?: string;
  size?: number;
}

// Theme preview state
export interface ThemePreviewState {
  theme?: any;
  palette?: any;
  typography?: any;
  tools?: Array<{ label: string; status: string }>;
  images?: any[];
  logo?: {
    url?: string;
    light_variant?: string;
    dark_variant?: string;
    source?: string;
  };
}
