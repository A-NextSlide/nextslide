import html2canvas from 'html2canvas';
import * as htmlToImage from 'html-to-image';

/**
 * Captures a screenshot of a DOM element and returns it as a base64 data URL
 * @param element The DOM element to capture
 * @param options Optional configuration for html2canvas
 * @returns Promise resolving to base64 data URL
 */
export const captureElementScreenshot = async (
  element: HTMLElement,
  options?: Partial<{
    scale: number;
    backgroundColor: string;
    width: number;
    height: number;
    format?: 'png' | 'jpeg';
    quality?: number;
  }>
): Promise<string> => {
  try {
    const canvas = await html2canvas(element, {
      scale: options?.scale || 1,
      backgroundColor: options?.backgroundColor || '#ffffff',
      width: options?.width,
      height: options?.height,
      logging: false,
      useCORS: true,
      allowTaint: true,
    });

    const format = options?.format || 'png';
    const quality = options?.quality || 0.92;
    return canvas.toDataURL(`image/${format}`, quality);
  } catch (error) {
    console.error('Failed to capture screenshot:', error);
    throw error;
  }
};

/**
 * Captures a screenshot of a slide container
 * @param slideContainer The slide container element
 * @returns Promise resolving to base64 data URL
 */
export const captureSlideScreenshot = async (
  slideContainer: HTMLElement
): Promise<string> => {
  const targetWidth = 1920;
  const targetHeight = 1080;
  const scale = 0.25; // Scale down for smaller file size (480x270)

  // CustomComponent: capture directly from iframe content to allow JS rendering
  const iframe = slideContainer.querySelector('iframe[srcdoc]') as HTMLIFrameElement | null;
  if (iframe) {
    const iframeDoc = await waitForIframeReady(iframe, 2000);
    const iframeBody = iframeDoc?.body;

    if (iframeBody) {
      await waitForImages(iframeBody, 2000);
      try {
        await iframeDoc?.fonts?.ready;
      } catch {
        // Ignore font loading failures
      }

      const animOverride = iframeDoc ? forceAnimationsToEnd(iframeDoc) : null;
      await new Promise(resolve => setTimeout(resolve, 50));

      try {
        const canvas = await html2canvas(iframeBody, {
          scale,
          backgroundColor: null, // Preserve actual background
          width: targetWidth,
          height: targetHeight,
          logging: false,
          useCORS: true,
          allowTaint: true,
          imageTimeout: 2000,
        });
        return canvas.toDataURL('image/png');
      } finally {
        removeAnimationOverride(animOverride);
      }
    }

    // Fallback: extract and render srcDoc in a non-sandboxed container
    const srcDoc = iframe.getAttribute('srcdoc') || '';
    const fallback = await captureFromSrcDoc(srcDoc, {
      scale,
      width: targetWidth,
      height: targetHeight,
      format: 'png'
    });
    if (fallback) return fallback;
  }

  // Non-iframe slide: clone and capture
  const slideContent = slideContainer.querySelector('div[style*="transform"]') as HTMLElement;
  if (!slideContent) {
    throw new Error('Slide content not found');
  }

  const clone = slideContent.cloneNode(true) as HTMLElement;
  const tempContainer = document.createElement('div');
  tempContainer.style.position = 'absolute';
  tempContainer.style.left = '-9999px';
  tempContainer.style.width = `${targetWidth}px`;
  tempContainer.style.height = `${targetHeight}px`;
  tempContainer.style.backgroundColor = '#ffffff';

  clone.style.transform = 'none';
  clone.style.position = 'relative';

  tempContainer.appendChild(clone);
  document.body.appendChild(tempContainer);

  try {
    return await captureElementScreenshot(tempContainer, {
      scale,
      backgroundColor: '#ffffff',
      width: targetWidth,
      height: targetHeight,
    });
  } finally {
    document.body.removeChild(tempContainer);
  }
};

/**
 * Captures a screenshot of the current slide for AI context.
 * Captures DIRECTLY from the live DOM element (no cloning) to preserve all CSS styling.
 *
 * - 768x432 output (0.4 scale of 1920x1080)
 * - JPEG at 70% quality
 * - Returns base64 data URL
 */
/**
 * Force all CSS animations to their end state by jumping to the end.
 * Uses animation-delay: -9999s to instantly complete animations.
 * Does NOT override opacity directly as that can break JS-controlled elements.
 */
