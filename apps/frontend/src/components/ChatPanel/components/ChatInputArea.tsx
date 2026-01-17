import type { RefObject } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VoiceRecorder } from '@/components/voice/VoiceRecorder';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { IntegrationMentionPopover, IntegrationMentionBubble } from '@/components/chat';
import { IconButton } from '@/components/ui/IconButton';
import { COLORS } from '@/utils/colors';
import { ChatSuggestions } from './ChatSuggestions';
import { SelectionBubbles } from './SelectionBubbles';
import { AttachmentPreviews } from './AttachmentPreviews';
import type { Attachment, SelectedElement } from '../types';
import type { IntegrationMention, MentionState } from '@/hooks/useIntegrationMentions';

interface ChatInputAreaProps {
  input: string;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  inputRef: RefObject<HTMLTextAreaElement>;
  isDraggingOver: boolean;
  isVoiceRecording: boolean;
  selectedElements: SelectedElement[];
  onRemoveSelection: (elementId: string) => void;
  attachments: Attachment[];
  onRemoveAttachment: (index: number) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onUploadClick: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: RefObject<HTMLInputElement>;
  outlineMode: boolean;
  useOutlineAgent: boolean;
  outlineSlideTarget: number | 'all';
  onOutlineSlideTargetChange: (target: number | 'all') => void;
  deckSlides?: any[];
  isLoading: boolean;
  isGenerating?: boolean;
  onSend: (message?: string) => void;
  suggestions: Array<{ label: string; prompt: string }>;
  showSuggestions: boolean;
  onSuggestionSelect: (prompt: string) => void;
  mentionState: MentionState;
  selectedMentions: IntegrationMention[];
  onSelectMention: (integration: IntegrationMention) => void;
  onCloseMentionPopover: () => void;
  onRemoveMention: (integrationId: string) => void;
  onVoiceTranscript: (text: string) => void;
  onVoiceStart: () => void;
  onVoiceEnd: () => void;
  onVoiceError: (error: any) => void;
  deckData: any;
}

