import React from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, Eye, Layers, Sparkles, ArrowUpRight } from 'lucide-react';
import MiniSlide from '@/components/deck/MiniSlide';
import type { LandingPageConfig } from '@/config/landingPages';

interface ShowcaseDeck {
  id: string;
  title: string;
  thumbnailUrl?: string;
  firstSlide?: any;
  authorName?: string;
  slideCount: number;
  viewCount: number;
}

interface CommunityShowcaseProps {
  decks: ShowcaseDeck[];
  config: LandingPageConfig;
  title?: string;
  subtitle?: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
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

const CommunityShowcase: React.FC<CommunityShowcaseProps> = ({
  decks,
  config,
  title = 'Made by the community',
  subtitle = 'See what others are creating with NextSlide',
}) => {
  const navigate = useNavigate();

  if (decks.length === 0) return null;

  // First deck gets hero treatment, rest get regular cards
  const heroDeck = decks[0];
  const gridDecks = decks.slice(1, 7);

  return (
    <section className="py-20 px-4 sm:px-8 bg-white dark:bg-zinc-950">
      <div className="max-w-[1200px] mx-auto">
        {/* Header */}
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FF4301]/8 border border-[#FF4301]/15 mb-6">
            <Sparkles className="w-3.5 h-3.5 text-[#FF4301]" />
            <span className="text-xs font-bold text-[#FF4301] uppercase tracking-wider" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
              Community
            </span>
          </div>

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
            {title}
          </h2>
          <p className="text-lg text-black/60 dark:text-white/60 max-w-xl mx-auto">
            {subtitle}
          </p>
        </motion.div>

        {/* Hero card + grid layout */}
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
        >
          {/* Hero deck — large feature card */}
          <motion.div
            variants={itemVariants}
            className="group relative rounded-2xl overflow-hidden bg-[#FCFBF8] dark:bg-zinc-900 border border-black/5 dark:border-white/5 hover:border-[#FF4301]/30 transition-all duration-300 cursor-pointer"
            onClick={() => navigate(`/community/${heroDeck.id}`)}
          >
            <div className="aspect-video relative overflow-hidden bg-zinc-100 dark:bg-zinc-800">
              {heroDeck.thumbnailUrl ? (
                <img
                  src={heroDeck.thumbnailUrl}
                  alt={heroDeck.title}
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                  loading="lazy"
                />
              ) : heroDeck.firstSlide ? (
                <div className="absolute inset-0">
                  <MiniSlide
                    slide={heroDeck.firstSlide}
                    className="w-full h-full"
                  />
                </div>
              ) : (
                <div className={cn('w-full h-full bg-gradient-to-br flex items-center justify-center p-8', config.heroGradient)}>
                  <div className="w-full h-full bg-white/90 dark:bg-zinc-800/90 rounded-xl shadow-lg flex items-center justify-center p-6">
                    <p className="text-base font-bold text-black/70 dark:text-white/70 text-center" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                      {heroDeck.title}
                    </p>
                  </div>
                </div>
              )}

              {/* Gradient overlay at bottom */}
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />

              {/* Title overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <h3 className="font-bold text-white text-lg line-clamp-2 mb-1.5" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                  {heroDeck.title}
                </h3>
                <div className="flex items-center gap-3 text-xs text-white/70">
                  {heroDeck.authorName && <span>{heroDeck.authorName}</span>}
                  <span className="flex items-center gap-1"><Layers className="w-3 h-3" />{heroDeck.slideCount} slides</span>
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{heroDeck.viewCount}</span>
                </div>
              </div>

              {/* Hover arrow */}
              <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowUpRight className="w-4 h-4 text-white" />
              </div>
            </div>
          </motion.div>

          {/* Right column — 2x2 smaller cards */}
          <div className="grid grid-cols-2 gap-4">
            {gridDecks.slice(0, 4).map((deck) => (
              <motion.div
                key={deck.id}
                variants={itemVariants}
                className="group rounded-xl overflow-hidden bg-[#FCFBF8] dark:bg-zinc-900 border border-black/5 dark:border-white/5 hover:border-[#FF4301]/30 transition-all duration-200 cursor-pointer"
                onClick={() => navigate(`/community/${deck.id}`)}
              >
                <div className="aspect-video relative overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                  {deck.thumbnailUrl ? (
                    <img
                      src={deck.thumbnailUrl}
                      alt={deck.title}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : deck.firstSlide ? (
                    <div className="absolute inset-0">
                      <MiniSlide
                        slide={deck.firstSlide}
                        className="w-full h-full"
                      />
                    </div>
                  ) : (
                    <div className={cn('w-full h-full bg-gradient-to-br opacity-60', config.heroGradient)} />
                  )}

                  {/* Slide count badge */}
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold">
                    {deck.slideCount} slides
                  </div>
                </div>
                <div className="p-3">
                  <h3 className="font-semibold text-black dark:text-white text-xs line-clamp-1" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                    {deck.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-black/40 dark:text-white/40">
                    <span className="flex items-center gap-0.5"><Eye className="w-2.5 h-2.5" />{deck.viewCount}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Bottom row — remaining cards */}
        {gridDecks.length > 4 && (
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
          >
            {gridDecks.slice(4).map((deck) => (
              <motion.div
                key={deck.id}
                variants={itemVariants}
                className="group flex items-center gap-3 p-3 rounded-xl bg-[#FCFBF8] dark:bg-zinc-900 border border-black/5 dark:border-white/5 hover:border-[#FF4301]/30 transition-all duration-200 cursor-pointer"
                onClick={() => navigate(`/community/${deck.id}`)}
              >
                <div className="w-20 h-12 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 flex-shrink-0">
                  {deck.thumbnailUrl ? (
                    <img src={deck.thumbnailUrl} alt={deck.title} className="w-full h-full object-cover" loading="lazy" />
                  ) : deck.firstSlide ? (
                    <MiniSlide slide={deck.firstSlide} className="w-full h-full" />
                  ) : (
                    <div className={cn('w-full h-full bg-gradient-to-br opacity-40', config.heroGradient)} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-black dark:text-white text-xs line-clamp-1" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                    {deck.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-black/40 dark:text-white/40">
                    <span>{deck.slideCount} slides</span>
                    <span>{deck.viewCount} views</span>
                  </div>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-black/20 dark:text-white/20 group-hover:text-[#FF4301] transition-colors flex-shrink-0" />
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* CTA area */}
        <div className="text-center flex flex-wrap items-center justify-center gap-4">
          <Button
            onClick={() => navigate('/showcase')}
            className="bg-[#FF4301] hover:bg-[#E63901] text-white px-8 py-6 text-sm font-bold shadow-lg shadow-orange-500/20"
          >
            Explore all presentations
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
          {config.templateCategory && (
            <Button
              variant="outline"
              className="border-black/10 dark:border-white/10 text-black/60 dark:text-white/60 hover:border-[#FF4301]/30 hover:text-[#FF4301] px-8 py-6 text-sm font-bold"
              onClick={() => navigate(`/templates/category/${config.templateCategory}`)}
            >
              Browse templates
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </section>
  );
};

export default CommunityShowcase;
