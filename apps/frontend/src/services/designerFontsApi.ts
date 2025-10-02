export interface DesignerFontListItem {
  id: string;
  name: string;
  family: string;
  category?: 'display' | 'sans' | 'serif' | 'slab' | string;
  tags?: string[];
  previewSample?: string;
}

export interface DesignerFontCatalog {
  categories: Record<string, DesignerFontListItem[]>;
}

export interface DesignerFontFile {
  filename: string;
  style: string; // e.g., regular, italic, bold
  weight?: number;
  format?: 'woff2' | 'woff' | 'otf' | 'ttf' | string;
  url?: string; // optional direct URL
}

export interface DesignerFontDetails {
  id: string;
  name: string;
  family: string;
  description?: string;
  tags?: string[];
  styles?: Array<{
    style: string;
    weight?: number;
    files: DesignerFontFile[];
  }>;
}

export interface DesignerFontRecommendationRequest {
  title?: string;
  vibe?: string;
  context?: Record<string, any>;
}

export interface DesignerFontRecommendation {
  heading: { id: string; name: string };
  body: { id: string; name: string };
  reason?: string;
}

const BASE = '/api/fonts';

export const designerFontsApi = {
  async list(params: { source?: 'designer'; category?: 'display' | 'sans' | 'serif' | 'slab'; search?: string } = {}): Promise<DesignerFontListItem[]> {
    const query = new URLSearchParams();
    if (params.source) query.set('source', params.source);
    if (params.category) query.set('category', params.category);
    if (params.search) query.set('search', params.search);
    const res = await fetch(`${BASE}/list?${query.toString()}`, { credentials: 'include' });
    if (!res.ok) throw new Error(`Failed to list designer fonts: ${res.status}`);
    return res.json();
  },

  async catalog(): Promise<DesignerFontCatalog> {
    const res = await fetch(`${BASE}/catalog`, { credentials: 'include' });
    if (!res.ok) throw new Error(`Failed to fetch catalog: ${res.status}`);
    return res.json();
  },

  async details(fontId: string): Promise<DesignerFontDetails> {
    const res = await fetch(`${BASE}/font/${encodeURIComponent(fontId)}`, { credentials: 'include' });
    if (!res.ok) throw new Error(`Failed to fetch font details: ${res.status}`);
    return res.json();
  },

  fileUrlByStyle(fontId: string, style: string = 'regular'): string {
    const query = new URLSearchParams({ style });
    return `${BASE}/file/${encodeURIComponent(fontId)}?${query.toString()}`;
  },

  designerFileUrl(fontId: string, filename: string): string {
    return `${BASE}/designer/${encodeURIComponent(fontId)}/${encodeURIComponent(filename)}`;
  },

  async recommend(payload: DesignerFontRecommendationRequest): Promise<DesignerFontRecommendation[]> {
    const res = await fetch(`${BASE}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Failed to get recommendations: ${res.status}`);
    return res.json();
  },

  async useCase(useCase: string): Promise<DesignerFontListItem[]> {
    const res = await fetch(`${BASE}/use-case/${encodeURIComponent(useCase)}`, { credentials: 'include' });
    if (!res.ok) throw new Error(`Failed to get use-case fonts: ${res.status}`);
    return res.json();
  }
};

export function chooseBestFile(files: DesignerFontFile[]): DesignerFontFile | null {
  if (!files || files.length === 0) return null;
  const woff2 = files.find(f => (f.format || '').toLowerCase() === 'woff2');
  if (woff2) return woff2;
  const woff = files.find(f => (f.format || '').toLowerCase() === 'woff');
  if (woff) return woff;
  return files[0];
}


