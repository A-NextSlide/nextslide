import { useCallback, useRef, useState } from 'react';

export function useChatPendingMessages() {
  const pendingMessageIdsRef = useRef<Set<string>>(new Set());
  const [, forceUpdate] = useState(0);

  const addPendingMessage = useCallback((msgId: string) => {
    pendingMessageIdsRef.current.add(msgId);
    forceUpdate(n => n + 1);
  }, []);

  const removePendingMessage = useCallback((msgId: string) => {
    pendingMessageIdsRef.current.delete(msgId);
    forceUpdate(n => n + 1);
  }, []);

  const isLoading = pendingMessageIdsRef.current.size > 0;

  return {
    isLoading,
    addPendingMessage,
    removePendingMessage,
  };
}
