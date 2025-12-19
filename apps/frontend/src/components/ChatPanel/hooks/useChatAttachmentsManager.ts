import { useCallback, useEffect, useRef, useState } from 'react';
import AgentChatClient from '@/services/agentChat';
import { uploadFile } from '@/utils/fileUploadUtils';
import { createImagePreview, revokeImagePreview } from '@/services/fileAnalysisService';
import type { ExtendedChatMessageProps } from '@/components/chat';
import type { Attachment, PendingAttachment, RegisteredAttachment } from '../types';

interface UseChatAttachmentsManagerOptions {
  ensureAgentSession: () => Promise<boolean>;
  agentClientRef: React.MutableRefObject<AgentChatClient | null>;
  agentSessionId: string | null;
  setMessages: React.Dispatch<React.SetStateAction<ExtendedChatMessageProps[]>>;
}

export function useChatAttachmentsManager({
  ensureAgentSession,
  agentClientRef,
  agentSessionId,
  setMessages,
}: UseChatAttachmentsManagerOptions) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const attachmentsRef = useRef<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const isUploadingRef = useRef(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  const setAttachmentsSafe = useCallback((next: Attachment[]) => {
    attachmentsRef.current = next;
    setAttachments(next);
  }, []);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleRemoveAttachment = useCallback((index: number) => {
    const current = attachmentsRef.current;
    const target = current[index] as any;
    const preview = target?.previewUrl;
    if (preview) revokeImagePreview(preview);
    const next = current.filter((_, i) => i !== index);
    setAttachmentsSafe(next);
  }, [setAttachmentsSafe]);

  const processAndRegisterFiles = useCallback(async (files: File[]) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    isUploadingRef.current = true;
    try {
      const hasSession = await ensureAgentSession();
      if (!hasSession || !agentClientRef.current || !agentSessionId) {
        setMessages(prev => [...prev, {
          id: `sys-${Date.now()}`,
          type: 'system',
          message: 'Upload skipped: agent session unavailable',
          timestamp: new Date(),
          feedback: null
        }]);
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
      setAttachmentsSafe(next);
    } catch (err) {
      console.error('Attachment upload/register failed', err);
      setMessages(prev => [...prev, {
        id: `sys-${Date.now()}`,
        type: 'system',
        message: 'File upload failed. Please try again.',
        timestamp: new Date(),
        feedback: null
      }]);
    } finally {
      setIsUploading(false);
      isUploadingRef.current = false;
    }
  }, [agentClientRef, agentSessionId, ensureAgentSession, setAttachmentsSafe, setMessages]);

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
    setAttachmentsSafe([...attachmentsRef.current, ...pending]);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    processAndRegisterFiles(files);
    // reset for same-name file selection again
    e.target.value = '';
  }, [processAndRegisterFiles, setAttachmentsSafe]);

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

    const filesWithPreviews = files.map(file => ({
      file,
      previewUrl: file.type.startsWith('image/') ? createImagePreview(file) : undefined
    }));

    const pending: PendingAttachment[] = filesWithPreviews.map(({ file, previewUrl }) => ({
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      file,
      previewUrl
    }));

    setAttachmentsSafe([...attachmentsRef.current, ...pending]);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    processAndRegisterFiles(files);
  }, [processAndRegisterFiles, setAttachmentsSafe]);

  return {
    attachments,
    attachmentsRef,
    setAttachments,
    setAttachmentsSafe,
    isUploading,
    isUploadingRef,
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
  };
}
