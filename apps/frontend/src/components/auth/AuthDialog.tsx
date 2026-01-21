import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Lock, User, ChevronDown, ChevronUp, AlertCircle, X, EyeIcon, EyeOffIcon } from 'lucide-react';
import BrandWordmark from '@/components/common/BrandWordmark';
import { useAuth } from '@/context/SupabaseAuthContext';
import { useToast } from '@/hooks/use-toast';

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: 'signup' | 'login';
  onSuccess?: () => void;
}

export const AuthDialog: React.FC<AuthDialogProps> = ({
  open,
  onOpenChange,
  initialMode = 'signup',
  onSuccess
}) => {
  const { signUp, signIn, signInWithGoogle, signInWithMagicLink, resetPassword } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<'signup' | 'login' | 'forgot' | 'magic'>(initialMode);
  const [isLoading, setIsLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showErrorBanner, setShowErrorBanner] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  // Form data
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setShowEmailForm(false);
      setErrors({});
      setShowErrorBanner(false);
      setResetEmailSent(false);
      setMagicLinkSent(false);
      setFormData({ name: '', email: '', password: '', confirmPassword: '' });
    }
  }, [open, initialMode]);

  // Auto-hide error banner
  useEffect(() => {
    if (showErrorBanner) {
      const timer = setTimeout(() => setShowErrorBanner(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showErrorBanner]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (errors[e.target.name]) {
      setErrors({ ...errors, [e.target.name]: '' });
    }
  };

  const validateSignupForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Full name is required';
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords don't match";
    }
    if (!agreedToTerms) {
      newErrors.terms = 'You must agree to the terms';
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) setShowErrorBanner(true);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateSignupForm()) return;
    setIsLoading(true);
    try {
      await signUp(formData.email, formData.password, formData.name);
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      setErrors({ general: error instanceof Error ? error.message : 'Signup failed' });
      setShowErrorBanner(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});
    try {
      await signIn(formData.email, formData.password);
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      setErrors({ general: error instanceof Error ? error.message : 'Login failed' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setIsLoading(true);
    try {
      await signInWithGoogle();
      // Google auth redirects, so no need to call onSuccess here
    } catch (error) {
      // Error handled by auth context
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.email.includes('@')) {
      toast({ variant: 'destructive', title: 'Invalid email', description: 'Please enter a valid email address' });
      return;
    }
    setIsLoading(true);
    try {
      await resetPassword(formData.email);
      setResetEmailSent(true);
      toast({ title: 'Password reset email sent!', description: 'Check your email for instructions.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Failed to send reset email', description: error instanceof Error ? error.message : 'Please try again' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.email.includes('@')) {
      setErrors({ email: 'Please enter a valid email address' });
      return;
    }
    setIsLoading(true);
    setErrors({});
    try {
      await signInWithMagicLink(formData.email);
      setMagicLinkSent(true);
      toast({ title: 'Magic link sent!', description: 'Check your email for the sign-in link.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Failed to send magic link', description: error instanceof Error ? error.message : 'Please try again' });
    } finally {
      setIsLoading(false);
    }
  };

  const renderSignup = () => (
    <>
      <div className="text-center mb-6">
        <h1 className="text-[#383636] dark:text-gray-300 mb-2" style={{ fontFamily: '"HK Grotesk Wide", sans-serif', fontWeight: 900, fontSize: '20px', textTransform: 'uppercase' }}>
          GET STARTED
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 text-sm">Create presentations in seconds</p>
      </div>

      <Button type="button" className="w-full h-11 bg-[#FF4301] hover:bg-[#E63901] text-white font-semibold mb-4" onClick={handleGoogleAuth} disabled={isLoading}>
        <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
          <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Continue with Google
      </Button>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-200 dark:border-zinc-700" /></div>
        <div className="relative flex justify-center text-sm"><span className="px-4 bg-white dark:bg-zinc-800 text-zinc-500">or</span></div>
      </div>

      <button type="button" onClick={() => setShowEmailForm(!showEmailForm)} className="w-full flex items-center justify-between px-4 py-2.5 border border-zinc-200 dark:border-zinc-700 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
        <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
          <Mail className="w-4 h-4" />
          <span className="text-sm font-medium">Sign up with email</span>
        </div>
        {showEmailForm ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </button>

      {showEmailForm && (
        <form onSubmit={handleSignup} noValidate className="mt-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
          {showErrorBanner && Object.keys(errors).length > 0 && (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-xl p-2.5">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <ul className="text-xs text-red-600 dark:text-red-400 space-y-0.5">
                    {Object.values(errors).map((error, i) => <li key={i}>{error}</li>)}
                  </ul>
                </div>
                <button type="button" onClick={() => setShowErrorBanner(false)} className="p-0.5 hover:bg-red-100 dark:hover:bg-red-900/50 rounded transition-colors">
                  <X className="w-3.5 h-3.5 text-red-500" />
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-zinc-700 dark:text-zinc-300 text-xs">Full Name</Label>
            <div className="relative">
              <User className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
              <Input id="name" name="name" type="text" placeholder="John Doe" value={formData.name} onChange={handleChange} className={`pl-8 h-9 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-sm ${errors.name ? 'border-red-500' : ''}`} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="signup-email" className="text-zinc-700 dark:text-zinc-300 text-xs">Email</Label>
            <div className="relative">
              <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
              <Input id="signup-email" name="email" type="email" placeholder="you@example.com" value={formData.email} onChange={handleChange} className={`pl-8 h-9 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-sm ${errors.email ? 'border-red-500' : ''}`} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="signup-password" className="text-zinc-700 dark:text-zinc-300 text-xs">Password</Label>
            <div className="relative">
              <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
              <Input id="signup-password" name="password" type="password" placeholder="Min. 8 characters" value={formData.password} onChange={handleChange} className={`pl-8 h-9 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-sm ${errors.password ? 'border-red-500' : ''}`} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword" className="text-zinc-700 dark:text-zinc-300 text-xs">Confirm Password</Label>
            <div className="relative">
              <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
              <Input id="confirmPassword" name="confirmPassword" type="password" placeholder="Confirm password" value={formData.confirmPassword} onChange={handleChange} className={`pl-8 h-9 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-sm ${errors.confirmPassword ? 'border-red-500' : ''}`} />
            </div>
          </div>

          <div className="flex items-start gap-2">
            <input type="checkbox" id="terms" checked={agreedToTerms} onChange={(e) => { setAgreedToTerms(e.target.checked); if (errors.terms) setErrors({ ...errors, terms: '' }); }} className="w-3.5 h-3.5 mt-0.5 text-[#FF4301] bg-zinc-100 border-zinc-300 rounded focus:ring-[#FF4301]" />
            <label htmlFor="terms" className="text-xs text-zinc-600 dark:text-zinc-400">
              I agree to the <a href="/terms" target="_blank" className="text-[#FF4301] hover:text-[#E63901]">Terms of Service</a> and <a href="/privacy" target="_blank" className="text-[#FF4301] hover:text-[#E63901]">Privacy Policy</a>
            </label>
          </div>

          <Button type="submit" disabled={isLoading} className="w-full h-9 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-semibold text-sm">
            {isLoading ? 'Creating Account...' : 'Create Account'}
          </Button>
        </form>
      )}

      <p className="text-center mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        Already have an account?{' '}
        <button type="button" onClick={() => { setMode('login'); setShowEmailForm(false); setErrors({}); }} className="text-[#FF4301] hover:text-[#E63901] font-medium">Sign in</button>
      </p>
    </>
  );

  const renderLogin = () => (
    <>
      <div className="text-center mb-6">
        <h1 className="text-[#383636] dark:text-gray-300 mb-2" style={{ fontFamily: '"HK Grotesk Wide", sans-serif', fontWeight: 900, fontSize: '20px', textTransform: 'uppercase' }}>
          WELCOME BACK
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 text-sm">Sign in to continue</p>
      </div>

      {errors.general && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-2.5 rounded-lg text-sm mb-4">
          {errors.general}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="login-email" className="text-zinc-700 dark:text-zinc-300 text-xs">Email</Label>
          <div className="relative">
            <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
            <Input id="login-email" name="email" type="email" placeholder="you@example.com" value={formData.email} onChange={handleChange} required className="pl-8 h-10 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="login-password" className="text-zinc-700 dark:text-zinc-300 text-xs">Password</Label>
          <div className="relative">
            <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
            <Input id="login-password" name="password" type={showPassword ? 'text' : 'password'} placeholder="Enter password" value={formData.password} onChange={handleChange} required className="pl-8 pr-9 h-10 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
              {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="button" onClick={() => setMode('forgot')} className="text-xs text-[#FF4301] hover:text-[#E63901]">Forgot password?</button>
        </div>

        <Button type="submit" disabled={isLoading} className="w-full h-10 bg-[#FF4301] hover:bg-[#E63901] text-white font-semibold">
          {isLoading ? 'Signing in...' : 'Sign In'}
        </Button>
      </form>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-200 dark:border-zinc-700" /></div>
        <div className="relative flex justify-center text-xs"><span className="px-4 bg-white dark:bg-zinc-800 text-zinc-500">Or continue with</span></div>
      </div>

      <div className="space-y-2">
        <Button type="button" variant="outline" className="w-full h-10 border-zinc-200 dark:border-zinc-700" onClick={handleGoogleAuth} disabled={isLoading}>
          <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Sign in with Google
        </Button>
        <Button type="button" variant="outline" className="w-full h-10 border-zinc-200 dark:border-zinc-700" onClick={() => setMode('magic')}>
          <Mail className="w-4 h-4 mr-2" />
          Sign in with Magic Link
        </Button>
      </div>

      <p className="text-center mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        Don't have an account?{' '}
        <button type="button" onClick={() => { setMode('signup'); setErrors({}); }} className="text-[#FF4301] hover:text-[#E63901] font-medium">Sign up</button>
      </p>
    </>
  );

  const renderForgotPassword = () => (
    <>
      <h2 className="text-xl font-bold text-center mb-2">Reset Password</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400 text-center mb-4">Enter your email and we'll send you a reset link</p>

      {resetEmailSent ? (
        <div className="text-center">
          <div className="mx-auto w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">Reset link sent to <strong>{formData.email}</strong></p>
          <Button variant="outline" onClick={() => { setMode('login'); setResetEmailSent(false); }} className="w-full">Back to Login</Button>
        </div>
      ) : (
        <form onSubmit={handleForgotPassword} className="space-y-4">
          <div>
            <Label htmlFor="reset-email" className="text-sm">Email</Label>
            <Input id="reset-email" name="email" type="email" value={formData.email} onChange={handleChange} placeholder="you@example.com" required className="mt-1" />
          </div>
          <Button type="submit" disabled={isLoading} className="w-full bg-[#FF4301] hover:bg-[#E63901] text-white">
            {isLoading ? 'Sending...' : 'Send Reset Link'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMode('login')} className="w-full">Back to Login</Button>
        </form>
      )}
    </>
  );

  const renderMagicLink = () => (
    <>
      <h2 className="text-xl font-bold text-center mb-2">Sign in with Email</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400 text-center mb-4">We'll send you a magic link to sign in instantly</p>

      {magicLinkSent ? (
        <div className="text-center">
          <div className="mx-auto w-12 h-12 bg-[#FF4301]/10 rounded-full flex items-center justify-center mb-4">
            <Mail className="w-6 h-6 text-[#FF4301]" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Check your email!</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">We sent a magic link to <strong>{formData.email}</strong></p>
          <div className="space-y-2">
            <Button variant="outline" onClick={() => window.open('https://mail.google.com', '_blank')} className="w-full">Open Gmail</Button>
            <Button variant="ghost" onClick={() => { setMode('login'); setMagicLinkSent(false); }} className="w-full">Back to Login</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleMagicLink} className="space-y-4">
          <div>
            <Label htmlFor="magic-email" className="text-sm">Email</Label>
            <Input id="magic-email" name="email" type="email" value={formData.email} onChange={handleChange} placeholder="you@example.com" required className={`mt-1 ${errors.email ? 'border-red-500' : ''}`} />
            {errors.email && <p className="text-sm text-red-500 mt-1">{errors.email}</p>}
          </div>
          <Button type="submit" disabled={isLoading} className="w-full bg-[#FF4301] hover:bg-[#E63901] text-white">
            {isLoading ? 'Sending...' : 'Send Magic Link'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMode('login')} className="w-full">Sign in with password</Button>
        </form>
      )}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] p-0 gap-0 bg-white dark:bg-zinc-800 border-0" hideCloseButton>
        <div className="p-6">
          <div className="text-center mb-4">
            <BrandWordmark
              tag="div"
              className="text-[#383636] dark:text-gray-300 inline-block"
              sizePx={16}
              xImageUrl="/brand/nextslide-x.png"
              gapLeftPx={-3}
              gapRightPx={-8}
              liftPx={-4}
              xLiftPx={-4}
              rightLiftPx={0}
            />
          </div>
          {mode === 'signup' && renderSignup()}
          {mode === 'login' && renderLogin()}
          {mode === 'forgot' && renderForgotPassword()}
          {mode === 'magic' && renderMagicLink()}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AuthDialog;
