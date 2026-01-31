import React, { useState, useMemo, useCallback } from 'react';
import { Check, Copy, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/services/analytics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface EmbedCodeGeneratorProps {
  shareCode: string;
  title?: string;
}

interface SizePreset {
  label: string;
  key: string;
  width: string;
  height: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------
const SIZE_PRESETS: SizePreset[] = [
  { label: 'Small', key: 'small', width: '400', height: '300', description: '400 x 300' },
  { label: 'Medium', key: 'medium', width: '640', height: '480', description: '640 x 480' },
  { label: 'Large', key: 'large', width: '960', height: '540', description: '960 x 540' },
  { label: 'Responsive', key: 'responsive', width: '100%', height: '500', description: '100% width' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const EMBED_ORIGIN = 'https://nextslide.ai';

function buildIframeCode(shareCode: string, width: string, height: string): string {
  const src = `${EMBED_ORIGIN}/embed/${shareCode}`;
  const w = width.includes('%') ? `"${width}"` : `"${width}"`;
  const h = `"${height}"`;
  return `<iframe src="${src}" width=${w} height=${h} frameborder="0" allowfullscreen></iframe>`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const EmbedCodeGenerator: React.FC<EmbedCodeGeneratorProps> = ({ shareCode, title }) => {
  const [selectedPreset, setSelectedPreset] = useState<string>('responsive');
  const [copied, setCopied] = useState(false);

  const preset = SIZE_PRESETS.find((p) => p.key === selectedPreset) || SIZE_PRESETS[3];
  const embedCode = useMemo(() => buildIframeCode(shareCode, preset.width, preset.height), [shareCode, preset]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = embedCode;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    trackEvent('embed_code_copied', { shareCode, size: selectedPreset });
    setTimeout(() => setCopied(false), 2000);
  }, [embedCode, shareCode, selectedPreset]);

  // Miniature preview aspect ratio
  const previewWidth = preset.width.includes('%') ? 320 : Math.min(Number(preset.width), 320);
  const previewHeight = preset.width.includes('%')
    ? Math.round((Number(preset.height) / 640) * previewWidth)
    : Math.round((Number(preset.height) / Number(preset.width)) * previewWidth);

  return (
    <div className="space-y-3">
      {/* Section label */}
      <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
        <Code2 className="h-4 w-4 text-muted-foreground" />
        Embed this presentation
      </label>

      {/* Size presets */}
      <div className="flex flex-wrap gap-1.5">
        {SIZE_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setSelectedPreset(p.key)}
            className={cn(
              'px-2.5 py-1 rounded-md text-xs font-medium transition-colors border',
              selectedPreset === p.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted',
            )}
          >
            {p.label}
            <span className="ml-1 opacity-60">{p.description}</span>
          </button>
        ))}
      </div>

      {/* Embed preview */}
      <div className="flex justify-center">
        <div
          className="border border-dashed border-muted-foreground/25 rounded-md bg-zinc-950 flex items-center justify-center overflow-hidden"
          style={{ width: previewWidth, height: Math.max(previewHeight, 80) }}
        >
          <div className="text-[10px] text-zinc-500 text-center leading-tight select-none px-2">
            <div className="mb-0.5 text-zinc-400 font-medium">{title || 'Presentation'}</div>
            embed preview
          </div>
        </div>
      </div>

      {/* Code textarea */}
      <div className="relative">
        <textarea
          readOnly
          value={embedCode}
          rows={3}
          className="w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-xs font-mono text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring select-all"
          onFocus={(e) => e.target.select()}
        />
      </div>

      {/* Copy button */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopy}
        className={cn(
          'w-full transition-colors',
          copied && 'text-green-600 border-green-600/30 bg-green-50',
        )}
      >
        {copied ? (
          <>
            <Check className="h-4 w-4 mr-1.5" />
            Copied!
          </>
        ) : (
          <>
            <Copy className="h-4 w-4 mr-1.5" />
            Copy embed code
          </>
        )}
      </Button>
    </div>
  );
};

export default EmbedCodeGenerator;
