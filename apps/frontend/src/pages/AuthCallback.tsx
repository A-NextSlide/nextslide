import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import LoadingDisplay from '@/components/common/LoadingDisplay';
import { useToast } from '@/hooks/use-toast';

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        console.log('[AuthCallback] Starting authentication callback handling...');
        console.log('[AuthCallback] Full URL:', window.location.href);
        
        // Get parameters from both query string and hash
        const urlParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        
        // Check for errors in both places
        const error = urlParams.get('error') || hashParams.get('error');
        const errorDescription = urlParams.get('error_description') || hashParams.get('error_description');
        const errorCode = urlParams.get('error_code') || hashParams.get('error_code');

        if (error) {
          console.error('[AuthCallback] Error in URL:', { error, errorDescription, errorCode });
          
          // Provide more specific error messages
          let userMessage = errorDescription || "An error occurred during authentication";
          
          if (error === 'access_denied') {
            userMessage = "You cancelled the authentication process. Please try again.";
          } else if (errorDescription?.includes('OTP')) {
            userMessage = "There was an issue with the authentication link. Please try signing in again.";
          } else if (errorDescription?.includes('exchange')) {
            userMessage = "Failed to complete authentication. This might be due to a configuration issue. Please try again or contact support.";
          }
          
          toast({
            variant: "destructive",
            title: "Authentication failed",
            description: userMessage,
          });
          navigate('/login');
          return;
        }

        // Check for different auth flow types
        const code = urlParams.get('code');
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const type = urlParams.get('type') || hashParams.get('type');
        
        console.log('[AuthCallback] Auth params:', { 
          hasCode: !!code, 
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          type 
        });
        
        let session;
        let sessionError;
        
        if (code) {
          // PKCE flow - exchange code for session
          console.log('[AuthCallback] Attempting PKCE code exchange...');
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          session = data?.session;
          sessionError = error;
          
          if (error) {
            console.error('[AuthCallback] Code exchange error:', error);
            // Log the full error for debugging
            console.error('[AuthCallback] Full error details:', JSON.stringify(error, null, 2));
          } else {
            console.log('[AuthCallback] Code exchange successful');
          }
        } else if (accessToken) {
          // Implicit/hash flow - set session from tokens
          console.log('[AuthCallback] Attempting to set session from hash tokens...');
          const expiresIn = parseInt(hashParams.get('expires_in') || '3600');
          const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
          
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || '',
          });
          
          session = data?.session;
          sessionError = error;
          
          if (error) {
            console.error('[AuthCallback] Set session error:', error);
          } else {
            console.log('[AuthCallback] Session set successfully');
          }
        } else {
          // No auth params - try to get existing session
          console.log('[AuthCallback] No auth params found, checking existing session...');
          const { data, error } = await supabase.auth.getSession();
          session = data?.session;
          sessionError = error;
        }
        
        if (sessionError) {
          console.error('[AuthCallback] Session error:', sessionError);
          
          // Provide better error messages
          let errorMessage = sessionError.message;
          if (errorMessage?.includes('OTP')) {
            errorMessage = "The authentication link has expired or is invalid. Please request a new one.";
          } else if (errorMessage?.includes('exchange')) {
            errorMessage = "Failed to complete sign-in. Please try again.";
          }
          
          toast({
            variant: "destructive",
            title: "Authentication failed",
            description: errorMessage,
          });
          navigate('/login');
          return;
        }

        if (session) {
          console.log('[AuthCallback] Authentication successful!', {
            userId: session.user?.id,
            email: session.user?.email
          });
          
          // Successfully authenticated
          toast({
            title: "Welcome!",
            description: "You have been successfully signed in.",
          });

          // Check for pending share code
          const pendingShareCode = sessionStorage.getItem('pending_share_code');
          if (pendingShareCode) {
            console.log('[AuthCallback] Redirecting to pending share:', pendingShareCode);
            sessionStorage.removeItem('pending_share_code');
            navigate(`/e/${pendingShareCode}`);
          } else {
            // Check for saved redirect path
            const redirectPath = sessionStorage.getItem('authRedirectPath');
            if (redirectPath) {
              console.log('[AuthCallback] Redirecting to saved path:', redirectPath);
              sessionStorage.removeItem('authRedirectPath');
              navigate(redirectPath);
            } else {
              console.log('[AuthCallback] Redirecting to /app');
              navigate('/app');
            }
          }
        } else {
          console.warn('[AuthCallback] No session found after authentication');
          toast({
            variant: "destructive",
            title: "Authentication incomplete",
            description: "Could not complete sign-in. Please try again.",
          });
          navigate('/login');
        }
      } catch (error) {
        console.error('[AuthCallback] Unexpected error:', error);
        toast({
          variant: "destructive",
          title: "Authentication error",
          description: error instanceof Error ? error.message : "An unexpected error occurred. Please try again.",
        });
        navigate('/login');
      }
    };

    handleCallback();
  }, [navigate, toast]);

  return <LoadingDisplay message="Completing sign in..." />;
};

export default AuthCallback;