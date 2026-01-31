import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import BrandWordmark from '@/components/common/BrandWordmark';
import { cn } from '@/lib/utils';
import {
  ArrowRight, Check, Menu, X,
  Zap, Palette, Share2,
  BarChart3, Sparkles, Clock,
  Users, Rocket, DollarSign, Award,
  Brain, Repeat, Briefcase, FileText, Lock,
  Eye, Layers,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/SupabaseAuthContext';
import { trackLandingPageViewed, trackLandingPageCtaClicked } from '@/services/analytics';
import { showcaseApi, type ShowcaseDeck } from '@/services/showcaseApi';
import { showcaseService } from '@/services/showcaseService';
import type { ShowcaseDeck as FeaturedDeck } from '@/services/showcaseService';
import InteractiveHero, { type PromptItem } from '@/components/landing/InteractiveHero';
import type { LandingPageConfig } from '@/config/landingPages';

// Icon mapping from string names to Lucide components
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Zap,
  Palette,
  Share2,
  BarChart3,
  Sparkles,
  Clock,
  Users,
  Rocket,
  DollarSign,
  Award,
  Brain,
  Repeat,
  Briefcase,
  FileText,
  Lock,
};

function getIcon(name: string): React.ComponentType<{ className?: string }> {
  return iconMap[name] || Sparkles;
}

// Topic-specific prompts for the interactive slide viewer per industry
// deckIndex maps to featured_decks display_order (0-indexed)
const INDUSTRY_PROMPTS: Record<string, PromptItem[]> = {
  startups: [
    { id: 'pitch', badge: 'Pitch', icon: Rocket, text: "Pitch deck for VCs who've already seen 500 this month", theme: 'light', deckIndex: 0 },
    { id: 'funding', badge: 'Funding', icon: DollarSign, text: "Series A narrative showing 10x growth potential", theme: 'light', deckIndex: 12 },
    { id: 'demo', badge: 'Demo', icon: Zap, text: "Demo day pitch that actually fits in 3 minutes", theme: 'orange', deckIndex: 4 },
    { id: 'metrics', badge: 'Metrics', icon: BarChart3, text: "Investor update that makes everyone reply", theme: 'light', deckIndex: 13 },
    { id: 'team', badge: 'Team', icon: Users, text: "All-hands deck that actually gets people excited", theme: 'light', deckIndex: 14 },
  ],
  educators: [
    { id: 'biology', badge: 'Science', icon: Sparkles, text: "Cellular Respiration: From Glucose to ATP", theme: 'light', deckIndex: 5 },
    { id: 'lecture', badge: 'Lecture', icon: Brain, text: "Algebra for kids who ask 'when will I use this'", theme: 'light', deckIndex: 2 },
    { id: 'history', badge: 'History', icon: Clock, text: "The French Revolution: From Monarchy to Republic", theme: 'orange', deckIndex: 6 },
    { id: 'workshop', badge: 'Workshop', icon: Users, text: "Interactive workshop that keeps everyone engaged", theme: 'light', deckIndex: 15 },
    { id: 'visual', badge: 'Visual', icon: Palette, text: "Science experiment walkthrough with visual steps", theme: 'light', deckIndex: 16 },
  ],
  marketers: [
    { id: 'social', badge: 'Social', icon: Sparkles, text: "Social media strategy that actually converts", theme: 'light', deckIndex: 11 },
    { id: 'campaign', badge: 'Campaign', icon: BarChart3, text: "Q4 campaign report that gets budget approved", theme: 'orange', deckIndex: 17 },
    { id: 'brand', badge: 'Brand', icon: Palette, text: "Brand positioning deck the C-suite remembers", theme: 'light', deckIndex: 18 },
    { id: 'content', badge: 'Content', icon: Repeat, text: "Content marketing roadmap with real metrics", theme: 'light', deckIndex: 19 },
    { id: 'launch', badge: 'Launch', icon: Zap, text: "Product launch campaign that breaks through noise", theme: 'light', deckIndex: 20 },
  ],
  consultants: [
    { id: 'strategy', badge: 'Strategy', icon: Briefcase, text: "Strategy analysis that reads like a McKinsey memo", theme: 'light', deckIndex: 21 },
    { id: 'proposal', badge: 'Proposal', icon: FileText, text: "Client proposal that closes itself", theme: 'orange', deckIndex: 7 },
    { id: 'research', badge: 'Research', icon: BarChart3, text: "Market research with clean data visualization", theme: 'light', deckIndex: 22 },
    { id: 'change', badge: 'Change', icon: Sparkles, text: "Change management plan with stakeholder buy-in", theme: 'light', deckIndex: 23 },
    { id: 'analysis', badge: 'Analysis', icon: Lock, text: "Competitive analysis that stays confidential", theme: 'light', deckIndex: 24 },
  ],
};

interface IndustryLandingProps {
  config: LandingPageConfig;
}

