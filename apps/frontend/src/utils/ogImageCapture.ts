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
 */
export function findSlideElement(slideId: string): HTMLElement | null {
  return document.querySelector(`[data-slide-id="${slideId}"]`) as HTMLElement | null;
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
 * Finds parent elements with transforms and returns their original transform values
 */
function neutralizeParentTransforms(element: HTMLElement): Map<HTMLElement, string> {
  const originalTransforms = new Map<HTMLElement, string>();
  let parent = element.parentElement;

  while (parent && parent !== document.body) {
    const computedStyle = window.getComputedStyle(parent);
    const transform = computedStyle.transform;

    if (transform && transform !== 'none') {
      originalTransforms.set(parent, parent.style.transform);
      parent.style.transform = 'none';
    }

    parent = parent.parentElement;
  }

  return originalTransforms;
}

/**
 * Restores the original transforms to parent elements
 */
function restoreParentTransforms(originalTransforms: Map<HTMLElement, string>): void {
  originalTransforms.forEach((originalValue, element) => {
    element.style.transform = originalValue;
  });
}

/**
 * Captures a slide as an OG-optimized thumbnail.
 * Uses the same proven approach as SimpleThumbnail.
 * The image is sized to 1200x630 (standard OG dimensions).
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

  try {
    console.log('[OG Capture] Starting capture for slide:', slideContainer.getAttribute('data-slide-id'));

    // Wait for any pending renders and images (same timing as SimpleThumbnail)
    await new Promise(resolve => setTimeout(resolve, 150));
    await waitForImages(slideContainer);

    console.log('[OG Capture] Slide dimensions:', {
      offsetWidth: slideContainer.offsetWidth,
      offsetHeight: slideContainer.offsetHeight,
      scrollWidth: slideContainer.scrollWidth,
      scrollHeight: slideContainer.scrollHeight
    });

    // Capture using html2canvas - EXACT same options as SimpleThumbnail
    // (which is proven to work)
    const canvas = await html2canvas(slideContainer, {
      scale: 0.5, // Same as SimpleThumbnail
      useCORS: true,
      allowTaint: true,
      backgroundColor: null, // Same as SimpleThumbnail - preserve transparency
      logging: false,
      width: NATIVE_WIDTH,
      height: NATIVE_HEIGHT,
    });

    console.log('[OG Capture] html2canvas completed:', {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height
    });

    // Check if the canvas has any content
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const imageData = ctx.getImageData(0, 0, Math.min(100, canvas.width), Math.min(100, canvas.height));
      const hasContent = imageData.data.some((val, i) => {
        // Check if any pixel is not transparent
        if (i % 4 === 3) return val > 0; // Alpha channel
        return false;
      });
      console.log('[OG Capture] Canvas has non-transparent content:', hasContent);
    }

    // Create final OG-sized canvas (1200x630)
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = OG_WIDTH;
    finalCanvas.height = OG_HEIGHT;
    const finalCtx = finalCanvas.getContext('2d');

    if (!finalCtx) {
      throw new Error('Could not get canvas context');
    }

    // Fill with white background first
    finalCtx.fillStyle = '#ffffff';
    finalCtx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);

    // Scale up from SimpleThumbnail's 960x540 (1920*0.5, 1080*0.5) to OG 1200x630
    // We need to crop vertically and scale
    const sourceWidth = canvas.width; // ~960
    const sourceHeight = canvas.height; // ~540

    // Calculate how much to scale to fill OG width
    const scaleToFill = OG_WIDTH / sourceWidth; // 1.25

    // Calculate scaled source height and vertical crop
    const scaledSourceHeight = sourceHeight * scaleToFill; // ~675
    const cropAmount = Math.max(0, (scaledSourceHeight - OG_HEIGHT) / 2); // ~22.5

    // Draw scaled and cropped
    finalCtx.drawImage(
      canvas,
      0, 0, sourceWidth, sourceHeight, // Source: full canvas
      0, -cropAmount, OG_WIDTH, scaledSourceHeight // Dest: scaled and offset to crop
    );

    const dataUrl = finalCanvas.toDataURL('image/jpeg', 0.92);
    console.log('[OG Capture] Final image size:', dataUrl.length, 'bytes');

    // Store for debugging
    (window as any).__lastOGCapture = dataUrl;
    console.log('[OG Capture] 💡 Run window.open(__lastOGCapture) to view the captured image');

    return dataUrl;
  } catch (error) {
    console.error('[OG Capture] Failed to capture:', error);
    return null;
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
