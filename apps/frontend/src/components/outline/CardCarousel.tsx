import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Microscope, Trash2, ChevronLeft, ChevronRight, Plus, Table, BarChart3, X, GripVertical, ImageIcon } from 'lucide-react';
import { SlideOutline, DeckOutline } from '@/types/SlideTypes';
import OutlineRichTextEditor from './OutlineRichTextEditor';
import ChartDataTable from './ChartDataTable';
import SlideChartViewer from './SlideChartViewer';
import TaggedMediaViewer from './TaggedMediaViewer';
import MiniGameWidget from '@/components/common/MiniGameWidget';
import CitationsPanel from './CitationsPanel';

interface CardCarouselProps {
  slides: SlideOutline[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onDeepResearch: (slideId: string) => void;
  onDeleteSlide: (slideId: string) => void;
  onAddSlide: () => void;
  onSlideTitleChange: (slideId: string, title: string) => void;
  onSlideContentChange?: (slideId: string, content: string) => void;
  onSlideReorder?: (sourceIndex: number, destinationIndex: number) => void;
  researchingSlides: string[];
  isGenerating?: boolean;
  completedSlides?: Set<number>;
  setCurrentOutline?: React.Dispatch<React.SetStateAction<DeckOutline | null>>;
  editingSlides?: string[]; // New prop for slides being edited via chat
  editTarget?: number | 'all'; // Target for editing
}

const CardCarousel: React.FC<CardCarouselProps> = ({
  slides = [],
  currentIndex,
  onIndexChange,
  onDeepResearch,
  onDeleteSlide,
  onAddSlide,
  onSlideTitleChange,
  onSlideContentChange,
  onSlideReorder,
  researchingSlides = [],
  isGenerating = false,
  completedSlides = new Set(),
  setCurrentOutline,
  editingSlides = [],
  editTarget
}) => {
  // Debug logging - only log meaningful changes
  React.useEffect(() => {
    console.warn('[CardCarousel] Props updated:', {
      slideCount: slides.length,
      isGenerating,
      completedSlidesCount: completedSlides.size,
      slides: slides.map((s, i) => ({ 
        index: i, 
        title: s?.title || 'null', 
        hasContent: !!s?.content,
        isCompleted: completedSlides.has(i)
      }))
    });
  }, [slides.length, isGenerating, completedSlides.size, slides.map(s => s?.content ? 1 : 0).join('')]);

  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [currentX, setCurrentX] = useState(0);
  const [editingSlideId, setEditingSlideId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingContentId, setEditingContentId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const previousSlidesLengthRef = useRef(slides.length);
  const [activeTab, setActiveTab] = useState<{ [key: string]: 'content' | 'table' | 'chart' | 'media' }>({});
  const editDivRef = useRef<HTMLDivElement>(null);
  const lastEditedSlideIdRef = useRef<string | null>(null);
  
  // Drag-to-reorder state
  const [draggedSlideIndex, setDraggedSlideIndex] = useState<number | null>(null);
  const [dragOverSlideIndex, setDragOverSlideIndex] = useState<number | null>(null);
  
  // Track slides that have been rendered for fade-in animation
  const [renderedSlideIds, setRenderedSlideIds] = useState<Set<string>>(new Set());
  const hasInitializedRef = useRef(false);
  
  // Track new slides for fade-in animation
  useEffect(() => {
    // If this is the first time we have slides, clear the rendered set to allow fade-in
    if (slides.length > 0 && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      setRenderedSlideIds(new Set()); // Start empty so first slides can fade in
    }
    
    const newSlideIds = slides.filter(slide => !renderedSlideIds.has(slide.id)).map(s => s.id);
    if (newSlideIds.length > 0) {
      // Add new slides to rendered set after a small delay to trigger animation
      const timer = setTimeout(() => {
        setRenderedSlideIds(prev => {
          const next = new Set(prev);
          newSlideIds.forEach(id => next.add(id));
          return next;
        });
      }, 100); // Slightly longer delay for better animation
      return () => clearTimeout(timer);
    }
  }, [slides]);
  
  // Create slides array with empty "add" slide at the end
  const slidesWithAdd = [...slides, null];
  
  // Small vertical offset to nudge cards up within their container (without overlapping controls)
  const VERTICAL_OFFSET_PX = 24;

  // Remove debug logging from component body - it causes infinite re-renders
  // console.log('CardCarousel - researchingSlides:', researchingSlides);
  // console.log('CardCarousel - slides:', slides.map(s => s.id));

  // Auto-scroll to new slides when they're added during generation
  useEffect(() => {
    if (isGenerating && slides.length > previousSlidesLengthRef.current) {
      // A new slide was added, navigate to it
      const newSlideIndex = slides.length - 1;
      const newSlide = slides[newSlideIndex];
      
      // Only auto-navigate if the new slide has content (is completed)
      if (newSlide.content && completedSlides.has(newSlideIndex)) {
        setTimeout(() => {
          onIndexChange(newSlideIndex);
        }, 300); // Small delay for better UX
      }
    }
    previousSlidesLengthRef.current = slides.length;
  }, [slides.length, isGenerating, completedSlides, onIndexChange]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handlePrevious();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, slides.length]);

  const handlePrevious = () => {
    if (currentIndex > 0) {
      onIndexChange(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < slidesWithAdd.length - 1) {
      onIndexChange(currentIndex + 1);
    }
  };

  const handleTitleEdit = (slideId: string, title: string) => {
    setEditingSlideId(slideId);
    setEditingTitle(title);
  };

  const handleTitleSave = (slideId: string) => {
    onSlideTitleChange(slideId, editingTitle);
    setEditingSlideId(null);
    setEditingTitle('');
  };

  // Drag-to-reorder handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    // Don't allow dragging the "Add Slide" card
    if (index >= slides.length) return;
    
    console.log(`[CardCarousel] Drag start on slide ${index}`);
    e.stopPropagation(); // Stop event from bubbling
    setDraggedSlideIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    
    // Add some data to make the drag valid
    e.dataTransfer.setData('text/plain', `slide-${index}`);
    
    // Add a visual effect
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '0.5';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '';
    
    setDraggedSlideIndex(null);
    setDragOverSlideIndex(null);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Don't allow dropping on the "Add Slide" card
    if (index >= slides.length) return;
    
    if (draggedSlideIndex !== null && index !== draggedSlideIndex) {
      setDragOverSlideIndex(index);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    setDragOverSlideIndex(null);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log(`[CardCarousel] Drop on slide ${index}, draggedSlideIndex: ${draggedSlideIndex}`);
    
    // Don't allow dropping on the "Add Slide" card
    if (index >= slides.length) return;
    
    if (draggedSlideIndex !== null && draggedSlideIndex !== index) {
      if (onSlideReorder) {
        console.log(`[CardCarousel] Calling onSlideReorder(${draggedSlideIndex}, ${index})`);
        onSlideReorder(draggedSlideIndex, index);
      } else {
        console.error(`[CardCarousel] onSlideReorder is not defined!`);
      }
      
      // Update current index if needed
      if (currentIndex === draggedSlideIndex) {
        onIndexChange(index);
      } else if (
        (currentIndex > draggedSlideIndex && currentIndex <= index) ||
        (currentIndex < draggedSlideIndex && currentIndex >= index)
      ) {
        const newIndex = currentIndex > draggedSlideIndex 
          ? currentIndex - 1 
          : currentIndex + 1;
        onIndexChange(newIndex);
      }
    }
    
    setDraggedSlideIndex(null);
    setDragOverSlideIndex(null);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Don't start swipe if we're on a draggable element
    const target = e.target as HTMLElement;
    if (target.closest('[draggable="true"]')) {
      return;
    }
    
    setIsDragging(true);
    setStartX(e.clientX);
    setCurrentX(0);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || draggedSlideIndex !== null) return;
    const deltaX = e.clientX - startX;
    setCurrentX(deltaX);
  };

  const handleMouseUp = () => {
    if (!isDragging || draggedSlideIndex !== null) return;
    setIsDragging(false);
    
    // Determine if we should change slides based on drag distance
    const threshold = 100;
    if (currentX < -threshold && currentIndex < slidesWithAdd.length - 1) {
      handleNext();
    } else if (currentX > threshold && currentIndex > 0) {
      handlePrevious();
    }
    setCurrentX(0);
  };

  const handleRemoveExtractedData = (targetSlideId: string) => {
    // Remove extracted data (affects both table and chart views)
    if (setCurrentOutline) {
      setCurrentOutline(prev => {
        if (!prev) return prev;
        const updatedSlides = prev.slides.map(s => 
          s.id === targetSlideId ? { ...s, extractedData: undefined } : s
        );
        return { ...prev, slides: updatedSlides } as DeckOutline;
      });
    }
    // Reset active tab back to content for this slide
    setActiveTab(prev => {
      const next = { ...prev } as typeof prev;
      delete next[targetSlideId];
      return next;
    });
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        handleMouseUp();
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging]);

