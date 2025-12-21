export const extractDomainFromText = (input?: string): string | undefined => {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const urlMatch = trimmed.match(/https?:\/\/[^\s)]+/i);
  const domainMatch = trimmed.match(/\b([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/i);
  const raw = urlMatch?.[0] || domainMatch?.[1];
  if (!raw) return undefined;
  const cleaned = raw.replace(/[),.;]+$/g, '');
  const normalized = cleaned.startsWith('http') ? cleaned : `https://${cleaned}`;
  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    return host || undefined;
  } catch {
    const fallback = cleaned.replace(/^www\./i, '').toLowerCase();
    return fallback.includes('.') ? fallback : undefined;
  }
};
