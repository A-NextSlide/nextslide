import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ArrowRight, ArrowLeft } from 'lucide-react';

interface GuidedTourStep {
  id: string;
  targetSelector: string;
  title: string;
  description: string;
  nextAction?: 'enterEditMode' | 'openTheme' | null;
  demo?: 'text_intro' | 'text_select' | 'chat_target' | 'tiptap_panel' | null;
}

interface GuidedTourProps {
  isOpen: boolean;
  onClose: () => void;
  steps: GuidedTourStep[];
  onAction?: (action: 'enterEditMode' | 'openTheme') => void;
}

interface SpotlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const getElementRect = (selector: string): SpotlightRect | null => {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const GuidedTour: React.FC<GuidedTourProps> = ({ isOpen, onClose, steps, onAction }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const rafRef = useRef<number | null>(null);

  const activeStep = steps[clamp(stepIndex, 0, steps.length - 1)];

  const computeSpotlight = () => {
    if (!activeStep) return setSpotlight(null);
    let rect: SpotlightRect | null = null;
    // For the theme step, prefer the popover content if present
    if (activeStep.id === 'theme') {
      rect = getElementRect('[data-tour="theme-popover"]') || getElementRect(activeStep.targetSelector);
    } else {
      rect = getElementRect(activeStep.targetSelector);
    }
    if (rect) setSpotlight(rect);
    else setSpotlight(null);
  };

  useEffect(() => {
    if (!isOpen) return;
    computeSpotlight();
    const onResize = () => computeSpotlight();
    const onScroll = () => computeSpotlight();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    const interval = setInterval(computeSpotlight, 250);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
      clearInterval(interval);
    };
  }, [isOpen, activeStep?.targetSelector]);

  // On-step-enter side effects
  useEffect(() => {
    if (!isOpen || !activeStep) return;
    // Ensure chat step: exit edit and expand
    if (activeStep.id === 'chat') {
      try {
        // Always exit edit mode for chat so the Target button is visible
        window.dispatchEvent(new CustomEvent('tour:exit-edit'));
        // Ensure chat is expanded for typing overlay
        window.dispatchEvent(new CustomEvent('tour:open-chat'));
      } catch {}
    }
    // Force white slide background when demonstrating text edits to keep visuals clean
    try {
      if (['edit', 'components', 'text-settings'].includes(activeStep.id)) {
        (window as any).__tourForceWhiteBg = true;
      } else {
        delete (window as any).__tourForceWhiteBg;
      }
    } catch {}

    // If we enter the properties step, ensure any theme popover is closed
    if (activeStep.id === 'text-settings') {
      try {
        const openTheme = document.querySelector('[data-tour="theme-popover"]');
        if (openTheme) {
          const btn = document.querySelector('[data-tour="theme-button"]') as HTMLElement | null;
          btn?.click();
        }
      } catch {}
    }
  }, [isOpen, activeStep]);

  // Global event to start the tour from DeckHeader trigger
  useEffect(() => {
    const handleStart = () => {
      try { setStepIndex(0); } catch {}
    };
    window.addEventListener('tour:start', handleStart as EventListener);
    return () => window.removeEventListener('tour:start', handleStart as EventListener);
  }, []);

  useEffect(() => {
    if (isOpen) setStepIndex(0);
  }, [isOpen]);

