import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, Bot, User, Loader2, AlertCircle, Database, Sparkles } from 'lucide-react';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import AgentDataTable from '@/components/admin/AgentDataTable';
import AgentConfirmationCard from '@/components/admin/AgentConfirmationCard';
import { adminApi, AgentChatResponse, AgentConfirmResponse } from '@/services/adminApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  // Data response
  data?: {
    columns: string[];
    rows: Record<string, any>[];
    rowCount: number;
    truncated: boolean;
    entityLinks: Record<string, 'user' | 'deck'>;
  };
  // Confirmation response
  confirmation?: {
    actionId: string;
    summary: string;
    affectedRows?: number | null;
    operationType?: string | null;
    result?: AgentConfirmResponse | null;
    cancelled?: boolean;
  };
  // Error
  error?: string;
}

const SUGGESTED_QUERIES = [
  'How many users signed up this week?',
  'Show the 10 most recent users',
  'Which users have the most decks?',
  'Show users who signed up but never created a deck',
  'How many decks were created today?',
  'What is the total storage used across all decks?',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const AdminAgent: React.FC = () => {
  const sessionId = useMemo(() => crypto.randomUUID(), []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response: AgentChatResponse = await adminApi.agentChat(text.trim(), sessionId);

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.summary,
        timestamp: new Date(),
      };

      if (response.response_type === 'data') {
        assistantMsg.data = {
          columns: response.columns || [],
          rows: response.rows || [],
          rowCount: response.row_count || 0,
          truncated: response.truncated || false,
          entityLinks: response.entity_links || {},
        };
      } else if (response.response_type === 'confirmation') {
        assistantMsg.confirmation = {
          actionId: response.action_id || '',
          summary: response.summary,
          affectedRows: response.affected_rows,
          operationType: response.operation_type,
          result: null,
        };
      } else if (response.response_type === 'conversation') {
        assistantMsg.content = response.message || response.summary;
      } else if (response.response_type === 'error') {
        assistantMsg.error = response.error || 'Unknown error';
      }

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Failed to process request',
        timestamp: new Date(),
        error: err?.message || 'Network error',
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }, [loading, sessionId]);

  const handleConfirm = useCallback(async (msgId: string, actionId: string) => {
    try {
      const result = await adminApi.agentConfirm(sessionId, actionId);
      setMessages(prev =>
        prev.map(m =>
          m.id === msgId && m.confirmation
            ? { ...m, confirmation: { ...m.confirmation, result } }
            : m
        )
      );
    } catch (err: any) {
      setMessages(prev =>
        prev.map(m =>
          m.id === msgId && m.confirmation
            ? {
                ...m,
                confirmation: {
                  ...m.confirmation,
                  result: {
                    success: false,
                    affected_rows: 0,
                    message: 'Failed',
                    error: err?.message || 'Network error',
                  },
                },
              }
            : m
        )
      );
    }
  }, [sessionId]);

  const handleCancel = useCallback(async (msgId: string, actionId: string) => {
    try {
      await adminApi.agentCancel(sessionId, actionId);
    } catch {
      // Ignore cancel errors
    }
    setMessages(prev =>
      prev.map(m =>
        m.id === msgId && m.confirmation
          ? { ...m, confirmation: { ...m.confirmation, cancelled: true } }
          : m
      )
    );
  }, [sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <AdminLayoutV2>
      <div className="flex flex-col h-full max-w-4xl mx-auto -my-4 -mx-4 sm:mx-auto">
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {messages.length === 0 ? (
            <EmptyState onSelectQuery={sendMessage} />
          ) : (
            messages.map(msg => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
              />
            ))
          )}

          {loading && (
            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-full bg-[#f0f0f0] dark:bg-[#222] p-1.5">
                <Bot className="h-4 w-4 text-[#666]" />
              </div>
              <div className="flex items-center gap-2 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-[#999]" />
                <span className="text-sm text-[#999]">Thinking...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-[#eaeaea] dark:border-[#333] bg-white dark:bg-[#111] px-4 py-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your data..."
                rows={1}
                className="w-full resize-none rounded-lg border border-[#ddd] dark:border-[#444] bg-white dark:bg-[#0a0a0a] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 placeholder:text-[#aaa]"
              />
            </div>
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="shrink-0 rounded-lg bg-black dark:bg-white text-white dark:text-black p-2.5 hover:bg-[#333] dark:hover:bg-[#ddd] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="text-[10px] text-[#aaa] mt-1.5">
            Shift+Enter for newline. Queries run against the production database with read-only access.
          </p>
        </div>
      </div>
    </AdminLayoutV2>
  );
};

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
const EmptyState: React.FC<{ onSelectQuery: (q: string) => void }> = ({ onSelectQuery }) => (
  <div className="flex flex-col items-center justify-center h-full py-16 text-center">
    <div className="rounded-full bg-[#f0f0f0] dark:bg-[#222] p-3 mb-4">
      <Sparkles className="h-6 w-6 text-[#666]" />
    </div>
    <h2 className="text-lg font-semibold mb-1">Data Agent</h2>
    <p className="text-sm text-[#666] dark:text-[#888] mb-6 max-w-sm">
      Ask questions about your database in plain English. Read queries run instantly. Write operations require confirmation.
    </p>
    <div className="flex flex-wrap gap-2 justify-center max-w-lg">
      {SUGGESTED_QUERIES.map(q => (
        <button
          key={q}
          onClick={() => onSelectQuery(q)}
          className="px-3 py-1.5 text-xs rounded-full border border-[#ddd] dark:border-[#444] text-[#555] dark:text-[#aaa] hover:bg-[#f5f5f5] dark:hover:bg-[#1a1a1a] hover:border-[#bbb] dark:hover:border-[#555] transition-colors"
        >
          {q}
        </button>
      ))}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------
const MessageBubble: React.FC<{
  message: ChatMessage;
  onConfirm: (msgId: string, actionId: string) => Promise<void>;
  onCancel: (msgId: string, actionId: string) => void;
}> = ({ message, onConfirm, onCancel }) => {
  if (message.role === 'user') {
    return (
      <div className="flex items-start gap-3 justify-end">
        <div className="max-w-[85%] rounded-lg bg-black dark:bg-white text-white dark:text-black px-4 py-2.5 text-sm">
          {message.content}
        </div>
        <div className="mt-1 rounded-full bg-[#f0f0f0] dark:bg-[#222] p-1.5 shrink-0">
          <User className="h-4 w-4 text-[#666]" />
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex items-start gap-3">
      <div className="mt-1 rounded-full bg-[#f0f0f0] dark:bg-[#222] p-1.5 shrink-0">
        <Bot className="h-4 w-4 text-[#666]" />
      </div>
      <div className="max-w-[90%] space-y-2 min-w-0 flex-1">
        {/* Error */}
        {message.error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-red-700 dark:text-red-300 font-medium">{message.content}</p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{message.error}</p>
            </div>
          </div>
        )}

        {/* Text content (for conversation + data summary) */}
        {!message.error && message.content && (
          <div className="text-sm text-[#333] dark:text-[#ccc]">
            {message.content}
          </div>
        )}

        {/* Data table */}
        {message.data && (
          <AgentDataTable
            columns={message.data.columns}
            rows={message.data.rows}
            rowCount={message.data.rowCount}
            truncated={message.data.truncated}
            entityLinks={message.data.entityLinks}
          />
        )}

        {/* Confirmation card */}
        {message.confirmation && !message.confirmation.cancelled && (
          <AgentConfirmationCard
            summary={message.confirmation.summary}
            affectedRows={message.confirmation.affectedRows}
            operationType={message.confirmation.operationType}
            onConfirm={() => onConfirm(message.id, message.confirmation!.actionId)}
            onCancel={() => onCancel(message.id, message.confirmation!.actionId)}
            result={message.confirmation.result}
          />
        )}

        {/* Cancelled confirmation */}
        {message.confirmation?.cancelled && (
          <div className="rounded-lg border border-[#eaeaea] dark:border-[#333] bg-[#fafafa] dark:bg-[#0a0a0a] px-3 py-2 text-sm text-[#999]">
            Action cancelled.
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAgent;
