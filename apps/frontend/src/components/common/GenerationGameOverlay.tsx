import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { X, Brain, Grid3x3, Lightbulb, Gamepad2 } from 'lucide-react';
import MemoryMatch from '@/components/common/games/MemoryMatch';
import SlidingPuzzle from '@/components/common/games/SlidingPuzzle';
import LightsOut from '@/components/common/games/LightsOut';

interface GenerationGameOverlayProps {
  deckState: 'pending' | 'creating' | 'generating' | 'completed' | 'error' | undefined;
  startedAt?: string | undefined;
  isVisibleOverride?: boolean;
  mountInsideSlide?: boolean;
  currentSlideIndex?: number;
  totalSlides?: number;
}

type GameKey = 'memory' | 'sliding' | 'lightsout';

const GAME_TITLES: Record<GameKey, string> = {
  memory: 'Memory Match',
  sliding: 'Sliding Puzzle',
  lightsout: 'Lights Out'
};

const GenerationGameOverlay: React.FC<GenerationGameOverlayProps> = ({
  deckState,
  startedAt,
  isVisibleOverride,
  mountInsideSlide = false,
  currentSlideIndex,
  totalSlides
}) => {
  const [showOverlay, setShowOverlay] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [activeGame, setActiveGame] = useState<GameKey | null>(null);
  const [completed, setCompleted] = useState(false);
  const [firstSlideDone, setFirstSlideDone] = useState(false);
  const timerRef = useRef<number | null>(null);
  const hasArmedRef = useRef(false);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const [boardSize, setBoardSize] = useState<number>(240);

  const isGenerating = deckState === 'creating' || deckState === 'generating' || deckState === 'pending';
  const isComplete = deckState === 'completed';

  // Arm a 5s timer when generation (re)starts
  useEffect(() => {
    if (isVisibleOverride) {
      setShowOverlay(true);
      return;
    }

    // Once we've shown the prompt, keep it visible until generation is complete
    if (showPrompt || showOverlay) {
      if (isComplete) {
        setCompleted(true);
      }
      return;
    }

    if (isGenerating && !isComplete && !hasArmedRef.current) {
      // If we have a startedAt, consider elapsed time already
      const startMs = startedAt ? new Date(startedAt).getTime() : Date.now();
      const elapsed = Date.now() - startMs;
      const remaining = Math.max(0, 5000 - elapsed);

      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setShowPrompt(true);
      }, remaining) as unknown as number;
      hasArmedRef.current = true;
    }

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isGenerating, isComplete, startedAt, isVisibleOverride]);

  // Track when slide 1 completes to show a subtle hint
  useEffect(() => {
    const onSlideCompleted = (e: any) => {
      const idx = e?.detail?.slide_index ?? e?.detail?.slideIndex;
      if (typeof idx === 'number' && idx === 0) {
        setFirstSlideDone(true);
      }
    };
    window.addEventListener('slide_completed', onSlideCompleted as EventListener);
    return () => window.removeEventListener('slide_completed', onSlideCompleted as EventListener);
  }, []);

  // Auto-hide overlay when user dismisses after completion
  const handleDismiss = () => {
    setShowOverlay(false);
    setActiveGame(null);
  };

  // Accent color derived from CSS variables to match theme
  const accentStyle = useMemo(() => ({
    color: 'var(--primary-foreground, #fff)',
    background: 'linear-gradient(90deg, rgb(249 115 22) 0%, rgb(236 72 153) 100%)'
  }), []);

  // Fit game board within available space (no scroll)
  useEffect(() => {
    if (!splitRef.current) return;
    const el = splitRef.current;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      const gap = 12; // approx gap-3
      const asideWidth = 260;
      const availableWidth = Math.max(0, rect.width - asideWidth - gap);
      const availableHeight = rect.height;
      // subtract small padding to account for inner gaps/padding so nothing scrolls
      const size = Math.floor(Math.min(availableWidth, availableHeight) - 16);
      setBoardSize(size);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Show nothing if not prompted yet
  if (!showPrompt && !showOverlay) return null;

  // Render the button or expanded overlay
  return (
    <div 
      className={cn(
        'absolute z-[60] transition-all duration-500 ease-out',
        showOverlay ? 'inset-0' : ''
      )} 
      style={
        showOverlay 
          ? { inset: 0 } 
          : mountInsideSlide 
            ? { top: 20, left: 20 } 
            : { top: '1rem', left: '1rem' }
      }
    >
      {!showOverlay && showPrompt ? (
        <>
          <button
            className="group relative px-6 py-2.5 rounded-lg bg-transparent border border-orange-500 text-orange-500 font-light shadow-sm hover:shadow-md transform transition-all duration-300 hover:scale-105 hover:bg-orange-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 animate-[bounce-in_0.6s_ease-out]"
            style={{
              fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", system-ui, sans-serif',
              letterSpacing: '0.02em'
            }}
            onClick={() => { setShowOverlay(true); }}
          >
            <span className="relative z-10 flex items-center gap-2.5">
              <Gamepad2 className="w-4 h-4" />
              <span className="text-sm">Want to play a game?</span>
              <span className="text-xs opacity-60">Slide gen may take ~1 min</span>
            </span>
          </button>
          <style dangerouslySetInnerHTML={{ __html: `
            @keyframes bounce-in {
              0% { opacity: 0; transform: scale(0.3) translateY(-10px); }
              50% { transform: scale(1.05) translateY(0); }
              70% { transform: scale(0.9) translateY(0); }
              100% { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}} />
        </>
      ) : null}
      
      {showOverlay && (
        <div
          className={cn(
            'rounded-2xl shadow-2xl border border-border backdrop-blur-xl bg-background/95',
            'overflow-hidden h-full w-full flex flex-col animate-[scale-in-up_0.3s_ease-out]'
          )}
        style={{ 
          boxShadow: '0 20px 40px rgba(0,0,0,0.1), 0 0 0 1px rgba(255,67,1,0.1)',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)'
        }}
      >
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes scale-in-up {
            from { 
              opacity: 0; 
              transform: scale(0.95) translateY(10px); 
            }
            to { 
              opacity: 1; 
              transform: scale(1) translateY(0); 
            }
          }
        `}} />
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-start gap-3 border-b border-orange-100">
          <div className="h-10 w-10 rounded-full flex items-center justify-center shadow-md animate-[float_3s_ease-in-out_infinite]" 
               style={{
                 background: 'linear-gradient(135deg, #FF4301 0%, #FF6B35 100%)',
                 boxShadow: '0 4px 12px rgba(255, 67, 1, 0.3)'
               }}>
            <Gamepad2 className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold tracking-tight bg-gradient-to-r from-orange-600 to-pink-600 bg-clip-text text-transparent" 
                 style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", system-ui, sans-serif' }}>
              Let's Play While We Wait!
            </div>
            <div className="mt-1 text-sm text-muted-foreground" style={{ fontFamily: '\'Inter\', -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif' }}>
              <div className="typing-animation" style={{ ['--message-length' as any]: 50, ['--animation-duration' as any]: '1.8s' }}>
                Slide gen may take about a minute. Play time? 
              </div>
              <span className="typing-cursor ml-0.5">✨</span>
            </div>
          </div>
          {/* Close button (always visible) */}
          <button
            aria-label="Close"
            className="group relative p-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-600 hover:text-orange-700 transition-all duration-200 transform hover:scale-110"
            onClick={handleDismiss}
          >
            <X className="w-5 h-5 relative z-10" />
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-orange-400 to-pink-400 opacity-0 group-hover:opacity-20 transition-opacity duration-200" />
          </button>
        </div>
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-5px); }
          }
        `}} />

        {/* Subtle banners */}
        {(firstSlideDone || completed) && (
          <div className="mx-5 mt-2 mb-1 text-xs font-medium rounded-md px-2 py-1 inline-flex items-center gap-1"
               style={{ background: 'rgba(16,185,129,0.12)', color: 'rgb(16,185,129)' }}>
            <span>
              ✨ {completed ? 'Slide is done' : 'Slide 1 is done — you can exit the game anytime.'}
            </span>
          </div>
        )}

        {/* Game chooser */}
        {!activeGame && (
          <div className="px-5 pb-5 pt-3 flex-1 flex items-center">
            <div className="grid grid-cols-3 gap-4 w-full">
              {([
                { key: 'memory', icon: Brain, desc: 'Match pairs', color: 'from-orange-500 to-pink-500' },
                { key: 'sliding', icon: Grid3x3, desc: 'Slide to solve', color: 'from-purple-500 to-pink-500' },
                { key: 'lightsout', icon: Lightbulb, desc: 'Lights off!', color: 'from-yellow-500 to-orange-500' }
              ] as { key: GameKey; icon: typeof Brain; desc: string; color: string }[]).map(({ key, icon: Icon, desc, color }, idx) => (
                <button
                  key={key}
                  onClick={() => setActiveGame(key)}
                  className="group relative rounded-2xl border-2 border-orange-200 hover:border-orange-400 transition-all transform hover:scale-105 hover:-translate-y-1 text-center p-6 bg-white hover:bg-orange-50 shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-orange-400 animate-[card-pop-in_0.5s_ease-out_forwards]"
                  style={{
                    animationDelay: `${idx * 100}ms`,
                    opacity: 0
                  }}
                >
                  <div className="relative mb-3">
                    <div className={`absolute inset-0 bg-gradient-to-br ${color} rounded-2xl blur-xl opacity-20 group-hover:opacity-40 transition-opacity duration-300`} />
                    <div
                      className={`relative h-16 w-16 mx-auto rounded-2xl flex items-center justify-center text-white shadow-lg transform group-hover:rotate-12 transition-transform duration-300`}
                      style={{
                        background: `linear-gradient(135deg, ${color.includes('orange') ? '#FF4301' : color.includes('purple') ? '#a855f7' : '#eab308'} 0%, ${color.includes('pink') ? '#ec4899' : color.includes('orange') ? '#fb923c' : '#f97316'} 100%)`,
                      }}
                    >
                      <Icon className="w-8 h-8" />
                    </div>
                  </div>
                  <div className="text-lg font-bold mb-1" style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", system-ui, sans-serif' }}>
                    {GAME_TITLES[key]}
                  </div>
                  <div className="text-sm text-muted-foreground">{desc}</div>
                  <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${color} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
                </button>
              ))}
            </div>
            <style dangerouslySetInnerHTML={{ __html: `
              @keyframes card-pop-in {
                0% { 
                  opacity: 0; 
                  transform: scale(0.8) translateY(20px); 
                }
                50% { 
                  transform: scale(1.02) translateY(-5px); 
                }
                100% { 
                  opacity: 1; 
                  transform: scale(1) translateY(0); 
                }
              }
            `}} />
          </div>
        )}

        {/* Active game container */}
        {activeGame && (
          <div className="px-4 pb-4 pt-2 flex-1 overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold" style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", system-ui, sans-serif' }}>
                {GAME_TITLES[activeGame]}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="text-xs px-3 py-1.5 rounded-full bg-orange-50 hover:bg-orange-100 text-orange-600 hover:text-orange-700 font-medium transition-all duration-200 transform hover:scale-105"
                  onClick={() => setActiveGame(null)}
                >
                  Switch game
                </button>
                <button
                  className="text-xs px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-700 font-medium transition-all duration-200"
                  onClick={handleDismiss}
                >
                  Close
                </button>
              </div>
            </div>

            {/* Game area + right instructions rail */}
            <div ref={splitRef} className="grid grid-cols-[1fr_260px] gap-3 h-full overflow-hidden">
              <div className="rounded-lg border border-border bg-card/70 p-3 h-full overflow-hidden flex items-center justify-center">
                <div style={{ width: `${boardSize}px`, height: `${boardSize}px` }} className="max-w-full max-h-full">
                  {activeGame === 'memory' && <div className="w-full h-full"><MemoryMatch /></div>}
                  {activeGame === 'sliding' && <div className="w-full h-full"><SlidingPuzzle size={3} /></div>}
                  {activeGame === 'lightsout' && <div className="w-full h-full"><LightsOut size={5} /></div>}
                </div>
              </div>
              <aside className="rounded-lg border border-border bg-background/70 p-3 text-sm overflow-hidden">
                <div className="font-semibold mb-2" style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", system-ui, sans-serif' }}>How to play</div>
                {activeGame === 'memory' && (
                  <ul className="list-disc ml-4 space-y-1 text-muted-foreground">
                    <li>Flip two cards at a time to find matching pairs.</li>
                    <li>Matched cards stay face up. Clear all to win.</li>
                  </ul>
                )}
                {activeGame === 'sliding' && (
                  <ul className="list-disc ml-4 space-y-1 text-muted-foreground">
                    <li>Click a tile next to the empty space to slide it.</li>
                    <li>Reorder tiles to 1..N with the blank at the end.</li>
                  </ul>
                )}
                {activeGame === 'lightsout' && (
                  <ul className="list-disc ml-4 space-y-1 text-muted-foreground">
                    <li>Click a light to toggle it and its neighbors.</li>
                    <li>Turn off all lights to win the board.</li>
                  </ul>
                )}
                {completed && (
                  <div className="mt-3 text-xs text-muted-foreground">Your slide is ready. You can continue playing or close this panel.</div>
                )}
              </aside>
            </div>
          </div>
        )}
        </div>
      )}
    </div>
  );
};

export default GenerationGameOverlay;


