import React, { useEffect, useState, useRef, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import BrandWordmark from '@/components/common/BrandWordmark';
import { cn } from '@/lib/utils';
import {
  ArrowRight, Check, Menu, X, Clock, Frown, DollarSign,
  Zap, Palette, Brain, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, Bot, Layers, Settings, Crown, Star
} from 'lucide-react';
import { showcaseService, ShowcaseDeck } from '@/services/showcaseService';
import { useAuth } from '@/context/SupabaseAuthContext';
import CommunityGallery from '@/components/community/CommunityGallery';
import CommunityBottomSheet from '@/components/community/CommunityBottomSheet';
import { useTypewriter } from '@/hooks/useTypewriter';

// Lazy load MiniSlide
const MiniSlide = lazy(() => import('@/components/deck/MiniSlide'));

const Landing: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSignedIn = !!user;
  const [scrollY, setScrollY] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Showcase state
  const [showcaseDecks, setShowcaseDecks] = useState<ShowcaseDeck[]>([]);
  const [isLoadingShowcase, setIsLoadingShowcase] = useState(true);
  const [activeShowcaseIndex, setActiveShowcaseIndex] = useState(0);
  const [activeDeckSlideIndex, setActiveDeckSlideIndex] = useState(0);
  const [userInteracted, setUserInteracted] = useState(false);
  const [showcaseFocused, setShowcaseFocused] = useState(false);
  const [showcaseInView, setShowcaseInView] = useState(false);
  const autoScrollRef = useRef<NodeJS.Timeout | null>(null);
  const showcaseRef = useRef<HTMLDivElement>(null);

  // Sticky CTA text
  const [ctaText, setCtaText] = useState('Get Started Free');

  // Community bottom sheet
  const [showCommunity, setShowCommunity] = useState(false);

  // Hero carousel state
  const [heroCarouselIndex, setHeroCarouselIndex] = useState(0);
  const heroCarouselRef = useRef<NodeJS.Timeout | null>(null);

  // Typewriter effect for hero input placeholder
  const typewriterText = useTypewriter({
    phrases: [
      'a pitch deck for my AI startup',
      'a quarterly business review',
      'a lecture on machine learning',
      'a wedding speech for my best friend',
      'a product launch presentation',
    ],
    typingSpeed: 50,
    deletingSpeed: 30,
    pauseDuration: 2500,
  });

  // Load showcase decks
  useEffect(() => {
    const loadShowcase = async () => {
      setIsLoadingShowcase(true);
      try {
        const decks = await showcaseService.getFeaturedDecks(8);
        setShowcaseDecks(decks);
      } catch (err) {
        console.error('Failed to load showcase:', err);
      } finally {
        setIsLoadingShowcase(false);
      }
    };
    loadShowcase();
  }, []);

  // Hero carousel auto-rotation
  useEffect(() => {
    if (showcaseDecks.length === 0) return;

    heroCarouselRef.current = setInterval(() => {
      setHeroCarouselIndex((prev) => (prev + 1) % Math.min(showcaseDecks.length, 6));
    }, 4000);

    return () => {
      if (heroCarouselRef.current) clearInterval(heroCarouselRef.current);
    };
  }, [showcaseDecks.length]);

  // Handle scroll events
  useEffect(() => {
    // On mount - ensure scrolling works on landing page
    document.documentElement.style.position = '';
    document.documentElement.style.overflow = '';
    document.body.style.position = '';
    document.body.style.overflow = '';

    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      // DON'T set fixed positioning on cleanup - this breaks scrolling on other pages
      // The app's shell manages its own scroll behavior
    };
  }, []);

  // Intersection observer for animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
          }
        });
      },
      { threshold: 0.1, rootMargin: '-50px' }
    );

    document.querySelectorAll('.animate-on-scroll').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Detect when showcase section comes into view
  useEffect(() => {
    if (!showcaseRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !showcaseInView) {
            setShowcaseInView(true);
          }
        });
      },
      { threshold: 0.3 }
    );

    observer.observe(showcaseRef.current);
    return () => observer.disconnect();
  }, [showcaseInView]);

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

  // Scroll-based CTA text updates
  useEffect(() => {
    const updateCTA = () => {
      const scroll = window.scrollY;
      const windowHeight = window.innerHeight;

      if (scroll < windowHeight * 0.5) {
        setCtaText('Get Started Free');
      } else if (scroll < windowHeight * 1.5) {
        setCtaText('Stop Wasting Time - Try Free');
      } else if (scroll < windowHeight * 2.5) {
        setCtaText('See the Difference - Start Free');
      } else {
        setCtaText('Join 10K+ Teams');
      }
    };

    window.addEventListener('scroll', updateCTA);
    return () => window.removeEventListener('scroll', updateCTA);
  }, []);

  const problems = [
    {
      icon: Clock,
      title: "Hours wasted on slides",
      description: "Your team spends 5-10 hours building every presentation from scratch. That's time not spent selling, closing, or shipping."
    },
    {
      icon: Frown,
      title: "Templates that don't work",
      description: "PowerPoint templates look amateur. Canva feels like homework. Nothing matches your brand or saves real time."
    },
    {
      icon: DollarSign,
      title: "Designer dependency",
      description: "You're either paying agencies thousands per deck, or settling for presentations that hurt your credibility."
    }
  ];

  const features = [
    {
      icon: Zap,
      tag: "SPEED",
      title: "90-second presentations",
      description: "Describe what you're presenting. AI generates your entire deck—slides, layouts, visuals—in 90 seconds."
    },
    {
      icon: Palette,
      title: "Professional design, automatically",
      tag: "DESIGN",
      description: "Every slide is perfectly balanced and on-brand. Our AI understands design principles—spacing, hierarchy, color theory."
    },
    {
      icon: Brain,
      tag: "INTELLIGENCE",
      title: "AI that understands context",
      description: "Not just template-filling. Our AI understands your industry, audience, and goals to create presentations that work."
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

  return (
    <div className="min-h-screen bg-[#FCFBF8] dark:bg-[#0a0a0a]">

      {/* Navigation */}
      <nav
        className={cn(
          "fixed top-0 w-full z-50 transition-all duration-300",
          scrollY > 20
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
      <section className="relative min-h-screen overflow-hidden bg-[#FCFBF8] dark:bg-[#0a0a0a]">
        {/* Top headline - bigger, 2 lines */}
        <div className="relative z-20 pt-24 sm:pt-28 pb-6 text-center animate-on-scroll opacity-0">
          <h1
            className="text-black dark:text-white"
            style={{
              fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
              fontWeight: 900,
              fontSize: 'clamp(32px, 5vw, 56px)',
              lineHeight: '1.1',
              letterSpacing: '-0.02em',
              textTransform: 'uppercase'
            }}
          >
            <span>Pitch ready</span>
            <span className="text-[#FF4301]"> & </span>
            <span>pitch perfect</span>
            <br />
            <span className="text-black/60 dark:text-white/60">in 90 seconds</span>
          </h1>
        </div>

        {/* Slide carousel mosaic - Figma-inspired layout */}
        <div className="relative w-full h-[calc(100vh-180px)] min-h-[500px] max-h-[700px]">
          {/* Gradient overlays for fade effect */}
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#FCFBF8] dark:from-[#0a0a0a] to-transparent z-10 pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#FCFBF8] dark:from-[#0a0a0a] to-transparent z-10 pointer-events-none" />
          <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-[#FCFBF8] dark:from-[#0a0a0a] to-transparent z-10 pointer-events-none" />
          <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-[#FCFBF8] dark:from-[#0a0a0a] to-transparent z-10 pointer-events-none" />

          {/* Carousel container */}
          <div className="absolute inset-0 flex items-center justify-center">
            {/* Slides arranged in a dynamic mosaic pattern */}
            <div className="relative w-full max-w-[1600px] h-full mx-auto px-4">
              {/* Loading state */}
              {isLoadingShowcase ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="grid grid-cols-3 gap-4 opacity-30">
                    {[...Array(6)].map((_, i) => (
                      <div
                        key={i}
                        className="w-[200px] sm:w-[280px] aspect-video bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse"
                        style={{
                          transform: `rotate(${(i % 2 === 0 ? -1 : 1) * (Math.random() * 3)}deg)`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                /* Slide positions - creating a Figma-like scattered effect with bigger slides */
                <>
                  {/* Far left - top */}
                  {showcaseDecks[0]?.slides?.[0] && (
                    <div
                      className={cn(
                        "absolute hidden xl:block transition-all duration-1000 ease-out",
                        heroCarouselIndex === 0 ? "opacity-100 scale-100" : "opacity-70 scale-95"
                      )}
                      style={{
                        left: '-8%',
                        top: '5%',
                        width: 'clamp(220px, 22vw, 340px)',
                        transform: 'rotate(-8deg)',
                      }}
                    >
                      <div className="aspect-video rounded-2xl overflow-hidden shadow-2xl shadow-black/30 ring-1 ring-black/10">
                        <Suspense fallback={<div className="w-full h-full bg-zinc-200 dark:bg-zinc-800" />}>
                          <MiniSlide slide={showcaseDecks[0].slides[0]} />
                        </Suspense>
                      </div>
                    </div>
                  )}

                  {/* Left side - middle */}
                  {showcaseDecks[1]?.slides?.[0] && (
                    <div
                      className={cn(
                        "absolute hidden lg:block transition-all duration-1000 ease-out",
                        heroCarouselIndex === 1 ? "opacity-100 scale-100" : "opacity-80 scale-95"
                      )}
                      style={{
                        left: '0%',
                        top: '28%',
                        width: 'clamp(260px, 26vw, 400px)',
                        transform: 'rotate(-4deg)',
                      }}
                    >
                      <div className="aspect-video rounded-2xl overflow-hidden shadow-2xl shadow-black/30 ring-1 ring-black/10">
                        <Suspense fallback={<div className="w-full h-full bg-zinc-200 dark:bg-zinc-800" />}>
                          <MiniSlide slide={showcaseDecks[1].slides[0]} />
                        </Suspense>
                      </div>
                    </div>
                  )}

                  {/* Left bottom */}
                  {showcaseDecks[2]?.slides?.[0] && (
                    <div
                      className={cn(
                        "absolute hidden md:block transition-all duration-1000 ease-out",
                        heroCarouselIndex === 2 ? "opacity-100 scale-100" : "opacity-60 scale-95"
                      )}
                      style={{
                        left: '-2%',
                        bottom: '2%',
                        width: 'clamp(200px, 20vw, 300px)',
                        transform: 'rotate(5deg)',
                      }}
                    >
                      <div className="aspect-video rounded-2xl overflow-hidden shadow-2xl shadow-black/25 ring-1 ring-black/10">
                        <Suspense fallback={<div className="w-full h-full bg-zinc-200 dark:bg-zinc-800" />}>
                          <MiniSlide slide={showcaseDecks[2].slides[0]} />
                        </Suspense>
                      </div>
                    </div>
                  )}

                  {/* Far right - top */}
                  {showcaseDecks[3]?.slides?.[0] && (
                    <div
                      className={cn(
                        "absolute hidden xl:block transition-all duration-1000 ease-out",
                        heroCarouselIndex === 3 ? "opacity-100 scale-100" : "opacity-70 scale-95"
                      )}
                      style={{
                        right: '-8%',
                        top: '3%',
                        width: 'clamp(220px, 22vw, 340px)',
                        transform: 'rotate(7deg)',
                      }}
                    >
                      <div className="aspect-video rounded-2xl overflow-hidden shadow-2xl shadow-black/30 ring-1 ring-black/10">
                        <Suspense fallback={<div className="w-full h-full bg-zinc-200 dark:bg-zinc-800" />}>
                          <MiniSlide slide={showcaseDecks[3].slides[0]} />
                        </Suspense>
                      </div>
                    </div>
                  )}

                  {/* Right side - middle */}
                  {showcaseDecks[4]?.slides?.[0] && (
                    <div
                      className={cn(
                        "absolute hidden lg:block transition-all duration-1000 ease-out",
                        heroCarouselIndex === 4 ? "opacity-100 scale-100" : "opacity-80 scale-95"
                      )}
                      style={{
                        right: '0%',
                        top: '25%',
                        width: 'clamp(260px, 26vw, 400px)',
                        transform: 'rotate(5deg)',
                      }}
                    >
                      <div className="aspect-video rounded-2xl overflow-hidden shadow-2xl shadow-black/30 ring-1 ring-black/10">
                        <Suspense fallback={<div className="w-full h-full bg-zinc-200 dark:bg-zinc-800" />}>
                          <MiniSlide slide={showcaseDecks[4].slides[0]} />
                        </Suspense>
                      </div>
                    </div>
                  )}

                  {/* Right bottom */}
                  {showcaseDecks[5]?.slides?.[0] && (
                    <div
                      className={cn(
                        "absolute hidden md:block transition-all duration-1000 ease-out",
                        heroCarouselIndex === 5 ? "opacity-100 scale-100" : "opacity-60 scale-95"
                      )}
                      style={{
                        right: '-2%',
                        bottom: '5%',
                        width: 'clamp(200px, 20vw, 300px)',
                        transform: 'rotate(-6deg)',
                      }}
                    >
                      <div className="aspect-video rounded-2xl overflow-hidden shadow-2xl shadow-black/25 ring-1 ring-black/10">
                        <Suspense fallback={<div className="w-full h-full bg-zinc-200 dark:bg-zinc-800" />}>
                          <MiniSlide slide={showcaseDecks[5].slides[0]} />
                        </Suspense>
                      </div>
                    </div>
                  )}

                  {/* Additional slides for more variety - using different slides from same decks */}
                  {showcaseDecks[0]?.slides?.[1] && (
                    <div
                      className={cn(
                        "absolute hidden lg:block transition-all duration-1000 ease-out",
                        heroCarouselIndex === 0 ? "opacity-90 scale-100" : "opacity-50 scale-95"
                      )}
                      style={{
                        left: '18%',
                        bottom: '8%',
                        width: 'clamp(180px, 18vw, 280px)',
                        transform: 'rotate(-2deg)',
                      }}
                    >
                      <div className="aspect-video rounded-2xl overflow-hidden shadow-2xl shadow-black/20 ring-1 ring-black/10">
                        <Suspense fallback={<div className="w-full h-full bg-zinc-200 dark:bg-zinc-800" />}>
                          <MiniSlide slide={showcaseDecks[0].slides[1]} />
                        </Suspense>
                      </div>
                    </div>
                  )}

                  {showcaseDecks[3]?.slides?.[1] && (
                    <div
                      className={cn(
                        "absolute hidden lg:block transition-all duration-1000 ease-out",
                        heroCarouselIndex === 3 ? "opacity-90 scale-100" : "opacity-50 scale-95"
                      )}
                      style={{
                        right: '20%',
                        bottom: '10%',
                        width: 'clamp(180px, 18vw, 280px)',
                        transform: 'rotate(3deg)',
                      }}
                    >
                      <div className="aspect-video rounded-2xl overflow-hidden shadow-2xl shadow-black/20 ring-1 ring-black/10">
                        <Suspense fallback={<div className="w-full h-full bg-zinc-200 dark:bg-zinc-800" />}>
                          <MiniSlide slide={showcaseDecks[3].slides[1]} />
                        </Suspense>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Centered floating input box - overlaid on slides */}
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            <div className="pointer-events-auto w-full max-w-2xl px-4 sm:px-8 animate-on-scroll opacity-0" style={{ transitionDelay: '200ms' }}>
              {/* The prompt card */}
              <div className="bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl shadow-2xl shadow-black/20 dark:shadow-black/50 border border-black/5 dark:border-white/10 p-6 sm:p-8">
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
                  <div className="flex items-center gap-4 text-sm text-black/40 dark:text-white/40">
                    <span className="hidden sm:inline">Type anything</span>
                    <span className="hidden sm:inline">•</span>
                    <span>AI-powered</span>
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

        {/* Subtle bottom tagline */}
        <div className="relative z-20 pb-8 text-center animate-on-scroll opacity-0" style={{ transitionDelay: '400ms' }}>
          <p className="text-sm sm:text-base text-black/50 dark:text-white/50 max-w-xl mx-auto px-4">
            The only AI presentation tool with a full editor and custom components.
          </p>
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
              <div className="rounded-2xl overflow-hidden bg-zinc-900/80 border border-white/10 w-full lg:w-auto lg:max-w-[900px]">
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
                        <Suspense fallback={<div className="w-full h-full bg-zinc-900 animate-pulse" />}>
                          <MiniSlide slide={activeSlide} />
                        </Suspense>
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
                            <div className="absolute inset-0 z-10" /> {/* Click capture layer */}
                            <Suspense fallback={<div className="w-full h-full bg-white/5" />}>
                              <MiniSlide slide={slide} />
                            </Suspense>
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
                        <div className="absolute inset-0 z-10 cursor-pointer" /> {/* Click capture layer */}
                        <div className="aspect-[16/9] relative">
                          {deck.slides?.[0] && (
                            <Suspense fallback={<div className="w-full h-full bg-white/5" />}>
                              <MiniSlide slide={deck.slides[0]} />
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
                          <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#FF4301]" />
                        )}
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
              Your presentation workflow is broken
            </h2>
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
              How we fix it
            </h2>
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
              { icon: Bot, title: 'Agentic AI Editor', description: 'Our AI edits with you—real-time suggestions, smart formatting, context-aware changes.' },
              { icon: Layers, title: 'Custom Components', description: 'Build anything. Interactive cards, animated diagrams, data viz. No template limits.' },
              { icon: Settings, title: 'Full Control', description: 'Every element is editable. Move, resize, restyle. Your presentation, your rules.' }
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
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div>
              <BrandWordmark tag="h3" sizePx={18} textColor="#ffffff" />
              <p className="text-sm mt-4">Professional presentations, built by AI.</p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4 text-sm" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4 text-sm" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Company</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4 text-sm" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 pt-8 text-center text-sm">
            <p>&copy; 2025 NextSlide</p>
          </div>
        </div>
      </footer>

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
      `}</style>
    </div>
  );
};

export default Landing;
