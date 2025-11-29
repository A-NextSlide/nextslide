import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import BrandWordmark from '@/components/common/BrandWordmark';
import { cn } from '@/lib/utils';
import {
  ArrowRight, Check, Menu, X, Play, Star, Clock, Frown, DollarSign,
  Zap, Palette, Brain, ChevronDown, ChevronUp, Sparkles, TrendingUp,
  Layout, Type, Image as ImageIcon, BarChart, Shuffle, Twitter, Linkedin,
  ChevronLeft, ChevronRight, Calculator, DollarSign as Dollar
} from 'lucide-react';
import HeroInteractiveDemo from '@/components/landing/HeroInteractiveDemo';
import LogoMarquee from '@/components/landing/LogoMarquee';

const Landing: React.FC = () => {
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);



  // Before/After slider
  const [sliderPosition, setSliderPosition] = useState(50);
  const sliderRef = useRef<HTMLDivElement>(null);

  // ROI Calculator
  const [hourlyRate, setHourlyRate] = useState(50);
  const [hoursPerDeck, setHoursPerDeck] = useState(8);
  const [decksPerMonth, setDecksPerMonth] = useState(4);

  // Deck preview navigation
  const [currentSlide, setCurrentSlide] = useState(0);

  // Bento grid hover states
  const [hoveredDemo, setHoveredDemo] = useState<number | null>(null);

  // Multi-audience tabs
  const [activeAudience, setActiveAudience] = useState('education');

  // Exit intent modal
  const [showExitIntent, setShowExitIntent] = useState(false);
  const [hasShownExitIntent, setHasShownExitIntent] = useState(false);

  // Sticky CTA text
  const [ctaText, setCtaText] = useState('Get Started Free');

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



  // Before/After slider drag logic
  const handleSliderDrag = (e: React.MouseEvent | React.TouchEvent) => {
    if (!sliderRef.current) return;

    const rect = sliderRef.current.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const position = ((x - rect.left) / rect.width) * 100;

    setSliderPosition(Math.max(0, Math.min(100, position)));
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

  // Exit-intent detection
  useEffect(() => {
    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && !hasShownExitIntent) {
        setShowExitIntent(true);
        setHasShownExitIntent(true);
      }
    };

    document.addEventListener('mouseleave', handleMouseLeave);
    return () => document.removeEventListener('mouseleave', handleMouseLeave);
  }, [hasShownExitIntent]);

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
      description: "Describe what you're presenting. AI generates your entire deck—slides, layouts, visuals—in 30 seconds. What used to take hours now happens instantly.",
      bullets: [
        "Complete decks in under a minute",
        "No templates to fight with",
        "Automatic layout optimization",
        "Smart content distribution"
      ]
    },
    {
      icon: Palette,
      title: "Professional design, automatically",
      tag: "DESIGN",
      description: "Every slide is perfectly balanced and on-brand. Our AI understands design principles—spacing, hierarchy, color theory—so every presentation looks like it came from an agency.",
      bullets: [
        "Pixel-perfect layouts every time",
        "Automatic brand consistency",
        "Professional typography",
        "Smart visual hierarchy"
      ]
    },
    {
      icon: Brain,
      tag: "INTELLIGENCE",
      title: "AI that understands context",
      description: "Not just template-filling. Our AI understands your industry, audience, and goals to create presentations that actually work for your specific use case.",
      bullets: [
        "Industry-specific content",
        "Audience-aware messaging",
        "Goal-oriented structure",
        "Adaptive recommendations"
      ]
    }
  ];

  const useCases = [
    {
      role: "Sales Teams",
      problem: "You're losing deals because your pitch decks look generic and take forever to customize per prospect.",
      solution: "Build adaptive pitch decks in minutes. Update data in real-time during calls. Close 38% more deals with presentations that actually match each prospect."
    },
    {
      role: "Founders",
      problem: "Investor decks are make-or-break, but you're not a designer and agencies cost $10K+.",
      solution: "Get investor-ready pitch decks from day one. Professional quality without the agency cost. Portfolio companies have raised $50M+ using NextSlide decks."
    },
    {
      role: "Marketers",
      problem: "Campaign decks, stakeholder updates, and quarterly reviews eat up your entire week.",
      solution: "Ship presentations 5x faster without sacrificing quality. More time for strategy, less time fighting with slides."
    }
  ];

  const comparison = [
    { feature: "AI-generated content", nextslide: true, powerpoint: false, canva: false },
    { feature: "Smart layout optimization", nextslide: true, powerpoint: false, canva: false },
    { feature: "30-second deck creation", nextslide: true, powerpoint: false, canva: false },
    { feature: "Professional design quality", nextslide: true, powerpoint: "partial", canva: "partial" },
    { feature: "Export to PowerPoint", nextslide: true, powerpoint: true, canva: false },
    { feature: "Real-time collaboration", nextslide: true, powerpoint: "limited", canva: true },
    { feature: "Brand consistency", nextslide: true, powerpoint: false, canva: "manual" }
  ];

  const faqs = [
    {
      question: "How is this different from ChatGPT making slides?",
      answer: "ChatGPT can generate text, but it can't design professional layouts, balance visual hierarchy, or create production-ready presentations. NextSlide's AI is purpose-built for presentations—it understands design principles, slide structure, and visual storytelling. You get finished decks, not just text you have to format yourself."
    },
    {
      question: "Can I export to PowerPoint?",
      answer: "Yes. Every NextSlide presentation exports as a fully-editable PowerPoint file (.pptx). You can also export as PDF or share with a link. Your presentations work everywhere."
    },
    {
      question: "What if I need to make changes?",
      answer: "Everything is editable. Use our intuitive editor to adjust text, images, layouts, colors—anything. The AI gives you a professional starting point, then you refine exactly what you need."
    },
    {
      question: "How accurate is the AI?",
      answer: "Very. Our AI is trained specifically on presentation design and business communication. It understands context, audience, and goals. Every deck is reviewed by our quality systems before delivery. If something's not quite right, you can regenerate individual slides or edit directly."
    },
    {
      question: "Do I need design skills?",
      answer: "No. That's the entire point. NextSlide handles all design decisions—spacing, typography, color, hierarchy, layout. You focus on your message, we handle making it look professional."
    }
  ];

  // Bento Grid Interactive Demos
  const bentoItems = [
    {
      icon: Sparkles,
      title: "AI Content",
      description: "Watch AI write your slides",
      demo: "Hover to see magic",
      size: "large"
    },
    {
      icon: Layout,
      title: "Smart Layouts",
      description: "Auto-arrange content perfectly",
      demo: "Click to shuffle",
      size: "medium"
    },
    {
      icon: Palette,
      title: "Theme Engine",
      description: "One-click theme switching",
      demo: "Hover to change theme",
      size: "medium"
    },
    {
      icon: ImageIcon,
      title: "Visual Search",
      description: "AI finds perfect images",
      demo: "See suggestions",
      size: "small"
    },
    {
      icon: Type,
      title: "Typography",
      description: "Beautiful fonts, automatically",
      demo: "Watch fonts adapt",
      size: "small"
    },
    {
      icon: BarChart,
      title: "Data Viz",
      description: "Charts from raw data",
      demo: "See chart appear",
      size: "medium"
    }
  ];

  // Social Proof - Real testimonials
  const testimonials = [
    {
      platform: "twitter",
      author: "Sarah Chen",
      handle: "@sarahchen",
      role: "VP Sales @ TechCorp",
      avatar: "SC",
      content: "NextSlide cut our pitch deck creation time from 2 days to 20 minutes. Our close rate went up 38% because we can now customize every deck for each prospect.",
      verified: true
    },
    {
      platform: "linkedin",
      author: "Marcus Rivera",
      handle: "Marcus Rivera",
      role: "Founder @ StartupX",
      avatar: "MR",
      content: "Raised our Series A with a NextSlide deck. Investors were impressed by how professional it looked. Best $19 I've ever spent.",
      verified: true
    },
    {
      platform: "twitter",
      author: "Emily Park",
      handle: "@emilypark",
      role: "Marketing Director",
      avatar: "EP",
      content: "Our team was spending 15+ hours/week on presentation decks. NextSlide freed up that time for actual strategy work. Game changer.",
      verified: true
    }
  ];

  // Deck of the Day showcase
  const showcaseDecks = [
    {
      title: "Q4 Sales Strategy",
      company: "Acme Corp",
      industry: "SaaS",
      slides: 12,
      time: "18 seconds",
      thumbnail: "sales"
    },
    {
      title: "Series A Pitch Deck",
      company: "StartupCo",
      industry: "FinTech",
      slides: 15,
      time: "22 seconds",
      thumbnail: "investor"
    },
    {
      title: "Product Launch",
      company: "TechFlow",
      industry: "B2B",
      slides: 10,
      time: "14 seconds",
      thumbnail: "product"
    }
  ];

  // Preview deck slides
  const previewSlides = [
    { title: "Introduction", content: "Welcome to NextSlide" },
    { title: "The Problem", content: "Presentations take too long" },
    { title: "Our Solution", content: "AI-powered slide generation" },
    { title: "How It Works", content: "Describe, generate, customize" },
    { title: "Results", content: "10x faster, 100% professional" }
  ];

  // Calculate ROI
  const monthlyCost = hourlyRate * hoursPerDeck * decksPerMonth;
  const yearlyCost = monthlyCost * 12;
  const nextSlideCost = 19 * 12; // Annual cost
  const savings = yearlyCost - nextSlideCost;

  // Multi-audience use cases
  const audiences = [
    {
      id: 'education',
      label: 'Education',
      tagline: 'Transform how you teach',
      useCases: [
        {
          title: 'Lecture Slides',
          description: 'Complete course material in minutes. AI generates structured content with visuals, examples, and learning objectives.',
          gradient: 'from-blue-500 to-indigo-600'
        },
        {
          title: 'Student Projects',
          description: 'Students create professional presentations for assignments, research papers, and group projects—no design skills needed.',
          gradient: 'from-cyan-500 to-blue-600'
        },
        {
          title: 'Training Materials',
          description: 'Onboarding guides, workshop content, and certification courses. Consistent branding, professional quality.',
          gradient: 'from-indigo-500 to-purple-600'
        }
      ]
    },
    {
      id: 'business',
      label: 'Business',
      tagline: 'Professional decks, zero design time',
      useCases: [
        {
          title: 'Quarterly Reviews',
          description: 'Board presentations, stakeholder updates, and OKR reviews. Data visualization, executive summaries, action plans.',
          gradient: 'from-orange-500 to-red-600'
        },
        {
          title: 'Client Proposals',
          description: 'Win more business with tailored proposals. Customize for each client in minutes, not days.',
          gradient: 'from-red-500 to-pink-600'
        },
        {
          title: 'Internal Communications',
          description: 'All-hands meetings, policy updates, team announcements. Keep everyone aligned with clear, visual communication.',
          gradient: 'from-pink-500 to-rose-600'
        }
      ]
    },
    {
      id: 'sales',
      label: 'Sales',
      tagline: 'Close deals faster',
      useCases: [
        {
          title: 'Pitch Decks',
          description: 'Adaptive sales decks customized per prospect. Update data, messaging, and case studies in real-time during calls.',
          gradient: 'from-green-500 to-emerald-600'
        },
        {
          title: 'Product Demos',
          description: 'Showcase features, benefits, and ROI with stunning visuals. Non-technical team members create demo decks instantly.',
          gradient: 'from-emerald-500 to-teal-600'
        },
        {
          title: 'Case Studies',
          description: 'Turn customer success into sales collateral. Before/after comparisons, metrics, testimonials—all beautifully designed.',
          gradient: 'from-teal-500 to-cyan-600'
        }
      ]
    },
    {
      id: 'founders',
      label: 'Founders',
      tagline: 'Investor-ready in 30 seconds',
      useCases: [
        {
          title: 'Investor Pitches',
          description: 'Raise capital with pitch decks that look like you hired an agency. Problem, solution, market, traction—perfectly structured.',
          gradient: 'from-purple-500 to-violet-600'
        },
        {
          title: 'Product Launches',
          description: 'Announce new features, products, or company milestones. Press-ready presentations that build excitement.',
          gradient: 'from-violet-500 to-purple-600'
        },
        {
          title: 'Team Updates',
          description: 'Keep your startup aligned. Sprint planning, roadmap reviews, culture decks—all in your brand voice.',
          gradient: 'from-fuchsia-500 to-pink-600'
        }
      ]
    },
    {
      id: 'enterprise',
      label: 'Enterprise',
      tagline: 'Scale presentation excellence',
      useCases: [
        {
          title: 'Brand Compliance',
          description: 'Every team creates on-brand presentations automatically. No more off-brand decks from different departments.',
          gradient: 'from-slate-600 to-zinc-700'
        },
        {
          title: 'Executive Briefings',
          description: 'C-suite presentations with enterprise-grade polish. Strategic planning, M&A presentations, board decks.',
          gradient: 'from-zinc-600 to-stone-700'
        },
        {
          title: 'Global Training',
          description: 'Standardized training materials across offices, languages, and time zones. Update once, deploy everywhere.',
          gradient: 'from-stone-600 to-neutral-700'
        }
      ]
    }
  ];

  const activeAudienceData = audiences.find(a => a.id === activeAudience) || audiences[0];

  return (
    <div className="min-h-screen bg-[#FCFBF8] dark:bg-[#0a0a0a]">
      {/* Sticky Evolving CTA */}
      {scrollY > 400 && (
        <div className="fixed bottom-8 right-8 z-50 animate-on-scroll opacity-0 in-view">
          <Button
            size="lg"
            onClick={() => navigate('/signup')}
            className="bg-[#FF4301] hover:bg-[#E63901] text-white px-8 py-6 text-base font-semibold shadow-2xl"
          >
            {ctaText}
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      )}

      {/* Exit Intent Modal */}
      {showExitIntent && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-12 max-w-lg mx-4 relative">
            <button
              onClick={() => setShowExitIntent(false)}
              className="absolute top-4 right-4 text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>

            <h3
              className="text-3xl font-bold mb-4 text-black dark:text-white"
              style={{ fontFamily: '"HK Grotesk Wide", sans-serif', textTransform: 'uppercase' }}
            >
              Wait! Before you go...
            </h3>
            <p className="text-lg text-black/70 dark:text-white/70 mb-8">
              Try NextSlide <strong>free for 30 days</strong>. No credit card required. See why 10,000+ teams switched from PowerPoint.
            </p>
            <div className="flex gap-4">
              <Button
                size="lg"
                onClick={() => {
                  setShowExitIntent(false);
                  navigate('/signup');
                }}
                className="flex-1 bg-[#FF4301] hover:bg-[#E63901] text-white font-semibold"
              >
                Start Free Trial
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => setShowExitIntent(false)}
                className="flex-1"
              >
                Maybe Later
              </Button>
            </div>
          </div>
        </div>
      )}

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
            <a href="#features" className="text-sm font-medium text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors">Features</a>
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
              <a href="#features" onClick={() => setIsMenuOpen(false)}>Features</a>
              <a href="#pricing" onClick={() => setIsMenuOpen(false)}>Pricing</a>
              <Button variant="ghost" onClick={() => navigate('/login')}>Sign In</Button>
              <Button className="bg-[#FF4301] hover:bg-[#E63901] text-white" onClick={() => navigate('/signup')}>Get Started</Button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-8 overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-[#FF4301]/5 rounded-full blur-3xl opacity-50" />
          <div className="absolute top-1/2 right-0 w-[800px] h-[600px] bg-blue-500/5 rounded-full blur-3xl opacity-30" />
        </div>

        <div className="max-w-[1400px] mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div className="text-left animate-on-scroll opacity-0">
            <div className="inline-flex items-center gap-2 bg-[#FF4301]/10 border border-[#FF4301]/20 rounded-full px-4 py-2 mb-8">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF4301] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF4301]"></span>
              </span>
              <span className="text-xs font-bold text-[#FF4301] tracking-wide" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                NEW: AI DESIGN ENGINE 2.0
              </span>
            </div>

            <h1
              className="text-black dark:text-white mb-6 leading-[1.1]"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(48px, 5vw, 72px)',
                letterSpacing: '-0.02em',
                textTransform: 'uppercase'
              }}
            >
              Presentations that <span className="text-[#FF4301]">win deals</span>.
              <br />
              Built in seconds.
            </h1>

            <p className="text-xl text-black/60 dark:text-white/60 mb-10 max-w-xl leading-relaxed">
              Stop fighting with PowerPoint. NextSlide's AI builds professional, persuasive decks for you—complete with copy, design, and charts.
            </p>

            <div className="flex flex-wrap gap-4 mb-12">
              <Button size="lg" onClick={() => navigate('/signup')} className="bg-[#FF4301] hover:bg-[#E63901] text-white px-8 py-6 text-base font-bold shadow-lg shadow-[#FF4301]/20 transition-all hover:scale-105">
                Generate My Deck
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button size="lg" variant="outline" className="px-8 py-6 text-base font-bold border-2 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                <Play className="mr-2 w-5 h-5" />
                See How It Works
              </Button>
            </div>

            <div className="flex items-center gap-8 text-sm font-medium text-black/50 dark:text-white/50">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-[#FF4301]" />
                <span>No credit card needed</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-[#FF4301]" />
                <span>Export to PowerPoint</span>
              </div>
            </div>
          </div>

          {/* Interactive Hero Demo */}
          <div className="animate-on-scroll opacity-0 lg:translate-x-10" style={{ transitionDelay: '200ms' }}>
            <HeroInteractiveDemo />
          </div>
        </div>
      </section>

      {/* Social Proof Marquee */}
      <LogoMarquee />

      {/* Multi-Audience Showcase with Tabs */}
      <section className="py-32 px-8 bg-white dark:bg-black/30">
        <div className="max-w-[1400px] mx-auto">
          <div className="text-center mb-12 animate-on-scroll opacity-0">
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
              Built for everyone
            </h2>
            <p className="text-xl text-black/60 dark:text-white/60 mb-8">
              From classrooms to boardrooms, NextSlide adapts to your needs
            </p>

            {/* Tabs */}
            <div className="flex flex-wrap justify-center gap-3 mb-12">
              {audiences.map((audience) => (
                <button
                  key={audience.id}
                  onClick={() => setActiveAudience(audience.id)}
                  className={cn(
                    "px-6 py-3 rounded-full font-bold text-sm transition-all duration-300",
                    activeAudience === audience.id
                      ? "bg-[#FF4301] text-white shadow-lg scale-105"
                      : "bg-white dark:bg-zinc-900 text-black dark:text-white border-2 border-black/10 dark:border-white/10 hover:border-[#FF4301]"
                  )}
                  style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
                >
                  {audience.label}
                </button>
              ))}
            </div>
          </div>

          {/* Active Content */}
          <div className="animate-on-scroll opacity-0">
            <div className="text-center mb-12">
              <h3 className="text-3xl font-bold text-black dark:text-white mb-2" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                {activeAudienceData.tagline}
              </h3>
            </div>

            {/* Use Case Cards */}
            <div className="grid md:grid-cols-3 gap-6">
              {activeAudienceData.useCases.map((useCase, index) => (
                <div
                  key={index}
                  className="group cursor-pointer"
                  onClick={() => navigate('/signup')}
                >
                  <div className="h-full bg-[#FCFBF8] dark:bg-[#0a0a0a] rounded-2xl border-2 border-black/10 dark:border-white/10 overflow-hidden hover:border-[#FF4301] hover:shadow-2xl transition-all duration-300 hover:-translate-y-2">
                    {/* Visual Header */}
                    <div className={`aspect-[16/9] bg-gradient-to-br ${useCase.gradient} p-8 flex items-center justify-center relative overflow-hidden`}>
                      <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors duration-300" />
                      <div className="relative text-center text-white">
                        <h4
                          className="text-2xl md:text-3xl font-bold"
                          style={{ fontFamily: '"HK Grotesk Wide", sans-serif', textTransform: 'uppercase' }}
                        >
                          {useCase.title}
                        </h4>
                      </div>
                      {/* Subtle grid pattern */}
                      <div className="absolute inset-0 opacity-10" style={{
                        backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)',
                        backgroundSize: '20px 20px'
                      }} />
                    </div>

                    {/* Description */}
                    <div className="p-6">
                      <p className="text-black/70 dark:text-white/70 leading-relaxed">
                        {useCase.description}
                      </p>
                      <div className="mt-4 flex items-center text-[#FF4301] font-semibold text-sm group-hover:gap-2 transition-all">
                        <span>Create Now</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How It Works - Visual Steps */}
      <section className="py-32 px-8 bg-[#FCFBF8] dark:bg-[#0a0a0a]">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-24 animate-on-scroll opacity-0">
            <h2
              className="text-black dark:text-white mb-6"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(36px, 5vw, 64px)',
                lineHeight: '1.1',
                letterSpacing: '-0.02em',
                textTransform: 'uppercase'
              }}
            >
              From idea to deck
              <br />
              <span className="text-[#FF4301]">in three steps</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-12 relative">
            {/* Connecting Line */}
            <div className="hidden md:block absolute top-12 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-[#FF4301]/20 to-transparent" />

            {[
              {
                step: "01",
                title: "Describe your goal",
                desc: "Tell NextSlide what you're presenting. Paste a document, a URL, or just type a topic.",
                icon: <Type className="w-6 h-6 text-[#FF4301]" />
              },
              {
                step: "02",
                title: "AI builds the structure",
                desc: "Our engine analyzes your content and creates a perfect narrative arc with professional layouts.",
                icon: <Brain className="w-6 h-6 text-[#FF4301]" />
              },
              {
                step: "03",
                title: "Customize & Present",
                desc: "Use our full editor to tweak anything. Export to PowerPoint or present directly.",
                icon: <Play className="w-6 h-6 text-[#FF4301]" />
              }
            ].map((item, i) => (
              <div key={i} className="relative animate-on-scroll opacity-0" style={{ transitionDelay: `${i * 150}ms` }}>
                <div className="w-24 h-24 rounded-2xl bg-white dark:bg-zinc-900 border-2 border-[#FF4301]/10 flex items-center justify-center mb-8 mx-auto relative z-10 shadow-xl shadow-[#FF4301]/5">
                  {item.icon}
                  <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-[#FF4301] text-white flex items-center justify-center font-bold text-sm">
                    {item.step}
                  </div>
                </div>
                <div className="text-center px-4">
                  <h3 className="text-xl font-bold text-black dark:text-white mb-3" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                    {item.title}
                  </h3>
                  <p className="text-black/60 dark:text-white/60 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bento Grid - Interactive Feature Demos */}
      <section id="features" className="py-32 px-8 bg-white dark:bg-black/30">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-20 animate-on-scroll opacity-0">
            <h2
              className="text-black dark:text-white mb-6"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(36px, 5vw, 64px)',
                lineHeight: '1.1',
                letterSpacing: '-0.02em',
                textTransform: 'uppercase'
              }}
            >
              Everything you need
              <br />
              <span className="text-[#FF4301]">to look pro</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 auto-rows-[300px]">
            {bentoItems.map((item, index) => {
              const Icon = item.icon;
              const isLarge = item.size === 'large';
              const isMedium = item.size === 'medium';
              const isHovered = hoveredDemo === index;

              return (
                <div
                  key={index}
                  onMouseEnter={() => setHoveredDemo(index)}
                  onMouseLeave={() => setHoveredDemo(null)}
                  className={cn(
                    "relative group rounded-3xl p-8 transition-all duration-500 overflow-hidden cursor-pointer",
                    "bg-[#FCFBF8] dark:bg-[#0a0a0a] border border-black/5 dark:border-white/5",
                    "hover:shadow-2xl hover:shadow-[#FF4301]/10 hover:-translate-y-1",
                    isLarge && "lg:col-span-2 lg:row-span-2",
                    isMedium && "lg:col-span-2"
                  )}
                >
                  {/* Background Gradient */}
                  <div className={cn(
                    "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500",
                    "bg-gradient-to-br from-[#FF4301]/5 via-transparent to-transparent"
                  )} />

                  <div className="relative z-10 h-full flex flex-col">
                    <div className="flex items-start justify-between mb-6">
                      <div className={cn(
                        "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500",
                        isHovered ? "bg-[#FF4301] text-white rotate-3" : "bg-black/5 dark:bg-white/5 text-black dark:text-white"
                      )}>
                        <Icon className="w-7 h-7" />
                      </div>
                      <div className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300",
                        isHovered ? "bg-[#FF4301]/10 text-[#FF4301]" : "bg-transparent text-transparent"
                      )}>
                        {item.demo}
                      </div>
                    </div>

                    <h3 className="text-2xl font-bold text-black dark:text-white mb-3" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                      {item.title}
                    </h3>
                    <p className="text-black/60 dark:text-white/60 leading-relaxed mb-6">
                      {item.description}
                    </p>

                    {/* Visual Demo Area */}
                    <div className="mt-auto relative h-32 w-full bg-white dark:bg-black/20 rounded-xl border border-black/5 dark:border-white/5 overflow-hidden group-hover:border-[#FF4301]/20 transition-colors">
                      {/* Abstract Visuals based on type */}
                      {isLarge && (
                        <div className="absolute inset-0 p-4">
                          <div className="space-y-2">
                            <div className="h-2 bg-black/10 dark:bg-white/10 rounded w-3/4 animate-pulse" />
                            <div className="h-2 bg-black/10 dark:bg-white/10 rounded w-1/2 animate-pulse" style={{ animationDelay: '100ms' }} />
                            <div className="h-2 bg-black/10 dark:bg-white/10 rounded w-5/6 animate-pulse" style={{ animationDelay: '200ms' }} />
                          </div>
                        </div>
                      )}
                      {!isLarge && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className={cn(
                            "w-16 h-16 rounded-full border-2 border-dashed border-black/10 dark:border-white/10 transition-all duration-700",
                            isHovered && "border-[#FF4301] rotate-180 scale-110"
                          )} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Social Proof - Real Testimonials */}
      <section className="py-32 px-8 bg-[#FCFBF8] dark:bg-[#0a0a0a]">
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
              Trusted by 10,000+ teams
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, index) => {
              const PlatformIcon = testimonial.platform === 'twitter' ? Twitter : Linkedin;

              return (
                <div
                  key={index}
                  className="animate-on-scroll opacity-0 bg-white dark:bg-zinc-900 rounded-2xl border border-black/10 dark:border-white/10 p-6"
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-[#FF4301]/10 flex items-center justify-center text-[#FF4301] font-bold">
                        {testimonial.avatar}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-black dark:text-white text-sm">{testimonial.author}</h4>
                          {testimonial.verified && (
                            <Check className="w-4 h-4 text-blue-500" />
                          )}
                        </div>
                        <p className="text-xs text-black/50 dark:text-white/50">{testimonial.handle}</p>
                      </div>
                    </div>
                    <PlatformIcon className="w-5 h-5 text-black/30 dark:text-white/30" />
                  </div>

                  {/* Content */}
                  <p className="text-black/80 dark:text-white/80 text-sm leading-relaxed mb-3">
                    {testimonial.content}
                  </p>

                  {/* Role */}
                  <p className="text-xs text-black/40 dark:text-white/40">{testimonial.role}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ROI Calculator */}
      <section className="py-32 px-8 bg-white dark:bg-black/30">
        <div className="max-w-[1000px] mx-auto">
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
              Calculate your savings
            </h2>
            <p className="text-xl text-black/60 dark:text-white/60">
              See how much time and money NextSlide saves you
            </p>
          </div>

          <div className="bg-[#FCFBF8] dark:bg-[#0a0a0a] rounded-2xl border-2 border-black/10 dark:border-white/10 p-10">
            <div className="grid md:grid-cols-3 gap-8 mb-10">
              {/* Input 1 */}
              <div>
                <label className="block text-sm font-bold text-black dark:text-white mb-3" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                  Your Hourly Rate
                </label>
                <div className="relative">
                  <Dollar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-black/40 dark:text-white/40" />
                  <input
                    type="number"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(Number(e.target.value))}
                    className="w-full pl-12 pr-4 py-3 bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-xl text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF4301]"
                  />
                </div>
              </div>

              {/* Input 2 */}
              <div>
                <label className="block text-sm font-bold text-black dark:text-white mb-3" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                  Hours Per Deck
                </label>
                <input
                  type="number"
                  value={hoursPerDeck}
                  onChange={(e) => setHoursPerDeck(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-xl text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF4301]"
                />
              </div>

              {/* Input 3 */}
              <div>
                <label className="block text-sm font-bold text-black dark:text-white mb-3" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                  Decks Per Month
                </label>
                <input
                  type="number"
                  value={decksPerMonth}
                  onChange={(e) => setDecksPerMonth(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-xl text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF4301]"
                />
              </div>
            </div>

            {/* Results */}
            <div className="bg-gradient-to-br from-[#FF4301] to-red-600 rounded-2xl p-8 text-white text-center">
              <div className="grid md:grid-cols-3 gap-8">
                <div>
                  <div className="text-sm opacity-90 mb-2">Current Annual Cost</div>
                  <div className="text-4xl font-bold" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                    ${yearlyCost.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-sm opacity-90 mb-2">NextSlide Annual Cost</div>
                  <div className="text-4xl font-bold" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                    ${nextSlideCost}
                  </div>
                </div>
                <div>
                  <div className="text-sm opacity-90 mb-2">You Save</div>
                  <div className="text-4xl font-bold" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                    ${savings > 0 ? savings.toLocaleString() : 0}
                  </div>
                </div>
              </div>
              <Button
                size="lg"
                onClick={() => navigate('/signup')}
                className="mt-8 bg-white text-[#FF4301] hover:bg-zinc-100 px-10 py-6 text-base font-semibold"
              >
                Start Saving Today
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Embedded Deck Preview */}
      <section className="py-32 px-8 bg-[#FCFBF8] dark:bg-[#0a0a0a]">
        <div className="max-w-[1000px] mx-auto">
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
              See it in action
            </h2>
            <p className="text-xl text-black/60 dark:text-white/60">
              This deck was generated in 24 seconds
            </p>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-2xl border-2 border-black/10 dark:border-white/10 overflow-hidden">
            {/* Slide Preview */}
            <div className="aspect-[16/9] bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950 dark:to-red-950 flex items-center justify-center p-12 border-b border-black/10 dark:border-white/10">
              <div className="text-center max-w-2xl">
                <h3 className="text-4xl font-bold text-black dark:text-white mb-4" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                  {previewSlides[currentSlide].title}
                </h3>
                <p className="text-xl text-black/70 dark:text-white/70">
                  {previewSlides[currentSlide].content}
                </p>
              </div>
            </div>

            {/* Navigation */}
            <div className="p-6 flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
                disabled={currentSlide === 0}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>

              <div className="text-sm text-black/60 dark:text-white/60">
                Slide {currentSlide + 1} of {previewSlides.length}
              </div>

              <Button
                variant="outline"
                onClick={() => setCurrentSlide(Math.min(previewSlides.length - 1, currentSlide + 1))}
                disabled={currentSlide === previewSlides.length - 1}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Deck of the Day Showcase */}
      <section className="py-32 px-8 bg-white dark:bg-black/30">
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
              Real decks, real results
            </h2>
            <p className="text-xl text-black/60 dark:text-white/60">
              Generated by NextSlide users
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {showcaseDecks.map((deck, index) => (
              <div
                key={index}
                className="animate-on-scroll opacity-0 group cursor-pointer"
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <div className="bg-[#FCFBF8] dark:bg-[#0a0a0a] rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden hover:border-[#FF4301] transition-all duration-300 hover:shadow-xl">
                  {/* Thumbnail */}
                  <div className="aspect-[16/9] bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-900 dark:to-zinc-800 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                    <Layout className="w-20 h-20 text-black/20 dark:text-white/20" />
                  </div>

                  {/* Info */}
                  <div className="p-6">
                    <div className="text-xs text-[#FF4301] font-bold mb-2 uppercase" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                      {deck.industry}
                    </div>
                    <h3 className="text-xl font-bold text-black dark:text-white mb-2" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                      {deck.title}
                    </h3>
                    <p className="text-sm text-black/60 dark:text-white/60 mb-4">
                      By {deck.company}
                    </p>
                    <div className="flex items-center justify-between text-xs text-black/50 dark:text-white/50">
                      <span>{deck.slides} slides</span>
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-[#FF4301]" />
                        {deck.time}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-32 px-8">
        <div className="max-w-[1000px] mx-auto">
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
              See how we stack up
            </h2>
            <p className="text-xl text-black/60 dark:text-white/60">
              NextSlide makes old tools obsolete
            </p>
          </div>

          <div className="animate-on-scroll opacity-0 bg-white dark:bg-zinc-900 rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-black/10 dark:border-white/10">
                    <th className="text-left p-6 text-sm font-bold text-black dark:text-white" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                      Feature
                    </th>
                    <th className="p-6 text-center text-sm font-bold text-[#FF4301]" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                      NextSlide
                    </th>
                    <th className="p-6 text-center text-sm font-bold text-black/40 dark:text-white/40" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                      PowerPoint
                    </th>
                    <th className="p-6 text-center text-sm font-bold text-black/40 dark:text-white/40" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                      Canva
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((row, index) => (
                    <tr key={index} className="border-b border-black/5 dark:border-white/5 last:border-0">
                      <td className="p-6 text-black/70 dark:text-white/70">{row.feature}</td>
                      <td className="p-6 text-center">
                        {row.nextslide === true && <Check className="w-6 h-6 text-[#FF4301] mx-auto" />}
                      </td>
                      <td className="p-6 text-center">
                        {row.powerpoint === true && <Check className="w-6 h-6 text-green-500 mx-auto" />}
                        {row.powerpoint === false && <X className="w-6 h-6 text-red-500 mx-auto" />}
                        {typeof row.powerpoint === 'string' && <span className="text-xs text-black/40 dark:text-white/40 uppercase">{row.powerpoint}</span>}
                      </td>
                      <td className="p-6 text-center">
                        {row.canva === true && <Check className="w-6 h-6 text-green-500 mx-auto" />}
                        {row.canva === false && <X className="w-6 h-6 text-red-500 mx-auto" />}
                        {typeof row.canva === 'string' && <span className="text-xs text-black/40 dark:text-white/40 uppercase">{row.canva}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-32 px-8 bg-white dark:bg-black/30">
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
              Questions? We've got answers
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
      <section id="pricing" className="py-32 px-8">
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

          <div className="grid md:grid-cols-3 gap-6">
            {/* Free */}
            <div className="animate-on-scroll opacity-0 p-8 rounded-2xl border-2 border-black/10 dark:border-white/10 bg-[#FCFBF8] dark:bg-[#0a0a0a]">
              <div className="mb-8">
                <h3 className="text-xl font-bold mb-2 text-black dark:text-white" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Free</h3>
                <div className="text-5xl font-bold text-black dark:text-white mb-1" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                  $0
                </div>
                <div className="text-sm text-black/50 dark:text-white/50">Forever</div>
              </div>
              <ul className="space-y-3 mb-8 text-sm">
                {['5 presentations/month', 'All AI features', 'Export to PDF', 'Basic templates'].map((feature, i) => (
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

            {/* Pro */}
            <div className="animate-on-scroll opacity-0 p-8 rounded-2xl bg-[#FF4301] text-white transform md:scale-105 shadow-xl" style={{ transitionDelay: '100ms' }}>
              <div className="bg-white/20 text-xs font-bold px-3 py-1 rounded-full inline-block mb-6">
                MOST POPULAR
              </div>
              <div className="mb-8">
                <h3 className="text-xl font-bold mb-2" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Pro</h3>
                <div className="text-5xl font-bold mb-1" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                  $19
                </div>
                <div className="text-sm opacity-90">per month</div>
              </div>
              <ul className="space-y-3 mb-8 text-sm">
                {['Unlimited presentations', 'Priority AI', 'Export to PowerPoint', 'Premium templates', 'Real-time collaboration', 'Custom branding'].map((feature, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button className="w-full bg-white text-[#FF4301] hover:bg-zinc-100 font-semibold" onClick={() => navigate('/signup')}>
                Start Pro Trial
              </Button>
            </div>

            {/* Team */}
            <div className="animate-on-scroll opacity-0 p-8 rounded-2xl border-2 border-black/10 dark:border-white/10 bg-[#FCFBF8] dark:bg-[#0a0a0a]" style={{ transitionDelay: '200ms' }}>
              <div className="mb-8">
                <h3 className="text-xl font-bold mb-2 text-black dark:text-white" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Team</h3>
                <div className="text-5xl font-bold text-black dark:text-white mb-1" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                  $49
                </div>
                <div className="text-sm text-black/50 dark:text-white/50">per user/month</div>
              </div>
              <ul className="space-y-3 mb-8 text-sm">
                {['Everything in Pro', 'Team workspaces', 'Advanced permissions', 'SSO & SAML', 'Custom integrations', 'Dedicated support'].map((feature, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#FF4301] flex-shrink-0 mt-0.5" />
                    <span className="text-black/70 dark:text-white/70">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full" onClick={() => navigate('/signup')}>
                Contact Sales
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 px-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-[#FF4301] -z-20" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-transparent -z-10" />

        <div className="max-w-[1200px] mx-auto text-center animate-on-scroll opacity-0">
          <h2
            className="mb-8 text-white"
            style={{
              fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
              fontWeight: 900,
              fontSize: 'clamp(40px, 6vw, 86px)',
              lineHeight: '0.9',
              letterSpacing: '-0.02em',
              textTransform: 'uppercase'
            }}
          >
            Stop formatting.
            <br />
            Start presenting.
          </h2>
          <p className="text-xl text-white/80 mb-12 max-w-2xl mx-auto font-medium">
            Join 10,000+ teams who have switched to the new standard for presentations.
          </p>

          <div className="flex flex-col md:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="bg-white text-[#FF4301] hover:bg-zinc-100 px-12 py-8 text-xl font-bold shadow-2xl hover:scale-105 transition-all"
              onClick={() => navigate('/signup')}
            >
              Start Creating for Free
              <ArrowRight className="ml-3 w-6 h-6" />
            </Button>
            <p className="text-white/60 text-sm mt-4 md:mt-0 md:absolute md:-bottom-12">
              No credit card required • Cancel anytime
            </p>
          </div>
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
      `}</style>
    </div>
  );
};

export default Landing;
