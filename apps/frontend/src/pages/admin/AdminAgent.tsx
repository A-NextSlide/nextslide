import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, Bot, User, Loader2, AlertCircle, Sparkles } from 'lucide-react';
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
  data?: {
    columns: string[];
    rows: Record<string, any>[];
    rowCount: number;
    truncated: boolean;
    entityLinks: Record<string, 'user' | 'deck'>;
  };
  confirmation?: {
    actionId: string;
    summary: string;
    affectedRows?: number | null;
    operationType?: string | null;
    result?: AgentConfirmResponse | null;
    cancelled?: boolean;
  };
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
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
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
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Failed to process request',
          timestamp: new Date(),
          error: err?.message || 'Network error',
        },
      ]);
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
            : m,
        ),
      );
    } catch (err: any) {
      setMessages(prev =>
        prev.map(m =>
          m.id === msgId && m.confirmation
            ? { ...m, confirmation: { ...m.confirmation, result: { success: false, affected_rows: 0, message: 'Failed', error: err?.message || 'Network error' } } }
            : m,
        ),
      );
    }
  }, [sessionId]);

  const handleCancel = useCallback(async (msgId: string, actionId: string) => {
    try { await adminApi.agentCancel(sessionId, actionId); } catch { /* ignore */ }
    setMessages(prev =>
      prev.map(m =>
        m.id === msgId && m.confirmation
          ? { ...m, confirmation: { ...m.confirmation, cancelled: true } }
          : m,
      ),
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
      {/* Full-height flex column: messages grow, input pinned to bottom */}
      <div className="flex flex-col h-full -my-4 max-w-5xl mx-auto w-full">
        {/* Scrollable messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
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
            <div className="flex items-start gap-2">
              <div className="mt-0.5 rounded-full bg-[#f0f0f0] dark:bg-[#222] p-1">
                <Bot className="h-3.5 w-3.5 text-[#666]" />
              </div>
              <div className="flex items-center gap-1.5 py-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#999]" />
                <span className="text-xs text-[#999]">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input — pinned at bottom */}
        <div className="shrink-0 border-t border-[#e5e5e5] dark:border-[#333] bg-white dark:bg-[#111] px-4 py-2.5">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your data..."
              rows={1}
              className="flex-1 resize-none rounded-md border border-[#ddd] dark:border-[#444] bg-white dark:bg-[#0a0a0a] px-3 py-2 text-sm leading-snug focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 placeholder:text-[#aaa]"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="shrink-0 rounded-md bg-black dark:bg-white text-white dark:text-black p-2 hover:bg-[#333] dark:hover:bg-[#ddd] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="text-[10px] text-[#bbb] mt-1">
            Shift+Enter for newline. Read queries run instantly; writes require confirmation.
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
  <div className="flex flex-col items-center justify-center h-full py-12 text-center">
    <div className="rounded-full bg-[#f0f0f0] dark:bg-[#222] p-2.5 mb-3">
      <Sparkles className="h-5 w-5 text-[#666]" />
    </div>
    <h2 className="text-base font-semibold mb-0.5">Data Agent</h2>
    <p className="text-xs text-[#666] dark:text-[#888] mb-4 max-w-sm">
      Ask questions about your database in plain English.
    </p>
    <div className="flex flex-wrap gap-1.5 justify-center max-w-lg">
      {SUGGESTED_QUERIES.map(q => (
        <button
          key={q}
          onClick={() => onSelectQuery(q)}
          className="px-2.5 py-1 text-[11px] rounded-full border border-[#ddd] dark:border-[#444] text-[#555] dark:text-[#aaa] hover:bg-[#f5f5f5] dark:hover:bg-[#1a1a1a] hover:border-[#bbb] dark:hover:border-[#555] transition-colors"
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
      <div className="flex items-start gap-2 justify-end">
        <div className="max-w-[80%] rounded-md bg-black dark:bg-white text-white dark:text-black px-3 py-1.5 text-sm leading-snug">
          {message.content}
        </div>
        <div className="mt-0.5 rounded-full bg-[#f0f0f0] dark:bg-[#222] p-1 shrink-0">
          <User className="h-3.5 w-3.5 text-[#666]" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 rounded-full bg-[#f0f0f0] dark:bg-[#222] p-1 shrink-0">
        <Bot className="h-3.5 w-3.5 text-[#666]" />
      </div>
      <div className="space-y-1.5 min-w-0 flex-1 overflow-hidden">
        {message.error && (
          <div className="flex items-start gap-1.5 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-2.5 py-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-red-700 dark:text-red-300 font-medium">{message.content}</p>
              <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">{message.error}</p>
            </div>
          </div>
        )}

        {!message.error && message.content && (
          <p className="text-sm text-[#333] dark:text-[#ccc] leading-snug">{message.content}</p>
        )}

        {message.data && (
          <AgentDataTable
            columns={message.data.columns}
            rows={message.data.rows}
            rowCount={message.data.rowCount}
            truncated={message.data.truncated}
            entityLinks={message.data.entityLinks}
          />
        )}

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

        {message.confirmation?.cancelled && (
          <div className="rounded-md border border-[#e5e5e5] dark:border-[#333] bg-[#fafafa] dark:bg-[#0a0a0a] px-2.5 py-1.5 text-xs text-[#999]">
            Cancelled.
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAgent;
