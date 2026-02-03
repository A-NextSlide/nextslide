import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BROWSER } from '@/utils/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EyeIcon, EyeOffIcon, Lock, CheckCircle } from 'lucide-react';
import { useAuth } from '@/context/SupabaseAuthContext';
import { useToast } from '@/hooks/use-toast';
import BrandWordmark from '@/components/common/BrandWordmark';

const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const { updatePassword } = useAuth();
  const { toast } = useToast();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);

  const validatePassword = () => {
    if (newPassword.length < 8) {
      toast({
        variant: "destructive",
        title: "Password too short",
        description: "Password must be at least 8 characters long",
      });
      return false;
    }

    if (newPassword !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Passwords don't match",
        description: "Please make sure both passwords match",
      });
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validatePassword()) {
      return;
    }

    setIsLoading(true);

    try {
      await updatePassword(newPassword);
      setPasswordUpdated(true);

      toast({
        title: "Password updated successfully!",
        description: "You can now sign in with your new password.",
      });

      // Redirect to app after 2 seconds
      setTimeout(() => {
        navigate('/app');
      }, 2000);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to update password",
        description: error instanceof Error ? error.message : "Please try again later",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5F5DC] via-[#FAF9F6] to-[#F5F5DC] dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <BrandWordmark
            className="text-[#383636] dark:text-gray-300 cursor-pointer"
            onClick={() => navigate(BROWSER.isNativeApp ? '/app' : '/')}
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
          {passwordUpdated ? (
            // Success state
            <div className="text-center">
              <div className="mb-4">
                <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-center mb-2">Password Updated!</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
                Your password has been successfully updated. Redirecting you to the app...
              </p>
            </div>
          ) : (
            // Password reset form
            <>
              <div className="text-center mb-6">
                <div className="mx-auto w-16 h-16 bg-[#FF4301]/10 rounded-full flex items-center justify-center mb-4">
                  <Lock className="w-8 h-8 text-[#FF4301]" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Set New Password</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Choose a strong password for your account
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* New Password */}
                <div>
                  <label htmlFor="new-password" className="block text-sm font-medium mb-2">
                    New Password
                  </label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      required
                      autoFocus
                      minLength={8}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                    >
                      {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label htmlFor="confirm-password" className="block text-sm font-medium mb-2">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      required
                      minLength={8}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                    >
                      {showConfirmPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                    </button>
                  </div>
                </div>

                {/* Password Requirements */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <p className="text-xs font-medium text-blue-900 dark:text-blue-300 mb-2">
                    Password Requirements:
                  </p>
                  <ul className="text-xs text-blue-800 dark:text-blue-400 space-y-1">
                    <li className={newPassword.length >= 8 ? 'text-green-600 dark:text-green-400' : ''}>
                      ✓ At least 8 characters
                    </li>
                    <li className={/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) ? 'text-green-600 dark:text-green-400' : ''}>
                      ✓ Uppercase and lowercase letters
                    </li>
                    <li className={/[0-9]/.test(newPassword) ? 'text-green-600 dark:text-green-400' : ''}>
                      ✓ At least one number
                    </li>
                    <li className={/[^A-Za-z0-9]/.test(newPassword) ? 'text-green-600 dark:text-green-400' : ''}>
                      ✓ At least one special character
                    </li>
                  </ul>
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-[#FF4301] hover:bg-[#E63901] text-white"
                >
                  {isLoading ? 'Updating...' : 'Update Password'}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate('/login')}
                  className="w-full"
                >
                  Back to Login
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
