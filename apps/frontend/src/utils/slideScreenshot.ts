import html2canvas from 'html2canvas';

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
    // Short wait for initial render
    const waitTime = options?.waitTime ?? 500;
    console.log(`[TinyScreenshot] Waiting ${waitTime}ms for content to render...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));

    // Find iframes with srcDoc (CustomComponent content)
    const iframe = slideContainer.querySelector('iframe[srcdoc]') as HTMLIFrameElement;

    // On mobile, skip iframe.contentDocument capture - html2canvas fails due to sandbox
    const isMobile = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent);
    const skipIframe = options?.skipIframeCapture || isMobile;

    if (iframe && !skipIframe) {
      // CustomComponent: Capture the slide container, but inline iframe content
      console.log(`[TinyScreenshot] Inlining iframe content for capture`);

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
        await new Promise(resolve => setTimeout(resolve, 50));

        const rect = slideContainer.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10) {
          console.warn('[TinyScreenshot] Container too small:', rect.width, rect.height);
          removeAnimationOverride(animOverride);
          return null;
        }

        let canvas: HTMLCanvasElement;
        try {
          canvas = await html2canvas(slideContainer, {
            scale: 0.4,
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true,
            allowTaint: true,
            imageTimeout: 3000,
            width: rect.width,
            height: rect.height,
            scrollX: 0,
            scrollY: 0,
            x: 0,
            y: 0,
            onclone: (clonedDoc, clonedEl) => {
              inlineIframeIntoClone(iframeDoc, clonedDoc, clonedEl);
            }
          });
        } finally {
          removeAnimationOverride(animOverride);
        }

        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        logScreenshotDebug(dataUrl, canvas);
        return dataUrl;
      }

    } else if (iframe && skipIframe) {
      // Fallback: Extract and render srcDoc in a non-sandboxed container
      console.log(`[TinyScreenshot] Using srcDoc extraction for capture`);
      const srcDoc = iframe.getAttribute('srcdoc') || '';
      return await captureFromSrcDoc(srcDoc);

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
        scale: 0.4, // Final output will be ~40% of capture size
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

      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
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
async function captureFromSrcDoc(
  srcDoc: string,
  options?: { scale?: number; width?: number; height?: number; format?: 'png' | 'jpeg'; quality?: number }
): Promise<string | null> {
  // Extract actual background from srcDoc
  const extractedBg = extractBackgroundFromSrcDoc(srcDoc);
  console.log(`[TinyScreenshot] Extracted background: ${extractedBg}`);

  const width = options?.width ?? 1920;
  const height = options?.height ?? 1080;
  const scale = options?.scale ?? 0.4;
  const format = options?.format ?? 'jpeg';
  const quality = options?.quality ?? 0.7;

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
    // Parse and render srcDoc
    const parser = new DOMParser();
    const doc = parser.parseFromString(srcDoc, 'text/html');
    const wrapper = document.createElement('div');
    wrapper.style.width = `${width}px`;
    wrapper.style.height = `${height}px`;
    wrapper.style.position = 'relative';
    wrapper.style.overflow = 'hidden';

    // Copy styles
    doc.querySelectorAll('style').forEach(style => {
      const newStyle = document.createElement('style');
      newStyle.textContent = style.textContent || '';
      wrapper.appendChild(newStyle);
    });

    // Copy body content
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

function inlineIframeIntoClone(
  sourceDoc: Document,
  clonedDoc: Document,
  clonedEl: HTMLElement
): void {
  const clonedIframe = clonedEl.querySelector('iframe[srcdoc], iframe[title="Custom Component"]') as HTMLIFrameElement | null;
  if (!clonedIframe) return;

  // Inject iframe styles into cloned document once
  if (!clonedDoc.head.querySelector('[data-iframe-inline-root="true"]')) {
    const marker = clonedDoc.createElement('meta');
    marker.setAttribute('data-iframe-inline-root', 'true');
    clonedDoc.head.appendChild(marker);

    sourceDoc.querySelectorAll('style').forEach((style) => {
      const clonedStyle = clonedDoc.createElement('style');
      clonedStyle.textContent = style.textContent || '';
      clonedDoc.head.appendChild(clonedStyle);
    });

    sourceDoc.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
      const clonedLink = clonedDoc.createElement('link');
      clonedLink.rel = 'stylesheet';
      clonedLink.href = link.href;
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
  replacement.innerHTML = sourceDoc.body.innerHTML;

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
