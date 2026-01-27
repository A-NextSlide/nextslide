/**
 * AgentStatusBubble - Inline thinking/action display
 * Shows agent status as inline brown text with pulsing dot
 * Matches the agent editor pattern for consistent UX
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ThinkingStep } from '@/types/agentEvents';

interface AgentStatusBubbleProps {
  thinkingSteps: ThinkingStep[];
  streamingText: string;
  statusPhase: string | null;
  statusMessage: string | null;
}

// Map status phases to user-friendly messages
const phaseMessages: Record<string, string> = {
  thinking: 'Processing',
  analyzing: 'Analyzing',
  analyzing_file: 'Reading file',
  files_analyzed: 'Files analyzed',
  researching: 'Searching',
  research_complete: 'Research complete',
  research_failed: 'Search failed',
  scraping: 'Reading content',
  scraped: 'Content gathered',
  scraping_media: 'Finding media',
  media_scraped: 'Media found',
  videos_found: 'Videos found',
  assigning_media: 'Assigning media',
  extracting: 'Extracting',
  extracted: 'Extracted',
  extract_failed: 'Extraction failed',
  compiling: 'Building outline',
  generating: 'Creating presentation',
  enriching: 'Applying theme',
  updating_theme: 'Updating theme',
  updating_slides: 'Updating slides',
  outline_ready: 'Outline ready',
  detecting_brand: 'Detecting brand',
  analyzing_theme: 'Analyzing topic',
  fetching_brand_colors: 'Getting brand colors',
  generating_theme: 'Creating theme',
  theme_complete: 'Theme ready',
  generating_outline: 'Planning slides',
  outline_complete: 'Outline ready',
};

const AgentStatusBubble: React.FC<AgentStatusBubbleProps> = ({
  thinkingSteps,
  streamingText,
  statusPhase,
  statusMessage,
}) => {
  // Get the current status message
  const currentMessage = (() => {
    // If we have thinking steps, show the most recent active one
    if (thinkingSteps.length > 0) {
      const activeStep = thinkingSteps.find(s => s.status === 'active') || thinkingSteps[thinkingSteps.length - 1];
      if (activeStep.detail) {
        return `${activeStep.label}: ${activeStep.detail}`;
      }
      return activeStep.label;
    }

    // If we have a status message with actual content, use it directly
    // The backend now sends complete messages like "Found 5 sources: content preview..."
    if (statusMessage && statusMessage.length > 0) {
      return statusMessage;
    }

    // Fall back to phase mapping if no message provided
    if (statusPhase) {
      return phaseMessages[statusPhase] || statusPhase;
    }

    return 'Processing';
  })();

  return (
    <div className="flex flex-col gap-0.5 py-1">
      {/* Show completed steps as faded */}
      <AnimatePresence mode="popLayout">
        {thinkingSteps.slice(-3).map((step, index) => (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, x: -5 }}
            animate={{ opacity: step.status === 'completed' ? 0.5 : 1, x: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-500"
            style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif', fontWeight: 500 }}
          >
            {step.status === 'active' ? (
              <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
            ) : (
              <span className="w-1 h-1 rounded-full bg-amber-300 dark:bg-amber-700 flex-shrink-0" />
            )}
            <span>
              {step.detail ? `${step.label}: ${step.detail}` : step.label}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Show current status if no thinking steps */}
      {thinkingSteps.length === 0 && (
        <motion.div
          initial={{ opacity: 0, x: -5 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-500"
          style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif', fontWeight: 500 }}
        >
          <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
          <span>{currentMessage}</span>
        </motion.div>
      )}
    </div>
  );
};

export default AgentStatusBubble;
