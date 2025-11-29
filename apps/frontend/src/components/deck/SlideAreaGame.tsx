import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface SlideAreaGameProps {
  onClose: () => void;
}

// The REAL pain of making presentations - expanded with more horrors!
const NIGHTMARES = [
  // Classic client feedback
  { text: '"Make the logo BIGGER"', color: '#e63946', points: 15, tier: 'common' },
  { text: 'final_v7_REAL_final.pptx', color: '#f4a261', points: 20, tier: 'common' },
  { text: '"Actually nevermind"', color: '#2a9d8f', points: 25, tier: 'common' },
  { text: 'Slide 47 of 89', color: '#9b5de5', points: 25, tier: 'common' },
  { text: '"Make it POP more"', color: '#f72585', points: 15, tier: 'common' },
  { text: '⚡ CORRUPTED FILE', color: '#d90429', points: 30, tier: 'rare' },
  { text: '"My nephew could do this"', color: '#06d6a0', points: 35, tier: 'rare' },
  { text: 'Feedback @ 11:59pm', color: '#7209b7', points: 30, tier: 'rare' },
  { text: '"Try Comic Sans?"', color: '#ff006e', points: 40, tier: 'rare' },
  { text: 'FONT NOT FOUND', color: '#fb5607', points: 20, tier: 'common' },
  { text: '"Add more transitions"', color: '#3a86ff', points: 15, tier: 'common' },
  { text: '🔌 Projector: NO SIGNAL', color: '#495057', points: 25, tier: 'common' },
  { text: '"Looks different on my Mac"', color: '#8338ec', points: 20, tier: 'common' },
  { text: 'Ctrl+Z LIMIT REACHED', color: '#d00000', points: 35, tier: 'rare' },
  { text: '"Just one tiny change..."', color: '#ffbe0b', points: 25, tier: 'common' },
  { text: 'WiFi: Connected (No Internet)', color: '#6c757d', points: 20, tier: 'common' },
  { text: '"Due yesterday"', color: '#e5383b', points: 30, tier: 'rare' },
  { text: '"Can you jazz it up?"', color: '#00b4d8', points: 15, tier: 'common' },
  
  // NEW HORRORS
  { text: '"Make it more professional but fun"', color: '#8B5CF6', points: 35, tier: 'rare' },
  { text: '"I\'ll know it when I see it"', color: '#EC4899', points: 40, tier: 'rare' },
  { text: 'Meeting could\'ve been email', color: '#14B8A6', points: 25, tier: 'common' },
  { text: '"Per my last email..."', color: '#F59E0B', points: 30, tier: 'rare' },
  { text: '"Let\'s circle back"', color: '#6366F1', points: 20, tier: 'common' },
  { text: 'CEO just joined the call', color: '#DC2626', points: 45, tier: 'rare' },
  { text: '"You\'re on mute"', color: '#059669', points: 15, tier: 'common' },
  { text: '"Can you see my screen?"', color: '#7C3AED', points: 15, tier: 'common' },
  { text: 'Laptop dies mid-presentation', color: '#B91C1C', points: 50, tier: 'epic' },
  { text: '"We need to pivot"', color: '#0891B2', points: 35, tier: 'rare' },
  { text: '"What\'s our north star?"', color: '#4F46E5', points: 25, tier: 'common' },
  { text: '"Let\'s take this offline"', color: '#9333EA', points: 20, tier: 'common' },
  { text: 'Browser tabs: 127', color: '#EA580C', points: 30, tier: 'rare' },
  { text: '"Actually, I prefer Prezi"', color: '#BE185D', points: 45, tier: 'rare' },
  { text: '"Why is there a cat filter?"', color: '#10B981', points: 40, tier: 'rare' },
  { text: '"Hard stop in 2 mins"', color: '#EF4444', points: 25, tier: 'common' },
  { text: 'Slides saved to wrong folder', color: '#F97316', points: 30, tier: 'rare' },
  { text: '"This should be quick"', color: '#84CC16', points: 35, tier: 'rare' },
  { text: 'Accidentally shared wrong window', color: '#E11D48', points: 55, tier: 'epic' },
  { text: '"ChatGPT could do this"', color: '#8B5CF6', points: 40, tier: 'rare' },
  { text: '"Add more synergy"', color: '#06B6D4', points: 25, tier: 'common' },
  { text: 'Forgot to attach the file', color: '#F43F5E', points: 30, tier: 'rare' },
  { text: '"Reply All" incident', color: '#DC2626', points: 60, tier: 'epic' },
  { text: '"I showed my spouse..."', color: '#A855F7', points: 45, tier: 'rare' },
];

