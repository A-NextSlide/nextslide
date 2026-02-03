import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Search,
  Grid3X3,
  List,
  FileStack,
  Eye,
  Edit,
  Share2,
  MoreVertical,
  Download,
  Trash2,
  ExternalLink,
  Loader2,
  Sparkles,
  Star,
  Users,
  Link as LinkIcon,
  Wand2,
  Zap,
  XCircle,
  CheckCircle2,
  ArrowRight,
  Presentation,
  Layers,
  Globe,
  ChevronDown,
  ChevronUp,
  GripVertical,
  X,
  RefreshCw,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { adminApi, DeckSummary, SeedStatusResponse, SeoFeaturedDeck, SeoCommunityDeck } from '@/services/adminApi';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import DeckPreviewModal from '@/components/admin/DeckPreviewModal';

// ---------------------------------------------------------------------------
// Thumbnail URL helper — same pattern used by CommunityDeckCard
// ---------------------------------------------------------------------------
const SUPABASE_BASE = import.meta.env.VITE_SUPABASE_URL || 'https://auth.nextslide.ai';
function thumbnailUrl(deckUuid: string): string {
  return `${SUPABASE_BASE}/storage/v1/object/public/thumbnails/thumbnails/${deckUuid}_s0.png`;
}

// ---------------------------------------------------------------------------
// Debounce hook
// ---------------------------------------------------------------------------
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Shared design tokens (match AdminServices)
// ---------------------------------------------------------------------------
const sectionHeading = "text-[10px] font-bold uppercase tracking-wider text-[#FF4301]";
const cardClass = "bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl";

type ViewMode = 'grid' | 'list';

const PAGE_SIZE = 24;

const STYLE_OPTIONS = [
  { value: 'corporate', label: 'Corporate' },
  { value: 'creative', label: 'Creative' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'bold', label: 'Bold' },
];

const CATEGORY_OPTIONS = [
  { value: 'business', label: 'Business', seo: 'pitch-deck, sales-deck, startups, consultants' },
  { value: 'education', label: 'Education', seo: 'education, educators' },
  { value: 'marketing', label: 'Marketing', seo: 'marketing, marketers' },
  { value: 'creative', label: 'Creative' },
  { value: 'technology', label: 'Technology' },
  { value: 'personal', label: 'Personal' },
];

// Prompt text mapped to each hero deckIndex (from InteractiveHero PROMPTS)
const HERO_PROMPTS: Record<number, { badge: string; text: string }> = {
  0: { badge: 'Startup', text: 'Pitch deck for VCs who\'ve already seen 500 this month' },
  1: { badge: 'Investment', text: 'Short-term stock analysis that reads like a Goldman memo' },
  2: { badge: 'Education', text: 'Algebra for kids who ask "when will I use this"' },
  3: { badge: 'Learn', text: 'How coffee conquered the world' },
  4: { badge: 'Pitch', text: 'Demo day pitch that actually fits in 3 minutes' },
  5: { badge: 'Education', text: 'Cellular Respiration: From Glucose to ATP' },
  6: { badge: 'Learn', text: 'The French Revolution: From Monarchy to Republic' },
  7: { badge: 'Sales', text: 'Client proposal that closes itself' },
  8: { badge: 'Learn', text: 'Interactive Presentation About 2000s Internet Culture' },
  9: { badge: 'Science', text: 'How to Survive a Zombie Apocalypse Using Science' },
  10: { badge: 'Culture', text: 'Why the 90s Internet Was the Wild West of Creativity' },
  11: { badge: 'Marketing', text: 'Social media strategy that actually converts' },
};

const RANDOM_PROMPTS = [
  'Pitch deck for an AI-powered healthcare startup raising $5M Series A',
  'How coffee conquered the world — from Ethiopia to your morning latte',
  'Algebra for kids who ask "when will I ever use this?"',
  'Social media strategy that actually converts — not just likes',
  'The French Revolution: From Monarchy to Republic',
  'Client proposal for a $200K digital transformation consulting engagement',
  'How to survive a zombie apocalypse using science',
  'Quarterly business review showing 40% efficiency improvement',
  'Introduction to machine learning for business leaders',
  'Climate change solutions that are already working',
  '2000s internet culture — a nostalgic trip through the golden age',
  'The psychology of persuasion in marketing and sales',
  'Cellular Respiration: From Glucose to ATP',
  'Product demo deck for a project management tool',
  'Annual marketing strategy for a DTC skincare brand',
  'Why the 90s Internet was the Wild West of Creativity',
];

