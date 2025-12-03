import React, { useEffect, useState, useRef, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import BrandWordmark from '@/components/common/BrandWordmark';
import { cn } from '@/lib/utils';
import {
  ArrowRight, Check, Menu, X, Play, Clock, Frown, DollarSign,
  Zap, Palette, Brain, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, Bot, Layers, Settings, Crown,
  Star, Building2, User, Sparkles
} from 'lucide-react';
import { showcaseService, ShowcaseDeck } from '@/services/showcaseService';

// Lazy load MiniSlide
const MiniSlide = lazy(() => import('@/components/deck/MiniSlide'));

const Landing: React.FC = () => {
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Showcase state
  const [showcaseDecks, setShowcaseDecks] = useState<ShowcaseDeck[]>([]);
  const [isLoadingShowcase, setIsLoadingShowcase] = useState(true);
  const [activeShowcaseIndex, setActiveShowcaseIndex] = useState(0);
  const [activeDeckSlideIndex, setActiveDeckSlideIndex] = useState(0);
  const [userInteracted, setUserInteracted] = useState(false);
  const autoScrollRef = useRef<NodeJS.Timeout | null>(null);

  // Sticky CTA text
  const [ctaText, setCtaText] = useState('Get Started Free');

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

  // Handle scroll events
  useEffect(() => {
    document.documentElement.style.position = '';
    document.documentElement.style.overflow = '';
    document.body.style.position = '';
    document.body.style.overflow = '';

    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.documentElement.style.position = 'fixed';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.overflow = 'hidden';
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

  // Auto-rotate showcase (only if user hasn't interacted)
  useEffect(() => {
    if (showcaseDecks.length === 0 || userInteracted) return;
    
    autoScrollRef.current = setInterval(() => {
      setActiveShowcaseIndex((prev) => (prev + 1) % showcaseDecks.length);
      setActiveDeckSlideIndex(0);
    }, 8000);
    
    return () => {
      if (autoScrollRef.current) clearInterval(autoScrollRef.current);
    };
  }, [showcaseDecks.length, userInteracted]);

  // Stop auto-scroll on user interaction
  const handleUserInteraction = () => {
    setUserInteracted(true);
    if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  };

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
      title: "30-second presentations",
      description: "Describe what you're presenting. AI generates your entire deck—slides, layouts, visuals—in 30 seconds."
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

  const competitors = [
    { name: 'NextSlide', isUs: true },
    { name: 'Gamma', isUs: false },
    { name: 'Canva', isUs: false },
    { name: 'Beautiful.ai', isUs: false },
  ];

  // Render star rating
  const renderStars = (rating: number, isUs: boolean = false) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      if (i <= Math.floor(rating)) {
        stars.push(
          <Star
            key={i}
            className={cn("w-4 h-4", isUs ? "fill-white text-white" : "fill-amber-400 text-amber-400")}
          />
        );
      } else if (i === Math.ceil(rating) && rating % 1 !== 0) {
        stars.push(
          <div key={i} className="relative w-4 h-4">
            <Star className={cn("w-4 h-4 absolute", isUs ? "text-white/30" : "text-amber-400/30")} />
            <div className="absolute overflow-hidden" style={{ width: `${(rating % 1) * 100}%` }}>
              <Star className={cn("w-4 h-4", isUs ? "fill-white text-white" : "fill-amber-400 text-amber-400")} />
            </div>
          </div>
        );
      } else {
        stars.push(
          <Star key={i} className={cn("w-4 h-4", isUs ? "text-white/30" : "text-black/20 dark:text-white/20")} />
        );
      }
    }
    return <div className="flex gap-0.5">{stars}</div>;
  };

  const comparisonFeatures = [
    {
      feature: 'Design Quality',
      isRating: true,
      nextslide: 5,
      gamma: 3,
      canva: 2.5,
      beautifulai: 3.5
    },
    {
      feature: 'AI Output',
      nextslide: 'Full presentations',
      gamma: 'Card-style only',
      canva: 'Thin content',
      beautifulai: 'Generic slides'
    },
    {
      feature: 'Target Audience',
      isAudience: true,
      nextslide: 'both',
      gamma: 'consumer',
      canva: 'consumer',
      beautifulai: 'consumer'
    },
    {
      feature: 'Custom Components',
      nextslide: true,
      gamma: false,
      canva: false,
      beautifulai: false
    },
    {
      feature: 'Agentic AI Editor',
      nextslide: true,
      gamma: false,
      canva: false,
      beautifulai: false
    },
    {
      feature: 'Full Design Control',
      nextslide: true,
      gamma: 'limited',
      canva: 'limited',
      beautifulai: 'locked'
    },
    {
      feature: 'PowerPoint Export',
      nextslide: 'Clean export',
      gamma: 'Broken layouts',
      canva: true,
      beautifulai: 'Format issues'
    },
    {
      feature: 'Enterprise Ready',
      nextslide: true,
      gamma: false,
      canva: 'limited',
      beautifulai: 'expensive'
    },
  ];

  const faqs = [
    {
      question: "How is this different from Gamma?",
      answer: "Gamma generates slides but locks you into their templates. NextSlide gives you a full editor with custom components, agentic AI that helps you edit, and complete design freedom."
    },
    {
      question: "Can I export to PowerPoint?",
      answer: "Yes. Every NextSlide presentation exports as a fully-editable PowerPoint file (.pptx). You can also export as PDF or share with a link."
    },
    {
      question: "What are custom components?",
      answer: "Custom components let you build any layout imaginable - interactive cards, animated diagrams, data visualizations, and more. It's like having a design engineer in your pocket."
    },
    {
      question: "Do I need design skills?",
      answer: "No. That's the entire point. NextSlide handles all design decisions—spacing, typography, color, hierarchy, layout. You focus on your message."
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
            <Button variant="ghost" onClick={() => navigate('/login')} className="text-sm">Sign In</Button>
            <Button onClick={() => navigate('/signup')} className="bg-[#FF4301] hover:bg-[#E63901] text-white text-sm font-semibold">
              Get Started
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>

          <button className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {isMenuOpen && (
          <div className="md:hidden bg-[#FCFBF8] dark:bg-[#0a0a0a] border-b border-black/10 dark:border-white/10">
            <div className="px-8 py-6 flex flex-col gap-4">
              <a href="#showcase" onClick={() => setIsMenuOpen(false)}>Examples</a>
              <a href="#compare" onClick={() => setIsMenuOpen(false)}>Compare</a>
              <a href="#pricing" onClick={() => setIsMenuOpen(false)}>Pricing</a>
              <Button variant="ghost" onClick={() => navigate('/login')}>Sign In</Button>
              <Button className="bg-[#FF4301] hover:bg-[#E63901] text-white" onClick={() => navigate('/signup')}>Get Started</Button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center px-8 pt-16">
        <div className="max-w-[1400px] mx-auto">
          <div className="text-center max-w-4xl mx-auto animate-on-scroll opacity-0">
            <h1
              className="text-black dark:text-white mb-6"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(48px, 6vw, 86px)',
                lineHeight: '1.05',
                letterSpacing: '-0.02em',
                textTransform: 'uppercase'
              }}
            >
              Professional presentations
              <br />
              in 30 seconds
            </h1>
            <p className="text-xl text-black/60 dark:text-white/60 mb-10 max-w-3xl mx-auto leading-relaxed">
              The only AI presentation tool with a full editor and custom components. Generate complete decks instantly, then customize everything.
            </p>

            <div className="flex flex-wrap gap-4 justify-center mb-8">
              <Button size="lg" onClick={() => navigate('/signup')} className="bg-[#FF4301] hover:bg-[#E63901] text-white px-10 py-6 text-base font-semibold">
                Create Full Deck Free
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button size="lg" variant="outline" className="px-10 py-6 text-base font-semibold border-2">
                <Play className="mr-2 w-5 h-5" />
                Watch Demo
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-black/50 dark:text-white/50">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#FF4301]" />
                <span>Free forever plan</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#FF4301]" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#FF4301]" />
                <span>Export to PowerPoint</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Showcase */}
      <section id="showcase" className="py-16 px-8 bg-gradient-to-b from-zinc-900 to-black">
        <div className="max-w-[1400px] mx-auto">
          <div className="text-center mb-10 animate-on-scroll opacity-0">
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
            <div className="grid lg:grid-cols-[1fr_260px] gap-4 items-start">
              {/* Main slide viewer with left sidebar */}
              <div className="rounded-2xl overflow-hidden bg-zinc-900/80 border border-white/10">
                {/* Top bar */}
                <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/50 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                      <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                      <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                    </div>
                    <span className="text-[11px] text-white/40 font-mono truncate max-w-[200px]">{activeDeck?.name || '...'}</span>
                  </div>
                  <span className="text-[11px] text-white/40">{activeDeckSlideIndex + 1}/{activeDeck?.slides?.length || 0}</span>
                </div>

                {/* Content with slide sidebar */}
                <div className="flex">
                  {/* Slide thumbnails sidebar - larger */}
                  <div className="w-[150px] flex-shrink-0 border-r border-white/5 bg-black/30 p-2 space-y-2 overflow-y-auto max-h-[340px] custom-scrollbar">
                    {activeDeck?.slides?.slice(0, 10).map((slide, idx) => (
                      <div
                        key={idx}
                        onClick={() => { handleUserInteraction(); setActiveDeckSlideIndex(idx); }}
                        className={cn(
                          "aspect-video rounded overflow-hidden cursor-pointer transition-all relative",
                          idx === activeDeckSlideIndex
                            ? "ring-2 ring-[#FF4301]"
                            : "opacity-50 hover:opacity-80"
                        )}
                      >
                        <Suspense fallback={<div className="w-full h-full bg-white/5" />}>
                          <MiniSlide slide={slide} responsive={true} />
                        </Suspense>
                        <div className="absolute inset-0 z-10" />
                      </div>
                    ))}
                  </div>

                  {/* Main slide */}
                  <div className="flex-1 p-4">
                    <div className="aspect-video relative rounded-lg overflow-hidden bg-black">
                      {isLoadingShowcase ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-10 h-10 border-4 border-[#FF4301]/30 border-t-[#FF4301] rounded-full animate-spin" />
                        </div>
                      ) : activeSlide ? (
                        <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center"><div className="w-10 h-10 border-4 border-[#FF4301]/30 border-t-[#FF4301] rounded-full animate-spin" /></div>}>
                          <MiniSlide slide={activeSlide} responsive={true} />
                        </Suspense>
                      ) : null}

                      {/* Nav arrows */}
                      {activeDeck && activeDeck.slides.length > 1 && (
                        <>
                          <button
                            onClick={() => { handleUserInteraction(); setActiveDeckSlideIndex(prev => Math.max(0, prev - 1)); }}
                            disabled={activeDeckSlideIndex === 0}
                            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white disabled:opacity-20 transition-all"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { handleUserInteraction(); setActiveDeckSlideIndex(prev => Math.min(activeDeck.slides.length - 1, prev + 1)); }}
                            disabled={activeDeckSlideIndex === activeDeck.slides.length - 1}
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white disabled:opacity-20 transition-all"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Deck gallery */}
              <div className="rounded-2xl overflow-hidden bg-zinc-900/50 border border-white/10">
                <div className="px-3 py-2 border-b border-white/5">
                  <h4 className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Explore Examples</h4>
                </div>
                <div className="p-2 space-y-2 overflow-y-auto max-h-[340px] custom-scrollbar">
                  {isLoadingShowcase ? (
                    [...Array(3)].map((_, i) => (
                      <div key={i} className="h-20 bg-white/5 rounded-lg animate-pulse" />
                    ))
                  ) : showcaseDecks.map((deck, index) => (
                    <div
                      key={deck.uuid}
                      onClick={() => { handleUserInteraction(); setActiveShowcaseIndex(index); setActiveDeckSlideIndex(0); }}
                      className={cn(
                        "rounded-lg overflow-hidden cursor-pointer transition-all relative",
                        index === activeShowcaseIndex
                          ? "ring-2 ring-[#FF4301]"
                          : "ring-1 ring-white/5 hover:ring-white/20"
                      )}
                    >
                      <div className="aspect-[16/9] relative overflow-hidden bg-black">
                        <Suspense fallback={<div className="w-full h-full bg-white/5" />}>
                          {deck.slides[0] && <MiniSlide slide={deck.slides[0]} responsive={true} />}
                        </Suspense>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-2">
                          <h5 className={cn(
                            "font-semibold text-xs truncate",
                            index === activeShowcaseIndex ? "text-[#FF4301]" : "text-white"
                          )}>
                            {deck.name}
                          </h5>
                          <p className="text-[10px] text-white/50">{deck.slideCount} slides</p>
                        </div>
                        {index === activeShowcaseIndex && (
                          <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#FF4301]" />
                        )}
                      </div>
                      <div className="absolute inset-0 z-10" />
                    </div>
                  ))}
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

      {/* Competitive Matrix */}
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
              Not another AI slideshow maker
            </h2>
            <p className="text-xl text-black/60 dark:text-white/60 max-w-2xl mx-auto">
              Others generate slides. We give you a complete design system with AI that actually helps you edit.
            </p>
          </div>

          {/* Matrix */}
          <div className="animate-on-scroll opacity-0 rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden bg-white dark:bg-zinc-900/80 shadow-xl">
            {/* Header */}
            <div className="grid grid-cols-5 bg-zinc-50 dark:bg-zinc-800/50">
              <div className="p-5 text-xs font-bold text-black/40 dark:text-white/40 uppercase tracking-wider" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                Features
              </div>
              {competitors.map((comp, i) => (
                <div
                  key={i}
                  className={cn(
                    "p-5 text-center text-sm font-bold",
                    comp.isUs
                      ? "bg-[#FF4301] text-white"
                      : "text-black/70 dark:text-white/70"
                  )}
                  style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
                >
                  {comp.name}
                </div>
              ))}
            </div>

            {/* Rows */}
            {comparisonFeatures.map((row, idx) => {
              // Helper to render cell value
              const renderCell = (value: any, isUs: boolean = false, isRating: boolean = false, isAudience: boolean = false) => {
                // Rating row
                if (isRating && typeof value === 'number') {
                  return renderStars(value, isUs);
                }
                // Audience row
                if (isAudience) {
                  if (value === 'both') {
                    return (
                      <div className="flex items-center gap-1.5">
                        <div className={cn("flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold", isUs ? "bg-white text-[#FF4301]" : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400")}>
                          <Building2 className="w-3 h-3" />
                          <span>B2B</span>
                        </div>
                        <div className={cn("flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold", isUs ? "bg-white text-[#FF4301]" : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400")}>
                          <User className="w-3 h-3" />
                          <span>B2C</span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-[10px] font-bold">
                      <User className="w-3 h-3" />
                      <span>Consumer only</span>
                    </div>
                  );
                }
                // Boolean true
                if (value === true) {
                  if (isUs) {
                    return (
                      <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center">
                        <Check className="w-4 h-4 text-[#FF4301]" />
                      </div>
                    );
                  }
                  return <Check className="w-5 h-5 text-green-500" />;
                }
                // Boolean false
                if (value === false) {
                  return <X className="w-5 h-5 text-black/20 dark:text-white/20" />;
                }
                // String values - check if positive or negative
                if (typeof value === 'string') {
                  const negativeKeywords = ['limited', 'basic', 'locked', 'broken', 'issues', 'expensive', 'card-style', 'thin', 'generic'];
                  const positiveKeywords = ['full', 'clean', 'both'];
                  const isNegative = negativeKeywords.some(kw => value.toLowerCase().includes(kw));
                  const isPositive = positiveKeywords.some(kw => value.toLowerCase().includes(kw));

                  if (isUs) {
                    return (
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-white" />
                        <span className="text-[11px] font-bold text-white uppercase">{value}</span>
                      </div>
                    );
                  }

                  if (isNegative) {
                    return (
                      <span className="text-[10px] font-medium text-red-600 dark:text-red-400 uppercase bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded">
                        {value}
                      </span>
                    );
                  }
                  if (isPositive) {
                    return (
                      <span className="text-[10px] font-medium text-green-600 dark:text-green-400 uppercase bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded">
                        {value}
                      </span>
                    );
                  }
                  return (
                    <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 uppercase bg-amber-100 dark:bg-amber-900/30 px-2 py-1 rounded">
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
                    "grid grid-cols-5 transition-colors",
                    idx % 2 === 0 ? "bg-white dark:bg-zinc-900/50" : "bg-zinc-50/50 dark:bg-zinc-800/30",
                    idx !== comparisonFeatures.length - 1 && "border-b border-black/5 dark:border-white/5",
                    "hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
                  )}
                >
                  <div className="p-4 text-sm font-medium text-black dark:text-white flex items-center">
                    {row.feature}
                  </div>
                  <div className={cn("p-4 flex items-center justify-center", "bg-[#FF4301]/10")}>
                    {renderCell(row.nextslide, true, row.isRating, row.isAudience)}
                  </div>
                  <div className="p-4 flex items-center justify-center">
                    {renderCell(row.gamma, false, row.isRating, row.isAudience)}
                  </div>
                  <div className="p-4 flex items-center justify-center">
                    {renderCell(row.canva, false, row.isRating, row.isAudience)}
                  </div>
                  <div className="p-4 flex items-center justify-center">
                    {renderCell(row.beautifulai, false, row.isRating, row.isAudience)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Differentiators */}
          <div className="mt-12 grid md:grid-cols-3 gap-6">
            {[
              { icon: Bot, title: 'Agentic AI Editor', description: 'Our AI doesn\'t just generate—it edits with you. Real-time suggestions, smart formatting, context-aware changes.' },
              { icon: Layers, title: 'Custom Components', description: 'Build anything: interactive cards, animated diagrams, data visualizations. Not locked into templates.' },
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
                <div className="text-sm text-black/50 dark:text-white/50">10 credits/month</div>
              </div>
              <ul className="space-y-2 mb-6 text-sm">
                {['~2 presentations', 'All AI features', 'Export to PDF'].map((feature, i) => (
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
                <div className="text-sm text-black/50 dark:text-white/50">200 credits/month</div>
              </div>
              <ul className="space-y-2 mb-6 text-sm">
                {['~30-40 presentations', 'All AI features', 'Export to PPTX', 'Email support'].map((feature, i) => (
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
                <div className="text-sm opacity-90">500 credits/month</div>
              </div>
              <ul className="space-y-2 mb-6 text-sm">
                {['~75-100 presentations', 'Priority AI', 'Custom branding', 'Pay-as-you-go overage'].map((feature, i) => (
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
                {['Everything in Pro', 'Unlimited usage', 'SSO & SAML', 'Dedicated support'].map((feature, i) => (
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

          {/* See all plans link */}
          <div className="text-center mt-8">
            <Button variant="link" className="text-[#FF4301]" onClick={() => navigate('/pricing')}>
              See all plans & credit details →
            </Button>
          </div>
        </div>
      </section>

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
            Try NextSlide free
          </h2>
          <p className="text-xl opacity-90 mb-10 max-w-2xl mx-auto">
            No commitments. No credit card. Start creating professional presentations in 30 seconds.
          </p>
          <Button
            size="lg"
            className="bg-white text-[#FF4301] hover:bg-zinc-100 px-12 py-7 text-lg font-bold shadow-xl"
            onClick={() => navigate('/signup')}
          >
            Start Creating for Free
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
