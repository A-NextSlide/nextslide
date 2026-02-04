import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { CommentsService } from '@/services/CommentsService';
import { useEditorStore } from '@/stores/editorStore';
import { AtSign, X, MessageSquare, MoreHorizontal, ChevronDown, Check, RotateCcw, Send, Eye, EyeOff, Loader2, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CommentAnchor, CommentEntity, CommentFilterTab, EnrichedCommentThread } from '@/types/Comments';
import {
  useCollaboratorMap,
  useCommentThreads,
  useEnrichedThreads,
  useMentions,
  useCurrentUserId,
  colorForUser,
  getInitials,
  formatRelativeTime,
} from '@/hooks/useComments';

interface CommentsPanelProps {
  deckId: string;
  slideId: string;
  getCollaborators: () => Promise<any[]>;
  onClose?: () => void;
}

// ─── Mention Picker ──────────────────────────────────────────────────────────
const MentionPicker: React.FC<{
  mentionList: Array<{ user_id: string; email: string; name?: string }>;
  onPick: (userId: string, email: string) => void;
}> = ({ mentionList, onPick }) => {
  if (!mentionList.length) return null;
  return (
    <div className="border rounded-lg p-1 max-h-28 overflow-auto bg-popover shadow-md">
      {mentionList.map(m => {
        const name = m.name || m.email.split('@')[0];
        const colors = colorForUser(m.user_id);
        return (
          <button
            key={m.user_id}
            className="w-full text-left text-xs px-2 py-1.5 hover:bg-accent rounded flex items-center gap-2"
            onClick={() => onPick(m.user_id, m.email)}
          >
            <span
              className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-medium shrink-0"
              style={colors}
            >
              {getInitials(name)}
            </span>
            <span className="font-medium truncate">{name}</span>
            <span className="text-muted-foreground truncate ml-auto">{m.email}</span>
          </button>
        );
      })}
    </div>
  );
};

// ─── Comment Avatar ──────────────────────────────────────────────────────────
const CommentAvatar: React.FC<{ authorId: string; authorName: string; size?: 'sm' | 'md' }> = ({ authorId, authorName, size = 'md' }) => {
  const colors = colorForUser(authorId);
  const sizeClass = size === 'sm' ? 'h-6 w-6 text-[9px]' : 'h-7 w-7 text-[10px]';
  return (
    <Avatar className={`${sizeClass} shrink-0`}>
      <AvatarFallback style={colors} className="font-medium">
        {getInitials(authorName)}
      </AvatarFallback>
    </Avatar>
  );
};

