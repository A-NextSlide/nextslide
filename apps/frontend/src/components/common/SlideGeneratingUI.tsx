import React, { useEffect, useMemo, useRef, useState } from 'react';

export type LoaderBrandTheme = {
  logoUrl?: string;
  name?: string;
  accent?: string;
  accentAlt?: string;
  background?: string;
  text?: string;
};

interface SlideGeneratingUIProps {
  progress?: number;
  slideNumber?: number;
  totalSlides?: number;
  message?: string;
  slidesCompleted?: number;
  slidesInProgress?: number;
  elapsedTime?: number;
  brand?: LoaderBrandTheme;
  outlineTitles?: string[];
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const normalizeHex = (value?: string): string | null => {
  if (!value || typeof value !== 'string') return null;
  const raw = value.trim().replace('#', '');
  if (raw.length === 3) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
  }
  if (raw.length === 6) {
    return `#${raw}`;
  }
  return null;
};

const hexToRgb = (value?: string): { r: number; g: number; b: number } | null => {
  const hex = normalizeHex(value);
  if (!hex) return null;
  const int = parseInt(hex.slice(1), 16);
  if (Number.isNaN(int)) return null;
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255
  };
};

const toRgba = (value: string | undefined, alpha: number, fallback: string) => {
  const rgb = hexToRgb(value);
  if (!rgb) return fallback;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
};