// BOSS NIGHTMARES - Rare and devastating!
const BOSSES = [
  { text: '👔 THE STAKEHOLDER', color: '#4a0080', points: 200, tier: 'boss', hp: 3 },
  { text: '📧 EMAIL CHAIN OF 47', color: '#800040', points: 250, tier: 'boss', hp: 4 },
  { text: '🌈 WORDART NIGHTMARE', color: '#ff00ff', points: 300, tier: 'boss', hp: 5 },
  { text: '📊 SCOPE CREEP DEMON', color: '#400080', points: 350, tier: 'boss', hp: 6 },
];

// Power-ups to help!
const POWERUPS = [
  { type: 'coffee', emoji: '☕', effect: 'TIME FREEZE', duration: 3000, color: '#8B4513' },
  { type: 'ctrl-z', emoji: '↩️', effect: '+10 SECONDS', addTime: 10, color: '#4169E1' },
  { type: 'autosave', emoji: '💾', effect: 'DOUBLE POINTS', duration: 5000, color: '#32CD32' },
  { type: 'wifi', emoji: '📶', effect: 'SLOW-MO', duration: 4000, color: '#00CED1' },
  { type: 'deadline', emoji: '📅', effect: 'EXTRA LIFE', heal: 1, color: '#FFD700' },
];

const SMASH_WORDS = ['BONK!', 'POW!', 'WHAM!', 'SPLAT!', 'KAPOW!', 'SMASH!', 'BOOM!', 'ZAP!', 'YEET!', 'DELETED!', 'NOPE!', 'BYE!'];
const BOSS_SMASH_WORDS = ['CRITICAL!', 'MEGA HIT!', 'SUPER!', 'REKT!', 'DEMOLISHED!'];

interface Nightmare {
  id: number;
  data: typeof NIGHTMARES[0] & { hp?: number };
  x: number;
  y: number;
  vx: number;
  vy: number;
  scale: number;
  wobble: number;
  hp?: number;
  isBoss?: boolean;
}

