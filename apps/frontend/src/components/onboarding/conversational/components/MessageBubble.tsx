import React from 'react';
import { FileText, Image as ImageIcon, Table, Presentation, File } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getFileCategory } from '@/services/fileAnalysisService';
import type { Message } from '../types';
import { renderText } from '../utils/chatFormatting';

interface MessageBubbleProps {
  message: Message;
  index: number;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, index }) => {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex w-full animate-in slide-in-from-bottom-4 duration-500',
        isUser ? 'justify-end' : 'justify-start'
      )}
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-5 py-3.5 shadow-md',
          isUser
            ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white'
            : 'bg-gradient-to-br from-white to-zinc-50 dark:from-zinc-800 dark:to-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200/50 dark:border-zinc-700/50'
        )}
      >
        {message.attachments && message.attachments.length > 0 && (
          <div className={cn('flex flex-wrap gap-2 mb-3', message.attachments.length === 1 ? 'justify-center' : '')}>
            {message.attachments.map((attachment, attachmentIndex) => {
              const isImage = attachment.type.startsWith('image/');
              const category = getFileCategory({ name: attachment.name, type: attachment.type });
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
                  key={attachment.id || attachmentIndex}
                  className={cn(
                    'rounded-lg overflow-hidden',
                    isImage && attachment.previewUrl
                      ? 'w-full max-w-[200px]'
                      : 'flex items-center gap-2 px-3 py-2 bg-white/20 backdrop-blur-sm'
                  )}
                >
                  {isImage && attachment.previewUrl ? (
                    <img
                      src={attachment.previewUrl}
                      alt={attachment.name}
                      className="w-full h-auto rounded-lg max-h-[150px] object-cover"
                    />
                  ) : (
                    <>
                      <FileIcon className="w-4 h-4 flex-shrink-0 opacity-80" />
                      <span className="text-xs truncate max-w-[120px]">{attachment.name}</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="text-sm whitespace-pre-wrap leading-relaxed font-['Inter',system-ui,sans-serif]">
          {renderText(message.content)}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
