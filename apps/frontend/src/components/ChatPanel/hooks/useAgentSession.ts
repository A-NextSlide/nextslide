import { useCallback, useEffect, useRef } from 'react';
import AgentChatClient from '@/services/agentChat';
import { supabase } from '@/integrations/supabase/client';
import { API_CONFIG } from '@/config/environment';
import { useDeckStore } from '@/stores/deckStore';
import type { SlideData } from '@/types/SlideTypes';
import type { ExtendedChatMessageProps } from '@/components/chat';

interface UseAgentSessionOptions {
  slides: SlideData[];
  currentSlideIndex: number;
  setMessages: React.Dispatch<React.SetStateAction<ExtendedChatMessageProps[]>>;
  setOldMessages: React.Dispatch<React.SetStateAction<ExtendedChatMessageProps[]>>;
  agentClientRef: React.MutableRefObject<AgentChatClient | null>;
  agentSessionId: string | null;
  setAgentSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  handleCommonAgentEvent: (evt: any, source: 'primary' | 'secondary', options?: { respectProgressLockout?: boolean }) => boolean;
  handleDeckEditApplied: (evt: any, source: 'primary' | 'secondary') => boolean;
  handleDeckEditProposed: (evt: any, source: 'primary' | 'secondary') => boolean;
  handleDeckPreviewDiff: (evt: any, source: 'primary' | 'secondary') => boolean;
  clearPlanTimers: () => void;
}

