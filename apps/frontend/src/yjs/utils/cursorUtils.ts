/**
 * Utility functions for working with collaborative cursors
 */
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';

// Global window type extensions for cursor utilities
declare global {
  interface Window {
    _yProviders?: any[];
    _awareness?: any;
    _yjsDocManager?: any;
    _getAllAwarenessSources?: () => any[];
    _updateCursorDirectly?: (slideId: string, x: number, y: number) => void;
    _shouldBroadcastCursor?: (slideId: string) => boolean;
    _registerYjsDocManager?: (manager: any) => void;
    _forceCursorUpdate?: (slideId: string, x: number, y: number) => string;
    _forceCursorReactivation?: () => boolean;
    _updateSelectionDirectly?: (slideId: string, componentIds: string[]) => void;
    _lastCursorActivity?: number;
    _debugCursor?: () => any;
    _inspectCursors?: () => any;
    _testCursorCoordinates?: (...args: any[]) => any;
    _normalizeCursorCoordinates?: (...args: any[]) => any;
    _denormalizeCursorCoordinates?: (...args: any[]) => any;
    _createDebugAwareness?: () => any;
  }
}

/**
 * Normalize cursor coordinates from screen space to slide space (1920x1080)
 */
export function normalizeCursorCoordinates(
  x: number,
  y: number,
  containerWidth: number,
  containerHeight: number,
  _zoomLevel: number = 100
): { x: number; y: number } {
  const slideX = (x / containerWidth) * DEFAULT_SLIDE_WIDTH;
  const slideY = (y / containerHeight) * DEFAULT_SLIDE_HEIGHT;

  return {
    x: Math.round(slideX),
    y: Math.round(slideY)
  };
}

/**
 * Denormalize cursor coordinates from slide space (1920x1080) to screen space
 */
export function denormalizeCursorCoordinates(
  normalizedX: number,
  normalizedY: number,
  containerWidth: number,
  containerHeight: number,
  zoomLevel: number = 100
): { x: number; y: number } {
  const clampedX = Math.max(0, Math.min(DEFAULT_SLIDE_WIDTH, normalizedX));
  const clampedY = Math.max(0, Math.min(DEFAULT_SLIDE_HEIGHT, normalizedY));

  const containerX = (clampedX / DEFAULT_SLIDE_WIDTH) * containerWidth;
  const containerY = (clampedY / DEFAULT_SLIDE_HEIGHT) * containerHeight;

  const zoomFactor = zoomLevel / 100;
  return {
    x: Math.round(containerX * zoomFactor),
    y: Math.round(containerY * zoomFactor)
  };
}

/**
 * Generate a random bright color
 */
