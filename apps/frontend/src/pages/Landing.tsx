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
import { communityService, CommunityDeck } from '@/services/communityService';
import { useAuth } from '@/context/SupabaseAuthContext';
import CommunityGallery from '@/components/community/CommunityGallery';
import CommunityBottomSheet from '@/components/community/CommunityBottomSheet';
import { useTypewriter } from '@/hooks/useTypewriter';
import LegalModal from '@/components/legal/LegalModal';
import { BROWSER } from '@/utils/browser';

// Lazy load MiniSlide
const MiniSlide = lazy(() => import('@/components/deck/MiniSlide'));

const Landing: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSignedIn = !!user;
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Showcase state
  const [showcaseDecks, setShowcaseDecks] = useState<ShowcaseDeck[]>([]);
  const [communityDecks, setCommunityDecks] = useState<CommunityDeck[]>([]);
  const [isLoadingShowcase, setIsLoadingShowcase] = useState(true);
  const [activeShowcaseIndex, setActiveShowcaseIndex] = useState(0);
  const [activeDeckSlideIndex, setActiveDeckSlideIndex] = useState(0);
  const [userInteracted, setUserInteracted] = useState(false);
  const [showcaseFocused, setShowcaseFocused] = useState(false);
  const [showcaseInView, setShowcaseInView] = useState(false);
  const [heroInView, setHeroInView] = useState(true);
  const [scribbleAnimated, setScribbleAnimated] = useState(false);
  const autoScrollRef = useRef<NodeJS.Timeout | null>(null);
  const showcaseRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);


  // Community bottom sheet
  const [showCommunity, setShowCommunity] = useState(false);

  // Legal modal
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [legalDocType, setLegalDocType] = useState<'privacy' | 'terms'>('privacy');

  const openLegalModal = (type: 'privacy' | 'terms') => {
    setLegalDocType(type);
    setLegalModalOpen(true);
  };

  // Hero slide positions - each tracks which deck/slide to show
  // source: 'showcase' uses showcaseDecks with slideIdx, 'community' uses communityDecks firstSlide
  const [heroSlides, setHeroSlides] = useState<Array<{ source: 'showcase' | 'community'; deckIdx: number; slideIdx: number }>>(() =>
    Array.from({ length: 15 }, (_, i) => ({
      source: 'showcase' as const,
      deckIdx: i % 8,
      slideIdx: (i % 6) + 1
    }))
  );

  // Wait for fonts to load before animating scribble
  useEffect(() => {
    // Use document.fonts.ready to wait for all fonts
    document.fonts.ready.then(() => {
      setFontsLoaded(true);
    });
    // Fallback timeout
    const timeout = setTimeout(() => setFontsLoaded(true), 1000);
    return () => clearTimeout(timeout);
  }, []);

  // Trigger scribble underline animation after fonts are loaded
  useEffect(() => {
    if (!fontsLoaded) return;
    const timer = setTimeout(() => {
      setScribbleAnimated(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [fontsLoaded]);

  // Helper to generate unique random slides from community (first slide) + showcase (random slides)
  const generateUniqueSlides = (count: number) => {
    const slides: Array<{ source: 'showcase' | 'community'; deckIdx: number; slideIdx: number }> = [];
    const usedKeys = new Set<string>();

    // Build pool from community first slides + showcase random slides
    const pool: Array<{ source: 'showcase' | 'community'; deckIdx: number; slideIdx: number }> = [];

    // Add community first slides
    communityDecks.forEach((_, deckIdx) => {
      pool.push({ source: 'community', deckIdx, slideIdx: 0 });
    });

    // Add showcase slides (random slides from each deck for variety)
    showcaseDecks.forEach((deck, deckIdx) => {
      const slideCount = deck.slides?.length || 0;
      for (let slideIdx = 0; slideIdx < slideCount; slideIdx++) {
        pool.push({ source: 'showcase', deckIdx, slideIdx });
      }
    });

    // Shuffle the pool
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    // Pick unique slides
    for (const slide of pool) {
      if (slides.length >= count) break;
      const key = `${slide.source}-${slide.deckIdx}-${slide.slideIdx}`;
      if (!usedKeys.has(key)) {
        usedKeys.add(key);
        slides.push(slide);
      }
    }

    // Fill remaining by cycling through available decks
    while (slides.length < count) {
      if (communityDecks.length > 0) {
        const deckIdx = slides.length % communityDecks.length;
        slides.push({ source: 'community', deckIdx, slideIdx: 0 });
      } else if (showcaseDecks.length > 0) {
        const deckIdx = slides.length % showcaseDecks.length;
        slides.push({ source: 'showcase', deckIdx, slideIdx: 0 });
      } else {
        break;
      }
    }

    return slides;
  };

  // Initialize hero slides with unique random positions once decks load
  useEffect(() => {
    if (communityDecks.length === 0 && showcaseDecks.length === 0) return;

    setHeroSlides(generateUniqueSlides(15));
  }, [communityDecks.length > 0, showcaseDecks.length > 0]);

  // Randomly swap hero slides every few seconds (avoiding duplicates) - only when hero is visible
  useEffect(() => {
    if (communityDecks.length === 0 && showcaseDecks.length === 0) return;
    if (!heroInView) return; // Don't run when hero is scrolled past

    const swapInterval = setInterval(() => {
      setHeroSlides(prev => {
        const newSlides = [...prev];
        const usedKeys = new Set(prev.map(s => `${s.source}-${s.deckIdx}-${s.slideIdx}`));

        // Pick 1-2 random positions to swap
        const numToSwap = Math.random() > 0.5 ? 2 : 1;
        for (let i = 0; i < numToSwap; i++) {
          const posIdx = Math.floor(Math.random() * 15);

          // Try to find a unique slide from community or showcase
          let attempts = 0;
          while (attempts < 20) {
            let newSlide;
            // 50/50 chance between community (first slide) and showcase (random slide)
            const useCommunity = communityDecks.length > 0 && (showcaseDecks.length === 0 || Math.random() > 0.5);

            if (useCommunity) {
              const deckIdx = Math.floor(Math.random() * communityDecks.length);
              newSlide = { source: 'community' as const, deckIdx, slideIdx: 0 };
            } else if (showcaseDecks.length > 0) {
              const deckIdx = Math.floor(Math.random() * showcaseDecks.length);
              const deck = showcaseDecks[deckIdx];
              const slideIdx = Math.floor(Math.random() * (deck?.slides?.length || 1));
              newSlide = { source: 'showcase' as const, deckIdx, slideIdx };
            }

            if (newSlide) {
              const key = `${newSlide.source}-${newSlide.deckIdx}-${newSlide.slideIdx}`;
              if (!usedKeys.has(key)) {
                usedKeys.add(key);
                usedKeys.delete(`${newSlides[posIdx].source}-${newSlides[posIdx].deckIdx}-${newSlides[posIdx].slideIdx}`);
                newSlides[posIdx] = newSlide;
                break;
              }
            }
            attempts++;
          }
        }
        return newSlides;
      });
    }, 4000);

    return () => clearInterval(swapInterval);
  }, [communityDecks.length, showcaseDecks.length, heroInView]);

  // Typewriter effect for hero input placeholder - paused when hero not visible
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
    paused: !heroInView,
  });

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

  // Detect when showcase section comes into/out of view
  useEffect(() => {
    if (!showcaseRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setShowcaseInView(entry.isIntersecting);
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(showcaseRef.current);
    return () => observer.disconnect();
  }, []);

  // Track hero section visibility - unmount slides when scrolled past
  useEffect(() => {
    if (!heroRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setHeroInView(entry.isIntersecting);
        });
      },
      { threshold: 0, rootMargin: '100px' }
    );

    observer.observe(heroRef.current);
    return () => observer.disconnect();
  }, []);

  // Auto-rotate showcase (only after section is in view and user hasn't interacted)
  useEffect(() => {
    if (showcaseDecks.length === 0 || userInteracted || !showcaseInView) return;

    autoScrollRef.current = setInterval(() => {
      setActiveShowcaseIndex((prev) => (prev + 1) % showcaseDecks.length);
      setActiveDeckSlideIndex(0);
    }, 8000);

    return () => {
      if (autoScrollRef.current) clearInterval(autoScrollRef.current);
    };
  }, [showcaseDecks.length, userInteracted, showcaseInView]);

  // Stop auto-scroll on user interaction
  const handleUserInteraction = () => {
    setUserInteracted(true);
    if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  };

  // Keyboard navigation for showcase section
  useEffect(() => {
    if (!showcaseFocused || isLoadingShowcase || showcaseDecks.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const currentDeck = showcaseDecks[activeShowcaseIndex];
      if (!currentDeck) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          handleUserInteraction();
          setActiveDeckSlideIndex(prev => Math.max(0, prev - 1));
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleUserInteraction();
          setActiveDeckSlideIndex(prev => Math.min(currentDeck.slideCount - 1, prev + 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          handleUserInteraction();
          setActiveShowcaseIndex(prev => {
            const newIndex = Math.max(0, prev - 1);
            if (newIndex !== prev) setActiveDeckSlideIndex(0);
            return newIndex;
          });
          break;
        case 'ArrowDown':
          e.preventDefault();
          handleUserInteraction();
          setActiveShowcaseIndex(prev => {
            const newIndex = Math.min(showcaseDecks.length - 1, prev + 1);
            if (newIndex !== prev) setActiveDeckSlideIndex(0);
            return newIndex;
          });
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showcaseFocused, isLoadingShowcase, showcaseDecks, activeShowcaseIndex]);


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

  const activeDeck = showcaseDecks[activeShowcaseIndex];
  const activeSlide = activeDeck?.slides?.[activeDeckSlideIndex];

  // Helper to get slide data for a hero position
  const getHeroSlide = (pos: { source: 'showcase' | 'community'; deckIdx: number; slideIdx: number }) => {
    if (pos.source === 'community') {
      return communityDecks[pos.deckIdx]?.firstSlide;
    }
    return showcaseDecks[pos.deckIdx]?.slides?.[pos.slideIdx];
  };

  return (
    <div className="min-h-screen bg-[#FCFBF8] dark:bg-[#0a0a0a]">

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
            <a href="#showcase" className="text-sm font-medium text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors">Examples</a>
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
              <a href="#showcase" onClick={() => setIsMenuOpen(false)} className="py-2 touch-manipulation">Examples</a>
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

      {/* Hero - Figma-style with slide carousel */}
      <section ref={heroRef} className="relative min-h-screen overflow-hidden bg-[#FCFBF8] dark:bg-[#0a0a0a]">
        {/* Top headline - Apple-like, premium */}
        <div className="relative z-30 pt-20 sm:pt-24 pb-2 text-center">
          <h1
            className="text-black dark:text-white"
            style={{
              fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
              fontWeight: 900,
              fontSize: 'clamp(28px, 5vw, 56px)',
              lineHeight: '1.1',
              letterSpacing: '-0.02em',
              textTransform: 'uppercase'
            }}
          >
            <span className="relative inline-block">
              The
              {/* Animated calligraphy scribble underline */}
              <svg
                className="absolute left-0 -bottom-1 w-full overflow-visible"
                viewBox="0 0 100 12"
                preserveAspectRatio="none"
                style={{ height: 'clamp(8px, 1.2vw, 14px)' }}
              >
                <path
                  d="M2 6 Q 15 2, 25 7 Q 35 12, 50 5 Q 65 -2, 75 6 Q 85 12, 98 5"
                  fill="none"
                  stroke="#FF4301"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    strokeDasharray: 150,
                    strokeDashoffset: scribbleAnimated ? 0 : 150,
                    transition: 'stroke-dashoffset 0.8s cubic-bezier(0.65, 0, 0.35, 1)',
                  }}
                />
                {/* Second subtle stroke for thickness variation */}
                <path
                  d="M5 7 Q 20 3, 30 8 Q 45 11, 55 4 Q 70 -1, 80 7 Q 90 11, 95 6"
                  fill="none"
                  stroke="#FF4301"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.5"
                  style={{
                    strokeDasharray: 150,
                    strokeDashoffset: scribbleAnimated ? 0 : 150,
                    transition: 'stroke-dashoffset 1s cubic-bezier(0.65, 0, 0.35, 1) 0.15s',
                  }}
                />
              </svg>
            </span>{' '}
            presentation platform
          </h1>
          <p className="mt-3 text-base sm:text-xl text-black/50 dark:text-white/50 max-w-2xl mx-auto px-4">
            Beautiful decks for every idea. Sales. Teaching. Internal.
          </p>
          <p className="mt-1 text-base sm:text-xl text-black/50 dark:text-white/50 max-w-2xl mx-auto px-4">
            Perfected in seconds.
          </p>
        </div>

        {/* Slide carousel mosaic - scattered U-shape */}
        <div className="relative w-full h-[calc(100vh-200px)] min-h-[500px]">
          {/* Very subtle edge gradients */}
          <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-[#FCFBF8] dark:from-[#0a0a0a] to-transparent z-20 pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#FCFBF8] dark:from-[#0a0a0a] to-transparent z-20 pointer-events-none" />

          {/* Slides layer - scattered around the input - unmount when scrolled past */}
          <div className="absolute inset-0 z-10 overflow-hidden">
            <div className="relative w-full h-full">
              {/* Show skeleton placeholders while loading */}
              {isLoadingShowcase && (
                <>
                  {/* Skeleton slides - simplified positions */}
                  {[
                    { left: '-3%', top: '5%', rotation: '-10deg', width: 'clamp(280px, 22vw, 380px)', delay: '0s' },
                    { left: '8%', top: '28%', rotation: '5deg', width: 'clamp(240px, 18vw, 320px)', delay: '0.05s' },
                    { right: '-3%', top: '5%', rotation: '10deg', width: 'clamp(280px, 22vw, 380px)', delay: '0.1s' },
                    { right: '8%', top: '28%', rotation: '-5deg', width: 'clamp(240px, 18vw, 320px)', delay: '0.15s' },
                    { left: '3%', bottom: '5%', rotation: '-8deg', width: 'clamp(300px, 24vw, 400px)', delay: '0.2s' },
                    { right: '3%', bottom: '5%', rotation: '8deg', width: 'clamp(300px, 24vw, 400px)', delay: '0.25s' },
                  ].map((pos, i) => (
                    <div
                      key={i}
                      className="hero-slide absolute hidden md:block"
                      style={{
                        width: pos.width,
                        left: pos.left,
                        right: pos.right,
                        top: pos.top,
                        bottom: pos.bottom,
                        animationDelay: pos.delay,
                      } as React.CSSProperties}
                    >
                      <div
                        className="aspect-video rounded-2xl overflow-hidden bg-black/5 dark:bg-white/5 animate-pulse ring-1 ring-black/10"
                        style={{ transform: `rotate(${pos.rotation})` }}
                      />
                    </div>
                  ))}
                </>
              )}
              {!isLoadingShowcase && (showcaseDecks.length > 0 || communityDecks.length > 0) && (
                <>
                  {/* ====== LEFT SIDE ====== */}

                  {/* L1 - Top left corner */}
                  <div
                    className="hero-slide absolute hidden lg:block"
                    style={{
                      width: 'clamp(300px, 24vw, 400px)',
                      left: '-5%',
                      top: '2%',
                      animationDelay: '0.1s'
                    }}
                  >
                    <div
                      className="hero-slide-wobble hero-slide-swap aspect-video rounded-md overflow-hidden shadow-xl ring-1 ring-black/5"
                      style={{ '--rotation': '-8deg', '--wobble-amount': '1.5deg' } as React.CSSProperties}
                    >
                      {getHeroSlide(heroSlides[0]) && (
                        <Suspense key={`hs0-${heroSlides[0]?.source}-${heroSlides[0]?.deckIdx}-${heroSlides[0]?.slideIdx}`} fallback={<div className="w-full h-full bg-zinc-100 dark:bg-zinc-800" />}>
                          <MiniSlide slide={getHeroSlide(heroSlides[0])!} />
                        </Suspense>
                      )}
                    </div>
                  </div>

                  {/* L2 - Mid left */}
                  <div
                    className="hero-slide absolute hidden md:block"
                    style={{
                      width: 'clamp(260px, 20vw, 340px)',
                      left: '5%',
                      top: '38%',
                      animationDelay: '0.2s'
                    }}
                  >
                    <div className="hero-slide-wobble hero-slide-swap aspect-video rounded-md overflow-hidden shadow-xl ring-1 ring-black/5" style={{ '--rotation': '4deg', '--wobble-amount': '1deg' } as React.CSSProperties}>
                      {getHeroSlide(heroSlides[1]) && (
                        <Suspense key={`hs1-${heroSlides[1]?.source}-${heroSlides[1]?.deckIdx}-${heroSlides[1]?.slideIdx}`} fallback={<div className="w-full h-full bg-zinc-100 dark:bg-zinc-800" />}>
                          <MiniSlide slide={getHeroSlide(heroSlides[1])!} />
                        </Suspense>
                      )}
                    </div>
                  </div>

                  {/* L3 - Lower left - BIGGER, leans RIGHT (into corner) */}
                  <div
                    className="hero-slide absolute hidden lg:block z-20"
                    style={{
                      width: 'clamp(360px, 30vw, 480px)',
                      left: '-4%',
                      bottom: '-2%',
                      animationDelay: '0.3s'
                    }}
                  >
                    <div className="hero-slide-wobble hero-slide-swap aspect-video rounded-md overflow-hidden shadow-2xl ring-1 ring-black/10" style={{ '--rotation': '5deg', '--wobble-amount': '1deg' } as React.CSSProperties}>
                      {getHeroSlide(heroSlides[2]) && (
                        <Suspense key={`hs2-${heroSlides[2]?.source}-${heroSlides[2]?.deckIdx}-${heroSlides[2]?.slideIdx}`} fallback={<div className="w-full h-full bg-zinc-100 dark:bg-zinc-800" />}>
                          <MiniSlide slide={getHeroSlide(heroSlides[2])!} />
                        </Suspense>
                      )}
                    </div>
                  </div>

                  {/* ====== BOTTOM ====== */}

                  {/* B1 - Bottom left of center - leans LEFT */}
                  <div
                    className="hero-slide absolute hidden lg:block"
                    style={{
                      width: 'clamp(280px, 22vw, 380px)',
                      left: '22%',
                      bottom: '-5%',
                      animationDelay: '0.5s'
                    }}
                  >
                    <div className="hero-slide-wobble hero-slide-swap aspect-video rounded-md overflow-hidden shadow-xl ring-1 ring-black/5" style={{ '--rotation': '-6deg', '--wobble-amount': '1deg' } as React.CSSProperties}>
                      {getHeroSlide(heroSlides[4]) && (
                        <Suspense key={`hs4-${heroSlides[4]?.source}-${heroSlides[4]?.deckIdx}-${heroSlides[4]?.slideIdx}`} fallback={<div className="w-full h-full bg-zinc-100 dark:bg-zinc-800" />}>
                          <MiniSlide slide={getHeroSlide(heroSlides[4])!} />
                        </Suspense>
                      )}
                    </div>
                  </div>

                  {/* B2 - Bottom center */}
                  <div
                    className="hero-slide absolute hidden xl:block"
                    style={{
                      width: 'clamp(300px, 24vw, 400px)',
                      left: '50%',
                      bottom: '-6%',
                      transform: 'translateX(-50%)',
                      animationDelay: '0.6s'
                    }}
                  >
                    <div className="hero-slide-wobble hero-slide-swap aspect-video rounded-md overflow-hidden shadow-xl ring-1 ring-black/5" style={{ '--rotation': '2deg', '--wobble-amount': '1deg' } as React.CSSProperties}>
                      {getHeroSlide(heroSlides[5]) && (
                        <Suspense key={`hs5-${heroSlides[5]?.source}-${heroSlides[5]?.deckIdx}-${heroSlides[5]?.slideIdx}`} fallback={<div className="w-full h-full bg-zinc-100 dark:bg-zinc-800" />}>
                          <MiniSlide slide={getHeroSlide(heroSlides[5])!} />
                        </Suspense>
                      )}
                    </div>
                  </div>

                  {/* B3 - Bottom right of center - leans RIGHT */}
                  <div
                    className="hero-slide absolute hidden lg:block"
                    style={{
                      width: 'clamp(280px, 22vw, 380px)',
                      right: '22%',
                      bottom: '-5%',
                      animationDelay: '0.55s'
                    }}
                  >
                    <div className="hero-slide-wobble hero-slide-swap aspect-video rounded-md overflow-hidden shadow-xl ring-1 ring-black/5" style={{ '--rotation': '6deg', '--wobble-amount': '1deg' } as React.CSSProperties}>
                      {getHeroSlide(heroSlides[6]) && (
                        <Suspense key={`hs6-${heroSlides[6]?.source}-${heroSlides[6]?.deckIdx}-${heroSlides[6]?.slideIdx}`} fallback={<div className="w-full h-full bg-zinc-100 dark:bg-zinc-800" />}>
                          <MiniSlide slide={getHeroSlide(heroSlides[6])!} />
                        </Suspense>
                      )}
                    </div>
                  </div>

                  {/* ====== RIGHT SIDE ====== */}

                  {/* R1 - Top right corner */}
                  <div
                    className="hero-slide absolute hidden lg:block"
                    style={{
                      width: 'clamp(300px, 24vw, 400px)',
                      right: '-5%',
                      top: '2%',
                      animationDelay: '0.15s'
                    }}
                  >
                    <div className="hero-slide-wobble hero-slide-swap aspect-video rounded-md overflow-hidden shadow-xl ring-1 ring-black/5" style={{ '--rotation': '8deg', '--wobble-amount': '1.5deg' } as React.CSSProperties}>
                      {getHeroSlide(heroSlides[7]) && (
                        <Suspense key={`hs7-${heroSlides[7]?.source}-${heroSlides[7]?.deckIdx}-${heroSlides[7]?.slideIdx}`} fallback={<div className="w-full h-full bg-zinc-100 dark:bg-zinc-800" />}>
                          <MiniSlide slide={getHeroSlide(heroSlides[7])!} />
                        </Suspense>
                      )}
                    </div>
                  </div>

                  {/* R2 - Mid right */}
                  <div
                    className="hero-slide absolute hidden md:block"
                    style={{
                      width: 'clamp(260px, 20vw, 340px)',
                      right: '5%',
                      top: '38%',
                      animationDelay: '0.25s'
                    }}
                  >
                    <div className="hero-slide-wobble hero-slide-swap aspect-video rounded-md overflow-hidden shadow-xl ring-1 ring-black/5" style={{ '--rotation': '-4deg', '--wobble-amount': '1deg' } as React.CSSProperties}>
                      {getHeroSlide(heroSlides[8]) && (
                        <Suspense key={`hs8-${heroSlides[8]?.source}-${heroSlides[8]?.deckIdx}-${heroSlides[8]?.slideIdx}`} fallback={<div className="w-full h-full bg-zinc-100 dark:bg-zinc-800" />}>
                          <MiniSlide slide={getHeroSlide(heroSlides[8])!} />
                        </Suspense>
                      )}
                    </div>
                  </div>

                  {/* R3 - Lower right - BIGGER, leans LEFT (into corner) */}
                  <div
                    className="hero-slide absolute hidden lg:block z-20"
                    style={{
                      width: 'clamp(360px, 30vw, 480px)',
                      right: '-4%',
                      bottom: '-2%',
                      animationDelay: '0.35s'
                    }}
                  >
                    <div className="hero-slide-wobble hero-slide-swap aspect-video rounded-md overflow-hidden shadow-2xl ring-1 ring-black/10" style={{ '--rotation': '-5deg', '--wobble-amount': '1deg' } as React.CSSProperties}>
                      {getHeroSlide(heroSlides[9]) && (
                        <Suspense key={`hs9-${heroSlides[9]?.source}-${heroSlides[9]?.deckIdx}-${heroSlides[9]?.slideIdx}`} fallback={<div className="w-full h-full bg-zinc-100 dark:bg-zinc-800" />}>
                          <MiniSlide slide={getHeroSlide(heroSlides[9])!} />
                        </Suspense>
                      )}
                    </div>
                  </div>

                  {/* ====== EXTRA FILLS ====== */}

                  {/* Extra - far left edge */}
                  <div
                    className="hero-slide absolute hidden xl:block"
                    style={{
                      width: 'clamp(220px, 16vw, 300px)',
                      left: '-8%',
                      top: '18%',
                      animationDelay: '0.2s'
                    }}
                  >
                    <div className="hero-slide-wobble hero-slide-swap aspect-video rounded-md overflow-hidden shadow-xl ring-1 ring-black/5" style={{ '--rotation': '-14deg', '--wobble-amount': '1deg' } as React.CSSProperties}>
                      {getHeroSlide(heroSlides[11]) && (
                        <Suspense key={`hs11-${heroSlides[11]?.source}-${heroSlides[11]?.deckIdx}-${heroSlides[11]?.slideIdx}`} fallback={<div className="w-full h-full bg-zinc-100 dark:bg-zinc-800" />}>
                          <MiniSlide slide={getHeroSlide(heroSlides[11])!} />
                        </Suspense>
                      )}
                    </div>
                  </div>

                  {/* Extra - far right edge */}
                  <div
                    className="hero-slide absolute hidden xl:block"
                    style={{
                      width: 'clamp(220px, 16vw, 300px)',
                      right: '-8%',
                      top: '18%',
                      animationDelay: '0.22s'
                    }}
                  >
                    <div className="hero-slide-wobble hero-slide-swap aspect-video rounded-md overflow-hidden shadow-xl ring-1 ring-black/5" style={{ '--rotation': '14deg', '--wobble-amount': '1deg' } as React.CSSProperties}>
                      {getHeroSlide(heroSlides[12]) && (
                        <Suspense key={`hs12-${heroSlides[12]?.source}-${heroSlides[12]?.deckIdx}-${heroSlides[12]?.slideIdx}`} fallback={<div className="w-full h-full bg-zinc-100 dark:bg-zinc-800" />}>
                          <MiniSlide slide={getHeroSlide(heroSlides[12])!} />
                        </Suspense>
                      )}
                    </div>
                  </div>

                  {/* Extra - left bottom edge */}
                  <div
                    className="hero-slide absolute hidden xl:block"
                    style={{
                      width: 'clamp(240px, 18vw, 320px)',
                      left: '-7%',
                      bottom: '22%',
                      animationDelay: '0.38s'
                    }}
                  >
                    <div className="hero-slide-wobble hero-slide-swap aspect-video rounded-md overflow-hidden shadow-xl ring-1 ring-black/5" style={{ '--rotation': '-12deg', '--wobble-amount': '1deg' } as React.CSSProperties}>
                      {getHeroSlide(heroSlides[13]) && (
                        <Suspense key={`hs13-${heroSlides[13]?.source}-${heroSlides[13]?.deckIdx}-${heroSlides[13]?.slideIdx}`} fallback={<div className="w-full h-full bg-zinc-100 dark:bg-zinc-800" />}>
                          <MiniSlide slide={getHeroSlide(heroSlides[13])!} />
                        </Suspense>
                      )}
                    </div>
                  </div>

                  {/* Extra - right bottom edge */}
                  <div
                    className="hero-slide absolute hidden xl:block"
                    style={{
                      width: 'clamp(240px, 18vw, 320px)',
                      right: '-7%',
                      bottom: '22%',
                      animationDelay: '0.4s'
                    }}
                  >
                    <div className="hero-slide-wobble hero-slide-swap aspect-video rounded-md overflow-hidden shadow-xl ring-1 ring-black/5" style={{ '--rotation': '12deg', '--wobble-amount': '1deg' } as React.CSSProperties}>
                      {getHeroSlide(heroSlides[14]) && (
                        <Suspense key={`hs14-${heroSlides[14]?.source}-${heroSlides[14]?.deckIdx}-${heroSlides[14]?.slideIdx}`} fallback={<div className="w-full h-full bg-zinc-100 dark:bg-zinc-800" />}>
                          <MiniSlide slide={getHeroSlide(heroSlides[14])!} />
                        </Suspense>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Centered floating input box - z-30, sits above everything */}
          <div className="absolute inset-0 flex items-start justify-center z-30 pointer-events-none pt-[10%] sm:pt-[8%]">
            <div className="pointer-events-auto w-full max-w-2xl px-4 sm:px-8 hero-input-box">
              {/* The prompt card */}
              <div className="bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl shadow-lg shadow-black/10 dark:shadow-black/50 border border-black/5 dark:border-white/10 p-6 sm:p-8">
                {/* Input with typewriter effect */}
                <div className="relative mb-6">
                  <div className="text-lg sm:text-2xl md:text-3xl font-medium text-black dark:text-white leading-relaxed">
                    <span className="text-black/40 dark:text-white/40">Create </span>
                    <span className="text-black dark:text-white">{typewriterText}</span>
                    <span className="inline-block w-0.5 h-[1em] bg-[#FF4301] ml-1 animate-pulse align-middle" />
                  </div>
                </div>

                {/* Action button */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-xs sm:text-sm text-black/40 dark:text-white/40">
                    <span>Any topic, any style</span>
                  </div>
                  <Button
                    size="lg"
                    onClick={() => navigate(isSignedIn ? '/app' : '/signup')}
                    className="bg-[#FF4301] hover:bg-[#E63901] text-white px-6 sm:px-8 py-3 text-sm sm:text-base font-semibold rounded-xl shadow-lg shadow-orange-500/25 transition-all hover:scale-105 active:scale-95"
                  >
                    Get started
                    <ArrowRight className="ml-2 w-4 h-4 sm:w-5 sm:h-5" />
                  </Button>
                </div>
              </div>

              {/* Trust badges below the card */}
              <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mt-6 text-xs sm:text-sm text-black/50 dark:text-white/50">
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-[#FF4301]" />
                  <span>Free forever</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-[#FF4301]" />
                  <span>No credit card</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-[#FF4301]" />
                  <span>Full editor access</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why NextSlide - Feature Grid */}
      <section className="py-20 px-8 bg-white dark:bg-zinc-950">
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
                className="group p-4 rounded-2xl bg-[#FCFBF8] dark:bg-zinc-900 border border-black/5 dark:border-white/5 hover:border-[#FF4301]/30 hover:bg-[#FF4301]/5 transition-all duration-200"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#FF4301]/10 flex items-center justify-center flex-shrink-0 group-hover:bg-[#FF4301]/20 transition-colors">
                    <feature.icon className="w-5 h-5 text-[#FF4301]" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-black dark:text-white truncate" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                      {feature.label}
                    </div>
                    <div className="text-xs text-black/50 dark:text-white/50 truncate">
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

      {/* Live Showcase */}
      <section id="showcase" className="py-12 px-4 sm:px-8 bg-gradient-to-b from-zinc-900 to-black">
        <div
          ref={showcaseRef}
          tabIndex={0}
          className="max-w-[1400px] mx-auto outline-none"
          onFocus={() => setShowcaseFocused(true)}
          onBlur={() => setShowcaseFocused(false)}
        >
          <div className="text-center mb-6 sm:mb-10 animate-on-scroll opacity-0">
            <h2
              className="text-white mb-3"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(36px, 4.5vw, 52px)',
                lineHeight: '1.1',
                letterSpacing: '-0.02em',
                textTransform: 'uppercase'
              }}
            >
              See it in action
            </h2>
            <p className="text-xl text-white/60">Real presentations built with NextSlide</p>
          </div>

          <div className="animate-on-scroll opacity-0">
            <div className="flex flex-col lg:flex-row gap-4 items-start justify-center">
              {/* Main slide viewer */}
              <div className="rounded-2xl overflow-hidden bg-zinc-900/80 border border-white/10 w-full lg:w-[750px] lg:flex-shrink-0">
                {/* Top bar */}
                <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/50 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                      <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                      <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                    </div>
                    <span className="text-[11px] text-white/40 font-mono truncate max-w-[200px] sm:max-w-[400px]">
                      {activeDeck?.name || 'Loading...'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Keyboard hints */}
                    <div className={cn(
                      "hidden sm:flex items-center gap-2 text-[10px] text-white/30 transition-opacity duration-200",
                      showcaseFocused ? "opacity-100" : "opacity-0"
                    )}>
                      <kbd className="px-1 py-0.5 bg-white/10 rounded">←</kbd>
                      <kbd className="px-1 py-0.5 bg-white/10 rounded">→</kbd>
                      <span>slides</span>
                    </div>
                    <span className="text-[11px] text-white/40">
                      {activeDeck ? `${activeDeckSlideIndex + 1}/${activeDeck.slideCount}` : ''}
                    </span>
                  </div>
                </div>

                {/* Content with slide thumbnails underneath - fixed height container */}
                <div className="flex flex-col h-[420px] sm:h-[520px] lg:h-[560px]">
                  {/* Main slide */}
                  <div className="flex-1 p-3 md:p-6 flex items-center justify-center min-h-0">
                    <div
                      className="aspect-video w-full max-h-full relative rounded-lg overflow-hidden bg-black group"
                      onClick={() => {
                        handleUserInteraction();
                        showcaseRef.current?.focus();
                      }}
                    >
                      {isLoadingShowcase ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
                          <div className="text-white/40 text-xl font-medium mb-2">Loading...</div>
                        </div>
                      ) : activeSlide ? (
                        <div className="relative z-10 w-full h-full">
                          <Suspense fallback={<div className="w-full h-full bg-zinc-900 animate-pulse" />}>
                            <MiniSlide slide={activeSlide} interactive />
                          </Suspense>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
                          <div className="text-white/40 text-xl font-medium mb-2">No slides available</div>
                        </div>
                      )}

                      {/* Navigation buttons - show on hover */}
                      {!isLoadingShowcase && activeDeck && activeDeck.slideCount > 1 && (
                        <div className="absolute inset-0 flex items-center justify-between px-3 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUserInteraction();
                              setActiveDeckSlideIndex(prev => Math.max(0, prev - 1));
                              showcaseRef.current?.focus();
                            }}
                            disabled={activeDeckSlideIndex === 0}
                            className={cn(
                              "pointer-events-auto w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white transition-all",
                              activeDeckSlideIndex === 0
                                ? "opacity-30 cursor-not-allowed"
                                : "hover:bg-black/80 hover:scale-110"
                            )}
                          >
                            <ChevronLeft size={24} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUserInteraction();
                              setActiveDeckSlideIndex(prev => Math.min(activeDeck.slideCount - 1, prev + 1));
                              showcaseRef.current?.focus();
                            }}
                            disabled={activeDeckSlideIndex === activeDeck.slideCount - 1}
                            className={cn(
                              "pointer-events-auto w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white transition-all",
                              activeDeckSlideIndex === activeDeck.slideCount - 1
                                ? "opacity-30 cursor-not-allowed"
                                : "hover:bg-black/80 hover:scale-110"
                            )}
                          >
                            <ChevronRight size={24} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Slide thumbnails - horizontal strip at bottom */}
                  <div className="flex-shrink-0 border-t border-white/5 bg-black/30 p-2 overflow-x-auto custom-scrollbar">
                    <div className="flex gap-2">
                      {isLoadingShowcase ? (
                        [...Array(5)].map((_, idx) => (
                          <div key={idx} className="w-[100px] sm:w-[120px] aspect-video rounded overflow-hidden relative bg-white/5 animate-pulse flex-shrink-0" />
                        ))
                      ) : (
                        activeDeck?.slides?.map((slide, idx) => (
                          <div
                            key={idx}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUserInteraction();
                              setActiveDeckSlideIndex(idx);
                              showcaseRef.current?.focus();
                            }}
                            className={cn(
                              "w-[100px] sm:w-[120px] aspect-video rounded overflow-hidden relative cursor-pointer transition-all flex-shrink-0",
                              idx === activeDeckSlideIndex
                                ? "ring-2 ring-[#FF4301]"
                                : "opacity-50 hover:opacity-100 hover:ring-1 hover:ring-white/30"
                            )}
                          >
                            <Suspense fallback={<div className="w-full h-full bg-white/5" />}>
                              <MiniSlide slide={slide} renderMode={BROWSER.isMobile ? 'background' : 'full'} />
                            </Suspense>
                            <div className="absolute inset-0 z-20" /> {/* Click capture layer - on top */}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Deck gallery - match height with main viewer */}
              <div className="rounded-2xl overflow-hidden bg-zinc-900/50 border border-white/10 flex flex-col h-auto lg:h-[600px] w-full lg:w-[240px] lg:flex-shrink-0">
                <div className="px-3 py-2 border-b border-white/5 flex-shrink-0">
                  <h4 className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Explore Examples</h4>
                </div>
                <div className="p-2 flex gap-2 overflow-x-auto lg:overflow-y-auto lg:flex-col lg:gap-2 flex-1 custom-scrollbar">
                  {isLoadingShowcase ? (
                    [...Array(6)].map((_, index) => (
                      <div key={index} className="rounded-lg relative ring-1 ring-white/5 min-w-[160px] lg:min-w-0 flex-shrink-0">
                        <div className="aspect-[16/9] relative bg-white/5 animate-pulse rounded-lg" />
                      </div>
                    ))
                  ) : (
                    showcaseDecks.map((deck, index) => (
                      <div
                        key={deck.uuid}
                        onClick={() => { handleUserInteraction(); setActiveShowcaseIndex(index); setActiveDeckSlideIndex(0); showcaseRef.current?.focus(); }}
                        className={cn(
                          "rounded-lg relative cursor-pointer transition-all min-w-[160px] lg:min-w-0 flex-shrink-0 overflow-hidden",
                          index === activeShowcaseIndex
                            ? "ring-2 ring-[#FF4301]"
                            : "ring-1 ring-white/5 hover:ring-white/20"
                        )}
                      >
                        <div className="aspect-[16/9] relative">
                          {deck.slides?.[0] && (
                            <Suspense fallback={<div className="w-full h-full bg-white/5" />}>
                              <MiniSlide slide={deck.slides[0]} renderMode={BROWSER.isMobile ? 'background' : 'full'} />
                            </Suspense>
                          )}
                          {/* Gradient overlay with text */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                          <div className="absolute bottom-0 left-0 right-0 p-2">
                            <div className={cn(
                              "text-[10px] font-medium truncate leading-tight",
                              index === activeShowcaseIndex ? "text-[#FF4301]" : "text-white/90"
                            )}>
                              {deck.name}
                            </div>
                            <div className="text-[9px] text-white/50">
                              {deck.slideCount} slides
                            </div>
                          </div>
                        </div>
                        {index === activeShowcaseIndex && (
                          <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#FF4301] z-10" />
                        )}
                        <div className="absolute inset-0 z-20" /> {/* Click capture layer - on top */}
                      </div>
                    ))
                  )}
                </div>
                {/* CTA */}
                <div className="p-2 border-t border-white/5 flex-shrink-0">
                  <Button
                    className="w-full bg-[#FF4301] hover:bg-[#E63901] text-white text-xs font-semibold h-9"
                    onClick={() => navigate('/signup')}
                  >
                    Create Your Own
                    <ArrowRight className="ml-1.5 w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-24 px-8 bg-[#FCFBF8] dark:bg-[#0a0a0a]">
        <div className="max-w-[1200px] mx-auto">
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
              The old way is over
            </h2>
            <p className="text-lg text-black/50 dark:text-white/50 max-w-xl mx-auto">
              Presentations haven't evolved in 20 years. Until now.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {problems.map((problem, index) => {
              const Icon = problem.icon;
              return (
                <div key={index} className="animate-on-scroll opacity-0 text-center" style={{ transitionDelay: `${index * 100}ms` }}>
                  <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-6">
                    <Icon className="w-8 h-8 text-red-500" />
                  </div>
                  <h3 className="text-xl font-bold text-black dark:text-white mb-3" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                    {problem.title}
                  </h3>
                  <p className="text-black/60 dark:text-white/60 leading-relaxed">
                    {problem.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-8 bg-white dark:bg-black/30">
        <div className="max-w-[1200px] mx-auto">
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
              The NextSlide difference
            </h2>
            <p className="text-lg text-black/50 dark:text-white/50 max-w-xl mx-auto">
              Not another template tool. A complete presentation studio.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div key={index} className="animate-on-scroll opacity-0 p-8 rounded-2xl bg-[#FCFBF8] dark:bg-[#0a0a0a] border border-black/10 dark:border-white/10">
                  <div className="text-xs font-bold text-[#FF4301] mb-4 uppercase tracking-wider">{feature.tag}</div>
                  <div className="w-14 h-14 rounded-2xl bg-[#FF4301]/10 flex items-center justify-center mb-6">
                    <Icon className="w-7 h-7 text-[#FF4301]" />
                  </div>
                  <h3 className="text-xl font-bold text-black dark:text-white mb-3" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                    {feature.title}
                  </h3>
                  <p className="text-black/60 dark:text-white/60 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

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
      <section className="py-24 px-8 bg-white dark:bg-black/30">
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
      <section id="pricing" className="py-24 px-8 bg-[#FCFBF8] dark:bg-[#0a0a0a]">
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
          <p className="text-center text-sm text-black/40 dark:text-white/40 mt-6">
            Each slide uses ~5 credits
          </p>

          {/* See all plans link */}
          <div className="text-center mt-4">
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
      <section className="py-32 px-8 bg-[#FF4301] text-white">
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

      {/* Animations */}
      <style>{`
        html, body {
          overflow-x: hidden;
        }
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

        /* Hero slide fade-in */
        .hero-slide {
          opacity: 0;
          animation: heroSlideFadeIn 0.5s ease-out forwards;
        }
        @keyframes heroSlideFadeIn {
          to { opacity: 1; }
        }

        /* Hero slides - static rotation, no wobble for performance */
        .hero-slide-wobble {
          transform: rotate(var(--rotation, 0deg));
        }

        /* Content swap fade - smooth crossfade using child animation */
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

        /* Hero input box animation */
        @keyframes heroInputSlideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .hero-input-box {
          opacity: 0;
          animation: heroInputSlideUp 0.7s ease-out 0.3s forwards;
        }
      `}</style>
    </div>
  );
};

export default Landing;
