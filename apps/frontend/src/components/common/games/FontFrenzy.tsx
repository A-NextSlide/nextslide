import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface FontFrenzyProps {
  onComplete?: (score: number) => void;
}

// The GOOD fonts - these are the heroes
const GOOD_FONTS = [
  { name: 'Helvetica', style: 'font-sans font-medium', vibe: 'Clean & Classic' },
  { name: 'Garamond', style: 'font-serif italic', vibe: 'Elegant & Timeless' },
  { name: 'Futura', style: 'font-sans font-bold tracking-wide', vibe: 'Modern & Bold' },
  { name: 'Roboto', style: 'font-sans', vibe: 'Friendly & Readable' },
  { name: 'Playfair', style: 'font-serif font-bold', vibe: 'Sophisticated' },
  { name: 'Montserrat', style: 'font-sans font-semibold tracking-tight', vibe: 'Geometric Vibes' },
  { name: 'Lato', style: 'font-sans font-light', vibe: 'Warm & Stable' },
  { name: 'Open Sans', style: 'font-sans', vibe: 'Humanist Hero' },
];

// The VILLAINS - fonts that must be stopped!
const BAD_FONTS = [
  { name: 'Comic Sans', emoji: '🤮', evilPower: 'Childhood Trauma', style: 'Comic Sans MS, cursive' },
  { name: 'Papyrus', emoji: '🏺', evilPower: 'Avatar Flashbacks', style: 'Papyrus, fantasy' },
  { name: 'Curlz MT', emoji: '🌀', evilPower: 'Eye Torture', style: 'cursive' },
  { name: 'Jokerman', emoji: '🃏', evilPower: 'Unprofessional Chaos', style: 'fantasy' },
  { name: 'Impact', emoji: '📢', evilPower: 'MEME OVERLOAD', style: 'Impact, sans-serif' },
  { name: 'Wingdings', emoji: '✈️📫', evilPower: 'Communication Breakdown', style: 'Wingdings, sans-serif' },
  { name: 'Brush Script', emoji: '🖌️', evilPower: 'Fake Fancy', style: 'Brush Script MT, cursive' },
  { name: 'Chiller', emoji: '🥶', evilPower: 'Halloween Forever', style: 'fantasy' },
];

// The BOSS - appears at the end
const FINAL_BOSS = {
  name: 'WORDART',
  emoji: '🌈',
  evilPower: 'MAXIMUM CRINGE',
  style: 'fantasy',
  hp: 5,
};

// Sarcastic commentary when you miss
const MISS_ROASTS = [
  "That Comic Sans just made it to the CEO deck! 😱",
  "Papyrus? In 2024? You monster!",
  "That font is going to haunt the quarterly report!",
  "HR is going to use that Curlz now. Happy?",
  "Someone's birthday card is ruined forever.",
  "The interns are crying.",
  "Design Twitter is SEETHING right now.",
];

// Victory quotes
const VICTORY_QUOTES = [
  "Typography triumph! 🏆",
  "The slide deck is SAFE! 📊",
  "Fonts neutralized! ✨",
  "Design standards PROTECTED! 🛡️",
];

interface FontEnemy {
  id: number;
  font: typeof BAD_FONTS[0];
  x: number;
  y: number;
  scale: number;
  rotation: number;
  lifetime: number;
  isBoss?: boolean;
  bossHp?: number;
}

interface Explosion {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
}

