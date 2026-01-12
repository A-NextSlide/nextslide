import React from 'react';
import { cn } from '@/lib/utils';
import { X, Gamepad2 } from 'lucide-react';
import SlideStackerGame from '@/components/common/games/SlideStackerGame';

interface GenerationGameOverlayProps {
  isVisible: boolean;
}

const GenerationGameOverlay: React.FC<GenerationGameOverlayProps> = ({ isVisible }) => {
  const handleDismiss = () => {
    window.dispatchEvent(new CustomEvent('hide-waiting-game'));
  };

  if (!isVisible) return null;

  return (
    <div className="absolute inset-0 z-[60]">
      <div
        className={cn(
          'rounded-2xl shadow-2xl border border-border backdrop-blur-xl bg-background/95',
          'overflow-hidden h-full w-full flex flex-col'
        )}
        style={{
          boxShadow: '0 20px 40px rgba(0,0,0,0.1), 0 0 0 1px rgba(255,67,1,0.1)',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)'
        }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-start gap-3 border-b border-orange-100">
          <div
            className="h-10 w-10 rounded-full flex items-center justify-center shadow-md"
            style={{
              background: 'linear-gradient(135deg, #FF4301 0%, #FF6B35 100%)',
              boxShadow: '0 4px 12px rgba(255, 67, 1, 0.3)'
            }}
          >
            <Gamepad2 className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="text-base font-bold tracking-tight bg-gradient-to-r from-orange-600 to-pink-600 bg-clip-text text-transparent"
              style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", system-ui, sans-serif' }}
            >
              Let's Play While We Wait!
            </div>
            <div
              className="mt-1 text-sm text-muted-foreground"
              style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
            >
              Slide gen may take about a minute. Play time?
            </div>
          </div>
          {/* Close button */}
          <button
            aria-label="Close"
            className="group relative p-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-600 hover:text-orange-700 transition-all duration-200 transform hover:scale-110"
            onClick={handleDismiss}
          >
            <X className="w-5 h-5 relative z-10" />
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-orange-400 to-pink-400 opacity-0 group-hover:opacity-20 transition-opacity duration-200" />
          </button>
        </div>

        {/* Game Container */}
        <div className="flex-1 overflow-hidden relative">
          <SlideStackerGame onClose={handleDismiss} />
        </div>
      </div>
    </div>
  );
};

export default GenerationGameOverlay;
