export type CommentAnchorType = 'component' | 'region' | 'component_group';

export interface NormalizedRect {
  x: number; // 0..1 relative to slide width
  y: number; // 0..1 relative to slide height
  width: number; // 0..1
  height: number; // 0..1
}

export interface CommentAnchor {
  type: CommentAnchorType;
  slideId: string;
  componentId?: string;      // For single component
  componentIds?: string[];    // For component group
  rect?: NormalizedRect;      // For region
}

export interface CommentEntity {
  id: string;
  threadId: string;
  deckId: string;
  slideId?: string;
  authorId: string;
  authorName?: string;
  body: string;
  mentions?: string[]; // user_ids
  createdAt: string;
  updatedAt?: string;
}

export interface CommentThread {
  id: string;
  deckId: string;
  slideId?: string;
  anchor?: CommentAnchor;
  resolved: boolean;
  resolvedByUserId?: string;
  resolvedAt?: string;
  createdAt?: string;
  comments: CommentEntity[];
}

export interface CreateCommentPayload {
  threadId?: string;
  slideId?: string;
  anchor?: CommentAnchor;
  body: string;
  mentions?: string[]; // user_ids
}

export interface CommentsListResponse {
  threads: CommentThread[];
}

// Alias for backward compatibility
export type Comment = CommentEntity;

export type CommentFilterTab = 'all' | 'open' | 'resolved';

export interface EnrichedCommentThread extends CommentThread {
  rootComment: CommentEntity;
  replyCount: number;
  lastActivity: string; // ISO timestamp of last comment in thread
}
