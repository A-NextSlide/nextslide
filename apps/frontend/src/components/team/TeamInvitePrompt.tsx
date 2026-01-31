/**
 * TeamInvitePrompt
 *
 * A floating toast-style card that appears in the bottom-right corner.
 * Shows contextual team invite prompts triggered by user activity:
 *   1. "after_3rd_deck"  - After the user creates their 3rd deck
 *   2. "after_share"     - After the user shares a presentation
 *   3. "after_100_views" - After the user accumulates 100+ total views
 *
 * Each prompt can be dismissed (hidden for 7 days).
 * The "Invite Team" CTA opens the team invite dialog.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Users, Share2, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sharingApi, type PromptStatus } from '@/services/sharingApi';
import {
  trackTeamInvitePromptShown,
  trackTeamInvitePromptDismissed,
  trackTeamInvitePromptClicked,
} from '@/services/analytics';

// ---------------------------------------------------------------------------
// Prompt variant definitions
// ---------------------------------------------------------------------------

interface PromptVariant {
  key: string;
  icon: React.ReactNode;
  title: string;
  message: string;
}

const PROMPT_VARIANTS: PromptVariant[] = [
  {
    key: 'after_3rd_deck',
    icon: <Users className="h-5 w-5 text-blue-500 flex-shrink-0" />,
    title: 'Working with a team?',
    message: 'Invite them for free collaboration on presentations.',
  },
  {
    key: 'after_share',
    icon: <Share2 className="h-5 w-5 text-green-500 flex-shrink-0" />,
    title: 'Want your team creating too?',
    message: 'Invite your team so they can create presentations as well.',
  },
  {
    key: 'after_100_views',
    icon: <TrendingUp className="h-5 w-5 text-purple-500 flex-shrink-0" />,
    title: 'Your presentations are taking off!',
    message: 'Get your team on NextSlide to create even more great content.',
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TeamInvitePromptProps {
  /** Called when the user clicks "Invite Team". Parent should open the invite dialog. */
  onInviteClick?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TeamInvitePrompt: React.FC<TeamInvitePromptProps> = ({ onInviteClick }) => {
  const [activeVariant, setActiveVariant] = useState<PromptVariant | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Fetch prompt status and decide which variant to show
  useEffect(() => {
    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const status: PromptStatus = await sharingApi.getPromptStatus();

        if (cancelled) return;

        // Pick the first eligible + non-dismissed prompt
        for (const variant of PROMPT_VARIANTS) {
          const info = status.prompts[variant.key as keyof typeof status.prompts];
          if (info && info.eligible && !info.dismissed) {
            setActiveVariant(variant);
            setIsVisible(true);
            trackTeamInvitePromptShown(variant.key);
            return;
          }
        }

        // No eligible prompt
        setActiveVariant(null);
        setIsVisible(false);
      } catch {
        // Silently fail -- prompts are non-critical
      }
    };

    fetchStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  // Dismiss handler
  const handleDismiss = useCallback(async () => {
    if (!activeVariant) return;

    setIsVisible(false);
    trackTeamInvitePromptDismissed(activeVariant.key);

    try {
      await sharingApi.dismissPrompt(activeVariant.key);
    } catch {
      // Best-effort dismiss
    }
  }, [activeVariant]);

  // CTA handler
  const handleInviteClick = useCallback(() => {
    if (!activeVariant) return;
    trackTeamInvitePromptClicked(activeVariant.key);
    onInviteClick?.();
    setIsVisible(false);
  }, [activeVariant, onInviteClick]);

  return (
    <AnimatePresence>
      {isVisible && activeVariant && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          className="fixed bottom-6 right-6 z-50 w-80 max-w-[calc(100vw-3rem)]"
        >
          <div className="relative rounded-xl border border-border/60 bg-background/95 backdrop-blur-sm shadow-lg p-4">
            {/* Dismiss button */}
            <button
              onClick={handleDismiss}
              className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            <div className="flex items-start gap-3 pr-4">
              {/* Icon */}
              <div className="mt-0.5">{activeVariant.icon}</div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight">
                  {activeVariant.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  {activeVariant.message}
                </p>

                {/* CTA */}
                <Button
                  size="sm"
                  onClick={handleInviteClick}
                  className="mt-3 h-7 text-xs"
                >
                  <Users className="h-3.5 w-3.5 mr-1.5" />
                  Invite Team
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TeamInvitePrompt;
