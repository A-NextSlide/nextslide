import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import CommunityGallery from './CommunityGallery';
import { CommunityDeck } from '@/services/communityService';
import { cn } from '@/lib/utils';

interface CommunityBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onDeckClick?: (deck: CommunityDeck) => void;
}

const CommunityBottomSheet: React.FC<CommunityBottomSheetProps> = ({
  isOpen,
  onClose,
  onDeckClick,
}) => {
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className={cn(
          'h-[92vh] rounded-t-2xl p-0 overflow-hidden border-0',
          'flex flex-col'
        )}
      >
        {/* Orange gradient top line */}
        <div className="h-[3px] bg-gradient-to-r from-[#FF6B00] via-[#FF8533] to-[#FF6B00] shrink-0" />

        {/* Pull indicator */}
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
        </div>

        {/* Header - compact */}
        <div className="px-6 pb-3 shrink-0">
          <SheetHeader className="text-left">
            <SheetTitle
              className="text-lg text-zinc-900 dark:text-white"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 700,
                letterSpacing: '-0.01em'
              }}
            >
              Community Slides
            </SheetTitle>
            <SheetDescription className="text-sm text-zinc-500 dark:text-zinc-400">
              Get inspired or learn something new from slides created by the NextSlide community, or remix it to make it your own!
            </SheetDescription>
          </SheetHeader>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 pt-2 pb-6">
          <CommunityGallery
            variant="app"
            showSearch
            showFilters
            onDeckClick={onDeckClick}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default CommunityBottomSheet;
