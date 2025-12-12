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
