/**
 * DeckYjsAdapter - Integration layer between deck store and sharded Yjs documents
 * 
 * This adapter:
 * 1. Provides a consistent interface for deck store operations to interact with sharded documents
 * 2. Handles routing operations to the appropriate document shards
 * 3. Maintains synchronization between store state and Yjs documents
 * 4. Implements efficient batch operations for performance
 */

import { ShardedYjsContextType } from '@/yjs/ShardedYjsProvider';
import { SlideData } from '@/types/SlideTypes';
import { ComponentInstance } from '@/types/components';
import { CompleteDeckData } from '@/types/DeckTypes';

export class DeckYjsAdapter {
  private yjsContext: ShardedYjsContextType;
  private visibleSlideIds: string[] = [];
  private pendingOperations: Map<string, Promise<any>> = new Map();

  /**
   * Create a new DeckYjsAdapter
   * @param yjsContext The ShardedYjs context from the provider
   */
  constructor(yjsContext: ShardedYjsContextType) {
    this.yjsContext = yjsContext;
  }

  /**
   * Set the currently visible slides
   * @param slideIds Array of visible slide IDs
   * @param loadMode Optional loading mode: 'sync' (default), 'async', or 'prioritize-current'
   */
  public async setVisibleSlides(
    slideIds: string[],
    loadMode: 'sync' | 'async' | 'prioritize-current' = 'sync'
  ): Promise<void> {
    this.visibleSlideIds = [...slideIds];
    await this.yjsContext.setVisibleSlides(slideIds, loadMode);
  }

  /**
   * Get the list of currently visible slides
   */
  public getVisibleSlides(): string[] {
    return [...this.visibleSlideIds];
  }

  /**
   * Check if a slide is currently visible/loaded
   * @param slideId The slide ID to check
   */
  public isSlideVisible(slideId: string): boolean {
    return this.visibleSlideIds.includes(slideId);
  }

  /**
   * Update slide properties
   * @param slideId Slide ID to update
   * @param data Partial slide data to update
   */
  public async updateSlide(slideId: string, data: Partial<SlideData>): Promise<void> {
    // Ensure the slide is loaded - use 'sync' mode for updates since
    // we need to ensure the slide is loaded before updating
    if (!this.isSlideVisible(slideId)) {
      await this.loadSlide(slideId, 'sync');
    }

    // Execute the update
    const operationKey = `slide:${slideId}:update`;
    const operation = this.yjsContext.updateSlide(slideId, data);
    this.pendingOperations.set(operationKey, operation);
    
    try {
      await operation;
    } finally {
      // Clean up completed operation
      if (this.pendingOperations.get(operationKey) === operation) {
        this.pendingOperations.delete(operationKey);
      }
    }
  }

  /**
   * Update component properties
   * @param slideId Slide containing the component
   * @param componentId Component ID to update
   * @param props New component properties
   */
  public async updateComponent(
    slideId: string, 
    componentId: string, 
    props: Partial<ComponentInstance['props']>
  ): Promise<void> {
    // Ensure the slide is loaded - use 'sync' mode for updates since
    // we need to ensure the slide is loaded before updating
    if (!this.isSlideVisible(slideId)) {
      await this.loadSlide(slideId, 'sync');
    }

    // Execute the update
    const operationKey = `component:${slideId}:${componentId}:update`;
    const operation = this.yjsContext.updateComponent(slideId, componentId, props);
    this.pendingOperations.set(operationKey, operation);
    
    try {
      await operation;
    } finally {
      // Clean up completed operation
      if (this.pendingOperations.get(operationKey) === operation) {
        this.pendingOperations.delete(operationKey);
      }
    }
  }

  /**
   * Add a new component to a slide
   * @param slideId Slide ID to add the component to
   * @param component Component instance to add
   */
  public async addComponent(slideId: string, component: ComponentInstance): Promise<void> {
    // Ensure the slide is loaded - use 'sync' mode for updates since
    // we need to ensure the slide is loaded before updating
    if (!this.isSlideVisible(slideId)) {
      await this.loadSlide(slideId, 'sync');
    }

    // Execute the add operation
    const operationKey = `component:${slideId}:${component.id}:add`;
    const operation = this.yjsContext.addComponent(slideId, component);
    this.pendingOperations.set(operationKey, operation);
    
    try {
      await operation;
    } finally {
      // Clean up completed operation
      if (this.pendingOperations.get(operationKey) === operation) {
        this.pendingOperations.delete(operationKey);
      }
    }
  }

