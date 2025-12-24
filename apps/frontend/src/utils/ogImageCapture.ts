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
 * Captures a slide as an OG-optimized thumbnail.
 * Creates an offscreen clone at native resolution to avoid CSS transform issues.
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

  let cloneContainer: HTMLDivElement | null = null;

  try {
    console.log('[OG Capture] Starting capture for slide:', slideContainer.getAttribute('data-slide-id'));

    // Wait for any pending renders and images
    await new Promise(resolve => setTimeout(resolve, 300));
    await waitForImages(slideContainer);

    // Create an offscreen container at native resolution
    cloneContainer = document.createElement('div');
    cloneContainer.style.cssText = `
      position: fixed;
      left: -9999px;
      top: 0;
      width: ${NATIVE_WIDTH}px;
      height: ${NATIVE_HEIGHT}px;
      overflow: hidden;
      background: white;
      z-index: -1;
    `;
    document.body.appendChild(cloneContainer);

    // Clone the slide content
    const clone = slideContainer.cloneNode(true) as HTMLElement;

    // Reset any transforms and ensure full native size
    clone.style.cssText = `
      width: ${NATIVE_WIDTH}px !important;
      height: ${NATIVE_HEIGHT}px !important;
      transform: none !important;
      position: relative !important;
      top: 0 !important;
      left: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
    `;

    // Remove data-slide-id to avoid confusion
    clone.removeAttribute('data-slide-id');

    cloneContainer.appendChild(clone);

    // Wait for clone to render
    await new Promise(resolve => setTimeout(resolve, 200));

    console.log('[OG Capture] Clone created, dimensions:', {
      cloneWidth: clone.offsetWidth,
      cloneHeight: clone.offsetHeight
    });

    // Capture the clone using html2canvas (same approach as SimpleThumbnail)
    const canvas = await html2canvas(clone, {
      scale: OG_WIDTH / NATIVE_WIDTH, // 0.625 - Scale to OG width
      useCORS: true,
      allowTaint: true,
      backgroundColor: null, // Preserve actual background
      logging: false,
      width: NATIVE_WIDTH,
      height: NATIVE_HEIGHT,
      imageTimeout: 10000,
    });

    console.log('[OG Capture] html2canvas completed:', {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height
    });

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

    // The captured canvas should be ~1200x675 (16:9 at 1200 width)
    // OG image is 1200x630 (~1.9:1), so we crop top/bottom to fit
    const sourceWidth = canvas.width;
    const sourceHeight = canvas.height;

    // Center the slide vertically (crop from top/bottom if needed)
    const cropAmount = Math.max(0, (sourceHeight - OG_HEIGHT) / 2);

    // Draw the captured slide, cropped to OG dimensions
    finalCtx.drawImage(
      canvas,
      0, cropAmount, // Source position (crop from top)
      sourceWidth, Math.min(sourceHeight, OG_HEIGHT), // Source dimensions
      0, 0, // Destination position
      OG_WIDTH, OG_HEIGHT // Destination dimensions
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
  } finally {
    // Clean up the offscreen container
    if (cloneContainer && cloneContainer.parentNode) {
      cloneContainer.parentNode.removeChild(cloneContainer);
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
