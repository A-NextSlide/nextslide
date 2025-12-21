import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface OnboardingHeaderProps {
  onCancel?: () => void;
}

const OnboardingHeader: React.FC<OnboardingHeaderProps> = ({ onCancel }) => {
  if (!onCancel) return null;

  return (
    <div className="py-3 sm:py-4 border-b border-zinc-200 dark:border-zinc-800 px-1 sm:px-0">
      <Button
        variant="ghost"
        size="sm"
        onClick={onCancel}
        className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to presentations
      </Button>
    </div>
  );
};

export default OnboardingHeader;