  // Helper: transform content to use [n] superscripts and append textual footnotes
  const buildEditorContentWithFootnotes = (raw: string, cits?: Array<{ title?: string; source?: string; url?: string }>): string => {
    const content = raw || '';
    const domainToIndex = new Map<string, { index: number; label: string; url?: string }>();
    let counter = 0;
    const addFoot = (label: string, url?: string) => {
      const key = (() => {
        try { return url ? new URL(url).hostname : label; } catch { return url || label; }
      })();
      if (!domainToIndex.has(key)) domainToIndex.set(key, { index: ++counter, label: label, url });
      return domainToIndex.get(key)!.index;
    };
    if (cits && cits.length) {
      cits.forEach(c => {
        const host = (() => { try { return new URL(c.url).hostname; } catch { return c.url; } })();
        const label = c.title || c.source || host;
        addFoot(label, c.url);
      });
    }
    const getIndexForToken = (token: string): number | undefined => {
      // Prefer match against citation title/source
      const found = cits?.find(c => (c.title || '').toLowerCase() === token.toLowerCase() || (c.source || '').toLowerCase() === token.toLowerCase());
      if (found) {
        const host = (() => { try { return new URL(found.url).hostname; } catch { return found.url; } })();
        const label = found.title || found.source || host;
        return addFoot(label, found.url);
      }
      // Fallback: token is url/domain
      if (/^https?:\/\//i.test(token)) {
        try { const u = new URL(token); return addFoot(u.hostname, u.href); } catch { return addFoot(token, token); }
      }
      if (/\w+\.[\w.-]+$/.test(token)) {
        return addFoot(token);
      }
      // As a fallback, treat the token text itself as the source label (no URL)
      return addFoot(token);
    };
    // Replace [token] → [n]
    const replaced = content.replace(/\[(.+?)\]/g, (m, g1) => {
      const token = String(g1).trim();
      const idx = getIndexForToken(token);
      return idx ? `[${idx}]` : m;
    });
    if (domainToIndex.size === 0) return replaced;
    const lines: string[] = [];
    lines.push('');
    lines.push('Sources:');
    Array.from(domainToIndex.values()).sort((a, b) => a.index - b.index).forEach(f => {
      lines.push(`${f.index}. ${f.label}${f.url ? ` — ${f.url}` : ''}`);
    });
    // Remove any existing trailing Sources block to avoid duplication
    const cleaned = replaced.replace(/\nSources:[\s\S]*$/i, '');
    return `${cleaned}\n${lines.join('\n')}`;
  };

