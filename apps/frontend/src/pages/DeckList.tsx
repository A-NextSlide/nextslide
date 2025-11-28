import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CompleteDeckData } from '@/types/DeckTypes';
import { Button } from '@/components/ui/button';
import { Plus, User as UserIcon, Search as SearchIcon, GripVertical, X, Grid, Trash2, ChevronDown, FilePlus, Pencil, Upload, Link as LinkIcon, Image as ImageIcon, Check, Loader2, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useDeckStore } from '@/stores/deckStore';
import { v4 as uuidv4 } from 'uuid';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import DeckCard from '@/components/deck/DeckCard';
import { ModeToggle } from "@/components/ui/ModeToggle";
import { UserMenu } from "@/components/ui/UserMenu";
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTypewriter } from '@/hooks/useTypewriter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { API_CONFIG } from '@/config/environment';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import OutlineEditor from '@/components/outline/OutlineEditor';
import OutlineDisplayView from '@/components/outline/OutlineDisplayView';
import { authService } from '@/services/authService';

import { shareService } from '@/services/shareService';

import ErrorDisplay from '@/components/common/ErrorDisplay';
import LoadingDisplay from '@/components/common/LoadingDisplay';
import EmptyDeckList from '@/components/deck/EmptyDeckList';
import { useDeckManagement } from '@/hooks/useDeckManagement';
import { useDeckFiltering } from '@/hooks/useDeckFiltering';
import { usePopupDeckPagination } from '@/hooks/usePopupDeckPagination';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import GoogleSlidesImportModal from '@/components/Import/GoogleSlidesImportModal';
import { formatDistanceToNow } from 'date-fns';
import DeckThumbnail from '@/components/deck/DeckThumbnail';
import { useOutlineManager } from '@/hooks/useOutlineManager';
import ChatPanel from '@/components/ChatPanel';
import { DeckOutline as FrontendDeckOutline, SlideOutline as FrontendSlideOutline, TaggedMedia as FrontendTaggedMedia, DiscardedFile as FrontendDiscardedFile, ColorConfig } from '@/types/SlideTypes';
import OutlineHeader from '@/components/outline/OutlineHeader';
import BrandWordmark from '@/components/common/BrandWordmark';
import { useSlideResearch } from '@/hooks/useSlideResearch';
import { useOutlineChat } from '@/hooks/useOutlineChat';
import { cn } from '@/lib/utils';
import { outlineApi } from '@/services/outlineApi';
import { deckSyncService } from '@/lib/deckSyncService';
import { useSlideGeneration } from '@/hooks/useSlideGeneration';
import { GenerationCoordinator } from '@/services/generation/GenerationCoordinator';
import { useAuth } from '@/context/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useThemeStore } from '@/stores/themeStore';
import AppearanceOnboarding, { THEME_ONBOARDING_KEY } from '@/components/onboarding/AppearanceOnboarding';
import ConversationalOnboarding from '@/components/onboarding/ConversationalOnboarding';
import ParticleAnimation from '@/components/visuals/ParticleAnimation';
import { ArrowRight } from 'lucide-react';

// Rotating words animation for hero heading - vertical slot machine style  
const WORDS = ['PROPOSALS', 'STRATEGIES', 'REPORTS', 'DOCS', 'NOTES', 'IDEAS'];

const RotatingWords = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const hasStartedRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Prevent double-execution in React StrictMode
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    // Start animation after a short delay
    const startDelay = setTimeout(() => {
      timerRef.current = setInterval(() => {
        setCurrentIndex(i => {
          const nextIndex = i + 1;
          if (nextIndex >= WORDS.length - 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return WORDS.length - 1;
          }
          return nextIndex;
        });
      }, 2000); // 2 seconds per word - slower for more visible rotation
    }, 800); // Wait 0.8s before starting

    return () => {
      clearTimeout(startDelay);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Character widths for each word to animate container width
  const wordWidths: Record<string, string> = {
    'PROPOSALS': '10ch',
    'STRATEGIES': '11ch',
    'REPORTS': '8ch',
    'DOCS': '5ch', 
    'NOTES': '6ch',
    'IDEAS': '5.5ch',
  };
  
  return (
    <span 
      className="text-orange-500 inline-block overflow-hidden transition-[width] duration-300"
      style={{ 
        height: '1em',
        width: wordWidths[WORDS[currentIndex]],
        verticalAlign: 'baseline',
      }}
    >
      <span
        className="flex flex-col"
        style={{ 
          transform: `translateY(-${currentIndex * 1}em)`,
          transition: 'transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {WORDS.map((word) => (
          <span 
            key={word}
            className="whitespace-nowrap"
            style={{ height: '1em', lineHeight: '1em' }}
          >
            {word}
          </span>
        ))}
      </span>
    </span>
  );
};

