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
    
    // Check if component has fontOptimized flag
    if (props.fontOptimized) {
      return props; // Already optimized
    }

    // Try to find the DOM element
    const element = document.querySelector(`[data-component-id="${component.id}"]`) as HTMLElement;
    
    if (element) {
      // Check if text is overflowing
      const isOverflowing = isTextOverflowing(element);
      
      if (isOverflowing) {
        const currentSize = parseInt(props.fontSize || '16');
        const optimalSize = calculateOptimalFontSize(element, 8, currentSize, currentSize);
        
        if (optimalSize < currentSize) {
          props.fontSize = optimalSize;
          props.fontOptimized = true;
          
          // Adjust line height proportionally
          if (props.lineHeight) {
            props.lineHeight = props.lineHeight * (optimalSize / currentSize);
          }
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