import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Check, Reply, X, AtSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { CommentsService } from '@/services/CommentsService';
import type { CommentThread, CommentAnchor, NormalizedRect } from '@/types/Comments';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { useEditorStore } from '@/stores/editorStore';

// Deterministic per-user shading based on author identifier
const colorForUser = (idOrName: string) => {
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
};

interface CommentPinsOverlayProps {
  deckId: string;
  slideId: string;
  containerRef: React.RefObject<HTMLDivElement>; // scrollable slide container
  zoomLevel?: number; // percent
  getCollaborators?: () => Promise<Array<{ user_id: string; email: string; role?: string }>>;
}

export const CommentPinsOverlay: React.FC<CommentPinsOverlayProps> = ({ deckId, slideId, containerRef, zoomLevel = 100, getCollaborators }) => {
  const { toast } = useToast();
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [newBody, setNewBody] = useState('');
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionList, setMentionList] = useState<Array<{ user_id: string; email: string }>>([]);
  const [mentions, setMentions] = useState<string[]>([]);
  const [visible, setVisible] = useState<boolean>(true);
  const [quickOpen, setQuickOpen] = useState<boolean>(false);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [collaboratorMap, setCollaboratorMap] = useState<Map<string, string>>(new Map());
  const [highlightedRegion, setHighlightedRegion] = useState<NormalizedRect | null>(null);
  const [highlightedComponents, setHighlightedComponents] = useState<string[]>([]);

  // Load collaborators for name mapping
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
      } catch {}
      
      // Add collaborators
      if (getCollaborators) {
        try {
          const list = await getCollaborators();
          list.forEach(c => {
            // Use full_name if available, otherwise email prefix
            const name = (c as any).full_name || (c as any).name || c.email.split('@')[0];
            map.set(c.user_id, name);
          });
        } catch {}
      }
      
      setCollaboratorMap(map);
    };
    
    loadCollaborators();
  }, [getCollaborators]);

  // Separate raw threads from enriched threads
  const [rawThreads, setRawThreads] = useState<CommentThread[]>([]);
  
  const refreshThreads = React.useCallback(async () => {
    try {
      const ts = await CommentsService.list(deckId, { slideId, status: 'open' });
      setRawThreads(ts || []);
      if (ts && ts.length > 0) setVisible(true);
    } catch (err) {
      toast({ title: 'Failed to load comments', description: String(err), variant: 'destructive' });
    }
  }, [deckId, slideId, toast]);

  // Only refresh on mount and when slideId changes
  useEffect(() => {
    refreshThreads();
  }, [refreshThreads]);
  
  // Enrich threads with author names when collaboratorMap or rawThreads change
  useEffect(() => {
    const enriched = rawThreads.map(t => ({ 
      ...t, 
      comments: Array.isArray(t.comments) ? t.comments.map(c => ({
        ...c,
        authorName: collaboratorMap.get(c.authorId) || c.authorName || c.authorId?.split('@')[0] || 'User'
      })) : [] 
    }));
    setThreads(enriched);
  }, [rawThreads, collaboratorMap]);

  // Listen for comment creation events to refresh
  useEffect(() => {
    const handleCommentCreated = () => refreshThreads();
    window.addEventListener('comments:created', handleCommentCreated);
    return () => window.removeEventListener('comments:created', handleCommentCreated);
  }, [refreshThreads]);

  // Listen for requests to open a specific thread bubble from the comments panel
  useEffect(() => {
    const handleOpenThread = (e: any) => {
      try {
        const id = e?.detail?.threadId;
        if (id) {
          setVisible(true);
          setOpenThreadId(id);
          // Ensure edit mode is available to type easily
          try { window.dispatchEvent(new CustomEvent('editor:force-edit-mode')); } catch {}
        }
      } catch {}
    };
    window.addEventListener('comments:open-thread', handleOpenThread as any);
    return () => window.removeEventListener('comments:open-thread', handleOpenThread as any);
  }, []);

  const denorm = (rect: NormalizedRect, container: DOMRect) => ({
    left: rect.x * container.width,
    top: rect.y * container.height,
    width: rect.width * container.width,
    height: rect.height * container.height
  });

  // Removed region drawing - now using multi-select instead

  const createComment = async () => {
    if (!newBody.trim()) return;
    let anchor: CommentAnchor | undefined = undefined;
    // Get selected components
    try {
      const selected = useEditorStore.getState().selectedComponentIds;
      const selectedArray = Array.from(selected || []);
      
      if (selectedArray.length === 1) {
        // Single component
        anchor = { type: 'component', slideId, componentId: selectedArray[0] };
      } else if (selectedArray.length > 1) {
        // Multiple components
        anchor = { type: 'component_group' as any, slideId, componentIds: selectedArray } as any;
      }
    } catch {}
    try {
      const { thread } = await CommentsService.create(deckId, { slideId, anchor, body: newBody, mentions });
      setThreads(prev => [thread, ...prev]);
      setNewBody('');
      setMentions([]);
      toast({ title: 'Comment added' });
    } catch (e: any) {
      toast({ title: 'Failed to add comment', description: e.message, variant: 'destructive' });
    }
  };

  const handleResolve = async (threadId: string, resolved: boolean) => {
    try {
      // Optimistically update UI
      setRawThreads(prev => prev.map(t => 
        t.id === threadId ? { ...t, resolved } : t
      ));
      
      await CommentsService.resolveThread(deckId, threadId, resolved);
      // Don't refresh immediately - let optimistic update persist
    } catch (e: any) {
      // Revert on error
      refreshThreads();
      console.error('Failed to update thread:', e);
    }
  };

  const refreshMentions = async (query: string) => {
    try {
      if (!getCollaborators) return setMentionList([]);
      const list = await getCollaborators();
      const q = (query || '').toLowerCase();
      const filtered = q ? list.filter(c => c.email.toLowerCase().includes(q)) : list;
      setMentionList(filtered);
    } catch {
      setMentionList([]);
    }
  };

  const onBodyChange = (val: string) => {
    setNewBody(val);
    const m = val.match(/@([A-Za-z0-9_.+-]*)$/);
    if (m) {
      const q = m[1] || '';
      setMentionQuery(q);
      // If only '@' typed, show full list
      refreshMentions(q);
      if (q === '') refreshMentions('');
    } else {
      setMentionQuery('');
      setMentionList([]);
    }
  };

  const pickMention = (userId: string, email: string) => {
    setMentions(prev => Array.from(new Set([...prev, userId])));
    // Allow tagging self too by not filtering out current user
    setNewBody(prev => prev.replace(/@([A-Za-z0-9_.+-]*)$/, `@${email} `));
    setMentionQuery('');
    setMentionList([]);
  };

  // Global controls from header
  useEffect(() => {
    const toggle = () => setVisible(v => !v);
    const show = () => setVisible(true);
    const hide = () => setVisible(false);
    const add = () => { setIsPlacing(true); setVisible(true); };
    const quick = () => { setQuickOpen(true); setVisible(true); };
    const startEdit = () => { try { window.dispatchEvent(new CustomEvent('editor:force-edit-mode')); } catch {} };
    const highlightRegion = (e: any) => {
      const rect = e.detail?.rect;
      if (rect) {
        setHighlightedRegion(rect);
        // Clear highlight after 2 seconds
        setTimeout(() => setHighlightedRegion(null), 2000);
      }
    };
    window.addEventListener('comments:toggle-visibility', toggle as any);
    window.addEventListener('comments:show', show as any);
    window.addEventListener('comments:hide', hide as any);
    window.addEventListener('comments:new', add as any);
    window.addEventListener('comments:quick', quick as any);
    window.addEventListener('comments:enter-edit', startEdit as any);
    window.addEventListener('comments:highlight-region', highlightRegion as any);
    return () => {
      window.removeEventListener('comments:toggle-visibility', toggle as any);
      window.removeEventListener('comments:show', show as any);
      window.removeEventListener('comments:hide', hide as any);
      window.removeEventListener('comments:new', add as any);
      window.removeEventListener('comments:quick', quick as any);
      window.removeEventListener('comments:enter-edit', startEdit as any);
      window.removeEventListener('comments:highlight-region', highlightRegion as any);
    };
  }, []);

  if (!visible) return null;

  const slideContainer = typeof document !== 'undefined' ? document.getElementById('slide-display-container') : null;
  if (!slideContainer) return null;

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* existing pins - only show unresolved */}
      {(threads || []).filter(t => t && !t.resolved).map((t) => {
        const anchor = (t as any)?.anchor;
        
        // Position based on anchor type
        let style: React.CSSProperties;
        
        if (anchor?.type === 'component' && anchor.componentId) {
          // Single component - position at top-right of component
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
          // Multiple components - position at top-right of bounding box
          const rects = (anchor as any).componentIds.map((id: string) => {
            const el = document.querySelector(`[data-component-id="${id}"]`);
            return el?.getBoundingClientRect();
          }).filter(Boolean);
          
          if (rects.length > 0) {
            const containerRect = containerRef.current?.getBoundingClientRect();
            if (containerRect) {
              const minX = Math.min(...rects.map(r => r.left));
              const minY = Math.min(...rects.map(r => r.top));
              const maxX = Math.max(...rects.map(r => r.right));
              
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
          // Region anchor - position at top-right of region
          style = {
            left: `${(anchor.rect.x + anchor.rect.width) * 100}%`,
            top: `${anchor.rect.y * 100}%`,
            transform: 'translate(-100%, 0)'
          };
        } else {
          // No anchor - position at right side of slide
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
                <button className="pointer-events-auto h-6 w-6 rounded-full bg-[#FF4301] text-white flex items-center justify-center shadow">
                  <MessageSquare size={12} />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-3" side="top" align="start">
                <div className="space-y-2">
                  <div className="flex items-center justify-end">
                    <div className="flex items-center gap-2">
                      {/* Per-thread hide all comments toggle */}
                      <Button size="xs" variant="ghost" className="h-6" onClick={() => setVisible(false)} title="Hide all comments on canvas">
                        Hide
                      </Button>
                      <Badge variant={t.resolved ? 'secondary' : 'default'} className="text-[10px] h-4">{t.resolved ? 'Resolved' : 'Open'}</Badge>
                      <Button size="xs" variant="ghost" className="h-6" onClick={() => handleResolve(t.id, !t.resolved)}>
                        {t.resolved ? 'Reopen' : 'Resolve'}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-auto">
                    {(t.comments || []).map(c => (
                      <div
                        key={c.id}
                        className="text-xs rounded border p-2"
                        style={colorForUser(c.authorId || c.authorName || '')}
                      >
                        <div className="font-medium">{c.authorName || c.authorId?.split('@')[0] || 'User'}</div>
                        <div className="text-muted-foreground whitespace-pre-wrap">{c.body}</div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Textarea value={newBody} onChange={(e) => onBodyChange(e.target.value)} placeholder="Reply… Use @ to mention" className="h-16" />
                    {!!mentionQuery && mentionList.length > 0 && (
                      <div className="border rounded p-1 max-h-28 overflow-auto">
                        {mentionList.map(m => (
                          <button key={m.user_id} className="w-full text-left text-xs px-2 py-1 hover:bg-accent rounded" onClick={() => pickMention(m.user_id, m.email)}>
                            <AtSign size={12} className="inline mr-1" /> {m.email}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button size="xs" variant="outline" className="h-7" onClick={() => setNewBody('')}>Clear</Button>
                      <Button 
                        size="xs" 
                        className="h-7" 
                        onClick={async () => {
                          if (!newBody.trim()) return;
                          try {
                            await CommentsService.create(deckId, {
                              slideId,
                              body: newBody,
                              thread_id: t.id,
                              mentions
                            });
                            setNewBody('');
                            setMentions([]);
                            // Refresh immediately to show new comment
                            await refreshThreads();
                          } catch (err: any) {
                            console.error('Failed to add reply:', err);
                          }
                        }}
                      >
                        Reply
                      </Button>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        );
      })}



      {/* highlighted region */}
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

      {/* quick composer (invoked via header event) */}
      {quickOpen && (
        <div className="absolute top-3 right-3 pointer-events-auto">
          <Popover open onOpenChange={(o) => setQuickOpen(o)}>
            <PopoverTrigger asChild>
              <span />
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3" side="bottom" align="end">
              <div className="space-y-2">
                <Textarea value={newBody} onChange={(e) => onBodyChange(e.target.value)} placeholder="Comment or add others with @" className="h-20" />
                {!!mentionList.length && (
                  <div className="border rounded p-1 max-h-28 overflow-auto">
                    {mentionList.map(m => (
                      <button key={m.user_id} className="w-full text-left text-xs px-2 py-1 hover:bg-accent rounded" onClick={() => pickMention(m.user_id, m.email)}>
                        <AtSign size={12} className="inline mr-1" /> {m.email}
                      </button>
                    ))}
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


