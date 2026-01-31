/**
 * BadgeGrid
 *
 * Displays achievement badges in a grid layout.
 * Earned badges show with full color and metallic gradients.
 * Unearned badges are grayed out with a lock overlay.
 * Supports compact (icons only) and full (with labels) modes.
 */

import React from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles,
  Layers,
  Trophy,
  Zap,
  Eye,
  Star,
  Flame,
  Repeat,
  Award,
  Users,
  Share2,
  Crown,
  Lock,
  type LucideIcon,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { BadgeDefinition } from '@/services/gamificationApi';

// Map icon string names to Lucide components
const ICON_MAP: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  layers: Layers,
  trophy: Trophy,
  zap: Zap,
  eye: Eye,
  star: Star,
  flame: Flame,
  repeat: Repeat,
  award: Award,
  users: Users,
  share2: Share2,
  crown: Crown,
};

// Gradient styles for earned badges by category
const CATEGORY_GRADIENTS: Record<string, string> = {
  creation: 'from-yellow-400 to-amber-600',
  views: 'from-blue-400 to-indigo-600',
  community: 'from-purple-400 to-fuchsia-600',
  streak: 'from-orange-400 to-red-600',
};

interface BadgeGridProps {
  badges: BadgeDefinition[];
  compact?: boolean;
  className?: string;
}

const BadgeGrid: React.FC<BadgeGridProps> = ({ badges, compact = false, className = '' }) => {
  if (!badges || badges.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-400 dark:text-zinc-500 text-sm">
        No badges available yet.
      </div>
    );
  }

  return (
    <div
      className={`grid gap-3 ${
        compact
          ? 'grid-cols-6 sm:grid-cols-8'
          : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5'
      } ${className}`}
    >
      {badges.map((badge, index) => (
        <BadgeItem
          key={badge.badge_type}
          badge={badge}
          compact={compact}
          index={index}
        />
      ))}
    </div>
  );
};

interface BadgeItemProps {
  badge: BadgeDefinition;
  compact: boolean;
  index: number;
}

const BadgeItem: React.FC<BadgeItemProps> = ({ badge, compact, index }) => {
  const Icon = ICON_MAP[badge.icon] || Award;
  const isEarned = badge.earned;
  const gradient = CATEGORY_GRADIENTS[badge.category] || 'from-gray-400 to-gray-600';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: index * 0.03, duration: 0.2 }}
          className={`
            flex flex-col items-center gap-1.5 cursor-default
            ${compact ? 'p-1' : 'p-3'}
          `}
        >
          {/* Badge icon container */}
          <div className="relative">
            <div
              className={`
                ${compact ? 'w-10 h-10' : 'w-14 h-14'}
                rounded-xl flex items-center justify-center
                transition-all duration-200
                ${
                  isEarned
                    ? `bg-gradient-to-br ${gradient} shadow-lg hover:scale-110 hover:shadow-xl`
                    : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }
              `}
              style={
                isEarned
                  ? {
                      boxShadow: '0 4px 14px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)',
                    }
                  : undefined
              }
            >
              <Icon
                className={`
                  ${compact ? 'w-5 h-5' : 'w-7 h-7'}
                  ${isEarned ? 'text-white' : 'text-zinc-300 dark:text-zinc-600'}
                `}
                strokeWidth={isEarned ? 2 : 1.5}
              />
            </div>

            {/* Lock overlay for unearned */}
            {!isEarned && (
              <div
                className={`
                  absolute -bottom-1 -right-1
                  ${compact ? 'w-4 h-4' : 'w-5 h-5'}
                  rounded-full bg-zinc-200 dark:bg-zinc-700
                  flex items-center justify-center
                  border-2 border-white dark:border-zinc-900
                `}
              >
                <Lock
                  className={`${compact ? 'w-2 h-2' : 'w-2.5 h-2.5'} text-zinc-400 dark:text-zinc-500`}
                />
              </div>
            )}

            {/* Earned indicator shine */}
            {isEarned && (
              <div
                className={`
                  absolute inset-0 rounded-xl pointer-events-none
                  bg-gradient-to-br from-white/20 to-transparent
                `}
              />
            )}
          </div>

          {/* Label (full mode only) */}
          {!compact && (
            <div className="text-center max-w-[80px]">
              <p
                className={`text-[11px] font-medium leading-tight truncate ${
                  isEarned
                    ? 'text-zinc-800 dark:text-zinc-200'
                    : 'text-zinc-400 dark:text-zinc-500'
                }`}
              >
                {badge.name}
              </p>
            </div>
          )}
        </motion.div>
      </TooltipTrigger>

      <TooltipContent side="top" className="max-w-[200px]">
        <div className="text-center">
          <p className="font-semibold text-sm">{badge.name}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {badge.description}
          </p>
          {isEarned ? (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-medium">
              +{badge.credits} credits earned
            </p>
          ) : (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              +{badge.credits} credits on unlock
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

export default BadgeGrid;
