/**
 * useUpgradeSuccess Hook
 *
 * Handles post-upgrade actions like unlocking slides and showing success feedback.
 * Listens for Stripe success redirect (`?upgrade_success=true`) and triggers
 * deck refetch to unlock all slides.
 */

import { useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useDeckStore } from '@/stores/deckStore';
import { useCredits } from '@/context/CreditsContext';

interface UseUpgradeSuccessOptions {
  /** Called when upgrade is detected and processed */
  onUpgradeSuccess?: () => void;
}

/**
 * Hook to handle post-upgrade success flow.
 * - Detects `?upgrade_success=true` in URL
 * - Shows success toast
 * - Triggers deck refetch to unlock slides
 * - Dispatches event for any listeners
 */
export function useUpgradeSuccess(options: UseUpgradeSuccessOptions = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { refreshBalance } = useCredits();
  const processedRef = useRef(false);

  useEffect(() => {
    const isUpgradeSuccess = searchParams.get('upgrade_success') === 'true';

    if (isUpgradeSuccess && !processedRef.current) {
      processedRef.current = true;

      // Remove the query param from URL without navigation
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('upgrade_success');
      setSearchParams(newParams, { replace: true });

      // Show success toast
      toast({
        title: "Upgrade successful!",
        description: "All your slides are now unlocked. You can share your full presentation.",
        duration: 5000,
      });

      // Refresh credits balance
      refreshBalance();

      // Dispatch event for any listeners (e.g., deck page can refetch)
      window.dispatchEvent(new CustomEvent('upgrade:success', {
        detail: { timestamp: Date.now() }
      }));

      // Call callback if provided
      options.onUpgradeSuccess?.();
    }
  }, [searchParams, setSearchParams, toast, refreshBalance, options]);

  return {
    wasJustUpgraded: processedRef.current
  };
}

export default useUpgradeSuccess;
