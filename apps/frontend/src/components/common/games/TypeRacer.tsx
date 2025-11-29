import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TypeRacerProps {
  onComplete?: (wpm: number, accuracy: number) => void;
}

// Hilarious presentation-themed phrases to type
const PHRASES = [
  // Client feedback classics
  { text: "Make the logo bigger please", category: "Client", emoji: "📐" },
  { text: "Can we make it pop more", category: "Client", emoji: "✨" },
  { text: "My nephew could do this", category: "Client", emoji: "👶" },
  { text: "Actually lets go back to version one", category: "Client", emoji: "↩️" },
  { text: "I will know it when I see it", category: "Client", emoji: "👀" },
  { text: "What if we tried Comic Sans", category: "Client", emoji: "🤮" },
  { text: "Can you make it more professional but fun", category: "Client", emoji: "🎭" },
  { text: "Lets circle back on this tomorrow", category: "Client", emoji: "🔄" },
  { text: "I showed my wife and she hates it", category: "Client", emoji: "💔" },
  
  // Tech horror
  { text: "Font not found on this computer", category: "Tech", emoji: "🔤" },
  { text: "Projector says no signal detected", category: "Tech", emoji: "📽️" },
  { text: "File corrupted please try again", category: "Tech", emoji: "💾" },
  { text: "Your presentation is too large to email", category: "Tech", emoji: "📧" },
  { text: "PowerPoint has stopped responding", category: "Tech", emoji: "💀" },
  { text: "All animations disappeared somehow", category: "Tech", emoji: "👻" },
  
  // Meeting mayhem
  { text: "Can everyone see my screen now", category: "Meeting", emoji: "🖥️" },
  { text: "You are still on mute Karen", category: "Meeting", emoji: "🔇" },
  { text: "Sorry I was on mute this whole time", category: "Meeting", emoji: "🎤" },
  { text: "Lets take this offline after the call", category: "Meeting", emoji: "📞" },
  { text: "I have a hard stop in five minutes", category: "Meeting", emoji: "⏰" },
  
  // Deadline drama
  { text: "The presentation is due yesterday", category: "Deadline", emoji: "📅" },
  { text: "Just one more tiny revision please", category: "Deadline", emoji: "🔧" },
  { text: "This should only take five minutes", category: "Deadline", emoji: "⏱️" },
  { text: "Final version three point seven revised", category: "Deadline", emoji: "📄" },
  { text: "Send it now we can fix it later", category: "Deadline", emoji: "🚀" },
  
  // AI era quotes
  { text: "Chat GPT could probably do this faster", category: "Modern", emoji: "🤖" },
  { text: "Just let the AI make the whole thing", category: "Modern", emoji: "✨" },
  { text: "Why does AI keep adding purple gradients", category: "Modern", emoji: "💜" },
  
  // Positive vibes (rare power-ups)
  { text: "This looks absolutely perfect thank you", category: "Unicorn", emoji: "🦄" },
  { text: "No changes needed ship it now", category: "Unicorn", emoji: "🎉" },
];

// Get WPM tier and roast
const getWPMRating = (wpm: number): { tier: string; roast: string; emoji: string; color: string } => {
  if (wpm >= 80) return { tier: "KEYBOARD DEMON", roast: "Your fingers are literally on fire 🔥", emoji: "👹", color: "#ef4444" };
  if (wpm >= 60) return { tier: "SPEED DEMON", roast: "PowerPoint fears you", emoji: "⚡", color: "#f97316" };
  if (wpm >= 45) return { tier: "CAFFEINE POWERED", roast: "Acceptable. Coffee is working.", emoji: "☕", color: "#eab308" };
  if (wpm >= 30) return { tier: "HUNT & PECK PRO", roast: "Your index fingers are swole", emoji: "👆", color: "#22c55e" };
  if (wpm >= 15) return { tier: "ELOQUENT TURTLE", roast: "Slow and steady... mostly slow", emoji: "🐢", color: "#3b82f6" };
  return { tier: "KEYBOARD CONTEMPLATOR", roast: "Are you typing with chopsticks?", emoji: "🥢", color: "#8b5cf6" };
};

