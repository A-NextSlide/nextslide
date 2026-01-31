import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/context/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Users,
  Loader2,
  CheckCircle,
  XCircle,
  LogIn,
  AlertCircle,
} from 'lucide-react';
import { teamsApi } from '@/services/teamsApi';
import { toast } from '@/hooks/use-toast';
import BrandWordmark from '@/components/common/BrandWordmark';
import { extractApiError } from '@/utils/extractErrorMessage';

const TeamInvite: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState<'loading' | 'ready' | 'accepting' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);

  // Check if user is authenticated after auth loading completes
  useEffect(() => {
    if (authLoading) return;

    if (!token) {
      setStatus('error');
      setError('Invalid invitation link');
      return;
    }

    // If not logged in, show login prompt
    if (!user) {
      setStatus('ready');
      return;
    }

    // User is logged in, ready to accept
    setStatus('ready');
  }, [authLoading, user, token]);

  const handleAcceptInvitation = async () => {
    if (!token) return;

    setStatus('accepting');
    try {
      const result = await teamsApi.acceptInvitation(token);
      setTeamId(result.team_id);
      setStatus('success');
      toast({
        title: 'Welcome to the team!',
        description: 'You have successfully joined the team.',
      });
    } catch (err: any) {
      setStatus('error');
      // Parse error message
      let errorMessage = 'Failed to accept invitation';
      try {
        const errorData = JSON.parse(err.message);
        errorMessage = extractApiError(errorData.detail, errorMessage);
      } catch {
        errorMessage = err.message || errorMessage;
      }
      setError(errorMessage);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage,
      });
    }
  };

  const redirectToLogin = () => {
    // Store the current URL to redirect back after login
    const returnUrl = encodeURIComponent(window.location.pathname);
    navigate(`/login?returnTo=${returnUrl}`);
  };

  // Enable scrolling on this page
  useEffect(() => {
    document.documentElement.style.position = '';
    document.documentElement.style.overflow = '';
    document.body.style.position = '';
    document.body.style.overflow = '';

    return () => {
      document.documentElement.style.position = 'fixed';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.overflow = 'hidden';
    };
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6">
      <div className="mb-8">
        <Link to="/">
          <BrandWordmark className="h-8" />
        </Link>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
            {status === 'loading' || status === 'accepting' ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : status === 'success' ? (
              <CheckCircle className="h-8 w-8 text-green-500" />
            ) : status === 'error' ? (
              <XCircle className="h-8 w-8 text-red-500" />
            ) : (
              <Users className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <CardTitle className="text-xl">
            {status === 'loading' && 'Loading...'}
            {status === 'ready' && "You've been invited!"}
            {status === 'accepting' && 'Joining team...'}
            {status === 'success' && 'Welcome to the team!'}
            {status === 'error' && 'Unable to join'}
          </CardTitle>
          <CardDescription>
            {status === 'loading' && 'Please wait...'}
            {status === 'ready' && !user && 'Sign in to accept this invitation and join the team.'}
            {status === 'ready' && user && 'Click below to accept the invitation and join the team.'}
            {status === 'accepting' && 'Processing your invitation...'}
            {status === 'success' && 'You can now collaborate with your team on presentations.'}
            {status === 'error' && (error || 'Something went wrong with this invitation.')}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {status === 'ready' && !user && (
            <>
              <Button className="w-full" onClick={redirectToLogin}>
                <LogIn className="h-4 w-4 mr-2" />
                Sign in to continue
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Don't have an account?{' '}
                <Link
                  to={`/signup?returnTo=${encodeURIComponent(window.location.pathname)}`}
                  className="text-primary hover:underline"
                >
                  Sign up
                </Link>
              </p>
            </>
          )}

          {status === 'ready' && user && (
            <>
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                <p className="text-sm text-muted-foreground">Signed in as</p>
                <p className="font-medium">{user.email}</p>
              </div>
              <Button className="w-full" onClick={handleAcceptInvitation}>
                Accept Invitation
              </Button>
            </>
          )}

          {status === 'success' && (
            <Button className="w-full" onClick={() => navigate('/team')}>
              Go to Team Settings
            </Button>
          )}

          {status === 'error' && (
            <div className="space-y-3">
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-red-800 dark:text-red-200">
                      This invitation may be:
                    </p>
                    <ul className="mt-1 text-red-700 dark:text-red-300 list-disc list-inside">
                      <li>Already accepted</li>
                      <li>Expired (invitations expire after 14 days)</li>
                      <li>Invalid or revoked</li>
                    </ul>
                  </div>
                </div>
              </div>
              <Button variant="outline" className="w-full" onClick={() => navigate('/app')}>
                Go to Dashboard
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:underline">
          Back to home
        </Link>
      </p>
    </div>
  );
};

export default TeamInvite;
