/**
 * DocumentShardManager - Implements document sharding for large presentations
 * 
 * This system splits a presentation into multiple Yjs documents for better performance:
 * - One master document for deck metadata and structure
 * - Individual slide documents that are loaded/unloaded based on visibility
 * - Optimized network traffic via connection pooling and delta compression
 */

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { YjsDocumentManager } from './YjsDocumentManager';
import { SlideData } from '../types/SlideTypes';
import { EventEmitter } from 'events';
import { ComponentInstance } from '../types/components';
import { ComponentLock, LockResponse, UserPresence, YjsDocOptions } from './YjsTypes';
import { DocumentConnectionPool } from './DocumentConnectionPool';

export interface ShardManagerOptions {
  /**
   * Maximum number of slide documents to keep loaded at once
   * Default: 5
   */
  maxLoadedDocuments?: number;
  
  /**
   * WebSocket URL for the Yjs server
   */
  wsUrl: string;
  
  /**
   * Room prefix for document rooms
   * Default: 'shared-doc'
   */
  roomPrefix?: string;
  
  /**
   * Whether to enable automatic document persistence
   * Default: true
   */
  persistenceEnabled?: boolean;
  
  /**
   * Maximum number of concurrent WebSocket connections
   * Default: 3
   */
  maxConnections?: number;
  
  /**
   * Whether to enable debug logging
   * Default: false
   */
  debug?: boolean;
  
  /**
   * Optional custom logger
   */
  logger?: Console;
}

/**
 * Information about a document shard
 */
interface DocumentShard {
  /**
   * The document manager for this shard
   */
  documentManager: YjsDocumentManager;
  
  /**
   * The slides in this shard
   */
  slideIds: Set<string>;
  
  /**
   * When this shard was last accessed
   */
  lastAccessed: number;
  
  /**
   * Whether this shard is being loaded
   */
  loading: boolean;
  
  /**
   * Whether this shard has been fully loaded
   */
  loaded: boolean;
}

/**
 * Document sharding manager for large presentations
 * Implements lazy loading and efficient document management
 */
export class DocumentShardManager extends EventEmitter {
  // Master document containing deck structure
  private masterDocument: YjsDocumentManager;
  
  // Slide-level document shards
  private documentShards: Map<string, DocumentShard> = new Map();
  
  // Connection pool for managing WebSocket connections
  private connectionPool: DocumentConnectionPool;
  
  // Options for this shard manager
  private options: Required<ShardManagerOptions>;
  
  // Recently accessed slide IDs (LRU cache)
  private recentlyAccessedSlideIds: string[] = [];
  
  // Map of slide IDs to shard IDs
  private slideToShardMap: Map<string, string> = new Map();
  
  // Currently visible slide IDs
  private visibleSlideIds: Set<string> = new Set();
  
  // Deck ID for this document collection
  private deckId: string;
  
  // User info for this client
  private userName: string;
  private userColor: string;
  
  /**
   * Create a new document shard manager
   * 
   * @param deckId The ID of the deck
   * @param userName The name of the current user
   * @param userColor The color for the current user
   * @param options Configuration options
   */
  constructor(
    deckId: string,
    userName: string,
    userColor: string,
    options: ShardManagerOptions
  ) {
    super();
    
    this.deckId = deckId;
    this.userName = userName;
    this.userColor = userColor;
    
    // Set default options
    this.options = {
      maxLoadedDocuments: options.maxLoadedDocuments ?? 5,
      wsUrl: options.wsUrl,
      roomPrefix: options.roomPrefix ?? 'shared-doc',
      persistenceEnabled: options.persistenceEnabled ?? true,
      maxConnections: options.maxConnections ?? 3,
      debug: options.debug ?? false,
      logger: options.logger ?? console
    };
    
    // Create connection pool
    this.connectionPool = new DocumentConnectionPool({
      maxConnections: this.options.maxConnections,
      wsUrl: this.options.wsUrl,
      debug: this.options.debug,
      logger: this.options.logger
    });
    
    // Initialize master document
    this.masterDocument = this.createDocumentManager(
      this.getMasterDocumentId(),
      true // Is master document
    );
    
    // Log initialization
    this.log(`Initialized DocumentShardManager for deck ${deckId} with maxLoadedDocuments=${this.options.maxLoadedDocuments}`);
  }
  
  /**
   * Create a new document manager for a specific shard
   */
  private createDocumentManager(docId: string, isMaster = false): YjsDocumentManager {
    const docOptions: YjsDocOptions = {
      docName: docId,
      wsUrl: this.options.wsUrl,
      userName: this.userName,
      userColor: this.userColor,
      persistenceEnabled: this.options.persistenceEnabled
    };
    
    return new YjsDocumentManager(docOptions, isMaster);
  }
  
