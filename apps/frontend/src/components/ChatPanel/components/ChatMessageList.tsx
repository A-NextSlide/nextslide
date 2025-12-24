import { useMemo, type RefObject } from 'react';
import { History, Sparkles } from 'lucide-react';
import ChatMessage, { type FeedbackType } from '@/components/ChatMessage';
import { BROWSER } from '@/utils/browser';
import { COLORS } from '@/utils/colors';
import type { ExtendedChatMessageProps } from '@/components/chat';
import type { ThemePreviewState } from '../utils/themePreview';
import type { LinkedInProfile } from '@/components/chat/blocks';
import { ThemePreviewPanel } from './ThemePreviewPanel';
import ClarificationDraftCard from '@/components/chat/blocks/ClarificationDraftCard';

interface ChatMessageListProps {
  messages: ExtendedChatMessageProps[];
  oldMessages: ExtendedChatMessageProps[];
  showOldMessages: boolean;
  hasOldMessages: boolean;
  onLoadOlderMessages: () => void;
  scrollContainerRef: RefObject<HTMLDivElement>;
  messagesEndRef: RefObject<HTMLDivElement>;
  themePreview: ThemePreviewState | null;
  isThemePreviewOpen: boolean;
  onToggleThemePreview: () => void;
  onFeedback: (messageId: string, feedback: FeedbackType) => void;
  onSelectLinkedInProfile: (profile: LinkedInProfile) => void;
  onSkipLinkedInSelection: () => void;
  selectedLinkedInProfileId?: string;
  deckData: any;
  showFallbackGenerate: boolean;
  onFallbackGenerate: () => void;
  isLoading: boolean;
  onClarificationConfirm: (text: string) => void;
  onClarificationEdit: (text: string) => void;
}

