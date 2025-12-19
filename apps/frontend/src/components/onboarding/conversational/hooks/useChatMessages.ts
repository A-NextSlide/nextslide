import { useCallback, useState } from 'react';
import type { ChatMessage } from '@/services/outlineAgentService';
import type { ActionButton, AttachmentPreview, Message } from '../types';
import { AGENT_TYPING_DELAY_MS } from '../constants';

interface AddMessageOptions {
  buttons?: ActionButton[];
  attachments?: AttachmentPreview[];
  showSlideModeSelection?: boolean;
  skipHistory?: boolean;
}

interface UseChatMessagesOptions {
  onAgentTypingChange?: (isTyping: boolean) => void;
  typingDelayMs?: number;
}

export const useChatMessages = (options: UseChatMessagesOptions = {}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

  const addMessage = useCallback((
    role: Message['role'],
    content: string,
    messageOptions: AddMessageOptions = {}
  ) => {
    const newMessage: Message = {
      id: `${Date.now()}-${Math.random()}`,
      role,
      content,
      timestamp: new Date(),
      buttons: messageOptions.buttons,
      showSlideModeSelection: messageOptions.showSlideModeSelection,
      attachments: messageOptions.attachments,
    };

    setMessages((prev) => [...prev, newMessage]);

    if (!messageOptions.skipHistory && !messageOptions.showSlideModeSelection) {
      setChatHistory((prev) => [...prev, { role, content }]);
    }
  }, []);

  const addAgentMessage = useCallback((
    content: string,
    messageOptions: AddMessageOptions = {}
  ) => {
    const delayMs = options.typingDelayMs ?? AGENT_TYPING_DELAY_MS;
    if (!options.onAgentTypingChange) {
      addMessage('assistant', content, messageOptions);
      return;
    }

    options.onAgentTypingChange(true);
    setTimeout(() => {
      addMessage('assistant', content, messageOptions);
      options.onAgentTypingChange?.(false);
    }, delayMs);
  }, [addMessage, options]);

  return {
    messages,
    chatHistory,
    setMessages,
    setChatHistory,
    addMessage,
    addAgentMessage,
  };
};
