import { File, FileText, Image as ImageIcon, Loader2, Presentation, Table, XCircle } from 'lucide-react';
import { formatFileSize, getFileCategory } from '@/services/fileAnalysisService';
import type { Attachment } from '../types';

interface AttachmentPreviewsProps {
  attachments: Attachment[];
  onRemove: (index: number) => void;
}

export function AttachmentPreviews({ attachments, onRemove }: AttachmentPreviewsProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 pt-3 pb-2">
      {attachments.map((att, idx) => {
        const pending = (att as any).file && !(att as any).url;
        const fileType = (att as any).type || (att as any).mimeType || '';
        const isImage = fileType.startsWith('image/');
        const previewUrl = (att as any).url || (att as any).previewUrl || null;
        const category = getFileCategory({ name: att.name, type: fileType });

        const FileIcon = category === 'image' ? ImageIcon
          : category === 'document' ? FileText
          : category === 'spreadsheet' ? Table
          : category === 'presentation' ? Presentation
          : File;

        return (
          <div
            key={`${att.name}-${idx}`}
            className={`relative group rounded-lg overflow-hidden border transition-all ${pending
              ? 'border-orange-300/70 dark:border-orange-700/60 bg-orange-50/40 dark:bg-orange-900/20'
              : 'border-neutral-300/60 dark:border-neutral-700 bg-neutral-900/5 dark:bg-white/10 hover:border-neutral-400 dark:hover:border-neutral-600'
              }`}
            style={{ minWidth: isImage && previewUrl ? 80 : 'auto' }}
          >
            {isImage && previewUrl ? (
              <div className="relative">
                <img
                  src={previewUrl}
                  alt={att.name}
                  className="w-20 h-16 object-cover"
                />
                {pending && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1">
                  <span className="text-[10px] text-white truncate block">{att.name}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2">
                <div className={`flex-shrink-0 w-8 h-8 rounded flex items-center justify-center ${
                  category === 'document' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
                  category === 'spreadsheet' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                  category === 'presentation' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' :
                  'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
                }`}>
                  {pending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileIcon className="w-4 h-4" />
                  )}
                </div>
                <div className="flex flex-col min-w-0 max-w-[120px]">
                  <span className="text-xs font-medium truncate">{att.name}</span>
                  <span className="text-[10px] text-muted-foreground">{formatFileSize(att.size)}</span>
                </div>
              </div>
            )}

            <button
              aria-label="Remove attachment"
              className={`absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-opacity ${
                pending ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                if (pending) return;
                onRemove(idx);
              }}
            >
              <XCircle size={12} className="text-white" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
