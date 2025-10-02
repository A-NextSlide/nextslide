import { useDeckStore } from '@/stores/deckStore';
import { ComponentInstance } from '@/types/components';
import { useEditorStore } from '@/stores/editorStore';
import { getComponentDefinition } from '@/registry';

// Define the result type for custom component optimization
interface ComponentOptimizationResult {
  componentId: string;
  componentType: string;
  optimization: {
    type: 'scale' | 'margins' | 'fontSize' | 'containerSize' | 'none';
    originalValue?: any;
    newValue?: any;
    description: string;
  };
}

interface OptimizationResult {
  totalSlides: number;
  totalComponents: number;
  optimizedComponents: number;
  updates?: ComponentOptimizationResult[];
}

/**
 * Service to optimize custom components (Charts, CustomComponents, etc.) to fit within their containers
 * Prevents overflow, cropping, and ensures proper sizing
 */
export class CustomComponentOptimizationService {
  private static readonly SCALE_STEP = 0.05; // 5% scale reduction steps
  private static readonly MIN_SCALE = 0.5; // Minimum 50% scale
  private static readonly CHART_MARGIN_STEP = 5; // Pixels to reduce margins
  private static readonly MIN_CHART_MARGIN = 10; // Minimum margin for charts
  private static readonly NAVIGATION_DELAY = 150; // Delay for slide navigation
  private static readonly BETWEEN_SLIDES_DELAY = 50; // Delay between slides
  private static readonly MEASUREMENT_DELAY = 100; // Delay for measurements
  private static readonly BATCH_SIZE = 3; // Process multiple components in parallel
  
  /**
   * Check if a component is a custom component that needs optimization
   */
  private static isCustomComponent(component: ComponentInstance): boolean {
    return component.type === 'CustomComponent' || 
           component.type === 'Chart' || 
           component.type === 'Table';
  }
  
  /**
   * Get the container element for a component
   */
  private static async getComponentContainer(componentId: string): Promise<HTMLElement | null> {
    // Try multiple selectors to find the component container
    const selectors = [
      `[data-component-id="${componentId}"]`,
      `#component-${componentId}`,
      `[data-id="${componentId}"]`
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector) as HTMLElement;
      if (element) return element;
    }
    
