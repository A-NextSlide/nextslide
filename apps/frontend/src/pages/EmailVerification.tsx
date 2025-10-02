import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import BrandWordmark from '@/components/common/BrandWordmark';
import { Mail, CheckCircle, ArrowRight } from 'lucide-react';

const EmailVerification: React.FC = () => {
  const navigate = useNavigate();
  const { token } = useParams();
  const [timeLeft, setTimeLeft] = useState(30);

  useEffect(() => {
    // Auto-redirect timer
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          navigate('/login');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#F5F5DC] dark:bg-zinc-900 flex items-center justify-center px-6 py-12 relative overflow-hidden">
      {/* Noise overlay */}
      <div className="noise-overlay pointer-events-none"></div>

      {/* Animated background blobs */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-[#FF4301]/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[#FF4301]/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="relative w-full max-w-md mx-auto text-center z-10">
        {/* Logo */}
        <div className="mb-8">
          <BrandWordmark
            tag="h1"
            className="text-zinc-900 dark:text-zinc-100 cursor-pointer"
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

        <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-xl p-8">
          {/* Icon */}
          <div className="mb-6 animate-fade-in">
            <div className="mx-auto w-20 h-20 bg-[#FF4301]/10 rounded-full flex items-center justify-center">
              <Mail className="h-10 w-10 text-[#FF4301]" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-3xl font-bold mb-2 animate-fade-in animation-delay-100">
            Check Your Email!
          </h2>

          {/* Description */}
          <p className="text-zinc-600 dark:text-zinc-400 mb-8 animate-fade-in animation-delay-200">
            We've sent a confirmation link to your email address. Click the link to verify your account and get started with NextSlide.
          </p>

          {/* Success checks */}
          <div className="space-y-3 mb-8 text-left">
            <div className="flex items-center gap-3 animate-fade-in animation-delay-300">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Account created successfully</span>
            </div>
            <div className="flex items-center gap-3 animate-fade-in animation-delay-400">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Verification email sent</span>
            </div>
            <div className="flex items-center gap-3 animate-fade-in animation-delay-500">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Ready to start creating</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-3 animate-fade-in animation-delay-600">
            <Button
              onClick={() => navigate('/login')}
              className="w-full bg-[#FF4301] hover:bg-[#E63901] text-white"
            >
              Go to Login
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            
            <Button
              onClick={() => window.open('https://mail.google.com', '_blank')}
              variant="outline"
              className="w-full"
            >
              Open Gmail
              <Mail className="ml-2 h-4 w-4" />
            </Button>
          </div>

          {/* Auto-redirect notice */}
          <p className="text-xs text-zinc-500 mt-6 animate-fade-in animation-delay-700">
            Redirecting to login in {timeLeft} seconds...
          </p>
        </div>

        {/* Help text */}
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-6 animate-fade-in animation-delay-800">
          Didn't receive the email? Check your spam folder or{' '}
          <button 
            onClick={() => navigate('/signup')}
            className="text-[#FF4301] hover:text-[#E63901] font-medium"
          >
            try signing up again
          </button>
        </p>
      </div>

      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
          opacity: 0;
        }

        .animation-delay-100 {
          animation-delay: 100ms;
        }

        .animation-delay-200 {
          animation-delay: 200ms;
        }

        .animation-delay-300 {
          animation-delay: 300ms;
        }

        .animation-delay-400 {
          animation-delay: 400ms;
        }

        .animation-delay-500 {
          animation-delay: 500ms;
        }

        .animation-delay-600 {
          animation-delay: 600ms;
        }

        .animation-delay-700 {
          animation-delay: 700ms;
        }

        .animation-delay-800 {
          animation-delay: 800ms;
        }

        .delay-1000 {
          animation-delay: 1000ms;
        }
      `}</style>
    </div>
  );
};

export default EmailVerification; 