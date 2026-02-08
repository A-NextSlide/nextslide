/**
 * RemoteSelections - Renders colored bounding boxes for remote users' component selections
 *
 * Uses Yjs awareness to detect which components remote users have selected,
 * then draws a non-interactive bounding box in that user's color with a name label.
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useYjs } from '@/yjs/YjsProvider';
import { getAllAwarenessSources } from '@/yjs/utils/cursorUtils';
import { useDeckStore } from '@/stores/deckStore';
import { ComponentInstance } from '@/types/components';

interface RemoteSelectionsProps {
  slideId: string;
  components: ComponentInstance[];
  slideSize: { width: number; height: number };
}

interface RemoteSelection {
  userId: string;
  userName: string;
  color: string;
  componentIds: string[];
}

const STALE_THRESHOLD_MS = 30_000;

const RemoteSelections: React.FC<RemoteSelectionsProps> = ({
  slideId,
  components,
  slideSize,
}) => {
  const { docManager } = useYjs();
  const storeDocManager = useDeckStore(state => (state as any).yjsDocManager);
  const getYjsUsers = useDeckStore(state => (state as any).getYjsUsers);
  const effectiveDocManager = docManager || storeDocManager;

  const [awarenessVersion, setAwarenessVersion] = useState(0);
  const [storeUsers, setStoreUsers] = useState<any[]>([]);

  const getAwarenessSources = useCallback(() => {
    const sources = getAllAwarenessSources();
    const primaryAwareness = effectiveDocManager?.wsProvider?.awareness;
    if (primaryAwareness && !sources.includes(primaryAwareness)) {
      sources.push(primaryAwareness);
    }
    return sources;
  }, [effectiveDocManager]);

  // Poll store users as fallback when YjsProvider context is not mounted.
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
    const interval = setInterval(updateUsers, 300);
    return () => clearInterval(interval);
  }, [getYjsUsers]);

  // Subscribe to awareness changes for responsive updates
  useEffect(() => {
    const awarenessSources = getAwarenessSources();
    if (awarenessSources.length === 0) return;

    const handleChange = () => {
      setAwarenessVersion(v => v + 1);
    };

    awarenessSources.forEach((awareness: any) => {
      awareness?.on?.('change', handleChange);
      awareness?.on?.('update', handleChange);
    });

    return () => {
      awarenessSources.forEach((awareness: any) => {
        awareness?.off?.('change', handleChange);
        awareness?.off?.('update', handleChange);
      });
    };
  }, [getAwarenessSources]);

  // Build list of remote selections from awareness state
  const remoteSelections = useMemo((): RemoteSelection[] => {
    // Reference awarenessVersion to trigger recalculation
    void awarenessVersion;

    const now = Date.now();
    const byUser = new Map<string, RemoteSelection & { ts: number }>();

    const upsert = (entry: {
      userId: string;
      userName: string;
      color: string;
      componentIds: string[];
      ts: number;
      self?: boolean;
    }) => {
      if (entry.self) return;
      if (!entry.userId || !Array.isArray(entry.componentIds) || entry.componentIds.length === 0) return;
      if (entry.ts > 0 && now - entry.ts > STALE_THRESHOLD_MS) return;

      const previous = byUser.get(entry.userId);
      if (!previous || entry.ts >= previous.ts) {
        byUser.set(entry.userId, {
          userId: entry.userId,
          userName: entry.userName,
          color: entry.color,
          componentIds: entry.componentIds,
          ts: entry.ts,
        });
      }
    };

    storeUsers.forEach((user: any) => {
      const selection = user?.selection;
      if (!selection || selection.slideId !== slideId) return;

      upsert({
        userId: user.id || `unknown-${user.clientId || 'store'}`,
        userName: user.name || 'User',
        color: user.color || '#888',
        componentIds: Array.isArray(selection.componentIds) ? selection.componentIds : [],
        ts: Number(selection.t || user.lastUpdate || 0),
        self: Boolean(user.self),
      });
    });

    const awarenessSources = getAwarenessSources();
    awarenessSources.forEach((awareness: any) => {
      if (!awareness?.getStates) return;
      const localClientId = awareness.clientID;

      awareness.getStates().forEach((state: any, clientId: number) => {
        if (!state?.user || !state?.selection) return;

        const { selection, user } = state;
        if (
          selection.slideId !== slideId ||
          !Array.isArray(selection.componentIds) ||
          selection.componentIds.length === 0
        ) return;

        upsert({
          userId: user.id || `unknown-${clientId}`,
          userName: user.name || 'User',
          color: user.color || '#888',
          componentIds: selection.componentIds,
          ts: Number(selection.t || state.lastUpdate || 0),
          self: Boolean(state.self) || clientId === localClientId,
        });
      });
    });

    return Array.from(byUser.values()).map(({ ts, ...selection }) => selection);
  }, [awarenessVersion, getAwarenessSources, slideId, storeUsers]);

  // Build a lookup map from component id -> component
  const componentMap = useMemo(() => {
    const map = new Map<string, ComponentInstance>();
    for (const c of components) {
      map.set(c.id, c);
    }
    return map;
  }, [components]);

  if (remoteSelections.length === 0) return null;

  return (
    <>
      {remoteSelections.map(sel => {
        // Resolve selected components, filtering out backgrounds and missing components
        const selectedComponents = sel.componentIds
          .map(id => componentMap.get(id))
          .filter((c): c is ComponentInstance =>
            !!c &&
            c.type !== 'Background' &&
            !(c.id && c.id.toLowerCase().includes('background'))
          );

        if (selectedComponents.length === 0) return null;

        // Compute bounding box (same algorithm as MultiSelectionBoundingBox)
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        selectedComponents.forEach(component => {
          const x = component.props.position?.x || 0;
          const y = component.props.position?.y || 0;
          const width = component.props.size?.width || component.props.width || 100;
          const height = component.props.size?.height || component.props.height || 100;

          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x + width);
          maxY = Math.max(maxY, y + height);
        });

        const boxWidth = maxX - minX;
        const boxHeight = maxY - minY;

        // Convert to percentage coordinates relative to slide container
        const leftPct = (minX / slideSize.width) * 100;
        const topPct = (minY / slideSize.height) * 100;
        const widthPct = (boxWidth / slideSize.width) * 100;
        const heightPct = (boxHeight / slideSize.height) * 100;

        return (
          <div
            key={sel.userId}
            className="absolute"
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              width: `${widthPct}%`,
              height: `${heightPct}%`,
              border: `2px solid ${sel.color}`,
              borderRadius: '4px',
              pointerEvents: 'none',
              zIndex: 900,
              boxSizing: 'border-box',
            }}
            data-testid={`remote-selection-${sel.userId}`}
          >
            {/* User name label */}
            <div
              className="absolute text-xs font-medium text-white px-1.5 py-0.5 rounded-sm"
              style={{
                backgroundColor: sel.color,
                top: '-20px',
                left: '-1px',
                whiteSpace: 'nowrap',
                maxWidth: '120px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontSize: '10px',
                lineHeight: '14px',
                pointerEvents: 'none',
                opacity: 0.9,
              }}
            >
              {sel.userName}
            </div>
          </div>
        );
      })}
    </>
  );
};

export default React.memo(RemoteSelections);
