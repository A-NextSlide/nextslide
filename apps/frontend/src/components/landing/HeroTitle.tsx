import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MousePointer2, Type, Underline, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

type Phase =
    | 'idle'
    | 'cursor_entering'
    | 'clicking_gap'
    | 'typing'
    | 'clicking_text'
    | 'selected'
    | 'moving_to_underline'
    | 'clicking_underline'
    | 'underline_done'
    | 'moving_to_enhance'
    | 'clicking_enhance_1'
    | 'enhance_1_done'
    | 'clicking_enhance_2'
    | 'enhance_2_done'
    | 'clicking_enhance_3'
    | 'enhance_3_done'
    | 'clicking_enhance_4'
    | 'enhance_4_done'
    | 'completed';

type TextStyle = 'plain' | 'stunning' | 'animated' | 'glowing' | 'threed';

export const HeroTitle = React.memo(() => {
    const [phase, setPhase] = useState<Phase>('idle');
    const [insertedText, setInsertedText] = useState('');
    const [showTextCursor, setShowTextCursor] = useState(false);
    const [showMouseCursor, setShowMouseCursor] = useState(false);
    const [showBoundingBox, setShowBoundingBox] = useState(false);
    const [textStyle, setTextStyle] = useState<TextStyle>('plain');
    const [hasUnderline, setHasUnderline] = useState(false);
    const toolbarRef = useRef<HTMLDivElement>(null);
    const insertPointRef = useRef<HTMLSpanElement>(null);

    // Animation sequence
    useEffect(() => {
        const timeouts: NodeJS.Timeout[] = [];
        const schedule = (fn: () => void, delay: number) => {
            timeouts.push(setTimeout(fn, delay));
        };
        let typingInterval: NodeJS.Timeout | null = null;

        // Reset state
        setInsertedText('');
        setShowTextCursor(false);
        setShowMouseCursor(false);
        setShowBoundingBox(false);
        setTextStyle('plain');
        setHasUnderline(false);

        // 1. Cursor enters from bottom-right (show after delay)
        schedule(() => setPhase('cursor_entering'), 800);
        schedule(() => setShowMouseCursor(true), 1200);

        // 2. Click to place text cursor
        schedule(() => setPhase('clicking_gap'), 1800);

        // 3. Show text cursor and start typing
        schedule(() => {
            setPhase('typing');
            setShowTextCursor(true);

            const targetText = 'Editable ';
            let charIndex = 0;

            typingInterval = setInterval(() => {
                if (charIndex <= targetText.length) {
                    setInsertedText(targetText.slice(0, charIndex));
                    charIndex++;
                } else {
                    if (typingInterval) clearInterval(typingInterval);
                }
            }, 80);
        }, 2200);

        // 4. Click on text to select it
        schedule(() => {
            setShowTextCursor(false);
            setPhase('clicking_text');
        }, 3200);

        // 5. Show bounding box after click
        schedule(() => setShowBoundingBox(true), 3350);

        // 6. Release click
        schedule(() => setPhase('selected'), 3500);

        // 7. Move to underline button
        schedule(() => setPhase('moving_to_underline'), 4200);

        // 8. Click underline
        schedule(() => setPhase('clicking_underline'), 5000);

        // 9. Apply underline
        schedule(() => {
            setHasUnderline(true);
            setPhase('underline_done');
        }, 5300);

        // 10. Move to enhance button
        schedule(() => setPhase('moving_to_enhance'), 6200);

        // 11. Click enhance first time
        schedule(() => setPhase('clicking_enhance_1'), 7000);

        // 12. Change to "Professional" with pretty style
        schedule(() => {
            setInsertedText('Professional ');
            setTextStyle('stunning');
            setPhase('enhance_1_done');
        }, 7300);

        // 13. Click enhance second time
        schedule(() => setPhase('clicking_enhance_2'), 9000);

        // 14. Change to "Animated" with animated style
        schedule(() => {
            setInsertedText('Animated ');
            setTextStyle('animated');
            setPhase('enhance_2_done');
        }, 9300);

        // 15. Click enhance third time
        schedule(() => setPhase('clicking_enhance_3'), 11000);

        // 16. Change to "Glowing" with glow style
        schedule(() => {
            setInsertedText('Glowing ');
            setTextStyle('glowing');
            setPhase('enhance_3_done');
        }, 11300);

        // 17. Click enhance fourth time
        schedule(() => setPhase('clicking_enhance_4'), 13000);

        // 18. Change to "Bold" with 3D style
        schedule(() => {
            setInsertedText('Bold ');
            setTextStyle('threed');
            setPhase('enhance_4_done');
        }, 13300);

        // 19. Completed
        schedule(() => setPhase('completed'), 14000);

        // 20. Reset loop
        schedule(() => {
            setPhase('idle');
            setInsertedText('');
            setShowTextCursor(false);
            setShowMouseCursor(false);
            setShowBoundingBox(false);
            setTextStyle('plain');
            setHasUnderline(false);
        }, 18500);

        return () => {
            timeouts.forEach(clearTimeout);
            if (typingInterval) clearInterval(typingInterval);
        };
    }, [phase === 'idle']);

    // Derived states
    const isClickingAny = ['clicking_gap', 'clicking_text', 'clicking_underline', 'clicking_enhance_1', 'clicking_enhance_2', 'clicking_enhance_3', 'clicking_enhance_4'].includes(phase);
    const underlineActive = ['clicking_underline', 'underline_done', 'moving_to_enhance', 'clicking_enhance_1', 'enhance_1_done', 'clicking_enhance_2', 'enhance_2_done', 'clicking_enhance_3', 'enhance_3_done', 'clicking_enhance_4', 'enhance_4_done', 'completed'].includes(phase);
    const enhanceActive = ['clicking_enhance_1', 'enhance_1_done', 'clicking_enhance_2', 'enhance_2_done', 'clicking_enhance_3', 'enhance_3_done', 'clicking_enhance_4', 'enhance_4_done', 'completed'].includes(phase);

    // Calculate cursor positions
    const getCursorPosition = () => {
        switch (phase) {
            case 'idle':
                return { x: 320, y: 150 };
            case 'cursor_entering':
                return { x: 250, y: -10 };
            case 'clicking_gap':
            case 'typing':
                return { x: 220, y: -30 };
            case 'clicking_text':
            case 'selected':
                return { x: 140, y: -30 };
            case 'moving_to_underline':
            case 'clicking_underline':
            case 'underline_done':
                return { x: 95, y: -95 };
            case 'moving_to_enhance':
            case 'clicking_enhance_1':
            case 'enhance_1_done':
            case 'clicking_enhance_2':
            case 'enhance_2_done':
            case 'clicking_enhance_3':
            case 'enhance_3_done':
            case 'clicking_enhance_4':
            case 'enhance_4_done':
            case 'completed':
                return { x: 135, y: -95 };
            default:
                return { x: 320, y: 150 };
        }
    };

    const cursorPos = getCursorPosition();

    // Render styled text based on current style
    const renderStyledText = () => {
        const text = insertedText.trim();
        if (!text) return null;

        if (textStyle === 'stunning') {
            // Professional elegant serif style
            return (
                <motion.span
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    style={{
                        fontFamily: 'var(--font-playfair-display), serif',
                        fontWeight: 700,
                        letterSpacing: '0.01em',
                        textTransform: 'none',
                        color: '#1e3a5f',
                    }}
                >
                    {text}
                </motion.span>
            );
        }

        if (textStyle === 'animated') {
            // Wave animation with gradient
            return (
                <motion.span
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="relative inline-block"
                >
                    {text.split('').map((char, i) => (
                        <motion.span
                            key={i}
                            className="inline-block bg-gradient-to-b from-violet-500 to-fuchsia-500 bg-clip-text text-transparent"
                            animate={{
                                y: [0, -6, 0],
                            }}
                            transition={{
                                duration: 0.5,
                                repeat: Infinity,
                                delay: i * 0.06,
                                ease: 'easeInOut',
                            }}
                        >
                            {char}
                        </motion.span>
                    ))}
                </motion.span>
            );
        }

        if (textStyle === 'glowing') {
            // Neon tube effect - bright core with colored glow
            return (
                <motion.span
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{
                        scale: 1,
                        opacity: 1,
                    }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className="relative inline-block"
                    style={{
                        color: '#fff',
                        fontWeight: 700,
                        textShadow: `
                            0 0 2px #fff,
                            0 0 4px #fff,
                            0 0 6px #ff2d95,
                            0 0 10px #ff2d95,
                            0 0 20px #ff2d95,
                            0 0 30px #ff2d95
                        `,
                    }}
                >
                    <motion.span
                        animate={{
                            opacity: [1, 0.92, 1, 0.97, 1],
                            textShadow: [
                                '0 0 2px #fff, 0 0 4px #fff, 0 0 6px #ff2d95, 0 0 10px #ff2d95, 0 0 20px #ff2d95, 0 0 30px #ff2d95',
                                '0 0 1px #fff, 0 0 3px #fff, 0 0 5px #ff2d95, 0 0 8px #ff2d95, 0 0 15px #ff2d95, 0 0 25px #ff2d95',
                                '0 0 2px #fff, 0 0 4px #fff, 0 0 6px #ff2d95, 0 0 10px #ff2d95, 0 0 20px #ff2d95, 0 0 30px #ff2d95',
                            ],
                        }}
                        transition={{
                            duration: 0.15,
                            repeat: Infinity,
                            repeatDelay: 3,
                            ease: 'linear',
                        }}
                    >
                        {text}
                    </motion.span>
                </motion.span>
            );
        }

        if (textStyle === 'threed') {
            // 3D effect with layered shadows
            return (
                <motion.span
                    initial={{ scale: 0.9, opacity: 0, y: 10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className="relative inline-block text-white"
                    style={{
                        fontWeight: 900,
                        textShadow: `
                            1px 1px 0 #FF4301,
                            2px 2px 0 #FF4301,
                            3px 3px 0 #FF4301,
                            4px 4px 0 #cc3601,
                            5px 5px 0 #992801,
                            6px 6px 10px rgba(0,0,0,0.4)
                        `,
                    }}
                >
                    {text}
                </motion.span>
            );
        }

        return <span>{text}</span>;
    };

    return (
        <div className="relative isolate flex flex-col items-center justify-center">
            {/* Floating Toolbar - positioned at container level to prevent movement */}
            <AnimatePresence>
                {showBoundingBox && insertedText && (
                    <motion.div
                        ref={toolbarRef}
                        initial={{ opacity: 0, y: 5, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                        className="absolute -top-12 left-1/2 -translate-x-1/4 bg-black dark:bg-white text-white dark:text-black rounded-full px-3 py-1.5 flex items-center gap-2 shadow-xl z-50 border border-white/10 dark:border-black/10 whitespace-nowrap"
                    >
                        <div className="flex items-center gap-1.5 border-r border-white/20 dark:border-black/20 pr-2">
                            <Type size={14} />
                            <span className="text-xs font-semibold">Text</span>
                        </div>

                        {/* Underline Button */}
                        <motion.div
                            className={cn(
                                'p-1.5 rounded-md transition-colors duration-150',
                                underlineActive ? 'bg-white/20 dark:bg-black/10' : ''
                            )}
                            animate={{
                                scale: phase === 'clicking_underline' ? 0.85 : 1,
                            }}
                            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                        >
                            <Underline
                                size={16}
                                className={cn(
                                    'transition-colors duration-150',
                                    underlineActive ? 'text-[#FF4301]' : ''
                                )}
                            />
                        </motion.div>

                        {/* Enhance Button */}
                        <motion.div
                            className={cn(
                                'p-1.5 rounded-md transition-colors duration-150 flex items-center gap-1',
                                enhanceActive ? 'bg-white/20 dark:bg-black/10' : ''
                            )}
                            animate={{
                                scale: (phase === 'clicking_enhance_1' || phase === 'clicking_enhance_2' || phase === 'clicking_enhance_3' || phase === 'clicking_enhance_4') ? 0.85 : 1,
                            }}
                            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                        >
                            <Sparkles
                                size={16}
                                className={cn(
                                    'transition-colors duration-150',
                                    enhanceActive ? 'text-[#FF4301]' : ''
                                )}
                            />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Title - Two Lines */}
            <div className="flex flex-col items-center gap-1">
                {/* Line 1: Ideas to [Text] */}
                <h1
                    className="text-black dark:text-white relative flex items-baseline justify-center flex-wrap"
                    style={{
                        fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                        fontWeight: 900,
                        fontSize: 'clamp(36px, 6vw, 72px)',
                        lineHeight: '1.1',
                        letterSpacing: '-0.02em',
                        textTransform: 'uppercase',
                    }}
                >
                    <span>Ideas</span>
                    <span className="ml-[0.3em]">to</span>

                    {/* Force animated word to its own line on mobile */}
                    <span className="basis-full h-0 md:hidden" />

                    {/* Inserted text container */}
                    <span className="relative inline-flex items-baseline ml-[0.3em] whitespace-nowrap">
                        {/* The typed text with selection highlight */}
                        <span className="relative" style={{ isolation: 'isolate' }}>
                            {/* Selection box with outline and handles - appears on click */}
                            <AnimatePresence>
                                {showBoundingBox && insertedText && (
                                    <motion.span
                                        className="absolute -inset-y-2 -inset-x-2 pointer-events-none z-10"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.05 }}
                                        style={{ willChange: 'opacity' }}
                                    >
                                        {/* Border */}
                                        <span className="absolute inset-0 border-2 border-[#FF4301] rounded-sm" />

                                        {/* Corner handles */}
                                        <span className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-white border-2 border-[#FF4301] rounded-sm" />
                                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-white border-2 border-[#FF4301] rounded-sm" />
                                        <span className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-white border-2 border-[#FF4301] rounded-sm" />
                                        <span className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-white border-2 border-[#FF4301] rounded-sm" />

                                        {/* Mid-point handles */}
                                        <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-white border-2 border-[#FF4301] rounded-sm" />
                                        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-white border-2 border-[#FF4301] rounded-sm" />
                                        <span className="absolute top-1/2 -left-1 -translate-y-1/2 w-2.5 h-2.5 bg-white border-2 border-[#FF4301] rounded-sm" />
                                        <span className="absolute top-1/2 -right-1 -translate-y-1/2 w-2.5 h-2.5 bg-white border-2 border-[#FF4301] rounded-sm" />
                                    </motion.span>
                                )}
                            </AnimatePresence>

                            {/* The actual text */}
                            <span className="relative">
                                {textStyle === 'plain' ? insertedText : renderStyledText()}
                                {textStyle !== 'plain' && insertedText.endsWith(' ') && <span> </span>}

                                {/* Zero-width cursor container */}
                                <span className="relative inline-block w-0 h-0 align-top">
                                    <AnimatePresence>
                                        {showTextCursor && (
                                            <motion.span
                                                className="absolute left-0 w-[3px] bg-black dark:bg-white"
                                                style={{ height: '0.75em', top: '0.15em' }}
                                                initial={{ opacity: 1 }}
                                                animate={{ opacity: [1, 1, 0, 0] }}
                                                exit={{ opacity: 0 }}
                                                transition={{
                                                    duration: 1,
                                                    repeat: Infinity,
                                                    times: [0, 0.5, 0.5, 1],
                                                }}
                                            />
                                        )}
                                    </AnimatePresence>
                                </span>

                                {/* Underline SVG */}
                                {insertedText.trim() && (
                                    <svg
                                        className="absolute left-0 -bottom-1 overflow-visible pointer-events-none"
                                        viewBox="0 0 100 12"
                                        preserveAspectRatio="none"
                                        style={{
                                            height: 'clamp(6px, 1vw, 12px)',
                                            width: `calc(100% - 0.35em)`,
                                        }}
                                    >
                                        <motion.path
                                            d="M2 6 Q 15 2, 25 7 Q 35 12, 50 5 Q 65 -2, 75 6 Q 85 12, 98 5"
                                            fill="none"
                                            stroke="#FF4301"
                                            strokeWidth="8"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            initial={{ pathLength: 0, opacity: 0 }}
                                            animate={{
                                                pathLength: hasUnderline ? 1 : 0,
                                                opacity: hasUnderline ? 1 : 0,
                                            }}
                                            transition={{
                                                pathLength: { duration: 0.5, ease: 'easeOut' },
                                                opacity: { duration: 0.1 },
                                            }}
                                        />
                                    </svg>
                                )}
                            </span>
                        </span>

                        {/* Insertion point marker (invisible, for positioning reference) */}
                        <span ref={insertPointRef} className="w-0" />
                    </span>
                </h1>

                {/* Line 2: Presentations in Seconds */}
                <h1
                    className="text-black dark:text-white"
                    style={{
                        fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                        fontWeight: 900,
                        fontSize: 'clamp(36px, 6vw, 72px)',
                        lineHeight: '1.1',
                        letterSpacing: '-0.02em',
                        textTransform: 'uppercase',
                    }}
                >
                    Presentations in Seconds
                </h1>
            </div>

            {/* Mouse Cursor */}
            <AnimatePresence>
                {showMouseCursor && (
                    <motion.div
                        className="absolute z-50 pointer-events-none"
                        initial={{ x: 320, y: 150, opacity: 0 }}
                        animate={{
                            x: cursorPos.x,
                            y: cursorPos.y,
                            opacity: 1,
                            scale: isClickingAny ? 0.7 : 1,
                            rotate: isClickingAny ? -8 : 0,
                        }}
                        exit={{ opacity: 0, transition: { duration: 0.3 } }}
                        transition={{
                            type: 'spring',
                            stiffness: 200,
                            damping: 15,
                            mass: 0.6,
                            opacity: { duration: 0.5 },
                            scale: { type: 'spring', stiffness: 400, damping: 15 },
                            rotate: { type: 'spring', stiffness: 400, damping: 15 },
                        }}
                    >
                        <MousePointer2
                            className="w-7 h-7 drop-shadow-lg"
                            style={{
                                fill: 'black',
                                color: 'white',
                                strokeWidth: 1.5,
                            }}
                        />
                        {/* Click ripple effect */}
                        <AnimatePresence>
                            {isClickingAny && (
                                <motion.span
                                    className="absolute top-0 left-0 w-4 h-4 rounded-full bg-[#FF4301]/40"
                                    initial={{ scale: 0.5, opacity: 1 }}
                                    animate={{ scale: 2, opacity: 0 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.4, ease: 'easeOut' }}
                                />
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
});
