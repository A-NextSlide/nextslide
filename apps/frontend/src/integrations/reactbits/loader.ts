/**
 * ReactBits Component Loader
 *
 * Handles loading ReactBits components from GitHub repository
 */

import { ReactBitsComponentMetadata, ReactBitsDefinition, FetchResult, LoadingState } from './types';
import { REACTBITS_CATALOG } from './catalog';

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/DavidHDev/react-bits/main/public/r';

/**
 * Loader cache to prevent duplicate fetches
 */
class ComponentLoaderCache {
  private cache: Map<string, Promise<FetchResult>> = new Map();
  private loadedComponents: Map<string, ReactBitsDefinition> = new Map();

  async get(id: string): Promise<FetchResult | null> {
    if (this.loadedComponents.has(id)) {
      return {
        success: true,
        component: this.loadedComponents.get(id)!,
      };
    }
    return null;
  }

  set(id: string, promise: Promise<FetchResult>) {
    this.cache.set(id, promise);
  }

  getPromise(id: string): Promise<FetchResult> | undefined {
    return this.cache.get(id);
  }

  setLoaded(id: string, component: ReactBitsDefinition) {
    this.loadedComponents.set(id, component);
  }

  has(id: string): boolean {
    return this.cache.has(id) || this.loadedComponents.has(id);
  }

  clear() {
    this.cache.clear();
    this.loadedComponents.clear();
  }
}

const loaderCache = new ComponentLoaderCache();

/**
 * Fetch component JSON from GitHub
 */
async function fetchComponentJSON(id: string, variant: string = 'TS-TW'): Promise<ReactBitsComponentMetadata | null> {
  const catalogEntry = REACTBITS_CATALOG[id];
  if (!catalogEntry) {
    console.error(`Component ${id} not found in catalog`);
    return null;
  }

  const componentName = catalogEntry.name;
  const category = catalogEntry.category;

  // Map category to GitHub folder structure
  const categoryFolderMap: Record<string, string> = {
    'text-animations': 'TextAnimations',
    'animations': 'Animations',
    'backgrounds': 'Backgrounds',
    'components': 'Components',
    'buttons': 'Buttons',
    'forms': 'Forms',
    'loaders': 'Loaders',
  };

  const folder = categoryFolderMap[category];
  const filename = `${componentName}-${variant}.json`;
  const url = `${GITHUB_RAW_BASE}/${folder}/${filename}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    return json as ReactBitsComponentMetadata;
  } catch (error) {
    console.error(`Failed to fetch component ${id}:`, error);
    return null;
  }
}

/**
 * Parse component source code and extract the React component
 * This is a simplified loader - in production you might use dynamic imports
 */
function parseComponentSource(sourceCode: string, componentName: string): React.ComponentType<any> | null {
  try {
    // This is a placeholder - in a real implementation, you would:
    // 1. Use a dynamic import or eval (with proper sandboxing)
    // 2. Or compile the TypeScript/JSX using a bundler
    // 3. Or use a service worker to handle imports

    // For now, we'll return null and handle rendering differently
    console.warn(`Component ${componentName} source loaded but not compiled. Requires dynamic import setup.`);
    return null;
  } catch (error) {
    console.error(`Failed to parse component ${componentName}:`, error);
    return null;
  }
}

/**
 * Load a ReactBits component
 */
export async function loadComponent(id: string): Promise<FetchResult> {
  // Check cache first
  const cached = await loaderCache.get(id);
  if (cached) {
    return cached;
  }

  // Check if already loading
  const existing = loaderCache.getPromise(id);
  if (existing) {
    return existing;
  }

  // Create new load promise
  const loadPromise = (async (): Promise<FetchResult> => {
    const catalogEntry = REACTBITS_CATALOG[id];
    if (!catalogEntry) {
      return {
        success: false,
        error: `Component ${id} not found in catalog`,
      };
    }

    // For now, we're using demo components directly, so we don't need to fetch from GitHub
    // Create definition directly from catalog
    const definition: ReactBitsDefinition = {
      ...catalogEntry,
      sourceCode: '// Demo component - using built-in implementation',
      dependencies: catalogEntry.dependencies,
      component: undefined, // Will be set when dynamically loaded
    };

    // Cache the loaded component
    loaderCache.setLoaded(id, definition);

    return {
      success: true,
      component: definition,
    };
  })();

  loaderCache.set(id, loadPromise);
  return loadPromise;
}

/**
 * Preload multiple components
 */
export async function preloadComponents(ids: string[]): Promise<Map<string, FetchResult>> {
  const results = new Map<string, FetchResult>();
  const promises = ids.map(async (id) => {
    const result = await loadComponent(id);
    results.set(id, result);
  });

  await Promise.all(promises);
  return results;
}

/**
 * Check if a component is loaded
 */
export function isComponentLoaded(id: string): boolean {
  return loaderCache.has(id);
}

/**
 * Clear loader cache
 */
export function clearLoaderCache() {
  loaderCache.clear();
}

/**
 * Get loading state for a component
 */
export function getComponentLoadingState(id: string): LoadingState {
  if (loaderCache.has(id)) {
    return 'loaded';
  }
  return 'idle';
}
