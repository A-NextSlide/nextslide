import { API_CONFIG } from '@/config/environment';

type FontSource = 'pixelbuddha' | 'designer' | 'google' | 'system' | 'fontshare' | 'cdn' | 'local' | 'unknown';

interface ListedFont {
  id: string;
  name: string;
  source: FontSource;
  tags?: string[];
  // Flexible extras
  [key: string]: any;
}

interface FontMeta {
  id: string;
  name: string;
  source: FontSource;
  // PixelBuddha
  files?: Array<{ path?: string; url?: string; format?: string; weight?: string | number; style?: string }>;
  // Designer
  styles?: Record<string, Array<{ filename?: string; path?: string; format?: string; weight?: string | number; style?: string }>>;
  [key: string]: any;
}

function getApiBase(): string {
  const base = (API_CONFIG.BASE_URL || '').replace(/\/$/, '');
  return base;
}

function normalizeFamily(name: string): string {
  const first = (name || '').split(',')[0] || '';
  return first.replace(/^\s*["']|["']\s*$/g, '').trim();
}

function formatPreferenceRank(fmt?: string): number {
  const f = (fmt || '').toLowerCase();
  if (f === 'woff2') return 4;
  if (f === 'woff') return 3;
  if (f === 'otf') return 2;
  if (f === 'ttf') return 1;
  return 0;
}

function encodePathSegments(p: string): string {
  return p.split('/')
    .filter(seg => seg.length > 0)
    .map(seg => encodeURIComponent(seg))
    .join('/');
}

function pickStyleKey(weightHint?: string | number): string[] {
  const w = String(weightHint || '400');
  // Try a small set of common style keys; server maps many to available variants
  if (Number(w) >= 600) {
    return ['bold', '700', 'semibold', '600', 'medium', '500', 'regular', 'normal', '400'];
  }
  return ['regular', 'normal', '400', 'book', 'medium', '500'];
}

function parseWeightList(weightHint?: string | number): string[] {
  const raw = String(weightHint || '400')
    .split(/[,\s]+/)
    .map(token => token.trim())
    .filter(Boolean);
  const numeric = raw.filter(token => /^\d+$/.test(token));
  if (numeric.length) return Array.from(new Set(numeric));
  return ['400'];
}

function ensureStylesheetLink(href: string): void {
  if (typeof document === 'undefined') return;
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

async function waitForFont(family: string, weight: string | number = '400'): Promise<boolean> {
  if (typeof document === 'undefined' || !('fonts' in document)) return true;
  try {
    await (document as any).fonts.load(`normal ${weight} 1em "${family}"`);
    return true;
  } catch {
    return false;
  }
}

async function loadGoogleFont(family: string, weightHint: string | number = '400'): Promise<boolean> {
  const weights = parseWeightList(weightHint);
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weights.join(';')}&display=swap`;
  ensureStylesheetLink(url);
  return waitForFont(family, weights[0] || '400');
}

async function loadFontshareFont(family: string, weightHint: string | number = '400'): Promise<boolean> {
  const weights = parseWeightList(weightHint);
  const url = `https://api.fontshare.com/v2/css?f[]=${encodeURIComponent(family)}@${weights.join(',')}&display=swap`;
  ensureStylesheetLink(url);
  return waitForFont(family, weights[0] || '400');
}

async function listFonts(source?: FontSource, search?: string, limit = 10, offset = 0, availableOnly: boolean = true): Promise<ListedFont[]> {
  const base = getApiBase();
  const params = new URLSearchParams();
  if (source) params.set('source', source);
  if (search) params.set('search', search);
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  if (availableOnly !== undefined) params.set('available_only', String(availableOnly));
  const url = `${base}/fonts/list?${params.toString()}`;  // BASE_URL already includes /api
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) return [];
  const data = await res.json();
  const fonts = Array.isArray(data?.fonts) ? data.fonts : (Array.isArray(data) ? data : []);
  return fonts as ListedFont[];
}

async function getFontMeta(fontId: string): Promise<FontMeta | null> {
  const base = getApiBase();
  const res = await fetch(`${base}/fonts/font/${encodeURIComponent(fontId)}`, { credentials: 'omit' });  // BASE_URL already includes /api
  if (!res.ok) return null;
  const meta = await res.json();
  return meta as FontMeta;
}

function buildSimpleFileUrl(fontId: string, styleKey: string): string {
  const base = getApiBase();
  return `${base}/fonts/file/${encodeURIComponent(fontId)}?style=${encodeURIComponent(styleKey)}`;  // BASE_URL already includes /api
}

async function loadWithFontFace(displayName: string, fileUrl: string, weight: string | number = '400', style: 'normal' | 'italic' = 'normal'): Promise<boolean> {
  try {
    console.log(`[FontApiService] Loading font: ${displayName} from ${fileUrl}`);
    const face = new FontFace(displayName, `url(${fileUrl})`, { weight: String(weight), style });
    const loaded = await face.load();
    (document as any).fonts.add(loaded);
    console.log(`[FontApiService] ✓ Successfully loaded: ${displayName}`);
    return true;
  } catch (error) {
    console.error(`[FontApiService] ✗ Failed to load font ${displayName} from ${fileUrl}:`, error);
    return false;
  }
}

function injectPreload(url: string, family: string, weight: string | number): void {
  const id = `preload-${family}-${weight}`.replace(/\s+/g, '-').toLowerCase();
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'preload';
  link.as = 'font';
  const ext = (url.split('.').pop() || '').toLowerCase();
  link.type = ext === 'woff2' ? 'font/woff2' : ext === 'woff' ? 'font/woff' : ext === 'otf' ? 'font/otf' : 'font/ttf';
  link.href = url;
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}

export const FontApiService = {
  listFonts,
  getFontMeta,

  recommend: async (payload: {
    deck_title: string;
    vibe: string;
    content_keywords?: string[];
    target_audience?: string;
  }): Promise<any> => {
    const base = getApiBase();
    const res = await fetch(`${base}/fonts/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'omit'
    });
    if (!res.ok) {
      throw new Error(`Font recommendation failed: ${res.status}`);
    }
    return res.json();
  },

  loadFontById: async (fontId: string, family: string, weightHint: string | number = '400'): Promise<boolean> => {
    if (!fontId || !family) return false;
    const stylesToTry = pickStyleKey(weightHint);
    for (const styleKey of stylesToTry) {
      const url = buildSimpleFileUrl(fontId, styleKey);
      try { injectPreload(url, family, weightHint); } catch { }
      const ok = await loadWithFontFace(family, url, weightHint, 'normal');
      if (ok) return true;
    }
    return false;
  },

  findAndLoadByFamily: async (family: string, weightHint: string | number = '400'): Promise<boolean> => {
    const name = normalizeFamily(family);
    if (!name) {
      console.warn(`[FontApiService] Invalid font family name: ${family}`);
      return false;
    }

    console.log(`[FontApiService] Searching for font: ${name}`);

    let candidates = await listFonts(undefined, name, 20, 0, true);
    if (!candidates.length) {
      candidates = await listFonts(undefined, name, 20, 0, false);
    }

    if (!candidates.length) {
      console.warn(`[FontApiService] No backend fonts found matching: ${name}. Trying web font fallback.`);
      return loadGoogleFont(name, weightHint);
    }

    console.log(`[FontApiService] Found ${candidates.length} candidates:`, candidates.map(c => c.name));

    // Pick best by exact name match (case-insensitive), else first
    const lower = name.toLowerCase();
    const exact = candidates.find(f => f.name?.toLowerCase() === lower);
    const chosen = exact || candidates[0];

    if (!chosen?.id) {
      console.warn(`[FontApiService] Chosen font has no ID:`, chosen);
      return false;
    }

    console.log(`[FontApiService] Selected font: ${chosen.name} (ID: ${chosen.id}, Source: ${(chosen as any).source})`);

    const source = (chosen as any).source as FontSource | undefined;
    if (source === 'system') {
      return true;
    }
    if (source === 'google') {
      return loadGoogleFont(name, weightHint);
    }
    if (source === 'fontshare') {
      return loadFontshareFont(name, weightHint);
    }

    const loadedById = await FontApiService.loadFontById(chosen.id, name, weightHint);
    if (loadedById) return true;

    // Fallback: query meta and try the best format via direct endpoints
    try {
      const meta = await getFontMeta(chosen.id);
      if (!meta) return false;

      // Choose best file (prefer woff2 > woff > otf > ttf) and filter macOS resource files
      const okFile = (f: any) => {
        const p = (f?.path || f?.url || f?.filename || '') as string;
        const base = (f?.filename || p.split('/').pop() || '') as string;
        if (!p) return false;
        if (p.includes('/__MACOSX/') || base.startsWith('._')) return false;
        return true;
      };
      let best: { path?: string; url?: string; filename?: string; format?: string } | null = null;
      if (Array.isArray(meta.files) && meta.files.length) {
        best = meta.files
          .filter(okFile)
          .slice()
          .sort((a, b) => formatPreferenceRank(b.format) - formatPreferenceRank(a.format))[0] || null;
      } else {
        const tryKeys = pickStyleKey(weightHint);
        for (const k of tryKeys) {
          const arr = (meta.styles?.[k] || []).filter(okFile);
          if (Array.isArray(arr) && arr.length) {
            best = arr.slice().sort((a, b) => formatPreferenceRank(b.format) - formatPreferenceRank(a.format))[0] || null;
            if (best) break;
          }
        }
      }

      if (best) {
        const base = getApiBase();
        const pathOnly = (best.path || best.url || best.filename || '').toString();
        let directUrl = '';
        if ((meta as any).source === 'pixelbuddha') {
          const prefix = 'assets/fonts/pixelbuddha/';
          const normalized = pathOnly.startsWith(prefix) ? pathOnly.slice(prefix.length) : pathOnly;
          directUrl = `${base}/fonts/pixelbuddha/${encodeURIComponent(meta.id)}/${encodePathSegments(normalized)}`;
        } else {
          const filename = best.filename || pathOnly.split('/').pop() || pathOnly;
          directUrl = `${base}/fonts/designer/${encodeURIComponent(meta.id)}/${encodeURIComponent(filename)}`;
        }

        console.log(`[FontApiService] Trying direct URL: ${directUrl}`);
        try { injectPreload(directUrl, name, weightHint); } catch { }
        const ok = await loadWithFontFace(name, directUrl, weightHint, 'normal');
        if (ok) return true;
      }

      // Last attempt: simple regular
      const url = buildSimpleFileUrl(chosen.id, 'regular');
      console.log(`[FontApiService] Last attempt with simple URL: ${url}`);
      try { injectPreload(url, name, weightHint); } catch { }
      const ok = await loadWithFontFace(name, url, weightHint, 'normal');
      if (ok) return true;
    } catch (error) {
      console.error(`[FontApiService] Error in font loading fallback:`, error);
    }

    console.warn(`[FontApiService] All loading attempts failed for: ${name}`);
    return false;
  }
};
