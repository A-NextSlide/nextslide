import { useCallback, useRef } from 'react';
import { useThemeStore } from '@/stores/themeStore';

const THEME_DEDUP_WINDOW_MS = 2500;

const postThemePreviewUpdate = (detail: any) => {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('theme_preview_update', { detail }));
  } catch {}
};

const extractLogoCandidates = (obj: any): { url?: string; light_variant?: string; dark_variant?: string } => {
  const result: { url?: string; light_variant?: string; dark_variant?: string } = {};
  if (!obj) return result;
  const isUrl = (value: any) => typeof value === 'string' && /^(https?:|data:image\/)/i.test(value);
  const prefer = (key: 'url' | 'light_variant' | 'dark_variant', value?: any) => {
    if (!value) return;
    if (key === 'url' && !result.url && isUrl(value)) result.url = String(value);
    if (key === 'light_variant' && !result.light_variant && isUrl(value)) result.light_variant = String(value);
    if (key === 'dark_variant' && !result.dark_variant && isUrl(value)) result.dark_variant = String(value);
  };

  try {
    const brandInfo = obj.brandInfo || {};
    const logoInfo = obj.logo_info || {};
    const themeLogo = obj.logo || {};
    const paletteMeta = obj.color_palette?.metadata || obj.palette?.metadata || {};

    prefer('url', themeLogo.url);
    prefer('light_variant', themeLogo.light_variant);
    prefer('dark_variant', themeLogo.dark_variant);
    prefer('url', logoInfo.url);
    prefer('light_variant', logoInfo.light_variant);
    prefer('dark_variant', logoInfo.dark_variant);
    prefer('url', brandInfo.logoUrl || brandInfo.logo_url);
    prefer('light_variant', brandInfo.logo_url_light);
    prefer('dark_variant', brandInfo.logo_url_dark);
    prefer('url', paletteMeta.logo_url);
    prefer('light_variant', paletteMeta.logo_url_light);
    prefer('dark_variant', paletteMeta.logo_url_dark);

    const keys = [
      'logo',
      'logo_url',
      'brand_logo',
      'brand_logo_url',
      'branding',
      'brand',
      'assets',
      'brandAssets',
      'logos',
      'icons',
      'favicon'
    ];

    for (const key of keys) {
      const value = obj[key];
      if (!value) continue;
      if (isUrl(value)) prefer('url', value);
      if (typeof value === 'object') {
        prefer('url', value.url);
        prefer('url', value.src);
        prefer('light_variant', value.light || value.light_variant || value.lightUrl);
        prefer('dark_variant', value.dark || value.dark_variant || value.darkUrl);
        if (Array.isArray(value)) {
          for (const item of value) {
            prefer('url', item);
            prefer('url', item?.url);
            prefer('url', item?.src);
          }
        }
      }
    }

    const stack: any[] = [obj];
    let depth = 0;
    while (stack.length && depth < 4) {
      const node = stack.shift();
      depth += 1;
      if (typeof node === 'object' && node) {
        for (const [, value] of Object.entries(node)) {
          if (isUrl(value)) prefer('url', value);
          if (typeof value === 'object' && value) stack.push(value);
        }
      }
    }
  } catch {}

  return result;
};

const humanizeThemeTool = (name: string | undefined): string => {
  if (!name) return 'Tool';
  const lower = String(name).toLowerCase();
  if (lower.includes('analyze_theme_and_style')) return 'Analyze Theme & Style';
  if (lower.includes('select_colors')) return 'Select Colors';
  if (lower.includes('select_fonts')) return 'Select Fonts';
  if (lower.includes('generate_palette')) return 'Generate Palette';
  const parts = String(name).split('.');
  return parts[parts.length - 1] || String(name);
};

const buildThemeFromOutline = (outline: any) => {
  if (!outline) return null;
  const stylePrefs = outline.stylePreferences || {};
  const colors = stylePrefs.colors || {};
  const colorValues: string[] = [];
  const pushIfValid = (value?: string) => {
    if (typeof value === 'string' && value.trim() && !colorValues.includes(value)) {
      colorValues.push(value);
    }
  };

  pushIfValid(colors.accent1);
  pushIfValid(colors.accent2);
  pushIfValid(colors.accent3);
  pushIfValid(colors.background);
  pushIfValid(colors.text);

  if (colorValues.length === 0) return null;

  const palette = {
    primary_background: colors.background || colorValues[0] || '#FFFFFF',
    primary_text: colors.text || '#1F2937',
    accent_1: colors.accent1 || colorValues[0] || '#FF4301',
    accent_2: colors.accent2 || colorValues[1] || colors.accent1 || '#F59E0B',
    colors: colorValues.slice(0, 6),
    metadata: stylePrefs.logoUrl ? { logo_url: stylePrefs.logoUrl } : {}
  } as any;

  const typography = {
    hero_title: { family: stylePrefs.font || 'Inter' },
    body_text: { family: stylePrefs.bodyFont || stylePrefs.font || 'Inter' }
  };

  const themePayload = {
    theme_name: stylePrefs.vibeContext
      ? `${String(stylePrefs.vibeContext)
          .replace('.com', '')
          .replace('www.', '')
          .trim()
          .replace(/\b\w/g, (c: string) => c.toUpperCase())} Brand Theme`
      : 'Brand Theme',
    color_palette: palette,
    typography,
    brandInfo: stylePrefs.logoUrl ? { logoUrl: stylePrefs.logoUrl } : {},
    visual_style: {}
  };

  const logos = stylePrefs.logoUrl
    ? { url: stylePrefs.logoUrl, source: 'style_preferences' as const }
    : undefined;

  return { themePayload, palette, typography, logos };
};

