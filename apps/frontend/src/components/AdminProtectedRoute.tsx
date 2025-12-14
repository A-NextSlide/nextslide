import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { API_CONFIG } from '@/config/environment';

interface AdminProtectedRouteProps {
  children: React.ReactNode;
}

// Cache admin verification to avoid re-checking on every route change
let cachedVerification: { userId: string; verified: boolean; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const AdminProtectedRoute: React.FC<AdminProtectedRouteProps> = ({ children }) => {
  const { user, isLoading: authLoading, isAdmin, adminRole, isAdminLoading, refreshAdminStatus } = useAuth();
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(() => {
    // Check cache on mount
    if (cachedVerification && user?.id === cachedVerification.userId) {
      if (Date.now() - cachedVerification.timestamp < CACHE_DURATION) {
        return cachedVerification.verified;
      }
    }
    return null;
  });
  const verificationStarted = useRef(false);

  const hasAdminAccess = useMemo(() => {
    return isAdmin === true || adminRole === 'admin' || adminRole === 'super_admin' || adminRole === 'superadmin';
  }, [isAdmin, adminRole]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setVerified(false);
      return;
    }

    // Check cache first
    if (cachedVerification && user.id === cachedVerification.userId) {
      if (Date.now() - cachedVerification.timestamp < CACHE_DURATION) {
        setVerified(cachedVerification.verified);
        return;
      }
    }

    // If already verified from context, use that
    if (hasAdminAccess) {
      setVerified(true);
      cachedVerification = { userId: user.id, verified: true, timestamp: Date.now() };
      return;
    }

    // Prevent duplicate verification calls
    if (verificationStarted.current) return;
    verificationStarted.current = true;

    // Verify with backend once
    (async () => {
      try {
        setVerifying(true);
        try { await refreshAdminStatus(); } catch {}

        if (isAdmin || adminRole === 'admin' || adminRole === 'super_admin' || adminRole === 'superadmin') {
          setVerified(true);
          cachedVerification = { userId: user.id, verified: true, timestamp: Date.now() };
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          setVerified(false);
          cachedVerification = { userId: user.id, verified: false, timestamp: Date.now() };
          return;
        }

        const apiBase = API_CONFIG.BASE_URL.replace(/\/$/, '');
        const res = await fetch(`${apiBase}/admin/check`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!res.ok) {
          setVerified(false);
          cachedVerification = { userId: user.id, verified: false, timestamp: Date.now() };
          return;
        }

        const raw = await res.json();
        const flag = Boolean(
          raw?.isAdmin === true ||
          raw?.is_admin === true ||
          (raw?.role && (raw.role === 'admin' || raw.role === 'super_admin' || raw.role === 'superadmin'))
        );
        setVerified(flag);
        cachedVerification = { userId: user.id, verified: flag, timestamp: Date.now() };
      } finally {
        setVerifying(false);
      }
    })();
  }, [authLoading, user?.id, hasAdminAccess]);

  // Show loading only on initial auth check, not on cached verification
  if (authLoading || isAdminLoading) {
    return null; // Let the layout show, avoid full-screen loading flash
  }

  // Only show loading during active verification (first time)
  if (verifying && verified === null) {
    return null; // Avoid loading flash, let pages handle their own loading
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (verified === false) {
    return <Navigate to="/app" replace />;
  }

  // Allow rendering while verification completes if we have cached/context admin status
  if (verified === null && !hasAdminAccess) {
    return null;
  }

  return <>{children}</>;
};

export default AdminProtectedRoute;