import React, { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';

interface GritParticle {
    x: number;
    y: number;
    z: number; // Depth (0-1)
    vx: number;
    vy: number;
    size: number;
    alpha: number;
}

interface ParticleAnimationProps {
    isTyping?: boolean;
    isLoading?: boolean;
    inputText?: string; // Keep for API compatibility, though unused in Grit
}

const ParticleAnimation: React.FC<ParticleAnimationProps> = ({ isTyping = false, isLoading = false }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { resolvedTheme } = useTheme();
    const themeRef = useRef(resolvedTheme);
    const timeRef = useRef(0);
    const energyRef = useRef(0);

    // Refs for stable access inside animation loop without re-triggering effect
    const isTypingRef = useRef(isTyping);
    const isLoadingRef = useRef(isLoading);

    useEffect(() => {
        isTypingRef.current = isTyping;
        isLoadingRef.current = isLoading;
    }, [isTyping, isLoading]);

    useEffect(() => {
        themeRef.current = resolvedTheme;
    }, [resolvedTheme]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let particles: GritParticle[] = [];

        const handleResize = () => {
            const dpr = window.devicePixelRatio || 1;
            // Use client dimensions to avoid layout thrashing
            const width = window.innerWidth;
            const height = window.innerHeight;

            canvas.width = width * dpr;
            canvas.height = height * dpr;

            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(dpr, dpr);

            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;

            // Re-init only if count differs significantly or empty? 
            // For simplicity, re-init is safer on resize to fill screen.
            initParticles();
        };

        const initParticles = () => {
            particles = [];
            const count = Math.floor((window.innerWidth * window.innerHeight) / 450);

            for (let i = 0; i < count; i++) {
                const z = Math.random();
                particles.push({
                    x: Math.random() * window.innerWidth,
                    y: Math.random() * window.innerHeight,
                    z: z,
                    vx: 0,
                    vy: 0,
                    size: Math.random() < 0.8 ? 1 : Math.random() * 2 + 1,
                    alpha: 0.1 + Math.random() * 0.3
                });
            }
        };

        const animate = () => {
            if (!ctx || !canvas) return;

            const isDark = themeRef.current === 'dark';

            // Clear
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            timeRef.current += 0.008;

            // Read fresh state from refs
            const active = isTypingRef.current || isLoadingRef.current;
            const targetEnergy = active ? 1.0 : 0.0;

            // Smooth energy transition
            // Fast decay (0.1) for responsive stop, fast attack (0.1) for responsive start
            const lerpFactor = 0.1;
            energyRef.current += (targetEnergy - energyRef.current) * lerpFactor;
            const energy = energyRef.current;

            const rgb = isDark ? '255, 255, 255' : '0, 0, 0';
            const accentRgb = '255, 67, 1';

            const width = window.innerWidth;
            const height = window.innerHeight;
            const cx = width / 2;
            const cy = height / 2;

            particles.forEach(p => {
                const depth = p.z * 0.8 + 0.2;

                // --- Physics Calculation ---

                // 1. Active State: Vortex Swirl
                // Strong circular motion
                const dx = p.x - cx;
                const dy = p.y - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // Determine swirl speed: Loading = Fast (2.0), Typing = Slow (0.2)
                let baseSwirlSpeed = 2.0;
                if (isTypingRef.current && !isLoadingRef.current) {
                    baseSwirlSpeed = 0.2;
                }
                const swirlSpeed = baseSwirlSpeed * depth;

                const vortexVx = (-dy / (dist + 10)) * swirlSpeed;
                const vortexVy = (dx / (dist + 10)) * swirlSpeed;

                // 2. Idle State: Suspended Animation (Micro-drift)
                // User requested "stop moving". We keep a tiny "Brownian motion" jitter
                // so it doesn't look like a frozen glitch, but effectively static.
                // No horizontal flow.
                const idleVx = (Math.random() - 0.5) * 0.05;
                const idleVy = (Math.random() - 0.5) * 0.05;

                // Blend based on Energy
                // If energy is 0, it's basically stopped.
                const targetVx = idleVx * (1 - energy) + vortexVx * energy;
                const targetVy = idleVy * (1 - energy) + vortexVy * energy;

                // Apply with inertia
                p.vx += (targetVx - p.vx) * 0.05;
                p.vy += (targetVy - p.vy) * 0.05;

                p.x += p.vx;
                p.y += p.vy;

                // Wrap Logic (Infinite Field)
                // Only needed if moving fast (active). If idle, they barely move.
                if (energy > 0.01) {
                    const buffer = 50;
                    if (p.x < -buffer) p.x = width + buffer;
                    if (p.x > width + buffer) p.x = -buffer;
                    if (p.y < -buffer) p.y = height + buffer;
                    if (p.y > height + buffer) p.y = -buffer;
                }

                // Draw
                ctx.beginPath();
                ctx.rect(p.x, p.y, p.size, p.size);

                const isAccent = p.size > 2.5;
                const color = isAccent ? accentRgb : rgb;

                // Modulate opacity with energy
                // When idle (energy 0), dim it slightly for "background" feel? 
                // Or keep it distinct. Let's keep base alpha.
                const baseAlpha = isAccent ? 0.6 : p.alpha;

                ctx.fillStyle = `rgba(${color}, ${baseAlpha})`;
                ctx.fill();
            });

            animationFrameId = requestAnimationFrame(animate);
        };

        window.addEventListener('resize', handleResize);
        handleResize();
        animate();

        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationFrameId);
        };
    }, []); // Empty dependency array = No resets!

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 pointer-events-none z-0"
            style={{
                background: 'transparent',
                maskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)'
            }}
        />
    );
};

export default ParticleAnimation;