  /**
   * Remove a component from a slide
   * @param slideId Slide ID to remove the component from
   * @param componentId Component ID to remove
   */
  public async removeComponent(slideId: string, componentId: string): Promise<void> {
    // Ensure the slide is loaded - use 'sync' mode for updates since
    // we need to ensure the slide is loaded before updating
    if (!this.isSlideVisible(slideId)) {
      await this.loadSlide(slideId, 'sync');
    }

    // Execute the remove operation
    const operationKey = `component:${slideId}:${componentId}:remove`;
    const operation = this.yjsContext.removeComponent(slideId, componentId);
    this.pendingOperations.set(operationKey, operation);
    
    try {
      await operation;
    } finally {
      // Clean up completed operation
      if (this.pendingOperations.get(operationKey) === operation) {
        this.pendingOperations.delete(operationKey);
      }
    }
  }

  /**
   * Get information about document locks
   * @param slideId Slide ID to check
   */
  public async getLocksForSlide(slideId: string): Promise<any[]> {
    // Ensure the slide is loaded
    if (!this.isSlideVisible(slideId)) {
      try {
        // We can use 'async' mode here since we don't need immediate results
        await this.loadSlide(slideId, 'async');
      } catch (err) {
        console.warn(`Failed to load slide ${slideId} for locks:`, err);
        return [];
      }
    }

    return this.yjsContext.getLocksForSlide(slideId);
  }

  /**
   * Load a slide that may not be currently visible
   * @param slideId Slide ID to load
   * @param loadMode Optional loading mode: 'sync' (default), 'async', or 'prioritize-current'
   */
  private async loadSlide(
    slideId: string,
    loadMode: 'sync' | 'async' | 'prioritize-current' = 'sync'
  ): Promise<void> {
    // Temporarily add this slide to visible slides to ensure it's loaded
    const newVisibleSlides = [...this.visibleSlideIds, slideId];
    await this.yjsContext.setVisibleSlides(newVisibleSlides, loadMode);
  }

  /**
   * Update the cursor position
   * @param slideId Slide ID where the cursor is
   * @param x X coordinate
   * @param y Y coordinate
   */
  public async updateCursor(slideId: string, x: number, y: number): Promise<void> {
    if (!this.isSlideVisible(slideId)) return;
    
    await this.yjsContext.updateCursor(slideId, x, y);
  }

  /**
   * Update the current selection
   * @param slideId Slide ID where the selection is
   * @param componentIds Array of selected component IDs
   */
  public async updateSelection(slideId: string, componentIds: string[]): Promise<void> {
    if (!this.isSlideVisible(slideId)) return;
    
    await this.yjsContext.updateSelection(slideId, componentIds);
  }

  /**
   * Request a lock on a component
   * @param slideId Slide ID containing the component
   * @param componentId Component ID to lock
   */
  public async requestLock(slideId: string, componentId: string): Promise<any> {
    if (!this.isSlideVisible(slideId)) {
      // Need to use sync mode for lock requests to ensure proper locking
      await this.loadSlide(slideId, 'sync');
    }
    
    return this.yjsContext.requestLock(slideId, componentId);
  }

  /**
   * Release a lock on a component
   * @param slideId Slide ID containing the component
   * @param componentId Component ID to unlock
   * @param force Whether to force the release even if not the owner
   */
  public async releaseLock(slideId: string, componentId: string, force = false): Promise<boolean> {
    if (!this.isSlideVisible(slideId)) return false;
    
    return this.yjsContext.releaseLock(slideId, componentId, force);
  }

  /**
   * Get connection statistics
   */
  public getConnectionStats(): {
    activeConnections: number;
    totalConnections: number;
    queuedConnections: number;
  } {
    return this.yjsContext.connectionStats;
  }
}

export default DeckYjsAdapter;