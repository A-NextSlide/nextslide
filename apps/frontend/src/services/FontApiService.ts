import { API_CONFIG } from '@/config/environment';

type FontSource = 'pixelbuddha' | 'designer';

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

async function listFonts(source?: FontSource, search?: string, limit = 10, offset = 0): Promise<ListedFont[]> {
  const base = getApiBase();
  const params = new URLSearchParams();
  if (source) params.set('source', source);
  if (search) params.set('search', search);
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  const url = `${base}/api/fonts/list?${params.toString()}`;
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) return [];
  const data = await res.json();
  const fonts = Array.isArray(data?.fonts) ? data.fonts : (Array.isArray(data) ? data : []);
  return fonts as ListedFont[];
}

async function getFontMeta(fontId: string): Promise<FontMeta | null> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/fonts/font/${encodeURIComponent(fontId)}`, { credentials: 'omit' });
  if (!res.ok) return null;
  const meta = await res.json();
  return meta as FontMeta;
}

function buildSimpleFileUrl(fontId: string, styleKey: string): string {
  const base = getApiBase();
  return `${base}/api/fonts/file/${encodeURIComponent(fontId)}?style=${encodeURIComponent(styleKey)}`;
}

async function loadWithFontFace(displayName: string, fileUrl: string, weight: string | number = '400', style: 'normal' | 'italic' = 'normal'): Promise<boolean> {
  try {
    const face = new FontFace(displayName, `url(${fileUrl})`, { weight: String(weight), style });
    const loaded = await face.load();
    (document as any).fonts.add(loaded);
    return true;
  } catch {
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

  findAndLoadByFamily: async (family: string, weightHint: string | number = '400'): Promise<boolean> => {
    const name = normalizeFamily(family);
    if (!name) return false;

    // Search both sources
    const [pb, designer] = await Promise.all([
      listFonts('pixelbuddha', name, 8, 0),
      listFonts('designer', name, 8, 0)
    ]);
    const candidates = [...designer, ...pb];
    if (!candidates.length) return false;

    // Pick best by exact name match (case-insensitive), else first
    const lower = name.toLowerCase();
    const exact = candidates.find(f => f.name?.toLowerCase() === lower);
    const chosen = exact || candidates[0];
    if (!chosen?.id) return false;

    // Try simple endpoint with a sequence of style keys likely to exist for non-PB only
    const chosenSource = (chosen as any).source || '';
    if (chosenSource !== 'pixelbuddha') {
      const stylesToTry = pickStyleKey(weightHint);
      for (const styleKey of stylesToTry) {
        const url = buildSimpleFileUrl(chosen.id, styleKey);
        try { injectPreload(url, name, weightHint); } catch {}
        const ok = await loadWithFontFace(name, url, weightHint, 'normal');
        if (ok) return true;
      }
    }

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
        const isPB = meta.source === 'pixelbuddha';
        const pathOnly = (best.path || best.url || best.filename || '').toString();
        let directUrl: string;
        if (isPB) {
          // Build static asset URL using real on-disk layout under downloads/extracted
          const parts = pathOnly.split('/');
          const exIndex = parts.indexOf('extracted');
          const idIndex = parts.indexOf(meta.id);
          let remainder = '';
          if (exIndex >= 0 && idIndex > exIndex) {
            remainder = parts.slice(idIndex + 1).join('/');
          } else if (idIndex >= 0) {
            remainder = parts.slice(idIndex + 1).join('/');
          } else {
            remainder = pathOnly.split('/').pop() || '';
          }
          const safeRemainder = remainder || pathOnly.split('/').pop() || pathOnly;
          directUrl = `/assets/fonts/pixelbuddha/downloads/extracted/${encodeURIComponent(meta.id)}/${encodePathSegments(safeRemainder)}`;
        } else {
          directUrl = `${base}/api/fonts/designer/${encodeURIComponent(meta.id)}/${encodeURIComponent(best.filename || pathOnly.split('/').pop() || pathOnly)}`;
        }
        try { injectPreload(directUrl, name, weightHint); } catch {}
        const ok = await loadWithFontFace(name, directUrl, weightHint, 'normal');
        if (ok) return true;
      }

      // Last attempt: simple regular again for non-PB only
      if ((chosen as any).source !== 'pixelbuddha') {
        const url = buildSimpleFileUrl(chosen.id, 'regular');
        try { injectPreload(url, name, weightHint); } catch {}
        const ok = await loadWithFontFace(name, url, weightHint, 'normal');
        if (ok) return true;
      }
    } catch {}

    return false;
  }
};


