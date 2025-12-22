import React from 'react';
import { Link as LinkIcon, Paperclip, Send, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { VoiceRecorder } from '@/components/voice/VoiceRecorder';
import { IntegrationMentionPopover, IntegrationMentionBubble } from '@/components/chat';
import type { MentionState, IntegrationMention } from '@/hooks/useIntegrationMentions';
import type { UploadedFile } from '../types';
import PendingFilesPreview from './PendingFilesPreview';

interface ChatInputAreaProps {
  input: string;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  isProcessing: boolean;
  isAgentTyping: boolean;
  isDraggingOver: boolean;
  uploadedFiles: UploadedFile[];
  onRemoveFile: (index: number) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenFileDialog: () => void;
  onSend: () => void;
  onLinkClick?: () => void;
  onVoiceTranscript: (text: string) => void;
  mentionState: MentionState;
  selectedMentions: IntegrationMention[];
  onMentionSelect: (integration: IntegrationMention) => void;
  onMentionClose: () => void;
  onMentionRemove: (id: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

const ChatInputArea: React.FC<ChatInputAreaProps> = ({
  input,
  onInputChange,
  onKeyDown,
  inputRef,
  fileInputRef,
  isProcessing,
  isAgentTyping,
  isDraggingOver,
  uploadedFiles,
  onRemoveFile,
  onFileUpload,
  onOpenFileDialog,
  onSend,
  onLinkClick,
  onVoiceTranscript,
  mentionState,
  selectedMentions,
  onMentionSelect,
  onMentionClose,
  onMentionRemove,
  onDragOver,
  onDragLeave,
  onDrop,
}) => {
  const placeholder = isDraggingOver
    ? 'Drop files here...'
    : selectedMentions.length > 0
      ? `Ask about ${selectedMentions.map((mention) => mention.name).join(', ')}...`
      : isAgentTyping
        ? 'Type your next message...'
        : 'Type your message or drag & drop files...';

  return (
    <div className="sticky bottom-0 z-10 bg-white/80 dark:bg-black/80 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800">
      <div className="px-3 py-2 sm:px-6 sm:py-4">
        <PendingFilesPreview files={uploadedFiles} onRemove={onRemoveFile} />

        <div
          className={cn(
            'flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-end bg-white dark:bg-zinc-800 rounded-xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors',
            isDraggingOver && 'border-orange-400 dark:border-orange-500 bg-orange-50 dark:bg-orange-950/20'
          )}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <div className="flex-1 relative">
            <IntegrationMentionPopover
              state={mentionState}
              onSelect={onMentionSelect}
              onClose={onMentionClose}
            />

            {selectedMentions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-4 pt-2">
                {selectedMentions.map((mention) => (
                  <IntegrationMentionBubble
                    key={mention.id}
                    id={mention.id}
                    name={mention.name}
                    variant="input"
                    size="sm"
                    onRemove={() => onMentionRemove(mention.id)}
                  />
                ))}
              </div>
            )}

            <textarea
              ref={inputRef}
              value={input}
              onChange={onInputChange}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              disabled={isProcessing}
              className="w-full bg-transparent border-0 text-[#383636] dark:text-gray-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 pt-2 pb-2 pl-3 pr-2 sm:pt-4 sm:pb-4 sm:pl-4 resize-none text-base overflow-y-auto max-h-[400px] min-h-[52px] sm:min-h-[60px] font-sans"
              rows={1}
            />
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 pb-2 pr-2 w-full sm:w-auto justify-end">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={onFileUpload}
              accept=".pdf,.doc,.docx,.txt,.md,.jpg,.jpeg,.png,.gif,.webp,.svg,.csv,.xls,.xlsx,.ppt,.pptx"
            />
            <Button
              onClick={onOpenFileDialog}
              disabled={isProcessing}
              size="icon"
              variant="ghost"
              className={cn(
                'h-7 w-7 sm:h-8 sm:w-8 rounded-lg relative transition-colors',
                uploadedFiles.length > 0
                  ? 'text-orange-600 dark:text-orange-400 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700'
              )}
            >
              <Paperclip className="w-4 h-4" />
              {uploadedFiles.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {uploadedFiles.length}
                </span>
              )}
            </Button>
            <Button
              onClick={onLinkClick}
              disabled={isProcessing}
              size="icon"
              variant="ghost"
              className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700"
            >
              <LinkIcon className="w-4 h-4" />
            </Button>
            <VoiceRecorder
              onTranscript={onVoiceTranscript}
              onError={(error) => {
                console.error('Voice recording error:', error);
              }}
              disabled={isProcessing || isAgentTyping}
              size="sm"
              variant="minimal"
              className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg"
            />
            <Button
              onClick={() => onSend()}
              disabled={(!input.trim() && uploadedFiles.length === 0) || isAgentTyping || isProcessing}
              size="icon"
              className="h-10 w-10 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-orange-500 hover:bg-orange-600 shrink-0 disabled:opacity-50"
            >
              {isProcessing ? (
                <Sparkles className="w-4 h-4 animate-pulse" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        <p className="hidden sm:block text-xs text-zinc-500 dark:text-zinc-400 mt-2 text-center">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
};

export default ChatInputArea;
