/**
 * Shared hooks for comments functionality
 * Reduces code duplication between CommentPinsOverlay and CommentsPanel
 */

import { useState, useEffect, useCallback } from 'react';
import { CommentsService } from '@/services/CommentsService';
import type { CommentThread } from '@/types/Comments';

/**
 * Hook to load and manage collaborator name mapping
 */
export function useCollaboratorMap(
  getCollaborators?: () => Promise<Array<{ user_id: string; email: string; role?: string }>>
) {
  const [collaboratorMap, setCollaboratorMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const loadCollaborators = async () => {
      const map = new Map<string, string>();
      
      // Add current user
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
          map.set(user.id, name);
        }
      } catch (err) {
        console.warn('Failed to load current user:', err);
      }
      
      // Add collaborators
      if (getCollaborators) {
        try {
          const list = await getCollaborators();
          list.forEach(c => {
            // Use full_name if available, otherwise email prefix
            const name = (c as any).full_name || (c as any).name || c.email.split('@')[0];
            map.set(c.user_id, name);
          });
        } catch (err) {
          console.warn('Failed to load collaborators:', err);
        }
      }
      
      setCollaboratorMap(map);
    };
    
    loadCollaborators();
  }, [getCollaborators]);

  return collaboratorMap;
}

/**
 * Hook to load and manage comment threads
 */
export function useCommentThreads(
  deckId: string,
  slideId: string,
  status?: 'open' | 'resolved'
) {
  const [rawThreads, setRawThreads] = useState<CommentThread[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const threads = await CommentsService.list(deckId, { slideId, status });
      setRawThreads(threads || []);
    } catch (err) {
      console.error('Failed to load comments:', err);
      setError(err instanceof Error ? err.message : 'Failed to load comments');
      setRawThreads([]);
    } finally {
      setIsLoading(false);
    }
  }, [deckId, slideId, status]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Listen for comment creation events
  useEffect(() => {
    const handleCommentCreated = () => {
      CommentsService.list(deckId, { slideId, status })
        .then(threads => setRawThreads(threads || []))
        .catch(err => {
          console.error('Failed to refresh comments:', err);
        });
    };
    
    window.addEventListener('comments:created', handleCommentCreated);
    return () => window.removeEventListener('comments:created', handleCommentCreated);
  }, [deckId, slideId, status]);

  return { threads: rawThreads, isLoading, error, refresh, setThreads: setRawThreads };
}

/**
 * Hook to enrich threads with author names
 */
export function useEnrichedThreads(
  rawThreads: CommentThread[],
  collaboratorMap: Map<string, string>
) {
  const [enrichedThreads, setEnrichedThreads] = useState<CommentThread[]>([]);

  useEffect(() => {
    const enriched = rawThreads.map(t => ({ 
      ...t, 
      comments: Array.isArray(t.comments) ? t.comments.map(c => ({
        ...c,
        authorName: collaboratorMap.get(c.authorId) || c.authorName || c.authorId?.split('@')[0] || 'User'
      })) : [] 
    }));
    setEnrichedThreads(enriched);
  }, [rawThreads, collaboratorMap]);

  return enrichedThreads;
}

/**
 * Hook to handle @mentions in comment text
 */
export function useMentions(
  getCollaborators?: () => Promise<Array<{ user_id: string; email: string }>>
) {
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionList, setMentionList] = useState<Array<{ user_id: string; email: string }>>([]);
  const [mentions, setMentions] = useState<string[]>([]);

  const refreshMentions = useCallback(async (query: string) => {
    try {
      if (!getCollaborators) {
        setMentionList([]);
        return;
      }
      const list = await getCollaborators();
      const q = (query || '').toLowerCase();
      const filtered = q ? list.filter(c => c.email.toLowerCase().includes(q)) : list;
      setMentionList(filtered);
    } catch (err) {
      console.error('Failed to load mentions:', err);
      setMentionList([]);
    }
  }, [getCollaborators]);

  const handleTextChange = useCallback((text: string, onTextChange: (text: string) => void) => {
    onTextChange(text);
    
    // Check for @ mention pattern
    const m = text.match(/@([A-Za-z0-9_.+-]*)$/);
    if (m) {
      const q = m[1] || '';
      setMentionQuery(q);
      refreshMentions(q);
    } else {
      setMentionQuery('');
      setMentionList([]);
    }
  }, [refreshMentions]);

  const pickMention = useCallback((userId: string, email: string, currentText: string, onTextChange: (text: string) => void) => {
    setMentions(prev => Array.from(new Set([...prev, userId])));
    const newText = currentText.replace(/@([A-Za-z0-9_.+-]*)$/, `@${email} `);
    onTextChange(newText);
    setMentionQuery('');
    setMentionList([]);
  }, []);

  const clearMentions = useCallback(() => {
    setMentions([]);
  }, []);

  return {
    mentionQuery,
    mentionList,
    mentions,
    handleTextChange,
    pickMention,
    clearMentions,
    refreshMentions
  };
}

/**
 * Deterministic color generator for user avatars/badges
 */
export function colorForUser(idOrName: string): React.CSSProperties {
  const key = idOrName || '';
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return {
    backgroundColor: `hsl(${hue} 85% 96%)`,
    borderColor: `hsl(${hue} 70% 80%)`
  } as React.CSSProperties;
}


