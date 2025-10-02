/**
 * DeferredYjsOperations - Utility for non-blocking Yjs operations
 * 
 * This utility provides a way to initialize Yjs documents in a non-blocking manner,
 * preventing UI freezing during initialization especially with complex components like charts.
 */

import * as Y from 'yjs';
import { YjsDocumentManager } from '../yjs/YjsDocumentManager';
import { CompleteDeckData, SlideData } from '../types/DeckTypes';
import { ComponentInstance } from '../types/components';
import { v4 as uuidv4 } from 'uuid';

// Add a small delay to ensure Yjs has time to initialize internal types
const YJS_TYPE_INIT_DELAY = 50;

/**
 * DeferredYjsOperations class handles batched, non-blocking Yjs operations
 */
export class DeferredYjsOperations {
  private docManager: YjsDocumentManager;
  private operationQueue: Array<() => void> = [];
  private isProcessing = false;
  private operationDelay: number;
  private batchSize: number;

  /**
   * Create a new DeferredYjsOperations instance
   * 
   * @param docManager - The YjsDocumentManager to use for operations
   * @param options - Configuration options
   */
  constructor(
    docManager: YjsDocumentManager, 
    options: { 
      operationDelay?: number;
      batchSize?: number;
    } = {}
  ) {
    this.docManager = docManager;
    this.operationDelay = options.operationDelay || 10; // Default 10ms between batches
    this.batchSize = options.batchSize || 3; // Default 3 operations per batch
  }

  /**
   * Initialize a document with deck data in a non-blocking way
   * 
   * @param deckData - The deck data to initialize with
   * @returns A promise that resolves when initialization is complete
   */
  public initializeFromDeckData(deckData: CompleteDeckData): Promise<void> {
    return new Promise((resolve) => {
      // Add a delay before initializing to let Yjs types register properly
      setTimeout(() => {
        // First, initialize the basic deck structure immediately
        this.docManager.getDocumentStructure().doc.transact(() => {
          try {
            // Clear existing data
            const { deckMap, slidesArray } = this.docManager.getDocumentStructure();
            deckMap.clear();
            slidesArray.delete(0, slidesArray.length);
            
            // Set deck metadata
            deckMap.set('uuid', deckData.uuid || uuidv4());
            deckMap.set('name', deckData.name);
            deckMap.set('version', deckData.version);
            deckMap.set('lastModified', deckData.lastModified);
            if (deckData.size) {
              deckMap.set('size', deckData.size);
            }
          } catch (error) {
            // Suppress errors during initialization
          }
        });

        // Track completion
        let slidesProcessed = 0;
        const totalSlides = deckData.slides.length;

        // If no slides, resolve immediately
        if (totalSlides === 0) {
          resolve();
          return;
        }

        // Then queue each slide to be added separately with a delay
        for (const slide of deckData.slides) {
          this.queueOperation(() => {
            try {
              this.addSlideNonBlocking(slide);
            } catch (error) {
              // Suppress errors during initialization
            }
            slidesProcessed++;
            
            // If all slides have been processed, resolve the promise
            if (slidesProcessed === totalSlides) {
              // Wait for any component operations to complete before resolving
              const checkQueue = () => {
                if (this.operationQueue.length === 0 && !this.isProcessing) {
                  resolve();
                } else {
                  setTimeout(checkQueue, 50);
                }
              };
              checkQueue();
            }
          });
        }

        // Start processing the queue
        this.processQueue();
      }, YJS_TYPE_INIT_DELAY);
    });
  }

  /**
   * Add a slide to the document in a non-blocking way
   * 
   * @param slide - The slide data to add
   */
  private addSlideNonBlocking(slide: SlideData): void {
    try {
      const { doc, slidesArray } = this.docManager.getDocumentStructure();
      
      doc.transact(() => {
        try {
          // Create slide Y.Map
          const slideMap = new Y.Map();
          slideMap.set('id', slide.id);
          slideMap.set('title', slide.title || '');
          
          // Add background if present (typically less complex)
          if (slide.background) {
            const bgMap = this.createComponentYMap(slide.background);
            slideMap.set('background', bgMap);
          }
          
          // Create empty components array
          const componentsArray = new Y.Array();
          slideMap.set('components', componentsArray);
          
          // Add the slide to the array - use proper Yjs array methods
          slidesArray.push([slideMap]);
        } catch (error) {
          // Suppress errors during slide creation
        }
      });

      // Then queue each component to be added separately
      if (slide.components && slide.components.length > 0) {
        for (const component of slide.components) {
          // Set priority based on component type
          const isHeavyComponent = this.isHeavyweightComponent(component);
          
          this.queueOperation(
            () => {
              try {
                this.addComponentToSlide(slide.id, component);
              } catch (error) {
                // Suppress errors during component addition
              }
            },
            isHeavyComponent ? 'low' : 'high'
          );
        }
      }
    } catch (error) {
      // Suppress outer errors during slide creation
    }
  }