const FontFrenzy: React.FC<FontFrenzyProps> = ({ onComplete }) => {
  const [gameState, setGameState] = useState<'intro' | 'playing' | 'boss' | 'victory' | 'defeat'>('intro');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('fontFrenzyHighScore');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [enemies, setEnemies] = useState<FontEnemy[]>([]);
  const [explosions, setExplosions] = useState<Explosion[]>([]);
  const [timeLeft, setTimeLeft] = useState(30);
  const [fontsEscaped, setFontsEscaped] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [missMessage, setMissMessage] = useState<string | null>(null);
  const [bossHp, setBossHp] = useState(FINAL_BOSS.hp);
  const [screenShake, setScreenShake] = useState(false);
  
  const enemyIdRef = useRef(0);
  const explosionIdRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const MAX_ESCAPED = 5;

  // Start game
  const startGame = () => {
    setGameState('playing');
    setScore(0);
    setTimeLeft(30);
    setEnemies([]);
    setExplosions([]);
    setFontsEscaped(0);
    setCombo(0);
    setMaxCombo(0);
    setBossHp(FINAL_BOSS.hp);
    enemyIdRef.current = 0;
  };

  // Timer & game loop
  useEffect(() => {
    if (gameState !== 'playing' && gameState !== 'boss') return;

    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          // Time's up - go to boss battle if in playing mode
          if (gameState === 'playing') {
            setGameState('boss');
            return 15; // Boss battle time
          } else {
            // Victory!
            setGameState('victory');
            if (score > highScore) {
              setHighScore(score);
              localStorage.setItem('fontFrenzyHighScore', score.toString());
            }
            if (onComplete) onComplete(score);
            return 0;
          }
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, score, highScore, onComplete]);

  // Spawn enemies
  useEffect(() => {
    if (gameState !== 'playing') return;

    const spawn = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      
      const font = BAD_FONTS[Math.floor(Math.random() * BAD_FONTS.length)];
      const padding = 60;
      
      const enemy: FontEnemy = {
        id: enemyIdRef.current++,
        font,
        x: padding + Math.random() * (rect.width - padding * 2),
        y: padding + Math.random() * (rect.height - padding * 2),
        scale: 0.8 + Math.random() * 0.4,
        rotation: (Math.random() - 0.5) * 30,
        lifetime: 2000 + Math.random() * 1000, // 2-3 seconds
      };

      setEnemies(prev => [...prev, enemy]);
    };

    // Spawn rate increases over time
    const spawnRate = Math.max(400, 1200 - (30 - timeLeft) * 30);
    const interval = setInterval(spawn, spawnRate);
    
    return () => clearInterval(interval);
  }, [gameState, timeLeft]);

  // Spawn boss enemies
  useEffect(() => {
    if (gameState !== 'boss') return;

    const spawn = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const padding = 60;
      
      const enemy: FontEnemy = {
        id: enemyIdRef.current++,
        font: { ...FINAL_BOSS, style: 'fantasy' },
        x: padding + Math.random() * (rect.width - padding * 2),
        y: padding + Math.random() * (rect.height - padding * 2),
        scale: 1 + Math.random() * 0.3,
        rotation: (Math.random() - 0.5) * 20,
        lifetime: 1500,
        isBoss: true,
        bossHp: 1,
      };

      setEnemies(prev => [...prev, enemy]);
    };

    const interval = setInterval(spawn, 600);
    return () => clearInterval(interval);
  }, [gameState]);

  // Enemy lifetime - remove after timeout
  useEffect(() => {
    if (gameState !== 'playing' && gameState !== 'boss') return;

    const checkLifetimes = setInterval(() => {
      const now = Date.now();
      
      setEnemies(prev => {
        const stillAlive: FontEnemy[] = [];
        let escaped = 0;
        
        for (const enemy of prev) {
          // Each enemy has a spawn time encoded in its id for simplicity
          // Actually let's track it differently - enemies fade out
          if (enemy.lifetime > 0) {
            stillAlive.push({ ...enemy, lifetime: enemy.lifetime - 50 });
          } else {
            escaped++;
            setCombo(0);
            setMissMessage(MISS_ROASTS[Math.floor(Math.random() * MISS_ROASTS.length)]);
            setTimeout(() => setMissMessage(null), 1500);
          }
        }
        
        if (escaped > 0) {
          setFontsEscaped(f => {
            const newEscaped = f + escaped;
            if (newEscaped >= MAX_ESCAPED && gameState === 'playing') {
              setGameState('defeat');
            }
            return newEscaped;
          });
        }
        
        return stillAlive;
      });
    }, 50);

    return () => clearInterval(checkLifetimes);
  }, [gameState]);

  // Clean up explosions
  useEffect(() => {
    if (explosions.length === 0) return;
    const timer = setTimeout(() => {
      setExplosions(prev => prev.slice(1));
    }, 500);
    return () => clearTimeout(timer);
  }, [explosions]);

  // Handle clicking on a font enemy
  const smashFont = useCallback((enemy: FontEnemy, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Remove enemy
    setEnemies(prev => prev.filter(en => en.id !== enemy.id));
    
    // Screen shake
    setScreenShake(true);
    setTimeout(() => setScreenShake(false), 150);
    
    // Combo and scoring
    const basePoints = enemy.isBoss ? 100 : 50;
    const comboBonus = 1 + combo * 0.2;
    const points = Math.floor(basePoints * comboBonus);
    
    setScore(s => s + points);
    setCombo(c => {
      const newCombo = c + 1;
      if (newCombo > maxCombo) setMaxCombo(newCombo);
      return newCombo;
    });
    
    // Boss damage
    if (enemy.isBoss) {
      setBossHp(hp => {
        const newHp = hp - 1;
        if (newHp <= 0) {
          setGameState('victory');
          if (score + points > highScore) {
            setHighScore(score + points);
            localStorage.setItem('fontFrenzyHighScore', (score + points).toString());
          }
          if (onComplete) onComplete(score + points);
        }
        return newHp;
      });
    }
    
    // Explosion effect
    const explosionTexts = [
      '💥 BONK!',
      '✨ ZAPPED!',
      '🔥 BURNED!',
      '⚡ DELETED!',
      '💀 GONE!',
      '🚫 BANNED!',
    ];
    
    setExplosions(prev => [...prev, {
      id: explosionIdRef.current++,
      x: enemy.x,
      y: enemy.y,
      text: explosionTexts[Math.floor(Math.random() * explosionTexts.length)],
      color: enemy.isBoss ? '#ff00ff' : '#ff6b35',
    }]);
  }, [combo, maxCombo, score, highScore, onComplete]);

  return (
    <motion.div
      ref={containerRef}
      animate={screenShake ? { x: [-4, 4, -4, 4, 0] } : {}}
      transition={{ duration: 0.15 }}
      className="w-full h-full relative overflow-hidden select-none rounded-xl"
      style={{
        background: gameState === 'boss' 
          ? 'linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 50%, #16082a 100%)'
          : 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #1e293b 100%)',
      }}
    >
      {/* Grid pattern */}
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 30px, rgba(255,255,255,0.1) 30px, rgba(255,255,255,0.1) 31px), repeating-linear-gradient(90deg, transparent, transparent 30px, rgba(255,255,255,0.1) 30px, rgba(255,255,255,0.1) 31px)',
      }} />

      {/* Miss message */}
      <AnimatePresence>
        {missMessage && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-red-500 rounded-xl text-white font-bold text-sm shadow-lg"
          >
            {missMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* HUD */}
      {(gameState === 'playing' || gameState === 'boss') && (
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-40">
          {/* Score */}
          <motion.div
            key={score}
            initial={{ scale: 1.1 }}
            animate={{ scale: 1 }}
            className="px-3 py-1 bg-gradient-to-r from-orange-500 to-pink-500 rounded-lg shadow-lg"
          >
            <span className="text-white font-bold text-sm">⭐ {score}</span>
          </motion.div>

          {/* Combo */}
          {combo > 2 && (
            <motion.div
              key={combo}
              initial={{ scale: 1.3 }}
              animate={{ scale: 1, rotate: [0, -5, 5, 0] }}
              className="px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg shadow-lg"
            >
              <span className="text-white font-bold text-sm">{combo}x 🔥</span>
            </motion.div>
          )}

          {/* Timer / Boss HP */}
          <motion.div
            animate={timeLeft <= 5 ? { scale: [1, 1.1, 1] } : {}}
            transition={{ repeat: Infinity, duration: 0.5 }}
            className={`px-3 py-1 rounded-lg shadow-lg ${
              gameState === 'boss' ? 'bg-purple-600' : timeLeft <= 5 ? 'bg-red-500' : 'bg-blue-500'
            }`}
          >
            {gameState === 'boss' ? (
              <span className="text-white font-bold text-sm">BOSS: {bossHp}❤️</span>
            ) : (
              <span className="text-white font-bold text-sm">⏰ {timeLeft}s</span>
            )}
          </motion.div>
        </div>
      )}

      {/* Escaped fonts indicator */}
      {gameState === 'playing' && (
        <div className="absolute bottom-2 left-2 flex gap-1">
          {[...Array(MAX_ESCAPED)].map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 ${
                i < fontsEscaped 
                  ? 'bg-red-500 border-red-400' 
                  : 'bg-transparent border-gray-600'
              }`}
            />
          ))}
          <span className="text-xs text-gray-400 ml-2">Escaped</span>
        </div>
      )}

      {/* Font enemies */}
      <AnimatePresence>
        {enemies.map(enemy => {
          const opacity = Math.min(1, enemy.lifetime / 500);
          const isUrgent = enemy.lifetime < 800;
          
          return (
            <motion.div
              key={enemy.id}
              initial={{ scale: 0, rotate: enemy.rotation - 180 }}
              animate={{ 
                scale: enemy.scale * (isUrgent ? 1.1 : 1),
                rotate: enemy.rotation,
                opacity,
              }}
              exit={{ scale: 0, rotate: enemy.rotation + 180 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              onClick={(e) => smashFont(enemy, e)}
              className={`absolute cursor-pointer ${isUrgent ? 'animate-pulse' : ''}`}
              style={{
                left: enemy.x,
                top: enemy.y,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <motion.div
                animate={{ y: [0, -3, 0] }}
                transition={{ repeat: Infinity, duration: 0.5 }}
                className={`relative px-4 py-2 rounded-xl border-4 shadow-2xl ${
                  enemy.isBoss 
                    ? 'bg-gradient-to-br from-purple-600 to-pink-600 border-yellow-400'
                    : 'bg-gradient-to-br from-red-600 to-red-800 border-red-400'
                }`}
                style={{
                  boxShadow: enemy.isBoss 
                    ? '0 0 30px rgba(168, 85, 247, 0.6)'
                    : isUrgent 
                      ? '0 0 20px rgba(239, 68, 68, 0.8)'
                      : '0 0 15px rgba(239, 68, 68, 0.4)',
                }}
              >
                {/* Evil aura for urgent */}
                {isUrgent && !enemy.isBoss && (
                  <motion.div
                    className="absolute -inset-2 rounded-xl border-2 border-red-400"
                    animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 0.3 }}
                  />
                )}
                
                <div className="text-center">
                  <span className="text-2xl">{enemy.font.emoji}</span>
                  <div 
                    className="text-white font-bold text-sm whitespace-nowrap"
                    style={{ fontFamily: enemy.font.style }}
                  >
                    {enemy.font.name}
                  </div>
                  {enemy.isBoss && (
                    <div className="text-yellow-300 text-xs">
                      {enemy.font.evilPower}
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Explosions */}
      <AnimatePresence>
        {explosions.map(exp => (
          <motion.div
            key={exp.id}
            initial={{ scale: 0, opacity: 1 }}
            animate={{ scale: [0, 1.5, 1], opacity: [1, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute pointer-events-none z-50"
            style={{ left: exp.x, top: exp.y, transform: 'translate(-50%, -50%)' }}
          >
            <div 
              className="text-3xl font-black text-white drop-shadow-lg"
              style={{ textShadow: `0 0 20px ${exp.color}` }}
            >
              {exp.text}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* INTRO */}
      {gameState === 'intro' && (
        <div className="absolute inset-0 flex items-center justify-center z-40">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center p-6 bg-slate-800/90 rounded-2xl border-2 border-orange-500/50 shadow-2xl max-w-sm mx-4"
          >
            <motion.div
              className="text-5xl mb-3"
              animate={{ rotate: [0, -10, 10, 0], scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
            >
              🔤
            </motion.div>
            
            <h2 className="text-2xl font-black text-white mb-2">
              FONT FRENZY
            </h2>
            <p className="text-sm text-gray-300 mb-4">
              Tap to destroy ugly fonts before they infect your presentation!
            </p>

            {/* Villain preview */}
            <div className="flex justify-center gap-2 mb-4 flex-wrap">
              {BAD_FONTS.slice(0, 4).map(font => (
                <motion.div
                  key={font.name}
                  className="px-2 py-1 bg-red-600/50 rounded text-xs text-white"
                  animate={{ y: [0, -3, 0] }}
                  transition={{ repeat: Infinity, duration: 0.5, delay: Math.random() }}
                >
                  {font.emoji} {font.name}
                </motion.div>
              ))}
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={startGame}
              className="px-6 py-3 bg-gradient-to-r from-orange-500 to-pink-500 rounded-xl text-white font-bold shadow-lg"
            >
              🛡️ Defend Typography!
            </motion.button>

            {highScore > 0 && (
              <p className="text-sm text-yellow-400 mt-3">
                🏆 Best: {highScore}
              </p>
            )}
          </motion.div>
        </div>
      )}

      {/* BOSS INTRO */}
      {gameState === 'boss' && bossHp === FINAL_BOSS.hp && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 flex items-center justify-center z-50 bg-black/60"
        >
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            className="text-center"
          >
            <motion.div
              className="text-8xl"
              animate={{ scale: [1, 1.2, 1], rotate: [0, -10, 10, 0] }}
              transition={{ repeat: Infinity, duration: 0.5 }}
            >
              {FINAL_BOSS.emoji}
            </motion.div>
            <h2 className="text-4xl font-black text-white mt-4 bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 bg-clip-text text-transparent">
              {FINAL_BOSS.name}
            </h2>
            <p className="text-yellow-400 font-bold mt-2">
              {FINAL_BOSS.evilPower}
            </p>
          </motion.div>
        </motion.div>
      )}

      {/* VICTORY */}
      {gameState === 'victory' && (
        <div className="absolute inset-0 flex items-center justify-center z-40 bg-black/60">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="text-center p-6 bg-gradient-to-br from-green-800 to-emerald-900 rounded-2xl border-2 border-green-400 shadow-2xl max-w-sm mx-4"
          >
            <motion.div
              className="text-6xl"
              animate={{ rotate: [0, -10, 10, 0], y: [0, -10, 0] }}
              transition={{ repeat: Infinity, duration: 0.5 }}
            >
              🏆
            </motion.div>
            
            <h2 className="text-2xl font-black text-white my-2">
              TYPOGRAPHY SAVED!
            </h2>
            <p className="text-green-300 text-sm mb-4">
              {VICTORY_QUOTES[Math.floor(Math.random() * VICTORY_QUOTES.length)]}
            </p>

            <div className="text-4xl font-black text-yellow-400 mb-2">
              {score} pts
            </div>
            
            {score > highScore && (
              <div className="text-sm text-yellow-300 mb-2">🎉 NEW HIGH SCORE!</div>
            )}
            
            {maxCombo > 2 && (
              <div className="text-sm text-orange-300 mb-4">
                Best combo: {maxCombo}x 🔥
              </div>
            )}

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={startGame}
              className="px-6 py-2 bg-gradient-to-r from-orange-500 to-pink-500 rounded-xl text-white font-bold"
            >
              Play Again
            </motion.button>
          </motion.div>
        </div>
      )}

      {/* DEFEAT */}
      {gameState === 'defeat' && (
        <div className="absolute inset-0 flex items-center justify-center z-40 bg-black/60">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="text-center p-6 bg-gradient-to-br from-red-800 to-red-900 rounded-2xl border-2 border-red-400 shadow-2xl max-w-sm mx-4"
          >
            <motion.div
              className="text-6xl"
              animate={{ rotate: [0, -5, 5, 0] }}
              transition={{ repeat: Infinity, duration: 0.5 }}
            >
              💀
            </motion.div>
            
            <h2 className="text-2xl font-black text-white my-2">
              TYPOGRAPHY CORRUPTED!
            </h2>
            <p className="text-red-300 text-sm mb-4">
              Comic Sans has conquered the presentation deck...
            </p>

            <div className="text-3xl font-black text-yellow-400 mb-4">
              {score} pts
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={startGame}
              className="px-6 py-2 bg-gradient-to-r from-orange-500 to-pink-500 rounded-xl text-white font-bold"
            >
              Defend Again
            </motion.button>
          </motion.div>
        </div>
      )}

      {/* Instructions */}
      {(gameState === 'playing' || gameState === 'boss') && (
        <div className="absolute bottom-2 right-2 text-xs text-gray-500">
          Tap fonts to destroy them!
        </div>
      )}
    </motion.div>
  );
};

export default FontFrenzy;

