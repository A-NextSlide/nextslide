import DOMPurify from 'dompurify';
import { SlideData } from '@/types/SlideTypes';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';

/**
 * Fetch an image and convert to base64 data URI
 */
async function imageToBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn(`[HTML Export] Failed to fetch image: ${url}`, e);
    return null;
  }
}

/**
 * Find all image URLs in HTML and convert them to base64
 */
async function embedImages(html: string, onProgress?: (msg: string) => void): Promise<string> {
  // Find all image URLs (in src attributes and CSS url())
  const imgSrcRegex = /src=["'](https?:\/\/[^"']+)["']/gi;
  const cssUrlRegex = /url\(["']?(https?:\/\/[^"')]+)["']?\)/gi;

  const urls = new Set<string>();

  let match;
  while ((match = imgSrcRegex.exec(html)) !== null) {
    urls.add(match[1]);
  }
  while ((match = cssUrlRegex.exec(html)) !== null) {
    urls.add(match[1]);
  }

  if (urls.size === 0) return html;

  onProgress?.(`Embedding ${urls.size} images...`);

  // Fetch and convert all images
  const urlToBase64 = new Map<string, string>();
  const urlArray = Array.from(urls);

  for (let i = 0; i < urlArray.length; i++) {
    const url = urlArray[i];
    onProgress?.(`Embedding image ${i + 1}/${urls.size}...`);
    const base64 = await imageToBase64(url);
    if (base64) {
      urlToBase64.set(url, base64);
    }
  }

  // Replace URLs with base64
  let result = html;
  for (const [url, base64] of urlToBase64) {
    // Escape special regex characters in URL
    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), base64);
  }

  return result;
}

/**
 * Remove Google Fonts and external CSS, add system font fallbacks
 */
function removeExternalResources(html: string): string {
  let result = html;

  // Remove Google Fonts links
  result = result.replace(/<link[^>]*fonts\.googleapis\.com[^>]*>/gi, '');
  result = result.replace(/<link[^>]*fonts\.gstatic\.com[^>]*>/gi, '');

  // Remove Google Fonts @import
  result = result.replace(/@import\s+url\([^)]*fonts\.googleapis\.com[^)]*\);?/gi, '');

  // Remove other external stylesheets (keep data: URIs)
  result = result.replace(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']https?:\/\/[^"']+["'][^>]*>/gi, '');

  // Add system font fallback CSS
  const fontFallback = `
<style>
  * { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important; }
  h1, h2, h3, h4, h5, h6, .heading, .title, .hero { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important; }
</style>`;

  // Insert fallback after <head> or at start
  if (result.includes('<head>')) {
    result = result.replace('<head>', '<head>' + fontFallback);
  } else if (result.includes('<head ')) {
    result = result.replace(/<head[^>]*>/, '$&' + fontFallback);
  } else {
    result = fontFallback + result;
  }

  return result;
}

/**
 * Fix broken CSS @import statements that have newlines inside URL strings.
 */