const TypeRacer: React.FC<TypeRacerProps> = ({ onComplete }) => {
  const [gameState, setGameState] = useState<'ready' | 'countdown' | 'playing' | 'finished'>('ready');
  const [currentPhrase, setCurrentPhrase] = useState(PHRASES[0]);
  const [typedText, setTypedText] = useState('');
  const [countdown, setCountdown] = useState(3);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [endTime, setEndTime] = useState<number | null>(null);
  const [errors, setErrors] = useState(0);
  const [totalChars, setTotalChars] = useState(0);
  const [phrasesCompleted, setPhrasesCompleted] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [showPerfect, setShowPerfect] = useState(false);
  const [currentWPM, setCurrentWPM] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get a random phrase
  const getRandomPhrase = useCallback(() => {
    const idx = Math.floor(Math.random() * PHRASES.length);
    return PHRASES[idx];
  }, []);

  // Start game with countdown
  const startGame = () => {
    setGameState('countdown');
    setCountdown(3);
    setTypedText('');
    setErrors(0);
    setTotalChars(0);
    setPhrasesCompleted(0);
    setStreak(0);
    setBestStreak(0);
    setCurrentPhrase(getRandomPhrase());
  };

  // Countdown effect
  useEffect(() => {
    if (gameState !== 'countdown') return;
    
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setGameState('playing');
      setStartTime(Date.now());
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [gameState, countdown]);

  // Calculate live WPM
  useEffect(() => {
    if (gameState !== 'playing' || !startTime) return;
    
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000 / 60; // minutes
      const words = totalChars / 5;
      setCurrentWPM(Math.round(words / elapsed) || 0);
    }, 500);
    
    return () => clearInterval(interval);
  }, [gameState, startTime, totalChars]);

  // Handle typing
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (gameState !== 'playing') return;
    
    const value = e.target.value;
    const targetText = currentPhrase.text.toLowerCase().replace(/[^a-z ]/g, '');
    
    setTypedText(value);
    setTotalChars(tc => tc + 1);
    
    // Check if current input matches so far
    const normalizedValue = value.toLowerCase();
    const normalizedTarget = targetText.slice(0, value.length);
    
    if (normalizedValue !== normalizedTarget) {
      setErrors(err => err + 1);
      setStreak(0);
    }
    
    // Check if phrase is complete
    if (normalizedValue === targetText) {
      const wasNoErrors = value.length > 0 && errors === 0;
      
      if (wasNoErrors) {
        setStreak(s => {
          const newStreak = s + 1;
          if (newStreak > bestStreak) setBestStreak(newStreak);
          return newStreak;
        });
        setShowPerfect(true);
        setTimeout(() => setShowPerfect(false), 800);
      } else {
        setStreak(0);
      }
      
      setPhrasesCompleted(p => p + 1);
      
      // Check if we've done enough phrases (5 for a full game)
      if (phrasesCompleted + 1 >= 5) {
        setGameState('finished');
        setEndTime(Date.now());
        if (onComplete) {
          const elapsed = (Date.now() - (startTime || Date.now())) / 1000 / 60;
          const wpm = Math.round((totalChars / 5) / elapsed);
          const accuracy = Math.round(((totalChars - errors) / totalChars) * 100);
          onComplete(wpm, accuracy);
        }
      } else {
        // Next phrase
        setCurrentPhrase(getRandomPhrase());
        setTypedText('');
        setErrors(0);
      }
    }
  };

  // Calculate final stats
  const getFinalStats = () => {
    if (!startTime || !endTime) return { wpm: 0, accuracy: 0 };
    const elapsed = (endTime - startTime) / 1000 / 60;
    const wpm = Math.round((totalChars / 5) / elapsed);
    const accuracy = Math.round(((totalChars - errors) / totalChars) * 100);
    return { wpm, accuracy };
  };

  const stats = getFinalStats();
  const rating = getWPMRating(stats.wpm);

  // Get character status for display
  const getCharStatus = (index: number): 'correct' | 'incorrect' | 'pending' => {
    if (index >= typedText.length) return 'pending';
    
    const targetText = currentPhrase.text.toLowerCase().replace(/[^a-z ]/g, '');
    const typedChar = typedText[index]?.toLowerCase();
    const targetChar = targetText[index];
    
    return typedChar === targetChar ? 'correct' : 'incorrect';
  };

  const targetText = currentPhrase.text.toLowerCase().replace(/[^a-z ]/g, '');

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header with stats */}
      {gameState === 'playing' && (
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-3">
            <div className="text-xs">
              <span className="text-muted-foreground">WPM: </span>
              <motion.span 
                key={currentWPM}
                initial={{ scale: 1.2 }}
                animate={{ scale: 1 }}
                className="font-bold text-orange-500"
              >
                {currentWPM}
              </motion.span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">Phrases: </span>
              <span className="font-bold text-foreground">{phrasesCompleted}/5</span>
            </div>
          </div>
          
          {streak > 1 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="px-2 py-1 bg-gradient-to-r from-orange-500 to-pink-500 rounded-full"
            >
              <span className="text-xs font-bold text-white">🔥 {streak} streak!</span>
            </motion.div>
          )}
        </div>
      )}

      {/* Game area */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Ready state */}
        {gameState === 'ready' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <div className="text-5xl mb-4">⌨️</div>
            <h3 className="text-lg font-bold mb-2">TYPE FIGHTER</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Type 5 cursed client quotes as fast as you can!
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={startGame}
              className="px-6 py-2 bg-gradient-to-r from-orange-500 to-pink-500 rounded-lg text-white font-bold shadow-lg"
            >
              Start Typing!
            </motion.button>
          </motion.div>
        )}

        {/* Countdown */}
        {gameState === 'countdown' && (
          <motion.div
            key={countdown}
            initial={{ scale: 2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="text-6xl font-black text-orange-500"
          >
            {countdown}
          </motion.div>
        )}

        {/* Playing */}
        {gameState === 'playing' && (
          <div className="w-full max-w-md px-2">
            {/* Category badge */}
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="text-2xl">{currentPhrase.emoji}</span>
              <span className="text-xs font-medium px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full">
                {currentPhrase.category}
              </span>
            </div>

            {/* Perfect streak popup */}
            <AnimatePresence>
              {showPerfect && (
                <motion.div
                  initial={{ scale: 0, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0, y: -20 }}
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
                >
                  <div className="px-4 py-2 bg-green-500 rounded-lg text-white font-bold text-lg">
                    ✨ PERFECT! ✨
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Phrase to type */}
            <div className="relative p-4 bg-gradient-to-br from-orange-50 to-pink-50 dark:from-orange-900/20 dark:to-pink-900/20 rounded-xl border-2 border-orange-200 dark:border-orange-800 mb-3">
              <div className="text-lg font-mono tracking-wide flex flex-wrap">
                {targetText.split('').map((char, i) => {
                  const status = getCharStatus(i);
                  return (
                    <motion.span
                      key={i}
                      className={`
                        ${status === 'correct' ? 'text-green-600 dark:text-green-400' : ''}
                        ${status === 'incorrect' ? 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30' : ''}
                        ${status === 'pending' ? 'text-gray-400' : ''}
                        ${i === typedText.length ? 'border-l-2 border-orange-500 animate-pulse' : ''}
                      `}
                      initial={status === 'correct' ? { scale: 1.1 } : {}}
                      animate={{ scale: 1 }}
                    >
                      {char === ' ' ? '\u00A0' : char}
                    </motion.span>
                  );
                })}
              </div>
            </div>

            {/* Input */}
            <input
              ref={inputRef}
              type="text"
              value={typedText}
              onChange={handleInput}
              className="w-full px-4 py-3 bg-white dark:bg-zinc-800 border-2 border-orange-300 dark:border-orange-700 rounded-xl text-lg font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Start typing..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />

            {/* Progress bar */}
            <div className="mt-3 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-orange-500 to-pink-500"
                initial={{ width: 0 }}
                animate={{ width: `${(phrasesCompleted / 5) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Finished */}
        {gameState === 'finished' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-sm"
          >
            <motion.div
              className="text-6xl mb-2"
              animate={{ rotate: [0, -10, 10, 0] }}
              transition={{ repeat: Infinity, duration: 0.5, delay: 0.5 }}
            >
              {rating.emoji}
            </motion.div>
            
            <h3 className="text-2xl font-black mb-1" style={{ color: rating.color }}>
              {rating.tier}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {rating.roast}
            </p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 bg-gradient-to-br from-orange-100 to-pink-100 dark:from-orange-900/20 dark:to-pink-900/20 rounded-xl">
                <div className="text-2xl font-black text-orange-600">{stats.wpm}</div>
                <div className="text-xs text-muted-foreground">Words/Min</div>
              </div>
              <div className="p-3 bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl">
                <div className="text-2xl font-black text-green-600">{stats.accuracy}%</div>
                <div className="text-xs text-muted-foreground">Accuracy</div>
              </div>
            </div>

            {bestStreak > 0 && (
              <div className="mb-4 text-sm">
                <span className="text-muted-foreground">Best streak: </span>
                <span className="font-bold text-orange-500">🔥 {bestStreak}</span>
              </div>
            )}

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={startGame}
              className="px-6 py-2 bg-gradient-to-r from-orange-500 to-pink-500 rounded-lg text-white font-bold shadow-lg"
            >
              Type Again! 🔄
            </motion.button>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default TypeRacer;