    return null;
  }
  
  /**
   * Check if an element is overflowing its container
   */
  private static isOverflowing(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    const parentRect = element.parentElement?.getBoundingClientRect();
    
    if (!parentRect) return false;
    
    // Check for overflow with a small tolerance
    const tolerance = 1; // 1px tolerance
    return (
      rect.width > parentRect.width + tolerance ||
      rect.height > parentRect.height + tolerance ||
      element.scrollWidth > element.clientWidth + tolerance ||
      element.scrollHeight > element.clientHeight + tolerance
    );
  }
  
  /**
   * Optimize a Chart component by adjusting margins and font sizes
   */
  private static async optimizeChart(
    component: ComponentInstance,
    container: HTMLElement
  ): Promise<ComponentOptimizationResult | null> {
    // Wait a bit for chart to fully render
    await new Promise(resolve => setTimeout(resolve, this.MEASUREMENT_DELAY));
    
    // Find the highcharts container or the chart svg
    const chartContainer = container.querySelector('.highcharts-container, svg') as HTMLElement;
    if (!chartContainer) return null;
    
    // Get the actual rendered size vs container size
    const containerRect = container.getBoundingClientRect();
    const chartRect = chartContainer.getBoundingClientRect();
    
    // Check if chart is overflowing with some tolerance
    const overflowX = chartRect.width > containerRect.width + 1;
    const overflowY = chartRect.height > containerRect.height + 1;
    
    if (!overflowX && !overflowY) return null;
    
    // Calculate scale needed to fit
    const scaleX = overflowX ? containerRect.width / chartRect.width : 1;
    const scaleY = overflowY ? containerRect.height / chartRect.height : 1;
    const scale = Math.min(scaleX, scaleY);
    
    // If scale is close to 1, try margin adjustment first
    if (scale > 0.9) {
      // Try reducing margins
      const currentMargins = (component.props as any).margin || { top: 20, right: 10, bottom: 30, left: 40 };
      const reductionFactor = 0.7; // Reduce margins to 70% of current
      const newMargins = {
        top: Math.max(this.MIN_CHART_MARGIN, Math.round(currentMargins.top * reductionFactor)),
        right: Math.max(this.MIN_CHART_MARGIN, Math.round(currentMargins.right * reductionFactor)),
        bottom: Math.max(this.MIN_CHART_MARGIN, Math.round(currentMargins.bottom * reductionFactor)),
        left: Math.max(this.MIN_CHART_MARGIN, Math.round(currentMargins.left * reductionFactor))
      };
      
      // Update component props
      const updateComponent = useEditorStore.getState().updateComponent;
      updateComponent(component.id, { margin: newMargins });
      
      return {
        componentId: component.id,
        componentType: component.type,
        optimization: {
          type: 'margins',
          originalValue: currentMargins,
          newValue: newMargins,
          description: `Reduced margins to fit container`
        }
      };
    } else {
      // For more significant overflow, apply a scale transform
      const finalScale = Math.max(scale, this.MIN_SCALE);
      
      // Store the scale in component props
      const updateComponent = useEditorStore.getState().updateComponent;
      const currentProps = component.props as any;
      
      updateComponent(component.id, {
        ...currentProps,
        _optimizedScale: finalScale
      });
      
      return {
        componentId: component.id,
        componentType: component.type,
        optimization: {
          type: 'scale',
          originalValue: 1,
          newValue: finalScale,
          description: `Applied ${Math.round(finalScale * 100)}% scale to fit container`
        }
      };
    }
  }
  
  /**
   * Optimize a CustomComponent by applying scale transforms
   */
  private static async optimizeCustomComponent(
    component: ComponentInstance,
    container: HTMLElement
  ): Promise<ComponentOptimizationResult | null> {
    // Find the actual content container
    const contentDiv = container.querySelector('div[data-scroll-guard="true"]') as HTMLElement;
    if (!contentDiv) return null;
    
    // Check if content is overflowing
    const isOverflowing = this.isOverflowing(contentDiv);
    if (!isOverflowing) return null;
    
    // Calculate the scale needed to fit
    const containerRect = container.getBoundingClientRect();
    const contentRect = contentDiv.getBoundingClientRect();
    
    const scaleX = containerRect.width / contentRect.width;
    const scaleY = containerRect.height / contentRect.height;
    const scale = Math.min(scaleX, scaleY, 1); // Never scale up, only down
    
    // Apply minimum scale limit
    const finalScale = Math.max(scale, this.MIN_SCALE);
    
    // Update component with a scale transform property
    const updateComponent = useEditorStore.getState().updateComponent;
    const currentProps = component.props as any;
    
    // Store the scale in component props so it persists
    updateComponent(component.id, {
      ...currentProps,
      _optimizedScale: finalScale
    });
    
    return {
      componentId: component.id,
      componentType: component.type,
      optimization: {
        type: 'scale',
        originalValue: 1,
        newValue: finalScale,
        description: `Applied ${Math.round(finalScale * 100)}% scale to fit container`
      }
    };
  }
  
  /**
   * Optimize all custom components in a slide
   */
  private static async optimizeSlide(
    slideIndex: number,
    slide: any
  ): Promise<ComponentOptimizationResult[]> {
    const results: ComponentOptimizationResult[] = [];
    
    if (!slide.components || !Array.isArray(slide.components)) {
      return results;
    }
    
    // Filter for custom components
    const customComponents = slide.components.filter((c: ComponentInstance) => 
      this.isCustomComponent(c)
    );
    
    // Process components in batches
    for (let i = 0; i < customComponents.length; i += this.BATCH_SIZE) {
      const batch = customComponents.slice(i, i + this.BATCH_SIZE);
      
      const batchResults = await Promise.all(
        batch.map(async (component: ComponentInstance) => {
          const container = await this.getComponentContainer(component.id);
          if (!container) return null;
          
          // Wait for any animations to complete
          await new Promise(resolve => setTimeout(resolve, this.MEASUREMENT_DELAY));
          
          // Apply optimization based on component type
          if (component.type === 'Chart') {
            return this.optimizeChart(component, container);
          } else if (component.type === 'CustomComponent') {
            return this.optimizeCustomComponent(component, container);
          } else if (component.type === 'Table') {
            // Table optimization could be added here
            return null;
          }
          
          return null;
        })
      );
      
      // Collect non-null results
      results.push(...batchResults.filter(r => r !== null) as ComponentOptimizationResult[]);
    }
    
    return results;
  }
  
  /**
   * Optimize all slides in the deck with navigation
   */
  static async optimizeDeckWithNavigation(
    navigateToSlide: (index: number) => void,
    forceOptimization: boolean = false,
    onProgress?: (current: number, total: number) => void | Promise<void>
  ): Promise<OptimizationResult> {
    const deckData = useDeckStore.getState().deckData;
    const slides = deckData.slides || [];
    
    if (slides.length === 0) {
      return { totalSlides: 0, totalComponents: 0, optimizedComponents: 0, updates: [] };
    }
    
    let totalOptimized = 0;
    let totalComponents = slides.reduce((sum: number, s: any) => 
      sum + (Array.isArray(s.components) ? s.components.filter((c: any) => this.isCustomComponent(c)).length : 0), 
      0
    );
    
    const allUpdates: ComponentOptimizationResult[] = [];
    
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      
      // Navigate to slide
      navigateToSlide(i);
      if (onProgress) {
        await onProgress(i + 1, slides.length);
      }
      
      // Wait for navigation to complete
      await new Promise(resolve => setTimeout(resolve, this.NAVIGATION_DELAY));
      
      // Optimize components on this slide
      const slideUpdates = await this.optimizeSlide(i, slide);
      allUpdates.push(...slideUpdates);
      totalOptimized += slideUpdates.length;
      
      // Small delay between slides
      if (i < slides.length - 1) {
        await new Promise(resolve => setTimeout(resolve, this.BETWEEN_SLIDES_DELAY));
      }
    }
    
    // Save the deck if we made changes
    if (totalOptimized > 0 && !forceOptimization) {
      try {
        await useDeckStore.getState().saveDeck();
        console.log(`[CustomComponentOptimization] Saved ${totalOptimized} optimizations`);
      } catch (error) {
        console.error('[CustomComponentOptimization] Failed to save deck:', error);
      }
    }
    
    return {
      totalSlides: slides.length,
      totalComponents,
      optimizedComponents: totalOptimized,
      updates: allUpdates
    };
  }
  
  /**
   * Apply stored optimization to a component during render
   * This is called from the component renderers to apply saved optimizations
   */
  static getOptimizedStyles(component: ComponentInstance): React.CSSProperties {
    const props = component.props as any;
    
    // Apply scale optimization if present
    if (props._optimizedScale && props._optimizedScale < 1) {
      return {
        transform: `scale(${props._optimizedScale})`,
        transformOrigin: 'top left',
        width: `${100 / props._optimizedScale}%`,
        height: `${100 / props._optimizedScale}%`
      };
    }
    
    return {};
  }
  
  /**
   * Check if optimization is needed for a deck
   */
  static async checkIfOptimizationNeeded(): Promise<boolean> {
    const deckData = useDeckStore.getState().deckData;
    const slides = deckData.slides || [];
    
    // Check if any slides have custom components
    return slides.some((slide: any) => 
      slide.components && 
      Array.isArray(slide.components) && 
      slide.components.some((c: ComponentInstance) => this.isCustomComponent(c))
    );
  }
  
  /**
   * Set up automatic optimization for deck generation
   */
  static setupAutoOptimization(): void {
    // Track recently optimized slides to avoid duplication
    const recentOptimizedAt = new Map<string, number>();
    
    // Listen for slide completion events
    const handleSlideCompleted = async (event: Event) => {
      const custom = event as CustomEvent<{ slideId: string; index: number }>;
      const { slideId, index } = custom.detail;
      
      // Get the slide data
      const deckData = useDeckStore.getState().deckData;
      const slide = deckData.slides?.find((s: any) => s.id === slideId);
      
      if (!slide || !slide.components) return;
      
      // Check if slide has custom components
      const hasCustomComponents = slide.components.some((c: ComponentInstance) =>
        this.isCustomComponent(c)
      );
      
      if (!hasCustomComponents) return;
      
      // Check if recently optimized
      const lastOptimized = recentOptimizedAt.get(slideId) || 0;
      if (Date.now() - lastOptimized < 30000) {
        console.log(`[CustomComponentOptimization] Slide ${index + 1} was recently optimized, skipping`);
        return;
      }
      
      console.log(`[CustomComponentOptimization] Optimizing custom components on slide ${index + 1}`);
      
      // Navigate to the slide
      const navigateEvent = new CustomEvent('slide:navigate:index', {
        detail: { index }
      });
      window.dispatchEvent(navigateEvent);
      
      // Wait for navigation
      await new Promise(resolve => setTimeout(resolve, this.NAVIGATION_DELAY));
      
      // Optimize the slide
      const results = await this.optimizeSlide(index, slide);
      
      if (results.length > 0) {
        console.log(`[CustomComponentOptimization] Optimized ${results.length} components on slide ${index + 1}`);
        recentOptimizedAt.set(slideId, Date.now());
        
        // Save the deck
        try {
          await useDeckStore.getState().saveDeck();
        } catch (error) {
          console.error('[CustomComponentOptimization] Failed to save deck:', error);
        }
      }
    };
    
    // Listen for deck generation completion
    const handleDeckComplete = async (event: Event) => {
      const custom = event as CustomEvent<any>;
      const details = custom.detail || {};
      
      console.log('[CustomComponentOptimization] Deck generation complete, checking for custom components');
      
      const deckData = useDeckStore.getState().deckData;
      if (!deckData || !deckData.slides) return;
      
      // Check if optimization is needed
      const needsOptimization = await this.checkIfOptimizationNeeded();
      if (!needsOptimization) {
        console.log('[CustomComponentOptimization] No custom components found, skipping optimization');
        return;
      }
      
      // Queue optimization for slides with custom components
      deckData.slides.forEach((slide: any, index: number) => {
        if (slide && slide.components && slide.components.length > 0) {
          const hasCustomComponents = slide.components.some((c: ComponentInstance) =>
            this.isCustomComponent(c)
          );
          
          if (hasCustomComponents) {
            // Dispatch slide completed event to trigger optimization
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('slide_completed', {
                detail: { slideId: slide.id, index }
              }));
            }, (index + 1) * 500); // Stagger optimizations
          }
        }
      });
    };
    
    // Add event listeners
    window.addEventListener('slide_completed', handleSlideCompleted);
    window.addEventListener('slide_generated', handleSlideCompleted);
    window.addEventListener('deck_generation_complete', handleDeckComplete);
    window.addEventListener('deck_complete', handleDeckComplete);
    
    console.log('[CustomComponentOptimization] Auto-optimization setup complete');
  }
}
