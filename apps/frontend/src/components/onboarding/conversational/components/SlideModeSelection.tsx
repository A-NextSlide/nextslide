import React, { useEffect, useRef } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isLightColor } from '@/utils/colorUtils';

interface ThemeDataProp {
  background: string;
  text: string;
  accent: string;
  headingFont: string;
  bodyFont: string;
}

interface SlideModeSelectionProps {
  isProcessing: boolean;
  isBlocking?: boolean;
  blockingLabel?: string;
  isLocked?: boolean;
  lockedLabel?: string;
  onSelect: (mode: 'interactive' | 'static') => void;
  onContinueChat: () => void;
  showContinueChat?: boolean;
  compact?: boolean;
  className?: string;
  themeData?: ThemeDataProp;
  firstSlideTitle?: string;
}

const DEFAULTS: ThemeDataProp = {
  background: '#1a1a2e',
  text: '#ffffff',
  accent: '#e94560',
  headingFont: 'Inter',
  bodyFont: 'Inter',
};

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16) || 0,
    g: parseInt(h.substring(2, 4), 16) || 0,
    b: parseInt(h.substring(4, 6), 16) || 0,
  };
}

const SlideModeSelection: React.FC<SlideModeSelectionProps> = ({
  isProcessing,
  isBlocking = false,
  blockingLabel,
  isLocked = false,
  lockedLabel,
  onSelect,
  onContinueChat,
  showContinueChat = true,
  compact = false,
  className,
  themeData,
  firstSlideTitle,
}) => {
  const showStatus = isProcessing || isBlocking || isLocked;
  const isDisabled = isProcessing || isBlocking || isLocked;
  const resolvedBlockingLabel = blockingLabel || (isProcessing ? 'Preparing your deck...' : 'Finishing theme...');
  const statusLabel = isLocked ? (lockedLabel || 'Keep chatting to unlock generation.') : resolvedBlockingLabel;
  const statusMargin = compact ? 'mt-3' : 'mt-4';

  const t = themeData ?? DEFAULTS;
  const lightBg = isLightColor(t.background);
  const title = firstSlideTitle || 'Your Presentation';

  const headingFontFamily = `"${t.headingFont}", sans-serif`;
  const bodyFontFamily = `"${t.bodyFont}", sans-serif`;

  // Adaptive title sizing
  const titleLen = title.length;
  const titleSizeClass = compact
    ? (titleLen > 30 ? 'text-[5.5px]' : titleLen > 18 ? 'text-[7px]' : 'text-[8.5px]')
    : (titleLen > 30 ? 'text-[10px]' : titleLen > 18 ? 'text-xs' : 'text-sm');

  // ── Canvas particle network ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const accentHex = t.accent;
  const textHex = t.text;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    let cw = parent.clientWidth;
    let ch = parent.clientHeight;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const ac = hexToRgb(accentHex);
    const tc = hexToRgb(textHex);

    const count = 22;
    const particles = Array.from({ length: count }, () => ({
      x: Math.random() * cw,
      y: Math.random() * ch,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.6 + 0.5,
      useAccent: Math.random() > 0.4,
    }));

    let frameId: number;

    const draw = () => {
      ctx.clearRect(0, 0, cw, ch);
      const maxDist = Math.min(cw, ch) * 0.38;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -4) p.x = cw + 4;
        if (p.x > cw + 4) p.x = -4;
        if (p.y < -4) p.y = ch + 4;
        if (p.y > ch + 4) p.y = -4;
      }

      // Connection lines
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * 0.14;
            ctx.strokeStyle = `rgba(${ac.r},${ac.g},${ac.b},${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Dots
      for (const p of particles) {
        const c = p.useAccent ? ac : tc;
        const a = p.useAccent ? 0.35 : 0.1;
        ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      frameId = requestAnimationFrame(draw);
    };

    draw();

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        cw = entry.contentRect.width;
        ch = entry.contentRect.height;
        canvas.width = cw * dpr;
        canvas.height = ch * dpr;
        canvas.style.width = `${cw}px`;
        canvas.style.height = `${ch}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    });
    observer.observe(parent);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [accentHex, textHex]);

  return (
    <div className={cn(compact ? "mt-1" : "mt-4", "animate-in fade-in slide-in-from-bottom-2 duration-300", className)}>
      {/* Header */}
      <div className={cn("text-center", compact ? 'mb-1.5' : 'mb-3')}>
        <p className={cn("font-semibold text-zinc-800 dark:text-zinc-200", compact ? 'text-[10px]' : 'text-sm')}>
          Your presentation is ready to generate!
        </p>
        <p className={cn("text-zinc-500 dark:text-zinc-400", compact ? 'text-[8px] mt-0.5' : 'text-xs mt-0.5')}>
          Click below to generate.
        </p>
      </div>

      <div className={cn("grid grid-cols-2 w-full", compact ? 'gap-1.5' : 'gap-2')}>

        {/* ━━━ Next Gen Card ━━━ */}
        <button
          onClick={() => onSelect('interactive')}
          disabled={isDisabled}
          className={cn(
            "group relative w-full rounded-xl overflow-hidden text-left transition-all duration-300",
            "active:scale-[0.97] disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed",
            "hover:ring-2 hover:ring-offset-2 hover:ring-orange-400/60 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-orange-400/60",
            "shadow-[0_4px_20px_-6px_rgba(255,67,1,0.3)] hover:shadow-[0_8px_30px_-6px_rgba(255,67,1,0.45)]",
          )}
        >
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <div className="absolute inset-0 rounded-xl" style={{ backgroundColor: t.background }} />

            {/* Ambient glow */}
            <div
              className="absolute inset-0 rounded-xl pointer-events-none"
              style={{ background: `radial-gradient(ellipse at 75% 40%, ${t.accent}18 0%, transparent 55%)` }}
            />

            {/* ── Right: Canvas particle network ── */}
            <div className="absolute z-[2] pointer-events-none" style={{ right: 0, top: 0, bottom: 0, width: '55%' }}>
              <div className="absolute left-0 top-0 bottom-0 w-[24%] z-[1]"
                style={{ background: `linear-gradient(to right, ${t.background}, transparent)` }} />
              <div className="absolute inset-0 z-0">
                <canvas ref={canvasRef} className="block w-full h-full" />
              </div>
            </div>

            {/* ── Left content ── */}
            <div
              className="absolute z-10 flex flex-col justify-center"
              style={{ left: '8%', top: '10%', bottom: '18%', width: '42%' }}
            >
              <p
                className={cn("font-extrabold leading-tight line-clamp-2 drop-shadow-sm", titleSizeClass)}
                style={{ color: t.text, fontFamily: headingFontFamily }}
              >
                {title}
              </p>

              <div className={cn("flex flex-col", compact ? 'gap-[2px] mt-1' : 'gap-[3px] mt-1.5')}>
                {[58, 38].map((pctW, i) => (
                  <div key={i} className="rounded-full overflow-hidden" style={{
                    width: `${pctW}%`,
                    height: compact ? 1.5 : 2,
                    backgroundColor: t.accent,
                    opacity: 0.35 - i * 0.1,
                    animation: `slideRight 1s ease-out ${0.8 + i * 0.15}s both`,
                  }} />
                ))}
              </div>

              <div
                className={cn(
                  "rounded-full flex items-center self-start font-semibold",
                  compact ? 'px-1 py-[1px] text-[3.5px] gap-0.5 mt-1' : 'px-2 py-[2px] text-[5.5px] gap-1 mt-1.5',
                )}
                style={{
                  backgroundColor: t.accent,
                  color: isLightColor(t.accent) ? '#000' : '#fff',
                  boxShadow: `0 0 10px ${t.accent}44`,
                  animation: 'btnPulse 3s ease-in-out infinite',
                  fontFamily: bodyFontFamily,
                }}
              >
                <span style={{ width: compact ? 2 : 3, height: compact ? 2 : 3, borderRadius: '50%', backgroundColor: 'currentColor', opacity: 0.7 }} />
                Interactive
              </div>
            </div>

            {/* RECOMMENDED badge */}
            <div
              className={cn(
                "absolute top-[5%] right-[4%] rounded-[4px] font-black uppercase flex items-center gap-1 z-10",
                compact ? 'px-[3px] py-[1px] text-[3.5px] tracking-[0.05em]' : 'px-1.5 py-[3px] text-[6px] tracking-[0.08em]',
              )}
              style={{
                background: 'linear-gradient(135deg, #FF4301 0%, #FF6B35 100%)',
                color: '#fff',
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                boxShadow: '0 2px 8px rgba(255,67,1,0.4)',
              }}
            >
              <span
                className={cn("rounded-full bg-white", compact ? 'w-[3px] h-[3px]' : 'w-[5px] h-[5px]')}
                style={{ animation: 'recDot 1.5s ease-in-out infinite' }}
              />
              RECOMMENDED
            </div>

            {/* Bottom gradient + label */}
            <div
              className={cn(
                "absolute inset-x-0 bottom-0 rounded-b-xl flex items-end justify-between px-[8%] z-10",
                compact ? 'pb-[6%] pt-[24%]' : 'pb-[7%] pt-[28%]',
              )}
              style={{
                background: lightBg
                  ? 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.38) 55%, transparent 100%)'
                  : 'linear-gradient(to top, rgba(0,0,0,0.68) 0%, rgba(0,0,0,0.30) 55%, transparent 100%)',
              }}
            >
              <div className="flex flex-col">
                <span
                  className={cn("font-extrabold text-white leading-none", compact ? 'text-[8.5px]' : 'text-sm')}
                  style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif' }}
                >
                  Next Gen
                </span>
                <span className={cn("text-white/65 font-medium mt-0.5", compact ? 'text-[5.5px]' : 'text-[9px]')}>
                  Interactive / Dynamic
                </span>
              </div>
            </div>
          </div>
        </button>

        {/* ━━━ Traditional Card ━━━ */}
        <button
          onClick={() => onSelect('static')}
          disabled={isDisabled}
          className={cn(
            "group relative w-full rounded-xl overflow-hidden text-left transition-all duration-300",
            "active:scale-[0.97] disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed",
            "hover:ring-2 hover:ring-offset-2 hover:ring-zinc-400/50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-zinc-400/50",
            "shadow-[0_4px_20px_-6px_rgba(0,0,0,0.25)] hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.35)]",
          )}
        >
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <div className="absolute inset-0 rounded-xl" style={{ backgroundColor: t.background }} />

            <div
              className="absolute rounded-xl pointer-events-none"
              style={{ top: 0, right: 0, width: '35%', height: '45%', background: `linear-gradient(135deg, ${t.accent}18 0%, transparent 70%)` }}
            />

            {/* Two-column slide layout */}
            <div className="absolute inset-0 flex px-[8%] py-[10%]">
              <div className="flex flex-col justify-between" style={{ width: '58%' }}>
                <div>
                  <div className="rounded-full" style={{ width: compact ? 12 : 16, height: 2, backgroundColor: t.accent, opacity: 0.7, marginBottom: compact ? 3 : 4 }} />
                  <p
                    className={cn("font-bold leading-tight line-clamp-2", titleSizeClass)}
                    style={{ color: t.text, fontFamily: headingFontFamily }}
                  >
                    {title}
                  </p>
                  <div className={cn("flex flex-col", compact ? 'gap-[3px] mt-1' : 'gap-1 mt-1.5')}>
                    {[72, 88, 55].map((pctW, i) => (
                      <div key={i} className="flex items-center" style={{ gap: compact ? 2 : 3 }}>
                        <div className="rounded-full shrink-0" style={{ width: compact ? 2 : 2.5, height: compact ? 2 : 2.5, backgroundColor: t.accent, opacity: 0.5 }} />
                        <div className="h-[2.5px] rounded-full" style={{ width: `${pctW}%`, backgroundColor: t.text, opacity: 0.12 + i * 0.03 }} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center" style={{ gap: compact ? 2 : 3 }}>
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="rounded-[2px] flex items-center justify-center"
                      style={{
                        width: compact ? 8 : 10, height: compact ? 6 : 7,
                        backgroundColor: n === 1 ? t.accent : `${t.text}15`,
                        opacity: n === 1 ? 0.6 : 1,
                        fontSize: compact ? 4 : 5,
                        color: n === 1 ? (isLightColor(t.accent) ? '#000' : '#fff') : `${t.text}55`,
                        fontFamily: bodyFontFamily, fontWeight: 600,
                      }}
                    >{n}</div>
                  ))}
                </div>
              </div>

              <div
                className="flex flex-col items-center justify-center rounded-md ml-[4%]"
                style={{ width: '38%', backgroundColor: `${t.text}08`, border: `1px dashed ${t.text}18` }}
              >
                <svg viewBox="0 0 24 24" fill="none" className={cn(compact ? 'w-3 h-3' : 'w-4 h-4')} style={{ opacity: 0.2 }}>
                  <rect x="2" y="2" width="20" height="20" rx="3" stroke={t.text} strokeWidth="1.5" />
                  <circle cx="8.5" cy="8.5" r="2" stroke={t.text} strokeWidth="1.5" />
                  <path d="M2 16l5-5 4 4 3-3 8 8" stroke={t.text} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{ fontSize: compact ? 4 : 5, color: t.text, opacity: 0.18, fontFamily: bodyFontFamily, marginTop: 2 }}>Image</span>
              </div>
            </div>

            <div className="absolute left-0 top-[10%] bottom-[10%] w-[3px] rounded-r-full" style={{ backgroundColor: t.accent, opacity: 0.6 }} />

            {/* Bottom gradient + label */}
            <div
              className={cn("absolute inset-x-0 bottom-0 rounded-b-xl flex items-end px-[8%]", compact ? 'pb-[6%] pt-[24%]' : 'pb-[7%] pt-[28%]')}
              style={{
                background: lightBg
                  ? 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)'
                  : 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.22) 50%, transparent 100%)',
              }}
            >
              <div className="flex flex-col">
                <span className={cn("font-bold text-white leading-none", compact ? 'text-[8.5px]' : 'text-sm')} style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif' }}>
                  Traditional
                </span>
                <span className={cn("text-white/65 mt-0.5", compact ? 'text-[5.5px]' : 'text-[9px]')}>Static / PDF Export</span>
              </div>
            </div>
          </div>
        </button>
      </div>

      {/* Mode descriptions */}
      <div className={cn(compact ? 'mt-2 space-y-0.5' : 'mt-3 space-y-1')}>
        <p className={cn("text-zinc-600 dark:text-zinc-400 leading-snug", compact ? 'text-[7.5px]' : 'text-[11px]')}>
          <span className="font-bold text-zinc-800 dark:text-zinc-200">Next Gen:</span>{' '}custom visualizations, animated components, and whatever you need
        </p>
        <p className={cn("text-zinc-600 dark:text-zinc-400 leading-snug", compact ? 'text-[7.5px]' : 'text-[11px]')}>
          <span className="font-bold text-zinc-800 dark:text-zinc-200">Traditional:</span>{' '}classic slides for PowerPoint presentations and PDF export
        </p>
      </div>

      {showStatus && (
        <div className={cn("flex items-center justify-center", statusMargin)}>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-200/70 bg-white/90 text-[11px] text-zinc-500 shadow-sm">
            {isLocked && <Lock className="w-3.5 h-3.5" />}
            <span>{statusLabel}</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideRight {
          from { transform: translateX(-100%); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
        @keyframes btnPulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.05); }
        }
        @keyframes recDot {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
};

export default SlideModeSelection;
