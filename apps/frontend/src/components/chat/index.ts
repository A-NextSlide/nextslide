/**
 * Chat components and hooks
 *
 * This module contains refactored chat functionality extracted from ChatPanel.tsx
 * Migration is incremental - ChatPanel.tsx still contains most logic but can
 * gradually adopt these hooks.
 *
 * ## Usage
 *
 * ```tsx
 * import { useChatAttachments } from '@/components/chat/hooks';
 *
 * function MyComponent() {
 *   const {
 *     attachments,
 *     handleFileChange,
 *     onDragEnter,
 *     onDragOver,
 *     onDragLeave,
 *     onDrop,
 *     clearAttachments,
 *     prepareFilesForApi
 *   } = useChatAttachments({
 *     onFilesAdded: (files) => {
 *       // Custom processing like agent registration
 *     }
 *   });
 * }
 * ```
 */

export * from './hooks';
export * from './types';
