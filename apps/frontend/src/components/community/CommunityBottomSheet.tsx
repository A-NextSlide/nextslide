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
import { Globe } from 'lucide-react';

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
          'h-[92vh] rounded-t-3xl p-0 overflow-hidden border-0',
          'flex flex-col bg-white dark:bg-zinc-900'
        )}
      >
        {/* Orange gradient top accent */}
        <div className="h-1 bg-gradient-to-r from-[#FF6B00] via-[#FF8533] to-[#FF6B00] shrink-0" />

        {/* Pull indicator */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-12 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full" />
        </div>

        {/* Header - fun and engaging */}
        <div className="px-6 pt-2 pb-4 shrink-0">
          <SheetHeader className="text-left space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-gradient-to-br from-orange-400 to-pink-500 shadow-lg shadow-orange-500/25">
                <Globe className="h-5 w-5 text-white" />
              </div>
              <SheetTitle
                className="text-2xl bg-gradient-to-r from-zinc-900 via-zinc-700 to-zinc-900 dark:from-white dark:via-zinc-200 dark:to-white bg-clip-text text-transparent"
                style={{
                  fontFamily: '"HK Grotesk", "Hanken Grotesk", sans-serif',
                  fontWeight: 800,
                  letterSpacing: '-0.02em'
                }}
              >
                Community Slides
              </SheetTitle>
            </div>
            <SheetDescription
              className="text-sm text-zinc-500 dark:text-zinc-400 pl-11"
              style={{ fontFamily: '"HK Grotesk", "Hanken Grotesk", sans-serif' }}
            >
              Discover amazing slides from creators worldwide. Remix them to make it your own!
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
