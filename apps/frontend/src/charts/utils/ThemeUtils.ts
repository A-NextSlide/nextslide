import { 
  hexToRgb, 
  rgbToHex, 
  adjustBrightness, 
  getComplementaryColor,
  generateDataColors 
} from '@/utils/colorUtils';
import { useEditModeTransitionStore } from '@/stores/editModeTransitionStore';

/**
 * Chart theme configurations for light and dark modes
 */
export const chartThemes = {
  light: {
    background: 'transparent',
    textColor: '#333333',
    fontSize: 11,
    axis: {
      domain: {
        line: {
          stroke: '#777777',
          strokeWidth: 1
        }
      },
      ticks: {
        line: {
          stroke: '#777777',
          strokeWidth: 1
        },
        text: {
          fill: '#333333',
          fontSize: 10
        }
      },
      legend: {
        text: {
          fill: '#333333',
          fontSize: 12,
          fontWeight: 'bold'
        }
      }
    },
    grid: {
      line: {
        stroke: '#dddddd',
        strokeWidth: 1
      }
    },
    legends: {
      text: {
        fill: '#333333',
        fontSize: 11
      }
    },
    tooltip: {
      container: {
        background: '#ffffff',
        color: '#333333',
        fontSize: 12,
        borderRadius: 4,
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)'
      }
    }
  },
  dark: {
    background: 'transparent',
    textColor: '#eeeeee',
    fontSize: 11,
    axis: {
      domain: {
        line: {
          stroke: '#888888',
          strokeWidth: 1
        }
      },
      ticks: {
        line: {
          stroke: '#888888',
          strokeWidth: 1
        },
        text: {
          fill: '#eeeeee',
          fontSize: 10
        }
      },
      legend: {
        text: {
          fill: '#eeeeee',
          fontSize: 12,
          fontWeight: 'bold'
        }
      }
    },
    grid: {
      line: {
        stroke: '#444444',
        strokeWidth: 1
      }
    },
    legends: {
      text: {
        fill: '#eeeeee',
        fontSize: 11
      }
    },
    tooltip: {
      container: {
        background: '#333333',
        color: '#eeeeee',
        fontSize: 12,
        borderRadius: 4,
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)'
      }
    }
  },
  // Additional themed palettes for charts
  palettes: {
    default: [
      '#3366CC', '#DC3912', '#FF9900', '#109618', '#990099', '#0099C6', '#DD4477',
      '#66AA00', '#B82E2E', '#316395', '#994499', '#22AA99', '#AAAA11', '#6633CC',
      '#E67300', '#8B0707', '#329262', '#5574A6', '#3B3EAC'
    ],
    pastel: [
      '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#C9BAFF', '#FFBAEC',
      '#F9CEDF', '#E1F9CE', '#CEF9F4', '#CEE1F9', '#E7CEF9', '#F9CECE', '#DCF9CE',
      '#CEF9EB', '#CEF4F9', '#CED8F9', '#E2CEF9', '#F9CEF1'
    ],
    bold: [
      '#0D47A1', '#B71C1C', '#006064', '#1B5E20', '#4A148C', '#880E4F', '#E65100',
      '#01579B', '#BF360C', '#004D40', '#3E2723', '#1A237E', '#F57F17', '#263238',
      '#311B92', '#3E2723', '#212121', '#01579B', '#33691E'
    ],
    monochrome: [
      '#0D47A1', '#1565C0', '#1976D2', '#1E88E5', '#2196F3', '#42A5F5', '#64B5F6',
      '#90CAF9', '#BBDEFB', '#E3F2FD', '#D6EAF8', '#AED6F1', '#85C1E9', '#5DADE2',
      '#3498DB', '#2E86C1', '#2874A6', '#21618C', '#1B4F72'
    ]
  }
};

/**
 * Get theme configuration based on theme name
 * @param theme The theme to use ('light' or 'dark')
 * @returns The theme configuration object
 */
export function getChartTheme(theme: 'light' | 'dark') {
  return chartThemes[theme] || chartThemes.light;
}

/**
 * Animation configuration presets
 */
export const motionPresets = {
  default: {
    mass: 1,
    tension: 170,
    friction: 26,
    clamp: false,
    precision: 0.01,
    restSpeed: 0.001,
    restDelta: 0.001
  },
  gentle: {
    mass: 2,
    tension: 100,
    friction: 20,
    clamp: false,
    precision: 0.01,
    restSpeed: 0.001,
    restDelta: 0.001
  },
  wobbly: {
    mass: 0.5, // Decreased mass for more responsive animation
    tension: 270, // Increased tension for faster initial movement
    friction: 6, // Reduced friction for more visible bouncing
    clamp: false,
    precision: 0.01, 
    restSpeed: 0.001,
    restDelta: 0.001
  },
  stiff: {
    mass: 1,
    tension: 300,
    friction: 20,
    clamp: false,
    precision: 0.01,
    restSpeed: 0.001,
    restDelta: 0.001
  },
  slow: {
    mass: 1,
    tension: 120,
    friction: 40,
    clamp: false,
    precision: 0.01,
    restSpeed: 0.001,
    restDelta: 0.001
  },
  responsive: { // New preset optimized for property changes
    mass: 0.4,
    tension: 300, 
    friction: 7,
    clamp: false,
    precision: 0.001,
    restSpeed: 0.001,
    restDelta: 0.001
  }
};

