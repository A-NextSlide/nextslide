/**
 * Hook for managing chat attachments (file upload, drag-drop, previews)
 *
 * This is a simplified hook that handles state and UI concerns.
 * File registration with the agent is handled separately in ChatPanel.
 */

import { useState, useRef, useCallback } from 'react';
import {
  createImagePreview,
  revokeImagePreview,
  fileToBase64,
} from '@/services/fileAnalysisService';
import type { Attachment, PendingAttachment, FileAttachment } from '../types';

interface UseChatAttachmentsOptions {
  /** Called when files are added (for custom processing like agent registration) */
  onFilesAdded?: (files: File[]) => void;
}

interface UseChatAttachmentsReturn {
  // State
  attachments: Attachment[];
  isUploading: boolean;
  isDraggingOver: boolean;

  // Refs
  fileInputRef: React.RefObject<HTMLInputElement>;
  isUploadingRef: React.MutableRefObject<boolean>;
  dragCounterRef: React.MutableRefObject<number>;

  // Setters (for external updates like agent registration)
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  setIsUploading: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDraggingOver: React.Dispatch<React.SetStateAction<boolean>>;

  // Actions
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleFilesSelected: (files: File[]) => void;
  clearAttachments: () => void;
  removeAttachment: (name: string) => void;
  handleUploadClick: () => void;

  // Drag handlers
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;

  // File utilities
  prepareFilesForApi: (snapshot: Attachment[]) => Promise<FileAttachment[]>;
  getAttachmentsSnapshot: () => {
    names: string[];
    full: Array<{
      name: string;
      type?: string;
      size?: number;
      url?: string;
      previewUrl?: string;
      file?: File;
    }>;
  };
}

export function useChatAttachments(options: UseChatAttachmentsOptions = {}): UseChatAttachmentsReturn {
  const { onFilesAdded } = options;

  // State
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const isUploadingRef = useRef(false);

  /**
   * Handle files selected (from file input or drop)
   */
  const handleFilesSelected = useCallback((files: File[]) => {
    if (files.length === 0) return;

    // Create pending attachments with previews
    const pending: PendingAttachment[] = files.map(file => {
      const previewUrl = file.type.startsWith('image/') ? createImagePreview(file) : undefined;
      return {
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        file,
        previewUrl
      };
    });

    setAttachments(prev => [...prev, ...pending]);

    // Notify parent for custom processing (e.g., agent registration)
    onFilesAdded?.(files);
  }, [onFilesAdded]);

  /**
   * Handle file input change
   */
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFilesSelected(files);
    // Reset input for same-file selection
    e.target.value = '';
  }, [handleFilesSelected]);

  /**
   * Trigger file input click
   */
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * Clear all attachments and revoke preview URLs
   */
  const clearAttachments = useCallback(() => {
    setAttachments(prev => {
      prev.forEach(a => {
        const previewUrl = (a as any).previewUrl;
        if (previewUrl) revokeImagePreview(previewUrl);
      });
      return [];
    });
  }, []);

  /**
   * Remove a specific attachment by name
   */
  const removeAttachment = useCallback((name: string) => {
    setAttachments(prev => {
      const toRemove = prev.find(a => a.name === name);
      if (toRemove) {
        const previewUrl = (toRemove as any).previewUrl;
        if (previewUrl) revokeImagePreview(previewUrl);
      }
      return prev.filter(a => a.name !== name);
    });
  }, []);

  // Drag handlers
  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    setIsDraggingOver(true);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  }, [isDraggingOver]);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDraggingOver(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);

    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      handleFilesSelected(files);
    }
  }, [handleFilesSelected]);

  /**
   * Get a snapshot of attachments for message metadata
   * Call this BEFORE clearing attachments
   */
  const getAttachmentsSnapshot = useCallback(() => {
    return {
      names: attachments.map(a => a.name),
      full: attachments.map(a => ({
        name: a.name,
        type: (a as any).type || (a as any).mimeType,
        size: a.size,
        url: (a as any).url,
        previewUrl: (a as any).previewUrl || (a as any).url,
        file: (a as any).file
      }))
    };
  }, [attachments]);

  /**
   * Convert attachments to API format (with base64 content)
   * Takes a snapshot to avoid stale closure issues
   */
  const prepareFilesForApi = useCallback(async (snapshot: Attachment[]): Promise<FileAttachment[]> => {
    if (snapshot.length === 0) return [];

    return Promise.all(
      snapshot.map(async (att) => {
        const file = (att as any).file as File | undefined;
        let content: string | undefined;

        if (file) {
          content = await fileToBase64(file);
        }

        return {
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: att.name,
          type: (att as any).type || (att as any).mimeType || 'application/octet-stream',
          content,
          url: (att as any).url,
          size: att.size
        };
      })
    );
  }, []);

  return {
    // State
    attachments,
    isUploading,
    isDraggingOver,

    // Refs
    fileInputRef,
    isUploadingRef,
    dragCounterRef,

    // Setters
    setAttachments,
    setIsUploading,
    setIsDraggingOver,

    // Actions
    handleFileChange,
    handleFilesSelected,
    clearAttachments,
    removeAttachment,
    handleUploadClick,

    // Drag handlers
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,

    // File utilities
    prepareFilesForApi,
    getAttachmentsSnapshot,
  };
}

export default useChatAttachments;
