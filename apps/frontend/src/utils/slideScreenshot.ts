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
  // Find the actual slide content (the scaled div)
  const slideContent = slideContainer.querySelector('div[style*="transform"]') as HTMLElement;

  if (!slideContent) {
    throw new Error('Slide content not found');
  }

  // Clone the slide content to avoid modifying the original
  const clone = slideContent.cloneNode(true) as HTMLElement;

  // Create a temporary container
  const tempContainer = document.createElement('div');
  tempContainer.style.position = 'absolute';
  tempContainer.style.left = '-9999px';
  tempContainer.style.width = `${1920}px`;
  tempContainer.style.height = `${1080}px`;
  tempContainer.style.backgroundColor = '#ffffff';

  // Reset transform on the clone
  clone.style.transform = 'none';
  clone.style.position = 'relative';

  tempContainer.appendChild(clone);
  document.body.appendChild(tempContainer);

  try {
    const screenshot = await captureElementScreenshot(tempContainer, {
      scale: 0.25, // Scale down for smaller file size (480x270)
      backgroundColor: '#ffffff',
      width: 1920,
      height: 1080,
    });

    return screenshot;
  } finally {
    // Clean up
    document.body.removeChild(tempContainer);
  }
};

/**
 * Captures a screenshot of the current slide for AI context.
 * Uses iframe.contentDocument for CustomComponents (same-origin srcdoc)
 * which preserves all CSS rendering including webkit features.
 *
 * - 768x432 output (0.4 scale of 1920x1080)
 * - JPEG at 70% quality
 * - Returns base64 data URL
 */
export const captureTinySlideScreenshot = async (
  slideContainer: HTMLElement
): Promise<string | null> => {
  try {
    // Find iframes with srcDoc (CustomComponent content)
    const iframe = slideContainer.querySelector('iframe[srcdoc]') as HTMLIFrameElement;

    // Wait for any animations/rendering to complete
    await new Promise(resolve => setTimeout(resolve, 300));

    if (iframe && iframe.contentDocument?.body) {
      // CustomComponent: Capture directly from iframe's internal document
      // Since srcdoc iframes are same-origin, we can access contentDocument
      console.log(`[TinyScreenshot] Using iframe.contentDocument for capture`);

      const iframeBody = iframe.contentDocument.body;

      // Capture the iframe's rendered content
      const canvas = await html2canvas(iframeBody, {
        scale: 0.4,
        backgroundColor: '#ffffff',
        width: 1920,
        height: 1080,
        logging: false,
        useCORS: true,
        allowTaint: true,
        imageTimeout: 2000,
      });

      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      logScreenshotDebug(dataUrl, canvas);
      return dataUrl;

    } else if (iframe) {
      // Fallback: Try to extract and render srcDoc (less accurate)
      console.log(`[TinyScreenshot] iframe.contentDocument not accessible, using srcDoc extraction`);
      const srcDoc = iframe.getAttribute('srcdoc') || '';
      return await captureFromSrcDoc(srcDoc);

    } else {
      // Non-iframe slide: Capture directly from container
      console.log(`[TinyScreenshot] Non-iframe slide, capturing from container`);

      const slideContent = slideContainer.querySelector('div[style*="transform"]') as HTMLElement;
      if (!slideContent) {
        console.warn('[TinyScreenshot] No slide content found');
        return null;
      }

      // Clone to avoid modifying the original
      const tempContainer = document.createElement('div');
      tempContainer.style.position = 'absolute';
      tempContainer.style.left = '-9999px';
      tempContainer.style.top = '0';
      tempContainer.style.width = '1920px';
      tempContainer.style.height = '1080px';
      tempContainer.style.backgroundColor = '#ffffff';
      tempContainer.style.overflow = 'hidden';

      const clone = slideContent.cloneNode(true) as HTMLElement;
      clone.style.transform = 'none';
      clone.style.position = 'relative';
      clone.style.width = '1920px';
      clone.style.height = '1080px';
      tempContainer.appendChild(clone);
      document.body.appendChild(tempContainer);

      try {
        await new Promise(resolve => setTimeout(resolve, 100));

        const canvas = await html2canvas(tempContainer, {
          scale: 0.4,
          backgroundColor: '#ffffff',
          width: 1920,
          height: 1080,
          logging: false,
          useCORS: true,
          allowTaint: true,
          imageTimeout: 2000,
        });

        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        logScreenshotDebug(dataUrl, canvas);
        return dataUrl;
      } finally {
        document.body.removeChild(tempContainer);
      }
    }
  } catch (error) {
    console.error('[TinyScreenshot] Failed to capture:', error);
    return null;
  }
};

/**
 * Helper to capture from srcDoc HTML (fallback when contentDocument isn't accessible)
 */
async function captureFromSrcDoc(srcDoc: string): Promise<string | null> {
  const tempContainer = document.createElement('div');
  tempContainer.style.position = 'absolute';
  tempContainer.style.left = '-9999px';
  tempContainer.style.top = '0';
  tempContainer.style.width = '1920px';
  tempContainer.style.height = '1080px';
  tempContainer.style.backgroundColor = '#ffffff';
  tempContainer.style.overflow = 'hidden';
  document.body.appendChild(tempContainer);

  try {
    // Parse and render srcDoc
    const parser = new DOMParser();
    const doc = parser.parseFromString(srcDoc, 'text/html');
    const wrapper = document.createElement('div');
    wrapper.style.width = '1920px';
    wrapper.style.height = '1080px';
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

    // Wait for render
    await new Promise(resolve => setTimeout(resolve, 200));

    const canvas = await html2canvas(tempContainer, {
      scale: 0.4,
      backgroundColor: '#ffffff',
      width: 1920,
      height: 1080,
      logging: false,
      useCORS: true,
      allowTaint: true,
      imageTimeout: 2000,
    });

    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    logScreenshotDebug(dataUrl, canvas);
    return dataUrl;
  } finally {
    if (document.body.contains(tempContainer)) {
      document.body.removeChild(tempContainer);
    }
  }
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
