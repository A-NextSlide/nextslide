import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BROWSER } from '@/utils/browser';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import BrandWordmark from '@/components/common/BrandWordmark';
import { cn } from '@/lib/utils';
import {
  ArrowRight, Check, Menu, X,
  Zap, TrendingUp, Palette, Share2,
  Target, BarChart3, Sparkles, Clock,
  GraduationCap, BookOpen, Users, Download,
  Megaphone, LineChart, Lightbulb, Repeat,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/SupabaseAuthContext';
import { trackLandingPageViewed, trackLandingPageCtaClicked } from '@/services/analytics';
import { showcaseApi, type ShowcaseDeck } from '@/services/showcaseApi';
import { showcaseService } from '@/services/showcaseService';
import type { ShowcaseDeck as FeaturedDeck } from '@/services/showcaseService';
import InteractiveHero, { type PromptItem } from '@/components/landing/InteractiveHero';
import ExpandableUseCases from '@/components/landing/ExpandableUseCases';
import CommunityShowcase from '@/components/landing/CommunityShowcase';
import type { LandingPageConfig } from '@/config/landingPages';

// Icon mapping from string names to Lucide components
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Zap,
  TrendingUp,
  Palette,
  Share2,
  Target,
  BarChart3,
  Sparkles,
  Clock,
  GraduationCap,
  BookOpen,
  Users,
  Download,
  Megaphone,
  LineChart,
  Lightbulb,
  Repeat,
};

function getIcon(name: string): React.ComponentType<{ className?: string }> {
  return iconMap[name] || Sparkles;
}

