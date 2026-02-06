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

// Prompt text mapped to each hero display_order — aligned with InteractiveHero PROMPTS
const HERO_PROMPTS: Record<number, { badge: string; text: string }> = {
  0: { badge: 'Physics', text: 'Inside a black hole — what actually happens past the event horizon' },
  1: { badge: 'Psych', text: 'Your brain on doom scrolling — the neuroscience of infinite feeds' },
  2: { badge: 'Startup', text: 'From garage to $40 billion — the Stripe story nobody tells' },
  3: { badge: 'Pitch', text: 'Nexus AI — the Series B pitch deck that raised $50M' },
  4: { badge: 'Tech', text: "How Spotify's algorithm knows what you want to hear before you do" },
  5: { badge: 'Design', text: 'The 7 invisible design tricks Apple uses to make you spend more' },
  6: { badge: 'Culture', text: 'What your city looks like at 3 AM — the hidden night shift economy' },
  7: { badge: 'History', text: 'Mount Tambora 1816 — the eruption that deleted summer' },
  8: { badge: 'Nature', text: '3,000 feet underwater — life that evolved in permanent darkness' },
  9: { badge: 'Neuro', text: 'The 100-millisecond judgement — how your brain reads a face' },
  10: { badge: 'Science', text: "Why your phone needs Einstein's relativity to find coffee" },
  11: { badge: 'Art', text: 'The hidden geometry in every masterpiece from Da Vinci to Beyoncé' },
};

