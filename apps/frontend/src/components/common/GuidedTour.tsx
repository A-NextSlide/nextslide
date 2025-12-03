import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ArrowRight, ArrowLeft, Sparkles, Wand2, Palette, Type, MessageSquare, MousePointerClick, Zap, Target, Layout, Image } from 'lucide-react';

interface GuidedTourStep {
  id: string;
  targetSelector: string;
  title: string;
  description: string;
  capability?: string;
  icon?: React.ReactNode;
  nextAction?: 'enterEditMode' | 'openTheme' | null;
  demo?: 'text_intro' | 'text_select' | 'chat_target' | 'tiptap_panel' | null;
}

interface GuidedTourProps {
  isOpen: boolean;
  onClose: () => void;
  steps: GuidedTourStep[];
  onAction?: (action: 'enterEditMode' | 'openTheme') => void;
  showAiHints?: boolean;
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

const GuidedTour: React.FC<GuidedTourProps> = ({ isOpen, onClose, steps, onAction, showAiHints = false }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRectRef = useRef<string>('');

  const activeStep = steps[clamp(stepIndex, 0, steps.length - 1)];

  // Optimized spotlight calculation using RAF with dirty checking
  const computeSpotlight = useCallback(() => {
    if (!activeStep) {
      setSpotlight(null);
      return;
    }

    let rect: SpotlightRect | null = null;
    if (activeStep.id === 'theme') {
      rect = getElementRect('[data-tour="theme-popover"]') || getElementRect(activeStep.targetSelector);
    } else {
      rect = getElementRect(activeStep.targetSelector);
    }

    if (rect) {
      // Only update state if rect actually changed (avoid unnecessary re-renders)
      const rectKey = `${rect.x},${rect.y},${rect.width},${rect.height}`;
      if (rectKey !== lastRectRef.current) {
        lastRectRef.current = rectKey;
        setSpotlight(rect);
      }
    } else {
      if (lastRectRef.current !== 'null') {
        lastRectRef.current = 'null';
        setSpotlight(null);
      }
    }
  }, [activeStep]);

  // Use ResizeObserver + RAF for efficient updates
  useEffect(() => {
    if (!isOpen) return;

    let frameId: number;
    let isRunning = true;

    const tick = () => {
      if (!isRunning) return;
      computeSpotlight();
      frameId = requestAnimationFrame(tick);
    };

    // Initial compute
    computeSpotlight();

    // Start RAF loop (but throttled - only compute every 2nd frame ~30fps)
    let frameCount = 0;
    const throttledTick = () => {
      if (!isRunning) return;
      frameCount++;
      if (frameCount % 2 === 0) {
        computeSpotlight();
      }
      frameId = requestAnimationFrame(throttledTick);
    };

    frameId = requestAnimationFrame(throttledTick);

    // Also listen for resize
    const onResize = () => computeSpotlight();
    window.addEventListener('resize', onResize);

    return () => {
      isRunning = false;
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', onResize);
    };
  }, [isOpen, computeSpotlight]);

  // On-step-enter side effects
  useEffect(() => {
    if (!isOpen || !activeStep) return;

    if (activeStep.id === 'chat') {
      try {
        window.dispatchEvent(new CustomEvent('tour:exit-edit'));
        window.dispatchEvent(new CustomEvent('tour:open-chat'));
      } catch {}
    }

    try {
      if (['edit', 'components', 'text-settings'].includes(activeStep.id)) {
        (window as any).__tourForceWhiteBg = true;
      } else {
        delete (window as any).__tourForceWhiteBg;
      }
    } catch {}

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

  // Global event to start the tour
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
    if (activeStep?.nextAction) {
      try {
        if (activeStep.nextAction === 'enterEditMode') {
          if (onAction) {
            onAction('enterEditMode');
          }
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
            window.dispatchEvent(new CustomEvent('tour:force-edit'));
            window.dispatchEvent(new CustomEvent('editor:force-edit-mode'));
            window.dispatchEvent(new CustomEvent('editor:toggle-edit-mode'));
          }
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
              setTimeout(advanceWhenReady, 50);
            }
          };
          const onSlideCompleted = () => {
            clickEditIfEnabled();
            setTimeout(advanceWhenReady, 50);
          };
          const cleanupWaiters = () => {
            window.removeEventListener('editor:edit-mode-changed', onEditState as EventListener);
            window.removeEventListener('slide_completed', onSlideCompleted as EventListener);
            window.removeEventListener('deck_complete', onSlideCompleted as EventListener);
            window.removeEventListener('deck_generation_complete', onSlideCompleted as EventListener);
          };
          window.addEventListener('editor:edit-mode-changed', onEditState as EventListener);
          window.addEventListener('slide_completed', onSlideCompleted as EventListener);
          window.addEventListener('deck_complete', onSlideCompleted as EventListener);
          window.addEventListener('deck_generation_complete', onSlideCompleted as EventListener);
          return;
        } else if (activeStep.nextAction === 'openTheme') {
          if (onAction) {
            onAction('openTheme');
          }
          const themeButton = document.querySelector('[data-tour="theme-button"]') as HTMLElement | null;
          const alreadyOpen = !!document.querySelector('[data-tour="theme-popover"]');
          if (!alreadyOpen) themeButton?.click();
        }
      } catch {}
    }

