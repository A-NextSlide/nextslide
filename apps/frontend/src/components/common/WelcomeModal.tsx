/**
 * WelcomeModal
 * First-time user welcome modal with NextSlide branding
 * Shows only once on first login
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, Sparkles, Zap, Palette, MessageSquare } from 'lucide-react';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
}

const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose, userName }) => {
  const displayName = userName?.split(' ')[0] || 'there';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100000] flex items-center justify-center"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="relative w-full max-w-md mx-4"
          >
            <div
              style={{
                background: 'linear-gradient(180deg, rgba(24, 24, 27, 0.98) 0%, rgba(18, 18, 21, 0.98) 100%)',
                backdropFilter: 'blur(20px)',
                borderRadius: 20,
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 107, 0, 0.1)',
                overflow: 'hidden',
              }}
            >
              {/* Header accent line */}
              <div
                style={{
                  height: 3,
                  background: 'linear-gradient(90deg, #FF6B00, #FF8533, #FF6B00)',
                }}
              />

              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-white/80 hover:bg-white/10 transition-all"
              >
                <X size={16} />
              </button>

              <div className="p-8">
                {/* Brand wordmark */}
                <div className="flex items-center gap-1 mb-6">
                  <span
                    style={{
                      fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                      fontWeight: 900,
                      fontSize: 22,
                      letterSpacing: '0%',
                      textTransform: 'uppercase',
                      color: '#fff',
                    }}
                  >
                    NE
                  </span>
                  <svg
                    viewBox="0 0 64 64"
                    width={28}
                    height={42}
                    style={{ margin: '0 1px' }}
                  >
                    <path d="M8 8 L56 56" stroke="#FF4301" strokeWidth={11} strokeLinecap="round" />
                    <path d="M56 8 L8 56" stroke="#FF4301" strokeWidth={11} strokeLinecap="round" />
                  </svg>
                  <span
                    style={{
                      fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                      fontWeight: 900,
                      fontSize: 22,
                      letterSpacing: '0%',
                      textTransform: 'uppercase',
                      color: '#fff',
                    }}
                  >
                    TSLIDE
                  </span>
                </div>

                {/* Welcome message */}
                <h2
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: '#fff',
                    marginBottom: 12,
                    lineHeight: 1.2,
                  }}
                >
                  Welcome, {displayName}
                </h2>

                <p
                  style={{
                    fontSize: 15,
                    color: 'rgba(255, 255, 255, 0.6)',
                    lineHeight: 1.6,
                    marginBottom: 28,
                  }}
                >
                  Create stunning presentations in minutes. Just describe what you want,
                  and AI handles the rest.
                </p>

                {/* Feature highlights */}
                <div className="space-y-3 mb-8">
                  {[
                    { icon: <Sparkles size={16} />, text: 'AI-powered slide generation' },
                    { icon: <Palette size={16} />, text: 'Beautiful themes that match your brand' },
                    { icon: <MessageSquare size={16} />, text: 'Chat to edit any element' },
                    { icon: <Zap size={16} />, text: 'Export to PowerPoint instantly' },
                  ].map((feature, i) => (
                    <motion.div
                      key={feature.text}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 + i * 0.1 }}
                      className="flex items-center gap-3"
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: 'rgba(255, 107, 0, 0.15)',
                          border: '1px solid rgba(255, 107, 0, 0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#FF8533',
                        }}
                      >
                        {feature.icon}
                      </div>
                      <span style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.8)' }}>
                        {feature.text}
                      </span>
                    </motion.div>
                  ))}
                </div>

                {/* CTA Button */}
                <motion.button
                  onClick={onClose}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '14px 24px',
                    fontSize: 15,
                    fontWeight: 600,
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(255, 107, 0, 0.3)',
                  }}
                >
                  Get Started
                  <ArrowRight size={18} />
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WelcomeModal;
