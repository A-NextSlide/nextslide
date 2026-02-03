import {
  app,
  BrowserWindow,
  shell,
  ipcMain,
  clipboard,
  session,
  Menu,
  Notification,
} from "electron";
import path from "path";
import { showSplash, closeSplash } from "./splash";
import { buildAppMenu } from "./menu";
import { registerShortcuts, unregisterShortcuts } from "./shortcuts";
import { initAutoUpdater } from "./updater";
import { initDeepLinks, getInitialDeepLink } from "./deeplinks";
import { initTray, destroyTray } from "./tray";
import { initTouchBar } from "./touchbar";

type WindowBounds = { x: number; y: number; width: number; height: number };

// electron-store v10 is ESM-only; dynamic import needed in CJS context
let store: {
  get(key: string): WindowBounds | undefined;
  set(key: string, value: WindowBounds): void;
};

async function initStore() {
  const mod = await import("electron-store");
  const Store = (mod as any).default ?? mod;
  store = new Store({ name: "nextslide-desktop" });
}

const APP_URL = process.env.NEXTSLIDE_URL || "https://nextslide.ai";
const UA_SUFFIX = " NextSlideDesktop/1.0";

const ALLOWED_DOMAINS = [
  "nextslide.ai",
  "challenges.cloudflare.com",
  "google.com",
  "supabase.co",
  "github.com",
  "appleid.apple.com",
];

// Extract the APP_URL hostname so local dev URLs are always allowed
const APP_HOSTNAME = (() => {
  try { return new URL(APP_URL).hostname; } catch { return ""; }
})();

