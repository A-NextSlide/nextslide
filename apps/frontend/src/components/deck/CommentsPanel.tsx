import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CommentsService } from '@/services/CommentsService';
import { useEditorStore } from '@/stores/editorStore';
import { AtSign, X } from 'lucide-react';
import type { CommentThread, CommentAnchor, Comment } from '@/types/Comments';

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

interface CommentsPanelProps {
  deckId: string;
  slideId: string;
  getCollaborators: () => Promise<any[]>;
  onClose?: () => void;
}

export const CommentsPanel: React.FC<CommentsPanelProps> = ({ deckId, slideId, getCollaborators, onClose }) => {
  const [body, setBody] = useState('');
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [mentionList, setMentionList] = useState<any[]>([]);
  const [collaboratorMap, setCollaboratorMap] = useState<Map<string, string>>(new Map());

  // Extended comment type to include thread info
  interface ExtendedComment extends Comment {
    threadId: string;
    threadResolved: boolean;
    anchor?: CommentAnchor | null;
  }
  
  const [comments, setComments] = useState<ExtendedComment[]>([]);

  const selectedComponentIds = useEditorStore(state => state.selectedComponentIds);
  const allSelectedIds = selectedComponentIds || new Set();
  const selectedComponent = React.useMemo(() => {
    if (!selectedComponentIds || selectedComponentIds.size === 0) return undefined;
    try {
      const arr = typeof selectedComponentIds.values === 'function' ? Array.from(selectedComponentIds.values()) : Array.from(selectedComponentIds as any);
      return arr[0];
    } catch { return undefined; }
  }, [selectedComponentIds]);

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

  // Separate raw threads from enriched comments
  const [rawThreads, setRawThreads] = useState<CommentThread[]>([]);
  
  const refresh = React.useCallback(async () => {
    try {
      const threads = await CommentsService.list(deckId, { slideId });
      setRawThreads(threads || []);
    } catch (err) {
      console.error('Failed to load comments:', err);
      setRawThreads([]);
    }
  }, [deckId, slideId]);

  // Enrich comments with author names when collaboratorMap or rawThreads change
  useEffect(() => {
    const allComments: ExtendedComment[] = [];
    
    rawThreads.forEach(t => {
      (t.comments || []).forEach(c => {
        allComments.push({
          ...c,
          authorName: collaboratorMap.get(c.authorId) || c.authorName || c.authorId?.split('@')[0] || 'User',
          threadId: t.id,
          threadResolved: t.resolved || false,
          anchor: t.anchor
        });
      });
    });
    
    // Sort by creation date, newest first
    allComments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    setComments(allComments);
  }, [rawThreads, collaboratorMap]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Listen for new comments to refresh immediately across views
  useEffect(() => {
    const onCreated = () => refresh();
    window.addEventListener('comments:created', onCreated);
    return () => window.removeEventListener('comments:created', onCreated);
  }, [refresh]);

  const refreshMentions = async (query: string) => {
    try {
      if (!getCollaborators) return setMentionList([]);
      const list = await getCollaborators();
      const filtered = query 
        ? list.filter(c => c.email.toLowerCase().includes(query.toLowerCase()))
        : list;
      setMentionList(filtered);
    } catch (e) {
      console.error('Failed to load mentions:', e);
      setMentionList([]);
    }
  };

  const onBodyChange = (text: string) => {
    setBody(text);
    const lastAt = text.lastIndexOf('@');
    if (lastAt >= 0 && (lastAt === text.length - 1 || text.charAt(lastAt + 1) !== ' ')) {
      const query = text.slice(lastAt + 1);
      setMentionQuery(query);
      refreshMentions(query);
    } else {
      setMentionQuery('');
      setMentionList([]);
    }
  };

  const pickMention = (userId: string, email: string) => {
    const lastAt = body.lastIndexOf('@');
    if (lastAt >= 0) {
      const beforeAt = body.slice(0, lastAt);
      const username = email.split('@')[0];
      setBody(`${beforeAt}@${username} `);
      setMentions([...mentions, userId]);
      setMentionQuery('');
      setMentionList([]);
    }
  };

  const addForSelected = async () => {
    if (!body.trim() || allSelectedIds.size === 0) return;
    
    let anchor: CommentAnchor | undefined = undefined;
    const selectedArray = Array.from(allSelectedIds);
    
    if (selectedArray.length === 1) {
      // Single component
      anchor = { type: 'component', slideId, componentId: selectedArray[0] };
    } else {
      // Multiple components - use component_group
      anchor = { type: 'component_group' as any, slideId, componentIds: selectedArray } as any;
    }
    
    try {
      await CommentsService.create(deckId, { 
        slideId, 
        anchor,
        body, 
        mentions 
      });
      setBody('');
      setMentions([]);
      refresh();
    } catch (err: any) {
      console.error('Failed to create comment:', err);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 flex items-center justify-between p-2 border-b bg-background z-10">
        <h3 className="text-sm font-medium">Comments</h3>
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
      <div className="p-2 space-y-2 overflow-y-auto flex-1">
        {(!comments || comments.length === 0) && (
          <div className="text-[11px] text-muted-foreground border rounded p-2">
            Select a component and press "Add for selected" or click "Start region" to draw an area.
          </div>
        )}
        {comments.map((c) => (
          <div 
            key={c.id} 
            className="border rounded p-2 cursor-pointer transition-colors"
            style={colorForUser(c.authorId || c.authorName || '')}
            onClick={() => {
              // Open the bubble for this thread on the canvas
              try { window.dispatchEvent(new CustomEvent('comments:show')); } catch {}
              try { window.dispatchEvent(new CustomEvent('comments:open-thread', { detail: { threadId: c.threadId } })); } catch {}
              try { window.dispatchEvent(new CustomEvent('editor:force-edit-mode')); } catch {}
              // Highlight the commented area
              const anchor = c.anchor;
              const editorStore = useEditorStore.getState();
              
              if (anchor && anchor.type === 'component' && anchor.componentId) {
                // Single component
                editorStore.clearSelection();
                editorStore.selectComponent(anchor.componentId);
              } else if (anchor && (anchor as any).type === 'component_group' && (anchor as any).componentIds) {
                // Multiple components
                editorStore.clearSelection();
                editorStore.selectComponents((anchor as any).componentIds);
              } else if (anchor && anchor.type === 'region' && anchor.rect) {
                // For regions, we'll dispatch an event to show a highlight overlay
                window.dispatchEvent(new CustomEvent('comments:highlight-region', { 
                  detail: { rect: anchor.rect } 
                }));
              }
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] font-medium">{c.authorName}</div>
              <div className="flex items-center gap-1">
                <Badge variant={c.threadResolved ? 'secondary' : 'default'} className="text-[9px] h-4">{c.threadResolved ? 'Resolved' : 'Open'}</Badge>
                <Button 
                  size="xs" 
                  variant="ghost" 
                  className="h-5 px-1 text-[9px]"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      // Optimistically update UI
                      setRawThreads(prev => prev.map(thread => 
                        thread.id === c.threadId ? { ...thread, resolved: !c.threadResolved } : thread
                      ));
                      
                      await CommentsService.resolveThread(deckId, c.threadId, !c.threadResolved);
                      // Don't refresh immediately - let optimistic update persist
                    } catch (err: any) {
                      // Revert on error
                      refresh();
                      console.error('Failed to update thread:', err);
                    }
                  }}
                >
                  {c.threadResolved ? 'Reopen' : 'Resolve'}
                </Button>
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground whitespace-pre-wrap">
              {c.body}
            </div>
          </div>
        ))}
      </div>
      <div className="p-2 border-t space-y-1.5">
        <Textarea
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder="Comment or add others with @"
          className="h-16 text-[12px]"
        />
        {!!mentionList.length && (
          <div className="border rounded p-1 max-h-24 overflow-auto">
            {mentionList.map(m => (
              <button
                key={m.user_id}
                className="w-full text-left text-[11px] px-2 py-1 hover:bg-accent rounded"
                onClick={() => pickMention(m.user_id, m.email)}
              >
                <AtSign size={10} className="inline mr-1" />
                {m.email}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 gap-1">
          <Button
            size="xs"
            className="h-7 text-[11px]"
            onClick={addForSelected}
            disabled={allSelectedIds.size === 0}
          >
            Add for selected {allSelectedIds.size > 0 && `(${allSelectedIds.size})`}
          </Button>
        </div>
      </div>
    </div>
  );
};