function fixBrokenCssImports(html: string): string {
  if (!html || typeof html !== 'string') return html;
  return html.replace(
    /@import\s+url\s*\(\s*(['"])([\s\S]*?)\1\s*\)\s*;/gi,
    (_match, quote, url) => {
      const cleanUrl = url.replace(/\s+/g, '');
      return `@import url(${quote}${cleanUrl}${quote});`;
    }
  );
}

/**
 * Fix broken CSS url() declarations that have newlines inside.
 */
function fixBrokenCssUrls(html: string): string {
  if (!html || typeof html !== 'string') return html;
  return html.replace(
    /url\s*\(\s*(['"])([\s\S]*?)\1\s*\)/gi,
    (_match, quote, urlContent) => {
      if (urlContent.includes('data:')) {
        const cleanUrl = urlContent
          .replace(/;\s*\n\s*/g, ';')
          .replace(/,\s*\n\s*/g, ',')
          .replace(/\n\s*/g, ' ')
          .replace(/\s{2,}/g, ' ');
        return `url(${quote}${cleanUrl}${quote})`;
      }
      const cleanUrl = urlContent.replace(/\s+/g, '');
      return `url(${quote}${cleanUrl}${quote})`;
    }
  );
}

/**
 * Inject image props into HTML by replacing placeholder src attributes.
 */
function injectImageProps(html: string, props: Record<string, any>): string {
  if (!html || !props) return html;

  let result = html;
  const imagePropsMap: Record<string, string> = {};
  const imageUrls: string[] = [];

  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'string' && value.startsWith('http')) {
      imagePropsMap[key.toLowerCase()] = value;
      if (/^image\d+$/i.test(key)) {
        const index = parseInt(key.replace(/image/i, ''), 10) - 1;
        imageUrls[index] = value;
      }
    }
  }

  // Pattern 1: ${propName} in src
  result = result.replace(/<img\s+([^>]*?)src=["']\$\{+\s*(\w+)\s*\}+["']([^>]*?)>/gi,
    (match, before, varName, after) => {
      const variations = [varName, varName + 'Image', varName.toLowerCase()];
      for (const name of variations) {
        if (imagePropsMap[name.toLowerCase()]) {
          return `<img ${before}src="${imagePropsMap[name.toLowerCase()]}"${after}>`;
        }
      }
      return match;
    }
  );

  // Pattern 2: placeholder src
  let imageIndex = 0;
  result = result.replace(/<img\s+([^>]*?)src=["']([^"']*)["']([^>]*?)>/gi,
    (match, before, src, after) => {
      if (src.startsWith('http') || src.startsWith('data:') || src.startsWith('blob:')) {
        imageIndex++;
        return match;
      }

      const dataPropMatch = (before + after).match(/data-prop=["']([^"']+)["']/i);
      if (dataPropMatch?.[1] && imagePropsMap[dataPropMatch[1].toLowerCase()]) {
        imageIndex++;
        return `<img ${before}src="${imagePropsMap[dataPropMatch[1].toLowerCase()]}"${after}>`;
      }

      if (imageUrls[imageIndex]) {
        const url = imageUrls[imageIndex];
        imageIndex++;
        return `<img ${before}src="${url}"${after}>`;
      }

      imageIndex++;
      return match;
    }
  );

  return result;
}

/**
 * Extract the HTML content from a slide's CustomComponent
 */
async function extractSlideHtml(
  slide: SlideData,
  onProgress?: (msg: string) => void
): Promise<string | null> {
  const customComponent = slide.components?.find(
    c => c.type === 'CustomComponent' && c.props?.render
  );

  if (!customComponent) {
    console.log(`[HTML Export] Slide ${slide.id} has no CustomComponent with render`);
    return null;
  }

  let renderCode = customComponent.props.render as string;
  if (!renderCode) return null;

  // Unescape if needed
  if (renderCode.includes('\\n') || renderCode.includes('\\t')) {
    renderCode = renderCode
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');
  }

  const lowerCode = renderCode.trim().toLowerCase();
  const isFullHtmlDoc = lowerCode.startsWith('<!doctype html') ||
                        lowerCode.startsWith('<html') ||
                        lowerCode.includes('<!doctype html');

  if (!isFullHtmlDoc) {
    console.log(`[HTML Export] Slide ${slide.id} is not a full HTML document`);
    return null;
  }

  // Apply fixes
  let html = fixBrokenCssImports(renderCode);
  html = fixBrokenCssUrls(html);

  // Inject image props
  const imageProps = customComponent.props.props || {};
  html = injectImageProps(html, imageProps);

  // Remove external resources (fonts, external CSS)
  html = removeExternalResources(html);

  // Embed all images as base64
  html = await embedImages(html, onProgress);

  return html;
}

/**
 * Create fallback slide HTML
 */
function createFallbackSlide(index: number, title?: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
      font-family: system-ui, sans-serif;
    }
    .message { text-align: center; padding: 40px; }
    h2 { font-size: 32px; margin-bottom: 16px; }
    p { font-size: 18px; opacity: 0.7; }
  </style>
</head>
<body>
  <div class="message">
    <h2>Slide ${index + 1}</h2>
    <p>${title || 'Content not available'}</p>
  </div>
</body>
</html>`;
}

/**
 * Get slide element for overlay positioning
 */
function getSlideElement(): HTMLElement | null {
  const slideEl = document.querySelector('[data-slide-id]') as HTMLElement;
  if (slideEl) return slideEl;
  return document.querySelector('.slide-container') as HTMLElement;
}

/**
 * Create overlay positioned over the slide area
 */
function createOverlay(slideCount: number): { overlay: HTMLElement; updateProgress: (current: number) => void } {
  const slideEl = getSlideElement();
  const overlay = document.createElement('div');

  if (slideEl) {
    const rect = slideEl.getBoundingClientRect();
    overlay.style.cssText = `
      position: fixed;
      top: ${rect.top}px;
      left: ${rect.left}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      background: rgba(255, 255, 255, 0.98);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, sans-serif;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    `;
  } else {
    overlay.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      padding: 40px 60px;
      background: rgba(255, 255, 255, 0.98);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, sans-serif;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    `;
  }

  overlay.innerHTML = DOMPurify.sanitize(`
    <div style="text-align: center;">
      <div style="font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #333;">Generating Offline HTML</div>
      <div style="font-size: 14px; color: #666;" id="html-progress">Preparing...</div>
      <div style="margin-top: 16px; width: 200px; height: 4px; background: #e0e0e0; border-radius: 2px; overflow: hidden;">
        <div id="html-progress-bar" style="width: 0%; height: 100%; background: #3b82f6; transition: width 0.3s;"></div>
      </div>
    </div>
  `);

  document.body.appendChild(overlay);

  const progressEl = overlay.querySelector('#html-progress') as HTMLElement;
  const progressBar = overlay.querySelector('#html-progress-bar') as HTMLElement;

  const updateProgress = (current: number) => {
    if (progressEl) progressEl.textContent = `Slide ${current} of ${slideCount}`;
    if (progressBar) progressBar.style.width = `${(current / slideCount) * 100}%`;
  };

  return { overlay, updateProgress };
}

/**
 * Build the final HTML document
 */
function buildHtmlDocument(title: string, slides: string[], slideWidth: number, slideHeight: number, logoBase64: string): string {
  const escapedTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const aspectRatio = slideWidth / slideHeight;

  // Encode slides as base64 to avoid escaping issues
  const encodedSlides = slides.map(s => btoa(unescape(encodeURIComponent(s))));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${escapedTitle} - NextSlide Offline</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #111; font-family: system-ui, sans-serif; color: #fff; }
    body.fullscreen { background: #000; cursor: none; }
    body.fullscreen.active { cursor: default; }
    .presentation { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; padding: 40px; transition: padding 0.3s; }
    body.fullscreen .presentation { padding: 0; }
    .slide-wrapper { position: relative; width: 100%; max-width: calc(90vh * ${aspectRatio}); aspect-ratio: ${aspectRatio}; background: #000; border-radius: 12px; box-shadow: 0 25px 80px rgba(0,0,0,0.5); overflow: hidden; transition: border-radius 0.3s, max-width 0.3s; }
    body.fullscreen .slide-wrapper { border-radius: 0; max-width: none; width: 100%; height: 100%; aspect-ratio: auto; }
    .slide-container { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
    .slide-iframe { position: absolute; width: ${slideWidth}px; height: ${slideHeight}px; border: none; display: none; background: #fff; transform-origin: center center; }
    .slide-iframe.active { display: block; }
    .controls-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 100; opacity: 1; transition: opacity 0.3s; }
    body.fullscreen .controls-overlay { opacity: 0; }
    body.fullscreen.active .controls-overlay { opacity: 1; }
    .header { position: absolute; top: 0; left: 0; right: 0; display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; background: linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, transparent 100%); pointer-events: auto; }
    body.fullscreen .header { background: linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%); }
    .logo { display: inline-flex; align-items: center; text-decoration: none; color: #fff; }
    .logo-text { font-weight: 900; font-size: 14px; text-transform: uppercase; letter-spacing: 0; line-height: 1; }
    .logo-x { height: 26px; width: 18px; object-fit: contain; margin-left: -2px; margin-right: -6px; position: relative; top: -3px; }
    .title { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); font-size: 14px; color: rgba(255,255,255,0.9); max-width: 50%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; }
    .header-controls { display: flex; align-items: center; gap: 8px; }
    .btn { background: rgba(255,255,255,0.15); border: none; border-radius: 6px; padding: 8px 14px; color: #fff; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; backdrop-filter: blur(10px); transition: background 0.2s; }
    .btn:hover { background: rgba(255,255,255,0.25); }
    .btn svg { width: 16px; height: 16px; }
    .footer { position: absolute; bottom: 0; left: 0; right: 0; display: flex; align-items: center; justify-content: center; padding: 16px 20px; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%); pointer-events: auto; gap: 20px; }
    body.fullscreen .footer { background: linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%); }
    .counter { font-size: 14px; color: rgba(255,255,255,0.9); min-width: 70px; text-align: center; font-weight: 500; }
    .progress { flex: 1; max-width: 500px; height: 4px; background: rgba(255,255,255,0.3); border-radius: 2px; overflow: hidden; cursor: pointer; }
    .progress-fill { height: 100%; background: #fff; border-radius: 2px; transition: width 0.2s; }
    .nav { position: absolute; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.1); border: none; border-radius: 50%; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #fff; pointer-events: auto; backdrop-filter: blur(10px); transition: background 0.2s, opacity 0.3s; opacity: 0; }
    .nav.visible { opacity: 1; }
    .nav:hover { background: rgba(255,255,255,0.2); }
    .nav:disabled { opacity: 0.2 !important; cursor: not-allowed; }
    .nav.prev { left: 24px; }
    .nav.next { right: 24px; }
    .nav svg { width: 24px; height: 24px; }
    .grid-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 200; display: none; flex-direction: column; cursor: default; }
    .grid-overlay.visible { display: flex; }
    .grid-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; border-bottom: 1px solid rgba(255,255,255,0.1); }
    .grid-title { font-size: 18px; font-weight: 600; }
    .grid-content { flex: 1; overflow-y: auto; padding: 24px; }
    .thumb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; max-width: 1400px; margin: 0 auto; }
    .thumb { cursor: pointer; border-radius: 8px; overflow: hidden; border: 2px solid transparent; background: #1a1a2e; transition: all 0.2s; }
    .thumb:hover { border-color: rgba(255,255,255,0.3); transform: scale(1.02); }
    .thumb.current { border-color: #fff; box-shadow: 0 0 0 2px rgba(255,255,255,0.2); }
    .thumb-preview { width: 100%; aspect-ratio: ${aspectRatio}; position: relative; overflow: hidden; background: #fff; pointer-events: none; }
    .thumb-iframe { position: absolute; top: 0; left: 0; width: ${slideWidth}px; height: ${slideHeight}px; border: none; transform-origin: top left; pointer-events: none; }
    .thumb-label { padding: 8px; font-size: 12px; color: rgba(255,255,255,0.7); text-align: center; background: rgba(0,0,0,0.5); }
    .thumb.current .thumb-label { color: #fff; font-weight: 600; }
    .help-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 300; display: none; align-items: center; justify-content: center; cursor: default; }
    .help-overlay.visible { display: flex; }
    .help-box { background: rgba(30,30,40,0.95); border-radius: 16px; padding: 32px 40px; max-width: 420px; border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(20px); }
    .help-title { font-size: 20px; font-weight: 600; margin-bottom: 24px; }
    .help-list { list-style: none; }
    .help-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
    .help-item:last-child { border-bottom: none; }
    .key { background: rgba(255,255,255,0.15); padding: 4px 10px; border-radius: 6px; font-family: system-ui, sans-serif; font-size: 12px; font-weight: 500; }
    @media (max-width: 768px) {
      .header { padding: 10px 16px; }
      .title { display: none; }
      .logo-text { font-size: 12px; }
      .logo-x { height: 22px; width: 15px; margin-left: -1px; margin-right: -5px; top: -2px; }
      .btn span { display: none; }
      .btn { padding: 8px; }
      .nav { width: 44px; height: 44px; }
      .nav.prev { left: 12px; }
      .nav.next { right: 12px; }
      .footer { padding: 12px 16px; }
      .thumb-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
      .grid-content { padding: 16px; }
    }
  </style>
</head>
<body>
  <div class="presentation" id="app">
    <div class="slide-wrapper">
      <div class="slide-container" id="slideContainer"></div>
    </div>
    <div class="controls-overlay">
      <header class="header">
        <a href="https://nextslide.ai" target="_blank" class="logo">
          <span class="logo-text">NE</span><img src="${logoBase64}" alt="" class="logo-x"><span class="logo-text">TSLIDE</span>
        </a>
        <span class="title">${escapedTitle}</span>
        <div class="header-controls">
          <button class="btn" onclick="toggleGrid()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg><span>Grid</span></button>
          <button class="btn" onclick="toggleFullscreen()" id="fsBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg><span>Present</span></button>
          <button class="btn" onclick="toggleHelp()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></button>
        </div>
      </header>
      <button class="nav prev" id="prevBtn" onclick="prev()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>
      <button class="nav next" id="nextBtn" onclick="next()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></button>
      <footer class="footer">
        <span class="counter" id="counter">1 / ${slides.length}</span>
        <div class="progress" onclick="clickProgress(event)"><div class="progress-fill" id="progressFill"></div></div>
      </footer>
    </div>
  </div>
  <div class="grid-overlay" id="gridOverlay">
    <div class="grid-header">
      <span class="grid-title">All Slides</span>
      <button class="btn" onclick="toggleGrid()"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="grid-content"><div class="thumb-grid" id="thumbGrid"></div></div>
  </div>
  <div class="help-overlay" id="helpOverlay" onclick="toggleHelp()">
    <div class="help-box" onclick="event.stopPropagation()">
      <h3 class="help-title">Keyboard Shortcuts</h3>
      <ul class="help-list">
        <li class="help-item"><span>Next slide</span><span><span class="key">→</span> <span class="key">Space</span> <span class="key">Click</span></span></li>
        <li class="help-item"><span>Previous slide</span><span class="key">←</span></li>
        <li class="help-item"><span>First slide</span><span class="key">Home</span></li>
        <li class="help-item"><span>Last slide</span><span class="key">End</span></li>
        <li class="help-item"><span>Slide grid</span><span class="key">G</span></li>
        <li class="help-item"><span>Present mode</span><span class="key">F</span></li>
        <li class="help-item"><span>Exit / Close</span><span class="key">Esc</span></li>
      </ul>
    </div>
  </div>
  <script>
    var encoded = ${JSON.stringify(encodedSlides)};
    var slides = encoded.map(function(s) { return decodeURIComponent(escape(atob(s))); });
    var total = slides.length;
    var current = 0;
    var container = document.getElementById('slideContainer');
    var wrapper = document.querySelector('.slide-wrapper');
    var counter = document.getElementById('counter');
    var progressFill = document.getElementById('progressFill');
    var prevBtn = document.getElementById('prevBtn');
    var nextBtn = document.getElementById('nextBtn');
    var thumbGrid = document.getElementById('thumbGrid');
    var gridOverlay = document.getElementById('gridOverlay');
    var helpOverlay = document.getElementById('helpOverlay');
    var fsBtn = document.getElementById('fsBtn');

    var slideW = ${slideWidth};
    var slideH = ${slideHeight};
    var idleTimer = null;
    var idleDelay = 2500;
    var isFullscreen = false;
    var edgeThreshold = 120;

    function setActive(active) {
      if (active) {
        document.body.classList.add('active');
      } else {
        document.body.classList.remove('active');
      }
    }

    function resetIdle() {
      if (!isFullscreen) return;
      setActive(true);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function() {
        if (!gridOverlay.classList.contains('visible') && !helpOverlay.classList.contains('visible')) {
          setActive(false);
        }
      }, idleDelay);
    }

    function checkEdgeProximity(e) {
      var x = e.clientX;
      var vw = window.innerWidth;
      var nearLeft = x < edgeThreshold;
      var nearRight = x > vw - edgeThreshold;

      if (nearLeft && current > 0) {
        prevBtn.classList.add('visible');
      } else {
        prevBtn.classList.remove('visible');
      }

      if (nearRight && current < total - 1) {
        nextBtn.classList.add('visible');
      } else {
        nextBtn.classList.remove('visible');
      }
    }

    function scaleSlides() {
      var rect = wrapper.getBoundingClientRect();
      var scale = Math.min(rect.width / slideW, rect.height / slideH);
      var iframes = container.querySelectorAll('.slide-iframe');
      iframes.forEach(function(iframe) {
        iframe.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
        iframe.style.left = '50%';
        iframe.style.top = '50%';
      });
    }

    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(function() {
          isFullscreen = true;
          document.body.classList.add('fullscreen');
          fsBtn.querySelector('span').textContent = 'Exit';
          setTimeout(scaleSlides, 100);
          resetIdle();
        }).catch(function() {
          // Fallback for browsers that don't support fullscreen
          isFullscreen = true;
          document.body.classList.add('fullscreen');
          fsBtn.querySelector('span').textContent = 'Exit';
          setTimeout(scaleSlides, 100);
          resetIdle();
        });
      } else {
        document.exitFullscreen().then(function() {
          isFullscreen = false;
          document.body.classList.remove('fullscreen');
          fsBtn.querySelector('span').textContent = 'Present';
          setActive(true);
          setTimeout(scaleSlides, 100);
        }).catch(function() {
          isFullscreen = false;
          document.body.classList.remove('fullscreen');
          fsBtn.querySelector('span').textContent = 'Present';
          setActive(true);
          setTimeout(scaleSlides, 100);
        });
      }
    }

    function init() {
      slides.forEach(function(html, i) {
        var iframe = document.createElement('iframe');
        iframe.className = 'slide-iframe' + (i === 0 ? ' active' : '');
        iframe.sandbox = 'allow-scripts allow-same-origin';
        container.appendChild(iframe);
        iframe.srcdoc = html;
      });
      scaleSlides();
      window.addEventListener('resize', function() {
        scaleSlides();
        if (gridOverlay.classList.contains('visible')) scaleThumbs();
      });

      // Idle detection for fullscreen mode
      document.addEventListener('mousemove', function(e) {
        resetIdle();
        checkEdgeProximity(e);
      });
      document.addEventListener('mousedown', resetIdle);
      document.addEventListener('keydown', resetIdle);
      document.addEventListener('touchstart', resetIdle);

      // Fullscreen change detection
      document.addEventListener('fullscreenchange', function() {
        if (!document.fullscreenElement) {
          isFullscreen = false;
          document.body.classList.remove('fullscreen');
          fsBtn.querySelector('span').textContent = 'Present';
          setActive(true);
          setTimeout(scaleSlides, 100);
        }
      });

      // Create thumbnails with actual slide content
      for (var i = 0; i < total; i++) {
        var item = document.createElement('div');
        item.className = 'thumb' + (i === 0 ? ' current' : '');
        item.onclick = (function(idx) { return function() { goTo(idx); }; })(i);

        var preview = document.createElement('div');
        preview.className = 'thumb-preview';

        var thumbIframe = document.createElement('iframe');
        thumbIframe.className = 'thumb-iframe';
        thumbIframe.sandbox = 'allow-same-origin';
        thumbIframe.srcdoc = slides[i];

        preview.appendChild(thumbIframe);

        var label = document.createElement('div');
        label.className = 'thumb-label';
        label.textContent = 'Slide ' + (i + 1);

        item.appendChild(preview);
        item.appendChild(label);
        thumbGrid.appendChild(item);
      }

      // Scale thumbnail iframes after they're added
      setTimeout(scaleThumbs, 100);
      updateUI();
    }

    function scaleThumbs() {
      var thumbs = thumbGrid.querySelectorAll('.thumb-preview');
      thumbs.forEach(function(preview) {
        var rect = preview.getBoundingClientRect();
        var scale = rect.width / slideW;
        var iframe = preview.querySelector('.thumb-iframe');
        if (iframe) iframe.style.transform = 'scale(' + scale + ')';
      });
    }

    function goTo(i) {
      if (i < 0 || i >= total) return;
      var iframes = container.querySelectorAll('.slide-iframe');
      iframes[current].classList.remove('active');
      iframes[i].classList.add('active');
      var thumbs = thumbGrid.querySelectorAll('.thumb');
      thumbs[current].classList.remove('current');
      thumbs[i].classList.add('current');
      current = i;
      updateUI();
      if (gridOverlay.classList.contains('visible')) toggleGrid();
    }

    function next() { goTo(current + 1); }
    function prev() { goTo(current - 1); }

    function updateUI() {
      counter.textContent = (current + 1) + ' / ' + total;
      progressFill.style.width = ((current + 1) / total * 100) + '%';
      prevBtn.disabled = current === 0;
      nextBtn.disabled = current === total - 1;
    }

    function clickProgress(e) {
      var rect = e.currentTarget.getBoundingClientRect();
      var pct = (e.clientX - rect.left) / rect.width;
      goTo(Math.min(Math.floor(pct * total), total - 1));
    }

    function toggleGrid() {
      gridOverlay.classList.toggle('visible');
      if (gridOverlay.classList.contains('visible')) {
        setActive(true);
        setTimeout(scaleThumbs, 50);
        var t = thumbGrid.children[current];
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        resetIdle();
      }
    }

    function toggleHelp() {
      helpOverlay.classList.toggle('visible');
      if (helpOverlay.classList.contains('visible')) {
        setActive(true);
      } else {
        resetIdle();
      }
    }

    document.addEventListener('keydown', function(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      switch(e.key) {
        case 'ArrowRight': case ' ': e.preventDefault(); if (!gridOverlay.classList.contains('visible') && !helpOverlay.classList.contains('visible')) next(); break;
        case 'ArrowLeft': e.preventDefault(); if (!gridOverlay.classList.contains('visible') && !helpOverlay.classList.contains('visible')) prev(); break;
        case 'Home': e.preventDefault(); goTo(0); break;
        case 'End': e.preventDefault(); goTo(total - 1); break;
        case 'g': case 'G': e.preventDefault(); toggleGrid(); break;
        case 'f': case 'F': e.preventDefault(); toggleFullscreen(); break;
        case 'Escape': e.preventDefault();
          if (helpOverlay.classList.contains('visible')) toggleHelp();
          else if (gridOverlay.classList.contains('visible')) toggleGrid();
          else if (isFullscreen) toggleFullscreen();
          break;
        case '?': e.preventDefault(); toggleHelp(); break;
      }
    });

    var touchStartX = 0;
    document.addEventListener('touchstart', function(e) { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
    document.addEventListener('touchend', function(e) {
      var diff = touchStartX - e.changedTouches[0].screenX;
      if (gridOverlay.classList.contains('visible') || helpOverlay.classList.contains('visible')) return;
      if (diff > 50) next();
      else if (diff < -50) prev();
    }, { passive: true });

    // Click anywhere to advance (except on controls)
    document.addEventListener('click', function(e) {
      if (e.target.closest('.controls-overlay') || e.target.closest('.grid-overlay') || e.target.closest('.help-overlay')) return;
      next();
    });

    init();
  </script>
</body>
</html>`;
}

/**
 * Main export function
 */
export async function exportDeckToHTML(
  slides: SlideData[],
  deckName: string,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  if (!slides || slides.length === 0) {
    throw new Error('No slides to export');
  }

  const { overlay, updateProgress } = createOverlay(slides.length);

  try {
    // Fetch the NextSlide logo and convert to base64
    const progressEl = overlay.querySelector('#html-progress') as HTMLElement;
    if (progressEl) progressEl.textContent = 'Loading logo...';

    let logoBase64 = '';
    try {
      const logoResponse = await fetch('/brand/nextslide-x.png');
      if (logoResponse.ok) {
        const logoBlob = await logoResponse.blob();
        logoBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => resolve('');
          reader.readAsDataURL(logoBlob);
        });
      }
    } catch (e) {
      console.warn('[HTML Export] Failed to load logo', e);
    }

    const slideContents: string[] = [];

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      onProgress?.(i + 1, slides.length);
      updateProgress(i + 1);

      console.log(`[HTML Export] Processing slide ${i + 1}/${slides.length}`, slide);

      const html = await extractSlideHtml(slide, (msg) => {
        if (progressEl) progressEl.textContent = `Slide ${i + 1}: ${msg}`;
      });

      if (html) {
        console.log(`[HTML Export] Extracted HTML for slide ${i + 1}, length: ${html.length}`);
        slideContents.push(html);
      } else {
        console.log(`[HTML Export] Using fallback for slide ${i + 1}`);
        slideContents.push(createFallbackSlide(i, slide.title));
      }

      await new Promise(r => setTimeout(r, 50));
    }

    // Update overlay
    if (progressEl) progressEl.textContent = 'Building file...';

    const htmlContent = buildHtmlDocument(
      deckName,
      slideContents,
      DEFAULT_SLIDE_WIDTH,
      DEFAULT_SLIDE_HEIGHT,
      logoBase64
    );

    // Download
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const sanitizedName = deckName.replace(/[^a-zA-Z0-9-_\s]/g, '').trim() || 'presentation';
    link.download = `${sanitizedName}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log('[HTML Export] Done');

  } finally {
    document.body.removeChild(overlay);
  }
}
