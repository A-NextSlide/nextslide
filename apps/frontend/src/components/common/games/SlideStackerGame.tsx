import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Heart, Award, RefreshCw, Trophy, Layers, MousePointer2, Image as ImageIcon, Type, BarChart3, LayoutTemplate, Copyright, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SlideStackerGameProps {
  onClose: () => void;
}

// Game Constants
const ROWS = 8;
const COLS = 8;
const SPEED_DECREMENT = 20;

// Level Configuration
const LEVELS = [
  { level: 1, speed: 250, width: 4, name: "JUNIOR DESIGNER" },
  { level: 2, speed: 180, width: 3, name: "SENIOR ARTIST" },
  { level: 3, speed: 120, width: 3, name: "CREATIVE DIRECTOR" },
];

// Component Types with "Silly" Visuals
const COMPONENT_TYPES = [
  {
    id: 'footer',
    label: 'FOOTER',
    color: '#334155',
    icon: Copyright,
    render: () => (
      <div className="w-full h-full flex items-center justify-between px-2 opacity-50">
        <div className="h-1 w-8 bg-white/30 rounded-full" />
        <div className="h-1 w-4 bg-white/30 rounded-full" />
      </div>
    )
  },
  {
    id: 'text',
    label: 'BODY TEXT',
    color: '#94a3b8',
    icon: Type,
    render: () => (
      <div className="w-full h-full flex flex-col justify-center gap-1 px-2">
        <div className="h-1 w-full bg-slate-300 rounded-full" />
        <div className="h-1 w-3/4 bg-slate-300 rounded-full" />
        <div className="h-1 w-5/6 bg-slate-300 rounded-full" />
      </div>
    )
  },
  {
    id: 'image',
    label: 'HERO IMG',
    color: '#0ea5e9',
    icon: ImageIcon,
    render: () => (
      <div className="w-full h-full flex items-center justify-center bg-sky-400/30 m-1 rounded-sm border-2 border-dashed border-white/30">
        <ImageIcon className="w-4 h-4 text-white/50" />
      </div>
    )
  },
  {
    id: 'chart',
    label: 'BIG DATA',
    color: '#8b5cf6',
    icon: BarChart3,
    render: () => (
      <div className="w-full h-full flex items-end justify-center gap-1 pb-1 px-2">
        <div className="w-1 h-3 bg-white/40 rounded-t-sm" />
        <div className="w-1 h-5 bg-white/60 rounded-t-sm" />
        <div className="w-1 h-4 bg-white/40 rounded-t-sm" />
        <div className="w-1 h-6 bg-white/80 rounded-t-sm" />
      </div>
    )
  },
  {
    id: 'header',
    label: 'HEADER',
    color: '#FF4301',
    icon: LayoutTemplate,
    render: () => (
      <div className="w-full h-full flex items-center gap-2 px-2 bg-orange-600/20">
        <div className="w-4 h-4 rounded-full bg-white/20" />
        <div className="h-2 w-16 bg-white/20 rounded-full" />
      </div>
    )
  },
];

// Feedback phrases
const FEEDBACK_PHRASES = ["PERFECT!", "NICE!", "STACKED!", "BAM!", "SOLID!", "CRISP!"];
const OOPS_PHRASES = ["OOPS!", "SLIPPED!", "WOBBLE!", "CRASH!"];

