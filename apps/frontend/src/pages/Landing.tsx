import React, { useEffect, useState, useRef, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import BrandWordmark from '@/components/common/BrandWordmark';
import { cn } from '@/lib/utils';
import {
  ArrowRight, Check, Menu, X, Clock, Frown, DollarSign,
  Zap, Palette, Brain, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, Bot, Layers, Settings, Crown, Star,
  Search, FileText, Image, Users, Share2, Code, MessageSquare,
  Sparkles, MousePointer2, BookOpen, BarChart3, Wand2, PenTool
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

// Lazy load Slide component for the main viewer
const Slide = lazy(() => import('@/components/Slide'));

// Lazy load MiniSlide
const MiniSlide = lazy(() => import('@/components/deck/MiniSlide'));

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

  // Typewriter effect
  const typewriterText = useTypewriter({
    phrases: [
      'a quarterly business review',
      'course material on the French Revolution for grade 11',
      'a lecture on quantum computing',
      'a team onboarding guide',
      'a product launch presentation',
    ],
    typingSpeed: 50,
    deletingSpeed: 30,
    pauseDuration: 2500,
    paused: !heroInView || isHeroInputFocused || !!heroInput,
  });


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
          showcaseService.getFeaturedDecks(8),
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
    <div className="min-h-screen bg-[#FCFBF8] dark:bg-[#0a0a0a] overflow-x-clip">

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
                    <div
                      className="absolute inset-0 px-6 pt-10 flex cursor-text pointer-events-none z-10"
                    >
                      <span className="text-2xl sm:text-3xl font-semibold leading-tight text-zinc-300 dark:text-zinc-700">
                        {typewriterText}
                        <span className="inline-block w-1 h-[1em] bg-[#FF4301] ml-1 align-middle animate-pulse" />
                      </span>
                    </div>
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
                        if (isSignedIn) {
                          localStorage.setItem('landing_prompt', heroInput.trim());
                          navigate('/app');
                        } else {
                          localStorage.setItem('landing_prompt', heroInput.trim());
                          setShowAuthDialog(true);
                        }
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
                    onClick={() => {
                      const prompt = heroInput.trim();
                      if (isSignedIn) {
                        if (prompt) localStorage.setItem('landing_prompt', prompt);
                        navigate('/app');
                      } else {
                        if (prompt) localStorage.setItem('landing_prompt', prompt);
                        setShowAuthDialog(true);
                      }
                    }}
                    className={cn(
                      "bg-[#FF4301] hover:bg-[#E63901] text-white rounded-xl px-8 py-6 text-lg font-bold shadow-lg shadow-orange-500/20 transition-all duration-300",
                    )}
                  >
                    Generate <ArrowRight className="ml-2 w-5 h-5" />
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
          // After successful auth, navigate to /app with the stored prompt
          navigate('/app');
        }}
      />

      {/* Animations */}
      <style>{`
        html {
          scroll-behavior: smooth;
        }
        .animate-on-scroll {
          transition: opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1),
                      transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
          transform: translateY(30px);
        }
        .animate-on-scroll.in-view {
          opacity: 1 !important;
          transform: translateY(0);
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.05);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.2);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.3);
        }
        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.2) rgba(255,255,255,0.05);
        }

        /* Hero title animation */
        .hero-title-animate {
          opacity: 0;
          animation: heroTitlePop 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s forwards;
        }
        @keyframes heroTitlePop {
          0% { opacity: 0; transform: scale(0.9) translateY(20px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }

        .hero-subtitle-animate {
          opacity: 0;
          animation: heroSubtitleFade 0.6s ease-out 0.4s forwards;
        }
        @keyframes heroSubtitleFade {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        /* Hero input box animation - poppy bounce */
        .hero-input-box {
          opacity: 0;
          animation: heroInputPop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.5s forwards;
        }
        @keyframes heroInputPop {
          0% { opacity: 0; transform: scale(0.95) translateY(20px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }

        /* Pop-in card with shadow pulse */
        .pop-in-card {
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .pop-in-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
        }
        .pop-in-card:focus-within {
          transform: translateY(-2px);
          box-shadow: 0 25px 50px -12px rgba(255, 67, 1, 0.15);
        }

        /* Carousel main slide animation */
        .carousel-main-slide {
          transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1),
                      box-shadow 0.3s ease;
        }
        .carousel-main-slide:hover {
          transform: scale(1.02);
        }

        /* Carousel side slides */
        .carousel-side-slide {
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        /* Carousel arrows */
        .carousel-arrow {
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .carousel-arrow:active {
          transform: translateY(-50%) scale(0.95);
        }

        /* Pixelated blocks pattern - left side */
        .pixel-blocks-left {
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(circle at 20% 10%, rgba(255,67,1,0.3) 0, rgba(255,67,1,0.3) 12px, transparent 12px),
            radial-gradient(circle at 60% 25%, rgba(255,67,1,0.2) 0, rgba(255,67,1,0.2) 8px, transparent 8px),
            radial-gradient(circle at 30% 40%, rgba(255,67,1,0.25) 0, rgba(255,67,1,0.25) 16px, transparent 16px),
            radial-gradient(circle at 70% 55%, rgba(255,67,1,0.15) 0, rgba(255,67,1,0.15) 10px, transparent 10px),
            radial-gradient(circle at 15% 70%, rgba(255,67,1,0.2) 0, rgba(255,67,1,0.2) 14px, transparent 14px),
            radial-gradient(circle at 50% 85%, rgba(255,67,1,0.25) 0, rgba(255,67,1,0.25) 8px, transparent 8px),
            radial-gradient(circle at 80% 90%, rgba(255,67,1,0.15) 0, rgba(255,67,1,0.15) 12px, transparent 12px);
          animation: pixelFloat 8s ease-in-out infinite;
        }

        /* Pixelated blocks pattern - right side */
        .pixel-blocks-right {
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(circle at 80% 15%, rgba(255,67,1,0.3) 0, rgba(255,67,1,0.3) 12px, transparent 12px),
            radial-gradient(circle at 40% 30%, rgba(255,67,1,0.2) 0, rgba(255,67,1,0.2) 8px, transparent 8px),
            radial-gradient(circle at 70% 45%, rgba(255,67,1,0.25) 0, rgba(255,67,1,0.25) 16px, transparent 16px),
            radial-gradient(circle at 30% 60%, rgba(255,67,1,0.15) 0, rgba(255,67,1,0.15) 10px, transparent 10px),
            radial-gradient(circle at 85% 75%, rgba(255,67,1,0.2) 0, rgba(255,67,1,0.2) 14px, transparent 14px),
            radial-gradient(circle at 50% 88%, rgba(255,67,1,0.25) 0, rgba(255,67,1,0.25) 8px, transparent 8px),
            radial-gradient(circle at 20% 95%, rgba(255,67,1,0.15) 0, rgba(255,67,1,0.15) 12px, transparent 12px);
          animation: pixelFloat 8s ease-in-out infinite reverse;
        }

        @keyframes pixelFloat {
          0%, 100% { transform: translateY(0); opacity: 0.6; }
          50% { transform: translateY(-10px); opacity: 1; }
        }

        /* Animated checkerboard background - orange version */
        .checkerboard-orange {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(45deg, rgba(255,67,1,0.08) 25%, transparent 25%),
            linear-gradient(-45deg, rgba(255,67,1,0.08) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, rgba(255,67,1,0.08) 75%),
            linear-gradient(-45deg, transparent 75%, rgba(255,67,1,0.08) 75%);
          background-size: 40px 40px;
          background-position: 0 0, 0 20px, 20px -20px, -20px 0px;
          animation: checkerboardShift 20s linear infinite;
        }

        /* Animated checkerboard background - gray version */
        .checkerboard-gray {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(45deg, rgba(128,128,128,0.06) 25%, transparent 25%),
            linear-gradient(-45deg, rgba(128,128,128,0.06) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, rgba(128,128,128,0.06) 75%),
            linear-gradient(-45deg, transparent 75%, rgba(128,128,128,0.06) 75%);
          background-size: 40px 40px;
          background-position: 0 0, 0 20px, 20px -20px, -20px 0px;
          animation: checkerboardShift 25s linear infinite reverse;
        }

        @keyframes checkerboardShift {
          0% { background-position: 0 0, 0 20px, 20px -20px, -20px 0px; }
          100% { background-position: 40px 40px, 40px 60px, 60px 20px, 20px 40px; }
        }

        /* Glitchy mountain pattern */
        .mountain-pattern {
          position: absolute;
          inset: 0;
          overflow: hidden;
        }
        .mountain-pattern::before {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 200px;
          background:
            linear-gradient(135deg, transparent 40%, rgba(255,67,1,0.1) 40%, rgba(255,67,1,0.1) 45%, transparent 45%),
            linear-gradient(225deg, transparent 40%, rgba(255,67,1,0.08) 40%, rgba(255,67,1,0.08) 45%, transparent 45%),
            linear-gradient(135deg, transparent 55%, rgba(128,128,128,0.06) 55%, rgba(128,128,128,0.06) 60%, transparent 60%);
          background-size: 100px 100px, 80px 80px, 120px 120px;
          animation: mountainGlitch 4s ease-in-out infinite;
        }

        @keyframes mountainGlitch {
          0%, 100% { transform: translateX(0); opacity: 0.8; }
          10% { transform: translateX(-2px) skewX(-0.5deg); opacity: 0.9; }
          20% { transform: translateX(2px) skewX(0.5deg); opacity: 0.7; }
          30% { transform: translateX(0); opacity: 0.85; }
          50% { transform: translateX(1px); opacity: 0.9; }
          70% { transform: translateX(-1px) skewX(-0.3deg); opacity: 0.75; }
          90% { transform: translateX(0); opacity: 0.85; }
        }

        /* Distribution graph pattern - animated bars */
        .distribution-bars {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 150px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          gap: 4px;
          opacity: 0.15;
          pointer-events: none;
        }
        .distribution-bars .bar {
          width: 8px;
          background: linear-gradient(to top, rgba(255,67,1,0.8), rgba(255,107,53,0.4));
          border-radius: 4px 4px 0 0;
          animation: barPulse 2s ease-in-out infinite;
        }
        .distribution-bars .bar:nth-child(odd) {
          background: linear-gradient(to top, rgba(128,128,128,0.6), rgba(128,128,128,0.2));
        }
        @keyframes barPulse {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.1); }
        }

        /* Hero slide styles (kept for compatibility) */
        .hero-slide {
          opacity: 0;
          animation: heroSlideFadeIn 0.5s ease-out forwards;
        }
        @keyframes heroSlideFadeIn {
          to { opacity: 1; }
        }

        .hero-slide-wobble {
          transform: rotate(var(--rotation, 0deg));
        }

        .hero-slide-swap {
          position: relative;
        }
        .hero-slide-swap > * {
          animation: heroSlideSwapFade 0.6s ease-out;
        }
        @keyframes heroSlideSwapFade {
          0% { opacity: 0; transform: scale(0.97); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

export default Landing;
