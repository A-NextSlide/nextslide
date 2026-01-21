import html2canvas from 'html2canvas';
import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';

/**
 * OG Image dimensions (optimized for social sharing)
 * Standard OG image size is 1200x630
 */
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

/**
 * Native slide dimensions
 */
const NATIVE_WIDTH = 1920;
const NATIVE_HEIGHT = 1080;

/**
 * Finds a slide element by its ID using the data-slide-id attribute.
 * Prefers main editing slides over thumbnails.
 */
export function findSlideElement(slideId: string): HTMLElement | null {
  // First, try to find the main editing slide (not in a thumbnail context)
  const allSlides = document.querySelectorAll(`[data-slide-id="${slideId}"]`);

  if (allSlides.length === 0) {
    return null;
  }

  // Find the largest slide element (main editing slide is usually largest)
  let bestSlide: HTMLElement | null = null;
  let bestArea = 0;

  allSlides.forEach((el) => {
    const element = el as HTMLElement;
    const rect = element.getBoundingClientRect();
    const area = rect.width * rect.height;

    // Skip very small thumbnails (less than 200x100)
    if (rect.width < 200 || rect.height < 100) {
      return;
    }

    if (area > bestArea) {
      bestArea = area;
      bestSlide = element;
    }
  });

  // Fall back to first match if no good candidate found
  return bestSlide || (allSlides[0] as HTMLElement);
}

/**
 * Finds any slide element in the DOM, preferring larger ones.
 */
export function findAnySlideElement(): HTMLElement | null {
  const allSlides = document.querySelectorAll('[data-slide-id]');

  if (allSlides.length === 0) {
    return null;
  }

  // Find the largest slide element
  let bestSlide: HTMLElement | null = null;
  let bestArea = 0;

  allSlides.forEach((el) => {
    const element = el as HTMLElement;
    const rect = element.getBoundingClientRect();
    const area = rect.width * rect.height;

    // Skip very small thumbnails
    if (rect.width < 200 || rect.height < 100) {
      return;
    }

    if (area > bestArea) {
      bestArea = area;
      bestSlide = element;
    }
  });

  return bestSlide || (allSlides[0] as HTMLElement);
}

/**
 * Waits for all images within an element to load
 */
async function waitForImages(element: HTMLElement, timeout = 5000): Promise<void> {
  const images = element.querySelectorAll('img');
  const promises: Promise<void>[] = [];

  images.forEach((img) => {
    if (!img.complete) {
      promises.push(
        new Promise((resolve) => {
          const timer = setTimeout(resolve, timeout);
          img.onload = () => {
            clearTimeout(timer);
            resolve();
          };
          img.onerror = () => {
            clearTimeout(timer);
            resolve();
          };
        })
      );
    }
  });

  await Promise.all(promises);
}

/**
 * Temporarily remove transforms from element and ancestors, returning restore function
 */
function neutralizeTransforms(element: HTMLElement): () => void {
  const savedStyles: Array<{ el: HTMLElement; transform: string; willChange: string }> = [];

  let current: HTMLElement | null = element;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    if (style.transform !== 'none' || current.style.transform) {
      savedStyles.push({
        el: current,
        transform: current.style.transform,
        willChange: current.style.willChange
      });
      current.style.transform = 'none';
      current.style.willChange = 'auto';
    }
    current = current.parentElement;
  }

  // Return restore function
  return () => {
    savedStyles.forEach(({ el, transform, willChange }) => {
      el.style.transform = transform;
      el.style.willChange = willChange;
    });
  };
}

/**
 * Captures a slide as an OG-optimized thumbnail.
 * Automatically handles various slide sizes and scales appropriately.
 *
 * @param slideElementOrId - Either an HTMLElement or a slide ID string
 */
