import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface SlideAreaGameProps {
  onClose: () => void;
}

// The REAL pain of making presentations
const NIGHTMARES = [
  { text: '"Make the logo BIGGER"', color: '#e63946', points: 15 },
  { text: 'final_v7_REAL_final.pptx', color: '#f4a261', points: 20 },
  { text: '"Actually nevermind"', color: '#2a9d8f', points: 25 },
  { text: 'Slide 47 of 89', color: '#9b5de5', points: 25 },
  { text: '"Make it POP more"', color: '#f72585', points: 15 },
  { text: '⚡ CORRUPTED FILE', color: '#d90429', points: 30 },
  { text: '"My nephew could do this"', color: '#06d6a0', points: 35 },
  { text: 'Feedback @ 11:59pm', color: '#7209b7', points: 30 },
  { text: '"Try Comic Sans?"', color: '#ff006e', points: 40 },
  { text: 'FONT NOT FOUND', color: '#fb5607', points: 20 },
  { text: '"Add more transitions"', color: '#3a86ff', points: 15 },
  { text: '🔌 Projector: NO SIGNAL', color: '#495057', points: 25 },
  { text: '"Looks different on my Mac"', color: '#8338ec', points: 20 },
  { text: 'Ctrl+Z LIMIT REACHED', color: '#d00000', points: 35 },
  { text: '"Just one tiny change..."', color: '#ffbe0b', points: 25 },
  { text: 'WiFi: Connected (No Internet)', color: '#6c757d', points: 20 },
  { text: '"Due yesterday"', color: '#e5383b', points: 30 },
  { text: '"Can you jazz it up?"', color: '#00b4d8', points: 15 },
];

const SMASH_WORDS = ['BONK!', 'POW!', 'WHAM!', 'SPLAT!', 'KAPOW!', 'SMASH!', 'BOOM!', 'ZAP!'];

interface Nightmare {
  id: number;
  data: typeof NIGHTMARES[0];
  x: number;
  y: number;
  vx: number;
  vy: number;
  scale: number;
  wobble: number;
}

interface SmashEffect {
  id: number;
  x: number;
  y: number;
  word: string;
  rotation: number;
}

