import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';
import { SlideData } from '@/types/SlideTypes';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';

/**
 * OG Image dimensions (optimized for social sharing)
 * Standard OG image size is 1200x630
 */
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

/**
 * Captures a slide as an OG-optimized thumbnail using offscreen rendering.
 * Renders the slide data in a hidden container (same approach as the stamp system)
 * to produce a perfect capture regardless of what's visible in the DOM.
 */
export async function captureOGThumbnail(
  slide: SlideData,
  slideSize?: { width: number; height: number }
): Promise<string | null> {
  const size = slideSize || { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT };

  // Create offscreen container — MUST stay within viewport bounds for html-to-image to capture.
  // Using z-index:-9999 hides it behind all content; pointer-events:none prevents interaction.
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = `${size.width}px`;
  container.style.height = `${size.height}px`;
  container.style.overflow = 'hidden';
  container.style.background = '#ffffff';
  container.style.zIndex = '-9999';
  container.style.pointerEvents = 'none';
  document.body.appendChild(container);

  let root: any = null;

  try {
    console.log('[OG Capture] Rendering slide offscreen:', slide.id);

    // Dynamically import React modules (same as stampRenderer)
    const [React, ReactDOMClient, ReactDOM, SlideModule, providers, normModule] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('react-dom'),
      import('@/components/Slide'),
      import('@/stamps/stampProviders'),
      import('@/utils/slideNormalization'),
    ]);

    const Slide = SlideModule.default;
    const { StampProviders } = providers;
    const { normalizeSlideForRender, resolveSlideSize } = normModule;

    // Normalize slide data
    const result = normalizeSlideForRender(slide, size, { preferFallbackSize: true });
    const normalizedSlide = result?.slide || slide;
    const resolvedSize = result?.slideSize || resolveSlideSize(normalizedSlide, size);

    const safeSlide: SlideData = normalizedSlide || {
      id: 'og-fallback',
      deckId: '',
      order: 0,
      status: 'completed' as const,
      components: [],
    };

    // Render with React using flushSync for synchronous DOM commit
    root = ReactDOMClient.createRoot(container);

    const el = React.createElement(
      StampProviders,
      { slideSize: resolvedSize || size, slide: safeSlide },
      React.createElement(Slide, {
        slide: safeSlide,
        isActive: true,
        isEditing: false,
        isThumbnail: true,
      })
    );

    // flushSync forces synchronous render + useLayoutEffect (sets isVisible=true)
    ReactDOM.flushSync(() => {
      root.render(el);
    });

    // Brief delay for useEffect callbacks to fire
    await new Promise(r => setTimeout(r, 50));

    // --- Wait sequence (same as stamp renderer) ---

    // 1. Fonts (up to 3s)
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise(r => setTimeout(r, 3000)),
      ]);
    } catch { /* ignore */ }

    // 2. Images (up to 5s)
    await waitForImages(container, 5000);

    // 3. Iframes (up to 3s)
    await waitForIframes(container, 3000);

    // 4. Force animations to end state
    const animStyle = forceAnimationsToEnd(container);

    // 5. Settling delay
    await new Promise(r => setTimeout(r, 200));

    // --- Capture at native resolution ---
    const capturedUrl = await captureElement(container, size.width, size.height);

    if (animStyle) animStyle.remove();

    if (!capturedUrl) {
      console.warn('[OG Capture] Offscreen capture returned null');
      return null;
    }

    // --- Scale to OG dimensions (1200x630) ---
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load captured image'));
      img.src = capturedUrl;
    });

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = OG_WIDTH;
    finalCanvas.height = OG_HEIGHT;
    const ctx = finalCanvas.getContext('2d');

    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    // Fill with white background for letterboxing
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);

    // Fit the captured slide into OG dimensions
    const sourceAspect = img.width / img.height;
    const targetAspect = OG_WIDTH / OG_HEIGHT;

    let drawWidth: number;
    let drawHeight: number;
    let offsetX: number;
    let offsetY: number;

    if (sourceAspect > targetAspect) {
      drawWidth = OG_WIDTH;
      drawHeight = OG_WIDTH / sourceAspect;
      offsetX = 0;
      offsetY = (OG_HEIGHT - drawHeight) / 2;
    } else {
      drawHeight = OG_HEIGHT;
      drawWidth = OG_HEIGHT * sourceAspect;
      offsetX = (OG_WIDTH - drawWidth) / 2;
      offsetY = 0;
    }

    ctx.drawImage(img, 0, 0, img.width, img.height, offsetX, offsetY, drawWidth, drawHeight);

    const dataUrl = finalCanvas.toDataURL('image/jpeg', 0.92);
    console.log('[OG Capture] Final image size:', Math.round(dataUrl.length / 1024), 'KB');

    return dataUrl;
  } catch (error) {
    console.error('[OG Capture] Failed to capture:', error);
    return null;
  } finally {
    try {
      if (root) root.unmount();
    } catch { /* ignore */ }
    try {
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
    } catch { /* ignore */ }
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
 * Renders the slide offscreen for a perfect capture.
 */
export async function generateShareOGImage(
  slide: SlideData,
  shortCode: string,
  slideSize?: { width: number; height: number }
): Promise<string | null> {
  const dataUrl = await captureOGThumbnail(slide, slideSize);

  if (!dataUrl) {
    return null;
  }

  const publicUrl = await uploadOGThumbnail(dataUrl, shortCode);
  return publicUrl;
}

// --- Capture helpers (same as stampRenderer) ---

async function captureElement(
  element: HTMLElement,
  width: number,
  height: number
): Promise<string | null> {
  // Try html-to-image first (better CSS/SVG support)
  try {
    const htmlToImage = await import('html-to-image');
    const dataUrl = await htmlToImage.toPng(element, {
      width,
      height,
      pixelRatio: 0.7, // 1344x756 output - plenty for OG scaling
      backgroundColor: '#ffffff',
      skipAutoScale: true,
      cacheBust: true,
    });
    return dataUrl;
  } catch (err) {
    console.warn('[OG Capture] html-to-image failed, trying html2canvas:', err);
  }

  // Fallback to html2canvas
  try {
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(element, {
      scale: 0.7,
      backgroundColor: '#ffffff',
      width,
      height,
      logging: false,
      useCORS: true,
      allowTaint: true,
      imageTimeout: 5000,
    });
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('[OG Capture] html2canvas also failed:', err);
    return null;
  }
}

// --- Wait helpers ---

async function waitForImages(container: HTMLElement, maxWait: number): Promise<void> {
  const images = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
  if (images.length === 0) return;

  const timeout = new Promise<void>(r => setTimeout(r, maxWait));
  const loading = Promise.all(
    images.map(img => new Promise<void>(resolve => {
      if (img.complete && img.naturalWidth > 0) { resolve(); return; }
      const done = () => { img.removeEventListener('load', done); img.removeEventListener('error', done); resolve(); };
      img.addEventListener('load', done);
      img.addEventListener('error', done);
    }))
  );
  await Promise.race([loading, timeout]);
}

async function waitForIframes(container: HTMLElement, maxWait: number): Promise<void> {
  const iframes = Array.from(container.querySelectorAll('iframe[srcdoc]')) as HTMLIFrameElement[];
  if (iframes.length === 0) return;

  const start = Date.now();
  for (const iframe of iframes) {
    const remaining = maxWait - (Date.now() - start);
    if (remaining <= 0) break;
    await waitForIframeReady(iframe, remaining);
  }
}

function waitForIframeReady(iframe: HTMLIFrameElement, maxWait: number): Promise<Document | null> {
  const start = Date.now();
  return new Promise(resolve => {
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

function forceAnimationsToEnd(container: HTMLElement): HTMLStyleElement | null {
  try {
    const doc = container.ownerDocument;
    const style = doc.createElement('style');
    style.textContent = `
      *, *::before, *::after {
        animation-delay: -9999s !important;
        animation-duration: 0.001s !important;
        animation-fill-mode: forwards !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `;
    container.appendChild(style);
    return style;
  } catch {
    return null;
  }
}