  const handleNext = () => {
    // Perform any action for the current step before moving on
    if (activeStep?.nextAction) {
      try {
        if (activeStep.nextAction === 'enterEditMode') {
          // Prefer parent-provided action which can set app state directly
          if (onAction) {
            onAction('enterEditMode');
          }
          // Prefer clicking the real Edit button if present to mimic user action
          const clickEditIfEnabled = (): boolean => {
            const btn = document.querySelector('[data-tour="edit-button"]') as HTMLButtonElement | null;
            if (btn && !btn.disabled) {
              btn.click();
              return true;
            }
            return false;
          };
          const tryImmediate = clickEditIfEnabled();
          if (!tryImmediate) {
            // Fallback to events and app-level handler if the button isn't available or still disabled
            window.dispatchEvent(new CustomEvent('tour:force-edit'));
            window.dispatchEvent(new CustomEvent('editor:force-edit-mode'));
            window.dispatchEvent(new CustomEvent('editor:toggle-edit-mode'));
          }
          // Wait until edit mode active or toolbar appears before advancing to next step
          const advanceWhenReady = () => {
            const toolbar = document.querySelector('[data-tour="component-toolbar"]');
            if (toolbar) {
              setStepIndex(prev => Math.min(prev + 1, steps.length - 1));
              cleanupWaiters();
            }
          };
          const onEditState = (e: any) => {
            const isEditing = !!e?.detail?.isEditing;
            if (isEditing) {
              // small delay to allow toolbar render
              setTimeout(advanceWhenReady, 50);
            }
          };
          const onSlideCompleted = () => {
            // Try clicking the button again in case it just became enabled
            clickEditIfEnabled();
            setTimeout(advanceWhenReady, 50);
          };
          // Disable auto-advance polling to require explicit Next
          const interval = null as unknown as number;
          const cleanupWaiters = () => {
            window.removeEventListener('editor:edit-mode-changed', onEditState as EventListener);
            window.removeEventListener('slide_completed', onSlideCompleted as EventListener);
            window.removeEventListener('deck_complete', onSlideCompleted as EventListener);
            window.removeEventListener('deck_generation_complete', onSlideCompleted as EventListener);
            if (interval) window.clearInterval(interval);
          };
          window.addEventListener('editor:edit-mode-changed', onEditState as EventListener);
          window.addEventListener('slide_completed', onSlideCompleted as EventListener);
          window.addEventListener('deck_complete', onSlideCompleted as EventListener);
          window.addEventListener('deck_generation_complete', onSlideCompleted as EventListener);
          // No timeout auto-advance; user proceeds with Next
          // Return early; we will advance when ready, not immediately
          return;
        } else if (activeStep.nextAction === 'openTheme') {
          if (onAction) {
            onAction('openTheme');
          }
          const themeButton = document.querySelector('[data-tour="theme-button"]') as HTMLElement | null;
          // Only click if the popover is not already open
          const alreadyOpen = !!document.querySelector('[data-tour="theme-popover"]');
          if (!alreadyOpen) themeButton?.click();
        }
      } catch {}
    }

    // Special handling: if leaving theme step, close the popover before advancing
    try {
      if (activeStep?.id === 'theme') {
        const btn = document.querySelector('[data-tour="theme-button"]') as HTMLElement | null;
        btn?.click(); // toggle to close
      }
    } catch {}

    // Advance or close
    if (stepIndex < steps.length - 1) setStepIndex(stepIndex + 1);
    else onClose();
  };

  const handleBack = () => {
    if (stepIndex > 0) {
      // If going back to edit-related step, re-enter edit mode to ensure toolbar/panel visible
      try {
        const goingTo = steps[stepIndex - 1]?.id;
        if (goingTo === 'components' || goingTo === 'text-settings') {
          window.dispatchEvent(new CustomEvent('tour:force-edit'));
        }
      } catch {}
      setStepIndex(stepIndex - 1);
    }
  };

  const overlay = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="tour-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ position: 'fixed', inset: 0, zIndex: 99999, pointerEvents: 'auto' }}
        >
          {/* Spotlight mask using radial gradient; blur and tint only outside the hole */}
          {spotlight && (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                WebkitMaskImage: `radial-gradient(12px at ${spotlight.x + spotlight.width / 2}px ${spotlight.y + spotlight.height / 2}px, transparent 0, transparent ${Math.max(spotlight.width, spotlight.height) / 2 + 32}px, black ${Math.max(spotlight.width, spotlight.height) / 2 + 36}px)`,
                maskImage: `radial-gradient(12px at ${spotlight.x + spotlight.width / 2}px ${spotlight.y + spotlight.height / 2}px, transparent 0, transparent ${Math.max(spotlight.width, spotlight.height) / 2 + 32}px, black ${Math.max(spotlight.width, spotlight.height) / 2 + 36}px)`,
                background: 'rgba(10,10,14,0.60)',
                backdropFilter: 'blur(2px)'
              }}
            />
          )}

          {/* Highlight ring and explicit theme popover circle */}
          {spotlight && (
            <motion.div
              key="highlight"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              style={{
                position: 'absolute',
                left: spotlight.x - 8,
                top: spotlight.y - 8,
                width: spotlight.width + 16,
                height: spotlight.height + 16,
                borderRadius: 10,
                boxShadow: '0 0 0 2px #FF4301, 0 8px 30px rgba(0,0,0,0.3)',
                pointerEvents: 'none'
              }}
            />
          )}
          {/* If theme popover is open, add an outer ring to emphasize it */}
          {activeStep?.id === 'theme' && (() => {
            const pop = document.querySelector('[data-tour="theme-popover"]') as HTMLElement | null;
            if (!pop) return null;
            const r = pop.getBoundingClientRect();
            return (
              <motion.div
                key="theme-popover-ring"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ position: 'absolute', left: r.left - 12, top: r.top - 12, width: r.width + 24, height: r.height + 24, borderRadius: 12, boxShadow: '0 0 0 3px #FF4301, 0 0 0 9px rgba(255,67,1,0.15)', pointerEvents: 'none' }}
              />
            );
          })()}

          {/* Callout */}
          <TourCallout
            stepIndex={stepIndex}
            stepsCount={steps.length}
            title={activeStep?.title || ''}
            description={activeStep?.description || ''}
            targetRect={spotlight}
            onClose={onClose}
            onNext={handleNext}
            onBack={handleBack}
          />

          {/* Demo overlays */}
          {activeStep?.demo === 'text_intro' && <TextIntroDemo />}
          {activeStep?.demo === 'text_select' && <TextSelectDemo />}
          {activeStep?.demo === 'chat_target' && <ChatTargetDemo />}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return overlay;
};

