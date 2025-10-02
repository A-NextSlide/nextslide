export type CommentAnchorType = 'component' | 'region';

export interface NormalizedRect {
  x: number; // 0..1 relative to slide width
  y: number; // 0..1 relative to slide height
  width: number; // 0..1
  height: number; // 0..1
}

export interface CommentAnchor {
  type: CommentAnchorType;
  slideId: string;
  componentId?: string;
  rect?: NormalizedRect; // if region
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


