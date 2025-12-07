import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Mail, Lock, User, ChevronDown, ChevronUp, AlertCircle, X } from 'lucide-react';
import BrandWordmark from '@/components/common/BrandWordmark';
import { useAuth } from '@/context/SupabaseAuthContext';

const Signup: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signUp, signInWithGoogle } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showErrorBanner, setShowErrorBanner] = useState(false);

  // Auto-hide error banner after 5 seconds
  useEffect(() => {
    if (showErrorBanner) {
      const timer = setTimeout(() => setShowErrorBanner(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showErrorBanner]);

  // Enable scrolling on this page
  React.useEffect(() => {
    document.documentElement.style.position = '';
    document.documentElement.style.overflow = '';
    document.body.style.position = '';
    document.body.style.overflow = '';

    return () => {
      // Reset to fixed positioning when leaving the page (for editor)
      document.documentElement.style.position = 'fixed';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.overflow = 'hidden';
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    // Clear error for this field when user starts typing
    if (errors[e.target.name]) {
      setErrors({
        ...errors,
        [e.target.name]: ''
      });
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Full name is required';
    }

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
    const isValid = Object.keys(newErrors).length === 0;
    if (!isValid) {
      setShowErrorBanner(true);
    }
    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }
    setShowErrorBanner(false);

    setIsLoading(true);

    try {
      await signUp(
        formData.email,
        formData.password,
        formData.name
      );

      // Check for pending share code after successful signup
      try {
        if (typeof sessionStorage !== 'undefined') {
          const pendingShareCode = sessionStorage.getItem('pending_share_code');
          if (pendingShareCode) {
            sessionStorage.removeItem('pending_share_code');
            navigate(`/e/${pendingShareCode}`);
            return;
          }
        }
      } catch (e) {
        // sessionStorage not available
      }

      // Otherwise navigation is handled by the auth context
    } catch (error) {
      // Error handling is done by the auth context
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setIsLoading(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      // Error is handled by the googleSignUp method
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 min-h-screen bg-white dark:bg-black flex items-center justify-center px-6 py-12 overflow-y-auto isolate">
      {/* Inner container */}
      <div className="w-full max-w-md mx-auto relative z-10">
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
            />
          </div>

          <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-xl p-8 min-w-[350px] w-full">
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
                GET STARTED
              </h1>
              <p className="text-zinc-600 dark:text-zinc-400">
                Create presentations in seconds
              </p>
            </div>

            {/* Google Sign Up - Primary */}
            <Button
              type="button"
              className="w-full h-12 bg-[#FF4301] hover:bg-[#E63901] text-white font-semibold mb-4"
              onClick={handleGoogleSignUp}
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
              Continue with Google
            </Button>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-200 dark:border-zinc-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white dark:bg-zinc-800 text-zinc-500">or</span>
              </div>
            </div>

            {/* Email Sign Up - Collapsible */}
            <button
              type="button"
              onClick={() => setShowEmailForm(!showEmailForm)}
              className="w-full flex items-center justify-between px-4 py-3 border border-zinc-200 dark:border-zinc-700 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
            >
              <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                <Mail className="w-5 h-5" />
                <span className="text-sm font-medium">Sign up with email</span>
              </div>
              {showEmailForm ? (
                <ChevronUp className="w-4 h-4 text-zinc-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-zinc-500" />
              )}
            </button>

            {/* Email Form - Expandable */}
            {showEmailForm && (
              <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
                {/* Error Banner */}
                {showErrorBanner && Object.keys(errors).length > 0 && (
                  <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-xl p-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-red-100 dark:bg-red-900/50 rounded-full flex items-center justify-center">
                        <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-red-800 dark:text-red-200">
                          Please fix the following:
                        </p>
                        <ul className="mt-1 text-xs text-red-600 dark:text-red-400 space-y-0.5">
                          {Object.values(errors).map((error, i) => (
                            <li key={i} className="flex items-center gap-1">
                              <span className="w-1 h-1 bg-red-400 rounded-full flex-shrink-0" />
                              {error}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowErrorBanner(false)}
                        className="flex-shrink-0 p-1 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-zinc-700 dark:text-zinc-300 text-sm">
                    Full Name
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 w-4 h-4" />
                    <Input
                      id="name"
                      name="name"
                      type="text"
                      placeholder="John Doe"
                      value={formData.name}
                      onChange={handleChange}
                      autoComplete="name"
                      className={`pl-9 h-10 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-sm ${errors.name ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                    />
                  </div>
                  {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-zinc-700 dark:text-zinc-300 text-sm">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 w-4 h-4" />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="you@example.com"
                      value={formData.email}
                      onChange={handleChange}
                      autoComplete="username email"
                      className={`pl-9 h-10 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-sm ${errors.email ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                    />
                  </div>
                  {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-zinc-700 dark:text-zinc-300 text-sm">
                    Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 w-4 h-4" />
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      placeholder="Min. 8 characters"
                      value={formData.password}
                      onChange={handleChange}
                      autoComplete="new-password"
                      className={`pl-9 h-10 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-sm ${errors.password ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                    />
                  </div>
                  {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-zinc-700 dark:text-zinc-300 text-sm">
                    Confirm Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 w-4 h-4" />
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      placeholder="Confirm password"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      autoComplete="new-password"
                      className={`pl-9 h-10 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-sm ${errors.confirmPassword ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                    />
                  </div>
                  {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword}</p>}
                </div>

                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    id="terms"
                    checked={agreedToTerms}
                    onChange={(e) => {
                      setAgreedToTerms(e.target.checked);
                      if (errors.terms) {
                        setErrors({ ...errors, terms: '' });
                      }
                    }}
                    className="w-4 h-4 mt-0.5 text-[#FF4301] bg-zinc-100 border-zinc-300 rounded focus:ring-[#FF4301] dark:bg-zinc-700 dark:border-zinc-600"
                  />
                  <label htmlFor="terms" className="text-xs text-zinc-600 dark:text-zinc-400">
                    I agree to the{' '}
                    <a href="#" className="text-[#FF4301] hover:text-[#E63901] transition-colors">
                      Terms of Service
                    </a>{' '}
                    and{' '}
                    <a href="#" className="text-[#FF4301] hover:text-[#E63901] transition-colors">
                      Privacy Policy
                    </a>
                  </label>
                </div>
                {errors.terms && <p className="text-xs text-red-500">{errors.terms}</p>}

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-10 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-semibold text-sm"
                >
                  {isLoading ? 'Creating Account...' : 'Create Account'}
                </Button>
              </form>
            )}

            {/* Sign in link */}
            <p className="text-center mt-6 text-sm text-zinc-600 dark:text-zinc-400">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="text-[#FF4301] hover:text-[#E63901] font-medium transition-colors"
              >
                Sign in
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;