// ---------------------------------------------------------------------------
// Seed Job Type
// ---------------------------------------------------------------------------
interface SeedJob {
  deckId: string;
  topic: string;
  status: 'queued' | 'generating' | 'completed' | 'failed';
  progress: number;
  slideCount: number;
  message: string;
  name: string;
  error?: string;
  pushedTo?: ('featured' | 'community')[];
  shareUrl?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const AdminDecks: React.FC = () => {
  // Gallery state
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalDecks, setTotalDecks] = useState(0);
  const [selectedDeck, setSelectedDeck] = useState<DeckSummary | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewDeckIndex, setPreviewDeckIndex] = useState(0);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Seeder state
  const [seedPrompt, setSeedPrompt] = useState('');
  const [seedStyle, setSeedStyle] = useState('creative');
  const [seedSlides, setSeedSlides] = useState('8');
  const [seedJobs, setSeedJobs] = useState<SeedJob[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [pushCategory, setPushCategory] = useState('business');
  const [batchCount, setBatchCount] = useState('5');

  // SEO state
  const [seoExpanded, setSeoExpanded] = useState(false);
  const [seoPages, setSeoPages] = useState<{ slug: string; title: string; communityCategory: string; type: string; communityDeckCount: number }[]>([]);
  const [featuredDecks, setFeaturedDecks] = useState<SeoFeaturedDeck[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [seoLoading, setSeoLoading] = useState(false);
  const [selectedSeoCategory, setSelectedSeoCategory] = useState<string | null>(null);
  const [communityDecksForCategory, setCommunityDecksForCategory] = useState<SeoCommunityDeck[]>([]);
  const [draggedFeatured, setDraggedFeatured] = useState<string | null>(null);
  const [dragOverFeatured, setDragOverFeatured] = useState<string | null>(null);
  const [heroPoolCollapsed, setHeroPoolCollapsed] = useState(false);
  const [reseedingUuids, setReseedingUuids] = useState<Set<string>>(new Set());
  const [isReseedingAll, setIsReseedingAll] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);
  const pollIntervalsRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const debouncedSearch = useDebounce(searchQuery, 400);

  // ── Gallery fetch logic ──
  useEffect(() => {
    setCurrentPage(1);
    setHasMore(true);
    fetchDecks(1, true);
  }, [debouncedSearch, visibilityFilter]);

  useEffect(() => {
    if (currentPage > 1) fetchDecks(currentPage, false);
  }, [currentPage]);

  const fetchDecks = async (page: number, isReset: boolean) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      // Only show full skeleton on first load, not on search changes
      if (isReset && decks.length === 0) setIsLoading(true);
      else if (!isReset) setIsLoadingMore(true);

      const response = await adminApi.getAllDecks({
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch,
        visibility: visibilityFilter === 'all' ? undefined : visibilityFilter,
      });

      if (isReset) setDecks(response.decks);
      else setDecks(prev => [...prev, ...response.decks]);
      setTotalDecks(response.total);
      setHasMore(page < response.totalPages);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load decks' });
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
      isFetchingRef.current = false;
    }
  };

  // Infinite scroll sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isFetchingRef.current) {
          setCurrentPage(prev => prev + 1);
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore]);

  // ── Seeder logic ──
  const handleGenerate = async () => {
    if (!seedPrompt.trim()) {
      toast({ variant: 'destructive', title: 'Empty prompt', description: 'Type a presentation topic first' });
      return;
    }

    setIsGenerating(true);
    try {
      const result = await adminApi.seedGenerate({
        topic: seedPrompt.trim(),
        slides: parseInt(seedSlides),
        style: seedStyle,
      });

      const newJob: SeedJob = {
        deckId: result.deck_id,
        topic: seedPrompt.trim(),
        status: 'generating',
        progress: 0,
        slideCount: 0,
        message: 'Starting...',
        name: seedPrompt.trim().slice(0, 60),
        pushedTo: [],
      };

      setSeedJobs(prev => [newJob, ...prev]);
      setSeedPrompt('');
      startPolling(result.deck_id);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Generation failed', description: e.message || 'Unknown error' });
    } finally {
      setIsGenerating(false);
    }
  };

  const startPolling = useCallback((deckId: string) => {
    const interval = setInterval(async () => {
      try {
        const status = await adminApi.seedStatus(deckId);
        setSeedJobs(prev =>
          prev.map(j =>
            j.deckId === deckId
              ? {
                  ...j,
                  status: status.status as SeedJob['status'],
                  progress: status.progress,
                  slideCount: status.slide_count,
                  message: status.message,
                  name: status.name || j.name,
                  error: status.error,
                }
              : j
          )
        );

        if (status.status === 'completed' || status.status === 'failed') {
          clearInterval(interval);
          delete pollIntervalsRef.current[deckId];
          if (status.status === 'completed') {
            toast({ title: 'Deck ready', description: `"${status.name}" generated with ${status.slide_count} slides` });
            // Refresh gallery
            fetchDecks(1, true);
          }
        }
      } catch {
        // ignore poll errors
      }
    }, 2000);

    pollIntervalsRef.current[deckId] = interval;
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      Object.values(pollIntervalsRef.current).forEach(clearInterval);
    };
  }, []);

  // Fetch existing seed jobs on mount (persist across refresh)
  useEffect(() => {
    adminApi.seedJobs().then(({ jobs }) => {
      if (!jobs?.length) return;
      const restored: SeedJob[] = jobs.map(j => ({
        deckId: j.deck_id,
        topic: j.name,
        status: (['queued', 'generating'].includes(j.status) ? j.status as 'queued' | 'generating' : j.status === 'failed' ? 'failed' : 'completed') as SeedJob['status'],
        progress: j.progress || (j.status === 'completed' ? 100 : 0),
        slideCount: j.slide_count,
        message: j.message,
        name: j.name,
        error: j.error,
        pushedTo: [],
      }));
      setSeedJobs(prev => {
        const existingIds = new Set(prev.map(j => j.deckId));
        const newJobs = restored.filter(j => !existingIds.has(j.deckId));
        return [...prev, ...newJobs];
      });
      // Resume polling for any still-generating or queued jobs
      restored.filter(j => j.status === 'generating' || j.status === 'queued').forEach(j => {
        if (!pollIntervalsRef.current[j.deckId]) {
          startPolling(j.deckId);
        }
      });
    }).catch(() => {});
  }, [startPolling]);

  const handleRandomPrompt = () => {
    const prompt = RANDOM_PROMPTS[Math.floor(Math.random() * RANDOM_PROMPTS.length)];
    setSeedPrompt(prompt);
  };

  const handleBatchGenerate = async () => {
    const count = parseInt(batchCount);
    if (count < 1 || count > 20) return;

    // Pick N unique random prompts (shuffle and slice)
    const shuffled = [...RANDOM_PROMPTS].sort(() => Math.random() - 0.5);
    const prompts = shuffled.slice(0, Math.min(count, shuffled.length));
    // If we need more than available, repeat with slight variations
    while (prompts.length < count) {
      const base = RANDOM_PROMPTS[Math.floor(Math.random() * RANDOM_PROMPTS.length)];
      prompts.push(base + ' — with a modern, minimalist design twist');
    }

    setIsGenerating(true);
    try {
      const result = await adminApi.seedBatchGenerate({
        prompts,
        slides: parseInt(seedSlides),
        style: seedStyle,
      });

      const newJobs: SeedJob[] = result.decks.map((d) => ({
        deckId: d.deck_id,
        topic: d.topic,
        status: 'generating' as const,
        progress: 0,
        slideCount: 0,
        message: 'Queued...',
        name: d.topic.slice(0, 60),
        pushedTo: [],
      }));

      setSeedJobs(prev => [...newJobs, ...prev]);
      newJobs.forEach(j => startPolling(j.deckId));
      toast({ title: 'Batch started', description: `Generating ${result.count} decks in parallel` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Batch failed', description: e.message || 'Unknown error' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePushFeatured = async (job: SeedJob) => {
    try {
      const result = await adminApi.seedPushFeatured({ deck_uuid: job.deckId, title: job.name });
      toast({ title: 'Featured', description: result.message });
      setSeedJobs(prev =>
        prev.map(j =>
          j.deckId === job.deckId
            ? { ...j, pushedTo: [...(j.pushedTo || []), 'featured'], shareUrl: result.share_url || j.shareUrl }
            : j
        )
      );
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e.message });
    }
  };

  const handlePushCommunity = async (job: SeedJob, category: string) => {
    try {
      const result = await adminApi.seedPushCommunity({
        deck_uuid: job.deckId,
        title: job.name,
        category,
        tags: [category],
      });
      toast({ title: 'Published', description: result.message });
      setSeedJobs(prev =>
        prev.map(j =>
          j.deckId === job.deckId
            ? { ...j, pushedTo: [...(j.pushedTo || []), 'community'], shareUrl: result.share_url || j.shareUrl }
            : j
        )
      );
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e.message });
    }
  };

  const handleCreateShare = async (job: SeedJob) => {
    try {
      const result = await adminApi.seedCreateShare(job.deckId);
      setSeedJobs(prev =>
        prev.map(j => (j.deckId === job.deckId ? { ...j, shareUrl: result.share_url } : j))
      );
      navigator.clipboard.writeText(window.location.origin + result.share_url);
      toast({ title: 'Link copied', description: result.share_url });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e.message });
    }
  };

  const handleCleanup = async () => {
    setIsCleaning(true);
    try {
      const result = await adminApi.seedCleanup();
      toast({
        title: 'Cleanup complete',
        description: `Deleted ${result.deleted_count} broken decks (skipped ${result.skipped_count})`,
      });
      fetchDecks(1, true);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Cleanup failed', description: e.message });
    } finally {
      setIsCleaning(false);
    }
  };

  // ── SEO handlers ──
  const loadSeoData = async () => {
    setSeoLoading(true);
    try {
      const [pagesData, featuredData] = await Promise.all([
        adminApi.seoPages(),
        adminApi.seoFeaturedDecks(),
      ]);
      setSeoPages(pagesData.pages);
      setFeaturedDecks(featuredData.decks);
      setCategoryCounts(pagesData.categoryCounts);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load SEO data' });
    } finally {
      setSeoLoading(false);
    }
  };

  const handleToggleSeo = () => {
    const next = !seoExpanded;
    setSeoExpanded(next);
    if (next && seoPages.length === 0) loadSeoData();
  };

  const handleViewCommunity = async (category: string) => {
    if (selectedSeoCategory === category) {
      setSelectedSeoCategory(null);
      return;
    }
    setSelectedSeoCategory(category);
    setHeroPoolCollapsed(true);
    try {
      const data = await adminApi.seoCommunityDecks(category);
      setCommunityDecksForCategory(data.decks);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load community decks' });
    }
  };

  const handleRemoveFeatured = async (uuid: string) => {
    try {
      await adminApi.seoRemoveFeatured(uuid);
      setFeaturedDecks(prev => prev.filter(d => d.uuid !== uuid));
      toast({ title: 'Removed', description: 'Deck removed from featured' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
  };

  const handleRemoveCommunity = async (deckUuid: string) => {
    try {
      await adminApi.seoRemoveCommunity(deckUuid);
      setCommunityDecksForCategory(prev => prev.filter(d => d.deck_uuid !== deckUuid));
      toast({ title: 'Removed', description: 'Deck removed from community' });
      loadSeoData();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
  };

  const handleDragStartFeatured = (uuid: string) => {
    setDraggedFeatured(uuid);
  };

  const handleDragOverFeatured = (e: React.DragEvent, uuid: string) => {
    e.preventDefault();
    if (draggedFeatured && draggedFeatured !== uuid) {
      setDragOverFeatured(uuid);
    }
  };

  const handleDropFeatured = async (targetUuid: string) => {
    if (!draggedFeatured || draggedFeatured === targetUuid) {
      setDraggedFeatured(null);
      setDragOverFeatured(null);
      return;
    }

    const currentOrder = [...featuredDecks];
    const fromIdx = currentOrder.findIndex(d => d.uuid === draggedFeatured);
    const toIdx = currentOrder.findIndex(d => d.uuid === targetUuid);
    if (fromIdx === -1 || toIdx === -1) return;

    const [moved] = currentOrder.splice(fromIdx, 1);
    currentOrder.splice(toIdx, 0, moved);

    // Optimistic update
    const reordered = currentOrder.map((d, i) => ({ ...d, display_order: i }));
    setFeaturedDecks(reordered);
    setDraggedFeatured(null);
    setDragOverFeatured(null);

    try {
      await adminApi.seoReorderFeaturedBatch(reordered.map(d => d.uuid));
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Reorder failed', description: e.message });
      loadSeoData(); // revert
    }
  };

  const handleDragEndFeatured = () => {
    setDraggedFeatured(null);
    setDragOverFeatured(null);
  };

  const handleReseed = async (uuid: string, source: 'featured' | 'community') => {
    setReseedingUuids(prev => new Set(prev).add(uuid));
    try {
      const result = await adminApi.seedReseed(uuid, source, parseInt(seedSlides), seedStyle);
      // Add to seed jobs for polling
      const newJob: SeedJob = {
        deckId: result.new_deck_id,
        topic: result.title,
        status: 'generating',
        progress: 0,
        slideCount: 0,
        message: `Reseeding ${source}...`,
        name: result.title,
        pushedTo: [],
      };
      setSeedJobs(prev => [newJob, ...prev]);
      startPolling(result.new_deck_id);
      toast({ title: 'Reseed started', description: `Regenerating "${result.title}"` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Reseed failed', description: e.message });
    } finally {
      setReseedingUuids(prev => { const s = new Set(prev); s.delete(uuid); return s; });
    }
  };

  const handleReseedAll = async () => {
    setIsReseedingAll(true);
    try {
      const result = await adminApi.seedReseedAll(parseInt(seedSlides), seedStyle);
      // Add all to seed jobs for polling
      const newJobs: SeedJob[] = result.decks.map(d => ({
        deckId: d.new_deck_id,
        topic: d.title,
        status: 'generating' as const,
        progress: 0,
        slideCount: 0,
        message: `Reseeding ${d.source}...`,
        name: d.title,
        pushedTo: [],
      }));
      setSeedJobs(prev => [...newJobs, ...prev]);
      newJobs.forEach(j => startPolling(j.deckId));
      toast({ title: 'Reseed All started', description: result.message });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Reseed All failed', description: e.message });
    } finally {
      setIsReseedingAll(false);
    }
  };

  // ── Gallery handlers ──
  const handleDeleteDeck = async () => {
    if (!selectedDeck) return;
    try {
      await adminApi.deleteDeck(selectedDeck.id);
      toast({ title: 'Deleted', description: 'Deck deleted successfully' });
      setDecks(prev => prev.filter(d => d.id !== selectedDeck.id));
      setTotalDecks(prev => prev - 1);
      setShowDeleteDialog(false);
      setSelectedDeck(null);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete deck' });
    }
  };

  const handleDeckClick = (deck: DeckSummary, index: number) => {
    setPreviewDeckIndex(index);
    setPreviewModalOpen(true);
  };

  // ── Seed Job Card ──
  const SeedJobCard: React.FC<{ job: SeedJob }> = ({ job }) => {
    const isComplete = job.status === 'completed';
    const isFailed = job.status === 'failed';
    const isRunning = job.status === 'generating' || job.status === 'queued';

    return (
      <div className={cn(cardClass, 'p-3 space-y-2.5 relative overflow-hidden')}>
        {/* Progress bar background */}
        {isRunning && (
          <div
            className="absolute inset-x-0 bottom-0 h-1 bg-[#FF4301]/20"
          >
            <div
              className="h-full bg-[#FF4301] transition-all duration-500 ease-out"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium leading-snug line-clamp-2 flex-1">{job.name}</p>
          {isComplete && <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />}
          {isFailed && <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />}
          {isRunning && <Loader2 className="h-4 w-4 text-[#FF4301] animate-spin flex-shrink-0 mt-0.5" />}
        </div>

        {/* Status line */}
        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="text-[10px] text-[#888] font-mono">{job.message}</span>
          )}
          {isComplete && (
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
              {job.slideCount} slides ready
            </span>
          )}
          {isFailed && (
            <span className="text-[10px] text-red-500 font-mono truncate">{job.error || 'Generation failed'}</span>
          )}
        </div>

        {/* Actions for completed jobs */}
        {isComplete && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] px-2 gap-1"
              asChild
            >
              <Link to={`/deck/${job.deckId}`} target="_blank">
                <ExternalLink className="h-3 w-3" />
                Open
              </Link>
            </Button>

            {/* Push to Featured */}
            <Button
              size="sm"
              variant={job.pushedTo?.includes('featured') ? 'secondary' : 'outline'}
              className="h-6 text-[10px] px-2 gap-1"
              disabled={job.pushedTo?.includes('featured')}
              onClick={() => handlePushFeatured(job)}
            >
              <Star className="h-3 w-3" />
              {job.pushedTo?.includes('featured') ? 'Featured' : 'Feature'}
            </Button>

            {/* Push to Community */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant={job.pushedTo?.includes('community') ? 'secondary' : 'outline'}
                  className="h-6 text-[10px] px-2 gap-1"
                  disabled={job.pushedTo?.includes('community')}
                >
                  <Users className="h-3 w-3" />
                  {job.pushedTo?.includes('community') ? 'Published' : 'Community'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[180px]">
                {CATEGORY_OPTIONS.map(cat => (
                  <DropdownMenuItem
                    key={cat.value}
                    onClick={() => handlePushCommunity(job, cat.value)}
                    className="text-xs flex flex-col items-start gap-0"
                  >
                    <span>{cat.label}</span>
                    {'seo' in cat && cat.seo && (
                      <span className="text-[9px] text-[#999] font-mono">{cat.seo}</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Share link */}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] px-1.5"
              onClick={() => handleCreateShare(job)}
            >
              <LinkIcon className="h-3 w-3" />
            </Button>

            {job.shareUrl && (
              <span className="text-[9px] text-[#999] font-mono truncate max-w-[100px]">{job.shareUrl}</span>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── Deck Grid Item (PNG thumbnail from Supabase storage) ──
  const DeckGridItem: React.FC<{ deck: DeckSummary; index: number }> = React.memo(({ deck, index }) => {
    return (
      <div
        className="relative aspect-video rounded-xl overflow-hidden cursor-pointer group ring-1 ring-black/[0.06] dark:ring-white/[0.08] shadow-sm hover:shadow-lg transition-all duration-200"
        onClick={() => handleDeckClick(deck, index)}
      >
        {/* Background fallback */}
        <div className="absolute inset-0 bg-zinc-800" />

        {/* PNG thumbnail */}
        <img
          src={thumbnailUrl(deck.uuid)}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />

        {/* Slide count (top-right) */}
        <div className="absolute top-2 right-2 z-[4]">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-white/80 bg-black/40 backdrop-blur-sm">
            <Layers className="h-2.5 w-2.5" />
            {deck.slideCount}
          </span>
        </div>

        {/* Visibility badge (top-left) */}
        <div className="absolute top-2 left-2 z-[4]">
          <span className={cn(
            "inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold backdrop-blur-sm",
            deck.visibility === 'public' ? 'bg-emerald-500/70 text-white' :
            deck.visibility === 'unlisted' ? 'bg-amber-500/70 text-white' :
            'bg-black/40 text-white/80',
          )}>
            {deck.visibility}
          </span>
        </div>

        {/* Gradient scrim at bottom */}
        <div className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-black/80 via-black/40 to-transparent z-[3] pointer-events-none" />

        {/* Bottom metadata */}
        <div className="absolute inset-x-0 bottom-0 px-3 pb-2 pt-6 z-[4]">
          <h3 className="font-medium text-[13px] text-white truncate leading-tight">{deck.name}</h3>
          <div className="flex items-center justify-between text-[11px] text-white/70 mt-0.5">
            <span className="truncate max-w-[50%]">
              {deck.userFullName || deck.userEmail || (deck.userId?.length >= 8 ? `#${deck.userId.slice(0, 8)}` : 'Unknown')}
            </span>
            <div className="flex items-center gap-2 text-[10px] text-white/50">
              <span className="flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" />{deck.analytics.viewCount}</span>
              <span className="flex items-center gap-0.5"><Edit className="h-2.5 w-2.5" />{deck.analytics.editCount}</span>
              <span className="flex items-center gap-0.5"><Share2 className="h-2.5 w-2.5" />{deck.analytics.shareCount}</span>
            </div>
          </div>
          <div className="text-[10px] text-white/40 mt-0.5">
            {deck.createdAt && !isNaN(new Date(deck.createdAt).getTime()) ? format(new Date(deck.createdAt), 'MMM d') : ''}
          </div>
        </div>
      </div>
    );
  }, (prev, next) => prev.deck.uuid === next.deck.uuid && prev.index === next.index);

  // ── Deck List Item (PNG thumbnail from Supabase storage) ──
  const DeckListItem: React.FC<{ deck: DeckSummary; index: number }> = React.memo(({ deck, index }) => {
    return (
      <div
        className="w-full grid grid-cols-[auto,1fr,auto] items-center gap-3 p-2.5 border border-[#eaeaea] dark:border-[#333] rounded-xl hover:bg-[#fafafa] dark:hover:bg-[#161616] transition-colors cursor-pointer"
        onClick={() => handleDeckClick(deck, index)}
      >
        <div className="w-28 aspect-video rounded overflow-hidden flex-shrink-0 relative ring-1 ring-black/[0.06] dark:ring-white/[0.08] bg-zinc-800">
          <img
            src={thumbnailUrl(deck.uuid)}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium truncate">{deck.name}</h3>
            <Badge variant="outline" className="text-xs flex-shrink-0">{deck.visibility}</Badge>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground truncate">
            <span className="truncate">
              By {deck.userFullName || deck.userEmail || (deck.userId?.length >= 8 ? `User #${deck.userId.slice(0, 8)}` : 'Unknown')}
            </span>
            <span>·</span>
            <span className="flex-shrink-0">{deck.slideCount} slides</span>
            <span>·</span>
            <span className="truncate">
              Modified {deck.lastModified && !isNaN(new Date(deck.lastModified).getTime())
                ? formatDistanceToNow(new Date(deck.lastModified), { addSuffix: true })
                : 'recently'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1" title="Views"><Eye className="h-4 w-4" /><span>{deck.analytics.viewCount}</span></div>
            <div className="flex items-center gap-1" title="Edits"><Edit className="h-4 w-4" /><span>{deck.analytics.editCount}</span></div>
            <div className="flex items-center gap-1" title="Shares"><Share2 className="h-4 w-4" /><span>{deck.analytics.shareCount}</span></div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild onClick={(e) => e.stopPropagation()}>
              <Link to={`/deck/${deck.uuid}`}><ExternalLink className="h-4 w-4" /></Link>
            </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}><MoreVertical className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem asChild>
                <Link to={`/deck/${deck.uuid}`}><ExternalLink className="mr-2 h-4 w-4" />Open in Editor</Link>
              </DropdownMenuItem>
              <DropdownMenuItem><Download className="mr-2 h-4 w-4" />Export</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => { setSelectedDeck(deck); setShowDeleteDialog(true); }}>
                <Trash2 className="mr-2 h-4 w-4" />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
    );
  }, (prev, next) => prev.deck.uuid === next.deck.uuid && prev.index === next.index);

  return (
    <AdminLayoutV2>
      <div className="w-full space-y-4">
        {/* ── Page header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold uppercase tracking-wider" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
              Decks
            </h1>
            <span className="text-[11px] font-mono text-[#666] dark:text-[#888]">{totalDecks}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px] gap-1 text-red-500 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950"
              disabled={isCleaning}
              onClick={handleCleanup}
            >
              {isCleaning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Cleanup Empty
            </Button>
            <div className="flex rounded-lg border border-[#eaeaea] dark:border-[#333] overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={cn("p-1.5 transition-colors", viewMode === 'grid' ? "bg-[#FF4301] text-white" : "text-[#888] hover:bg-[#f5f5f5] dark:hover:bg-[#222]")}
              >
                <Grid3X3 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn("p-1.5 transition-colors", viewMode === 'list' ? "bg-[#FF4301] text-white" : "text-[#888] hover:bg-[#f5f5f5] dark:hover:bg-[#222]")}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* ── SEEDER SECTION ── */}
        <section className={cn(cardClass, 'p-4 space-y-3 overflow-visible')}>
          <div className="flex items-center gap-2">
            <Wand2 className="h-3.5 w-3.5 text-[#FF4301]" />
            <h2 className={sectionHeading} style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Deck Seeder</h2>
          </div>

          {/* Input row */}
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <textarea
                placeholder="Describe the presentation you want to generate..."
                value={seedPrompt}
                onChange={(e) => setSeedPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate();
                }}
                rows={2}
                className="w-full rounded-lg border border-[#eaeaea] dark:border-[#333] bg-white dark:bg-[#0a0a0a] px-3 py-2 text-sm resize-none placeholder:text-[#bbb] focus:outline-none focus:ring-1 focus:ring-[#FF4301]/40 focus:border-[#FF4301]/40"
              />
              <div className="flex items-center gap-1">
                <button
                  onClick={handleRandomPrompt}
                  className="text-[10px] text-[#999] hover:text-[#FF4301] transition-colors flex items-center gap-0.5"
                >
                  <Sparkles className="h-2.5 w-2.5" />
                  Random prompt
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex gap-1.5">
                <Select value={seedStyle} onValueChange={setSeedStyle}>
                  <SelectTrigger className="w-[100px] h-8 text-[10px] border-[#eaeaea] dark:border-[#333]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STYLE_OPTIONS.map(s => (
                      <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={seedSlides} onValueChange={setSeedSlides}>
                  <SelectTrigger className="w-[90px] h-8 text-[10px] border-[#eaeaea] dark:border-[#333]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[6, 7, 8, 10, 12].map(n => (
                      <SelectItem key={n} value={String(n)} className="text-xs">{n} slides</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !seedPrompt.trim()}
                className="h-8 text-xs gap-1.5 bg-[#FF4301] hover:bg-[#e63c00] text-white"
              >
                {isGenerating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Zap className="h-3.5 w-3.5" />
                )}
                Generate
              </Button>
            </div>
          </div>

          {/* Batch generation row */}
          <div className="flex items-center gap-2 pt-1 border-t border-[#eaeaea] dark:border-[#333]">
            <span className="text-[10px] text-[#888] uppercase tracking-wider font-medium">Batch</span>
            <Select value={batchCount} onValueChange={setBatchCount}>
              <SelectTrigger className="w-[65px] h-7 text-[10px] border-[#eaeaea] dark:border-[#333]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 5, 8, 10, 15, 20].map(n => (
                  <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[10px] text-[#888]">random decks</span>
            <Button
              onClick={handleBatchGenerate}
              disabled={isGenerating}
              variant="outline"
              className="h-7 text-[10px] gap-1.5 border-[#FF4301]/30 text-[#FF4301] hover:bg-[#FF4301]/5"
            >
              {isGenerating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Zap className="h-3 w-3" />
              )}
              Generate Batch
            </Button>
            <span className="text-[9px] text-[#bbb] ml-auto">All routed through Modal with fallback</span>
          </div>

          {/* Active seed jobs */}
          {seedJobs.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <h3 className="text-[10px] font-medium uppercase tracking-wider text-[#999]">Seed Jobs</h3>
                <span className="text-[10px] font-mono text-[#999]">{seedJobs.length}</span>
              </div>
              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {seedJobs.map(job => (
                  <SeedJobCard key={job.deckId} job={job} />
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── SEO LANDING PAGES SECTION ── */}
        <section className={cn(cardClass, 'overflow-visible')}>
          <button
            onClick={handleToggleSeo}
            className="w-full flex items-center justify-between p-4 hover:bg-[#fafafa] dark:hover:bg-[#161616] transition-colors rounded-xl"
          >
            <div className="flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 text-[#FF4301]" />
              <h2 className={sectionHeading} style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>SEO Landing Pages</h2>
              {featuredDecks.length > 0 && (
                <span className="text-[10px] font-mono text-[#999]">{featuredDecks.length} featured · {Object.values(categoryCounts).reduce((a, b) => a + b, 0)} community</span>
              )}
            </div>
            {seoExpanded ? <ChevronUp className="h-4 w-4 text-[#999]" /> : <ChevronDown className="h-4 w-4 text-[#999]" />}
          </button>

          {seoExpanded && (
            <div className="px-4 pb-4 space-y-5">
              {seoLoading ? (
                <div className="flex items-center gap-2 py-4 justify-center text-[#999]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs">Loading SEO data...</span>
                </div>
              ) : (
                <>
                  {/* Landing Pages Grid */}
                  <div>
                    <h3 className="text-[10px] font-medium uppercase tracking-wider text-[#999] mb-2">Pages</h3>
                    <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
                      {seoPages.map(page => (
                        <button
                          key={page.slug}
                          onClick={() => handleViewCommunity(page.communityCategory)}
                          className={cn(
                            'text-left p-2.5 rounded-lg border transition-all',
                            selectedSeoCategory === page.communityCategory
                              ? 'border-[#FF4301]/40 bg-[#FF4301]/5'
                              : 'border-[#eaeaea] dark:border-[#333] hover:border-[#FF4301]/20',
                          )}
                        >
                          <p className="text-[11px] font-medium truncate">{page.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] font-mono text-[#999]">/{page.slug}</span>
                            <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 border-[#ddd] dark:border-[#444]">
                              {page.communityCategory}
                            </Badge>
                          </div>
                          <span className="text-[10px] text-[#888] mt-1 block">{page.communityDeckCount} community decks</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── Featured Decks (Hero Pool) — collapsible, draggable cards ── */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <button
                        onClick={() => setHeroPoolCollapsed(!heroPoolCollapsed)}
                        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                      >
                        <Star className="h-3 w-3 text-[#FF4301]" />
                        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#FF4301]">Hero Pool</h3>
                        <span className="text-[10px] font-mono text-[#999]">{featuredDecks.length} decks</span>
                        {heroPoolCollapsed ? <ChevronDown className="h-3 w-3 text-[#999]" /> : <ChevronUp className="h-3 w-3 text-[#999]" />}
                      </button>
                      {featuredDecks.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[9px] px-2 gap-1 border-[#FF4301]/30 text-[#FF4301] hover:bg-[#FF4301]/5"
                          disabled={isReseedingAll}
                          onClick={handleReseedAll}
                        >
                          {isReseedingAll ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5" />}
                          Reseed All
                        </Button>
                      )}
                    </div>
                    {!heroPoolCollapsed && (
                      <>
                        {featuredDecks.length === 0 ? (
                          <div className="py-6 text-center border border-dashed border-[#ddd] dark:border-[#444] rounded-xl mt-1.5">
                            <Presentation className="h-6 w-6 mx-auto mb-1.5 text-[#ccc]" />
                            <p className="text-xs text-[#999]">No featured decks yet</p>
                            <p className="text-[10px] text-[#bbb] mt-0.5">Generate decks above and push to featured</p>
                          </div>
                        ) : (
                          <>
                            <p className="text-[10px] text-[#999] mb-2 mt-1">
                              Drag to reorder. Each slot maps to a prompt in the InteractiveHero carousel.
                            </p>
                            <div className="space-y-1.5">
                              {featuredDecks.map((d, idx) => {
                                const prompt = HERO_PROMPTS[d.display_order] || HERO_PROMPTS[idx];
                                const isReseeding = reseedingUuids.has(d.uuid);

                                return (
                                  <div
                                    key={d.uuid}
                                    draggable
                                    onDragStart={() => handleDragStartFeatured(d.uuid)}
                                    onDragOver={(e) => handleDragOverFeatured(e, d.uuid)}
                                    onDrop={() => handleDropFeatured(d.uuid)}
                                    onDragEnd={handleDragEndFeatured}
                                    className={cn(
                                      'flex items-center gap-3 p-2 rounded-xl border transition-all cursor-grab active:cursor-grabbing',
                                      draggedFeatured === d.uuid
                                        ? 'opacity-40 border-[#FF4301]/40'
                                        : dragOverFeatured === d.uuid
                                          ? 'border-[#FF4301] bg-[#FF4301]/5 shadow-sm'
                                          : 'border-[#eaeaea] dark:border-[#333] hover:border-[#ccc] dark:hover:border-[#555]',
                                    )}
                                  >
                                    {/* Drag handle + position */}
                                    <div className="flex flex-col items-center gap-0.5 flex-shrink-0 w-6">
                                      <GripVertical className="h-3.5 w-3.5 text-[#bbb]" />
                                      <span className="text-[9px] font-mono font-bold text-[#FF4301]">{d.display_order}</span>
                                    </div>

                                    {/* Slide thumbnail (PNG) */}
                                    <div className="w-20 aspect-video rounded-lg overflow-hidden flex-shrink-0 ring-1 ring-black/[0.06] dark:ring-white/[0.08] bg-zinc-800 relative">
                                      <img
                                        src={thumbnailUrl(d.uuid)}
                                        alt=""
                                        className="absolute inset-0 w-full h-full object-cover"
                                        draggable={false}
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                      />
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[11px] font-semibold truncate leading-tight">{d.name}</p>
                                      {prompt && (
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                          <span className="inline-flex items-center px-1.5 py-0 rounded text-[8px] font-bold uppercase tracking-wide bg-[#FF4301]/10 text-[#FF4301]">
                                            {prompt.badge}
                                          </span>
                                          <p className="text-[10px] text-[#888] truncate italic">"{prompt.text}"</p>
                                        </div>
                                      )}
                                      {d.slide_count > 0 && (
                                        <span className="text-[9px] text-[#aaa] mt-0.5 block">{d.slide_count} slides</span>
                                      )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 text-[#999] hover:text-[#FF4301]"
                                        disabled={isReseeding}
                                        onClick={() => handleReseed(d.uuid, 'featured')}
                                        title="Reseed this deck"
                                      >
                                        {isReseeding ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 text-[#999] hover:text-foreground"
                                        asChild
                                      >
                                        <Link to={`/deck/${d.uuid}`} target="_blank" onClick={(e) => e.stopPropagation()}>
                                          <ExternalLink className="h-3 w-3" />
                                        </Link>
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 text-[#999] hover:text-red-500"
                                        onClick={() => handleRemoveFeatured(d.uuid)}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>

                  {/* ── Community Decks for Selected Category ────────────────── */}
                  {selectedSeoCategory && (
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Users className="h-3 w-3 text-[#FF4301]" />
                        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#FF4301]">
                          Community: {selectedSeoCategory}
                        </h3>
                        <span className="text-[10px] font-mono text-[#999]">{communityDecksForCategory.length}</span>
                      </div>
                      {communityDecksForCategory.length === 0 ? (
                        <div className="py-6 text-center border border-dashed border-[#ddd] dark:border-[#444] rounded-xl">
                          <Users className="h-6 w-6 mx-auto mb-1.5 text-[#ccc]" />
                          <p className="text-xs text-[#999]">No community decks in this category</p>
                          <p className="text-[10px] text-[#bbb] mt-0.5">Generate decks and push to community</p>
                        </div>
                      ) : (
                        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                          {communityDecksForCategory.map(d => (
                              <div key={d.id} className="flex items-center gap-2.5 p-2 rounded-xl border border-[#eaeaea] dark:border-[#333] hover:border-[#ccc] dark:hover:border-[#555] transition-colors">
                                {/* Thumbnail (PNG) */}
                                <div className="w-20 aspect-video rounded-lg overflow-hidden flex-shrink-0 ring-1 ring-black/[0.06] dark:ring-white/[0.08] bg-zinc-800 relative">
                                  <img
                                    src={thumbnailUrl(d.deck_uuid)}
                                    alt=""
                                    className="absolute inset-0 w-full h-full object-cover"
                                    draggable={false}
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                </div>

                                {/* Info */}
                                <div className="min-w-0 flex-1">
                                  <p className="text-[11px] font-semibold truncate leading-tight">{d.title}</p>
                                  <div className="flex items-center gap-2 text-[10px] text-[#999] mt-0.5">
                                    <span className="flex items-center gap-0.5"><Layers className="h-2.5 w-2.5" />{d.slide_count}</span>
                                    <span className="flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" />{d.view_count}</span>
                                    {d.author_name && <span className="truncate max-w-[80px]">{d.author_name}</span>}
                                  </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-[#999] hover:text-[#FF4301]"
                                    disabled={reseedingUuids.has(d.deck_uuid)}
                                    onClick={() => handleReseed(d.deck_uuid, 'community')}
                                    title="Reseed this deck"
                                  >
                                    {reseedingUuids.has(d.deck_uuid) ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-[#999] hover:text-foreground"
                                    asChild
                                  >
                                    <Link to={`/deck/${d.deck_uuid}`} target="_blank">
                                      <ExternalLink className="h-3 w-3" />
                                    </Link>
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-[#999] hover:text-red-500"
                                    onClick={() => handleRemoveCommunity(d.deck_uuid)}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>

        {/* ── Filters ── */}
        <section>
          <h2 className={sectionHeading} style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Gallery</h2>
          <div className="flex gap-2 mt-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#999]" />
              <Input
                placeholder="Search by deck name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm bg-white dark:bg-[#111] border-[#eaeaea] dark:border-[#333]"
              />
            </div>
            <Select value={visibilityFilter} onValueChange={setVisibilityFilter}>
              <SelectTrigger className="w-[120px] h-9 text-[11px] border-[#eaeaea] dark:border-[#333]">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="unlisted">Unlisted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        {/* ── Gallery ── */}
        <section>
          <div className="mt-1.5">
            {isLoading ? (
              viewMode === 'grid' ? (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {[...Array(24)].map((_, i) => (
                    <Skeleton key={i} className="aspect-video w-full rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2 w-full">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="grid grid-cols-[auto,1fr,auto] items-center gap-4 p-3 border rounded-lg w-full">
                      <Skeleton className="w-28 h-[63px] rounded" />
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-4 w-full" />
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="hidden md:flex items-center gap-4">
                          <Skeleton className="h-5 w-8" />
                          <Skeleton className="h-5 w-8" />
                          <Skeleton className="h-5 w-8" />
                        </div>
                        <Skeleton className="h-8 w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : decks.length === 0 ? (
              <div className="py-16 text-center">
                <FileStack className="h-10 w-10 mx-auto mb-3 text-[#ccc] dark:text-[#555]" />
                <h3 className="text-sm font-medium mb-1">No decks found</h3>
                <p className="text-xs text-[#888]">
                  {searchQuery || visibilityFilter !== 'all'
                    ? 'Try adjusting your filters'
                    : 'No decks have been created yet'}
                </p>
              </div>
            ) : (
              <div>
                {viewMode === 'grid' ? (
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {decks.map((deck, index) => (
                      <DeckGridItem key={deck.id} deck={deck} index={index} />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2 w-full">
                    {decks.map((deck, index) => (
                      <DeckListItem key={deck.id} deck={deck} index={index} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="w-full py-4 flex justify-center">
            {isLoadingMore && <Loader2 className="h-5 w-5 animate-spin text-[#999]" />}
          </div>
          {!hasMore && decks.length > 0 && (
            <p className="text-center text-[11px] text-[#999] pb-2">Showing all {totalDecks} decks</p>
          )}
        </section>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the deck
                "{selectedDeck?.name}" and all its {selectedDeck?.slideCount} slides.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={handleDeleteDeck}>
                Delete Deck
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Deck Preview Modal */}
        <DeckPreviewModal
          isOpen={previewModalOpen}
          onClose={() => setPreviewModalOpen(false)}
          decks={decks}
          currentIndex={previewDeckIndex}
          onNavigate={setPreviewDeckIndex}
        />
      </div>
    </AdminLayoutV2>
  );
};

export default AdminDecks;
