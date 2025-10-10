/**
 * Service for optimizing component bounds and content fitting
 */

import { ComponentInstance } from '../types/components';
import { SlideData } from '../types/SlideTypes';
import { 
  applyComponentBoundsFitting,
  isTextOverflowing,
  calculateOptimalFontSize 
} from '../utils/componentFittingUtils';

export class ComponentOptimizationService {
  private static instance: ComponentOptimizationService;
  private optimizationQueue: Map<string, () => void> = new Map();
  private isProcessing = false;

  static getInstance(): ComponentOptimizationService {
    if (!ComponentOptimizationService.instance) {
      ComponentOptimizationService.instance = new ComponentOptimizationService();
    }
    return ComponentOptimizationService.instance;
  }

  /**
   * Optimize all components on a slide
   */
  async optimizeSlideComponents(slide: SlideData): Promise<SlideData> {
    if (!slide.components || slide.components.length === 0) {
      return slide;
    }

    const optimizedComponents = await Promise.all(
      slide.components.map(component => this.optimizeComponent(component))
    );

    return {
      ...slide,
      components: optimizedComponents
    };
  }

  /**
   * Optimize a single component
   */
  async optimizeComponent(component: ComponentInstance): Promise<ComponentInstance> {
    const optimized = { ...component };

    switch (component.type) {
      case 'TextBlock':
      case 'TiptapTextBlock':
        optimized.props = await this.optimizeTextComponent(component);
        break;
        
      case 'Shape':
      case 'ShapeWithText':
        if (component.props.hasText) {
          optimized.props = await this.optimizeTextComponent(component);
        }
        break;
        
      case 'Image':
        optimized.props = this.optimizeImageComponent(component);
        break;
        
      case 'Video':
        optimized.props = this.optimizeVideoComponent(component);
        break;
        
      case 'Table':
        optimized.props = this.optimizeTableComponent(component);
        break;
    }

    return optimized;
  }

  /**
   * Optimize text components for better fitting
   */
  private async optimizeTextComponent(component: ComponentInstance): Promise<any> {
    const props = { ...component.props };
    
    // IMPORTANT: Only optimize if explicitly requested OR if component has never been optimized
    // This prevents optimization from running on every selection/click
    if (props.fontOptimized) {
      // Already optimized, skip unless there's a significant size change
      // We rely on the component's own resize logic to handle scale changes
      return props;
    }

    // Try to find the DOM element
    const element = document.querySelector(`[data-component-id="${component.id}"]`) as HTMLElement;
    
    if (element) {
      // For ShapeWithText, find the actual text container (not the outer shape)
      let textElement = element;
      if (component.type === 'Shape' || component.type === 'ShapeWithText') {
        const textWrapper = element.querySelector('.tiptap-editor-wrapper') as HTMLElement;
        if (textWrapper) {
          textElement = textWrapper;
          console.log(`[FontOptimization] ShapeWithText - using text wrapper for overflow detection`, {
            componentId: component.id,
            textPadding: props.textPadding || 0
          });
        }
      }
      
      // Wait for component to be fully rendered before checking overflow
      // This prevents false positives during initial render
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check if text is overflowing
      const isOverflowing = isTextOverflowing(textElement);
      
      if (isOverflowing) {
        const currentSize = parseInt(props.fontSize || '16');
        // Set minimum font size higher for Shape components to maintain readability
        const minFontSize = component.type === 'Shape' ? 12 : 8;
        const optimalSize = calculateOptimalFontSize(textElement, minFontSize, currentSize, currentSize);
        
        console.log(`[FontOptimization] Text overflowing, reducing font size`, {
          componentId: component.id,
          componentType: component.type,
          currentSize,
          optimalSize,
          minFontSize,
          textPadding: props.textPadding || 0,
          lineHeight: props.lineHeight
        });
        
        if (optimalSize < currentSize) {
          props.fontSize = optimalSize;
          props.fontOptimized = true;
          
          // Adjust line height proportionally but keep it tighter for shapes
          if (props.lineHeight) {
            const newLineHeight = props.lineHeight * (optimalSize / currentSize);
            // For shapes, ensure line height doesn't get too tight
            props.lineHeight = Math.max(newLineHeight, 1.2);
          } else {
            // Set a good default line height for shapes
            props.lineHeight = component.type === 'Shape' ? 1.3 : 1.5;
          }
        }
      } else {
        // Text fits properly, mark as optimized
        props.fontOptimized = true;
        // Ensure line height is set for shapes even when not overflowing
        if (component.type === 'Shape' && !props.lineHeight) {
          props.lineHeight = 1.3;
        }
      }
    }

    // Ensure text wrapping properties
    if (!props.wordWrap) {
      props.wordWrap = 'break-word';
    }

    return props;
  }

