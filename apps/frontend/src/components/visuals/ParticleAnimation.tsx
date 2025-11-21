
import React, { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';

interface Particle {
    x: number;
    y: number;
    originX: number;
    originY: number;
    vx: number;
    vy: number;
    size: number;
    color: string;
    targetX?: number;
    targetY?: number;
}

interface ParticleAnimationProps {
    isTyping?: boolean;
    isLoading?: boolean;
}

// --- Shape Definitions ---

const FLASK_POINTS = [
    { x: 0.5, y: 0.2 }, { x: 0.5, y: 0.35 }, // Neck
    { x: 0.45, y: 0.4 }, { x: 0.55, y: 0.4 }, // Shoulders
    { x: 0.3, y: 0.7 }, { x: 0.7, y: 0.7 }, // Base corners
    { x: 0.3, y: 0.7 }, { x: 0.7, y: 0.7 }, // Base bottom
    { x: 0.5, y: 0.6 }, { x: 0.45, y: 0.65 }, { x: 0.55, y: 0.55 } // Bubbles
];

const CHART_POINTS = [
    { x: 0.2, y: 0.2 }, { x: 0.2, y: 0.8 }, { x: 0.8, y: 0.8 }, // Axis
    { x: 0.3, y: 0.8 }, { x: 0.3, y: 0.5 }, { x: 0.4, y: 0.5 }, { x: 0.4, y: 0.8 }, // Bar 1
    { x: 0.5, y: 0.8 }, { x: 0.5, y: 0.3 }, { x: 0.6, y: 0.3 }, { x: 0.6, y: 0.8 }, // Bar 2
    { x: 0.7, y: 0.8 }, { x: 0.7, y: 0.6 }, { x: 0.8, y: 0.6 }, { x: 0.8, y: 0.8 }  // Bar 3
];

const ROCKET_POINTS = [
    { x: 0.5, y: 0.2 }, // Nose
    { x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 }, // Body top
    { x: 0.4, y: 0.7 }, { x: 0.6, y: 0.7 }, // Body bottom
    { x: 0.3, y: 0.8 }, { x: 0.7, y: 0.8 }, // Fins
    { x: 0.5, y: 0.85 }, { x: 0.45, y: 0.9 }, { x: 0.55, y: 0.9 } // Flame
];

const GLOBE_POINTS = [
    // Circle approximation
    { x: 0.5, y: 0.2 }, { x: 0.8, y: 0.5 }, { x: 0.5, y: 0.8 }, { x: 0.2, y: 0.5 },
    { x: 0.29, y: 0.29 }, { x: 0.71, y: 0.29 }, { x: 0.71, y: 0.71 }, { x: 0.29, y: 0.71 },
    // Lat/Long lines
    { x: 0.5, y: 0.2 }, { x: 0.5, y: 0.8 }, // Prime meridian
    { x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }  // Equator
];

const LIGHTBULB_POINTS = [
    // Bulb
    { x: 0.5, y: 0.2 },
    { x: 0.3, y: 0.35 }, { x: 0.7, y: 0.35 },
    { x: 0.3, y: 0.55 }, { x: 0.7, y: 0.55 },
    // Base
    { x: 0.4, y: 0.7 }, { x: 0.6, y: 0.7 },
    { x: 0.45, y: 0.8 }, { x: 0.55, y: 0.8 },
    // Filament
    { x: 0.45, y: 0.4 }, { x: 0.55, y: 0.4 }, { x: 0.5, y: 0.5 }
];

type AnimationMode = 'RANDOM' | 'FLASK' | 'CHART' | 'ROCKET' | 'GLOBE' | 'LIGHTBULB';

const ParticleAnimation: React.FC<ParticleAnimationProps> = ({ isTyping = false, isLoading = false }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mouseRef = useRef({ x: -1000, y: -1000 });
    const { resolvedTheme } = useTheme();
    const themeRef = useRef(resolvedTheme);
    const modeRef = useRef<AnimationMode>('RANDOM');
    const timeRef = useRef(0);

    const isLoadingRef = useRef(isLoading);

    useEffect(() => {
        isLoadingRef.current = isLoading;
    }, [isLoading]);

    useEffect(() => {
        themeRef.current = resolvedTheme;
    }, [resolvedTheme]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let particles: Particle[] = [];

        const handleResize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            initParticles();
        };

        const handleMouseMove = (e: MouseEvent) => {
            mouseRef.current.x = e.clientX;
            mouseRef.current.y = e.clientY;
        };

        const initParticles = () => {
            particles = [];
            const particleCount = Math.min(Math.floor((canvas.width * canvas.height) / 6000), 350);
            const isDark = themeRef.current === 'dark';

            const colors = isDark
                ? ['#FF6B00', '#4285F4', '#FBBC04', '#FFFFFF', '#8AB4F8', '#FF8A65']
                : ['#EA4335', '#4285F4', '#FBBC04', '#34A853', '#5F6368', '#9AA0A6'];

            for (let i = 0; i < particleCount; i++) {
                const x = Math.random() * canvas.width;
                const y = Math.random() * canvas.height;
                particles.push({
                    x,
                    y,
                    originX: x,
                    originY: y,
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: (Math.random() - 0.5) * 0.5,
                    size: Math.random() * 2.5 + 1,
                    color: colors[Math.floor(Math.random() * colors.length)]
                });
            }
        };

        const getTargetPosition = (pIndex: number, mode: AnimationMode): { x: number, y: number } | null => {
            if (mode === 'RANDOM') return null;

            let points: { x: number, y: number }[];
            switch (mode) {
                case 'FLASK': points = FLASK_POINTS; break;
                case 'CHART': points = CHART_POINTS; break;
                case 'ROCKET': points = ROCKET_POINTS; break;
                case 'GLOBE': points = GLOBE_POINTS; break;
                case 'LIGHTBULB': points = LIGHTBULB_POINTS; break;
                default: return null;
            }

            // Define multiple centers
            const centers = [
                { x: 0.15, y: 0.25, scale: 0.12 }, // Top Left (Small)
                { x: 0.85, y: 0.25, scale: 0.15 }, // Top Right (Medium)
                { x: 0.15, y: 0.75, scale: 0.15 }, // Bottom Left (Medium)
                { x: 0.85, y: 0.75, scale: 0.12 }, // Bottom Right (Small)
                { x: 0.5, y: 0.2, scale: 0.1 },    // Top Center (Tiny)
                { x: 0.5, y: 0.8, scale: 0.1 }     // Bottom Center (Tiny)
            ];

            const centerIndex = pIndex % centers.length;
            const center = centers[centerIndex];

            const pointIndex = pIndex % points.length;
            const pt = points[pointIndex];

            const scale = Math.min(canvas.width, canvas.height) * center.scale;

            return {
                x: center.x * canvas.width + (pt.x - 0.5) * scale + (Math.random() - 0.5) * 10,
                y: center.y * canvas.height + (pt.y - 0.5) * scale + (Math.random() - 0.5) * 10
            };
        };

        const animate = () => {
            if (!ctx || !canvas) return;

            const isDark = themeRef.current === 'dark';
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            timeRef.current++;

            // Logic: Only show shapes if LOADING. Otherwise RANDOM.
            if (isLoadingRef.current) {
                // Cycle modes every 5 seconds
                const cycle = Math.floor(timeRef.current / 300) % 5;
                const modes: AnimationMode[] = ['FLASK', 'CHART', 'ROCKET', 'GLOBE', 'LIGHTBULB'];
                modeRef.current = modes[cycle];
            } else {
                modeRef.current = 'RANDOM';
            }

            const forceDistance = 150;
            const pushStrength = 3;
            const shapeForce = 0.05;
            const friction = 0.92;

            particles.forEach((p, i) => {
                const target = getTargetPosition(i, modeRef.current);

                let fx = 0;
                let fy = 0;

                if (target) {
                    fx += (target.x - p.x) * shapeForce;
                    fy += (target.y - p.y) * shapeForce;
                } else {
                    fx += (p.originX - p.x) * 0.005;
                    fy += (p.originY - p.y) * 0.005;
                    fx += (Math.random() - 0.5) * 0.1;
                    fy += (Math.random() - 0.5) * 0.1;
                }

                const dx = mouseRef.current.x - p.x;
                const dy = mouseRef.current.y - p.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < forceDistance) {
                    const force = (forceDistance - distance) / forceDistance;
                    const angle = Math.atan2(dy, dx);
                    fx -= Math.cos(angle) * force * pushStrength;
                    fy -= Math.sin(angle) * force * pushStrength;
                }

                p.vx += fx;
                p.vy += fy;
                p.vx *= friction;
                p.vy *= friction;
                p.x += p.vx;
                p.y += p.vy;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = isDark ? p.color : '#94a3b8';
                const baseAlpha = isDark ? 0.5 : 0.4;
                ctx.globalAlpha = baseAlpha;
                ctx.fill();
                ctx.globalAlpha = 1;
            });

            if (modeRef.current === 'RANDOM') {
                const connectionDistance = 100;
                const mouseConnectionDistance = 200;

                for (let i = 0; i < particles.length; i++) {
                    const dxMouse = particles[i].x - mouseRef.current.x;
                    const dyMouse = particles[i].y - mouseRef.current.y;
                    if (Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse) > mouseConnectionDistance) continue;

                    for (let j = i + 1; j < particles.length; j++) {
                        const dx = particles[i].x - particles[j].x;
                        const dy = particles[i].y - particles[j].y;
                        const distance = Math.sqrt(dx * dx + dy * dy);

                        if (distance < connectionDistance) {
                            const opacity = (1 - distance / connectionDistance) * 0.2;
                            ctx.beginPath();
                            ctx.moveTo(particles[i].x, particles[i].y);
                            ctx.lineTo(particles[j].x, particles[j].y);
                            ctx.strokeStyle = isDark ? particles[i].color : '#94a3b8';
                            ctx.globalAlpha = opacity;
                            ctx.lineWidth = 0.5;
                            ctx.stroke();
                            ctx.globalAlpha = 1;
                        }
                    }
                }
            }

            animationFrameId = requestAnimationFrame(animate);
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        window.addEventListener('mousemove', handleMouseMove);
        animate();

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleMouseMove);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-0"
            style={{ background: 'transparent' }}
        />
    );
};

export default ParticleAnimation;
