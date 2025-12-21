const DEFAULT_MAX_WORDS = 12;
const DEFAULT_MAX_CHARS = 70;

const PREFIX_PATTERNS: RegExp[] = [
  /^(?:a|an|the)\s+(?:comprehensive|detailed|in[- ]depth|deep|full|complete|thorough|extensive)\s+(?:analysis|overview|review|assessment|summary|report|study|brief)\s+(?:of|on)\s+/i,
  /^(?:an?\s+)?(?:analysis|overview|review|assessment|summary|report|study|brief)\s+(?:of|on)\s+/i,
  /^(?:a|an|the)\s+(?:deep|detailed|full)\s+dive\s+into\s+/i,
  /^(?:exploring|examining|understanding|mapping|investigating|evaluating)\s+/i,
];

const SPLIT_SEPARATORS = [':', ' - ', ' \u2014 ', ' \u2013 ', ' | ', ';'];

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const exceedsLimits = (value: string, maxWords: number, maxChars: number) =>
  value.length > maxChars || value.split(' ').length > maxWords;

export const normalizeDeckTitle = (
  value?: string,
  options: { maxWords?: number; maxChars?: number } = {}
) => {
  if (!value) return '';
  const maxWords = options.maxWords ?? DEFAULT_MAX_WORDS;
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;

  const original = normalizeWhitespace(value).replace(/^['"]|['"]$/g, '').trim();
  if (!original) return '';

  let cleaned = original;
  PREFIX_PATTERNS.forEach((pattern) => {
    cleaned = cleaned.replace(pattern, '');
  });
  cleaned = cleaned.replace(/^\s*the\s+/i, '').trim();

  for (const separator of SPLIT_SEPARATORS) {
    if (cleaned.includes(separator)) {
      const candidate = cleaned.split(separator, 1)[0]?.trim() ?? '';
      if (candidate.split(' ').length >= 3) {
        cleaned = candidate;
        break;
      }
    }
  }

  if (exceedsLimits(cleaned, maxWords, maxChars) && cleaned.includes(',')) {
    const candidate = cleaned.split(',', 1)[0]?.trim() ?? '';
    if (candidate) cleaned = candidate;
  }

  if (exceedsLimits(cleaned, maxWords, maxChars)) {
    cleaned = cleaned.replace(/\s+for\s+[^,]+$/i, '').trim();
  }

  let truncated = false;
  const words = cleaned.split(' ').filter(Boolean);
  if (words.length > maxWords) {
    cleaned = words.slice(0, maxWords).join(' ');
    truncated = true;
  }

  if (cleaned.length > maxChars) {
    truncated = true;
    const shortened = cleaned.slice(0, maxChars).trim();
    cleaned = shortened.includes(' ')
      ? shortened.slice(0, shortened.lastIndexOf(' ')).trim()
      : shortened;
  }

  cleaned = cleaned.replace(/[ ,;:-]+$/g, '').trim();

  if (truncated && cleaned && !cleaned.endsWith('...')) {
    cleaned = `${cleaned}...`;
  }

  return cleaned || original;
};