function isAllowedUrl(url: string): boolean {
  if (url.startsWith("about:") || url.startsWith("data:") || url.startsWith("blob:")) {
    return true;
  }
  try {
    const { hostname } = new URL(url);
    if (hostname === APP_HOSTNAME) return true;
    return ALLOWED_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

// Inject CSS: thin draggable titlebar + native app overrides
const TITLEBAR_CSS = `
  /* Thin draggable strip — just enough for macOS traffic lights */
  body::before {
    content: '';
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 20px;
    -webkit-app-region: drag;
    z-index: 99999;
    pointer-events: auto;
  }
  /* All interactive elements remain clickable through the drag region */
  a, button, input, select, textarea, [role="button"], [tabindex] {
    -webkit-app-region: no-drag;
  }
  /* Hide web navigation — the native window frame handles chrome */
  nav.fixed.top-0.w-full.z-50 { display: none !important; }
  /* Hide footer in desktop app */
  footer { display: none !important; }
  /* Prevent overscroll bounce */
  body { overscroll-behavior: none; }
  /* Thin scrollbar for native feel */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }
`;

function createWindow(): BrowserWindow {
  const savedBounds = store.get("windowBounds");

  const win = new BrowserWindow({
    title: "NextSlide",
    icon: path.join(__dirname, "..", "assets", "nextslide-x.png"),
    width: savedBounds?.width ?? 1280,
    height: savedBounds?.height ?? 800,
    x: savedBounds?.x,
    y: savedBounds?.y,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hidden",
    ...(process.platform === "darwin"
      ? { trafficLightPosition: { x: 12, y: 4 } }
      : {
          titleBarOverlay: {
            color: "#0a0a0a",
            symbolColor: "#999999",
            height: 28,
          },
        }),
    backgroundColor: "#000000",
    show: false, // Don't show until ready (splash is covering)
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Set UA with app identifier BEFORE any requests fire (Cloudflare WAF skip rule)
  const ua = session.defaultSession.getUserAgent() + UA_SUFFIX;
  win.webContents.setUserAgent(ua);

  // Save window bounds on move/resize
  const saveBounds = () => {
    if (!win.isMinimized() && !win.isMaximized()) {
      store.set("windowBounds", win.getBounds());
    }
  };
  win.on("resize", saveBounds);
  win.on("move", saveBounds);

  // Inject CSS and enforce dark mode after every page load (including navigations)
  win.webContents.on("did-finish-load", () => {
    win.webContents.insertCSS(TITLEBAR_CSS);
    win.webContents.executeJavaScript(`
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.documentElement.style.colorScheme = 'dark';
      try { localStorage.setItem('theme', 'dark'); } catch(e) {}
    `);
  });

  // Keep window title as "NextSlide" regardless of <title> tag changes
  win.on("page-title-updated", (e) => e.preventDefault());

  // Show window after first load + web fonts ready (prevents font flash).
  // Falls back to showing after 4s if fonts take too long.
  let windowShown = false;
  const showMainWindow = () => {
    if (windowShown) return;
    windowShown = true;
    win.show();
    closeSplash();
  };
  win.webContents.once("did-finish-load", async () => {
    try {
      await Promise.race([
        win.webContents.executeJavaScript(
          `document.fonts.ready.then(() => true)`,
          true
        ),
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ]);
    } catch {}
    showMainWindow();
  });
  // Safety fallback
  setTimeout(() => showMainWindow(), 6000);

  // Navigation filtering
  win.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedUrl(url)) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Track maximize state and notify renderer
  win.on("maximize", () => win.webContents.send("window:maximizeChanged", true));
  win.on("unmaximize", () => win.webContents.send("window:maximizeChanged", false));

  // Initialize Touch Bar (macOS)
  initTouchBar(win);

  // Handle initial deep link
  const initialDeepLink = getInitialDeepLink();
  if (initialDeepLink) {
    win.webContents.once("did-finish-load", () => {
      win.webContents.executeJavaScript(
        `window.location.href = ${JSON.stringify(initialDeepLink)}`
      );
    });
  }

  win.loadURL(APP_URL);

  return win;
}

// ============================================================
// IPC handlers
// ============================================================

// Clipboard
ipcMain.handle("clipboard:writeText", (_event, text: string) => {
  clipboard.writeText(text);
});
ipcMain.handle("clipboard:readText", () => clipboard.readText());

// Window management
ipcMain.handle("window:minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});
ipcMain.handle("window:maximize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win?.isMaximized()) {
    win.unmaximize();
  } else {
    win?.maximize();
  }
});
ipcMain.handle("window:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});
ipcMain.handle("window:isMaximized", (event) => {
  return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
});
ipcMain.handle("window:isFullScreen", (event) => {
  return BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false;
});
ipcMain.handle("window:setFullScreen", (event, flag: boolean) => {
  BrowserWindow.fromWebContents(event.sender)?.setFullScreen(flag);
});

// App info
ipcMain.handle("app:getInfo", () => ({
  version: app.getVersion(),
  name: app.getName(),
  platform: process.platform,
}));
ipcMain.handle("app:getVersion", () => app.getVersion());

// Navigation
ipcMain.handle("navigate:to", (event, path: string) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.webContents.executeJavaScript(
      `window.location.href = ${JSON.stringify(APP_URL + path)}`
    );
  }
});
ipcMain.handle("navigate:back", (event) => {
  event.sender.goBack();
});
ipcMain.handle("navigate:forward", (event) => {
  event.sender.goForward();
});
ipcMain.handle("navigate:reload", (event) => {
  event.sender.reload();
});

// Notifications
ipcMain.handle("notifications:show", (_event, title: string, body: string) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});

// External URLs
ipcMain.handle("external:openUrl", (_event, url: string) => {
  shell.openExternal(url);
});

// ============================================================
// App lifecycle
// ============================================================

// Set app name (dock, task switcher, Activity Monitor)
app.name = "NextSlide";

// Suppress noisy Chromium GPU tile warnings (tile_manager.cc).
// The deck list renders many full Slide DOM trees as thumbnails which exceeds
// Chromium's tile budget. The warnings are cosmetic — content still draws.
app.commandLine.appendSwitch("log-level", "3"); // Only FATAL

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  // Initialize deep links early (before app.whenReady)
  initDeepLinks();

  app.whenReady().then(async () => {
    await initStore();

    // Show splash screen
    showSplash();

    // Set application menu
    Menu.setApplicationMenu(buildAppMenu());

    // Remove X-Frame-Options / CSP that might block loading
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "content-security-policy": undefined as any,
          "x-frame-options": undefined as any,
        },
      });
    });

    // Create main window
    createWindow();

    // Initialize system tray
    initTray();

    // Register global shortcuts
    registerShortcuts();

    // Initialize auto-updater
    initAutoUpdater();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("will-quit", () => {
    unregisterShortcuts();
    destroyTray();
  });
}
