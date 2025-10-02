import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/SupabaseAuthContext';
import LoadingDisplay from '@/components/common/LoadingDisplay';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

export function ProtectedRoute({ children, requireAuth = true }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="fixed inset-0 w-full h-full">
        <LoadingDisplay message="Loading..." />
      </div>
    );
  }

  // If authentication is required and user is not authenticated, redirect to login
  if (requireAuth && !isAuthenticated) {
    // Save the attempted location so we can redirect back after login
    const redirectPath = location.pathname + location.search + location.hash;
    
    // Store the redirect path in sessionStorage for persistence
    if (redirectPath !== '/login' && redirectPath !== '/') {
      sessionStorage.setItem('authRedirectPath', redirectPath);
    }
    
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If authentication is not required but user is authenticated, redirect to app
  if (!requireAuth && isAuthenticated) {
    // Check if we have a saved redirect path
    const redirectPath = sessionStorage.getItem('authRedirectPath');
    if (redirectPath) {
      sessionStorage.removeItem('authRedirectPath');
      return <Navigate to={redirectPath} replace />;
    }
    return <Navigate to="/app" replace />;
  }

  // All checks passed, render children
  return <>{children}</>;
} 