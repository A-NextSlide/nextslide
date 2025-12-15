import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/context/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { API_CONFIG } from '@/config/environment';
import { AdminDataProvider } from '@/context/AdminDataContext';

interface AdminProtectedRouteProps {
  children: React.ReactNode;
}

// Cache admin verification to avoid re-checking on every route change
let cachedVerification: { userId: string; verified: boolean; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Minimal admin layout shell for loading states (prevents layout jump)
const AdminLoadingShell: React.FC = () => {
  return (
    <div className="min-h-screen w-full bg-[#fafafa] dark:bg-[#0a0a0a] flex flex-col">
      {/* Top Bar */}
      <header className="h-12 bg-white dark:bg-[#111] border-b border-[#eaeaea] dark:border-[#333] fixed top-0 left-0 right-0 z-40">
        <div className="h-full flex items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link to="/admin" className="flex items-center gap-2">
              <span className="font-semibold text-sm">nextslide</span>
              <span className="text-[#666] dark:text-[#888] text-xs">/</span>
              <span className="text-[#666] dark:text-[#888] text-sm">admin</span>
            </Link>
          </div>
        </div>
      </header>
      {/* Main Content - Loading skeleton */}
      <main className="pt-12 flex-1 w-full h-[calc(100vh-3rem)] overflow-auto">
        <div className="w-full h-full px-4 py-4">
          <div className="space-y-3 animate-pulse">
            <div className="h-6 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
            <div className="grid grid-cols-4 gap-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 bg-zinc-200 dark:bg-zinc-800 rounded" />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

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

  // Show loading shell during initial auth check (prevents layout jump)
  if (authLoading || isAdminLoading) {
    return <AdminLoadingShell />;
  }

  // Show loading shell during active verification (first time)
  if (verifying && verified === null) {
    return <AdminLoadingShell />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (verified === false) {
    return <Navigate to="/app" replace />;
  }

  // Show loading shell while verification completes if we don't have cached/context admin status
  if (verified === null && !hasAdminAccess) {
    return <AdminLoadingShell />;
  }

  return <AdminDataProvider>{children}</AdminDataProvider>;
};

export default AdminProtectedRoute;