// Topic-specific prompts for the interactive slide viewer per use case
// deckIndex maps to featured_decks display_order (0-indexed)
const USE_CASE_PROMPTS: Record<string, PromptItem[]> = {
  'pitch-deck': [
    { id: 'saas-metrics', badge: 'SaaS', icon: BarChart3, text: "SaaS Metrics Dashboard: The 12 Numbers Every Founder Must Track", theme: 'light', deckIndex: 4 },
    { id: 'series-b', badge: 'Series B', icon: TrendingUp, text: "Series B Fundraising Playbook: From $10M to $50M ARR", theme: 'light', deckIndex: 2 },
    { id: 'marketplace', badge: 'Marketplace', icon: Sparkles, text: "Two-Sided Marketplace Pitch: Solving the Chicken-and-Egg Problem", theme: 'orange', deckIndex: 5 },
    { id: 'fintech', badge: 'Fintech', icon: Zap, text: "Fintech Disruption: Neobanks, BNPL, and Embedded Finance", theme: 'light', deckIndex: 66 },
    { id: 'ecommerce', badge: 'Ecommerce', icon: Target, text: "Scaling an Ecommerce Brand from $0 to $1M in 12 Months", theme: 'light', deckIndex: 38 },
    { id: 'crypto', badge: 'Finance', icon: BarChart3, text: "Cryptocurrency Market Analysis: DeFi, NFTs, and Layer 2 Trends", theme: 'light', deckIndex: 13 },
    { id: 'travel', badge: 'Travel Tech', icon: Sparkles, text: "Disrupting Travel: AI-Powered Personalized Trip Planning", theme: 'light', deckIndex: 46 },
    { id: 'ip', badge: 'Legal', icon: Lightbulb, text: "Intellectual Property Strategy for Startups: Patents and Trade Secrets", theme: 'light', deckIndex: 42 },
    { id: 'vc-fund', badge: 'VC Report', icon: TrendingUp, text: "Venture Capital Fund Overview: $100M Fund III Performance Report", theme: 'orange', deckIndex: 67 },
    { id: 'pricing', badge: 'Pricing', icon: BarChart3, text: "Pricing Strategy Deep Dive: Value-Based Pricing for SaaS Products", theme: 'light', deckIndex: 88 },
    { id: 'venture-studio', badge: 'Studio', icon: Sparkles, text: "The Venture Studio Model: Building Companies in Parallel", theme: 'light', deckIndex: 104 },
    { id: 'board', badge: 'Board', icon: Target, text: "Board Meeting Deck: Q4 Performance, Strategy Update, and 2025 Planning", theme: 'light', deckIndex: 87 },
    { id: 'failure', badge: 'Lessons', icon: Lightbulb, text: "Why Startups Fail: Data-Driven Analysis of 1,000 Post-Mortems", theme: 'light', deckIndex: 100 },
    { id: 'real-estate', badge: 'Investing', icon: BarChart3, text: "Real Estate Investment Analysis: Residential vs Commercial ROI", theme: 'light', deckIndex: 14 },
  ],
  'sales-deck': [
    { id: 'enterprise', badge: 'Enterprise', icon: Target, text: "Enterprise Sales Playbook: Closing Six-Figure Deals", theme: 'light', deckIndex: 11 },
    { id: 'demo', badge: 'Demo', icon: Sparkles, text: "SaaS Product Demo: Turning Free Trials into Enterprise Contracts", theme: 'orange', deckIndex: 12 },
    { id: 'customer-success', badge: 'CS', icon: TrendingUp, text: "Customer Success Playbook: Reducing Churn from 8% to 2%", theme: 'light', deckIndex: 75 },
    { id: 'channel', badge: 'Partners', icon: Users, text: "Channel Partner Program: Scaling Revenue Through Strategic Alliances", theme: 'light', deckIndex: 76 },
    { id: 'brand', badge: 'Brand', icon: Palette, text: "Brand Positioning Strategy: Standing Out in a Crowded Market", theme: 'light', deckIndex: 9 },
    { id: 'journey', badge: 'Journey', icon: Target, text: "Customer Journey Mapping: Every Touchpoint from Awareness to Advocacy", theme: 'light', deckIndex: 89 },
    { id: 'd2c', badge: 'DTC', icon: Zap, text: "Direct-to-Consumer Brand Strategy: Building Loyalty Without Retailers", theme: 'orange', deckIndex: 41 },
    { id: 'supply', badge: 'Supply Chain', icon: BarChart3, text: "Supply Chain Resilience: Lessons from Global Disruptions", theme: 'light', deckIndex: 59 },
    { id: 'hotel', badge: 'Hospitality', icon: Sparkles, text: "Hotel Revenue Management: Dynamic Pricing Strategies for Max Occupancy", theme: 'light', deckIndex: 47 },
    { id: 'restaurant', badge: 'Restaurant', icon: Lightbulb, text: "Restaurant Business Plan: From Concept to Grand Opening", theme: 'light', deckIndex: 64 },
    { id: 'digital', badge: 'Digital', icon: Target, text: "Digital Transformation Roadmap: Legacy to Cloud-Native in 18 Months", theme: 'light', deckIndex: 21 },
    { id: 'esg', badge: 'ESG', icon: Sparkles, text: "ESG Report: Our Journey Toward Net Zero by 2035", theme: 'light', deckIndex: 48 },
    { id: 'org', badge: 'Org Change', icon: Users, text: "Organizational Restructuring: From Silos to Cross-Functional Teams", theme: 'light', deckIndex: 23 },
    { id: 'real-estate', badge: 'Real Estate', icon: BarChart3, text: "Real Estate Investment Analysis: Residential vs Commercial ROI", theme: 'light', deckIndex: 14 },
  ],
  education: [
    { id: 'solar', badge: 'Space', icon: Sparkles, text: "A Tour of Our Solar System: From Mercury to the Kuiper Belt", theme: 'light', deckIndex: 0 },
    { id: 'writing', badge: 'Writing', icon: BookOpen, text: "Creative Writing Workshop: Crafting Stories That Stick", theme: 'light', deckIndex: 6 },
    { id: 'ml', badge: 'AI/ML', icon: Zap, text: "Machine Learning for Beginners: From Data to Predictions", theme: 'orange', deckIndex: 7 },
    { id: 'ww2', badge: 'History', icon: BookOpen, text: "World War II: A Visual Timeline of the Global Conflict", theme: 'light', deckIndex: 8 },
    { id: 'egypt', badge: 'Ancient', icon: GraduationCap, text: "Ancient Egypt: Pyramids, Pharaohs, and the Nile Civilization", theme: 'light', deckIndex: 18 },
    { id: 'music', badge: 'Music', icon: Lightbulb, text: "Music Theory Crash Course: Scales, Chords, and Progressions", theme: 'light', deckIndex: 19 },
    { id: 'space', badge: 'Future', icon: Sparkles, text: "The Future of Space Exploration: Mars Colonies to Interstellar Travel", theme: 'light', deckIndex: 34 },
    { id: 'sleep', badge: 'Health', icon: Users, text: "The Science of Sleep: Why Your Brain Needs 8 Hours", theme: 'orange', deckIndex: 36 },
    { id: 'speaking', badge: 'Skills', icon: Target, text: "The Art of Public Speaking: From Nervous to Confident in 10 Steps", theme: 'light', deckIndex: 54 },
    { id: 'genetics', badge: 'Biology', icon: Sparkles, text: "Genetics and DNA: The Blueprint of Life", theme: 'light', deckIndex: 61 },
    { id: 'climate-kids', badge: 'Climate', icon: Lightbulb, text: "Climate Change for Kids: What's Happening to Our Planet", theme: 'light', deckIndex: 68 },
    { id: 'psychology', badge: 'Psych', icon: GraduationCap, text: "Introduction to Psychology: How the Mind Works", theme: 'light', deckIndex: 69 },
    { id: 'dinosaurs', badge: 'Dinos', icon: Sparkles, text: "The Age of Dinosaurs: 165 Million Years of Prehistoric Life", theme: 'light', deckIndex: 79 },
    { id: 'languages', badge: 'Linguistics', icon: BookOpen, text: "The Science of Language Learning: Why Immersion Beats Textbooks", theme: 'light', deckIndex: 84 },
  ],
  marketing: [
    { id: 'brand', badge: 'Brand', icon: Palette, text: "Brand Positioning Strategy: Standing Out in a Crowded Market", theme: 'light', deckIndex: 9 },
    { id: 'email', badge: 'Email', icon: Target, text: "Email Marketing Masterclass: Sequences That Convert at 40%", theme: 'orange', deckIndex: 10 },
    { id: 'd2c', badge: 'DTC', icon: Zap, text: "Direct-to-Consumer Brand Strategy: Building Loyalty Without Retailers", theme: 'light', deckIndex: 41 },
    { id: 'launch', badge: 'Launch', icon: Sparkles, text: "Go-to-Market Launch Plan: Coordinating Product, Sales, and Marketing", theme: 'light', deckIndex: 51 },
    { id: 'podcast', badge: 'Podcast', icon: Megaphone, text: "Building a Podcast Empire: Content Strategy to Monetization", theme: 'light', deckIndex: 63 },
    { id: 'influencer', badge: 'Influencer', icon: Users, text: "Influencer Marketing Strategy: Micro vs Macro vs Nano Creators", theme: 'light', deckIndex: 72 },
    { id: 'seo', badge: 'SEO', icon: BarChart3, text: "SEO Strategy for 2025: Technical, Content, and Authority Building", theme: 'orange', deckIndex: 74 },
    { id: 'journey', badge: 'Journey', icon: Target, text: "Customer Journey Mapping: Every Touchpoint from Awareness to Advocacy", theme: 'light', deckIndex: 89 },
    { id: 'streaming', badge: 'Media', icon: Sparkles, text: "The Streaming Wars: Who Wins When Everyone Has a Platform", theme: 'light', deckIndex: 62 },
    { id: 'growth', badge: 'Growth', icon: TrendingUp, text: "Growth Hacking Playbook: 10 Tactics from 0 to 1M Users", theme: 'light', deckIndex: 20 },
    { id: 'ui-trends', badge: 'Design', icon: Palette, text: "UI Design Trends 2025: Glassmorphism, 3D, and Spatial Computing", theme: 'light', deckIndex: 57 },
    { id: 'data-viz', badge: 'Data', icon: BarChart3, text: "The Art of Data Visualization: Telling Stories with Charts", theme: 'light', deckIndex: 105 },
    { id: 'coffee', badge: 'Industry', icon: Lightbulb, text: "The $500 Billion Coffee Industry: From Bean to Cup Economics", theme: 'light', deckIndex: 81 },
    { id: 'anime', badge: 'Culture', icon: Sparkles, text: "The History of Anime: From Astro Boy to Demon Slayer", theme: 'light', deckIndex: 80 },
  ],
};

