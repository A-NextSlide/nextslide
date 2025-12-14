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
 * Captures a TINY screenshot for AI agent context.
 * Optimized to stay under ~2000 tokens (~15KB).
 * - 384px width (216px height for 16:9)
 * - JPEG at 50% quality
 * - Returns base64 data URL
 */
export const captureTinySlideScreenshot = async (
  slideContainer: HTMLElement
): Promise<string | null> => {
  try {
    // Find the actual slide content
    const slideContent = slideContainer.querySelector('div[style*="transform"]') as HTMLElement;
    if (!slideContent) {
      console.warn('[TinyScreenshot] Slide content not found');
      return null;
    }

    // Clone to avoid modifying original
    const clone = slideContent.cloneNode(true) as HTMLElement;

    // Create temporary container at full resolution
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.width = '1920px';
    tempContainer.style.height = '1080px';
    tempContainer.style.backgroundColor = '#ffffff';
    tempContainer.style.overflow = 'hidden';

    // Reset transform on clone
    clone.style.transform = 'none';
    clone.style.position = 'relative';

    tempContainer.appendChild(clone);
    document.body.appendChild(tempContainer);

    try {
      // Capture at tiny scale (384x216 = 0.2 of 1920x1080)
      const canvas = await html2canvas(tempContainer, {
        scale: 0.2,
        backgroundColor: '#ffffff',
        width: 1920,
        height: 1080,
        logging: false,
        useCORS: true,
        allowTaint: true,
      });

      // Convert to JPEG at 50% quality for maximum compression
      const dataUrl = canvas.toDataURL('image/jpeg', 0.5);

      // Log size for debugging
      const base64Size = dataUrl.length - 'data:image/jpeg;base64,'.length;
      const byteSize = Math.ceil(base64Size * 0.75);
      const estimatedTokens = Math.ceil(byteSize / 8); // Rough estimate: 8 bytes per token
      console.log(`[TinyScreenshot] Captured: ${byteSize} bytes, ~${estimatedTokens} estimated tokens`);

      return dataUrl;
    } finally {
      document.body.removeChild(tempContainer);
    }
  } catch (error) {
    console.error('[TinyScreenshot] Failed to capture:', error);
    return null;
  }
};

/**
 * Determines if a screenshot should be captured for an agent edit request.
 * Returns true for visual/layout-related requests where seeing the slide helps.
 */
export const shouldCaptureScreenshotForEdit = (
  message: string,
  hasCustomComponentSelected: boolean
): boolean => {
  if (!hasCustomComponentSelected) {
    return false;
  }

  const lowerMessage = message.toLowerCase();

  // Visual/layout keywords that benefit from seeing the slide
  const visualKeywords = [
    'fix', 'wrong', 'broken', 'looks', 'cropped', 'cut off', 'overlap',
    'spacing', 'alignment', 'position', 'layout', 'size', 'too big', 'too small',
    'adjust', 'move', 'center', 'align', 'resize', 'scale',
    'visible', 'hidden', 'show', 'hide', 'missing', 'not showing',
    'color', 'font', 'style', 'design', 'theme', 'logo', 'image',
  ];

  // Check if message contains any visual keywords
  return visualKeywords.some(keyword => lowerMessage.includes(keyword));
}; 