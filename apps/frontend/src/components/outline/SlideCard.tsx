import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { SlideOutline, TaggedMedia, DeckOutline } from '@/types/SlideTypes';
import { determineFileType } from '../../lib/fileUtils';
import {
  Microscope, Trash2, Loader2, Upload, ImageIcon, BarChart3, FileText, FileIcon, X,
  Plus, ChevronDown, ChevronsUpDown, Check, ChevronRight, Copy, Settings2, Pencil
} from 'lucide-react';
import { CHART_TYPES } from '@/registry/library/chart-properties';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { transformChartData } from '@/types/DataTransformers';
import ChartDataTable from './ChartDataTable';
import SlideChartViewer from './SlideChartViewer';
// Use the same rich text editor for consistent view/edit rendering
import OutlineRichTextEditor from './OutlineRichTextEditor';
import ImagePlaceholder from '@/components/common/ImagePlaceholder';
import CitationsPanel, { Citation } from './CitationsPanel';
import { dedupeCitations, canonicalizeCitation, deriveFootnoteLabel } from '@/utils/citations';

interface SlideCardProps {
  slide: SlideOutline;
  index: number;
  currentOutline: DeckOutline; // Needed for zIndex calculation, potentially other context
  setCurrentOutline: React.Dispatch<React.SetStateAction<DeckOutline | null>>;
  handleSlideTitleChange: (slideId: string, title: string) => void;
  handleSlideContentChange: (slideId: string, content: string) => void;
  researchingSlides: string[];
  dragOverSlideId: string | null;
  setDragOverSlideId: React.Dispatch<React.SetStateAction<string | null>>;
  tooltipHostSlideId: string | null;
  setTooltipHostSlideId: React.Dispatch<React.SetStateAction<string | null>>;
  currentTooltipAlign: 'left' | 'right';
  setCurrentTooltipAlign: React.Dispatch<React.SetStateAction<'left' | 'right'>>;
  outlineScrollRef: React.RefObject<HTMLDivElement>; // For tooltip positioning
  isProcessingMedia: boolean;
  animatingOutMediaIds: Set<string>;
  setAnimatingOutMediaIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  uploadedFiles: File[];
  // Drag and Drop handlers for the slide item itself
  handleDragStart: (slideId: string) => void;
  handleDragOver: (e: React.DragEvent, slideId: string) => void;
  handleDrop: (e: React.DragEvent, targetSlideId: string) => void;
  handleDragEnd: () => void;
  // Specific handler for files dropped ONTO this slide, if different from generic handleDrop
  // handleFilesDroppedOnSlide: (files: File[], targetSlideId: string) => Promise<void>; 
  toast: (options: any) => void;
  handleToggleDeepResearch: (slideId: string, event?: React.MouseEvent) => void;
  handleDeleteSlide: (slideId: string) => void;
  isNewSlide?: boolean; // Flag to indicate if this is a newly added slide
  isGenerating?: boolean; // Flag to indicate if this slide is currently being generated
}

