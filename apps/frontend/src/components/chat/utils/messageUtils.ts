/**
 * Chat message utilities
 * Extracted from ChatPanel.tsx for reusability
 */

import { ChatMessageProps } from '@/components/ChatMessage';
import { ExtendedChatMessageProps, ChatApiMessage } from '../types/chat.types';
import { API_CONFIG } from '@/config/environment';

const API_URL = API_CONFIG.CHAT_URL;

/**
 * Convert UI messages to API chat history format
 */
export const convertMessagesToApiFormat = (
  messages: (ChatMessageProps | ExtendedChatMessageProps)[]
): ChatApiMessage[] => {
  return messages.map(msg => {
    // Handle timestamp - could be Date object, string, or undefined
    let timestampStr: string;
    if (!msg.timestamp) {
      timestampStr = new Date().toISOString();
    } else if (msg.timestamp instanceof Date) {
      timestampStr = msg.timestamp.toISOString();
    } else {
      // Already a string
      timestampStr = msg.timestamp as unknown as string;
    }

    return {
      content: msg.message,
      role: msg.type === 'user' ? 'user' : 'assistant',
      timestamp: timestampStr,
      // Convert feedback type: positive -> up, negative -> down
      ...(('feedback' in msg && msg.feedback) && {
        feedback: msg.feedback === 'positive' ? 'up' : msg.feedback === 'negative' ? 'down' : undefined
      })
    };
  });
};

/**
 * Send a chat message to the API
 */
export const sendChatToApi = async (
  message: string,
  slideId: string | null,
  currentSlideIndex: number,
  deckData: any,
  messages: ChatMessageProps[],
  selections?: any[],
  attachments?: { name: string; type: string; size: number }[]
): Promise<any> => {
  // Convert UI messages to API format
  const chatHistory = convertMessagesToApiFormat(messages);

  const payload: Record<string, any> = {
    message,
    slide_id: slideId,
    current_slide_index: currentSlideIndex,
    deck_data: deckData,
    chat_history: chatHistory
  };
  if (selections && selections.length > 0) payload.selections = selections;
  if (attachments && attachments.length > 0) payload.attachments = attachments;

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`API responded with status: ${response.status}`);
  }

  return await response.json();
};

/**
 * Create an AI message object
 */
export const createAiMessage = (
  message: string,
  id?: string
): ExtendedChatMessageProps => ({
  id: id || `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  type: 'ai',
  message,
  timestamp: new Date(),
  feedback: null
});

/**
 * Create a user message object
 */
export const createUserMessage = (
  message: string,
  id?: string
): ExtendedChatMessageProps => ({
  id: id || `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  type: 'user',
  message,
  timestamp: new Date(),
  feedback: null
});

/**
 * Create a system message object
 */
export const createSystemMessage = (
  message: string,
  id?: string
): ExtendedChatMessageProps => ({
  id: id || `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  type: 'ai', // System messages appear as AI messages
  message,
  timestamp: new Date(),
  feedback: null
});

/**
 * Get initial welcome message based on mode
 */
export const getWelcomeMessage = (
  outlineMode: boolean,
  isExistingDeck: boolean
): string => {
  if (outlineMode) {
    return "Hi! I'll help you create your presentation. What would you like to create? Tell me about your topic, audience, or goal.";
  }
  if (isExistingDeck) {
    return "I can refine, redesign, or fix anything here. Drop an image for inspiration, data to chart, or a screenshot to inspire me. Try: 'Make this cleaner,' 'Redesign this slide,' or 'Add a chart from this data.'";
  }
  return "Hi there! What kind of presentation are you looking to create? Drag and drop anything you want to add to your presentation in the chat.";
};

/**
 * Generate a unique message ID
 */
export const generateMessageId = (prefix: string = 'msg'): string => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};