export function ChatMessageList({
  messages,
  oldMessages,
  showOldMessages,
  hasOldMessages,
  onLoadOlderMessages,
  scrollContainerRef,
  messagesEndRef,
  themePreview,
  isThemePreviewOpen,
  onToggleThemePreview,
  onFeedback,
  onSelectLinkedInProfile,
  onSkipLinkedInSelection,
  selectedLinkedInProfileId,
  deckData,
  showFallbackGenerate,
  onFallbackGenerate,
  isLoading,
  onClarificationConfirm,
  onClarificationEdit,
}: ChatMessageListProps) {
  const { sortedMessages, editAppliedMap } = useMemo(() => {
    const editAppliedMap = new Map<string, any>();

    for (let editIdx = 0; editIdx < messages.length; editIdx++) {
      const editMsg = messages[editIdx];
      if (editMsg?.metadata?.type !== 'edit_applied') continue;

      const candidates: Array<{ idx: number; msg: any; hasContent: boolean; distance: number; isStreaming: boolean }> = [];

      for (let lookBack = 1; lookBack <= 5 && editIdx - lookBack >= 0; lookBack++) {
        const candidateMsg = messages[editIdx - lookBack];
        if (candidateMsg?.type === 'user') break;
        if (candidateMsg?.type === 'ai') {
          const text = typeof candidateMsg.message === 'string' ? candidateMsg.message : '';
          const isStreaming = candidateMsg.id?.startsWith('ai-stream-') || false;
          candidates.push({
            idx: editIdx - lookBack,
            msg: candidateMsg,
            hasContent: text.trim().length > 0,
            distance: lookBack,
            isStreaming
          });
        }
      }

      for (let lookAhead = 1; lookAhead <= 5 && editIdx + lookAhead < messages.length; lookAhead++) {
        const candidateMsg = messages[editIdx + lookAhead];
        if (candidateMsg?.type === 'user') break;
        if (candidateMsg?.type === 'ai') {
          const text = typeof candidateMsg.message === 'string' ? candidateMsg.message : '';
          const isStreaming = candidateMsg.id?.startsWith('ai-stream-') || false;
          candidates.push({
            idx: editIdx + lookAhead,
            msg: candidateMsg,
            hasContent: text.trim().length > 0,
            distance: lookAhead,
            isStreaming
          });
        }
      }

      candidates.sort((a, b) => {
        if (a.hasContent && !b.hasContent) return -1;
        if (!a.hasContent && b.hasContent) return 1;
        if (a.hasContent && b.hasContent) {
          if (!a.isStreaming && b.isStreaming) return -1;
          if (a.isStreaming && !b.isStreaming) return 1;
        }
        return a.distance - b.distance;
      });

      for (const candidate of candidates) {
        if (!editAppliedMap.has(candidate.msg.id)) {
          editAppliedMap.set(candidate.msg.id, editMsg.metadata);
          break;
        }
      }
    }

    const sortedMessages = [...messages].sort((a, b) => {
      const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() :
                   typeof a.timestamp === 'number' ? a.timestamp : 0;
      const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() :
                   typeof b.timestamp === 'number' ? b.timestamp : 0;
      return timeA - timeB;
    });

    return { sortedMessages, editAppliedMap };
  }, [messages]);

  const getSlideNumber = (slideId: string | undefined): number | null => {
    if (!slideId || !deckData?.slides) return null;
    const index = deckData.slides.findIndex((s: any) => s.id === slideId);
    return index >= 0 ? index + 1 : null;
  };

  return (
    <>
      {hasOldMessages && !showOldMessages && (
        <button
          onClick={onLoadOlderMessages}
          className="flex items-center justify-center gap-1.5 py-1 px-2 mx-auto text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <History className="w-3 h-3" />
          <span>Load older messages ({oldMessages.length})</span>
        </button>
      )}

      <div
        ref={scrollContainerRef}
        className="overflow-y-auto overflow-x-hidden p-2.5 pr-3 flex-1 min-h-0 min-w-0"
        style={{ scrollbarGutter: 'stable both-edges' }}
        data-scroll-guard="true"
      >
        {BROWSER.isSafari && (
          <style>{`.glass-panel{background-color:rgba(255,255,255,0.06) !important; background-image:none !important;}`}</style>
        )}
        {themePreview && (
          <div className="mb-2">
            {/* Inline preview renders inside the streaming bubble */}
          </div>
        )}

        {showOldMessages && oldMessages.map((msg, idx) => {
          const txt = typeof msg.message === 'string' ? msg.message : '';
          if ((msg.type === 'ai' || msg.type === 'system') && /^\s*\d+\s*$/.test(txt)) {
            return null;
          }

          if (msg.metadata?.type === 'edit_applied') {
            const prevMsg = idx > 0 ? oldMessages[idx - 1] : null;
            if (prevMsg?.type === 'ai') {
              return null;
            }
            const nextMsg = idx + 1 < oldMessages.length ? oldMessages[idx + 1] : null;
            if (nextMsg?.type === 'ai' && !nextMsg.id?.startsWith('ai-stream-')) {
              return null;
            }
          }

          let editAppliedData: any = null;
          if (msg.type === 'ai') {
            const isStreamingMsg = msg.id?.startsWith('ai-stream-');
            const isFinalMsg = !isStreamingMsg;

            for (let lookAhead = 1; lookAhead <= 3 && idx + lookAhead < oldMessages.length; lookAhead++) {
              const candidate = oldMessages[idx + lookAhead];
              if (candidate?.metadata?.type === 'edit_applied') {
                let claimedByCloserAI = false;
                for (let between = 1; between < lookAhead; between++) {
                  const betweenMsg = oldMessages[idx + between];
                  if (betweenMsg?.type === 'ai' && !betweenMsg.id?.startsWith('ai-stream-')) {
                    claimedByCloserAI = true;
                    break;
                  }
                }
                if (!claimedByCloserAI) {
                  editAppliedData = candidate.metadata;
                  break;
                }
              }
              if (candidate?.type === 'user') break;
            }

            if (!editAppliedData && isFinalMsg) {
              for (let lookBack = 1; lookBack <= 3 && idx - lookBack >= 0; lookBack++) {
                const candidate = oldMessages[idx - lookBack];
                if (candidate?.metadata?.type === 'edit_applied') {
                  const beforeEditApplied = idx - lookBack > 0 ? oldMessages[idx - lookBack - 1] : null;
                  const isFromSameResponse = beforeEditApplied?.type === 'ai' &&
                    beforeEditApplied.id?.startsWith('ai-stream-');
                  if (isFromSameResponse) {
                    editAppliedData = candidate.metadata;
                    break;
                  }
                }
                if (candidate?.type === 'user') break;
              }
            }

            if (editAppliedData && isStreamingMsg) {
              const nextMsg = idx + 1 < oldMessages.length ? oldMessages[idx + 1] : null;
              const nextNextMsg = idx + 2 < oldMessages.length ? oldMessages[idx + 2] : null;
              if ((nextMsg?.type === 'ai' && !nextMsg.id?.startsWith('ai-stream-')) ||
                  (nextNextMsg?.type === 'ai' && !nextNextMsg.id?.startsWith('ai-stream-'))) {
                editAppliedData = null;
              }
            }
          }

          const slideNumber = editAppliedData?.slideSnapshot?.id
            ? getSlideNumber(editAppliedData.slideSnapshot.id)
            : null;

          return (
            <div key={`${msg.id}-${editAppliedData ? 'with-edit' : 'no-edit'}`} className="opacity-70">
              <ChatMessage
                {...msg}
                onFeedback={(feedback) => onFeedback(msg.id, feedback)}
                editAppliedData={editAppliedData ? { ...editAppliedData, slideNumber } : undefined}
                onSelectLinkedInProfile={onSelectLinkedInProfile}
                onSkipLinkedInSelection={onSkipLinkedInSelection}
                selectedLinkedInProfileId={selectedLinkedInProfileId}
              />
            </div>
          );
        })}

        {showOldMessages && oldMessages.length > 0 && messages.length > 1 && (
          <div className="flex items-center gap-2 my-3">
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            <span className="text-[10px] text-gray-400 dark:text-gray-500">New messages</span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          </div>
        )}

        {sortedMessages.map((msg, idx) => {
          const txt = typeof msg.message === 'string' ? msg.message : '';
          if ((msg.type === 'ai' || msg.type === 'system') && /^\s*\d+\s*$/.test(txt)) {
            return null;
          }

          if (msg.metadata?.type === 'edit_applied') {
            return null;
          }

          const editAppliedData = msg.type === 'ai' ? editAppliedMap.get(msg.id) : null;
          const inline = (msg.metadata?.isStreamingUpdate && themePreview)
            ? (
              <ThemePreviewPanel
                themePreview={themePreview}
                isOpen={isThemePreviewOpen}
                onToggle={onToggleThemePreview}
              />
            )
            : undefined;

          const isThinkingStatus = msg.metadata?.isTyping && msg.metadata?.thinkingPhase;
          const showAsLoading = msg.metadata?.isTyping && !msg.message?.trim();

          const slideNumber = editAppliedData?.slideSnapshot?.id
            ? getSlideNumber(editAppliedData.slideSnapshot.id)
            : null;

          return (
            <div key={`${msg.id}-${editAppliedData ? 'with-edit' : 'no-edit'}`}>
              <ChatMessage
                {...msg}
                message={isThinkingStatus && msg.message ? msg.message : msg.message}
                isLoading={showAsLoading}
                inlineBelow={inline}
                onFeedback={(feedback) => onFeedback(msg.id, feedback)}
                editAppliedData={editAppliedData ? { ...editAppliedData, slideNumber } : undefined}
                onSelectLinkedInProfile={onSelectLinkedInProfile}
                onSkipLinkedInSelection={onSkipLinkedInSelection}
                selectedLinkedInProfileId={selectedLinkedInProfileId}
              />
              {msg.type === 'ai' && msg.metadata?.clarification?.fields?.length && (
                <ClarificationDraftCard
                  fields={msg.metadata.clarification.fields}
                  onConfirm={onClarificationConfirm}
                  onEdit={onClarificationEdit}
                  autoFocus={idx === sortedMessages.length - 1}
                />
              )}
            </div>
          );
        })}

        {showFallbackGenerate && (
          <div className="flex justify-start ml-11 mb-2 animate-fade-in">
            <button
              onClick={onFallbackGenerate}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 group"
            >
              <span>Ready to generate?</span>
              <Sparkles size={12} className="opacity-50 group-hover:opacity-100 transition-opacity" style={{ color: COLORS.SUGGESTION_PINK }} />
            </button>
          </div>
        )}

        {isLoading && <ChatMessage type="ai" message="" isLoading={true} timestamp={new Date()} />}

        <div ref={messagesEndRef} />
      </div>
    </>
  );
}
