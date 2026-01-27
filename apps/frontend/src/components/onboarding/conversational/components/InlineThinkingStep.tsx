/**
 * InlineThinkingStep
 * Displays agent thinking/action steps as inline brown text with pulsing dot
 * Matches the agent editor pattern for consistent UX
 */

import React from 'react';
import { motion } from 'framer-motion';

interface InlineThinkingStepProps {
  message: string;
  type?: 'thinking' | 'action' | 'status';
  isActive?: boolean;
}

const InlineThinkingStep: React.FC<InlineThinkingStepProps> = ({
  message,
  type = 'thinking',
  isActive = true,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: -5 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-500 py-0.5"
      style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif', fontWeight: 500 }}
    >
      {isActive ? (
        <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
      ) : (
        <span className="w-1 h-1 rounded-full bg-amber-300 dark:bg-amber-700 flex-shrink-0" />
      )}
      <span className={isActive ? '' : 'opacity-60'}>{message}</span>
    </motion.div>
  );
};

export default InlineThinkingStep;