  /**
   * Get the document ID for the master document
   */
  private getMasterDocumentId(): string {
    return `${this.options.roomPrefix}-${this.deckId}-master`;
  }
  
  /**
   * Get the document ID for a specific slide shard
   */
  private getSlideShardId(shardIndex: number): string {
    return `${this.options.roomPrefix}-${this.deckId}-shard-${shardIndex}`;
  }
  
  /**
   * Initialize with the complete slide structure
   * This sets up the master document and creates the initial sharding plan
   * 
   * @param slides All slides in the deck
   */
  async initialize(slides: SlideData[]): Promise<void> {
    // Set up the master document with all slide IDs and metadata
    const slideIds = slides.map(slide => slide.id);
    
    // Wait for master document to fully connect before continuing
    await this.ensureMasterDocumentConnected();
    
    // Initialize master document with slide structure
    await this.masterDocument.initializeWithSlideIds(slideIds, this.deckId);
    
    // Create the initial sharding plan
    this.createShardingPlan(slides);
    
    // Set up a periodic function to unload unused shards
    setInterval(() => this.unloadIdleDocuments(), 60000); // Check every minute
    
    this.log(`Initialized DocumentShardManager with ${slides.length} slides`);
    
    // Emit an event that we're ready
    this.emit('initialized');
  }
  
  /**
   * Wait for the master document to fully connect
   */
  private async ensureMasterDocumentConnected(): Promise<void> {
    return new Promise((resolve) => {
      if (this.masterDocument.isConnected()) {
        resolve();
        return;
      }
      
      const connectionHandler = () => {
        resolve();
        this.masterDocument.off('connected', connectionHandler);
      };
      
      this.masterDocument.on('connected', connectionHandler);
    });
  }
  
  /**
   * Create the initial sharding plan for the slides
   * This assigns each slide to a specific shard
   * 
   * @param slides All slides in the deck
   */
  private createShardingPlan(slides: SlideData[]): void {
    // For simplicity in the initial implementation, we'll put slidesPerShard slides in each shard
    // A more advanced version could use slide complexity or size to determine optimal allocation
    const slidesPerShard = 3; // 3 slides per shard as a starting point
    
    let currentShardIndex = 0;
    let currentShardSlideCount = 0;
    
    // Ensure the shard exists
    this.ensureShardExists(currentShardIndex);
    
    // Assign each slide to a shard
    for (const slide of slides) {
      // If the current shard is full, move to the next one
      if (currentShardSlideCount >= slidesPerShard) {
        currentShardIndex++;
        currentShardSlideCount = 0;
        
        // Ensure the new shard exists
        this.ensureShardExists(currentShardIndex);
      }
      
      // Get the current shard ID
      const shardId = this.getSlideShardId(currentShardIndex);
      
      // Assign this slide to the current shard
      this.slideToShardMap.set(slide.id, shardId);
      
      // Add this slide to the shard's slide list
      const shard = this.documentShards.get(shardId)!;
      shard.slideIds.add(slide.id);
      
      // Increment the slide count for this shard
      currentShardSlideCount++;
    }
    
    this.log(`Created sharding plan with ${currentShardIndex + 1} shards, ~${slidesPerShard} slides per shard`);
  }
  
  /**
   * Ensure a shard exists, creating it if necessary
   */
  private ensureShardExists(shardIndex: number): void {
    const shardId = this.getSlideShardId(shardIndex);
    
    if (!this.documentShards.has(shardId)) {
      this.documentShards.set(shardId, {
        documentManager: this.createDocumentManager(shardId),
        slideIds: new Set(),
        lastAccessed: Date.now(),
        loading: false,
        loaded: false
      });
    }
  }
  
