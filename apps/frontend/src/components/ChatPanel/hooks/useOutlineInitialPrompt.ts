import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ExtendedChatMessageProps, ChatPanelProps } from '@/components/chat';

interface UseOutlineInitialPromptOptions {
  initialPromptFromURL: ChatPanelProps['initialPromptFromURL'];
  outlineAgent: { sendMessage: (...args: any[]) => Promise<any>; isProcessing?: boolean } | null;
  outline: any;
  setMessages: Dispatch<SetStateAction<ExtendedChatMessageProps[]>>;
  onOutlineUpdate?: (outline: any) => void;
  onOutlineAgentToolCall?: (params: any) => void;
  onInitialPromptProcessed?: () => void;
}

export function useOutlineInitialPrompt({
  initialPromptFromURL,
  outlineAgent,
  outline,
  setMessages,
  onOutlineUpdate,
  onOutlineAgentToolCall,
  onInitialPromptProcessed,
}: UseOutlineInitialPromptOptions) {
  const hasProcessedInitialPromptRef = useRef(false);

  useEffect(() => {
    if (
      initialPromptFromURL &&
      outlineAgent &&
      !hasProcessedInitialPromptRef.current &&
      !outlineAgent.isProcessing
    ) {
      hasProcessedInitialPromptRef.current = true;

      const cleanPrompt = initialPromptFromURL.prompt;

      setTimeout(async () => {
        const userMessageId = `user-${Date.now()}`;

        const messageLines = [`**Topic:** ${initialPromptFromURL.prompt}`];
        const toggles = [];
        if (initialPromptFromURL.autoImages) toggles.push('Auto-select images');
        if (initialPromptFromURL.autoSlides) toggles.push('Auto-generate slides');
        if (initialPromptFromURL.presentationMode) toggles.push('Presentation mode');

        if (toggles.length > 0) {
          messageLines.push(`**Options:** ${toggles.join(', ')}`);
        }

        const detailedMessage = messageLines.join('\n');

        setMessages(prev => [
          ...prev,
          {
            id: userMessageId,
            type: 'user',
            message: detailedMessage,
            timestamp: new Date(),
            feedback: null
          }
        ]);

        const context: { [key: string]: any } = {};
        if (outline?.slides && outline.slides.length > 0) {
          context.current_outline = {
            title: outline.title,
            slides: outline.slides.map((slide: any, index: number) => ({
              index: index,
              title: slide.title,
              subtitle: slide.subtitle,
              type: slide.type,
              content: slide.content,
              key_points: slide.key_points || []
            }))
          };
        }

        await outlineAgent.sendMessage(
          cleanPrompt,
          (outlineData: any) => {
            if (outlineData.action === 'update_outline' && outline && onOutlineUpdate) {
              const updatedSlides = outlineData.slides.map((slide: any, index: number) => ({
                ...outline.slides[index],
                title: slide.title || outline.slides[index]?.title || '',
                subtitle: slide.subtitle || outline.slides[index]?.subtitle || '',
                content: slide.key_points && slide.key_points.length > 0
                  ? slide.key_points.join('\n')
                  : outline.slides[index]?.content || ''
              }));
              onOutlineUpdate({ ...outline, slides: updatedSlides });
            } else if (outlineData.action === 'generate_outline' && onOutlineAgentToolCall) {
              onOutlineAgentToolCall({
                topic: outlineData.topic || initialPromptFromURL.prompt,
                slide_count: outlineData.slide_count,
                detail_level: outlineData.detail_level || 'standard',
              });
            }
          },
          context
        );
      }, 500);

      if (onInitialPromptProcessed) {
        onInitialPromptProcessed();
      }
    }
  }, [
    initialPromptFromURL,
    outlineAgent,
    onInitialPromptProcessed,
    outline,
    onOutlineUpdate,
    onOutlineAgentToolCall,
    setMessages,
  ]);
}
