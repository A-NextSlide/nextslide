import React, { useEffect, useState, useRef } from 'react';
import { Sparkles } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Rotating message sets keyed by progress range.
// Within each range the component cycles through messages every few seconds.
// ─────────────────────────────────────────────────────────────────────────────

const MESSAGES_EARLY = [
  'Reading your document...',
  'Scanning pages for key content...',
  'Picking out the important details...',
  'Understanding your document structure...',
];

const MESSAGES_MID = [
  'Designing a beautiful layout for your content...',
  'Choosing the best slide structure...',
  'Matching colors and typography to your topic...',
  'Crafting a compelling narrative flow...',
  'Selecting the perfect visual style...',
];

const MESSAGES_LATE = [
  'Creating beautifully designed slides just for you...',
  'Polishing every slide to perfection...',
  'Fine-tuning the design details...',
  'Making sure every element looks great...',
  'Putting the finishing touches on your deck...',
];

const MESSAGES_WRAPPING = [
  'Almost done — wrapping up the final slides...',
  'Just a moment — finalizing a large document...',
  'Finishing up — big files need a little extra love...',
  'Nearly there — tidying up the last details...',
];

function getPool(progress: number) {
  if (progress < 25) return MESSAGES_EARLY;
  if (progress < 60) return MESSAGES_MID;
  if (progress < 92) return MESSAGES_LATE;
  return MESSAGES_WRAPPING;
}

// ─────────────────────────────────────────────────────────────────────────────

interface ProcessingStateProps {
  progress: number;
}

const CYCLE_MS = 3_500; // swap message every 3.5 s

export default function ProcessingState({ progress }: ProcessingStateProps) {
  const [message, setMessage] = useState(() => getPool(progress)[0]);
  const indexRef = useRef(0);
  const [fade, setFade] = useState(true);

  // Cycle messages within the current pool
  useEffect(() => {
    const id = setInterval(() => {
      const pool = getPool(progress);
      indexRef.current = (indexRef.current + 1) % pool.length;

      // Fade out → swap → fade in
      setFade(false);
      setTimeout(() => {
        setMessage(pool[indexRef.current]);
        setFade(true);
      }, 200);
    }, CYCLE_MS);

    return () => clearInterval(id);
  }, [progress]);

  // When the progress bracket changes, immediately show the first message
  // of the new pool so the text stays relevant.
  const poolKeyRef = useRef<string>('');
  useEffect(() => {
    const pool = getPool(progress);
    const key = pool[0]; // use first msg as pool identity
    if (key !== poolKeyRef.current) {
      poolKeyRef.current = key;
      indexRef.current = 0;
      setMessage(pool[0]);
    }
  }, [progress]);

  const pct = Math.round(Math.min(progress, 100));

  return (
    <div className="flex flex-col items-center gap-6 py-10">
      {/* Animated icon */}
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF6B00]/15 to-[#FF8533]/10 flex items-center justify-center">
          <Sparkles className="w-7 h-7 text-[#FF6B00] animate-pulse" />
        </div>
        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#FF6B00] animate-ping" />
      </div>

      {/* Rotating message */}
      <div className="text-center max-w-md h-14 flex items-center justify-center">
        <p
          className={`text-lg font-semibold text-zinc-900 transition-opacity duration-200 ${
            fade ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {message}
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-sm">
        <div className="h-2.5 rounded-full bg-zinc-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#FF6B00] to-[#FF8533] transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-400 text-center">{pct}%</p>
      </div>
    </div>
  );
}
