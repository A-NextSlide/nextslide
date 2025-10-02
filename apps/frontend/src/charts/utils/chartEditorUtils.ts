import { ComponentInstance } from "../../types/components";

// Type for the global window properties used by charts (use with caution)
interface ChartWindow extends Window {
  __persistentChartList?: Set<string>;
  __chartComponentCache?: Map<string, any>; // Consider a more specific type if possible
  __chartPositionOverride?: Record<string, { x: number; y: number }>;
  __chartsInTransition?: Set<string>;
  __forceChartRerender?: () => void;
}

declare var window: ChartWindow;

/**
 * Prepares a chart component instance for the draft state during editor initialization.
 * Adds specific props needed for chart rendering logic during editing.
 */
export function prepareChartForDraft(component: ComponentInstance): ComponentInstance {
  if (component.type !== 'Chart') {
    return component;
  }

  // Ensure the chart is tracked persistently across edits
  if (typeof window !== 'undefined') {
    if (!window.__persistentChartList) {
      window.__persistentChartList = new Set();
    }
    if (!window.__persistentChartList.has(component.id)) {
        window.__persistentChartList.add(component.id);
        // console.log(`[chartEditorUtils.prepareChartForDraft] Adding chart ${component.id} to persistent tracking`);
    }
  }

  // Deep clone props and add editor-specific flags
  const clonedProps = structuredClone(component.props);

  return {
    ...component,
    props: {
      ...clonedProps,
      _preserveRef: true, // Indicates ref should be preserved
      _skipRender: true, // Initially skip render in edit mode
      _editModeTransition: true, // Flag for transition handling
      _suppressEditModeRender: true, // Suppress initial render in edit mode
      _timestamp: Date.now() // Timestamp for tracking identity
    }
  };
}

/**
 * Cleans up chart-related global state when a chart component is removed from the draft.
 */
export function cleanupChartOnRemove(componentId: string): void {
  if (typeof window !== 'undefined') {
    // Remove from persistent chart list
    if (window.__persistentChartList?.has(componentId)) {
      window.__persistentChartList.delete(componentId);
      // console.log(`[chartEditorUtils.cleanupChartOnRemove] Removed ${componentId} from persistent chart list`);
    }

    // Remove from chart component cache
    if (window.__chartComponentCache?.has(componentId)) {
      window.__chartComponentCache.delete(componentId);
      // console.log(`[chartEditorUtils.cleanupChartOnRemove] Removed ${componentId} from chart component cache`);
    }

    // Remove from chart position override
    if (window.__chartPositionOverride?.[componentId]) {
      delete window.__chartPositionOverride[componentId];
      // console.log(`[chartEditorUtils.cleanupChartOnRemove] Removed ${componentId} from chart position override`);
    }

    // Remove from charts in transition
    if (window.__chartsInTransition?.has(componentId)) {
      window.__chartsInTransition.delete(componentId);
      // console.log(`[chartEditorUtils.cleanupChartOnRemove] Removed ${componentId} from charts in transition`);
    }
  }

  // Dispatch a component deleted event for other charts to react
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const deletedEvent = new CustomEvent('component:deleted', {
      bubbles: true,
      detail: {
        componentId: componentId,
        componentType: 'Chart'
      }
    });
    document.dispatchEvent(deletedEvent);
    // console.log(`[chartEditorUtils.cleanupChartOnRemove] Dispatched component:deleted event for chart ${componentId}`);
  }
}

/**
 * Performs cleanup of potentially stale chart tracking info during draft initialization.
 * Removes tracked charts that are no longer present in the current slide's components.
 */
export function cleanupStaleChartTracking(activeChartIds: Set<string>): void {
   if (typeof window !== 'undefined' && window.__persistentChartList) {
    const trackedCharts = Array.from(window.__persistentChartList) as string[];

    for (const chartId of trackedCharts) {
      if (!activeChartIds.has(chartId)) {
        // console.log(`[chartEditorUtils.cleanupStaleChartTracking] Removing stale chart ${chartId} from persistent tracking`);
        window.__persistentChartList.delete(chartId);

        // Also clean up related caches
        if (window.__chartComponentCache) {
          window.__chartComponentCache.delete(chartId);
        }
        if (window.__chartPositionOverride) {
          delete window.__chartPositionOverride[chartId];
        }
         if (window.__chartsInTransition) {
          window.__chartsInTransition.delete(chartId);
        }
      }
    }
  }
}

/**
 * Initializes global chart utilities after draft initialization.
 * Sets up transition flags and a force rerender function.
 */
export function initializeGlobalChartUtils(): void {
  if (typeof window !== 'undefined') {
    setTimeout(async () => {
      try {
        // Dynamically import ThemeUtils to manage transition state
        const ThemeUtils = await import('./ThemeUtils');
        if (ThemeUtils.setEditModeTransitionState) {
          ThemeUtils.setEditModeTransitionState(false);
          // console.log("[chartEditorUtils] Cleared edit mode transition state.");
        }

        // Define a global function to force chart rerenders if needed
        window.__forceChartRerender = () => {
          try {
            const event = new CustomEvent('chartPropertyChanged', {
              bubbles: true,
              detail: {
                chartId: 'all',
                propertyName: 'forceRerender',
                immediate: true,
                timestamp: Date.now()
              }
            });
            document.dispatchEvent(event);
            // console.log("[chartEditorUtils] Dispatched force chart rerender event.");
          } catch (err) {
            console.error('Error in __forceChartRerender:', err);
          }
        };
      } catch (err) {
        console.warn('[chartEditorUtils] Could not dynamically import ThemeUtils or set up global chart utils:', err);
      }
    }, 50); // Delay slightly to ensure DOM is ready and avoid race conditions
  }
} 