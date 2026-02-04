import React, { useEffect, useState, useCallback, useRef } from 'react';
import { MessageSquare, Check, RotateCcw, Send, MoreHorizontal, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { CommentsService } from '@/services/CommentsService';
import type { CommentThread, CommentAnchor, NormalizedRect, CommentEntity } from '@/types/Comments';
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
  const [submitting, setSubmitting] = useState(false);
  const mentionHook = useMentions(getCollaborators);
  const comments = thread.comments || [];

  const handleReply = async () => {
    if (!replyBody.trim() || submitting) return;
    setSubmitting(true);
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
    } finally {
      setSubmitting(false);
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
          <Button size="xs" className="h-14 w-8 p-0 shrink-0" onClick={handleReply} disabled={!replyBody.trim() || submitting}>
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
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
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
                <DropdownMenuItem className="text-xs text-destructive" onClick={() => setShowDeleteDialog(true)}>Delete</DropdownMenuItem>
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
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
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
    </div>
  );
};

// ─── Pin position calculator ─────────────────────────────────────────────────
function usePinPositions(
  threads: CommentThread[],
  containerRef: React.RefObject<HTMLDivElement>
) {
  const [positions, setPositions] = useState<Map<string, React.CSSProperties>>(new Map());

  const recalculate = useCallback(() => {
    const overlayEl = containerRef.current;
    if (!overlayEl) return;
    const containerRect = overlayEl.getBoundingClientRect();
    if (!containerRect.width || !containerRect.height) return;

    const next = new Map<string, React.CSSProperties>();

    for (const t of threads) {
      if (t.resolved) continue;
      const anchor = t.anchor;

      if (anchor?.type === 'component' && anchor.componentId) {
        const scope = containerRef.current || document;
        const comp = scope.querySelector?.(`[data-component-id="${anchor.componentId}"], .component-wrapper[data-component-id="${anchor.componentId}"]`) as HTMLElement | null;
        if (comp) {
          const rect = comp.getBoundingClientRect();
          next.set(t.id, {
            left: `${((rect.right - containerRect.left) / containerRect.width) * 100}%`,
            top: `${((rect.top - containerRect.top) / containerRect.height) * 100}%`,
            transform: 'translate(-100%, 0)',
          });
          continue;
        }
      } else if (anchor?.type === 'component_group' && (anchor as any).componentIds) {
        const scope = containerRef.current || document;
        const rects = ((anchor as any).componentIds as string[])
          .map(id => scope.querySelector?.(`[data-component-id="${id}"], .component-wrapper[data-component-id="${id}"]`) as HTMLElement | null)
          .map(el => el?.getBoundingClientRect())
          .filter(Boolean) as DOMRect[];
        if (rects.length > 0) {
          const minY = Math.min(...rects.map(r => r.top));
          const maxX = Math.max(...rects.map(r => r.right));
          next.set(t.id, {
            left: `${((maxX - containerRect.left) / containerRect.width) * 100}%`,
            top: `${((minY - containerRect.top) / containerRect.height) * 100}%`,
            transform: 'translate(-100%, 0)',
          });
          continue;
        }
      } else if (anchor?.rect) {
        const isPoint = !anchor.rect.width && !anchor.rect.height;
        next.set(t.id, {
          left: `${(anchor.rect.x + (isPoint ? 0 : anchor.rect.width)) * 100}%`,
          top: `${anchor.rect.y * 100}%`,
          transform: isPoint ? 'translate(-50%, -50%)' : 'translate(-100%, 0)',
        });
        continue;
      }

      // Fallback: stagger pins along the right edge so they don't stack
      const idx = threads.filter(th => !th.resolved).indexOf(t);
      next.set(t.id, {
        right: '8px',
        top: `${20 + idx * 36}px`,
      });
    }

    setPositions(next);
  }, [threads, containerRef]);

  // Recalculate on mount, thread changes, and after DOM settles
  useEffect(() => {
    // Immediate + delayed recalc to catch DOM settling after animations
    recalculate();
    const t1 = setTimeout(recalculate, 300);
    const t2 = setTimeout(recalculate, 800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [recalculate]);

  // Recalculate on scroll/resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = () => recalculate();
    el.addEventListener('scroll', handler, { passive: true });
    window.addEventListener('resize', handler, { passive: true });
    return () => {
      el.removeEventListener('scroll', handler);
      window.removeEventListener('resize', handler);
    };
  }, [containerRef, recalculate]);

  return positions;
}