/**
 * Check if we're in an edit mode transition or edit mode
 * 
 * This function is used to determine if charts should use stable keys
 * and prevent animations during edit mode transitions or editing.
 * 
 * @returns Boolean indicating if we should prevent chart animations
 */
export function isInEditModeTransition(): boolean {
  // No way to detect transitions in SSR, so default to false
  if (typeof window === 'undefined') return false;
  
  // PERFORMANCE: Use store instead of window flags
  const isTransitioning = useEditModeTransitionStore.getState().isInTransition;
  
  // We now handle edit mode separately to allow animations while editing
  // but still prevent them during transitions
  return isTransitioning;
}

/**
 * Forcibly set the edit mode transition flag
 * This function is used to force the transition state when needed
 * 
 * @param value Boolean value to set the transition flag to
 */
export function setEditModeTransitionState(value: boolean): void {
  if (typeof window !== 'undefined') {
    // PERFORMANCE: Use store for better reactivity
    if (value) {
      useEditModeTransitionStore.getState().startTransition();
    } else {
      useEditModeTransitionStore.getState().endTransition();
    }
    
    // Only update animation state - don't disable animations completely
    // Just mark that we're in transition
    // This allows animations to continue working in edit mode, just not during transitions
    if (value === true) {
      // Store any pending animation tasks
      if ((window as any).__chartAnimationRAFIds) {
        // Don't cancel - just store the count for debugging
        (window as any).__pendingRAFCount = ((window as any).__chartAnimationRAFIds as number[]).length;
      }
    } else if (value === false) {
      // Don't animate charts when entering edit mode
      // Charts should only animate on slide changes, not on edit mode toggle
    }
  }
}

/**
 * Notify the chart system that a property has changed and animations should be triggered
 * This function manually sets global flags to control chart animations and dispatches a custom event
 * for immediate animation without any debouncing
 */
export function notifyChartPropertyChanged(chartId?: string, propertyName?: string): void {
  if (typeof window !== 'undefined') {
    // Set the property changed flag to trigger animations
    (window as any).__chartPropertyChanged = true;
    
    // Ensure animations are enabled
    (window as any).__chartAnimationsEnabled = true;
    
    // Mark this as a toggle update for better animation handling
    (window as any).__isToggleUpdate = true;
    
    // Add animation trigger in case event dispatch isn't caught
    (window as any).__lastAnimationTrigger = Date.now();
    
    // Force an immediate layout update if we're in edit mode
    if ((window as any).__isEditMode === true) {
      // Force layout update by toggling a class on the document body
      document.body.classList.add('force-reflow');
      // Force reflow
      document.body.offsetHeight;
      // Remove class
      document.body.classList.remove('force-reflow');
    }
  }
  
  // Dispatch TWO events to trigger immediate animation
  // The first one goes to all chart components
  if (typeof document !== 'undefined') {
    // First dispatch the general update event
    const generalEvent = new CustomEvent('chartPropertyChanged', {
      bubbles: true,
      detail: { 
        propertyName: 'general-update',
        timestamp: Date.now(),
        immediate: true 
      }
    });
    document.dispatchEvent(generalEvent);
    
    // Then dispatch a chart-specific event if we have a chart ID
    if (chartId) {
      const specificEvent = new CustomEvent('chartPropertyChanged', {
        bubbles: true,
        detail: { 
          chartId, 
          propertyName,
          timestamp: Date.now(),
          immediate: true // Flag to indicate this should animate immediately
        }
      });
      document.dispatchEvent(specificEvent);
    }
  }
}

// Initialize edit mode flags on load
if (typeof window !== 'undefined') {
  // Remove window flag initialization - now handled by store
  // The store has proper initial state
}

/**
 * Returns a color palette based on the specified theme and count
 * Integrates with colorUtils to provide a consistent color scheme
 * This enables performant, cached color generation across the application
 * 
 * @param paletteName The name of the palette to use
 * @param count Number of colors to generate
 * @returns Array of color strings
 */
