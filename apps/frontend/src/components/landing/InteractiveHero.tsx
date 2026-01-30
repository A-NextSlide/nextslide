import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, Rocket, TrendingUp, Microscope, Coffee, Timer, FlaskConical, BookOpen, Handshake, Globe, Skull, Wifi, MousePointer2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ShowcaseDeck } from '@/services/showcaseService';
import MiniSlide from '@/components/deck/MiniSlide';
import { Button } from '@/components/ui/button';

interface InteractiveHeroProps {
    decks: ShowcaseDeck[];
    isLoading: boolean;
}

const PROMPTS = [
    {
        id: 'startup',
        badge: 'Startup',
        icon: Rocket,
        text: "Pitch deck for VCs who've already seen 500 this month",
        theme: 'light' as const,
        deckIndex: 0
    },
    {
        id: 'investment',
        badge: 'Investment',
        icon: TrendingUp,
        text: "Short-term stock analysis that reads like a Goldman memo",
        theme: 'light' as const,
        deckIndex: 1
    },
    {
        id: 'education-algebra',
        badge: 'Education',
        icon: Microscope,
        text: "Algebra for kids who ask 'when will I use this'",
        theme: 'light' as const,
        deckIndex: 2
    },
    {
        id: 'learn-coffee',
        badge: 'Learn',
        icon: Coffee,
        text: "How coffee conquered the world",
        theme: 'light' as const,
        deckIndex: 3
    },
    {
        id: 'pitch',
        badge: 'Pitch',
        icon: Timer,
        text: "Demo day pitch that actually fits in 3 minutes",
        theme: 'light' as const,
        deckIndex: 4
    },
    {
        id: 'education-biology',
        badge: 'Education',
        icon: FlaskConical,
        text: "Cellular Respiration: From Glucose to ATP",
        theme: 'light' as const,
        deckIndex: 5
    },
    {
        id: 'learn-history',
        badge: 'Learn',
        icon: BookOpen,
        text: "The French Revolution: From Monarchy to Republic",
        theme: 'light' as const,
        deckIndex: 6
    },
    {
        id: 'sales',
        badge: 'Sales',
        icon: Handshake,
        text: "Client proposal that closes itself",
        theme: 'orange' as const,
        deckIndex: 7
    },
    {
        id: 'learn-2000s',
        badge: 'Learn',
        icon: Globe,
        text: "Interactive Presentation About 2000s Internet Culture",
        theme: 'light' as const,
        deckIndex: 8
    },
    {
        id: 'science-zombie',
        badge: 'Science',
        icon: Skull,
        text: "How to Survive a Zombie Apocalypse Using Science",
        theme: 'light' as const,
        deckIndex: 9
    },
    {
        id: 'learn-90s',
        badge: 'Culture',
        icon: Wifi,
        text: "Why the 90s Internet Was the Wild West of Creativity",
        theme: 'light' as const,
        deckIndex: 10
    }
];

const InteractiveHero: React.FC<InteractiveHeroProps> = ({ decks, isLoading }) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const [slideTransitioning, setSlideTransitioning] = useState(false);

    // Track selected slide within the active deck
    const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);

    const activePrompt = PROMPTS[activeIndex];

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
            setActiveIndex((prev) => (prev + 1) % PROMPTS.length);
            setSlideTransitioning(false);
        }, 300);
    };

    const handlePrev = () => {
        setSlideTransitioning(true);
        setTimeout(() => {
            setActiveIndex((prev) => (prev - 1 + PROMPTS.length) % PROMPTS.length);
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

    const isOrange = activePrompt.theme === 'orange';

    return (
        <section className="relative w-full z-20 h-screen">

            {/* Main Content - The slides */}
            <div className="relative h-full w-full flex flex-col items-center justify-start pt-2 md:pt-0 md:justify-center overflow-visible pointer-events-none">

                {/* Main Content Card Container */}
                <div className="container relative z-10 px-2 md:px-4 w-full max-w-[1400px] mx-auto pointer-events-auto h-full flex flex-col justify-start pt-2 md:pt-0 md:justify-center">

                    {/* The "Binder" Card */}
                    <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm rounded-2xl md:rounded-[32px] shadow-2xl shadow-black/10 border border-black/5 dark:border-white/5 p-2 md:p-6 w-full md:h-[80vh] flex flex-col md:flex-row gap-2 md:gap-6 relative overflow-visible">

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
                        <div className="flex-1 relative bg-zinc-100 dark:bg-zinc-950/50 rounded-2xl overflow-hidden md:overflow-visible flex flex-col items-center justify-center p-1 md:p-4 lg:p-8 group md:h-full">

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
                            <div className={cn(
                                "relative w-full aspect-video shadow-2xl shadow-black/10 bg-white rounded-xl overflow-hidden transition-all duration-500 transform",
                                slideTransitioning ? "opacity-80 scale-[0.98] blur-[2px]" : "opacity-100 scale-100 blur-0"
                            )}>
                                {activeDeck?.slides?.[selectedSlideIndex] ? (
                                    <MiniSlide
                                        slide={activeDeck.slides[selectedSlideIndex]}
                                        width={1280}
                                        height={720}
                                        responsive
                                        className="w-full h-full"
                                        interactive={true}
                                    />
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
                            <div className="md:hidden mt-3 w-full border-2 border-[#FF4301] rounded-xl p-3 bg-white dark:bg-zinc-900">
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
                                            {activeIndex + 1}/{PROMPTS.length}
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
    );
};

export default InteractiveHero;
