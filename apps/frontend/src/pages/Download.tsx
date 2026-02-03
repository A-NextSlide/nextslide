import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BROWSER } from '@/utils/browser';
import { Button } from '@/components/ui/button';
import BrandWordmark from '@/components/common/BrandWordmark';
import PixelGridBackground from '@/components/landing/PixelGridBackground';
import { cn } from '@/lib/utils';
import {
  Download as DownloadIcon,
  ArrowLeft,
  Monitor,
  Keyboard,
  RefreshCw,
  Moon,
  Link2,
  Smartphone,
  Apple,
  CheckCircle2,
} from 'lucide-react';
import {
  detectDesktopPlatform,
  getAllDownloads,
  getDownloadUrl,
  getPlatformLabel,
  type DesktopPlatform,
} from '@/utils/desktopDownload';

// Platform SVG icons
const PlatformIcon = ({ platform, className }: { platform: DesktopPlatform; className?: string }) => {
  if (platform === 'mac') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
      </svg>
    );
  }
  if (platform === 'windows') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M3 12V6.5l8-1.1V12H3zm0 .5h8v6.6l-8-1.1V12.5zM11.5 5.3l9.5-1.3v8h-9.5V5.3zm0 7.2h9.5v8l-9.5-1.3v-6.7z" />
      </svg>
    );
  }
  // Linux
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587.26 1.264.398 1.966.398.737 0 1.434-.153 2.036-.45.228.427.635.738 1.11.842.728.19 1.644-.013 2.554-.47.91-.5 1.996-.406 2.774-.6.39-.12.737-.27.913-.601.174-.334.142-.8-.106-1.484-.073-.246-.014-.574.04-.97.027-.14.055-.337.055-.536.004-.21-.04-.413-.132-.602-.206-.411-.551-.544-.864-.68-.312-.133-.598-.2-.797-.4-.213-.239-.397-.571-.657-.839a.45.45 0 00-.12-.147c.124-.805-.009-1.658-.287-2.49-.593-1.77-1.83-3.47-2.716-4.52-.755-1.067-.975-1.929-1.05-3.021-.057-1.379 1.056-5.965-3.17-6.298A5.11 5.11 0 0012.504 0" />
    </svg>
  );
};

const DESKTOP_FEATURES = [
  {
    icon: Monitor,
    title: 'System Tray',
    description: 'Quick access from your menu bar. Create presentations without opening a browser.',
  },
  {
    icon: Keyboard,
    title: 'Keyboard Shortcuts',
    description: 'Native shortcuts that work system-wide. Generate slides from anywhere with a hotkey.',
  },
  {
    icon: RefreshCw,
    title: 'Auto Updates',
    description: 'Always on the latest version. Updates download and install silently in the background.',
  },
  {
    icon: Moon,
    title: 'Native Dark Mode',
    description: 'Follows your system appearance automatically. Light, dark, or auto — your choice.',
  },
  {
    icon: Link2,
    title: 'Deep Links',
    description: 'Open nextslide:// links directly in the app. Click shared links and go straight to editing.',
  },
  {
    icon: Smartphone,
    title: 'Touch Bar Support',
    description: 'macOS Touch Bar integration for quick actions. Slide navigation at your fingertips.',
  },
];

const SYSTEM_REQUIREMENTS: Record<DesktopPlatform, string[]> = {
  mac: [
    'macOS 12 Monterey or later',
    'Apple Silicon or Intel processor',
    '4 GB RAM minimum',
    '250 MB disk space',
  ],
  windows: [
    'Windows 10 (64-bit) or later',
    'x64 processor',
    '4 GB RAM minimum',
    '250 MB disk space',
  ],
  linux: [
    'Ubuntu 20.04+ / Fedora 36+ / Debian 11+',
    'x64 processor',
    '4 GB RAM minimum',
    '250 MB disk space',
  ],
};

