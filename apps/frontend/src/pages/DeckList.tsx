import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CompleteDeckData } from '@/types/DeckTypes';
import { Button } from '@/components/ui/button';
import { Plus, User as UserIcon, Search as SearchIcon, GripVertical, X, Grid, Trash2, ChevronDown, FilePlus, Pencil, Upload, Link as LinkIcon, Image as ImageIcon, Check, Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { VoiceRecorder } from '@/components/voice/VoiceRecorder';
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
import { ModeToggle } from "@/components/ui/ModeToggle";
import { UserMenu } from "@/components/ui/UserMenu";
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { useOutlineManager } from '@/hooks/useOutlineManager';
import ChatPanel from '@/components/ChatPanel';
import { DeckOutline as FrontendDeckOutline, SlideOutline as FrontendSlideOutline, TaggedMedia as FrontendTaggedMedia, DiscardedFile as FrontendDiscardedFile, ColorConfig, AssignedVideo } from '@/types/SlideTypes';
import OutlineHeader from '@/components/outline/OutlineHeader';
import BrandWordmark from '@/components/common/BrandWordmark';
import { useSlideResearch } from '@/hooks/useSlideResearch';
import { useOutlineChat } from '@/hooks/useOutlineChat';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import CommunityBottomSheet from '@/components/community/CommunityBottomSheet';
import { Users2 } from 'lucide-react';
import { normalizeReferenceImages } from '@/utils/referenceImages';
import { normalizeDeckTitle } from '@/utils/normalizeDeckTitle';
import { hasRealThemeColors } from '@/utils/themeUtils';
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
import { CreditWarningDialog } from '@/components/billing/CreditWarningDialog';
import { useOnboarding } from '@/context/OnboardingContext';
import { RotatingWords, VirtualizedDeckGrid, VirtualizedPopupDeckGrid } from './deck-list/DeckGridComponents';
import { developerApiService } from '@/services/developerApiService';

// Component instance counter for debugging
let componentInstanceCount = 0;

const normalizeUploadedMedia = (
  media?: Array<{
    id?: string;
    name?: string;
    filename?: string;
    type?: string;
    content?: string;
    url?: string;
    previewUrl?: string;
    size?: number;
    metadata?: Record<string, any>;
  }>
): FrontendTaggedMedia[] | undefined => {
  if (!Array.isArray(media) || media.length === 0) return undefined;
  const normalized = media.map((item) => {
    const rawType = String(item.type || '').toLowerCase();
    const resolvedType: FrontendTaggedMedia['type'] =
      rawType === 'image' || rawType.startsWith('image/')
        ? 'image'
        : rawType === 'pdf' || rawType.includes('pdf')
          ? 'pdf'
          : rawType === 'chart' || rawType === 'data'
            ? (rawType as FrontendTaggedMedia['type'])
            : 'other';

    return {
      id: item.id || uuidv4(),
      filename: item.filename || item.name || 'uploaded_file',
      type: resolvedType,
      content: item.content,
      previewUrl: item.previewUrl || item.url,
      interpretation: undefined,
      status: 'processed' as const,
      metadata: {
        originalType: item.type,
        size: item.size,
        ...(item.metadata || {})
      }
    };
  });
  return normalized.length > 0 ? normalized : undefined;
};

/**
 * DeckList page component that displays all available decks
 */
const DeckList: React.FC = () => {
  const instanceId = useRef(`DeckList_${++componentInstanceCount}_${Date.now()}`);
  const outlineThemeRequestsRef = useRef<Set<string>>(new Set());
  const { isAuthenticated, refreshAdminStatus } = useAuth();
  const isMobileView = useIsMobile();
  const heroTextareaBaseHeight = isMobileView ? 44 : 48;
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
            const apiBase = API_CONFIG.BASE_URL.replace(/\/$/, '');
            await fetch(`${apiBase}/admin/check`, {
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

  useEffect(() => {
    if (!isMobileView || typeof document === 'undefined') return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [isMobileView]);

  // Search state for the main side navigation
  const { searchQuery, setSearchQuery, filteredDecks, isSearching, clearSearch } = useDeckFiltering(decks);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Separate search state for the popup with server-side search
  const [popupSearchQuery, setPopupSearchQuery] = useState('');
  const [popupSearchResults, setPopupSearchResults] = useState<CompleteDeckData[] | null>(null);
  const [isPopupSearching, setIsPopupSearching] = useState(false);
  const popupSearchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Perform server-side search for popup
  const performPopupSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setPopupSearchResults(null);
      setIsPopupSearching(false);
      return;
    }

    setIsPopupSearching(true);
    try {
      const result = await deckSyncService.getAllDecks(50, 0, 'owned', query.trim());
      setPopupSearchResults(result.decks);
    } catch (err) {
      console.error('[DeckList] Popup search error:', err);
      setPopupSearchResults(null);
    } finally {
      setIsPopupSearching(false);
    }
  }, []);

  // Handle popup search changes with debouncing
  const handlePopupSearchChange = useCallback((value: string) => {
    setPopupSearchQuery(value);

    // Clear previous timer
    if (popupSearchTimerRef.current) {
      clearTimeout(popupSearchTimerRef.current);
    }

    // Clear results immediately if empty
    if (!value.trim()) {
      setPopupSearchResults(null);
      setIsPopupSearching(false);
      return;
    }

    // Debounce server search
    popupSearchTimerRef.current = setTimeout(() => {
      performPopupSearch(value);
    }, 300);
  }, [performPopupSearch]);

  // Use search results if available, otherwise show loaded decks
  const filteredPopupDecks = useMemo(() => {
    if (popupSearchResults !== null) {
      return popupSearchResults;
    }
    if (!popupSearchQuery.trim()) {
      return popupDecks;
    }
    // Local filter for immediate feedback while debounce timer is active
    const query = popupSearchQuery.toLowerCase().trim();
    return popupDecks.filter(deck =>
      (deck.name || '').toLowerCase().includes(query)
    );
  }, [popupDecks, popupSearchQuery, popupSearchResults]);

  const navigate = useNavigate();
  const { toast, dismiss } = useToast();
  const [isOutlineProcessing, setIsOutlineProcessing] = useState(false);

  // State to hold pending outline data for auto-resume after upgrade
  const [pendingOutlineData, setPendingOutlineData] = useState<{
    outlineFlow: any;
    collectedData: any;
    pendingSlideMode: 'interactive' | 'static';
  } | null>(null);
  const [shouldResumeGeneration, setShouldResumeGeneration] = useState(false);

  // Check for pending outline from localStorage (user upgrading after credit warning)
  // and auto-resume generation if user now has enough credits
  useEffect(() => {
    const checkPendingOutline = async () => {
      if (!isAuthenticated) return;

      // Check if localStorage is available (may not be in private browsing)
      if (typeof localStorage === 'undefined') return;

      let savedOutline: string | null = null;
      try {
        savedOutline = localStorage.getItem('nextslide_pending_outline');
      } catch (e) {
        console.warn('[DeckList] localStorage not accessible:', e);
        return;
      }
      if (!savedOutline) return;

      try {
        const parsed = JSON.parse(savedOutline);

        // Check if the saved data is recent (within 24 hours)
        const savedAt = new Date(parsed.savedAt);
        const hoursSinceSave = (Date.now() - savedAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceSave > 24) {
          console.log('[DeckList] Pending outline is too old, removing');
          try { localStorage.removeItem('nextslide_pending_outline'); } catch {}
          return;
        }

        console.log('[DeckList] Found pending outline from localStorage:', parsed);
        console.log('[DeckList] Pending slide mode:', parsed.pendingSlideMode);

        // Check if user now has enough credits
        const { billingApi } = await import('@/services/billingApi');
        const balance = await billingApi.getBalance();
        const requiredCredits = (parsed.outlineFlow?.slides?.length || 5) * 5;

        console.log('[DeckList] Credit check for pending outline:', {
          remaining: balance.remaining_credits,
          required: requiredCredits,
          canProceed: balance.remaining_credits >= requiredCredits,
          slideMode: parsed.pendingSlideMode,
        });

        if (balance.remaining_credits >= requiredCredits) {
          // User has enough credits now! Store the pending data and show confirmation
          setPendingOutlineData({
            outlineFlow: parsed.outlineFlow,
            collectedData: parsed.collectedData,
            pendingSlideMode: parsed.pendingSlideMode || 'interactive',
          });

          // Show toast asking if they want to continue - clicking sets flag to trigger generation
          toast({
            title: "Welcome back!",
            description: `Your "${parsed.outlineFlow?.topic || 'presentation'}" is ready to generate.`,
            action: (
              <Button
                size="sm"
                onClick={() => {
                  console.log('[DeckList] Generate Now clicked, setting shouldResumeGeneration=true');
                  setShouldResumeGeneration(true);
                }}
                className="bg-orange-500 hover:bg-orange-600"
              >
                Generate Now
              </Button>
            ),
            duration: 15000, // Show for 15 seconds
          });
        }
      } catch (error) {
        console.error('[DeckList] Failed to parse pending outline:', error);
        try { localStorage.removeItem('nextslide_pending_outline'); } catch {}
      }
    };

    checkPendingOutline();
  }, [isAuthenticated, toast]);

  // State for resizable panel
  const [deckListWidth, setDeckListWidth] = useState(20); // Default width 20%
  const [isResizing, setIsResizing] = useState(false);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null); // For throttling resize updates

  // State for slides gallery
  const [showGallery, setShowGallery] = useState(false);
  const [showGoogleImport, setShowGoogleImport] = useState(false);
  const [showCommunity, setShowCommunity] = useState(false);
  const [showAppearanceOnboarding, setShowAppearanceOnboarding] = useState(false);
  const [showConversationalOnboarding, setShowConversationalOnboarding] = useState(false);
  const [isAgentThinking, setIsAgentThinking] = useState(false);
  // Credit warning dialog state
  const [showCreditWarning, setShowCreditWarning] = useState(false);
  const [creditWarningData, setCreditWarningData] = useState<{
    remaining: number;
    required: number;
    slideCount: number;
  }>({ remaining: 0, required: 0, slideCount: 0 });

  // Onboarding state from context
  const {
    shouldShowAiHints,
    shouldAskOverageConfirmation,
    markOverageConfirmed,
    loading: onboardingLoading,
  } = useOnboarding();

  // Track if onboarding has finished loading (to reload decks after tutorial deck is created)
  const onboardingLoadedRef = useRef(false);

  // Reload decks after onboarding state finishes loading (tutorial deck may have been created)
  useEffect(() => {
    if (!onboardingLoading && !onboardingLoadedRef.current && isAuthenticated) {
      onboardingLoadedRef.current = true;
      // Small delay to ensure tutorial deck is fully created in the database
      setTimeout(() => {
        console.log('[DeckList] Onboarding loaded, reloading decks to show tutorial deck');
        loadDecks();
      }, 500);
    }
  }, [onboardingLoading, isAuthenticated, loadDecks]);

  const [heroInput, setHeroInput] = useState('');
  const [onboardingSeedPrompt, setOnboardingSeedPrompt] = useState('');
  const [onboardingSessionId, setOnboardingSessionId] = useState(0);
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
  const typewriterPhrases = useMemo(() => (
    isMobileView
      ? ['\u00A0a pitch deck', '\u00A0a lecture', '\u00A0a growth plan', '\u00A0a marketing deck']
      : [
        '\u00A0a pitch deck for my startup',
        '\u00A0a lecture on history',
        '\u00A0a strategy for world domi...\b\b\b\b\b\b\b peace',
        '\u00A0a marketing proposal'
      ]
  ), [isMobileView]);
  const typewriterText = useTypewriter({
    phrases: typewriterPhrases,
    typingSpeed: 50,
    deletingSpeed: 30,
    pauseDuration: 2000
  });
  const heroPlaceholderPrefix = isMobileView ? 'Create' : 'I want to create';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const heroTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);
  const [linkInput, setLinkInput] = useState('');

  const openConversationalOnboarding = useCallback((prompt?: string) => {
    const trimmedPrompt = prompt?.trim() || '';
    setOnboardingSeedPrompt(trimmedPrompt);
    setOnboardingSessionId((prev) => prev + 1);
    setShowConversationalOnboarding(true);
    setHeroInput('');
    if (heroTextareaRef.current) {
      heroTextareaRef.current.style.height = `${heroTextareaBaseHeight}px`;
    }
  }, [heroTextareaBaseHeight, setHeroInput, setOnboardingSeedPrompt, setOnboardingSessionId, setShowConversationalOnboarding]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setUploadedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  // Hero section drag and drop state and handlers
  const [isHeroDraggingOver, setIsHeroDraggingOver] = useState(false);
  const [isHeroVoiceRecording, setIsHeroVoiceRecording] = useState(false);
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
      // Extract domain and append to heroInput for branded slides
      let url = linkInput.trim();
      // Add protocol if missing for proper URL parsing
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }

      // Try to extract just the domain for cleaner display
      let domain = url;
      try {
        const urlObj = new URL(url);
        domain = urlObj.hostname.replace('www.', '');
      } catch {
        // If URL parsing fails, use as-is
        domain = linkInput.trim().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
      }

      // Append to heroInput so it gets sent to the outline agent for brand extraction
      setHeroInput(prev => {
        const separator = prev.trim() ? ' ' : '';
        return `${prev}${separator}${domain}`;
      });

      setLinkInput('');
      setIsLinkPopoverOpen(false);
      if (!isMobileView) {
        toast({
          title: "URL added",
          description: `${domain} will be used for branded slides`,
        });
      }
    }
  };

  // State for shared decks
  const [sharedDecks, setSharedDecks] = useState<CompleteDeckData[]>([]);
  const [isLoadingShared, setIsLoadingShared] = useState(false);
  const [sharedDecksError, setSharedDecksError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('by-me');

  // State for API-created decks
  const [apiDecks, setApiDecks] = useState<CompleteDeckData[]>([]);
  const [isLoadingApiDecks, setIsLoadingApiDecks] = useState(false);
  const [hasApiKeys, setHasApiKeys] = useState(false);

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
        manualCharts: []
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
    slideMode?: 'interactive' | 'static';
    chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    uploadedFiles?: File[];
    uploadedMedia?: Array<{
      id: string;
      name: string;
      type: string;
      content?: string;
      url?: string;
      size?: number;
    }>;
    slideScreenshots?: string[];
    slides?: Array<{
      title: string;
      subtitle?: string;
      content?: string;
      key_points?: string[];
      assignedVideo?: AssignedVideo;
      taggedMedia?: FrontendTaggedMedia[];
    }>;
    narrative?: string;
    scrapedVideos?: Array<{
      url: string;
      title?: string;
      thumbnail?: string;
      source_type?: string;
      embed_url?: string;
    }>;
    use_uploaded_images?: boolean;
    scraped_context?: string;
    research_context?: string;
    reference_sources?: Array<{ url?: string; title?: string }>;
    research_citations?: string[];
  } | null>(null);

  // Handle "Create with AI" - show conversational onboarding
  const handleCreateWithAI = useCallback(() => {
    openConversationalOnboarding(heroInput);
  }, [heroInput, openConversationalOnboarding]);

  // Handle completion of conversational onboarding
  const handleConversationalComplete = useCallback(async (data: {
    topic?: string;
    stylePreferences?: string;
    style?: string;
    slideCount?: number;
    detailLevel?: 'quick' | 'standard' | 'detailed';
    slideMode?: 'interactive' | 'static';  // 'interactive' = NextGen, 'static' = Traditional PPT
    themeChanges?: any;
    chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    uploadedFiles?: File[];
    uploadedMedia?: Array<{
      id: string;
      name: string;
      type: string;
      content?: string;
      url?: string;
      size?: number;
    }>;
    slideScreenshots?: string[];
    slides?: Array<{
      title: string;
      subtitle?: string;
      content?: string;
      key_points?: string[];
      assignedVideo?: AssignedVideo;
      taggedMedia?: FrontendTaggedMedia[];
    }>;
    narrative?: string;
    // Videos scraped from website URLs for embedding in the deck
    scrapedVideos?: Array<{
      url: string;
      title?: string;
      thumbnail?: string;
      source_type?: string;
      embed_url?: string;
    }>;
    use_uploaded_images?: boolean;
    scraped_context?: string;
    research_context?: string;
    reference_sources?: Array<{ url?: string; title?: string }>;
    research_citations?: string[];
  }) => {
    console.log('[DeckList] Conversational onboarding complete:', data);
    console.log('[DeckList] Uploaded files count:', data.uploadedFiles?.length || 0);
    console.log('[DeckList] Uploaded media from agent:', data.uploadedMedia?.length || 0, data.uploadedMedia);
    console.log('[DeckList] Slide mode:', data.slideMode || 'interactive (default)');
    console.log('[DeckList] Pre-generated slides:', data.slides?.length || 0);
    console.log('[DeckList] 🎬 Scraped videos from agent:', data.scrapedVideos?.length || 0, data.scrapedVideos);

    // Check if we have pre-generated slides - if so, DON'T hide conversational onboarding yet
    // We'll navigate directly to the deck, and the component will unmount naturally
    const hasPreGeneratedSlides = data.slides && data.slides.length > 0;

    // Only hide onboarding if we're going to outline view (no pre-generated slides)
    // For pre-generated slides, keep it visible during the transition to avoid flash
    if (!hasPreGeneratedSlides) {
      setShowConversationalOnboarding(false);
    }

    // CRITICAL: Clear any cached theme data from previous outlines
    const themeStore = useThemeStore.getState();
    themeStore.setThemeReady(false);

    // Parse stylePreferences if it's a JSON string (from ThemeChatBlock)
    let parsedStylePrefs: any = null;
    if (data.stylePreferences) {
      try {
        parsedStylePrefs = typeof data.stylePreferences === 'string'
          ? JSON.parse(data.stylePreferences)
          : data.stylePreferences;
      } catch (e) {
        console.log('[DeckList] Could not parse stylePreferences:', e);
      }
    }

    const hasExplicitColors = Boolean(
      parsedStylePrefs?.colors?.background ||
      parsedStylePrefs?.colors?.text ||
      parsedStylePrefs?.colors?.accent1 ||
      parsedStylePrefs?.colors?.accent2 ||
      parsedStylePrefs?.colors?.accent3
    );

    const vibeContext = data.style || parsedStylePrefs?.vibeContext || data.stylePreferences;
    const normalizedReferenceImages = normalizeReferenceImages(data.slideScreenshots);
    const normalizedUploadedMedia = normalizeUploadedMedia(data.uploadedMedia);

    // Update style preferences
    setStylePreferences({
      initialIdea: data.topic,
      vibeContext: vibeContext,
      colors: hasExplicitColors ? parsedStylePrefs?.colors : undefined,
      font: parsedStylePrefs?.font ?? null,
      bodyFont: parsedStylePrefs?.bodyFont ?? null,
      logoUrl: parsedStylePrefs?.logoUrl,
      logoUrlDark: parsedStylePrefs?.logoUrlDark,
      brandName: parsedStylePrefs?.brandName,
      brandDomain: parsedStylePrefs?.brandDomain,
      brandDomainCandidates: parsedStylePrefs?.brandDomainCandidates,
      needsBrandDomainConfirmation: parsedStylePrefs?.needsBrandDomainConfirmation,
      slideMode: data.slideMode || 'interactive',
      referenceImages: normalizedReferenceImages,
    });

    setConversationalData(data);

    if (hasPreGeneratedSlides) {
      console.log('[DeckList] 🚀 Pre-generated slides detected - skipping outline view');

      // Build outline with pre-generated slides
      const newOutlineId = uuidv4();
      const outlineSlides: FrontendSlideOutline[] = data.slides!.map((s, i) => ({
        id: `slide-${i}`,
        title: s.title,
        subtitle: s.subtitle || '',
        content: s.content || (s.key_points?.map(kp => `• ${kp}`).join('\n')) || '',
        type: 'content' as const,
        status: 'pending' as const,
        thumbnail: '',
        notes: '',
        layout: 'default' as const,
        deepResearch: false,
        assignedVideo: s.assignedVideo, // Pass through assigned video from AI
        taggedMedia: s.taggedMedia, // Pass through tagged media
      }));

      // Log video assignments for debugging
      const slidesWithVideos = outlineSlides.filter(s => s.assignedVideo);
      if (slidesWithVideos.length > 0) {
        console.log('[DeckList] 🎬 Slides with assigned videos:', slidesWithVideos.map(s => ({ title: s.title, video: s.assignedVideo?.title })));
      }

      // Build theme payload from parsed style prefs FIRST so we can include it in outline.notes
      const themePayload = parsedStylePrefs ? {
        ...(hasExplicitColors ? {
          color_palette: {
            primary_background: parsedStylePrefs.colors?.background,
            primary_text: parsedStylePrefs.colors?.text,
            accent_1: parsedStylePrefs.colors?.accent1,
            accent_2: parsedStylePrefs.colors?.accent2,
            accent_3: parsedStylePrefs.colors?.accent3,
          },
        } : {}),
        ...((parsedStylePrefs.font || parsedStylePrefs.bodyFont) ? {
          typography: {
            hero_title: { family: parsedStylePrefs.font },
            body_text: { family: parsedStylePrefs.bodyFont },
          },
        } : {}),
        ...(parsedStylePrefs.logoUrl ? { logo: { url: parsedStylePrefs.logoUrl } } : {}),
      } : null;
      const hasThemePayload = Boolean(themePayload && Object.keys(themePayload).length > 0);

      // CRITICAL: Include notes.theme in outline so backend uses it without regenerating
      // Build notes object with theme, scraped videos, and research context
      const notesPayload: {
        theme?: any;
        videos?: any[];
        scraped_context?: string;
        research_context?: string;
        reference_sources?: Array<{ url?: string; title?: string }>;
        research_citations?: string[];
      } = {};
      if (hasThemePayload) {
        notesPayload.theme = themePayload;
      }
      if (data.scrapedVideos && data.scrapedVideos.length > 0) {
        notesPayload.videos = data.scrapedVideos;
        console.log('[DeckList] 🎬 Including', data.scrapedVideos.length, 'scraped videos in outline.notes');
      }
      if (data.scraped_context) notesPayload.scraped_context = data.scraped_context;
      if (data.research_context) notesPayload.research_context = data.research_context;
      if (data.reference_sources) notesPayload.reference_sources = data.reference_sources;
      if (data.research_citations) notesPayload.research_citations = data.research_citations;

      const conversationHistory = (data.chatHistory && data.chatHistory.length > 0) ? {
        initial_request: data.topic || vibeContext,
        messages: data.chatHistory,
        context: {
          scraped_context: data.scraped_context,
          research_context: data.research_context,
          reference_sources: data.reference_sources,
          research_citations: data.research_citations,
        },
      } : undefined;

      const newOutline: FrontendDeckOutline & { notes?: { theme?: any; videos?: any[] } } = {
        id: newOutlineId,
        title: normalizeDeckTitle(data.topic) || 'New Presentation',
        stylePreferences: {
          initialIdea: data.topic,
          vibeContext: vibeContext,
          slideMode: data.slideMode || 'interactive',
          referenceImages: normalizedReferenceImages,
          // CRITICAL: Include colors, fonts, and logo so backend can use them
          colors: hasExplicitColors ? parsedStylePrefs?.colors : undefined,
          font: parsedStylePrefs?.font,
          bodyFont: parsedStylePrefs?.bodyFont,
          logoUrl: parsedStylePrefs?.logoUrl,  // CRITICAL: Include logo URL for brand slides
          logoUrlDark: parsedStylePrefs?.logoUrlDark,
          brandName: parsedStylePrefs?.brandName,
          brandDomain: parsedStylePrefs?.brandDomain,
          brandDomainCandidates: parsedStylePrefs?.brandDomainCandidates,
          needsBrandDomainConfirmation: parsedStylePrefs?.needsBrandDomainConfirmation,
        },
        uploadedMedia: normalizedUploadedMedia,
        use_uploaded_images: data.use_uploaded_images,
        slides: outlineSlides,
        // CRITICAL: Embed theme and videos in notes so backend finds them
        notes: Object.keys(notesPayload).length > 0 ? notesPayload : undefined,
        conversation_history: conversationHistory,
      };

      console.log('[DeckList] 🎨 Theme embedded in outline.notes:', hasThemePayload ? 'YES' : 'NO');
      console.log('[DeckList] 🎨 Theme fonts:', hasThemePayload ? themePayload?.typography : undefined);

      // Store theme from parsed style prefs in store as well
      if (hasThemePayload) {
        themeStore.setOutlineDeckTheme?.(newOutlineId, themePayload);

        if (hasExplicitColors) {
          // CRITICAL: Also set workspace theme so ThemePanel shows correct colors
          // This ensures the theme tab matches what was set in conversational onboarding
          const workspaceTheme = {
            name: 'Custom Theme',
            page: { backgroundColor: parsedStylePrefs?.colors?.background },
            typography: {
              paragraph: {
                fontFamily: parsedStylePrefs?.bodyFont,
                color: parsedStylePrefs?.colors?.text,
                fontSize: 16,
                fontWeight: 400,
              },
              heading: {
                fontFamily: parsedStylePrefs?.font,
                color: parsedStylePrefs?.colors?.text,
                fontWeight: 700,
              }
            },
            accent1: parsedStylePrefs?.colors?.accent1,
            accent2: parsedStylePrefs?.colors?.accent2,
          };
          const themeId = themeStore.addCustomTheme(workspaceTheme as any);
          themeStore.setWorkspaceTheme(themeId);
          console.log('[DeckList] 🎨 Synced workspace theme from onboarding:', { themeId, workspaceTheme });
        }
      }

      // DON'T set currentOutline - it would trigger the outline view to show!
      // We're going straight to generation and navigation
      setShowOutlineView(false);

      try {
        const coordinator = GenerationCoordinator.getInstance();

        // Build style preferences for generation - reuse the themePayload we already built
        const genStylePrefs = {
          vibeContext: vibeContext,
          slideMode: data.slideMode || 'interactive',
          referenceImages: normalizedReferenceImages,
          deck_theme: hasThemePayload && hasExplicitColors ? themePayload : undefined,
          // CRITICAL: Include colors, fonts, and logo from parsed style prefs
          colors: hasExplicitColors ? parsedStylePrefs?.colors : undefined,
          font: parsedStylePrefs?.font,
          bodyFont: parsedStylePrefs?.bodyFont,
          logoUrl: parsedStylePrefs?.logoUrl,
          logoUrlDark: parsedStylePrefs?.logoUrlDark,
          brandName: parsedStylePrefs?.brandName,
          brandDomain: parsedStylePrefs?.brandDomain,
          brandDomainCandidates: parsedStylePrefs?.brandDomainCandidates,
          needsBrandDomainConfirmation: parsedStylePrefs?.needsBrandDomainConfirmation,
        };

        console.log('[DeckList] 🚀 Starting generation with outline:', newOutline.title);
        console.log('[DeckList] 🎨 genStylePrefs colors:', genStylePrefs.colors);
        console.log('[DeckList] 🎨 genStylePrefs fonts:', genStylePrefs.font, genStylePrefs.bodyFont);
        console.log('[DeckList] 🎨 genStylePrefs logoUrl:', genStylePrefs.logoUrl);

        // Track if we've already navigated to prevent duplicate navigation
        let hasNavigated = false;

        const result = await coordinator.generateFromOutline(
          newOutline,
          genStylePrefs,
          (event) => {
            // Navigate to deck when we get the deck ID (only once)
            if (hasNavigated) return;
            const emittedDeckId = (event as any).deck_id || (event as any).deck_uuid || (event as any).deckId;
            if (emittedDeckId) {
              hasNavigated = true;
              console.log('[DeckList] 🚀 Navigating to deck:', emittedDeckId);
              // Clear pending outline since generation succeeded
              localStorage.removeItem('nextslide_pending_outline');
              navigate(`/deck/${emittedDeckId}?new=true`);
            }
          }
        );

        // Fallback navigation if event didn't trigger it
        if (result.deckId && !hasNavigated) {
          hasNavigated = true;
          // Clear pending outline since generation succeeded
          localStorage.removeItem('nextslide_pending_outline');
          navigate(`/deck/${result.deckId}?new=true`);
        }
      } catch (error: any) {
        console.error('[DeckList] Generation error:', error);
        setIsDeckGenerating(false);
        setShowConversationalOnboarding(false); // Hide on error so user can see error toast

        // Check if this is an insufficient credits error
        const errorMessage = error?.message || '';
        if (errorMessage.includes('INSUFFICIENT_CREDITS')) {
          try {
            // Parse the credit info from the error message
            const match = errorMessage.match(/INSUFFICIENT_CREDITS:(.+)/);
            if (match) {
              const creditInfo = JSON.parse(match[1]);
              setCreditWarningData({
                remaining: creditInfo.remaining || 0,
                required: creditInfo.required || 0,
                slideCount: data.slides?.length || 0,
              });
              setShowCreditWarning(true);
              return;
            }
          } catch (e) {
            console.error('[DeckList] Failed to parse credit info:', e);
          }
          // Fallback if parsing fails
          setCreditWarningData({
            remaining: 0,
            required: (data.slides?.length || 6) * 5,
            slideCount: data.slides?.length || 6,
          });
          setShowCreditWarning(true);
          return;
        }

        toast({
          variant: "destructive",
          title: "Error",
          description: error.message || "Failed to generate presentation",
        });
      }
      return;
    }

    // No pre-generated slides - show outline view (original flow)
    const newOutlineId = uuidv4();
    const placeholderOutline: FrontendDeckOutline = {
      id: newOutlineId,
      title: normalizeDeckTitle(data.topic) || 'Generating Presentation...',
      slides: []
    };

    themeStore.setOutlineDeckTheme?.(newOutlineId, null);
    themeStore.clearOutlineThemeRequested?.(newOutlineId);

    setCurrentOutline(placeholderOutline);
    setIsOutlineChatGenerating(true);
    setShowOutlineView(true);
  }, [navigate, toast]);

  // Effect to resume generation when user clicks "Generate Now" in toast
  useEffect(() => {
    if (shouldResumeGeneration && pendingOutlineData) {
      console.log('[DeckList] Resuming generation with pending outline data:', pendingOutlineData);

      const { outlineFlow, collectedData, pendingSlideMode } = pendingOutlineData;

      // Build the data object for handleConversationalComplete
      const resumeData = {
        topic: outlineFlow?.topic,
        stylePreferences: collectedData?.stylePreferences,
        style: outlineFlow?.brandContext || outlineFlow?.style,
        slideCount: outlineFlow?.slides?.length,
        detailLevel: collectedData?.detailLevel || 'quick',
        slideMode: pendingSlideMode,
        slides: outlineFlow?.slides,
        uploadedMedia: outlineFlow?.uploadedMedia,
        slideScreenshots: outlineFlow?.slide_screenshots,
        use_uploaded_images: collectedData?.use_uploaded_images === true,
        scraped_context: outlineFlow?.scraped_context,
        research_context: outlineFlow?.research_context,
        reference_sources: outlineFlow?.reference_sources,
        research_citations: outlineFlow?.research_citations,
      };

      console.log('[DeckList] Calling handleConversationalComplete with:', resumeData);

      // Clear state and localStorage
      localStorage.removeItem('nextslide_pending_outline');
      setPendingOutlineData(null);
      setShouldResumeGeneration(false);

      // Call handleConversationalComplete
      handleConversationalComplete(resumeData);
    }
  }, [shouldResumeGeneration, pendingOutlineData, handleConversationalComplete]);

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

  // Load API-created decks (filter from existing decks by source)
  const loadApiDecks = useCallback(async () => {
    setIsLoadingApiDecks(true);
    try {
      // Fetch decks and filter for API-created ones
      const result = await deckSyncService.getAllDecks(100, 0, 'owned');
      const apiCreated = result.decks.filter(deck => {
        // Check if deck was created via API (source stored in data field)
        const deckData = (deck as any).data || {};
        return deckData.source === 'api';
      });
      setApiDecks(apiCreated);
    } catch (error) {
      console.error('[DeckList] Error loading API decks:', error);
    } finally {
      setIsLoadingApiDecks(false);
    }
  }, []);

  // Load API decks when tab is selected
  useEffect(() => {
    if (activeTab === 'api') {
      loadApiDecks();
    }
  }, [activeTab, loadApiDecks]);

  // Check if user has API keys (to conditionally show API tab)
  useEffect(() => {
    const checkApiKeys = async () => {
      try {
        const keys = await developerApiService.listApiKeys();
        setHasApiKeys(keys.length > 0);
      } catch {
        // Silently fail - user may not have access or not be pro
        setHasApiKeys(false);
      }
    };
    if (isAuthenticated) {
      checkApiKeys();
    }
  }, [isAuthenticated]);

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
    bodyFont?: string | null;
    colors?: ColorConfig | null;
    logoUrl?: string;
    logoUrlDark?: string;
    brandName?: string;
    brandDomain?: string;
    brandDomainCandidates?: string[];
    needsBrandDomainConfirmation?: boolean;
    autoSelectImages?: boolean;
    referenceLinks?: string[];
    enableResearch?: boolean;
    slideMode?: 'interactive' | 'static';
    referenceImages?: string[];
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

  // Auto-open community bottom sheet if query param present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openCommunity = params.get('community');
    if (openCommunity === 'open') {
      setShowCommunity(true);
      // Clean the URL
      params.delete('community');
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
    // Enable scrolling on this page (check document exists for SSR/mobile safety)
    if (typeof document !== 'undefined') {
      document.documentElement.style.position = '';
      document.documentElement.style.overflow = '';
      document.body.style.position = '';
      document.body.style.overflow = '';
    }

    // Clear any persisted outline state when navigating back to deck list
    resetOutline(); // Use the reset function to ensure clean state
    setShowOutlineView(false);
    setIsOutlineChatGenerating(false);
    setIsOutlineProcessing(false);

    // Only reset deck store if we're coming back from an editor
    try {
      if (typeof sessionStorage !== 'undefined') {
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
      }
    } catch (e) {
      console.warn('[DeckList] sessionStorage not accessible:', e);
    }

    return () => {
      // Don't abort deck generation on cleanup - let it complete
      // The abort should only happen on explicit error or user cancellation

      // IMPORTANT: do NOT force html/body to `position: fixed` on unmount.
      // This has been causing mobile layout to recalc to tiny (top-left) and crash.
      // Each page (DeckList / SlideEditor) should manage its own scroll behavior.
    };
  }, []); // Empty dependency array - only run on mount

  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (isMobileView) {
      // On mobile, just prevent background scrolling while the DeckList is open.
      // Avoid `position: fixed` which is brittle on iOS and can break layout sizing.
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      document.body.style.width = '100%';
    } else {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      document.body.style.width = '';
    }

    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      document.body.style.width = '';
    };
  }, [isMobileView]);

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
    bodyFont?: string | null;
    colors?: ColorConfig | null;
    logoUrl?: string;
    logoUrlDark?: string;
    brandName?: string;
    brandDomain?: string;
    brandDomainCandidates?: string[];
    needsBrandDomainConfirmation?: boolean;
    autoSelectImages?: boolean;
    referenceLinks?: string[];
    enableResearch?: boolean;
  }) => {
    setStylePreferences(preferences);
  }, []);

  const hasExplicitColorConfig = useCallback((colors?: any) => Boolean(
    colors && (colors.background || colors.text || colors.accent1 || colors.accent2 || colors.accent3)
  ), []);

  const requestOutlineTheme = useCallback(async (outline: FrontendDeckOutline | null, stylePrefs?: any) => {
    if (!outline?.id) return;
    const themeStore = useThemeStore.getState();
    const existingTheme = themeStore.getOutlineDeckTheme?.(outline.id);
    if (existingTheme?.color_palette || existingTheme?.palette) return;
    if (outlineThemeRequestsRef.current.has(outline.id)) return;
    outlineThemeRequestsRef.current.add(outline.id);
    themeStore.markOutlineThemeRequested?.(outline.id);

    const deckId = String(outline.id || '').startsWith('temp-') ? undefined : outline.id;
    const outlineForTheme = {
      ...outline,
      stylePreferences: stylePrefs || outline.stylePreferences
    };

    try {
      window.dispatchEvent(new CustomEvent('theme_preview_update', {
        detail: { type: 'theme_loading', message: 'Generating theme...' }
      }));
    } catch {}

    try {
      const themeResult = await outlineApi.generateThemeFromOutline(
        outlineForTheme as any,
        deckId,
        (evt) => {
          try {
            window.dispatchEvent(new CustomEvent('theme_preview_update', { detail: evt }));
          } catch {}
        }
      );
      if (themeResult?.theme) {
        try {
          window.dispatchEvent(new CustomEvent('theme_preview_update', {
            detail: { type: 'theme_generated', theme: themeResult.theme, palette: themeResult.palette }
          }));
        } catch {}
      }
    } catch (err) {
      themeStore.clearOutlineThemeRequested?.(outline.id);
      outlineThemeRequestsRef.current.delete(outline.id);
      console.warn('[DeckList] Theme generation failed:', err);
    }
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

      const explicitColorPrefs = hasExplicitColorConfig(currentOutline?.stylePreferences?.colors) ||
        hasExplicitColorConfig(stylePreferences?.colors);
      const hasOutlinePalette = Boolean(
        outlineDeckTheme?.color_palette &&
        (explicitColorPrefs || hasRealThemeColors(outlineDeckTheme.color_palette))
      );

      if (hasOutlinePalette) {
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
                family: wsTheme.typography?.heading?.fontFamily || outlineDeckTheme.typography?.hero_title?.family || 'Roboto'
              },
              body_text: {
                ...(outlineDeckTheme.typography?.body_text || {}),
                family: wsTheme.typography?.paragraph?.fontFamily || outlineDeckTheme.typography?.body_text?.family || 'Roboto'
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
        const accent1 = wsTheme.accent1 || '#333333';  // Neutral fallback
        const accent2 = wsTheme.accent2 || accent1;
        const headingFamily = wsTheme.typography?.heading?.fontFamily || 'Roboto';  // Roboto fallback
        const paragraphFamily = wsTheme.typography?.paragraph?.fontFamily || 'Roboto';
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

      const generationStylePrefs = {
        ...(stylePreferences || {}),
        ...(currentOutline?.stylePreferences || {}),
      };

      // Start generation - this will return immediately with deck ID
      const resultPromise = coordinator.generateFromOutline(
        outlineWithTheme,
        generationStylePrefs,
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
    console.log('[DeckList] Dialog open change:', open, 'popupDecks:', popupDecks.length, 'isLoadingPopup:', isLoadingPopup, 'hasLoadedInitialPopup:', hasLoadedInitialPopup);

    if (open) {
      // Load popup decks when opening the dialog
      // Load if we haven't loaded initial data yet and not currently loading
      if (!hasLoadedInitialPopup && !isLoadingPopup) {
        console.log('[DeckList] Calling loadPopupDecks');
        loadPopupDecks();
      } else {
        console.log('[DeckList] NOT calling loadPopupDecks - hasLoadedInitialPopup:', hasLoadedInitialPopup, 'isLoadingPopup:', isLoadingPopup);
      }
    } else {
      // Reset search when closing
      setPopupSearchQuery('');
      setPopupSearchResults(null);
      if (popupSearchTimerRef.current) {
        clearTimeout(popupSearchTimerRef.current);
      }
    }
    setShowGallery(open);
  };

  // Do not block the outline UI with a global loader while decks list is loading.
  // The right panel handles its own skeletons. This keeps the outline/research view visible.

  if (error && !isLoading) {
    return <ErrorDisplay error={error} onRetry={() => window.location.reload()} />;
  }

  return (
    <div className="h-[100dvh] sm:h-screen bg-white dark:bg-black flex flex-col overflow-hidden relative font-sans">
      <ParticleAnimation
        isTyping={isUserTyping}
        isLoading={isOutlineChatGenerating || isDeckGenerating || isAgentThinking}
      />
      {/* <div className="noise-overlay pointer-events-none"></div> */}



      <header className="w-full bg-transparent flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 z-20 relative">
        <div className="w-12 sm:w-32"></div> {/* Spacer for centering */}
        <div className="absolute left-1/2 -translate-x-1/2 cursor-pointer" onClick={() => navigate('/')}>
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
        <div className="flex items-center gap-2 sm:gap-4">
          {!(currentOutline || isOutlineChatGenerating || showConversationalOnboarding) && !isMobileView && (
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
                    key={`onboarding-${onboardingSessionId}`}
                    initialMessage={onboardingSeedPrompt}
                    slideCount={slideCount}
                    initialUploadedFiles={uploadedFiles}
                    onComplete={(data) => {
                      // Don't hide onboarding here - handleConversationalComplete decides when to hide
                      // For pre-generated slides, we keep it visible until navigation to avoid flash
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
                            const normalizedUploadedMedia = normalizeUploadedMedia(params.uploadedMedia);

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
                                  taggedMedia: slide.taggedMedia || [],
                                  assignedVideo: slide.assignedVideo,
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
                                  slides: updatedSlides,
                                  uploadedMedia: normalizedUploadedMedia || prev.uploadedMedia
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
                                  },
                                  uploadedMedia: normalizedUploadedMedia || prev.uploadedMedia
                                };
                              });
                              
                              // Apply to theme store only when explicit colors are provided
                              const hasExplicitColors = hasExplicitColorConfig(apiColors);
                              if (hasExplicitColors) {
                                console.log('[DeckList] 🎨 APPLYING STYLE-ONLY UPDATE TO THEME STORE:', { colors: apiColors, font: apiFont });
                                const ts = useThemeStore.getState();
                                const outlineId = currentOutline?.id || '';

                                const themePayload = {
                                  color_palette: {
                                    primary_background: apiColors?.background,
                                    primary_text: apiColors?.text,
                                    accent_1: apiColors?.accent1,
                                    accent_2: apiColors?.accent2,
                                    accent_3: apiColors?.accent3,
                                    backgrounds: apiColors?.background ? [apiColors.background] : undefined,
                                    accents: [apiColors?.accent1, apiColors?.accent2, apiColors?.accent3].filter(Boolean),
                                    text_colors: apiColors?.text ? { primary: apiColors.text } : undefined
                                  }
                                };

                                ts.setOutlineDeckTheme?.(outlineId, themePayload);

                                const builtTheme = {
                                  name: apiColors?.name || 'Custom Theme',
                                  page: { backgroundColor: apiColors?.background },
                                  typography: {
                                    paragraph: { fontFamily: apiFont, color: apiColors?.text },
                                    heading: { fontFamily: apiFont, color: apiColors?.text }
                                  },
                                  accent1: apiColors?.accent1,
                                  accent2: apiColors?.accent2
                                };

                                const addedId = ts.addCustomTheme(builtTheme as any);
                                ts.setWorkspaceTheme(addedId);
                                ts.setOutlineTheme(outlineId, { ...builtTheme, id: addedId, isCustom: true } as any);
                                ts.setThemeReady(true);

                                window.dispatchEvent(new CustomEvent('theme_preview_update', {
                                  detail: { type: 'theme_generated', theme: themePayload }
                                }));

                                console.log('[DeckList] ✅ Theme applied from stylePreferences-only update!');
                              } else if (currentOutline) {
                                const nextStylePrefs = {
                                  ...(currentOutline.stylePreferences || {}),
                                  ...apiStylePrefs,
                                  colors: apiColors || currentOutline.stylePreferences?.colors
                                };
                                const hasThemeSignal = Boolean(
                                  nextStylePrefs.brandDomain ||
                                  nextStylePrefs.brandName ||
                                  nextStylePrefs.vibeContext ||
                                  nextStylePrefs.initialIdea
                                );
                                if (hasThemeSignal) {
                                  void requestOutlineTheme(
                                    { ...currentOutline, stylePreferences: nextStylePrefs },
                                    nextStylePrefs
                                  );
                                }
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
                                const conversationHistory = (conversationalData?.chatHistory && conversationalData.chatHistory.length > 0) ? {
                                  initial_request: conversationalData.topic || params.topic,
                                  messages: conversationalData.chatHistory,
                                  context: {
                                    scraped_context: params.scraped_context,
                                    research_context: params.research_context,
                                    reference_sources: params.reference_sources,
                                    research_citations: params.research_citations,
                                  },
                                } : prev.conversation_history;

                                return {
                                  ...prev,
                                  title: normalizeDeckTitle(params.topic) || prev.title,
                                  stylePreferences: params.stylePreferences ? {
                                    ...prev.stylePreferences,
                                    ...params.stylePreferences
                                  } : prev.stylePreferences,
                                  uploadedMedia: normalizedUploadedMedia || prev.uploadedMedia,
                                  notes: {
                                    ...(prev.notes || {}),
                                    ...(params.scraped_context ? { scraped_context: params.scraped_context } : {}),
                                    ...(params.research_context ? { research_context: params.research_context } : {}),
                                    ...(params.reference_sources ? { reference_sources: params.reference_sources } : {}),
                                    ...(params.research_citations ? { research_citations: params.research_citations } : {}),
                                  },
                                  conversation_history: conversationHistory,
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
                                taggedMedia: s.taggedMedia || [],
                                assignedVideo: s.assignedVideo,
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
                            const themeColors = (cp.primary_background || cp.primary_text || cp.accent_1 || cp.accent_2) ? {
                              type: 'custom' as const,
                              background: cp.primary_background,
                              text: cp.primary_text,
                              accent1: cp.accent_1,
                              accent2: cp.accent_2,
                              accent3: cp.accents?.[2]
                            } : undefined;

                            // Use API colors FIRST (this is where the backend sends Pikachu yellow, etc.)
                            const finalColors = hasExplicitColorConfig(apiColors)
                              ? apiColors
                              : hasExplicitColorConfig(themeColors)
                                ? themeColors
                                : hasExplicitColorConfig(currentOutline?.stylePreferences?.colors)
                                  ? currentOutline?.stylePreferences?.colors
                                  : hasExplicitColorConfig(stylePreferences?.colors)
                                    ? stylePreferences?.colors
                                    : undefined;
                            
                            const apiFont = apiStylePrefs?.font;
                            console.log('[DeckList] 🎨 API stylePreferences:', apiStylePrefs);
                            console.log('[DeckList] 🎨 API colors:', apiColors);
                            console.log('[DeckList] 🎨 API font:', apiFont);
                            console.log('[DeckList] 🎨 Final colors:', finalColors);

                            const conversationHistory = (conversationalData?.chatHistory && conversationalData.chatHistory.length > 0) ? {
                              initial_request: conversationalData.topic || params.topic,
                              messages: conversationalData.chatHistory,
                              context: {
                                scraped_context: params.scraped_context,
                                research_context: params.research_context,
                                reference_sources: params.reference_sources,
                                research_citations: params.research_citations,
                              },
                            } : currentOutline?.conversation_history;

                            const newOutline: FrontendDeckOutline = {
                              id: currentOutline?.id || uuidv4(), // Preserve ID if updating placeholder
                              title: normalizeDeckTitle(params.topic) || currentOutline?.title || 'Presentation',
                              slides: initialSlides,
                              uploadedMedia: normalizedUploadedMedia || currentOutline?.uploadedMedia,
                              use_uploaded_images: params.use_uploaded_images ?? currentOutline?.use_uploaded_images,
                              // CRITICAL: Persist stylePreferences so theme tab can load them on revisit
                              stylePreferences: {
                                ...currentOutline?.stylePreferences,
                                ...stylePreferences,
                                ...apiStylePrefs,  // Include ALL API style prefs (logo, font, etc.)
                                colors: finalColors
                              },
                              notes: {
                                ...(currentOutline?.notes || {}),
                                ...(params.scraped_context ? { scraped_context: params.scraped_context } : {}),
                                ...(params.research_context ? { research_context: params.research_context } : {}),
                                ...(params.reference_sources ? { reference_sources: params.reference_sources } : {}),
                                ...(params.research_citations ? { research_citations: params.research_citations } : {}),
                              },
                              conversation_history: conversationHistory,
                            };

                            console.log('[DeckList] ✅ Setting new outline with', newOutline.slides.length, 'slides');
                            console.log('[DeckList] 🎨 Outline stylePreferences.colors:', newOutline.stylePreferences?.colors);
                            setCurrentOutline(newOutline);
                            
                            // CRITICAL: If API sent colors OR font (e.g., Pikachu yellow + Bungee font), apply to theme store NOW
                            const hasApiColors = hasExplicitColorConfig(apiColors);
                            if (hasApiColors) {
                              console.log('[DeckList] 🎨 APPLYING API THEME TO STORE:', { colors: apiColors, font: apiFont });
                              const ts = useThemeStore.getState();
                              
                              // Build theme payload for theme store
                              const themePayload = {
                                color_palette: {
                                  primary_background: apiColors?.background,
                                  primary_text: apiColors?.text,
                                  accent_1: apiColors?.accent1,
                                  accent_2: apiColors?.accent2,
                                  accent_3: apiColors?.accent3,
                                  backgrounds: apiColors?.background ? [apiColors.background] : undefined,
                                  accents: [apiColors?.accent1, apiColors?.accent2, apiColors?.accent3].filter(Boolean),
                                  text_colors: apiColors?.text ? { primary: apiColors.text } : undefined
                                }
                              };
                              
                              // Store in outline deck theme
                              ts.setOutlineDeckTheme?.(newOutline.id, themePayload);
                              
                              const fontToApply = apiFont;
                              console.log('[DeckList] 🎨 APPLYING FONT TO WORKSPACE THEME (batch):', fontToApply);
                              
                              // Create workspace theme to match
                              const builtTheme = {
                                name: apiColors?.name || 'Custom Theme',
                                page: { backgroundColor: apiColors?.background },
                                typography: {
                                  paragraph: { fontFamily: fontToApply, color: apiColors?.text },
                                  heading: { fontFamily: fontToApply, color: apiColors?.text }
                                },
                                accent1: apiColors?.accent1,
                                accent2: apiColors?.accent2
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
                            } else {
                              const hasThemeSignal = Boolean(
                                newOutline.stylePreferences?.brandDomain ||
                                newOutline.stylePreferences?.brandName ||
                                newOutline.stylePreferences?.vibeContext ||
                                newOutline.stylePreferences?.initialIdea
                              );
                              if (hasThemeSignal) {
                                void requestOutlineTheme(newOutline, newOutline.stylePreferences);
                              }
                            }
                            // Note: We don't manually set isOutlineChatGenerating(false) here anymore.
                            // The ChatPanel component monitors the agent's processing state and updates it automatically.
                            // This ensures the loading state persists during partial updates and clears only when done.

                            // DON'T handle theme changes here - let OutlineDisplayView handle all theme state
                            // This prevents premature setThemeReady(true) before actual colors are loaded
                            // OutlineDisplayView will set themeReady when fonts/colors are actually applied
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
                <div
                  className={cn(
                    "relative font-sans text-slate-900 dark:text-zinc-100 selection:bg-orange-100 dark:selection:bg-orange-900/30 selection:text-orange-900 dark:selection:text-orange-300",
                    isMobileView
                      ? "w-full h-full flex flex-col overflow-hidden"
                      : "w-full h-full flex overflow-hidden"
                  )}
                >
                  {/* Particle Background */}


                  {/* Left Pane: Hero Section */}
                  <div
                    className={cn(
                      "relative z-10 flex flex-col min-w-0",
                      isMobileView ? "w-full flex-none" : "h-full overflow-y-auto flex-1"
                    )}
                  >
                    <div className={cn("flex flex-col", isMobileView ? "min-h-0" : "min-h-full")}>
                      {/* Header Removed (Duplicate) */}

                      {/* Hero Content - Centered Vertically */}
                      <div
                        className={cn(
                          isMobileView
                            ? "flex flex-col items-center px-4 pt-3 pb-2 flex-none"
                            : "flex-1 flex flex-col justify-center items-center px-5 pt-6 pb-10 sm:p-8 sm:pb-32"
                        )}
                      >
                        <div className="max-w-md sm:max-w-3xl w-full text-center space-y-4 sm:space-y-8">
                          {/* Main Heading */}
                          <div className="space-y-3 sm:space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
                            <div className="flex flex-col items-center justify-center mb-2 sm:mb-10 space-y-2 sm:space-y-6 text-center z-10 relative">
                              <h1
                                className="text-lg sm:text-3xl md:text-4xl lg:text-5xl font-extrabold uppercase tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 dark:from-white dark:via-zinc-200 dark:to-white max-w-4xl mx-auto leading-tight"
                                style={{ fontFamily: 'HK Grotesk Wide, sans-serif' }}
                              >
                                TURN{' '}<RotatingWords compact={isMobileView} />{' '}INTO<br />PERFECT PRESENTATIONS
                              </h1>
                              <div className="space-y-2">
                                <p className="text-xs sm:text-base md:text-lg text-zinc-600 dark:text-zinc-300 max-w-2xl mx-auto">
                                  Any topic. Visualized. Perfected. In 90 seconds.
                                </p>
                                <p className="text-[11px] sm:text-sm md:text-base text-zinc-500 dark:text-zinc-400">
                                  Type, talk, or drop a file — we handle the rest.
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Input Area */}
                          <div className="relative max-w-full sm:max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100">
                            <div className="relative group">
                              <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500/20 to-blue-500/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
                              <div
                                className={cn(
                                  "relative flex items-end bg-white dark:bg-zinc-900 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-black/30 border p-2 transition-all duration-300 focus-within:shadow-2xl focus-within:border-orange-500/50 focus-within:ring-4 focus-within:ring-orange-500/10",
                                  isHeroDraggingOver ? "border-orange-500 border-dashed border-2 bg-orange-50 dark:bg-orange-950/30" : "border-slate-200 dark:border-zinc-700"
                                )}
                                onDragEnter={handleHeroDragEnter}
                                onDragOver={handleHeroDragOver}
                                onDragLeave={handleHeroDragLeave}
                                onDrop={handleHeroDrop}
                              >
                                {/* Drop Zone Overlay */}
                                {isHeroDraggingOver && (
                                  <div className="absolute inset-0 bg-orange-50 dark:bg-orange-950/80 flex items-center justify-center rounded-2xl bg-opacity-90 backdrop-blur-sm z-20">
                                    <p className="text-orange-600 dark:text-orange-400 font-medium flex items-center flex-col">
                                      <Upload className="h-6 w-6 mb-2" />
                                      <span className="text-center">Drop files here</span>
                                      <span className="text-xs mt-1 text-orange-500/70 dark:text-orange-400/70">Images, PDFs, Excel, PowerPoint</span>
                                    </p>
                                  </div>
                                )}

                                {/* Voice Recording Overlay */}
                                {isHeroVoiceRecording && (
                                  <div className="absolute inset-0 bg-white/95 dark:bg-zinc-900/95 flex items-center justify-center rounded-2xl z-20 pointer-events-none">
                                    <div className="flex items-center gap-1 px-4 py-2 bg-orange-500/10 rounded-full">
                                      <span className="text-lg font-medium text-orange-600 dark:text-orange-400">
                                        Listening
                                      </span>
                                      <span className="text-lg font-medium text-orange-600 dark:text-orange-400 animate-pulse">
                                        ...
                                      </span>
                                    </div>
                                  </div>
                                )}

                                {/* Input Field with Typewriter Placeholder */}
                                <div className="flex-1 relative min-h-[44px] sm:min-h-[48px]">
                                  <Textarea
                                    ref={heroTextareaRef}
                                    className="w-full border-none shadow-none focus-visible:ring-0 min-h-[44px] sm:min-h-[48px] max-h-[150px] bg-transparent placeholder:text-slate-300 dark:placeholder:text-zinc-500 px-3 py-2.5 sm:px-4 sm:py-3 font-sans dark:text-zinc-100 resize-none overflow-y-auto text-base leading-normal"
                                    value={heroInput}
                                    onChange={(e) => setHeroInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey && (heroInput.trim() || uploadedFiles.length > 0)) {
                                        e.preventDefault();
                                        openConversationalOnboarding(heroInput);
                                      }
                                    }}
                                    rows={1}
                                    onInput={(e) => {
                                      const target = e.target as HTMLTextAreaElement;
                                      target.style.height = `${heroTextareaBaseHeight}px`;
                                      target.style.height = Math.min(target.scrollHeight, 150) + 'px';
                                    }}
                                  />
                                  {!heroInput && (
                                    <div className="absolute top-0 left-0 right-0 pointer-events-none flex items-center px-3 sm:px-4 h-[44px] sm:h-[48px] text-sm sm:text-base leading-tight text-slate-400 dark:text-zinc-500 min-w-0 overflow-hidden">
                                      <span className="whitespace-nowrap">{heroPlaceholderPrefix}</span>
                                      <span className="min-w-0 truncate text-slate-300 dark:text-zinc-600">{typewriterText}</span>
                                      <span className="ml-0.5 animate-pulse text-orange-500">|</span>
                                    </div>
                                  )}
                                </div>

                                {/* Actions Divider */}
                                <div className="h-6 sm:h-8 w-px bg-slate-200 dark:bg-zinc-700 mx-1 sm:mx-2 self-center"></div>

                                {/* Action Buttons */}
                                <div className="flex items-center gap-0.5 sm:gap-1 pr-1 sm:pr-2 flex-shrink-0">
                                  {/* Upload Button */}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 sm:h-8 sm:w-8 text-slate-500 dark:text-zinc-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/50 rounded-xl transition-colors"
                                    onClick={() => fileInputRef.current?.click()}
                                    title="Upload files"
                                  >
                                    <Upload className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
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
                                        className="h-7 w-7 sm:h-8 sm:w-8 text-slate-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-xl transition-colors"
                                        title="Add link"
                                      >
                                        <LinkIcon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80 p-4 dark:bg-zinc-900 dark:border-zinc-700" side="top" align="center">
                                      <div className="space-y-3">
                                        <div>
                                          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Add a link</p>
                                          <p className="text-xs text-zinc-500 dark:text-zinc-400">We'll extract content from articles, docs, or websites</p>
                                        </div>
                                        <div className="flex gap-2">
                                          <Input
                                            placeholder="https://..."
                                            value={linkInput}
                                            onChange={(e) => setLinkInput(e.target.value)}
                                            className="h-9 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
                                            onKeyDown={(e) => e.key === 'Enter' && handleLinkAdd()}
                                            autoFocus
                                          />
                                          <Button size="sm" onClick={handleLinkAdd} className="bg-orange-500 hover:bg-orange-600 text-white h-9 px-3">
                                            Add
                                          </Button>
                                        </div>
                                      </div>
                                    </PopoverContent>
                                  </Popover>

                                  {/* Voice Input Button */}
                                  <VoiceRecorder
                                    onTranscript={(text) => {
                                      setHeroInput(prev => {
                                        const newText = prev.trim() ? `${prev} ${text}` : text;
                                        // Auto-resize and scroll textarea after state update
                                        setTimeout(() => {
                                          if (heroTextareaRef.current) {
                                            heroTextareaRef.current.style.height = `${heroTextareaBaseHeight}px`;
                                            heroTextareaRef.current.style.height = Math.min(heroTextareaRef.current.scrollHeight, 150) + 'px';
                                            heroTextareaRef.current.scrollTop = heroTextareaRef.current.scrollHeight;
                                          }
                                        }, 0);
                                        return newText;
                                      });
                                    }}
                                    onRecordingStart={() => setIsHeroVoiceRecording(true)}
                                    onRecordingEnd={() => setIsHeroVoiceRecording(false)}
                                    onError={(error) => {
                                      console.error('Voice recording error:', error);
                                    }}
                                    size="sm"
                                    variant="mic"
                                  />

                                  {/* Submit Button */}
                                  <Button
                                    size="icon"
                                    className="h-10 w-10 sm:h-12 sm:w-12 ml-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20 transition-all hover:scale-105 active:scale-95"
                                    onClick={() => {
                                      if (heroInput.trim() || uploadedFiles.length > 0) {
                                        openConversationalOnboarding(heroInput);
                                      }
                                    }}
                                  >
                                    <ArrowRight size={isMobileView ? 20 : 24} />
                                  </Button>
                                </div>
                              </div>
                            </div>

                            {/* Uploaded Files Preview */}
                            {uploadedFiles.length > 0 && (
                              <div className="mt-4 flex flex-wrap gap-2 justify-center animate-in fade-in slide-in-from-top-2">
                                {uploadedFiles.map((file, i) => (
                                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-white/80 dark:bg-zinc-800/80 backdrop-blur-sm border border-slate-200 dark:border-zinc-700 rounded-lg shadow-sm text-sm text-slate-600 dark:text-zinc-300">
                                    <FilePlus size={14} className="text-orange-500" />
                                    <span className="max-w-[150px] truncate">{file.name}</span>
                                    <button
                                      onClick={() => setUploadedFiles(prev => prev.filter((_, idx) => idx !== i))}
                                      className="ml-1 text-slate-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
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
                    className="hidden lg:flex w-1 h-full cursor-ew-resize hover:bg-orange-500/50 transition-colors relative z-50 flex-shrink-0 group"
                    onMouseDown={handleResizeStart}
                  >
                    <div className="absolute inset-y-0 -left-2 -right-2 z-50" /> {/* Hit area */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 bg-zinc-300 dark:bg-zinc-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>

                  {/* Right Pane: Deck List */}
                  <div
                    className={cn(
                      "bg-white/60 dark:bg-zinc-900/90 backdrop-blur-xl shadow-xl shadow-slate-200/50 dark:shadow-black/30 relative z-10 flex flex-col flex-none",
                      isMobileView
                        ? "w-full flex-1 min-h-0 border-t border-white/50 dark:border-zinc-800/50 mt-2 overflow-hidden"
                        : "h-full border-l border-white/50 dark:border-zinc-800/50"
                    )}
                    style={{ width: isMobileView ? '100%' : `${deckListWidth}%` }}
                  >
                    <div
                      className={cn(
                        "border-b border-zinc-100 dark:border-zinc-800 flex-shrink-0",
                        isMobileView ? "p-3 pt-3" : "p-4 pt-4"
                      )}
                    >
                      <div className="flex flex-col gap-4">
                        <div className="relative w-full">
                          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                          <Input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Search all decks..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-white/50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 focus:bg-white dark:focus:bg-zinc-800 pl-9 sm:pl-10 pr-8 h-8 sm:h-9 rounded-lg text-xs sm:text-sm dark:text-zinc-100 dark:placeholder:text-zinc-500"
                          />
                          {/* Loading indicator or clear button */}
                          {isSearching ? (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 animate-spin" />
                          ) : searchQuery ? (
                            <button
                              type="button"
                              onClick={() => {
                                clearSearch();
                                searchInputRef.current?.focus();
                              }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>

                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                          <TabsList className={cn("w-full bg-zinc-100/50 dark:bg-zinc-800/50 p-1 rounded-lg grid", hasApiKeys ? "grid-cols-3" : "grid-cols-2")}>
                            <TabsTrigger value="by-me" className="rounded-md text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-900 dark:data-[state=active]:text-zinc-100">My Decks</TabsTrigger>
                            <TabsTrigger value="shared" className="rounded-md text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-900 dark:data-[state=active]:text-zinc-100">Shared</TabsTrigger>
                            {hasApiKeys && (
                              <TabsTrigger value="api" className="rounded-md text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-900 dark:data-[state=active]:text-zinc-100">API</TabsTrigger>
                            )}
                          </TabsList>
                        </Tabs>

                        {/* View All button */}
                        <div className="flex justify-end -mt-1">
                          <button
                            onClick={() => handleDialogOpenChange(true)}
                            className="group flex items-center gap-1 text-[10px] font-semibold tracking-wider text-orange-500 hover:text-orange-600 dark:text-orange-400 dark:hover:text-orange-300 transition-colors"
                          >
                            <span>VIEW ALL</span>
                            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y p-3 sm:p-4">
                      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full">
                        <TabsContent value="by-me" className="mt-0 h-full">
                          {isLoading ? (
                            <div className="grid grid-cols-1 gap-4">
                              {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="aspect-[16/9] bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
                              ))}
                            </div>
                          ) : filteredDecks.length === 0 ? (
                            <EmptyDeckList searchQuery={searchQuery} onCreateDeck={handleCreateDeck} authError={authError} onReload={loadDecks} isSearching={isSearching} />
                          ) : (
                            <VirtualizedDeckGrid
                              decks={filteredDecks}
                              onEdit={handleEditDeck}
                              onShowDeleteDialog={handleShowDeleteDialog}
                              onLoadMore={loadMoreDecks}
                              hasMore={searchQuery ? false : hasMore} // Disable load more when searching (server returns all results)
                              isLoadingMore={isLoadingMore}
                              isInitialLoad={true}
                            />
                          )}
                        </TabsContent>

                        <TabsContent value="shared" className="mt-0 h-full">
                          {isLoadingShared ? (
                            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-orange-500" /></div>
                          ) : sharedDecks.length === 0 ? (
                            <div className="text-center py-12 text-zinc-500 dark:text-zinc-400 text-sm">No shared presentations found.</div>
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
                        {hasApiKeys && (
                          <TabsContent value="api" className="mt-0 h-full">
                            {isLoadingApiDecks ? (
                              <div className="flex justify-center py-12"><Loader2 className="animate-spin text-orange-500" /></div>
                            ) : apiDecks.length === 0 ? (
                              <div className="text-center py-12 text-zinc-500 dark:text-zinc-400 text-sm">No API-created presentations yet.</div>
                            ) : (
                              <VirtualizedDeckGrid
                                decks={apiDecks}
                                onEdit={handleEditDeck}
                                onShowDeleteDialog={handleShowDeleteDialog}
                                onLoadMore={() => { }}
                                hasMore={false}
                                isLoadingMore={false}
                                isInitialLoad={false}
                              />
                            )}
                          </TabsContent>
                        )}
                      </Tabs>
                    </div>

                    {/* View All Presentations Dialog - Sleek & Sophisticated Design */}
                    <Dialog open={showGallery} onOpenChange={handleDialogOpenChange}>
                      <DialogContent className="sm:max-w-[1100px] h-[85vh] p-0 overflow-hidden flex flex-col bg-gradient-to-br from-white via-zinc-50/80 to-zinc-100/50 dark:from-zinc-900 dark:via-zinc-900/95 dark:to-black border-zinc-200/50 dark:border-zinc-800/50 shadow-2xl shadow-black/10 dark:shadow-black/50 backdrop-blur-xl">
                        {/* Sleek header with gradient accent */}
                        <div className="relative px-8 pt-8 pb-6 flex-shrink-0">
                          {/* Subtle gradient line accent */}
                          <div className="absolute top-0 left-8 right-8 h-[2px] bg-gradient-to-r from-transparent via-orange-500/60 to-transparent" />

                          <DialogHeader className="space-y-1">
                            {/* @ts-ignore - DialogTitle children prop issue */}
                            <DialogTitle className="text-2xl tracking-tight text-zinc-900 dark:text-zinc-100">
                              <span className="font-bold">All Presentations</span>
                            </DialogTitle>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">
                              Browse and manage your presentation library
                            </p>
                          </DialogHeader>

                          {/* Elegant search bar */}
                          <div className="relative mt-6">
                            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 via-transparent to-orange-500/5 rounded-xl blur-xl" />
                            <div className="relative flex items-center">
                              <SearchIcon className="absolute left-4 h-4 w-4 text-zinc-400 dark:text-zinc-500" />
                              <Input
                                type="text"
                                placeholder="Search all presentations..."
                                value={popupSearchQuery}
                                onChange={(e) => handlePopupSearchChange(e.target.value)}
                                className="w-full bg-white/80 dark:bg-zinc-800/50 border-zinc-200/80 dark:border-zinc-700/50 hover:border-orange-300/50 dark:hover:border-orange-500/30 focus:border-orange-400 dark:focus:border-orange-500/50 text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 pl-11 pr-4 rounded-xl h-11 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-orange-500/20 focus-visible:ring-offset-0 transition-all duration-200"
                              />
                              {isPopupSearching ? (
                                <Loader2 className="absolute right-4 h-4 w-4 text-orange-500 animate-spin" />
                              ) : popupSearchQuery ? (
                                <button
                                  onClick={() => {
                                    setPopupSearchQuery('');
                                    setPopupSearchResults(null);
                                  }}
                                  className="absolute right-4 p-0.5 rounded-full hover:bg-zinc-200/80 dark:hover:bg-zinc-700/80 transition-colors"
                                >
                                  <X className="h-3.5 w-3.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {/* Tabs with modern styling */}
                        <Tabs defaultValue="by-me" className="flex flex-col flex-grow overflow-hidden">
                          <div className="px-8 flex-shrink-0 border-b border-zinc-100 dark:border-zinc-800/50">
                            <TabsList className="bg-transparent h-auto p-0 gap-6">
                              <TabsTrigger
                                value="by-me"
                                className="relative bg-transparent px-0 py-3 text-sm font-medium text-zinc-500 dark:text-zinc-400 data-[state=active]:text-zinc-900 dark:data-[state=active]:text-zinc-100 data-[state=active]:shadow-none rounded-none transition-colors after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-orange-500 after:scale-x-0 after:transition-transform after:duration-200 data-[state=active]:after:scale-x-100"
                              >
                                My Presentations
                              </TabsTrigger>
                              <TabsTrigger
                                value="shared"
                                className="relative bg-transparent px-0 py-3 text-sm font-medium text-zinc-500 dark:text-zinc-400 data-[state=active]:text-zinc-900 dark:data-[state=active]:text-zinc-100 data-[state=active]:shadow-none rounded-none transition-colors after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-orange-500 after:scale-x-0 after:transition-transform after:duration-200 data-[state=active]:after:scale-x-100"
                              >
                                Shared with Me
                              </TabsTrigger>
                              {hasApiKeys && (
                                <TabsTrigger
                                  value="api"
                                  className="relative bg-transparent px-0 py-3 text-sm font-medium text-zinc-500 dark:text-zinc-400 data-[state=active]:text-zinc-900 dark:data-[state=active]:text-zinc-100 data-[state=active]:shadow-none rounded-none transition-colors after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-orange-500 after:scale-x-0 after:transition-transform after:duration-200 data-[state=active]:after:scale-x-100"
                                >
                                  API Decks
                                </TabsTrigger>
                              )}
                            </TabsList>
                          </div>

                          {/* Content area with refined styling */}
                          <div className="flex-grow overflow-y-auto">
                            <div className="p-8">
                              <TabsContent value="by-me" className="mt-0 data-[state=active]:flex data-[state=active]:flex-col">
                                {(isLoadingPopup || isPopupSearching) && filteredPopupDecks.length === 0 ? (
                                  <div className="flex flex-col items-center justify-center py-20">
                                    <div className="relative">
                                      <div className="absolute inset-0 bg-orange-500/20 rounded-full blur-xl animate-pulse" />
                                      <Loader2 className="relative h-8 w-8 text-orange-500 animate-spin" />
                                    </div>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-6">
                                      {isPopupSearching ? 'Searching...' : 'Loading your presentations...'}
                                    </p>
                                  </div>
                                ) : filteredPopupDecks.length === 0 && popupSearchQuery.trim() && !isPopupSearching ? (
                                  <div className="flex flex-col items-center justify-center py-20">
                                    <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
                                      <SearchIcon className="h-7 w-7 text-zinc-400 dark:text-zinc-500" />
                                    </div>
                                    <p className="text-lg text-zinc-600 dark:text-zinc-300">No results for "{popupSearchQuery}"</p>
                                    <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">Try a different search term</p>
                                  </div>
                                ) : filteredPopupDecks.length === 0 && !popupSearchQuery.trim() ? (
                                  <div className="flex flex-col items-center justify-center py-20">
                                    <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
                                      <Grid className="h-7 w-7 text-zinc-400 dark:text-zinc-500" />
                                    </div>
                                    <p className="text-lg text-zinc-600 dark:text-zinc-300">No presentations yet</p>
                                    <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">Create your first presentation to get started</p>
                                  </div>
                                ) : (
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
                                )}
                              </TabsContent>
                              <TabsContent value="shared" className="mt-0 data-[state=active]:flex data-[state=active]:flex-col">
                                {isLoadingShared ? (
                                  <div className="flex flex-col items-center justify-center py-20">
                                    <div className="relative">
                                      <div className="absolute inset-0 bg-orange-500/20 rounded-full blur-xl animate-pulse" />
                                      <Loader2 className="relative h-8 w-8 text-orange-500 animate-spin" />
                                    </div>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-6 font-light">Loading shared presentations...</p>
                                  </div>
                                ) : sharedDecksError ? (
                                  <div className="flex flex-col items-center justify-center py-20">
                                    <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-4">
                                      <X className="h-7 w-7 text-red-400 dark:text-red-500" />
                                    </div>
                                    <p className="text-lg font-light text-red-600 dark:text-red-400">Error loading presentations</p>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 mb-4">{sharedDecksError}</p>
                                    <Button onClick={loadSharedDecks} size="sm" variant="outline" className="rounded-lg">
                                      Try Again
                                    </Button>
                                  </div>
                                ) : sharedDecks.length === 0 ? (
                                  <div className="flex flex-col items-center justify-center py-20">
                                    <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
                                      <UserIcon className="h-7 w-7 text-zinc-400 dark:text-zinc-500" />
                                    </div>
                                    <p className="text-lg font-light text-zinc-600 dark:text-zinc-300">No shared presentations</p>
                                    <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">Presentations shared with you will appear here</p>
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
                              {hasApiKeys && (
                                <TabsContent value="api" className="mt-0 data-[state=active]:flex data-[state=active]:flex-col">
                                  {isLoadingApiDecks ? (
                                    <div className="flex flex-col items-center justify-center py-20">
                                      <div className="relative">
                                        <div className="absolute inset-0 bg-orange-500/20 rounded-full blur-xl animate-pulse" />
                                        <Loader2 className="relative h-8 w-8 text-orange-500 animate-spin" />
                                      </div>
                                      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-6 font-light">Loading API presentations...</p>
                                    </div>
                                  ) : apiDecks.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20">
                                      <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
                                        <Grid className="h-7 w-7 text-zinc-400 dark:text-zinc-500" />
                                      </div>
                                      <p className="text-lg font-light text-zinc-600 dark:text-zinc-300">No API presentations</p>
                                      <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">Presentations created via the API will appear here</p>
                                    </div>
                                  ) : (
                                    <VirtualizedPopupDeckGrid
                                      decks={apiDecks}
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
                              )}
                            </div>
                          </div>
                        </Tabs>

                        {/* Subtle bottom gradient fade */}
                        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white/80 dark:from-zinc-900/80 to-transparent pointer-events-none" />
                      </DialogContent>
                    </Dialog>

                    <AppearanceOnboarding
                      open={showAppearanceOnboarding}
                      onComplete={() => setShowAppearanceOnboarding(false)}
                    />

                    <GoogleSlidesImportModal open={showGoogleImport} onOpenChange={setShowGoogleImport} />

                    {/* Credit Warning Dialog - shows when user has insufficient credits */}
                    <CreditWarningDialog
                      open={showCreditWarning}
                      onClose={() => setShowCreditWarning(false)}
                      remainingCredits={creditWarningData.remaining}
                      requiredCredits={creditWarningData.required}
                      slideCount={creditWarningData.slideCount}
                      planName="free"
                      onProceed={markOverageConfirmed}
                    />

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

      {/* Community Button - Fixed at bottom, hidden during conversational onboarding */}
      {!showConversationalOnboarding && (
        <button
          onClick={() => setShowCommunity(true)}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 px-5 py-2.5 bg-black dark:bg-white text-white dark:text-black text-sm font-medium rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center gap-2"
        >
          <Users2 className="h-4 w-4" />
          Community Slides
        </button>
      )}

      {/* Community Bottom Sheet */}
      <CommunityBottomSheet
        isOpen={showCommunity}
        onClose={() => setShowCommunity(false)}
      />
    </div>
  );
};

export default DeckList;
