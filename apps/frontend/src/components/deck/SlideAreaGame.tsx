import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Heart, Award } from 'lucide-react';

interface SlideAreaGameProps {
  onClose: () => void;
}

// Good prompting tips - COLLECTIBLES
const PROMPT_TIPS = [
  { text: 'Minimalist style', tip: 'Specify visual style!', color: '#10b981' },
  { text: 'For executives', tip: 'Know your audience!', color: '#8b5cf6' },
  { text: 'Blue palette', tip: 'Name your colors!', color: '#3b82f6' },
  { text: 'Bold shapes', tip: 'Describe elements!', color: '#f59e0b' },
  { text: 'Warm tone', tip: 'Set the tone!', color: '#ec4899' },
  { text: 'Pitch deck', tip: 'State the purpose!', color: '#22c55e' },
  { text: 'Dark mode', tip: 'Specify the mode!', color: '#a855f7' },
];

// Bad/vague prompts - OBSTACLES  
const BAD_PROMPTS = [
  { text: 'Make it pop', color: '#ef4444' },
  { text: 'Jazz it up', color: '#f97316' },
  { text: 'Make it nice', color: '#dc2626' },
  { text: 'Just better', color: '#e11d48' },
  { text: 'Add pizzazz', color: '#db2777' },
];

// Physics - SLOWED DOWN
const GRAVITY = 0.6;
const JUMP_FORCE = -14;
const GROUND_Y = 100;
const PLAYER_X = 150;
const GAME_SPEED = 2.5; // Much slower!

interface Entity {
  id: number;
  type: 'good' | 'bad';
  x: number;
  y: number;
  text: string;
  tip?: string;
  color: string;
}

// Animated Star Mascot - Simplified
const StarMascot: React.FC<{ jumping: boolean; hurt: boolean }> = ({ jumping, hurt }) => (
  <svg width="70" height="80" viewBox="0 0 100 100" style={{ 
    filter: hurt ? 'brightness(0.5)' : 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))',
    transform: jumping ? 'rotate(-10deg)' : 'rotate(0deg)',
    transition: 'transform 0.1s'
  }}>
    {/* Star body */}
    <path d="M50 5 L58 35 L90 40 L65 55 L72 85 L50 70 L28 85 L35 55 L10 40 L42 35 Z" 
      fill="#FF6B35" stroke="#222" strokeWidth="3"/>
    {/* Eyes */}
    <ellipse cx="40" cy="42" rx="6" ry="7" fill="white" stroke="#222" strokeWidth="1.5"/>
    <ellipse cx="60" cy="42" rx="6" ry="7" fill="white" stroke="#222" strokeWidth="1.5"/>
    <circle cx="40" cy="44" r="3" fill="#222"/>
    <circle cx="60" cy="44" r="3" fill="#222"/>
    {/* Smile */}
    <path d="M38 55 Q50 65, 62 55" stroke="#222" strokeWidth="3" fill="none" strokeLinecap="round"/>
    {/* Arms */}
    <line x1="25" y1="50" x2="8" y2="40" stroke="#222" strokeWidth="5" strokeLinecap="round"/>
    <line x1="75" y1="50" x2="88" y2="55" stroke="#222" strokeWidth="5" strokeLinecap="round"/>
    {/* Legs */}
    <line x1="38" y1="78" x2="32" y2="95" stroke="#222" strokeWidth="5" strokeLinecap="round"/>
    <line x1="62" y1="78" x2="68" y2="95" stroke="#222" strokeWidth="5" strokeLinecap="round"/>
  </svg>
);