export const SlideGeneratingUI: React.FC<SlideGeneratingUIProps> = ({
  progress = 0,
  slideNumber,
  totalSlides,
  message,
  slidesCompleted = 0,
  slidesInProgress = 0,
  elapsedTime = 0,
  brand,
  outlineTitles
}) => {
  const [localElapsed, setLocalElapsed] = useState(0);
  const isComponentVisibleRef = useRef(true);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    isComponentVisibleRef.current = true;
    return () => {
      isComponentVisibleRef.current = false;
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isComponentVisibleRef.current) {
        setLocalElapsed(Date.now() - startTimeRef.current);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsedMs = elapsedTime && elapsedTime > 0 ? elapsedTime : localElapsed;

  const slideTotal = totalSlides && totalSlides > 0
    ? totalSlides
    : Math.max(slidesCompleted + slidesInProgress, 6);

  const activeSlideNumber = slideNumber || Math.min(slidesCompleted + 1, slideTotal);
  const displayProgress = clamp(Math.round(progress > 0 ? progress : ((activeSlideNumber - 1) / slideTotal) * 100), 0, 100);

  const activeTitle = outlineTitles && outlineTitles.length >= activeSlideNumber
    ? outlineTitles[activeSlideNumber - 1]
    : undefined;

  const isDarkMode = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const brandName = brand?.name || 'Nextslide';
  const logoUrl = brand?.logoUrl;

  const monogram = useMemo(() => {
    const words = brandName.split(/\s+/).filter(Boolean);
    const letters = words.map(word => word[0]).join('');
    return letters.slice(0, 2).toUpperCase() || 'NS';
  }, [brandName]);

  const accent = brand?.accent || '#FF4301';
  const background = brand?.background || (isDarkMode ? '#0B0B0B' : '#FAFAFA');
  const ink = brand?.text || (isDarkMode ? '#F5F2EC' : '#151413');

  const inkSoftFallback = isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)';

  const rootStyle = {
    ['--accent' as any]: accent,
    ['--accent-soft' as any]: toRgba(accent, isDarkMode ? 0.15 : 0.08, 'rgba(255,67,1,0.1)'),
    ['--bg' as any]: background,
    ['--ink' as any]: ink,
    ['--ink-soft' as any]: toRgba(ink, isDarkMode ? 0.4 : 0.2, inkSoftFallback),
    ['--frame-bg' as any]: isDarkMode ? 'rgba(20,20,20,0.6)' : 'rgba(255,255,255,0.9)',
    ['--frame-stroke' as any]: toRgba(ink, isDarkMode ? 0.2 : 0.1, 'rgba(20,20,20,0.1)')
  } as React.CSSProperties;

  const statusMessage = message && message.trim().length > 0
    ? message
    : (activeTitle ? `Creating: ${activeTitle}` : 'Building your slide...');

  const formatElapsed = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  };

  return (
    <div className="ns-loader" style={rootStyle}>
      <div className="ns-backdrop" />

      <header className="ns-top">
        <div className="ns-brand">
          <div className="ns-logo">
            {logoUrl ? (
              <img src={logoUrl} alt="Brand logo" />
            ) : (
              <span>{monogram}</span>
            )}
          </div>
          <div className="ns-brand-text">
            <div className="ns-brand-name">{brandName}</div>
            <div className="ns-brand-sub">Generating</div>
          </div>
        </div>

        <div className="ns-status">
          <div className="ns-phase-label">Slide {activeSlideNumber} of {slideTotal}</div>
          <div className="ns-phase-sub">{statusMessage}</div>
        </div>
      </header>

      <main className="ns-main">
        <div className="ns-canvas">
          {/* Simple slide skeleton */}
          <div className="ns-skeleton">
            <div className="ns-skel-title" />
            <div className="ns-skel-body">
              <div className="ns-skel-line w-full" />
              <div className="ns-skel-line w-3/4" />
              <div className="ns-skel-line w-1/2" />
            </div>
            <div className="ns-skel-media" />
          </div>
          {/* Shimmer overlay */}
          <div className="ns-shimmer" />
        </div>
      </main>

      <footer className="ns-footer">
        <div className="ns-progress-row">
          <span className="ns-progress-label">{displayProgress}% Complete</span>
          <span className="ns-progress-meta">{formatElapsed(elapsedMs)}</span>
        </div>
        <div className="ns-progress-bar">
          <div className="ns-progress-fill" style={{ width: `${displayProgress}%` }} />
        </div>
      </footer>

      <style>{`
        .ns-loader {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          padding: clamp(20px, 3vw, 32px);
          color: var(--ink);
          background: var(--bg);
          overflow: hidden;
          font-family: "Inter", "Hanken Grotesk", sans-serif;
        }

        .ns-backdrop {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 20% 20%, var(--accent-soft), transparent 50%);
          opacity: 0.5;
          z-index: 0;
        }

        .ns-top {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 16px;
        }

        .ns-brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .ns-logo {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: var(--frame-bg);
          border: 1px solid var(--frame-stroke);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .ns-logo img {
          width: 70%;
          height: 70%;
          object-fit: contain;
        }

        .ns-logo span {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 1px;
          color: var(--ink);
        }

        .ns-brand-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .ns-brand-name {
          font-size: 14px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.6px;
        }

        .ns-brand-sub {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 1.4px;
          text-transform: uppercase;
          color: var(--accent);
        }

        .ns-status {
          text-align: right;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .ns-phase-label {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .ns-phase-sub {
          font-size: 11px;
          color: var(--ink-soft);
          max-width: 280px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .ns-main {
          position: relative;
          z-index: 1;
          flex: 1;
          min-height: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .ns-canvas {
          position: relative;
          width: clamp(300px, 80%, 800px);
          aspect-ratio: 16 / 9;
          background: var(--frame-bg);
          border-radius: 16px;
          border: 1px solid var(--frame-stroke);
          overflow: hidden;
          box-shadow: 0 12px 30px rgba(0,0,0,0.06);
        }

        .ns-skeleton {
          position: absolute;
          inset: 0;
          padding: 10%;
          display: flex;
          flex-direction: column;
          gap: 12%;
        }

        .ns-skel-title {
          width: 60%;
          height: 12%;
          background: var(--ink-soft);
          border-radius: 8px;
        }

        .ns-skel-body {
          display: flex;
          flex-direction: column;
          gap: 8%;
          width: 50%;
        }

        .ns-skel-line {
          height: 6%;
          background: var(--ink-soft);
          border-radius: 4px;
          opacity: 0.6;
        }

        .ns-skel-line.w-full { width: 100%; }
        .ns-skel-line.w-3\\/4 { width: 75%; }
        .ns-skel-line.w-1\\/2 { width: 50%; }

        .ns-skel-media {
          position: absolute;
          top: 20%;
          right: 8%;
          width: 35%;
          height: 55%;
          background: var(--accent-soft);
          border-radius: 12px;
        }

        .ns-shimmer {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255,255,255,0.15) 50%,
            transparent 100%
          );
          animation: ns-shimmer 1.8s ease-in-out infinite;
        }

        @keyframes ns-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }

        .ns-footer {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 16px;
        }

        .ns-progress-row {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: var(--ink-soft);
        }

        .ns-progress-label {
          font-weight: 700;
          color: var(--ink);
        }

        .ns-progress-bar {
          width: 100%;
          height: 6px;
          border-radius: 999px;
          background: var(--ink-soft);
          overflow: hidden;
        }

        .ns-progress-fill {
          height: 100%;
          background: var(--accent);
          transition: width 0.5s ease-out;
          border-radius: 999px;
        }

        @media (max-width: 600px) {
          .ns-top {
            flex-direction: column;
            align-items: flex-start;
          }

          .ns-status {
            text-align: left;
          }

          .ns-canvas {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};

export default SlideGeneratingUI;