export function getRandomBrightColor(seed?: string): string {
  if (seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 100%, 50%)`;
  }

  const brightColors = [
    '#FF5733', '#33FF57', '#3357FF', '#FF33F5',
    '#33FFF5', '#F5FF33', '#FF5733', '#33FF96',
    '#9633FF', '#FF9633', '#33FFFF', '#FF33FF'
  ];
  return brightColors[Math.floor(Math.random() * brightColors.length)];
}

/**
 * Get all awareness sources from registered providers
 */
export function getAllAwarenessSources(): any[] {
  const sources: any[] = [];
  const seen = new Set();

  const addSource = (awareness: any) => {
    if (awareness && !seen.has(awareness)) {
      seen.add(awareness);
      sources.push(awareness);
    }
  };

  // From global provider list
  if (window._yProviders) {
    window._yProviders.forEach(provider => {
      if (provider?.awareness) addSource(provider.awareness);
    });
  }

  // Direct awareness reference
  if (window._awareness) addSource(window._awareness);

  // From registered doc manager
  if (window._yjsDocManager?.wsProvider?.awareness) {
    addSource(window._yjsDocManager.wsProvider.awareness);
  }

  return sources;
}

/**
 * Check if we should broadcast cursor movements for a specific slide.
 * Only broadcast if there are 2+ users on the same slide.
 */
export function shouldBroadcastCursor(slideId: string): boolean {
  try {
    const sources = getAllAwarenessSources();
    if (sources.length === 0) return false;

    let usersOnSlide = 0;
    for (const awareness of sources) {
      if (!awareness?.getStates) continue;
      awareness.getStates().forEach((_state: any) => {
        if (!_state?.cursor) return;
        if (_state.cursor.slideId === slideId || !_state.cursor.slideId) {
          usersOnSlide++;
        }
      });
    }
    return usersOnSlide >= 2;
  } catch {
    return true;
  }
}

/**
 * Update cursor position in all available awareness sources
 */
export function updateCursorDirectly(slideId: string, x: number, y: number): void {
  try {
    const sources = getAllAwarenessSources();
    if (sources.length === 0) return;

    const safeSlideId = slideId || '';
    const intX = Math.round(x);
    const intY = Math.round(y);

    sources.forEach(awareness => {
      if (!awareness) return;
      try {
        // Ensure user info exists
        const currentState = awareness.getLocalState() || {};
        if (!currentState.user) {
          awareness.setLocalStateField('user', {
            id: `user-${Math.floor(Math.random() * 1000000)}`,
            name: 'Anonymous',
            color: getRandomBrightColor(),
          });
        }

        awareness.setLocalStateField('cursor', {
          slideId: safeSlideId,
          x: intX,
          y: intY,
          t: Date.now()
        });
        awareness.setLocalStateField('lastUpdate', Date.now());
      } catch {
        // Silent
      }
    });
  } catch {
    // Silent
  }
}

/**
 * Update selection in all available awareness sources
 */
export function updateSelectionDirectly(slideId: string, componentIds: string[]): void {
  try {
    const sources = getAllAwarenessSources();
    if (sources.length === 0) return;

    const safeSlideId = slideId || '';
    const safeComponentIds = Array.isArray(componentIds)
      ? componentIds.filter(id => typeof id === 'string')
      : [];

    sources.forEach(awareness => {
      if (!awareness) return;
      try {
        const currentState = awareness.getLocalState() || {};
        if (!currentState.user) {
          awareness.setLocalStateField('user', {
            id: `user-${Math.floor(Math.random() * 1000000)}`,
            name: 'Anonymous',
            color: getRandomBrightColor(),
          });
        }

        awareness.setLocalStateField('selection', {
          slideId: safeSlideId,
          componentIds: safeComponentIds,
          t: Date.now(),
        });
        awareness.setLocalStateField('lastUpdate', Date.now());
      } catch {
        // Silent
      }
    });
  } catch {
    // Silent
  }
}

/**
 * Initialize global cursor utility functions
 */
export function initializeGlobalCursorUtils() {
  if (!window._getAllAwarenessSources) {
    window._getAllAwarenessSources = getAllAwarenessSources;
  }
  if (!window._updateCursorDirectly) {
    window._updateCursorDirectly = updateCursorDirectly;
  }
  if (!window._updateSelectionDirectly) {
    window._updateSelectionDirectly = updateSelectionDirectly;
  }
  if (!window._shouldBroadcastCursor) {
    window._shouldBroadcastCursor = shouldBroadcastCursor;
  }
  if (!window._normalizeCursorCoordinates) {
    window._normalizeCursorCoordinates = normalizeCursorCoordinates;
  }
  if (!window._denormalizeCursorCoordinates) {
    window._denormalizeCursorCoordinates = denormalizeCursorCoordinates;
  }

  // Register doc managers via a simple global function
  if (!window._registerYjsDocManager) {
    window._registerYjsDocManager = (docManager: any) => {
      window._yjsDocManager = docManager;
      if (docManager?.wsProvider?.awareness) {
        if (!window._awareness) {
          window._awareness = docManager.wsProvider.awareness;
        }
        if (!window._yProviders?.includes(docManager.wsProvider)) {
          window._yProviders = window._yProviders || [];
          window._yProviders.push(docManager.wsProvider);
        }
      }
    };
  }

  // Force cursor update helper
  window._forceCursorUpdate = (slideId: string, x: number, y: number) => {
    updateCursorDirectly(slideId, x, y);
    return "Cursor update forced";
  };
}