export const useThemeEventRelay = () => {
  const themePlanShownRef = useRef(false);
  const themeReadyShownRef = useRef(false);
  const themeToolDedupRef = useRef<Map<string, number>>(new Map());
  const themeEventPostedKeysRef = useRef<Set<string>>(new Set());

  const reset = useCallback(() => {
    themePlanShownRef.current = false;
    themeReadyShownRef.current = false;
    themeToolDedupRef.current.clear();
    themeEventPostedKeysRef.current.clear();
  }, []);

  const relayThemeEvent = useCallback((event: any) => {
    if (!event?.type) return;

    const maybeShowPlanBeforeTool = () => {
      if (!themePlanShownRef.current) {
        themePlanShownRef.current = true;
      }
    };

    const shouldPostToolEvent = (status: 'start' | 'finish' | 'error', label: string): boolean => {
      const onceKey = `tool:${status}:${label}`;
      if (themeEventPostedKeysRef.current.has(onceKey)) return false;
      themeEventPostedKeysRef.current.add(onceKey);
      const key = `${status}:${label}`;
      const now = Date.now();
      const last = themeToolDedupRef.current.get(key) || 0;
      if (now - last < THEME_DEDUP_WINDOW_MS) return false;
      themeToolDedupRef.current.set(key, now);
      if (themeToolDedupRef.current.size > 50) {
        themeToolDedupRef.current.forEach((ts, existingKey) => {
          if (now - ts > THEME_DEDUP_WINDOW_MS * 3) themeToolDedupRef.current.delete(existingKey);
        });
      }
      return true;
    };

    if (event.type === 'tool_call') {
      const label = humanizeThemeTool(event.name);
      maybeShowPlanBeforeTool();
      if (shouldPostToolEvent('start', label)) {
        postThemePreviewUpdate({ tool: { label, status: 'start' } });
      }
      return;
    }

    if (event.type === 'tool_result') {
      const label = humanizeThemeTool(event.name);
      if (shouldPostToolEvent('finish', label)) {
        postThemePreviewUpdate({ tool: { label, status: 'finish' } });
      }
      return;
    }

    if (event.type === 'agent_event' && event.agent === 'ThemeDirector') {
      const phase = String(event.phase || '').toLowerCase();
      if (phase === 'complete' && !themeReadyShownRef.current) {
        themeReadyShownRef.current = true;
        postThemePreviewUpdate({});
      }
      return;
    }

    if (event.type === 'artifact' && String(event.kind).toLowerCase() === 'theme_json') {
      try {
        const theme = event?.content?.deck_theme || event?.content?.theme || event?.content;
        const palette = theme?.color_palette || event?.content?.palette;
        const typography = theme?.typography;
        const logos = extractLogoCandidates(theme);
        postThemePreviewUpdate({
          theme,
          palette,
          typography,
          ...(logos.url
            ? { logo: { url: logos.url, light_variant: logos.light_variant, dark_variant: logos.dark_variant, source: 'theme' } }
            : {})
        });
      } catch {}
      return;
    }

    if (event.type === 'theme_generated' && !themeReadyShownRef.current) {
      themeReadyShownRef.current = true;
      try {
        const logos = extractLogoCandidates(event.theme || event);
        postThemePreviewUpdate({
          theme: event.theme,
          palette: event.palette,
          typography: event.theme?.typography,
          ...(logos.url
            ? { logo: { url: logos.url, light_variant: logos.light_variant, dark_variant: logos.dark_variant, source: 'theme' } }
            : {})
        });
      } catch {}
      return;
    }

    if (event.type === 'phase_update' && (event.phase === 'theme_generation' || event.stage === 'theme_generation')) {
      if (!themePlanShownRef.current) {
        themePlanShownRef.current = true;
      }
    }
  }, []);

  const handleOutlineComplete = useCallback((outline: any) => {
    const built = buildThemeFromOutline(outline);
    if (!built) return;

    const { themePayload, palette, typography, logos } = built;

    try {
      const store = useThemeStore.getState();
      const outlineId = outline?.id || '';
      const prevTheme = outlineId ? store.getOutlineTheme?.(outlineId) : undefined;
      if (prevTheme?.id) {
        try { store.removeCustomTheme(prevTheme.id); } catch {}
      }
      try { store.setOutlineDeckTheme?.(outlineId, null); } catch {}
    } catch {}

    postThemePreviewUpdate({
      theme: themePayload,
      palette,
      typography,
      ...(logos ? { logo: logos } : {})
    });
  }, []);

  const handleEvent = useCallback((event: any) => {
    if (!event) return;

    const themeTypes = new Set([
      'agent_event',
      'tool_call',
      'tool_result',
      'artifact',
      'theme_generated',
      'phase_update'
    ]);

    const wrapped = event?.data && themeTypes.has(event.data?.type) ? event.data : null;
    const direct = themeTypes.has(event?.type) ? event : null;

    if (wrapped) {
      relayThemeEvent(wrapped);
    } else if (direct) {
      relayThemeEvent(direct);
    }

    if (event?.type === 'outline_complete') {
      handleOutlineComplete(event?.outline || event?.data?.outline);
    } else if (event?.data?.type === 'outline_complete') {
      handleOutlineComplete(event?.data?.outline);
    }
  }, [handleOutlineComplete, relayThemeEvent]);

  return { handleEvent, reset };
};
