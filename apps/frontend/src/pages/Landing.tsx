import React, { useEffect, useState, useRef, useCallback, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import '@/styles/landing.css'; // Static CSS — Vite-managed, immune to React re-renders
import { Button } from '@/components/ui/button';
import BrandWordmark from '@/components/common/BrandWordmark';
import { cn } from '@/lib/utils';
import {
  ArrowRight, Check, Menu, X, Clock, Frown, DollarSign,
  Zap, Palette, Brain, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, Bot, Layers, Settings, Crown, Star,
  Search, FileText, Image, Users, Share2, Code, MessageSquare,
  Sparkles, MousePointer2, BookOpen, BarChart3, Wand2, PenTool,
  Loader2
} from 'lucide-react';
import { showcaseService, ShowcaseDeck } from '@/services/showcaseService';
import InteractiveHero from '@/components/landing/InteractiveHero';
import PixelGridBackground from '@/components/landing/PixelGridBackground';
import ComparisonSection from '@/components/landing/ComparisonSection';
import { HeroTitle } from '@/components/landing/HeroTitle';
import { communityService, CommunityDeck } from '@/services/communityService';
import { useAuth } from '@/context/SupabaseAuthContext';
import CommunityGallery from '@/components/community/CommunityGallery';
import CommunityBottomSheet from '@/components/community/CommunityBottomSheet';
import { useTypewriter } from '@/hooks/useTypewriter';
import LegalModal from '@/components/legal/LegalModal';
import AuthDialog from '@/components/auth/AuthDialog';
import { BROWSER } from '@/utils/browser';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { StaticActiveSlideProvider } from '@/context/ActiveSlideContext';
import { StaticEditorStateProvider } from '@/context/EditorStateContext';
import { StaticNavigationProvider } from '@/context/NavigationContext';
import { generatePreview, PreviewResult, PreviewRateLimitError } from '@/services/previewApi';
import { trackEvent } from '@/services/analytics';

// Lazy load Slide component for the main viewer
const Slide = lazy(() => import('@/components/Slide'));

// Lazy load MiniSlide
const MiniSlide = lazy(() => import('@/components/deck/MiniSlide'));

// Lazy load PreviewCarousel (only needed after generation)
const PreviewCarousel = lazy(() => import('@/components/landing/PreviewCarousel'));

// Isolated component so typewriter state updates (~20/sec) don't re-render the
// entire 1500-line Landing component. Only this small subtree re-renders.
const TYPEWRITER_PHRASES = [
  'a quarterly business review',
  'course material on the French Revolution for grade 11',
  'a lecture on quantum computing',
  'a team onboarding guide',
  'a product launch presentation',
];

const TypewriterPlaceholder = React.memo(({ paused }: { paused: boolean }) => {
  const text = useTypewriter({
    phrases: TYPEWRITER_PHRASES,
    typingSpeed: 50,
    deletingSpeed: 30,
    pauseDuration: 2500,
    paused,
  });

  return (
    <div className="absolute inset-0 px-6 pt-10 flex cursor-text pointer-events-none z-10">
      <span className="text-2xl sm:text-3xl font-semibold leading-tight text-zinc-300 dark:text-zinc-700">
        {text}
        <span className="inline-block w-[2px] h-[1em] bg-[#FF4301] ml-1 align-middle animate-pulse" />
      </span>
    </div>
  );
});

const Landing: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSignedIn = !!user;
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Showcase state
  const [showcaseDecks, setShowcaseDecks] = useState<ShowcaseDeck[]>([]);
  const [isLoadingShowcase, setIsLoadingShowcase] = useState(true);

  // Hero Animation State
  // Scribble animation is now handled internally by HeroTitle
  const [heroInView, setHeroInView] = useState(true);
  const heroRef = useRef<HTMLDivElement>(null);
  const heroTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [heroInput, setHeroInput] = useState('');
  const [isHeroInputFocused, setIsHeroInputFocused] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);

  // Preview state (Try Without Signup)
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewSectionRef = useRef<HTMLDivElement>(null);

  // Typewriter is rendered via <TypewriterPlaceholder> to isolate its rapid
  // state updates from the rest of the Landing component.

  // ------------------------------------------------------------------
  // Preview generation handler (Try Without Signup)
  // ------------------------------------------------------------------
  const handleGeneratePreview = useCallback(async () => {
    const prompt = heroInput.trim();

    // If user is signed in, use the original flow (redirect to /app)
    if (isSignedIn) {
      if (prompt) localStorage.setItem('landing_prompt', prompt);
      navigate('/app');
      return;
    }

    // Need a prompt to generate
    if (!prompt) {
      heroTextareaRef.current?.focus();
      return;
    }

    // Already generating
    if (isGeneratingPreview) return;

    // Track analytics
    trackEvent('landing_preview_started', { prompt_length: prompt.length });

    setIsGeneratingPreview(true);
    setPreviewError(null);
    setPreviewData(null);

    try {
      const result = await generatePreview(prompt);

      setPreviewData(result);

      // Store preview ID for post-signup association
      sessionStorage.setItem('preview_id', result.id);
      sessionStorage.setItem('preview_prompt', prompt);

      trackEvent('landing_preview_completed', {
        slide_count: result.slides.length,
        preview_id: result.id,
      });

      // Scroll to preview section after a brief delay for render
      setTimeout(() => {
        previewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);

      // Track signup prompt shown (the locked slides act as prompts)
      trackEvent('landing_preview_signup_prompted', { preview_id: result.id });
    } catch (err) {
      if (err instanceof PreviewRateLimitError) {
        setPreviewError(err.message);
        // On rate limit, fall back to showing the auth dialog
        setShowAuthDialog(true);
      } else {
        const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
        setPreviewError(message);
      }
      trackEvent('landing_preview_failed', {
        error: err instanceof Error ? err.message : 'unknown',
      });
    } finally {
      setIsGeneratingPreview(false);
    }
  }, [heroInput, isSignedIn, isGeneratingPreview, navigate]);

  // Handler for signup clicks from the preview carousel
  const handlePreviewSignupClick = useCallback(() => {
    trackEvent('landing_preview_signup_clicked', {
      preview_id: previewData?.id,
    });
    setShowAuthDialog(true);
  }, [previewData]);


  // Track hero visibility
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setHeroInView(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );
    if (heroRef.current) observer.observe(heroRef.current);
    return () => observer.disconnect();
  }, []);

  // Community bottom sheet
  const [showCommunity, setShowCommunity] = useState(false);
  const [communityDecks, setCommunityDecks] = useState<CommunityDeck[]>([]);

  // Legal modal
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [legalDocType, setLegalDocType] = useState<'privacy' | 'terms'>('privacy');

  // Auth dialog

  const openLegalModal = (type: 'privacy' | 'terms') => {
    setLegalDocType(type);
    setLegalModalOpen(true);
  };

  // Load showcase decks and community decks
  useEffect(() => {
    const loadDecks = async () => {
      setIsLoadingShowcase(true);
      try {
        // Fetch both in parallel
        const [showcaseResults, communityResults] = await Promise.all([
          showcaseService.getFeaturedDecks(30),
          communityService.getDecks({ limit: 20 }).catch(() => ({ decks: [] }))
        ]);
        setShowcaseDecks(showcaseResults);
        setCommunityDecks(communityResults.decks || []);
      } catch (err) {
        console.error('Failed to load decks:', err);
      } finally {
        setIsLoadingShowcase(false);
      }
    };
    loadDecks();
  }, []);

  // Handle scroll events - only update state when crossing threshold for nav styling
  useEffect(() => {
    // On mount - ensure scrolling works on landing page
    document.documentElement.style.position = '';
    document.documentElement.style.overflow = '';
    document.body.style.position = '';
    document.body.style.overflow = '';

    let lastScrolled = false;
    const handleScroll = () => {
      const scrolled = window.scrollY > 20;
      // Only update state when crossing the threshold
      if (scrolled !== lastScrolled) {
        lastScrolled = scrolled;
        setIsScrolled(scrolled);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Intersection observer for animations - unobserve after animation triggered
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            // Unobserve after animation triggered - no need to keep watching
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '-50px' }
    );

    document.querySelectorAll('.animate-on-scroll').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);



  const problems = [
    {
      icon: Clock,
      title: "Hours lost to busywork",
      description: "Formatting slides, hunting for images, tweaking layouts pixel by pixel. Your best ideas deserve better than death by PowerPoint."
    },
    {
      icon: Frown,
      title: "Tools that fight you",
      description: "Templates feel generic. AI tools give you thin content. Nothing understands what you're actually trying to communicate."
    },
    {
      icon: DollarSign,
      title: "The expertise gap",
      description: "Great presentations need research, design, and storytelling. You shouldn't need three different tools—or three different people."
    }
  ];

  const features = [
    {
      icon: Search,
      tag: "RESEARCH & ANALYSIS",
      title: "Data in, insights out",
      description: "Upload financials, reports, spreadsheets—we extract, analyze, and visualize. Cited sources, accurate numbers, boardroom-ready analysis."
    },
    {
      icon: Bot,
      tag: "AGENTIC EDITOR",
      title: "AI that actually edits",
      description: "Not just generation—a real editor. Drag-and-drop, direct text editing, or chat to make changes. It does whatever a human designer would do."
    },
    {
      icon: Sparkles,
      tag: "COMPLETE CREATION",
      title: "Every visual you need",
      description: "Charts, tables, diagrams, AI images, smart image search. From complex data viz to beautiful graphics—created or found instantly."
    }
  ];

  // All tools for comparison (NextSlide first, then others)
  const allTools = [
    { name: 'NextSlide', isUs: true },
    { name: 'PowerPoint', isLegacy: true },
    { name: 'Google Slides', isLegacy: true },
    { name: 'Gamma' },
    { name: 'Canva' },
    { name: 'Beautiful.ai' }
  ];

  // Render star rating
  const renderStars = (rating: number, isUs: boolean = false) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      if (i <= Math.floor(rating)) {
        stars.push(
          <Star
            key={i}
            className={cn("w-4 h-4", isUs ? "fill-[#FF4301] text-[#FF4301]" : "fill-amber-400 text-amber-400")}
          />
        );
      } else if (i === Math.ceil(rating) && rating % 1 !== 0) {
        stars.push(
          <div key={i} className="relative w-4 h-4">
            <Star className={cn("w-4 h-4 absolute", isUs ? "text-[#FF4301]/30" : "text-amber-400/30")} />
            <div className="absolute overflow-hidden" style={{ width: `${(rating % 1) * 100}%` }}>
              <Star className={cn("w-4 h-4", isUs ? "fill-[#FF4301] text-[#FF4301]" : "fill-amber-400 text-amber-400")} />
            </div>
          </div>
        );
      } else {
        stars.push(
          <Star key={i} className={cn("w-4 h-4", isUs ? "text-[#FF4301]/30" : "text-black/20 dark:text-white/20")} />
        );
      }
    }
    return <div className="flex gap-0.5">{stars}</div>;
  };

  // Comparison data - researched info
  const comparisonRows = [
    {
      feature: 'Design Quality',
      isRating: true,
      values: [5, 2, 1.5, 3, 2.5, 3.5] // NextSlide, PPT, Google, Gamma, Canva, Beautiful.ai
    },
    {
      feature: 'AI Generation',
      values: ['Full decks', 'Copilot basic', 'None', 'Cards only', 'Thin content', 'Generic']
    },
    {
      feature: 'Custom Components',
      values: ['Unlimited', 'Manual only', 'Manual only', 'Fixed set', 'Fixed set', 'Smart slides']
    },
    {
      feature: 'Agentic AI Editor',
      values: [true, false, false, false, false, false]
    },
    {
      feature: 'Design Control',
      values: ['Full control', 'Full but manual', 'Basic', 'Limited', 'Template locked', 'Auto-locked']
    },
    {
      feature: 'Target Audience',
      isAudience: true,
      values: ['B2B + B2C', 'Enterprise', 'Consumer', 'Consumer', 'Consumer', 'Enterprise']
    },
    {
      feature: 'Slide Format',
      isFormat: true,
      values: ['Interactive + Traditional', 'Traditional', 'Traditional', 'Interactive only', 'Traditional', 'Traditional']
    },
  ];

  const faqs = [
    {
      question: "What can I create with NextSlide?",
      answer: "Anything you can imagine, in any style. Investor pitch decks with animated metrics, quarterly reviews with live data charts, wedding speeches with photo timelines, classroom lessons with interactive quizzes, product launches with 3D mockups, conference talks, research presentations, travel itineraries, recipe books, real estate showcases. Upload your documents and we analyze them. Share your brand and we research your colors, fonts, and style. Every presentation is custom-built for you."
    },
    {
      question: "How does the AI editing work?",
      answer: "Just chat with your slides. Want to change the color scheme? Add a chart? Restructure your content? Tell the AI what you want in plain English and watch it happen. You can also click and edit anything manually if you prefer hands-on control."
    },
    {
      question: "What are custom components?",
      answer: "These are flexible building blocks that go way beyond basic text and images. Think interactive cards, animated diagrams, data visualizations, timelines, comparison tables, and layouts you would normally need a designer to create. You get all of this automatically."
    },
    {
      question: "Do I need design skills?",
      answer: "Not at all. NextSlide handles spacing, typography, colors, hierarchy, and layout so you can focus entirely on your message. Whether you are a seasoned presenter or making your first deck, everything just looks polished."
    }
  ];


  return (
    <div className="min-h-screen bg-[#FCFBF8] dark:bg-[#0a0a0a] overflow-x-hidden">

      {/* Navigation */}
      <nav
        className={cn(
          "fixed top-0 w-full z-50 transition-all duration-300",
          isScrolled
            ? "bg-[#FCFBF8]/90 dark:bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-black/10 dark:border-white/10"
            : "bg-transparent"
        )}
      >
        <div className="max-w-[1400px] mx-auto px-8 py-4 flex items-center justify-between">
          <div className="cursor-pointer" onClick={() => window.location.reload()}>
            <BrandWordmark
              tag="h1"
              sizePx={18.95}
              xImageUrl="/brand/nextslide-x.png"
              gapLeftPx={-3}
              gapRightPx={-8}
              liftPx={-4}
              xLiftPx={-4}
              rightLiftPx={0}
            />
          </div>

          <div className="hidden md:flex items-center gap-8">
            <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-sm font-medium text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors">Create</a>
            <a href="#compare" className="text-sm font-medium text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors">Compare</a>
            <a href="#pricing" className="text-sm font-medium text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors">Pricing</a>
            {isSignedIn ? (
              <Button onClick={() => navigate('/app')} className="bg-[#FF4301] hover:bg-[#E63901] text-white text-sm font-semibold">
                My Slides
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate('/login')} className="text-sm">Sign In</Button>
                <Button onClick={() => navigate('/signup')} className="bg-[#FF4301] hover:bg-[#E63901] text-white text-sm font-semibold">
                  Get Started
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </>
            )}
          </div>

          <button
            className="md:hidden p-2 min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {isMenuOpen && (
          <div className="md:hidden bg-[#FCFBF8] dark:bg-[#0a0a0a] border-b border-black/10 dark:border-white/10 max-h-[70vh] overflow-y-auto">
            <div className="px-6 py-4 flex flex-col gap-3 safe-area-inset-bottom">
              <a href="#" onClick={() => { setIsMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="py-2 touch-manipulation">Create</a>
              <a href="#compare" onClick={() => setIsMenuOpen(false)} className="py-2 touch-manipulation">Compare</a>
              <a href="#pricing" onClick={() => setIsMenuOpen(false)} className="py-2 touch-manipulation">Pricing</a>
              {isSignedIn ? (
                <Button className="bg-[#FF4301] hover:bg-[#E63901] text-white min-h-[44px] touch-manipulation" onClick={() => navigate('/app')}>My Slides</Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => navigate('/login')} className="justify-start min-h-[44px] touch-manipulation">Sign In</Button>
                  <Button className="bg-[#FF4301] hover:bg-[#E63901] text-white min-h-[44px] touch-manipulation" onClick={() => navigate('/signup')}>Get Started</Button>
                </>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Sticky Background Wrapper for Hero + Showcase */}
      <div className="relative z-10">
        {/* Fixed Background Layer */}
        <div className="sticky top-0 h-screen w-full -z-10 overflow-hidden">
          <PixelGridBackground theme="light" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/50 to-[#FCFBF8] dark:via-zinc-950/50 dark:to-[#0a0a0a] pointer-events-none" />
        </div>

        {/* Hero - Clean, focused design */}
        <section ref={heroRef} className="relative min-h-[90vh] flex flex-col justify-center overflow-visible -mt-[100vh]">

          {/* Hero Title Animation */}
          <div className="relative z-30 pt-32 sm:pt-40 pb-8 text-center px-4">
            <HeroTitle />

            <p className="mt-12 text-xl sm:text-2xl text-black/60 dark:text-white/60 max-w-2xl mx-auto px-4 hero-subtitle-animate font-light tracking-wide">
              Beautiful decks for every idea. Perfected in seconds.
            </p>
          </div>

          {/* Hero Input - Left-aligned, App-style but bigger */}
          <div className="relative z-30 px-4 sm:px-8 pb-12 w-full">
            <div className="w-full max-w-[640px] mx-auto hero-input-box">

              <div
                className={cn(
                  "flex flex-col relative bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl shadow-black/10 dark:shadow-black/50 border-2 transition-all duration-300",
                  isHeroInputFocused ? "border-[#FF4301] ring-4 ring-[#FF4301]/10" : "border-zinc-100 dark:border-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700"
                )}
              >
                <div className="p-6 pb-2 relative min-h-[140px] flex flex-col justify-start pt-10">

                  {/* Typewriter Overlay */}
                  {!isHeroInputFocused && !heroInput && (
                    <TypewriterPlaceholder paused={!heroInView || isHeroInputFocused || !!heroInput} />
                  )}

                  <textarea
                    ref={heroTextareaRef}
                    value={heroInput}
                    onChange={(e) => setHeroInput(e.target.value)}
                    onFocus={() => setIsHeroInputFocused(true)}
                    onBlur={() => !heroInput.trim() && setIsHeroInputFocused(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && heroInput.trim()) {
                        e.preventDefault();
                        handleGeneratePreview();
                      }
                    }}
                    className="w-full bg-transparent border-none outline-none text-black dark:text-white placeholder-transparent caret-[#FF4301] text-2xl sm:text-3xl font-semibold leading-tight resize-none m-0 relative z-20"
                    style={{ height: 'auto', minHeight: '80px' }}
                    placeholder="Create a quarterly business..." // Hidden by custom typewriter
                    rows={1}
                  />
                </div>

                <div className="px-4 pb-4 flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs font-bold text-zinc-400 uppercase tracking-widest pl-2">
                    <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" /> The New Standard</span>
                    <span className="hidden sm:inline">for Presentations</span>
                  </div>

                  <Button
                    size="lg"
                    onClick={handleGeneratePreview}
                    disabled={isGeneratingPreview}
                    className={cn(
                      "bg-[#FF4301] hover:bg-[#E63901] text-white rounded-xl px-8 py-6 text-lg font-bold shadow-lg shadow-orange-500/20 transition-all duration-300",
                      isGeneratingPreview && "opacity-80 cursor-not-allowed"
                    )}
                  >
                    {isGeneratingPreview ? (
                      <>
                        <Loader2 className="mr-2 w-5 h-5 animate-spin" /> Generating...
                      </>
                    ) : (
                      <>
                        Generate <ArrowRight className="ml-2 w-5 h-5" />
                      </>
                    )}
                  </Button>
                </div>
              </div>

            </div>

            {/* Trust badges */}
            <div className="flex flex-wrap items-center justify-center gap-6 mt-8">
              <div className="flex items-center gap-2 px-4 py-2 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm rounded-full border border-black/5 dark:border-white/5">
                <Check className="w-3 h-3 text-[#FF4301]" />
                <span className="text-xs font-bold text-black/60 dark:text-white/60 uppercase tracking-wider">Free to start</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm rounded-full border border-black/5 dark:border-white/5">
                <Check className="w-3 h-3 text-[#FF4301]" />
                <span className="text-xs font-bold text-black/60 dark:text-white/60 uppercase tracking-wider">No credit card needed</span>
              </div>
            </div>
          </div>

          {/* Preview Section (appears after generation) */}
          {(isGeneratingPreview || previewData) && (
            <div ref={previewSectionRef} className="relative z-30 pb-16 pt-4 scroll-mt-24">
              <Suspense fallback={null}>
                <PreviewCarousel
                  slides={previewData?.slides ?? []}
                  title={previewData?.title ?? ''}
                  onSignupClick={handlePreviewSignupClick}
                  isLoading={isGeneratingPreview}
                />
              </Suspense>

              {/* CTA section after preview loads */}
              {previewData && !isGeneratingPreview && (
                <div className="mt-10 max-w-[520px] mx-auto px-4">
                  <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-black/10 dark:border-white/10 p-6 sm:p-8 shadow-xl text-center">
                    <h4
                      className="text-base sm:text-lg font-bold text-black dark:text-white mb-2"
                      style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
                    >
                      Save, edit & share your presentation
                    </h4>
                    <p className="text-sm text-black/60 dark:text-white/60 mb-5">
                      Sign up to unlock all slides, use the AI editor, and get a shareable link.
                    </p>

                    {/* Google OAuth -- primary CTA */}
                    <Button
                      className="w-full h-11 bg-[#FF4301] hover:bg-[#E63901] text-white font-semibold mb-3"
                      onClick={handlePreviewSignupClick}
                    >
                      <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      Continue with Google
                    </Button>

                    {/* Email signup */}
                    <Button
                      variant="outline"
                      className="w-full h-10 border-zinc-200 dark:border-zinc-700 text-sm"
                      onClick={handlePreviewSignupClick}
                    >
                      Sign up with email
                    </Button>

                    <p className="text-[11px] text-black/40 dark:text-white/40 mt-4">
                      Free forever, no credit card required
                    </p>
                  </div>
                </div>
              )}

              {/* Preview error display */}
              {previewError && !isGeneratingPreview && !previewData && (
                <div className="mt-6 max-w-[520px] mx-auto px-4 text-center">
                  <p className="text-sm text-red-600 dark:text-red-400">{previewError}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-[#FF4301]"
                    onClick={() => {
                      setPreviewError(null);
                      heroTextareaRef.current?.focus();
                    }}
                  >
                    Try again
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* New Interactive Hero Section (used as Showcase) */}
        <InteractiveHero decks={showcaseDecks} isLoading={isLoadingShowcase} />

        {/* Why NextSlide - Feature Grid */}
        <section className="relative z-20 py-20 px-8 bg-white dark:bg-zinc-950">
          <div className="max-w-[1200px] mx-auto">
            <div className="text-center mb-16 animate-on-scroll opacity-0">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FF4301]/10 border border-[#FF4301]/20 mb-6">
                <Wand2 className="w-4 h-4 text-[#FF4301]" />
                <span className="text-sm font-bold text-[#FF4301]" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>10 TOOLS IN ONE</span>
              </div>
              <h2
                className="text-black dark:text-white mb-4"
                style={{
                  fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                  fontWeight: 900,
                  fontSize: 'clamp(32px, 5vw, 52px)',
                  lineHeight: '1.1',
                  letterSpacing: '-0.02em',
                  textTransform: 'uppercase'
                }}
              >
                Everything you need. Nothing you don't.
              </h2>
              <p className="text-lg text-black/60 dark:text-white/60 max-w-2xl mx-auto">
                Research. Design. Edit. Collaborate. Present. One platform that does it all.
              </p>
            </div>

            {/* Feature Pills Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 animate-on-scroll opacity-0">
              {[
                { icon: Search, label: 'Deep Research', desc: 'Real cited sources' },
                { icon: FileText, label: 'File Analysis', desc: 'PDFs, Excel, docs' },
                { icon: Image, label: 'AI Images', desc: 'Generate any visual' },
                { icon: Bot, label: 'Agent Editor', desc: 'Chat to edit' },
                { icon: MousePointer2, label: 'Drag & Drop', desc: 'Full control' },
                { icon: Palette, label: 'Auto Design', desc: 'Always beautiful' },
                { icon: PenTool, label: 'Brand Kit', desc: 'Your style, applied' },
                { icon: BarChart3, label: 'Data Analysis', desc: 'Financials & metrics' },
                { icon: Users, label: 'Live Cursors', desc: 'Team collaboration' },
                { icon: Share2, label: 'Share & Track', desc: 'Analytics built-in' },
                { icon: MessageSquare, label: 'Conversational', desc: 'Build by chatting' },
                { icon: Code, label: 'Developer API', desc: 'Automate anything' },
              ].map((feature, i) => (
                <div
                  key={i}
                  className="group p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FCFBF8] dark:bg-zinc-900 border border-black/5 dark:border-white/5 hover:border-[#FF4301]/30 hover:bg-[#FF4301]/5 transition-all duration-200"
                >
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-[#FF4301]/10 flex items-center justify-center flex-shrink-0 group-hover:bg-[#FF4301]/20 transition-colors">
                      <feature.icon className="w-4 h-4 sm:w-5 sm:h-5 text-[#FF4301]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-xs sm:text-sm text-black dark:text-white" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                        {feature.label}
                      </div>
                      <div className="text-[10px] sm:text-xs text-black/50 dark:text-white/50">
                        {feature.desc}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom tagline */}
            <div className="mt-12 text-center animate-on-scroll opacity-0">
              <p className="text-black/50 dark:text-white/50 text-sm font-medium">
                Investor decks. Board reports. Financial analysis. Quarterly reviews. Market research. Strategic planning.
              </p>
              <p className="text-black/40 dark:text-white/40 text-sm mt-1">
                From fun and creative to boardroom-ready. Every style. Every audience.
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Comparison Section - Sticky Scroll */}
      <ComparisonSection />

      {/* Comparison Matrix - NextSlide vs. Others */}
      <section id="compare" className="py-24 px-8 bg-[#FCFBF8] dark:bg-[#0a0a0a]">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-12 animate-on-scroll opacity-0">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FF4301]/10 border border-[#FF4301]/20 mb-6">
              <Crown className="w-4 h-4 text-[#FF4301]" />
              <span className="text-sm font-bold text-[#FF4301]" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>THE NEW STANDARD</span>
            </div>
            <h2
              className="text-black dark:text-white mb-4"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(36px, 5vw, 56px)',
                lineHeight: '1.1',
                letterSpacing: '-0.02em',
                textTransform: 'uppercase'
              }}
            >
              NextSlide vs. Others
            </h2>
            <p className="text-lg text-black/60 dark:text-white/60 max-w-xl mx-auto">
              See how we compare to the alternatives
            </p>
          </div>

          {/* Comparison Table */}
          <div className="animate-on-scroll opacity-0 rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden bg-white dark:bg-zinc-900/80 shadow-xl overflow-x-auto">
            {/* Header */}
            <div className="grid grid-cols-7 min-w-[900px] bg-zinc-50 dark:bg-zinc-800/50">
              <div className="p-4 text-xs font-bold text-black/40 dark:text-white/40 uppercase tracking-wider" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                Feature
              </div>
              {allTools.map((tool, i) => (
                <div
                  key={i}
                  className={cn(
                    "p-4 text-center",
                    tool.isUs
                      ? "bg-[#FF4301]"
                      : tool.isLegacy
                        ? "bg-zinc-200 dark:bg-zinc-700"
                        : "bg-zinc-100 dark:bg-zinc-800"
                  )}
                >
                  <div
                    className={cn(
                      "text-xs font-bold",
                      tool.isUs ? "text-white" : tool.isLegacy ? "text-zinc-500 dark:text-zinc-400" : "text-black/70 dark:text-white/70"
                    )}
                    style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
                  >
                    {tool.name}
                  </div>
                  {tool.isLegacy && <div className="text-[9px] font-normal text-zinc-500 dark:text-zinc-400">Legacy</div>}
                </div>
              ))}
            </div>

            {/* Rows */}
            {comparisonRows.map((row, idx) => {
              // Helper to render cell value
              const renderCell = (value: any, isUs: boolean, toolIdx: number) => {
                // Rating row - use star system
                if (row.isRating && typeof value === 'number') {
                  return renderStars(value, isUs);
                }
                // Boolean true
                if (value === true) {
                  return (
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center mx-auto",
                      isUs ? "bg-white" : "bg-green-500"
                    )}>
                      <Check className={cn("w-4 h-4", isUs ? "text-[#FF4301]" : "text-white")} />
                    </div>
                  );
                }
                // Boolean false
                if (value === false) {
                  return <X className="w-5 h-5 text-black/20 dark:text-white/20 mx-auto" />;
                }
                // Audience row - special styling
                if (row.isAudience) {
                  if (value === 'B2B + B2C') {
                    return (
                      <div className="flex items-center justify-center gap-1">
                        <span className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded",
                          isUs ? "bg-white text-[#FF4301]" : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                        )}>B2B</span>
                        <span className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded",
                          isUs ? "bg-white text-[#FF4301]" : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                        )}>B2C</span>
                      </div>
                    );
                  }
                  return (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                      {value}
                    </span>
                  );
                }
                // Format row - special styling
                if (row.isFormat) {
                  if (value === 'Interactive + Traditional') {
                    return (
                      <div className="flex flex-col items-center gap-1">
                        <span className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded",
                          isUs ? "bg-white text-[#FF4301]" : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                        )}>Interactive</span>
                        <span className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded",
                          isUs ? "bg-white text-[#FF4301]" : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                        )}>Traditional</span>
                      </div>
                    );
                  }
                  if (value === 'Interactive only') {
                    return (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                        Interactive only
                      </span>
                    );
                  }
                  return (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                      {value}
                    </span>
                  );
                }
                // String values - color code based on sentiment
                if (typeof value === 'string') {
                  const negativeKeywords = ['limited', 'basic', 'locked', 'thin', 'generic', 'none', 'manual', 'fixed', 'auto-locked', 'copilot'];
                  const positiveKeywords = ['full', 'unlimited'];
                  const isNegative = negativeKeywords.some(kw => value.toLowerCase().includes(kw));
                  const isPositive = positiveKeywords.some(kw => value.toLowerCase().includes(kw));

                  if (isUs) {
                    return (
                      <span className="text-[10px] font-bold text-[#FF4301] uppercase">{value}</span>
                    );
                  }
                  if (isNegative) {
                    return (
                      <span className="text-[9px] font-medium text-red-600 dark:text-red-400 uppercase bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded">
                        {value}
                      </span>
                    );
                  }
                  if (isPositive) {
                    return (
                      <span className="text-[9px] font-medium text-green-600 dark:text-green-400 uppercase bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded">
                        {value}
                      </span>
                    );
                  }
                  return (
                    <span className="text-[9px] font-medium text-amber-600 dark:text-amber-400 uppercase bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
                      {value}
                    </span>
                  );
                }
                return null;
              };

              return (
                <div
                  key={idx}
                  className={cn(
                    "grid grid-cols-7 min-w-[900px] transition-colors",
                    idx % 2 === 0 ? "bg-white dark:bg-zinc-900/50" : "bg-zinc-50/50 dark:bg-zinc-800/30",
                    idx !== comparisonRows.length - 1 && "border-b border-black/5 dark:border-white/5",
                    "hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
                  )}
                >
                  <div className="p-3 text-sm font-medium text-black dark:text-white flex items-center">
                    {row.feature}
                  </div>
                  {row.values.map((value, i) => (
                    <div
                      key={i}
                      className={cn(
                        "p-3 flex items-center justify-center",
                        i === 0 ? "bg-[#FF4301]/10" : (i <= 2 ? "bg-zinc-100/50 dark:bg-zinc-800/50" : "")
                      )}
                    >
                      {renderCell(value, i === 0, i)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Key differentiators */}
          <div className="mt-12 grid md:grid-cols-3 gap-6">
            {[
              { icon: Users, title: 'Real-time Collaboration', description: 'See teammates\' cursors live. Share with one click. Track views and engagement with built-in analytics.' },
              { icon: PenTool, title: 'Your Brand, Automatic', description: 'We research your company and apply your colors, fonts, and style. Logos placed perfectly. Every slide on-brand.' },
              { icon: Code, title: 'Developer API', description: 'Build presentations programmatically. Automate deck creation, integrate with your tools, scale without limits.' }
            ].map((item, i) => (
              <div key={i} className="animate-on-scroll opacity-0 p-6 rounded-2xl bg-white dark:bg-black/50 border border-black/10 dark:border-white/10">
                <div className="w-12 h-12 rounded-xl bg-[#FF4301]/10 flex items-center justify-center mb-4">
                  <item.icon className="w-6 h-6 text-[#FF4301]" />
                </div>
                <h3 className="text-lg font-bold text-black dark:text-white mb-2" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                  {item.title}
                </h3>
                <p className="text-sm text-black/60 dark:text-white/60 leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="pt-24 pb-12 px-8 bg-white dark:bg-black/30">
        <div className="max-w-[900px] mx-auto">
          <div className="text-center mb-16 animate-on-scroll opacity-0">
            <h2
              className="text-black dark:text-white mb-4"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(36px, 5vw, 56px)',
                lineHeight: '1.1',
                letterSpacing: '-0.02em',
                textTransform: 'uppercase'
              }}
            >
              Questions?
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="animate-on-scroll opacity-0 bg-[#FCFBF8] dark:bg-[#0a0a0a] rounded-xl border border-black/10 dark:border-white/10 overflow-hidden"
                style={{ transitionDelay: `${index * 50}ms` }}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="w-full p-6 flex items-center justify-between text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <span className="text-lg font-bold text-black dark:text-white pr-8" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                    {faq.question}
                  </span>
                  {openFaq === index ? (
                    <ChevronUp className="w-6 h-6 text-[#FF4301] flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-6 h-6 text-black/40 dark:text-white/40 flex-shrink-0" />
                  )}
                </button>
                {openFaq === index && (
                  <div className="px-6 pb-6">
                    <p className="text-black/70 dark:text-white/70 leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="pt-16 pb-12 px-8 bg-[#FCFBF8] dark:bg-[#0a0a0a]">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-16 animate-on-scroll opacity-0">
            <h2
              className="text-black dark:text-white mb-4"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(36px, 5vw, 64px)',
                lineHeight: '1.1',
                letterSpacing: '-0.02em',
                textTransform: 'uppercase'
              }}
            >
              Simple Pricing
            </h2>
            <p className="text-xl text-black/60 dark:text-white/60">
              Start free. Upgrade when you're ready.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Free */}
            <div className="animate-on-scroll opacity-0 p-6 rounded-2xl border-2 border-black/10 dark:border-white/10 bg-white dark:bg-black/50">
              <div className="mb-6">
                <h3 className="text-lg font-bold mb-2 text-black dark:text-white" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Free</h3>
                <div className="text-4xl font-bold text-black dark:text-white mb-1" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                  $0
                </div>
                <div className="text-sm text-black/50 dark:text-white/50">50 credits/month</div>
              </div>
              <ul className="space-y-2 mb-6 text-sm">
                {['Full editor access', 'All AI features', 'Free forever'].map((feature, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#FF4301] flex-shrink-0 mt-0.5" />
                    <span className="text-black/70 dark:text-white/70">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full" onClick={() => navigate('/signup')}>
                Get Started
              </Button>
            </div>

            {/* Starter */}
            <div className="animate-on-scroll opacity-0 p-6 rounded-2xl border-2 border-black/10 dark:border-white/10 bg-white dark:bg-black/50" style={{ transitionDelay: '50ms' }}>
              <div className="mb-6">
                <h3 className="text-lg font-bold mb-2 text-black dark:text-white" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Starter</h3>
                <div className="text-4xl font-bold text-black dark:text-white mb-1" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                  $9.99
                </div>
                <div className="text-sm text-black/50 dark:text-white/50">1,000 credits/month</div>
              </div>
              <ul className="space-y-2 mb-6 text-sm">
                {['All AI features', 'Priority support', 'Better rates'].map((feature, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#FF4301] flex-shrink-0 mt-0.5" />
                    <span className="text-black/70 dark:text-white/70">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full" onClick={() => navigate('/pricing')}>
                Start Trial
              </Button>
            </div>

            {/* Pro */}
            <div className="animate-on-scroll opacity-0 p-6 rounded-2xl bg-[#FF4301] text-white transform lg:scale-105 shadow-xl z-10" style={{ transitionDelay: '100ms' }}>
              <div className="bg-white/20 text-xs font-bold px-3 py-1 rounded-full inline-block mb-4">
                MOST POPULAR
              </div>
              <div className="mb-6">
                <h3 className="text-lg font-bold mb-2" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Pro</h3>
                <div className="text-4xl font-bold mb-1" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                  $19.99
                </div>
                <div className="text-sm opacity-90">2,000 credits/month</div>
              </div>
              <ul className="space-y-2 mb-6 text-sm">
                {['Priority AI', 'Unlimited presentations', 'Best rates'].map((feature, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button className="w-full bg-white text-[#FF4301] hover:bg-zinc-100 font-semibold" onClick={() => navigate('/pricing')}>
                Start Pro Trial
              </Button>
            </div>

            {/* Enterprise */}
            <div className="animate-on-scroll opacity-0 p-6 rounded-2xl border-2 border-black/10 dark:border-white/10 bg-white dark:bg-black/50" style={{ transitionDelay: '150ms' }}>
              <div className="mb-6">
                <h3 className="text-lg font-bold mb-2 text-black dark:text-white" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Enterprise</h3>
                <div className="text-4xl font-bold text-black dark:text-white mb-1" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                  Custom
                </div>
                <div className="text-sm text-black/50 dark:text-white/50">Unlimited credits</div>
              </div>
              <ul className="space-y-2 mb-6 text-sm">
                {['Unlimited slides', 'Priority support', 'SSO & SAML', 'Custom onboarding'].map((feature, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#FF4301] flex-shrink-0 mt-0.5" />
                    <span className="text-black/70 dark:text-white/70">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full" onClick={() => window.location.href = 'mailto:sales@nextslide.ai'}>
                Contact Sales
              </Button>
            </div>
          </div>

          {/* Credit info */}
          <p className="text-center text-sm text-black/40 dark:text-white/40 mt-4">
            Each slide uses ~5 credits
          </p>

          {/* See all plans link */}
          <div className="text-center mt-2">
            <Button variant="link" className="text-[#FF4301]" onClick={() => navigate('/pricing')}>
              See all plans & credit details →
            </Button>
          </div>
        </div>
      </section>

      {/* Community Slides */}
      <section className="py-24 px-8 bg-white dark:bg-black/30">
          <div className="max-w-[1400px] mx-auto">
            <div className="text-center mb-12 animate-on-scroll opacity-0">
              <h2
                className="mb-4"
                style={{
                  fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                  fontWeight: 900,
                  fontSize: 'clamp(32px, 5vw, 48px)',
                  lineHeight: '1.1',
                  letterSpacing: '-0.02em',
                }}
              >
                Community Slides
              </h2>
              <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                Get inspired or learn something new from slides created by the NextSlide community, or remix it to make it your own!
              </p>
            </div>

            <div className="animate-on-scroll opacity-0">
              <CommunityGallery
                variant="landing"
                maxItems={12}
                showSearch={false}
                showFilters={false}
              />
            </div>

            <div className="text-center mt-10 animate-on-scroll opacity-0">
              <Button
                variant="outline"
                className="border-[#FF4301] text-[#FF4301] hover:bg-[#FF4301]/5"
                onClick={() => setShowCommunity(true)}
              >
                See more community slides
                <ArrowRight size={16} className="ml-2" />
              </Button>
            </div>
          </div>
        </section>

      {/* Community Bottom Sheet */}
      <CommunityBottomSheet
        isOpen={showCommunity}
        onClose={() => setShowCommunity(false)}
      />

      {/* Final CTA */}
      <section className="py-24 px-8 bg-[#FF4301] text-white">
        <div className="max-w-[1200px] mx-auto text-center animate-on-scroll opacity-0">
          <h2
            className="mb-6"
            style={{
              fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
              fontWeight: 900,
              fontSize: 'clamp(40px, 6vw, 72px)',
              lineHeight: '1',
              letterSpacing: '-0.02em',
              textTransform: 'uppercase'
            }}
          >
            {isSignedIn ? 'Ready to create?' : 'Try NextSlide free'}
          </h2>
          <p className="text-xl opacity-90 mb-10 max-w-2xl mx-auto">
            {isSignedIn
              ? 'Jump back into your presentations and keep creating.'
              : 'No commitments. No credit card. Start creating professional presentations in 90 seconds.'
            }
          </p>
          <Button
            size="lg"
            className="bg-white text-[#FF4301] hover:bg-zinc-100 px-12 py-7 text-lg font-bold shadow-xl"
            onClick={() => navigate(isSignedIn ? '/app' : '/signup')}
          >
            {isSignedIn ? 'Go to Slides' : 'Start Creating for Free'}
            <ArrowRight className="ml-3 w-6 h-6" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black text-white/60 py-16 px-8">
        <div className="max-w-[1400px] mx-auto">
          <div className="grid md:grid-cols-3 gap-12 mb-12">
            <div>
              <BrandWordmark
                tag="h3"
                sizePx={18}
                textColor="#ffffff"
                xImageUrl="/brand/nextslide-x.png"
                gapLeftPx={-3}
                gapRightPx={-8}
                liftPx={-4}
                xLiftPx={-4}
                rightLiftPx={0}
              />
              <p className="text-sm mt-4">Your ideas, perfectly visualized.</p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4 text-sm" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4 text-sm" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><button onClick={() => openLegalModal('privacy')} className="hover:text-white transition-colors">Privacy Policy</button></li>
                <li><button onClick={() => openLegalModal('terms')} className="hover:text-white transition-colors">Terms of Service</button></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 pt-8 text-center text-sm">
            <p>&copy; 2026 NextSlide</p>
          </div>
        </div>
      </footer>

      {/* Legal Modal */}
      <LegalModal
        isOpen={legalModalOpen}
        onClose={() => setLegalModalOpen(false)}
        documentType={legalDocType}
      />

      {/* Auth Dialog */}
      <AuthDialog
        open={showAuthDialog}
        onOpenChange={setShowAuthDialog}
        initialMode="signup"
        onSuccess={() => {
          // Persist the preview prompt so the app can pick it up after signup
          const previewPrompt = sessionStorage.getItem('preview_prompt') || heroInput.trim();
          if (previewPrompt) {
            localStorage.setItem('landing_prompt', previewPrompt);
          }
          navigate('/app');
        }}
      />

      {/* Landing styles loaded from static CSS file (src/styles/landing.css)
          to prevent animation resets during React re-renders */}
    </div>
  );
};

export default Landing;
