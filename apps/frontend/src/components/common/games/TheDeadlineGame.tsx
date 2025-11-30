import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useAnimation, useSpring } from 'framer-motion';
import {
    Briefcase, Coffee, Zap, AlertTriangle, FileText,
    Clock, Award, Star, TrendingUp, Shield,
    MousePointer2, Keyboard, Monitor, Printer,
    Ghost, Skull, Heart, Flame
} from 'lucide-react';
import { cn } from '@/lib/utils';

// --- Game Constants & Config ---
const GRAVITY = 0.6;
const JUMP_FORCE = -12;
const GAME_SPEED_BASE = 6;
const LANE_HEIGHT = 120; // Not used in single-plane runner, but good for parallax
const GROUND_Y = 300;

// --- Assets & Data ---

const OBSTACLES = [
    { id: 'red_tape', name: 'Red Tape', icon: AlertTriangle, color: '#ef4444', height: 60, width: 40, y: 0, type: 'jump' },
    { id: 'micromanager', name: 'Micromanager', icon: Ghost, color: '#a855f7', height: 80, width: 50, y: -20, type: 'dash' },
    { id: 'meeting', name: 'Surprise Meeting', icon: Briefcase, color: '#f97316', height: 100, width: 60, y: 0, type: 'jump' },
    { id: 'printer', name: 'Broken Printer', icon: Printer, color: '#64748b', height: 50, width: 50, y: 0, type: 'jump' },
    { id: 'low_hanging', name: 'Low Hanging Fruit', icon: FileText, color: '#84cc16', height: 40, width: 40, y: -90, type: 'duck' },
];

const POWERUPS = [
    { id: 'coffee', name: 'Espresso Shot', icon: Coffee, color: '#8B4513', effect: 'speed', duration: 5000 },
    { id: 'synergy', name: 'Synergy', icon: Zap, color: '#eab308', effect: 'invincible', duration: 3000 },
    { id: 'idea', name: 'Bright Idea', icon: Star, color: '#06b6d4', effect: 'points', points: 500 },
];

const FLAVOR_TEXTS = [
    "Circling back...",
    "Per my last email...",
    "Let's touch base!",
    "Synergy!",
    "Paradigm shift!",
    "Low hanging fruit!",
    "Thinking outside the box!",
    "Moving the needle!",
    "Actionable items!",
    "Blue sky thinking!",
];

// --- Types ---

interface Entity {
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    type: 'obstacle' | 'powerup' | 'decoration';
    data: any;
    rotation: number;
    markedForDeletion?: boolean;
}

interface Particle {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    color: string;
    size: number;
    text?: string;
}

interface GameState {
    isPlaying: boolean;
    isGameOver: boolean;
    score: number;
    highScore: number;
    speed: number;
    distance: number;
}

// --- Components ---

