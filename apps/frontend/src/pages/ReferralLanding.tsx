import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BROWSER } from '@/utils/browser';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, ArrowRight } from 'lucide-react';
import BrandWordmark from '@/components/common/BrandWordmark';
import { referralApi, type ReferralLookup } from '@/services/referralApi';
import { trackEvent } from '@/services/analytics';

const REFERRAL_CODE_KEY = 'referral_code';

const ReferralLanding: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [referrer, setReferrer] = useState<ReferralLookup | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!code) return;

    // Store referral code in localStorage immediately
    try {
      localStorage.setItem(REFERRAL_CODE_KEY, code);
    } catch {
      // localStorage not available
    }

    // Track the landing page view
    trackEvent('referral_landing_viewed', { code });

    // Look up the referral code
    referralApi.lookupReferralCode(code).then((result) => {
      if (result) {
        setReferrer(result);
      } else {
        setNotFound(true);
      }
      setLoading(false);
    }).catch(() => {
      setNotFound(true);
      setLoading(false);
    });
  }, [code]);

  const handleSignup = () => {
    navigate('/signup');
  };

  const handleLogin = () => {
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 min-h-screen bg-white dark:bg-black flex items-center justify-center px-6 py-12 overflow-y-auto">
      <div className="w-full max-w-lg mx-auto text-center">
        {/* Logo */}
        <div className="mb-8">
          <BrandWordmark
            tag="h1"
            className="text-[#383636] dark:text-gray-300 cursor-pointer inline-block"
            onClick={() => navigate(BROWSER.isNativeApp ? '/app' : '/')}
            sizePx={18.95}
            xImageUrl="/brand/nextslide-x.png"
            gapLeftPx={-3}
            gapRightPx={-8}
            liftPx={-4}
            xLiftPx={-4}
            rightLiftPx={0}
          />
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-xl p-8 sm:p-10 space-y-6">
          {/* Icon */}
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-100 to-amber-100 dark:from-orange-900/40 dark:to-amber-900/40 flex items-center justify-center mx-auto">
            <Sparkles className="w-8 h-8 text-orange-500" />
          </div>

          {/* Header */}
          {notFound ? (
            <>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                Create AI Presentations in Seconds
              </h1>
              <p className="text-zinc-500 dark:text-zinc-400">
                Join NextSlide and transform your ideas into beautiful presentations with AI.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {referrer?.referrer_name
                  ? `${referrer.referrer_name} invited you to NextSlide`
                  : 'You\'ve been invited to NextSlide'}
              </h1>
              <p className="text-zinc-500 dark:text-zinc-400">
                Create AI-powered presentations in seconds. Sign up now and get
                <span className="font-semibold text-orange-600 dark:text-orange-400"> 25 free bonus credits </span>
                as a welcome gift.
              </p>
            </>
          )}

          {/* How it works */}
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-4 text-left space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              How it works
            </p>
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 text-xs font-bold flex items-center justify-center">
                  1
                </span>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  Sign up for free and get <strong>25 bonus credits</strong>
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 text-xs font-bold flex items-center justify-center">
                  2
                </span>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  Create your first AI presentation
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 text-xs font-bold flex items-center justify-center">
                  3
                </span>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  {referrer?.referrer_name || 'Your friend'} earns <strong>50 credits</strong> too
                </p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <Button
            className="w-full h-12 bg-[#FF4301] hover:bg-[#E63901] text-white font-semibold text-base"
            onClick={handleSignup}
          >
            Get Started Free
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>

          {/* Login link */}
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Already have an account?{' '}
            <button
              type="button"
              onClick={handleLogin}
              className="text-[#FF4301] hover:text-[#E63901] font-medium transition-colors"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ReferralLanding;