const SlideStackerGame: React.FC<SlideStackerGameProps> = ({ onClose }) => {
  // Game State
  const [grid, setGrid] = useState<(any | null)[][]>(
    Array(ROWS).fill(null).map(() => Array(COLS).fill(null))
  );
  const [currentRow, setCurrentRow] = useState(0);
  const [currentCol, setCurrentCol] = useState(0);
  const [direction, setDirection] = useState(1);
  const [width, setWidth] = useState(4);
  const [speed, setSpeed] = useState(250);
  const [gameState, setGameState] = useState<'ready' | 'playing' | 'level_complete' | 'won' | 'lost'>('ready');
  const [score, setScore] = useState(0);
  const [currentLevelIdx, setCurrentLevelIdx] = useState(0);
  const [feedback, setFeedback] = useState<{ text: string; x: number; y: number; color: string } | null>(null);

  const timerRef = useRef<number | null>(null);

  // Reset Game (Full Reset)
  const resetGame = () => {
    setCurrentLevelIdx(0);
    startLevel(0);
    setScore(0);
  };

  // Start Specific Level
  const startLevel = (levelIdx: number) => {
    const levelConfig = LEVELS[levelIdx];
    setGrid(Array(ROWS).fill(null).map(() => Array(COLS).fill(null)));
    setCurrentRow(0);
    setCurrentCol(0);
    setDirection(1);
    setWidth(levelConfig.width);
    setSpeed(levelConfig.speed);
    setFeedback(null);
    setGameState('playing');
  };

  // Next Level
  const nextLevel = () => {
    const nextIdx = currentLevelIdx + 1;
    if (nextIdx >= LEVELS.length) {
      setGameState('won');
    } else {
      setCurrentLevelIdx(nextIdx);
      startLevel(nextIdx);
    }
  };

  // Game Loop
  const moveBlock = useCallback(() => {
    if (gameState !== 'playing') return;

    setCurrentCol((prev) => {
      const next = prev + direction;
      if (next < 0 || next + width > COLS) {
        setDirection((d) => -d);
        return prev + (direction * -1);
      }
      return next;
    });
  }, [gameState, direction, width]);

  useEffect(() => {
    if (gameState === 'playing') {
      timerRef.current = window.setInterval(moveBlock, speed);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState, moveBlock, speed]);

  // Handle Click / Stack
  const handleStack = () => {
    if (gameState !== 'playing') return;

    const newGrid = [...grid];
    let newWidth = width;

    // Component mapping logic
    const componentMap = [0, 1, 1, 2, 1, 3, 1, 4];
    const compType = COMPONENT_TYPES[componentMap[Math.min(currentRow, componentMap.length - 1)]];

    // Check overlap with row below (unless it's the first row)
    if (currentRow > 0) {
      const prevRow = newGrid[currentRow - 1];
      let overlapCount = 0;
      let firstOverlapCol = -1;

      for (let i = 0; i < width; i++) {
        const colIndex = currentCol + i;
        if (prevRow[colIndex]) {
          if (firstOverlapCol === -1) firstOverlapCol = colIndex;
          overlapCount++;
          newGrid[currentRow][colIndex] = compType;
        }
      }

      if (overlapCount === 0) {
        setGameState('lost');
        setFeedback({ text: OOPS_PHRASES[Math.floor(Math.random() * OOPS_PHRASES.length)], x: 50, y: 50, color: '#ef4444' });
        return;
      }

      // Perfect stack bonus
      if (overlapCount === width) {
        setScore(s => s + 200 + (currentLevelIdx * 100));
        setFeedback({ text: FEEDBACK_PHRASES[Math.floor(Math.random() * FEEDBACK_PHRASES.length)], x: 50, y: 50, color: '#22c55e' });
      } else {
        setScore(s => s + (overlapCount * 50));
        setFeedback(null);
      }

      newWidth = overlapCount;

    } else {
      // First row always succeeds
      for (let i = 0; i < width; i++) {
        newGrid[currentRow][currentCol + i] = compType;
      }
      setScore(s => s + (width * 100));
      setFeedback({ text: "START!", x: 50, y: 50, color: '#3b82f6' });
    }

    setGrid(newGrid);
    setWidth(newWidth);

    if (currentRow === ROWS - 1) {
      // Level Complete
      if (currentLevelIdx < LEVELS.length - 1) {
        setGameState('level_complete');
        setScore(s => s + 1000);
      } else {
        setGameState('won');
        setScore(s => s + 5000);
      }
    } else {
      setCurrentRow(r => r + 1);
      // Speed up slightly within the level too
      setSpeed(s => Math.max(SPEED_DECREMENT, s - 10));

      // Randomize start direction and position
      setDirection(Math.random() > 0.5 ? 1 : -1);
      setCurrentCol(Math.random() > 0.5 ? 0 : COLS - newWidth);
    }
  };

  // Determine current component type for the moving block
  const componentMap = [0, 1, 1, 2, 1, 3, 1, 4];
  const activeCompType = COMPONENT_TYPES[componentMap[Math.min(currentRow, componentMap.length - 1)]];
  const currentLevelConfig = LEVELS[currentLevelIdx];

  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-slate-950 text-white select-none font-sans relative overflow-hidden" onClick={handleStack}>

      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5"
        style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '20px 20px' }}
      />

      {/* Header */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-start z-10 pointer-events-none">
        <div>
          <h1 className="text-3xl font-black italic tracking-tighter text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.5)]">
            SLIDE <span className="text-[#FF4301]">STACKER</span>
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <div className="px-2 py-0.5 bg-white/10 rounded text-[10px] font-bold tracking-widest text-slate-300 uppercase">
              {currentLevelConfig.name} • LVL {currentLevelIdx + 1}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-4xl font-black text-white drop-shadow-md tabular-nums">{score}</div>
          <div className="text-[10px] text-slate-400 font-bold tracking-widest uppercase bg-slate-900/50 px-2 py-1 rounded inline-block">Score</div>
        </div>
      </div>

      {/* Close Button */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-6 right-6 z-50 p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors pointer-events-auto"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Game Canvas (The Slide) */}
      <div className="relative w-[360px] h-[540px] bg-white border-[8px] border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Slide Header Bar (Visual only) */}
        <div className="absolute top-0 left-0 right-0 h-3 bg-slate-100 border-b border-slate-200" />

        {/* Grid Lines (Subtle) */}
        <div className="absolute inset-0 grid grid-cols-8 grid-rows-8 pointer-events-none opacity-20">
          {Array(ROWS * COLS).fill(0).map((_, i) => (
            <div key={i} className="border-[0.5px] border-slate-300" />
          ))}
        </div>

        {/* Stacked Blocks */}
        {grid.map((row, r) => (
          row.map((comp, c) => (
            comp && (
              <motion.div
                key={`${r}-${c}`}
                initial={{ scale: 0.5, y: 20, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
                className="absolute w-[12.5%] h-[12.5%] border-r border-b border-white/20 shadow-sm"
                style={{
                  bottom: `${(r / ROWS) * 100}%`,
                  left: `${(c / COLS) * 100}%`,
                  backgroundColor: comp.color
                }}
              >
                {/* Render Component Visuals */}
                {comp.render()}
              </motion.div>
            )
          ))
        ))}

        {/* Active Moving Block */}
        {gameState === 'playing' && (
          <div className="absolute w-full h-[12.5%]" style={{ bottom: `${(currentRow / ROWS) * 100}%` }}>
            {Array(width).fill(0).map((_, i) => (
              <div
                key={i}
                className="absolute h-full w-[12.5%] border-r border-b border-white/20 shadow-lg"
                style={{
                  left: `${((currentCol + i) / COLS) * 100}%`,
                  backgroundColor: activeCompType.color
                }}
              >
                {activeCompType.render()}
              </div>
            ))}
            {/* Label for the active row */}
            <div
              className="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-black/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap z-20"
              style={{ left: `${((currentCol + width / 2) / COLS) * 100}%` }}
            >
              {activeCompType.label}
            </div>
          </div>
        )}

        {/* Feedback Text */}
        <AnimatePresence>
          {feedback && (
            <motion.div
              key={feedback.text}
              initial={{ scale: 0, rotate: -10, opacity: 0 }}
              animate={{ scale: 1.5, rotate: 0, opacity: 1 }}
              exit={{ scale: 2, opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
            >
              <span
                className="text-5xl font-black italic text-white drop-shadow-[0_4px_0_rgba(0,0,0,0.2)]"
                style={{
                  textShadow: `2px 2px 0px ${feedback.color}, -1px -1px 0 #000`,
                  color: 'white'
                }}
              >
                {feedback.text}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Start Overlay */}
        {gameState === 'ready' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm z-40">
            <div className="mb-6 relative">
              <div className="absolute inset-0 bg-[#FF4301] blur-2xl opacity-20 animate-pulse" />
              <LayoutTemplate className="w-20 h-20 text-[#FF4301] relative z-10" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 italic mb-2">LEVEL {currentLevelIdx + 1}</h2>
            <p className="text-slate-500 font-bold tracking-widest mb-6">{currentLevelConfig.name}</p>
            <button
              onClick={(e) => { e.stopPropagation(); startLevel(0); }}
              className="px-8 py-4 bg-[#FF4301] hover:bg-[#ff5e26] text-white font-black italic text-xl rounded-xl shadow-[0_4px_0_#c23300] active:shadow-none active:translate-y-1 transition-all transform hover:scale-105 flex items-center gap-2"
            >
              <MousePointer2 className="w-5 h-5" />
              START BUILDING
            </button>
          </div>
        )}

        {/* Level Complete Overlay */}
        {gameState === 'level_complete' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-md z-50 text-center p-6">
            <div className="mb-4 relative">
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto ring-4 ring-green-400/50"
              >
                <Award className="w-10 h-10 text-white" />
              </motion.div>
            </div>
            <h2 className="text-3xl font-black text-white italic mb-1">SLIDE COMPLETE!</h2>
            <p className="text-slate-300 font-medium mb-8">Ready for the next challenge?</p>

            <button
              onClick={(e) => { e.stopPropagation(); nextLevel(); }}
              className="px-8 py-4 bg-green-500 hover:bg-green-400 text-white font-black italic text-xl rounded-xl shadow-[0_4px_0_#15803d] active:shadow-none active:translate-y-1 transition-all flex items-center gap-2"
            >
              NEXT LEVEL <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Game Over / Win Overlay */}
        {(gameState === 'won' || gameState === 'lost') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-md z-50 text-center p-6">
            {gameState === 'won' ? (
              <>
                <div className="mb-4 relative">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-orange-500 blur-xl opacity-50 rounded-full"
                  />
                  <Trophy className="w-20 h-20 text-yellow-400 relative z-10 drop-shadow-lg" />
                </div>
                <h2 className="text-4xl font-black text-white italic mb-1">DECK SHIPPED!</h2>
                <p className="text-slate-300 font-medium mb-8">You conquered all deadlines.</p>
              </>
            ) : (
              <>
                <div className="mb-4 relative">
                  <div className="absolute inset-0 bg-red-500 blur-xl opacity-30 rounded-full" />
                  <Layers className="w-20 h-20 text-red-500 relative z-10 rotate-12" />
                </div>
                <h2 className="text-4xl font-black text-white italic mb-1">LAYOUT BROKEN!</h2>
                <p className="text-slate-300 font-medium mb-8">The components didn't fit.</p>
              </>
            )}

            <div className="flex gap-3 w-full max-w-xs">
              <button
                onClick={(e) => { e.stopPropagation(); resetGame(); }}
                className="flex-1 py-3 bg-white hover:bg-slate-100 text-slate-900 font-black rounded-xl shadow-[0_4px_0_#cbd5e1] active:shadow-none active:translate-y-1 transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                PLAY AGAIN
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer Instructions */}
      <div className="absolute bottom-8 text-slate-500 text-xs font-bold tracking-widest uppercase opacity-50">
        Next Slide &copy; 2024
      </div>
    </div>
  );
};

export default SlideStackerGame;