export function ChatInputArea({
  input,
  onInputChange,
  onKeyDown,
  inputRef,
  isDraggingOver,
  isVoiceRecording,
  selectedElements,
  onRemoveSelection,
  attachments,
  onRemoveAttachment,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onUploadClick,
  onFileChange,
  fileInputRef,
  outlineMode,
  useOutlineAgent,
  outlineSlideTarget,
  onOutlineSlideTargetChange,
  deckSlides,
  isLoading,
  isGenerating = false,
  onSend,
  suggestions,
  showSuggestions,
  onSuggestionSelect,
  mentionState,
  selectedMentions,
  onSelectMention,
  onCloseMentionPopover,
  onRemoveMention,
  onVoiceTranscript,
  onVoiceStart,
  onVoiceEnd,
  onVoiceError,
  deckData,
}: ChatInputAreaProps) {
  return (
    <div className="px-2.5 pt-4 pb-[calc(env(safe-area-inset-bottom)+10px)] sm:pt-6 sm:pb-2.5 min-w-0">
      <div
        className={
          `relative border rounded-xl px-3 pb-3 sm:px-3.5 sm:pb-3.5 flex flex-col justify-between min-h-[120px] sm:min-h-[230px] min-w-0 transition-colors ${isDraggingOver ? 'border-orange-500 border-dashed border-2 bg-orange-50/10 dark:bg-orange-900/10' : 'border-zinc-300 dark:border-[#929292]'
          }`
        }
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {isDraggingOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-orange-50/80 dark:bg-orange-900/40 rounded-xl z-10 pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-orange-600 dark:text-orange-400">
              <Plus size={32} className="animate-bounce" />
              <span className="text-sm font-medium">Drop files here</span>
            </div>
          </div>
        )}

        {isVoiceRecording && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/95 dark:bg-zinc-900/95 rounded-xl z-10">
            <div className="flex items-center gap-1 px-4 py-2 bg-orange-500/10 rounded-full">
              <span className="text-lg font-medium text-orange-600 dark:text-orange-400">
                Listening
              </span>
              <span className="text-lg font-medium text-orange-600 dark:text-orange-400 animate-pulse">
                ...
              </span>
            </div>
          </div>
        )}

        <SelectionBubbles selections={selectedElements} onRemove={onRemoveSelection} />
        <AttachmentPreviews attachments={attachments} onRemove={onRemoveAttachment} />

        <div className="relative">
          <IntegrationMentionPopover
            state={mentionState}
            onSelect={onSelectMention}
            onClose={onCloseMentionPopover}
          />

          {selectedMentions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {selectedMentions.map((mention) => (
                <IntegrationMentionBubble
                  key={mention.id}
                  id={mention.id}
                  name={mention.name}
                  variant="input"
                  size="sm"
                  onRemove={() => onRemoveMention(mention.id)}
                />
              ))}
            </div>
          )}

          <div className={cn('flex items-center min-w-0', selectedMentions.length > 0 ? 'mt-2' : 'mt-3 sm:mt-4')}>
            <div className="w-px mr-2 h-8" style={{ backgroundColor: COLORS.SUGGESTION_PINK }}></div>
            <Textarea
              ref={inputRef}
              value={input}
              onChange={onInputChange}
              onKeyDown={onKeyDown}
              placeholder={(outlineMode && useOutlineAgent)
                ? 'Refine your slides...'
                : selectedMentions.length > 0
                  ? `Ask about ${selectedMentions.map(m => m.name).join(', ')}...`
                  : 'Design, edit, or enhance your deck...'}
              className="bg-transparent border-none flex-grow text-foreground text-sm placeholder:text-muted-foreground placeholder:text-sm focus-visible:ring-0 focus-visible:ring-offset-0 pl-0 resize-none max-h-[200px]"
              data-tour="chat-input"
            />
          </div>
        </div>

        <div className="mt-auto pt-2 relative flex flex-col min-w-0" onClick={() => inputRef.current?.focus()}>
          {showSuggestions && (
            <ChatSuggestions
              suggestions={suggestions}
              inputValue={input}
              onSelectSuggestion={(prompt) => {
                onSuggestionSelect(prompt);
                inputRef.current?.focus();
              }}
            />
          )}

          <div className="flex flex-row flex-nowrap items-center justify-end relative shrink-0 w-full min-w-0" onClick={(e) => e.stopPropagation()}>
            <div className="h-8 w-px bg-zinc-600 mx-3"></div>

            <div className="flex items-center gap-1.5">
              <IconButton
                variant="ghost"
                size="xs"
                className="hover:bg-transparent w-6 h-6 flex items-center justify-center"
                style={{ color: COLORS.SUGGESTION_PINK }}
                onClick={(e) => { e.stopPropagation(); onUploadClick(); }}
              >
                <Plus size={16} />
              </IconButton>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={onFileChange}
              />

              {outlineMode ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px] font-semibold hover:bg-transparent"
                      style={{ color: COLORS.SUGGESTION_PINK }}
                    >
                      {outlineSlideTarget === 'all' ? 'All' : `Slide ${outlineSlideTarget + 1}`}
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[100px]">
                    <DropdownMenuItem
                      onClick={() => onOutlineSlideTargetChange('all')}
                      className="text-xs"
                    >
                      All
                    </DropdownMenuItem>
                    {deckSlides?.map((_, index) => (
                      <DropdownMenuItem
                        key={index}
                        onClick={() => onOutlineSlideTargetChange(index)}
                        className="text-xs"
                      >
                        Slide {index + 1}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <VoiceRecorder
                  onTranscript={onVoiceTranscript}
                  onStreamingTranscript={onVoiceTranscript}
                  onRecordingStart={onVoiceStart}
                  onRecordingEnd={onVoiceEnd}
                  onError={onVoiceError}
                  disabled={isLoading}
                  size="sm"
                  variant="default"
                  className="hover:bg-transparent"
                />
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); onSend(); }}
                      disabled={!input.trim() || isGenerating}
                      className={cn(
                        "h-8 w-8 transition-all flex items-center justify-center rounded-full text-white",
                        isGenerating ? "opacity-50 cursor-not-allowed" : "hover:opacity-80"
                      )}
                      style={{
                        backgroundColor: COLORS.SUGGESTION_PINK
                      }}
                    >
                      <ChevronUp size={16} />
                    </IconButton>
                  </span>
                </TooltipTrigger>
                {isGenerating && (
                  <TooltipContent side="top" className="max-w-[200px] text-center">
                    You can send requests once generation completes
                  </TooltipContent>
                )}
              </Tooltip>
            </div>
          </div>
        </div>
      </div>

      {selectedElements.length > 0 && (
        <div className="mt-2 border-t pt-2">
          <details className="group">
            <summary className="flex items-center gap-1.5 cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
              <ChevronRight size={12} className="transition-transform group-open:rotate-90" />
              <span>Selected component context ({selectedElements.length})</span>
            </summary>
            <div className="mt-1.5 max-h-24 overflow-auto rounded bg-muted/30 p-2">
              <pre className="text-[9px] text-muted-foreground font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(
                  selectedElements.map(sel => {
                    const slidesArr = Array.isArray(deckData?.slides) ? deckData.slides : [];
                    for (const slide of slidesArr) {
                      const comps = Array.isArray(slide?.components) ? slide.components : [];
                      const comp = comps.find((c: any) => c.id === sel.elementId);
                      if (comp) {
                        return {
                          type: comp.type,
                          id: comp.id,
                          props: comp.type === 'CustomComponent'
                            ? { ...comp.props, render: comp.props?.render ? `[HTML: ${comp.props.render.length} chars]` : undefined }
                            : comp.props
                        };
                      }
                    }
                    return { id: sel.elementId, label: sel.label, type: sel.elementType };
                  }),
                  null,
                  2
                )}
              </pre>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
