export interface CitationLike {
  title?: string;
  source?: string;
  url?: string;
}

export interface NormalizedCitation {
  title: string;
  source: string;
  url: string;
  label: string;
  host: string;
  normalizedKey: string;
}

const URL_SCHEME_REGEX = /^[a-z][a-z0-9+\-.]*:\/\//i;

const collapseWhitespace = (value: string | undefined | null): string => {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
};

const stripUrlPunctuation = (value: string): string => value.replace(/[)\]\.,;]+$/g, "");

const ensureScheme = (url: string): string => {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (URL_SCHEME_REGEX.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const normalizeLabelKey = (value: string): string => {
  if (!value) return "";
  const lowered = collapseWhitespace(value).toLowerCase();
  return lowered
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/?$/, "")
    .trim();
};

const normalizeUrlKey = (url: string): string => {
  if (!url) return "";
  try {
    const normalized = new URL(ensureScheme(stripUrlPunctuation(url)));
    const host = (normalized.hostname || "").toLowerCase().replace(/^www\./, "");
    const path = decodeURIComponent(normalized.pathname || "").replace(/\/+$/g, "");
    const query = normalized.search ? normalized.search : "";
    const key = `${host}${path}${query}`;
    return key || host;
  } catch {
    return normalizeLabelKey(url);
  }
};

const hostFromUrl = (url: string): string => {
  if (!url) return "";
  try {
    const parsed = new URL(ensureScheme(stripUrlPunctuation(url)));
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return normalizeLabelKey(url) || url;
  }
};

export const canonicalizeCitation = (citation: CitationLike): NormalizedCitation => {
  const rawUrl = stripUrlPunctuation(collapseWhitespace(citation.url ?? ""));
  const url = rawUrl ? ensureScheme(rawUrl) : "";
  const normalizedKey = normalizeUrlKey(url);
  const host = hostFromUrl(url);
  const rawTitle = collapseWhitespace(citation.title);
  const rawSource = collapseWhitespace(citation.source);

  const sameAsUrl = (value: string) => value && normalizedKey && normalizeLabelKey(value) === normalizedKey;

  const candidates: string[] = [];
  if (rawTitle && !sameAsUrl(rawTitle)) candidates.push(rawTitle);
  if (rawSource && !sameAsUrl(rawSource)) candidates.push(rawSource);
  if (host) candidates.push(host);
  if (url) candidates.push(url);

  const label = candidates.find(Boolean) || "Source";
  const title = rawTitle || label;
  const source = rawSource || (host || label);

  const finalUrl = url || "";

  return {
    title,
    source,
    url: finalUrl,
    label,
    host,
    normalizedKey: normalizedKey || normalizeLabelKey(label)
  };
};

export const dedupeCitations = (citations: CitationLike[]): NormalizedCitation[] => {
  const result: NormalizedCitation[] = [];
  const seen = new Set<string>();

  citations.forEach((citation) => {
    const normalized = canonicalizeCitation(citation);
    const key = normalized.normalizedKey || normalizeLabelKey(normalized.label);
    if (!key) {
      return;
    }
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(normalized);
  });

  return result;
};

export const normalizeForComparison = (citation: CitationLike): string => {
  const normalized = canonicalizeCitation(citation);
  return normalized.normalizedKey;
};

export const deriveFootnoteLabel = (
  footnote: { label: string; url?: string },
  citations: CitationLike[]
): string => {
  const url = collapseWhitespace(footnote.url);
  if (url) {
    const match = dedupeCitations(citations).find((c) => normalizeUrlKey(c.url) === normalizeUrlKey(url));
    if (match) return match.label;
  }

  const label = collapseWhitespace(footnote.label);
  if (label) return label;
  if (url) return hostFromUrl(url);
  return "Source";
};

