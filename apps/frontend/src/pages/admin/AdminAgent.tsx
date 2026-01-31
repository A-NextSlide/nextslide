import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, Bot, AlertCircle, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
      <div className="flex flex-col h-full -my-3 max-w-4xl mx-auto w-full">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-2 py-4 space-y-4">
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
            <div className="flex items-center gap-2.5 pl-1">
              <div className="relative flex items-center justify-center w-6 h-6">
                <div className="absolute inset-0 rounded-full border-2 border-[#FF4301]/20" />
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#FF4301] animate-spin" />
                <Bot className="h-3 w-3 text-[#FF4301]" />
              </div>
              <span className="text-xs text-[#999] font-medium">Thinking</span>
              <span className="flex gap-0.5">
                <span className="w-1 h-1 rounded-full bg-[#FF4301]/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 rounded-full bg-[#FF4301]/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 rounded-full bg-[#FF4301]/40 animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 px-2 pb-1">
          <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl p-1.5 shadow-sm">
            <div className="flex items-end gap-1.5">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your data..."
                rows={1}
                className="flex-1 resize-none bg-transparent px-2.5 py-2 text-sm leading-snug focus:outline-none placeholder:text-[#bbb] dark:placeholder:text-[#555]"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className="shrink-0 rounded-lg bg-[#FF4301] text-white p-2 hover:bg-[#e63d00] disabled:opacity-25 disabled:cursor-not-allowed transition-all"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <p className="text-[10px] text-[#bbb] dark:text-[#555] mt-1.5 text-center">
            Shift+Enter for newline &middot; Reads run instantly &middot; Writes require confirmation
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
    <div className="relative mb-4">
      <div className="absolute -inset-3 rounded-full bg-[#FF4301]/5" />
      <div className="relative rounded-full bg-[#FF4301]/10 p-3">
        <Sparkles className="h-5 w-5 text-[#FF4301]" />
      </div>
    </div>
    <h2
      className="text-sm font-bold uppercase tracking-wider mb-1"
      style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
    >
      Data Agent
    </h2>
    <p className="text-xs text-[#888] mb-6 max-w-xs">
      Query your database in plain English
    </p>
    <div className="flex flex-wrap gap-1.5 justify-center max-w-lg">
      {SUGGESTED_QUERIES.map(q => (
        <button
          key={q}
          onClick={() => onSelectQuery(q)}
          className="px-3 py-1.5 text-[11px] rounded-lg border border-[#eaeaea] dark:border-[#333] text-[#666] dark:text-[#888] hover:border-[#FF4301]/40 hover:text-[#FF4301] bg-white dark:bg-[#111] transition-colors"
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
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-[#FF4301] text-white px-3.5 py-2 text-sm leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-[#FF4301]/10 flex items-center justify-center">
        <Bot className="h-3 w-3 text-[#FF4301]" />
      </div>
      <div className="space-y-2 min-w-0 flex-1 overflow-hidden">
        {message.error && (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-red-700 dark:text-red-300 font-medium">{message.content}</p>
              <p className="text-[11px] text-red-500/80 dark:text-red-400/80 mt-0.5">{message.error}</p>
            </div>
          </div>
        )}

        {!message.error && message.content && (
          <div className="text-sm text-[#333] dark:text-[#ccc] leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold text-[#111] dark:text-white">{children}</strong>,
                em: ({ children }) => <em className="italic">{children}</em>,
                ul: ({ children }) => <ul className="ml-4 list-disc space-y-0.5 mb-1.5">{children}</ul>,
                ol: ({ children }) => <ol className="ml-4 list-decimal space-y-0.5 mb-1.5">{children}</ol>,
                li: ({ children }) => <li className="text-sm">{children}</li>,
                h1: ({ children }) => <h1 className="text-base font-bold mt-2 mb-1">{children}</h1>,
                h2: ({ children }) => <h2 className="text-sm font-bold mt-2 mb-1">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-semibold mt-1.5 mb-0.5">{children}</h3>,
                code: ({ children, className }) => {
                  const isBlock = className?.includes('language-');
                  return isBlock ? (
                    <pre className="bg-[#f5f5f5] dark:bg-[#1a1a1a] border border-[#eaeaea] dark:border-[#333] rounded-lg p-2.5 overflow-x-auto my-1.5">
                      <code className="text-xs font-mono">{children}</code>
                    </pre>
                  ) : (
                    <code className="bg-[#f5f5f5] dark:bg-[#1a1a1a] px-1 py-0.5 rounded text-xs font-mono">{children}</code>
                  );
                },
                pre: ({ children }) => <>{children}</>,
                table: ({ children }) => (
                  <div className="rounded-xl border border-[#eaeaea] dark:border-[#333] overflow-hidden my-1.5">
                    <table className="w-full text-xs">{children}</table>
                  </div>
                ),
                thead: ({ children }) => <thead className="bg-[#fafafa] dark:bg-[#0a0a0a]">{children}</thead>,
                th: ({ children }) => <th className="px-2.5 py-1.5 text-left text-[10px] font-medium text-[#888] border-b border-[#eaeaea] dark:border-[#333]">{children}</th>,
                td: ({ children }) => <td className="px-2.5 py-1.5 border-b border-[#f0f0f0] dark:border-[#1e1e1e]">{children}</td>,
                blockquote: ({ children }) => <blockquote className="border-l-2 border-[#FF4301]/40 pl-2.5 my-1.5 text-[#666] dark:text-[#999]">{children}</blockquote>,
                a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#FF4301] hover:underline">{children}</a>,
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
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
          <div className="rounded-xl border border-[#eaeaea] dark:border-[#333] bg-[#fafafa] dark:bg-[#0a0a0a] px-3 py-2 text-xs text-[#999]">
            Cancelled
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAgent;
