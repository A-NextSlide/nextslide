import React from 'react';
import type { OutlinePreviewData, OutlineSlidePreview, ThemeEditorData } from '@/types/chatBlocks';
import type { ConversationStage, Message } from '../types';
import MessageBubble from './MessageBubble';
import MessageActions from './MessageActions';
import OutlineThemeBlocks from './OutlineThemeBlocks';
import SlideModeSelection from './SlideModeSelection';
import ClarificationDraftCard from '@/components/chat/blocks/ClarificationDraftCard';

interface MessageListProps {
  messages: Message[];
  stage: ConversationStage;
  outlineBlock: OutlinePreviewData | null;
  themeBlock: ThemeEditorData | null;
  isProcessing: boolean;
  isThemeLoading: boolean;
  isOutlinePrefetching: boolean;
  showInlineOutline?: boolean;
  showInlineSlideModeSelection?: boolean;
  inlineControlsClassName?: string;
  onAction: (action: string) => void;
  onSlideEdit: (slideId: string, updates: Partial<OutlineSlidePreview>) => void;
  onSlideAdd: () => void;
  onSlideDelete: (slideId: string) => void;
  onSlideReorder: (fromIndex: number, toIndex: number) => void;
  onLoadContent: (slideId: string, slideIndex: number) => Promise<{ content: string; keyPoints?: string[] }>;
  onThemeColorChange: (key: 'background' | 'text' | 'accent', hex: string) => void;
  onThemeFontChange: (type: 'heading' | 'body', font: string) => void;
  onThemeLogoChange: (url: string | null) => void;
  onBrandNameChange: (name: string) => void;
  onSlideModeSelect: (mode: 'interactive' | 'static') => void;
  onContinueChat: () => void;
  onClarificationConfirm: (text: string) => void;
  onClarificationEdit: (text: string) => void;
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  stage,
  outlineBlock,
  themeBlock,
  isProcessing,
  isThemeLoading,
  isOutlinePrefetching,
  showInlineOutline = false,
  showInlineSlideModeSelection = false,
  inlineControlsClassName,
  onAction,
  onSlideEdit,
  onSlideAdd,
  onSlideDelete,
  onSlideReorder,
  onLoadContent,
  onThemeColorChange,
  onThemeFontChange,
  onThemeLogoChange,
  onBrandNameChange,
  onSlideModeSelect,
  onContinueChat,
  onClarificationConfirm,
  onClarificationEdit,
}) => {
  const hasOutline = Boolean(outlineBlock?.slides?.length);
  const outlineBlocking = !hasOutline && isOutlinePrefetching;
  const isSlideModeBlocked = isThemeLoading || outlineBlocking;
  const blockingLabel = isThemeLoading
    ? (themeBlock?.loadingMessage || 'Generating theme...')
    : (outlineBlocking ? 'Generating your outline...' : undefined);
  return (
    <>
      {messages.map((message, index) => {
        return (
          <div key={message.id}>
            <MessageBubble message={message} index={index} />

            {message.role === 'assistant' && message.metadata?.clarification?.fields?.length && (
              <ClarificationDraftCard
                fields={message.metadata.clarification.fields}
                onConfirm={onClarificationConfirm}
                onEdit={onClarificationEdit}
                autoFocus={index === messages.length - 1}
              />
            )}

            {message.role === 'assistant' && message.buttons && message.buttons.length > 0 && !message.showSlideModeSelection && (
              <MessageActions buttons={message.buttons} onAction={onAction} isProcessing={isProcessing} />
            )}
          </div>
        );
      })}

      {showInlineOutline && hasOutline && (outlineBlock || themeBlock) && (
        <div className={inlineControlsClassName}>
          <OutlineThemeBlocks
            outlineBlock={outlineBlock}
            themeBlock={themeBlock}
            isProcessing={isProcessing}
            isThemeLoading={isThemeLoading}
            isOutlinePrefetching={isOutlinePrefetching}
            onSlideEdit={onSlideEdit}
            onSlideAdd={onSlideAdd}
            onSlideDelete={onSlideDelete}
            onSlideReorder={onSlideReorder}
            onLoadContent={onLoadContent}
            onThemeColorChange={onThemeColorChange}
            onThemeFontChange={onThemeFontChange}
            onThemeLogoChange={onThemeLogoChange}
            onBrandNameChange={onBrandNameChange}
            outlineClassName="rounded-2xl border-zinc-200/80 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.4)]"
            themeClassName="rounded-2xl border-zinc-200/80 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.4)]"
          />
        </div>
      )}

      {showInlineSlideModeSelection && stage === 'slide_mode_selection' && (
        <div className={inlineControlsClassName}>
          <SlideModeSelection
            isProcessing={isProcessing}
            isBlocking={isSlideModeBlocked}
            blockingLabel={blockingLabel}
            onSelect={onSlideModeSelect}
            onContinueChat={onContinueChat}
          />
        </div>
      )}
    </>
  );
};

export default MessageList;
