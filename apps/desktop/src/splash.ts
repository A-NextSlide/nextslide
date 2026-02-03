import { BrowserWindow, app } from "electron";
import path from "path";
import fs from "fs";

function buildSplashHtml(imgPath: string): string {
  // Use file:// URL for the image to avoid base64 encoding issues
  const imgUrl = `file://${imgPath.replace(/\\/g, "/")}`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }
  .logo {
    width: 52px;
    height: 80px;
    opacity: 0;
    transform: scale(0.8);
    animation: logoIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s forwards;
  }
  .logo img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .wordmark {
    margin-top: 20px;
    display: flex;
    align-items: center;
    opacity: 0;
    transform: translateY(8px);
    animation: fadeUp 0.4s ease-out 0.5s forwards;
    user-select: none;
  }
  .wordmark span {
    font-weight: 900;
    font-size: 20px;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #fff;
  }
  .wordmark .x-img {
    width: 26px;
    height: 40px;
    object-fit: contain;
    margin: 0 -2px;
    vertical-align: middle;
  }
  .bar-track {
    position: absolute;
    bottom: 60px;
    width: 200px;
    height: 2px;
    background: #1e1e1e;
    border-radius: 1px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    background: #FF4301;
    border-radius: 1px;
    width: 0%;
    animation: load 2s ease-in-out 0.3s forwards;
  }
  @keyframes logoIn {
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes fadeUp {
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes load {
    0% { width: 0%; }
    60% { width: 60%; }
    100% { width: 100%; }
  }
</style>
</head>
<body>
  <div class="logo">
    <img src="${imgUrl}" alt="NextSlide" />
  </div>
  <div class="wordmark">
    <span>NE</span><img class="x-img" src="${imgUrl}" alt="X" /><span>TSLIDE</span>
  </div>
  <div class="bar-track"><div class="bar-fill"></div></div>
</body>
</html>`;
}

let splashWindow: BrowserWindow | null = null;

export function showSplash(): BrowserWindow {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 320,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    center: true,
    show: false,
    backgroundColor: "#000000",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Write splash HTML to a temp file so images can use file:// URLs
  const imgPath = path.join(__dirname, "..", "assets", "nextslide-x.png");
  const html = buildSplashHtml(imgPath);
  const tmpPath = path.join(app.getPath("temp"), "nextslide-splash.html");
  fs.writeFileSync(tmpPath, html, "utf-8");
  splashWindow.loadFile(tmpPath);

  splashWindow.once("ready-to-show", () => splashWindow?.show());

  return splashWindow;
}

export function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    let opacity = 1;
    const fade = setInterval(() => {
      opacity -= 0.05;
      if (opacity <= 0) {
        clearInterval(fade);
        splashWindow?.destroy();
        splashWindow = null;
      } else {
        splashWindow?.setOpacity(opacity);
      }
    }, 16);
  }
}
