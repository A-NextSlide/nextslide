import React from 'react';
import { BROWSER } from '@/utils/browser';

type Sample = { t: number };

export default function PerformanceHUD() {
  const [fps, setFps] = React.useState(0);
  const [mode, setMode] = React.useState<'hidden' | 'mini' | 'full'>(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('perf') === '1') return 'mini';
      const saved = localStorage.getItem('__perf_hud');
      if (saved === 'mini' || saved === 'full') return saved;
    } catch {}
    return 'hidden';
  });
  const [info] = React.useState(() => BROWSER);
  const rafRef = React.useRef<number | null>(null);
  const samples = React.useRef<Sample[]>([]);
  const last = React.useRef<number>(performance.now());

  React.useEffect(() => {
    if (mode === 'hidden') return;
    const tick = () => {
      const now = performance.now();
      const dt = now - last.current;
      last.current = now;
      samples.current.push({ t: dt });
      // Keep last second of samples
      const cutoff = now - 1000;
      while (samples.current.length > 0 && now - (samples.current[0].t + (last.current - dt)) > 1000) {
        samples.current.shift();
      }
      // Estimate FPS as 1000 / average dt over last 300ms window
      const windowMs = 300;
      let count = 0;
      let sum = 0;
      for (let i = samples.current.length - 1; i >= 0; i--) {
        sum += samples.current[i].t;
        count++;
        if (sum >= windowMs) break;
      }
      if (count > 0) setFps(Math.round((count / sum) * 1000));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [mode]);

  const toggleMode = () => {
    const next = mode === 'hidden' ? 'mini' : mode === 'mini' ? 'full' : 'hidden';
    setMode(next);
    try { localStorage.setItem('__perf_hud', next); } catch {}
  };

  if (process.env.NODE_ENV === 'production') return null;
  if (mode === 'hidden') return (
    <button
      onClick={toggleMode}
      style={{ position: 'fixed', bottom: 8, right: 8, zIndex: 99999, opacity: 0.25 }}
      aria-label="Toggle Performance HUD"
    >⚙️</button>
  );

  return (
    <div
      onClick={toggleMode}
      style={{
        position: 'fixed',
        bottom: 8,
        right: 8,
        zIndex: 99999,
        background: 'rgba(17,17,17,0.85)',
        color: 'white',
        padding: '8px 10px',
        borderRadius: 6,
        fontSize: 12,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        cursor: 'pointer',
        userSelect: 'none'
      }}
      title="Click to toggle HUD"
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <strong>{fps} fps</strong>
        <span>|</span>
        <span>{info.isSafari ? 'Safari' : info.isFirefox ? 'Firefox' : info.isChrome ? 'Chrome' : 'Other'}{info.majorVersion ? ' ' + info.majorVersion : ''}</span>
        {mode === 'full' && (
          <>
            <span>|</span>
            <span>mem: {typeof (performance as any).memory !== 'undefined' ? Math.round(((performance as any).memory.usedJSHeapSize || 0) / 1048576) + ' MB' : 'n/a'}</span>
            <span>|</span>
            <span>cores: {navigator.hardwareConcurrency || 'n/a'}</span>
          </>
        )}
      </div>
    </div>
  );
}



