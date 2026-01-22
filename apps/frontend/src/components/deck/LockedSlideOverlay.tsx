/**
 * LockedSlideOverlay Component
 *
 * Displays a blur overlay with upgrade CTA on locked slides.
 * Has two modes: full view (main viewport) and thumbnail mode.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Lock, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface LockedSlideOverlayProps {
  /** Number of slides still locked */
  lockedCount: number;
  /** Display mode */
  mode?: 'full' | 'thumbnail';
  /** Custom class name */
  className?: string;
  /** Called when user clicks upgrade CTA */
  onUpgradeClick?: () => void;
  /** Whether to open upgrade in new tab (for presentation mode) */
  openInNewTab?: boolean;
}

/**
 * Full-size overlay for main viewport
 */
const FullOverlay: React.FC<{
  lockedCount: number;
  onUpgrade: () => void;
}> = ({ lockedCount, onUpgrade }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 flex items-center justify-center z-50"
    >
      {/* Gradient ring background */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="w-80 h-80 rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle, rgba(255,67,1,0.4) 0%, transparent 70%)'
          }}
        />
      </div>

      {/* Content card */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', damping: 20 }}
        className="relative bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-2xl shadow-2xl px-8 py-8 max-w-sm text-center border border-white/20"
      >
        {/* Lock icon with gradient ring */}
        <div className="relative mx-auto mb-5 w-16 h-16">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: 'linear-gradient(135deg, #FF4301 0%, #E63901 100%)',
              padding: '3px'
            }}
          >
            <div className="w-full h-full rounded-full bg-white dark:bg-zinc-900 flex items-center justify-center">
              <Lock className="w-7 h-7 text-[#FF4301]" />
            </div>
          </div>
        </div>

        {/* Heading */}
        <h3
          className="text-xl font-bold text-black dark:text-white mb-2"
          style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
        >
          {lockedCount} more {lockedCount === 1 ? 'slide awaits' : 'slides await'}
        </h3>

        {/* Subtext */}
        <p className="text-sm text-black/60 dark:text-white/60 mb-6">
          Unlock stunning visualizations crafted specifically for your content
        </p>

        {/* Benefits */}
        <div className="flex flex-col gap-2 mb-6">
          {['Full access to all slides', 'Custom visualization styles', 'Full editor & export to PDF'].map((benefit, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-black/70 dark:text-white/70">
              <Sparkles className="w-4 h-4 text-[#FF4301] flex-shrink-0" />
              <span>{benefit}</span>
            </div>
          ))}
        </div>

        {/* CTA Button */}
        <Button
          className="w-full bg-gradient-to-r from-[#FF4301] to-[#E63901] hover:from-[#E63901] hover:to-[#CC3200] text-white font-semibold py-5 rounded-xl shadow-lg shadow-orange-500/25"
          onClick={onUpgrade}
        >
          Upgrade to Starter - $9.99/mo
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>

        {/* Skip text */}
        <p className="text-xs text-black/40 dark:text-white/40 mt-3">
          Cancel anytime
        </p>
      </motion.div>
    </motion.div>
  );
};

/**
 * Compact overlay for thumbnails
 */
const ThumbnailOverlay: React.FC = () => {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-20">
      {/* Lock badge */}
      <div className="absolute top-1 right-1 bg-black/70 rounded-full p-1">
        <Lock className="w-2.5 h-2.5 text-white" />
      </div>

      {/* Center lock icon */}
      <div className="bg-black/50 rounded-lg px-2 py-1 flex items-center gap-1">
        <Lock className="w-3 h-3 text-white" />
        <span className="text-[9px] text-white font-medium">Locked</span>
      </div>
    </div>
  );
};

/**
 * LockedSlideOverlay - Displays upgrade prompt on locked slides
 */
export const LockedSlideOverlay: React.FC<LockedSlideOverlayProps> = ({
  lockedCount,
  mode = 'full',
  className,
  onUpgradeClick,
  openInNewTab = false
}) => {
  const navigate = useNavigate();

  const handleUpgrade = () => {
    if (onUpgradeClick) {
      onUpgradeClick();
    } else if (openInNewTab) {
      // Open pricing page in new tab (for presentation mode)
      window.open('/pricing', '_blank');
    } else {
      navigate('/pricing');
    }
  };

  if (mode === 'thumbnail') {
    return (
      <div className={cn('pointer-events-none', className)}>
        <ThumbnailOverlay />
      </div>
    );
  }

  return (
    <div className={cn('pointer-events-auto', className)}>
      <FullOverlay lockedCount={lockedCount} onUpgrade={handleUpgrade} />
    </div>
  );
};

export default LockedSlideOverlay;
