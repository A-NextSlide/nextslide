import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Sparkles, Rocket, TrendingUp, Microscope, Coffee, Timer, FlaskConical, BookOpen, Handshake, Globe, Wifi, Megaphone, MousePointer2, X, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ShowcaseDeck } from '@/services/showcaseService';
import MiniSlide from '@/components/deck/MiniSlide';
import { Button } from '@/components/ui/button';
import { BROWSER } from '@/utils/browser';

export interface PromptItem {
    id: string;
    badge: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    text: string;
    theme: 'light' | 'orange';
    deckIndex: number;
}

interface InteractiveHeroProps {
    decks: ShowcaseDeck[];
    isLoading: boolean;
    prompts?: PromptItem[];
    compact?: boolean;
}

const PROMPTS = [
    {
        id: 'solar-system',
        badge: 'Science',
        icon: Microscope,
        text: "A tour of our solar system from Mercury to the Kuiper Belt",
        theme: 'light' as const,
        deckIndex: 0
    },
    {
        id: 'series-b',
        badge: 'Startup',
        icon: Rocket,
        text: "Series B fundraising playbook for a company scaling past $10M ARR",
        theme: 'light' as const,
        deckIndex: 2
    },
    {
        id: 'machine-learning',
        badge: 'AI / ML',
        icon: FlaskConical,
        text: "Machine learning crash course that makes AI feel simple",
        theme: 'light' as const,
        deckIndex: 7
    },
    {
        id: 'ww2',
        badge: 'History',
        icon: BookOpen,
        text: "World War II: a visual timeline of the global conflict",
        theme: 'light' as const,
        deckIndex: 8
    },
    {
        id: 'brand',
        badge: 'Marketing',
        icon: Megaphone,
        text: "Brand positioning strategy for a crowded market",
        theme: 'light' as const,
        deckIndex: 9
    },
    {
        id: 'sales',
        badge: 'Sales',
        icon: Handshake,
        text: "Enterprise sales playbook for closing six-figure deals",
        theme: 'orange' as const,
        deckIndex: 11
    },
    {
        id: 'crypto',
        badge: 'Finance',
        icon: TrendingUp,
        text: "Cryptocurrency market analysis covering DeFi and Layer 2",
        theme: 'light' as const,
        deckIndex: 13
    },
    {
        id: 'photography',
        badge: 'Creative',
        icon: Sparkles,
        text: "Photography masterclass on composition and visual storytelling",
        theme: 'light' as const,
        deckIndex: 17
    },
    {
        id: 'egypt',
        badge: 'History',
        icon: Globe,
        text: "Ancient Egypt: pyramids, pharaohs, and the Nile civilization",
        theme: 'light' as const,
        deckIndex: 18
    },
    {
        id: 'music',
        badge: 'Education',
        icon: Coffee,
        text: "Music theory crash course from scales to chord progressions",
        theme: 'light' as const,
        deckIndex: 19
    },
    {
        id: 'digital-transform',
        badge: 'Business',
        icon: Wifi,
        text: "Digital transformation roadmap from legacy to cloud-native",
        theme: 'light' as const,
        deckIndex: 21
    },
    {
        id: 'nutrition',
        badge: 'Health',
        icon: Timer,
        text: "The science of nutrition: macros, micros, and metabolic health",
        theme: 'light' as const,
        deckIndex: 29
    }
];

