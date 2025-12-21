import { describe, expect, it } from 'vitest';
import { fixBrokenCssImports, ensureHtmlNewlines } from './stringUtils';

describe('fixBrokenCssImports', () => {
  it('returns original HTML when no @import statements', () => {
    const html = '<style>body { color: red; }</style>';
    expect(fixBrokenCssImports(html)).toBe(html);
  });

  it('fixes @import with newlines inside single-quoted URL', () => {
    const broken = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;
400&family=Playfair+Display:ital,wght@1,400;
1,600&display=swap');`;
    const expected = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400&family=Playfair+Display:ital,wght@1,400;1,600&display=swap');`;
    expect(fixBrokenCssImports(broken)).toBe(expected);
  });

  it('fixes @import with newlines inside double-quoted URL', () => {
    const broken = `@import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;
400");`;
    const expected = `@import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400");`;
    expect(fixBrokenCssImports(broken)).toBe(expected);
  });

  it('preserves valid @import statements', () => {
    const valid = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400');`;
    expect(fixBrokenCssImports(valid)).toBe(valid);
  });

  it('handles multiple @import statements', () => {
    const broken = `@import url('https://a.com/font?w=300;
400');
@import url('https://b.com/font?w=500;
600');`;
    const expected = `@import url('https://a.com/font?w=300;400');
@import url('https://b.com/font?w=500;600');`;
    expect(fixBrokenCssImports(broken)).toBe(expected);
  });

  it('works within full HTML document', () => {
    const broken = `<!DOCTYPE html>
<html>
<head>
<style>
@import url('https://fonts.com/css?family=Test:wght@300;
400');
body { color: red; }
</style>
</head>
<body></body>
</html>`;
    const result = fixBrokenCssImports(broken);
    expect(result).toContain(`@import url('https://fonts.com/css?family=Test:wght@300;400');`);
    expect(result).toContain('body { color: red; }');
  });
});

describe('ensureHtmlNewlines', () => {
  it('adds blank line after html tag', () => {
    const html = '<html><head></head></html>';
    const result = ensureHtmlNewlines(html);
    expect(result).toContain('<html>\n\n');
  });
});
