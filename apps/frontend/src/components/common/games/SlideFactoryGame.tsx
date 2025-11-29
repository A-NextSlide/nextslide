import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';

interface SlideFactoryGameProps {
  onClose: () => void;
  slideProgress?: { current: number; total: number };
}

// Factory workers with personalities!
const WORKERS = [
  { id: 'bolt', name: 'Bolt', emoji: '⚡', color: '#FFD700', trait: 'SPEED DEMON', catchphrase: 'GOTTA GO FAST!' },
  { id: 'pixel', name: 'Pixel', emoji: '🎨', color: '#FF69B4', trait: 'DESIGN DIVA', catchphrase: 'Make it POP!' },
  { id: 'data', name: 'Data', emoji: '📊', color: '#00CED1', trait: 'CHART NERD', catchphrase: 'The numbers, Mason!' },
  { id: 'bug', name: 'Bug', emoji: '🐛', color: '#32CD32', trait: 'BUG HUNTER', catchphrase: 'Not on MY watch!' },
  { id: 'coffee', name: 'Bean', emoji: '☕', color: '#8B4513', trait: 'CAFFEINE POWERED', catchphrase: 'COFFEE BREAK!' },
];

// Hazards that fly across the factory
const HAZARDS = [
  { type: 'feedback', text: '"Make it POP more"', emoji: '💬', damage: 10, speed: 3 },
  { type: 'feedback', text: '"Actually, undo all of that"', emoji: '🔄', damage: 15, speed: 2.5 },
  { type: 'feedback', text: '"My nephew could do this"', emoji: '👶', damage: 20, speed: 2 },
  { type: 'feedback', text: '"Due YESTERDAY"', emoji: '⏰', damage: 25, speed: 4 },
  { type: 'feedback', text: '"Can we try Comic Sans?"', emoji: '🤮', damage: 30, speed: 2.5 },
  { type: 'bug', text: 'CORRUPTED FILE', emoji: '💾', damage: 15, speed: 3.5 },
  { type: 'bug', text: 'FONT NOT FOUND', emoji: '🔤', damage: 10, speed: 3 },
  { type: 'bug', text: 'WIFI DISCONNECTED', emoji: '📡', damage: 20, speed: 2 },
  { type: 'client', text: '"One tiny change..."', emoji: '📧', damage: 35, speed: 1.5 },
  { type: 'client', text: '47 NEW REVISIONS', emoji: '📝', damage: 40, speed: 1.8 },
  { type: 'boss', text: '👔 THE STAKEHOLDER', emoji: '👔', damage: 50, speed: 1.2, isBoss: true },
];

// Power-ups!
const POWERUPS = [
  { type: 'coffee', emoji: '☕', effect: 'SPEED BOOST', duration: 5000, color: '#8B4513' },
  { type: 'shield', emoji: '🛡️', effect: 'INVINCIBILITY', duration: 3000, color: '#4169E1' },
  { type: 'undo', emoji: '↩️', effect: 'UNDO DAMAGE', heal: 25, color: '#9370DB' },
  { type: 'inspiration', emoji: '💡', effect: 'DOUBLE POINTS', duration: 8000, color: '#FFD700' },
  { type: 'deadline', emoji: '📅', effect: 'TIME WARP', addTime: 10, color: '#FF6347' },
];

// Achievements for extra fun
const ACHIEVEMENTS = [
  { id: 'survivor', name: 'Survivor', desc: 'Last 30 seconds', emoji: '🏆' },
  { id: 'dodger', name: 'Matrix Mode', desc: 'Dodge 10 hazards in a row', emoji: '😎' },
  { id: 'collector', name: 'Power Hungry', desc: 'Collect 5 power-ups', emoji: '⚡' },
  { id: 'boss_slayer', name: 'Boss Slayer', desc: 'Survive a boss encounter', emoji: '👔' },
  { id: 'caffeinated', name: 'Caffeinated', desc: 'Drink 3 coffees', emoji: '☕' },
];

