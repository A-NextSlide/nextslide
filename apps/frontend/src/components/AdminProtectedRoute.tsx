import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/SupabaseAuthContext';
import { authService } from '@/services/authService';
import LoadingDisplay from '@/components/common/LoadingDisplay';
import { supabase } from '@/integrations/supabase/client';

interface AdminProtectedRouteProps {
  children: React.ReactNode;
}

const AdminProtectedRoute: React.FC<AdminProtectedRouteProps> = ({ children }) => {
  const { user, isLoading: authLoading, isAdmin, adminRole, isAdminLoading, refreshAdminStatus } = useAuth();
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);

  const hasAdminAccess = useMemo(() => {
    return isAdmin === true || adminRole === 'admin' || adminRole === 'super_admin' || adminRole === 'superadmin';
  }, [isAdmin, adminRole]);

  // Initial resolution based on context
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setVerified(false);
      return;
    }
    if (hasAdminAccess) {
      setVerified(true);
      return;
    }
    // If not clearly admin from context, verify explicitly once
    let cancelled = false;
    (async () => {
      try {
        setVerifying(true);
        try { await refreshAdminStatus(); } catch {}
        if (cancelled) return;
        if (isAdmin || (adminRole === 'admin' || adminRole === 'super_admin' || adminRole === 'superadmin')) {
          setVerified(true);
          return;
        }
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          setVerified(false);
          return;
        }
        const res = await fetch('/api/admin/check', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) {
          setVerified(false);
          return;
        }
        const raw = await res.json();
        const flag = Boolean(
          raw?.isAdmin === true ||
          raw?.is_admin === true ||
          (raw?.role && (raw.role === 'admin' || raw.role === 'super_admin' || raw.role === 'superadmin'))
        );
        setVerified(flag);
      } finally {
        setVerifying(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, user, hasAdminAccess, refreshAdminStatus, isAdmin, adminRole]);

  if (authLoading || isAdminLoading || verifying || verified === null) {
    return (
      <div className="fixed inset-0 w-full h-full">
        <LoadingDisplay message="Loading..." />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!verified) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
};

export default AdminProtectedRoute;