interface UseCaseLandingProps {
  config: LandingPageConfig;
}

const UseCaseLanding: React.FC<UseCaseLandingProps> = ({ config }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSignedIn = !!user;
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [featuredDecks, setFeaturedDecks] = useState<FeaturedDeck[]>([]);
  const [isLoadingDecks, setIsLoadingDecks] = useState(true);

  // SEO: Set document title and meta description
  useEffect(() => {
    document.title = config.metaTitle;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', config.metaDescription);
    } else {
      const meta = document.createElement('meta');
      meta.name = 'description';
      meta.content = config.metaDescription;
      document.head.appendChild(meta);
    }
  }, [config.metaTitle, config.metaDescription]);

  // Track page view
  useEffect(() => {
    trackLandingPageViewed({ slug: config.slug, type: 'use_case' });
  }, [config.slug]);

  // Load featured decks for the interactive slide viewer
  useEffect(() => {
    showcaseService.getFeaturedDecks(120).then(decks => {
      setFeaturedDecks(decks);
      setIsLoadingDecks(false);
    }).catch(() => setIsLoadingDecks(false));
  }, []);

  // Enable scrolling
  useEffect(() => {
    document.documentElement.style.position = '';
    document.documentElement.style.overflow = '';
    document.body.style.position = '';
    document.body.style.overflow = '';
  }, []);

  // Scroll handler for nav styling
  useEffect(() => {
    let lastScrolled = false;
    const handleScroll = () => {
      const scrolled = window.scrollY > 20;
      if (scrolled !== lastScrolled) {
        lastScrolled = scrolled;
        setIsScrolled(scrolled);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Fetch community presentations for this category
  const { data: showcaseData } = useQuery({
    queryKey: ['landing-showcase', config.communityCategory],
    queryFn: () => showcaseApi.getShowcase({
      category: config.communityCategory,
      sort: 'most_popular',
      limit: 6,
    }),
    enabled: !!config.communityCategory,
    staleTime: 300_000,
  });
  const showcaseDecks = showcaseData?.decks || [];

  const handleCtaClick = () => {
    trackLandingPageCtaClicked({ slug: config.slug, cta: config.ctaText });
    if (isSignedIn) {
      navigate('/app');
    } else {
      navigate('/signup');
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
    },
  };

  return (
    <div className="min-h-screen bg-[#FCFBF8] dark:bg-[#0a0a0a] overflow-x-clip">
      {/* Navigation */}
      <nav
        className={cn(
          'fixed top-0 w-full z-50 transition-all duration-300',
          isScrolled
            ? 'bg-[#FCFBF8]/90 dark:bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-black/10 dark:border-white/10'
            : 'bg-transparent'
        )}
      >
        <div className="max-w-[1400px] mx-auto px-8 py-4 flex items-center justify-between">
          <div className="cursor-pointer" onClick={() => navigate(BROWSER.isNativeApp ? '/app' : '/')}>
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
            <div className="px-6 py-4 flex flex-col gap-3">
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

      {/* Hero Section */}
      <section className={cn('relative pt-32 sm:pt-40 pb-20 px-4 sm:px-8 overflow-hidden')}>
        {/* Gradient Background */}
        <div className={cn('absolute inset-0 bg-gradient-to-br opacity-[0.07]', config.heroGradient)} />
        {/* Animated background shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className={cn('absolute -top-20 -right-20 w-96 h-96 rounded-full bg-gradient-to-br opacity-[0.08] blur-3xl', config.heroGradient)}
            animate={{ scale: [1, 1.2, 1], rotate: [0, 45, 0] }}
            transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className={cn('absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-gradient-to-tr opacity-[0.06] blur-3xl', config.heroGradient)}
            animate={{ scale: [1.2, 1, 1.2], rotate: [0, -30, 0] }}
            transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        <div className="relative z-10 max-w-[1000px] mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          >
            <h1
              className="text-black dark:text-white mb-6"
              style={{
                fontFamily: '"HK Grotesk Wide", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(36px, 6vw, 72px)',
                lineHeight: '1.05',
                letterSpacing: '-0.02em',
                textTransform: 'uppercase',
              }}
            >
              {config.headline}
            </h1>
          </motion.div>

          <motion.p
            className="text-xl sm:text-2xl text-black/60 dark:text-white/60 max-w-2xl mx-auto mb-10 font-light"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15, ease: [0.4, 0, 0.2, 1] }}
          >
            {config.subheadline}
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: [0.4, 0, 0.2, 1] }}
          >
            <Button
              size="lg"
              onClick={handleCtaClick}
              className="bg-[#FF4301] hover:bg-[#E63901] text-white px-10 py-7 text-lg font-bold shadow-lg shadow-orange-500/20"
            >
              {config.ctaText}
              <ArrowRight className="ml-3 w-5 h-5" />
            </Button>
          </motion.div>

          <motion.p
            className="text-sm text-black/40 dark:text-white/40 mt-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.45 }}
          >
            {config.ctaSubtext}
          </motion.p>

          {/* Trust badges */}
          <motion.div
            className="flex flex-wrap items-center justify-center gap-6 mt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <div className="flex items-center gap-2 px-4 py-2 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm rounded-full border border-black/5 dark:border-white/5">
              <Check className="w-3 h-3 text-[#FF4301]" />
              <span className="text-xs font-medium text-black/60 dark:text-white/60 tracking-wide">Free to start</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm rounded-full border border-black/5 dark:border-white/5">
              <Check className="w-3 h-3 text-[#FF4301]" />
              <span className="text-xs font-medium text-black/60 dark:text-white/60 tracking-wide">No credit card needed</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Interactive Slide Viewer */}
      <InteractiveHero
        decks={featuredDecks}
        isLoading={isLoadingDecks}
        prompts={USE_CASE_PROMPTS[config.slug]}
      />

      {/* Features Grid */}
      <section className="py-20 px-4 sm:px-8 bg-white dark:bg-zinc-950">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.6 }}
          >
            <h2
              className="text-black dark:text-white mb-4"
              style={{
                fontFamily: '"HK Grotesk Wide", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(28px, 4vw, 48px)',
                lineHeight: '1.1',
                letterSpacing: '-0.02em',
                textTransform: 'uppercase',
              }}
            >
              Everything you need
            </h2>
            <p className="text-lg text-black/60 dark:text-white/60 max-w-xl mx-auto">
              Powerful features designed for {config.title.toLowerCase().replace('ai ', '').replace(' maker', '')}
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
          >
            {config.features.map((feature, i) => {
              const Icon = getIcon(feature.icon);
              return (
                <motion.div
                  key={i}
                  variants={itemVariants}
                  className="group p-6 rounded-2xl bg-[#FCFBF8] dark:bg-zinc-900 border border-black/5 dark:border-white/5 hover:border-[#FF4301]/30 hover:bg-[#FF4301]/5 transition-all duration-200"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#FF4301]/10 flex items-center justify-center mb-4 group-hover:bg-[#FF4301]/20 transition-colors">
                    <Icon className="w-6 h-6 text-[#FF4301]" />
                  </div>
                  <h3
                    className="text-lg font-bold text-black dark:text-white mb-2"
                    style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
                  >
                    {feature.title}
                  </h3>
                  <p className="text-sm text-black/60 dark:text-white/60 leading-relaxed">
                    {feature.description}
                  </p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* Use Cases Section — Expandable */}
      <ExpandableUseCases config={config} sectionTitle="Perfect for" />

      {/* Community Presentations */}
      <CommunityShowcase
        decks={showcaseDecks}
        config={config}
        title="Made by the community"
        subtitle="See what others are creating with NextSlide"
      />

      {/* How It Works */}
      <section className="py-20 px-4 sm:px-8 bg-white dark:bg-zinc-950">
        <div className="max-w-[1000px] mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.6 }}
          >
            <h2
              className="text-black dark:text-white mb-4"
              style={{
                fontFamily: '"HK Grotesk Wide", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(28px, 4vw, 48px)',
                lineHeight: '1.1',
                letterSpacing: '-0.02em',
                textTransform: 'uppercase',
              }}
            >
              How it works
            </h2>
            <p className="text-lg text-black/60 dark:text-white/60 max-w-xl mx-auto">
              Three steps to a professional presentation
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
          >
            {[
              { step: '1', title: 'Describe your topic', description: 'Tell the AI what your presentation is about. Add context, goals, or upload documents for reference.' },
              { step: '2', title: 'AI generates slides', description: 'In seconds, get a complete, professionally designed presentation with charts, visuals, and polished content.' },
              { step: '3', title: 'Edit & share', description: 'Fine-tune with the AI editor or drag-and-drop. Export to PowerPoint, PDF, or share via a link.' },
            ].map((item, i) => (
              <motion.div
                key={i}
                variants={itemVariants}
                className="relative p-6 rounded-2xl bg-[#FCFBF8] dark:bg-zinc-900 border border-black/5 dark:border-white/5"
              >
                <div className="w-10 h-10 rounded-full bg-[#FF4301] text-white flex items-center justify-center text-lg font-bold mb-4" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                  {item.step}
                </div>
                <h3
                  className="text-lg font-bold text-black dark:text-white mb-2"
                  style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
                >
                  {item.title}
                </h3>
                <p className="text-sm text-black/60 dark:text-white/60 leading-relaxed">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-24 px-4 sm:px-8 bg-[#FF4301] text-white">
        <motion.div
          className="max-w-[800px] mx-auto text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.6 }}
        >
          <h2
            className="mb-6"
            style={{
              fontFamily: '"HK Grotesk Wide", sans-serif',
              fontWeight: 900,
              fontSize: 'clamp(36px, 5vw, 64px)',
              lineHeight: '1.05',
              letterSpacing: '-0.02em',
              textTransform: 'uppercase',
            }}
          >
            {config.ctaText}
          </h2>
          <p className="text-xl opacity-90 mb-10 max-w-xl mx-auto">
            {config.ctaSubtext}
          </p>
          <Button
            size="lg"
            className="bg-white text-[#FF4301] hover:bg-zinc-100 px-12 py-7 text-lg font-bold shadow-xl"
            onClick={handleCtaClick}
          >
            {isSignedIn ? 'Go to Slides' : 'Get Started Free'}
            <ArrowRight className="ml-3 w-6 h-6" />
          </Button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="bg-black text-white/60 py-12 px-8">
        <div className="max-w-[1400px] mx-auto text-center">
          <div className="cursor-pointer inline-block" onClick={() => navigate(BROWSER.isNativeApp ? '/app' : '/')}>
            <BrandWordmark
              tag="h3"
              sizePx={16}
              textColor="#ffffff"
              xImageUrl="/brand/nextslide-x.png"
              gapLeftPx={-3}
              gapRightPx={-8}
              liftPx={-4}
              xLiftPx={-4}
              rightLiftPx={0}
            />
          </div>
          <p className="text-sm mt-4">&copy; 2026 NextSlide. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default UseCaseLanding;