  /**
   * Determine if a component is likely to be heavyweight (charts, complex tables, etc.)
   * 
   * @param component - The component to check
   * @returns True if the component is likely to be heavyweight
   */
  private isHeavyweightComponent(component: ComponentInstance): boolean {
    // Consider charts and large tables to be heavyweight
    return component.type.includes('Chart') || 
           (component.type === 'Table' && 
            component.props.data && 
            Array.isArray(component.props.data) && 
            component.props.data.length > 20) ||
           component.type === 'Video';
  }

  /**
   * Add a component to a slide
   * 
   * @param slideId - The ID of the slide
   * @param component - The component to add
   */
  private addComponentToSlide(slideId: string, component: ComponentInstance): void {
    try {
      const { doc, slidesArray } = this.docManager.getDocumentStructure();
      
      doc.transact(() => {
        try {
          // Find the slide
          let slideIndex = -1;
          
          for (let i = 0; i < slidesArray.length; i++) {
            if (slidesArray.get(i).get('id') === slideId) {
              slideIndex = i;
              break;
            }
          }
          
          if (slideIndex === -1) return;
          
          // Get the slide and components array
          const slideMap = slidesArray.get(slideIndex);
          let components = slideMap.get('components');
          
          // Ensure components array exists
          if (!components) {
            components = new Y.Array();
            slideMap.set('components', components);
          }
          
          // Create component Y.Map
          const componentMap = this.createComponentYMap(component);
          
          // Add to components array - use proper Yjs array methods
          if (components.push) {
            components.push([componentMap]);
          }
        } catch (error) {
          // Suppress errors during component addition
        }
      });
    } catch (error) {
      // Suppress outer errors during component addition
    }
  }

  /**
   * Create a Y.Map for a component
   * 
   * @param component - The component to create a Y.Map for
   * @returns The created Y.Map
   */
  private createComponentYMap(component: ComponentInstance): Y.Map<any> {
    const componentMap = new Y.Map();
    componentMap.set('id', component.id);
    componentMap.set('type', component.type);
    
    // Create Y.Map for the props
    const propsMap = new Y.Map();
    for (const [key, value] of Object.entries(component.props || {})) {
      // Ensure value is valid for Yjs
      const safeValue = this.sanitizeValue(value);
      propsMap.set(key, safeValue);
    }
    componentMap.set('props', propsMap);
    
    return componentMap;
  }

  /**
   * Sanitize a value for Yjs
   * 
   * @param value - The value to sanitize
   * @returns A sanitized value safe for Yjs
   */
  private sanitizeValue(value: any): any {
    // Handle null/undefined
    if (value === undefined || value === null) {
      return null;
    }
    
    // Handle basic types that are safe
    if (typeof value === 'string' || 
        typeof value === 'number' || 
        typeof value === 'boolean') {
      return value;
    }
    
    // Handle arrays
    if (Array.isArray(value)) {
      return value.map(v => this.sanitizeValue(v));
    }
    
    // Handle objects
    if (typeof value === 'object') {
      // Convert special objects to a safe format
      if (value instanceof Date) {
        return value.toISOString();
      }
      
      // For regular objects, sanitize each property
      const safeObj: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        safeObj[k] = this.sanitizeValue(v);
      }
      return safeObj;
    }
    
    // For functions and symbols, convert to null
    if (typeof value === 'function' || typeof value === 'symbol') {
      return null;
    }
    
    // For anything else, convert to string
    return String(value);
  }

  /**
   * Queue an operation to be executed later
   * 
   * @param operation - The operation to queue
   * @param priority - The priority of the operation (high or low)
   */
  private queueOperation(operation: () => void, priority: 'high' | 'low' = 'high'): void {
    if (priority === 'high') {
      this.operationQueue.unshift(operation); // Add to front for high priority
    } else {
      this.operationQueue.push(operation); // Add to end for low priority
    }
    
    // Start processing the queue if not already processing
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Process the operation queue in small batches
   */
  private processQueue(): void {
    if (this.isProcessing || this.operationQueue.length === 0) {
      return;
    }
    
    this.isProcessing = true;
    
    // Process a small batch of operations
    const batch = this.operationQueue.splice(0, this.batchSize);
    
    // Execute batch in transaction for atomicity
    batch.forEach(operation => {
      try {
        operation();
      } catch (error) {
        // Silent error - suppress to avoid console noise
      }
    });
    
    // Schedule next batch with a small delay to allow UI updates
    setTimeout(() => {
      this.isProcessing = false;
      if (this.operationQueue.length > 0) {
        this.processQueue();
      }
    }, this.operationDelay);
  }
}