const InteractiveHero: React.FC<InteractiveHeroProps> = ({ decks, isLoading, prompts: customPrompts, compact }) => {
    const effectivePrompts = customPrompts || PROMPTS;
    const [activeIndex, setActiveIndex] = useState(0);
    const [slideTransitioning, setSlideTransitioning] = useState(false);

    // Track selected slide within the active deck
    const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);

    // Fullscreen presentation mode
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [fsSlideIndex, setFsSlideIndex] = useState(0);

    const activePrompt = effectivePrompts[activeIndex];

    // Safe deck retrieval
    const activeDeck = decks.length > 0
        ? decks[activePrompt.deckIndex % decks.length]
        : null;

    // Reset selected slide when deck changes
    useEffect(() => {
        setSelectedSlideIndex(0);
    }, [activeIndex]);

    const handleNext = () => {
        setSlideTransitioning(true);
        setTimeout(() => {
            setActiveIndex((prev) => (prev + 1) % effectivePrompts.length);
            setSlideTransitioning(false);
        }, 300);
    };

    const handlePrev = () => {
        setSlideTransitioning(true);
        setTimeout(() => {
            setActiveIndex((prev) => (prev - 1 + effectivePrompts.length) % effectivePrompts.length);
            setSlideTransitioning(false);
        }, 300);
    };

    const handleNextSlide = () => {
        if (!activeDeck?.slides) return;
        setSelectedSlideIndex((prev) =>
            prev < activeDeck.slides.length - 1 ? prev + 1 : 0
        );
    };

    const handlePrevSlide = () => {
        if (!activeDeck?.slides) return;
        setSelectedSlideIndex((prev) =>
            prev > 0 ? prev - 1 : activeDeck.slides.length - 1
        );
    };

    const totalSlides = activeDeck?.slides?.length || 0;

    // Fullscreen presentation handlers
    const openFullscreen = useCallback(() => {
        setFsSlideIndex(selectedSlideIndex);
        setIsFullscreen(true);
    }, [selectedSlideIndex]);

    const closeFullscreen = useCallback(() => {
        setIsFullscreen(false);
    }, []);

    const fsNext = useCallback(() => {
        if (activeDeck?.slides) {
            setFsSlideIndex(prev => prev < activeDeck.slides.length - 1 ? prev + 1 : prev);
        }
    }, [activeDeck]);

    const fsPrev = useCallback(() => {
        setFsSlideIndex(prev => prev > 0 ? prev - 1 : prev);
    }, []);

    // Keyboard + touch for fullscreen
    useEffect(() => {
        if (!isFullscreen) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeFullscreen();
            else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); fsNext(); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); fsPrev(); }
        };
        let touchStartX = 0;
        const handleTouchStart = (e: TouchEvent) => { if (e.touches.length) touchStartX = e.touches[0].clientX; };
        const handleTouchEnd = (e: TouchEvent) => {
            if (!e.changedTouches.length) return;
            const dx = e.changedTouches[0].clientX - touchStartX;
            if (Math.abs(dx) > 50) { dx < 0 ? fsNext() : fsPrev(); }
        };
        // Lock body scroll
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKey);
        window.addEventListener('touchstart', handleTouchStart, { passive: true });
        window.addEventListener('touchend', handleTouchEnd, { passive: true });
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', handleKey);
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchend', handleTouchEnd);
        };
    }, [isFullscreen, fsNext, fsPrev, closeFullscreen]);

    const isOrange = activePrompt.theme === 'orange';

    // Fullscreen overlay — portaled to document.body to escape stacking contexts
    const fullscreenOverlay = isFullscreen && activeDeck?.slides ? createPortal(
        <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center" onClick={closeFullscreen}>
            {/* Top bar */}
            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-3 md:p-5">
                <div className="bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5 text-white/90 text-sm font-medium border border-white/20">
                    {fsSlideIndex + 1} / {activeDeck.slides.length}
                </div>
                <button
                    onClick={closeFullscreen}
                    className="bg-black/60 backdrop-blur-sm rounded-full w-9 h-9 flex items-center justify-center text-white/90 hover:bg-black/80 border border-white/20"
                >
                    <X size={18} />
                </button>
            </div>

            {/* Slide */}
            <div
                className="relative w-full h-full flex items-center justify-center p-2 md:p-12"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="relative w-full max-w-[1400px] aspect-video bg-white rounded-lg overflow-hidden shadow-2xl">
                    <MiniSlide
                        key={`fs-${fsSlideIndex}`}
                        slide={activeDeck.slides[fsSlideIndex]}
                        width={1280}
                        height={720}
                        responsive
                        className="w-full h-full"
                        interactive={!BROWSER.isMobile}
                        forceRender
                    />
                </div>

                {/* Nav buttons */}
                <button
                    onClick={(e) => { e.stopPropagation(); fsPrev(); }}
                    className={cn(
                        "absolute left-1 md:left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm border border-white/20",
                        fsSlideIndex === 0 ? "opacity-30" : "hover:bg-black/70 active:scale-95"
                    )}
                    disabled={fsSlideIndex === 0}
                >
                    <ChevronLeft size={22} />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); fsNext(); }}
                    className={cn(
                        "absolute right-1 md:right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm border border-white/20",
                        fsSlideIndex === activeDeck.slides.length - 1 ? "opacity-30" : "hover:bg-black/70 active:scale-95"
                    )}
                    disabled={fsSlideIndex === activeDeck.slides.length - 1}
                >
                    <ChevronRight size={22} />
                </button>
            </div>

            {/* Progress bar */}
            <div className="absolute bottom-3 md:bottom-5 left-6 right-6 z-10">
                <div className="bg-white/20 rounded-full h-1 overflow-hidden">
                    <div
                        className="bg-white/80 h-full rounded-full transition-all duration-300"
                        style={{ width: `${((fsSlideIndex + 1) / activeDeck.slides.length) * 100}%` }}
                    />
                </div>
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <>
        <section className={cn("relative w-full z-20", compact ? "py-8" : "min-h-0 md:min-h-screen py-2 md:py-0")}>

            {/* Main Content - The slides */}
            <div className={cn("relative w-full flex flex-col items-center overflow-visible pointer-events-none", compact ? "justify-start" : "h-full justify-start md:justify-center")}>

                {/* Main Content Card Container */}
                <div className={cn("container relative z-10 px-1 md:px-4 w-full max-w-[1400px] mx-auto pointer-events-auto", compact ? "" : "h-full flex flex-col justify-start md:justify-center")}>

                    {/* The "Binder" Card */}
                    <div className={cn("bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm rounded-2xl md:rounded-[32px] shadow-2xl shadow-black/10 border border-black/5 dark:border-white/5 p-1.5 md:p-6 w-full flex flex-col md:flex-row gap-1.5 md:gap-6 relative overflow-visible", compact ? "md:h-[65vh] md:min-h-[500px]" : "md:h-[80vh] md:min-h-[600px] lg:min-h-[680px]")}>

                        {/* LEFT SIDEBAR - Thumbnails (hidden on mobile/tablet) */}
                        <div className="hidden md:flex md:w-[200px] lg:w-[240px] flex-shrink-0 flex-col gap-4 h-full overflow-hidden">

                            <div className="pl-2 pt-2 pb-4">
                                <div className="text-xs font-bold text-black/40 dark:text-white/40 uppercase tracking-widest mb-1">
                                    Slides
                                </div>
                                <div className="text-sm font-semibold text-black/80 dark:text-white/80">
                                    {activeDeck?.slides?.length || 0} Slides generated
                                </div>
                            </div>

                            {/* Scrollable Thumbnails List */}
                            <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                                {activeDeck?.slides ? (
                                    activeDeck.slides.map((slide, i) => (
                                        <div
                                            key={i}
                                            onClick={() => setSelectedSlideIndex(i)}
                                            className={cn(
                                                "relative w-full aspect-video rounded-lg transition-all duration-200 cursor-pointer overflow-hidden group",
                                                // Fix: Use ring instead of border to prevent aspect-ratio skew (gap on right)
                                                selectedSlideIndex === i
                                                    ? "ring-2 ring-inset ring-[#FF4301] shadow-lg shadow-orange-500/10"
                                                    : "ring-1 ring-inset ring-black/5 dark:ring-white/5 hover:ring-[#FF4301]/50"
                                            )}
                                        >
                                            <MiniSlide
                                                slide={slide}
                                                width={240}
                                                height={135}
                                                responsive
                                                className="w-full h-full pointer-events-none"
                                                renderMode="thumbnail"
                                            />
                                            {/* Hover overlay */}
                                            <div className={cn(
                                                "absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors",
                                                selectedSlideIndex === i && "bg-transparent"
                                            )} />

                                            {/* Number badge */}
                                            <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                                                {i + 1}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    // Skeleton thumbnails
                                    [1, 2, 3, 4, 5].map((_, i) => (
                                        <div key={i} className="w-full aspect-video bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
                                    ))
                                )}
                            </div>
                        </div>

                        {/* RIGHT AREA - Main Slide */}
                        <div className="flex-1 relative bg-zinc-100 dark:bg-zinc-950/50 rounded-2xl overflow-hidden md:overflow-visible flex flex-col items-center justify-center p-0.5 md:p-4 lg:p-8 group md:h-full">

                            {/* Prompt Card - POP OUT (desktop only) */}
                            <div
                                className={cn(
                                    "hidden md:block absolute z-50 md:top-[-30px] md:right-[-30px] lg:top-[-48px] lg:right-[-48px] max-w-[300px] lg:max-w-[380px]",
                                    "bg-white dark:bg-zinc-900 rounded-xl border-2 border-[#FF4301] p-4 md:p-6"
                                )}
                                style={{
                                    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)"
                                }}
                            >
                                {/* Badge & Nav */}
                                <div className="flex items-center justify-between mb-3">
                                    <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#FF4301]/10 text-[#FF4301] text-[10px] sm:text-xs font-bold uppercase tracking-wider">
                                        {React.createElement(activePrompt.icon, { size: 12 })}
                                        {activePrompt.badge}
                                    </div>

                                    <div className="flex gap-1.5">
                                        <button onClick={handlePrev} className="p-1.5 rounded-full border border-[#FF4301]/30 bg-[#FF4301]/5 text-[#FF4301] hover:bg-[#FF4301]/10 hover:border-[#FF4301]/50 transition-colors">
                                            <ChevronLeft size={18} />
                                        </button>
                                        <button onClick={handleNext} className="p-1.5 rounded-full border border-[#FF4301]/30 bg-[#FF4301]/5 text-[#FF4301] hover:bg-[#FF4301]/10 hover:border-[#FF4301]/50 transition-colors">
                                            <ChevronRight size={18} />
                                        </button>
                                    </div>
                                </div>

                                <p className="text-base sm:text-xl font-bold leading-tight text-black dark:text-white" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                                    "{activePrompt.text}"
                                </p>
                            </div>

                            {/* Slide Display - Full size */}
                            <div
                                className={cn(
                                    "relative w-full aspect-video shadow-2xl shadow-black/10 bg-white rounded-xl overflow-hidden transition-all duration-500 transform cursor-pointer",
                                    slideTransitioning ? "opacity-80 scale-[0.98] blur-[2px]" : "opacity-100 scale-100 blur-0"
                                )}
                                onClick={openFullscreen}
                            >
                                {activeDeck?.slides?.[selectedSlideIndex] ? (
                                    <>
                                        <MiniSlide
                                            slide={activeDeck.slides[selectedSlideIndex]}
                                            width={1280}
                                            height={720}
                                            responsive
                                            className="w-full h-full"
                                            interactive={!BROWSER.isMobile}
                                        />
                                        {/* Fullscreen button */}
                                        <div
                                            className="absolute top-2 right-2 z-40 md:opacity-0 md:group-hover:opacity-100 transition-opacity cursor-pointer"
                                            onClick={(e) => { e.stopPropagation(); openFullscreen(); }}
                                        >
                                            <div className="bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 text-white text-xs font-medium">
                                                <Maximize2 size={12} />
                                                <span className="hidden md:inline">Present</span>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 text-zinc-400">
                                        {isLoading ? (
                                            <div className="animate-pulse flex flex-col items-center">
                                                <div className="w-16 h-16 bg-zinc-200 dark:bg-zinc-800 rounded-full mb-6"></div>
                                                <div className="h-4 w-48 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center p-8 text-center">
                                                <Sparkles className="w-16 h-16 mb-6 text-[#FF4301]" />
                                                <p className="font-semibold text-lg">Detailed slides loading...</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* On-slide prev/next buttons (mobile) */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); handlePrevSlide(); }}
                                    className={cn(
                                        "md:hidden absolute left-2 top-1/2 -translate-y-1/2 z-30 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm active:bg-black/60 transition-colors",
                                        selectedSlideIndex === 0 && "opacity-30"
                                    )}
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleNextSlide(); }}
                                    className={cn(
                                        "md:hidden absolute right-2 top-1/2 -translate-y-1/2 z-30 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm active:bg-black/60 transition-colors",
                                        selectedSlideIndex === totalSlides - 1 && "opacity-30"
                                    )}
                                >
                                    <ChevronRight size={18} />
                                </button>

                                {/* Slide counter badge (mobile) */}
                                <div className="md:hidden absolute bottom-2 left-1/2 -translate-x-1/2 z-30 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm text-white text-[11px] font-medium tabular-nums">
                                    {selectedSlideIndex + 1} / {totalSlides}
                                </div>
                            </div>

                            {/* Mobile: Prompt card below slide (orange outline like desktop) */}
                            <div className="md:hidden mt-1.5 w-full border-2 border-[#FF4301] rounded-xl p-2.5 bg-white dark:bg-zinc-900">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#FF4301]/10 text-[#FF4301] text-[10px] font-bold uppercase tracking-wider">
                                        {React.createElement(activePrompt.icon, { size: 11 })}
                                        {activePrompt.badge}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <button onClick={handlePrev} className="w-7 h-7 flex items-center justify-center rounded-full border border-[#FF4301]/30 bg-[#FF4301]/5 text-[#FF4301] active:bg-[#FF4301]/10 transition-colors">
                                            <ChevronLeft size={16} />
                                        </button>
                                        <span className="text-black/40 dark:text-white/40 text-[10px] font-medium tabular-nums">
                                            {activeIndex + 1}/{effectivePrompts.length}
                                        </span>
                                        <button onClick={handleNext} className="w-7 h-7 flex items-center justify-center rounded-full border border-[#FF4301]/30 bg-[#FF4301]/5 text-[#FF4301] active:bg-[#FF4301]/10 transition-colors">
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                </div>
                                <p className="text-sm font-bold leading-snug text-black dark:text-white" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                                    &ldquo;{activePrompt.text}&rdquo;
                                </p>
                            </div>

                            {/* Interactive Hint */}
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-black/80 backdrop-blur-md rounded-full text-white/80 text-xs font-medium pointer-events-none opacity-0 md:opacity-100 transition-opacity z-20">
                                <MousePointer2 size={12} className="text-[#FF4301]" />
                                Try clicking elements on the slide
                            </div>

                        </div>
                    </div>
                </div>
            </div>

        </section>
        {fullscreenOverlay}
        </>
    );
};

export default React.memo(InteractiveHero);
