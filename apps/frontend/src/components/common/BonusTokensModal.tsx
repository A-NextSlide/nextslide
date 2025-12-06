/**
 * BonusTokensModal
 * Gamified welcome modal showing 500 bonus tokens for early users
 * Features: token rain animation, claim button, zoom to settings
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { Gift, Sparkles, Coins, Zap, Star, Crown } from 'lucide-react';

interface BonusTokensModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
}

// Individual floating token component
const FloatingToken: React.FC<{ delay: number; x: number }> = ({ delay, x }) => {
  return (
    <motion.div
      initial={{ y: -20, x, opacity: 0, scale: 0 }}
      animate={{
        y: [0, 300, 600],
        opacity: [0, 1, 0],
        scale: [0.5, 1, 0.5],
        rotate: [0, 180, 360],
      }}
      transition={{
        duration: 3,
        delay,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
      className="absolute"
      style={{ left: `${x}%`, top: 0 }}
    >
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
          boxShadow: '0 0 10px rgba(255, 215, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Coins size={12} color="#8B4513" />
      </div>
    </motion.div>
  );
};

// Burst token for claim animation
const BurstToken: React.FC<{ index: number; isActive: boolean }> = ({ index, isActive }) => {
  const angle = (index * 360) / 12;
  const rad = (angle * Math.PI) / 180;

  return (
    <motion.div
      initial={{ scale: 0, x: 0, y: 0, opacity: 0 }}
      animate={isActive ? {
        scale: [0, 1.5, 0],
        x: Math.cos(rad) * 150,
        y: Math.sin(rad) * 150,
        opacity: [0, 1, 0],
      } : {}}
      transition={{ duration: 0.8, ease: 'easeOut' }}
      className="absolute"
      style={{
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
        boxShadow: '0 0 15px rgba(255, 215, 0, 0.8)',
      }}
    />
  );
};

const BonusTokensModal: React.FC<BonusTokensModalProps> = ({ isOpen, onClose, userName }) => {
  const [phase, setPhase] = useState<'intro' | 'counting' | 'claimed' | 'zooming'>('intro');
  const [displayCount, setDisplayCount] = useState(0);
  const [showBurst, setShowBurst] = useState(false);
  const displayName = userName?.split(' ')[0] || 'there';
  const mainControls = useAnimation();

  // Token count animation
  useEffect(() => {
    if (phase === 'counting') {
      const duration = 2000;
      const steps = 50;
      const increment = 200 / steps;
      const stepTime = duration / steps;

      let current = 0;
      const interval = setInterval(() => {
        current += increment;
        if (current >= 200) {
          setDisplayCount(200);
          clearInterval(interval);
          setTimeout(() => setPhase('claimed'), 500);
        } else {
          setDisplayCount(Math.floor(current));
        }
      }, stepTime);

      return () => clearInterval(interval);
    }
  }, [phase]);

  const handleClaim = useCallback(() => {
    setShowBurst(true);
    setPhase('counting');
  }, []);

  const handleFinish = useCallback(async () => {
    setPhase('zooming');

    // Animate the token count flying to top-right (where credits indicator is)
    await mainControls.start({
      x: window.innerWidth / 2 - 100,
      y: -window.innerHeight / 2 + 50,
      scale: 0.1,
      opacity: 0,
      transition: { duration: 0.8, ease: 'easeInOut' }
    });

    onClose();
  }, [mainControls, onClose]);

  // Generate random positions for floating tokens
  const floatingTokens = Array.from({ length: 20 }, (_, i) => ({
    delay: i * 0.15,
    x: Math.random() * 100,
  }));

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100000] flex items-center justify-center overflow-hidden"
        >
          {/* Backdrop with stars */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.95) 100%)',
              backdropFilter: 'blur(10px)',
            }}
          />

          {/* Floating tokens background */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {floatingTokens.map((token, i) => (
              <FloatingToken key={i} delay={token.delay} x={token.x} />
            ))}
          </div>

          {/* Sparkle effects */}
          <div className="absolute inset-0 pointer-events-none">
            {Array.from({ length: 30 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0 }}
                animate={{
                  opacity: [0, 1, 0],
                  scale: [0, 1, 0],
                }}
                transition={{
                  duration: 2,
                  delay: i * 0.1,
                  repeat: Infinity,
                }}
                className="absolute"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                }}
              >
                <Star size={8} fill="#FFD700" color="#FFD700" />
              </motion.div>
            ))}
          </div>

          {/* Main Modal */}
          <motion.div
            animate={mainControls}
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            className="relative"
          >
            <motion.div
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="relative w-full max-w-md mx-4"
            >
              <div
                style={{
                  background: 'linear-gradient(180deg, rgba(30, 30, 35, 0.98) 0%, rgba(20, 20, 25, 0.98) 100%)',
                  backdropFilter: 'blur(20px)',
                  borderRadius: 24,
                  border: '2px solid rgba(255, 215, 0, 0.3)',
                  boxShadow: '0 0 60px rgba(255, 215, 0, 0.2), 0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                  overflow: 'hidden',
                }}
              >
                {/* Animated top border */}
                <motion.div
                  animate={{
                    background: [
                      'linear-gradient(90deg, #FFD700, #FFA500, #FFD700)',
                      'linear-gradient(90deg, #FFA500, #FFD700, #FFA500)',
                    ],
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                  style={{ height: 4 }}
                />

                <div className="p-8 text-center">
                  {/* Gift Icon with glow */}
                  <motion.div
                    animate={{
                      scale: [1, 1.1, 1],
                      rotate: phase === 'intro' ? [0, -5, 5, 0] : 0,
                    }}
                    transition={{ duration: 2, repeat: phase === 'intro' ? Infinity : 0 }}
                    className="relative mx-auto mb-6"
                    style={{ width: 100, height: 100 }}
                  >
                    <div
                      style={{
                        width: 100,
                        height: 100,
                        borderRadius: 24,
                        background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.2) 0%, rgba(255, 165, 0, 0.2) 100%)',
                        border: '2px solid rgba(255, 215, 0, 0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 0 30px rgba(255, 215, 0, 0.3)',
                      }}
                    >
                      <Gift size={48} color="#FFD700" strokeWidth={1.5} />
                    </div>

                    {/* Burst tokens on claim */}
                    {showBurst && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        {Array.from({ length: 12 }).map((_, i) => (
                          <BurstToken key={i} index={i} isActive={showBurst} />
                        ))}
                      </div>
                    )}
                  </motion.div>

                  {/* Title */}
                  <motion.h2
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    style={{
                      fontSize: 28,
                      fontWeight: 800,
                      background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FFD700 100%)',
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      marginBottom: 8,
                    }}
                  >
                    {phase === 'intro' && `Welcome, ${displayName}!`}
                    {(phase === 'counting' || phase === 'claimed' || phase === 'zooming') && 'Bonus Claimed!'}
                  </motion.h2>

                  {/* Subtitle */}
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    style={{
                      fontSize: 16,
                      color: 'rgba(255, 255, 255, 0.7)',
                      marginBottom: 32,
                      lineHeight: 1.6,
                    }}
                  >
                    {phase === 'intro' && (
                      <>
                        A special gift from <span style={{ color: '#FF6B00', fontWeight: 600 }}>NextSlide</span> for being an early user!
                      </>
                    )}
                    {(phase === 'counting' || phase === 'claimed' || phase === 'zooming') && (
                      <>Added to your account!</>
                    )}
                  </motion.p>

                  {/* Token Display */}
                  <motion.div
                    layout
                    className="relative mx-auto mb-8"
                    style={{
                      width: 200,
                      height: 200,
                      borderRadius: '50%',
                      background: 'radial-gradient(circle at 30% 30%, rgba(255, 215, 0, 0.15) 0%, rgba(255, 165, 0, 0.05) 50%, transparent 70%)',
                      border: '3px solid rgba(255, 215, 0, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'column',
                      boxShadow: 'inset 0 0 30px rgba(255, 215, 0, 0.1), 0 0 40px rgba(255, 215, 0, 0.2)',
                    }}
                  >
                    {/* Rotating ring */}
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                      className="absolute inset-0"
                      style={{
                        borderRadius: '50%',
                        border: '2px dashed rgba(255, 215, 0, 0.2)',
                      }}
                    />

                    {/* Token icons around the circle */}
                    {[0, 60, 120, 180, 240, 300].map((angle, i) => (
                      <motion.div
                        key={angle}
                        animate={{
                          scale: [1, 1.2, 1],
                          opacity: [0.5, 1, 0.5],
                        }}
                        transition={{
                          duration: 2,
                          delay: i * 0.3,
                          repeat: Infinity,
                        }}
                        className="absolute"
                        style={{
                          left: '50%',
                          top: '50%',
                          transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-85px)`,
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                            boxShadow: '0 0 10px rgba(255, 215, 0, 0.6)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Coins size={14} color="#8B4513" />
                        </div>
                      </motion.div>
                    ))}

                    {/* Center content */}
                    <motion.div
                      animate={phase !== 'intro' ? { scale: [1, 1.1, 1] } : {}}
                      transition={{ duration: 0.5 }}
                      className="flex flex-col items-center"
                    >
                      <motion.span
                        key={displayCount}
                        initial={{ scale: 1.2 }}
                        animate={{ scale: 1 }}
                        style={{
                          fontSize: 56,
                          fontWeight: 900,
                          color: '#FFD700',
                          textShadow: '0 0 20px rgba(255, 215, 0, 0.5)',
                          lineHeight: 1,
                        }}
                      >
                        {phase === 'intro' ? '200' : displayCount}
                      </motion.span>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: 'rgba(255, 215, 0, 0.8)',
                          textTransform: 'uppercase',
                          letterSpacing: 2,
                          marginTop: 4,
                        }}
                      >
                        Tokens
                      </span>
                    </motion.div>
                  </motion.div>

                  {/* Early Bird Badge */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="flex items-center justify-center gap-2 mb-8"
                  >
                    <Crown size={16} color="#FFD700" />
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'rgba(255, 215, 0, 0.9)',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                      }}
                    >
                      Early User Bonus
                    </span>
                    <Crown size={16} color="#FFD700" />
                  </motion.div>

                  {/* CTA Button */}
                  {phase === 'intro' && (
                    <motion.button
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      onClick={handleClaim}
                      whileHover={{ scale: 1.05, boxShadow: '0 0 40px rgba(255, 215, 0, 0.5)' }}
                      whileTap={{ scale: 0.95 }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 12,
                        padding: '16px 32px',
                        fontSize: 18,
                        fontWeight: 700,
                        borderRadius: 16,
                        background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                        border: 'none',
                        color: '#1a1a1a',
                        cursor: 'pointer',
                        boxShadow: '0 4px 20px rgba(255, 215, 0, 0.4)',
                      }}
                    >
                      <Sparkles size={22} />
                      Claim Your Tokens
                      <Sparkles size={22} />
                    </motion.button>
                  )}

                  {(phase === 'claimed' || phase === 'zooming') && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={handleFinish}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 12,
                        padding: '16px 32px',
                        fontSize: 18,
                        fontWeight: 700,
                        borderRadius: 16,
                        background: 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)',
                        border: 'none',
                        color: '#fff',
                        cursor: 'pointer',
                        boxShadow: '0 4px 20px rgba(255, 107, 0, 0.4)',
                      }}
                    >
                      <Zap size={22} />
                      Start Creating!
                    </motion.button>
                  )}

                  {/* Subtle hint */}
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    style={{
                      fontSize: 12,
                      color: 'rgba(255, 255, 255, 0.4)',
                      marginTop: 16,
                    }}
                  >
                    Each slide costs 5 tokens • Make up to 40 slides!
                  </motion.p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BonusTokensModal;