const Download: React.FC = () => {
  const navigate = useNavigate();
  const detectedPlatform = useMemo(() => detectDesktopPlatform(), []);
  const downloads = useMemo(() => getAllDownloads(), []);
  const primaryDownload = downloads.find((d) => d.platform === detectedPlatform)!;

  // Scroll animation observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '-50px' }
    );
    document.querySelectorAll('.animate-on-scroll').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-[#FCFBF8] dark:bg-[#0a0a0a] overflow-x-clip">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-[#FCFBF8]/90 dark:bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-black/10 dark:border-white/10">
        <div className="max-w-[1400px] mx-auto px-8 py-4 flex items-center justify-between">
          <div className="cursor-pointer" onClick={() => navigate(BROWSER.isNativeApp ? '/app' : '/')}>
            <BrandWordmark
              tag="span"
              sizePx={18.95}
              xImageUrl="/brand/nextslide-x.png"
              gapLeftPx={-3}
              gapRightPx={-8}
              liftPx={-4}
              xLiftPx={-4}
              rightLiftPx={0}
            />
          </div>
          <button
            onClick={() => navigate(BROWSER.isNativeApp ? '/app' : '/')}
            className="text-sm font-medium text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to NextSlide
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 sm:pt-40 pb-20 px-8 overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 -z-10">
          <PixelGridBackground theme="light" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/50 to-[#FCFBF8] dark:via-zinc-950/50 dark:to-[#0a0a0a] pointer-events-none" />
        </div>

        <div className="max-w-[800px] mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FF4301]/10 border border-[#FF4301]/20 mb-8">
            <Monitor className="w-4 h-4 text-[#FF4301]" />
            <span
              className="text-sm font-bold text-[#FF4301]"
              style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
            >
              DESKTOP APP
            </span>
          </div>

          {/* Heading */}
          <h1
            className="text-black dark:text-white mb-6"
            style={{
              fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
              fontWeight: 900,
              fontSize: 'clamp(36px, 6vw, 64px)',
              lineHeight: '1.05',
              letterSpacing: '-0.02em',
              textTransform: 'uppercase',
            }}
          >
            NextSlide for{' '}
            <span className="text-[#FF4301]">{getPlatformLabel(detectedPlatform)}</span>
          </h1>

          <p className="text-lg sm:text-xl text-black/60 dark:text-white/60 max-w-xl mx-auto mb-10 leading-relaxed">
            A native desktop experience. Faster startup, system shortcuts, tray access, and automatic
            updates — everything you love about NextSlide, without the browser tab.
          </p>

          {/* Primary Download CTA */}
          <a href={primaryDownload.url} target="_blank" rel="noopener noreferrer">
            <Button
              size="lg"
              className="bg-[#FF4301] hover:bg-[#E63901] text-white px-10 py-7 text-lg font-bold shadow-lg shadow-orange-500/20 rounded-xl gap-3"
            >
              <DownloadIcon className="w-5 h-5" />
              Download for {primaryDownload.label}
            </Button>
          </a>

          {/* Version + file info */}
          <p className="mt-4 text-sm text-black/40 dark:text-white/40">
            v{import.meta.env.VITE_DESKTOP_APP_VERSION || '1.0.0'} &middot; {primaryDownload.fileType}{' '}
            &middot; {primaryDownload.size} &middot; {primaryDownload.systemReq}
          </p>
        </div>
      </section>

      {/* All Platforms */}
      <section className="py-20 px-8 bg-white dark:bg-zinc-950">
        <div className="max-w-[1000px] mx-auto">
          <div className="text-center mb-12 animate-on-scroll opacity-0">
            <h2
              className="text-black dark:text-white mb-4"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(28px, 4vw, 40px)',
                lineHeight: '1.1',
                letterSpacing: '-0.02em',
                textTransform: 'uppercase',
              }}
            >
              All Platforms
            </h2>
            <p className="text-black/60 dark:text-white/60">
              Available for macOS, Windows, and Linux
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 animate-on-scroll opacity-0">
            {downloads.map((dl) => {
              const isDetected = dl.platform === detectedPlatform;
              return (
                <div
                  key={dl.platform}
                  className={cn(
                    'relative p-6 rounded-2xl border-2 bg-[#FCFBF8] dark:bg-zinc-900 transition-all',
                    isDetected
                      ? 'border-[#FF4301]/40 shadow-lg shadow-[#FF4301]/5'
                      : 'border-black/5 dark:border-white/5'
                  )}
                >
                  {isDetected && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-[#FF4301] text-white text-[10px] font-bold rounded-full uppercase tracking-wider">
                      Detected
                    </div>
                  )}

                  <div className="flex flex-col items-center text-center">
                    <PlatformIcon
                      platform={dl.platform}
                      className="w-12 h-12 text-black/70 dark:text-white/70 mb-4"
                    />
                    <h3
                      className="text-lg font-bold text-black dark:text-white mb-1"
                      style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
                    >
                      {dl.label}
                    </h3>
                    <p className="text-sm text-black/50 dark:text-white/50 mb-1">
                      {dl.fileType} &middot; {dl.size}
                    </p>
                    <p className="text-xs text-black/40 dark:text-white/40 mb-5">
                      {dl.systemReq}
                    </p>

                    <a
                      href={dl.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full"
                    >
                      <Button
                        variant={isDetected ? 'default' : 'outline'}
                        className={cn(
                          'w-full gap-2',
                          isDetected
                            ? 'bg-[#FF4301] hover:bg-[#E63901] text-white'
                            : 'border-black/10 dark:border-white/10'
                        )}
                      >
                        <DownloadIcon className="w-4 h-4" />
                        Download
                      </Button>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-8 bg-[#FCFBF8] dark:bg-[#0a0a0a]">
        <div className="max-w-[1000px] mx-auto">
          <div className="text-center mb-12 animate-on-scroll opacity-0">
            <h2
              className="text-black dark:text-white mb-4"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(28px, 4vw, 40px)',
                lineHeight: '1.1',
                letterSpacing: '-0.02em',
                textTransform: 'uppercase',
              }}
            >
              Why Desktop?
            </h2>
            <p className="text-black/60 dark:text-white/60">
              Everything the web app offers, plus native advantages
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 animate-on-scroll opacity-0">
            {DESKTOP_FEATURES.map((feature, i) => (
              <div
                key={i}
                className="p-5 rounded-2xl border border-black/5 dark:border-white/5 bg-white dark:bg-zinc-900 hover:border-[#FF4301]/20 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-[#FF4301]/10 flex items-center justify-center mb-3">
                  <feature.icon className="w-5 h-5 text-[#FF4301]" />
                </div>
                <h3
                  className="text-sm font-bold text-black dark:text-white mb-1"
                  style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
                >
                  {feature.title}
                </h3>
                <p className="text-sm text-black/60 dark:text-white/60 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* System Requirements */}
      <section className="py-20 px-8 bg-white dark:bg-zinc-950">
        <div className="max-w-[1000px] mx-auto">
          <div className="text-center mb-12 animate-on-scroll opacity-0">
            <h2
              className="text-black dark:text-white mb-4"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(24px, 3vw, 36px)',
                lineHeight: '1.1',
                letterSpacing: '-0.02em',
                textTransform: 'uppercase',
              }}
            >
              System Requirements
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6 animate-on-scroll opacity-0">
            {(['mac', 'windows', 'linux'] as DesktopPlatform[]).map((platform) => (
              <div
                key={platform}
                className={cn(
                  'p-6 rounded-2xl border',
                  platform === detectedPlatform
                    ? 'border-[#FF4301]/30 bg-[#FF4301]/[0.02]'
                    : 'border-black/5 dark:border-white/5 bg-[#FCFBF8] dark:bg-zinc-900'
                )}
              >
                <div className="flex items-center gap-3 mb-4">
                  <PlatformIcon
                    platform={platform}
                    className="w-6 h-6 text-black/60 dark:text-white/60"
                  />
                  <h3
                    className="font-bold text-black dark:text-white"
                    style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
                  >
                    {getPlatformLabel(platform)}
                  </h3>
                </div>
                <ul className="space-y-2">
                  {SYSTEM_REQUIREMENTS[platform].map((req, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-black/60 dark:text-white/60">
                      <CheckCircle2 className="w-4 h-4 text-[#FF4301]/60 flex-shrink-0 mt-0.5" />
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-20 px-8 bg-[#FCFBF8] dark:bg-[#0a0a0a]">
        <div className="max-w-[600px] mx-auto text-center animate-on-scroll opacity-0">
          <p className="text-black/50 dark:text-white/50 mb-3">Prefer the browser?</p>
          <p className="text-lg text-black/80 dark:text-white/80 mb-6">
            NextSlide works great in any modern browser too — no download needed.
          </p>
          <Button
            variant="outline"
            className="border-black/10 dark:border-white/10"
            onClick={() => navigate(BROWSER.isNativeApp ? '/app' : '/')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to web app
          </Button>
        </div>
      </section>

      {/* Minimal Footer */}
      <footer className="bg-black text-white/60 py-10 px-8">
        <div className="max-w-[1400px] mx-auto text-center text-sm">
          <p>&copy; 2026 NextSlide</p>
        </div>
      </footer>
    </div>
  );
};

export default Download;
