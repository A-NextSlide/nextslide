import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  ArrowRight, Sparkles, X, ChevronDown,
  Zap, TrendingUp, Palette, Share2,
  Target, BarChart3, Clock,
  GraduationCap, BookOpen, Users, Download,
  Megaphone, LineChart, Lightbulb, Repeat,
  Rocket, DollarSign, Award, Brain,
  Briefcase, FileText, Lock,
} from 'lucide-react';
import { useAuth } from '@/context/SupabaseAuthContext';
import { trackLandingPageCtaClicked } from '@/services/analytics';
import type { LandingPageConfig, UseCaseDetail } from '@/config/landingPages';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Zap, TrendingUp, Palette, Share2, Target, BarChart3, Sparkles, Clock,
  GraduationCap, BookOpen, Users, Download, Megaphone, LineChart, Lightbulb,
  Repeat, Rocket, DollarSign, Award, Brain, Briefcase, FileText, Lock,
};

function getIcon(name: string): React.ComponentType<{ className?: string }> {
  return iconMap[name] || Sparkles;
}

interface ExpandableUseCasesProps {
  config: LandingPageConfig;
  sectionTitle?: string;
}

const ExpandableUseCases: React.FC<ExpandableUseCasesProps> = ({ config, sectionTitle = 'What you can create' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSignedIn = !!user;
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const details = config.useCaseDetails || [];
  const useCases = config.useCases;

  const handleCardClick = (index: number, useCase: string) => {
    trackLandingPageCtaClicked({ slug: config.slug, cta: `use_case_${useCase}` });
    if (expandedIndex === index) {
      setExpandedIndex(null);
    } else {
      setExpandedIndex(index);
    }
  };

  const handleCta = () => {
    trackLandingPageCtaClicked({ slug: config.slug, cta: config.ctaText });
    navigate(isSignedIn ? '/app' : '/signup');
  };

  // Group use cases into rows of 2 for the expandable panel positioning
  const rows: number[][] = [];
  for (let i = 0; i < useCases.length; i += 2) {
    rows.push(useCases.map((_, idx) => idx).slice(i, i + 2));
  }

  // Find which row the expanded item is in
  const expandedRow = expandedIndex !== null ? Math.floor(expandedIndex / 2) : null;
  const expandedDetail = expandedIndex !== null ? details[expandedIndex] : null;

  return (
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
            {sectionTitle}
          </h2>
        </motion.div>

        {/* Grid with expandable panels */}
        <div className="flex flex-col gap-4">
          {rows.map((rowIndices, rowIdx) => (
            <React.Fragment key={rowIdx}>
              {/* The row of cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {rowIndices.map((i) => {
                  const useCase = useCases[i];
                  const detail = details[i];
                  const isExpanded = expandedIndex === i;
                  const Icon = detail ? getIcon(detail.icon) : Sparkles;

                  return (
                    <motion.div
                      key={i}
                      layout
                      className={cn(
                        "group relative flex items-center gap-4 p-5 rounded-xl border transition-all duration-200 cursor-pointer select-none",
                        isExpanded
                          ? "bg-[#FF4301]/5 border-[#FF4301] shadow-lg shadow-[#FF4301]/5"
                          : "bg-white dark:bg-zinc-900 border-black/5 dark:border-white/5 hover:border-[#FF4301]/30"
                      )}
                      onClick={() => handleCardClick(i, useCase)}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors",
                        isExpanded ? "bg-[#FF4301]/20" : "bg-[#FF4301]/10 group-hover:bg-[#FF4301]/20"
                      )}>
                        <Icon className="w-5 h-5 text-[#FF4301]" />
                      </div>
                      <div className="flex-1">
                        <h3
                          className="font-bold text-black dark:text-white"
                          style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
                        >
                          {useCase}
                        </h3>
                      </div>
                      <ChevronDown
                        className={cn(
                          "w-4 h-4 transition-all duration-300",
                          isExpanded
                            ? "text-[#FF4301] rotate-180"
                            : "text-black/30 dark:text-white/30 group-hover:text-[#FF4301]"
                        )}
                      />
                    </motion.div>
                  );
                })}
              </div>

              {/* Expandable panel — appears below the row */}
              <AnimatePresence>
                {expandedRow === rowIdx && expandedDetail && expandedIndex !== null && (
                  <motion.div
                    key={`panel-${rowIdx}`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="relative rounded-2xl overflow-hidden">
                      {/* Gradient background */}
                      <div className={cn('absolute inset-0 bg-gradient-to-br opacity-[0.06]', config.heroGradient)} />

                      <div className="relative p-6 sm:p-8 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm border border-[#FF4301]/20 rounded-2xl">
                        {/* Close button */}
                        <button
                          onClick={() => setExpandedIndex(null)}
                          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center text-black/40 dark:text-white/40 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                        >
                          <X size={14} />
                        </button>

                        <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 items-start">
                          {/* Left: Description */}
                          <div className="flex-1 min-w-0">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FF4301]/10 text-[#FF4301] text-xs font-bold uppercase tracking-wider mb-4">
                              {React.createElement(getIcon(expandedDetail.icon), { className: 'w-3 h-3' })}
                              {expandedDetail.name}
                            </div>

                            <p className="text-base sm:text-lg text-black/70 dark:text-white/70 leading-relaxed mb-6">
                              {expandedDetail.description}
                            </p>

                            {/* Example prompt preview */}
                            <div className="bg-black/[0.03] dark:bg-white/[0.03] rounded-xl p-4 border border-black/5 dark:border-white/5 mb-6">
                              <p className="text-xs font-semibold text-black/40 dark:text-white/40 uppercase tracking-wider mb-2">
                                Try a prompt like this
                              </p>
                              <p
                                className="text-sm sm:text-base font-semibold text-black/80 dark:text-white/80 leading-snug italic"
                                style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
                              >
                                &ldquo;{expandedDetail.examplePrompt}&rdquo;
                              </p>
                            </div>

                            <Button
                              size="lg"
                              onClick={handleCta}
                              className="bg-[#FF4301] hover:bg-[#E63901] text-white px-8 py-6 text-base font-bold shadow-lg shadow-orange-500/20"
                            >
                              {isSignedIn ? `Create ${expandedDetail.name}` : `Create Your ${expandedDetail.name} Free`}
                              <ArrowRight className="ml-2 w-5 h-5" />
                            </Button>
                            <p className="text-xs text-black/40 dark:text-white/40 mt-3">
                              {config.ctaSubtext}
                            </p>
                          </div>

                          {/* Right: Visual element — stacked cards showing what AI generates */}
                          <div className="hidden lg:flex flex-col items-center justify-center w-[280px] flex-shrink-0">
                            <div className="relative w-full">
                              {/* Background card stack */}
                              <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl bg-[#FF4301]/5 border border-[#FF4301]/10" />
                              <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-xl bg-[#FF4301]/8 border border-[#FF4301]/15" />

                              {/* Main card */}
                              <div className="relative rounded-xl bg-white dark:bg-zinc-800 border border-black/10 dark:border-white/10 p-5 shadow-xl">
                                <div className="flex items-center gap-2 mb-3">
                                  <div className="w-2 h-2 rounded-full bg-[#FF4301]" />
                                  <div className="h-2 w-20 rounded-full bg-black/10 dark:bg-white/10" />
                                </div>
                                <div className="space-y-2.5">
                                  <div className="h-3 w-full rounded bg-black/8 dark:bg-white/8" />
                                  <div className="h-3 w-4/5 rounded bg-black/6 dark:bg-white/6" />
                                  <div className="h-3 w-3/5 rounded bg-black/4 dark:bg-white/4" />
                                </div>
                                <div className="mt-4 flex gap-2">
                                  <div className="h-16 flex-1 rounded-lg bg-gradient-to-br from-[#FF4301]/10 to-[#FF4301]/5 border border-[#FF4301]/10" />
                                  <div className="h-16 flex-1 rounded-lg bg-gradient-to-br from-[#FF4301]/8 to-[#FF4301]/3 border border-[#FF4301]/8" />
                                </div>
                                <div className="mt-3 flex items-center gap-2">
                                  <Sparkles className="w-3 h-3 text-[#FF4301]" />
                                  <span className="text-[10px] font-semibold text-[#FF4301]/70 uppercase tracking-wider">AI-generated slides</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ExpandableUseCases;
