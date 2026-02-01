import React, { useRef, useState, useCallback } from 'react';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import type { ToolPageConfig } from '@/config/toolPages';

interface FileUploadZoneProps {
  config: ToolPageConfig;
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

export default function FileUploadZone({ config, onFileSelect, disabled }: FileUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      onFileSelect(files[0]);
    },
    [onFileSelect]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);
      if (!disabled) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [disabled, handleFiles]
  );

  const acceptedLabel = config.acceptedFileTypes
    ? config.acceptedFileTypes
        .split(',')
        .map((ext) => ext.trim().toUpperCase().replace('.', ''))
        .join(', ')
    : 'Any file';

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative cursor-pointer rounded-2xl border-2 border-dashed
        transition-all duration-200 p-8 sm:p-12 text-center
        ${isDragging
          ? 'border-[#FF6B00] bg-orange-50 scale-[1.01]'
          : 'border-zinc-300 hover:border-[#FF6B00]/60 hover:bg-zinc-50'
        }
        ${disabled ? 'pointer-events-none opacity-50' : ''}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept={config.acceptedFileTypes}
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />

      <div className="flex flex-col items-center gap-4">
        <div
          className={`
            w-16 h-16 rounded-2xl flex items-center justify-center transition-colors
            ${isDragging ? 'bg-[#FF6B00]/10 text-[#FF6B00]' : 'bg-zinc-100 text-zinc-400'}
          `}
        >
          {isDragging ? (
            <FileText className="w-8 h-8" />
          ) : (
            <Upload className="w-8 h-8" />
          )}
        </div>

        <div>
          <p className="text-lg font-semibold text-zinc-900">
            {isDragging ? 'Drop your file here' : 'Drop your file here or click to browse'}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Accepted formats: {acceptedLabel}
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Maximum file size: 50MB
          </p>
        </div>
      </div>
    </div>
  );
}