  /**
   * Optimize image components
   */
  private optimizeImageComponent(component: ComponentInstance): any {
    const props = { ...component.props };
    
    // Ensure object-fit is set for proper scaling
    if (!props.objectFit) {
      props.objectFit = 'contain';
    }
    
    // Add max dimensions if not set
    if (!props.maxWidth) {
      props.maxWidth = '100%';
    }
    
    if (!props.maxHeight) {
      props.maxHeight = '100%';
    }

    return props;
  }

  /**
   * Optimize video components
   */
  private optimizeVideoComponent(component: ComponentInstance): any {
    const props = { ...component.props };
    
    // Similar to images
    if (!props.objectFit) {
      props.objectFit = 'contain';
    }
    
    if (!props.maxWidth) {
      props.maxWidth = '100%';
    }
    
    if (!props.maxHeight) {
      props.maxHeight = '100%';
    }

    return props;
  }

  /**
   * Optimize table components
   */
  private optimizeTableComponent(component: ComponentInstance): any {
    const props = { ...component.props };
    
    // Enable scrolling for tables
    if (!props.overflow) {
      props.overflow = 'auto';
    }

    return props;
  }

  /**
   * Queue component optimization
   */
  queueOptimization(componentId: string, optimizeFn: () => void): void {
    this.optimizationQueue.set(componentId, optimizeFn);
    this.processQueue();
  }

  /**
   * Process optimization queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.optimizationQueue.size === 0) {
      return;
    }

    this.isProcessing = true;

    // Process in batches
    const batch = Array.from(this.optimizationQueue.entries()).slice(0, 10);
    
    for (const [id, fn] of batch) {
      try {
        fn();
        this.optimizationQueue.delete(id);
      } catch (error) {
        console.error(`Error optimizing component ${id}:`, error);
        this.optimizationQueue.delete(id);
      }
    }

    this.isProcessing = false;

    // Continue processing if more items in queue
    if (this.optimizationQueue.size > 0) {
      requestAnimationFrame(() => this.processQueue());
    }
  }

  /**
   * Batch optimize multiple slides
   */
  async optimizeSlides(slides: SlideData[]): Promise<SlideData[]> {
    return Promise.all(slides.map(slide => this.optimizeSlideComponents(slide)));
  }

  /**
   * Check if a component needs optimization
   */
  needsOptimization(component: ComponentInstance): boolean {
    // Check if already optimized
    if (component.props.fontOptimized) {
      return false;
    }

    // Check component types that typically need optimization
    const typesNeedingOptimization = [
      'TextBlock',
      'TiptapTextBlock',
      'Shape',
      'ShapeWithText',
      'Table'
    ];

    if (!typesNeedingOptimization.includes(component.type)) {
      return false;
    }

    // For text components, check if element exists and is overflowing
    if (component.type === 'TextBlock' || component.type === 'TiptapTextBlock') {
      const element = document.querySelector(`[data-component-id="${component.id}"]`) as HTMLElement;
      if (element) {
        return isTextOverflowing(element);
      }
    }

    return true;
  }
}