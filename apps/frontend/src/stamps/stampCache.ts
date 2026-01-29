import { SlideData } from '@/types/SlideTypes';

// --- Types ---

interface StampEntry {
  dataUrl: string;
  contentHash: string;
  timestamp: number;
}

type Listener = () => void;

// --- Constants ---

const EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// --- State ---

const cache = new Map<string, StampEntry>();
const listeners = new Set<Listener>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
let snapshotVersion = 0;

// --- Notification ---

function notify() {
  snapshotVersion++;
  for (const listener of listeners) {
    listener();
  }
}

// --- Content Hashing ---

/**
 * Generate a content hash from slide data.
 * Captures component types, positions, key props, images, text, and background.
 */
export function generateContentHash(slide: SlideData): string {
  if (!slide?.components?.length) return `empty-${slide?.id || 'none'}`;

  const parts: string[] = [];
  for (const comp of slide.components) {
    const p = comp.props || {};
    parts.push(comp.type);
    parts.push(comp.id || '');
    if (p.x != null) parts.push(`x${p.x}`);
    if (p.y != null) parts.push(`y${p.y}`);
    if (p.width != null) parts.push(`w${p.width}`);
    if (p.height != null) parts.push(`h${p.height}`);
    if (p.rotation != null) parts.push(`r${p.rotation}`);
    if (p.src) parts.push(p.src);
    if (p.text) parts.push(typeof p.text === 'string' ? p.text.slice(0, 200) : JSON.stringify(p.text).slice(0, 200));
    if (p.content) parts.push(typeof p.content === 'string' ? p.content.slice(0, 200) : '');
    if (p.backgroundColor) parts.push(p.backgroundColor);
    if (p.color) parts.push(p.color);
    if (p.gradient) parts.push(typeof p.gradient === 'string' ? p.gradient : JSON.stringify(p.gradient));
    if (p.fontSize) parts.push(`fs${p.fontSize}`);
    if (p.fontFamily) parts.push(p.fontFamily);
    if (p.opacity != null) parts.push(`o${p.opacity}`);
    if (p.srcDoc) parts.push(p.srcDoc.slice(0, 300));
    if (p.htmlContent) parts.push(p.htmlContent.slice(0, 300));
  }

  // djb2 hash
  const str = parts.join('|');
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return `h${(hash >>> 0).toString(36)}`;
}

// --- Cache API ---

export function getStamp(slideId: string, currentHash: string): string | null {
  const entry = cache.get(slideId);
  if (!entry) return null;
  if (entry.contentHash !== currentHash) return null;
  if (Date.now() - entry.timestamp > EXPIRY_MS) {
    cache.delete(slideId);
    return null;
  }
  return entry.dataUrl;
}

export function setStamp(slideId: string, dataUrl: string, hash: string): void {
  cache.set(slideId, { dataUrl, contentHash: hash, timestamp: Date.now() });
  notify();
}

export function invalidateStamp(slideId: string): void {
  if (cache.has(slideId)) {
    cache.delete(slideId);
    notify();
  }
}

export function clearAllStamps(): void {
  if (cache.size > 0) {
    cache.clear();
    notify();
  }
}

// --- useSyncExternalStore integration ---

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  startCleanup();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopCleanup();
  };
}

export function getSnapshot(): number {
  return snapshotVersion;
}

// --- Cleanup ---

function cleanupExpired() {
  const now = Date.now();
  let removed = false;
  for (const [id, entry] of cache) {
    if (now - entry.timestamp > EXPIRY_MS) {
      cache.delete(id);
      removed = true;
    }
  }
  if (removed) notify();
}

function startCleanup() {
  if (!cleanupTimer) {
    cleanupTimer = setInterval(cleanupExpired, CLEANUP_INTERVAL_MS);
  }
}

function stopCleanup() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