function forceAnimationsToEnd(doc: Document): HTMLStyleElement | null {
  try {
    const style = doc.createElement('style');
    style.id = '__force-animations-end__';
    style.textContent = `
      *, *::before, *::after {
        animation-delay: -9999s !important;
        animation-duration: 0.001s !important;
        animation-fill-mode: forwards !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `;
    doc.head.appendChild(style);
    return style;
  } catch (e) {
    console.warn('[TinyScreenshot] Could not inject animation override:', e);
    return null;
  }
}

function removeAnimationOverride(style: HTMLStyleElement | null) {
  try {
    style?.remove();
  } catch (e) {
    // Ignore
  }
}

export const captureTinySlideScreenshot = async (
  slideContainer: HTMLElement,
  options?: { skipIframeCapture?: boolean; waitTime?: number }
): Promise<string | null> => {
  try {
    // Short wait for initial DOM settle (smart waits for iframe/fonts/images happen later)
    const waitTime = options?.waitTime ?? 200;
    console.log(`[TinyScreenshot] Waiting ${waitTime}ms for content to render...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));

    // Find iframes with srcDoc (CustomComponent content)
    const iframe = slideContainer.querySelector('iframe[srcdoc]') as HTMLIFrameElement;

    const skipIframe = options?.skipIframeCapture || false;

    if (iframe && !skipIframe) {
      // CustomComponent: Use html-to-image for MUCH better SVG/CSS rendering
      console.log(`[TinyScreenshot] Using html-to-image for iframe capture (better SVG support)`);

      const iframeDoc = await waitForIframeReady(iframe, 2000);
      const iframeBody = iframeDoc?.body;

      if (iframeBody && iframeDoc) {
        await waitForImages(iframeBody, 2000);
        try {
          await iframeDoc.fonts.ready;
        } catch {
          // Ignore font loading failures
        }

        // Force all animations to end state (makes fade-in elements visible)
        console.log(`[TinyScreenshot] Forcing animations to end state...`);
        const animOverride = forceAnimationsToEnd(iframeDoc);
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
          // html-to-image captures the actual rendered DOM including all CSS
          // It serializes to SVG first, preserving styles, then converts to PNG
          const isMobile = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent);
          const timeoutMs = isMobile ? 5000 : 10000;

          const dataUrl = await Promise.race([
            htmlToImage.toJpeg(iframeBody, {
              width: 1920,
              height: 1080,
              pixelRatio: 0.8, // 1536x864 output
              backgroundColor: '#ffffff',
              skipAutoScale: true,
              cacheBust: true,
              quality: 0.85,
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`html-to-image timed out after ${timeoutMs}ms`)), timeoutMs)
            ),
          ]);

          console.log(`[TinyScreenshot] html-to-image capture successful`);
          logScreenshotDebugFromUrl(dataUrl);
          return dataUrl;
        } catch (htmlToImageError) {
          console.warn('[TinyScreenshot] html-to-image failed, falling back to html2canvas on iframeBody:', htmlToImageError);

          // Fallback: capture iframeBody directly (same-origin access works)
          // Do NOT capture slideContainer with onclone/inlineIframeIntoClone —
          // that path uses regex CSS resolution and produces broken output.
          const canvas = await html2canvas(iframeBody, {
            scale: 0.8,
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true,
            allowTaint: true,
            imageTimeout: 3000,
            width: 1920,
            height: 1080,
          });

          const dataUrl = canvas.toDataURL('image/png');
          logScreenshotDebug(dataUrl, canvas);
          return dataUrl;
        } finally {
          removeAnimationOverride(animOverride);
        }
      } else {
        // contentDocument was null (old browser edge case) - fall back to srcDoc extraction
        console.log(`[TinyScreenshot] contentDocument null, falling back to srcDoc extraction`);
        const srcDoc = iframe.getAttribute('srcdoc') || '';
        const fallback = await captureFromSrcDoc(srcDoc, { scale: 0.8, format: 'png' });
        if (fallback) return fallback;
      }

    } else if (iframe && skipIframe) {
      // Fallback: Extract and render srcDoc in a non-sandboxed container
      console.log(`[TinyScreenshot] Using srcDoc extraction for capture`);
      const srcDoc = iframe.getAttribute('srcdoc') || '';
      return await captureFromSrcDoc(srcDoc, { scale: 0.8, format: 'png' });

    } else {
      // Non-iframe slide: Capture DIRECTLY from the container (NO CLONING)
      // This preserves all Tailwind CSS and computed styles
      console.log(`[TinyScreenshot] Capturing directly from live element (no clone)`);

      // Get the container's bounding rect to know its current size
      const rect = slideContainer.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) {
        console.warn('[TinyScreenshot] Container too small:', rect.width, rect.height);
        return null;
      }

      // html2canvas captures what's visible, accounting for transforms
      // We don't need to clone or modify the element
      const canvas = await html2canvas(slideContainer, {
        scale: 0.8, // Higher scale for better SVG rendering
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
        allowTaint: true,
        imageTimeout: 3000,
        // Capture the visible rendered size (html2canvas handles transforms)
        width: rect.width,
        height: rect.height,
        // Important: Scroll the element into "view" for html2canvas
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
      });

      // Use PNG for better line/SVG rendering
      const dataUrl = canvas.toDataURL('image/png');
      logScreenshotDebug(dataUrl, canvas);
      return dataUrl;
    }
  } catch (error) {
    console.error('[TinyScreenshot] Failed to capture:', error);
    return null;
  }
};

/**
 * Extract background color/gradient from srcDoc styles
 */
function extractBackgroundFromSrcDoc(srcDoc: string): string {
  // Try to find background in inline styles or style tags
  const bgPatterns = [
    /background:\s*([^;}"]+)/i,
    /background-color:\s*([^;}"]+)/i,
    /backgroundColor:\s*["']?([^;}"']+)/i,
  ];

  for (const pattern of bgPatterns) {
    const match = srcDoc.match(pattern);
    if (match && match[1]) {
      const bg = match[1].trim();
      // Return if it looks like a valid color or gradient
      if (bg && (bg.startsWith('#') || bg.startsWith('rgb') || bg.startsWith('linear') || bg.startsWith('radial') || /^[a-z]+$/i.test(bg))) {
        return bg;
      }
    }
  }

  return '#ffffff';
}

/**
 * Helper to capture from srcDoc HTML (fallback when contentDocument isn't accessible)
 */
/**
 * Extract CSS variables from srcDoc string (static parsing)
 */
function extractCSSVariablesFromSrcDoc(srcDoc: string): Record<string, string> {
  const variables: Record<string, string> = {};
  try {
    // Find :root { ... } blocks and extract variables
    const rootMatch = srcDoc.match(/:root\s*\{([^}]+)\}/);
    if (rootMatch) {
      const content = rootMatch[1];
      const varMatches = content.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g);
      for (const match of varMatches) {
        variables[match[1]] = match[2].trim();
      }
    }
  } catch (e) {
    console.warn('[TinyScreenshot] Could not parse CSS variables from srcDoc:', e);
  }
  return variables;
}

async function captureFromSrcDoc(
  srcDoc: string,
  options?: { scale?: number; width?: number; height?: number; format?: 'png' | 'jpeg'; quality?: number }
): Promise<string | null> {
  // Extract actual background from srcDoc
  const extractedBg = extractBackgroundFromSrcDoc(srcDoc);
  console.log(`[TinyScreenshot] Extracted background: ${extractedBg}`);

  // Extract CSS variables and resolve them
  const cssVariables = extractCSSVariablesFromSrcDoc(srcDoc);
  console.log(`[TinyScreenshot] Parsed ${Object.keys(cssVariables).length} CSS variables from srcDoc`);

  // Resolve all var() references in the srcDoc
  let resolvedSrcDoc = resolveCSSVariables(srcDoc, cssVariables);

  const width = options?.width ?? 1920;
  const height = options?.height ?? 1080;
  const scale = options?.scale ?? 0.8;  // Higher scale for SVG quality
  const format = options?.format ?? 'png';  // PNG for better line rendering
  const quality = options?.quality ?? 0.9;

  const tempContainer = document.createElement('div');
  tempContainer.style.position = 'absolute';
  tempContainer.style.left = '-9999px';
  tempContainer.style.top = '0';
  tempContainer.style.width = `${width}px`;
  tempContainer.style.height = `${height}px`;
  tempContainer.style.background = extractedBg;
  tempContainer.style.overflow = 'hidden';
  document.body.appendChild(tempContainer);

  try {
    // Parse and render resolved srcDoc
    const parser = new DOMParser();
    const doc = parser.parseFromString(resolvedSrcDoc, 'text/html');
    const wrapper = document.createElement('div');
    wrapper.style.width = `${width}px`;
    wrapper.style.height = `${height}px`;
    wrapper.style.position = 'relative';
    wrapper.style.overflow = 'hidden';

    // Copy styles (already resolved)
    doc.querySelectorAll('style').forEach(style => {
      const newStyle = document.createElement('style');
      newStyle.textContent = style.textContent || '';
      wrapper.appendChild(newStyle);
    });

    // Copy body content (already resolved)
    const contentDiv = document.createElement('div');
    contentDiv.style.width = '100%';
    contentDiv.style.height = '100%';
    contentDiv.innerHTML = doc.body.innerHTML;
    wrapper.appendChild(contentDiv);
    tempContainer.appendChild(wrapper);

    // Wait for render - reduced from 200ms
    await new Promise(resolve => setTimeout(resolve, 100));

    const canvas = await html2canvas(tempContainer, {
      scale,
      backgroundColor: null, // Let the element's background show through
      width,
      height,
      logging: false,
      useCORS: true,
      allowTaint: true,
      imageTimeout: 2000,
    });

    const dataUrl = canvas.toDataURL(`image/${format}`, quality);
    logScreenshotDebug(dataUrl, canvas);
    return dataUrl;
  } finally {
    if (document.body.contains(tempContainer)) {
      document.body.removeChild(tempContainer);
    }
  }
}

async function waitForIframeReady(iframe: HTMLIFrameElement, maxWait: number): Promise<Document | null> {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const doc = iframe.contentDocument;
      if (doc && (doc.readyState === 'complete' || doc.readyState === 'interactive')) {
        resolve(doc);
        return;
      }
      if (Date.now() - start > maxWait) {
        resolve(doc || null);
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

async function waitForImages(element: HTMLElement, maxWait: number): Promise<void> {
  const images = Array.from(element.querySelectorAll('img')) as HTMLImageElement[];
  if (images.length === 0) return;

  const timeout = new Promise<void>((resolve) => setTimeout(resolve, maxWait));
  const loading = Promise.all(images.map(img => {
    return new Promise<void>((resolve) => {
      if (img.complete && img.naturalWidth > 0) {
        resolve();
        return;
      }
      const onLoad = () => { img.removeEventListener('load', onLoad); img.removeEventListener('error', onLoad); resolve(); };
      img.addEventListener('load', onLoad);
      img.addEventListener('error', onLoad);
    });
  }));

  await Promise.race([loading, timeout]);
}

/**
 * Extract all CSS custom properties from :root and return as resolved values
 */
function extractCSSVariables(doc: Document): Record<string, string> {
  const variables: Record<string, string> = {};
  try {
    const rootStyles = doc.defaultView?.getComputedStyle(doc.documentElement);
    if (!rootStyles) return variables;

    // Find all style sheets and extract variable names
    const varNames = new Set<string>();
    doc.querySelectorAll('style').forEach((style) => {
      const content = style.textContent || '';
      // Match --variable-name patterns
      const matches = content.matchAll(/--[\w-]+/g);
      for (const match of matches) {
        varNames.add(match[0]);
      }
    });

    // Get computed values for each variable
    for (const varName of varNames) {
      const value = rootStyles.getPropertyValue(varName).trim();
      if (value) {
        variables[varName] = value;
      }
    }
  } catch (e) {
    console.warn('[TinyScreenshot] Could not extract CSS variables:', e);
  }
  return variables;
}

/**
 * Replace var(--name) references with actual values in a CSS string
 */
function resolveCSSVariables(css: string, variables: Record<string, string>): string {
  return css.replace(/var\((--[\w-]+)(?:,\s*([^)]+))?\)/g, (_, varName, fallback) => {
    return variables[varName] || fallback || '';
  });
}

function inlineIframeIntoClone(
  sourceDoc: Document,
  clonedDoc: Document,
  clonedEl: HTMLElement
): void {
  const clonedIframe = clonedEl.querySelector('iframe[srcdoc], iframe[title="Custom Component"]') as HTMLIFrameElement | null;
  if (!clonedIframe) return;

  // Extract CSS variables from source document BEFORE cloning
  const cssVariables = extractCSSVariables(sourceDoc);
  console.log('🔴🔴🔴 [TinyScreenshot] CSS VARIABLE FIX ACTIVE - extracted:', Object.keys(cssVariables).length, 'variables');
  console.log('🔴🔴🔴 [TinyScreenshot] Variables:', JSON.stringify(cssVariables).slice(0, 500));

  // Inject iframe styles into cloned document once
  if (!clonedDoc.head.querySelector('[data-iframe-inline-root="true"]')) {
    const marker = clonedDoc.createElement('meta');
    marker.setAttribute('data-iframe-inline-root', 'true');
    clonedDoc.head.appendChild(marker);

    // First, inject a style block with resolved :root variables
    if (Object.keys(cssVariables).length > 0) {
      const varsStyle = clonedDoc.createElement('style');
      varsStyle.setAttribute('data-resolved-vars', 'true');
      const varsCSS = Object.entries(cssVariables)
        .map(([name, value]) => `${name}: ${value};`)
        .join('\n    ');
      varsStyle.textContent = `:root {\n    ${varsCSS}\n  }`;
      clonedDoc.head.appendChild(varsStyle);
    }

    sourceDoc.querySelectorAll('style').forEach((style) => {
      const clonedStyle = clonedDoc.createElement('style');
      // Resolve CSS variables in the style content for better html2canvas compatibility
      let content = style.textContent || '';
      content = resolveCSSVariables(content, cssVariables);
      clonedStyle.textContent = content;
      clonedDoc.head.appendChild(clonedStyle);
    });

    sourceDoc.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
      const clonedLink = clonedDoc.createElement('link');
      clonedLink.rel = 'stylesheet';
      clonedLink.href = (link as HTMLLinkElement).href;
      clonedDoc.head.appendChild(clonedLink);
    });
  }

  const replacement = clonedDoc.createElement('div');
  replacement.style.cssText = clonedIframe.style.cssText;
  replacement.style.width = clonedIframe.style.width || '100%';
  replacement.style.height = clonedIframe.style.height || '100%';
  replacement.style.border = 'none';
  replacement.style.backgroundColor = 'transparent';
  replacement.style.overflow = 'hidden';
  replacement.style.pointerEvents = 'none';

  // Clone body content and resolve inline style variables
  let bodyHTML = sourceDoc.body.innerHTML;
  // Resolve any var() in inline styles
  bodyHTML = resolveCSSVariables(bodyHTML, cssVariables);
  replacement.innerHTML = bodyHTML;

  clonedIframe.replaceWith(replacement);
}

/**
 * Helper to log screenshot debug info
 */
function logScreenshotDebug(dataUrl: string, canvas: HTMLCanvasElement) {
  const base64Size = dataUrl.length - 'data:image/jpeg;base64,'.length;
  const byteSize = Math.ceil(base64Size * 0.75);
  const estimatedTokens = Math.ceil(byteSize / 8);
  console.log(`[TinyScreenshot] Captured: ${byteSize} bytes, ~${estimatedTokens} estimated tokens`);
  console.log(`[TinyScreenshot] Canvas dimensions: ${canvas.width}x${canvas.height}`);

  // Store on window for easy access
  (window as any).__lastScreenshot = dataUrl;
  (window as any).viewLastScreenshot = () => {
    const w = window.open();
    if (w) {
      w.document.write(`<img src="${dataUrl}" style="max-width:100%;"/>`);
      w.document.title = 'TinyScreenshot Preview';
    }
  };
  console.log(`[TinyScreenshot] 💡 Run window.viewLastScreenshot() to open in new tab`);
}

/**
 * Helper to log screenshot debug info from data URL only
 */
function logScreenshotDebugFromUrl(dataUrl: string) {
  const base64Size = dataUrl.length - 'data:image/png;base64,'.length;
  const byteSize = Math.ceil(base64Size * 0.75);
  const estimatedTokens = Math.ceil(byteSize / 8);
  console.log(`[TinyScreenshot] Captured: ${byteSize} bytes, ~${estimatedTokens} estimated tokens`);

  // Store on window for easy access
  (window as any).__lastScreenshot = dataUrl;
  (window as any).viewLastScreenshot = () => {
    const w = window.open();
    if (w) {
      w.document.write(`<img src="${dataUrl}" style="max-width:100%;"/>`);
      w.document.title = 'TinyScreenshot Preview';
    }
  };
  console.log(`[TinyScreenshot] 💡 Run window.viewLastScreenshot() to open in new tab`);
}

/**
 * Determines if a screenshot should be captured for an agent edit request.
 *
 * ALWAYS captures when a slide/component is selected - the model decides
 * whether to use the visual context for:
 * - Fixing issues (needs to see what's wrong)
 * - Major changes (needs to see current state)
 * - Design/layout work (needs visual reference)
 *
 * The screenshot is small (~30-50KB JPEG) so the cost is minimal,
 * but the benefit for visual understanding is huge.
 */
export const shouldCaptureScreenshotForEdit = (
  _message: string,
  hasCustomComponentSelected: boolean
): boolean => {
  // Always capture when there's a slide/component selected
  // Let the model decide when it needs visual context
  return hasCustomComponentSelected;
};
