import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CompleteDeckData } from '@/types/DeckTypes';
import { Button } from '@/components/ui/button';
import { Plus, User as UserIcon, Search as SearchIcon, GripVertical, X, Grid, Trash2, ChevronDown, FilePlus, Pencil } from 'lucide-react';
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
import { API_CONFIG } from '@/config/environment';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import OutlineEditor from '@/components/outline/OutlineEditor';
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
import PresentationFlowView from '@/components/flow/PresentationFlowView';
import TabbedFlowPanel from '@/components/flow/TabbedFlowPanel';
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
    // Clear any stale preferences on mount
    if (typeof window !== 'undefined') {
      delete (window as any).__slideGenerationPreferences;
      console.log('[DeckList] Cleared stale slide generation preferences');
      // We are fully on deck list; clear unmounting flag
      (window as any).__isUnmounting = false;
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
          } catch {}
        }
      } finally {
        try { await refreshAdminStatus(); } catch {}
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
  const [deckListWidth, setDeckListWidth] = useState(21); // 21% default width (was 20%)
  const [isResizing, setIsResizing] = useState(false);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null); // For throttling resize updates
  
  // State for slides gallery
  const [showGallery, setShowGallery] = useState(false);
  const [showGoogleImport, setShowGoogleImport] = useState(false);
  const [showAppearanceOnboarding, setShowAppearanceOnboarding] = useState(false);
  
  // State for shared decks
  const [sharedDecks, setSharedDecks] = useState<CompleteDeckData[]>([]);
  const [isLoadingShared, setIsLoadingShared] = useState(false);
  const [sharedDecksError, setSharedDecksError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('by-me');

  const createDefaultDeckForOutline = useDeckStore(state => state.createDefaultDeck);
  const updateDeckDataForOutline = useDeckStore(state => state.updateDeckData);

  // Initialize OutlineManager here
  const {
    currentOutline,
    setCurrentOutline,
    resetOutline,
    handleAddSlide,
    handleSlideTitleChange,
    handleSlideContentChange,
    handleSlideReorder,
    handleToggleDeepResearch,
    handleDeleteSlide,
  } = useOutlineManager(null);

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
    } catch {}
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
    let hasNavigated = false;
    
    try {
      // Reset deck store before generation
      useDeckStore.getState().resetStore();
      
      // Clear any stale deck ID from session storage
      sessionStorage.removeItem('lastEditedDeckId');
      
      // Use GenerationCoordinator to handle the generation
      const coordinator = GenerationCoordinator.getInstance();
      
      // Store autoSelectImages preference globally
      if (typeof window !== 'undefined') {
        (window as any).__slideGenerationPreferences = {
          autoSelectImages: stylePreferences?.autoSelectImages || false
        };
      }
      
      // Attach current workspace theme into outline so backend can skip theme creation
      const outlineDeckTheme = useThemeStore.getState().getOutlineDeckTheme?.(currentOutline.id);
      const wsTheme = useThemeStore.getState().getWorkspaceTheme?.();
      const mapThemeToBackend = (t: any) => {
        if (!t) return undefined;
        const bg = t.page?.backgroundColor || '#ffffff';
        const accent1 = t.accent1 || '#FF4301';
        const accent2 = t.accent2 || accent1;
        const headingFamily = t.typography?.heading?.fontFamily || 'Inter';
        const paragraphFamily = t.typography?.paragraph?.fontFamily || 'Inter';
        const textColor = t.typography?.paragraph?.color || '#1f2937';
        return {
          theme_name: t.name || 'Custom Theme',
          color_palette: {
            primary_background: bg,
            accent_1: accent1,
            accent_2: accent2,
            primary_text: textColor,
            colors: [accent1, accent2]
          },
          typography: {
            hero_title: { family: headingFamily },
            body_text: { family: paragraphFamily }
          },
          visual_style: {}
        } as any;
      };

      const outlineWithTheme: any = {
        ...currentOutline,
        notes: {
          ...(currentOutline as any).notes,
          // Always pass the latest UI theme so generation matches what user sees; fallback to outlineDeckTheme
          ...(wsTheme ? { theme: mapThemeToBackend(wsTheme) } : (outlineDeckTheme ? { theme: outlineDeckTheme } : {}))
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
          if (!deckId && !hasNavigated) {
            const emittedDeckId = (event as any).deck_id || (event as any).deck_uuid || (event as any).deckId || (event as any).deckUUID;
            if (!emittedDeckId) {
              // No deck id yet; ignore this event
            } else {
              deckId = emittedDeckId;
            
            // Store deck ID
            sessionStorage.setItem('lastEditedDeckId', deckId);
            
            // Set active generation in window for SlideEditor to pick up
            if (typeof window !== 'undefined') {
              (window as any).__activeGenerationDeckId = deckId;
              // Also expose the intended deck name so the editor can show it immediately
              try {
                (window as any).__activeGenerationDeckName = currentOutline?.title || '';
                sessionStorage.setItem('activeGenerationDeckName', currentOutline?.title || '');
              } catch {}
            }

            // Navigate to deck editor now that generation has been initiated by the user
            hasNavigated = true;
            navigate(`/deck/${deckId}?new=true`);
            }
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
    <div className="h-screen bg-[#F5F5DC] dark:bg-zinc-900 flex flex-col overflow-hidden relative">
      <div className="noise-overlay pointer-events-none"></div>
      

      
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
          {!(currentOutline || isOutlineChatGenerating) && (
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
                  <DropdownMenuItem onClick={() => {
                    // Tastefully focus the chat input area for AI creation
                    try { window.dispatchEvent(new CustomEvent('focus-outline-chat')); } catch {}
                  }} className="cursor-pointer">
                    <span className="mr-2 inline-flex items-center justify-center h-4 w-4">
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 20v-6"/>
                        <path d="M6 20v-4"/>
                        <path d="M18 20v-8"/>
                        <path d="M3 3h18"/>
                        <path d="M3 7h18"/>
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
                        <path fill="#4285F4" d="M255.68 133.45c0-10.32-.84-17.86-2.66-25.67H130.54v46.59h71.97c-1.45 11.66-9.3 29.2-26.76 41.01l-.24 1.6 38.86 30.13 2.69.27c24.72-22.79 38.62-56.33 38.62-94.93"/>
                        <path fill="#34A853" d="M130.54 261.1c35.1 0 64.57-11.53 86.09-31.02l-41.03-31.84c-11.02 7.67-25.8 13.03-45.06 13.03-34.49 0-63.73-22.79-74.15-54.35l-1.53.13-40.15 31.09-.52 1.45C35.48 230.21 79.88 261.1 130.54 261.1"/>
                        <path fill="#FBBC05" d="M56.39 156.92c-2.76-8.23-4.35-17.03-4.35-26.18 0-9.14 1.59-17.95 4.21-26.18l-.07-1.75L15.4 71.15l-1.3.62C5.05 89.2 0 108.83 0 130.74c0 21.91 5.05 41.54 14.1 58.97l42.29-32.79"/>
                        <path fill="#EA4335" d="M130.54 50.48c24.41 0 40.85 10.54 50.21 19.35l36.65-35.82C195.01 12.16 165.64 0 130.54 0 79.88 0 35.48 30.89 14.1 71.77l42.2 32.79c10.49-31.56 39.73-54.08 74.24-54.08"/>
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
            width: (currentOutline || isOutlineChatGenerating) ? '100%' : `${100 - deckListWidth}%`,
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
                onBack={() => setCurrentOutline(null)}
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
              {currentOutline ? (
                <div className={cn(
                  "flex flex-row",
                  isMounted ? "animate-fade-in" : "opacity-0"
                )} style={{ width: '100%' }}>
                  {/* Left panel with tabs - Narrative and Presentation Flow - hide for manual mode */}
                  {!(currentOutline as any).isManualMode && (
                    <div style={{ width: '280px', marginLeft: '0' }} className="h-full pr-4 border-r border-border/20 flex-shrink-0">
                      <TabbedFlowPanel
                        currentOutline={currentOutline}
                        onReorderFlow={handleSlideReorderByIndex}
                        showNotesTab={false}
                        isNarrativeLoading={isOutlineChatGenerating}
                        researchEvents={outlineResearchEvents}
                        showThinkingTab={false}
                      />
                    </div>
                  )}
                  
                  {/* OutlineEditor container - full width for manual mode */}
                  <div className={cn(
                    "flex-1 h-full relative overflow-visible",
                    !(currentOutline as any).isManualMode && "ml-4"
                  )}>
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
                </div>
              ) : (
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
                  onResearchEventsUpdate={setOutlineResearchEvents}
                />
              )}
            </div>
          </div>
        </div>
        
        <div 
          className="relative flex flex-col transition-all duration-300 ease-in-out bg-[#F5F5DC] dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800"
          style={(currentOutline || isOutlineChatGenerating) ? {
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: `${deckListWidth}%`,
            transform: 'translateX(100%)',
            opacity: 0,
            pointerEvents: 'none',
            transitionDuration: undefined,
          } : {
            position: 'relative',
            width: `${deckListWidth}%`,
            transform: 'translateX(0%)',
            opacity: 1,
            pointerEvents: isDeckListReady ? 'auto' : 'none',
            transitionDuration: isResizing ? '0ms' : undefined,
          }}
          onMouseEnter={() => {
            // Debug logging to check if the panel is receiving mouse events
            if (!currentOutline && !isOutlineChatGenerating && isDeckListReady) {
      
            }
          }}
        >
          {!(currentOutline || isOutlineChatGenerating) && (
            <div 
              ref={resizeHandleRef}
              className="absolute left-0 top-0 bottom-0 w-1 hover:w-2 bg-transparent hover:bg-zinc-300/50 dark:hover:bg-zinc-700/50 cursor-ew-resize transition-all z-30"
              onMouseDown={handleResizeStart}
            />
          )}
          
          <div 
            className="flex-1 bg-[#F5F5DC] dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 overflow-y-auto hover:overflow-y-auto hide-scrollbar p-6 z-20 scrollable-container scroll-fade-bottom"
            style={{ 
              height: 'calc(100vh - 64px)',
            }} 
          >
            {isDeckListReady && !isLoading ? (
              <div>
                <div className="relative mb-4">
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 dark:text-neutral-400" />
                  <Input
                    type="text"
                    placeholder="Search presentations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent border border-zinc-300 dark:border-zinc-600 hover:border-zinc-500 dark:hover:border-zinc-400 focus:border-zinc-700 dark:focus:border-zinc-300 text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 pl-10 rounded-md h-9 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>

                <Tabs defaultValue="by-me" value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center space-x-2">
                      <TabsList className="bg-transparent p-0 border-none shadow-none">
                        <TabsTrigger 
                          value="by-me" 
                          className="text-xs px-2 py-1 text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 data-[state=active]:text-orange-600 dark:data-[state=active]:text-orange-500 data-[state=active]:border-b-2 data-[state=active]:border-orange-500 data-[state=active]:border-b-offset-[-1px] data-[state=active]:shadow-none data-[state=active]:bg-transparent rounded-none"
                        >
                          My Presentations
                        </TabsTrigger>
                        <TabsTrigger 
                          value="shared" 
                          className="text-xs px-2 py-1 text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 data-[state=active]:text-orange-600 dark:data-[state=active]:text-orange-500 data-[state=active]:border-b-2 data-[state=active]:border-orange-500 data-[state=active]:border-b-offset-[-1px] data-[state=active]:shadow-none data-[state=active]:bg-transparent rounded-none"
                        >
                          Shared
                        </TabsTrigger>
                      </TabsList>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-xs px-2 py-1 text-zinc-600 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                      onClick={() => handleDialogOpenChange(true)}
                    >
                                            View All
                    </Button>
                  </div>
                  <TabsContent value="by-me" className="mt-0">
                    {filteredDecks.length === 0 ? (
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
                  
                  <TabsContent value="shared" className="mt-0">
                    {isLoadingShared ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="flex flex-col items-center justify-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                          <p className="text-sm text-muted-foreground mt-4">Loading shared presentations...</p>
                        </div>
                      </div>
                    ) : sharedDecksError ? (
                      <div className="text-center py-12">
                        <h3 className="text-lg font-medium text-red-500">
                          Error loading shared presentations
                        </h3>
                        <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-2">
                          {sharedDecksError}
                        </p>
                        <Button 
                          onClick={loadSharedDecks} 
                          size="sm" 
                          className="mt-4"
                          variant="outline"
                        >
                          Try Again
                        </Button>
                      </div>
                    ) : sharedDecks.length === 0 ? (
                      <div className="text-center py-12">
                        <h3 className="text-lg font-medium text-zinc-300 dark:text-zinc-400">
                          No shared presentations available
                        </h3>
                        <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-2">
                          Presentations shared with you will appear here
                        </p>
                      </div>
                    ) : (
                      <VirtualizedDeckGrid 
                        decks={sharedDecks} 
                        onEdit={handleEditDeck} 
                        onShowDeleteDialog={handleShowDeleteDialog} 
                        onLoadMore={() => {}} // No pagination for shared decks yet
                        hasMore={false}
                        isLoadingMore={false}
                        isInitialLoad={false}
                      />
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            ) : (
              <div className="animate-pulse">
                <div className="h-9 bg-zinc-200 dark:bg-zinc-800 rounded-md mb-4"></div>
                <div className="flex justify-between items-center mb-6">
                  <div className="flex gap-4">
                    <div className="h-6 w-24 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
                    <div className="h-6 w-16 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
                  </div>
                  <div className="h-6 w-16 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
                </div>
                <div className="space-y-6">
                  <div className="aspect-[16/9] bg-zinc-200 dark:bg-zinc-800 rounded-lg"></div>
                  <div className="aspect-[16/9] bg-zinc-200 dark:bg-zinc-800 rounded-lg"></div>
                  <div className="aspect-[16/9] bg-zinc-200 dark:bg-zinc-800 rounded-lg"></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <Dialog open={showGallery} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-[900px] h-[80vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="p-6 flex-shrink-0">
            <DialogTitle className="text-xl font-bold">All Presentations</DialogTitle>
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
                <TabsTrigger 
                  value="by-me"
                  className="text-sm"
                >
                  My Presentations
                </TabsTrigger>
                <TabsTrigger 
                  value="shared"
                  className="text-sm"
                >
                  Shared
                </TabsTrigger>
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
                    hasMore={hasMorePopup && !popupSearchQuery.trim()} // Disable infinite scroll when searching
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
                      <Button 
                        onClick={loadSharedDecks} 
                        size="sm" 
                        className="mt-4"
                        variant="outline"
                      >
                        Try Again
                      </Button>
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
                    onLoadMore={() => {}} // No pagination for shared decks yet
                    hasMore={false}
                    isLoadingMore={false}
                  />
                )}
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* First-visit onboarding for theme choice */}
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
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
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
  );
};

export default DeckList;
