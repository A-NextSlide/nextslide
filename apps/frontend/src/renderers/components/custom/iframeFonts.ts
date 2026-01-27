import { API_CONFIG } from '@/config/environment';
import { FontLoadingService } from '@/services/FontLoadingService';
import { getFontFamilyWithFallback } from '@/utils/fontUtils';

type FontSource = 'pixelbuddha' | 'designer' | 'google' | 'system' | 'fontshare' | 'cdn' | 'local' | 'unknown';

type FontSpec = {
  family: string;
  weight: number;
  role: 'body' | 'hero';
};

type InjectFontsOptions = {
  bodyFont?: string;
  heroFont?: string;
  extraFonts?: string[];
};

const FONT_MARKER_START = '<!-- NEXTSLIDE FONTS -->';
const FONT_MARKER_END = '<!-- END NEXTSLIDE FONTS -->';

const getApiBase = () => (API_CONFIG.BASE_URL || '').replace(/\/$/, '');

const normalizeFamily = (family?: string) => {
  const raw = String(family || '').split(',')[0]?.trim() || '';
  return raw.replace(/^["']|["']$/g, '');
};

const guessFormat = (url: string) => {
  const ext = url.split('.').pop()?.toLowerCase();
  if (ext === 'woff2') return 'woff2';
  if (ext === 'woff') return 'woff';
  if (ext === 'otf') return 'opentype';
  if (ext === 'ttf') return 'truetype';
  return '';
};

const buildGoogleUrl = (family: string, weights: number[]) => {
  const weightParam = weights.length ? weights.join(';') : '400';
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weightParam}&display=swap`;
};

const buildFontshareUrl = (family: string, weights: number[]) => {
  const weightParam = weights.length ? `@${weights.join(',')}` : '';
  return `https://api.fontshare.com/v2/css?f[]=${encodeURIComponent(family)}${weightParam}&display=swap`;
};

const styleKeyForWeight = (weight: number) => (weight >= 600 ? 'bold' : 'regular');

const buildFontFace = (family: string, srcUrl: string, weight: number) => {
  const format = guessFormat(srcUrl);
  const formatDecl = format ? ` format("${format}")` : '';
  return `
@font-face {
  font-family: "${family}";
  src: url("${srcUrl}")${formatDecl};
  font-weight: ${weight};
  font-style: normal;
  font-display: swap;
}
`;
};

const stripExistingInjection = (html: string) => {
  let result = html;
  let start = result.indexOf(FONT_MARKER_START);
  while (start !== -1) {
    const end = result.indexOf(FONT_MARKER_END, start);
    if (end === -1) break;
    result = result.slice(0, start) + result.slice(end + FONT_MARKER_END.length);
    start = result.indexOf(FONT_MARKER_START);
  }
  return result;
};

const buildFontAssets = (spec: FontSpec) => {
  const family = normalizeFamily(spec.family);
  if (!family) return { links: [] as string[], css: '' };

  const def = FontLoadingService.getFontDefinition(family);
  const source = (def?.source || 'unknown') as FontSource;

  if (source === 'system') {
    return { links: [], css: '' };
  }

  if (source === 'google') {
    const url = buildGoogleUrl(def?.family || family, [spec.weight]);
    return { links: [`<link rel="stylesheet" href="${url}">`], css: '' };
  }

  if (source === 'fontshare') {
    const url = buildFontshareUrl(def?.family || family, [spec.weight]);
    return { links: [`<link rel="stylesheet" href="${url}">`], css: '' };
  }

  if (source === 'cdn' && def?.url) {
    return { links: [`<link rel="stylesheet" href="${def.url}">`], css: '' };
  }

  if ((source === 'designer' || source === 'pixelbuddha') && (def as any)?.id) {
    const fontId = (def as any).id as string;
    const styleKey = styleKeyForWeight(spec.weight);
    const srcUrl = `${getApiBase()}/fonts/file/${encodeURIComponent(fontId)}?style=${encodeURIComponent(styleKey)}`;
    return { links: [], css: buildFontFace(family, srcUrl, spec.weight) };
  }

  if (source === 'local' && def?.url) {
    return { links: [], css: buildFontFace(family, def.url, spec.weight) };
  }

  return { links: [], css: '' };
};

export const injectIframeFonts = (html: string, options: InjectFontsOptions): string => {
  if (!html) return html;

  const bodyFamily = normalizeFamily(options.bodyFont);
  const heroFamily = normalizeFamily(options.heroFont);
  const extraFamilies = (options.extraFonts || []).map(normalizeFamily).filter(Boolean);
  if (!bodyFamily && !heroFamily && extraFamilies.length === 0) return html;

  const specs: FontSpec[] = [];
  if (bodyFamily) specs.push({ family: bodyFamily, weight: 400, role: 'body' });
  if (heroFamily && heroFamily !== bodyFamily) specs.push({ family: heroFamily, weight: 700, role: 'hero' });
  if (heroFamily && heroFamily === bodyFamily) {
    specs.push({ family: heroFamily, weight: 700, role: 'hero' });
  }
  extraFamilies.forEach((family) => {
    if (!family || family === bodyFamily || family === heroFamily) return;
    specs.push({ family, weight: 400, role: 'body' });
  });

  const links: string[] = [];
  let css = '';
  const seenFamilies = new Set<string>();

  specs.forEach((spec) => {
    const family = normalizeFamily(spec.family);
    if (!family || seenFamilies.has(`${family}-${spec.weight}`)) return;
    seenFamilies.add(`${family}-${spec.weight}`);
    const built = buildFontAssets(spec);
    links.push(...built.links);
    css += built.css;
  });

  const bodyFallback = bodyFamily ? getFontFamilyWithFallback(bodyFamily) : 'system-ui, -apple-system, sans-serif';
  const heroFallback = heroFamily ? getFontFamilyWithFallback(heroFamily) : bodyFallback;

  css += `
:root {
  --ns-body-font: ${bodyFallback};
  --ns-hero-font: ${heroFallback};
}
/* Use !important to override inline styles from generated HTML */
/* Body text elements */
body, p, span, div, li, td, th, label, a, blockquote, figcaption,
article, section, aside, nav, main, footer, header {
  font-family: var(--ns-body-font) !important;
}
/* Heading elements - must come after body rules to take precedence */
h1, h2, h3, h4, h5, h6, .hero, .heading, .title, [class*="heading"], [class*="title"] {
  font-family: var(--ns-hero-font) !important;
}
`;

  const injection = [
    FONT_MARKER_START,
    ...links,
    `<style>${css}</style>`,
    FONT_MARKER_END
  ].join('\n');

  const cleaned = stripExistingInjection(html);

  if (cleaned.includes('</head>')) {
    return cleaned.replace('</head>', `${injection}\n</head>`);
  }
  if (cleaned.includes('<body')) {
    return cleaned.replace('<body', `${injection}\n<body`);
  }
  return `${injection}\n${cleaned}`;
};

const GENERIC_FONTS = new Set([
  'inherit',
  'initial',
  'unset',
  'default',
  'auto',
  'sans-serif',
  'serif',
  'monospace',
  'cursive',
  'system-ui'
]);

export const extractFontFamiliesFromHtml = (html: string): string[] => {
  if (!html) return [];
  const results = new Set<string>();
  const fontDecl = /font-family\s*:\s*([^;"}]+)[;"}]/gi;
  let match: RegExpExecArray | null;

  while ((match = fontDecl.exec(html)) !== null) {
    const raw = match[1] || '';
    if (!raw || raw.includes('var(')) continue;
    raw.split(',').forEach((part) => {
      const cleaned = normalizeFamily(part);
      if (!cleaned) return;
      const lower = cleaned.toLowerCase();
      if (GENERIC_FONTS.has(lower)) return;
      results.add(cleaned);
    });
  }

  return Array.from(results);
};