const IndustryLanding: React.FC<IndustryLandingProps> = ({ config }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSignedIn = !!user;
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [featuredDecks, setFeaturedDecks] = useState<FeaturedDeck[]>([]);
  const [isLoadingDecks, setIsLoadingDecks] = useState(true);

  // Derive the industry label from the title (e.g. "NextSlide for Startups" -> "Startups")
  const industryLabel = config.title.replace('NextSlide for ', '');

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
    trackLandingPageViewed({ slug: config.slug, type: 'industry' });
  }, [config.slug]);

  // Load featured decks for the interactive slide viewer
  useEffect(() => {
    showcaseService.getFeaturedDecks(30).then(decks => {
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
          <div className="cursor-pointer" onClick={() => navigate('/')}>
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
      <section className="relative pt-32 sm:pt-40 pb-20 px-4 sm:px-8 overflow-hidden">
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
          {/* "Built for" badge */}
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FF4301]/10 border border-[#FF4301]/20 mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Sparkles className="w-4 h-4 text-[#FF4301]" />
            <span className="text-sm font-semibold text-[#FF4301] uppercase tracking-wider" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
              Built for {industryLabel}
            </span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
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
            transition={{ duration: 0.6, delay: 0.2, ease: [0.4, 0, 0.2, 1] }}
          >
            {config.subheadline}
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35, ease: [0.4, 0, 0.2, 1] }}
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
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            {config.ctaSubtext}
          </motion.p>
        </div>
      </section>

      {/* Interactive Slide Viewer */}
      <InteractiveHero
        decks={featuredDecks}
        isLoading={isLoadingDecks}
        prompts={INDUSTRY_PROMPTS[config.slug]}
      />

      {/* Social Proof */}
      <section className="py-12 px-4 sm:px-8 bg-white dark:bg-zinc-950 border-y border-black/5 dark:border-white/5">
        <motion.div
          className="max-w-[1000px] mx-auto text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-sm font-medium text-black/40 dark:text-white/40 tracking-wide mb-6" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
            Trusted by {industryLabel.toLowerCase()} professionals worldwide
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8">
            {['Fast setup', 'AI-powered', 'Professional quality', 'Easy sharing'].map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#FF4301]" />
                <span className="text-sm font-medium text-black/60 dark:text-white/60">{item}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

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
              Built for {industryLabel}
            </h2>
            <p className="text-lg text-black/60 dark:text-white/60 max-w-xl mx-auto">
              Features designed with {industryLabel.toLowerCase()} in mind
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

      {/* Use Cases Section */}
      <section className="py-20 px-4 sm:px-8 bg-[#FCFBF8] dark:bg-[#0a0a0a]">
        <div className="max-w-[1000px] mx-auto">
          <motion.div
            className="text-center mb-12"
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
              What you can create
            </h2>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
          >
            {config.useCases.map((useCase, i) => (
              <motion.div
                key={i}
                variants={itemVariants}
                className="group flex items-center gap-4 p-5 rounded-xl bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/5 hover:border-[#FF4301]/30 transition-all duration-200 cursor-pointer"
                onClick={() => {
                  trackLandingPageCtaClicked({ slug: config.slug, cta: `use_case_${useCase}` });
                  navigate(isSignedIn ? '/app' : '/signup');
                }}
              >
                <div className="w-10 h-10 rounded-lg bg-[#FF4301]/10 flex items-center justify-center flex-shrink-0 group-hover:bg-[#FF4301]/20 transition-colors">
                  <Sparkles className="w-5 h-5 text-[#FF4301]" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-black dark:text-white" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                    {useCase}
                  </h3>
                </div>
                <ArrowRight className="w-4 h-4 text-black/30 dark:text-white/30 group-hover:text-[#FF4301] transition-colors" />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Community Presentations */}
      {showcaseDecks.length > 0 && (
        <section className="py-20 px-4 sm:px-8 bg-white dark:bg-zinc-950">
          <div className="max-w-[1200px] mx-auto">
            <motion.div
              className="text-center mb-12"
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
                Made by {industryLabel.toLowerCase()} like you
              </h2>
              <p className="text-lg text-black/60 dark:text-white/60 max-w-xl mx-auto">
                See what others are creating with NextSlide
              </p>
            </motion.div>

            <motion.div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-50px' }}
            >
              {showcaseDecks.slice(0, 6).map((deck) => (
                <motion.div
                  key={deck.id}
                  variants={itemVariants}
                  className="group rounded-2xl border border-black/5 dark:border-white/5 overflow-hidden bg-[#FCFBF8] dark:bg-zinc-900 hover:border-[#FF4301]/30 transition-all duration-200 cursor-pointer"
                  onClick={() => navigate(`/community/${deck.id}`)}
                >
                  <div className={cn('aspect-[16/10] bg-gradient-to-br flex items-center justify-center p-6', config.heroGradient)}>
                    <div className="w-full h-full bg-white/90 dark:bg-zinc-800/90 rounded-lg shadow-lg flex items-center justify-center p-4">
                      <p className="text-sm font-medium text-black/70 dark:text-white/70 text-center line-clamp-3" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                        {deck.title}
                      </p>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-black dark:text-white text-sm line-clamp-1" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                      {deck.title}
                    </h3>
                    <div className="flex items-center gap-3 mt-2 text-xs text-black/50 dark:text-white/50">
                      {deck.authorName && <span>{deck.authorName}</span>}
                      <span className="flex items-center gap-1"><Layers className="w-3 h-3" />{deck.slideCount} slides</span>
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{deck.viewCount}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            <div className="text-center mt-8 flex flex-wrap items-center justify-center gap-4">
              <Button
                variant="outline"
                className="border-[#FF4301] text-[#FF4301] hover:bg-[#FF4301]/5"
                onClick={() => navigate('/showcase')}
              >
                View all presentations
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
              {config.templateCategory && (
                <Button
                  variant="ghost"
                  className="text-black/60 dark:text-white/60 hover:text-[#FF4301]"
                  onClick={() => navigate(`/templates/category/${config.templateCategory}`)}
                >
                  Browse templates
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* How It Works */}
      <section className="py-20 px-4 sm:px-8 bg-[#FCFBF8] dark:bg-[#0a0a0a]">
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
                className="relative p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/5"
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
          <div className="cursor-pointer inline-block" onClick={() => navigate('/')}>
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

export default IndustryLanding;