interface CalloutProps {
  stepIndex: number;
  stepsCount: number;
  title: string;
  description: string;
  targetRect: SpotlightRect | null;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
}

const TourCallout: React.FC<CalloutProps> = ({ stepIndex, stepsCount, title, description, targetRect, onNext, onBack, onClose }) => {
  // Position callout near target, default to right, fallback below
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!targetRect) {
      setPos({ left: 24, top: 24 });
      return;
    }
    const margin = 16;
    let left = targetRect.x + targetRect.width + margin;
    let top = targetRect.y;

    // If overflow right, place left
    if (left + 360 > window.innerWidth) {
      left = targetRect.x - 360 - margin;
    }
    // If overflow left, stick to viewport left
    if (left < margin) left = margin;

    // If too close to top/bottom, adjust
    if (top + 160 > window.innerHeight) {
      top = window.innerHeight - 200;
    }
    if (top < margin) top = margin;

    setPos({ left, top });
  }, [targetRect]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="bg-card text-card-foreground"
      style={{
        position: 'absolute',
        left: pos?.left || 24,
        top: pos?.top || 24,
        width: 360,
        border: '1px solid rgba(255,67,1,0.25)',
        borderRadius: 12,
        boxShadow: '0 10px 40px rgba(0,0,0,0.18)',
        padding: 14,
        pointerEvents: 'auto'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, background: '#FF4301', borderRadius: 9999 }} />
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: '#FF4301' }}>
            Step {stepIndex + 1} of {stepsCount}
          </span>
        </div>
        <button onClick={onClose} title="Skip" className="bg-card text-card-foreground border-border hover:bg-accent hover:text-accent-foreground transition-colors" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, border: '1px solid' }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ marginTop: 8, marginBottom: 10 }}>
        <div className="text-card-foreground" style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{title}</div>
        <div className="text-muted-foreground" style={{ fontSize: 13, lineHeight: 1.5 }}>{description}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {stepIndex > 0 && (
          <button
            onClick={onBack}
            className="bg-card text-card-foreground border-border hover:bg-accent hover:text-accent-foreground transition-colors"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 10px', fontSize: 12, fontWeight: 600,
              borderRadius: 8, border: '1px solid'
            }}
          >
            <ArrowLeft size={14} /> Back
          </button>
        )}
        <button
          onClick={onNext}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 12px', fontSize: 12, fontWeight: 700,
            borderRadius: 8, border: '1px solid rgba(255,67,1,0.25)',
            background: 'linear-gradient(180deg, #FF6A3D, #FF4301)', color: 'white'
          }}
        >
          {stepIndex + 1 === stepsCount ? 'Done' : (<><span>Next</span> <ArrowRight size={14} /></>)}
        </button>
      </div>
    </motion.div>
  );
};

export default GuidedTour;