// Virtualized deck grid component for better performance with many decks
const VirtualizedDeckGrid = React.memo(({
  decks,
  onEdit,
  onShowDeleteDialog,
  onLoadMore,
  hasMore,
  isLoadingMore,
  isInitialLoad
}: {
  decks: CompleteDeckData[] | any,
  onEdit: (deck: CompleteDeckData) => void,
  onShowDeleteDialog: (deckId: string, event: React.MouseEvent) => void,
  onLoadMore: () => void,
  hasMore: boolean,
  isLoadingMore: boolean,
  isInitialLoad: boolean
}) => {
  const safeDecks: CompleteDeckData[] = Array.isArray(decks) ? decks : [];
  const [renderedDecks, setRenderedDecks] = useState<Set<number>>(() => {
    // Start with first few decks rendered to prevent flash
    return new Set(Array.from({ length: Math.min(6, safeDecks.length) }, (_, i) => i));
  });
  const [initiallyVisibleDecks, setInitiallyVisibleDecks] = useState<Set<number>>(() => {
    // Start with first few decks visible to prevent flash
    return new Set(Array.from({ length: Math.min(6, safeDecks.length) }, (_, i) => i));
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const hasCheckedInitialVisibility = useRef(false);

  // Check initial visibility once when decks are loaded
  useEffect(() => {
    if (!hasCheckedInitialVisibility.current && decks.length > 0 && itemRefs.current.size > 0) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        const visibleIndexes = new Set<number>();

        // Find the scrollable container
        let scrollContainer = containerRef.current?.parentElement;
        while (scrollContainer && scrollContainer !== document.body) {
          const style = window.getComputedStyle(scrollContainer);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
            break;
          }
          scrollContainer = scrollContainer.parentElement;
        }

        const containerRect = scrollContainer?.getBoundingClientRect() || { top: 0, bottom: window.innerHeight };

        // Check which cards are initially visible
        itemRefs.current.forEach((element, index) => {
          const rect = element.getBoundingClientRect();
          // Check if element is in viewport
          if (rect.top < containerRect.bottom && rect.bottom > containerRect.top) {
            visibleIndexes.add(index);
          }
        });

        setInitiallyVisibleDecks(visibleIndexes);
        hasCheckedInitialVisibility.current = true;
      }, 100); // Small delay to ensure layout is complete
    }
  }, [safeDecks.length]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = parseInt(entry.target.getAttribute('data-index') || '0');
          if (entry.isIntersecting) {
            // Once visible, always rendered
            setRenderedDecks((prev) => new Set(prev).add(index));
          }
        });
      },
      {
        root: null,
        rootMargin: '100px', // Load items 100px before they become visible
        threshold: 0
      }
    );

    // Observe all deck placeholders
    itemRefs.current.forEach((element) => {
      observer.observe(element);
    });

    return () => {
      observer.disconnect();
    };
  }, [safeDecks.length]);

  // Set up infinite scroll observer
  useEffect(() => {
    // Find the scrollable container
    const findScrollContainer = () => {
      let element = containerRef.current?.parentElement;
      while (element && element !== document.body) {
        const style = window.getComputedStyle(element);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
          return element;
        }
        element = element.parentElement;
      }
      return null;
    };

    scrollContainerRef.current = findScrollContainer();

    if (!scrollContainerRef.current || !loadMoreTriggerRef.current || !hasMore) return;

    const scrollObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          onLoadMore();
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '200px',
        threshold: 0
      }
    );

    scrollObserver.observe(loadMoreTriggerRef.current);

    return () => {
      scrollObserver.disconnect();
    };
  }, [hasMore, isLoadingMore, onLoadMore]);

  return (
    <div ref={containerRef} className="grid grid-cols-1 gap-6 auto-rows-max">
      {safeDecks.map((deck, index) => {
        // Only animate if this card was initially visible
        const shouldAnimate = initiallyVisibleDecks.has(index);
        const shouldRender = renderedDecks.has(index);

        return (
          <div
            key={deck.uuid}
            ref={(el) => {
              if (el) itemRefs.current.set(index, el);
            }}
            data-index={index}
            className="min-h-[200px]" // Reserve space for the card
          >
            {shouldRender ? (
              <DeckCard
                deck={deck}
                onEdit={onEdit}
                onShowDeleteDialog={onShowDeleteDialog}
                index={index}
                shouldAnimate={shouldAnimate}
              />
            ) : (
              // Placeholder to maintain scroll position
              <div>
                <div className="aspect-[16/9] bg-zinc-200 dark:bg-zinc-800 rounded-lg"></div>
                <div className="mt-3 space-y-2">
                  <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-3/4"></div>
                  <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-1/2"></div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Load more trigger */}
      {hasMore && (
        <div ref={loadMoreTriggerRef} className="py-4">
          {isLoadingMore ? (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="h-1" /> // Invisible trigger
          )}
        </div>
      )}
    </div>
  );
});

VirtualizedDeckGrid.displayName = 'VirtualizedDeckGrid';

// Virtualized deck grid for the popup dialog with different layout and infinite scrolling
const VirtualizedPopupDeckGrid = React.memo(({
  decks,
  onEdit,
  onShowDeleteDialog,
  onLoadMore,
  hasMore,
  isLoadingMore
}: {
  decks: CompleteDeckData[] | any,
  onEdit: (deck: CompleteDeckData) => void,
  onShowDeleteDialog: (deckId: string, event: React.MouseEvent) => void,
  onLoadMore: () => void,
  hasMore: boolean,
  isLoadingMore: boolean
}) => {
  const safeDecks: CompleteDeckData[] = Array.isArray(decks) ? decks : [];
  const [visibleDecks, setVisibleDecks] = useState<Set<number>>(() => {
    // Start with all decks visible to prevent flash on initial load
    return new Set(Array.from({ length: safeDecks.length }, (_, i) => i));
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = parseInt(entry.target.getAttribute('data-index') || '0');
          setVisibleDecks((prev) => {
            const next = new Set(prev);
            if (entry.isIntersecting) {
              next.add(index);
            } else {
              next.delete(index);
            }
            return next;
          });
        });
      },
      {
        root: null,
        rootMargin: '50px',
        threshold: 0
      }
    );

    itemRefs.current.forEach((element) => {
      observer.observe(element);
    });

    return () => {
      observer.disconnect();
    };
  }, [safeDecks.length]);

  // Set up infinite scroll observer
  useEffect(() => {
    // Find the scrollable container (the dialog content's scrollable area)
    const findScrollContainer = () => {
      let element = containerRef.current?.parentElement;
      while (element && element !== document.body) {
        const style = window.getComputedStyle(element);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
          return element;
        }
        element = element.parentElement;
      }
      return null;
    };

    scrollContainerRef.current = findScrollContainer();

    if (!scrollContainerRef.current || !loadMoreTriggerRef.current || !hasMore) return;

    const scrollObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          onLoadMore();
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '200px',
        threshold: 0
      }
    );

    scrollObserver.observe(loadMoreTriggerRef.current);

    return () => {
      scrollObserver.disconnect();
    };
  }, [hasMore, isLoadingMore, onLoadMore]);

  return (
    <div ref={containerRef} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 w-full">
      {safeDecks.map((deck, index) => (
        <div
          key={deck.uuid}
          ref={(el) => {
            if (el) itemRefs.current.set(index, el);
          }}
          data-index={index}
          className="min-h-[150px]"
        >
          {visibleDecks.has(index) ? (
            <div
              className="group relative cursor-pointer border hover:shadow-md transition-all duration-300 rounded-lg overflow-hidden"
              onClick={() => onEdit(deck)}
            >
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
                <div className="absolute inset-0 w-full h-full flex items-center justify-center">
                  <DeckThumbnail deck={deck} />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-800/70 dark:from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-2">
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        onShowDeleteDialog(deck.uuid || '', e);
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="p-3">
                <div className="flex flex-col items-start">
                  <h3 className="text-xs font-black text-foreground break-words border-0">
                    {deck.name || 'Untitled presentation'}
                  </h3>
                  <span className="text-xs text-muted-foreground whitespace-nowrap mt-0.5">
                    Updated {formatDistanceToNow(new Date(deck.lastModified), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="aspect-[16/9] bg-zinc-200 dark:bg-zinc-800"></div>
              <div className="p-3 space-y-2">
                <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-3/4"></div>
                <div className="h-2 bg-zinc-200 dark:bg-zinc-800 rounded w-1/2"></div>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Load more trigger */}
      {hasMore && (
        <div ref={loadMoreTriggerRef} className="col-span-full py-4">
          {isLoadingMore ? (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="h-1" /> // Invisible trigger
          )}
        </div>
      )}
    </div>
  );
});

VirtualizedPopupDeckGrid.displayName = 'VirtualizedPopupDeckGrid';

// Component instance counter for debugging
let componentInstanceCount = 0;

/**
 * DeckList page component that displays all available decks
 */
const DeckList: React.FC = () => {
  const instanceId = useRef(`DeckList_${++componentInstanceCount}_${Date.now()}`);
  const { isAuthenticated, refreshAdminStatus } = useAuth();
  const hasCalledAdminCheckRef = useRef(false);

  // Get deck management state and functions first, before using isLoading
  const {
    decks,
    isLoading,
    isLoadingMore,
    error,
    authError,
    deckToDelete,
    isDeleting,
    hasMore,
    loadDecks,
    loadMoreDecks,
    handleCreateDeck,
    handleEditDeck,
    handleShowDeleteDialog,
    handleConfirmDelete,
    handleCancelDelete,
  } = useDeckManagement();

  useEffect(() => {
    // Don't clear preferences on mount - they may have been set by OutlineEditor
    // Just ensure the unmounting flag is cleared
    if (typeof window !== 'undefined') {
      // We are fully on deck list; clear unmounting flag
      (window as any).__isUnmounting = false;
      console.log('[DeckList] Mounted, preserving any existing slide generation preferences');
    }

    return () => {
    };
  }, []);

  // Defer admin check until decks finish initial loading to avoid competing with priority load
  useEffect(() => {
    if (!isAuthenticated || hasCalledAdminCheckRef.current || isLoading) return;
    hasCalledAdminCheckRef.current = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          try {
            await fetch('/api/admin/check', {
              method: 'GET',
              headers: { 'Authorization': `Bearer ${token}` },
            });
          } catch { }
        }
      } finally {
        try { await refreshAdminStatus(); } catch { }
      }
    })();
  }, [isAuthenticated, isLoading, refreshAdminStatus]);

  // Search state for the main side navigation
  const { searchQuery, setSearchQuery, filteredDecks } = useDeckFiltering(decks);

  // Slide generation hook for handling slide images
  const { handleGenerationProgress: onSlideImagesFound } = useSlideGeneration('');

  // Popup deck pagination
  const {
    popupDecks,
    isLoadingPopup,
    isLoadingMorePopup,
    hasMorePopup,
    hasLoadedInitialPopup,
    loadPopupDecks,
    loadMorePopupDecks,
    resetPopupDecks
  } = usePopupDeckPagination();

  // Separate search state for the popup
  const [popupSearchQuery, setPopupSearchQuery] = useState('');
  const filteredPopupDecks = useMemo(() => {
    if (!popupSearchQuery.trim()) return popupDecks;

    const query = popupSearchQuery.toLowerCase().trim();
    return popupDecks.filter(deck =>
      (deck.name || '').toLowerCase().includes(query)
    );
  }, [popupDecks, popupSearchQuery]);

  // Handle popup search changes
  const handlePopupSearchChange = (value: string) => {
    setPopupSearchQuery(value);
    // Note: When searching, we filter the already loaded decks
    // Infinite scroll is disabled during search (see hasMore prop in VirtualizedPopupDeckGrid)
  };

  const navigate = useNavigate();
  const { toast, dismiss } = useToast();
  const [isOutlineProcessing, setIsOutlineProcessing] = useState(false);

  // State for resizable panel
  const [deckListWidth, setDeckListWidth] = useState(20); // Default width 20%
  const [isResizing, setIsResizing] = useState(false);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null); // For throttling resize updates

  // State for slides gallery
  const [showGallery, setShowGallery] = useState(false);
  const [showGoogleImport, setShowGoogleImport] = useState(false);
  const [showAppearanceOnboarding, setShowAppearanceOnboarding] = useState(false);
  const [showConversationalOnboarding, setShowConversationalOnboarding] = useState(false);
  const [isAgentThinking, setIsAgentThinking] = useState(false);
  const [heroInput, setHeroInput] = useState('');
  const [isUserTyping, setIsUserTyping] = useState(false);

  // Debounce typing state
  useEffect(() => {
    if (heroInput.length > 0) {
      setIsUserTyping(true);
      const timeout = setTimeout(() => setIsUserTyping(false), 1000);
      return () => clearTimeout(timeout);
    } else {
      setIsUserTyping(false);
    }
  }, [heroInput]);

  // Hero input state
  const [detailLevel, setDetailLevel] = useState<'quick' | 'standard' | 'detailed'>('quick');
  const [slideCount, setSlideCount] = useState<number | undefined>(undefined);
  const typewriterText = useTypewriter({
    phrases: [
      'a pitch deck for my startup',
      'a lecture on history',
      'a strategy for world domi...\b\b\b\b\b\b\b\bgrowth',
      'a marketing proposal'
    ],
    typingSpeed: 50,
    deletingSpeed: 30,
    pauseDuration: 2000
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);
  const [linkInput, setLinkInput] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setUploadedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  // Hero section drag and drop state and handlers
  const [isHeroDraggingOver, setIsHeroDraggingOver] = useState(false);
  const heroDragCounterRef = useRef(0);

  const handleHeroDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    heroDragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsHeroDraggingOver(true);
    }
  };

  const handleHeroDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleHeroDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    heroDragCounterRef.current--;
    if (heroDragCounterRef.current === 0) {
      setIsHeroDraggingOver(false);
    }
  };

  const handleHeroDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    heroDragCounterRef.current = 0;
    setIsHeroDraggingOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setUploadedFiles(prev => [...prev, ...files]);
    }
  };

  const handleLinkAdd = () => {
    if (linkInput.trim()) {
      // For now just clear it, in real app we'd validate and add to a list
      setLinkInput('');
      setIsLinkPopoverOpen(false);
      toast({
        title: "Link added",
        description: "Link has been added to context",
      });
    }
  };

  // State for shared decks
  const [sharedDecks, setSharedDecks] = useState<CompleteDeckData[]>([]);
  const [isLoadingShared, setIsLoadingShared] = useState(false);
  const [sharedDecksError, setSharedDecksError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('by-me');

  const createDefaultDeckForOutline = useDeckStore(state => state.createDefaultDeck);
  const updateDeckDataForOutline = useDeckStore(state => state.updateDeckData);

  // Outline state
  const [currentOutline, setCurrentOutline] = useState<FrontendDeckOutline | null>(null);
  const [showOutlineView, setShowOutlineView] = useState(false);
  const [outlineCurrentSlideIndex, setOutlineCurrentSlideIndex] = useState(0);

  // Initialize OutlineManager here
  const {
    resetOutline,
    handleAddSlide,
    handleSlideTitleChange,
    handleSlideContentChange,
    handleSlideReorder,
    handleToggleDeepResearch,
    handleDeleteSlide,
  } = useOutlineManager(currentOutline, setCurrentOutline);

  // State for uploaded files
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  // Create an adapter function for index-based reordering
  const handleSlideReorderByIndex = useCallback((fromIndex: number, toIndex: number) => {
    if (!currentOutline || !currentOutline.slides) {
      console.error('[DeckList] No outline or slides available for reordering');
      return;
    }

    const fromSlide = currentOutline.slides[fromIndex];
    const toSlide = currentOutline.slides[toIndex];

    if (!fromSlide || !toSlide) {
      console.error('[DeckList] Invalid slide indices for reordering', { fromIndex, toIndex, slidesLength: currentOutline.slides.length });
      return;
    }

    handleSlideReorder(fromSlide.id, toSlide.id);
  }, [currentOutline, handleSlideReorder]);

  // Handle manual mode creation
  const handleManualMode = useCallback(() => {
    // Create a manual outline with initial slide
    const manualOutline = {
      id: uuidv4(),
      title: 'Manual Presentation',
      topic: 'Manual Presentation',
      slides: [{
        id: uuidv4(),
        title: 'Slide 1',
        content: '',
        deepResearch: false,
        taggedMedia: [],
        narrative_role: 'supporting',
        slide_type: 'content',
        speaker_notes: '',
        chartData: null,
        chartType: null
      }],
      isManualMode: true
    };

    setCurrentOutline(manualOutline);
  }, [setCurrentOutline]);

  // State to hold conversational data for outline generation
  const [conversationalData, setConversationalData] = useState<{
    topic?: string;
    stylePreferences?: string;
    slideCount?: number;
    detailLevel?: 'quick' | 'standard' | 'detailed';
    uploadedFiles?: File[];
    uploadedMedia?: Array<{
      id: string;
      name: string;
      type: string;
      content?: string;
      url?: string;
      size?: number;
    }>;
  } | null>(null);

  // Handle "Create with AI" - show conversational onboarding
  const handleCreateWithAI = useCallback(() => {
    setShowConversationalOnboarding(true);
  }, []);

  // Handle completion of conversational onboarding
  const handleConversationalComplete = useCallback((data: {
    topic?: string;
    stylePreferences?: string;
    slideCount?: number;
    detailLevel?: 'quick' | 'standard' | 'detailed';
    themeChanges?: any;
    uploadedFiles?: File[];
    uploadedMedia?: Array<{
      id: string;
      name: string;
      type: string;
      content?: string;
      url?: string;
      size?: number;
    }>;
  }) => {
    console.log('[DeckList] Conversational onboarding complete:', data);
    console.log('[DeckList] Uploaded files count:', data.uploadedFiles?.length || 0);
    console.log('[DeckList] Uploaded media from agent:', data.uploadedMedia?.length || 0, data.uploadedMedia);

    // Hide conversational onboarding
    setShowConversationalOnboarding(false);

    // CRITICAL: Clear any cached theme data from previous outlines
    // This ensures fresh theme colors from the API are used, not stale cached colors
    const themeStore = useThemeStore.getState();
    themeStore.setThemeReady(false); // Reset theme ready state
    
    // Update style preferences with collected data - CLEAR any old colors!
    setStylePreferences({
      initialIdea: data.topic,
      vibeContext: data.stylePreferences,
      colors: undefined, // Clear old colors so API colors take precedence
    });

    // Store conversational data to trigger generation
    setConversationalData(data);

    // Apply theme changes immediately if present
    if (data.themeChanges) {
      console.log('[DeckList] Applying theme changes from conversation:', data.themeChanges);
      const themeStore = useThemeStore.getState();

      if (data.themeChanges.brand) {
        const brandName = data.themeChanges.brand.name || 'Custom Brand';
        // Create a custom theme based on the brand
        const newThemeId = themeStore.addCustomTheme({
          name: brandName,
          page: {
            backgroundColor: '#FFFFFF',
          },
          typography: {
            paragraph: {
              fontFamily: 'Inter',
              color: '#000000',
              fontSize: '16px',
              fontWeight: 400,
              lineHeight: 1.5
            },
            heading: {
              fontFamily: 'Inter',
              color: '#000000',
              fontSize: '32px',
              fontWeight: 700
            }
          },
          accent1: '#FF4301',
          accent2: '#333333'
        });
        themeStore.setWorkspaceTheme(newThemeId);
      } else if (data.themeChanges.colors) {
        // If just colors were requested, we might want to trigger a theme generation
        // Theme will be marked ready when the actual theme is applied in OutlineDisplayView
      }

      // DON'T set themeReady(true) here - let OutlineDisplayView show loading until actual theme arrives
      // themeStore.setThemeReady(true);
    }

    // Show outline view - OutlineEditor will see conversationalData and start generation
    // Create a placeholder outline so the view doesn't stay blank
    const newOutlineId = uuidv4();
    const placeholderOutline: FrontendDeckOutline = {
      id: newOutlineId,
      title: data.topic || 'Generating Presentation...',
      slides: []
    };
    
    // CRITICAL: Clear any cached theme for this new outline ID
    // This ensures fresh theme from API is used
    themeStore.setOutlineDeckTheme?.(newOutlineId, null);
    themeStore.clearOutlineThemeRequested?.(newOutlineId);
    
    setCurrentOutline(placeholderOutline);
    setIsOutlineChatGenerating(true); // Immediately show loading state
    setShowOutlineView(true);
  }, []);

  // Function to load shared decks
  const loadSharedDecks = useCallback(async () => {
    setIsLoadingShared(true);
    setSharedDecksError(null);

    try {
      const response = await shareService.getSharedDecks('shared');

      if (response.success && response.data) {
        setSharedDecks(response.data);
      } else {
        setSharedDecksError(response.error || 'Failed to load shared presentations');
      }
    } catch (error) {
      console.error('[DeckList] Error loading shared decks:', error);
      setSharedDecksError('Failed to load shared presentations');
    } finally {
      setIsLoadingShared(false);
    }
  }, []);

  // Load shared decks when the component mounts
  useEffect(() => {
    loadSharedDecks();
  }, [loadSharedDecks]);

  // Lifted from OutlineEditor
  const {
    researchingSlides,
    totalResearchSlides,
    completedResearchSlides,
    handleStartResearch,
  } = useSlideResearch(currentOutline, setCurrentOutline);

  const isResearching = researchingSlides.length > 0;

  // Lifted from OutlineEditor: Deck Generation state and function
  const [isDeckGenerating, setIsDeckGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{
    currentSlide: number;
    totalSlides: number;
    slideTitle?: string;
  } | null>(null);



  // Get progress info from useOutlineChat through OutlineEditor
  const [outlineProgress, setOutlineProgress] = useState<{
    stage: string | null;
    progress: { current: number; total: number } | null;
  }>({
    stage: null,
    progress: null
  });

  // Need isOutlineGenerating state from OutlineEditor to pass to OutlineHeader
  // This is a bit tricky as useOutlineChat is deep inside OutlineEditor.
  // For now, OutlineEditor will need a prop to report its internal isGenerating state.
  const [isOutlineChatGenerating, setIsOutlineChatGenerating] = useState(false);

  // Track research/thinking streaming events from OutlineEditor to feed the left Thinking tab
  const [outlineResearchEvents, setOutlineResearchEvents] = useState<any[]>([]);

  // Callback to capture research events from OutlineEditor
  const handleResearchEventsUpdate = useCallback((events: any[]) => {
    console.warn('[DeckList] Received research events:', events?.length || 0, events);
    setOutlineResearchEvents(events);
  }, []);

  // Track when deck list is ready for interaction
  const [isDeckListReady, setIsDeckListReady] = useState(false);
  const [showStar, setShowStar] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Style preferences state lifted from OutlineEditor
  const [stylePreferences, setStylePreferences] = useState<{
    initialIdea?: string;
    vibeContext?: string;
    font?: string | null;
    colors?: ColorConfig | null;
    autoSelectImages?: boolean;
    referenceLinks?: string[];
    enableResearch?: boolean;
  }>({});

  // Auto-open Google import modal on successful OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openImport = params.get('openGoogleImport');
    const googleConnected = params.get('google');
    if (googleConnected === 'connected' && openImport === '1') {
      setShowGoogleImport(true);
      // Clean the URL
      params.delete('google');
      params.delete('openGoogleImport');
      const newUrl = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, '');
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  // Prevent flash on mount
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Set deck list ready when decks are loaded
  useEffect(() => {
    if (!isLoading && decks !== undefined) {
      // Small delay to ensure smooth transition
      const timer = setTimeout(() => {
        setIsDeckListReady(true);


        // Show star after deck list is ready and rendered
        setTimeout(() => {
          setShowStar(true);

        }, 50);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading, decks]);

  // Clear outline state when component mounts or when navigating back
  useEffect(() => {
    // Enable scrolling on this page
    document.documentElement.style.position = '';
    document.documentElement.style.overflow = '';
    document.body.style.position = '';
    document.body.style.overflow = '';

    // Clear any persisted outline state when navigating back to deck list
    resetOutline(); // Use the reset function to ensure clean state
    setShowOutlineView(false);
    setIsOutlineChatGenerating(false);
    setIsOutlineProcessing(false);

    // Only reset deck store if we're coming back from an editor
    const lastEditedDeckId = sessionStorage.getItem('lastEditedDeckId');
    if (lastEditedDeckId) {

      const deckStoreState = useDeckStore.getState();
      if (deckStoreState.resetStore) {
        deckStoreState.resetStore();
      }
      // Clear the session storage to prevent repeated resets
      sessionStorage.removeItem('lastEditedDeckId');
      sessionStorage.removeItem('lastGeneratedDeckId');
    }

    return () => {
      // Don't abort deck generation on cleanup - let it complete
      // The abort should only happen on explicit error or user cancellation

      // Reset to fixed positioning when leaving the page (for editor)
      document.documentElement.style.position = 'fixed';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.overflow = 'hidden';
    };
  }, []); // Empty dependency array - only run on mount

  // Show appearance onboarding only on first visit to the app page
  useEffect(() => {
    try {
      const hasOnboarded = localStorage.getItem(THEME_ONBOARDING_KEY);
      if (!hasOnboarded) {
        setShowAppearanceOnboarding(true);
      }
    } catch { }
  }, []);

  // Callback to receive style preference updates from OutlineEditor
  const handleStylePreferencesUpdate = useCallback((preferences: {
    initialIdea?: string;
    vibeContext?: string;
    font?: string | null;
    colors?: ColorConfig | null;
    autoSelectImages?: boolean;
    referenceLinks?: string[];
    enableResearch?: boolean;
  }) => {
    setStylePreferences(preferences);
  }, []);

  // Simplified deck generation using GenerationCoordinator
  const handleGenerateDeckInternal = useCallback(async () => {
    // Validate outline
    if (!currentOutline) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No outline available to generate a presentation.",
      });
      return;
    }

    // Check if outline has slides
    if (!currentOutline.slides || currentOutline.slides.length === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "The outline needs at least one slide.",
      });
      return;
    }

    setIsDeckGenerating(true);
    setGenerationProgress(null);

    let deckId = '';
    let navigatedDeckId: string | null = null;
    const deckName = currentOutline?.title || '';

    const persistDeckContext = (targetDeckId: string) => {
      if (!targetDeckId) return;

      try {
        sessionStorage.setItem('lastEditedDeckId', targetDeckId);
        sessionStorage.setItem('activeGenerationDeckName', deckName);
      } catch { }

      if (typeof window !== 'undefined') {
        (window as any).__activeGenerationDeckId = targetDeckId;
        (window as any).__activeGenerationDeckName = deckName;
      }
    };

    const navigateToDeck = (targetDeckId: string) => {
      if (!targetDeckId || navigatedDeckId === targetDeckId) {
        return;
      }

      navigatedDeckId = targetDeckId;
      navigate(`/deck/${targetDeckId}?new=true`);
    };

    // DON'T navigate yet - wait for deck_created event from backend
    // The navigation will happen when we receive the deck_created event
    if (currentOutline?.id) {
      deckId = currentOutline.id;
      // Navigation removed - happens in onProgress callback when deck_created event is received
    }
    try {
      // Reset deck store before generation
      useDeckStore.getState().resetStore();

      // Clear any stale deck ID from session storage
      sessionStorage.removeItem('lastEditedDeckId');

      // Use GenerationCoordinator to handle the generation
      const coordinator = GenerationCoordinator.getInstance();

      // Store autoSelectImages preference globally
      // PRIORITY: Use existing window preference (from toggle), then outline preference, then default to TRUE
      // This prevents overwriting what the toggle already set!
      const existingWindowPref = typeof window !== 'undefined'
        ? (window as any).__slideGenerationPreferences?.autoSelectImages
        : undefined;

      const autoSelectImagesValue =
        existingWindowPref !== undefined
          ? existingWindowPref // ✅ Use what the toggle already set
          : currentOutline?.stylePreferences?.autoSelectImages !== undefined
            ? currentOutline.stylePreferences.autoSelectImages
            : true; // Default to TRUE - auto-apply images by default for better UX

      console.log('[DeckList] 🔴 Setting autoSelectImages preference before generation');
      console.log('[DeckList] 🔴 Existing window preference:', existingWindowPref);
      console.log('[DeckList] 🔴 currentOutline.stylePreferences:', currentOutline?.stylePreferences);
      console.log('[DeckList] 🔴 stylePreferences:', stylePreferences);
      console.log('[DeckList] 🔴 Final autoSelectImages value:', autoSelectImagesValue);

      if (typeof window !== 'undefined') {
        (window as any).__slideGenerationPreferences = {
          autoSelectImages: autoSelectImagesValue
        };
        console.log('[DeckList] 🔴 Set window.__slideGenerationPreferences:', (window as any).__slideGenerationPreferences);
      }

      // Attach current workspace theme into outline so backend can skip theme creation
      const outlineDeckTheme = useThemeStore.getState().getOutlineDeckTheme?.(currentOutline.id);
      const wsTheme = useThemeStore.getState().getWorkspaceTheme?.();

      // CRITICAL FIX: Use outlineDeckTheme directly which already has the full color palette
      // The wsTheme only has accent1/accent2, but outlineDeckTheme has the complete colors array
      let finalTheme: any = null;

      if (outlineDeckTheme && outlineDeckTheme.color_palette) {
        // outlineDeckTheme is already in backend format with full color palette - use it directly!
        finalTheme = outlineDeckTheme;

        // Update the workspace theme colors if they changed (to keep UI in sync)
        if (wsTheme) {
          const accent1 = wsTheme.accent1 || outlineDeckTheme.color_palette.accent_1;
          const accent2 = wsTheme.accent2 || outlineDeckTheme.color_palette.accent_2;

          // CRITICAL: Ensure accent_1 and accent_2 are at the FRONT of the colors array
          // This tells the AI these are the PRIMARY brand colors to use
          const existingColors = Array.isArray(outlineDeckTheme.color_palette.colors)
            ? outlineDeckTheme.color_palette.colors
            : [];

          // Remove accent_1 and accent_2 from wherever they are in the array
          const otherColors = existingColors.filter((c: string) => {
            const cl = String(c || '').toLowerCase();
            return cl !== String(accent1 || '').toLowerCase() &&
              cl !== String(accent2 || '').toLowerCase();
          });

          // Put accent_1 and accent_2 at the FRONT, then add the rest
          const reorderedColors = [accent1, accent2, ...otherColors].filter(Boolean);

          finalTheme = {
            ...outlineDeckTheme,
            color_palette: {
              ...outlineDeckTheme.color_palette,
              primary_background: wsTheme.page?.backgroundColor || outlineDeckTheme.color_palette.primary_background,
              primary_text: wsTheme.typography?.paragraph?.color || outlineDeckTheme.color_palette.primary_text,
              accent_1: accent1,
              accent_2: accent2,
              // Put accent colors at the FRONT of the array so AI uses them as primary colors
              colors: reorderedColors
            },
            typography: {
              ...outlineDeckTheme.typography,
              hero_title: {
                ...(outlineDeckTheme.typography?.hero_title || {}),
                family: wsTheme.typography?.heading?.fontFamily || outlineDeckTheme.typography?.hero_title?.family || 'Inter'
              },
              body_text: {
                ...(outlineDeckTheme.typography?.body_text || {}),
                family: wsTheme.typography?.paragraph?.fontFamily || outlineDeckTheme.typography?.body_text?.family || 'Inter'
              }
            }
          };
        } else {
          // Even without wsTheme updates, ensure accents are at the front
          const accent1 = outlineDeckTheme.color_palette.accent_1;
          const accent2 = outlineDeckTheme.color_palette.accent_2;
          const existingColors = Array.isArray(outlineDeckTheme.color_palette.colors)
            ? outlineDeckTheme.color_palette.colors
            : [];

          const otherColors = existingColors.filter((c: string) => {
            const cl = String(c || '').toLowerCase();
            return cl !== String(accent1 || '').toLowerCase() &&
              cl !== String(accent2 || '').toLowerCase();
          });

          const reorderedColors = [accent1, accent2, ...otherColors].filter(Boolean);

          finalTheme = {
            ...outlineDeckTheme,
            color_palette: {
              ...outlineDeckTheme.color_palette,
              colors: reorderedColors
            }
          };
        }

        // Ensure logo is passed along if available
        const logoUrl = (currentOutline as any)?.stylePreferences?.logoUrl ||
          outlineDeckTheme?.logo?.url ||
          outlineDeckTheme?.logo_info?.url ||
          outlineDeckTheme?.brandInfo?.logoUrl;
        if (logoUrl && !finalTheme.logo) {
          finalTheme.logo = { url: logoUrl };
        }
      } else if (wsTheme) {
        // Fallback: map from workspace theme (this should rarely happen now)
        const bg = wsTheme.page?.backgroundColor || '#ffffff';
        const accent1 = wsTheme.accent1 || '#FF4301';
        const accent2 = wsTheme.accent2 || accent1;
        const headingFamily = wsTheme.typography?.heading?.fontFamily || 'Inter';
        const paragraphFamily = wsTheme.typography?.paragraph?.fontFamily || 'Inter';
        const textColor = wsTheme.typography?.paragraph?.color || '#1f2937';

        finalTheme = {
          theme_name: wsTheme.name || 'Custom Theme',
          color_palette: {
            primary_background: bg,
            accent_1: accent1,
            accent_2: accent2,
            primary_text: textColor,
            colors: [accent1, accent2] // Limited fallback
          },
          typography: {
            hero_title: { family: headingFamily },
            body_text: { family: paragraphFamily }
          },
          visual_style: {}
        };
      }

      const outlineWithTheme: any = {
        ...currentOutline,
        notes: {
          ...(currentOutline as any).notes,
          ...(finalTheme ? { theme: finalTheme } : {})
        }
      };

      // Start generation - this will return immediately with deck ID
      const resultPromise = coordinator.generateFromOutline(
        outlineWithTheme,
        stylePreferences,
        (event) => {
          // Pass events to slide generation hook
          onSlideImagesFound(event);

          // Handle deck creation start - capture deck ID immediately
          const emittedDeckId = (event as any).deck_id || (event as any).deck_uuid || (event as any).deckId || (event as any).deckUUID;
          if (emittedDeckId) {
            deckId = emittedDeckId;
            persistDeckContext(emittedDeckId);
            navigateToDeck(emittedDeckId);
          }

          // Track slide generation progress - but we're already on the deck page
          if (event.type === 'slide_started' || event.type === 'progress') {
            const slideIndex = event.slide_index || event.data?.slide_index || 0;
            const slideTitle = event.slide_title || event.data?.slide_title || '';
            const totalSlides = event.total_slides || currentOutline?.slides?.length || 0;

            // Still update progress for any UI that might be showing it
            setGenerationProgress({
              currentSlide: slideIndex + 1,
              totalSlides: totalSlides,
              slideTitle: slideTitle
            });
          }

          // Handle completion
          if (event.type === 'deck_complete' || event.type === 'complete') {
            // Clear generation progress
            setGenerationProgress(null);

            // Clean up active generation marker
            if (typeof window !== 'undefined') {
              delete (window as any).__activeGenerationDeckId;
            }
          }
        }
      );

      // Wait for the generation to complete
      const result = await resultPromise;
      deckId = result.deckId;
      persistDeckContext(deckId);
      navigateToDeck(deckId);

      toast({
        title: "🎉 Deck Created!",
        description: "Your presentation is ready!",
        duration: 3000,
      });

    } catch (error: any) {
      console.error('[DeckList] Error generating deck:', error);

      // Only show error toast if it's not a duplicate generation
      if (!error.message?.includes('already in progress')) {
        toast({
          variant: "destructive",
          title: "Error",
          description: error.message || "Failed to generate presentation. Please try again.",
        });
      }
    } finally {
      setIsDeckGenerating(false);
      setGenerationProgress(null);
    }
  }, [currentOutline, isDeckGenerating, toast, navigate, stylePreferences, setCurrentOutline, onSlideImagesFound]);

  // Simplified wrapper - coordinator handles all duplicate prevention
  const handleGenerateDeck = useCallback(() => {
    handleGenerateDeckInternal();
  }, [handleGenerateDeckInternal]);



  // Handle resize drag functionality
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      animationFrameRef.current = requestAnimationFrame(() => {
        const windowWidth = window.innerWidth;
        // deckListWidth is the width of the right panel.
        // Its left edge is being dragged.
        // If e.clientX is the mouse position from the left of the screen,
        // the width of the right panel in pixels is (windowWidth - e.clientX).
        let newWidthPct = ((windowWidth - e.clientX) / windowWidth) * 100;

        // Constrain width between 15% and 40%
        newWidthPct = Math.min(Math.max(newWidthPct, 15), 40);
        setDeckListWidth(newWidthPct);
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isResizing]);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  // Extract all slides from all decks
  const allSlides = decks.flatMap(deck =>
    (deck.slides || []).map(slide => ({
      ...slide,
      deckName: deck.name || 'Untitled presentation',
      deckId: deck.uuid
    }))
  );

  // Reset popup search and load data when opening/closing the dialog
  const handleDialogOpenChange = (open: boolean) => {

    if (open) {
      // Load popup decks when opening the dialog
      // Always load if we don't have any decks and not currently loading
      if (popupDecks.length === 0 && !isLoadingPopup) {
        loadPopupDecks();
      }
    } else {
      // Reset search when closing
      setPopupSearchQuery('');
    }
    setShowGallery(open);
  };

  // Do not block the outline UI with a global loader while decks list is loading.
  // The right panel handles its own skeletons. This keeps the outline/research view visible.

  if (error && !isLoading) {
    return <ErrorDisplay error={error} onRetry={() => window.location.reload()} />;
  }

  return (
    <div className="h-screen bg-white dark:bg-black flex flex-col overflow-hidden relative font-sans">
      <ParticleAnimation
        isTyping={isUserTyping}
        isLoading={isOutlineChatGenerating || isDeckGenerating || isAgentThinking}
      />
      {/* <div className="noise-overlay pointer-events-none"></div> */}



      <header className="w-full bg-transparent flex items-center justify-between px-6 py-4 z-20 relative">
        <div className="w-32"></div> {/* Spacer for centering */}
        <div className="absolute left-1/2 -translate-x-1/2">
          {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
          {/* @ts-ignore allow custom tag */}
          <BrandWordmark
            tag="h1"
            className="text-[#383636] dark:text-gray-300"
            sizePx={18.95}
            xImageUrl="/brand/nextslide-x.png"
            gapLeftPx={-3}
            gapRightPx={-8}
            liftPx={-3}
            xLiftPx={-4}
            rightLiftPx={0}
          />
        </div>
        <div className="flex items-center gap-4">
          {!(currentOutline || isOutlineChatGenerating || showConversationalOnboarding) && (
            <div className="flex items-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 px-2 text-xs font-medium text-[#383636] hover:text-[#383636] hover:bg-[#383636]/5"
                    title="Create options"
                  >
                    <span className="mr-1">Create New</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={handleCreateWithAI} className="cursor-pointer">
                    <span className="mr-2 inline-flex items-center justify-center h-4 w-4">
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 20v-6" />
                        <path d="M6 20v-4" />
                        <path d="M18 20v-8" />
                        <path d="M3 3h18" />
                        <path d="M3 7h18" />
                      </svg>
                    </span>
                    <span>Create with AI</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCreateDeck} className="cursor-pointer">
                    <FilePlus className="mr-2 h-4 w-4" />
                    <span>Blank Presentation</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleManualMode} className="cursor-pointer">
                    <Pencil className="mr-2 h-4 w-4" />
                    <span>Create Outline</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowGoogleImport(true)} className="cursor-pointer">
                    <span className="mr-2 inline-flex items-center justify-center h-4 w-4">
                      <svg className="h-4 w-4" viewBox="0 0 256 262" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path fill="#4285F4" d="M255.68 133.45c0-10.32-.84-17.86-2.66-25.67H130.54v46.59h71.97c-1.45 11.66-9.3 29.2-26.76 41.01l-.24 1.6 38.86 30.13 2.69.27c24.72-22.79 38.62-56.33 38.62-94.93" />
                        <path fill="#34A853" d="M130.54 261.1c35.1 0 64.57-11.53 86.09-31.02l-41.03-31.84c-11.02 7.67-25.8 13.03-45.06 13.03-34.49 0-63.73-22.79-74.15-54.35l-1.53.13-40.15 31.09-.52 1.45C35.48 230.21 79.88 261.1 130.54 261.1" />
                        <path fill="#FBBC05" d="M56.39 156.92c-2.76-8.23-4.35-17.03-4.35-26.18 0-9.14 1.59-17.95 4.21-26.18l-.07-1.75L15.4 71.15l-1.3.62C5.05 89.2 0 108.83 0 130.74c0 21.91 5.05 41.54 14.1 58.97l42.29-32.79" />
                        <path fill="#EA4335" d="M130.54 50.48c24.41 0 40.85 10.54 50.21 19.35l36.65-35.82C195.01 12.16 165.64 0 130.54 0 79.88 0 35.48 30.89 14.1 71.77l42.2 32.79c10.49-31.56 39.73-54.08 74.24-54.08" />
                      </svg>
                    </span>
                    <span>Import from Google Slides</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          <ModeToggle />
          <UserMenu />
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative z-10">
        <div
          className="relative flex flex-col transition-all duration-300 ease-in-out overflow-hidden"
          style={{
            width: '100%',
            transitionDuration: isResizing ? '0ms' : undefined,
          }}
        >
          {/* NEW PRESENTATION BUTTON moved to header */}

          {currentOutline && (
            <div className={(currentOutline as any).isManualMode ? "h-[48px] flex-shrink-0" : "h-[64px] flex-shrink-0"}>
              <OutlineHeader
                currentOutline={currentOutline}
                isGenerating={isResearching || isOutlineChatGenerating || isDeckGenerating}
                isOutlineGenerating={isOutlineChatGenerating}
                researchingSlides={new Set(researchingSlides)}
                completedResearchSlides={completedResearchSlides.length}
                totalResearchSlides={totalResearchSlides}
                onBack={() => {
                  setCurrentOutline(null);
                  setShowOutlineView(false);
                }}
                onGenerateDeck={handleGenerateDeck}
                uploadedFiles={uploadedFiles}
                generationProgress={generationProgress}
              />
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <div className={cn(
              "w-full h-full",
              currentOutline ? (currentOutline as any).isManualMode ? "flex pt-2" : "flex pt-6 px-8" : "flex justify-center items-center"
            )}>
              {showConversationalOnboarding ? (
                // Show conversational onboarding
                <div className="w-full h-full">
                  <ConversationalOnboarding
                    initialMessage={heroInput}
                    slideCount={slideCount}
                    initialUploadedFiles={uploadedFiles}
                    onComplete={(data) => {
                      setShowConversationalOnboarding(false);
                      setUploadedFiles([]); // Clear files after handoff
                      handleConversationalComplete(data);
                    }}
                    onCancel={() => {
                      setShowConversationalOnboarding(false);
                      // Keep uploadedFiles so user can try again
                    }}
                    onProcessingChange={setIsAgentThinking}
                  />
                </div>
              ) : (currentOutline || showOutlineView) ? (
                <div className={cn(
                  "flex flex-row",
                  isMounted ? "animate-fade-in" : "opacity-0"
                )} style={{ width: '100%' }}>
                  {/* Left: Chat Panel (or OutlineEditor for manual mode) */}
                  {(currentOutline as any)?.isManualMode ? (
                    // Manual mode: Full width OutlineEditor
                    <div className="flex-1 h-full relative overflow-visible">
                      <OutlineEditor
                        createDefaultDeck={createDefaultDeckForOutline}
                        updateDeckData={updateDeckDataForOutline}
                        navigate={navigate}
                        toast={toast}
                        dismiss={dismiss}
                        setIsOutlineProcessing={setIsOutlineProcessing}
                        currentOutline={currentOutline}
                        setCurrentOutline={setCurrentOutline}
                        handleAddSlide={handleAddSlide}
                        handleSlideTitleChange={handleSlideTitleChange}
                        handleSlideContentChange={handleSlideContentChange}
                        handleSlideReorder={handleSlideReorder}
                        handleToggleDeepResearch={handleToggleDeepResearch}
                        handleDeleteSlide={handleDeleteSlide}
                        isDeckGenerating={isDeckGenerating}
                        researchingSlides={researchingSlides}
                        onOutlineChatGeneratingChange={setIsOutlineChatGenerating}
                        onProgressUpdate={(stage, progress) => {
                          setOutlineProgress({ stage, progress });
                        }}
                        onStylePreferencesUpdate={handleStylePreferencesUpdate}
                        onUploadedFilesChange={setUploadedFiles}
                        isDeckListReady={showStar}
                        onResearchEventsUpdate={handleResearchEventsUpdate}
                      />
                    </div>
                  ) : (
                    // AI mode: Split view with Chat on left, Outline cards on right
                    <>
                      {/* Left Panel: Chat */}
                      <div style={{ width: '360px', marginLeft: '0' }} className="h-full pr-4 border-r border-border/20 flex-shrink-0">
                        <ChatPanel
                          outlineMode={true}
                          useOutlineAgent={true}
                          outline={currentOutline}
                          deckId={currentOutline?.id}
                          onOutlineUpdate={setCurrentOutline}
                          outlineIsGenerating={isOutlineChatGenerating}
                          onOutlineChatGeneratingChange={setIsOutlineChatGenerating}
                          outlineCurrentSlideIndex={outlineCurrentSlideIndex}
                          initialConversationalData={conversationalData}
                          onOutlineAgentToolCall={(params) => {
                            console.log('[DeckList] Agent generated outline:', params);

                            // Handle streaming slide updates (one at a time)
                            if (params.slideIndex !== undefined && params.slides && params.slides.length === 1) {
                              // This is a single slide update - merge it into the outline
                              console.log('[DeckList] 🔄 STREAMING SLIDE UPDATE for index:', params.slideIndex);
                              const slide = params.slides[0];
                              console.log('[DeckList] 📝 Incoming slide title:', slide.title);
                              console.log('[DeckList] 📄 Incoming content preview:', slide.content?.substring(0, 200));
                              console.log('[DeckList] 📊 Has content?', !!slide.content);
                              console.log('[DeckList] 📊 Content length:', slide.content?.length || 0);

                              setCurrentOutline(prev => {
                                if (!prev) {
                                  console.log('[DeckList] ⚠️ No previous outline to update!');
                                  return prev;
                                }

                                console.log('[DeckList] 📋 Current outline has', prev.slides?.length, 'slides before update');

                                const newSlide: FrontendSlideOutline = {
                                  id: slide.id || uuidv4(),
                                  title: slide.title,
                                  subtitle: slide.subtitle || '',
                                  content: slide.content || (slide.key_points ? slide.key_points.map((kp: any) => `• ${kp}`).join('\n') : ''),
                                  type: 'content',
                                  status: 'pending',
                                  thumbnail: '',
                                  notes: '',
                                  layout: 'default',
                                  deepResearch: slide.deepResearch || false,
                                  citations: slide.citations || [],
                                  footnotes: slide.footnotes || [],
                                  taggedMedia: slide.taggedMedia || []
                                };

                                console.log('[DeckList] ✅ Created newSlide with content length:', newSlide.content?.length);

                                // Insert or replace at the specified index
                                const updatedSlides = [...prev.slides];
                                if (params.slideIndex < updatedSlides.length) {
                                  console.log('[DeckList] 🔄 Replacing slide at index', params.slideIndex);
                                  updatedSlides[params.slideIndex] = newSlide;
                                } else {
                                  console.log('[DeckList] ➕ Adding slide at end (index beyond length)');
                                  // Add at the end if index is beyond current length
                                  updatedSlides.push(newSlide);
                                }

                                console.log('[DeckList] 📋 Updated outline will have', updatedSlides.length, 'slides');

                                return {
                                  ...prev,
                                  slides: updatedSlides
                                };
                              });
                              return;
                            }

                            // Handle stylePreferences-only update (no slides) - just update theme colors
                            if ((!params.slides || params.slides.length === 0) && params.stylePreferences) {
                              console.log('[DeckList] 🎨 STYLE PREFERENCES ONLY UPDATE');
                              console.log('[DeckList] 🎨 Received stylePreferences:', params.stylePreferences);
                              console.log('[DeckList] 🎨 Received font:', params.stylePreferences?.font);
                              
                              const apiStylePrefs = params.stylePreferences;
                              const apiColors = apiStylePrefs?.colors;
                              const apiFont = apiStylePrefs?.font;
                              
                              // Update current outline with new stylePreferences (keep existing slides)
                              setCurrentOutline(prev => {
                                if (!prev) return prev;
                                return {
                                  ...prev,
                                  stylePreferences: {
                                    ...prev.stylePreferences,
                                    ...apiStylePrefs,
                                    colors: apiColors || prev.stylePreferences?.colors
                                  }
                                };
                              });
                              
                              // Apply to theme store if colors present OR font is specified
                              const hasColors = apiColors && (apiColors.background || apiColors.accent1);
                              if (hasColors || apiFont) {
                                console.log('[DeckList] 🎨 APPLYING STYLE-ONLY UPDATE TO THEME STORE:', { colors: apiColors, font: apiFont });
                                const ts = useThemeStore.getState();
                                const outlineId = currentOutline?.id || '';
                                
                                const themePayload = {
                                  color_palette: {
                                    primary_background: apiColors?.background || '#ffffff',
                                    primary_text: apiColors?.text || '#1f2937',
                                    accent_1: apiColors?.accent1 || '#FF4301',
                                    accent_2: apiColors?.accent2 || apiColors?.accent1 || '#FF4301',
                                    backgrounds: [apiColors?.background || '#ffffff'],
                                    accents: [apiColors?.accent1, apiColors?.accent2].filter(Boolean),
                                    text_colors: { primary: apiColors?.text || '#1f2937' }
                                  }
                                };
                                
                                ts.setOutlineDeckTheme?.(outlineId, themePayload);
                                
                                // CRITICAL: Use apiFont directly - don't fall back to Inter for fun topics
                                const fontToApply = apiFont || 'Inter';
                                console.log('[DeckList] 🎨 APPLYING FONT TO WORKSPACE THEME:', fontToApply);
                                
                                const builtTheme = {
                                  name: apiColors?.name || 'Iconic Theme',
                                  page: { backgroundColor: apiColors?.background || '#ffffff' },
                                  typography: {
                                    paragraph: { fontFamily: fontToApply, color: apiColors?.text || '#1f2937' },
                                    heading: { fontFamily: fontToApply, color: apiColors?.text || '#1f2937' }
                                  },
                                  accent1: apiColors?.accent1 || '#FF4301',
                                  accent2: apiColors?.accent2 || apiColors?.accent1 || '#FF4301'
                                };
                                
                                const addedId = ts.addCustomTheme(builtTheme as any);
                                ts.setWorkspaceTheme(addedId);
                                ts.setOutlineTheme(outlineId, { ...builtTheme, id: addedId, isCustom: true } as any);
                                ts.setThemeReady(true);
                                
                                window.dispatchEvent(new CustomEvent('theme_preview_update', {
                                  detail: { type: 'theme_generated', theme: themePayload }
                                }));
                                
                                console.log('[DeckList] ✅ Theme applied from stylePreferences-only update!');
                              }
                              return;
                            }

                            // Map agent slides to frontend slides if available
                            console.log('[DeckList] 🌟 BATCH OUTLINE UPDATE');
                            console.log('[DeckList] 📊 Incoming slides count:', params.slides?.length || 0);
                            console.log('[DeckList] 📋 Current outline slides count:', currentOutline?.slides?.length || 0);

                            // SAFETY CHECK: Don't clear existing slides if incoming params have no slides
                            // This prevents accidental data loss when only theme/style updates are intended
                            if ((!params.slides || params.slides.length === 0) && currentOutline?.slides?.length > 0) {
                              console.log('[DeckList] ⚠️ SAFETY: Incoming params have no slides but current outline has slides');
                              console.log('[DeckList] ⚠️ Preserving existing slides, only updating metadata');

                              // Only update outline metadata (title, stylePreferences), preserve existing slides
                              setCurrentOutline(prev => {
                                if (!prev) return prev;
                                return {
                                  ...prev,
                                  title: params.topic || prev.title,
                                  stylePreferences: params.stylePreferences ? {
                                    ...prev.stylePreferences,
                                    ...params.stylePreferences
                                  } : prev.stylePreferences
                                };
                              });
                              return;
                            }

                            const initialSlides: FrontendSlideOutline[] = params.slides ? params.slides.map((s: any, i: number) => {
                              // Try to find existing slide at this index to preserve ID for smooth streaming
                              const existingSlide = currentOutline?.slides?.[i];
                              const slideId = existingSlide ? existingSlide.id : (s.id || uuidv4());

                              console.log(`[DeckList] 📄 Slide ${i}: title="${s.title}", content length=${s.content?.length || 0}, has key_points=${!!s.key_points}`);

                              return {
                                id: slideId,
                                title: s.title,
                                subtitle: s.subtitle || '',
                                content: s.content || (s.key_points ? s.key_points.map((kp: any) => `• ${kp}`).join('\n') : ''),
                                type: s.type || 'content',
                                status: s.status || 'pending',
                                thumbnail: s.thumbnail || '',
                                notes: s.notes || '',
                                layout: s.layout || 'default',
                                deepResearch: s.deepResearch || false,
                                citations: s.citations || [],
                                footnotes: s.footnotes || [],
                                taggedMedia: s.taggedMedia || []
                              };
                            }) : [];

                            // PRIORITY 1: Use stylePreferences from API response (backend sends theme colors here!)
                            const apiStylePrefs = params.stylePreferences;
                            const apiColors = apiStylePrefs?.colors;
                            
                            // PRIORITY 2: Get current theme data from store to persist to outline
                            const themeStore = useThemeStore.getState();
                            const currentDeckTheme = themeStore.getOutlineDeckTheme?.(currentOutline?.id || '');
                            const cp = currentDeckTheme?.color_palette || {};
                            
                            // Build stylePreferences.colors from theme store data
                            const themeColors = cp.primary_background || cp.accent_1 ? {
                              type: 'custom' as const,
                              background: cp.primary_background || '#ffffff',
                              text: cp.primary_text || '#1f2937',
                              accent1: cp.accent_1 || '#FF4301',
                              accent2: cp.accent_2 || cp.accent_1 || '#FF4301',
                              accent3: cp.accents?.[2]
                            } : undefined;

                            // Use API colors FIRST (this is where the backend sends Pikachu yellow, etc.)
                            const finalColors = apiColors || themeColors || currentOutline?.stylePreferences?.colors || stylePreferences?.colors;
                            
                            const apiFont = apiStylePrefs?.font;
                            console.log('[DeckList] 🎨 API stylePreferences:', apiStylePrefs);
                            console.log('[DeckList] 🎨 API colors:', apiColors);
                            console.log('[DeckList] 🎨 API font:', apiFont);
                            console.log('[DeckList] 🎨 Final colors:', finalColors);

                            const newOutline: FrontendDeckOutline = {
                              id: currentOutline?.id || uuidv4(), // Preserve ID if updating placeholder
                              title: params.topic || currentOutline?.title || 'Presentation',
                              slides: initialSlides,
                              // CRITICAL: Persist stylePreferences so theme tab can load them on revisit
                              stylePreferences: {
                                ...currentOutline?.stylePreferences,
                                ...stylePreferences,
                                ...apiStylePrefs,  // Include ALL API style prefs (logo, font, etc.)
                                colors: finalColors
                              }
                            };

                            console.log('[DeckList] ✅ Setting new outline with', newOutline.slides.length, 'slides');
                            console.log('[DeckList] 🎨 Outline stylePreferences.colors:', newOutline.stylePreferences?.colors);
                            setCurrentOutline(newOutline);
                            
                            // CRITICAL: If API sent colors OR font (e.g., Pikachu yellow + Bungee font), apply to theme store NOW
                            const hasApiColors = apiColors && (apiColors.background || apiColors.accent1);
                            if (hasApiColors || apiFont) {
                              console.log('[DeckList] 🎨 APPLYING API THEME TO STORE:', { colors: apiColors, font: apiFont });
                              const ts = useThemeStore.getState();
                              
                              // Build theme payload for theme store
                              const themePayload = {
                                color_palette: {
                                  primary_background: apiColors?.background || '#ffffff',
                                  primary_text: apiColors?.text || '#1f2937',
                                  accent_1: apiColors?.accent1 || '#FF4301',
                                  accent_2: apiColors?.accent2 || apiColors?.accent1 || '#FF4301',
                                  backgrounds: [apiColors?.background || '#ffffff'],
                                  accents: [apiColors?.accent1, apiColors?.accent2].filter(Boolean),
                                  text_colors: { primary: apiColors?.text || '#1f2937' }
                                }
                              };
                              
                              // Store in outline deck theme
                              ts.setOutlineDeckTheme?.(newOutline.id, themePayload);
                              
                              // Use apiFont - don't default to Inter for fun topics!
                              const fontToApply = apiFont || 'Inter';
                              console.log('[DeckList] 🎨 APPLYING FONT TO WORKSPACE THEME (batch):', fontToApply);
                              
                              // Create workspace theme to match
                              const builtTheme = {
                                name: apiColors?.name || 'Iconic Theme',
                                page: { backgroundColor: apiColors?.background || '#ffffff' },
                                typography: {
                                  paragraph: { fontFamily: fontToApply, color: apiColors?.text || '#1f2937' },
                                  heading: { fontFamily: fontToApply, color: apiColors?.text || '#1f2937' }
                                },
                                accent1: apiColors?.accent1 || '#FF4301',
                                accent2: apiColors?.accent2 || apiColors?.accent1 || '#FF4301'
                              };
                              
                              const addedId = ts.addCustomTheme(builtTheme as any);
                              ts.setWorkspaceTheme(addedId);
                              ts.setOutlineTheme(newOutline.id, { ...builtTheme, id: addedId, isCustom: true } as any);
                              ts.setThemeReady(true);
                              
                              // Dispatch theme_preview_update event so theme tab updates
                              window.dispatchEvent(new CustomEvent('theme_preview_update', {
                                detail: { type: 'theme_generated', theme: themePayload }
                              }));
                              
                              console.log('[DeckList] ✅ Theme applied from API!');
                            }
                            // Note: We don't manually set isOutlineChatGenerating(false) here anymore.
                            // The ChatPanel component monitors the agent's processing state and updates it automatically.
                            // This ensures the loading state persists during partial updates and clears only when done.

                            // Handle theme changes if present
                            if (params.theme_changes && params.theme_changes.brand) {
                              console.log('[DeckList] Applying theme changes:', params.theme_changes);
                              const themeStore = useThemeStore.getState();
                              const brandName = params.theme_changes.brand.name || 'Custom Brand';

                              // Create a custom theme based on the brand
                              const newThemeId = themeStore.addCustomTheme({
                                name: brandName,
                                page: {
                                  backgroundColor: '#FFFFFF',
                                },
                                typography: {
                                  paragraph: {
                                    fontFamily: 'Inter',
                                    color: '#000000',
                                    fontSize: '16px',
                                    fontWeight: 400,
                                    lineHeight: 1.5
                                  },
                                  heading: {
                                    fontFamily: 'Inter',
                                    color: '#000000',
                                    fontSize: '32px',
                                    fontWeight: 700
                                  }
                                },
                                accent1: '#FF4301',
                                accent2: '#333333'
                              });

                              themeStore.setWorkspaceTheme(newThemeId);
                              themeStore.setOutlineTheme(newOutline.id, themeStore.getWorkspaceTheme());
                              themeStore.setThemeReady(true);
                            } else {
                              // No theme changes - OutlineDisplayView will handle showing loading until theme is ready
                              const themeStore = useThemeStore.getState();
                              themeStore.setOutlineTheme(newOutline.id, themeStore.getWorkspaceTheme());
                              // DON'T set themeReady here - let OutlineDisplayView control this
                            }
                          }}
                        />
                      </div>

                      {/* Right Panel: Outline Cards */}
                      <div className="flex-1 h-full relative overflow-visible ml-4">
                        <OutlineDisplayView
                          outline={currentOutline}
                          onOutlineUpdate={setCurrentOutline}
                          onAddSlide={handleAddSlide}
                          onSlideTitleChange={handleSlideTitleChange}
                          onSlideContentChange={handleSlideContentChange}
                          handleSlideReorder={handleSlideReorderByIndex}
                          onToggleDeepResearch={handleToggleDeepResearch}
                          onDeleteSlide={handleDeleteSlide}
                          isDeckGenerating={isDeckGenerating}
                          isGeneratingOutline={isOutlineChatGenerating}
                          researchingSlides={researchingSlides}
                          researchEvents={outlineResearchEvents}
                        />
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="w-screen h-screen flex relative overflow-hidden font-sans text-slate-900 selection:bg-orange-100 selection:text-orange-900">
                  {/* Particle Background */}


                  {/* Left Pane: Hero Section */}
                  <div
                    className="relative z-10 h-full overflow-y-auto flex flex-col flex-1 min-w-0"
                  >
                    <div className="min-h-full flex flex-col">
                      {/* Header Removed (Duplicate) */}

                      {/* Hero Content - Centered Vertically */}
                      <div className="flex-1 flex flex-col justify-center items-center p-8 pb-32">
                        <div className="max-w-3xl w-full text-center space-y-8">
                          {/* Main Heading */}
                          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
                            <div className="flex flex-col items-center justify-center mb-10 space-y-6 text-center z-10 relative">
                              <h1
                                className="text-3xl md:text-4xl lg:text-5xl font-extrabold uppercase tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 dark:from-white dark:via-zinc-200 dark:to-white max-w-4xl mx-auto leading-tight"
                                style={{ fontFamily: 'HK Grotesk Wide, sans-serif' }}
                              >
                                TURN{' '}<RotatingWords />{' '}INTO<br />BEAUTIFUL PRESENTATIONS
                              </h1>
                              <div className="space-y-2">
                                <p className="text-base md:text-lg text-zinc-600 dark:text-zinc-300 max-w-2xl mx-auto">
                                  Create stunning, structured decks in seconds — just describe what you need.
                                </p>
                                <p className="text-sm md:text-base text-zinc-500 dark:text-zinc-400">
                                  Type topic, paste link, or upload file.
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Input Area */}
                          <div className="relative max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100">
                            <div className="relative group">
                              <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500/20 to-blue-500/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
                              <div
                                className={cn(
                                  "relative flex items-center bg-white rounded-2xl shadow-xl shadow-slate-200/50 border p-2 transition-all duration-300 focus-within:shadow-2xl focus-within:border-orange-500/50 focus-within:ring-4 focus-within:ring-orange-500/10",
                                  isHeroDraggingOver ? "border-orange-500 border-dashed border-2 bg-orange-50" : "border-slate-200"
                                )}
                                onDragEnter={handleHeroDragEnter}
                                onDragOver={handleHeroDragOver}
                                onDragLeave={handleHeroDragLeave}
                                onDrop={handleHeroDrop}
                              >
                                {/* Drop Zone Overlay */}
                                {isHeroDraggingOver && (
                                  <div className="absolute inset-0 bg-orange-50 flex items-center justify-center rounded-2xl bg-opacity-90 backdrop-blur-sm z-20">
                                    <p className="text-orange-600 font-medium flex items-center flex-col">
                                      <Upload className="h-6 w-6 mb-2" />
                                      <span className="text-center">Drop files here</span>
                                      <span className="text-xs mt-1 text-orange-500/70">Images, PDFs, Excel, PowerPoint</span>
                                    </p>
                                  </div>
                                )}

                                {/* Input Field with Typewriter Placeholder */}
                                <div className="flex-1 relative">
                                  <Input
                                    className="w-full border-none shadow-none focus-visible:ring-0 h-14 bg-transparent placeholder:text-slate-300 px-4 font-sans"
                                    value={heroInput}
                                    onChange={(e) => setHeroInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && (heroInput.trim() || uploadedFiles.length > 0)) {
                                        setShowConversationalOnboarding(true);
                                      }
                                    }}
                                  />
                                  {!heroInput && (
                                    <div className="absolute inset-0 pointer-events-none flex items-center px-4 text-lg text-slate-400">
                                      <span className="whitespace-pre">I want to create </span>
                                      <span className="text-slate-300">{typewriterText}</span>
                                      <span className="animate-pulse text-orange-500">|</span>
                                    </div>
                                  )}
                                </div>

                                {/* Actions Divider */}
                                <div className="h-8 w-px bg-slate-200 mx-2"></div>

                                {/* Action Buttons */}
                                <div className="flex items-center gap-1 pr-2">
                                  {/* Upload Button */}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-slate-500 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition-colors"
                                    onClick={() => fileInputRef.current?.click()}
                                    title="Upload files"
                                  >
                                    <Upload size={18} />
                                  </Button>
                                  <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    multiple
                                    onChange={handleFileUpload}
                                  />

                                  {/* Link Button */}
                                  <Popover open={isLinkPopoverOpen} onOpenChange={setIsLinkPopoverOpen}>
                                    <PopoverTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                                        title="Add link"
                                      >
                                        <LinkIcon size={18} />
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80 p-3" side="top" align="center">
                                      <div className="flex gap-2">
                                        <Input
                                          placeholder="Paste URL..."
                                          value={linkInput}
                                          onChange={(e) => setLinkInput(e.target.value)}
                                          className="h-9"
                                          onKeyDown={(e) => e.key === 'Enter' && handleLinkAdd()}
                                        />
                                        <Button size="sm" onClick={handleLinkAdd} className="bg-blue-600 hover:bg-blue-700 text-white h-9 w-9 p-0">
                                          <Plus size={16} />
                                        </Button>
                                      </div>
                                    </PopoverContent>
                                  </Popover>

                                  {/* Slide Count Popover */}
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        className="h-8 border-none shadow-none bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-medium rounded-lg focus:ring-0 gap-2 px-3"
                                      >
                                        <span className="truncate">
                                          {slideCount === undefined ? 'Auto' :
                                            slideCount > 10 ? '10+ Slides' :
                                              `${slideCount} Slides`}
                                        </span>
                                        <ChevronDown className="h-3 w-3 opacity-50" />
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[280px] p-3" align="end">
                                      <div className="space-y-3">
                                        <div className="font-medium text-xs text-slate-500 uppercase tracking-wider">Number of Slides</div>

                                        {/* Auto Option */}
                                        <button
                                          onClick={() => {
                                            setSlideCount(undefined);
                                            setDetailLevel('quick');
                                          }}
                                          className={cn(
                                            "w-full py-2 px-3 rounded-lg text-xs font-medium transition-all border",
                                            slideCount === undefined
                                              ? "bg-orange-50 border-orange-500 text-orange-700"
                                              : "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300"
                                          )}
                                        >
                                          Auto (Recommended)
                                        </button>

                                        {/* Number Grid */}
                                        <div className="grid grid-cols-5 gap-2">
                                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                                            <button
                                              key={num}
                                              onClick={() => {
                                                setSlideCount(num);
                                                setDetailLevel(num <= 3 ? 'quick' : 'standard');
                                              }}
                                              className={cn(
                                                "py-2 rounded-lg text-xs font-medium transition-all border",
                                                slideCount === num
                                                  ? "bg-orange-50 border-orange-500 text-orange-700"
                                                  : "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300"
                                              )}
                                            >
                                              {num}
                                            </button>
                                          ))}
                                        </div>

                                        {/* 10+ Option */}
                                        <button
                                          onClick={() => {
                                            setSlideCount(12);
                                            setDetailLevel('detailed');
                                          }}
                                          className={cn(
                                            "w-full py-2 px-3 rounded-lg text-xs font-medium transition-all border",
                                            slideCount === 12
                                              ? "bg-orange-50 border-orange-500 text-orange-700"
                                              : "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300"
                                          )}
                                        >
                                          10+ Slides
                                        </button>
                                      </div>
                                    </PopoverContent>
                                  </Popover>

                                  {/* Submit Button */}
                                  <Button
                                    size="icon"
                                    className="h-12 w-12 ml-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20 transition-all hover:scale-105 active:scale-95"
                                    onClick={() => {
                                      if (heroInput.trim() || uploadedFiles.length > 0) {
                                        setShowConversationalOnboarding(true);
                                      }
                                    }}
                                  >
                                    <ArrowRight size={24} />
                                  </Button>
                                </div>
                              </div>
                            </div>

                            {/* Uploaded Files Preview */}
                            {uploadedFiles.length > 0 && (
                              <div className="mt-4 flex flex-wrap gap-2 justify-center animate-in fade-in slide-in-from-top-2">
                                {uploadedFiles.map((file, i) => (
                                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-white/80 backdrop-blur-sm border border-slate-200 rounded-lg shadow-sm text-sm text-slate-600">
                                    <FilePlus size={14} className="text-orange-500" />
                                    <span className="max-w-[150px] truncate">{file.name}</span>
                                    <button
                                      onClick={() => setUploadedFiles(prev => prev.filter((_, idx) => idx !== i))}
                                      className="ml-1 text-slate-400 hover:text-red-500 transition-colors"
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Resize Handle */}
                  <div
                    className="w-1 h-full cursor-ew-resize hover:bg-orange-500/50 transition-colors relative z-50 flex-shrink-0 group"
                    onMouseDown={handleResizeStart}
                  >
                    <div className="absolute inset-y-0 -left-2 -right-2 z-50" /> {/* Hit area */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 bg-zinc-300 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>

                  {/* Right Pane: Deck List */}
                  <div
                    className="h-full bg-white/60 backdrop-blur-xl border-l border-white/50 shadow-xl shadow-slate-200/50 relative z-10 flex flex-col flex-none"
                    style={{ width: `${deckListWidth}%` }}
                  >
                    <div className="p-4 pt-20 border-b border-zinc-100 flex-shrink-0">
                      <div className="flex flex-col gap-4">
                        <div className="relative w-full">
                          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                          <Input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-white/50 border-zinc-200 focus:bg-white pl-10 h-9 rounded-lg text-sm"
                          />
                        </div>

                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                          <TabsList className="w-full bg-zinc-100/50 p-1 rounded-lg grid grid-cols-2">
                            <TabsTrigger value="by-me" className="rounded-md text-xs">My Decks</TabsTrigger>
                            <TabsTrigger value="shared" className="rounded-md text-xs">Shared</TabsTrigger>
                          </TabsList>
                        </Tabs>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full">
                        <TabsContent value="by-me" className="mt-0 h-full">
                          {isLoading ? (
                            <div className="grid grid-cols-1 gap-4">
                              {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="aspect-[16/9] bg-zinc-100 rounded-xl animate-pulse" />
                              ))}
                            </div>
                          ) : filteredDecks.length === 0 ? (
                            <EmptyDeckList searchQuery={searchQuery} onCreateDeck={handleCreateDeck} authError={authError} onReload={loadDecks} />
                          ) : (
                            <VirtualizedDeckGrid
                              decks={filteredDecks}
                              onEdit={handleEditDeck}
                              onShowDeleteDialog={handleShowDeleteDialog}
                              onLoadMore={loadMoreDecks}
                              hasMore={hasMore}
                              isLoadingMore={isLoadingMore}
                              isInitialLoad={true}
                            />
                          )}
                        </TabsContent>

                        <TabsContent value="shared" className="mt-0 h-full">
                          {isLoadingShared ? (
                            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-orange-500" /></div>
                          ) : sharedDecks.length === 0 ? (
                            <div className="text-center py-12 text-zinc-500 text-sm">No shared presentations found.</div>
                          ) : (
                            <VirtualizedDeckGrid
                              decks={sharedDecks}
                              onEdit={handleEditDeck}
                              onShowDeleteDialog={handleShowDeleteDialog}
                              onLoadMore={() => { }}
                              hasMore={false}
                              isLoadingMore={false}
                              isInitialLoad={false}
                            />
                          )}
                        </TabsContent>
                      </Tabs>
                    </div>

                    {/* Dialogs */}
                    <Dialog open={showGallery} onOpenChange={handleDialogOpenChange}>
                      <DialogContent className="sm:max-w-[900px] h-[80vh] p-0 overflow-hidden flex flex-col">
                        <DialogHeader className="p-6 flex-shrink-0">
                          {/* @ts-ignore - DialogTitle children prop issue */}
                          <DialogTitle className="text-xl">
                            Import from Google Slides
                          </DialogTitle>
                        </DialogHeader>
                        <div className="px-6 pb-6 flex-shrink-0">
                          <div className="relative mt-4">
                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 dark:text-neutral-400" />
                            <Input
                              type="text"
                              placeholder="Search presentations..."
                              value={popupSearchQuery}
                              onChange={(e) => handlePopupSearchChange(e.target.value)}
                              className="w-full bg-transparent border border-zinc-300 dark:border-zinc-600 hover:border-zinc-500 dark:hover:border-zinc-400 focus:border-zinc-700 dark:focus:border-zinc-300 text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 pl-10 rounded-md h-9 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                            />
                          </div>
                        </div>

                        <Tabs defaultValue="by-me" className="flex flex-col flex-grow overflow-hidden">
                          <div className="px-6 pt-0 flex-shrink-0">
                            <TabsList className="bg-muted/50">
                              <TabsTrigger value="by-me" className="text-sm">My Presentations</TabsTrigger>
                              <TabsTrigger value="shared" className="text-sm">Shared</TabsTrigger>
                            </TabsList>
                          </div>

                          <div className="p-6 pt-4 overflow-y-auto flex-grow">
                            <TabsContent value="by-me" className="mt-0 data-[state=active]:flex data-[state=active]:flex-col h-auto">
                              {isLoadingPopup && popupDecks.length === 0 ? (
                                <div className="w-full text-center py-10">
                                  <div className="flex flex-col items-center justify-center">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                                    <p className="text-sm text-muted-foreground mt-4">Loading presentations...</p>
                                  </div>
                                </div>
                              ) : filteredPopupDecks.length === 0 && popupSearchQuery.trim() ? (
                                <div className="w-full text-center py-10">
                                  <p className="text-lg text-muted-foreground">No presentations match "{popupSearchQuery}"</p>
                                </div>
                              ) : filteredPopupDecks.length === 0 && hasLoadedInitialPopup ? (
                                <div className="w-full text-center py-10">
                                  <p className="text-lg text-muted-foreground">No presentations found</p>
                                </div>
                              ) : filteredPopupDecks.length > 0 ? (
                                <VirtualizedPopupDeckGrid
                                  decks={filteredPopupDecks}
                                  onEdit={(deck) => {
                                    handleEditDeck(deck);
                                    setShowGallery(false);
                                  }}
                                  onShowDeleteDialog={handleShowDeleteDialog}
                                  onLoadMore={loadMorePopupDecks}
                                  hasMore={hasMorePopup && !popupSearchQuery.trim()}
                                  isLoadingMore={isLoadingMorePopup}
                                />
                              ) : null}
                            </TabsContent>
                            <TabsContent value="shared" className="mt-0 data-[state=active]:flex data-[state=active]:flex-col h-auto">
                              {isLoadingShared ? (
                                <div className="w-full text-center py-10">
                                  <div className="flex flex-col items-center justify-center">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                                    <p className="text-sm text-muted-foreground mt-4">Loading shared presentations...</p>
                                  </div>
                                </div>
                              ) : sharedDecksError ? (
                                <div className="w-full text-center py-10">
                                  <div className="flex flex-col items-center justify-center">
                                    <p className="text-lg text-destructive font-medium">Error loading shared presentations</p>
                                    <p className="text-sm text-muted-foreground mt-2">{sharedDecksError}</p>
                                    <Button onClick={loadSharedDecks} size="sm" className="mt-4" variant="outline">Try Again</Button>
                                  </div>
                                </div>
                              ) : sharedDecks.length === 0 ? (
                                <div className="w-full text-center py-10">
                                  <p className="text-lg text-muted-foreground">No shared presentations available</p>
                                  <p className="text-sm text-muted-foreground mt-2">Presentations shared with you will appear here</p>
                                </div>
                              ) : (
                                <VirtualizedPopupDeckGrid
                                  decks={sharedDecks}
                                  onEdit={(deck) => {
                                    handleEditDeck(deck);
                                    setShowGallery(false);
                                  }}
                                  onShowDeleteDialog={handleShowDeleteDialog}
                                  onLoadMore={() => { }}
                                  hasMore={false}
                                  isLoadingMore={false}
                                />
                              )}
                            </TabsContent>
                          </div>
                        </Tabs>
                      </DialogContent>
                    </Dialog>

                    <AppearanceOnboarding
                      open={showAppearanceOnboarding}
                      onComplete={() => setShowAppearanceOnboarding(false)}
                    />

                    <GoogleSlidesImportModal open={showGoogleImport} onOpenChange={setShowGoogleImport} />

                    <AlertDialog open={deckToDelete !== null} onOpenChange={(open) => !open && handleCancelDelete()}>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you sure you want to delete this presentation?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the
                            presentation and all of its slides.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel onClick={handleCancelDelete} disabled={isDeleting}>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleConfirmDelete}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-700 focus:ring-600"
                          >
                            {isDeleting ? (
                              <>
                                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-background border-r-transparent"></span>
                                Deleting...
                              </>
                            ) : (
                              "Delete Presentation"
                            )}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeckList;