interface PowerUp {
  id: number;
  data: typeof POWERUPS[0];
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface SmashEffect {
  id: number;
  x: number;
  y: number;
  word: string;
  rotation: number;
  color?: string;
  isBoss?: boolean;
}

const SlideAreaGame: React.FC<SlideAreaGameProps> = ({ onClose }) => {
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('nightmareHighScore3');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [nightmares, setNightmares] = useState<Nightmare[]>([]);
  const [powerups, setPowerups] = useState<PowerUp[]>([]);
  const [smashEffects, setSmashEffects] = useState<SmashEffect[]>([]);
  const [timeLeft, setTimeLeft] = useState(60);
  const [gameState, setGameState] = useState<'ready' | 'playing' | 'ended'>('ready');
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [destroyed, setDestroyed] = useState(0);
  const [shake, setShake] = useState(false);
  const [hammerSmash, setHammerSmash] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [lives, setLives] = useState(3);
  const [activeEffects, setActiveEffects] = useState<string[]>([]);
  const [bossesDefeated, setBossesDefeated] = useState(0);
  const [epicNightmares, setEpicNightmares] = useState(0);
  const [doublePoints, setDoublePoints] = useState(false);
  const [slowMo, setSlowMo] = useState(false);
  const [timeFrozen, setTimeFrozen] = useState(false);
  const [screenFlash, setScreenFlash] = useState<string | null>(null);
  const [messagePopup, setMessagePopup] = useState<string | null>(null);
  
  const nightmareIdRef = useRef(0);
  const effectIdRef = useRef(0);
  const powerupIdRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track cursor
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Spawn nightmares
  useEffect(() => {
    if (gameState !== 'playing' || timeFrozen) return;

    const spawn = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      
      // Determine what to spawn
      const roll = Math.random();
      let nightmareData;
      let isBoss = false;
      
      if (roll < 0.02 && timeLeft < 45) { // 2% chance for boss after 15 seconds
        nightmareData = { ...BOSSES[Math.floor(Math.random() * BOSSES.length)] };
        isBoss = true;
      } else if (roll < 0.1) { // 8% chance for epic
        nightmareData = NIGHTMARES.filter(n => n.tier === 'epic')[Math.floor(Math.random() * NIGHTMARES.filter(n => n.tier === 'epic').length)] || NIGHTMARES[0];
      } else if (roll < 0.35) { // 25% chance for rare
        nightmareData = NIGHTMARES.filter(n => n.tier === 'rare')[Math.floor(Math.random() * NIGHTMARES.filter(n => n.tier === 'rare').length)];
      } else { // common
        nightmareData = NIGHTMARES.filter(n => n.tier === 'common')[Math.floor(Math.random() * NIGHTMARES.filter(n => n.tier === 'common').length)];
      }

      const side = Math.floor(Math.random() * 4);
      let x, y, vx, vy;
      const baseSpeed = slowMo ? 0.8 : 1.5;
      const speedVar = slowMo ? 0.5 : 1;

      if (side === 0) {
        x = Math.random() * rect.width; y = -60;
        vx = (Math.random() - 0.5) * 3; vy = baseSpeed + Math.random() * speedVar;
      } else if (side === 1) {
        x = rect.width + 60; y = Math.random() * rect.height;
        vx = -(baseSpeed + Math.random() * speedVar); vy = (Math.random() - 0.5) * 3;
      } else if (side === 2) {
        x = Math.random() * rect.width; y = rect.height + 60;
        vx = (Math.random() - 0.5) * 3; vy = -(baseSpeed + Math.random() * speedVar);
      } else {
        x = -180; y = Math.random() * rect.height;
        vx = baseSpeed + Math.random() * speedVar; vy = (Math.random() - 0.5) * 3;
      }

      setNightmares(prev => [...prev, {
        id: nightmareIdRef.current++,
        data: nightmareData,
        x, y, vx, vy,
        scale: isBoss ? 1.3 : 0.9 + Math.random() * 0.3,
        wobble: Math.random() * 360,
        hp: isBoss ? (nightmareData as any).hp : undefined,
        isBoss,
      }]);
    };

    const interval = setInterval(spawn, slowMo ? 1000 : 600);
    return () => clearInterval(interval);
  }, [gameState, slowMo, timeFrozen, timeLeft]);

  // Spawn power-ups
  useEffect(() => {
    if (gameState !== 'playing' || timeFrozen) return;

    const spawn = () => {
      if (!containerRef.current) return;
      if (Math.random() > 0.15) return; // 15% chance each interval
      
      const rect = containerRef.current.getBoundingClientRect();
      const data = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
      
      const side = Math.floor(Math.random() * 4);
      let x, y, vx, vy;

      if (side === 0) {
        x = Math.random() * rect.width; y = -40;
        vx = (Math.random() - 0.5) * 2; vy = 1.5;
      } else if (side === 1) {
        x = rect.width + 40; y = Math.random() * rect.height;
        vx = -1.5; vy = (Math.random() - 0.5) * 2;
      } else if (side === 2) {
        x = Math.random() * rect.width; y = rect.height + 40;
        vx = (Math.random() - 0.5) * 2; vy = -1.5;
      } else {
        x = -40; y = Math.random() * rect.height;
        vx = 1.5; vy = (Math.random() - 0.5) * 2;
      }

      setPowerups(prev => [...prev, {
        id: powerupIdRef.current++,
        data, x, y, vx, vy,
      }]);
    };

    const interval = setInterval(spawn, 2000);
    return () => clearInterval(interval);
  }, [gameState, timeFrozen]);

