import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface PixelGridBackgroundProps {
    className?: string;
    theme?: 'light' | 'orange';
}

const PixelGridBackground: React.FC<PixelGridBackgroundProps> = ({
    className,
    theme = 'light',
}) => {
    // Generate scattered pixels for subtle ambience
    const pixels = useMemo(() => {
        const pxs = [];
        const cols = typeof window !== 'undefined' ? Math.ceil(window.innerWidth / 40) : 50;
        const rows = typeof window !== 'undefined' ? Math.ceil(window.innerHeight / 40) : 30;

        // Create a sparse, random distribution (no clusters)
        const density = 0.05; // 5% of grid filled
        const totalPixels = Math.floor(cols * rows * density);

        for (let i = 0; i < totalPixels; i++) {
            const r = Math.floor(Math.random() * rows);
            const c = Math.floor(Math.random() * cols);

            // Avoid duplicates for cleaner look (though not strictly critical for this effect)
            if (!pxs.find(p => p.r === r && p.c === c)) {
                pxs.push({
                    r,
                    c,
                    // Long, slow breathing cycle
                    duration: 4 + Math.random() * 4,
                    delay: Math.random() * 5
                });
            }
        }

        return pxs;
    }, []);

    const gridColor = 'rgba(0, 0, 0, 0.03)';
    const pixelColor = 'rgba(0, 0, 0, 0.04)'; // Very subtle fill

    return (
        <div
            className={cn("absolute inset-0 overflow-hidden pointer-events-none select-none bg-[#FCFBF8]", className)}
        >
            {/* Grid Lines - Clean and sharp */}
            <div
                className="absolute inset-0"
                style={{
                    backgroundImage: `
                linear-gradient(to right, ${gridColor} 1px, transparent 1px),
                linear-gradient(to bottom, ${gridColor} 1px, transparent 1px)
            `,
                    backgroundSize: '40px 40px',
                }}
            />

            {/* Subtle Walking/Breathing Pixels */}
            {pixels.map((p, i) => (
                <motion.div
                    key={i}
                    className="absolute"
                    initial={{ opacity: 0 }}
                    animate={{
                        opacity: [0, 1, 0], // Gentle fade in and out
                    }}
                    transition={{
                        duration: p.duration,
                        repeat: Infinity,
                        delay: p.delay,
                        ease: "easeInOut",
                    }}
                    style={{
                        left: `${p.c * 40}px`,
                        top: `${p.r * 40}px`,
                        width: '40px',
                        height: '40px',
                        // Slight rounding for elegance, but keeping square form
                        borderRadius: '4px',
                        backgroundColor: pixelColor,
                        // Align perfectly with grid lines
                        marginLeft: '0px',
                        marginTop: '0px',
                    }}
                />
            ))}

            {/* Soft vignette */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(255,255,255,0.6)_100%)] pointer-events-none" />
        </div>
    );
};

export default React.memo(PixelGridBackground);
