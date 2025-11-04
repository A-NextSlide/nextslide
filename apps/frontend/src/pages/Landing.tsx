import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import BrandWordmark from '@/components/common/BrandWordmark';
import { cn } from '@/lib/utils';
import {
  ArrowRight, Sparkles, Zap, Users, BarChart3, Clock, Check, Menu, X,
  Wand2, Brain, Palette, TrendingUp, Shield, Globe, ChevronDown, Play,
  FileText, Image as ImageIcon, Layout, Code, Star, Quote
} from 'lucide-react';
import { useTheme } from 'next-themes';

const Landing: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [scrollY, setScrollY] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeDemo, setActiveDemo] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  // Refs for scroll animations
  const heroRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);

  // Subtle noise texture for glass header background
  const NAV_NOISE_BG = "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")";

  // Auto-rotate demo slides
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveDemo((prev) => (prev + 1) % 3);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Handle scroll events for parallax and animations
  useEffect(() => {
    // Enable scrolling on this page
    document.documentElement.style.position = '';
    document.documentElement.style.overflow = '';
    document.body.style.position = '';
    document.body.style.overflow = '';

    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      // Reset to fixed positioning when leaving the page (for editor)
      document.documentElement.style.position = 'fixed';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.overflow = 'hidden';
    };
  }, []);

  // Intersection observer for fade-in animations
  useEffect(() => {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');
        }
      });
    }, observerOptions);

    document.querySelectorAll('.fade-in-section').forEach(el => {
      observer.observe(el);
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  const demoSlides = [
    {
      title: "Sales Pitch",
      subtitle: "Q4 Strategy",
      color: "from-orange-400 to-pink-500",
      icon: TrendingUp
    },
    {
      title: "Product Launch",
      subtitle: "Innovation Showcase",
      color: "from-blue-400 to-purple-500",
      icon: Sparkles
    },
    {
      title: "Team Update",
      subtitle: "Monthly Review",
      color: "from-green-400 to-teal-500",
      icon: Users
    }
  ];

  const features = [
    {
      icon: Brain,
      title: "AI That Understands Context",
      description: "Our AI doesn't just fill templates—it understands your industry, audience, and message to create presentations that actually work.",
      color: "text-orange-500",
      bgColor: "bg-orange-50 dark:bg-orange-900/20"
    },
    {
      icon: Wand2,
      title: "Design on Autopilot",
      description: "Every slide is perfectly balanced, on-brand, and visually stunning. No design skills required.",
      color: "text-purple-500",
      bgColor: "bg-purple-50 dark:bg-purple-900/20"
    },
    {
      icon: Zap,
      title: "Generate in Seconds",
      description: "Complete presentations in 30 seconds. What used to take hours now happens while you grab coffee.",
      color: "text-blue-500",
      bgColor: "bg-blue-50 dark:bg-blue-900/20"
    },
    {
      icon: Users,
      title: "Collaborate in Real-Time",
      description: "Work with your team simultaneously. See changes live, leave comments, and iterate faster.",
      color: "text-green-500",
      bgColor: "bg-green-50 dark:bg-green-900/20"
    },
    {
      icon: BarChart3,
      title: "Smart Data Visualization",
      description: "Paste your data and watch AI choose the perfect chart type and design it beautifully.",
      color: "text-indigo-500",
      bgColor: "bg-indigo-50 dark:bg-indigo-900/20"
    },
    {
      icon: Globe,
      title: "Export Anywhere",
      description: "Download as PowerPoint, PDF, or share with a link. Your presentations work everywhere.",
      color: "text-pink-500",
      bgColor: "bg-pink-50 dark:bg-pink-900/20"
    }
  ];

  const useCases = [
    {
      title: "Sales Teams",
      description: "Build pitch decks that adapt to each prospect. Update data in real-time during calls.",
      icon: TrendingUp,
      gradient: "from-blue-500 to-purple-500",
      results: "38% higher close rate"
    },
    {
      title: "Marketers",
      description: "Create campaign presentations, quarterly reviews, and stakeholder updates in minutes.",
      icon: Sparkles,
      gradient: "from-orange-500 to-pink-500",
      results: "5x faster production"
    },
    {
      title: "Founders",
      description: "Pitch decks that investors actually want to see. Updated effortlessly as you grow.",
      icon: Zap,
      gradient: "from-green-500 to-teal-500",
      results: "2.3x more meetings"
    }
  ];

  const testimonials = [
    {
      quote: "We closed our Series A using a deck made in nextslide. Investors said it was the most professional pitch they'd seen from an early-stage company.",
      author: "Sarah Chen",
      role: "CEO, TechFlow",
      avatar: "SC"
    },
    {
      quote: "Our sales team used to spend 10+ hours on each custom pitch. Now it's 15 minutes. The quality is better too.",
      author: "Marcus Johnson",
      role: "VP Sales, CloudScale",
      avatar: "MJ"
    },
    {
      quote: "I'm not a designer, but my presentations look like they were made by one. This tool is magic.",
      author: "Priya Patel",
      role: "Marketing Lead, DataCorp",
      avatar: "PP"
    }
  ];

  return (
    <div className="min-h-screen bg-[#F5F5DC] dark:bg-zinc-900">
      {/* Noise overlay */}
      <div className="noise-overlay pointer-events-none"></div>

      {/* Navigation */}
      <nav
        className={cn(
          "fixed top-0 w-full z-50 transition-all duration-300",
          scrollY > 4
            ? "supports-[backdrop-filter]:backdrop-blur-sm backdrop-saturate-150 bg-white/60 dark:bg-zinc-900/60 border-b border-zinc-300/40 dark:border-zinc-600/30 shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
            : "bg-transparent dark:bg-transparent"
        )}
      >
        {scrollY > 4 && (
          <>
            <div
              className="absolute inset-0 pointer-events-none opacity-[0.01]"
              style={{ backgroundImage: NAV_NOISE_BG }}
            />
            <div className="absolute top-0 left-0 right-0 h-px bg-white/40 dark:bg-white/5 pointer-events-none" />
          </>
        )}
        <div className="relative z-10 max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div
            className="text-[#383636] dark:text-gray-300 cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              window.location.reload();
            }}
            style={{
              fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
              fontWeight: 900,
              lineHeight: '100%',
              letterSpacing: '0%',
              textTransform: 'uppercase',
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale'
            }}
          >
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

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Features</a>
            <a href="#how-it-works" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">How it Works</a>
            <a href="#pricing" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Pricing</a>
            <Button
              variant="ghost"
              className="text-zinc-600 dark:text-zinc-400"
              onClick={() => navigate('/login')}
            >
              Sign In
            </Button>
            <Button
              className="bg-[#FF4301] hover:bg-[#E63901] text-white shadow-lg shadow-orange-500/30"
              onClick={() => navigate('/signup')}
            >
              Start Free
            </Button>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden text-zinc-900 dark:text-zinc-100"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-[#F5F5DC] dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 backdrop-blur-lg">
            <div className="flex flex-col p-6 gap-4">
              <a href="#features" className="text-zinc-600 dark:text-zinc-400" onClick={() => setIsMenuOpen(false)}>Features</a>
              <a href="#how-it-works" className="text-zinc-600 dark:text-zinc-400" onClick={() => setIsMenuOpen(false)}>How it Works</a>
              <a href="#pricing" className="text-zinc-600 dark:text-zinc-400" onClick={() => setIsMenuOpen(false)}>Pricing</a>
              <Button variant="ghost" onClick={() => navigate('/login')}>Sign In</Button>
              <Button className="bg-[#FF4301] hover:bg-[#E63901] text-white" onClick={() => navigate('/signup')}>
                Start Free
              </Button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section
        ref={heroRef}
        className="relative min-h-screen flex items-center justify-center px-6 pt-20 overflow-hidden"
      >
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Copy */}
          <div className="text-center lg:text-left">
            <div className="mb-6 inline-flex items-center gap-2 px-4 py-2 bg-orange-100 dark:bg-orange-900/20 rounded-full">
              <Sparkles className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-medium text-orange-600 dark:text-orange-400">
                Powered by Claude AI
              </span>
            </div>

            <h1
              className="text-[#383636] dark:text-gray-100 mb-6"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(40px, 7vw, 84px)',
                lineHeight: '95%',
                letterSpacing: '-2%',
                textTransform: 'uppercase'
              }}
            >
              Presentations
              <br />
              That Don't
              <br />
              <span className="text-[#FF4301]">Suck</span>
            </h1>

            <p className="text-lg md:text-xl text-zinc-600 dark:text-zinc-400 mb-8 max-w-xl leading-relaxed">
              Stop wrestling with templates. Describe what you want, and AI builds a stunning presentation in 30 seconds.
              Seriously.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-8">
              <Button
                size="lg"
                className="bg-[#FF4301] hover:bg-[#E63901] text-white px-8 py-6 text-lg shadow-lg shadow-orange-500/30 hover:shadow-xl hover:shadow-orange-500/40 transition-all"
                onClick={() => navigate('/signup')}
              >
                Create Your First Deck
                <ArrowRight className="ml-2" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="px-8 py-6 text-lg border-2 border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600"
                onClick={() => {
                  const demoSection = document.getElementById('interactive-demo');
                  demoSection?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <Play className="mr-2 w-5 h-5" />
                See it in Action
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 text-sm text-zinc-500 dark:text-zinc-400">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                <span>Free forever plan</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                <span>No credit card</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                <span>Export to PPTX</span>
              </div>
            </div>
          </div>

          {/* Right: Interactive Demo Preview */}
          <div className="relative">
            <div className="relative" style={{ transform: `translateY(${scrollY * 0.1}px)` }}>
              {/* Floating slide previews */}
              <div className="relative h-[500px]">
                {demoSlides.map((slide, index) => {
                  const Icon = slide.icon;
                  const offset = (index - activeDemo + 3) % 3;
                  const isActive = index === activeDemo;

                  return (
                    <div
                      key={index}
                      className={cn(
                        "absolute inset-0 transition-all duration-700 ease-out",
                        isActive ? "z-30 scale-100 opacity-100" : offset === 1 ? "z-20 scale-90 opacity-60" : "z-10 scale-80 opacity-30"
                      )}
                      style={{
                        transform: `
                          translateX(${offset * 30}px)
                          translateY(${offset * 20}px)
                          rotateY(${offset * -5}deg)
                          scale(${isActive ? 1 : 0.9 - offset * 0.1})
                        `,
                      }}
                    >
                      <div className={cn(
                        "bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl p-8 aspect-[16/10] flex flex-col justify-between",
                        isActive && "ring-2 ring-orange-500/50"
                      )}>
                        <div>
                          <div className="flex items-center gap-3 mb-6">
                            <div className={cn("w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center", slide.color)}>
                              <Icon className="w-6 h-6 text-white" />
                            </div>
                            <div>
                              <div className="text-xs text-zinc-500 dark:text-zinc-400">{slide.subtitle}</div>
                              <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{slide.title}</div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="h-3 bg-zinc-200 dark:bg-zinc-700 rounded-full w-3/4"></div>
                            <div className="h-3 bg-zinc-200 dark:bg-zinc-700 rounded-full w-5/6"></div>
                            <div className="h-3 bg-zinc-200 dark:bg-zinc-700 rounded-full w-2/3"></div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mt-6">
                          {[...Array(3)].map((_, i) => (
                            <div key={i} className="bg-zinc-100 dark:bg-zinc-700 rounded-lg h-16"></div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Slide indicators */}
              <div className="flex justify-center gap-2 mt-8">
                {demoSlides.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setActiveDemo(index)}
                    className={cn(
                      "h-2 rounded-full transition-all",
                      index === activeDemo ? "w-8 bg-orange-500" : "w-2 bg-zinc-300 dark:bg-zinc-700"
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Animated background elements */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div
            className="absolute top-20 left-10 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl"
            style={{ transform: `translateY(${scrollY * 0.2}px)` }}
          />
          <div
            className="absolute bottom-20 right-10 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"
            style={{ transform: `translateY(${scrollY * -0.2}px)` }}
          />
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronDown className="w-6 h-6 text-zinc-400" />
        </div>
      </section>

      {/* Social Proof Bar */}
      <section className="py-12 px-6 bg-white dark:bg-zinc-800 border-y border-zinc-200 dark:border-zinc-700">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl md:text-4xl font-bold text-zinc-900 dark:text-zinc-100">12K+</div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">Presentations Created</div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-bold text-zinc-900 dark:text-zinc-100">2.4K+</div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">Active Users</div>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 mb-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-yellow-500 text-yellow-500" />
                ))}
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">4.9/5 Rating</div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-bold text-zinc-900 dark:text-zinc-100">85%</div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">Time Saved</div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Demo Section */}
      <section id="interactive-demo" className="py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 fade-in-section opacity-0">
            <h2
              className="text-[#383636] dark:text-gray-100 mb-4"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(36px, 5vw, 64px)',
                lineHeight: '100%',
                textTransform: 'uppercase'
              }}
            >
              Type. <span className="text-[#FF4301]">Generate.</span> Done.
            </h2>
            <p className="text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
              Watch how fast you can go from idea to finished presentation
            </p>
          </div>

          {/* Interactive typing demo */}
          <div className="fade-in-section opacity-0 bg-white dark:bg-zinc-800 rounded-3xl shadow-2xl overflow-hidden">
            <div className="bg-zinc-900 px-6 py-4 flex items-center gap-2">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
              </div>
              <div className="text-zinc-400 text-sm ml-4">nextslide.app</div>
            </div>

            <div className="p-8 md:p-12">
              <div className="mb-8">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                  What do you want to present?
                </label>
                <div className="bg-zinc-50 dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 rounded-xl p-6 font-mono text-sm">
                  <div className="text-zinc-900 dark:text-zinc-100">
                    "Create a pitch deck for a B2B SaaS startup that helps sales teams automate their outreach.
                    Include market size, our solution, competitive advantages, team, and funding ask of $2M."
                  </div>
                  <div className="mt-4 inline-block px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-sans cursor-pointer hover:bg-orange-600 transition-colors">
                    Generate Presentation →
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { icon: FileText, label: "15 slides generated", color: "text-blue-500" },
                  { icon: ImageIcon, label: "Images auto-matched", color: "text-purple-500" },
                  { icon: Layout, label: "Layouts optimized", color: "text-green-500" }
                ].map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <div key={i} className="flex items-center gap-3 p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl">
                      <Icon className={cn("w-6 h-6", item.color)} />
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-32 px-6 bg-zinc-50 dark:bg-zinc-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 fade-in-section opacity-0">
            <h2
              className="text-[#383636] dark:text-gray-100 mb-4"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(36px, 5vw, 64px)',
                lineHeight: '100%',
                textTransform: 'uppercase'
              }}
            >
              Everything You Need.
              <br />
              <span className="text-[#FF4301]">Nothing You Don't.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="fade-in-section opacity-0 group"
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  <div className="bg-white dark:bg-zinc-800 rounded-2xl p-8 h-full hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 border border-zinc-200 dark:border-zinc-700">
                    <div className={cn("w-14 h-14 rounded-xl flex items-center justify-center mb-6", feature.bgColor)}>
                      <Icon className={cn("w-7 h-7", feature.color)} />
                    </div>
                    <h3 className="text-xl font-bold mb-3 text-zinc-900 dark:text-zinc-100">
                      {feature.title}
                    </h3>
                    <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20 fade-in-section opacity-0">
            <h2
              className="text-[#383636] dark:text-gray-100 mb-4"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(36px, 5vw, 64px)',
                lineHeight: '100%',
                textTransform: 'uppercase'
              }}
            >
              Three Steps to
              <br />
              <span className="text-[#FF4301]">Awesome</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connection line */}
            <div className="hidden md:block absolute top-20 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 via-purple-500 to-green-500 opacity-20"></div>

            {[
              {
                number: "1",
                title: "Describe Your Idea",
                description: "Tell our AI what you're presenting. Be as detailed or as brief as you want—it figures it out.",
                color: "bg-orange-500"
              },
              {
                number: "2",
                title: "AI Builds It",
                description: "Watch as your presentation materializes in real-time. Slides, layouts, images, charts—all done.",
                color: "bg-purple-500"
              },
              {
                number: "3",
                title: "Tweak & Present",
                description: "Edit anything you want with our intuitive editor, then present or export. That's it.",
                color: "bg-green-500"
              }
            ].map((step, index) => (
              <div
                key={index}
                className="fade-in-section opacity-0 relative"
                style={{ transitionDelay: `${index * 150}ms` }}
              >
                <div className="bg-white dark:bg-zinc-800 rounded-2xl p-8 border border-zinc-200 dark:border-zinc-700">
                  <div className={cn("w-16 h-16 rounded-full flex items-center justify-center mb-6 text-white text-2xl font-bold relative z-10", step.color)}>
                    {step.number}
                  </div>
                  <h3 className="text-2xl font-bold mb-4 text-zinc-900 dark:text-zinc-100">
                    {step.title}
                  </h3>
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-32 px-6 bg-zinc-50 dark:bg-zinc-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 fade-in-section opacity-0">
            <h2
              className="text-[#383636] dark:text-gray-100 mb-4"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(36px, 5vw, 64px)',
                lineHeight: '100%',
                textTransform: 'uppercase'
              }}
            >
              Built for
              <br />
              <span className="text-[#FF4301]">Your Team</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {useCases.map((useCase, index) => {
              const Icon = useCase.icon;
              return (
                <div
                  key={index}
                  className="fade-in-section opacity-0 group"
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  <div className="bg-white dark:bg-zinc-800 rounded-2xl p-8 h-full border border-zinc-200 dark:border-zinc-700 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                    <div className={cn("w-14 h-14 rounded-xl bg-gradient-to-br flex items-center justify-center mb-6", useCase.gradient)}>
                      <Icon className="w-7 h-7 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold mb-3 text-zinc-900 dark:text-zinc-100">
                      {useCase.title}
                    </h3>
                    <p className="text-zinc-600 dark:text-zinc-400 mb-4 leading-relaxed">
                      {useCase.description}
                    </p>
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-full text-sm font-medium">
                      <Check className="w-4 h-4" />
                      {useCase.results}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 fade-in-section opacity-0">
            <h2
              className="text-[#383636] dark:text-gray-100 mb-4"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(36px, 5vw, 64px)',
                lineHeight: '100%',
                textTransform: 'uppercase'
              }}
            >
              Don't Take Our
              <br />
              <span className="text-[#FF4301]">Word For It</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <div
                key={index}
                className="fade-in-section opacity-0"
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <div className="bg-white dark:bg-zinc-800 rounded-2xl p-8 border border-zinc-200 dark:border-zinc-700 h-full flex flex-col">
                  <Quote className="w-10 h-10 text-orange-500 mb-4 opacity-50" />
                  <p className="text-zinc-700 dark:text-zinc-300 mb-6 leading-relaxed flex-grow italic">
                    "{testimonial.quote}"
                  </p>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white font-bold">
                      {testimonial.avatar}
                    </div>
                    <div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">{testimonial.author}</div>
                      <div className="text-sm text-zinc-500 dark:text-zinc-400">{testimonial.role}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-32 px-6 bg-zinc-50 dark:bg-zinc-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 fade-in-section opacity-0">
            <h2
              className="text-[#383636] dark:text-gray-100 mb-4"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(36px, 5vw, 64px)',
                lineHeight: '100%',
                textTransform: 'uppercase'
              }}
            >
              Simple Pricing.
              <br />
              <span className="text-[#FF4301]">Huge Value.</span>
            </h2>
            <p className="text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto mt-4">
              Start free. Upgrade when you're ready. Cancel anytime.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Free */}
            <div className="fade-in-section opacity-0 bg-white dark:bg-zinc-800 rounded-2xl p-8 border-2 border-zinc-200 dark:border-zinc-700">
              <div className="mb-8">
                <h3 className="text-2xl font-bold mb-2 text-zinc-900 dark:text-zinc-100">Free</h3>
                <div className="text-5xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                  $0
                </div>
                <div className="text-zinc-600 dark:text-zinc-400">Forever</div>
              </div>
              <ul className="space-y-4 mb-8">
                {[
                  "5 presentations/month",
                  "All AI features",
                  "Export to PDF",
                  "Basic templates",
                  "Community support"
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-zinc-700 dark:text-zinc-300">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => navigate('/signup')}
              >
                Start Free
              </Button>
            </div>

            {/* Pro */}
            <div className="fade-in-section opacity-0 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-8 text-white transform scale-105 shadow-2xl" style={{ transitionDelay: '100ms' }}>
              <div className="bg-white/20 text-xs font-bold px-3 py-1 rounded-full inline-block mb-6">
                MOST POPULAR
              </div>
              <div className="mb-8">
                <h3 className="text-2xl font-bold mb-2">Pro</h3>
                <div className="text-5xl font-bold mb-2">
                  $19
                </div>
                <div className="opacity-90">per month</div>
              </div>
              <ul className="space-y-4 mb-8">
                {[
                  "Unlimited presentations",
                  "Priority AI processing",
                  "Export to PowerPoint",
                  "Premium templates",
                  "Real-time collaboration",
                  "Custom branding",
                  "Priority support"
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="w-full bg-white text-orange-600 hover:bg-zinc-100"
                onClick={() => navigate('/signup')}
              >
                Start Pro Trial
              </Button>
            </div>

            {/* Team */}
            <div className="fade-in-section opacity-0 bg-white dark:bg-zinc-800 rounded-2xl p-8 border-2 border-zinc-200 dark:border-zinc-700" style={{ transitionDelay: '200ms' }}>
              <div className="mb-8">
                <h3 className="text-2xl font-bold mb-2 text-zinc-900 dark:text-zinc-100">Team</h3>
                <div className="text-5xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                  $49
                </div>
                <div className="text-zinc-600 dark:text-zinc-400">per user/month</div>
              </div>
              <ul className="space-y-4 mb-8">
                {[
                  "Everything in Pro",
                  "Team workspaces",
                  "Advanced permissions",
                  "SSO & SAML",
                  "Custom integrations",
                  "Analytics dashboard",
                  "Dedicated support"
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-zinc-700 dark:text-zinc-300">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => navigate('/signup')}
              >
                Contact Sales
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 px-6 bg-gradient-to-br from-orange-500 to-pink-600 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-4xl mx-auto text-center relative z-10 fade-in-section opacity-0">
          <h2
            className="mb-6"
            style={{
              fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
              fontWeight: 900,
              fontSize: 'clamp(36px, 5vw, 72px)',
              lineHeight: '95%',
              textTransform: 'uppercase'
            }}
          >
            Stop Making
            <br />
            Boring Decks
          </h2>
          <p className="text-xl md:text-2xl opacity-90 mb-8 max-w-2xl mx-auto">
            Join 2,400+ professionals creating presentations that actually impress.
          </p>
          <Button
            size="lg"
            className="bg-white text-orange-600 hover:bg-zinc-100 px-12 py-6 text-lg font-bold shadow-2xl"
            onClick={() => navigate('/signup')}
          >
            Start Creating for Free
            <ArrowRight className="ml-2" />
          </Button>
          <div className="mt-6 text-sm opacity-75">
            No credit card required • 5 free presentations • Cancel anytime
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-zinc-900 text-zinc-400 py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div>
              <div className="text-white mb-4" style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif' }}>
                <BrandWordmark tag="h3" sizePx={18} textColor="#ffffff" />
              </div>
              <p className="text-sm">
                AI-powered presentations that don't suck.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#how-it-works" className="hover:text-white transition-colors">How it Works</a></li>
                <li><a href="/signup" className="hover:text-white transition-colors">Sign Up</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-zinc-800 pt-8 text-center text-sm">
            <p>&copy; 2025 NextSlide. Built with Claude AI.</p>
          </div>
        </div>
      </footer>

      {/* CSS for animations */}
      <style>{`
        .noise-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          opacity: 0.03;
          z-index: 1;
          pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
        }

        html, body {
          overflow-x: hidden;
        }

        html {
          scroll-behavior: smooth;
        }

        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .fade-in-section {
          transition: opacity 0.6s ease-out, transform 0.6s ease-out;
        }

        .fade-in-section.animate-in {
          opacity: 1 !important;
          animation: fade-in 0.6s ease-out forwards;
        }

        @keyframes bounce {
          0%, 100% {
            transform: translateY(0) translateX(-50%);
          }
          50% {
            transform: translateY(-10px) translateX(-50%);
          }
        }

        .animate-bounce {
          animation: bounce 2s infinite;
        }
      `}</style>
    </div>
  );
};

export default Landing;