// ─── Comment Bubble (reply) ──────────────────────────────────────────────────
const CommentBubble: React.FC<{
  comment: CommentEntity;
  currentUserId: string | null;
  deckId: string;
  onEdited: () => void;
}> = ({ comment, currentUserId, deckId, onEdited }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const isOwn = currentUserId === comment.authorId;

  const handleSave = async () => {
    if (!editBody.trim() || editBody === comment.body) {
      setIsEditing(false);
      return;
    }
    try {
      await CommentsService.update(deckId, comment.id, editBody);
      setIsEditing(false);
      onEdited();
    } catch (err) {
      console.error('Failed to edit comment:', err);
    }
  };

  const handleDelete = async () => {
    try {
      await CommentsService.remove(deckId, comment.id);
      onEdited();
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  return (
    <div className="flex gap-2 py-1.5">
      <CommentAvatar authorId={comment.authorId} authorName={comment.authorName || ''} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium truncate">{comment.authorName || 'User'}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">{formatRelativeTime(comment.createdAt)}</span>
          {isOwn && !isEditing && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="ml-auto h-5 w-5 flex items-center justify-center rounded hover:bg-accent opacity-0 group-hover/bubble:opacity-100 transition-opacity">
                  <MoreHorizontal size={12} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32">
                <DropdownMenuItem onClick={() => { setEditBody(comment.body); setIsEditing(true); }}>
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => setShowDeleteDialog(true)}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {isEditing ? (
          <div className="mt-1 space-y-1">
            <Textarea
              value={editBody}
              onChange={e => setEditBody(e.target.value)}
              className="h-14 text-xs"
              autoFocus
            />
            <div className="flex gap-1 justify-end">
              <Button size="xs" variant="ghost" className="h-6 text-[10px]" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button size="xs" className="h-6 text-[10px]" onClick={handleSave}>Save</Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-0.5 break-words">{comment.body}</p>
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
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ─── Reply Composer (inline) ─────────────────────────────────────────────────
const ReplyComposer: React.FC<{
  deckId: string;
  threadId: string;
  slideId: string;
  getCollaborators: () => Promise<any[]>;
  onReplied: () => void;
}> = ({ deckId, threadId, slideId, getCollaborators, onReplied }) => {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const mentionHook = useMentions(getCollaborators);

  const handleSubmit = async () => {
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    try {
      await CommentsService.create(deckId, {
        slideId,
        threadId,
        body,
        mentions: mentionHook.mentions,
      } as any);
      setBody('');
      mentionHook.clearMentions();
      onReplied();
    } catch (err) {
      console.error('Failed to reply:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pt-1.5 space-y-1">
      <div className="flex gap-1.5">
        <Textarea
          value={body}
          onChange={e => mentionHook.handleTextChange(e.target.value, setBody)}
          placeholder="Reply..."
          className="h-10 text-xs flex-1 min-h-[40px] resize-none rounded-md border border-border/70 bg-background/80 shadow-sm focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary/50"
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <Button size="xs" className="h-10 w-10 p-0 shrink-0 rounded-md shadow-sm" onClick={handleSubmit} disabled={!body.trim() || submitting}>
          <Send size={14} />
        </Button>
      </div>
      <MentionPicker
        mentionList={mentionHook.mentionList}
        onPick={(userId, email) => mentionHook.pickMention(userId, email, body, setBody)}
      />
    </div>
  );
};

// ─── Thread Card ─────────────────────────────────────────────────────────────
const CommentThreadCard: React.FC<{
  thread: EnrichedCommentThread;
  currentUserId: string | null;
  deckId: string;
  slideId: string;
  getCollaborators: () => Promise<any[]>;
  onResolveToggle: (threadId: string, resolved: boolean) => void;
  onRefresh: () => void;
}> = ({ thread, currentUserId, deckId, slideId, getCollaborators, onResolveToggle, onRefresh }) => {
  const [isOpen, setIsOpen] = useState(false);
  const root = thread.rootComment;
  const replies = thread.comments.slice(1);
  const isOwnRoot = currentUserId === root.authorId;
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(root.body);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleSaveRoot = async () => {
    if (!editBody.trim() || editBody === root.body) {
      setIsEditing(false);
      return;
    }
    try {
      await CommentsService.update(deckId, root.id, editBody);
      setIsEditing(false);
      onRefresh();
    } catch (err) {
      console.error('Failed to edit comment:', err);
    }
  };

  const handleDeleteRoot = async () => {
    try {
      await CommentsService.remove(deckId, root.id);
      onRefresh();
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  const handleClickThread = () => {
    // Navigate canvas to the commented component
    try { window.dispatchEvent(new CustomEvent('comments:show')); } catch {}
    try { window.dispatchEvent(new CustomEvent('comments:open-thread', { detail: { threadId: thread.id } })); } catch {}
    try { window.dispatchEvent(new CustomEvent('editor:force-edit-mode')); } catch {}

    const anchor = thread.anchor;
    const editorStore = useEditorStore.getState();

    if (anchor?.type === 'component' && anchor.componentId) {
      editorStore.clearSelection();
      editorStore.selectComponent(anchor.componentId);
    } else if (anchor?.type === 'component_group' && (anchor as any).componentIds) {
      editorStore.clearSelection();
      editorStore.selectComponents((anchor as any).componentIds);
    } else if (anchor?.type === 'region' && anchor.rect) {
      window.dispatchEvent(new CustomEvent('comments:highlight-region', { detail: { rect: anchor.rect } }));
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15 }}
      className={`border rounded-lg p-3 cursor-pointer transition-colors hover:border-foreground/20 ${thread.resolved ? 'opacity-60' : ''}`}
      onClick={handleClickThread}
    >
      {/* Root comment header */}
      <div className="flex items-start gap-2">
        <CommentAvatar authorId={root.authorId} authorName={root.authorName || ''} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold truncate">{root.authorName || 'User'}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">{formatRelativeTime(root.createdAt)}</span>

            {/* Three-dot menu for own root comment */}
            <div className="ml-auto flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
              {isOwnRoot && !isEditing && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent">
                      <MoreHorizontal size={14} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-32">
                    <DropdownMenuItem onClick={() => { setEditBody(root.body); setIsEditing(true); }}>
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => setShowDeleteDialog(true)}>
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Root body */}
          {isEditing ? (
            <div className="mt-1.5 space-y-1" onClick={e => e.stopPropagation()}>
              <Textarea
                value={editBody}
                onChange={e => setEditBody(e.target.value)}
                className="h-16 text-xs"
                autoFocus
              />
              <div className="flex gap-1 justify-end">
                <Button size="xs" variant="ghost" className="h-6 text-[10px]" onClick={() => setIsEditing(false)}>Cancel</Button>
                <Button size="xs" className="h-6 text-[10px]" onClick={handleSaveRoot}>Save</Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-foreground/80 whitespace-pre-wrap mt-1 break-words leading-relaxed">{root.body}</p>
          )}
        </div>
      </div>

      {/* Action row: resolve + reply toggle */}
      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-border/50" onClick={e => e.stopPropagation()}>
        <Button
          size="xs"
          variant="ghost"
          className={`h-6 text-[10px] gap-1 ${thread.resolved ? 'text-muted-foreground' : 'text-green-600 dark:text-green-400'}`}
          onClick={() => onResolveToggle(thread.id, !thread.resolved)}
        >
          {thread.resolved ? (
            <><RotateCcw size={11} /> Reopen</>
          ) : (
            <><Check size={11} /> Resolve</>
          )}
        </Button>

        <button
          className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          onClick={() => setIsOpen(v => !v)}
        >
          {replies.length > 0
            ? <>{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</>
            : <>Reply</>
          }
          <ChevronDown size={10} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Replies + composer (collapsible) */}
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleContent onClick={e => e.stopPropagation()}>
          {replies.length > 0 && (
            <div className="ml-4 mt-1 border-l-2 border-border/50 pl-3 space-y-0">
              {replies.map(reply => (
                <div key={reply.id} className="group/bubble">
                  <CommentBubble
                    comment={reply}
                    currentUserId={currentUserId}
                    deckId={deckId}
                    onEdited={onRefresh}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="mt-2">
            <ReplyComposer
              deckId={deckId}
              threadId={thread.id}
              slideId={slideId}
              getCollaborators={getCollaborators}
              onReplied={onRefresh}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Delete confirmation - hoisted to top level */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete comment?</AlertDialogTitle>
            <AlertDialogDescription>This will delete the entire thread and all replies. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRoot}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
};

// ─── Main Panel ──────────────────────────────────────────────────────────────
export const CommentsPanel: React.FC<CommentsPanelProps> = ({ deckId, slideId, getCollaborators, onClose }) => {
  const [newBody, setNewBody] = useState('');
  const [filterTab, setFilterTab] = useState<CommentFilterTab>('all');
  const [submitting, setSubmitting] = useState(false);
  const [pinsVisible, setPinsVisible] = useState(true);

  const selectedComponentIds = useEditorStore(state => state.selectedComponentIds);
  const allSelectedIds = selectedComponentIds || new Set();

  const currentUserId = useCurrentUserId();
  const collaboratorMap = useCollaboratorMap(getCollaborators);
  const { threads: rawThreads, refresh, setThreads: setRawThreads } = useCommentThreads(deckId, slideId);
  const enrichedThreads = useEnrichedThreads(rawThreads, collaboratorMap);
  const mentionHook = useMentions(getCollaborators);

  // Filter threads based on active tab
  const filteredThreads = useMemo(() => {
    if (filterTab === 'open') return enrichedThreads.filter(t => !t.resolved);
    if (filterTab === 'resolved') return enrichedThreads.filter(t => t.resolved);
    return enrichedThreads;
  }, [enrichedThreads, filterTab]);

  // Counts for tab badges
  const openCount = useMemo(() => enrichedThreads.filter(t => !t.resolved).length, [enrichedThreads]);
  const resolvedCount = useMemo(() => enrichedThreads.filter(t => t.resolved).length, [enrichedThreads]);

  const handleResolveToggle = useCallback(async (threadId: string, resolved: boolean) => {
    // Optimistic update
    setRawThreads(prev => prev.map(t => t.id === threadId ? { ...t, resolved } : t));
    try {
      await CommentsService.resolveThread(deckId, threadId, resolved);
    } catch {
      refresh();
    }
  }, [deckId, refresh, setRawThreads]);

  const handleNewComment = async () => {
    if (!newBody.trim() || submitting) return;
    setSubmitting(true);

    let anchor: CommentAnchor | undefined;
    const selectedArray = Array.from(allSelectedIds);
    if (selectedArray.length === 1) {
      anchor = { type: 'component', slideId, componentId: selectedArray[0] };
    } else if (selectedArray.length > 1) {
      anchor = { type: 'component_group', slideId, componentIds: selectedArray };
    }

    try {
      await CommentsService.create(deckId, { slideId, anchor, body: newBody, mentions: mentionHook.mentions });
      setNewBody('');
      mentionHook.clearMentions();
      refresh();
    } catch (err) {
      console.error('Failed to create comment:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const togglePins = useCallback(() => {
    const next = !pinsVisible;
    setPinsVisible(next);
    try {
      window.dispatchEvent(new CustomEvent(next ? 'comments:show' : 'comments:hide'));
    } catch {}
  }, [pinsVisible]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 border-b bg-background z-10">
        <div className="flex items-center justify-between px-3 py-2">
          <h3 className="text-sm font-semibold">Comments</h3>
          <div className="flex items-center gap-1">
            <button
              className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-accent"
              aria-label="Pin comment to slide"
              title="Pin comment to slide"
              onClick={() => {
                try { window.dispatchEvent(new CustomEvent('comments:start-placing')); } catch {}
              }}
            >
              <MapPin size={13} />
            </button>
            <button
              className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-accent"
              aria-label={pinsVisible ? 'Hide pins on slide' : 'Show pins on slide'}
              title={pinsVisible ? 'Hide pins on slide' : 'Show pins on slide'}
              onClick={togglePins}
            >
              {pinsVisible ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
            <button
              className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-accent"
              aria-label="Close comments"
              onClick={() => {
                if (onClose) onClose();
                else try { window.dispatchEvent(new CustomEvent('comments:close-panel')); } catch {}
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="px-3 pb-2">
          <Tabs value={filterTab} onValueChange={v => setFilterTab(v as CommentFilterTab)}>
            <TabsList className="h-7 w-full">
              <TabsTrigger value="all" className="text-[10px] h-6 flex-1">
                All {enrichedThreads.length > 0 && <span className="ml-1 text-muted-foreground">({enrichedThreads.length})</span>}
              </TabsTrigger>
              <TabsTrigger value="open" className="text-[10px] h-6 flex-1">
                Open {openCount > 0 && <span className="ml-1 text-muted-foreground">({openCount})</span>}
              </TabsTrigger>
              <TabsTrigger value="resolved" className="text-[10px] h-6 flex-1">
                Resolved {resolvedCount > 0 && <span className="ml-1 text-muted-foreground">({resolvedCount})</span>}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Thread list */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          <AnimatePresence mode="popLayout">
            {filteredThreads.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-10 text-center"
              >
                <MessageSquare size={28} className="text-muted-foreground/40 mb-2" />
                <p className="text-xs font-medium text-muted-foreground">No comments yet</p>
                <p className="text-[10px] text-muted-foreground/70 mt-1">
                  Select a component and add a comment below,<br />
                  or press <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">Ctrl+Shift+C</kbd> to toggle this panel.
                </p>
              </motion.div>
            ) : (
              filteredThreads.map(thread => (
                <CommentThreadCard
                  key={thread.id}
                  thread={thread}
                  currentUserId={currentUserId}
                  deckId={deckId}
                  slideId={slideId}
                  getCollaborators={getCollaborators}
                  onResolveToggle={handleResolveToggle}
                  onRefresh={refresh}
                />
              ))
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* New Thread Composer */}
      <div className="border-t bg-background p-2 space-y-1.5">
        <Textarea
          value={newBody}
          onChange={e => mentionHook.handleTextChange(e.target.value, setNewBody)}
          placeholder="Add a comment... Use @ to mention"
          className="h-16 text-xs resize-none"
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleNewComment();
            }
          }}
        />
        <MentionPicker
          mentionList={mentionHook.mentionList}
          onPick={(userId, email) => mentionHook.pickMention(userId, email, newBody, setNewBody)}
        />
        <Button
          size="xs"
          className="h-7 text-[11px] w-full"
          onClick={handleNewComment}
          disabled={!newBody.trim() || submitting}
        >
          {submitting ? (
            <><Loader2 size={12} className="animate-spin mr-1" /> Sending...</>
          ) : allSelectedIds.size > 0
            ? `Comment on ${allSelectedIds.size} selected`
            : 'Add comment'}
        </Button>
      </div>
    </div>
  );
};
