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
    
    return canvas.toDataURL('image/png');
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