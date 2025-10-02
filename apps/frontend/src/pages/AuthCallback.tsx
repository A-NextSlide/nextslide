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
        // Get the error from URL if any
        const urlParams = new URLSearchParams(window.location.search);
        const error = urlParams.get('error');
        const errorDescription = urlParams.get('error_description');

        if (error) {
          console.error('Auth callback error:', error, errorDescription);
          toast({
            variant: "destructive",
            title: "Authentication failed",
            description: errorDescription || "An error occurred during authentication",
          });
          navigate('/login');
          return;
        }

        // Check if this is a PKCE flow (has code parameter)
        const code = urlParams.get('code');
        
        let session;
        let sessionError;
        
        if (code) {
          // Exchange code for session (PKCE flow)
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          session = data?.session;
          sessionError = error;
        } else {
          // Fallback to getting existing session
          const { data, error } = await supabase.auth.getSession();
          session = data?.session;
          sessionError = error;
        }
        
        if (sessionError) {
          console.error('Session error:', sessionError);
          toast({
            variant: "destructive",
            title: "Authentication failed",
            description: sessionError.message,
          });
          navigate('/login');
          return;
        }

        if (session) {
          // Successfully authenticated
          toast({
            title: "Welcome!",
            description: "You have been successfully signed in.",
          });

          // Check for pending share code
          const pendingShareCode = sessionStorage.getItem('pending_share_code');
          if (pendingShareCode) {
            sessionStorage.removeItem('pending_share_code');
            navigate(`/e/${pendingShareCode}`);
          } else {
            // Check for saved redirect path
            const redirectPath = sessionStorage.getItem('authRedirectPath');
            if (redirectPath) {
              sessionStorage.removeItem('authRedirectPath');
              navigate(redirectPath);
            } else {
              navigate('/app');
            }
          }
        } else {
          // No session found
          navigate('/login');
        }
      } catch (error) {
        console.error('Unexpected error in auth callback:', error);
        toast({
          variant: "destructive",
          title: "Authentication error",
          description: "An unexpected error occurred. Please try again.",
        });
        navigate('/login');
      }
    };

    handleCallback();
  }, [navigate, toast]);

  return <LoadingDisplay message="Completing sign in..." />;
};

export default AuthCallback;