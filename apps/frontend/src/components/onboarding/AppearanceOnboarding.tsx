import React, { useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTheme } from 'next-themes';
import { Check, Moon, Sun, Monitor } from 'lucide-react';
import BrandWordmark from '@/components/common/BrandWordmark';

interface AppearanceOnboardingProps {
  open: boolean;
  onComplete: () => void;
}

// LocalStorage key to prevent showing again
export const THEME_ONBOARDING_KEY = 'ui-theme-onboarded';

const PreviewCard: React.FC<{
  label: 'Light' | 'Dark';
  selected?: boolean;
  onClick: () => void;
}> = ({ label, selected, onClick }) => {
  const isDark = label === 'Dark';

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        [
          'group relative w-full rounded-xl border transition-all duration-300 overflow-hidden text-left',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-orange-500',
          selected ? 'ring-2 ring-orange-500 border-orange-400' : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
        ].join(' ')
      }
      aria-pressed={selected}
    >
      {/* Simulated page preview - scope dark styles inside */}
      <div className={[isDark ? 'dark' : '', 'h-full w-full'].join(' ')}>
        <div className="aspect-[4/3] w-full">
          <div className={[
            'h-full w-full flex flex-col',
            isDark ? 'bg-zinc-950' : 'bg-[#F7F6F1]'
          ].join(' ')}>
            {/* Top nav */}
            <div className="h-11 flex items-center justify-between px-4 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="h-5 flex items-center">
                  {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
                  {/* @ts-ignore allow custom tag */}
                  <BrandWordmark
                    tag="div"
                    className="text-[11px] font-semibold text-[#383636] dark:text-zinc-100"
                    sizePx={14}
                    xImageUrl="/brand/nextslide-x.png"
                    gapLeftPx={-3}
                    gapRightPx={-6}
                    liftPx={-2}
                    xLiftPx={-3}
                    rightLiftPx={0}
                  />
                </div>
                <div className="hidden sm:flex items-center gap-2 ml-2">
                  <div className="h-2.5 w-10 rounded bg-zinc-300 dark:bg-zinc-700" />
                  <div className="h-2.5 w-10 rounded bg-zinc-300 dark:bg-zinc-700" />
                  <div className="h-2.5 w-10 rounded bg-zinc-300 dark:bg-zinc-700" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-6 w-16 rounded-full bg-white/60 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700" />
                <div className="h-6 w-6 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              </div>
            </div>

            {/* Hero section */}
            <div className="relative flex-1 flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0 opacity-[0.65] pointer-events-none"
                   style={{
                     background: isDark
                       ? 'radial-gradient(1200px 400px at 50% -10%, rgba(255,255,255,0.06), transparent 60%)'
                       : 'radial-gradient(1200px 400px at 50% -10%, rgba(0,0,0,0.06), transparent 60%)'
                   }}
              />
              <div className="relative flex flex-col items-center text-center px-6">
                {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
                {/* @ts-ignore allow custom tag */}
                <BrandWordmark
                  tag="h2"
                  className="text-zinc-900 dark:text-zinc-100"
                  sizePx={28}
                  xImageUrl="/brand/nextslide-x.png"
                  gapLeftPx={-4}
                  gapRightPx={-10}
                  liftPx={-6}
                  xLiftPx={-8}
                  rightLiftPx={0}
                />
                <div className="mt-2 text-[11px] sm:text-xs text-zinc-600 dark:text-zinc-400">
                  {isDark ? 'Dark Mode' : 'Light Mode'} preview
                </div>
                <div className="mt-3 h-7 w-28 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white/70 dark:bg-zinc-900/60" />
              </div>
            </div>

            {/* Content cards */}
            <div className="px-4 pb-4">
              <div className="grid grid-cols-3 gap-3">
                {[0,1,2].map((i) => (
                  <div key={i} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 aspect-video">
                    <div className="h-2 w-10 rounded bg-zinc-300 dark:bg-zinc-700 m-3" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
};

export const AppearanceOnboarding: React.FC<AppearanceOnboardingProps> = ({ open, onComplete }) => {
  const { setTheme, theme } = useTheme();

  const choose = useCallback((mode: 'light' | 'dark' | 'system') => {
    try {
      setTheme(mode);
      localStorage.setItem(THEME_ONBOARDING_KEY, '1');
    } finally {
      onComplete();
    }
  }, [onComplete, setTheme]);

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-[980px] w-[92vw] max-w-[980px] p-0 overflow-hidden border-0 bg-transparent shadow-none"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="relative bg-background rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          {/* Header */}
          <div className="px-6 sm:px-10 pt-8 pb-6 border-b border-zinc-200 dark:border-zinc-800 bg-gradient-to-b from-background to-background/70">
            <div className="text-xs text-muted-foreground mb-2">1 of 1</div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">Choose your look</h2>
            <p className="text-sm text-muted-foreground mt-2">Pick a theme you love. You can change this anytime.</p>
          </div>

          {/* Options */}
          <div className="px-6 sm:px-10 py-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  <Sun className="h-3.5 w-3.5" />
                  <span>Light</span>
                </div>
                <PreviewCard label="Light" selected={theme === 'light'} onClick={() => choose('light')} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  <Moon className="h-3.5 w-3.5" />
                  <span>Dark</span>
                </div>
                <PreviewCard label="Dark" selected={theme === 'dark'} onClick={() => choose('dark')} />
              </div>
            </div>

            {/* System option */}
            <div className="mt-6 flex items-center justify-between">
              <div className="text-xs text-muted-foreground">You can switch themes later from the top-right menu.</div>
              <Button variant="ghost" size="sm" onClick={() => choose('system')} className="inline-flex items-center gap-2">
                <Monitor className="h-4 w-4" />
                Match system
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AppearanceOnboarding;