const SlideAreaGame: React.FC<SlideAreaGameProps> = ({ onClose }) => {
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('nightmareHighScore2');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [nightmares, setNightmares] = useState<Nightmare[]>([]);
  const [smashEffects, setSmashEffects] = useState<SmashEffect[]>([]);
  const [timeLeft, setTimeLeft] = useState(45);
  const [gameState, setGameState] = useState<'ready' | 'playing' | 'ended'>('ready');
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [destroyed, setDestroyed] = useState(0);
  const [shake, setShake] = useState(false);
  const [hammerSmash, setHammerSmash] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const nightmareIdRef = useRef(0);
  const effectIdRef = useRef(0);
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
    if (gameState !== 'playing') return;

    const spawn = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const data = NIGHTMARES[Math.floor(Math.random() * NIGHTMARES.length)];

      const side = Math.floor(Math.random() * 4);
      let x, y, vx, vy;

      if (side === 0) {
        x = Math.random() * rect.width; y = -60;
        vx = (Math.random() - 0.5) * 3; vy = 1.5 + Math.random() * 2;
      } else if (side === 1) {
        x = rect.width + 60; y = Math.random() * rect.height;
        vx = -(1.5 + Math.random() * 2); vy = (Math.random() - 0.5) * 3;
      } else if (side === 2) {
        x = Math.random() * rect.width; y = rect.height + 60;
        vx = (Math.random() - 0.5) * 3; vy = -(1.5 + Math.random() * 2);
      } else {
        x = -180; y = Math.random() * rect.height;
        vx = 1.5 + Math.random() * 2; vy = (Math.random() - 0.5) * 3;
      }

      setNightmares(prev => [...prev, {
        id: nightmareIdRef.current++,
        data, x, y, vx, vy,
        scale: 0.9 + Math.random() * 0.3,
        wobble: Math.random() * 360,
      }]);
    };

    const interval = setInterval(spawn, 700);
    return () => clearInterval(interval);
  }, [gameState]);

  // Move nightmares
  useEffect(() => {
    if (gameState !== 'playing') return;

    const move = setInterval(() => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      setNightmares(prev => prev
        .map(n => ({ ...n, x: n.x + n.vx * 2.5, y: n.y + n.vy * 2.5, wobble: n.wobble + 8 }))
        .filter(n => {
          const isOut = n.x < -250 || n.x > rect.width + 250 || n.y < -150 || n.y > rect.height + 150;
          if (isOut) setCombo(0);
          return !isOut;
        })
      );
    }, 16);

    return () => clearInterval(move);
  }, [gameState]);

  // Timer
  useEffect(() => {
    if (gameState !== 'playing') return;
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          setGameState('ended');
          if (score > highScore) {
            setHighScore(score);
            localStorage.setItem('nightmareHighScore2', score.toString());
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [gameState, score, highScore]);

  // Cleanup effects
  useEffect(() => {
    if (smashEffects.length === 0) return;
    const timeout = setTimeout(() => setSmashEffects([]), 400);
    return () => clearTimeout(timeout);
  }, [smashEffects]);

  const smash = useCallback((nightmare: Nightmare, e: React.MouseEvent) => {
    e.stopPropagation();

    setShake(true);
    setHammerSmash(true);
    setTimeout(() => { setShake(false); setHammerSmash(false); }, 150);

    const comboMultiplier = 1 + combo * 0.3;
    const points = Math.floor(nightmare.data.points * comboMultiplier);

    setSmashEffects(prev => [...prev, {
      id: effectIdRef.current++,
      x: nightmare.x,
      y: nightmare.y,
      word: SMASH_WORDS[Math.floor(Math.random() * SMASH_WORDS.length)],
      rotation: (Math.random() - 0.5) * 40,
    }]);

    setScore(s => s + points);
    setCombo(c => { const nc = c + 1; if (nc > maxCombo) setMaxCombo(nc); return nc; });
    setDestroyed(d => d + 1);
    setNightmares(prev => prev.filter(n => n.id !== nightmare.id));
  }, [combo, maxCombo]);

  const startGame = () => {
    setScore(0); setTimeLeft(45); setNightmares([]); setSmashEffects([]);
    setCombo(0); setMaxCombo(0); setDestroyed(0); setGameState('playing');
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
        background: '#2b2118',
        cursor: 'none',
        fontFamily: '"Comic Sans MS", "Chalkboard", cursive',
      }}
    >
      {/* Vintage paper texture */}
      <div className="absolute inset-0" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%' height='100%' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        opacity: 0.08,
      }} />

      {/* Spotlight effect */}
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse at center, rgba(255,220,180,0.15) 0%, transparent 60%)',
      }} />

      {/* Film scratches overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-10" style={{
        backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 100px, rgba(0,0,0,0.1) 100px, rgba(0,0,0,0.1) 101px)',
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
            </div>
            {/* Hammer handle */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 w-4 h-12 bg-gradient-to-b from-yellow-700 to-yellow-900 rounded-b-lg border-4 border-black border-t-0"
              style={{ boxShadow: '2px 2px 0 #000' }} />
          </div>
        </motion.div>
      )}

      {/* Close button - cartoon style */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-50 w-12 h-12 rounded-full bg-red-500 hover:bg-red-400 transition-all hover:scale-110 flex items-center justify-center border-4 border-black"
        style={{ boxShadow: '4px 4px 0 #000', cursor: 'pointer' }}
      >
        <X className="w-6 h-6 text-white" strokeWidth={4} />
      </button>

      {/* SMASH effects - cartoon style */}
      <AnimatePresence>
        {smashEffects.map(effect => (
          <motion.div
            key={effect.id}
            initial={{ scale: 0, opacity: 1 }}
            animate={{ scale: [0, 1.5, 1.2], opacity: [1, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed z-50 pointer-events-none"
            style={{ left: effect.x, top: effect.y, transform: 'translate(-50%, -50%)' }}
          >
            {/* Starburst background */}
            <div className="absolute inset-0 -m-8" style={{
              background: 'radial-gradient(circle, #ffeb3b 0%, #ff9800 40%, transparent 70%)',
              transform: `rotate(${effect.rotation}deg)`,
            }} />
            {/* Comic text */}
            <span
              className="relative text-4xl font-black text-white"
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

      {/* Nightmares - cartoon cards */}
      <AnimatePresence>
        {nightmares.map(nightmare => (
          <motion.div
            key={nightmare.id}
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: nightmare.scale, rotate: Math.sin(nightmare.wobble * 0.05) * 8 }}
            exit={{ scale: 1.5, opacity: 0, rotate: 360 }}
            transition={{ type: 'tween', duration: 0.2 }}
            onClick={(e) => smash(nightmare, e)}
            className="absolute"
            style={{ left: nightmare.x, top: nightmare.y, cursor: 'none' }}
          >
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 0.3, repeat: Infinity }}
              className="relative group"
            >
              {/* Card shadow */}
              <div className="absolute inset-0 bg-black rounded-xl translate-x-2 translate-y-2" />
              {/* Main card */}
              <div
                className="relative px-5 py-3 rounded-xl border-4 border-black font-bold text-white transition-transform group-hover:scale-110 group-active:scale-90"
                style={{
                  backgroundColor: nightmare.data.color,
                  boxShadow: `inset 0 -4px 0 rgba(0,0,0,0.3), inset 0 4px 0 rgba(255,255,255,0.2)`,
                }}
              >
                {/* Shine */}
                <div className="absolute top-1 left-2 right-2 h-2 bg-white/20 rounded-full" />
                <span style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.3)' }}>
                  {nightmare.data.text}
                </span>
              </div>
            </motion.div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* HUD - Cartoon style */}
      {gameState === 'playing' && (
        <div className="absolute top-4 left-4 right-20 flex items-center gap-4">
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

          {/* Timer */}
          <motion.div
            animate={timeLeft <= 10 ? { scale: [1, 1.1, 1], rotate: [0, -5, 5, 0] } : {}}
            transition={{ repeat: Infinity, duration: 0.5 }}
            className={`ml-auto px-5 py-2 rounded-full border-4 border-black font-black text-2xl ${
              timeLeft <= 10 ? 'bg-red-500 text-white' : 'bg-blue-400 text-black'
            }`}
            style={{ boxShadow: '4px 4px 0 #000' }}
          >
            ⏰ {timeLeft}
          </motion.div>
        </div>
      )}

      {/* Start Screen - Vintage title card */}
      {gameState === 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ cursor: 'auto' }}>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center"
          >
            {/* Title card frame */}
            <div className="relative p-8 bg-amber-100 rounded-3xl border-8 border-black mx-4"
              style={{ boxShadow: '8px 8px 0 #000' }}>
              {/* Inner frame */}
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

              <p className="text-amber-800 text-lg mb-6 font-bold">
                ✨ Smash the horrors of the old days! ✨
              </p>

              <div className="flex flex-wrap justify-center gap-2 mb-6 max-w-sm mx-auto">
                {NIGHTMARES.slice(0, 4).map((n, i) => (
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

      {/* Game Over - Victory/Defeat card */}
      {gameState === 'ended' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60" style={{ cursor: 'auto' }}>
          <motion.div
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            className="p-8 bg-amber-100 rounded-3xl border-8 border-black text-center"
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
              <div className="text-6xl mb-4">⏰</div>
            )}

            <h2 className="text-4xl font-black text-amber-900 mb-2"
              style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.2)' }}>
              {score >= highScore && score > 0 ? 'NEW RECORD!' : "TIME'S UP!"}
            </h2>

            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
              className="text-6xl font-black text-amber-900 mb-4"
              style={{ WebkitTextStroke: '2px black' }}
            >
              {score} pts
            </motion.div>

            <div className="flex justify-center gap-6 text-amber-700 font-bold mb-6">
              <span>💥 {destroyed} smashed</span>
              <span>🔥 {maxCombo}x combo</span>
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
          🔨 Click to smash! · ESC to flee
        </motion.p>
      )}
    </motion.div>
  );
};

export default SlideAreaGame;