const SlideCard: React.FC<SlideCardProps> = ({
  slide,
  index,
  currentOutline,
  setCurrentOutline,
  handleSlideTitleChange,
  handleSlideContentChange,
  researchingSlides,
  dragOverSlideId,
  setDragOverSlideId,
  tooltipHostSlideId,
  setTooltipHostSlideId,
  currentTooltipAlign,
  setCurrentTooltipAlign,
  outlineScrollRef,
  isProcessingMedia,
  animatingOutMediaIds,
  setAnimatingOutMediaIds,
  uploadedFiles,
  handleDragStart,
  handleDragOver,
  handleDrop,
  handleDragEnd,
  toast,
  handleToggleDeepResearch,
  handleDeleteSlide,
  isNewSlide,
  isGenerating = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(slide.content || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const citations = (slide.extractedData as any)?.metadata?.citations as Citation[] | undefined;

  const parseSourcesFromContent = (text: string): Citation[] => {
    const results: Citation[] = [];
    const pendingHostLabels = new Map<string, string>();
    const hostOnlyPattern = /^(?:https?:\/\/)?(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?$/i;
    if (!text) return results;
    const lines = text.split(/\n+/);
    const indices: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const value = (lines[i] || '').trim();
      if (/^@?sources:?$/i.test(value)) {
        indices.push(i);
      }
    }
    if (indices.length === 0) return results;
    const start = indices[indices.length - 1] + 1;
    for (let i = start; i < lines.length; i++) {
      const raw = (lines[i] || '').trim();
      if (!raw) continue;
      if (/^@?sources:?$/i.test(raw)) continue;
      if (/^edit sources in slide text or chart metadata\.?$/i.test(raw)) continue;
      let cleaned = raw.replace(/^\d+[\.)\-]\s+/, '').replace(/^[•\-*+]\s+/, '').trim();
      if (!cleaned) continue;

      const explicitMatch = cleaned.match(/https?:\/\/[^\s)]+/i);
      if (explicitMatch) {
        const urlRaw = explicitMatch[0].replace(/[)\]]+$/, '');
        const labelPart = cleaned.slice(0, explicitMatch.index).replace(/[-–—:]+$/, '').trim();
        let host = '';
        try {
          host = new URL(urlRaw).hostname.replace(/^www\./i, '');
        } catch {}
        const pendingLabel = host ? pendingHostLabels.get(host.toLowerCase()) : undefined;
        if (host) pendingHostLabels.delete(host.toLowerCase());
        const title = (labelPart || pendingLabel || '').trim() || undefined;
        const exists = results.find((entry) => entry.url && entry.url.trim() === urlRaw.trim());
        if (!exists) {
          results.push({ title, url: urlRaw });
        }
        continue;
      }

      const parenMatch = cleaned.match(/\((https?:\/\/[^\s)]+)\)/i);
      if (parenMatch) {
        const urlRaw = parenMatch[1];
        const labelPart = cleaned.replace(parenMatch[0], '').replace(/[-–—:]+$/, '').trim();
        let host = '';
        try {
          host = new URL(urlRaw).hostname.replace(/^www\./i, '');
        } catch {}
        const pendingLabel = host ? pendingHostLabels.get(host.toLowerCase()) : undefined;
        if (host) pendingHostLabels.delete(host.toLowerCase());
        const title = (labelPart || pendingLabel || '').trim() || undefined;
        const exists = results.find((entry) => entry.url && entry.url.trim() === urlRaw.trim());
        if (!exists) {
          results.push({ title, url: urlRaw });
        }
        continue;
      }

      const normalizedLine = cleaned.replace(/^(?:https?:\/\/)?(?:www\.)?/i, '').trim();
      const looksLikeDomain = hostOnlyPattern.test(cleaned) && !cleaned.includes(' ');
      if (looksLikeDomain) {
        const hostKey = normalizedLine.toLowerCase();
        pendingHostLabels.set(hostKey, cleaned);
        const last = results[results.length - 1];
        if (last && last.url) {
          try {
            const lastHost = new URL(last.url).hostname.replace(/^www\./i, '').toLowerCase();
            if (lastHost === hostKey) {
              last.title = cleaned;
              pendingHostLabels.delete(hostKey);
            }
          } catch {}
        }
        continue;
      }

      if (cleaned) {
        results.push({ title: cleaned });
      }
    }
    return results;
  };

  const combinedCitations = React.useMemo(() => {
    const parsed = parseSourcesFromContent(processContent(slide.content || ''));
    const merged: Citation[] = [...(citations || []), ...parsed];
    return dedupeCitations(merged).map((c) => ({
      title: c.title,
      source: c.source,
      url: c.url,
    }));
  }, [slide.content, citations]);

  const normalizedCitations = React.useMemo(() => combinedCitations.map((citation) => canonicalizeCitation(citation)), [combinedCitations]);

  // Build one-time-use domain map → index for footnote numbering
  const domainToIndexRef = React.useRef<Map<string, number>>(new Map());
  const footnotes = React.useMemo(() => {
    const backendFootnotes = Array.isArray((slide as any)?.footnotes) ? (slide as any).footnotes : [];
    if (backendFootnotes.length > 0) {
      const map = new Map<string, number>();
      const sanitized = backendFootnotes
        .slice()
        .sort((a: any, b: any) => a.index - b.index)
        .map((f: any) => {
          const label = deriveFootnoteLabel({ label: f.label, url: f.url }, combinedCitations);
          try {
            if (f.url) {
              const host = new URL(f.url).hostname;
              map.set(host, f.index);
              map.set(String(f.url), f.index);
            }
          } catch {}
          return { index: f.index, label, url: f.url };
        });
      domainToIndexRef.current = map;
      return sanitized;
    }

    domainToIndexRef.current = new Map();
    const deduped = combinedCitations;
    const out: Array<{ index: number; label: string; url: string }> = [];
    deduped.forEach((citation, idx) => {
      const normalized = canonicalizeCitation(citation);
      const index = idx + 1;
      if (normalized.url) {
        domainToIndexRef.current.set(normalized.host || normalized.url, index);
        domainToIndexRef.current.set(normalized.url, index);
      } else {
        domainToIndexRef.current.set(`label:${normalized.label}|${idx}`, index);
      }
      out.push({ index, label: normalized.label, url: normalized.url || '' });
    });
    return out;
  }, [combinedCitations, (slide as any)?.footnotes]);

  const sourcesFooter = React.useMemo(() => {
    if (!normalizedCitations || normalizedCitations.length === 0) return null;
    return (
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.12em] text-zinc-500 dark:text-neutral-500">Sources</div>
        <ul className="mt-1 space-y-1.5">
          {normalizedCitations.map((citation, idx) => {
            const displayLabel = citation.title || citation.label;
            const href = citation.url;
            const host = citation.host;
            return (
              <li key={`${citation.normalizedKey || citation.label}-${idx}`} className="leading-snug">
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-inherit no-underline hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 dark:hover:text-zinc-50"
                  >
                    [{idx + 1}] {displayLabel}
                  </a>
                ) : (
                  <span>[{idx + 1}] {displayLabel}</span>
                )}
                {host && host.toLowerCase() !== (displayLabel || '').toLowerCase() && (
                  <div className="text-[0.55rem] text-zinc-500 dark:text-neutral-500">{host}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }, [normalizedCitations]);

  const renderInlineWithCitations = (children: React.ReactNode): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    const pushStringWithTokens = (text: string) => {
      const regex = /\[(.+?)\]/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const [full, label] = match;
        if (match.index > lastIndex) {
          parts.push(text.slice(lastIndex, match.index));
        }
        const token = label.trim();
        // match to footnote by domain one-time use
        let idx: number | undefined;
        let href: string | undefined;
        // If token is a number like [3], link directly to that footnote index
        if (/^\d+$/.test(token)) {
          idx = parseInt(token, 10);
        } else {
          const matchBy = (c: any) => (c.title || '').toLowerCase() === token.toLowerCase() || (c.source || '').toLowerCase() === token.toLowerCase();
          const found = combinedCitations.find(matchBy);
          if (found) {
            try {
              const host = new URL(found.url).hostname;
              idx = domainToIndexRef.current.get(host);
              href = found.url;
            } catch {
              idx = domainToIndexRef.current.get(found.url);
              href = found.url;
            }
          }
        }
        const supLabel = idx ?? 0;
        parts.push(
          <sup key={`${token}-${match.index}`} className="ml-0.5 align-[0.2em] text-[0.75em]">
            {supLabel > 0 ? <a href={`#cite-${supLabel}`}>[{supLabel}]</a> : '[?]'}
          </sup>
        );
        lastIndex = match.index + full.length;
      }
      if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    };

    const walk = (node: React.ReactNode) => {
      if (typeof node === 'string') {
        pushStringWithTokens(node);
      } else if (Array.isArray(node)) {
        node.forEach(child => walk(child));
      } else {
        parts.push(node as any);
      }
    };

    walk(children);
    return parts;
  };

  // This onDrop is specifically for when items (slides or files) are dropped ON this slide card.
  const onDropOnSlide = (e: React.DragEvent) => {
    handleDrop(e, slide.id);
  };

  // Process content to handle unicode escapes and preserve formatting
  const processContent = (content: any): string => {
    // Ensure content is a string
    if (typeof content !== 'string') {
      console.error('processContent received non-string content:', content);
      return '';
    }
    
    // Replace unicode bullet points with actual bullet characters
    // Handle escaped newlines from JSON
    return content
      .replace(/\\u2022/g, '•')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r');
  };

  // Derive a fallback title from the first non-empty line of content
  const deriveTitleFromContent = (text: string | undefined): string => {
    if (!text) return '';
    const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return '';
    // Strip bullets or numbering
    const first = lines[0].replace(/^\d+[\.)]\s+/, '').replace(/^[•\-*+]\s+/, '').trim();
    return first.slice(0, 80);
  };

  // Auto-fill missing slide title once
  useEffect(() => {
    if ((!slide.title || slide.title.trim() === '') && slide.content && slide.content.trim() !== '') {
      const t = deriveTitleFromContent(processContent(slide.content));
      if (t) {
        handleSlideTitleChange(slide.id, t);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide.id, slide.title, slide.content]);

  // Renumber inline citations like [6] [Source] → [1] [2] sequentially for display
  const renumberInlineCitations = (text: string): string => {
    if (!text) return '';
    let i = 0;
    return text.replace(/\[(.+?)\]/g, () => `[$${++i}]`).replace(/\[\$(\d+)\]/g, '[$1]');
  };

  // Strip raw Sources section from content when we have a separate panel to show them
  const stripSourcesSection = (text: string): string => {
    if (!text) return '';
    // Find a line that starts with 'Sources' (case-insensitive) and remove everything after it
    const match = text.match(/(^|\n)[\t ]*@?Sources:?[\s\S]*$/i);
    if (match) {
      return text.slice(0, match.index || 0).trimEnd();
    }
    // Also remove boilerplate hint if present inline
    return text.replace(/Edit sources in slide text or chart metadata\.?/gi, '').trim();
  };

  // Update editContent when slide content changes
  useEffect(() => {
    setEditContent(processContent(slide.content || ''));
  }, [slide.content]);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current && isEditing) {
      // Reset height to recalculate
      textareaRef.current.style.height = 'auto';
      // Set height based on scrollHeight, but respect max-height
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = 280; // Match the max-height in CSS
      textareaRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, [editContent, isEditing]);

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Don't enter edit mode if already editing
    if (isEditing) return;
    
    setEditContent(processContent(slide.content || ''));
    setIsEditing(true);
    
    // Focus and position cursor
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        
        // Try to position cursor based on click location
        const rect = contentRef.current?.getBoundingClientRect();
        if (rect) {
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          
          // Estimate position in text
          const lineHeight = 20;
          const charWidth = 8;
          const line = Math.floor(y / lineHeight);
          const char = Math.floor(x / charWidth);
          
          const lines = editContent.split('\n');
          let position = 0;
          
          for (let i = 0; i < Math.min(line, lines.length); i++) {
            position += lines[i].length + 1;
          }
          
          if (line < lines.length) {
            position += Math.min(char, lines[line].length);
          }
          
          textareaRef.current.setSelectionRange(position, position);
        }
      }
    }, 10);
  };

  const handleContentChange = (newContent: string) => {
    setEditContent(newContent);
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Auto-save after 500ms of no typing
    saveTimeoutRef.current = setTimeout(() => {
      handleSlideContentChange(slide.id, newContent);
    }, 500);
  };

  const handleBlur = () => {
    // Save immediately on blur
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    handleSlideContentChange(slide.id, editContent);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Escape key to exit editing
    if (e.key === 'Escape') {
      e.preventDefault();
      handleBlur();
    }
    // Tab key for indentation
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.target as HTMLTextAreaElement;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      setEditContent(newValue);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  return (
    <div key={slide.id} // Key should be on the mapped element in parent, but good to have ID here too
      className={cn(
        "slide-item-animate rounded-lg p-4 cursor-move backdrop-blur-[1px] bg-zinc-100/20 dark:bg-white/10",
        "transition-transform duration-200 ease-out hover:scale-[1.008] hover:shadow-xl hover:z-50",
        dragOverSlideId === slide.id ? 'border border-pink-400 dark:border-pink-500 border-dashed border-2 bg-pink-50/30 dark:bg-pink-900/20' : 
          'border border-zinc-300/50 dark:border-neutral-300/30',
        slide.deepResearch ? 'border-l-4 border-l-pink-500 dark:border-l-pink-400 pl-3' : 'border-l border-l-zinc-300/50 dark:border-l-neutral-300/30',
        researchingSlides.includes(slide.id) ? 'border-pink-500/50 shadow-[0_0_15px_rgba(236,72,153,0.3)]' : '',
        isNewSlide ? 'animate-opacity-in' : ''
      )}
      style={{
        animationDelay: '0s',
        animationFillMode: 'backwards',
        marginLeft: '4px',
        marginRight: '4px',
        position: 'relative',
        zIndex: tooltipHostSlideId === slide.id ? (currentOutline.slides.length * 10) + 1 : (currentOutline.slides.length - index) * 10,
        ...(slide.animateReorder && { animation: 'cardReorder 0.4s ease forwards' }),
        transformOrigin: 'center center'
      }}
      draggable
      onDragStart={() => handleDragStart(slide.id)}
      onDragOver={(e) => { e.preventDefault(); handleDragOver(e, slide.id); }}
      onDragEnter={(e) => { e.preventDefault(); setDragOverSlideId(slide.id); }}
      onDragLeave={(e) => { e.preventDefault(); if (dragOverSlideId === slide.id) setDragOverSlideId(null); }}
      onDrop={onDropOnSlide} // Use the specific onDrop handler for this slide
      onDragEnd={handleDragEnd}
    >
      <div className="flex justify-between items-center mb-2">
        <input 
          value={slide.title} 
          onChange={(e) => handleSlideTitleChange(slide.id, e.target.value)} 
          className="font-medium bg-transparent border-0 focus:outline-none text-sm text-foreground flex-1 min-w-0 mr-2 truncate" 
          placeholder="Slide title"
        />
        <div className="flex gap-1 flex-shrink-0">
          <Button 
            variant="ghost" 
            size="icon" 
            className={cn(
              "h-6 w-6 p-0 rounded-full",
              !slide.content || slide.content.trim() === '' 
                ? "opacity-50 cursor-not-allowed hover:bg-transparent" 
                : "hover:bg-zinc-200/50 dark:hover:bg-white/20",
              slide.deepResearch ? 'text-pink-500' : 'text-zinc-600 dark:text-neutral-400 hover:text-zinc-800 dark:hover:text-neutral-200'
            )} 
            onClick={(e) => { 
              e.stopPropagation();
              
              // Check if slide has content
              if (!slide.content || slide.content.trim() === '') {
                toast({ 
                  title: "Cannot enhance empty slide", 
                  description: "Please add content to the slide before enabling deep research.", 
                  variant: "destructive",
                  duration: 3000 
                });
                return;
              }
              
              handleToggleDeepResearch(slide.id, e);
              toast({ 
                title: !slide.deepResearch ? "Deep research enabled" : "Deep research disabled", 
                description: !slide.deepResearch ? "This slide will use AI research to enhance content..." : "This slide will no longer use AI research...", 
                duration: 3000 
              }); 
            }} 
            title={!slide.content || slide.content.trim() === '' ? "Add content first" : "Deep Research"}
            disabled={!slide.content || slide.content.trim() === ''}
          >
            <Microscope className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 p-0 rounded-full hover:bg-zinc-200/50 dark:hover:bg-white/20 text-zinc-600 dark:text-neutral-400 hover:text-zinc-800 dark:hover:text-neutral-200" 
            onClick={handleEdit} title="Edit content">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 p-0 rounded-full hover:bg-zinc-200/50 dark:hover:bg-white/20 text-zinc-600 dark:text-neutral-400 hover:text-zinc-800 dark:hover:text-neutral-200" 
            onClick={(e) => { 
              e.stopPropagation(); 
              handleDeleteSlide(slide.id);
            }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="relative mt-2">
        {isEditing ? (
          <div
            className={cn(
              "min-h-[80px] max-h-[300px] p-3 rounded-md bg-zinc-50/80 dark:bg-white/5 border border-zinc-300/50 dark:border-neutral-300/30",
              "text-zinc-800 dark:text-neutral-300",
              "focus-within:ring-1 focus-within:ring-zinc-400/70 dark:focus-within:ring-neutral-400/70",
              researchingSlides.includes(slide.id) ? 'blur-sm pointer-events-none' : ''
            )}
          >
            <OutlineRichTextEditor
              value={stripSourcesSection(processContent(editContent))}
              onChange={(content) => handleContentChange(content)}
              onBlur={() => {
                handleBlur();
                // Also update footnotes in outline from current citations if we can
                try {
                  if (!citations || citations.length === 0) return;
                  const fns = citations.map((c, i) => ({ index: i + 1, label: (c.title || c.source || ''), url: c.url }));
                  setCurrentOutline(prev => {
                    if (!prev) return prev;
                    const updatedSlides = prev.slides.map(s => s.id === slide.id ? ({ ...s, footnotes: fns } as any) : s);
                    return { ...prev, slides: updatedSlides } as any;
                  });
                } catch {}
              }}
              placeholder="Enter slide content..."
              editable={true}
              showToolbar={true}
              bubbleToolbar={false}
              className="h-full"
            />
          </div>
        ) : (
          <div 
            ref={contentRef}
            className={cn(
              "min-h-[80px] max-h-[300px] p-3 rounded-md bg-zinc-50/50 dark:bg-white/[0.02] border border-zinc-200/50 dark:border-neutral-700/50",
              researchingSlides.includes(slide.id) ? 'blur-sm' : '',
              isGenerating && !slide.content ? 'shimmer-loading' : '',
              "transition-all duration-200",
              "hover:border-zinc-300/70 dark:hover:border-neutral-600/70",
              "overflow-y-auto outline-textarea-scrollbar cursor-text"
            )}
            onClick={handleEdit}
            role="button"
            aria-label="Edit slide content"
          >
            {isGenerating && !slide.content ? (
              <div className="space-y-2">
                <div className="h-3 bg-zinc-200/50 dark:bg-zinc-700/50 rounded shimmer-text w-3/4"></div>
                <div className="h-3 bg-zinc-200/50 dark:bg-zinc-700/50 rounded shimmer-text w-full" style={{ animationDelay: '0.1s' }}></div>
                <div className="h-3 bg-zinc-200/50 dark:bg-zinc-700/50 rounded shimmer-text w-5/6" style={{ animationDelay: '0.2s' }}></div>
              </div>
            ) : slide.content ? (
              <OutlineRichTextEditor
                value={renumberInlineCitations(stripSourcesSection(processContent(slide.content)))}
                onChange={() => { /* no-op in view mode */ }}
                editable={false}
                showToolbar={false}
                bubbleToolbar={false}
                className="h-full"
                footer={sourcesFooter}
              />
            ) : (
              <p className="text-sm text-zinc-400 dark:text-neutral-500">No content yet</p>
            )}
          </div>
        )}
        {researchingSlides.includes(slide.id) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-r from-pink-500/30 to-purple-500/30 backdrop-blur-sm rounded-md z-10 animate-pulse">
            <div className="flex flex-col items-center gap-1 bg-white/20 dark:bg-black/20 backdrop-blur-md rounded-lg p-2.5 shadow-md">
              <Microscope className="h-6 w-6 text-pink-500 animate-bounce" />
              <div className="text-center"><p className="text-xs font-medium text-pink-600 dark:text-pink-400">Enhancing with AI research...</p></div>
              <div className="mt-1 flex space-x-1">
                <div className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}
        {dragOverSlideId === slide.id && (
          <div className="absolute inset-0 bg-pink-500/10 dark:bg-pink-800/20 backdrop-blur-sm rounded-md z-10">
            {/* Removed the inner div with Upload icon and text - keeping just the highlight effect */}
          </div>
        )}
      </div>
      {slide.extractedData && <ChartDataTable slide={slide} setCurrentOutline={setCurrentOutline} />}
      {slide.extractedData && <SlideChartViewer extractedData={slide.extractedData} />}
      {/* Citations Panel (grouped, editable hint). Uses extractedData.metadata.citations if present */}
      {combinedCitations && combinedCitations.length > 0 && (
        <CitationsPanel 
          citations={combinedCitations} 
          editable={true} 
          footnotes={footnotes}
          onChange={(next) => {
            const normalizedNext = next.map((c) => {
              const normalized = canonicalizeCitation(c);
              return {
                title: c.title?.trim() || normalized.title,
                source: c.source?.trim() || normalized.source,
                url: normalized.url,
              } as Citation;
            });
            setCurrentOutline(prev => {
              if (!prev) return prev;
              const updatedSlides = prev.slides.map(s => {
                if (s.id !== slide.id) return s;
                const updatedExtracted = {
                  ...(s.extractedData || {}),
                  metadata: {
                    ...(s.extractedData?.metadata || {}),
                    citations: normalizedNext
                  }
                } as any;
                const fns = normalizedNext.map((c, i) => {
                  const normalized = canonicalizeCitation(c);
                  return { index: i + 1, label: normalized.label, url: normalized.url };
                }) as any;
                return { ...s, extractedData: updatedExtracted, citations: normalizedNext as any, footnotes: fns } as any;
              });
              return { ...prev, slides: updatedSlides };
            });
          }}
        />
      )}
      {slide.taggedMedia && slide.taggedMedia.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Tagged Media</h4>
            {isProcessingMedia && slide.taggedMedia.some(m => m.status === 'pending') && (
              <div className="flex items-center text-xs text-zinc-500"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Processing...</div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {slide.taggedMedia.map((media, mediaIndex) => (
              <div key={`${media.id}-${mediaIndex}`}
                onMouseEnter={(e) => {
                  setTooltipHostSlideId(slide.id);
                  if (outlineScrollRef.current) {
                    const mediaRect = e.currentTarget.getBoundingClientRect();
                    const containerRect = outlineScrollRef.current.getBoundingClientRect();
                    const tooltipWidth = 288; // Approximate width of w-72 tooltip (72 * 4px)
                    if (mediaRect.left + tooltipWidth > containerRect.right) {
                      setCurrentTooltipAlign('right');
                    } else {
                      setCurrentTooltipAlign('left');
                    }
                  }
                }}
                onMouseLeave={() => {
                  setTooltipHostSlideId(null);
                  setCurrentTooltipAlign('left'); // Reset to default
                }}
                className={cn("relative group text-xs border px-2 py-1.5 rounded-md flex items-center text-zinc-700 dark:text-neutral-300 hover:shadow-sm",
                  media.status === 'pending' ? 'bg-yellow-100/50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-800' :
                    'bg-blue-100/50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-800',
                  animatingOutMediaIds.has(media.id) ? 'animate-media-tag-out' : 'animate-media-tag-in'
                )}
                style={{ animationDelay: animatingOutMediaIds.has(media.id) ? '0s' : `${mediaIndex * 0.1}s` }}
              >
                {media.type === 'image' ? <ImageIcon className="h-3 w-3 mr-1 text-blue-500 dark:text-blue-400" /> : media.type === 'chart' || media.type === 'data' ? <BarChart3 className="h-3 w-3 mr-1 text-purple-500 dark:text-purple-400" /> : media.type === 'pdf' ? <FileText className="h-3 w-3 mr-1 text-red-500 dark:text-red-400" /> : media.filename?.endsWith('.csv') || media.filename?.endsWith('.xls') || media.filename?.endsWith('.xlsx') || media.filename?.endsWith('.numbers') || media.filename?.endsWith('.ods') ? <FileText className="h-3 w-3 mr-1 text-green-500 dark:text-green-400" /> : <FileIcon className="h-3 w-3 mr-1 text-gray-500 dark:text-gray-400" />}
                <span className="truncate max-w-[100px]">{media.filename}</span>
                {media.status === 'pending' && <div className="ml-1 w-2 h-2 rounded-full bg-yellow-500 animate-pulse" title="Processing..." />}
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-end rounded opacity-0 group-hover:opacity-100 transition-opacity pr-1">
                  <button
                    onClick={() => {
                      setAnimatingOutMediaIds(prev => new Set(prev).add(media.id));
                      setTimeout(() => {
                        setCurrentOutline(prev => {
                          if (!prev) return null;
                          const updatedSlides = prev.slides.map(s =>
                            s.id === slide.id ? { ...s, taggedMedia: s.taggedMedia?.filter(m => m.id !== media.id) || [] } : s
                          );
                          return { ...prev, slides: updatedSlides };
                        });
                        setAnimatingOutMediaIds(prev => {
                          const next = new Set(prev);
                          next.delete(media.id);
                          return next;
                        });
                      }, 300);
                    }}
                    className="p-0.5 bg-red-500/80 rounded-full hover:bg-red-600/80 text-white opacity-70 hover:opacity-100"
                    title="Remove from slide">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
                <div className={cn(
                  "absolute bottom-full mb-2 w-72 p-3 bg-black/90 backdrop-blur-md text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-pink-500/30",
                  currentTooltipAlign === 'right' ? "right-0" : "left-0"
                )}>
                  <div className="flex items-center gap-2 mb-2"><p className="font-semibold text-[12px] text-pink-400">AI Analysis:</p></div>
                  {media.type === 'image' && media.previewUrl && (<div className="mb-2 flex justify-center"><img src={media.previewUrl} alt={media.filename} className="max-h-32 max-w-full rounded-md border border-pink-500/30" onError={(e) => { 
                    const target = e.target as HTMLImageElement;
                    if (target.src !== '/placeholder.svg') {
                      target.src = '/placeholder.svg';
                    }
                  }} /></div>)}
                  <p className="text-[11px] leading-relaxed mb-2">{media.interpretation || "No AI interpretation available"}</p>
                  {media.metadata && (
                    <div className="border-t border-pink-500/20 pt-2 mt-2 text-[10px] text-gray-300/80">
                      {media.metadata.componentType && <div className="flex items-center gap-1 mb-1"><span className="text-pink-400/80">Component:</span> <span>{media.metadata.componentType}</span></div>}
                      {media.metadata.chartType && <div className="flex items-center gap-1 mb-1"><span className="text-pink-400/80">Chart Type:</span> <span>{media.metadata.chartType}</span></div>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {uploadedFiles.length > 0 && (!slide.taggedMedia || slide.taggedMedia.length === 0) && !currentOutline.uploadedMedia?.some(um => um.slideId === slide.id) && (
        <div className="mt-2 flex flex-wrap gap-2">
          <div className="w-full text-xs text-zinc-500 dark:text-zinc-400 mb-1">Drag files here to include them in this slide</div>
        </div>
      )}
    </div>
  );
};

export default SlideCard; 
