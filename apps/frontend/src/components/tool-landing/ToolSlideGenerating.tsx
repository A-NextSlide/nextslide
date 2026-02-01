import React, { useState, useEffect, useRef, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { motion, AnimatePresence } from 'framer-motion';
import type { SlideData } from '@/types/SlideTypes';
import type { GenerationProgress } from '@/hooks/useToolConversion';
import MiniSlide from '@/components/deck/MiniSlide';

// ─────────────────────────────────────────────────────────────────────────────
// Phase definitions — the "team" working on the presentation
// ─────────────────────────────────────────────────────────────────────────────

interface PhaseInfo {
  /** Backend phase key from compose pipeline */
  key: string;
  /** Role title shown to user */
  role: string;
  /** What they're doing */
  action: string;
  /** Detailed description */
  detail: string;
  /** Estimated weight in the timeline (arbitrary units, sums to ~100) */
  weight: number;
}

const PHASES: PhaseInfo[] = [
  {
    key: 'outline',
    role: 'Content Strategist',
    action: 'Structuring your story',
    detail: 'Analyzing your content and crafting a compelling narrative arc across slides',
    weight: 15,
  },
  {
    key: 'initialization',
    role: 'Project Lead',
    action: 'Setting up the project',
    detail: 'Initializing the design pipeline and preparing your presentation workspace',
    weight: 5,
  },
  {
    key: 'theme_generation',
    role: 'Brand Designer',
    action: 'Crafting your visual identity',
    detail: 'Designing a custom color palette, typography system, and brand theme',
    weight: 15,
  },
  {
    key: 'layout_design',
    role: 'Layout Architect',
    action: 'Planning slide layouts',
    detail: 'Creating unique layout blueprints optimized for each slide\'s content',
    weight: 10,
  },
  {
    key: 'image_collection',
    role: 'Visual Researcher',
    action: 'Finding perfect visuals',
    detail: 'Searching for high-quality images, icons, and graphics that match your content',
    weight: 10,
  },
  {
    key: 'slide_generation',
    role: 'Slide Designer',
    action: 'Composing each slide',
    detail: 'Building professional-grade slides with custom components and animations',
    weight: 40,
  },
  {
    key: 'finalization',
    role: 'Quality Lead',
    action: 'Final polish',
    detail: 'Reviewing design consistency, optimizing layouts, and adding finishing touches',
    weight: 5,
  },
];

// Cumulative progress breakpoints for the timer
const PHASE_BREAKPOINTS = (() => {
  const total = PHASES.reduce((s, p) => s + p.weight, 0);
  let cum = 0;
  return PHASES.map((p) => {
    const start = (cum / total) * 95; // cap at 95%
    cum += p.weight;
    const end = (cum / total) * 95;
    return { key: p.key, start, end };
  });
})();

// ─────────────────────────────────────────────────────────────────────────────
// Timer-based smooth progress (ease-out over 2 minutes)
// ─────────────────────────────────────────────────────────────────────────────

const PROGRESS_DURATION_MS = 120_000; // 2 min ceiling

function easeOutProgress(elapsed: number): number {
  const t = Math.min(elapsed / PROGRESS_DURATION_MS, 1);
  return (1 - Math.pow(1 - t, 2.5)) * 95;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface ToolSlideGeneratingProps {
  slides: SlideData[];
  progress: GenerationProgress;
}

export default function ToolSlideGenerating({ slides, progress }: ToolSlideGeneratingProps) {
  const {
    totalSlides,
    completedSlides,
    title,
    slideTitles,
    phase: backendPhase,
    phaseMessage,
    backendProgress,
  } = progress;

  // Real slide-based progress
  const realPct = totalSlides > 0 ? Math.round((completedSlides / totalSlides) * 100) : 0;

  // Smooth timer
  const [timerPct, setTimerPct] = useState(0);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      setTimerPct(easeOutProgress(elapsed));
      if (elapsed >= PROGRESS_DURATION_MS) clearInterval(interval);
    }, 150);
    return () => clearInterval(interval);
  }, []);

  // Pick highest of: timer, backend progress, or slide-completion progress
  const pct = Math.round(Math.max(timerPct, backendProgress || 0, realPct));

  // Elapsed time
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatElapsed = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return m > 0 ? `${m}m ${rem}s` : `${s}s`;
  };

  // Determine active phase from backend or infer from timer position
  const activePhaseIndex = useMemo(() => {
    // If backend tells us a phase, use it
    if (backendPhase) {
      // outline_ready means we passed the outline phase
      const idx = PHASES.findIndex((p) => p.key === backendPhase);
      if (idx >= 0) return idx;
    }
    // Infer from timer percentage
    for (let i = PHASE_BREAKPOINTS.length - 1; i >= 0; i--) {
      if (pct >= PHASE_BREAKPOINTS[i].start) return i;
    }
    return 0;
  }, [backendPhase, pct]);

  // Phase completion: phases before activePhaseIndex are done
  const getPhaseStatus = (idx: number): 'done' | 'active' | 'pending' => {
    if (idx < activePhaseIndex) return 'done';
    if (idx === activePhaseIndex) return 'active';
    return 'pending';
  };

  const activePhase = PHASES[activePhaseIndex];

  return (
    <div className="space-y-5">
      {/* ── Active phase hero ── */}
      <div className="text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={activePhase.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
          >
            <div className="inline-flex items-center gap-2 mb-1.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF4301] opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#FF4301]" />
              </span>
              <span className="text-xs font-semibold text-[#FF4301] uppercase tracking-wider">
                {activePhase.role}
              </span>
            </div>
            <h3 className="text-lg font-bold text-zinc-900">
              {activePhase.action}
            </h3>
            <p className="text-sm text-zinc-500 mt-0.5 max-w-md mx-auto">
              {phaseMessage || activePhase.detail}
            </p>
          </motion.div>
        </AnimatePresence>
        {title && (
          <p className="text-xs text-zinc-400 mt-2 truncate max-w-sm mx-auto">
            {title}
          </p>
        )}
      </div>

      {/* ── Progress bar ── */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-zinc-500">
          <span>
            {completedSlides > 0
              ? `${completedSlides} of ${totalSlides} slides`
              : `${pct}% complete`}
          </span>
          <span>{formatElapsed(elapsed)}</span>
        </div>
        <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full relative"
            style={{ background: 'linear-gradient(90deg, #FF4301, #E63901)' }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                animation: 'shimmer 1.5s infinite',
              }}
            />
          </motion.div>
        </div>
      </div>

      {/* ── Phase timeline ── */}
      <div className="space-y-0">
        {PHASES.map((phase, idx) => {
          const status = getPhaseStatus(idx);
          return (
            <div
              key={phase.key}
              className="flex items-center gap-3 py-1.5"
            >
              {/* Status indicator */}
              <div className="flex-shrink-0 w-5 flex justify-center">
                {status === 'done' ? (
                  <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : status === 'active' ? (
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF4301] opacity-60" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-[#FF4301]" />
                  </span>
                ) : (
                  <span className="block w-2 h-2 rounded-full bg-zinc-200" />
                )}
              </div>

              {/* Label */}
              <span
                className={`text-sm leading-tight transition-colors duration-300 ${
                  status === 'done'
                    ? 'text-zinc-400'
                    : status === 'active'
                    ? 'text-zinc-900 font-semibold'
                    : 'text-zinc-300'
                }`}
              >
                {phase.action}
                {status === 'active' && (
                  <span className="text-zinc-400 font-normal"> — {phase.role.toLowerCase()}</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Slide grid — thumbnails appear as they arrive ── */}
      {totalSlides > 0 && (
        <div className="grid grid-cols-3 gap-2.5 pt-1">
          {Array.from({ length: totalSlides }).map((_, i) => {
            const slide = slides[i];
            const isPlaceholder = !slide;

            return (
              <motion.div
                key={i}
                className="aspect-[16/9] rounded-lg overflow-hidden border border-zinc-200 bg-zinc-50"
                initial={{ opacity: 0.3 }}
                animate={{ opacity: isPlaceholder ? 0.35 : 1 }}
                transition={{ duration: 0.5 }}
              >
                {slide ? (
                  <MiniSlide
                    slide={slide}
                    responsive
                    forceRender
                    className="w-full h-full rounded-lg"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 px-2">
                    {slideTitles[i] ? (
                      <span className="text-[9px] text-zinc-400 text-center line-clamp-2 leading-tight">
                        {slideTitles[i]}
                      </span>
                    ) : (
                      <div className="w-4 h-4 border-2 border-zinc-200 border-t-zinc-400 rounded-full animate-spin" />
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Shimmer keyframes */}
      <style dangerouslySetInnerHTML={{
        __html: DOMPurify.sanitize(`
          @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(200%); }
          }
        `),
      }} />
    </div>
  );
}