  /**
   * Set the currently visible slides
   * This triggers loading/unloading documents as needed
   * 
   * @param slideIds Array of currently visible slide IDs
   * @param loadMode Optional loading mode: 'sync' (default), 'async', or 'prioritize-current'
   */
  async setVisibleSlides(
    slideIds: string[], 
    loadMode: 'sync' | 'async' | 'prioritize-current' = 'sync'
  ): Promise<void> {
    // Update the visible slides set
    this.visibleSlideIds = new Set(slideIds);
    
    // Mark these slides as recently accessed
    for (const slideId of slideIds) {
      this.markSlideAccessed(slideId);
    }
    
    if (loadMode === 'sync') {
      // Original synchronous loading - blocks UI until all slides are loaded
      const loadPromises = slideIds.map(slideId => this.loadDocumentForSlide(slideId));
      await Promise.all(loadPromises);
    } 
    else if (loadMode === 'prioritize-current') {
      // Prioritize loading the current slide (first in the array) synchronously
      // Then load the rest asynchronously
      if (slideIds.length > 0) {
        // Load the current slide synchronously
        await this.loadDocumentForSlide(slideIds[0]);
        
        // Load the rest asynchronously
        if (slideIds.length > 1) {
          const otherSlideIds = slideIds.slice(1);
          // Load other slides without awaiting
          setTimeout(() => {
            otherSlideIds.forEach(slideId => this.loadDocumentForSlide(slideId));
          }, 0);
        }
      }
    }
    else if (loadMode === 'async') {
      // Fully asynchronous loading - don't block UI at all
      setTimeout(() => {
        slideIds.forEach(slideId => this.loadDocumentForSlide(slideId));
      }, 0);
    }
    
    // Optionally unload documents that are no longer needed
    // (not doing this immediately to allow for fast navigation between slides)
  }
  
  /**
   * Mark a slide as recently accessed
   */
  private markSlideAccessed(slideId: string): void {
    // Remove from the list if it's already there
    const index = this.recentlyAccessedSlideIds.indexOf(slideId);
    if (index !== -1) {
      this.recentlyAccessedSlideIds.splice(index, 1);
    }
    
    // Add to the front of the list
    this.recentlyAccessedSlideIds.unshift(slideId);
    
    // If we have too many, remove the oldest
    if (this.recentlyAccessedSlideIds.length > this.options.maxLoadedDocuments * 3) {
      this.recentlyAccessedSlideIds.pop();
    }
    
    // Update the last accessed time for the shard
    const shardId = this.getShardIdForSlide(slideId);
    if (shardId && this.documentShards.has(shardId)) {
      const shard = this.documentShards.get(shardId)!;
      shard.lastAccessed = Date.now();
    }
  }
  
  /**
   * Get the shard ID for a specific slide
   */
  private getShardIdForSlide(slideId: string): string | null {
    return this.slideToShardMap.get(slideId) || null;
  }
  
  /**
   * Load the document for a specific slide if it's not already loaded
   */
  private async loadDocumentForSlide(slideId: string): Promise<YjsDocumentManager | null> {
    // Find which shard contains this slide
    const shardId = this.getShardIdForSlide(slideId);
    if (!shardId) {
      this.log(`Warning: No shard found for slide ${slideId}`, 'warn');
      return null;
    }
    
    // Get the shard
    const shard = this.documentShards.get(shardId)!;
    
    // If it's already loaded, just return it
    if (shard.loaded) {
      shard.lastAccessed = Date.now();
      return shard.documentManager;
    }
    
    // If it's currently loading, wait for it to finish
    if (shard.loading) {
      return new Promise((resolve) => {
        const checkLoaded = () => {
          if (shard.loaded) {
            shard.lastAccessed = Date.now();
            resolve(shard.documentManager);
            this.off('shard-loaded', checkLoaded);
          }
        };
        
        this.on('shard-loaded', checkLoaded);
      });
    }
    
    // Otherwise, load it
    shard.loading = true;
    
    try {
      // Get a connection to the server
      const provider = await this.connectionPool.getConnection(shardId);
      
      // Connect the document manager to this provider
      await shard.documentManager.connect(provider);
      
      // Initialize with the slides in this shard
      // We only need to do a full initialization if this is the first load
      if (!shard.loaded) {
        // We'll initialize the document with empty slides for now
        // The actual content will sync from the server
        const slideIdsArray = Array.from(shard.slideIds);
        await shard.documentManager.initializeForSlides(slideIdsArray);
      }
      
      // Mark as loaded
      shard.loading = false;
      shard.loaded = true;
      shard.lastAccessed = Date.now();
      
      // Emit event
      this.emit('shard-loaded', { shardId, slideIds: Array.from(shard.slideIds) });
      
      return shard.documentManager;
    } catch (error) {
      // Handle connection error
      shard.loading = false;
      this.log(`Error loading shard ${shardId}: ${error}`, 'error');
      
      // Emit error event
      this.emit('shard-error', { shardId, error });
      
      return null;
    }
  }
  
