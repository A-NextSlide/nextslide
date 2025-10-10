import React, { useRef, useEffect, RefObject, useMemo, useState, useCallback } from "react";
import { ComponentInstance } from "../../types/components";
import { useComponentInstance } from "../../context/CustomComponentStateContext";
import { DEFAULT_SLIDE_WIDTH } from '../../utils/deckUtils';
import { useNavigation } from '../../context/NavigationContext';
import { usePresentationStore } from '@/stores/presentationStore';
import { CustomComponentOptimizationService } from '@/services/CustomComponentOptimizationService';

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
 */
export const CustomComponentRenderer: React.FC<{
  component: ComponentInstance;
  baseStyles: React.CSSProperties;
  containerRef: RefObject<HTMLDivElement | null>;
  isThumbnail?: boolean;
}> = ({ component, baseStyles, containerRef, isThumbnail = false }) => {
  const renderCode = component.props.render as string;
  
  // Merge all component props (including width, height, x, y) with the custom props
  const componentProps = {
    ...component.props,
    ...(component.props.props || {})
  };
  
  // Keep last successful compiled render to avoid flicker during recompilation
  const compiledRenderRef = useRef<Function | null>(null);
  const { currentSlideIndex } = useNavigation();
  const lastSlideIndexRef = useRef<number>(currentSlideIndex);
  
  // Get component state
  const { state, updateState, forceUpdate, clearState } = useComponentInstance(component.id);
  
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
    
    // ADAPTIVE FORMAT DETECTION: Handle multiple formats from AI
    // 1. Check if it's raw HTML (starts with <tag or just contains HTML)
    const trimmedCode = (renderCode as string).trim();
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
      const htmlRenderer = function({ props }: any) {
        return React.createElement('div', {
          style: {
            width: '100%',
            height: '100%'
          },
          dangerouslySetInnerHTML: { __html: renderCode as string }
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

    let unescapedCode = renderCode;
    if (renderCode.includes('\n') || renderCode.includes('\t') || renderCode.includes('\"') || renderCode.includes("\'")) {
      unescapedCode = renderCode
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, '\\');
    }

    // Harden: ensure raw newlines inside quoted string literals are converted to \n
    unescapedCode = escapeRawNewlinesInStringLiterals(unescapedCode);

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
    // Accept trailing parameters after the destructured object (e.g., ", instanceId").
    try {
      unescapedCode = unescapedCode.replace(
        /function\s+render\s*\(\{[\s\S]*?\}\s*(?:,[^)]*)?\)/,
        'function render({ props, state, updateState, id, isThumbnail })'
      );
    } catch (_) { /* noop */ }

    try {
      if (renderCode.includes('import ') || renderCode.includes('require(')) {
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
            var processedChildren = children;
            if (children) {
              if (Array.isArray(children)) {
                processedChildren = children.map(function (child) { return processReactElement(child); });
              } else if (typeof children === 'string' && children.includes('\\n') && !(newStyle && newStyle.whiteSpace)) {
                var lines = children.split('\\n');
                processedChildren = lines.reduce(function (acc, line, index) {
                  if (index > 0) acc.push(React.createElement('br', { key: 'br-' + index }));
                  if (line) acc.push(line);
                  return acc;
                }, []);
              } else {
                processedChildren = processReactElement(children);
              }
            }
            return React.cloneElement(element, Object.assign({}, otherProps, { style: newStyle }), processedChildren);
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
      const compiledFunc = new Function('React', funcBody);
      const fn = compiledFunc(React);
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
  
  // Check if we're in presentation mode
  const isPresenting = usePresentationStore(state => state.isPresenting);
  
  // Calculate scale
  const scaleFactor = useMemo(() => {
    if (isThumbnail || isPresenting) return 1;
    const container = document.getElementById('slide-display-container');
    const width = container?.offsetWidth || 900;
    return width / DEFAULT_SLIDE_WIDTH;
  }, [isThumbnail, isPresenting]);
  
  // Dynamic fit-to-box scaling (non-persistent): scales content down to fit, back up to 1 when growing
  const contentInnerRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ scale: number; offsetX: number; offsetY: number }>({ scale: 1, offsetX: 0, offsetY: 0 });
  // Hide content until first fit is computed, and during active resizing
  const [isFitReady, setIsFitReady] = useState(false);
  const [isResizingNow, setIsResizingNow] = useState(false);
  const isResizingNowRef = useRef(false);
  useEffect(() => { isResizingNowRef.current = isResizingNow; }, [isResizingNow]);
  
  const computeFit = useCallback(() => {
    const containerEl = containerRef?.current as HTMLDivElement | null;
    const contentEl = contentInnerRef.current as HTMLDivElement | null;
    if (!containerEl || !contentEl) return;
    
    // Consider any saved optimization scale so our math uses the pre-transform coordinate space
    const savedScale = (component?.props as any)?._optimizedScale || 1;
    const outerScale = (!isThumbnail && !isPresenting) ? scaleFactor : 1;
    const effectiveParentScale = outerScale * savedScale;
    
    // Container size in the unscaled coordinate system of its absolutely-positioned children
    const containerW = Math.max(0, containerEl.clientWidth / (effectiveParentScale || 1));
    const containerH = Math.max(0, containerEl.clientHeight / (effectiveParentScale || 1));
    
    // Natural content size (scroll* is unaffected by CSS transforms)
    const naturalW = Math.max(0, contentEl.scrollWidth || contentEl.offsetWidth || 0);
    const naturalH = Math.max(0, contentEl.scrollHeight || contentEl.offsetHeight || 0);
    if (naturalW === 0 || naturalH === 0 || containerW === 0 || containerH === 0) {
      setFit(prev => (prev.scale !== 1 || prev.offsetX !== 0 || prev.offsetY !== 0) ? { scale: 1, offsetX: 0, offsetY: 0 } : prev);
      return;
    }
    
    const s = Math.min(containerW / naturalW, containerH / naturalH, 1);
    const dispW = naturalW * s;
    const dispH = naturalH * s;
    const ox = Math.max(0, (containerW - dispW) / 2);
    const oy = Math.max(0, (containerH - dispH) / 2);
    
    setFit(prev => (prev.scale !== s || prev.offsetX !== ox || prev.offsetY !== oy) ? { scale: s, offsetX: ox, offsetY: oy } : prev);
    // Mark fit ready when not actively resizing
    if (!isResizingNowRef.current) {
      setIsFitReady(true);
    }
  }, [containerRef, scaleFactor, isThumbnail, isPresenting, component?.props]);
  
  useEffect(() => {
    // Initial compute + observe container/content size changes
    computeFit();
    const containerEl = containerRef?.current as HTMLDivElement | null;
    const contentEl = contentInnerRef.current as HTMLDivElement | null;
    const ro: ResizeObserver | null = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(() => {
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => computeFit());
      } else {
        computeFit();
      }
    }) : null;
    if (ro) {
      if (containerEl) ro.observe(containerEl);
      if (contentEl) ro.observe(contentEl);
    }
    const onResize = () => computeFit();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (ro) ro.disconnect();
    };
  }, [computeFit]);

  // Listen for resize start/end events to hide during interactive resizing
  useEffect(() => {
    const onResizeStart = (e: Event) => {
      const anyEvent = e as any;
      if (anyEvent?.detail?.componentId === component.id) {
        setIsResizingNow(true);
        setIsFitReady(false);
      }
    };
    const onResizeEnd = (e: Event) => {
      const anyEvent = e as any;
      if (anyEvent?.detail?.componentId === component.id) {
        setIsResizingNow(false);
        // Recompute fit immediately and reveal on next frame
        computeFit();
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(() => setIsFitReady(true));
        } else {
          setIsFitReady(true);
        }
      }
    };
    document.addEventListener('component:resizestart', onResizeStart as any);
    document.addEventListener('component:resizeend', onResizeEnd as any);
    return () => {
      document.removeEventListener('component:resizestart', onResizeStart as any);
      document.removeEventListener('component:resizeend', onResizeEnd as any);
    };
  }, [component.id, computeFit]);
  
  // Get optimized styles if any
  const optimizedStyles = useMemo(() => {
    return CustomComponentOptimizationService.getOptimizedStyles(component);
  }, [component]);
  
  // Render the component
  const content = useMemo(() => {
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
    if (!activeRender) return null;
    
    try {
      // Create a wrapper component that tracks its own renders
      const ComponentWrapper = React.memo(() => {
        const renderCountRef = useRef(0);
        const renderResetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
        
        useEffect(() => {
          // Track renders
          renderCountRef.current++;
          
          // Reset count after 1 second of no renders
          if (renderResetTimeoutRef.current) {
            clearTimeout(renderResetTimeoutRef.current);
          }
          
          renderResetTimeoutRef.current = setTimeout(() => {
            renderCountRef.current = 0;
          }, 1000);
          
          // Check for too many renders
          if (renderCountRef.current > 50) {
            throw new Error('Too many renders detected (50+ in 1 second)');
          }
          
          return () => {
            if (renderResetTimeoutRef.current) {
              clearTimeout(renderResetTimeoutRef.current);
            }
          };
        });
        
        // Calculate container dimensions to pass to the render function
        const containerWidth = typeof componentProps.width === 'number' ? componentProps.width : 400;
        const containerHeight = typeof componentProps.height === 'number' ? componentProps.height : 200;
        
        const element = activeRender!({
          props: componentProps,
          state,
          updateState,
          id: component.id,
          isThumbnail,
          // Pass container dimensions for components that need to know their bounds
          containerWidth,
          containerHeight
        });
        
        // Handle HTML string returns (from functions that return HTML)
        if (typeof element === 'string' && element.trim().startsWith('<') && element.includes('>')) {
          console.log('[CustomComponent] Detected HTML string return, rendering as HTML');
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
          // Convert DOM element to React element by wrapping in dangerouslySetInnerHTML
          const htmlString = element.outerHTML;
          console.log('[CustomComponent] Converting DOM element to React element');
          return <div dangerouslySetInnerHTML={{ __html: htmlString }} />;
        }

        console.warn('[CustomComponent] Invalid element returned:', element);
        return <div>{String(element)}</div>;
      });
      
      return <ComponentWrapper key={`${component.id}-${currentSlideIndex}`} />;
    } catch (err) {
      console.error('[CustomComponent] Runtime error:', err);
      
      // Provide more helpful error messages for common issues
      let errorMessage = err instanceof Error ? err.message : String(err);
      
      // Check for undefined variable errors
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
  }, [compilationError, compiledRender, componentProps, state, updateState, component.id, currentSlideIndex]);

  // Prevent scroll chaining/bounce with native non-passive listeners and clamped scrolling
  useEffect(() => {
    const el = containerRef?.current as HTMLDivElement | null;
    if (!el) return;

    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

    const isScrollableEl = (node: HTMLElement) => {
      const style = window.getComputedStyle(node);
      const overflowY = style.overflowY;
      const canScroll = node.scrollHeight > node.clientHeight;
      return canScroll && overflowY !== 'visible' && overflowY !== 'hidden';
    };

    const findScrollableAncestor = (target: EventTarget | null): HTMLElement => {
      let node = (target as HTMLElement) || el;
      while (node && node !== el && node !== document.body && node.nodeType === 1) {
        if (isScrollableEl(node)) return node;
        node = (node.parentElement as HTMLElement) || el;
      }
      return el;
    };

    const handleWheelNative = (e: WheelEvent) => {
      const scroller = findScrollableAncestor(e.target);
      const maxScrollTop = scroller.scrollHeight - scroller.clientHeight;
      if (maxScrollTop <= 0) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      let deltaY = e.deltaY;
      // Normalize delta for line/page scrolling
      if ((e as any).deltaMode === 1) deltaY *= 16; // lines → px
      else if ((e as any).deltaMode === 2) deltaY *= scroller.clientHeight; // pages → px

      const next = clamp(scroller.scrollTop + deltaY, 0, maxScrollTop);
      if (next !== scroller.scrollTop) {
        scroller.scrollTop = next;
      }
      // Always consume so parent/viewport never bounces
      e.preventDefault();
      e.stopPropagation();
    };

    let lastTouchY = 0;
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches && e.touches.length > 0) {
        lastTouchY = e.touches[0].clientY;
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      const maxScrollTop = el.scrollHeight - el.clientHeight;
      if (maxScrollTop <= 0) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.touches && e.touches.length > 0) {
        const currentY = e.touches[0].clientY;
        const deltaY = lastTouchY - currentY; // positive when moving up
        lastTouchY = currentY;
        const next = clamp(el.scrollTop + deltaY, 0, maxScrollTop);
        if (next !== el.scrollTop) {
          el.scrollTop = next;
        }
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleScrollSnap = () => {
      const maxScrollTop = el.scrollHeight - el.clientHeight;
      if (maxScrollTop > 0 && (maxScrollTop - el.scrollTop) <= 1) {
        el.scrollTop = maxScrollTop;
      }
    };

    el.addEventListener('wheel', handleWheelNative, { passive: false, capture: true });
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
    el.addEventListener('scroll', handleScrollSnap, { passive: true });
    return () => {
      el.removeEventListener('wheel', handleWheelNative, true as any);
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove, true as any);
      el.removeEventListener('scroll', handleScrollSnap as any);
    };
  }, [containerRef]);
  
  return (
    <ErrorBoundary>
      <div 
        ref={containerRef}
        data-scroll-guard="true"
        style={{
          ...baseStyles,
          fontSize: `${16 * scaleFactor}px`,
          overflow: 'hidden',
          overscrollBehavior: 'none',
          overscrollBehaviorY: 'none',
          overscrollBehaviorX: 'none',
          WebkitOverflowScrolling: 'auto',
          scrollbarGutter: 'stable both-edges',
          touchAction: 'pan-y',
          position: 'relative',
          boxSizing: 'border-box',
          // Ensure the container fills its allocated space
          width: baseStyles.width || '100%',
          height: baseStyles.height || '100%'
        }}
      >
        {/* Apply optimization styles if present (existing persistent optimization) */}
        {Object.keys(optimizedStyles).length > 0 ? (
          <div style={optimizedStyles}>
            {/* Slide scale wrapper (kept for viewport responsiveness) */}
            {!isThumbnail && scaleFactor !== 1 ? (
              <div style={{
                transform: `scale(${scaleFactor})`,
                transformOrigin: 'top left',
                width: `${100 / scaleFactor}%`,
                height: `${100 / scaleFactor}%`,
                position: 'absolute',
                top: 0,
                left: 0,
                boxSizing: 'border-box'
              }}>
                {/* Fit-to-box wrapper */}
                <div style={{ position: 'absolute', inset: 0 }}>
                  <div
                    ref={contentInnerRef}
                    style={{
                      position: 'absolute',
                      left: `${fit.offsetX}px`,
                      top: `${fit.offsetY}px`,
                      transform: `scale(${fit.scale})`,
                      transformOrigin: 'top left',
                      boxSizing: 'border-box',
                      visibility: (isFitReady && !isResizingNow) ? 'visible' : 'hidden'
                    }}
                  >
                    {content}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ position: 'absolute', inset: 0 }}>
                <div
                  ref={contentInnerRef}
                  style={{
                    position: 'absolute',
                    left: `${fit.offsetX}px`,
                    top: `${fit.offsetY}px`,
                    transform: `scale(${fit.scale})`,
                    transformOrigin: 'top left',
                    boxSizing: 'border-box',
                    visibility: (isFitReady && !isResizingNow) ? 'visible' : 'hidden'
                  }}
                >
                  {content}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* No optimization styles - still apply slide scale and fit-to-box */
          !isThumbnail && scaleFactor !== 1 ? (
            <div style={{
              transform: `scale(${scaleFactor})`,
              transformOrigin: 'top left',
              width: `${100 / scaleFactor}%`,
              height: `${100 / scaleFactor}%`,
              position: 'absolute',
              top: 0,
              left: 0,
              boxSizing: 'border-box'
            }}>
              <div style={{ position: 'absolute', inset: 0 }}>
                <div
                  ref={contentInnerRef}
                  style={{
                    position: 'absolute',
                    left: `${fit.offsetX}px`,
                    top: `${fit.offsetY}px`,
                    transform: `scale(${fit.scale})`,
                    transformOrigin: 'top left',
                    boxSizing: 'border-box',
                    visibility: (isFitReady && !isResizingNow) ? 'visible' : 'hidden'
                  }}
                >
                  {content}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ position: 'absolute', inset: 0 }}>
              <div
                ref={contentInnerRef}
                style={{
                  position: 'absolute',
                  left: `${fit.offsetX}px`,
                  top: `${fit.offsetY}px`,
                  transform: `scale(${fit.scale})`,
                  transformOrigin: 'top left',
                  boxSizing: 'border-box',
                  visibility: (isFitReady && !isResizingNow) ? 'visible' : 'hidden'
                }}
              >
                {content}
              </div>
            </div>
          )
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
  isThumbnail?: boolean
) => {
  return (
    <CustomComponentRenderer 
      component={component}
      baseStyles={baseStyles}
      containerRef={containerRef}
      isThumbnail={isThumbnail}
    />
  );
};

// Register the renderer
import { registerRenderer } from '../utils';
import type { RendererFunction } from '../index';

const CustomComponentRendererWrapper: RendererFunction = (props) => {
  return renderCustomComponent(props.component, props.styles || {}, props.containerRef, props.isThumbnail);
};

registerRenderer('CustomComponent', CustomComponentRendererWrapper); 