export function useAgentSession({
  slides,
  currentSlideIndex,
  setMessages,
  setOldMessages,
  agentClientRef,
  agentSessionId,
  setAgentSessionId,
  handleCommonAgentEvent,
  handleDeckEditApplied,
  handleDeckEditProposed,
  handleDeckPreviewDiff,
  clearPlanTimers,
}: UseAgentSessionOptions) {
  const sessionSlideIdRef = useRef<string | null>(null);
  const connectingRef = useRef<Promise<boolean> | null>(null);

  const mapHistoryMessages = useCallback((historyMessages: any[]): ExtendedChatMessageProps[] => {
    return (historyMessages || [])
      .map((msg: any): ExtendedChatMessageProps | null => {
        const snapshotAttachment = msg.attachments?.find((a: any) => a.type === 'slide_snapshot');
        if (snapshotAttachment) {
          return {
            id: msg.id,
            type: 'system' as const,
            message: msg.text || '✅ Edit applied',
            timestamp: new Date(msg.created_at),
            feedback: null,
            metadata: {
              type: 'edit_applied',
              compactRow: false,
              slideSnapshot: snapshotAttachment.data,
              preEditSnapshot: snapshotAttachment.preEditData,
              editId: snapshotAttachment.editId
            }
          };
        }

        const text = (msg.text || '').trim();
        if (msg.role === 'assistant' && (
          text.startsWith('Done!') ||
          text.includes('Proposed edit') ||
          text === '✅ Edit applied' ||
          text === ''
        )) {
          return null;
        }

        const msgType: 'user' | 'ai' = msg.role === 'user' ? 'user' : 'ai';
        return {
          id: msg.id,
          type: msgType,
          message: msg.text || '',
          timestamp: new Date(msg.created_at),
          feedback: null,
          metadata: {
            attachments: msg.attachments || [],
            selections: msg.selections || []
          }
        };
      })
      .filter((msg): msg is ExtendedChatMessageProps => msg !== null);
  }, []);

  const loadHistoryMessages = useCallback(async (client: AgentChatClient, sessionId: string, merge: boolean) => {
    try {
      const { messages: historyMessages } = await client.getMessages(sessionId, 50);
      if (historyMessages && historyMessages.length > 0) {
        const restoredMessages = mapHistoryMessages(historyMessages);
        if (merge) {
          setOldMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            const newMsgs = restoredMessages.filter(m => !existingIds.has(m.id));
            return [...newMsgs, ...prev];
          });
        } else {
          setOldMessages(restoredMessages);
        }
      }
    } catch (historyErr) {
      console.warn('[AgentChat] Failed to load chat history:', historyErr);
    }
  }, [mapHistoryMessages, setOldMessages]);

  const createClient = useCallback(async (source: 'primary' | 'secondary') => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return new AgentChatClient({
      onEvent: (evt) => {
        if (!evt || !evt.type) return;
        if (handleCommonAgentEvent(evt, source, source === 'primary' ? { respectProgressLockout: true } : undefined)) {
          return;
        }
        if (handleDeckEditProposed(evt, source)) {
          if (source === 'secondary') return;
        }
        if (handleDeckPreviewDiff(evt, source)) {
          return;
        }
        if (handleDeckEditApplied(evt, source)) {
          return;
        }
      }
    }, token || undefined);
  }, [handleCommonAgentEvent, handleDeckEditApplied, handleDeckEditProposed, handleDeckPreviewDiff]);

  useEffect(() => {
    (async () => {
      try {
        const deckData = useDeckStore.getState().deckData;
        const deckId = deckData?.uuid || deckData?.id;
        const slideId = slides[currentSlideIndex]?.id;
        if (!deckId || !slideId) return;
        // Note: Empty string is valid (means use relative URLs via proxy in development)
        if (API_CONFIG.AGENT_BASE_URL === undefined) {
          throw new Error('Agent backend not configured');
        }
        const client = await createClient('primary');
        const sid = await client.getOrCreateSession(String(deckId), String(slideId), { agentProfile: 'authoring' });
        client.openWebSocket();
        agentClientRef.current = client;
        setAgentSessionId(sid);
        sessionSlideIdRef.current = slideId;
        // Load existing chat history (store in oldMessages; do not auto-display)
        await loadHistoryMessages(client, sid, false);
      } catch (e) {
        console.warn('[AgentChat] init skipped:', e);
      }
    })();
    return () => {
      try { (window as any).__isUnmounting = true; } catch { }
      clearPlanTimers();
      try {
        if (agentClientRef.current) {
          agentClientRef.current.disconnect();
        }
      } catch { }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      if (agentClientRef.current || agentSessionId) return;
      const deckData = useDeckStore.getState().deckData;
      const deckId = deckData?.uuid || deckData?.id;
      const slideId = slides[currentSlideIndex]?.id;
      if (!deckId || !slideId) return;
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      ensureAgentSession();
    } catch { }
  }, [slides, currentSlideIndex, agentSessionId]);

  const ensureAgentSession = useCallback(async (): Promise<boolean> => {
    try {
      if (agentClientRef.current && agentSessionId) {
        const expectedSlideId = slides[currentSlideIndex]?.id;
        if (expectedSlideId) {
          sessionSlideIdRef.current = expectedSlideId;
        }
        return true;
      }
    } catch { }
    if (connectingRef.current) return connectingRef.current;
    connectingRef.current = (async () => {
      const deckData = useDeckStore.getState().deckData;
      const deckId = deckData?.uuid || deckData?.id;
      const slideId = slides[currentSlideIndex]?.id;
      if (!deckId || !slideId) { connectingRef.current = null; return false; }
      // Note: Empty string is valid (means use relative URLs via proxy in development)
      if (API_CONFIG.AGENT_BASE_URL === undefined) { connectingRef.current = null; return false; }
      try {
        const client = await createClient('secondary');
        const sid = await client.getOrCreateSession(String(deckId), String(slideId), { agentProfile: 'authoring' });
        client.openWebSocket();
        agentClientRef.current = client;
        setAgentSessionId(sid);
        sessionSlideIdRef.current = slideId;
        await loadHistoryMessages(client, sid, true);
        connectingRef.current = null;
        return true;
      } catch (err) {
        console.warn('[AgentChat] ensureAgentSession failed:', err);
        connectingRef.current = null;
        return false;
      }
    })();
    return connectingRef.current;
  }, [agentSessionId, createClient, currentSlideIndex, loadHistoryMessages, slides]);

  return {
    ensureAgentSession,
  };
}
