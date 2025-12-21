import { useEffect, useState, useRef } from 'react';
import { getInitialThemePreview, type ThemePreviewState } from '../utils/themePreview';

interface UseThemePreviewStateOptions {
  outline?: { stylePreferences?: any } | null;
  currentPhase: string | null;
}

export function useThemePreviewState({ outline, currentPhase }: UseThemePreviewStateOptions) {
  const [themePreview, setThemePreview] = useState<ThemePreviewState | null>(() => getInitialThemePreview(outline));
  const [isThemePreviewOpen, setIsThemePreviewOpen] = useState(false);

  // Use ref to track isThemePreviewOpen to avoid circular dependency in event listener
  const isThemePreviewOpenRef = useRef(isThemePreviewOpen);
  isThemePreviewOpenRef.current = isThemePreviewOpen;

  useEffect(() => {
    const sp = outline?.stylePreferences;
    if (!sp?.colors) return;
    if (!themePreview?.palette?.colors?.length) {
      const initialTheme = getInitialThemePreview(outline);
      if (initialTheme) {
        setThemePreview(initialTheme);
      }
    }
  }, [outline?.stylePreferences?.colors?.accent1, outline?.stylePreferences?.colors?.background, themePreview?.palette?.colors?.length]);

  useEffect(() => {
    const onThemePreview = (event: CustomEvent) => {
      const detail = event.detail || {};
      const { theme, palette, typography, tools, images, logo, tool } = detail;
      setThemePreview((prev) => {
        const next: ThemePreviewState = {
          theme: theme ?? prev?.theme,
          palette: palette ?? prev?.palette,
          typography: typography ?? prev?.typography,
          images: images ?? prev?.images,
          logo: logo ?? prev?.logo,
          tools: prev?.tools ? [...prev.tools] : []
        };

        const normalizeTool = (entry: any) => {
          if (!entry?.label) return null;
          return {
            label: String(entry.label),
            status: String(entry.status || 'start'),
          };
        };

        const incomingTools: Array<{ label: string; status: string }> = [];
        if (Array.isArray(tools)) {
          tools.map(normalizeTool).forEach((t) => { if (t) incomingTools.push(t); });
        }
        if (tool) {
          const normalized = normalizeTool(tool);
          if (normalized) incomingTools.push(normalized);
        }

        if (incomingTools.length > 0) {
          const updated = Array.isArray(next.tools) ? [...next.tools] : [];
          incomingTools.forEach((incoming) => {
            const key = incoming.label.toLowerCase().trim();
            const existingIndex = updated.findIndex(t => String(t.label || '').toLowerCase().trim() === key);
            if (existingIndex >= 0) {
              const existing = updated[existingIndex];
              if (existing.status === 'finish' && incoming.status !== 'finish') {
                return;
              }
              updated.splice(existingIndex, 1);
            }
            updated.push(incoming);
          });
          next.tools = updated.slice(-8);
        }

        try {
          const isUrl = (v: any) => typeof v === 'string' && /^(https?:|data:image\/)\S+/i.test(v);
          const deriveLogo = (obj: any): { url?: string; light_variant?: string; dark_variant?: string } => {
            const out: { url?: string; light_variant?: string; dark_variant?: string } = {};
            if (!obj) return out;
            const setIf = (k: 'url' | 'light_variant' | 'dark_variant', v?: any) => {
              if (isUrl(v) && !out[k]) (out as any)[k] = String(v);
            };
            const brandInfo = (obj as any).brandInfo || {};
            const logoInfo = (obj as any).logo_info || {};
            const themeLogo = (obj as any).logo || {};
            const paletteMeta = (obj as any).color_palette?.metadata || (obj as any).palette?.metadata || {};
            setIf('url', themeLogo.url);
            setIf('light_variant', themeLogo.light_variant);
            setIf('dark_variant', themeLogo.dark_variant);
            setIf('url', logoInfo.url);
            setIf('light_variant', logoInfo.light_variant);
            setIf('dark_variant', logoInfo.dark_variant);
            setIf('url', brandInfo.logoUrl || brandInfo.logo_url);
            setIf('light_variant', brandInfo.logo_url_light);
            setIf('dark_variant', brandInfo.logo_url_dark);
            setIf('url', paletteMeta.logo_url);
            setIf('light_variant', paletteMeta.logo_url_light);
            setIf('dark_variant', paletteMeta.logo_url_dark);
            for (const key of ['logo', 'logo_url', 'brand_logo', 'brand_logo_url']) {
              const value = (obj as any)[key];
              if (isUrl(value)) setIf('url', value);
              if (value && typeof value === 'object') {
                setIf('url', (value as any).url);
                setIf('url', (value as any).src);
              }
            }
            return out;
          };
          const existing = (next.logo || {}) as any;
          if (!existing.url) {
            const fromTheme = deriveLogo(next.theme || {});
            const fromPalette = deriveLogo({ palette: next.palette });
            const url = existing.url || fromTheme.url || fromPalette.url;
            const light = existing.light_variant || fromTheme.light_variant || fromPalette.light_variant;
            const dark = existing.dark_variant || fromTheme.dark_variant || fromPalette.dark_variant;
            if (url || light || dark) {
              next.logo = { url, light_variant: light, dark_variant: dark, source: (existing.source || 'derived') };
            }
          }
        } catch { }

        return next;
      });
      // Use ref to check current state without causing re-registration of listener
      if (!isThemePreviewOpenRef.current) setIsThemePreviewOpen(true);
    };
    window.addEventListener('theme_preview_update', onThemePreview as EventListener);
    return () => window.removeEventListener('theme_preview_update', onThemePreview as EventListener);
  }, []); // Empty dependency - listener doesn't need to change

  // Track if we have theme preview data - only care about existence, not content
  const hasThemePreviewRef = useRef(!!themePreview);
  hasThemePreviewRef.current = !!themePreview;

  useEffect(() => {
    if (!currentPhase) return;
    const p = String(currentPhase);
    if (p === 'theme_generation' || p === 'image_collection') {
      if (hasThemePreviewRef.current) setIsThemePreviewOpen(true);
    } else if (p === 'slide_generation' || p === 'finalization' || p === 'generation_complete') {
      setIsThemePreviewOpen(false);
    }
  }, [currentPhase]); // Only depend on currentPhase, not themePreview object

  return {
    themePreview,
    setThemePreview,
    isThemePreviewOpen,
    setIsThemePreviewOpen,
  };
}
