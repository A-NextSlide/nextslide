/**
 * ChatBlockContainer
 * Base wrapper for all rich chat blocks (theme, outline, etc.)
 * Provides consistent styling and structure for chat artifacts
 */

import React from 'react';
import { cn } from '@/lib/utils';

interface ChatBlockContainerProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'accent' | 'subtle';
}

const ChatBlockContainer: React.FC<ChatBlockContainerProps> = ({
  children,
  className,
  variant = 'default',
}) => {
  return (
    <div
      className={cn(
        "rounded-xl overflow-hidden transition-all duration-200",
        "border shadow-sm hover:shadow-md",
        variant === 'default' && "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700",
        variant === 'accent' && "bg-gradient-to-br from-orange-50 to-white dark:from-orange-950/20 dark:to-zinc-900 border-orange-200 dark:border-orange-800/50",
        variant === 'subtle' && "bg-zinc-50 dark:bg-zinc-900/50 border-zinc-100 dark:border-zinc-800",
        className
      )}
    >
      {children}
    </div>
  );
};

export default ChatBlockContainer;
