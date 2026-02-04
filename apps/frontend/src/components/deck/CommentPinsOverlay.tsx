import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Check, RotateCcw, Send, MoreHorizontal, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { CommentsService } from '@/services/CommentsService';
import type { CommentThread, CommentAnchor, NormalizedRect, CommentEntity } from '@/types/Comments';
import { Badge } from '@/components/ui/badge';
import { useEditorStore } from '@/stores/editorStore';
import {
  useCollaboratorMap,
  useCommentThreads,
  useEnrichedThreads,
  useMentions,
  useCurrentUserId,
  colorForUser,
  getInitials,
  formatRelativeTime,
  type CollaboratorInfo,
} from '@/hooks/useComments';

interface CommentPinsOverlayProps {
  deckId: string;
  slideId: string;
  containerRef: React.RefObject<HTMLDivElement>;
  zoomLevel?: number;
  getCollaborators?: () => Promise<Array<{ user_id: string; email: string; role?: string }>>;
}

// ─── Thread Popover Content ──────────────────────────────────────────────────
// Each popover gets its own local state for reply text, fixing the shared state bug.
const ThreadPopoverContent: React.FC<{
  thread: CommentThread;
  deckId: string;
  slideId: string;
  currentUserId: string | null;
  collaboratorMap: Map<string, CollaboratorInfo>;
  getCollaborators?: () => Promise<Array<{ user_id: string; email: string; role?: string }>>;
  onResolve: (threadId: string, resolved: boolean) => void;
  onRefresh: () => void;
  onHide: () => void;
}> = ({ thread, deckId, slideId, currentUserId, collaboratorMap, getCollaborators, onResolve, onRefresh, onHide }) => {
  const [replyBody, setReplyBody] = useState('');
  const [showReplies, setShowReplies] = useState(true);
  const mentionHook = useMentions(getCollaborators);
  const comments = thread.comments || [];
  const rootComment = comments[0];
  const replies = comments.slice(1);

  const handleReply = async () => {
    if (!replyBody.trim()) return;
    try {
      await CommentsService.create(deckId, {
        slideId,
        body: replyBody,
        thread_id: thread.id,
        mentions: mentionHook.mentions,
      } as any);
      setReplyBody('');
      mentionHook.clearMentions();
      onRefresh();
    } catch (err: any) {
      console.error('Failed to add reply:', err);
    }
  };

  const handleEdit = async (commentId: string, newBody: string) => {
    try {
      await CommentsService.update(deckId, commentId, newBody);
      onRefresh();
    } catch (err) {
      console.error('Failed to edit comment:', err);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await CommentsService.remove(deckId, commentId);
      onRefresh();
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-end gap-2">
        <Button size="xs" variant="ghost" className="h-6 text-[10px]" onClick={onHide}>
          Hide
        </Button>
        <Button
          size="xs"
          variant="ghost"
          className={`h-6 text-[10px] gap-1 ${thread.resolved ? 'text-muted-foreground' : 'text-green-600 dark:text-green-400'}`}
          onClick={() => onResolve(thread.id, !thread.resolved)}
        >
          {thread.resolved ? <><RotateCcw size={10} /> Reopen</> : <><Check size={10} /> Resolve</>}
        </Button>
      </div>

      {/* Comments */}
      <div className="space-y-1.5 max-h-48 overflow-auto">
        {comments.map(c => (
          <PopoverComment
            key={c.id}
            comment={c}
            isOwn={currentUserId === c.authorId}
            collaboratorMap={collaboratorMap}
            onEdit={(newBody) => handleEdit(c.id, newBody)}
            onDelete={() => handleDelete(c.id)}
          />
        ))}
      </div>

      {/* Reply count toggle */}
      {replies.length > 0 && !showReplies && (
        <button
          className="text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => setShowReplies(true)}
        >
          Show {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
        </button>
      )}

      {/* Reply composer */}
      <div className="space-y-1.5">
        <div className="flex gap-1.5">
          <Textarea
            value={replyBody}
            onChange={e => mentionHook.handleTextChange(e.target.value, setReplyBody)}
            placeholder="Reply... Use @ to mention"
            className="h-14 text-xs flex-1 resize-none"
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleReply();
              }
            }}
          />
          <Button size="xs" className="h-14 w-8 p-0 shrink-0" onClick={handleReply} disabled={!replyBody.trim()}>
            <Send size={12} />
          </Button>
        </div>
        {!!mentionHook.mentionQuery && mentionHook.mentionList.length > 0 && (
          <div className="border rounded p-1 max-h-28 overflow-auto bg-popover">
            {mentionHook.mentionList.map(m => {
              const name = m.name || m.email.split('@')[0];
              const colors = colorForUser(m.user_id);
              return (
                <button
                  key={m.user_id}
                  className="w-full text-left text-xs px-2 py-1 hover:bg-accent rounded flex items-center gap-2"
                  onClick={() => mentionHook.pickMention(m.user_id, m.email, replyBody, setReplyBody)}
                >
                  <span className="h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-medium shrink-0" style={colors}>
                    {getInitials(name)}
                  </span>
                  <span className="font-medium truncate">{name}</span>
                  <span className="text-muted-foreground truncate ml-auto text-[10px]">{m.email}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Single comment in popover ───────────────────────────────────────────────
const PopoverComment: React.FC<{
  comment: CommentEntity;
  isOwn: boolean;
  collaboratorMap: Map<string, CollaboratorInfo>;
  onEdit: (newBody: string) => void;
  onDelete: () => void;
}> = ({ comment, isOwn, collaboratorMap, onEdit, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const authorName = collaboratorMap.get(comment.authorId)?.name || comment.authorName || 'User';
  const colors = colorForUser(comment.authorId || '');

  return (
    <div className="flex gap-2 group/popcom">
      <Avatar className="h-5 w-5 shrink-0 text-[8px]">
        <AvatarFallback style={colors} className="font-medium text-[8px]">
          {getInitials(authorName)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-medium truncate">{authorName}</span>
          <span className="text-[9px] text-muted-foreground shrink-0">{formatRelativeTime(comment.createdAt)}</span>
          {isOwn && !isEditing && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="ml-auto h-4 w-4 flex items-center justify-center rounded hover:bg-accent opacity-0 group-hover/popcom:opacity-100 transition-opacity">
                  <MoreHorizontal size={10} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-28">
                <DropdownMenuItem className="text-xs" onClick={() => { setEditBody(comment.body); setIsEditing(true); }}>Edit</DropdownMenuItem>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem className="text-xs text-destructive" onSelect={e => e.preventDefault()}>Delete</DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete comment?</AlertDialogTitle>
                      <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {isEditing ? (
          <div className="mt-1 space-y-1">
            <Textarea value={editBody} onChange={e => setEditBody(e.target.value)} className="h-12 text-[11px]" autoFocus />
            <div className="flex gap-1 justify-end">
              <Button size="xs" variant="ghost" className="h-5 text-[9px]" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button size="xs" className="h-5 text-[9px]" onClick={() => { onEdit(editBody); setIsEditing(false); }}>Save</Button>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words">{comment.body}</p>
        )}
      </div>
    </div>
  );
};

// ─── Main Overlay ────────────────────────────────────────────────────────────
export const CommentPinsOverlay: React.FC<CommentPinsOverlayProps> = ({ deckId, slideId, containerRef, zoomLevel = 100, getCollaborators }) => {
  const { toast } = useToast();
  const [visible, setVisible] = useState<boolean>(true);
  const [quickOpen, setQuickOpen] = useState<boolean>(false);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [highlightedRegion, setHighlightedRegion] = useState<NormalizedRect | null>(null);

  const currentUserId = useCurrentUserId();
  const collaboratorMap = useCollaboratorMap(getCollaborators);
  const { threads: rawThreads, refresh: refreshThreads, setThreads: setRawThreads } = useCommentThreads(deckId, slideId, 'open');
  const threads = useEnrichedThreads(rawThreads, collaboratorMap);

  // Quick composer local state
  const [quickBody, setQuickBody] = useState('');
  const quickMentionHook = useMentions(getCollaborators);

  // Auto-show overlay when threads are loaded
  useEffect(() => {
    if (rawThreads && rawThreads.length > 0) {
      setVisible(true);
    }
  }, [rawThreads]);

  // Listen for requests to open a specific thread bubble from the comments panel
  useEffect(() => {
    const handleOpenThread = (e: any) => {
      try {
        const id = e?.detail?.threadId;
        if (id) {
          setVisible(true);
          setOpenThreadId(id);
          try { window.dispatchEvent(new CustomEvent('editor:force-edit-mode')); } catch {}
        }
      } catch {}
    };
    window.addEventListener('comments:open-thread', handleOpenThread as any);
    return () => window.removeEventListener('comments:open-thread', handleOpenThread as any);
  }, []);

  const handleResolve = async (threadId: string, resolved: boolean) => {
    try {
      setRawThreads(prev => prev.map(t =>
        t.id === threadId ? { ...t, resolved } : t
      ));
      await CommentsService.resolveThread(deckId, threadId, resolved);
    } catch (e: any) {
      refreshThreads();
      console.error('Failed to update thread:', e);
    }
  };

  const createComment = async () => {
    if (!quickBody.trim()) return;
    let anchor: CommentAnchor | undefined = undefined;
    try {
      const selected = useEditorStore.getState().selectedComponentIds;
      const selectedArray = Array.from(selected || []);

      if (selectedArray.length === 1) {
        anchor = { type: 'component', slideId, componentId: selectedArray[0] };
      } else if (selectedArray.length > 1) {
        anchor = { type: 'component_group', slideId, componentIds: selectedArray };
      }
    } catch {}
    try {
      const { thread } = await CommentsService.create(deckId, { slideId, anchor, body: quickBody, mentions: quickMentionHook.mentions });
      setRawThreads(prev => [thread, ...prev]);
      setQuickBody('');
      quickMentionHook.clearMentions();
      toast({ title: 'Comment added' });
    } catch (e: any) {
      toast({ title: 'Failed to add comment', description: e.message, variant: 'destructive' });
    }
  };

  // Global controls from header
  useEffect(() => {
    const toggle = () => setVisible(v => !v);
    const show = () => setVisible(true);
    const hide = () => setVisible(false);
    const quick = () => { setQuickOpen(true); setVisible(true); };
    const highlightRegionHandler = (e: any) => {
      const rect = e.detail?.rect;
      if (rect) {
        setHighlightedRegion(rect);
        setTimeout(() => setHighlightedRegion(null), 2000);
      }
    };
    window.addEventListener('comments:toggle-visibility', toggle as any);
    window.addEventListener('comments:show', show as any);
    window.addEventListener('comments:hide', hide as any);
    window.addEventListener('comments:quick', quick as any);
    window.addEventListener('comments:highlight-region', highlightRegionHandler as any);
    return () => {
      window.removeEventListener('comments:toggle-visibility', toggle as any);
      window.removeEventListener('comments:show', show as any);
      window.removeEventListener('comments:hide', hide as any);
      window.removeEventListener('comments:quick', quick as any);
      window.removeEventListener('comments:highlight-region', highlightRegionHandler as any);
    };
  }, []);

  if (!visible) return null;

  const slideContainer = typeof document !== 'undefined' ? document.getElementById('slide-display-container') : null;
  if (!slideContainer) return null;

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Existing pins - only show unresolved */}
      {(threads || []).filter(t => t && !t.resolved).map((t) => {
        const anchor = (t as any)?.anchor;
        const replyCount = (t.comments?.length || 1) - 1;

        // Position based on anchor type
        let style: React.CSSProperties;

        if (anchor?.type === 'component' && anchor.componentId) {
          const comp = document.querySelector(`[data-component-id="${anchor.componentId}"]`);
          if (comp) {
            const rect = comp.getBoundingClientRect();
            const containerRect = containerRef.current?.getBoundingClientRect();
            if (containerRect) {
              style = {
                left: `${((rect.right - containerRect.left) / containerRect.width) * 100}%`,
                top: `${((rect.top - containerRect.top) / containerRect.height) * 100}%`,
                transform: 'translate(-100%, 0)'
              };
            } else {
              style = { display: 'none' };
            }
          } else {
            style = { display: 'none' };
          }
        } else if (anchor && (anchor as any).type === 'component_group' && (anchor as any).componentIds) {
          const rects = (anchor as any).componentIds.map((id: string) => {
            const el = document.querySelector(`[data-component-id="${id}"]`);
            return el?.getBoundingClientRect();
          }).filter(Boolean);

          if (rects.length > 0) {
            const containerRect = containerRef.current?.getBoundingClientRect();
            if (containerRect) {
              const minY = Math.min(...rects.map((r: DOMRect) => r.top));
              const maxX = Math.max(...rects.map((r: DOMRect) => r.right));

              style = {
                left: `${((maxX - containerRect.left) / containerRect.width) * 100}%`,
                top: `${((minY - containerRect.top) / containerRect.height) * 100}%`,
                transform: 'translate(-100%, 0)'
              };
            } else {
              style = { display: 'none' };
            }
          } else {
            style = { display: 'none' };
          }
        } else if (anchor?.rect) {
          style = {
            left: `${(anchor.rect.x + anchor.rect.width) * 100}%`,
            top: `${anchor.rect.y * 100}%`,
            transform: 'translate(-100%, 0)'
          };
        } else {
          style = {
            right: '12px',
            top: '50%',
            transform: 'translateY(-50%)'
          };
        }

        return (
          <div key={t.id} className="absolute" style={style}>
            <Popover open={openThreadId === t.id} onOpenChange={(o) => setOpenThreadId(o ? t.id : null)}>
              <PopoverTrigger asChild>
                <button className="pointer-events-auto relative h-7 w-7 rounded-full bg-[#FF4301] text-white flex items-center justify-center shadow-md ring-2 ring-white dark:ring-gray-800 hover:scale-110 transition-transform">
                  <MessageSquare size={13} />
                  {/* Reply count badge */}
                  {replyCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-0.5 rounded-full bg-foreground text-background text-[9px] font-bold flex items-center justify-center">
                      {replyCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-3" side="top" align="start">
                <ThreadPopoverContent
                  thread={t}
                  deckId={deckId}
                  slideId={slideId}
                  currentUserId={currentUserId}
                  collaboratorMap={collaboratorMap}
                  getCollaborators={getCollaborators}
                  onResolve={handleResolve}
                  onRefresh={refreshThreads}
                  onHide={() => setVisible(false)}
                />
              </PopoverContent>
            </Popover>
          </div>
        );
      })}

      {/* Highlighted region */}
      {highlightedRegion && (
        <div
          className="absolute border-2 border-[#FF4301] bg-[#FF4301]/20 animate-pulse pointer-events-none"
          style={{
            left: `${highlightedRegion.x * 100}%`,
            top: `${highlightedRegion.y * 100}%`,
            width: `${highlightedRegion.width * 100}%`,
            height: `${highlightedRegion.height * 100}%`
          }}
        />
      )}

      {/* Quick composer */}
      {quickOpen && (
        <div className="absolute top-3 right-3 pointer-events-auto">
          <Popover open onOpenChange={(o) => setQuickOpen(o)}>
            <PopoverTrigger asChild>
              <span />
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3" side="bottom" align="end">
              <div className="space-y-2">
                <Textarea
                  value={quickBody}
                  onChange={e => quickMentionHook.handleTextChange(e.target.value, setQuickBody)}
                  placeholder="Comment or add others with @"
                  className="h-20 text-xs"
                />
                {!!quickMentionHook.mentionList.length && (
                  <div className="border rounded p-1 max-h-28 overflow-auto bg-popover">
                    {quickMentionHook.mentionList.map(m => {
                      const name = m.name || m.email.split('@')[0];
                      const colors = colorForUser(m.user_id);
                      return (
                        <button
                          key={m.user_id}
                          className="w-full text-left text-xs px-2 py-1 hover:bg-accent rounded flex items-center gap-2"
                          onClick={() => quickMentionHook.pickMention(m.user_id, m.email, quickBody, setQuickBody)}
                        >
                          <span className="h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-medium shrink-0" style={colors}>
                            {getInitials(name)}
                          </span>
                          <span className="font-medium truncate">{name}</span>
                          <span className="text-muted-foreground truncate ml-auto text-[10px]">{m.email}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="flex justify-end gap-3">
                  <Button size="xs" variant="link" className="h-7" onClick={() => setQuickOpen(false)}>Cancel</Button>
                  <Button size="xs" className="h-7" onClick={() => { createComment(); setQuickOpen(false); }}>Comment</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
};

export default CommentPinsOverlay;
