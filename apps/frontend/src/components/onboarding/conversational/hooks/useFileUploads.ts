import { useCallback, useRef, useState } from 'react';
import { createImagePreview, revokeImagePreview } from '@/services/fileAnalysisService';
import type { FileAttachment } from '@/services/outlineAgentService';
import type { UploadedFile } from '../types';

interface UseFileUploadsOptions {
  initialUploadedFiles?: File[];
  maxFileSize: number;
  onOversizedFiles?: (message: string) => void;
}

export const useFileUploads = ({
  initialUploadedFiles = [],
  maxFileSize,
  onOversizedFiles,
}: UseFileUploadsOptions) => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>(
    initialUploadedFiles.map((file) => ({
      file,
      previewUrl: file.type.startsWith('image/') ? createImagePreview(file) : undefined,
    }))
  );
  const [persistentFiles, setPersistentFiles] = useState<FileAttachment[]>([]);
  const [analyzedFileNames, setAnalyzedFileNames] = useState<Set<string>>(new Set());
  const [fileAnalysisContext, setFileAnalysisContext] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOversizedFiles = useCallback((oversized: string[]) => {
    if (oversized.length === 0) return;
    const message = `Warning: ${oversized.join(', ')} ${oversized.length > 1 ? 'are' : 'is'} too large (max 30MB). Please use smaller files or compress them.`;
    onOversizedFiles?.(message);
  }, [onOversizedFiles]);

  const appendUploads = useCallback((files: File[]) => {
    const validFiles: UploadedFile[] = [];
    const oversized: string[] = [];

    files.forEach((file) => {
      if (file.size > maxFileSize) {
        oversized.push(file.name);
        return;
      }
      validFiles.push({
        file,
        previewUrl: file.type.startsWith('image/') ? createImagePreview(file) : undefined,
      });
    });

    handleOversizedFiles(oversized);
    if (validFiles.length > 0) {
      setUploadedFiles((prev) => [...prev, ...validFiles]);
    }
  }, [handleOversizedFiles, maxFileSize]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      appendUploads(files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [appendUploads]);

  const handleRemoveFile = useCallback((index: number) => {
    setUploadedFiles((prev) => {
      const removed = prev[index];
      if (removed?.previewUrl) {
        revokeImagePreview(removed.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const clearUploads = useCallback(() => {
    setUploadedFiles((prev) => {
      prev.forEach((file) => {
        if (file.previewUrl) {
          revokeImagePreview(file.previewUrl);
        }
      });
      return [];
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      appendUploads(files);
    }
  }, [appendUploads]);

  const resetPersistentFiles = useCallback(() => {
    setPersistentFiles([]);
    setAnalyzedFileNames(new Set());
  }, []);

  return {
    uploadedFiles,
    isDraggingOver,
    fileInputRef,
    persistentFiles,
    analyzedFileNames,
    fileAnalysisContext,
    setPersistentFiles,
    setAnalyzedFileNames,
    setFileAnalysisContext,
    handleFileUpload,
    handleRemoveFile,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    clearUploads,
    resetPersistentFiles,
  };
};
