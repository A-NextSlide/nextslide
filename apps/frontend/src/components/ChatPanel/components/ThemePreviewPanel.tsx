import { ChevronDown } from 'lucide-react';
import type { ThemePreviewState } from '../utils/themePreview';

interface ThemePreviewPanelProps {
  themePreview: ThemePreviewState | null;
  isOpen: boolean;
  onToggle: () => void;
}

export function ThemePreviewPanel({ themePreview, isOpen, onToggle }: ThemePreviewPanelProps) {
  if (!themePreview) return null;

  return (
    <div className="mt-1">
      <button
        className="w-full text-left text-[10px] px-2 py-1 rounded bg-white/5 border border-zinc-300/50 dark:border-neutral-700/50 hover:bg-white/10 transition-colors"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <div className="flex items-center justify-between">
          <span className="font-medium text-muted-foreground">Theme & assets</span>
          <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {isOpen && (
        <div className="mt-1.5 p-2 rounded bg-white/5 border border-zinc-300/50 dark:border-neutral-700/50 space-y-2">
          {themePreview?.palette && (() => {
            const palette = themePreview.palette;
            const swatches: Array<{ label: string; color: string }> = [];
            const bgColor = palette.primary_background || (Array.isArray(palette.backgrounds) ? palette.backgrounds[0] : null);
            if (bgColor) swatches.push({ label: 'BG', color: String(bgColor) });
            const textColor = palette.primary_text;
            if (textColor) swatches.push({ label: 'Text', color: String(textColor) });
            const reservedSet = new Set([String(bgColor || '').toLowerCase(), String(textColor || '').toLowerCase()].filter(Boolean));
            const brandColors: string[] = Array.isArray(palette.colors) ? palette.colors.map(String) : [];
            const seen = new Set<string>();
            let brandIdx = 0;
            for (let i = 0; i < brandColors.length && swatches.length < 8; i++) {
              const hex = String(brandColors[i] || '').toLowerCase();
              if (!hex || reservedSet.has(hex) || seen.has(hex)) continue;
              seen.add(hex);
              swatches.push({ label: `A${brandIdx + 1}`, color: brandColors[i] });
              brandIdx++;
            }
            if (swatches.length === 0) return null;
            return (
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-muted-foreground w-10 flex-shrink-0">Colors</span>
                <div className="flex gap-1">
                  {swatches.map((s, i) => (
                    <div key={`${s.label}-${i}`} className="w-5 h-5 rounded-sm border border-zinc-300/50 dark:border-neutral-600/50" style={{ background: s.color }} title={`${s.label}: ${s.color}`} />
                  ))}
                </div>
              </div>
            );
          })()}
          {themePreview?.typography && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-muted-foreground w-10 flex-shrink-0">Fonts</span>
              <div className="flex gap-1.5 text-[10px]">
                <span className="px-1.5 py-0.5 rounded-sm bg-zinc-100/50 dark:bg-white/5 border border-zinc-200/50 dark:border-neutral-700/50" style={{ fontFamily: `${themePreview.typography?.hero_title?.family || 'Inter'}, sans-serif`, fontWeight: 600 }}>
                  {themePreview.typography?.hero_title?.family || 'H'}
                </span>
                <span className="px-1.5 py-0.5 rounded-sm bg-zinc-100/50 dark:bg-white/5 border border-zinc-200/50 dark:border-neutral-700/50" style={{ fontFamily: `${themePreview.typography?.body_text?.family || 'Inter'}, sans-serif` }}>
                  {themePreview.typography?.body_text?.family || 'B'}
                </span>
              </div>
            </div>
          )}
          {themePreview?.logo?.url && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-muted-foreground w-10 flex-shrink-0">Logo</span>
              <img src={themePreview.logo.url} alt="Logo" className="h-5 object-contain rounded-sm border border-zinc-200/50 dark:border-neutral-700/50 bg-white" />
            </div>
          )}
          {Array.isArray(themePreview?.tools) && themePreview.tools.length > 0 && (
            <div className="flex items-start gap-1.5">
              <span className="text-[9px] text-muted-foreground w-10 flex-shrink-0 pt-0.5">Tools</span>
              <div className="flex flex-wrap gap-1">
                {themePreview.tools.map((t, i) => (
                  <span key={`${t.label}-${i}`} className={`text-[9px] px-1 py-0.5 rounded-sm ${t.status === 'finish' ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-zinc-100/50 dark:bg-white/5 text-muted-foreground'}`}>
                    {t.status === 'finish' ? '✓' : '...'} {t.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
