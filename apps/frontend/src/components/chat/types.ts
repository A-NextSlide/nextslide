/**
 * Consolidated chat types.
 * Re-export canonical definitions to avoid duplication.
 */

export * from './types/chat.types';
export type {
  Attachment,
  PendingAttachment,
  RegisteredAttachment,
  SelectedElement,
} from '@/components/ChatPanel/types';
export type { ThemePreviewState } from '@/components/ChatPanel/utils/themePreview';
