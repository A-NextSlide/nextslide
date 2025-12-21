import React from 'react';
import { FileText, Image as ImageIcon, Table, Presentation, File, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getFileCategory, formatFileSize } from '@/services/fileAnalysisService';
import type { UploadedFile } from '../types';

interface PendingFilesPreviewProps {
  files: UploadedFile[];
  onRemove: (index: number) => void;
}

const PendingFilesPreview: React.FC<PendingFilesPreviewProps> = ({ files, onRemove }) => {
  if (files.length === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-2">
      {files.map((fileData, index) => {
        const isImage = fileData.file.type.startsWith('image/');
        const category = getFileCategory({ name: fileData.file.name, type: fileData.file.type });
        const FileIcon = isImage
          ? ImageIcon
          : category === 'document'
            ? FileText
            : category === 'spreadsheet'
              ? Table
              : category === 'presentation'
                ? Presentation
                : File;

        return (
          <div
            key={`${fileData.file.name}-${index}`}
            className="group relative flex items-center gap-2 bg-gradient-to-br from-zinc-100 to-zinc-50 dark:from-zinc-800 dark:to-zinc-900 rounded-xl px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 shadow-sm hover:shadow-md transition-shadow"
          >
            {isImage && fileData.previewUrl ? (
              <img
                src={fileData.previewUrl}
                alt={fileData.file.name}
                className="w-10 h-10 rounded-lg object-cover"
              />
            ) : (
              <div
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center',
                  category === 'document'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : category === 'spreadsheet'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      : category === 'presentation'
                        ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                        : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
                )}
              >
                <FileIcon className="w-5 h-5" />
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-zinc-800 dark:text-zinc-200 truncate max-w-[140px] text-sm font-medium">
                {fileData.file.name}
              </span>
              <span className="text-zinc-500 dark:text-zinc-500 text-xs">
                {formatFileSize(fileData.file.size)}
              </span>
            </div>
            <button
              onClick={() => onRemove(index)}
              className="absolute -top-2 -right-2 p-1 bg-zinc-700 dark:bg-zinc-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default PendingFilesPreview;
