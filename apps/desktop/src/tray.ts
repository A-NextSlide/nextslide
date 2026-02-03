import { app, Tray, Menu, nativeImage, BrowserWindow } from "electron";
import path from "path";

let tray: Tray | null = null;

export function initTray() {
  // Use a template image for macOS (auto dark/light mode)
  const iconPath = path.join(__dirname, "..", "assets", "tray-icon.png");
  let icon: Electron.NativeImage;

  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) throw new Error("Empty icon");
    if (process.platform === "darwin") {
      icon = icon.resize({ width: 18, height: 18 });
      icon.setTemplateImage(true);
    }
  } catch {
    // Fallback: create a simple 16x16 icon from the accent color
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip("NextSlide");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open NextSlide",
      click: () => showMainWindow(),
    },
    {
      label: "New Presentation",
      click: () => {
        showMainWindow();
        navigateMainWindow("/create");
      },
    },
    {
      label: "My Decks",
      click: () => {
        showMainWindow();
        navigateMainWindow("/decks");
      },
    },
    { type: "separator" },
    {
      label: "Quit NextSlide",
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Click on tray icon to show/focus window
  tray.on("click", () => showMainWindow());
}

function showMainWindow() {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
}

function navigateMainWindow(urlPath: string) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.executeJavaScript(
      `window.location.href = "https://nextslide.ai${urlPath}"`
    );
  }
}

export function destroyTray() {
  tray?.destroy();
  tray = null;
}
