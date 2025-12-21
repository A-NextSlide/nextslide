/**
 * String utilities for CustomComponent rendering
 * Extracted from CustomComponentRenderer.tsx
 */

/**
 * Ensure HTML document has proper blank line after <html> tag.
 * Some browsers/iframes need this to render correctly.
 */
export function ensureHtmlNewlines(html: string): string {
  if (!html || typeof html !== 'string') return html;
  // Ensure blank line (two newlines) after <html> tag
  return html.replace(/(<html[^>]*>)\s*\n?\s*/gi, '$1\n\n');
}

/**
 * Fix broken CSS @import statements that have newlines inside URL strings.
 * AI sometimes generates @import url('...') with line breaks inside the URL,
 * which is invalid CSS and breaks the entire stylesheet.
 *
 * Example broken:
 *   @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;
 *   400&family=Playfair+Display:ital,wght@1,400;
 *   1,600&display=swap');
 *
 * Fixed:
 *   @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400&family=Playfair+Display:ital,wght@1,400;1,600&display=swap');
 */
export function fixBrokenCssImports(html: string): string {
  if (!html || typeof html !== 'string') return html;

  // Match @import url('...') or @import url("...") with potential newlines inside
  // The regex captures the full @import statement and we clean it up
  return html.replace(
    /@import\s+url\s*\(\s*(['"])([\s\S]*?)\1\s*\)\s*;/gi,
    (match, quote, url) => {
      // Remove all whitespace (including newlines) from the URL
      const cleanUrl = url.replace(/\s+/g, '');
      return `@import url(${quote}${cleanUrl}${quote});`;
    }
  );
}

/**
 * Fix broken CSS url() declarations that have newlines inside.
 * AI sometimes generates url('data:image/svg+xml;\nutf8,...') with line breaks,
 * which is invalid CSS and breaks the background/etc.
 *
 * Example broken:
 *   background: url('data:image/svg+xml;
 *   utf8,<svg viewBox="0 0 1440 320"...');
 *
 * Fixed:
 *   background: url('data:image/svg+xml;utf8,<svg viewBox="0 0 1440 320"...');
 */
export function fixBrokenCssUrls(html: string): string {
  if (!html || typeof html !== 'string') return html;

  // Match url('...') or url("...") with potential newlines inside
  // Be careful not to break legitimate content - only remove newlines/whitespace
  // that appear right after certain URL components like semicolons
  return html.replace(
    /url\s*\(\s*(['"])([\s\S]*?)\1\s*\)/gi,
    (match, quote, urlContent) => {
      // For data URIs, clean up newlines that break the URI syntax
      if (urlContent.includes('data:')) {
        // Remove newlines and excess whitespace after semicolons and commas in data URIs
        const cleanUrl = urlContent
          .replace(/;\s*\n\s*/g, ';')  // Fix: svg+xml;\nutf8 -> svg+xml;utf8
          .replace(/,\s*\n\s*/g, ',')  // Fix: utf8,\n<svg -> utf8,<svg
          .replace(/\n\s*/g, ' ')      // Replace remaining newlines with space (for SVG content)
          .replace(/\s{2,}/g, ' ');    // Collapse multiple spaces
        return `url(${quote}${cleanUrl}${quote})`;
      }
      // For regular URLs, just remove newlines
      const cleanUrl = urlContent.replace(/\s+/g, '');
      return `url(${quote}${cleanUrl}${quote})`;
    }
  );
}

/**
 * Escape raw newlines that appear inside single/double quoted string literals.
 * This prevents accidental split string literals (e.g., 'Calvin\nCycle' becoming two lines)
 * and keeps generated code valid for parsing.
 */
export function escapeRawNewlinesInStringLiterals(source: string): string {
  const out: string[] = [];
  const modeStack: Array<'normal' | 'single' | 'double' | 'template' | 'templateExpr'> = ['normal'];
  let escapeNext = false;

  const pushMode = (mode: 'normal' | 'single' | 'double' | 'template' | 'templateExpr') => {
    modeStack.push(mode);
  };
  const popMode = () => {
    if (modeStack.length > 1) modeStack.pop();
  };
  const currentMode = () => modeStack[modeStack.length - 1];

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const mode = currentMode();

    if (mode === 'single' || mode === 'double') {
      if (escapeNext) {
        out.push(ch);
        escapeNext = false;
        continue;
      }
      if (ch === '\\') {
        out.push(ch);
        escapeNext = true;
        continue;
      }
      if ((mode === 'single' && ch === '\'') || (mode === 'double' && ch === '"')) {
        out.push(ch);
        popMode();
        continue;
      }
      if (ch === '\r') {
        // Normalize CRLF or lone CR to \n
        if (source[i + 1] === '\n') {
          out.push('\\n');
          i++;
        } else {
          out.push('\\n');
        }
        continue;
      }
      if (ch === '\n') {
        out.push('\\n');
        continue;
      }
      out.push(ch);
      continue;
    }

    if (mode === 'template') {
      if (escapeNext) {
        out.push(ch);
        escapeNext = false;
        continue;
      }
      if (ch === '\\') {
        out.push(ch);
        escapeNext = true;
        continue;
      }
      // Enter expression region
      if (ch === '$' && source[i + 1] === '{') {
        out.push('${');
        i++;
        pushMode('templateExpr');
        continue;
      }
      // End of template literal
      if (ch === '`') {
        out.push(ch);
        popMode();
        continue;
      }
      // Template literal raw content (newlines allowed) - do not transform
      out.push(ch);
      continue;
    }

    if (mode === 'templateExpr') {
      if (escapeNext) {
        out.push(ch);
        escapeNext = false;
        continue;
      }
      if (ch === '\\') {
        out.push(ch);
        escapeNext = true;
        continue;
      }
      // Track nested template expressions
      if (ch === '{') {
        out.push(ch);
        pushMode('templateExpr');
        continue;
      }
      if (ch === '}') {
        out.push(ch);
        popMode();
        continue;
      }
      // Allow starting quoted strings inside the expression
      if (ch === '\'') {
        out.push(ch);
        pushMode('single');
        continue;
      }
      if (ch === '"') {
        out.push(ch);
        pushMode('double');
        continue;
      }
      if (ch === '`') {
        out.push(ch);
        pushMode('template');
        continue;
      }
      out.push(ch);
      continue;
    }

    // mode === 'normal'
    if (escapeNext) {
      out.push(ch);
      escapeNext = false;
      continue;
    }
    if (ch === '\\') {
      out.push(ch);
      escapeNext = true;
      continue;
    }
    if (ch === '\'') {
      out.push(ch);
      pushMode('single');
      continue;
    }
    if (ch === '"') {
      out.push(ch);
      pushMode('double');
      continue;
    }
    if (ch === '`') {
      out.push(ch);
      pushMode('template');
      continue;
    }
    out.push(ch);
  }

  return out.join('');
}
