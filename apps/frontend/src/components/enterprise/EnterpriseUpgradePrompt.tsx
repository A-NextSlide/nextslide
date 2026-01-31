/**
 * EnterpriseUpgradePrompt
 *
 * A floating toast-style card that slides in from the bottom-right corner when
 * the current user's email domain has 3+ NextSlide users (PQA detection).
 *
 * The prompt encourages upgrading to the Team plan and can be dismissed
 * (hidden for 7 days). Tracks impressions, dismissals, and CTA clicks in
 * PostHog via the analytics service.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/SupabaseAuthContext';
import { pqaApi } from '@/services/pqaApi';
import {
  trackPqaPromptShown,
  trackPqaPromptDismissed,
  trackPqaPromptClicked,
} from '@/services/analytics';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const EnterpriseUpgradePrompt: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [isVisible, setIsVisible] = useState(false);
  const [domain, setDomain] = useState('');
  const [userCount, setUserCount] = useState(0);

  // Fetch prompt status on mount (only for logged-in users)
  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const status = await pqaApi.getPromptStatus();

        if (cancelled) return;

        if (status.should_show) {
          setDomain(status.domain);
          setUserCount(status.user_count);
          setIsVisible(true);
          trackPqaPromptShown({
            domain: status.domain,
            userCount: status.user_count,
          });
        }
      } catch {
        // Silently fail -- prompts are non-critical
      }
    };

    fetchStatus();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Dismiss handler
  const handleDismiss = useCallback(async () => {
    setIsVisible(false);
    trackPqaPromptDismissed({ domain });

    try {
      await pqaApi.dismissPrompt('pqa_team_detected');
    } catch {
      // Best-effort dismiss
    }
  }, [domain]);

  // CTA handler
  const handleUpgradeClick = useCallback(() => {
    trackPqaPromptClicked({ domain, destination: '/pricing' });
    setIsVisible(false);
    navigate('/pricing');
  }, [domain, navigate]);

  // Don't render anything for unauthenticated users
  if (!user) return null;

  return (
    <AnimatePresence>
      {isVisible && (
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
              <div className="mt-0.5">
                <Building2 className="h-5 w-5 text-indigo-500 flex-shrink-0" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight">
                  {userCount} people at {domain} use NextSlide
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  Upgrade to Team for shared brand controls, team templates,
                  and 20% off per seat.
                </p>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-3">
                  <Button
                    size="sm"
                    onClick={handleUpgradeClick}
                    className="h-7 text-xs"
                  >
                    <Building2 className="h-3.5 w-3.5 mr-1.5" />
                    Upgrade to Team
                  </Button>
                  <button
                    onClick={handleDismiss}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Maybe later
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default EnterpriseUpgradePrompt;
