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
          'h-[92vh] rounded-t-2xl p-0 overflow-hidden',
          'flex flex-col'
        )}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b bg-white dark:bg-gray-950 shrink-0">
          {/* Pull indicator */}
          <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mb-4" />

          <SheetHeader className="text-left">
            <SheetTitle className="text-xl font-semibold">
              Community Slides
            </SheetTitle>
            <SheetDescription className="text-sm text-gray-500">
              Get inspired by slides created by the NextSlide community. Remix any deck to make it your own!
            </SheetDescription>
          </SheetHeader>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
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
