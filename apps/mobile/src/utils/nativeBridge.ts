/**
 * Enhanced WebView ↔ Native bridge.
 * The web app posts messages via ReactNativeWebView.postMessage();
 * this file defines the message types and the injected JS that sets up the bridge.
 */

/** All bridge message types the native side understands */
export type BridgeMessage =
  | { type: "clipboard-write"; text: string }
  | { type: "haptic"; style: string }
  | { type: "share"; data: { url?: string; title?: string; text?: string } }
  | { type: "navigate"; route: string }
  | { type: "open-url"; url: string }
  | { type: "notification"; title: string; body: string }
  | { type: "notification-permission"; action: "request" }
  | { type: "analytics"; event: string; properties?: Record<string, unknown> };

/**
 * Preload JS injected BEFORE page content loads.
 * Forces dark mode immediately to prevent white flash.
 */
export const INJECTED_PRELOAD_JS = `
(function() {
  // Force dark mode before any rendering
  document.documentElement.classList.add('dark');
  document.documentElement.classList.remove('light');
  document.documentElement.style.colorScheme = 'dark';
  document.documentElement.style.backgroundColor = '#000';

  // Set localStorage dark mode preference so the web app reads it
  try { localStorage.setItem('theme', 'dark'); } catch(e) {}
})();
true;
`;

/**
 * JavaScript injected into the WebView to bridge web APIs to native.
 * This overrides navigator.clipboard.writeText and navigator.share,
 * and adds a window.__nsBridge helper the web app can call.
 */
export const INJECTED_BRIDGE_JS = `
(function() {
  if (window.__nsBridgeInstalled) return;
  window.__nsBridgeInstalled = true;

  function post(msg) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    } catch(e) {}
  }

  // Clipboard bridge
  navigator.clipboard.writeText = function(text) {
    return new Promise(function(resolve) {
      post({ type: 'clipboard-write', text: text });
      resolve();
    });
  };

  // Share bridge
  var origShare = navigator.share;
  navigator.share = function(data) {
    post({ type: 'share', data: data });
    return Promise.resolve();
  };

  // Global bridge object for the web app
  window.__nsBridge = {
    haptic: function(style) { post({ type: 'haptic', style: style || 'light' }); },
    navigate: function(route) { post({ type: 'navigate', route: route }); },
    openUrl: function(url) { post({ type: 'open-url', url: url }); },
    notify: function(title, body) { post({ type: 'notification', title: title, body: body }); },
    requestNotifications: function() { post({ type: 'notification-permission', action: 'request' }); },
    analytics: function(event, props) { post({ type: 'analytics', event: event, properties: props }); },
  };

  // Force dark mode and native app styling
  var style = document.createElement('style');
  style.id = 'ns-native-app-css';
  style.textContent = [
    // Force dark color scheme
    'html { color-scheme: dark !important; }',
    'html.light { color-scheme: dark !important; }',
    ':root { --background: 0 0% 0% !important; }',

    // Hide web navigation (hamburger menu, nav bar) — the native shell handles nav
    'nav.fixed.top-0.w-full.z-50 { display: none !important; }',

    // Fix bottom overscroll and prevent horizontal scroll
    'body { background: #000 !important; overscroll-behavior: none; -webkit-overflow-scrolling: touch; overflow-x: hidden !important; }',
    'html { background: #000 !important; overscroll-behavior: none; overflow-x: hidden !important; }',
    'html:not(.dark) body { background: #000 !important; color: #fff !important; }',

    // Hide scrollbar for cleaner native feel
    '::-webkit-scrollbar { display: none; }',
    'body { -ms-overflow-style: none; scrollbar-width: none; }',

    // Disable text selection on UI elements for native feel
    'button, a, nav, header, [role="button"] { -webkit-user-select: none; user-select: none; }',

    // Allow text selection in inputs and content areas
    'input, textarea, [contenteditable], p, span, h1, h2, h3, h4, h5, h6 { -webkit-user-select: auto; user-select: auto; }',

    // Prevent iOS auto-zoom on input focus (requires font-size >= 16px)
    'input, textarea, select { font-size: 16px !important; }',

    // Smooth transitions for page navigations
    'main, [data-page], .page-transition { transition: opacity 0.15s ease; }',

    // Better touch targets — minimum 44px hit areas
    'button, a, [role="button"] { min-height: 44px; }',

    // Remove hover effects that look odd on touch
    '@media (hover: none) { button:hover, a:hover { opacity: 1 !important; } }',

    // Safe area padding for notch/home indicator
    'body { padding-bottom: env(safe-area-inset-bottom); }',

    // Prevent rubber-band overscroll showing white
    'html, body { overscroll-behavior-y: none; }',

    // Hide footer on mobile native (the native app has its own nav)
    'footer { display: none !important; }',
  ].join('\\n');
  document.head.appendChild(style);

  // Force dark mode class on html element
  document.documentElement.classList.add('dark');
  document.documentElement.classList.remove('light');

  // Watch for class changes and re-enforce dark mode
  var observer = new MutationObserver(function() {
    if (!document.documentElement.classList.contains('dark')) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
})();
true;
`;