interface GameObject {
  id: number;
  type: 'hazard' | 'powerup' | 'slide';
  data: any;
  x: number;
  y: number;
  lane: number;
  speed: number;
}

interface Worker {
  lane: number;
  y: number;
  isJumping: boolean;
  isDucking: boolean;
  activeEffects: string[];
  currentWorker: typeof WORKERS[0];
}

const SlideFactoryGame: React.FC<SlideFactoryGameProps> = ({ onClose, slideProgress }) => {
  const [gameState, setGameState] = useState<'intro' | 'playing' | 'paused' | 'gameover'>('intro');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('slideFactoryHighScore');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [health, setHealth] = useState(100);
  const [timeLeft, setTimeLeft] = useState(60);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [objects, setObjects] = useState<GameObject[]>([]);
  const [worker, setWorker] = useState<Worker>({
    lane: 1,
    y: 0,
    isJumping: false,
    isDucking: false,
    activeEffects: [],
    currentWorker: WORKERS[0],
  });
  const [slidesCollected, setSlidesCollected] = useState(0);
  const [powerupsCollected, setPowerupsCollected] = useState(0);
  const [hazardsDodged, setHazardsDodged] = useState(0);
  const [consecutiveDodges, setConsecutiveDodges] = useState(0);
  const [achievements, setAchievements] = useState<string[]>([]);
  const [showAchievement, setShowAchievement] = useState<typeof ACHIEVEMENTS[0] | null>(null);
  const [coffeeCount, setCoffeeCount] = useState(0);
  const [bossDefeated, setBossDefeated] = useState(false);
  const [flashEffect, setFlashEffect] = useState<string | null>(null);
  const [shakeScreen, setShakeScreen] = useState(false);
  
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const objectIdRef = useRef(0);
  const lastSpawnRef = useRef(0);
  const gameLoopRef = useRef<number | null>(null);

  const LANES = 3;
  const LANE_HEIGHT = 100;
  const GAME_SPEED = 5;

  // Unlock achievement
  const unlockAchievement = useCallback((id: string) => {
    if (achievements.includes(id)) return;
    const ach = ACHIEVEMENTS.find(a => a.id === id);
    if (!ach) return;
    setAchievements(prev => [...prev, id]);
    setShowAchievement(ach);
    setScore(s => s + 500);
    setTimeout(() => setShowAchievement(null), 2000);
  }, [achievements]);

  // Check achievements
  useEffect(() => {
    if (gameState !== 'playing') return;
    if (60 - timeLeft >= 30 && !achievements.includes('survivor')) {
      unlockAchievement('survivor');
    }
    if (consecutiveDodges >= 10 && !achievements.includes('dodger')) {
      unlockAchievement('dodger');
    }
    if (powerupsCollected >= 5 && !achievements.includes('collector')) {
      unlockAchievement('collector');
    }
    if (coffeeCount >= 3 && !achievements.includes('caffeinated')) {
      unlockAchievement('caffeinated');
    }
    if (bossDefeated && !achievements.includes('boss_slayer')) {
      unlockAchievement('boss_slayer');
    }
  }, [timeLeft, consecutiveDodges, powerupsCollected, coffeeCount, bossDefeated, gameState, achievements, unlockAchievement]);

  // Game timer
  useEffect(() => {
    if (gameState !== 'playing') return;
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          setGameState('gameover');
          if (score > highScore) {
            setHighScore(score);
            localStorage.setItem('slideFactoryHighScore', score.toString());
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [gameState, score, highScore]);

  // Health check
  useEffect(() => {
    if (health <= 0 && gameState === 'playing') {
      setGameState('gameover');
      if (score > highScore) {
        setHighScore(score);
        localStorage.setItem('slideFactoryHighScore', score.toString());
      }
    }
  }, [health, gameState, score, highScore]);

  // Spawn objects
  useEffect(() => {
    if (gameState !== 'playing') return;
    
    const spawn = () => {
      const now = Date.now();
      if (now - lastSpawnRef.current < 800) return;
      lastSpawnRef.current = now;

      const roll = Math.random();
      let obj: GameObject;

      if (roll < 0.15) {
        // Power-up
        const powerup = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
        obj = {
          id: objectIdRef.current++,
          type: 'powerup',
          data: powerup,
          x: 900,
          y: 0,
          lane: Math.floor(Math.random() * LANES),
          speed: 3,
        };
      } else if (roll < 0.35) {
        // Slide to collect
        obj = {
          id: objectIdRef.current++,
          type: 'slide',
          data: { points: 50 + Math.floor(Math.random() * 50) },
          x: 900,
          y: 0,
          lane: Math.floor(Math.random() * LANES),
          speed: 4,
        };
      } else {
        // Hazard
        const isBossTime = Math.random() < 0.05 && timeLeft < 45;
        const hazardPool = isBossTime 
          ? HAZARDS.filter(h => h.isBoss)
          : HAZARDS.filter(h => !h.isBoss);
        const hazard = hazardPool[Math.floor(Math.random() * hazardPool.length)];
        obj = {
          id: objectIdRef.current++,
          type: 'hazard',
          data: hazard,
          x: 900,
          y: 0,
          lane: Math.floor(Math.random() * LANES),
          speed: hazard.speed,
        };
      }

      setObjects(prev => [...prev, obj]);
    };

    const interval = setInterval(spawn, 600);
    return () => clearInterval(interval);
  }, [gameState, timeLeft]);

  // Move objects & collision detection
  useEffect(() => {
    if (gameState !== 'playing') return;

    const gameLoop = () => {
      setObjects(prev => {
        const newObjects: GameObject[] = [];
        const toRemove: number[] = [];
        
        for (const obj of prev) {
          const newX = obj.x - obj.speed * GAME_SPEED;
          
          // Off screen
          if (newX < -100) {
            if (obj.type === 'hazard') {
              // Dodged!
              setHazardsDodged(d => d + 1);
              setConsecutiveDodges(c => c + 1);
              setScore(s => s + 10);
              setCombo(c => {
                const newCombo = c + 1;
                if (newCombo > maxCombo) setMaxCombo(newCombo);
                return newCombo;
              });
            }
            continue;
          }
          
          // Collision check (simple lane-based)
          const isInWorkerZone = newX < 150 && newX > 50;
          const sameOrNearLane = obj.lane === worker.lane || 
            (worker.isJumping && Math.abs(obj.lane - worker.lane) <= 1);
          
          if (isInWorkerZone && obj.lane === worker.lane && !worker.isJumping) {
            if (obj.type === 'hazard') {
              // Hit!
              const hasShield = worker.activeEffects.includes('shield');
              if (!hasShield) {
                const damage = obj.data.damage;
                setHealth(h => Math.max(0, h - damage));
                setCombo(0);
                setConsecutiveDodges(0);
                setShakeScreen(true);
                setFlashEffect('#FF0000');
                setTimeout(() => { setShakeScreen(false); setFlashEffect(null); }, 200);
                if (obj.data.isBoss) {
                  // Boss hit is devastating but you survive
                  setBossDefeated(true);
                }
              }
              continue;
            } else if (obj.type === 'powerup') {
              // Collect power-up
              setPowerupsCollected(p => p + 1);
              const effect = obj.data;
              setFlashEffect(effect.color);
              setTimeout(() => setFlashEffect(null), 300);
              
              if (effect.type === 'coffee') {
                setCoffeeCount(c => c + 1);
              }
              
              if (effect.heal) {
                setHealth(h => Math.min(100, h + effect.heal));
              }
              if (effect.addTime) {
                setTimeLeft(t => t + effect.addTime);
              }
              if (effect.duration) {
                setWorker(w => ({
                  ...w,
                  activeEffects: [...w.activeEffects, effect.type]
                }));
                setTimeout(() => {
                  setWorker(w => ({
                    ...w,
                    activeEffects: w.activeEffects.filter(e => e !== effect.type)
                  }));
                }, effect.duration);
              }
              
              setScore(s => s + 100);
              continue;
            } else if (obj.type === 'slide') {
              // Collect slide
              setSlidesCollected(s => s + 1);
              const points = worker.activeEffects.includes('inspiration') 
                ? obj.data.points * 2 
                : obj.data.points;
              setScore(s => s + points);
              setFlashEffect('#00FF00');
              setTimeout(() => setFlashEffect(null), 150);
              continue;
            }
          }
          
          newObjects.push({ ...obj, x: newX });
        }
        
        return newObjects;
      });
      
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    };
    
    gameLoopRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [gameState, worker.lane, worker.isJumping, worker.activeEffects, maxCombo]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      
      if (gameState !== 'playing') {
        if (e.key === ' ' || e.key === 'Enter') {
          startGame();
        }
        return;
      }
      
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        setWorker(w => ({ ...w, lane: Math.max(0, w.lane - 1) }));
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        setWorker(w => ({ ...w, lane: Math.min(LANES - 1, w.lane + 1) }));
      } else if (e.key === ' ') {
        // Jump
        if (!worker.isJumping) {
          setWorker(w => ({ ...w, isJumping: true }));
          setTimeout(() => setWorker(w => ({ ...w, isJumping: false })), 500);
        }
      } else if (e.key === 'Shift') {
        // Duck
        setWorker(w => ({ ...w, isDucking: true }));
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setWorker(w => ({ ...w, isDucking: false }));
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState, worker.isJumping, onClose]);

  const startGame = () => {
    setGameState('playing');
    setScore(0);
    setHealth(100);
    setTimeLeft(60);
    setCombo(0);
    setMaxCombo(0);
    setObjects([]);
    setSlidesCollected(0);
    setPowerupsCollected(0);
    setHazardsDodged(0);
    setConsecutiveDodges(0);
    setCoffeeCount(0);
    setBossDefeated(false);
    setAchievements([]);
    setWorker({
      lane: 1,
      y: 0,
      isJumping: false,
      isDucking: false,
      activeEffects: [],
      currentWorker: WORKERS[Math.floor(Math.random() * WORKERS.length)],
    });
    objectIdRef.current = 0;
    lastSpawnRef.current = 0;
  };

  const currentWorker = worker.currentWorker;
  const hasShield = worker.activeEffects.includes('shield');
  const hasSpeed = worker.activeEffects.includes('coffee');
  const hasDouble = worker.activeEffects.includes('inspiration');

  return (
    <motion.div
      ref={gameAreaRef}
      animate={shakeScreen ? { x: [-5, 5, -5, 5, 0] } : {}}
      transition={{ duration: 0.2 }}
      className="absolute inset-0 overflow-hidden select-none"
      style={{
        background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        fontFamily: '"Comic Sans MS", "Chalkboard", "Marker Felt", cursive',
      }}
    >
      {/* Flash effect overlay */}
      <AnimatePresence>
        {flashEffect && (
          <motion.div
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-50 pointer-events-none"
            style={{ background: flashEffect }}
          />
        )}
      </AnimatePresence>

      {/* Animated background - conveyor belt effect */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute h-px bg-cyan-500/20"
            style={{ 
              left: 0, 
              right: 0, 
              top: `${(i + 1) * 5}%`,
            }}
            animate={{ x: [-100, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          />
        ))}
      </div>

      {/* Factory pipes decoration */}
      <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-gray-800 to-transparent flex items-center px-4 gap-2">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="h-8 w-8 rounded-full bg-gray-700 border-4 border-gray-600 flex items-center justify-center">
            <motion.div
              className="h-2 w-2 rounded-full bg-green-400"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.1 }}
            />
          </div>
        ))}
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-50 w-12 h-12 rounded-full bg-red-500 hover:bg-red-400 transition-all hover:scale-110 flex items-center justify-center border-4 border-white/30 shadow-lg"
        style={{ fontFamily: 'system-ui' }}
      >
        <span className="text-white text-2xl font-bold">×</span>
      </button>

      {/* Achievement popup */}
      <AnimatePresence>
        {showAchievement && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="absolute top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-xl border-4 border-white/50 shadow-2xl"
          >
            <div className="flex items-center gap-3">
              <span className="text-4xl">{showAchievement.emoji}</span>
              <div>
                <div className="text-white font-black text-lg">{showAchievement.name}</div>
                <div className="text-white/80 text-sm">{showAchievement.desc}</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game HUD */}
      {gameState === 'playing' && (
        <div className="absolute top-20 left-4 right-16 flex items-center justify-between z-40 px-4">
          {/* Score & Combo */}
          <div className="flex items-center gap-4">
            <motion.div
              key={score}
              initial={{ scale: 1.2 }}
              animate={{ scale: 1 }}
              className="px-5 py-2 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-xl border-4 border-white/30 shadow-lg"
            >
              <span className="text-white font-black text-xl">⭐ {score}</span>
            </motion.div>
            
            {combo > 2 && (
              <motion.div
                key={combo}
                initial={{ scale: 1.5, rotate: -10 }}
                animate={{ scale: 1, rotate: [5, -5, 5] }}
                transition={{ rotate: { repeat: Infinity, duration: 0.3 } }}
                className="px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-500 rounded-xl border-4 border-white/30 shadow-lg"
              >
                <span className="text-white font-black text-lg">{combo}x COMBO!</span>
              </motion.div>
            )}
          </div>

          {/* Health Bar */}
          <div className="flex-1 max-w-xs mx-4">
            <div className="relative h-8 bg-gray-800 rounded-full border-4 border-gray-700 overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  background: health > 50 ? 'linear-gradient(90deg, #22c55e, #4ade80)' 
                    : health > 25 ? 'linear-gradient(90deg, #eab308, #facc15)'
                    : 'linear-gradient(90deg, #ef4444, #f87171)',
                  width: `${health}%`,
                }}
                animate={{ width: `${health}%` }}
                transition={{ duration: 0.3 }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-white font-bold text-sm drop-shadow-lg">❤️ {health}%</span>
              </div>
            </div>
          </div>

          {/* Timer */}
          <motion.div
            animate={timeLeft <= 10 ? { scale: [1, 1.1, 1] } : {}}
            transition={{ repeat: Infinity, duration: 0.5 }}
            className={`px-5 py-2 rounded-xl border-4 border-white/30 shadow-lg ${
              timeLeft <= 10 ? 'bg-red-500' : 'bg-blue-500'
            }`}
          >
            <span className="text-white font-black text-xl">⏰ {timeLeft}s</span>
          </motion.div>
        </div>
      )}

      {/* Active effects indicators */}
      {gameState === 'playing' && worker.activeEffects.length > 0 && (
        <div className="absolute top-32 left-4 z-40 flex gap-2">
          {worker.activeEffects.map(effect => {
            const powerup = POWERUPS.find(p => p.type === effect);
            return powerup ? (
              <motion.div
                key={effect}
                initial={{ scale: 0 }}
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 0.5 }}
                className="px-3 py-1 rounded-full border-2 border-white/50 shadow-lg text-sm"
                style={{ background: powerup.color }}
              >
                <span className="text-white font-bold">{powerup.emoji} {powerup.effect}</span>
              </motion.div>
            ) : null;
          })}
        </div>
      )}

      {/* Game lanes */}
      {gameState === 'playing' && (
        <div className="absolute bottom-24 left-0 right-0 h-[300px]">
          {/* Lane backgrounds */}
          {[0, 1, 2].map(lane => (
            <div
              key={lane}
              className="absolute left-0 right-0 border-y border-cyan-500/20"
              style={{
                top: `${lane * LANE_HEIGHT}px`,
                height: `${LANE_HEIGHT}px`,
                background: lane === worker.lane 
                  ? 'linear-gradient(90deg, rgba(255,67,1,0.2), transparent 50%)'
                  : 'transparent',
              }}
            >
              {/* Conveyor belt lines */}
              <motion.div
                className="absolute inset-0"
                style={{
                  backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(255,255,255,0.05) 40px, rgba(255,255,255,0.05) 80px)',
                }}
                animate={{ x: [-80, 0] }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
            </div>
          ))}

          {/* Worker character */}
          <motion.div
            className="absolute left-24 z-30"
            animate={{
              top: worker.lane * LANE_HEIGHT + (worker.isJumping ? -30 : 0) + 10,
              scale: worker.isDucking ? 0.7 : 1,
            }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            style={{ width: '80px', height: '80px' }}
          >
            {/* Shield effect */}
            {hasShield && (
              <motion.div
                className="absolute -inset-4 rounded-full border-4 border-cyan-400"
                animate={{ rotate: 360, scale: [1, 1.1, 1] }}
                transition={{ rotate: { repeat: Infinity, duration: 2 }, scale: { repeat: Infinity, duration: 0.5 } }}
                style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.3) 0%, transparent 70%)' }}
              />
            )}
            
            {/* Speed effect */}
            {hasSpeed && (
              <>
                <motion.div
                  className="absolute left-0 top-1/2 -translate-y-1/2 text-2xl"
                  animate={{ x: [-20, -40], opacity: [1, 0] }}
                  transition={{ repeat: Infinity, duration: 0.3 }}
                >
                  💨
                </motion.div>
              </>
            )}
            
            {/* Worker body */}
            <motion.div
              className="relative w-full h-full rounded-2xl flex items-center justify-center text-5xl shadow-2xl border-4"
              animate={{ 
                rotate: worker.isJumping ? [0, -10, 10, 0] : 0,
                y: [0, -3, 0],
              }}
              transition={{ 
                y: { repeat: Infinity, duration: 0.5 },
                rotate: { duration: 0.3 }
              }}
              style={{
                background: `linear-gradient(135deg, ${currentWorker.color}, ${currentWorker.color}88)`,
                borderColor: 'rgba(255,255,255,0.4)',
                boxShadow: `0 0 30px ${currentWorker.color}66`,
              }}
            >
              {currentWorker.emoji}
              
              {/* Double points indicator */}
              {hasDouble && (
                <motion.div
                  className="absolute -top-2 -right-2 text-xl"
                  animate={{ rotate: [0, 20, -20, 0] }}
                  transition={{ repeat: Infinity, duration: 0.5 }}
                >
                  ✨
                </motion.div>
              )}
            </motion.div>
          </motion.div>

          {/* Game objects */}
          <AnimatePresence>
            {objects.map(obj => (
              <motion.div
                key={obj.id}
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, rotate: 180 }}
                className="absolute z-20"
                style={{
                  left: obj.x,
                  top: obj.lane * LANE_HEIGHT + 10,
                  width: '80px',
                  height: '80px',
                }}
              >
                {obj.type === 'hazard' && (
                  <motion.div
                    className="w-full h-full rounded-xl border-4 flex flex-col items-center justify-center p-1 text-center"
                    animate={{ 
                      y: [0, -5, 0],
                      rotate: obj.data.isBoss ? [0, -5, 5, 0] : 0,
                    }}
                    transition={{ repeat: Infinity, duration: 0.5 }}
                    style={{
                      background: obj.data.isBoss 
                        ? 'linear-gradient(135deg, #4a0080, #8b0000)'
                        : 'linear-gradient(135deg, #dc2626, #7f1d1d)',
                      borderColor: 'rgba(255,255,255,0.3)',
                      boxShadow: obj.data.isBoss
                        ? '0 0 40px rgba(139,0,0,0.8)'
                        : '0 0 20px rgba(220,38,38,0.5)',
                    }}
                  >
                    <span className="text-2xl">{obj.data.emoji}</span>
                    <span className="text-[8px] text-white font-bold leading-tight">
                      {obj.data.text.slice(0, 15)}
                    </span>
                  </motion.div>
                )}
                
                {obj.type === 'powerup' && (
                  <motion.div
                    className="w-full h-full rounded-full flex items-center justify-center text-4xl border-4"
                    animate={{ 
                      y: [0, -10, 0],
                      rotate: [0, 10, -10, 0],
                      scale: [1, 1.1, 1],
                    }}
                    transition={{ repeat: Infinity, duration: 1 }}
                    style={{
                      background: `radial-gradient(circle, ${obj.data.color}, ${obj.data.color}88)`,
                      borderColor: 'rgba(255,255,255,0.5)',
                      boxShadow: `0 0 30px ${obj.data.color}88`,
                    }}
                  >
                    {obj.data.emoji}
                  </motion.div>
                )}
                
                {obj.type === 'slide' && (
                  <motion.div
                    className="w-full h-full rounded-lg flex items-center justify-center text-4xl border-4 bg-gradient-to-br from-green-400 to-emerald-600"
                    animate={{ 
                      y: [0, -5, 0],
                      rotate: [0, 5, -5, 0],
                    }}
                    transition={{ repeat: Infinity, duration: 0.7 }}
                    style={{
                      borderColor: 'rgba(255,255,255,0.4)',
                      boxShadow: '0 0 20px rgba(34,197,94,0.5)',
                    }}
                  >
                    📄
                  </motion.div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Controls hint */}
      {gameState === 'playing' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center">
          <div className="px-4 py-2 bg-black/40 rounded-lg backdrop-blur-sm">
            <span className="text-white/70 text-sm">
              ⬆️⬇️ Change lanes · SPACE Jump · ESC Exit
            </span>
          </div>
        </div>
      )}

      {/* Intro Screen */}
      {gameState === 'intro' && (
        <div className="absolute inset-0 flex items-center justify-center z-40">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative max-w-lg mx-4"
          >
            {/* Decorative gears */}
            <motion.div
              className="absolute -top-16 -left-16 text-8xl opacity-20"
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
            >
              ⚙️
            </motion.div>
            <motion.div
              className="absolute -bottom-12 -right-12 text-6xl opacity-20"
              animate={{ rotate: -360 }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
            >
              ⚙️
            </motion.div>

            <div className="relative p-8 bg-gradient-to-br from-indigo-900 to-purple-900 rounded-3xl border-4 border-cyan-400/50 shadow-2xl">
              {/* Neon glow effect */}
              <div className="absolute inset-0 rounded-3xl" 
                style={{ boxShadow: '0 0 60px rgba(34,211,238,0.3), inset 0 0 60px rgba(34,211,238,0.1)' }} 
              />
              
              <motion.h1
                animate={{ y: [0, -5, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="text-5xl font-black text-center mb-2 bg-gradient-to-r from-yellow-300 via-orange-400 to-red-500 bg-clip-text text-transparent"
                style={{ textShadow: '0 0 30px rgba(255,165,0,0.5)' }}
              >
                🏭 THE SLIDE FACTORY 🏭
              </motion.h1>
              
              <motion.p
                className="text-center text-cyan-300 text-lg mb-6"
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                Keep the factory running! Dodge feedback, collect slides!
              </motion.p>

              {/* Worker showcase */}
              <div className="flex justify-center gap-4 mb-6">
                {WORKERS.slice(0, 3).map((w, i) => (
                  <motion.div
                    key={w.id}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.2 }}
                    className="text-center"
                  >
                    <motion.div
                      className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl border-2 mb-1"
                      animate={{ y: [0, -5, 0], rotate: [0, 5, -5, 0] }}
                      transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.3 }}
                      style={{ 
                        background: `linear-gradient(135deg, ${w.color}, ${w.color}88)`,
                        borderColor: 'rgba(255,255,255,0.3)',
                      }}
                    >
                      {w.emoji}
                    </motion.div>
                    <div className="text-xs text-cyan-300">{w.name}</div>
                  </motion.div>
                ))}
              </div>

              {/* Instructions */}
              <div className="grid grid-cols-2 gap-3 mb-6 text-sm">
                <div className="flex items-center gap-2 text-green-400">
                  <span className="text-xl">📄</span>
                  <span>Collect slides for points</span>
                </div>
                <div className="flex items-center gap-2 text-red-400">
                  <span className="text-xl">💬</span>
                  <span>Avoid bad feedback</span>
                </div>
                <div className="flex items-center gap-2 text-yellow-400">
                  <span className="text-xl">☕</span>
                  <span>Grab power-ups</span>
                </div>
                <div className="flex items-center gap-2 text-purple-400">
                  <span className="text-xl">👔</span>
                  <span>Watch for the BOSS!</span>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={startGame}
                className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl font-black text-white text-2xl border-4 border-white/30 shadow-lg"
                style={{ boxShadow: '0 0 30px rgba(34,197,94,0.5)' }}
              >
                🚀 START SHIFT 🚀
              </motion.button>

              {highScore > 0 && (
                <motion.p
                  className="text-center text-yellow-400 mt-4 font-bold"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                >
                  🏆 Factory Record: {highScore} points
                </motion.p>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState === 'gameover' && (
        <div className="absolute inset-0 flex items-center justify-center z-40 bg-black/60">
          <motion.div
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            className="relative max-w-md mx-4 p-8 bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl border-4 shadow-2xl"
            style={{ borderColor: score >= highScore && score > 0 ? '#FFD700' : '#64748b' }}
          >
            {score >= highScore && score > 0 ? (
              <>
                <motion.div
                  className="absolute -top-8 left-1/2 -translate-x-1/2 text-6xl"
                  animate={{ y: [0, -10, 0], rotate: [-10, 10, -10] }}
                  transition={{ repeat: Infinity, duration: 0.5 }}
                >
                  🏆
                </motion.div>
                <h2 className="text-4xl font-black text-center mb-2 bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
                  NEW RECORD!
                </h2>
              </>
            ) : (
              <>
                <div className="text-6xl text-center mb-2">⏰</div>
                <h2 className="text-3xl font-black text-center text-white mb-2">
                  {health <= 0 ? 'FACTORY SHUTDOWN!' : 'SHIFT COMPLETE!'}
                </h2>
              </>
            )}

            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
              className="text-5xl font-black text-center text-yellow-400 mb-4"
            >
              {score} pts
            </motion.div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6 text-center">
              <div className="p-2 bg-slate-700/50 rounded-lg">
                <div className="text-2xl">📄</div>
                <div className="text-white font-bold">{slidesCollected}</div>
                <div className="text-xs text-slate-400">Slides</div>
              </div>
              <div className="p-2 bg-slate-700/50 rounded-lg">
                <div className="text-2xl">🔥</div>
                <div className="text-white font-bold">{maxCombo}x</div>
                <div className="text-xs text-slate-400">Max Combo</div>
              </div>
              <div className="p-2 bg-slate-700/50 rounded-lg">
                <div className="text-2xl">💨</div>
                <div className="text-white font-bold">{hazardsDodged}</div>
                <div className="text-xs text-slate-400">Dodged</div>
              </div>
            </div>

            {/* Achievements earned */}
            {achievements.length > 0 && (
              <div className="mb-4">
                <div className="text-sm text-slate-400 mb-2 text-center">Achievements Earned:</div>
                <div className="flex justify-center gap-2">
                  {achievements.map(id => {
                    const ach = ACHIEVEMENTS.find(a => a.id === id);
                    return ach ? (
                      <div key={id} className="text-2xl" title={ach.name}>
                        {ach.emoji}
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            )}

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={startGame}
              className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl font-black text-white text-xl border-2 border-white/30 shadow-lg mb-2"
            >
              🔄 ANOTHER SHIFT!
            </motion.button>
            
            <button
              onClick={onClose}
              className="w-full py-2 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-slate-300 transition-colors"
            >
              Back to work
            </button>
          </motion.div>
        </div>
      )}

      {/* Slide progress indicator if available */}
      {slideProgress && gameState === 'playing' && (
        <div className="absolute bottom-16 right-4 z-40">
          <motion.div
            className="px-4 py-2 bg-black/60 rounded-xl backdrop-blur-sm border border-cyan-500/30"
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            <div className="text-xs text-cyan-300 mb-1">Real slides building:</div>
            <div className="text-white font-bold">
              📄 {slideProgress.current} / {slideProgress.total}
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
};

export default SlideFactoryGame;

