/**
 * Credits Context
 *
 * Provides credit balance and usage information throughout the app.
 * Handles credit checking before AI operations.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { billingApi, type CreditBalance } from '@/services/billingApi';
import { useAuth } from '@/context/SupabaseAuthContext';

interface UpgradePromptMetadata {
  lockedCount?: number;
}

interface CreditsContextType {
  balance: CreditBalance | null;
  loading: boolean;
  error: string | null;
  refreshBalance: () => Promise<void>;
  checkCredits: (action: string) => Promise<{ hasCredits: boolean; cost: number; remaining: number }>;
  showUpgradePrompt: boolean;
  setShowUpgradePrompt: (show: boolean) => void;
  insufficientCreditsAction: string | null;
  /** Trigger upgrade prompt with custom action and metadata */
  triggerUpgradePrompt: (action: string, metadata?: UpgradePromptMetadata) => void;
  /** Metadata for upgrade prompt */
  upgradePromptMetadata: UpgradePromptMetadata | null;
}

const CreditsContext = createContext<CreditsContextType | null>(null);

export function CreditsProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const userId = user?.id;
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [insufficientCreditsAction, setInsufficientCreditsAction] = useState<string | null>(null);
  const [upgradePromptMetadata, setUpgradePromptMetadata] = useState<UpgradePromptMetadata | null>(null);
  const fetchingRef = useRef(false);

  // Trigger upgrade prompt with custom action and metadata
  const triggerUpgradePrompt = useCallback((action: string, metadata?: UpgradePromptMetadata) => {
    setInsufficientCreditsAction(action);
    setUpgradePromptMetadata(metadata || null);
    setShowUpgradePrompt(true);
  }, []);

  const refreshBalance = useCallback(async () => {
    // Wait for auth to finish loading and require user to be logged in
    if (authLoading || !userId) {
      setBalance(null);
      return;
    }

    if (fetchingRef.current) return;
    fetchingRef.current = true;

    setLoading(true);
    setError(null);

    try {
      const data = await billingApi.getBalance();
      setBalance(data);
    } catch (err) {
      console.error('[CreditsContext] Failed to fetch credits:', err);
      setError('Failed to load credits');
      // Set a default balance to prevent crashes
      setBalance(null);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [userId, authLoading]);

  // Load balance when auth is ready and user changes
  useEffect(() => {
    if (!authLoading) {
      refreshBalance();
    }
  }, [userId, authLoading]);

  // Check credits before an action
  const checkCredits = useCallback(async (action: string) => {
    try {
      const result = await billingApi.checkCredits(action);

      if (!result.has_credits) {
        setInsufficientCreditsAction(action);
        setShowUpgradePrompt(true);
      }

      return {
        hasCredits: result.has_credits,
        cost: result.cost,
        remaining: result.remaining
      };
    } catch (err) {
      console.error('Failed to check credits:', err);
      // Default to allowing the action if check fails
      return { hasCredits: true, cost: 0, remaining: 0 };
    }
  }, []);

  return (
    <CreditsContext.Provider
      value={{
        balance,
        loading,
        error,
        refreshBalance,
        checkCredits,
        showUpgradePrompt,
        setShowUpgradePrompt,
        insufficientCreditsAction,
        triggerUpgradePrompt,
        upgradePromptMetadata
      }}
    >
      {children}
    </CreditsContext.Provider>
  );
}

export function useCredits() {
  const context = useContext(CreditsContext);
  if (!context) {
    throw new Error('useCredits must be used within a CreditsProvider');
  }
  return context;
}

// Hook for checking credits before an action
export function useCheckCredits() {
  const { checkCredits, balance, refreshBalance } = useCredits();

  const checkAndConsume = useCallback(async (action: string): Promise<boolean> => {
    const result = await checkCredits(action);

    if (result.hasCredits) {
      // Refresh balance after a short delay to show updated credits
      setTimeout(() => refreshBalance(), 1000);
    }

    return result.hasCredits;
  }, [checkCredits, refreshBalance]);

  return { checkAndConsume, balance };
}
