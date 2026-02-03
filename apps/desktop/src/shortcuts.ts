import { globalShortcut, BrowserWindow } from "electron";

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows();
  return windows.find((w) => !w.isDestroyed()) ?? null;
}

function navigateMainWindow(path: string) {
  const win = getMainWindow();
  if (win) {
    win.webContents.executeJavaScript(`window.location.href = "https://nextslide.ai${path}"`);
    win.show();
    win.focus();
  }
}

export function registerShortcuts() {
  // Quick create - global shortcut to open a new presentation
  globalShortcut.register("CmdOrCtrl+Shift+N", () => {
    navigateMainWindow("/create");
  });
}

export function unregisterShortcuts() {
  globalShortcut.unregisterAll();
}
