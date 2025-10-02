import { apiClient } from '@/services/apiClient';
import type { CommentThread, CreateCommentPayload, CommentsListResponse, CommentEntity } from '@/types/Comments';

export class CommentsService {
  static async list(deckId: string, params?: { slideId?: string; status?: 'open' | 'resolved' }): Promise<CommentThread[]> {
    const query = new URLSearchParams();
    if (params?.slideId) query.set('slideId', params.slideId);
    if (params?.status) query.set('status', params.status);
    const res = await apiClient.get<CommentsListResponse>(`/api/decks/${deckId}/comments${query.toString() ? `?${query.toString()}` : ''}`);
    if (!res.ok) {
      // Return empty list on server error to keep UI functional
      console.warn('[CommentsService.list] Falling back to empty list:', res.error);
      return [];
    }

    const data: any = res.data;
    // Normalize both formats:
    // 1) { threads: [...] }
    // 2) [ { id, thread_id, deck_id, slide_id, body, ... } ]
    if (data && Array.isArray(data)) {
      const groups = new Map<string, CommentThread>();
      for (const c of data) {
        const threadId = c.thread_id || c.id;
        if (!groups.has(threadId)) {
          groups.set(threadId, {
            id: threadId,
            deckId: c.deck_id,
            slideId: c.slide_id || undefined,
            anchor: c.anchor || undefined,
            resolved: Boolean(c.resolved_at),
            resolvedByUserId: c.resolved_by_user_id || undefined,
            resolvedAt: c.resolved_at || undefined,
            createdAt: c.created_at || undefined,
            comments: []
          });
        }
        const thread = groups.get(threadId)!;
        thread.comments.push({
          id: c.id,
          threadId,
          deckId: c.deck_id,
          slideId: c.slide_id || undefined,
          authorId: c.author_id,
          authorName: c.author_name || undefined,
          body: c.body,
          mentions: c.mentions || [],
          createdAt: c.created_at,
          updatedAt: c.updated_at
        });
      }
      return Array.from(groups.values()).map(t => ({ ...t, comments: Array.isArray(t.comments) ? t.comments : [] }));
    }

    const threads = (data?.threads as CommentThread[]) || [];
    return threads.map(t => ({ ...t, comments: Array.isArray(t.comments) ? t.comments : [] }));
  }

  static async create(deckId: string, payload: CreateCommentPayload): Promise<{ thread: CommentThread; comment: CommentEntity }> {
    // Map FE camelCase to BE snake_case and accept both formats
    const threadId = (payload as any).threadId ?? (payload as any).thread_id;
    const slideId = (payload as any).slideId ?? (payload as any).slide_id;
    const body: any = {
      thread_id: threadId,
      slide_id: slideId,
      anchor: (payload as any).anchor,
      body: (payload as any).body,
      mentions: (payload as any).mentions
    };
    const res = await apiClient.post<{ thread: CommentThread; comment: CommentEntity }>(`/api/decks/${deckId}/comments`, body);
    if (!res.ok) throw new Error(res.error || 'Failed to create comment');

    const data = res.data!;
    try {
      // Broadcast a global event so overlays/panels can refresh immediately
      window.dispatchEvent(new CustomEvent('comments:created', {
        detail: {
          deckId,
          slideId,
          threadId: data.thread?.id,
          commentId: data.comment?.id
        }
      }));
    } catch {}

    return data;
  }

  static async update(deckId: string, commentId: string, body: string): Promise<CommentEntity> {
    const res = await apiClient.put<CommentEntity>(`/api/decks/${deckId}/comments/${commentId}`, { body });
    if (!res.ok) throw new Error(res.error || 'Failed to update comment');
    return res.data!;
  }

  static async remove(deckId: string, commentId: string): Promise<{ success: true }> {
    const res = await apiClient.delete<{ success: true }>(`/api/decks/${deckId}/comments/${commentId}`);
    if (!res.ok) throw new Error(res.error || 'Failed to delete comment');
    return res.data || { success: true };
  }

  static async resolveThread(deckId: string, threadId: string, resolved: boolean): Promise<CommentThread> {
    const res = await apiClient.put<CommentThread>(`/api/decks/${deckId}/threads/${threadId}`, { resolved });
    if (!res.ok) throw new Error(res.error || 'Failed to update thread');
    return res.data!;
  }
}