    try {
      if (activeStep?.id === 'theme') {
        const btn = document.querySelector('[data-tour="theme-button"]') as HTMLElement | null;
        btn?.click();
      }
    } catch {}

    if (stepIndex < steps.length - 1) setStepIndex(stepIndex + 1);
    else onClose();
  };

  const handleBack = () => {
    if (stepIndex > 0) {
      try {
        const goingTo = steps[stepIndex - 1]?.id;
        if (goingTo === 'components' || goingTo === 'text-settings') {
          window.dispatchEvent(new CustomEvent('tour:force-edit'));
        }
      } catch {}
      setStepIndex(stepIndex - 1);
    }
  };

  // Calculate spotlight center and radius for mask
  const spotlightCenter = spotlight ? {
    x: spotlight.x + spotlight.width / 2,
    y: spotlight.y + spotlight.height / 2,
    radius: Math.max(spotlight.width, spotlight.height) / 2 + 24
  } : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="tour-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          style={{ position: 'fixed', inset: 0, zIndex: 99999, pointerEvents: 'auto' }}
        >
          {/* Backdrop with spotlight cutout */}
          {spotlightCenter && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                background: 'rgba(0, 0, 0, 0.75)',
                WebkitMaskImage: `radial-gradient(ellipse ${spotlightCenter.radius * 1.2}px ${spotlightCenter.radius}px at ${spotlightCenter.x}px ${spotlightCenter.y}px, transparent 85%, black 100%)`,
                maskImage: `radial-gradient(ellipse ${spotlightCenter.radius * 1.2}px ${spotlightCenter.radius}px at ${spotlightCenter.x}px ${spotlightCenter.y}px, transparent 85%, black 100%)`,
              }}
            />
          )}

          {/* Animated spotlight ring */}
          {spotlight && (
            <motion.div
              key={`ring-${activeStep?.id}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              style={{
                position: 'absolute',
                left: spotlight.x - 6,
                top: spotlight.y - 6,
                width: spotlight.width + 12,
                height: spotlight.height + 12,
                borderRadius: 12,
                pointerEvents: 'none',
              }}
            >
              {/* Outer glow */}
              <div
                style={{
                  position: 'absolute',
                  inset: -8,
                  borderRadius: 16,
                  background: 'radial-gradient(ellipse at center, rgba(255, 107, 0, 0.15) 0%, transparent 70%)',
                }}
              />
              {/* Main ring */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 12,
                  border: '2px solid #FF6B00',
                  boxShadow: '0 0 20px rgba(255, 107, 0, 0.4), inset 0 0 20px rgba(255, 107, 0, 0.1)',
                }}
              />
              {/* Animated pulse ring */}
              <motion.div
                animate={{
                  scale: [1, 1.08, 1],
                  opacity: [0.6, 0, 0.6]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut'
                }}
                style={{
                  position: 'absolute',
                  inset: -4,
                  borderRadius: 14,
                  border: '2px solid #FF6B00',
                }}
              />
            </motion.div>
          )}

          {/* Theme popover extra highlight */}
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
                style={{
                  position: 'absolute',
                  left: r.left - 8,
                  top: r.top - 8,
                  width: r.width + 16,
                  height: r.height + 16,
                  borderRadius: 14,
                  border: '2px solid #FF6B00',
                  boxShadow: '0 0 30px rgba(255, 107, 0, 0.3)',
                  pointerEvents: 'none'
                }}
              />
            );
          })()}

          {/* Main Callout Card */}
          <TourCallout
            stepIndex={stepIndex}
            stepsCount={steps.length}
            step={activeStep}
            targetRect={spotlight}
            onClose={onClose}
            onNext={handleNext}
            onBack={handleBack}
          />

          {/* Demo overlays */}
          {activeStep?.demo === 'text_intro' && <TextIntroDemo />}
          {activeStep?.demo === 'text_select' && <TextSelectDemo />}
          {activeStep?.demo === 'chat_target' && <ChatTargetDemo showAiHints={showAiHints} />}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

interface CalloutProps {
  stepIndex: number;
  stepsCount: number;
  step: GuidedTourStep | undefined;
  targetRect: SpotlightRect | null;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
}

const TourCallout: React.FC<CalloutProps> = ({ stepIndex, stepsCount, step, targetRect, onNext, onBack, onClose }) => {
  const [pos, setPos] = useState<{ left: number; top: number; placement: 'right' | 'left' | 'bottom' } | null>(null);

  useEffect(() => {
    if (!targetRect) {
      setPos({ left: 24, top: 24, placement: 'right' });
      return;
    }

    const cardWidth = 380;
    const cardHeight = 220;
    const margin = 20;

    let left = targetRect.x + targetRect.width + margin;
    let top = targetRect.y;
    let placement: 'right' | 'left' | 'bottom' = 'right';

    // Try right side first
    if (left + cardWidth > window.innerWidth - margin) {
      // Try left side
      left = targetRect.x - cardWidth - margin;
      placement = 'left';

      if (left < margin) {
        // Fall back to bottom
        left = Math.max(margin, targetRect.x + targetRect.width / 2 - cardWidth / 2);
        left = Math.min(left, window.innerWidth - cardWidth - margin);
        top = targetRect.y + targetRect.height + margin;
        placement = 'bottom';
      }
    }

    // Vertical bounds
    if (top + cardHeight > window.innerHeight - margin) {
      top = window.innerHeight - cardHeight - margin;
    }
    if (top < margin) top = margin;

    setPos({ left, top, placement });
  }, [targetRect]);

  const progress = ((stepIndex + 1) / stepsCount) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
      style={{
        position: 'absolute',
        left: pos?.left || 24,
        top: pos?.top || 24,
        width: 380,
        pointerEvents: 'auto',
      }}
    >
      {/* Card */}
      <div
        style={{
          background: 'linear-gradient(180deg, rgba(24, 24, 27, 0.98) 0%, rgba(18, 18, 21, 0.98) 100%)',
          backdropFilter: 'blur(20px)',
          borderRadius: 16,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 107, 0, 0.1)',
          overflow: 'hidden',
        }}
      >
        {/* Progress bar at top */}
        <div style={{ height: 3, background: 'rgba(255, 255, 255, 0.05)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{
              height: '100%',
              background: 'linear-gradient(90deg, #FF6B00, #FF8533)',
              borderRadius: '0 2px 2px 0',
            }}
          />
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Step icon */}
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, rgba(255, 107, 0, 0.2) 0%, rgba(255, 107, 0, 0.05) 100%)',
                  border: '1px solid rgba(255, 107, 0, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FF8533',
                }}
              >
                {step?.icon || <Sparkles size={18} />}
              </div>
              <div>
                <div style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  color: '#FF8533',
                }}>
                  Step {stepIndex + 1} of {stepsCount}
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'rgba(255, 255, 255, 0.5)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)';
              }}
              title="Skip tour"
            >
              <X size={16} />
            </button>
          </div>

          {/* Content */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{
              fontSize: 20,
              fontWeight: 700,
              color: '#ffffff',
              marginBottom: 8,
              lineHeight: 1.3,
            }}>
              {step?.title}
            </h3>
            <p style={{
              fontSize: 14,
              color: 'rgba(255, 255, 255, 0.6)',
              lineHeight: 1.6,
              margin: 0,
            }}>
              {step?.description}
            </p>

            {/* Capability tag */}
            {step?.capability && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                style={{
                  marginTop: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  background: 'rgba(255, 107, 0, 0.1)',
                  borderRadius: 6,
                  border: '1px solid rgba(255, 107, 0, 0.2)',
                }}
              >
                <Zap size={12} style={{ color: '#FF8533' }} />
                <span style={{ fontSize: 12, color: '#FF8533', fontWeight: 500 }}>
                  {step.capability}
                </span>
              </motion.div>
            )}
          </div>

          {/* Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            {/* Step dots */}
            <div style={{ display: 'flex', gap: 6 }}>
              {Array.from({ length: stepsCount }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: i === stepIndex ? 20 : 8,
                    height: 8,
                    borderRadius: 4,
                    background: i === stepIndex
                      ? 'linear-gradient(90deg, #FF6B00, #FF8533)'
                      : i < stepIndex
                        ? 'rgba(255, 107, 0, 0.4)'
                        : 'rgba(255, 255, 255, 0.15)',
                    transition: 'all 0.3s ease',
                  }}
                />
              ))}
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              {stepIndex > 0 && (
                <button
                  onClick={onBack}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '10px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    borderRadius: 10,
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: 'rgba(255, 255, 255, 0.7)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  }}
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
              )}
              <button
                onClick={onNext}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 18px',
                  fontSize: 13,
                  fontWeight: 700,
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(255, 107, 0, 0.3)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(255, 107, 0, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 107, 0, 0.3)';
                }}
              >
                {stepIndex + 1 === stepsCount ? (
                  <>
                    <Sparkles size={16} />
                    Let's Go!
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default GuidedTour;

// --- Demo Overlays ---
const TextIntroDemo: React.FC = () => {
  const [phase, setPhase] = useState<'idle' | 'moving' | 'clicked' | 'editing'>('idle');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('moving'), 300);
    const t2 = setTimeout(() => setPhase('clicked'), 1200);
    const t3 = setTimeout(() => setPhase('editing'), 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const slide = document.getElementById('slide-display-container');
  const srect = slide?.getBoundingClientRect();
  const leftX = srect ? srect.left + Math.min(60, srect.width * 0.06) : window.innerWidth / 2 - 280;
  const topY = srect ? srect.top + Math.min(80, srect.height * 0.12) : window.innerHeight / 2 - 60;

  const cursorStart = { x: window.innerWidth - 200, y: window.innerHeight - 100 };
  const cursorTarget = { x: leftX + 100, y: topY + 40 };

  return (
    <>
      {/* Demo text block */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 24 }}
        style={{
          position: 'fixed',
          zIndex: 100002,
          left: leftX,
          top: topY,
          pointerEvents: 'none'
        }}
      >
        <div style={{
          background: phase === 'editing' ? 'rgba(255, 255, 255, 0.98)' : 'rgba(255, 255, 255, 0.95)',
          borderRadius: 12,
          padding: '24px 32px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
          border: phase === 'clicked' || phase === 'editing' ? '2px solid #FF6B00' : '1px solid rgba(0, 0, 0, 0.1)',
          transition: 'border 0.2s ease',
        }}>
          <div style={{
            fontWeight: 800,
            fontSize: 28,
            color: '#1a1a1a',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            Your Headline Here
            {phase === 'editing' && (
              <motion.span
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.5, repeat: Infinity }}
                style={{
                  width: 2,
                  height: 28,
                  background: '#FF6B00',
                  marginLeft: 2,
                }}
              />
            )}
          </div>
          <div style={{
            marginTop: 8,
            fontSize: 14,
            color: '#666',
          }}>
            Double-click to edit with rich formatting
          </div>
        </div>
      </motion.div>

      {/* Animated cursor */}
      <motion.div
        initial={{ x: cursorStart.x, y: cursorStart.y, opacity: 0 }}
        animate={
          phase === 'moving' || phase === 'clicked' || phase === 'editing'
            ? { x: cursorTarget.x, y: cursorTarget.y, opacity: 1 }
            : { opacity: 0 }
        }
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: 'fixed', zIndex: 100003, pointerEvents: 'none' }}
      >
        <svg width="28" height="34" viewBox="0 0 24 28">
          <path
            fill="#FF6B00"
            d="M0 0 L0 22 L5 17 L9 26 L12 25 L8 16 L14 16 Z"
            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
          />
        </svg>
        {/* Click ripple */}
        {phase === 'clicked' && (
          <motion.div
            initial={{ scale: 0, opacity: 1 }}
            animate={{ scale: 2, opacity: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: 'rgba(255, 107, 0, 0.4)',
            }}
          />
        )}
      </motion.div>

      {/* Tip */}
      <motion.div
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.6 }}
        style={{
          position: 'fixed',
          left: leftX + 340,
          top: topY + 20,
          zIndex: 100002,
          pointerEvents: 'none',
          background: 'rgba(24, 24, 27, 0.95)',
          padding: '10px 14px',
          borderRadius: 8,
          border: '1px solid rgba(255, 107, 0, 0.3)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
        }}
      >
        <div style={{ fontSize: 12, color: '#FF8533', fontWeight: 600, marginBottom: 4 }}>
          ✨ Pro tip
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.8)' }}>
          Press <kbd style={{
            background: 'rgba(255, 255, 255, 0.1)',
            padding: '2px 6px',
            borderRadius: 4,
            fontFamily: 'monospace',
          }}>T</kbd> to add text anywhere
        </div>
      </motion.div>
    </>
  );
};

const TextSelectDemo: React.FC = () => {
  const [phase, setPhase] = useState<'idle' | 'moving' | 'selected'>('idle');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('moving'), 200);
    const t2 = setTimeout(() => setPhase('selected'), 900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const tiptap = document.querySelector('.tiptap-editor-content') as HTMLElement | null;
  const rect = tiptap?.getBoundingClientRect() || {
    left: window.innerWidth / 2 - 200,
    top: window.innerHeight / 2 - 40,
    width: 400,
    height: 80
  };

  const cursorStart = { x: window.innerWidth - 100, y: window.innerHeight - 100 };
  const cursorTarget = { x: rect.left + 50, y: rect.top + 30 };

  return (
    <>
      {/* Selection highlight */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        style={{
          position: 'fixed',
          left: rect.left - 4,
          top: rect.top - 4,
          width: rect.width + 8,
          height: rect.height + 8,
          borderRadius: 8,
          border: phase === 'selected' ? '2px solid #FF6B00' : '2px dashed rgba(255, 107, 0, 0.5)',
          boxShadow: phase === 'selected' ? '0 0 20px rgba(255, 107, 0, 0.2)' : 'none',
          zIndex: 100002,
          pointerEvents: 'none',
          transition: 'all 0.3s ease',
        }}
      />

      {/* Cursor */}
      <motion.div
        initial={{ x: cursorStart.x, y: cursorStart.y, opacity: 0 }}
        animate={
          phase !== 'idle'
            ? { x: cursorTarget.x, y: cursorTarget.y, opacity: 1 }
            : {}
        }
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: 'fixed', zIndex: 100003, pointerEvents: 'none' }}
      >
        <svg width="28" height="34" viewBox="0 0 24 28">
          <path
            fill="#FF6B00"
            d="M0 0 L0 22 L5 17 L9 26 L12 25 L8 16 L14 16 Z"
            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
          />
        </svg>
      </motion.div>
    </>
  );
};

const ChatTargetDemo: React.FC<{ showAiHints?: boolean }> = ({ showAiHints = false }) => {
  const [phase, setPhase] = useState(0);
  const [typed, setTyped] = useState('');

  const prompts = [
    'Make this slide more visual',
    'Add a comparison chart',
    'Change colors to blue theme',
    'Add my company logo',
  ];

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    let t = 600;
    prompts.forEach((_, i) => {
      timers.push(setTimeout(() => setPhase(i + 1), t));
      t += 2200;
    });
    timers.push(setTimeout(() => setPhase(prompts.length + 1), t));
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (phase === 0 || phase > prompts.length) {
      setTyped('');
      return;
    }

    const text = prompts[phase - 1];
    setTyped('');
    let i = 0;
    const iv = setInterval(() => {
      i += 1;
      setTyped(text.slice(0, i));
      if (i >= text.length) clearInterval(iv);
    }, 40);
    return () => clearInterval(iv);
  }, [phase]);

  const panel = document.querySelector('[data-tour="chat-panel"]') as HTMLElement | null;
  const input = document.querySelector('[data-tour="chat-input"]') as HTMLElement | null;
  const rect = (input || panel)?.getBoundingClientRect() || {
    left: window.innerWidth - 400,
    top: window.innerHeight - 200,
    width: 360,
    height: 180
  };

  const targetBtn = document.querySelector('[data-tour="chat-target"]') as HTMLElement | null;
  const targetRect = targetBtn?.getBoundingClientRect();

  const cursorStart = { x: rect.left + rect.width - 60, y: rect.top + rect.height - 60 };
  const inputPos = { x: rect.left + 16, y: rect.top + 16 };

  return (
    <>
      {/* Cursor animation */}
      <motion.div
        initial={{ x: cursorStart.x, y: cursorStart.y, opacity: 0 }}
        animate={
          phase === 0 && targetRect
            ? { x: targetRect.left + 10, y: targetRect.top + 10, opacity: 1 }
            : phase > 0
              ? { x: inputPos.x, y: inputPos.y, opacity: 1 }
              : {}
        }
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: 'fixed', zIndex: 100003, pointerEvents: 'none' }}
      >
        <svg width="28" height="34" viewBox="0 0 24 28">
          <path
            fill="#FF6B00"
            d="M0 0 L0 22 L5 17 L9 26 L12 25 L8 16 L14 16 Z"
            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
          />
        </svg>
      </motion.div>

      {/* Target button highlight */}
      {targetRect && phase === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{
            position: 'fixed',
            left: targetRect.left - 4,
            top: targetRect.top - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            borderRadius: 8,
            border: '2px solid #FF6B00',
            boxShadow: '0 0 20px rgba(255, 107, 0, 0.3)',
            zIndex: 100002,
            pointerEvents: 'none'
          }}
        />
      )}

      {/* Typing indicator */}
      {phase > 0 && phase <= prompts.length && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          style={{
            position: 'fixed',
            left: inputPos.x,
            top: inputPos.y,
            zIndex: 100002,
            pointerEvents: 'none',
            background: 'white',
            color: '#1a1a1a',
            padding: '12px 16px',
            borderRadius: 10,
            border: '1px solid #e5e7eb',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
            fontSize: 15,
            fontWeight: 500,
            minWidth: 200,
          }}
        >
          {typed}
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.4, repeat: Infinity }}
            style={{ marginLeft: 2 }}
          >
            |
          </motion.span>
        </motion.div>
      )}

      {/* Capability hints floating - only show for first 2 presentations */}
      {showAiHints && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          style={{
            position: 'fixed',
            left: rect.left,
            top: rect.top - 100,
            zIndex: 100002,
            pointerEvents: 'none',
          }}
        >
          <div style={{
            background: 'rgba(24, 24, 27, 0.95)',
            padding: '12px 16px',
            borderRadius: 10,
            border: '1px solid rgba(255, 107, 0, 0.2)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
          }}>
            <div style={{
              fontSize: 12,
              color: '#FF8533',
              fontWeight: 600,
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <Target size={14} />
              AI can help you:
            </div>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginBottom: 10,
            }}>
              {['Edit content', 'Restyle', 'Add charts', 'Find images'].map((item, i) => (
                <motion.span
                  key={item}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6 + i * 0.1 }}
                  style={{
                    fontSize: 11,
                    padding: '4px 8px',
                    background: 'rgba(255, 107, 0, 0.1)',
                    border: '1px solid rgba(255, 107, 0, 0.2)',
                    borderRadius: 4,
                    color: 'rgba(255, 255, 255, 0.8)',
                  }}
                >
                  {item}
                </motion.span>
              ))}
            </div>
            {/* Anything you want text */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.0 }}
              style={{
                fontSize: 13,
                color: 'rgba(255, 255, 255, 0.5)',
                fontStyle: 'italic',
                textAlign: 'center',
                paddingTop: 6,
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              ...anything you want
            </motion.div>
          </div>
        </motion.div>
      )}
    </>
  );
};

// Export icons for use in step definitions
export { Wand2, Palette, Type, MessageSquare, MousePointerClick, Layout, Image, Sparkles };
