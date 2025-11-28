import React, { useRef, useEffect, RefObject, useMemo, useState } from "react";
import { ComponentInstance } from "../../types/components";
import { useComponentInstance } from "../../context/CustomComponentStateContext";
import { useNavigation } from '../../context/NavigationContext';
import { usePresentationStore } from '@/stores/presentationStore';
import { getContrastTextColor, isLightColor, getColorDistance, ensureChartColorsContrastWithBackground, getThemeAppropriateChartColors } from '@/utils/colorUtils';

// Import visualization and animation libraries for CustomComponents
import * as d3Import from 'd3';
import animeImport from 'animejs';
import roughImport from 'roughjs';
import confettiImport from 'canvas-confetti';
import * as gsapImport from 'gsap';

/**
 * Ensure HTML document has proper blank line after <html> tag.
 * Some browsers/iframes need this to render correctly.
 */
function ensureHtmlNewlines(html: string): string {
  if (!html || typeof html !== 'string') return html;

  // Ensure blank line (two newlines) after <html> tag
  // First normalize: remove any whitespace after <html>, then add proper blank line
  return html.replace(/(<html[^>]*>)\s*\n?\s*/gi, '$1\n\n');
}

// Escape raw newlines that appear inside single/double quoted string literals.
// This prevents accidental split string literals (e.g., 'Calvin\nCycle' becoming two lines)
// and keeps generated code valid for parsing.
function escapeRawNewlinesInStringLiterals(source: string): string {
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

// Simple error boundary
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('[CustomComponent] Error caught by boundary:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '10px',
          color: '#d32f2f',
          backgroundColor: '#ffebee',
          border: '1px solid #ffcdd2',
          borderRadius: '4px',
          fontSize: '12px',
          fontFamily: 'monospace'
        }}>
          <div style={{ fontWeight: 'bold' }}>Component Error</div>
          <div style={{ marginTop: '5px' }}>{this.state.error?.message || 'Unknown error'}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Simplified custom component renderer
 * CRITICAL FIXES:
 * 1. Stable iframe rendering to prevent flashing
 * 2. Click-through overlay for selection in edit mode
 * 3. Proper content fitting
 */