  /**
   * Unload documents that haven't been accessed recently
   */
  private async unloadIdleDocuments(): Promise<void> {
    // Don't unload if we have fewer documents than the max
    if (this.getLoadedDocumentCount() <= this.options.maxLoadedDocuments) {
      return;
    }
    
    // Sort shards by last accessed time (oldest first)
    const shards = Array.from(this.documentShards.entries())
      .filter(([_shardId, shard]) => shard.loaded)
      .sort(([_idA, shardA], [_idB, shardB]) => shardA.lastAccessed - shardB.lastAccessed);
    
    // Keep unloading until we're under the limit
    let unloaded = 0;
    for (const [shardId, shard] of shards) {
      // Never unload shards containing visible slides
      if (Array.from(shard.slideIds).some(slideId => this.visibleSlideIds.has(slideId))) {
        continue;
      }
      
      // Unload this shard
      await this.unloadShard(shardId);
      unloaded++;
      
      // Stop if we're under the limit
      if (this.getLoadedDocumentCount() <= this.options.maxLoadedDocuments) {
        break;
      }
    }
    
    if (unloaded > 0) {
      this.log(`Unloaded ${unloaded} idle shards`);
    }
  }
  
  /**
   * Unload a specific shard
   */
  private async unloadShard(shardId: string): Promise<void> {
    // Get the shard
    const shard = this.documentShards.get(shardId);
    if (!shard || !shard.loaded) {
      return;
    }
    
    // Save any pending changes
    await shard.documentManager.savePendingChanges();
    
    // Release the connection
    this.connectionPool.releaseConnection(shardId);
    
    // Mark as unloaded
    shard.loaded = false;
    
    // Emit event
    this.emit('shard-unloaded', { shardId, slideIds: Array.from(shard.slideIds) });
  }
  
  /**
   * Get the number of currently loaded documents
   */
  private getLoadedDocumentCount(): number {
    return Array.from(this.documentShards.values()).filter(shard => shard.loaded).length;
  }
  
  /**
   * Get slide data from the appropriate document
   * 
   * @param slideId The ID of the slide to get
   */
  async getSlideData(slideId: string): Promise<SlideData | null> {
    // Mark this slide as accessed
    this.markSlideAccessed(slideId);
    
    // Load the document if needed
    const docManager = await this.loadDocumentForSlide(slideId);
    if (!docManager) {
      return null;
    }
    
    // Get the slide from the document
    return docManager.getSlideData(slideId);
  }
  
  /**
   * Update a slide in the appropriate document
   * 
   * @param slideId The ID of the slide to update
   * @param slideData The new slide data
   */
  async updateSlide(slideId: string, slideData: Partial<SlideData>): Promise<void> {
    // Mark this slide as accessed
    this.markSlideAccessed(slideId);
    
    // Load the document if needed
    const docManager = await this.loadDocumentForSlide(slideId);
    if (!docManager) {
      this.log(`Cannot update slide ${slideId}: Document not loaded`, 'warn');
      return;
    }
    
    // Update the slide in the document
    await docManager.updateSlide(slideId, slideData);
  }
  
  /**
   * Update a component in a slide
   * 
   * @param slideId The ID of the slide containing the component
   * @param componentId The ID of the component to update
   * @param props The new component properties
   */
  async updateComponent(
    slideId: string,
    componentId: string,
    props: Partial<ComponentInstance['props']>
  ): Promise<void> {
    // Mark this slide as accessed
    this.markSlideAccessed(slideId);
    
    // Load the document if needed
    const docManager = await this.loadDocumentForSlide(slideId);
    if (!docManager) {
      this.log(`Cannot update component ${componentId}: Document not loaded`, 'warn');
      return;
    }
    
    // Update the component in the document
    await docManager.updateComponent(slideId, componentId, props);
  }
  
  /**
   * Add a component to a slide
   * 
   * @param slideId The ID of the slide to add the component to
   * @param component The component to add
   */
  async addComponent(slideId: string, component: ComponentInstance): Promise<void> {
    // Mark this slide as accessed
    this.markSlideAccessed(slideId);
    
    // Load the document if needed
    const docManager = await this.loadDocumentForSlide(slideId);
    if (!docManager) {
      this.log(`Cannot add component to slide ${slideId}: Document not loaded`, 'warn');
      return;
    }
    
    // Add the component to the document
    await docManager.addComponent(slideId, component);
  }
  
  /**
   * Remove a component from a slide
   * 
   * @param slideId The ID of the slide containing the component
   * @param componentId The ID of the component to remove
   */
  async removeComponent(slideId: string, componentId: string): Promise<void> {
    // Mark this slide as accessed
    this.markSlideAccessed(slideId);
    
    // Load the document if needed
    const docManager = await this.loadDocumentForSlide(slideId);
    if (!docManager) {
      this.log(`Cannot remove component ${componentId}: Document not loaded`, 'warn');
      return;
    }
    
    // Remove the component from the document
    await docManager.removeComponent(slideId, componentId);
  }
  