// ─── Main Overlay ────────────────────────────────────────────────────────────
export const CommentPinsOverlay: React.FC<CommentPinsOverlayProps> = ({ deckId, slideId, containerRef, zoomLevel = 100, getCollaborators }) => {
  const { toast } = useToast();
  const [visible, setVisible] = useState<boolean>(true);
  const [quickOpen, setQuickOpen] = useState<boolean>(false);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [highlightedRegion, setHighlightedRegion] = useState<NormalizedRect | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isPlacing, setIsPlacing] = useState(false);
  const [placementPos, setPlacementPos] = useState<{ x: number; y: number } | null>(null);
  const [placementBody, setPlacementBody] = useState('');
  const placementPointerDownRef = useRef(false);
  const placementHandledRef = useRef(false);

  const currentUserId = useCurrentUserId();
  const collaboratorMap = useCollaboratorMap(getCollaborators);
  // Don't filter by status here - we filter resolved in rendering, and the panel
  // needs all threads for the count event. This ensures pins show up reliably.
  const { threads: rawThreads, refresh: refreshThreads, setThreads: setRawThreads } = useCommentThreads(deckId, slideId);
  const threads = useEnrichedThreads(rawThreads, collaboratorMap);

  const pinPositions = usePinPositions(threads, containerRef);

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

  // Share placement mode with global handlers (selection, etc.)
  useEffect(() => {
    try {
      (window as any).__commentsPlacingPin = isPlacing;
    } catch {}
    return () => {
      try { (window as any).__commentsPlacingPin = false; } catch {}
    };
  }, [isPlacing]);

  // Listen for placement mode triggers and Escape to cancel
  useEffect(() => {
    const startPlacing = () => {
      setIsPlacing(true);
      setVisible(true);
      setPlacementPos(null);
      setPlacementBody('');
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isPlacing) { setIsPlacing(false); e.stopPropagation(); }
        if (placementPos) { setPlacementPos(null); setPlacementBody(''); e.stopPropagation(); }
      }
    };
    window.addEventListener('comments:start-placing', startPlacing as EventListener);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('comments:start-placing', startPlacing as EventListener);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isPlacing, placementPos]);

  // Handle click during placement mode
  const placeAtClientPoint = useCallback((clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    setPlacementPos({ x, y });
    setIsPlacing(false);
  }, [containerRef]);

  const handlePlacementClick = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    if (!isPlacing) return;
    e.stopPropagation();
    e.preventDefault();
    placeAtClientPoint(e.clientX, e.clientY);
  }, [isPlacing, placeAtClientPoint]);

  const handlePlacementPointerDown = useCallback((e: React.PointerEvent) => {
    if (!isPlacing) return;
    placementPointerDownRef.current = true;
    handlePlacementClick(e);
  }, [handlePlacementClick, isPlacing]);

  const handlePlacementMouseClick = useCallback((e: React.MouseEvent) => {
    if (placementPointerDownRef.current) {
      placementPointerDownRef.current = false;
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    handlePlacementClick(e);
  }, [handlePlacementClick]);

  // Global capture handler so components never steal the click
  useEffect(() => {
    if (!isPlacing) return;
    placementHandledRef.current = false;
    const handleGlobalPointerDown = (e: PointerEvent) => {
      if (!isPlacing || placementHandledRef.current) return;
      placementHandledRef.current = true;
      e.preventDefault();
      e.stopPropagation();
      placeAtClientPoint(e.clientX, e.clientY);
    };
    document.addEventListener('pointerdown', handleGlobalPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handleGlobalPointerDown, true);
    };
  }, [isPlacing, placeAtClientPoint]);

  // Submit a placement-pinned comment
  const submitPlacementComment = async () => {
    if (!placementBody.trim() || !placementPos || submitting) return;
    setSubmitting(true);

    const anchor: CommentAnchor = {
      type: 'region',
      slideId,
      rect: { x: placementPos.x, y: placementPos.y, width: 0, height: 0 },
    };

    try {
      const { thread } = await CommentsService.create(deckId, {
        slideId,
        anchor,
        body: placementBody,
        mentions: quickMentionHook.mentions,
      });
      setRawThreads(prev => [thread, ...prev]);
      setPlacementBody('');
      quickMentionHook.clearMentions();
      toast({ title: 'Comment pinned' });
      // Delay clearing placement pin so the thread-based pin can appear first
      setTimeout(() => setPlacementPos(null), 100);
    } catch (e: any) {
      toast({ title: 'Failed to add comment', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const createComment = async () => {
    if (!quickBody.trim() || submitting) return;
    setSubmitting(true);
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
    } finally {
      setSubmitting(false);
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

  const unresolvedThreads = threads.filter(t => t && !t.resolved);

  return (
    <div
      className={`absolute inset-0 z-[60000] ${isPlacing ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'}`}
      onClick={isPlacing ? handlePlacementMouseClick : undefined}
      onPointerDown={isPlacing ? handlePlacementPointerDown : undefined}
    >
      {/* Placement mode hint */}
      {isPlacing && (
        <div className="absolute inset-0 bg-black/5 dark:bg-white/5 flex items-center justify-center pointer-events-none z-10">
          <div className="bg-background/90 text-foreground text-xs px-4 py-2 rounded-lg shadow-lg backdrop-blur-sm border">
            Click anywhere to pin a comment
          </div>
        </div>
      )}

      {/* Placement pin + composer */}
      {placementPos && !isPlacing && (
        <div
          className="absolute pointer-events-auto z-[60001]"
          style={{
            left: `${placementPos.x * 100}%`,
            top: `${placementPos.y * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <Popover open onOpenChange={(o) => { if (!o) { setPlacementPos(null); setPlacementBody(''); } }}>
            <PopoverTrigger asChild>
              <button className="h-7 w-7 rounded-full bg-[#FF4301] text-white flex items-center justify-center shadow-md ring-2 ring-white dark:ring-gray-800">
                <MessageSquare size={13} />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" side="bottom" align="start" onPointerDownOutside={(e) => e.preventDefault()}>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">New pinned comment</p>
                <Textarea
                  value={placementBody}
                  onChange={e => quickMentionHook.handleTextChange(e.target.value, setPlacementBody)}
                  placeholder="Add a comment..."
                  className="h-20 text-xs"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      submitPlacementComment();
                    }
                  }}
                />
                {!!quickMentionHook.mentionQuery && quickMentionHook.mentionList.length > 0 && (
                  <div className="border rounded p-1 max-h-28 overflow-auto bg-popover">
                    {quickMentionHook.mentionList.map(m => {
                      const name = m.name || m.email.split('@')[0];
                      const colors = colorForUser(m.user_id);
                      return (
                        <button
                          key={m.user_id}
                          className="w-full text-left text-xs px-2 py-1 hover:bg-accent rounded flex items-center gap-2"
                          onClick={() => quickMentionHook.pickMention(m.user_id, m.email, placementBody, setPlacementBody)}
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
                <div className="flex justify-end gap-2">
                  <Button size="xs" variant="ghost" className="h-7 text-xs" onClick={() => { setPlacementPos(null); setPlacementBody(''); }}>
                    Cancel
                  </Button>
                  <Button size="xs" className="h-7 text-xs" onClick={submitPlacementComment} disabled={!placementBody.trim() || submitting}>
                    {submitting ? <Loader2 size={12} className="animate-spin" /> : 'Pin comment'}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Comment pins */}
      {unresolvedThreads.map((t) => {
        const style = pinPositions.get(t.id);
        if (!style) return null;
        const replyCount = (t.comments?.length || 1) - 1;

        return (
          <div key={t.id} className="absolute pointer-events-auto z-[60001]" style={style}>
            <Popover open={openThreadId === t.id} onOpenChange={(o) => setOpenThreadId(o ? t.id : null)}>
              <PopoverTrigger asChild>
                <button className="pointer-events-auto relative h-7 w-7 rounded-full bg-[#FF4301] text-white flex items-center justify-center shadow-md ring-2 ring-white dark:ring-gray-800 hover:scale-110 transition-transform">
                  <MessageSquare size={13} />
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
                  <Button size="xs" className="h-7" onClick={() => { createComment(); setQuickOpen(false); }} disabled={!quickBody.trim() || submitting}>Comment</Button>
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