  // Helper: derive citations and footnotes from HTML or plain text content
  const deriveFromContent = (content: string): {
    citations: Array<{ title?: string; source?: string; url?: string }>,
    footnotes: Array<{ index: number; label: string; url?: string }>
  } => {
    const citations: Array<{ title?: string; source?: string; url?: string }> = [];
    const footnotes: Array<{ index: number; label: string; url?: string }> = [];
    try {
      if (typeof window !== 'undefined' && /<\w+[^>]*>/i.test(content)) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = content;
        // Prefer an <ol> immediately following a paragraph containing "Sources"
        let ol: HTMLOListElement | null = null;
        const ps = Array.from(wrapper.querySelectorAll('p')) as HTMLParagraphElement[];
        for (const p of ps) {
          const t = (p.textContent || '').trim().toLowerCase();
          if (t === 'sources:' || t === 'sources') {
            const next = p.nextElementSibling;
            if (next && next.tagName.toLowerCase() === 'ol') {
              ol = next as HTMLOListElement;
              break;
            }
          }
        }
        if (!ol) {
          const ols = wrapper.querySelectorAll('ol');
          if (ols.length > 0) ol = ols[ols.length - 1] as HTMLOListElement;
        }
        if (ol) {
          const lis = Array.from(ol.querySelectorAll('li')) as HTMLLIElement[];
          lis.forEach((li, idx) => {
            const anchor = li.querySelector('a[href]') as HTMLAnchorElement | null;
            const url = anchor ? anchor.getAttribute('href') || '' : '';
            const label = (li.textContent || '').trim();
            footnotes.push({ index: idx + 1, label, url: url || undefined });
            citations.push({ title: label, url: url || '' });
          });
        }
      }
    } catch {}

