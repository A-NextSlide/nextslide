import { useCallback, useRef, useState } from 'react';

export function useChatPendingMessages() {
  const pendingMessageIdsRef = useRef<Set<string>>(new Set());
  const [pendingCount, setPendingCount] = useState(0);

  const addPendingMessage = useCallback((msgId: string) => {
    pendingMessageIdsRef.current.add(msgId);
    setPendingCount(pendingMessageIdsRef.current.size);
  }, []);

  const removePendingMessage = useCallback((msgId: string) => {
    pendingMessageIdsRef.current.delete(msgId);
    setPendingCount(pendingMessageIdsRef.current.size);
  }, []);

  const isLoading = pendingCount > 0;

  return {
    isLoading,
    addPendingMessage,
    removePendingMessage,
  };
}