  /**
   * Update cursor position for the current user
   * 
   * @param slideId The ID of the slide where the cursor is positioned
   * @param x The x coordinate of the cursor
   * @param y The y coordinate of the cursor
   */
  async updateCursor(slideId: string, x: number, y: number): Promise<void> {
    // Mark this slide as accessed
    this.markSlideAccessed(slideId);
    
    // Load the document if needed
    const docManager = await this.loadDocumentForSlide(slideId);
    if (!docManager) {
      return;
    }
    
    // Update the cursor in the document
    docManager.updateCursor(x, y);
  }
  
  /**
   * Update selection for the current user
   * 
   * @param slideId The ID of the slide where the selection is happening
   * @param componentIds The IDs of the selected components
   */
  async updateSelection(slideId: string, componentIds: string[]): Promise<void> {
    // Mark this slide as accessed
    this.markSlideAccessed(slideId);
    
    // Load the document if needed
    const docManager = await this.loadDocumentForSlide(slideId);
    if (!docManager) {
      return;
    }
    
    // Update the selection in the document
    docManager.updateSelection(componentIds);
  }
  
  /**
   * Request a lock on a component
   * 
   * @param slideId The ID of the slide containing the component
   * @param componentId The ID of the component to lock
   */
  async requestLock(slideId: string, componentId: string): Promise<LockResponse> {
    // Mark this slide as accessed
    this.markSlideAccessed(slideId);
    
    // Load the document if needed
    const docManager = await this.loadDocumentForSlide(slideId);
    if (!docManager) {
      return {
        slideId,
        componentId,
        granted: false,
        error: 'Document not loaded'
      };
    }
    
    // Request the lock from the document
    return docManager.requestLock(slideId, componentId);
  }
  
  /**
   * Release a lock on a component
   * 
   * @param slideId The ID of the slide containing the component
   * @param componentId The ID of the component to unlock
   * @param force Force release even if not the lock owner
   */
  async releaseLock(slideId: string, componentId: string, force = false): Promise<boolean> {
    // Mark this slide as accessed
    this.markSlideAccessed(slideId);
    
    // Load the document if needed
    const docManager = await this.loadDocumentForSlide(slideId);
    if (!docManager) {
      return false;
    }
    
    // Release the lock in the document
    return docManager.releaseLock(slideId, componentId, force);
  }
  
  /**
   * Get all locks for a specific slide
   * 
   * @param slideId The ID of the slide to get locks for
   */
  async getLocksForSlide(slideId: string): Promise<ComponentLock[]> {
    // Mark this slide as accessed
    this.markSlideAccessed(slideId);
    
    // Load the document if needed
    const docManager = await this.loadDocumentForSlide(slideId);
    if (!docManager) {
      return [];
    }
    
    // Get locks from the document
    return docManager.getAllLocks();
  }
  
  /**
   * Get all connected users for a specific slide
   * 
   * @param slideId The ID of the slide to get users for
   */
  async getUsersForSlide(slideId: string): Promise<UserPresence[]> {
    // Mark this slide as accessed
    this.markSlideAccessed(slideId);
    
    // Load the document if needed
    const docManager = await this.loadDocumentForSlide(slideId);
    if (!docManager) {
      return [];
    }
    
    // Get users from the document
    return docManager.getConnectedUsers();
  }
  
  /**
   * Clean up resources used by this manager
   */
  async destroy(): Promise<void> {
    // Clean up all document managers
    const destroyPromises = [];
    
    // Destroy all shard documents
    for (const [_shardId, shard] of this.documentShards) {
      if (shard.loaded) {
        destroyPromises.push(shard.documentManager.destroy());
      }
    }
    
    // Destroy the master document
    destroyPromises.push(this.masterDocument.destroy());
    
    // Clean up connection pool
    destroyPromises.push(this.connectionPool.destroy());
    
    // Wait for all to complete
    await Promise.all(destroyPromises);
    
    // Clear all data structures
    this.documentShards.clear();
    this.slideToShardMap.clear();
    this.recentlyAccessedSlideIds = [];
    this.visibleSlideIds.clear();
    
    // Remove all listeners
    this.removeAllListeners();
  }
  
  /**
   * Log a message if debugging is enabled
   */
  private log(message: string, level: 'log' | 'warn' | 'error' = 'log'): void {
    if (this.options.debug) {
      this.options.logger[level](`[DocumentShardManager] ${message}`);
    }
  }
}