export async function captureOGThumbnail(
  slideElementOrId: HTMLElement | string
): Promise<string | null> {
  // Resolve slide element if a string ID was passed
  const slideContainer = typeof slideElementOrId === 'string'
    ? findSlideElement(slideElementOrId)
    : slideElementOrId;

  if (!slideContainer) {
    console.warn('[OG Capture] Slide element not found');
    return null;
  }

  let restoreTransforms: (() => void) | null = null;

  try {
    const slideId = slideContainer.getAttribute('data-slide-id') || 'unknown';
    console.log('[OG Capture] Starting capture for slide:', slideId);

    // Wait for any pending renders and images
    await new Promise(resolve => setTimeout(resolve, 200));
    await waitForImages(slideContainer);

    // Neutralize CSS transforms that confuse html2canvas
    restoreTransforms = neutralizeTransforms(slideContainer);

    // Force a reflow after removing transforms
    void slideContainer.offsetHeight;
    await new Promise(resolve => setTimeout(resolve, 50));

    // Get actual dimensions of the slide element (after transform removal)
    const rect = slideContainer.getBoundingClientRect();
    const actualWidth = Math.round(rect.width);
    const actualHeight = Math.round(rect.height);

    console.log('[OG Capture] Slide dimensions:', {
      actualWidth,
      actualHeight,
      ratio: (actualWidth / actualHeight).toFixed(3)
    });

    // Calculate optimal capture scale
    // We want to capture at a resolution that gives us good quality at 1200x630
    // Target: at least 1200px wide for the final image
    const minCaptureWidth = 1200;
    const captureScale = Math.max(1, minCaptureWidth / actualWidth);

    // Cap scale to prevent memory issues
    const finalScale = Math.min(captureScale, 3);

    console.log('[OG Capture] Using capture scale:', finalScale);

    // Capture using html2canvas with explicit dimensions
    const canvas = await html2canvas(slideContainer, {
      scale: finalScale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#1e1e23', // Dark fallback background
      logging: false,
      width: actualWidth,
      height: actualHeight,
      windowWidth: actualWidth,
      windowHeight: actualHeight,
    });

    console.log('[OG Capture] html2canvas completed:', {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height
    });

    // Check if the canvas has any content
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const sampleSize = Math.min(100, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
      const hasContent = imageData.data.some((val, i) => {
        // Check if any pixel is not fully transparent
        if (i % 4 === 3) return val > 10;
        return false;
      });

      if (!hasContent) {
        console.warn('[OG Capture] Canvas appears to be empty/transparent');
      }
    }

    // Create final OG-sized canvas (1200x630)
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = OG_WIDTH;
    finalCanvas.height = OG_HEIGHT;
    const finalCtx = finalCanvas.getContext('2d');

    if (!finalCtx) {
      throw new Error('Could not get canvas context');
    }

    // Fill with a neutral background first
    finalCtx.fillStyle = '#1e1e23';  // Dark background like the fallback
    finalCtx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);

    // Calculate how to fit the captured slide into OG dimensions
    // Maintain aspect ratio and center
    const sourceWidth = canvas.width;
    const sourceHeight = canvas.height;
    const sourceAspect = sourceWidth / sourceHeight;
    const targetAspect = OG_WIDTH / OG_HEIGHT;

    let drawWidth: number;
    let drawHeight: number;
    let offsetX: number;
    let offsetY: number;

    if (sourceAspect > targetAspect) {
      // Source is wider - fit to width
      drawWidth = OG_WIDTH;
      drawHeight = OG_WIDTH / sourceAspect;
      offsetX = 0;
      offsetY = (OG_HEIGHT - drawHeight) / 2;
    } else {
      // Source is taller - fit to height
      drawHeight = OG_HEIGHT;
      drawWidth = OG_HEIGHT * sourceAspect;
      offsetX = (OG_WIDTH - drawWidth) / 2;
      offsetY = 0;
    }

    // Draw the captured slide centered in the OG canvas
    finalCtx.drawImage(
      canvas,
      0, 0, sourceWidth, sourceHeight,
      offsetX, offsetY, drawWidth, drawHeight
    );

    const dataUrl = finalCanvas.toDataURL('image/jpeg', 0.92);
    console.log('[OG Capture] Final image size:', Math.round(dataUrl.length / 1024), 'KB');

    // Store for debugging
    (window as any).__lastOGCapture = dataUrl;
    console.log('[OG Capture] 💡 Run window.open(__lastOGCapture) to view the captured image');

    return dataUrl;
  } catch (error) {
    console.error('[OG Capture] Failed to capture:', error);
    return null;
  } finally {
    // Always restore transforms
    if (restoreTransforms) {
      restoreTransforms();
    }
  }
}

/**
 * Uploads an OG thumbnail to Supabase storage.
 * Returns the public URL of the uploaded image.
 */
export async function uploadOGThumbnail(
  dataUrl: string,
  shortCode: string
): Promise<string | null> {
  try {
    // Convert data URL to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    // Create a unique filename
    const filename = `og/${shortCode}_${uuidv4().substring(0, 8)}.jpg`;

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from('slide-media')
      .upload(filename, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) {
      console.error('[OG Upload] Upload failed:', error.message);
      return null;
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('slide-media')
      .getPublicUrl(filename);

    console.log('[OG Upload] Uploaded successfully:', urlData.publicUrl);
    return urlData.publicUrl;
  } catch (error) {
    console.error('[OG Upload] Failed to upload:', error);
    return null;
  }
}

/**
 * Captures and uploads an OG thumbnail for a shared deck.
 * This is the main function to call when creating a share link.
 */
export async function generateShareOGImage(
  slideElement: HTMLElement,
  shortCode: string
): Promise<string | null> {
  // Capture the thumbnail
  const dataUrl = await captureOGThumbnail(slideElement);

  if (!dataUrl) {
    return null;
  }

  // Upload to storage
  const publicUrl = await uploadOGThumbnail(dataUrl, shortCode);

  return publicUrl;
}

/**
 * Attempts to capture the first slide from the current deck.
 * Searches for any available slide element in the DOM.
 */
export async function captureFirstSlideOG(shortCode: string): Promise<string | null> {
  const slideElement = findAnySlideElement();

  if (!slideElement) {
    console.warn('[OG Capture] No slide element found in DOM');
    return null;
  }

  return generateShareOGImage(slideElement, shortCode);
}