// --- Demo Overlays ---
const TextIntroDemo: React.FC = () => {
  // Position the demo card toward the left side of the slide viewport
  const [start, setStart] = useState(false);
  useEffect(() => { const t = setTimeout(() => setStart(true), 150); return () => clearTimeout(t); }, []);
  // Use slide container to anchor within slide bounds
  const slide = document.getElementById('slide-display-container');
  const srect = slide?.getBoundingClientRect();
  // Left column padding inside slide
  const leftX = srect ? srect.left + Math.min(60, srect.width * 0.06) : window.innerWidth / 2 - 560;
  const topY = srect ? srect.top + Math.min(80, srect.height * 0.12) : window.innerHeight / 2 - 120;
  const center = { left: `${leftX}px`, top: `${topY}px` };
  const cursorStart = { x: 40, y: window.innerHeight - 40 };
  const target = { x: leftX + 20, y: topY + 20 };
  const box = { left: leftX - 16, top: topY - 18, width: 592, height: 128 };
  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 28 }}
        style={{ position: 'fixed', zIndex: 100002, ...center, width: 560, pointerEvents: 'none' }}
      >
        <div className="bg-card border-border" style={{
          border: '1px solid', borderRadius: 14,
          padding: '24px 28px', boxShadow: '0 10px 40px rgba(0,0,0,0.20)'
        }}>
          <div style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif', fontWeight: 900, fontSize: 36, letterSpacing: 0.4 }}>
            Text Title
          </div>
          <div className="text-muted-foreground" style={{ marginTop: 8, fontSize: 14 }}>
            Double‑click text to edit with the rich Tiptap editor.
          </div>
        </div>
      </motion.div>
      {/* Cursor */}
      <motion.div
        initial={{ x: cursorStart.x, y: cursorStart.y, opacity: 0 }}
        animate={start ? { x: target.x, y: target.y, opacity: 1 } : {}}
        transition={{ duration: 1.1, ease: 'easeInOut' }}
        style={{ position: 'fixed', zIndex: 100003, width: 24, height: 34, pointerEvents: 'none' }}
      >
        <svg viewBox="0 0 24 24" width="24" height="34"><path fill="#FF4301" d="M0 0 L10 20 L12 14 L20 16 Z"/></svg>
      </motion.div>
      {/* Bounding box aligned to text */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1 }}
        style={{ position: 'fixed', left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, border: '2px solid #FF4301', borderRadius: 12, zIndex: 100002, pointerEvents: 'none', boxShadow: '0 0 0 4px rgba(255,67,1,0.15)' }}
      />
      {/* Hint to open properties panel */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2 }}
        className="bg-card/95 text-card-foreground border-border"
        style={{ position: 'fixed', right: 300, top: 72, zIndex: 100002, pointerEvents: 'none', padding: '8px 12px', borderRadius: 8, border: '1px solid', boxShadow: '0 6px 20px rgba(0,0,0,0.08)', fontSize: 13 }}
      >
        Tip: Properties panel shows Tiptap text settings when text is selected.
      </motion.div>
    </>
  );
};

