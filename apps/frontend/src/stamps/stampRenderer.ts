import { SlideData } from '@/types/SlideTypes';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { generateContentHash, getStamp, setStamp } from './stampCache';

// --- Types ---

type Priority = 'high' | 'normal';

interface QueueItem {
  slide: SlideData;
  slideSize: { width: number; height: number };
  priority: Priority;
  hash: string;
  resolve: (url: string | null) => void;
}

// --- State ---

const queue: QueueItem[] = [];
const pendingSlides = new Map<string, Promise<string | null>>();
let processing = false;

// --- Public API ---

/**
 * Request a stamp for a slide. Returns a promise that resolves to a data URL or null.
 * Deduplicates: multiple requests for the same slideId share one render.
 */
export function requestStamp(
  slide: SlideData,
  slideSize?: { width: number; height: number },
  priority: Priority = 'normal'
): Promise<string | null> {
  const slideId = slide?.id;
  if (!slideId) return Promise.resolve(null);

  const hash = generateContentHash(slide);

  // Check cache first
  const cached = getStamp(slideId, hash);
  if (cached) return Promise.resolve(cached);

  // Dedup: if already queued/processing, return existing promise
  const existing = pendingSlides.get(slideId);
  if (existing) return existing;

  const size = slideSize || { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT };

  const promise = new Promise<string | null>((resolve) => {
    const item: QueueItem = { slide, slideSize: size, priority, hash, resolve };

    if (priority === 'high') {
      // Insert after any currently-processing items but before normal priority
      const insertIdx = queue.findIndex(q => q.priority !== 'high');
      if (insertIdx === -1) {
        queue.push(item);
      } else {
        queue.splice(insertIdx, 0, item);
      }
    } else {
      queue.push(item);
    }

    processQueue();
  });

  pendingSlides.set(slideId, promise);
  promise.finally(() => pendingSlides.delete(slideId));

  return promise;
}

/**
 * Cancel all pending stamp requests.
 */
export function cancelPendingStamps(): void {
  // Resolve all pending with null
  for (const item of queue) {
    item.resolve(null);
  }
  queue.length = 0;
  pendingSlides.clear();
}

// --- Queue Processing ---

async function processQueue(): Promise<void> {
  if (processing || queue.length === 0) return;
  processing = true;

  while (queue.length > 0) {
    const item = queue.shift()!;
    const slideId = item.slide.id;

    // Re-check cache in case another render completed while queued
    const cached = getStamp(slideId, item.hash);
    if (cached) {
      item.resolve(cached);
      // Yield briefly between items
      await yieldToMain();
      continue;
    }

    try {
      const dataUrl = await renderSlideOffscreen(item.slide, item.slideSize);
      if (dataUrl) {
        setStamp(slideId, dataUrl, item.hash);
        item.resolve(dataUrl);
      } else {
        item.resolve(null);
      }
    } catch (err) {
      console.warn('[StampRenderer] Capture failed for', slideId, err);
      item.resolve(null);
    }

    // Yield 50ms between captures for UI responsiveness
    await yieldToMain();
  }

  processing = false;
}

function yieldToMain(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 50));
}

// --- Offscreen Rendering ---

async function renderSlideOffscreen(
  slide: SlideData,
  slideSize: { width: number; height: number }
): Promise<string | null> {
  const { width, height } = slideSize;

  // Create offscreen container — MUST stay within viewport bounds for html-to-image to capture.
  // Using z-index:-9999 hides it behind all content; pointer-events:none prevents interaction.
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.style.overflow = 'hidden';
  container.style.background = '#ffffff';
  container.style.zIndex = '-9999';
  container.style.pointerEvents = 'none';
  document.body.appendChild(container);

  let root: any = null;

  try {
    // Dynamically import React modules to avoid circular deps
    const [React, ReactDOMClient, ReactDOM, SlideModule, providers, normModule] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('react-dom'),
      import('@/components/Slide'),
      import('./stampProviders'),
      import('@/utils/slideNormalization'),
    ]);

    const Slide = SlideModule.default;
    const { StampProviders } = providers;
    const { normalizeSlideForRender, resolveSlideSize } = normModule;

    // Normalize slide
    const result = normalizeSlideForRender(slide, slideSize, { preferFallbackSize: true });
    const normalizedSlide = result?.slide || slide;
    const resolvedSize = result?.slideSize || resolveSlideSize(normalizedSlide, slideSize);

    const safeSlide: SlideData = normalizedSlide || {
      id: 'stamp-fallback',
      deckId: '',
      order: 0,
      status: 'completed' as const,
      components: [],
    };

    // Render using React with flushSync for synchronous DOM commit
    root = ReactDOMClient.createRoot(container);

    const el = React.createElement(
      StampProviders,
      { slideSize: resolvedSize || slideSize, slide: safeSlide },
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

    // --- Wait sequence ---

    // 1. Wait for fonts (up to 3s)
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise(r => setTimeout(r, 3000)),
      ]);
    } catch { /* ignore */ }

    // 2. Wait for images (up to 5s)
    await waitForImages(container, 5000);

    // 3. Wait for iframes (up to 3s)
    await waitForIframes(container, 3000);

    // 4. Force animations to end state
    const animStyle = forceAnimationsToEnd(container);

    // 5. Settling delay (charts, layout)
    await new Promise(r => setTimeout(r, 200));

    // --- Capture ---
    const dataUrl = await captureElement(container, width, height);

    // Cleanup animation override
    if (animStyle) animStyle.remove();

    return dataUrl;
  } finally {
    // Cleanup
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

// --- Capture helpers ---

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
      pixelRatio: 0.5, // 960x540 output
      backgroundColor: '#ffffff',
      skipAutoScale: true,
      cacheBust: true,
    });
    return dataUrl;
  } catch (err) {
    console.warn('[StampRenderer] html-to-image failed, trying html2canvas:', err);
  }

  // Fallback to html2canvas
  try {
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(element, {
      scale: 0.5,
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
    console.warn('[StampRenderer] html2canvas also failed:', err);
    return null;
  }
}

// --- Wait helpers (reuse patterns from slideScreenshot.ts) ---

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
