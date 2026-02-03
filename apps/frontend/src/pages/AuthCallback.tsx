import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import LoadingDisplay from '@/components/common/LoadingDisplay';
import { useToast } from '@/hooks/use-toast';
import { referralApi } from '@/services/referralApi';
import { trackEvent } from '@/services/analytics';

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

        // Recovery flows (password reset, email confirmation) should not use PKCE
        // They use hash-based tokens instead
        const isRecoveryFlow = type === 'recovery' || type === 'email_confirmation';

        if (accessToken) {
          // Implicit flow - set session from hash tokens (priority for OAuth)
          console.log('[AuthCallback] Attempting to set session from hash tokens...');

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
        } else if (code && !isRecoveryFlow) {
          // PKCE flow — detectSessionInUrl (enabled in our Supabase config) may have
          // already exchanged the code during client initialisation, consuming the
          // code_verifier.  getSession() waits for that init to complete, so check
          // for an existing session first to avoid a redundant (failing) exchange.
          console.log('[AuthCallback] PKCE code detected, checking if session was auto-established...');
          const { data: existingData } = await supabase.auth.getSession();

          if (existingData?.session) {
            console.log('[AuthCallback] Session already established via auto-detection');
            session = existingData.session;
          } else {
            // No session yet — attempt manual exchange (handles cases where
            // detectSessionInUrl didn't fire or is disabled).
            console.log('[AuthCallback] No session yet, attempting manual PKCE code exchange...');
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);
            session = data?.session;
            sessionError = error;

            if (error) {
              console.error('[AuthCallback] Code exchange error:', error);
              // Final fallback: the auto-detection may have finished in the
              // background between our first check and now.
              const { data: retryData } = await supabase.auth.getSession();
              if (retryData?.session) {
                console.log('[AuthCallback] Session found on retry after exchange error');
                session = retryData.session;
                sessionError = null;
              }
            } else {
              console.log('[AuthCallback] Code exchange successful');
            }
          }
        } else {
          // No auth params - try to get existing session (detectSessionInUrl may have handled it)
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

          // For recovery flows, redirect to password reset page
          if (isRecoveryFlow) {
            console.log('[AuthCallback] Recovery flow detected, redirecting to password reset');
            navigate('/reset-password');
            return;
          }

          // Track referral signup if there's a pending referral code
          let isReferral = false;
          try {
            const referralCode = localStorage.getItem('referral_code');
            if (referralCode && session.user?.id) {
              localStorage.removeItem('referral_code');
              try {
                const result = await referralApi.trackReferralSignup(session.user.id, referralCode);
                if (result.success) {
                  isReferral = true;
                  trackEvent('referral_signup_completed', { code: referralCode });
                }
              } catch {
                // Non-critical - don't block auth flow
              }
            }
          } catch {
            // localStorage not available
          }

          // Successfully authenticated
          if (isReferral) {
            toast({
              title: "Welcome! You received 25 bonus credits",
              description: "Your referral bonus has been added to your account.",
            });
          } else {
            toast({
              title: "Welcome!",
              description: "You have been successfully signed in.",
            });
          }

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