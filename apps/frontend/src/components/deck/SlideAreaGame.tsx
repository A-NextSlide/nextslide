import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface SlideAreaGameProps {
  onClose: () => void;
}

// Silly cartoon characters - emoji based for now, styled cartoony
const CHARACTERS = [
  { id: 'happy', emoji: '😄', points: 10, good: true },
  { id: 'star', emoji: '⭐', points: 25, good: true },
  { id: 'heart', emoji: '💖', points: 15, good: true },
  { id: 'cool', emoji: '😎', points: 20, good: true },
  { id: 'angry', emoji: '😡', points: -30, good: false },
  { id: 'skull', emoji: '💀', points: -50, good: false },
];

interface Mole {
  id: number;
  holeIndex: number;
  character: typeof CHARACTERS[0];
  state: 'rising' | 'up' | 'falling' | 'bonked';
}

const SlideAreaGame: React.FC<SlideAreaGameProps> = ({ onClose }) => {
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('bopHighScore');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [moles, setMoles] = useState<Mole[]>([]);
  const [timeLeft, setTimeLeft] = useState(30);
  const [gameState, setGameState] = useState<'ready' | 'playing' | 'ended'>('ready');
  const [combo, setCombo] = useState(0);
  const [lastBonk, setLastBonk] = useState<{ x: number; y: number; points: number } | null>(null);
  const [misses, setMisses] = useState(0);
  const moleIdRef = useRef(0);
  const holesRef = useRef<(HTMLDivElement | null)[]>([]);

  const HOLES = 9; // 3x3 grid

  // Spawn moles
  useEffect(() => {
    if (gameState !== 'playing') return;

    const spawnInterval = setInterval(() => {
      const occupiedHoles = moles.map(m => m.holeIndex);
      const availableHoles = Array.from({ length: HOLES }, (_, i) => i)
        .filter(i => !occupiedHoles.includes(i));

      if (availableHoles.length === 0) return;

      const holeIndex = availableHoles[Math.floor(Math.random() * availableHoles.length)];
      const character = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];

      const newMole: Mole = {
        id: moleIdRef.current++,
        holeIndex,
        character,
        state: 'rising',
      };

      setMoles(prev => [...prev, newMole]);

      // Auto-remove after time
      setTimeout(() => {
        setMoles(prev => {
          const mole = prev.find(m => m.id === newMole.id);
          if (mole && mole.state !== 'bonked') {
            if (mole.character.good) {
              setMisses(m => m + 1);
              setCombo(0);
            }
            return prev.filter(m => m.id !== newMole.id);
          }
          return prev;
        });
      }, 1500 + Math.random() * 1000);
    }, 600 + Math.random() * 400);

    return () => clearInterval(spawnInterval);
  }, [gameState, moles]);

  // Timer
  useEffect(() => {
    if (gameState !== 'playing') return;

    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          setGameState('ended');
          if (score > highScore) {
            setHighScore(score);
            localStorage.setItem('bopHighScore', score.toString());
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, score, highScore]);

  const bonkMole = useCallback((mole: Mole, e: React.MouseEvent) => {
    e.stopPropagation();
    if (mole.state === 'bonked') return;

    const rect = e.currentTarget.getBoundingClientRect();
    const points = mole.character.good
      ? Math.floor(mole.character.points * (1 + combo * 0.2))
      : mole.character.points;

    setLastBonk({ x: rect.left + rect.width / 2, y: rect.top, points });
    setTimeout(() => setLastBonk(null), 600);

    setScore(s => Math.max(0, s + points));

    if (mole.character.good) {
      setCombo(c => c + 1);
    } else {
      setCombo(0);
    }

    setMoles(prev => prev.map(m =>
      m.id === mole.id ? { ...m, state: 'bonked' as const } : m
    ));

    setTimeout(() => {
      setMoles(prev => prev.filter(m => m.id !== mole.id));
    }, 300);
  }, [combo]);

  const startGame = () => {
    setScore(0);
    setTimeLeft(30);
    setMoles([]);
    setCombo(0);
    setMisses(0);
    setGameState('playing');
  };

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.key === ' ' || e.key === 'Enter') && gameState !== 'playing') startGame();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, onClose]);

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse at center, #4a3728 0%, #2d1f16 100%)',
      }}
    >
      {/* Cartoon background pattern */}
      <div className="absolute inset-0 opacity-20" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.3'%3E%3Ccircle cx='30' cy='30' r='4'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }} />

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-3 right-3 z-50 p-2 rounded-full bg-red-500 hover:bg-red-400 transition-all hover:scale-110 shadow-lg"
        style={{
          border: '3px solid #000',
          boxShadow: '4px 4px 0 #000',
        }}
      >
        <X className="w-5 h-5 text-white" strokeWidth={3} />
      </button>

      {/* Score popup */}
      <AnimatePresence>
        {lastBonk && (
          <motion.div
            initial={{ opacity: 1, y: 0, scale: 1.5 }}
            animate={{ opacity: 0, y: -50, scale: 1 }}
            exit={{ opacity: 0 }}
            className="fixed z-50 pointer-events-none font-black text-2xl"
            style={{
              left: lastBonk.x,
              top: lastBonk.y,
              color: lastBonk.points > 0 ? '#4ade80' : '#f87171',
              textShadow: '2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000',
              fontFamily: 'Comic Sans MS, cursive',
            }}
          >
            {lastBonk.points > 0 ? '+' : ''}{lastBonk.points}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative w-80 text-center">
        {/* Title */}
        <motion.h1
          className="text-3xl font-black mb-4 text-yellow-300"
          animate={{ rotate: [0, -2, 2, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
          style={{
            textShadow: '3px 3px 0 #000, -1px -1px 0 #000',
            fontFamily: 'Comic Sans MS, cursive',
          }}
        >
          BOP 'EM! 🔨
        </motion.h1>

        {/* HUD */}
        {gameState === 'playing' && (
          <div className="flex justify-between items-center mb-4 px-2">
            <div className="bg-yellow-400 px-3 py-1 rounded-full font-black text-black"
              style={{ border: '3px solid #000', boxShadow: '2px 2px 0 #000' }}>
              ⭐ {score}
            </div>
            {combo > 1 && (
              <motion.div
                initial={{ scale: 1.5 }}
                animate={{ scale: 1 }}
                className="bg-orange-500 px-3 py-1 rounded-full font-black text-white"
                style={{ border: '3px solid #000', boxShadow: '2px 2px 0 #000' }}>
                {combo}x COMBO!
              </motion.div>
            )}
            <div className={`px-3 py-1 rounded-full font-black text-white ${timeLeft <= 5 ? 'bg-red-500 animate-pulse' : 'bg-blue-500'}`}
              style={{ border: '3px solid #000', boxShadow: '2px 2px 0 #000' }}>
              ⏰ {timeLeft}
            </div>
          </div>
        )}

        {/* Game Grid */}
        <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-amber-800/50"
          style={{ border: '4px solid #000', boxShadow: '6px 6px 0 #000' }}>
          {Array.from({ length: HOLES }).map((_, index) => {
            const mole = moles.find(m => m.holeIndex === index);
            return (
              <div
                key={index}
                ref={el => holesRef.current[index] = el}
                className="relative aspect-square rounded-full overflow-hidden"
                style={{
                  background: 'radial-gradient(ellipse at center, #5c4033 0%, #3d2817 100%)',
                  border: '4px solid #000',
                  boxShadow: 'inset 0 8px 16px rgba(0,0,0,0.5)',
                }}
              >
                {/* Hole shadow */}
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent rounded-b-full" />

                {/* Mole */}
                <AnimatePresence>
                  {mole && (
                    <motion.div
                      initial={{ y: '100%' }}
                      animate={{
                        y: mole.state === 'bonked' ? '100%' : '10%',
                        rotate: mole.state === 'bonked' ? [0, -20, 20, 0] : 0,
                        scale: mole.state === 'bonked' ? 0.8 : 1,
                      }}
                      exit={{ y: '100%' }}
                      transition={{
                        type: 'spring',
                        stiffness: 400,
                        damping: 25,
                      }}
                      onClick={(e) => gameState === 'playing' && bonkMole(mole, e)}
                      className="absolute inset-0 flex items-center justify-center cursor-pointer select-none"
                      style={{ fontSize: '2.5rem' }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <motion.span
                        animate={{
                          y: [0, -3, 0],
                          rotate: mole.character.good ? [0, 5, -5, 0] : [0, -10, 10, 0],
                        }}
                        transition={{
                          duration: mole.character.good ? 0.5 : 0.3,
                          repeat: Infinity,
                        }}
                        style={{
                          filter: mole.state === 'bonked' ? 'grayscale(1)' : 'none',
                          textShadow: '2px 2px 0 #000',
                        }}
                      >
                        {mole.state === 'bonked' ? '💫' : mole.character.emoji}
                      </motion.span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Start Screen */}
        {gameState === 'ready' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4"
          >
            <p className="text-yellow-200 mb-3 text-sm" style={{ fontFamily: 'Comic Sans MS, cursive' }}>
              Bop the happy faces! 😄⭐💖😎<br/>
              Avoid the angry ones! 😡💀
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={startGame}
              className="px-6 py-3 bg-green-500 text-white font-black text-xl rounded-full"
              style={{
                border: '4px solid #000',
                boxShadow: '4px 4px 0 #000',
                fontFamily: 'Comic Sans MS, cursive',
              }}
            >
              START! 🎮
            </motion.button>
            {highScore > 0 && (
              <p className="text-yellow-400 mt-2 text-sm font-bold">
                Best: {highScore} ⭐
              </p>
            )}
          </motion.div>
        )}

        {/* Game Over */}
        {gameState === 'ended' && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="mt-4"
          >
            <motion.div
              animate={{ rotate: [0, -5, 5, 0] }}
              transition={{ duration: 0.5, repeat: Infinity }}
              className="text-4xl mb-2"
            >
              {score >= highScore && score > 0 ? '🏆' : '⏰'}
            </motion.div>
            <p className="text-yellow-300 font-black text-2xl mb-1"
              style={{ fontFamily: 'Comic Sans MS, cursive', textShadow: '2px 2px 0 #000' }}>
              {score >= highScore && score > 0 ? 'NEW RECORD!' : 'TIMES UP!'}
            </p>
            <p className="text-white text-3xl font-black mb-3"
              style={{ textShadow: '2px 2px 0 #000' }}>
              {score} points
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={startGame}
              className="px-6 py-2 bg-green-500 text-white font-black rounded-full"
              style={{
                border: '3px solid #000',
                boxShadow: '3px 3px 0 #000',
                fontFamily: 'Comic Sans MS, cursive',
              }}
            >
              AGAIN! 🔄
            </motion.button>
          </motion.div>
        )}

        {/* Instructions */}
        <p className="text-amber-200/50 text-xs mt-4">
          Press ESC to exit
        </p>
      </div>
    </div>
  );
};

export default SlideAreaGame;
