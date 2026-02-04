/**
 * Shared hooks for comments functionality
 * Reduces code duplication between CommentPinsOverlay and CommentsPanel
 */

import { useState, useEffect, useCallback } from 'react';
import { CommentsService } from '@/services/CommentsService';
import type { CommentThread, EnrichedCommentThread } from '@/types/Comments';

/**
 * Format an ISO timestamp into a relative time string
 */
export function formatRelativeTime(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Hook to get the current user's ID from Supabase auth
 */
export function useCurrentUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        const { data: { user } } = await supabase.auth.getUser();
        if (!cancelled && user) setUserId(user.id);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  return userId;
}

export interface CollaboratorInfo {
  name: string;
  email: string;
}

/**
 * Hook to load and manage collaborator name + email mapping
 */
export function useCollaboratorMap(
  getCollaborators?: () => Promise<Array<{ user_id: string; email: string; role?: string }>>
) {
  const [collaboratorMap, setCollaboratorMap] = useState<Map<string, CollaboratorInfo>>(new Map());

  useEffect(() => {
    const loadCollaborators = async () => {
      const map = new Map<string, CollaboratorInfo>();

      // Add current user
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
          map.set(user.id, { name, email: user.email || '' });
        }
      } catch (err) {
        console.warn('Failed to load current user:', err);
      }

      // Add collaborators
      if (getCollaborators) {
        try {
          const list = await getCollaborators();
          list.forEach(c => {
            const name = (c as any).full_name || (c as any).name || c.email.split('@')[0];
            map.set(c.user_id, { name, email: c.email });
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

  // Listen for comment creation, update, and delete events
  useEffect(() => {
    const handleRefresh = () => {
      CommentsService.list(deckId, { slideId, status })
        .then(threads => {
          setRawThreads(threads || []);
        })
        .catch(err => {
          console.error('Failed to refresh comments:', err);
        });
    };

    window.addEventListener('comments:created', handleRefresh);
    window.addEventListener('comments:updated', handleRefresh);
    window.addEventListener('comments:deleted', handleRefresh);
    return () => {
      window.removeEventListener('comments:created', handleRefresh);
      window.removeEventListener('comments:updated', handleRefresh);
      window.removeEventListener('comments:deleted', handleRefresh);
    };
  }, [deckId, slideId, status]);

  // Dispatch unresolved count after threads load
  useEffect(() => {
    const unresolvedCount = rawThreads.filter(t => !t.resolved).length;
    try {
      window.dispatchEvent(new CustomEvent('comments:count-update', {
        detail: { count: unresolvedCount }
      }));
    } catch {}
  }, [rawThreads]);

  return { threads: rawThreads, isLoading, error, refresh, setThreads: setRawThreads };
}

/**
 * Hook to enrich threads with author names and compute thread metadata
 */
export function useEnrichedThreads(
  rawThreads: CommentThread[],
  collaboratorMap: Map<string, CollaboratorInfo>
): EnrichedCommentThread[] {
  const [enrichedThreads, setEnrichedThreads] = useState<EnrichedCommentThread[]>([]);

  useEffect(() => {
    const enriched: EnrichedCommentThread[] = rawThreads
      .filter(t => t.comments && t.comments.length > 0)
      .map(t => {
        const comments = t.comments.map(c => ({
          ...c,
          authorName: collaboratorMap.get(c.authorId)?.name || c.authorName || c.authorId?.split('@')[0] || 'User'
        }));
        const rootComment = comments[0];
        const replies = comments.slice(1);
        const lastComment = comments[comments.length - 1];

        return {
          ...t,
          comments,
          rootComment,
          replyCount: replies.length,
          lastActivity: lastComment?.createdAt || t.createdAt || '',
        };
      });
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
  const [mentionList, setMentionList] = useState<Array<{ user_id: string; email: string; name?: string }>>([]);
  const [mentions, setMentions] = useState<string[]>([]);

  const refreshMentions = useCallback(async (query: string) => {
    try {
      if (!getCollaborators) {
        setMentionList([]);
        return;
      }
      const list = await getCollaborators();
      const q = (query || '').toLowerCase();
      const enriched = list.map(c => ({
        ...c,
        name: (c as any).full_name || (c as any).name || c.email.split('@')[0],
      }));
      const filtered = q ? enriched.filter(c => c.email.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)) : enriched;
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
 * Deterministic color generator for user avatars
 * Returns saturated colors suitable for avatar backgrounds with white text
 */
export function colorForUser(idOrName: string): { backgroundColor: string; color: string } {
  const key = idOrName || '';
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return {
    backgroundColor: `hsl(${hue} 65% 50%)`,
    color: '#ffffff',
  };
}

/**
 * Get initials from a name string (up to 2 characters)
 */
export function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}