const SlideAreaGame: React.FC<SlideAreaGameProps> = ({ onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameLoopRef = useRef<number>();
  const entityIdRef = useRef(0);
  const lastSpawnRef = useRef(0);

  // Game state
  const [gameState, setGameState] = useState<'ready' | 'playing' | 'ended'>('ready');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('promptRunner3');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [lives, setLives] = useState(3);
  const [tipsCollected, setTipsCollected] = useState(0);
  const [lastTip, setLastTip] = useState<string | null>(null);

  // Player physics
  const playerY = useRef(0);
  const playerVY = useRef(0);
  const isGrounded = useRef(true);
  const [renderY, setRenderY] = useState(0);
  const [isJumping, setIsJumping] = useState(false);
  
  // Hurt state
  const [isHurt, setIsHurt] = useState(false);
  const hurtUntil = useRef(0);

  // Entities
  const [entities, setEntities] = useState<Entity[]>([]);
  const entitiesRef = useRef<Entity[]>([]);

  // Jump function - direct and responsive
  const jump = useCallback(() => {
    if (isGrounded.current && gameState === 'playing') {
      playerVY.current = JUMP_FORCE;
      isGrounded.current = false;
      setIsJumping(true);
    }
  }, [gameState]);

  // Keyboard controls
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      
      if (gameState === 'ready' || gameState === 'ended') {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          startGame();
        }
        return;
      }
      
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        jump();
      }
    };
    
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [gameState, jump, onClose]);

  // Click to jump
  const handleGameClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (gameState === 'playing') {
      jump();
    } else if (gameState === 'ready' || gameState === 'ended') {
      startGame();
    }
  }, [gameState, jump]);

  // Spawn entity
  const spawnEntity = useCallback(() => {
    const isGood = Math.random() < 0.6;
    const id = entityIdRef.current++;
    
    if (isGood) {
      const data = PROMPT_TIPS[Math.floor(Math.random() * PROMPT_TIPS.length)];
      const newEntity: Entity = {
        id,
        type: 'good',
        x: 900,
        y: 50 + Math.random() * 120, // Varies height
        text: data.text,
        tip: data.tip,
        color: data.color,
      };
      entitiesRef.current.push(newEntity);
    } else {
      const data = BAD_PROMPTS[Math.floor(Math.random() * BAD_PROMPTS.length)];
      const newEntity: Entity = {
        id,
        type: 'bad',
        x: 900,
        y: 30 + Math.random() * 60, // Lower, need to jump over
        text: data.text,
        color: data.color,
      };
      entitiesRef.current.push(newEntity);
    }
  }, []);

  // Game loop
  useEffect(() => {
    if (gameState !== 'playing') return;

    let scoreCounter = 0;
    let livesLeft = 3;

    const loop = () => {
      // Physics
      if (!isGrounded.current) {
        playerVY.current += GRAVITY;
        playerY.current += playerVY.current;
        
        if (playerY.current <= 0) {
          playerY.current = 0;
          playerVY.current = 0;
          isGrounded.current = true;
          setIsJumping(false);
        }
      }
      setRenderY(playerY.current);

      // Score
      scoreCounter += 1;
      if (scoreCounter % 10 === 0) {
        setScore(Math.floor(scoreCounter / 2));
      }

      // Spawn - much less frequent
      const now = Date.now();
      if (now - lastSpawnRef.current > 2500) { // Every 2.5 seconds
        spawnEntity();
        lastSpawnRef.current = now;
      }

      // Move entities
      entitiesRef.current = entitiesRef.current
        .map(e => ({ ...e, x: e.x - GAME_SPEED }))
        .filter(e => e.x > -200);

      // Collision
      const pLeft = PLAYER_X - 25;
      const pRight = PLAYER_X + 25;
      const pBottom = GROUND_Y + playerY.current;
      const pTop = pBottom + 60;

      entitiesRef.current.forEach(e => {
        const eLeft = e.x - 50;
        const eRight = e.x + 50;
        const eBottom = GROUND_Y + e.y - 20;
        const eTop = GROUND_Y + e.y + 20;

        if (pRight > eLeft && pLeft < eRight && pTop > eBottom && pBottom < eTop) {
          // Collision!
          entitiesRef.current = entitiesRef.current.filter(ent => ent.id !== e.id);
          
          if (e.type === 'good') {
            scoreCounter += 200;
            setTipsCollected(prev => prev + 1);
            setLastTip(e.tip || null);
            setTimeout(() => setLastTip(null), 2000);
          } else {
            if (Date.now() > hurtUntil.current) {
              livesLeft -= 1;
              setLives(livesLeft);
              setIsHurt(true);
              hurtUntil.current = Date.now() + 1000;
              setTimeout(() => setIsHurt(false), 300);
              
              if (livesLeft <= 0) {
                const finalScore = Math.floor(scoreCounter / 2);
                setScore(finalScore);
                if (finalScore > highScore) {
                  setHighScore(finalScore);
                  localStorage.setItem('promptRunner3', finalScore.toString());
                }
          setGameState('ended');
                return;
              }
            }
          }
        }
      });

      setEntities([...entitiesRef.current]);
      gameLoopRef.current = requestAnimationFrame(loop);
    };

    gameLoopRef.current = requestAnimationFrame(loop);
    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [gameState, spawnEntity, highScore]);

  const startGame = () => {
    playerY.current = 0;
    playerVY.current = 0;
    isGrounded.current = true;
    hurtUntil.current = 0;
    entitiesRef.current = [];
    entityIdRef.current = 0;
    lastSpawnRef.current = Date.now();
    
    setRenderY(0);
    setIsJumping(false);
    setIsHurt(false);
    setScore(0);
    setLives(3);
    setTipsCollected(0);
    setLastTip(null);
    setEntities([]);
    setGameState('playing');
  };

  return (
    <div
      ref={containerRef}
      onClick={handleGameClick}
      className="absolute inset-0 overflow-hidden select-none"
      style={{
        background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
        cursor: 'pointer',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Stars */}
      {[...Array(30)].map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            width: 2,
            height: 2,
            left: `${(i * 37) % 100}%`,
            top: `${(i * 23) % 60}%`,
            opacity: 0.4,
          }}
        />
      ))}

      {/* Ground */}
      <div
        className="absolute left-0 right-0"
        style={{
          bottom: 0,
          height: GROUND_Y,
          background: '#0f172a',
          borderTop: '4px solid #FF6B35',
        }}
      />

      {/* Player */}
      <div
        className="absolute z-20"
        style={{
          left: PLAYER_X,
          bottom: GROUND_Y + renderY,
          transform: 'translateX(-50%)',
        }}
      >
        <StarMascot jumping={isJumping} hurt={isHurt} />
      </div>

      {/* Entities - BIGGER and CLEARER */}
      {entities.map(entity => (
        <motion.div
          key={entity.id}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute z-10"
          style={{
            left: entity.x,
            bottom: GROUND_Y + entity.y,
            transform: 'translate(-50%, 50%)',
          }}
        >
          <div
            className="px-5 py-3 rounded-2xl border-3 font-bold text-lg whitespace-nowrap"
            style={{
              background: entity.type === 'good' 
                ? `linear-gradient(135deg, ${entity.color}40, ${entity.color}20)` 
                : `linear-gradient(135deg, ${entity.color}60, #300)`,
              borderColor: entity.color,
              borderWidth: 3,
              color: 'white',
              boxShadow: `0 0 20px ${entity.color}60`,
              minWidth: 120,
              textAlign: 'center',
            }}
          >
            {entity.type === 'good' ? '✨ ' : '❌ '}
            {entity.text}
          </div>
          </motion.div>
        ))}

      {/* HUD */}
      {gameState === 'playing' && (
        <>
          {/* Score */}
          <div className="absolute top-4 left-4 px-5 py-2 rounded-full text-2xl font-bold text-white"
            style={{ background: 'linear-gradient(90deg, #FF6B35, #FF8F5A)' }}>
            {score}
          </div>

          {/* Lives */}
          <div className="absolute top-4 right-16 flex gap-1">
            {[0, 1, 2].map(i => (
              <Heart key={i} className="w-8 h-8" fill={i < lives ? '#ef4444' : '#333'} color={i < lives ? '#ef4444' : '#333'} />
            ))}
          </div>

          {/* Tips counter */}
          <div className="absolute top-16 right-4 text-orange-400 font-bold">
            Tips: {tipsCollected}
          </div>

          {/* Tip popup */}
          <AnimatePresence>
            {lastTip && (
            <motion.div
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -30, opacity: 0 }}
                className="absolute top-1/3 left-1/2 -translate-x-1/2 px-8 py-4 rounded-2xl text-xl font-bold text-white text-center"
                style={{ background: 'linear-gradient(90deg, #10b981, #059669)' }}
              >
                💡 {lastTip}
            </motion.div>
          )}
          </AnimatePresence>

          {/* Instructions */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-sm">
            SPACE or CLICK to jump!
        </div>
        </>
      )}

      {/* Start Screen */}
      {gameState === 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="p-8 rounded-3xl text-center max-w-md mx-4"
            style={{ background: '#1a1a2e', border: '4px solid #FF6B35' }}>
            
            <div className="flex justify-center mb-4">
              <StarMascot jumping={false} hurt={false} />
            </div>
            
            <h1 className="text-4xl font-black mb-2" style={{ color: '#FF6B35' }}>
              PROMPT RUNNER
            </h1>
            <p className="text-blue-200 mb-6">
              Jump to collect good prompts!<br/>
              Avoid the vague ones!
            </p>

            <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
              <div className="p-3 rounded-xl bg-green-900/50 border border-green-500">
                <div className="text-green-400 font-bold">✨ COLLECT</div>
                <div className="text-green-200">Specific prompts</div>
              </div>
              <div className="p-3 rounded-xl bg-red-900/50 border border-red-500">
                <div className="text-red-400 font-bold">❌ AVOID</div>
                <div className="text-red-200">Vague requests</div>
              </div>
              </div>

            <button
                onClick={startGame}
              className="w-full py-4 rounded-xl text-xl font-black text-white"
              style={{ background: 'linear-gradient(90deg, #FF6B35, #FF8F5A)' }}
              >
              PRESS SPACE or CLICK!
            </button>

              {highScore > 0 && (
              <p className="mt-4 text-orange-400">
                <Award className="inline w-4 h-4 mr-1" />
                Best: {highScore}
                </p>
              )}
            </div>
        </div>
      )}

      {/* Game Over */}
      {gameState === 'ended' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <div className="p-8 rounded-3xl text-center max-w-sm mx-4"
            style={{ background: '#1a1a2e', border: '4px solid #FF6B35' }}>
            
            <div className="text-5xl mb-4">
              {score >= highScore && score > 0 ? '🏆' : '⭐'}
            </div>

            <h2 className="text-3xl font-black text-white mb-2">
              {score >= highScore && score > 0 ? 'NEW BEST!' : 'Game Over'}
            </h2>

            <div className="text-5xl font-black mb-4" style={{ color: '#FF6B35' }}>
              {score}
            </div>

            <div className="text-white/70 mb-6">
              Tips collected: {tipsCollected}
            </div>

            <button
              onClick={startGame}
              className="w-full py-4 rounded-xl text-xl font-black text-white mb-3"
              style={{ background: 'linear-gradient(90deg, #FF6B35, #FF8F5A)' }}
            >
              PLAY AGAIN
            </button>

            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-white/10 text-white/70 font-bold"
            >
              Exit
            </button>
          </div>
        </div>
      )}

      {/* Close button */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
      >
        <X className="w-5 h-5 text-white/70" />
      </button>
    </div>
  );
};

export default SlideAreaGame;
