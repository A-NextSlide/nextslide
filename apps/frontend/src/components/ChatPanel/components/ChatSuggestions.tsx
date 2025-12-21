import { useIsMobile } from '@/hooks/use-mobile';

interface ChatSuggestionsProps {
  suggestions: Array<{ label: string; prompt: string }>;
  inputValue: string;
  onSelectSuggestion: (prompt: string) => void;
}

export function ChatSuggestions({ suggestions, inputValue, onSelectSuggestion }: ChatSuggestionsProps) {
  if (suggestions.length === 0) return null;

  const isHidden = inputValue.trim().length > 0;
  const isMobile = useIsMobile();
  const maxHeight = isMobile ? 72 : 120;
  const marginBottom = isMobile ? 6 : 8;
  const gapClass = isMobile ? 'gap-1' : 'gap-1.5';
  const chipClasses = isMobile
    ? 'py-1 px-2 rounded-full text-[10px] leading-none border transition-all duration-150 hover:bg-[#FF4301]/5'
    : 'py-1.5 px-3 rounded-full text-xs leading-none border transition-all duration-150 hover:bg-[#FF4301]/5';

  return (
    <div
      className="mr-2 overflow-visible"
      style={{
        transition: 'opacity 180ms ease, max-height 180ms ease, margin-bottom 180ms ease',
        opacity: isHidden ? 0 : 1,
        maxHeight: isHidden ? 0 : maxHeight,
        marginBottom: isHidden ? 0 : marginBottom,
        pointerEvents: isHidden ? 'none' : 'auto'
      }}
    >
      <div className={`flex flex-wrap ${gapClass}`}>
        {suggestions.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelectSuggestion(s.prompt); }}
            className={chipClasses}
            style={{
              borderColor: 'rgba(255, 67, 1, 0.3)',
              color: '#FF4301',
            }}
            aria-label={`Use suggestion: ${s.label}`}
            title={s.prompt}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