const TextSelectDemo: React.FC = () => {
  // Emphasize selecting a text block: large orange cursor animates to existing Tiptap area if present
  const [start, setStart] = useState(false);
  useEffect(() => { const t = setTimeout(() => setStart(true), 150); return () => clearTimeout(t); }, []);
  // Try to locate a tiptap editor area to outline
  const tiptap = document.querySelector('.tiptap-editor-content') as HTMLElement | null;
  const rect = tiptap ? tiptap.getBoundingClientRect() : { left: window.innerWidth/2 - 280, top: window.innerHeight/2 - 60, width: 560, height: 120 } as DOMRect;
  const cursorStart = { x: 60, y: window.innerHeight - 60 };
  const target = { x: rect.left + Math.min(40, rect.width/3), y: rect.top + Math.min(24, rect.height/3) };
  return (
    <>
      {/* Bounding box tight to the editor content area */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        style={{ position: 'fixed', left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12, border: '3px solid #FF4301', borderRadius: 10, zIndex: 100002, pointerEvents: 'none', boxShadow: '0 0 0 6px rgba(255,67,1,0.12)' }}
      />
      {/* Cursor */}
      <motion.div
        initial={{ x: cursorStart.x, y: cursorStart.y, opacity: 0 }}
        animate={start ? { x: target.x, y: target.y, opacity: 1 } : {}}
        transition={{ duration: 0.8, ease: 'easeInOut' }}
        style={{ position: 'fixed', zIndex: 100003, width: 28, height: 40, pointerEvents: 'none' }}
      >
        <svg viewBox="0 0 24 24" width="28" height="40"><path fill="#FF4301" d="M0 0 L10 20 L12 14 L20 16 Z"/></svg>
      </motion.div>
    </>
  );
};

const ChatTargetDemo: React.FC = () => {
  const [phase, setPhase] = useState<'highlight' | 'typing1' | 'typing2' | 'typing3' | 'typing4' | 'done'>('highlight');
  const inputRef = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState('');
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('typing1'), 900);
    const t2 = setTimeout(() => setPhase('typing2'), 2800);
    const t3 = setTimeout(() => setPhase('typing3'), 4700);
    const t4 = setTimeout(() => setPhase('typing4'), 6600);
    const t5 = setTimeout(() => setPhase('done'), 9200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); };
  }, []);
  useEffect(() => {
    if (!['typing1','typing2','typing3','typing4'].includes(phase)) return;
    const text = phase === 'typing1' 
      ? 'Add some data to this slide' 
      : phase === 'typing2'
      ? 'Make the background red'
      : phase === 'typing3'
      ? 'Add this logo to each slide'
      : 'Turn this into a 2-column comparison';
    setTyped('');
    let i = 0;
    const iv = setInterval(() => {
      i += 1;
      setTyped(text.slice(0, i));
      if (i >= text.length) clearInterval(iv);
    }, 50);
    return () => clearInterval(iv);
  }, [phase]);
  // Find chat input position
  const panel = document.querySelector('[data-tour="chat-panel"]') as HTMLElement | null;
  const input = document.querySelector('[data-tour="chat-input"]') as HTMLElement | null;
  const rect = (input || panel)?.getBoundingClientRect() || { left: window.innerWidth - 360, top: window.innerHeight - 220, width: 320, height: 200 } as DOMRect;
  // Aim at the placeholder line with a finer offset
  const inputBox = { x: rect.left + 4, y: rect.top + 4 };
  const targetBtn = document.querySelector('[data-tour="chat-target"]') as HTMLElement | null;
  const targetRect = targetBtn ? targetBtn.getBoundingClientRect() : null;
  const cursorStart = { x: rect.left + rect.width - 40, y: rect.top + rect.height - 40 };
  return (
    <>
      {/* Fake cursor to Target button then to input */}
      <motion.div
        initial={{ x: cursorStart.x, y: cursorStart.y, opacity: 0 }}
        animate={phase === 'highlight' && targetRect ? { x: targetRect.left, y: targetRect.top, opacity: 1 } : (phase.startsWith('typing')) ? { x: inputBox.x, y: inputBox.y, opacity: 1 } : {}}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
        style={{ position: 'fixed', zIndex: 100003, width: 28, height: 40, pointerEvents: 'none' }}
      >
        <svg viewBox="0 0 24 24" width="28" height="40"><path fill="#FF4301" d="M0 0 L10 20 L12 14 L20 16 Z"/></svg>
      </motion.div>
      {/* Highlight Target button */}
      {targetRect && phase === 'highlight' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ position: 'fixed', left: targetRect.left - 6, top: targetRect.top - 6, width: targetRect.width + 12, height: targetRect.height + 12, border: '2px solid #FF4301', borderRadius: 10, zIndex: 100002, pointerEvents: 'none', boxShadow: '0 0 0 6px rgba(255,67,1,0.15)' }}
        />
      )}
      {/* Typing demo */}
      <motion.div
        ref={inputRef}
        initial={{ opacity: 0 }}
        animate={(phase.startsWith('typing')) ? { opacity: 1 } : { opacity: 0 }}
        style={{ position: 'fixed', left: inputBox.x, top: inputBox.y, zIndex: 100002, pointerEvents: 'none', background: 'white', color: '#1f2937', padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(0,0,0,0.10)', fontSize: 18, fontWeight: 800 }}
      >
        {typed}
      </motion.div>
      {/* Prompt message near chat panel */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-card/95 text-card-foreground border-border"
        style={{ position: 'fixed', left: rect.left + 16, top: rect.top - 36, zIndex: 100002, pointerEvents: 'none', padding: '8px 12px', borderRadius: 8, border: '1px solid', boxShadow: '0 6px 20px rgba(0,0,0,0.08)', fontSize: 13 }}
      >
        <span>You can point to specific components, or just type general requests.</span>
      </motion.div>
    </>
  );
};
