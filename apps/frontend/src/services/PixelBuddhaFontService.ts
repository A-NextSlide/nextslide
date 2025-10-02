import { API_CONFIG } from '@/config/environment';

type RegistryEntry = {
  family?: string;
  name?: string;
  files?: Array<string | { path?: string; url?: string; filename?: string; format?: string; weight?: string | number; style?: string }>
    | { [key: string]: string };
  urls?: string[];
  variants?: Array<{ weight?: string | number; url?: string; urls?: string[] } | string>;
  path?: string;
  url?: string;
};

// Cache for manifest and loaded fonts
const familyToBestUrl = new Map<string, string>();
const loadingManifest: { promise: Promise<void> | null } = { promise: null };
const injectedFaces = new Set<string>();

function normalizeFamilyKey(name: string): string {
  // Use first family before comma, strip quotes, lowercase, collapse spaces
  const first = (name || '').split(',')[0] || '';
  return first.replace(/^\s*["']|["']\s*$/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function sanitizeDisplayFamily(name: string): string {
  const first = (name || '').split(',')[0] || '';
  return first.replace(/^\s*["']|["']\s*$/g, '').trim();
}

function pickBestUrl(urls: string[] | undefined): string | null {
  if (!urls || urls.length === 0) return null;
  const byPriority = urls
    .slice()
    .sort((a, b) => {
      const extA = (a.split('.').pop() || '').toLowerCase();
      const extB = (b.split('.').pop() || '').toLowerCase();
      const rank = (ext: string) => (ext === 'woff2' ? 3 : ext === 'woff' ? 2 : ext === 'otf' ? 1 : 0);
      return rank(extB) - rank(extA);
    });
  return byPriority[0] || null;
}

function extractUrlsFromEntry(entry: RegistryEntry): string[] {
  const urls = new Set<string>();

  if (Array.isArray(entry.files)) {
    entry.files.forEach(it => {
      if (!it) return;
      if (typeof it === 'string') {
        urls.add(it);
      } else if (typeof it === 'object') {
        if (it.url) urls.add(it.url);
        if (it.path) urls.add(it.path);
      }
    });
  } else if (entry.files && typeof entry.files === 'object') {
    Object.values(entry.files).forEach(u => typeof u === 'string' && urls.add(u));
  }

  if (Array.isArray(entry.urls)) {
    entry.urls.forEach(u => typeof u === 'string' && urls.add(u));
  }

  if (Array.isArray(entry.variants)) {
    entry.variants.forEach(v => {
      if (!v) return;
      if (typeof v === 'string') {
        urls.add(v);
      } else {
        if (v.url) urls.add(v.url);
        if (Array.isArray(v.urls)) v.urls.forEach(u => urls.add(u));
      }
    });
  }

  if (entry.url) urls.add(entry.url);
  if (entry.path) urls.add(entry.path);

  return Array.from(urls);
}

function deriveAliases(entry: RegistryEntry): string[] {
  const aliases = new Set<string>();
  const add = (s?: string) => {
    if (!s) return;
    const key = normalizeFamilyKey(s);
    if (key) aliases.add(key);
  };
  add(entry.family);
  add(entry.name);
  if (Array.isArray(entry.files)) {
    entry.files.forEach(it => {
      if (typeof it === 'object' && it && it.filename) {
        const base = it.filename.replace(/\.(woff2?|otf|ttf|eot)$/i, '');
        add(base);
      }
    });
  }
  return Array.from(aliases);
}

function toRelativeAssetPath(u: string, base: string): string {
  if (!u) return '';
  let href = u.trim();
  // If absolute URL, strip origin and keep path only
  if (/^https?:\/\//i.test(href)) {
    try {
      const parsed = new URL(href);
      href = parsed.pathname;
    } catch {
      // fallback to original
    }
  }
  // Ensure leading slash
  if (!href.startsWith('/')) href = `/${href}`;
  return href;
}

async function loadManifestOnce(): Promise<void> {
  if (loadingManifest.promise) return loadingManifest.promise;

  const base = API_CONFIG.AGENT_BASE_URL?.replace(/\/$/, '') || '';

  loadingManifest.promise = (async () => {
    try {
      // Prefer full registry first
      const registryUrl = `${base}/assets/fonts/pixelbuddha/font_registry.json`;
      const res = await fetch(registryUrl, { credentials: 'omit' });
      if (res.ok) {
        const data = await res.json();
        let entries: any[] = [];
        if (Array.isArray(data)) {
          entries = data as any[];
        } else if (data && typeof data === 'object') {
          // Some registries are objects keyed by id
          if (Array.isArray((data as any).fonts) || Array.isArray((data as any).entries)) {
            entries = ((data as any).fonts || (data as any).entries) as any[];
          } else {
            entries = Object.values(data as Record<string, any>);
          }
        }
        if (entries.length) {
          for (const raw of entries) {
            const entry: RegistryEntry = raw as any;
            const urls = extractUrlsFromEntry(entry).map(u => toRelativeAssetPath(u, base));
            const best = pickBestUrl(urls);
            if (!best) continue;
            const keys = deriveAliases(entry);
            keys.forEach(k => familyToBestUrl.set(k, best));
          }
          return;
        }
      }
    } catch (e) {
      // ignore and try fallback
    }

    try {
      // Fallback to simple list if available (names only won't help mapping, so skip populating)
      const simpleUrl = `${base}/assets/fonts/pixelbuddha/font_list_simple.json`;
      const res2 = await fetch(simpleUrl, { credentials: 'omit' });
      if (res2.ok) {
        const list = await res2.json();
        if (Array.isArray(list)) {
          for (const item of list) {
            if (typeof item === 'string') {
              const key = normalizeFamilyKey(item);
              if (key && !familyToBestUrl.has(key)) familyToBestUrl.set(key, '');
              continue;
            }
            if (item && typeof item === 'object') {
              const name: string = (item.name || item.family || '').trim();
              const primary: string = (item.primaryFile || item.path || item.url || '') as string;
              const key = normalizeFamilyKey(name);
              if (!key) continue;
              const rel = toRelativeAssetPath(primary, base);
              if (rel) {
                familyToBestUrl.set(key, rel);
                // Also alias by filename base if present in primaryFile
                const baseName = primary ? primary.split('/').pop()!.replace(/\.(woff2?|otf|ttf|eot)$/i, '') : '';
                const fileKey = normalizeFamilyKey(baseName);
                if (fileKey) familyToBestUrl.set(fileKey, rel);
              } else if (!familyToBestUrl.has(key)) {
                familyToBestUrl.set(key, '');
              }
            }
          }
        }
      }
    } catch (e) {
      // ignore
    }
  })();

  return loadingManifest.promise;
}

function injectPreload(url: string, family: string, weight: string): void {
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

function injectFontFace(family: string, url: string, weight = '400'): void {
  const id = `ff-${family}-${weight}`.replace(/\s+/g, '-').toLowerCase();
  if (injectedFaces.has(id) || document.getElementById(id)) return;
  const fmt = url.endsWith('.woff2') ? 'woff2' : url.endsWith('.woff') ? 'woff' : url.endsWith('.otf') ? 'opentype' : 'truetype';
  const css = `\n  @font-face {\n    font-family: '${family}';\n    src: url('${url}') format('${fmt}');\n    font-weight: ${weight};\n    font-style: normal;\n    font-display: swap;\n  }`;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
  injectedFaces.add(id);
}

export const PixelBuddhaFontService = {
  isPixelBuddhaFamily: async (family: string): Promise<boolean> => {
    await loadManifestOnce();
    const key = normalizeFamilyKey(family);
    return familyToBestUrl.has(key);
  },

  ensureFontLoaded: async (family: string, weight = '400'): Promise<boolean> => {
    const key = normalizeFamilyKey(family);
    if (!key) return false;
    await loadManifestOnce();
    const stored = familyToBestUrl.get(key);
    if (!stored) return false;
    if (stored.trim() === '') return false; // known name but no url in simple list; fallback
    try {
      // Inject using sanitized single family so CSS matches theme family
      const displayFamily = sanitizeDisplayFamily(family);
      const isDev = (import.meta as any)?.env?.DEV ?? false;
      const base = API_CONFIG.AGENT_BASE_URL?.replace(/\/$/, '') || '';
      const clientUrl = stored.startsWith('/')
        ? (isDev ? stored : `${base}${stored}`)
        : stored;
      injectPreload(clientUrl, displayFamily, weight);
      injectFontFace(displayFamily, clientUrl, weight);
      return true;
    } catch (e) {
      return false;
    }
  }
};