    if (citations.length === 0) {
      // Fallback: parse plain text block following a "Sources:" line
      const text = (content || '')
        .replace(/<[^>]+>/g, '\n')
        .replace(/\u2022/g, '•');
      const lines = text.split(/\n+/);
      const idxs: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        const v = (lines[i] || '').trim();
        if (/^sources:?$/i.test(v)) idxs.push(i);
      }
      if (idxs.length > 0) {
        const start = idxs[idxs.length - 1] + 1;
        let counter = 0;
        for (let i = start; i < lines.length; i++) {
          const raw = (lines[i] || '').trim();
          if (!raw) continue;
          if (/^sources:?$/i.test(raw)) continue;
          const cleaned = raw.replace(/^\d+[\.)]\s+/, '').replace(/^[•\-*+]\s+/, '').trim();
          if (!cleaned) continue;
          const urlMatch = cleaned.match(/https?:[^\s)]+/i);
          const url = urlMatch ? urlMatch[0] : '';
          const label = url ? cleaned.replace(url, '').replace(/[()\u2014\-–—]+\s*$/, '').trim() : cleaned;
          citations.push({ title: label, url });
          footnotes.push({ index: ++counter, label, url: url || undefined });
        }
      }
    }

    return { citations, footnotes };
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center" style={{ height: 'calc((100vh - 220px) * 0.75)' }}>
      {/* Navigation buttons - positioned inside padding area */}
      <button
        onClick={handlePrevious}
        disabled={currentIndex === 0}
        className={cn(
          "absolute left-0 top-1/2 -translate-y-1/2 z-[100]",
          "h-12 w-12 rounded-full flex items-center justify-center",
          "bg-[#FF4301]/80 backdrop-blur-sm",
          "hover:bg-[#FF4301] text-white",
          "transition-all duration-200",
          "shadow-lg",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <ChevronLeft className="h-6 w-6" />
      </button>

      <button
        onClick={handleNext}
        disabled={currentIndex === slidesWithAdd.length - 1}
        className={cn(
          "absolute right-0 top-1/2 -translate-y-1/2 z-[100]",
          "h-12 w-12 rounded-full flex items-center justify-center",
          "bg-[#FF4301]/80 backdrop-blur-sm",
          "hover:bg-[#FF4301] text-white",
          "transition-all duration-200",
          "shadow-lg",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <ChevronRight className="h-6 w-6" />
      </button>

      {/* Cards container */}
      <div className={cn("relative w-full h-full", editingContentId ? "overflow-visible" : "overflow-hidden")}>
        <div 
          ref={containerRef}
          className="absolute inset-0 flex items-center justify-center"
          style={{ 
            cursor: 'default',
            perspective: '1200px',
            transformStyle: 'preserve-3d'
          }}
        >
        {slidesWithAdd.map((slide, index) => {
          const offset = index - currentIndex;
          const isActive = index === currentIndex;
          const isVisible = Math.abs(offset) <= 3; // Show 7 cards total (current + 3 on each side)
          const isAddSlide = slide === null;
          // Show generating placeholder only for auto-generated slides during generation
          // Don't show it for manually added slides or the last slide
          // Show generating state for slides that don't have content yet during generation
          const isGeneratingSlide = !isAddSlide && isGenerating && !slide.content && !completedSlides.has(index) && !slide.isManual;
          
          // Always render cards for smooth transitions to show background slides
          if (!isVisible) return null;

          return (
            <div
              key={slide?.id || 'add-slide'}
              className={cn(
                "absolute top-1/2 left-1/2 w-[75%] max-w-[700px]", // Reduced width from 95% to 75%
                // Glass effect styling
                "bg-white/95 dark:bg-zinc-900/95",
                "rounded-xl shadow-md",
                "transition-all duration-300 ease-out",
                "border-2",
                isActive && "shadow-xl border-[#FF4301] dark:border-[#FF4301]",
                !isActive && "border-[#FF4301]/40 dark:border-[#FF4301]/40",
                !isAddSlide && researchingSlides.includes(slide.id) && "animate-pulse-border",
                // Drag over state
                !isAddSlide && dragOverSlideIndex === index && "ring-4 ring-[#FF4301] ring-offset-2",
                // Being dragged state
                !isAddSlide && draggedSlideIndex === index && "opacity-50",
                // Opacity-only fade-in for new slides
                !isAddSlide && !renderedSlideIds.has(slide.id) && "opacity-0 animate-opacity-in"
              )}
              style={{
                transform: `
                  translate(-50%, -50%) 
                  translateX(${offset * 43 + currentX * 0.2}px) 
                  translateZ(${isActive ? 0 : -Math.abs(offset) * 20}px)
                  translateY(-${VERTICAL_OFFSET_PX}px)
                  rotateY(${offset * -1}deg)
                  scale(${1 - Math.abs(offset) * 0.015})
                `,
                opacity: Math.abs(offset) <= 3 ? 1 - Math.abs(offset) * 0.05 : 0,
                zIndex: 10 - Math.abs(offset),
                transformStyle: 'preserve-3d',
                pointerEvents: isActive || draggedSlideIndex !== null ? 'auto' : 'none',
                height: 'calc((100vh - 300px) * 0.67)',
                // Add will-change for performance
                willChange: 'transform, opacity',
                cursor: 'default'
              }}
              draggable={false}
            >
              {isAddSlide ? (
                // Add slide card
                <div 
                  className="h-full flex items-center justify-center cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-xl transition-colors"
                  onClick={onAddSlide}
                >
                  <div className="text-center">
                    <Plus className="h-16 w-16 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
                    <p className="text-lg font-medium text-zinc-500 dark:text-zinc-400">Add Slide</p>
                    <p className="text-sm text-zinc-400 dark:text-zinc-500">Click to create a new slide</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Simple shimmering orange overlay */}
                  {(researchingSlides.includes(slide.id) || editingSlides.includes(slide.id)) && (
                    <div className="absolute inset-0 rounded-xl pointer-events-none z-30 overflow-hidden">
                      <div 
                        className="absolute inset-0 opacity-30"
                        style={{
                          background: 'linear-gradient(90deg, transparent 0%, #FF4301 50%, transparent 100%)',
                          backgroundSize: '200% 100%',
                          animation: 'shimmer 2s ease-in-out infinite'
                        }}
                      />
                      
                      {/* Small status indicator */}
                      <div className="absolute top-3 right-3">
                        <div className="text-[#FF4301] text-[10px] font-semibold tracking-wide">
                          {researchingSlides.includes(slide.id) ? 'ENHANCING...' : 'UPDATING...'}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Card content - no header, full height */}
                  <div className={cn(
                    "p-4 h-full relative pb-8",
                    editingContentId === slide.id ? "overflow-visible" : "overflow-y-auto overflow-x-hidden",
                    // Inner: opacity-only when first rendered
                    !renderedSlideIds.has(slide.id) && "animate-opacity-in"
                  )} 
                       onMouseDown={(e) => e.stopPropagation()}>
                    {/* Sticky note tabs for charts/tables/media */}
                    {(() => {
                      // Debug logging for this specific slide
                      const hasExtractedData = !!slide.extractedData;
                      const hasTaggedMedia = slide.taggedMedia && slide.taggedMedia.length > 0;
                      
                      if (!hasExtractedData && !hasTaggedMedia) {
                        return null;
                      }
                      
                      return (
                        <div className="absolute -right-1 top-20 flex flex-col gap-1 z-10">
                        {/* Back to content button - show when not on content tab */}
                        {activeTab[slide.id] && activeTab[slide.id] !== 'content' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveTab(prev => ({ ...prev, [slide.id]: 'content' }));
                            }}
                            className="px-3 py-2 rounded-l-md shadow-md transition-all duration-200 bg-zinc-500 text-white border-l border-t border-b border-zinc-600 hover:translate-x-1 mb-2"
                            title="Back to Content"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                        {slide.extractedData && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTab(prev => ({ ...prev, [slide.id]: activeTab[slide.id] === 'table' ? 'content' : 'table' }));
                              }}
                              className={cn(
                                "px-3 py-2 rounded-l-md shadow-md transition-all duration-200",
                                "border-l border-t border-b",
                                activeTab[slide.id] === 'table' 
                                  ? "bg-blue-500 text-white border-blue-600 translate-x-0" 
                                  : "bg-blue-100 text-blue-700 border-blue-200 hover:translate-x-1"
                              )}
                              title="View/Edit Table"
                            >
                              <Table className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTab(prev => ({ ...prev, [slide.id]: activeTab[slide.id] === 'chart' ? 'content' : 'chart' }));
                              }}
                              className={cn(
                                "px-3 py-2 rounded-l-md shadow-md transition-all duration-200",
                                "border-l border-t border-b",
                                activeTab[slide.id] === 'chart' 
                                  ? "bg-purple-500 text-white border-purple-600 translate-x-0" 
                                  : "bg-purple-100 text-purple-700 border-purple-200 hover:translate-x-1"
                              )}
                              title="View Chart"
                            >
                              <BarChart3 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        {slide.taggedMedia && slide.taggedMedia.length > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveTab(prev => ({ ...prev, [slide.id]: activeTab[slide.id] === 'media' ? 'content' : 'media' }));
                            }}
                            className={cn(
                              "px-3 py-2 rounded-l-md shadow-md transition-all duration-200",
                              "border-l border-t border-b",
                              activeTab[slide.id] === 'media' 
                                ? "bg-pink-500 text-white border-pink-600 translate-x-0" 
                                : "bg-pink-100 text-pink-700 border-pink-200 hover:translate-x-1"
                            )}
                            title="View Tagged Media"
                          >
                            <ImageIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    );
                  })()}
                    
                    {isGeneratingSlide ? (
                      <div className="flex flex-col items-center justify-center h-full">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#FF4301] border-t-transparent mb-3"></div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">Generating slide {index + 1}...</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-2">{slide.title || `Slide ${index + 1}`}</p>
                      </div>
                    ) : editingContentId === slide.id ? (
                      <div 
                        className="h-full relative overflow-visible"
                        onMouseDown={(e) => e.stopPropagation()}
                        onMouseUp={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onTouchEnd={(e) => e.stopPropagation()}
                        onWheel={(e) => e.stopPropagation()}
                        onDragStart={(e) => e.preventDefault()}
                      >
                        <OutlineRichTextEditor
                          value={editingContent || slide.content || ''}
                          onChange={(html) => {
                            setEditingContent(html);
                            if (onSlideContentChange) {
                              onSlideContentChange(slide.id, html);
                            }
                          }}
                          onBlur={() => {
                            // On blur, derive citations/footnotes from the edited content and sync panel
                            try {
                              const { citations, footnotes } = deriveFromContent(editingContent || slide.content || '');
                              if (setCurrentOutline && (citations.length > 0 || footnotes.length > 0)) {
                                setCurrentOutline(prev => {
                                  if (!prev) return prev as any;
                                  const updatedSlides = prev.slides.map(s => {
                                    if (s.id !== slide.id) return s;
                                    const updatedExtracted = {
                                      ...(s.extractedData || {}),
                                      metadata: {
                                        ...(s.extractedData as any)?.metadata || {},
                                        citations: citations.length > 0 ? citations : (s.extractedData as any)?.metadata?.citations
                                      }
                                    } as any;
                                    return { ...s, extractedData: updatedExtracted, citations: (citations.length > 0 ? citations : (s as any).citations), footnotes: (footnotes.length > 0 ? footnotes : (s as any).footnotes) } as any;
                                  });
                                  return { ...prev, slides: updatedSlides } as any;
                                });
                              }
                            } catch {}
                            setEditingContentId(null);
                          }}
                          placeholder="Enter slide content..."
                          editable={!researchingSlides.includes(slide.id)}
                          showToolbar={false}
                          bubbleToolbar={true}
                          className="h-full"
                        />
                      </div>
                    ) : (
                      <>
                        {/* Render based on active tab */}
                        {activeTab[slide.id] === 'table' && slide.extractedData ? (
                          // Table view/edit mode with ChartDataTable component
                          <div className="h-full relative overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-400 dark:scrollbar-thumb-zinc-600 scrollbar-track-transparent">
                            {/* Tiny delete text (affects both chart and table) */}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRemoveExtractedData(slide.id); }}
                              className="absolute top-2 right-2 z-10 text-[10px] leading-none text-zinc-400 hover:text-zinc-600 focus:outline-none"
                              aria-label="Delete chart"
                              title="Delete chart"
                            >
                              delete chart
                            </button>
                            {setCurrentOutline ? (
                              <ChartDataTable 
                                slide={slide} 
                                setCurrentOutline={setCurrentOutline} 
                              />
                            ) : (
                              <p className="text-xs text-zinc-400 dark:text-zinc-500 italic p-4">
                                Table editing not available
                              </p>
                            )}
                          </div>
                        ) : activeTab[slide.id] === 'chart' && slide.extractedData ? (
                          // Chart view mode with actual Highcharts rendering
                          <div className="h-full relative overflow-hidden">
                            {/* Tiny delete text (affects both chart and table) */}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRemoveExtractedData(slide.id); }}
                              className="absolute top-2 right-2 z-10 text-[10px] leading-none text-zinc-400 hover:text-zinc-600 focus:outline-none"
                              aria-label="Delete chart"
                              title="Delete chart"
                            >
                              delete chart
                            </button>
                            <SlideChartViewer extractedData={slide.extractedData} />
                          </div>
                        ) : activeTab[slide.id] === 'media' && slide.taggedMedia && slide.taggedMedia.length > 0 ? (
                          // Media view with AI analysis
                          <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-400 dark:scrollbar-thumb-zinc-600 scrollbar-track-transparent">
                            <TaggedMediaViewer taggedMedia={slide.taggedMedia} />
                          </div>
                        ) : (
                          // Default content view (use the same rich text renderer as edit mode)
                          <div 
                            className="min-h-[100px] cursor-text hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded transition-colors"
                            onClick={() => {
                              setEditingContentId(slide.id);
                              lastEditedSlideIdRef.current = slide.id;
                              // Open editor with current content without modifying/duplicating Sources
                              const current = slide.content || '';
                              setEditingContent(current);
                            }}
                          >
                            <OutlineRichTextEditor
                              value={slide.content || ''}
                              onChange={() => { /* view mode */ }}
                              editable={false}
                              showToolbar={false}
                              bubbleToolbar={false}
                              className="h-full"
                            />
                          </div>
                        )}
                        {/* Citations Panel on slide card in carousel */}
                        {(() => {
                          // Prefer backend-provided footnotes if present on the slide
                          const providedFootnotes = (slide as any)?.footnotes as Array<{ index: number; label: string; url?: string }> | undefined;
                          if (providedFootnotes && providedFootnotes.length > 0) {
                            const meta = slide.extractedData?.metadata?.citations || [];
                            const combined: Array<{ title?: string; source?: string; url?: string }> = [...meta];
                            return (
                              <CitationsPanel
                                citations={combined}
                                editable={true}
                                className="mt-3"
                                footnotes={providedFootnotes as any}
                                onChange={(next) => {
                                  if (!setCurrentOutline) return;
                                  setCurrentOutline(prev => {
                                    if (!prev) return prev as any;
                                    const updatedSlides = prev.slides.map(s => {
                                      if (s.id !== slide.id) return s;
                                      const updatedExtracted = {
                                        ...(s.extractedData || {}),
                                        metadata: {
                                          ...(s.extractedData as any)?.metadata || {},
                                          citations: next
                                        }
                                      } as any;
                                      // Rebuild footnotes from edited citations
                                      const fns = next.map((c, i) => ({ index: i + 1, label: (c.title || c.source || ''), url: c.url })) as any;
                                      return { ...s, extractedData: updatedExtracted, citations: next as any, footnotes: fns } as any;
                                    });
                                    return { ...prev, slides: updatedSlides } as any;
                                  });
                                }}
                              />
                            );
                          }
                          // Build combined citations: metadata citations + content-derived Sources block
                          const meta = slide.extractedData?.metadata?.citations || [];
                          const combined: Array<{ title?: string; source?: string; url?: string }> = [...meta];
                          // Parse content for a Sources block
                          const text = (slide.content || '').replace(/\u2022/g, '•');
                          const lines = text.split(/\n+/);
                          const idxs: number[] = [];
                          for (let i = 0; i < lines.length; i++) {
                            const v = (lines[i] || '').trim();
                            if (/^sources:?$/i.test(v)) idxs.push(i);
                          }
                          if (idxs.length > 0) {
                            const start = idxs[idxs.length - 1] + 1;
                            for (let i = start; i < lines.length; i++) {
                              const raw = (lines[i] || '').trim();
                              if (!raw) continue;
                              if (/^sources:?$/i.test(raw)) continue;
                              if (/^edit sources in slide text or chart metadata\.?$/i.test(raw)) continue;
                              const cleaned = raw.replace(/^\d+[\.)]\s+/, '').replace(/^[•\-*+]\s+/, '').trim();
                              if (!cleaned) continue;
                              // Avoid duplicates by matching label or URL
                              const exists = combined.some(c => ((c.title || c.source || '').trim().toLowerCase() === cleaned.toLowerCase()));
                              if (!exists) combined.push({ title: cleaned, url: '' });
                            }
                          }
                          // Build footnotes (show all, no collapsing of label-only items)
                          const foots: Array<{ index: number; label: string; url: string }>= [];
                          let i = 0;
                          combined.forEach((c, idx) => {
                            const baseLabel = (c.title || c.source || '').trim();
                            const label = baseLabel || `Source ${idx + 1}`;
                            const rawUrl = (c.url || '').trim();
                            if (rawUrl) {
                              let host = rawUrl;
                              try { host = new URL(rawUrl).hostname; } catch { /* ignore */ }
                              const exists = foots.find(f => {
                                try { return new URL(f.url || '').hostname === host; } catch { return (f.url || '') === rawUrl; }
                              });
                              if (!exists) foots.push({ index: ++i, label, url: rawUrl });
                            } else {
                              foots.push({ index: ++i, label, url: '' });
                            }
                          });
                          return foots.length > 0 ? (
                            <CitationsPanel 
                              citations={combined} 
                              editable={true} 
                              className="mt-3" 
                              footnotes={foots}
                              onChange={(next) => {
                                if (!setCurrentOutline) return;
                                setCurrentOutline(prev => {
                                  if (!prev) return prev as any;
                                  const updatedSlides = prev.slides.map(s => {
                                    if (s.id !== slide.id) return s;
                                    const updatedExtracted = {
                                      ...(s.extractedData || {}),
                                      metadata: {
                                        ...(s.extractedData as any)?.metadata || {},
                                        citations: next
                                      }
                                    } as any;
                                    const fns = next.map((c, i) => ({ index: i + 1, label: (c.title || c.source || ''), url: c.url })) as any;
                                    return { ...s, extractedData: updatedExtracted, citations: next as any, footnotes: fns } as any;
                                  });
                                  return { ...prev, slides: updatedSlides } as any;
                                });
                              }}
                            />
                          ) : null;
                        })()}
                        {(!slide.extractedData?.metadata?.citations || slide.extractedData?.metadata?.citations.length === 0) && (() => {
                          // Derive footnotes from content if citations are missing
                          const tokenRegex = /\[(.+?)\]/g;
                          const map = new Map<string, { index: number; label: string; url?: string }>();
                          let i = 0; let m: RegExpExecArray | null;
                          while ((m = tokenRegex.exec(slide.content || '')) !== null) {
                            const token = (m[1] || '').trim();
                            if (/^https?:\/\//i.test(token)) {
                              try { const u = new URL(token); const host = u.hostname; if (!map.has(host)) map.set(host, { index: ++i, label: host, url: u.href }); } catch { /* ignore */ }
                            } else if (/\w+\.[\w.-]+$/.test(token)) {
                              const host = token; if (!map.has(host)) map.set(host, { index: ++i, label: host });
                            }
                          }
                          const footnotes = Array.from(map.values());
                          return footnotes.length > 0 ? <CitationsPanel citations={[]} editable={false} className="mt-3" footnotes={footnotes as any} /> : null;
                        })()}
                      </>
                    )}

                    {/* Remove central loading UI - just use the overlay above */}
                  </div>
                  {/* Tiny grey outlined delete pinned to card corner (stays during inner scroll) */}
                  <div className="absolute bottom-2 right-2 z-40">
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteSlide(slide.id); }}
                      className="px-2 py-0.5 text-[10px] leading-none rounded-md border border-zinc-300 text-zinc-500 bg-transparent hover:text-zinc-700 hover:border-zinc-400 focus:outline-none"
                      aria-label="Delete slide"
                      title="Delete slide"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
        </div>

      </div>

      {/* Mini game widget moved to OutlineDisplayView to ensure it shows in all phases */}

      {/* Slide indicator dots */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex gap-1.5">
        {slidesWithAdd.map((_, index) => (
          <button
            key={index}
            onClick={() => onIndexChange(index)}
            className={cn(
              "w-1.5 h-1.5 rounded-full transition-all duration-200",
              index === currentIndex 
                ? "bg-zinc-900 dark:bg-zinc-100 w-6" 
                : "bg-zinc-300 dark:bg-zinc-600 hover:bg-zinc-400 dark:hover:bg-zinc-500"
            )}
          />
        ))}
      </div>
    </div>
  );
};

export default CardCarousel; 