import { app, Menu, shell, BrowserWindow, MenuItemConstructorOptions } from "electron";

const isMac = process.platform === "darwin";

export function buildAppMenu(): Menu {
  const template: MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { label: "Check for Updates...", click: () => getMainWindow()?.webContents.send("menu:checkUpdates") },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),

    // File
    {
      label: "File",
      submenu: [
        {
          label: "New Presentation",
          accelerator: "CmdOrCtrl+N",
          click: () => navigateMainWindow("/create"),
        },
        {
          label: "My Decks",
          accelerator: "CmdOrCtrl+D",
          click: () => navigateMainWindow("/decks"),
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },

    // Edit
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },

    // View
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(process.env.NODE_ENV === "development"
          ? [{ type: "separator" as const }, { role: "toggleDevTools" as const }]
          : []),
      ],
    },

    // Go
    {
      label: "Go",
      submenu: [
        {
          label: "Home",
          accelerator: "CmdOrCtrl+Shift+H",
          click: () => navigateMainWindow("/"),
        },
        {
          label: "My Decks",
          accelerator: "CmdOrCtrl+Shift+D",
          click: () => navigateMainWindow("/decks"),
        },
        {
          label: "Profile",
          accelerator: "CmdOrCtrl+Shift+P",
          click: () => navigateMainWindow("/profile"),
        },
        { type: "separator" },
        {
          label: "Back",
          accelerator: "CmdOrCtrl+[",
          click: () => getMainWindow()?.webContents.goBack(),
        },
        {
          label: "Forward",
          accelerator: "CmdOrCtrl+]",
          click: () => getMainWindow()?.webContents.goForward(),
        },
      ],
    },

    // Window
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [{ type: "separator" as const }, { role: "front" as const }]
          : [{ role: "close" as const }]),
      ],
    },

    // Help
    {
      label: "Help",
      submenu: [
        {
          label: "NextSlide Help",
          click: () => shell.openExternal("https://nextslide.ai/help"),
        },
        {
          label: "Report a Problem",
          click: () => shell.openExternal("https://nextslide.ai/feedback"),
        },
        { type: "separator" },
        {
          label: "Website",
          click: () => shell.openExternal("https://nextslide.ai"),
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows();
  return windows.find((w) => !w.isDestroyed()) ?? null;
}

function navigateMainWindow(path: string) {
  const win = getMainWindow();
  if (win) {
    win.webContents.executeJavaScript(`window.location.href = "https://nextslide.ai${path}"`);
    win.focus();
  }
}