const TheDeadlineGame = ({ onClose }: { onClose: () => void }) => {
    // Game State
    const [gameState, setGameState] = useState<GameState>({
        isPlaying: false,
        isGameOver: false,
        score: 0,
        highScore: parseInt(localStorage.getItem('deadline_highscore') || '0'),
        speed: GAME_SPEED_BASE,
        distance: 0,
    });

    // Player State
    const playerRef = useRef({
        x: 100,
        y: 0,
        vy: 0,
        isGrounded: true,
        isDucking: false,
        isDashing: false,
        invincibleUntil: 0,
        width: 50,
        height: 80,
    });

    // Refs for loop
    const requestRef = useRef<number>();
    const lastTimeRef = useRef<number>();
    const entitiesRef = useRef<Entity[]>([]);
    const particlesRef = useRef<Particle[]>([]);
    const scoreRef = useRef(0);

    // React State for rendering (synced from refs occasionally or for critical UI)
    const [uiScore, setUiScore] = useState(0);
    const [playerState, setPlayerState] = useState({ y: 0, isDucking: false, isDashing: false, isInvincible: false });
    const [entities, setEntities] = useState<Entity[]>([]); // For React rendering
    const [particles, setParticles] = useState<Particle[]>([]);
    const [shake, setShake] = useState(0);
    const [flash, setFlash] = useState<string | null>(null);

    // Audio (simulated with visual text for now, could add real audio later)
    const playSound = (type: 'jump' | 'hit' | 'collect' | 'dash') => {
        // Visual sound effects handled by particles
    };

    // --- Game Loop ---

    const spawnEntity = (distance: number) => {
        const isPowerup = Math.random() < 0.15;
        const id = Date.now() + Math.random();

        if (isPowerup) {
            const data = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
            entitiesRef.current.push({
                id,
                x: 1000, // Spawn off screen
                y: Math.random() > 0.5 ? -50 : -150, // Ground or air
                width: 40,
                height: 40,
                type: 'powerup',
                data,
                rotation: 0,
            });
        } else {
            const data = OBSTACLES[Math.floor(Math.random() * OBSTACLES.length)];
            entitiesRef.current.push({
                id,
                x: 1000,
                y: data.y, // Relative to ground (0 is ground)
                width: data.width,
                height: data.height,
                type: 'obstacle',
                data,
                rotation: 0,
            });
        }
    };

    const spawnParticle = (x: number, y: number, color: string, count = 5, text?: string) => {
        if (text) {
            particlesRef.current.push({
                id: Math.random(),
                x, y,
                vx: 0, vy: -1,
                life: 60,
                color,
                size: 20,
                text
            });
            return;
        }

        for (let i = 0; i < count; i++) {
            particlesRef.current.push({
                id: Math.random(),
                x, y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 30 + Math.random() * 20,
                color,
                size: 4 + Math.random() * 6,
            });
        }
    };

    const update = (time: number) => {
        if (!lastTimeRef.current) lastTimeRef.current = time;
        const deltaTime = time - lastTimeRef.current;
        lastTimeRef.current = time;

        if (!gameState.isPlaying || gameState.isGameOver) {
            requestRef.current = requestAnimationFrame(update);
            return;
        }

        const player = playerRef.current;

        // Physics
        if (!player.isGrounded) {
            player.vy += GRAVITY;
        }

        player.y += player.vy;

        // Ground collision
        if (player.y >= 0) {
            player.y = 0;
            player.vy = 0;
            player.isGrounded = true;
        }

        // Update Distance & Spawning
        const speed = gameState.speed + (scoreRef.current / 5000); // Slowly increase speed
        const moveAmount = speed * (deltaTime / 16); // Normalize to 60fps

        // Move entities
        entitiesRef.current.forEach(e => {
            e.x -= moveAmount;
            if (e.type === 'powerup') {
                e.rotation += 2;
                e.y = e.y + Math.sin(time / 200) * 0.5; // Float
            }
        });

        // Remove off-screen
        entitiesRef.current = entitiesRef.current.filter(e => e.x > -100);

        // Spawn new
        if (Math.random() < 0.02) { // Spawn chance
            const lastEntity = entitiesRef.current[entitiesRef.current.length - 1];
            if (!lastEntity || (1000 - lastEntity.x > 300)) { // Min gap
                spawnEntity(scoreRef.current);
            }
        }

        // Collision Detection
        const playerRect = {
            l: player.x,
            r: player.x + player.width,
            t: player.y + (player.isDucking ? 40 : 0) - player.height, // y is bottom (0)
            b: player.y,
        };

        // Adjust for ducking visual
        if (player.isDucking) {
            playerRect.t = player.y - (player.height / 2);
        }

        entitiesRef.current.forEach(e => {
            if (e.markedForDeletion) return;

            // Entity rect (y is relative to ground 0)
            // Obstacle y=0 means bottom is at ground. y=-20 means floating.
            // We render them relative to ground.
            // Let's standardize: e.y is offset from ground.
            const eRect = {
                l: e.x,
                r: e.x + e.width,
                t: e.y - e.height,
                b: e.y,
            };

            // Simple AABB
            // Note: y is 0 at ground, negative up.
            // Player t is e.g. -80. Player b is 0.
            // Obstacle t is -60. Obstacle b is 0.

            // Check overlap
            const overlapX = playerRect.l < eRect.r && playerRect.r > eRect.l;
            const overlapY = playerRect.t < eRect.b && playerRect.b > eRect.t;

            if (overlapX && overlapY) {
                if (e.type === 'powerup') {
                    // Collect
                    e.markedForDeletion = true;
                    scoreRef.current += e.data.points || 100;
                    spawnParticle(e.x, e.y - 20, e.data.color, 10);
                    spawnParticle(player.x, player.y - 80, '#fff', 1, e.data.name + "!");

                    if (e.data.effect === 'speed') {
                        setFlash(e.data.color);
                        setTimeout(() => setFlash(null), 200);
                    }
                    if (e.data.effect === 'invincible') {
                        player.invincibleUntil = Date.now() + e.data.duration;
                    }

                } else if (e.type === 'obstacle') {
                    // Hit
                    if (player.isDashing || Date.now() < player.invincibleUntil) {
                        // Destroy obstacle
                        e.markedForDeletion = true;
                        spawnParticle(e.x, e.y - 20, '#fff', 8);
                        spawnParticle(e.x, e.y - 40, '#fff', 1, "SMASH!");
                        setShake(5);
                        setTimeout(() => setShake(0), 200);
                    } else {
                        // Game Over
                        setGameState(prev => ({ ...prev, isGameOver: true }));
                        setShake(20);
                        setFlash('#ef4444');
                        spawnParticle(player.x, player.y - 40, '#ef4444', 20, "FIRED!");
                    }
                }
            }
        });

        // Particles
        particlesRef.current.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.life--;
            p.vy += 0.2; // Gravity for particles
        });
        particlesRef.current = particlesRef.current.filter(p => p.life > 0);

        // Update Score
        scoreRef.current += 1;

        // Sync to React State (throttled/batched effectively by React 18, but let's be careful)
        // We only sync what's needed for rendering
        setUiScore(Math.floor(scoreRef.current));
        setEntities([...entitiesRef.current]);
        setParticles([...particlesRef.current]);
        setPlayerState({
            y: player.y,
            isDucking: player.isDucking,
            isDashing: player.isDashing,
            isInvincible: Date.now() < player.invincibleUntil
        });

        requestRef.current = requestAnimationFrame(update);
    };

    // --- Controls ---

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (gameState.isGameOver) {
                if (e.key === ' ' || e.key === 'Enter') restartGame();
                return;
            }
            if (!gameState.isPlaying) {
                if (e.key === ' ' || e.key === 'Enter') setGameState(prev => ({ ...prev, isPlaying: true }));
                return;
            }

            const player = playerRef.current;

            switch (e.key) {
                case ' ':
                case 'ArrowUp':
                case 'w':
                    if (player.isGrounded) {
                        player.vy = JUMP_FORCE;
                        player.isGrounded = false;
                        // spawnParticle(player.x, player.y, '#fff', 3);
                    }
                    break;
                case 'ArrowDown':
                case 's':
                    player.isDucking = true;
                    if (!player.isGrounded) player.vy += 5; // Fast fall
                    break;
                case 'ArrowRight':
                case 'd':
                    if (!player.isDashing) {
                        player.isDashing = true;
                        setTimeout(() => playerRef.current.isDashing = false, 200);
                        spawnParticle(player.x - 20, player.y - 40, '#06b6d4', 5);
                    }
                    break;
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown' || e.key === 's') {
                playerRef.current.isDucking = false;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        requestRef.current = requestAnimationFrame(update);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [gameState.isPlaying, gameState.isGameOver]);

    const restartGame = () => {
        scoreRef.current = 0;
        entitiesRef.current = [];
        particlesRef.current = [];
        playerRef.current = { ...playerRef.current, y: 0, vy: 0, isGrounded: true };
        setGameState({
            isPlaying: true,
            isGameOver: false,
            score: 0,
            highScore: gameState.highScore,
            speed: GAME_SPEED_BASE,
            distance: 0,
        });
        setFlash('#fff');
        setTimeout(() => setFlash(null), 100);
    };

    // --- Rendering Helpers ---

    return (
        <div className="absolute inset-0 overflow-hidden bg-slate-900 font-sans select-none">
            {/* Background Parallax */}
            <div className="absolute inset-0 opacity-20 pointer-events-none">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
                {/* Moving background elements could go here */}
            </div>

            {/* Shake Wrapper */}
            <motion.div
                className="relative w-full h-full"
                animate={{ x: shake ? [-shake, shake, -shake, shake, 0] : 0 }}
                transition={{ duration: 0.2 }}
            >

                {/* Ground */}
                <div
                    className="absolute w-full h-[2px] bg-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.5)]"
                    style={{ bottom: GROUND_Y }}
                />
                <div
                    className="absolute w-full bg-slate-950/50 backdrop-blur-sm"
                    style={{ bottom: 0, height: GROUND_Y }}
                />

                {/* Player */}
                <div
                    className="absolute z-20"
                    style={{
                        left: playerRef.current.x,
                        bottom: GROUND_Y - playerState.y, // y is negative up in physics, but here we subtract it? Wait.
                        // Physics: y=0 ground, y=-100 air.
                        // CSS bottom: 0 is bottom.
                        // If physics y is 0, bottom is GROUND_Y.
                        // If physics y is -100, bottom is GROUND_Y + 100.
                        // So bottom = GROUND_Y - playerState.y
                        transform: `translate(-50%, 100%)`, // Pivot bottom center
                    }}
                >
                    <motion.div
                        animate={{
                            scaleY: playerState.isDucking ? 0.6 : 1,
                            scaleX: playerState.isDucking ? 1.2 : 1,
                            rotate: playerState.isDashing ? 20 : 0,
                        }}
                        className={cn(
                            "relative flex items-center justify-center",
                            playerState.isInvincible && "animate-pulse"
                        )}
                    >
                        {/* Character Visual */}
                        <div className="w-12 h-20 bg-gradient-to-b from-cyan-400 to-blue-600 rounded-xl shadow-lg border-2 border-white/20 flex flex-col items-center p-2 relative overflow-hidden">
                            {/* Face */}
                            <div className="w-full h-8 bg-slate-900 rounded-lg mb-1 flex items-center justify-center gap-1">
                                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                            </div>
                            {/* Tie */}
                            <div className="w-2 h-6 bg-red-500 rounded-full" />

                            {/* Dash Trail */}
                            {playerState.isDashing && (
                                <motion.div
                                    initial={{ opacity: 0.8, x: 0 }}
                                    animate={{ opacity: 0, x: -50 }}
                                    className="absolute inset-0 bg-white/50"
                                />
                            )}
                        </div>
                    </motion.div>
                </div>

                {/* Entities */}
                {entities.map(e => (
                    <div
                        key={e.id}
                        className="absolute z-10 flex items-center justify-center"
                        style={{
                            left: e.x,
                            bottom: GROUND_Y - e.y, // Same logic
                            width: e.width,
                            height: e.height,
                            transform: `translate(0, 100%) rotate(${e.rotation}deg)`,
                        }}
                    >
                        {e.type === 'obstacle' ? (
                            <div
                                className="w-full h-full rounded-lg flex items-center justify-center shadow-lg border-2 border-white/10"
                                style={{ backgroundColor: e.data.color }}
                            >
                                <e.data.icon className="text-white w-2/3 h-2/3" />
                            </div>
                        ) : (
                            <div
                                className="w-full h-full rounded-full flex items-center justify-center shadow-[0_0_15px_currentColor]"
                                style={{ color: e.data.color, backgroundColor: `${e.data.color}20` }}
                            >
                                <e.data.icon className="w-full h-full p-2" />
                            </div>
                        )}
                    </div>
                ))}

                {/* Particles */}
                {particles.map(p => (
                    <div
                        key={p.id}
                        className="absolute z-30 pointer-events-none"
                        style={{
                            left: p.x,
                            bottom: GROUND_Y - p.y,
                        }}
                    >
                        {p.text ? (
                            <motion.div
                                initial={{ scale: 0.5, opacity: 1, y: 0 }}
                                animate={{ scale: 1.5, opacity: 0, y: -50 }}
                                className="text-2xl font-black text-white whitespace-nowrap"
                                style={{ textShadow: '2px 2px 0 #000' }}
                            >
                                {p.text}
                            </motion.div>
                        ) : (
                            <div
                                className="rounded-full"
                                style={{
                                    width: p.size,
                                    height: p.size,
                                    backgroundColor: p.color,
                                }}
                            />
                        )}
                    </div>
                ))}

            </motion.div>

            {/* UI Overlay */}
            <div className="absolute inset-0 pointer-events-none z-50 p-8 flex flex-col justify-between">
                {/* Header */}
                <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-1">
                        <h1 className="text-4xl font-black text-white italic tracking-tighter drop-shadow-lg">
                            THE DEADLINE
                        </h1>
                        <div className="flex items-center gap-2 text-cyan-400 font-mono">
                            <Clock className="w-4 h-4" />
                            <span>REMAINING: {(100 - (uiScore % 1000) / 10).toFixed(1)}%</span>
                        </div>
                    </div>

                    <div className="flex flex-col items-end">
                        <div className="text-6xl font-black text-white tabular-nums drop-shadow-xl">
                            {uiScore.toString().padStart(6, '0')}
                        </div>
                        <div className="text-sm text-white/50 font-bold tracking-widest">SCORE</div>
                    </div>
                </div>

                {/* Controls Hint */}
                {!gameState.isPlaying && !gameState.isGameOver && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-slate-900 p-8 rounded-3xl border-4 border-cyan-500 shadow-2xl max-w-md text-center"
                        >
                            <div className="text-6xl mb-4">🏃‍♂️💨</div>
                            <h2 className="text-3xl font-bold text-white mb-2">Ready to Sprint?</h2>
                            <p className="text-slate-400 mb-8">
                                Dodge red tape, jump over meetings, and collect coffee to survive the corporate crunch!
                            </p>

                            <div className="grid grid-cols-3 gap-4 mb-8 text-sm text-white/80">
                                <div className="flex flex-col items-center gap-2">
                                    <div className="p-3 bg-white/10 rounded-lg"><Keyboard className="w-6 h-6" /></div>
                                    <span>Jump</span>
                                </div>
                                <div className="flex flex-col items-center gap-2">
                                    <div className="p-3 bg-white/10 rounded-lg"><Keyboard className="w-6 h-6 rotate-180" /></div>
                                    <span>Duck</span>
                                </div>
                                <div className="flex flex-col items-center gap-2">
                                    <div className="p-3 bg-white/10 rounded-lg"><Keyboard className="w-6 h-6 rotate-90" /></div>
                                    <span>Dash</span>
                                </div>
                            </div>

                            <button
                                onClick={() => setGameState(prev => ({ ...prev, isPlaying: true }))}
                                className="w-full py-4 bg-cyan-500 hover:bg-cyan-400 text-black font-black text-xl rounded-xl transition-all hover:scale-105 active:scale-95"
                            >
                                START WORKING
                            </button>
                        </motion.div>
                    </div>
                )}

                {/* Game Over */}
                {gameState.isGameOver && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-900/80 backdrop-blur-md pointer-events-auto">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-slate-900 p-8 rounded-3xl border-4 border-red-500 shadow-2xl max-w-md text-center"
                        >
                            <div className="text-6xl mb-4">💀</div>
                            <h2 className="text-4xl font-black text-white mb-2">FIRED!</h2>
                            <p className="text-red-200 mb-6">
                                You missed the deadline. The client is furious.
                            </p>

                            <div className="bg-slate-800 p-4 rounded-xl mb-6">
                                <div className="flex justify-between text-white/60 text-sm mb-1">
                                    <span>FINAL SCORE</span>
                                    <span>HIGH SCORE</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="text-3xl font-bold text-white">{uiScore}</span>
                                    <span className="text-xl font-bold text-yellow-400">{Math.max(uiScore, gameState.highScore)}</span>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={onClose}
                                    className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition-all"
                                >
                                    Give Up
                                </button>
                                <button
                                    onClick={restartGame}
                                    className="flex-[2] py-3 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl transition-all hover:scale-105"
                                >
                                    TRY AGAIN
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </div>

            {/* Flash Effect */}
            {flash && (
                <div
                    className="absolute inset-0 pointer-events-none z-[60]"
                    style={{ backgroundColor: flash, opacity: 0.3 }}
                />
            )}

            {/* Close Button */}
            <button
                onClick={onClose}
                className="absolute top-6 right-6 z-[60] p-2 bg-white/10 hover:bg-white/20 rounded-full text-white/50 hover:text-white transition-colors"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
    );
};

export default TheDeadlineGame;