const RANDOM_PROMPTS = [
  // ── The Universe & Space ──
  'The scale of the universe — from quarks to the observable cosmos. Start with subatomic particles, zoom out through cells, humans, Earth, the solar system, galaxies, and galaxy clusters. Each slide should represent a different order of magnitude. Use a deep black background with rich astronomical photography. The design should feel like peering through the Hubble telescope — awe-inspiring, cinematic, with minimal text and massive full-bleed imagery. Let the emptiness of space itself be a design element.',

  'What would happen if the Moon disappeared tomorrow. Walk through the chain reaction — tides collapse, Earth\'s axial tilt destabilizes, days shorten, seasons go haywire, and life on Earth slowly transforms. Each slide presents one consequence with a dramatic visual. Design style: dark cinematic sci-fi, deep navy and silver, planetary-scale imagery, single bold statements per slide. Think NASA meets IMAX documentary.',

  // ── Human Body & Mind ──
  'Inside your brain right now — what\'s firing while you read this. Cover the visual cortex processing these words, the prefrontal cortex making sense of them, memory encoding, attention filtering, and the 86 billion neurons coordinating it all. Use a clean, modern medical-illustration style with soft dark backgrounds and glowing neural-pathway accents in warm amber and electric blue. Each slide zooms into a different brain region with one fascinating fact.',

  'The 24 hours inside your body — a timeline of what your organs do while you live your day. Start at 6am with cortisol waking you up, follow digestion, immune cell patrols, liver detox cycles, melatonin release, and overnight tissue repair. Warm, editorial design like a premium health magazine — cream and white with anatomical illustration accents in muted coral and teal. One body system per slide, beautifully simple.',

  // ── History & Civilization ──
  'The Silk Road — how spices, religions, diseases, and ideas traveled 4,000 miles and shaped every civilization they touched. Cover the trade routes, key cities like Samarkand and Constantinople, what was traded (silk, gunpowder, plague), and how it connected China to Rome. Rich textured design — aged parchment tones, deep saffron and indigo, hand-drawn map route illustrations, ornate calligraphic headings. Each slide should feel like opening an ancient merchant\'s journal.',

  'Cold War espionage — the real spy stories behind the Iron Curtain. Cover the Cambridge Five, CIA tunnel under Berlin, U-2 incident, Oleg Penkovsky, and how espionage actually shaped nuclear policy. Noir thriller aesthetic — stark black and white photography with single red accent elements. Dossier-style layouts, typewriter fonts, redacted-text effects, classified-stamp overlays. Every slide should feel like a declassified document.',

  'Ancient Egypt in 10 slides — not just pyramids, but what daily life actually looked like. Cover the Nile flood cycle that made civilization possible, how workers (not slaves) built the pyramids, Egyptian medicine and dentistry, beer as currency, and the incredible bureaucracy that kept it running. Warm sandstone and gold palette with hieroglyphic accent patterns, clean modern typography over archaeological photography.',

  // ── Science & Nature ──
  'The ocean\'s midnight zone — life that exists in permanent darkness 3,000 feet below the surface. Cover bioluminescent creatures, the anglerfish\'s hunting strategy, giant squid, hydrothermal vent ecosystems that don\'t need sunlight, and pressure that would crush a submarine. Deep ocean palette — black backgrounds with electric cyan, magenta, and green bioluminescent glows. Ethereal and alien, like discovering another planet. Dramatic creature photography with almost no text.',

  'How a single volcanic eruption changed the course of human history — Mount Tambora, 1816, and the Year Without a Summer. Cover the eruption itself, the ash cloud circling the globe, crop failures across Europe and Asia, the famine and migration it triggered, and how Mary Shelley wrote Frankenstein because she was stuck indoors. Cinematic documentary style — smoky greys and volcanic orange, dramatic landscape photography, timeline-driven narrative. Dark and atmospheric.',

  'What actually happens during a lightning strike — from the initial charge separation in a cloud to the return stroke hitting ground in 0.0002 seconds. Break down stepped leaders, channel formation, the 30,000°C plasma, thunder as a shockwave, and ball lightning mysteries. Electric, high-energy design — deep storm-cloud darks with brilliant white and electric violet accents. Each slide captures one microsecond of the process.',

  // ── Technology & The Future ──
  'How GPS actually works — the insane engineering of knowing where you are within 3 feet. Cover the constellation of 31 satellites, atomic clocks accurate to nanoseconds, Einstein\'s relativity corrections (yes, GPS needs relativity), trilateration math, and how your phone does all this in milliseconds. Clean technical blueprint style — dark navy background with precise white and amber technical drawings, satellite orbit diagrams, signal-path illustrations. Engineering elegance.',

  'The invisible infrastructure of the internet — what physically happens when you load a webpage. Trace the journey from your keypress through WiFi radio waves, fiber optic cables under the ocean, DNS resolution, CDN edge servers, TCP handshakes, and pixels rendering on your screen. Minimal tech-documentation style — matte white with precise technical diagrams in cool grey and signal-blue. Each slide is one hop in the journey, clean and mesmerizing.',

  'Artificial intelligence explained through the lens of how a child learns vs how a machine learns. Compare pattern recognition, trial and error, language acquisition, abstraction, and creativity between human development and neural network training. Side-by-side visual comparisons on each slide. Warm and approachable design — soft white backgrounds with playful geometric illustrations in sunset orange, sky blue, and charcoal.',

  // ── Psychology & Human Behavior ──
  'The psychology of first impressions — what your brain decides about someone in 100 milliseconds. Cover the amygdala\'s snap judgments, facial symmetry detection, voice pitch processing, the halo effect, confirmation bias that locks it in, and how to hack first impressions. Magazine-editorial style — black and white portrait photography with a single warm accent color (amber). Clean Helvetica-style type, lots of white space, one psychological principle per slide.',

  'Why you can\'t stop scrolling — the neuroscience of addictive design. Cover variable reward schedules, dopamine prediction errors, infinite scroll mechanics, notification red dots, social validation loops, and the slot-machine psychology behind pull-to-refresh. Bold, attention-grabbing design that ironically mimics what it\'s critiquing — vibrant app-UI colors (notification red, like-heart pink, story-ring gradient) on dark backgrounds. Data callouts with shocking screen-time statistics.',

  'How cults recruit smart people — the step-by-step psychological playbook. Cover love bombing, us-vs-them framing, incremental commitment, sleep deprivation, thought-terminating cliches, and why intelligence doesn\'t protect you. Stark, unsettling editorial design — high contrast black and white, tight cropped photography, bold red pull-quotes. Each slide reveals one manipulation technique with clinical precision.',

  // ── Business & Strategy ──
  'Pitch deck for VCs who\'ve already seen 500 this month — a consumer fintech app that turns spare change into micro-investments. Open with the $3.7T problem (uninvested savings), show the product in action, unit economics, growth curve, competitive moat, and the team. Premium startup aesthetic — clean white with confident black typography and a single electric-green accent. Big numbers, product mockups, zero fluff. Every slide earns the next.',

  'How IKEA quietly became one of the most brilliant companies ever built. Cover the flat-pack revolution, the IKEA effect (why you value what you build), store layout psychology, the $1 hot dog strategy, democratic design philosophy, and global supply chain mastery. Scandinavian minimal — warm birch-wood textures, clean white, and Swedish blue-yellow accents. Simple, functional design that mirrors the brand itself.',

  'The business model behind free-to-play games — how Fortnite makes $5B giving away its product. Cover the psychology of cosmetic purchases, battle pass mechanics, FOMO-driven limited drops, social spending pressure, whale economics, and why the model works without being pay-to-win. Gaming-native design — dark mode with vibrant neon gradients (purple, cyan, hot pink), card-based layouts, stat callouts styled like in-game UI elements.',

  // ── Art, Design & Architecture ──
  'Wabi-sabi — the Japanese philosophy of finding beauty in imperfection. Cover the origins in Zen Buddhism, how it applies to ceramics (kintsugi), architecture (tea houses), daily life, and why the Western obsession with perfection misses something. Deeply minimal Japanese aesthetic — abundant negative space, warm stone grey and moss green, asymmetrical compositions, natural textures. Each slide should itself embody wabi-sabi — imperfect, incomplete, beautiful.',

  'How color literally changes what you taste — the science of crossmodal perception. Cover red plates making food taste sweeter, blue lighting suppressing appetite, wine experts fooled by food coloring, airline meal design, and restaurant color psychology. Each slide uses the color it\'s discussing as its dominant full-bleed background. Bold, immersive, sensory — white text floating on vivid color fields. Let the viewer feel the science.',

  'The architecture of solitude — the world\'s most beautiful buildings designed for one person. Cover Japanese tea houses, Scandinavian writing cabins, desert meditation cells, Le Corbusier\'s Cabanon, lighthouse keeper quarters, and modern micro-homes. Contemplative, architectural photography style — muted earth tones, generous whitespace, clean serif typography. One building per slide, full-bleed imagery with minimal overlay text.',

  // ── Money & Economics ──
  'How the diamond industry manufactured desire — the greatest marketing con of the 20th century. Cover De Beers\' supply manipulation, the invention of the engagement ring tradition, the "diamonds are forever" campaign, artificial scarcity, and how lab-grown diamonds are disrupting the racket. Luxurious but subversive design — elegant serif type and sparkling imagery that slowly reveals the manipulation. Black and crystalline white with ironic gold accents.',

  'What would happen to the economy if nobody worked on Fridays. Walk through the productivity research (shorter weeks = same output), GDP implications, industry-by-industry breakdown, healthcare savings, environmental impact, and which countries are already trying it. Clean, optimistic editorial design — bright white with warm coral and sage green accents. Infographic-driven, data-rich slides with a hopeful, forward-looking tone.',

  // ── Food & Culture ──
  'Street food atlas — the world\'s best food you can only get from a cart. Cover Bangkok\'s pad thai alleys, Mexico City\'s taco stands, Istanbul\'s simit vendors, Mumbai\'s vada pav stalls, Osaka\'s takoyaki corners, and Marrakech\'s Jemaa el-Fnaa night market. Vibrant, warm, photography-forward — rich saturated colors, tight food close-ups, hand-painted sign textures. Each slide is a different city with its signature street dish. Makes you hungry just looking at it.',

  'The science of sourdough — what\'s actually happening in that jar on your counter. Cover wild yeast capture, lactobacillus fermentation, gluten network formation, the Maillard reaction in the crust, and why San Francisco sourdough tastes different from everywhere else. Warm artisanal aesthetic — kraft paper tones, close-up bread photography with visible crumb structure, hand-drawn fermentation diagrams. Rustic but precise, cozy but scientific.',

  // ── Society & Big Questions ──
  'The attention economy — you are the product, and your focus is being strip-mined. Cover how the average person sees 10,000 ads daily, attention as a finite resource, the race to the brainstem, notification design, and what we lose when deep focus disappears. Stark, confrontational design — mostly black with harsh white text and a single red accent. Each slide hits with one uncomfortable statistic or insight. Sparse, punchy, impossible to ignore.',

  'What different cultures believe happens when you die — a respectful visual comparison. Cover ancient Egyptian afterlife judgment, Hindu reincarnation cycles, Buddhist bardo states, Christian heaven/hell, Norse Valhalla, and secular perspectives on consciousness ending. Contemplative and reverent — deep indigo and midnight blue gradients with soft celestial gold accents. Symmetrical compositions, sparse poetic text, glowing orb and light motifs. Beautiful and thoughtful.',

  'How propaganda works — visual manipulation techniques used by every government in history. Cover color psychology in political posters, framing and cropping bias, repetition effects, us-vs-them imagery, and how social media is the new propaganda machine. Documentary-expose style — high contrast, desaturated photography with overlaid analytical annotations in red. Educational, not partisan — examining the mechanics, not pushing a side.',

  // ── Planet Earth ──
  'The water cycle is way wilder than your 5th grade teacher told you. Cover atmospheric rivers carrying more water than the Amazon, underground aquifers older than the ice ages, how trees create rain (transpiration), the global ocean conveyor belt, and how a single water molecule might be 4.5 billion years old. Fluid, dynamic design — deep ocean blues flowing into cloud whites into rain greys. Organic flowing shapes, watercolor-wash backgrounds, clean infographic overlays.',

  'The secret life of soil — there are more organisms in a teaspoon of dirt than people on Earth. Cover mycorrhizal fungal networks, nematode predators, nitrogen-fixing bacteria, decomposition chemistry, and how soil is literally alive. Rich earthy design — deep brown and forest green palette with microscopic photography accents. Cross-section diagrams showing underground worlds. Textured, organic, like holding actual earth.',

  // ── Music & Sound ──
  'The physics of why some music gives you chills — frisson, dissonance resolution, and your brainstem. Cover the unexpected chord change effect, Adele\'s "Someone Like You" analyzed bar by bar, how minor keys trigger sadness across cultures, ASMR\'s neural pathway, and the evolutionary purpose of musical emotion. Dark, moody concert-hall aesthetic — near-black backgrounds with warm spotlight amber and soft sound-wave visualizations. Intimate, like being alone in a concert hall.',

  'How Auto-Tune went from vocal correction tool to defining the sound of an entire generation. Cover Cher\'s "Believe" as the accidental breakthrough, T-Pain\'s artistic reinvention, the backlash and authenticity debate, how literally every modern pop vocal is tuned, and the vocoder lineage going back to WWII speech encryption. Retro-meets-digital design — CRT scan-line textures, audio-waveform visuals, neon synth colors (hot pink, electric blue) on black. Music-production-software-inspired layouts.',

  // ── Unexpected & Fascinating ──
  'The most expensive things humans have ever built — adjusted for inflation. Cover the International Space Station, the US Interstate Highway System, GPS satellite constellation, the Manhattan Project, the Great Wall of China, and the Apollo program. Each slide: one megaproject, one staggering number, one full-bleed hero image. Clean infographic style — dark charcoal background with bold white numbers and warm amber accent. Scale-comparison graphics that make the costs visceral.',

  'How your supermarket is designed to make you spend more — every aisle is a psychological trap. Cover decompression zones at the entrance, bakery smells pumped through vents, end-cap premium placement, eye-level product pricing, cart size inflation, and checkout impulse corridors. Retail-bright design that mimics the supermarket itself — clean white with product-photography-style lighting, aisle-number wayfinding accents in bold red and yellow. Revealing the machine you walk through every week.',

  'The mathematics of dating — how game theory, the secretary problem, and probability explain your love life. Cover optimal stopping theory (date exactly 37% then commit), the stable matching algorithm, Dunbar\'s number limiting your dating pool, and the paradox of choice on dating apps. Playful but smart design — soft blush pink and charcoal with elegant data visualizations. Mathematical notation as design elements, probability curves as visual motifs. Romantic and nerdy simultaneously.',

  'Why the Concorde failed and why supersonic flight is coming back. Cover the engineering marvel of Mach 2 travel, the sonic boom problem, the economics that killed it, and the new startups (Boom Supersonic) solving what the Concorde couldn\'t. Aviation-engineering aesthetic — blueprint navy with precise white technical cross-sections of aircraft. Vintage Concorde photography transitioning to sleek renders of new designs. Speed lines, trajectory arcs, engineering beauty.',

  'The world\'s deadliest animals ranked — and why the mosquito dwarfs everything else combined. Cover annual death counts: mosquitoes (700K+), humans (400K+), snakes (50K), dogs (25K), then compare to sharks (10), and why our fear is inversely proportional to actual danger. Each slide: one animal, one death count, one dramatic wildlife photograph. Dark, National Geographic documentary style — rich blacks with warm golden-hour wildlife photography tones. The contrast between beauty and danger.',

  // ── Philosophy & Ideas ──
  'Thought experiments that broke philosophy — the trolley problem, the Chinese room, Theseus\'s ship, the experience machine, and the veil of ignorance. Each slide presents one thought experiment with a vivid scenario illustration, the core dilemma, and why it still has no good answer. Clean, intellectual design — warm off-white with deep charcoal text and a single thoughtful accent color (muted teal). Illustration-driven, each scenario visually staged like a theater set.',

  'The overview effect — what astronauts experience when they see Earth from space, and why it changes them forever. Cover the cognitive shift, astronaut quotes about borders disappearing, the thin blue line of atmosphere, Carl Sagan\'s pale blue dot, and the philosophical implications for how we treat our planet. Cinematic space photography — Earth against the void of space, thin atmosphere glow, orbital sunrise. Deep blacks with the blue-white jewel of Earth as the only color. Profound, quiet, perspective-shifting.',
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
  const [seederExpanded, setSeederExpanded] = useState(false);
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

  // Fetch existing seed jobs on mount — only restore actively generating ones
  useEffect(() => {
    adminApi.seedJobs().then(({ jobs }) => {
      if (!jobs?.length) return;
      // Only restore jobs that are still generating/queued — skip completed/failed
      const activeJobs = jobs.filter(j => j.status === 'generating' || j.status === 'queued');
      if (!activeJobs.length) return;
      const restored: SeedJob[] = activeJobs.map(j => ({
        deckId: j.deck_id,
        topic: j.name,
        status: j.status as 'queued' | 'generating',
        progress: j.progress || 0,
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
      // Resume polling for the active jobs
      restored.forEach(j => {
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
        <section className={cn(cardClass, 'overflow-visible')}>
          <button
            onClick={() => setSeederExpanded(prev => !prev)}
            className="w-full flex items-center justify-between p-4 hover:bg-[#fafafa] dark:hover:bg-[#161616] transition-colors rounded-xl"
          >
            <div className="flex items-center gap-2">
              <Wand2 className="h-3.5 w-3.5 text-[#FF4301]" />
              <h2 className={sectionHeading} style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Deck Seeder</h2>
              {seedJobs.length > 0 && (
                <span className="text-[10px] font-mono text-[#999]">{seedJobs.filter(j => j.status === 'generating' || j.status === 'queued').length} active</span>
              )}
            </div>
            {seederExpanded ? <ChevronUp className="h-4 w-4 text-[#999]" /> : <ChevronDown className="h-4 w-4 text-[#999]" />}
          </button>

          {seederExpanded && (
            <div className="p-4 pt-0 space-y-3">
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
                    <button
                      onClick={() => {
                        Object.values(pollIntervalsRef.current).forEach(clearInterval);
                        pollIntervalsRef.current = {};
                        setSeedJobs([]);
                      }}
                      className="text-[10px] text-[#bbb] hover:text-[#FF4301] transition-colors ml-auto"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {seedJobs.map(job => (
                      <SeedJobCard key={job.deckId} job={job} />
                    ))}
                  </div>
                </div>
              )}
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
