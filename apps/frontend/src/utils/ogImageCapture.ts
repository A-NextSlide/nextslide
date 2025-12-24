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
 * Finds a slide element by its ID using the data-slide-id attribute.
 */
export function findSlideElement(slideId: string): HTMLElement | null {
  return document.querySelector(`[data-slide-id="${slideId}"]`) as HTMLElement | null;
}

/**
 * Captures the first slide of a deck as an OG-optimized thumbnail.
 * The image is sized to 1200x630 (standard OG dimensions) and uses
 * a letterboxed approach to maintain slide aspect ratio.
 *
 * @param slideElementOrId - Either an HTMLElement or a slide ID string
 */
export async function captureOGThumbnail(
  slideElementOrId: HTMLElement | string
): Promise<string | null> {
  // Resolve slide element if a string ID was passed
  const slideElement = typeof slideElementOrId === 'string'
    ? findSlideElement(slideElementOrId)
    : slideElementOrId;

  if (!slideElement) {
    console.warn('[OG Capture] Slide element not found');
    return null;
  }
  try {
    // Find the actual slide content (the scaled div)
    const slideContent = slideElement.querySelector('div[style*="transform"]') as HTMLElement;

    if (!slideContent) {
      console.warn('[OG Capture] No slide content found');
      return null;
    }

    // Clone the slide content to avoid modifying the original
    const clone = slideContent.cloneNode(true) as HTMLElement;

    // Create a temporary container at 1920x1080 (slide dimensions)
    const slideContainer = document.createElement('div');
    slideContainer.style.position = 'absolute';
    slideContainer.style.left = '-9999px';
    slideContainer.style.top = '0';
    slideContainer.style.width = '1920px';
    slideContainer.style.height = '1080px';
    slideContainer.style.backgroundColor = '#ffffff';
    slideContainer.style.overflow = 'hidden';

    // Reset transform on the clone
    clone.style.transform = 'none';
    clone.style.position = 'relative';
    clone.style.width = '1920px';
    clone.style.height = '1080px';

    slideContainer.appendChild(clone);
    document.body.appendChild(slideContainer);

    try {
      // Wait for any images/fonts to render
      await new Promise(resolve => setTimeout(resolve, 200));

      // Capture at a scale that gives us OG dimensions
      // 1920 -> 1200 = 0.625 scale
      const canvas = await html2canvas(slideContainer, {
        scale: OG_WIDTH / 1920,
        backgroundColor: '#ffffff',
        width: 1920,
        height: 1080,
        logging: false,
        useCORS: true,
        allowTaint: true,
        imageTimeout: 3000,
      });

      // The captured canvas is 1200x675, we need to letterbox to 1200x630
      // Create final canvas at exact OG dimensions
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = OG_WIDTH;
      finalCanvas.height = OG_HEIGHT;
      const ctx = finalCanvas.getContext('2d');

      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      // Fill with white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);

      // Calculate positioning to center the slide (slight crop from top/bottom)
      const sourceHeight = canvas.height;
      const sourceWidth = canvas.width;

      // Center the slide vertically (crop equally from top and bottom)
      const cropAmount = (sourceHeight - OG_HEIGHT) / 2;

      ctx.drawImage(
        canvas,
        0, cropAmount, sourceWidth, OG_HEIGHT, // Source: crop from center
        0, 0, OG_WIDTH, OG_HEIGHT              // Dest: full canvas
      );

      // Return as JPEG for smaller file size
      return finalCanvas.toDataURL('image/jpeg', 0.9);
    } finally {
      document.body.removeChild(slideContainer);
    }
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
