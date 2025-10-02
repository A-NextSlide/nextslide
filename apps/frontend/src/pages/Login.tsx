import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EyeIcon, EyeOffIcon, ArrowLeft, Mail, Lock } from 'lucide-react';
import { useAuth } from '@/context/SupabaseAuthContext';
import { useToast } from '@/hooks/use-toast';
import BrandWordmark from '@/components/common/BrandWordmark';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, signInWithGoogle, signInWithMagicLink, resetPassword, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [showMagicLink, setShowMagicLink] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const { toast } = useToast();

  // Clear any stale auth tokens on mount
  useEffect(() => {
    // If user is already authenticated, redirect
    if (isAuthenticated) {
      const from = location.state?.from || '/app';
      navigate(from);
    }
  }, [isAuthenticated, navigate, location]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});

    try {
      await signIn(email, password);
      
      // Check for pending share code after successful login
      const pendingShareCode = sessionStorage.getItem('pending_share_code');
      if (pendingShareCode) {
        sessionStorage.removeItem('pending_share_code');
        navigate(`/e/${pendingShareCode}`);
        return;
      }
      
      // Otherwise use the from location or default navigation
      const from = location.state?.from || '/app';
      navigate(from);
    } catch (error) {
      // Set error message for display
      if (error instanceof Error) {
        setErrors({ general: error.message });
      } else {
        setErrors({ general: 'An unexpected error occurred. Please try again.' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!resetEmail || !resetEmail.includes('@')) {
      toast({
        variant: "destructive",
        title: "Invalid email",
        description: "Please enter a valid email address",
      });
      return;
    }

    setIsLoading(true);

    try {
      await resetPassword(resetEmail);
      setResetEmailSent(true);
      toast({
        title: "Password reset email sent!",
        description: "Check your email for instructions to reset your password.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to send reset email",
        description: error instanceof Error ? error.message : "Please try again later",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMagicLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes('@')) {
      setErrors({ email: 'Please enter a valid email address' });
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      await signInWithMagicLink(email);
      setMagicLinkSent(true);
      toast({
        title: "Magic link sent!",
        description: "Check your email for the sign-in link.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to send magic link",
        description: error instanceof Error ? error.message : "Please try again later",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div id="login-page" className="fixed inset-0 min-h-screen bg-[#F5F5DC] dark:bg-zinc-900 flex items-center justify-center px-6 py-12 overflow-y-auto isolate">
      {/* Inner container to ensure proper centering */}
      <div className="w-full max-w-md mx-auto relative z-10">
      {/* Noise overlay */}
      <div className="noise-overlay pointer-events-none"></div>

      {/* Back button */}
        <Button
          variant="ghost"
          size="icon"
        onClick={() => navigate('/')}
          className="fixed top-6 left-6 z-10 bg-white/80 dark:bg-zinc-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-zinc-800"
      >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="relative w-full max-w-md mx-auto">
          {/* Logo */}
          <div className="text-center mb-8">
            <BrandWordmark
              tag="h1"
              className="text-[#383636] dark:text-gray-300 cursor-pointer"
              onClick={() => navigate('/')}
              sizePx={18.95}
              xImageUrl="/brand/nextslide-x.png"
              gapLeftPx={-3}
              gapRightPx={-8}
              liftPx={-4}
              xLiftPx={-4}
              rightLiftPx={0}
              useDot
            />
          </div>

          <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-xl p-8 min-w-[350px] w-full">
            {/* Show different content based on mode */}
            {showForgotPassword ? (
              // Forgot password form (existing code)
              <>
                <h2 className="text-2xl font-bold text-center mb-2">Reset Password</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 text-center mb-6">
                  Enter your email and we'll send you a reset link
                </p>

                {resetEmailSent ? (
                  <div className="text-center">
                    <div className="mb-4">
                      <div className="mx-auto w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
                      Password reset link sent to <strong>{resetEmail}</strong>
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowForgotPassword(false);
                        setResetEmail('');
                        setResetEmailSent(false);
                      }}
                      className="w-full"
                    >
                      Back to Login
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="reset-email" className="block text-sm font-medium mb-2">
                        Email
                      </label>
                      <Input
                        id="reset-email"
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        autoFocus
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="w-full bg-[#FF4301] hover:bg-[#E63901] text-white"
                    >
                      {isLoading ? 'Sending...' : 'Send Reset Link'}
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowForgotPassword(false)}
                      className="w-full"
                    >
                      Back to Login
                    </Button>
                  </form>
                )}
              </>
            ) : showMagicLink ? (
              // Magic link form
              <>
                <h2 className="text-2xl font-bold text-center mb-2">Sign in with Email</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 text-center mb-6">
                  We'll send you a magic link to sign in instantly
                </p>

                {magicLinkSent ? (
                  <div className="text-center">
                    <div className="mb-4">
                      <div className="mx-auto w-16 h-16 bg-[#FF4301]/10 rounded-full flex items-center justify-center">
                        <Mail className="w-8 h-8 text-[#FF4301]" />
                      </div>
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Check your email!</h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
                      We sent a magic link to <strong>{email}</strong>
                    </p>
                    <div className="space-y-3">
                      <Button
                        onClick={() => window.open('https://mail.google.com', '_blank')}
                        variant="outline"
                        className="w-full"
                      >
                        Open Gmail
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setShowMagicLink(false);
                          setMagicLinkSent(false);
                          setEmail('');
                        }}
                        className="w-full"
                      >
                        Back to Login
                      </Button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleMagicLinkSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="magic-email" className="block text-sm font-medium mb-2">
                        Email
                      </label>
                      <Input
                        id="magic-email"
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (errors.email) {
                            setErrors({ ...errors, email: '' });
                          }
                        }}
                        placeholder="you@example.com"
                        required
                        autoFocus
                        className={errors.email ? 'border-red-500' : ''}
                      />
                      {errors.email && (
                        <p className="text-sm text-red-500 mt-1">{errors.email}</p>
                      )}
                    </div>

                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="w-full bg-[#FF4301] hover:bg-[#E63901] text-white"
                    >
                      {isLoading ? 'Sending...' : 'Send Magic Link'}
                    </Button>

                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-zinc-200 dark:border-zinc-700" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-white dark:bg-zinc-800 px-2 text-zinc-500">or</span>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setShowMagicLink(false);
                        setMagicLinkSent(false);
                      }}
                      className="w-full"
                    >
                      Sign in with password
                    </Button>
                  </form>
                )}
              </>
            ) : (
              // Regular login form (existing code with magic link button added)
              <>
                {/* Header */}
                <div className="text-center mb-8">
                  <h1 
                    className="text-[#383636] dark:text-gray-300 mb-2"
                    style={{
                      fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                      fontWeight: 900,
                      fontSize: '24px',
                lineHeight: '100%',
                letterSpacing: '0%',
                textTransform: 'uppercase',
                WebkitFontSmoothing: 'antialiased',
                MozOsxFontSmoothing: 'grayscale'
              }}
            >
              WELCOME BACK
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400">
              Sign in to continue to Next.Slide
            </p>
          </div>

          {/* Error message */}
                {errors.general && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm mb-6">
                    {errors.general}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-zinc-700 dark:text-zinc-300">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 w-5 h-5" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="pl-10 h-12 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-zinc-700 dark:text-zinc-300">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 w-5 h-5" />
                <Input
                  id="password"
                        type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                        className="pl-10 pr-10 h-12 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                      >
                        {showPassword ? (
                          <EyeOffIcon className="h-5 w-5" />
                        ) : (
                          <EyeIcon className="h-5 w-5" />
                        )}
                      </button>
              </div>
            </div>

                  <div className="flex justify-end">
              <button 
                type="button"
                      onClick={() => setShowForgotPassword(true)}
                className="text-sm text-[#FF4301] hover:text-[#E63901] transition-colors"
              >
                Forgot password?
              </button>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-[#FF4301] hover:bg-[#E63901] text-white font-semibold"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-200 dark:border-zinc-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white dark:bg-zinc-800 text-zinc-500">Or continue with</span>
            </div>
          </div>

          {/* Social login buttons */}
                <div className="space-y-4">
            <Button
              type="button"
              variant="outline"
                    className="w-full h-12 border-zinc-200 dark:border-zinc-700"
                    onClick={async () => {
                      setIsLoading(true);
                      try {
                        await signInWithGoogle();
                      } catch (error) {
                        // Error is handled by the googleSignIn method
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                    disabled={isLoading}
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
                    Sign in with Google
            </Button>
                </div>

                {/* Magic link button */}
                <div className="mt-4">
            <Button
              type="button"
              variant="outline"
                    className="w-full h-12 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    onClick={() => setShowMagicLink(true)}
                  >
                    <Mail className="w-5 h-5 mr-2" />
                    Sign in with Magic Link
            </Button>
          </div>

          {/* Sign up link */}
          <p className="text-center mt-8 text-sm text-zinc-600 dark:text-zinc-400">
            Don't have an account?{' '}
            <button
              type="button"
              onClick={() => navigate('/signup')}
              className="text-[#FF4301] hover:text-[#E63901] font-medium transition-colors"
            >
              Sign up
            </button>
          </p>

          {/* Troubleshooting link */}
          <p className="text-center mt-4 text-xs text-zinc-500 dark:text-zinc-500">
            Having trouble signing in?{' '}
            <button
              type="button"
              onClick={() => {
                      setErrors({});
                      setEmail('');
                      setPassword('');
                      toast({
                        title: "Form cleared",
                        description: "Please enter your credentials.",
                      });
              }}
              className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 underline transition-colors"
            >
                    Clear form
            </button>
          </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* CSS for noise overlay */}
      <style>{`
        .noise-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          opacity: 0.03;
          z-index: 1;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
        }
      `}</style>
    </div>
  );
};

export default Login; 