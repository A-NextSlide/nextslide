interface ChatSuggestionsProps {
  suggestions: Array<{ label: string; prompt: string }>;
  inputValue: string;
  onSelectSuggestion: (prompt: string) => void;
}

export function ChatSuggestions({ suggestions, inputValue, onSelectSuggestion }: ChatSuggestionsProps) {
  if (suggestions.length === 0) return null;

  const isHidden = inputValue.trim().length > 0;

  return (
    <div
      className="mr-2 overflow-visible"
      style={{
        transition: 'opacity 180ms ease, max-height 180ms ease, margin-bottom 180ms ease',
        opacity: isHidden ? 0 : 1,
        maxHeight: isHidden ? 0 : 120,
        marginBottom: isHidden ? 0 : 8,
        pointerEvents: isHidden ? 'none' : 'auto'
      }}
    >
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelectSuggestion(s.prompt); }}
            className="py-1.5 px-3 rounded-full text-xs leading-none border transition-all duration-150 hover:bg-[#FF4301]/5"
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
