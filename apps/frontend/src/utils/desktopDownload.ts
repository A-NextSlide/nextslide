// Desktop app download helpers
// Uses browser.ts patterns for platform detection

const APP_VERSION = import.meta.env.VITE_DESKTOP_APP_VERSION || '1.0.0';
const GITHUB_BASE = 'https://github.com/A-NextSlide/nextslide/releases/latest/download';

export type DesktopPlatform = 'mac' | 'windows' | 'linux';

export interface PlatformDownload {
  platform: DesktopPlatform;
  label: string;
  fileType: string;
  fileName: string;
  url: string;
  size: string;
  systemReq: string;
}

export function detectDesktopPlatform(): DesktopPlatform {
  if (typeof navigator === 'undefined') return 'mac';
  const ua = navigator.userAgent;
  if (/Win/i.test(ua)) return 'windows';
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return 'linux';
  return 'mac';
}

export function getDownloadUrl(platform: DesktopPlatform): string {
  const files: Record<DesktopPlatform, string> = {
    mac: `NextSlide-${APP_VERSION}-arm64.dmg`,
    windows: `NextSlide-Setup-${APP_VERSION}.exe`,
    linux: `NextSlide-${APP_VERSION}.AppImage`,
  };
  return `${GITHUB_BASE}/${files[platform]}`;
}

export function getAllDownloads(): PlatformDownload[] {
  return [
    {
      platform: 'mac',
      label: 'macOS',
      fileType: '.dmg',
      fileName: `NextSlide-${APP_VERSION}-arm64.dmg`,
      url: getDownloadUrl('mac'),
      size: '~94 MB',
      systemReq: 'macOS 12 Monterey or later',
    },
    {
      platform: 'windows',
      label: 'Windows',
      fileType: '.exe',
      fileName: `NextSlide-Setup-${APP_VERSION}.exe`,
      url: getDownloadUrl('windows'),
      size: '~85 MB',
      systemReq: 'Windows 10 (64-bit) or later',
    },
    {
      platform: 'linux',
      label: 'Linux',
      fileType: '.AppImage',
      fileName: `NextSlide-${APP_VERSION}.AppImage`,
      url: getDownloadUrl('linux'),
      size: '~90 MB',
      systemReq: 'Ubuntu 20.04+ / Fedora 36+ / Debian 11+',
    },
  ];
}

export function getPlatformLabel(platform: DesktopPlatform): string {
  const labels: Record<DesktopPlatform, string> = {
    mac: 'macOS',
    windows: 'Windows',
    linux: 'Linux',
  };
  return labels[platform];
}
