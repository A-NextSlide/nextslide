/**
 * Hook for managing outline agent conversations
 */

import { useState, useCallback, useRef } from 'react';
import {
  streamOutlineAgentChat,
  ChatMessage,
  AgentEvent,
  OutlineData,
  FileAttachment
} from '@/services/outlineAgentService';

export interface OutlineAgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isTyping?: boolean;
  isResearching?: boolean;
  researchQuery?: string;
  isAnalyzingFiles?: boolean;
  analyzingFileName?: string;
  fileAnalyses?: Array<{
    filename: string;
    file_type: string;
    summary: string;
  }>;
}

export type { OutlineData };

export function useOutlineAgent() {
  const [messages, setMessages] = useState<OutlineAgentMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hey! I'm here to help you create an amazing presentation. What would you like to make slides about?",
      timestamp: new Date(),
    },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentTypingMessageId, setCurrentTypingMessageId] = useState<string | null>(null);
  const [updateTrigger, setUpdateTrigger] = useState(0); // Force update trigger
  const abortControllerRef = useRef<AbortController | null>(null);

  // Use ref to track messages without causing re-renders
  // We update this ref directly in setMessages calls to avoid dependency loops
  const messagesRef = useRef<OutlineAgentMessage[]>(messages);

  const sendMessage = useCallback(
    async (
      userMessage: string,
      onOutlineGenerated?: (data: OutlineData) => void,
      context?: { [key: string]: any },
      files?: FileAttachment[]
    ) => {
      if (!userMessage.trim() || isProcessing) return;

      // Add user message
      const userMsgId = `user-${Date.now()}`;
      const userMsg: OutlineAgentMessage = {
        id: userMsgId,
        role: 'user',
        content: userMessage,
        timestamp: new Date(),
      };

      // Use messagesRef to get current messages (prevents infinite loop)
      const currentMessages = messagesRef.current;

      // Add user message immediately - state update will trigger re-render
      setMessages((prev) => {
        const newMessages = [...prev, userMsg];
        messagesRef.current = newMessages;
        return newMessages;
      });

      // Force trigger to ensure parent components detect the change
      setUpdateTrigger(prev => prev + 1);

      // Small microtask delay to ensure the message renders before we start processing
      // This makes the UI feel responsive like ChatGPT
      await new Promise(resolve => setTimeout(resolve, 0));

      setIsProcessing(true);

      // Create AI message placeholder
      const aiMsgId = `assistant-${Date.now()}`;
      const aiMsg: OutlineAgentMessage = {
        id: aiMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isTyping: true,
      };

      setMessages((prev) => {
        const newMessages = [...prev, aiMsg];
        messagesRef.current = newMessages; // Update ref directly
        return newMessages;
      });
      setCurrentTypingMessageId(aiMsgId);

      try {
        // Build chat history from ref messages (prevents re-renders from causing infinite loop)
        const chatHistory: ChatMessage[] = currentMessages
          .filter((m) => !m.isTyping)
          .map((m) => ({
            role: m.role,
            content: m.content,
          }));

        // Stream agent response
        let accumulatedText = '';
        let displayText = '';

        for await (const event of streamOutlineAgentChat({
          message: userMessage,
          chat_history: chatHistory,
          context: context,
          files: files,
        })) {
          if (event.type === 'text') {
            accumulatedText += event.content;

            // Remove JSON blocks from display text
            // First try to remove ```json...``` blocks
            displayText = accumulatedText.replace(/```json\s*[\s\S]*?\s*```/g, '');

            // Also handle plain json blocks (starts with "json" on its own line)
            // Match from "json" line through the closing }
            displayText = displayText.replace(/^json\s*$[\s\S]*?^\}$/gm, '');

            // Clean up any remaining JSON-like patterns that start with { and look like our format
            if (displayText.includes('"action"') && displayText.includes('"slides"')) {
              displayText = displayText.replace(/\{[\s\S]*"action"[\s\S]*\}/g, '');
            }

            displayText = displayText.trim();

            // Update the AI message with display text (without JSON)
            setMessages((prev) => {
              const newMessages = prev.map((m) =>
                m.id === aiMsgId
                  ? { ...m, content: displayText, isTyping: true }
                  : m
              );
              messagesRef.current = newMessages; // Update ref directly
              return newMessages;
            });
            // Trigger update for parent components
            setUpdateTrigger(prev => prev + 1);
          } else if (event.type === 'outline') {
            // Agent generated/updated outline - call the callback
            console.log('[OutlineAgent] Outline data received:', event.data);
            if (onOutlineGenerated) {
              onOutlineGenerated(event.data);
            }
          } else if (event.type === 'status') {
            // Handle status events (researching, thinking, file analysis, etc.)
            console.log('[OutlineAgent] Status:', event.status, event.message || event.query);
            if (event.status === 'researching') {
              setMessages((prev) => {
                const newMessages = prev.map((m) =>
                  m.id === aiMsgId
                    ? { ...m, isResearching: true, researchQuery: event.query, content: '' }
                    : m
                );
                messagesRef.current = newMessages;
                return newMessages;
              });
              setUpdateTrigger(prev => prev + 1);
            } else if (event.status === 'analyzing_file') {
              // File analysis in progress
              setMessages((prev) => {
                const newMessages = prev.map((m) =>
                  m.id === aiMsgId
                    ? { ...m, isAnalyzingFiles: true, analyzingFileName: event.file_name, content: `Analyzing ${event.file_name}...` }
                    : m
                );
                messagesRef.current = newMessages;
                return newMessages;
              });
              setUpdateTrigger(prev => prev + 1);
            } else if (event.status === 'files_analyzed') {
              // File analysis complete
              setMessages((prev) => {
                const newMessages = prev.map((m) =>
                  m.id === aiMsgId
                    ? {
                        ...m,
                        isAnalyzingFiles: false,
                        analyzingFileName: undefined,
                        fileAnalyses: event.analyses?.map(a => ({
                          filename: a.filename,
                          file_type: a.file_type,
                          summary: a.summary.slice(0, 200) + (a.summary.length > 200 ? '...' : '')
                        })),
                        content: ''
                      }
                    : m
                );
                messagesRef.current = newMessages;
                return newMessages;
              });
              setUpdateTrigger(prev => prev + 1);
            }
          } else if (event.type === 'research') {
            // Research completed - update message with research indicator
            console.log('[OutlineAgent] Research completed:', event.content?.slice(0, 100));
            setMessages((prev) => {
              const newMessages = prev.map((m) =>
                m.id === aiMsgId
                  ? { ...m, isResearching: false, researchQuery: undefined }
                  : m
              );
              messagesRef.current = newMessages;
              return newMessages;
            });
            setUpdateTrigger(prev => prev + 1);
          } else if (event.type === 'error') {
            console.error('[OutlineAgent] Error:', event.message);
            accumulatedText = event.message;
            setMessages((prev) => {
              const newMessages = prev.map((m) =>
                m.id === aiMsgId
                  ? { ...m, content: accumulatedText, isTyping: false, isResearching: false }
                  : m
              );
              messagesRef.current = newMessages; // Update ref directly
              return newMessages;
            });
          } else if (event.type === 'done') {
            // Finalize message - ensure we use displayText (with JSON removed)
            setMessages((prev) => {
              const newMessages = prev.map((m) =>
                m.id === aiMsgId
                  ? { ...m, content: displayText, isTyping: false }
                  : m
              );
              messagesRef.current = newMessages; // Update ref directly
              return newMessages;
            });
            setUpdateTrigger(prev => prev + 1);
            setCurrentTypingMessageId(null);
          }
        }
      } catch (error) {
        console.error('[OutlineAgent] Error:', error);
        setMessages((prev) => {
          const newMessages = prev.map((m) =>
            m.id === aiMsgId
              ? {
                  ...m,
                  content: 'Sorry, I encountered an error. Please try again.',
                  isTyping: false,
                }
              : m
          );
          messagesRef.current = newMessages; // Update ref directly
          return newMessages;
        });
        setCurrentTypingMessageId(null);
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing]
  );

  const resetConversation = useCallback(() => {
    const initialMessages = [
      {
        id: 'welcome',
        role: 'assistant',
        content: "Hi! I'll help you create your presentation. What would you like to create? Tell me about your topic, audience, or goal.",
        timestamp: new Date(),
      },
    ];
    setMessages(initialMessages);
    messagesRef.current = initialMessages; // Update ref directly
    setIsProcessing(false);
    setCurrentTypingMessageId(null);
  }, []);

  return {
    messages,
    isProcessing,
    sendMessage,
    resetConversation,
    currentTypingMessageId,
    updateTrigger, // Export for parent components to detect changes
  };
}