  // Move nightmares
  useEffect(() => {
    if (gameState !== 'playing' || timeFrozen) return;

    const move = setInterval(() => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const speedMult = slowMo ? 1.5 : 2.5;

      setNightmares(prev => prev
        .map(n => ({ ...n, x: n.x + n.vx * speedMult, y: n.y + n.vy * speedMult, wobble: n.wobble + 8 }))
        .filter(n => {
          const isOut = n.x < -250 || n.x > rect.width + 250 || n.y < -150 || n.y > rect.height + 150;
          if (isOut) {
            setCombo(0);
            // Lose a life if an epic or boss escapes
            if (n.data.tier === 'epic' || n.isBoss) {
              setLives(l => Math.max(0, l - 1));
              setScreenFlash('#FF0000');
              setTimeout(() => setScreenFlash(null), 200);
            }
          }
          return !isOut;
        })
      );

      setPowerups(prev => prev
        .map(p => ({ ...p, x: p.x + p.vx * 2, y: p.y + p.vy * 2 }))
        .filter(p => {
          const isOut = p.x < -100 || p.x > rect.width + 100 || p.y < -100 || p.y > rect.height + 100;
          return !isOut;
        })
      );
    }, 16);

    return () => clearInterval(move);
  }, [gameState, slowMo, timeFrozen]);

  // Timer
  useEffect(() => {
    if (gameState !== 'playing' || timeFrozen) return;
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1 || lives <= 0) {
          setGameState('ended');
          if (score > highScore) {
            setHighScore(score);
            localStorage.setItem('nightmareHighScore3', score.toString());
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [gameState, score, highScore, timeFrozen, lives]);

  // Check lives
  useEffect(() => {
    if (lives <= 0 && gameState === 'playing') {
      setGameState('ended');
      if (score > highScore) {
        setHighScore(score);
        localStorage.setItem('nightmareHighScore3', score.toString());
      }
    }
  }, [lives, gameState, score, highScore]);

  // Cleanup effects
  useEffect(() => {
    if (smashEffects.length === 0) return;
    const timeout = setTimeout(() => setSmashEffects([]), 400);
    return () => clearTimeout(timeout);
  }, [smashEffects]);

  // Clear message popup
  useEffect(() => {
    if (!messagePopup) return;
    const timeout = setTimeout(() => setMessagePopup(null), 1500);
    return () => clearTimeout(timeout);
  }, [messagePopup]);

  const smash = useCallback((nightmare: Nightmare, e: React.MouseEvent) => {
    e.stopPropagation();

    setShake(true);
    setHammerSmash(true);
    setTimeout(() => { setShake(false); setHammerSmash(false); }, 150);

    // Boss damage
    if (nightmare.isBoss && nightmare.hp && nightmare.hp > 1) {
      setNightmares(prev => prev.map(n => 
        n.id === nightmare.id ? { ...n, hp: (n.hp || 1) - 1 } : n
      ));
      
      setSmashEffects(prev => [...prev, {
        id: effectIdRef.current++,
        x: nightmare.x,
        y: nightmare.y,
        word: BOSS_SMASH_WORDS[Math.floor(Math.random() * BOSS_SMASH_WORDS.length)],
        rotation: (Math.random() - 0.5) * 40,
        color: '#FFD700',
        isBoss: true,
      }]);
      
      setScore(s => s + 50);
      return;
    }

    // Full destroy
    const comboMultiplier = 1 + combo * 0.3;
    const doubleMultiplier = doublePoints ? 2 : 1;
    const points = Math.floor(nightmare.data.points * comboMultiplier * doubleMultiplier);

    setSmashEffects(prev => [...prev, {
      id: effectIdRef.current++,
      x: nightmare.x,
      y: nightmare.y,
      word: nightmare.isBoss 
        ? '💥 BOSS DESTROYED! 💥'
        : SMASH_WORDS[Math.floor(Math.random() * SMASH_WORDS.length)],
      rotation: (Math.random() - 0.5) * 40,
      color: nightmare.isBoss ? '#FFD700' : undefined,
      isBoss: nightmare.isBoss,
    }]);

    if (nightmare.isBoss) {
      setBossesDefeated(b => b + 1);
      setScreenFlash('#FFD700');
      setMessagePopup('🎉 BOSS DEFEATED! +' + points + ' pts');
      setTimeout(() => setScreenFlash(null), 300);
    } else if (nightmare.data.tier === 'epic') {
      setEpicNightmares(e => e + 1);
      setScreenFlash('#FF00FF');
      setTimeout(() => setScreenFlash(null), 200);
    }

    setScore(s => s + points);
    setCombo(c => { const nc = c + 1; if (nc > maxCombo) setMaxCombo(nc); return nc; });
    setDestroyed(d => d + 1);
    setNightmares(prev => prev.filter(n => n.id !== nightmare.id));
  }, [combo, maxCombo, doublePoints]);

  const collectPowerup = useCallback((powerup: PowerUp, e: React.MouseEvent) => {
    e.stopPropagation();
    
    setPowerups(prev => prev.filter(p => p.id !== powerup.id));
    setScreenFlash(powerup.data.color);
    setTimeout(() => setScreenFlash(null), 200);
    
    const effect = powerup.data;
    setMessagePopup(`${effect.emoji} ${effect.effect}!`);
    
    if (effect.type === 'coffee') {
      setTimeFrozen(true);
      setTimeout(() => setTimeFrozen(false), effect.duration || 3000);
    } else if (effect.type === 'ctrl-z') {
      setTimeLeft(t => t + (effect.addTime || 10));
    } else if (effect.type === 'autosave') {
      setDoublePoints(true);
      setTimeout(() => setDoublePoints(false), effect.duration || 5000);
    } else if (effect.type === 'wifi') {
      setSlowMo(true);
      setTimeout(() => setSlowMo(false), effect.duration || 4000);
    } else if (effect.type === 'deadline') {
      setLives(l => Math.min(5, l + 1));
    }
    
    setScore(s => s + 25);
  }, []);

  const startGame = () => {
    setScore(0); setTimeLeft(60); setNightmares([]); setPowerups([]); setSmashEffects([]);
    setCombo(0); setMaxCombo(0); setDestroyed(0); setGameState('playing');
    setLives(3); setBossesDefeated(0); setEpicNightmares(0);
    setDoublePoints(false); setSlowMo(false); setTimeFrozen(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.key === ' ' || e.key === 'Enter') && gameState !== 'playing') startGame();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, onClose]);

  return (
    <motion.div
      ref={containerRef}
      animate={shake ? { x: [-8, 8, -8, 8, 0], rotate: [-1, 1, -1, 1, 0] } : {}}
      transition={{ duration: 0.15 }}
      className="absolute inset-0 overflow-hidden select-none"
      style={{
        background: timeFrozen 
          ? 'linear-gradient(180deg, #001133 0%, #002266 50%, #001144 100%)'
          : 'linear-gradient(180deg, #2b2118 0%, #1a150f 50%, #2b2118 100%)',
        cursor: 'none',
        fontFamily: '"Comic Sans MS", "Chalkboard", cursive',
      }}
    >
      {/* Screen flash */}
      <AnimatePresence>
        {screenFlash && (
          <motion.div
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[60] pointer-events-none"
            style={{ background: screenFlash }}
          />
        )}
      </AnimatePresence>

      {/* Time frozen effect */}
      {timeFrozen && (
        <div className="absolute inset-0 pointer-events-none z-40">
          <div className="absolute inset-0 bg-blue-500/10" />
          {[...Array(50)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-cyan-400 rounded-full"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
              }}
              animate={{ opacity: [0, 1, 0], scale: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, delay: Math.random() * 2 }}
            />
          ))}
        </div>
      )}

      {/* Vintage paper texture */}
      <div className="absolute inset-0" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%' height='100%' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        opacity: 0.08,
      }} />

      {/* Spotlight effect */}
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse at center, rgba(255,220,180,0.15) 0%, transparent 60%)',
      }} />

      {/* Custom silly hammer cursor */}
      {gameState === 'playing' && (
        <motion.div
          className="fixed pointer-events-none z-[100]"
          style={{ left: cursorPos.x - 20, top: cursorPos.y - 40 }}
          animate={{ rotate: hammerSmash ? 45 : 0, scale: hammerSmash ? 1.3 : 1 }}
          transition={{ duration: 0.1 }}
        >
          <div className="relative">
            {/* Hammer head */}
            <div className="w-12 h-8 bg-gradient-to-b from-amber-600 to-amber-800 rounded-lg border-4 border-black relative"
              style={{ boxShadow: '3px 3px 0 #000' }}>
              <div className="absolute inset-1 bg-amber-500/30 rounded" />
              {doublePoints && (
                <motion.div
                  className="absolute -top-3 -right-3 text-lg"
                  animate={{ rotate: [0, 20, -20, 0] }}
                  transition={{ repeat: Infinity, duration: 0.3 }}
                >
                  ✨
                </motion.div>
              )}
            </div>
            {/* Hammer handle */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 w-4 h-12 bg-gradient-to-b from-yellow-700 to-yellow-900 rounded-b-lg border-4 border-black border-t-0"
              style={{ boxShadow: '2px 2px 0 #000' }} />
          </div>
        </motion.div>
      )}

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-50 w-12 h-12 rounded-full bg-red-500 hover:bg-red-400 transition-all hover:scale-110 flex items-center justify-center border-4 border-black"
        style={{ boxShadow: '4px 4px 0 #000', cursor: 'pointer' }}
      >
        <X className="w-6 h-6 text-white" strokeWidth={4} />
      </button>

      {/* Message popup */}
      <AnimatePresence>
        {messagePopup && (
          <motion.div
            initial={{ y: -100, opacity: 0, scale: 0.5 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="absolute top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-xl border-4 border-black shadow-2xl"
          >
            <span className="text-black font-black text-xl">{messagePopup}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SMASH effects */}
      <AnimatePresence>
        {smashEffects.map(effect => (
          <motion.div
            key={effect.id}
            initial={{ scale: 0, opacity: 1 }}
            animate={{ scale: [0, effect.isBoss ? 2 : 1.5, 1.2], opacity: [1, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: effect.isBoss ? 0.6 : 0.4 }}
            className="fixed z-50 pointer-events-none"
            style={{ left: effect.x, top: effect.y, transform: 'translate(-50%, -50%)' }}
          >
            <div className="absolute inset-0 -m-8" style={{
              background: `radial-gradient(circle, ${effect.color || '#ffeb3b'} 0%, ${effect.color || '#ff9800'} 40%, transparent 70%)`,
              transform: `rotate(${effect.rotation}deg)`,
            }} />
            <span
              className={`relative font-black text-white ${effect.isBoss ? 'text-5xl' : 'text-4xl'}`}
              style={{
                textShadow: '4px 4px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000',
                transform: `rotate(${effect.rotation}deg)`,
                WebkitTextStroke: '3px black',
              }}
            >
              {effect.word}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Power-ups */}
      <AnimatePresence>
        {powerups.map(powerup => (
          <motion.div
            key={powerup.id}
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 1.5, opacity: 0 }}
            transition={{ type: 'spring' }}
            onClick={(e) => collectPowerup(powerup, e)}
            className="absolute cursor-none"
            style={{ left: powerup.x, top: powerup.y }}
          >
            <motion.div
              animate={{ y: [0, -8, 0], rotate: [0, 10, -10, 0] }}
              transition={{ repeat: Infinity, duration: 1 }}
              className="w-14 h-14 rounded-full flex items-center justify-center text-3xl border-4 border-black"
              style={{
                background: `radial-gradient(circle, ${powerup.data.color}, ${powerup.data.color}88)`,
                boxShadow: `0 0 20px ${powerup.data.color}88, 4px 4px 0 #000`,
              }}
            >
              {powerup.data.emoji}
            </motion.div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Nightmares */}
      <AnimatePresence>
        {nightmares.map(nightmare => (
          <motion.div
            key={nightmare.id}
            initial={{ scale: 0, rotate: -180 }}
            animate={{ 
              scale: nightmare.scale, 
              rotate: Math.sin(nightmare.wobble * 0.05) * (nightmare.isBoss ? 5 : 8)
            }}
            exit={{ scale: 1.5, opacity: 0, rotate: 360 }}
            transition={{ type: 'tween', duration: 0.2 }}
            onClick={(e) => smash(nightmare, e)}
            className="absolute cursor-none"
            style={{ left: nightmare.x, top: nightmare.y }}
          >
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 0.3, repeat: Infinity }}
              className="relative group"
            >
              {/* Boss glow */}
              {nightmare.isBoss && (
                <motion.div
                  className="absolute -inset-4 rounded-2xl"
                  animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
                  transition={{ repeat: Infinity, duration: 0.5 }}
                  style={{ 
                    background: `radial-gradient(circle, ${nightmare.data.color}66 0%, transparent 70%)`,
                    boxShadow: `0 0 40px ${nightmare.data.color}88`,
                  }}
                />
              )}
              
              {/* Card shadow */}
              <div className={`absolute inset-0 bg-black rounded-xl translate-x-2 translate-y-2 ${nightmare.isBoss ? 'translate-x-3 translate-y-3' : ''}`} />
              
              {/* Main card */}
              <div
                className={`relative px-5 py-3 rounded-xl border-4 border-black font-bold text-white transition-transform group-hover:scale-110 group-active:scale-90 ${nightmare.isBoss ? 'px-6 py-4' : ''}`}
                style={{
                  backgroundColor: nightmare.data.color,
                  boxShadow: `inset 0 -4px 0 rgba(0,0,0,0.3), inset 0 4px 0 rgba(255,255,255,0.2)`,
                }}
              >
                {/* Shine */}
                <div className="absolute top-1 left-2 right-2 h-2 bg-white/20 rounded-full" />
                
                {/* Boss HP indicator */}
                {nightmare.isBoss && nightmare.hp && (
                  <div className="flex gap-1 mb-1 justify-center">
                    {[...Array(nightmare.hp)].map((_, i) => (
                      <span key={i} className="text-xs">❤️</span>
                    ))}
                  </div>
                )}
                
                <span 
                  className={nightmare.isBoss ? 'text-lg' : ''}
                  style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.3)' }}
                >
                  {nightmare.data.text}
                </span>
                
                {/* Tier indicator */}
                {nightmare.data.tier === 'epic' && (
                  <motion.span
                    className="absolute -top-2 -right-2 text-xl"
                    animate={{ rotate: [0, 20, -20, 0], scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 0.5 }}
                  >
                    ⭐
                  </motion.span>
                )}
              </div>
            </motion.div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* HUD */}
      {gameState === 'playing' && (
        <div className="absolute top-4 left-4 right-20 flex items-center gap-4 flex-wrap">
          {/* Score */}
          <motion.div
            key={score}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            className="px-6 py-2 bg-yellow-400 rounded-full border-4 border-black font-black text-2xl text-black"
            style={{ boxShadow: '4px 4px 0 #000' }}
          >
            ★ {score}
          </motion.div>

          {/* Combo */}
          {combo > 2 && (
            <motion.div
              key={combo}
              initial={{ scale: 1.5, rotate: -10 }}
              animate={{ scale: 1, rotate: [5, -5, 5] }}
              transition={{ rotate: { repeat: Infinity, duration: 0.3 } }}
              className="px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full border-4 border-black font-black text-xl text-white"
              style={{ boxShadow: '4px 4px 0 #000' }}
            >
              {combo}x COMBO!
            </motion.div>
          )}

          {/* Active effects */}
          {doublePoints && (
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 0.3 }}
              className="px-3 py-1 bg-green-500 rounded-full border-2 border-black text-white font-bold text-sm"
            >
              💾 2X POINTS
            </motion.div>
          )}
          {slowMo && (
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 0.5 }}
              className="px-3 py-1 bg-cyan-500 rounded-full border-2 border-black text-white font-bold text-sm"
            >
              📶 SLOW-MO
            </motion.div>
          )}
          {timeFrozen && (
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 0.3 }}
              className="px-3 py-1 bg-blue-600 rounded-full border-2 border-black text-white font-bold text-sm"
            >
              ☕ TIME FROZEN!
            </motion.div>
          )}

          {/* Lives */}
          <div className="flex gap-1 ml-auto mr-4">
            {[...Array(lives)].map((_, i) => (
              <motion.span
                key={i}
                className="text-2xl"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
              >
                ❤️
              </motion.span>
            ))}
          </div>

          {/* Timer */}
          <motion.div
            animate={timeLeft <= 10 ? { scale: [1, 1.1, 1], rotate: [0, -5, 5, 0] } : {}}
            transition={{ repeat: Infinity, duration: 0.5 }}
            className={`px-5 py-2 rounded-full border-4 border-black font-black text-2xl ${
              timeFrozen ? 'bg-blue-600 text-white' : timeLeft <= 10 ? 'bg-red-500 text-white' : 'bg-blue-400 text-black'
            }`}
            style={{ boxShadow: '4px 4px 0 #000' }}
          >
            ⏰ {timeLeft}
          </motion.div>
        </div>
      )}

      {/* Start Screen */}
      {gameState === 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ cursor: 'auto' }}>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center"
          >
            <div className="relative p-8 bg-amber-100 rounded-3xl border-8 border-black mx-4"
              style={{ boxShadow: '8px 8px 0 #000' }}>
              <div className="absolute inset-4 border-4 border-amber-800/30 rounded-2xl pointer-events-none" />

              <motion.h1
                animate={{ rotate: [-1, 1, -1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="text-5xl font-black text-amber-900 mb-2"
                style={{ textShadow: '3px 3px 0 rgba(0,0,0,0.2)' }}
              >
                PRESENTATION
              </motion.h1>
              <motion.h2
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="text-6xl font-black mb-4"
                style={{
                  color: '#d90429',
                  textShadow: '4px 4px 0 #000',
                  WebkitTextStroke: '2px black',
                }}
              >
                NIGHTMARES!
              </motion.h2>

              <p className="text-amber-800 text-lg mb-4 font-bold">
                ✨ Smash the horrors! Collect power-ups! Defeat BOSSES! ✨
              </p>

              {/* Feature preview */}
              <div className="flex flex-wrap justify-center gap-2 mb-4 max-w-md mx-auto">
                {POWERUPS.slice(0, 4).map((p, i) => (
                  <motion.span
                    key={i}
                    initial={{ rotate: -5 }}
                    animate={{ rotate: [5, -5, 5] }}
                    transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                    className="px-2 py-1 rounded-lg text-sm font-bold text-white border-2 border-black"
                    style={{ backgroundColor: p.color, boxShadow: '2px 2px 0 #000' }}
                  >
                    {p.emoji} {p.effect}
                  </motion.span>
                ))}
              </div>

              <div className="flex flex-wrap justify-center gap-2 mb-6 max-w-sm mx-auto">
                {NIGHTMARES.slice(0, 3).map((n, i) => (
                  <motion.span
                    key={i}
                    initial={{ rotate: -5 }}
                    animate={{ rotate: [5, -5, 5] }}
                    transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                    className="px-3 py-1 rounded-lg text-sm font-bold text-white border-3 border-black"
                    style={{ backgroundColor: n.color, boxShadow: '2px 2px 0 #000' }}
                  >
                    {n.text}
                  </motion.span>
                ))}
              </div>

              <motion.button
                whileHover={{ scale: 1.1, rotate: [-2, 2, -2] }}
                whileTap={{ scale: 0.9 }}
                onClick={startGame}
                className="px-10 py-4 bg-green-500 rounded-full border-4 border-black font-black text-2xl text-white"
                style={{ boxShadow: '6px 6px 0 #000' }}
              >
                🔨 SMASH 'EM!
              </motion.button>

              {highScore > 0 && (
                <p className="text-amber-700 mt-4 font-bold">
                  🏆 High Score: {highScore}
                </p>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Game Over */}
      {gameState === 'ended' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60" style={{ cursor: 'auto' }}>
          <motion.div
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            className="p-8 bg-amber-100 rounded-3xl border-8 border-black text-center max-w-md mx-4"
            style={{ boxShadow: '8px 8px 0 #000' }}
          >
            {score >= highScore && score > 0 ? (
              <motion.div
                animate={{ rotate: [-10, 10, -10], y: [0, -10, 0] }}
                transition={{ repeat: Infinity, duration: 0.5 }}
                className="text-7xl mb-4"
              >
                🏆
              </motion.div>
            ) : (
              <div className="text-6xl mb-4">{lives <= 0 ? '💀' : '⏰'}</div>
            )}

            <h2 className="text-4xl font-black text-amber-900 mb-2"
              style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.2)' }}>
              {score >= highScore && score > 0 ? 'NEW RECORD!' : lives <= 0 ? 'GAME OVER!' : "TIME'S UP!"}
            </h2>

            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
              className="text-6xl font-black text-amber-900 mb-4"
              style={{ WebkitTextStroke: '2px black' }}
            >
              {score} pts
            </motion.div>

            <div className="grid grid-cols-2 gap-3 text-amber-700 font-bold mb-6 text-sm">
              <span>💥 {destroyed} smashed</span>
              <span>🔥 {maxCombo}x combo</span>
              <span>👔 {bossesDefeated} bosses</span>
              <span>⭐ {epicNightmares} epics</span>
            </div>

            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={startGame}
              className="px-8 py-3 bg-green-500 rounded-full border-4 border-black font-black text-xl text-white"
              style={{ boxShadow: '4px 4px 0 #000' }}
            >
              AGAIN! 🔄
            </motion.button>
          </motion.div>
        </div>
      )}

      {/* Footer */}
      {gameState === 'playing' && (
        <motion.p
          animate={{ opacity: [0.3, 0.5, 0.3] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 text-amber-200/50 text-sm font-bold"
        >
          🔨 Click to smash! · Collect ☕ power-ups! · ESC to flee
        </motion.p>
      )}
    </motion.div>
  );
};

export default SlideAreaGame;
