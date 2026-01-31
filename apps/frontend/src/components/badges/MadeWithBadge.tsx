import React, { useEffect, useState, useRef } from 'react';
import { trackBadgeImpression, trackBadgeClick } from '@/services/analytics';
import { cn } from '@/lib/utils';

interface MadeWithBadgeProps {
  shareCode: string;
  userPlan?: string; // 'free' | 'starter' | 'pro' | 'enterprise'
  className?: string;
}

/**
 * "Made with NextSlide" badge shown on shared presentations.
 * Hidden for paid plan users (starter/pro/enterprise).
 * Tracks impressions and clicks via PostHog.
 */
const MadeWithBadge: React.FC<MadeWithBadgeProps> = ({ shareCode, userPlan, className }) => {
  const [isVisible, setIsVisible] = useState(false);
  const hasTrackedImpression = useRef(false);

  // Hide badge for paid plan users
  const paidPlans = ['starter', 'pro', 'enterprise'];
  if (userPlan && paidPlans.includes(userPlan.toLowerCase())) {
    return null;
  }

  // Fade in after 2 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  // Track impression once visible
  useEffect(() => {
    if (isVisible && !hasTrackedImpression.current) {
      hasTrackedImpression.current = true;
      trackBadgeImpression(shareCode);
    }
  }, [isVisible, shareCode]);

  const handleClick = () => {
    trackBadgeClick(shareCode);
  };

  return (
    <a
      href={`/?ref=badge&deck=${shareCode}`}
      onClick={handleClick}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'fixed bottom-4 right-4 z-50',
        'flex items-center gap-1.5 px-3 py-1.5 rounded-full',
        'bg-black/60 backdrop-blur-sm',
        'text-white/80 text-xs font-medium',
        'hover:bg-black/75 hover:text-white',
        'transition-all duration-500 ease-out',
        'no-underline cursor-pointer',
        'shadow-lg',
        isVisible ? 'opacity-70 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none',
        className
      )}
      style={{ transitionProperty: 'opacity, transform, background-color, color' }}
    >
      {/* NextSlide X icon */}
      <svg
        viewBox="0 0 64 64"
        width={12}
        height={12}
        aria-hidden
        className="flex-shrink-0"
      >
        <path d="M8 8 L56 56" stroke="#FF4301" strokeWidth={11} strokeLinecap="round" />
        <path d="M56 8 L8 56" stroke="#FF4301" strokeWidth={11} strokeLinecap="round" />
      </svg>
      <span>Made with NextSlide</span>
    </a>
  );
};

export default MadeWithBadge;