export function getChartColorPalette(
  paletteName: 'default' | 'pastel' | 'bold' | 'monochrome' = 'default',
  count: number = 5
): string[] {
  // Get the palette from the theme
  const palette = chartThemes.palettes[paletteName] || chartThemes.palettes.default;
  
  // If the palette has enough colors, return a slice
  if (palette.length >= count) {
    return palette.slice(0, count);
  }
  
  // If we need more colors than are in the palette, we need to generate them
  // First, use all the colors from the palette
  const colors = [...palette];
  
  // Determine how many more colors we need
  const remaining = count - colors.length;
  
  // For remaining colors, create variations using existing palette colors
  // This could be done by interpolating between colors, adjusting brightness, etc.
  for (let i = 0; i < remaining; i++) {
    // Use the palette color at the current index (mod palette length)
    const baseColor = palette[i % palette.length];
    
    // Adjust the brightness based on the iteration
    // Calculate brightness ratio: alternate between darker and lighter
    const brightnessAdjustment = i % 2 === 0 
      ? -0.15 - (0.05 * Math.floor(i / palette.length)) // darker
      : 0.15 + (0.05 * Math.floor(i / palette.length)); // lighter
    
    // Generate a new color by adjusting brightness
    // Use the colorUtils adjustBrightness function to modify the color
    const newColor = adjustBrightness(baseColor, brightnessAdjustment);
    
    // Add the new color to our array
    colors.push(newColor);
  }
  
  return colors;
}

/**
 * Generates a set of pattern definitions for chart fills
 * These can be used with the Nivo chart defs property
 * 
 * @param themeType Theme type ('light' or 'dark')
 * @returns Array of pattern definitions
 */
export function generateChartPatterns(themeType: 'light' | 'dark' = 'light'): any[] {
  // Base color for patterns depends on theme
  const patternBaseColor = themeType === 'light' 
    ? 'rgba(0, 0, 0, 0.25)'
    : 'rgba(255, 255, 255, 0.3)';
  
  return [
    {
      id: 'dots',
      type: 'patternDots',
      background: 'inherit',
      color: patternBaseColor,
      size: 4,
      padding: 1,
      stagger: true
    },
    {
      id: 'lines',
      type: 'patternLines',
      background: 'inherit',
      color: patternBaseColor,
      rotation: -45,
      lineWidth: 6,
      spacing: 10
    },
    {
      id: 'squares',
      type: 'patternSquares',
      background: 'inherit',
      color: patternBaseColor,
      size: 6,
      padding: 2
    },
    {
      id: 'diagonal-lines',
      type: 'patternLines',
      background: 'inherit',
      color: patternBaseColor,
      rotation: 45,
      lineWidth: 4,
      spacing: 8
    },
    {
      id: 'grid',
      type: 'patternLines',
      background: 'inherit',
      color: patternBaseColor,
      rotation: 0,
      lineWidth: 2,
      spacing: 6,
      enableSecondary: true,
      secondaryColor: patternBaseColor,
      secondaryLineWidth: 2,
      secondarySpacing: 6,
      secondaryRotation: 90
    }
  ];
}

/**
 * Generates fill configs for chart elements based on data
 * 
 * @param data The chart data
 * @param count Optional number of fill patterns to generate
 * @returns Array of fill configurations for Nivo charts
 */
export function generateChartFills(data: any[], count?: number): any[] {
  // Determine number of fills to generate
  const fillCount = count || Math.min(4, data.length);
  
  // Basic pattern types
  const patterns = ['dots', 'lines', 'squares', 'diagonal-lines', 'grid'];
  
  // Generate fill configs
  return Array.from({ length: fillCount }).map((_, index) => {
    // Get the data item for this index, if available
    const item = data[index];
    
    // Get the ID from the data item, or generate a fallback
    const id = item?.id || item?.name || `item-${index}`;
    
    // Pattern to use (cycle through available patterns)
    const pattern = patterns[index % patterns.length];
    
    return {
      match: { id },
      id: pattern
    };
  });
}

/**
 * Cache for chart color palettes to prevent regenerating the same palette
 * Improves performance by avoiding repeated color calculations
 */
export const chartColorCache: {
  [key: string]: {
    timestamp: number;
    colors: string[];
  }
} = {};

/**
 * Gets a cached color palette or generates a new one
 * @param paletteName Name of the palette
 * @param count Number of colors
 * @param cacheDuration Duration in ms to cache the palette (default: 30 minutes)
 * @returns Array of color strings
 */
export function getCachedChartColors(
  paletteName: 'default' | 'pastel' | 'bold' | 'monochrome' = 'default',
  count: number = 5,
  cacheDuration: number = 30 * 60 * 1000
): string[] {
  // Create a cache key
  const cacheKey = `${paletteName}-${count}`;
  
  // Check if we have a cached palette
  const cached = chartColorCache[cacheKey];
  
  // If the cache exists and is not expired, use it
  if (cached && (Date.now() - cached.timestamp) < cacheDuration) {
    return cached.colors;
  }
  
  // Generate a new palette
  const colors = getChartColorPalette(paletteName, count);
  
  // Store in cache
  chartColorCache[cacheKey] = {
    timestamp: Date.now(),
    colors
  };
  
  return colors;
}