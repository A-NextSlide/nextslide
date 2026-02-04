import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';
import { Sun, Moon, Sparkles, LayoutGrid, Settings } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import BrandWordmark from '@/components/common/BrandWordmark';

export const THEME_ONBOARDING_KEY = 'ui-theme-onboarded';

interface WelcomeOverlayProps {
  open: boolean;
  onComplete: () => void;
  heroContainerRef: React.RefObject<HTMLDivElement | null>;
  isMobileView: boolean;
}

const CALLOUTS = [
  { icon: Sparkles, text: 'Describe your idea to get started' },
  { icon: LayoutGrid, text: 'Your presentations & tutorial are on the right' },
  { icon: Settings, text: 'Settings, import & more up top' },
] as const;

export const WelcomeOverlay: React.FC<WelcomeOverlayProps> = ({
  open,
  onComplete,
  heroContainerRef,
  isMobileView,
}) => {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  // Track hero input position for the glow ring
  const [glowRect, setGlowRect] = useState<DOMRect | null>(null);

  const updateGlowRect = useCallback(() => {
    if (heroContainerRef.current) {
      setGlowRect(heroContainerRef.current.getBoundingClientRect());
    }
  }, [heroContainerRef]);

  useEffect(() => {
    if (!open) return;
    updateGlowRect();
    window.addEventListener('resize', updateGlowRect);
    window.addEventListener('scroll', updateGlowRect);
    return () => {
      window.removeEventListener('resize', updateGlowRect);
      window.removeEventListener('scroll', updateGlowRect);
    };
  }, [open, updateGlowRect]);

  const handleComplete = useCallback(() => {
    try {
      localStorage.setItem(THEME_ONBOARDING_KEY, '1');
    } catch {}
    onComplete();
  }, [onComplete]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[101] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          />

          {/* Glow ring around hero input - only on non-mobile */}
          {glowRect && !isMobileView && (
            <motion.div
              className="welcome-glow-ring pointer-events-none"
              style={{
                position: 'fixed',
                left: glowRect.left - 6,
                top: glowRect.top - 6,
                width: glowRect.width + 12,
                height: glowRect.height + 12,
                borderRadius: '1rem',
                zIndex: 102,
              }}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: 0.15, duration: 0.4 }}
            />
          )}

          {/* Central Card */}
          <motion.div
            className={
              isMobileView
                ? 'relative z-[103] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl mx-4 p-6 max-w-sm w-full'
                : 'relative z-[103] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl p-10 max-w-md w-full'
            }
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{
              delay: 0.2,
              type: 'spring',
              stiffness: 300,
              damping: 30,
            }}
          >
            {/* Brand wordmark */}
            <motion.div
              className="flex justify-center"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.35 }}
            >
              <BrandWordmark
                tag="h1"
                className="text-zinc-900 dark:text-zinc-100"
                sizePx={isMobileView ? 32 : 38}
                xImageUrl="/brand/nextslide-x.png"
                gapLeftPx={-4}
                gapRightPx={-10}
                liftPx={-6}
                xLiftPx={-8}
                rightLiftPx={0}
              />
            </motion.div>

            {/* Subtitle */}
            <motion.p
              className="text-center text-sm text-zinc-500 dark:text-zinc-400 mt-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45, duration: 0.3 }}
            >
              Your AI-powered presentation studio. Let&rsquo;s get you set up.
            </motion.p>

            {/* Theme toggle */}
            <motion.div
              className="flex items-center justify-center gap-3 mt-6"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.55, duration: 0.3 }}
            >
              <Sun className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
              <Switch
                checked={isDark}
                onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                className="data-[state=checked]:bg-zinc-700 data-[state=unchecked]:bg-orange-400"
                thumbClassName="data-[state=checked]:bg-zinc-300 data-[state=unchecked]:bg-white"
              />
              <Moon className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
            </motion.div>

            {/* Feature callouts */}
            <div className="mt-7 space-y-3">
              {CALLOUTS.map((callout, i) => {
                // On mobile, skip the "right panel" callout since it's not visible
                if (isMobileView && i === 1) return null;
                return (
                  <motion.div
                    key={i}
                    className="flex items-start gap-3"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 + i * 0.1, duration: 0.3 }}
                  >
                    <div className="mt-0.5 flex-shrink-0 h-8 w-8 rounded-lg bg-orange-50 dark:bg-orange-950/40 flex items-center justify-center">
                      <callout.icon className="h-4 w-4 text-orange-500" />
                    </div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300 pt-1.5">
                      {callout.text}
                    </p>
                  </motion.div>
                );
              })}
            </div>

            {/* Let's Go button */}
            <motion.div
              className="mt-8"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.9, duration: 0.3 }}
            >
              <button
                type="button"
                onClick={handleComplete}
                className="w-full py-3 rounded-xl bg-[#FF4301] hover:bg-[#E63B00] text-white font-semibold text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
              >
                Let&rsquo;s Go
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WelcomeOverlay;