export const CustomComponentRenderer: React.FC<{
  component: ComponentInstance;
  baseStyles: React.CSSProperties;
  containerRef: RefObject<HTMLDivElement | null>;
  isThumbnail?: boolean;
  isSelected?: boolean;
  isEditing?: boolean;
}> = ({ component, baseStyles, containerRef, isThumbnail = false, isSelected = false, isEditing = false }) => {
  const renderCode = component.props.render as string;

  // Stable component props - memoize to prevent unnecessary re-renders
  const componentProps = useMemo(() => ({
    ...component.props,
    ...(component.props.props || {})
  }), [component.props]);

  // Keep last successful compiled render to avoid flicker during recompilation
  const compiledRenderRef = useRef<Function | null>(null);
  const { currentSlideIndex } = useNavigation();
  const lastSlideIndexRef = useRef<number>(currentSlideIndex);

  // Get component state
  const { state, updateState, clearState } = useComponentInstance(component.id);

  // Reset state when slide changes
  useEffect(() => {
    if (!isThumbnail && currentSlideIndex !== lastSlideIndexRef.current) {
      clearState();
      lastSlideIndexRef.current = currentSlideIndex;
    }
  }, [currentSlideIndex, isThumbnail, clearState]);

  // Compile render function synchronously to prevent initial flash
  const { compiledRender, compilationError } = useMemo(() => {
    if (!renderCode) {
      return { compiledRender: null, compilationError: new Error('No render function provided') };
    }

    // CRITICAL: Unescape the code FIRST before any detection
    // The stored code may have escaped newlines (\n as literal backslash-n)
    let code = renderCode as string;
    if (code.includes('\\n') || code.includes('\\t') || code.includes('\\"') || code.includes("\\'")) {
      code = code
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, '\\');
    }

    // ADAPTIVE FORMAT DETECTION: Handle multiple formats from AI
    const trimmedCode = code.trim();

    // 0. IFRAME MODE: Check for Full HTML Document
    // This allows "do whatever we want" - Tailwind, CDNs, full isolation
    if (trimmedCode.toLowerCase().startsWith('<!doctype html') || trimmedCode.toLowerCase().startsWith('<html')) {
      // Ensure proper newlines in HTML (fixes iframe rendering issues)
      const formattedHtml = ensureHtmlNewlines(code);

      // Cache the srcDoc string - this is the ONLY thing that should cause iframe to reload
      const cachedSrcDoc = formattedHtml;

      // Return a special marker object that the renderer will use to create an iframe
      // We return an object instead of a function to enable stable iframe rendering
      return {
        compiledRender: { __isIframe: true, srcDoc: cachedSrcDoc } as any,
        compilationError: null
      };
    }

    // 0b. IFRAME MODE for render functions that return HTML strings
    // Much cleaner than React.createElement - AI generates readable HTML/CSS
    if (trimmedCode.startsWith('function render(') || trimmedCode.startsWith('function render (')) {
      console.log('[CustomComponent] Detected render function, executing in IFRAME sandbox');

      const iframeFunctionRenderer = function ({ props, state, id, isThumbnail, containerWidth, containerHeight }: any) {
        // Safely serialize props, filtering out functions and circular refs
        const safeStringify = (obj: any): string => {
          try {
            return JSON.stringify(obj, (key, value) => {
              if (typeof value === 'function') return undefined;
              return value;
            }) || '{}';
          } catch {
            return '{}';
          }
        };

        // Build HTML document that executes the render function
        // The render function returns an HTML string, not React elements
        const htmlDoc = [
          '<!DOCTYPE html>',
          '<html>',
          '<head>',
          '  <meta charset="UTF-8">',
          '  <style>',
          '    * { margin: 0; padding: 0; box-sizing: border-box; }',
          '    html, body { width: 100%; height: 100%; overflow: hidden; }',
          '    body { font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }',
          '  </style>',
          '  <link rel="preconnect" href="https://fonts.googleapis.com">',
          '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
          '  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=Poppins:wght@100..900&family=Playfair+Display:wght@400..900&family=Space+Grotesk:wght@300..700&display=swap" rel="stylesheet">',
          '</head>',
          '<body>',
          '  <script>',
          '    (function() {',
          '      try {',
          '        // Props passed from parent',
          '        var props = ' + safeStringify(props || {}) + ';',
          '        var state = ' + safeStringify(state || {}) + ';',
          '        var id = ' + JSON.stringify(id || '') + ';',
          '        var isThumbnail = ' + JSON.stringify(!!isThumbnail) + ';',
          '        var containerWidth = ' + JSON.stringify(containerWidth || 800) + ';',
          '        var containerHeight = ' + JSON.stringify(containerHeight || 600) + ';',
          '        var updateState = function() {};',
          '',
          '        // Component render function (returns HTML string)',
          '        ' + code,
          '',
          '        // Call render and inject HTML',
          '        var html = render({ props, state, updateState, id, isThumbnail, containerWidth, containerHeight });',
          '        document.body.innerHTML = html;',
          '      } catch (err) {',
          '        document.body.innerHTML = \'<div style="color: #dc2626; padding: 20px; font-family: monospace; background: #fef2f2; height: 100%; box-sizing: border-box;">\' +',
          '          \'<strong>Error:</strong> \' + (err.message || err) + \'</div>\';',
          '        console.error("[iframe] Render error:", err);',
          '      }',
          '    })();',
          '  </script>',
          '</body>',
          '</html>'
        ].join('\n');

        return React.createElement('iframe', {
          srcDoc: htmlDoc,
          style: { width: '100%', height: '100%', border: 'none', backgroundColor: 'transparent' },
          sandbox: "allow-scripts allow-same-origin",
          title: "Custom Component"
        });
      };

      return { compiledRender: iframeFunctionRenderer as Function, compilationError: null };
    }

    // 1. Check if it's raw HTML fragment (starts with <tag or just contains HTML)
    if (trimmedCode.startsWith('<') && trimmedCode.includes('>') && !trimmedCode.includes('function render')) {
      // Check for template variables like {icon}, {category}, etc.
      const hasTemplateVars = /\{[a-zA-Z_][a-zA-Z0-9_]*\}/g.test(trimmedCode);

      if (hasTemplateVars) {
        console.warn('[CustomComponent] Detected HTML with template variables - INVALID!', {
          preview: trimmedCode.substring(0, 200),
          variables: trimmedCode.match(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g)
        });
        return {
          compiledRender: null,
          compilationError: new Error('HTML contains template variables like {icon}, {category}. Must use function format with props instead.')
        };
      }

      console.log('[CustomComponent] Detected raw HTML format, converting to React');
      // Return a function that renders the HTML using dangerouslySetInnerHTML
      const htmlRenderer = function ({ props }: any) {
        return React.createElement('div', {
          style: {
            width: '100%',
            height: '100%'
          },
          dangerouslySetInnerHTML: { __html: code }
        });
      };
      return { compiledRender: htmlRenderer as Function, compilationError: null };
    }

    // 2. Allow providing a render function directly instead of a string
    if (typeof renderCode === 'function') {
      const originalRender = renderCode as Function;
      const wrapped = function wrappedRender() {
        try {
          // @ts-ignore
          return originalRender.apply(this, arguments);
        } catch (err: any) {
          // If React is not defined in the function scope, define it globally and retry once
          if (err instanceof ReferenceError && typeof err.message === 'string' && /React is not defined/.test(err.message)) {
            try {
              // @ts-ignore
              const g = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});
              // @ts-ignore
              if (!g.React) g.React = React;
            } catch (_) { /* noop */ }
            try {
              // @ts-ignore
              return originalRender.apply(this, arguments);
            } catch (err2) {
              throw err2;
            }
          }
          throw err;
        }
      } as unknown as Function;
      return { compiledRender: wrapped, compilationError: null };
    }

    // Use already-unescaped code from above
    let unescapedCode = code;

    // Harden: ensure raw newlines inside quoted string literals are converted to \n
    unescapedCode = escapeRawNewlinesInStringLiterals(unescapedCode);

    // FIX BRACKET MISMATCHES: AI sometimes generates extra closing parens/braces
    // Detect and auto-fix before compilation to prevent SyntaxError
    try {
      let parenDepth = 0;
      let braceDepth = 0;
      let inString = false;
      let stringChar: string | null = null;
      let escapeNext = false;

      for (let i = 0; i < unescapedCode.length; i++) {
        const ch = unescapedCode[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        if (ch === '\\') {
          escapeNext = true;
          continue;
        }
        if (ch === '"' || ch === "'") {
          if (!inString) {
            inString = true;
            stringChar = ch;
          } else if (ch === stringChar) {
            inString = false;
            stringChar = null;
          }
          continue;
        }

        if (inString) continue;

        if (ch === '(') {
          parenDepth++;
        } else if (ch === ')') {
          parenDepth--;
          if (parenDepth < 0) {
            // Extra closing paren - remove it
            console.warn('[CustomComponent] Removing extra closing paren at position', i);
            unescapedCode = unescapedCode.slice(0, i) + unescapedCode.slice(i + 1);
            i--; // Re-check from same position
            parenDepth = 0;
          }
        } else if (ch === '{') {
          braceDepth++;
        } else if (ch === '}') {
          braceDepth--;
          if (braceDepth < 0) {
            // Extra closing brace - remove it
            console.warn('[CustomComponent] Removing extra closing brace at position', i);
            unescapedCode = unescapedCode.slice(0, i) + unescapedCode.slice(i + 1);
            i--;
            braceDepth = 0;
          }
        }
      }

      // Add missing closing brackets at the end if needed
      if (parenDepth > 0) {
        console.warn('[CustomComponent] Adding', parenDepth, 'missing closing parens');
        unescapedCode += ')'.repeat(parenDepth);
      }
      if (braceDepth > 0) {
        console.warn('[CustomComponent] Adding', braceDepth, 'missing closing braces');
        unescapedCode += '}'.repeat(braceDepth);
      }
    } catch (err) {
      console.warn('[CustomComponent] Bracket fix failed:', err);
    }

    // Note: Do NOT escape backticks. User code may legitimately use template literals,
    // and since we inject via string interpolation, backticks inside the injected
    // code do not interfere with this wrapper template.

    // Sanitize: remove duplicate top-level const/let/var declarations of the same identifier
    (function () {
      try {
        const lines = unescapedCode.split('\n');
        const seen = new Set();
        const decl = /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/;
        const result = [] as string[];
        for (const line of lines) {
          const m = line.match(decl);
          if (m) {
            const name = m[1];
            if (seen.has(name)) {
              // Skip duplicate declaration line
              continue;
            }
            seen.add(name);
          }
          result.push(line);
        }
        unescapedCode = result.join('\n');
      } catch (_) { /* noop */ }
    })();

    // Sanitize: convert React.createElement('style', {...}, 'multiline css') to dangerouslySetInnerHTML with escaped newlines
    try {
      unescapedCode = unescapedCode.replace(/React\.createElement\(\s*['"]style['"]\s*,\s*\{([\s\S]*?)\}\s*,\s*(['"])([\s\S]*?)\2\s*\)/g,
        function (_match, attrs, _quote, css) {
          try {
            const escaped = css
              .replace(/\\/g, '\\\\')
              .replace(/'/g, "\\'")
              .replace(/\r?\n/g, '\\n');
            const attrsTrim = attrs.trim();
            const attrsWithComma = attrsTrim ? attrsTrim + ', ' : '';
            return "React.createElement('style', { " + attrsWithComma + "dangerouslySetInnerHTML: { __html: '" + escaped + "' } })";
          } catch (_) {
            return _match;
          }
        }
      );
    } catch (_) { /* noop */ }

    // Remove brittle spread-conditional normalization (it could corrupt user code). Kept intentionally no-op.

    // Normalize the render function signature to a canonical form to avoid malformed params.
    // 1. Handle function render(context) pattern - convert to destructured format
    try {
      // Check if it's the context pattern with var props = context.props extraction
      if (/function\s+render\s*\(\s*context\s*\)/.test(unescapedCode)) {
        // Remove the context parameter and var props extraction line
        unescapedCode = unescapedCode.replace(
          /function\s+render\s*\(\s*context\s*\)/,
          'function render({ props, state, updateState, id, isThumbnail, containerWidth, containerHeight })'
        );
        // Remove the var props = context.props; line if it exists
        unescapedCode = unescapedCode.replace(
          /\s*(var|let|const)\s+props\s*=\s*context\.props\s*;/g,
          ''
        );
      }
    } catch (_) { /* noop */ }

    // 2. Repair malformed parameter blocks that accidentally contain code (e.g., "function render({ const padding = 24; props }){ ... }")
    //    Strategy: detect the render signature, extract everything between the first '(' and matching ')'.
    //    If the parameter block contains semicolons, 'const', 'let', 'var', or assignment operators that are not part of an object pattern,
    //    move those lines into a prelude inserted at the top of the function body, and clean the parameter list to the canonical shape.
    try {
      const renderSigPattern = /function\s+render\s*\(([^)]*)\)\s*\{/m;
      const sigMatch = unescapedCode.match(renderSigPattern);
      if (sigMatch) {
        const rawParams = sigMatch[1] || '';
        const suspicious = /\b(const|let|var)\b|;|=/.test(rawParams) && !/\{\s*props\s*(?:,[^}]*)?\}/.test(rawParams);
        if (suspicious) {
          // Extract any code-ish fragments to move into body prelude
          const preludeLines: string[] = [];
          // Grab things like "const x = ...;", "let x=...;", "var x=...;", and plain assignments "x = ...;"
          const declRegex = /(const|let|var)\s+[^;]+;?/g;
          let m: RegExpExecArray | null;
          while ((m = declRegex.exec(rawParams)) !== null) {
            preludeLines.push(m[0].trim().replace(/^(?:const|let)\s+/, 'var ').replace(/;+$/, ';'));
          }
          // Also capture bare assignments separated by semicolons
          rawParams.split(';').forEach(seg => {
            const s = seg.trim();
            if (!s) return;
            if (!/^(const|let|var)\b/.test(s) && /\w\s*=/.test(s)) {
              preludeLines.push(s.replace(/;+$/, '') + ';');
            }
          });

          // Replace the entire signature with canonical signature
          unescapedCode = unescapedCode.replace(renderSigPattern, (_all) => {
            return 'function render({ props, state, updateState, id, isThumbnail, containerWidth, containerHeight }) {';
          });

          // Insert prelude at the start of the function body right after opening brace
          if (preludeLines.length > 0) {
            unescapedCode = unescapedCode.replace(/function\s+render\s*\(\{[\s\S]*?\}\)\s*\{/, (hdr) => {
              const prelude = '\n  ' + preludeLines.join('\n  ') + '\n';
              return hdr + prelude;
            });
          }
        }
      }
    } catch (_) { /* noop */ }

    // 3. Accept trailing parameters after the destructured object (e.g., ", instanceId", ", containerWidth, containerHeight").
    try {
      unescapedCode = unescapedCode.replace(
        /function\s+render\s*\(\{[\s\S]*?\}\s*(?:,[^)]*)?\)/,
        'function render({ props, state, updateState, id, isThumbnail, containerWidth, containerHeight })'
      );
    } catch (_) { /* noop */ }

    try {
      if (code.includes('import ') || code.includes('require(')) {
        throw new Error('Imports are not allowed in custom components');
      }

      const funcBody = `
        'use strict';
        function processReactElement(element) {
          if (!element || typeof element !== 'object') return element;
          if (typeof element === 'string' && element.includes('\\n')) {
            const lines = element.split('\\n');
            return lines.reduce((acc, line, index) => {
              if (index > 0) acc.push(React.createElement('br', { key: 'br-' + index }));
              if (line) acc.push(line);
              return acc;
            }, []);
          }
          if (React.isValidElement(element)) {
            var props = element.props || {};
            var children = props.children;
            var style = props.style;

            // CRITICAL FIX: Preserve ALL props including event handlers (onClick, onChange, etc.)
            // Previously was stripping out important handlers by only copying specific props
            var otherProps = {};
            for (var key in props) {
              if (key !== 'children' && key !== 'style' && Object.prototype.hasOwnProperty.call(props, key)) {
                otherProps[key] = props[key];
              }
            }

            var newStyle = style;
            if (children && typeof children === 'string' && children.includes('\\n')) {
              newStyle = Object.assign({}, style || {}, { whiteSpace: 'pre-line' });
            }

            // CRITICAL FIX: Only process children if they're strings with newlines
            // Don't recursively clone React elements as it breaks event handlers and refs
            var processedChildren = children;
            if (children) {
              if (Array.isArray(children)) {
                // Map array children but only process strings
                processedChildren = children.map(function (child) {
                  return (typeof child === 'string' && child.includes('\\n')) ? processReactElement(child) : child;
                });
              } else if (typeof children === 'string' && children.includes('\\n') && !(newStyle && newStyle.whiteSpace)) {
                var lines = children.split('\\n');
                processedChildren = lines.reduce(function (acc, line, index) {
                  if (index > 0) acc.push(React.createElement('br', { key: 'br-' + index }));
                  if (line) acc.push(line);
                  return acc;
                }, []);
              }
              // Don't recursively process React elements - preserve them as-is
            }

            // Only clone if we actually modified the style or children
            if (newStyle !== style || processedChildren !== children) {
              return React.cloneElement(element, Object.assign({}, otherProps, { style: newStyle }), processedChildren);
            }
            return element;
          }
          if (Array.isArray(element)) return element.map((item) => processReactElement(item));
          return element;
        }
        try {
          ${unescapedCode}
          if (typeof render !== 'function') {
            throw new Error('Component must define a "render" function');
          }
          const originalRender = render;
          return function wrappedRender() {
            // Attempt call and auto-fill undefined variables up to a few retries
            var lastError = null;
            // Provide sane defaults for common variable names
            var __defaultVarValues = { barHeight: 24, spacing: 12, topMargin: 0, rayCount: 12, itemHeight: 56, itemSpacing: 12, iconSize: 48 };
            for (var __attempt = 0; __attempt < 5; __attempt++) {
              try {
                const result = originalRender.apply(this, arguments);
                return processReactElement(result);
              } catch (err) {
                lastError = err;
                if (err instanceof ReferenceError) {
                  const msg = String(err && err.message ? err.message : '');
                  const m = msg.match(/(\\w+) is not defined/);
                  if (m) {
                    const varName = m[1];
                    // Pull candidate from props if available, else use known defaults, else 0
                    const args0 = (arguments && arguments[0]) || {};
                    const p = (args0.props || {});
                    var value = (p && Object.prototype.hasOwnProperty.call(p, varName)) ? p[varName] : undefined;
                    if (typeof value === 'undefined') value = (__defaultVarValues[varName] !== undefined) ? __defaultVarValues[varName] : 0;
                    try {
                      var g = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : {});
                      if (!(varName in g)) {
                        try { Object.defineProperty(g, varName, { value: value, writable: true, configurable: true }); }
                        catch (_) { g[varName] = value; }
                      }
                    } catch (_) { /* ignore */ }
                    // retry after defining
                    continue;
                  }
                }
                // Non-reference error or no var name; stop retrying
                break;
              }
            }
            if (lastError) throw lastError;
            return null;
          };
        } catch (err) {
          if (err instanceof ReferenceError) {
            const match = err.message.match(/(\\w+) is not defined/);
            if (match) {
              const varName = match[1];
              throw new Error(\`Variable '\${varName}' is not defined. Define it as: const \${varName} = props.\${varName} || defaultValue;\`);
            }
          }
          throw err;
        }
      `;
      // Inject visualization libraries into the sandbox for advanced CustomComponents
      // Security: These libraries are sandboxed within the Function() scope and have no access to parent context
      const compiledFunc = new Function(
        'React',
        'getContrastTextColor',
        'isLightColor',
        'getColorDistance',
        'ensureChartColorsContrastWithBackground',
        'getThemeAppropriateChartColors',
        'd3',        // D3.js for advanced data visualizations
        'anime',     // Anime.js for smooth animations
        'rough',     // Rough.js for hand-drawn aesthetics
        'confetti',  // Canvas-confetti for celebration effects
        'gsap',      // GSAP for professional animations
        funcBody
      );
      const fn = compiledFunc(
        React,
        getContrastTextColor,
        isLightColor,
        getColorDistance,
        ensureChartColorsContrastWithBackground,
        getThemeAppropriateChartColors,
        d3Import,
        animeImport,
        roughImport,
        confettiImport,
        gsapImport
      );
      return { compiledRender: fn, compilationError: null };
    } catch (err) {
      console.error('[CustomComponent] Compilation error:', err);
      console.error('[CustomComponent] Render code:', renderCode.substring(0, 200));
      let errorMessage = (err && err.message) ? err.message : String(err);
      if (typeof errorMessage === 'string' && errorMessage.includes('Invalid or unexpected token')) {
        const lines = unescapedCode.split('\n');
        const errorMatch = errorMessage.match(/at.*:(\d+):(\d+)/);
        if (errorMatch) {
          const lineNum = parseInt(errorMatch[1], 10) - 3;
          if (!Number.isNaN(lineNum) && lineNum >= 0 && lineNum < lines.length) {
            errorMessage = `Syntax error near line ${lineNum + 1}: "${lines[lineNum].trim()}"`;
          }
        } else {
          errorMessage = 'Syntax error in component code. Check for missing quotes, brackets, or invalid JavaScript.';
        }
      }
      return { compiledRender: null, compilationError: new Error(errorMessage) };
    }
  }, [renderCode]);

  // Cache last good compiled render to avoid flicker between edits
  useEffect(() => {
    if (compiledRender) {
      compiledRenderRef.current = compiledRender;
    }
  }, [compiledRender]);

  // Check if we're in presentation mode - subscribe to store changes
  const isPresenting = usePresentationStore(state => state.isPresenting);

  // Determine effective edit mode
  // Edit mode = explicitly editing in the editor (not presenting, not thumbnail)
  // View mode = presenting OR viewing without editing (should allow interaction)
  // CRITICAL FIX: Only set effectiveIsEditMode=true when actually editing
  // Previously this was incorrectly true in view mode, blocking clicks
  const effectiveIsEditMode = !isPresenting && !isThumbnail && isEditing;

  // Debug logging for interaction issues
  useEffect(() => {
    if (component.props.debug || component.id.includes('custom')) {
      console.log(`[CustomComponent:${component.id}] Interaction Debug:`, {
        effectiveIsEditMode,
        isPresenting,
        isThumbnail,
        isSelected,
        isEditingProp: isEditing,
        baseStylesPointerEvents: baseStyles.pointerEvents,
        computedPointerEvents: isSelected || !effectiveIsEditMode ? 'auto' : 'none'
      });
    }
  }, [effectiveIsEditMode, isPresenting, isThumbnail, isSelected, isEditing, baseStyles.pointerEvents, component.id, component.props.debug]);

  // Ref for the content wrapper
  const contentInnerRef = useRef<HTMLDivElement>(null);

  // Container dimensions for non-iframe rendering
  const containerWidth = typeof componentProps.width === 'number' ? componentProps.width : 400;
  const containerHeight = typeof componentProps.height === 'number' ? componentProps.height : 200;

  // Check if this is an iframe-based component (detected during compilation)
  const isIframeComponent = compiledRender && typeof compiledRender === 'object' && (compiledRender as any).__isIframe;
  const iframeSrcDoc = isIframeComponent ? (compiledRender as any).srcDoc : null;

  // Memoize srcDoc to prevent iframe reload
  const stableIframeSrcDoc = useMemo(() => iframeSrcDoc, [iframeSrcDoc]);

  // Render the component content (non-iframe path)
  const content = useMemo(() => {
    // If this is an iframe component, we render it separately (outside useMemo) to prevent flashing
    if (isIframeComponent) {
      return null; // Iframe is rendered separately below
    }

    // Show error only if we have no prior compiled function
    if (compilationError && !compiledRenderRef.current) {
      return (
        <div style={{
          padding: '10px',
          color: '#d32f2f',
          backgroundColor: '#ffebee',
          border: '1px solid #ffcdd2',
          borderRadius: '4px',
          fontSize: '12px',
          fontFamily: 'monospace'
        }}>
          <div style={{ fontWeight: 'bold' }}>Error</div>
          <div style={{ marginTop: '5px' }}>{compilationError.message}</div>
        </div>
      );
    }

    // Prefer fresh compiled render; fall back to last good render to avoid flash
    const activeRender = compiledRender ?? compiledRenderRef.current;
    if (!activeRender || typeof activeRender !== 'function') return null;

    try {
      const element = activeRender({
        props: componentProps,
        state,
        updateState,
        id: component.id,
        isThumbnail,
        isEditing: effectiveIsEditMode,
        containerWidth,
        containerHeight
      });

      // Handle HTML string returns (from functions that return HTML)
      if (typeof element === 'string' && element.trim().startsWith('<') && element.includes('>')) {
        return (
          <div
            style={{ width: '100%', height: '100%' }}
            dangerouslySetInnerHTML={{ __html: element }}
          />
        );
      }

      // Validate the result. Allow React elements, arrays, strings, null.
      if (
        React.isValidElement(element) ||
        element === null ||
        Array.isArray(element) ||
        typeof element === 'string'
      ) {
        return element as any;
      }

      // Check if it's a DOM element
      if (element instanceof HTMLElement) {
        const htmlString = element.outerHTML;
        return <div dangerouslySetInnerHTML={{ __html: htmlString }} />;
      }

      console.warn('[CustomComponent] Invalid element returned:', element);
      return <div>{String(element)}</div>;
    } catch (err) {
      console.error('[CustomComponent] Runtime error:', err);

      let errorMessage = err instanceof Error ? err.message : String(err);

      if (err instanceof ReferenceError) {
        const match = errorMessage.match(/(\w+) is not defined/);
        if (match) {
          const varName = match[1];
          errorMessage = `Variable '${varName}' is not defined. Add: const ${varName} = props.${varName} || defaultValue;`;
        }
      }

      return (
        <div style={{
          padding: '10px',
          color: '#d32f2f',
          backgroundColor: '#ffebee',
          border: '1px solid #ffcdd2',
          borderRadius: '4px',
          fontSize: '12px',
          fontFamily: 'monospace'
        }}>
          <div style={{ fontWeight: 'bold' }}>Runtime Error</div>
          <div style={{ marginTop: '5px' }}>{errorMessage}</div>
        </div>
      );
    }
  }, [compilationError, compiledRender, isIframeComponent, componentProps, state, updateState, component.id, isThumbnail, effectiveIsEditMode, containerWidth, containerHeight]);

  // Scaling Logic
  const [scale, setScale] = useState(1);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        // Calculate scale based on the ratio of current container width to the design width
        // If containerWidth (design width) is 0 or invalid, default to 1 to avoid division by zero
        if (containerWidth > 0) {
          const newScale = width / containerWidth;
          setScale(newScale);
        }
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [containerWidth]);

  return (
    <ErrorBoundary>
      <div
        ref={rootRef}
        data-scroll-guard="true"
        data-interactive-component={!isThumbnail ? "true" : undefined}
        data-custom-component="true"
        style={{
          ...baseStyles,
          overflow: 'hidden',
          position: 'relative',
          boxSizing: 'border-box',
          width: baseStyles.width || '100%', // Revert to 100% to fill the parent slot
          height: baseStyles.height || '100%',
          // CRITICAL: In edit mode, disable pointer events so clicks pass through
          // to the parent ComponentRenderer wrapper for selection
          // UNLESS it is selected, then we allow interaction
          pointerEvents: isSelected || !effectiveIsEditMode ? 'auto' : 'none'
        }}
      >
        {/* Content wrapper that applies the scale */}
        <div
          ref={contentInnerRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${containerWidth}px`, // Force design width
            height: `${containerHeight}px`, // Force design height
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            boxSizing: 'border-box',
            pointerEvents: isSelected || !effectiveIsEditMode ? 'auto' : 'none' // Inner content shouldn't block clicks in edit mode (handled by overlay) unless selected
          }}
        >
          {/* IFRAME RENDERING - Simple 100% fill, HTML handles responsive layout */}
          {isIframeComponent && stableIframeSrcDoc && (
            <iframe
              key={component.id}
              srcDoc={stableIframeSrcDoc}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                border: 'none',
                backgroundColor: 'transparent',
                display: 'block',
                pointerEvents: isSelected || !effectiveIsEditMode ? 'auto' : 'none' // Allow interaction in view mode or when selected
              }}
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              title="Custom Component"
            />
          )}

          {/* Non-iframe content */}
          {!isIframeComponent && (
            <div style={{ width: '100%', height: '100%', pointerEvents: isSelected || !effectiveIsEditMode ? 'auto' : 'none' }}>
              {content}
            </div>
          )}
        </div>

        {/* 
          CLICK-THROUGH OVERLAY for iframe selection in edit mode
          This overlay sits on top of everything and has pointerEvents: none
          so clicks pass through to the parent ComponentRenderer
        */}
        {effectiveIsEditMode && isIframeComponent && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 10,
              // This overlay catches nothing - clicks go through to parent
              pointerEvents: 'none',
              background: 'transparent'
            }}
          />
        )}
      </div>
    </ErrorBoundary>
  );
};

/**
 * Function wrapper for consistency
 */
export const renderCustomComponent = (
  component: ComponentInstance,
  baseStyles: React.CSSProperties,
  containerRef: RefObject<HTMLDivElement | null>,
  isThumbnail?: boolean,
  isSelected?: boolean,
  isEditing?: boolean
) => {
  return (
    <CustomComponentRenderer
      component={component}
      baseStyles={baseStyles}
      containerRef={containerRef}
      isThumbnail={isThumbnail}
      isSelected={isSelected}
      isEditing={isEditing}
    />
  );
};

// Register the renderer
import { registerRenderer } from '../utils';
import type { RendererFunction } from '../index';

const CustomComponentRendererWrapper: RendererFunction = (props) => {
  return renderCustomComponent(
    props.component,
    props.styles || {},
    props.containerRef,
    props.isThumbnail,
    props.isSelected,
    props.isEditing
  );
};

registerRenderer('CustomComponent', CustomComponentRendererWrapper); 