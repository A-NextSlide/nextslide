import { app, BrowserWindow } from "electron";

const PROTOCOL = "nextslide";
const APP_URL = process.env.NEXTSLIDE_URL || "https://nextslide.ai";

/**
 * Register the app as the handler for nextslide:// URLs.
 * Deep links map like: nextslide://decks/abc123 → https://nextslide.ai/decks/abc123
 */
export function initDeepLinks() {
  // Set as default protocol handler
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [process.argv[1]]);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }

  // Handle deep link on macOS (app already running)
  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  // Handle deep link on Windows/Linux (second instance)
  app.on("second-instance", (_event, commandLine) => {
    const url = commandLine.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (url) handleDeepLink(url);

    // Focus the existing window
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

function handleDeepLink(url: string) {
  try {
    const parsed = new URL(url);
    // Convert nextslide://decks/xyz → /decks/xyz
    const path = "/" + parsed.hostname + parsed.pathname;
    const webUrl = APP_URL + path + parsed.search + parsed.hash;

    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      win.webContents.executeJavaScript(`window.location.href = ${JSON.stringify(webUrl)}`);
      win.show();
      win.focus();

      // Notify renderer about the deep link
      win.webContents.send("deeplink:received", webUrl);
    }
  } catch {
    // Invalid URL, ignore
  }
}

/** Check if the app was launched with a deep link (Windows/Linux) */
export function getInitialDeepLink(): string | null {
  const url = process.argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const path = "/" + parsed.hostname + parsed.pathname;
    return APP_URL + path + parsed.search + parsed.hash;
  } catch {
    return null;
  }
}
