/**
 * SimpleCursors - Renders remote users' cursors via Yjs awareness
 *
 * Uses coordinate normalization for consistent cursor positioning
 * across different browsers and zoom levels.
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useYjs } from '@/yjs/YjsProvider';
import {
  getAllAwarenessSources,
  getRandomBrightColor,
  updateCursorDirectly,
  normalizeCursorCoordinates,
  denormalizeCursorCoordinates
} from '@/yjs/utils/cursorUtils';
import { useDeckStore } from '@/stores/deckStore';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';

interface SimpleCursorsProps {
  slideId: string;
  containerRef: React.RefObject<HTMLDivElement>;
  offsetY?: number;
  offsetX?: number;
  zoomLevel?: number;
}

interface RemoteCursor {
  id: string;
  color: string;
  name: string;
  position: { x: number; y: number };
}

const SimpleCursors: React.FC<SimpleCursorsProps> = ({
  slideId,
  containerRef,
  offsetY = 0,
  offsetX = 0,
  zoomLevel: _zoomLevel
}) => {
  const [cursors, setCursors] = useState<RemoteCursor[]>([]);
  const [storeUsers, setStoreUsers] = useState<any[]>([]);
  const [awarenessVersion, setAwarenessVersion] = useState(0);

  const { users: yjsUsers, docManager } = useYjs();
  const storeDocManager = useDeckStore(state => (state as any).yjsDocManager);
  const getYjsUsers = useDeckStore(state => (state as any).getYjsUsers);

  const effectiveDocManager = docManager || storeDocManager;

  // Poll store-backed users as fallback when YjsProvider context is not used.
  useEffect(() => {
    if (!getYjsUsers) return;
    const updateUsers = () => {
      try {
        const users = getYjsUsers() || [];
        if (Array.isArray(users)) {
          setStoreUsers(users);
        }
      } catch {
        // Silent
      }
    };
    updateUsers();
    const interval = setInterval(updateUsers, 200);
    return () => clearInterval(interval);
  }, [getYjsUsers]);

  // Ensure awareness is accessible globally
  useEffect(() => {
    if (effectiveDocManager?.wsProvider?.awareness && !window._awareness) {
      window._awareness = effectiveDocManager.wsProvider.awareness;
    }
    if (effectiveDocManager?.wsProvider) {
      if (!window._yProviders) {
        window._yProviders = [];
      }
      if (!window._yProviders.includes(effectiveDocManager.wsProvider)) {
        window._yProviders.push(effectiveDocManager.wsProvider);
      }
    }
  }, [effectiveDocManager]);

  const getAwarenessSources = useCallback(() => {
    const sources = getAllAwarenessSources();
    const primaryAwareness = effectiveDocManager?.wsProvider?.awareness;
    if (primaryAwareness && !sources.includes(primaryAwareness)) {
      sources.push(primaryAwareness);
    }
    return sources;
  }, [effectiveDocManager]);

  // Awareness events should drive cursor rendering for near realtime movement.
  useEffect(() => {
    const awarenessSources = getAwarenessSources();
    if (awarenessSources.length === 0) return;

    const handleAwarenessChange = () => setAwarenessVersion(v => v + 1);

    awarenessSources.forEach((awareness: any) => {
      awareness?.on?.('change', handleAwarenessChange);
      awareness?.on?.('update', handleAwarenessChange);
    });

    return () => {
      awarenessSources.forEach((awareness: any) => {
        awareness?.off?.('change', handleAwarenessChange);
        awareness?.off?.('update', handleAwarenessChange);
      });
    };
  }, [getAwarenessSources]);

  // De-duplicate users from both Yjs context and store-backed collaboration.
  const allUsers = useMemo(() => {
    const mergedUsers = [...(yjsUsers || []), ...(storeUsers || [])];
    const byId = new Map<string, any>();

    mergedUsers.forEach((user: any) => {
      const key = user?.clientId ? `client-${user.clientId}` : `id-${user?.id || 'unknown'}`;
      const currentTs = Number(user?.cursor?.t || user?.lastUpdate || 0);
      const previous = byId.get(key);
      const previousTs = Number(previous?.cursor?.t || previous?.lastUpdate || 0);

      if (!previous || currentTs >= previousTs) {
        byId.set(key, user);
      }
    });

    return Array.from(byId.values());
  }, [yjsUsers, storeUsers]);

  // Find the actual slide container element
  const findSlideContainer = useCallback((root: HTMLElement | null): HTMLElement | null => {
    if (!root) return null;
    if (root.dataset.slideId && root.dataset.slideId === slideId) return root;

    const exactMatch = root.querySelector(`.slide-container[data-slide-id="${slideId}"]`);
    if (exactMatch) return exactMatch as HTMLElement;

    const child = root.querySelector('.slide-container[data-slide-id]');
    return (child as HTMLElement) || root;
  }, [slideId]);

  // Mouse move / leave: send cursor position via Yjs awareness only
  useEffect(() => {
    if (!containerRef.current || !slideId) return;

    const slideContainer = findSlideContainer(containerRef.current);
    if (!slideContainer) return;

    let lastUpdateTime = 0;
    const THROTTLE_MS = 16; // ~60fps

    const handleMouseMove = (e: MouseEvent) => {
      const rect = slideContainer.getBoundingClientRect();
      if (!rect) return;

      const now = Date.now();
      if (now - lastUpdateTime < THROTTLE_MS) return;
      lastUpdateTime = now;

      const rawX = e.clientX - rect.left + offsetX;
      const rawY = e.clientY - rect.top + offsetY;

      if (rawX >= 0 && rawY >= 0 && rawX <= rect.width && rawY <= rect.height) {
        const normalized = normalizeCursorCoordinates(rawX, rawY, rect.width, rect.height);
        updateCursorDirectly(slideId, normalized.x, normalized.y);
      }
    };

    const handleMouseLeave = () => {
      updateCursorDirectly(slideId, -1, -1);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        updateCursorDirectly(slideId, -1, -1);
      }
    };

    slideContainer.addEventListener('mousemove', handleMouseMove);
    slideContainer.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('blur', handleMouseLeave);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      slideContainer.removeEventListener('mousemove', handleMouseMove);
      slideContainer.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('blur', handleMouseLeave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [slideId, containerRef, offsetX, offsetY, findSlideContainer]);

  // Build cursor list from awareness users
  useEffect(() => {
    if (!slideId) {
      setCursors([]);
      return;
    }

    // Reference awarenessVersion to recompute on awareness update events.
    void awarenessVersion;

    // Read directly from all awareness sources to catch users that may not be
    // reflected in context/store state yet.
    const awarenessSources = getAwarenessSources();

    const awarenessEntries: any[] = [];
    awarenessSources.forEach((awareness: any) => {
      if (!awareness?.getStates) return;
      const localClientId = awareness.clientID;
      awareness.getStates().forEach((state: any, clientId: number) => {
        if (!state?.user || !state?.cursor) return;
        awarenessEntries.push({
          id: state.user.id || `unknown-${clientId}`,
          name: state.user.name || 'Unknown User',
          color: state.user.color || getRandomBrightColor(),
          cursor: state.cursor,
          clientId,
          self: Boolean(state.self) || clientId === localClientId,
          lastUpdate: state.lastUpdate || state.cursor?.t || 0,
        });
      });
    });

    // Merge and de-duplicate by freshest cursor timestamp.
    const merged = [...allUsers, ...awarenessEntries];
    const uniqueByUser = new Map<string, any>();
    merged.forEach((user: any) => {
      const key = user?.clientId ? `client-${user.clientId}` : `id-${user?.id || 'unknown'}`;
      const currentTs = Number(user?.cursor?.t || user?.lastUpdate || 0);
      const previous = uniqueByUser.get(key);
      const previousTs = Number(previous?.cursor?.t || previous?.lastUpdate || 0);
      if (!previous || currentTs >= previousTs) {
        uniqueByUser.set(key, user);
      }
    });

    const realCursors = Array.from(uniqueByUser.values())
      .filter(user =>
        user.cursor &&
        typeof user.cursor.x === 'number' &&
        typeof user.cursor.y === 'number' &&
        user.cursor.slideId === slideId &&
        user.cursor.x >= 0 &&
        user.cursor.y >= 0 &&
        !user.self // Don't show own cursor
      )
      .map(user => ({
        id: user.clientId ? `cursor-${user.clientId}` : `cursor-${user.id}`,
        color: user.color || getRandomBrightColor(),
        name: user.name || 'User',
        position: {
          x: Number(user.cursor.x) || 0,
          y: Number(user.cursor.y) || 0,
        },
      }));

    setCursors(realCursors);
  }, [allUsers, slideId, getAwarenessSources, awarenessVersion]);

  if (!containerRef.current) return null;

  const slideContainer = findSlideContainer(containerRef.current);
  if (!slideContainer) return null;

  const slideWidth = parseInt(slideContainer.dataset.slideWidth || '', 10) || DEFAULT_SLIDE_WIDTH;
  const slideHeight = parseInt(slideContainer.dataset.slideHeight || '', 10) || DEFAULT_SLIDE_HEIGHT;
  const containerRect = slideContainer.getBoundingClientRect();
  const scaleX = slideWidth > 0 ? containerRect.width / slideWidth : 1;
  const scaleY = slideHeight > 0 ? containerRect.height / slideHeight : 1;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-visible"
      aria-hidden="true"
      style={{ zIndex: 9999, position: 'absolute', inset: 0, pointerEvents: 'none' }}
      data-testid="simple-cursors-container"
      data-slide-id={slideId}
    >
      {cursors.map(cursor => {
        const { x: baseX, y: baseY } = denormalizeCursorCoordinates(
          cursor.position.x,
          cursor.position.y,
          slideWidth,
          slideHeight,
          100
        );
        const adjustedX = baseX * scaleX;
        const adjustedY = baseY * scaleY;

        return (
          <div
            key={cursor.id}
            className="absolute"
            style={{
              transform: `translate(${adjustedX}px, ${adjustedY + offsetY}px)`,
              zIndex: 10000,
              position: 'absolute',
              transition: 'transform 0.05s ease-out',
              willChange: 'transform'
            }}
            data-testid={`remote-cursor-${cursor.id}`}
          >
            <svg
              width="22"
              height="32"
              viewBox="0 0 16 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{
                color: cursor.color,
                filter: 'drop-shadow(0px 1px 2px rgba(0, 0, 0, 0.2))'
              }}
            >
              <path
                d="M 0.75 0.5 L 0.75 15.5 C 4 11 5 10 11 10 L 0.75 0.5 Z"
                fill={cursor.color}
                stroke="#333333"
                strokeWidth="1"
              />
            </svg>

            <div
              className="ml-1 rounded-md px-2 py-0.5 text-xs font-medium text-white"
              style={{
                backgroundColor: cursor.color,
                position: 'absolute',
                left: '22px',
                top: '0px',
                opacity: 0.9,
                boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                maxWidth: '100px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {cursor.name}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SimpleCursors;
