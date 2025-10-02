/**
 * Connection pool for Yjs WebSocket providers
 * Implements efficient connection management and reuse
 */

import EventEmitter from 'events';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

export interface DocumentConnectionPoolOptions {
  /**
   * Maximum number of connections to manage
   */
  maxConnections: number;
  
  /**
   * WebSocket URL for connections
   */
  wsUrl: string;
  
  /**
   * Time in milliseconds after which an idle connection is considered stale
   * Default: 60000 (1 minute)
   */
  idleTimeoutMs?: number;
  
  /**
   * How often to check for stale connections
   * Default: 30000 (30 seconds)
   */
  cleanupIntervalMs?: number;
  
  /**
   * Whether to enable debug logging
   */
  debug?: boolean;
  
  /**
   * Optional custom logger
   */
  logger?: Console;
}

/**
 * A pooled WebSocket connection
 */
interface PooledConnection {
  /**
   * The WebSocket provider
   */
  provider: WebsocketProvider;
  
  /**
   * The Yjs document this provider is connected to
   */
  doc: Y.Doc;
  
  /**
   * Room this connection is for
   */
  room: string;
  
  /**
   * Last time this connection was used
   */
  lastUsed: number;
  
  /**
   * Whether this connection is currently in use
   */
  inUse: boolean;
  
  /**
   * Time when this connection was created
   */
  createdAt: number;
  
  /**
   * Usage count for this connection
   */
  usageCount: number;
}

/**
 * Manages a pool of WebSocket connections for Yjs documents
 * Implements connection reuse, lazy loading, and efficient disposal
 */
export class DocumentConnectionPool extends EventEmitter {
  /**
   * Active WebSocket connections
   */
  private connections: Map<string, PooledConnection> = new Map();
  
  /**
   * Queue of clients waiting for connections
   */
  private connectionQueue: Map<string, ((provider: WebsocketProvider) => void)[]> = new Map();
  
  /**
   * Cleanup interval timer
   */
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  /**
   * Connection pool options
   */
  private options: Required<DocumentConnectionPoolOptions>;
  
  /**
   * Connection delta compression enabled flag
   */
  private deltaCompressionEnabled = true;
  
  /**
   * Create a new DocumentConnectionPool
   */
  constructor(options: DocumentConnectionPoolOptions) {
    super();
    
    // Set default options
    this.options = {
      maxConnections: options.maxConnections,
      wsUrl: options.wsUrl,
      idleTimeoutMs: options.idleTimeoutMs ?? 60000,
      cleanupIntervalMs: options.cleanupIntervalMs ?? 30000,
      debug: options.debug ?? false,
      logger: options.logger ?? console
    };
    
    // Start periodic cleanup
    this.startCleanupTimer();
    
    this.log(`Created DocumentConnectionPool with maxConnections=${this.options.maxConnections}`);
  }
  
  /**
   * Get a WebSocket provider for a specific room
   * 
   * @param room The room name to connect to
   * @returns A WebSocket provider for the room
   */
  async getConnection(room: string): Promise<WebsocketProvider> {
    // Check if we already have an idle connection for this room
    const existingConnection = this.findIdleConnectionForRoom(room);
    if (existingConnection) {
      this.log(`Reusing existing connection for room ${room}`);
      
      // Mark as in use
      existingConnection.inUse = true;
      existingConnection.lastUsed = Date.now();
      existingConnection.usageCount++;
      
      return existingConnection.provider;
    }
    
    // Check if we're at the connection limit
    if (this.getActiveConnectionCount() >= this.options.maxConnections) {
      // We need to wait for a connection to become available
      this.log(`Connection limit reached, waiting for available connection for room ${room}`);
      
      // Return a promise that resolves when a connection becomes available
      return new Promise<WebsocketProvider>((resolve) => {
        // Add to the queue for this room
        if (!this.connectionQueue.has(room)) {
          this.connectionQueue.set(room, []);
        }
        
        this.connectionQueue.get(room)!.push(resolve);
      });
    }
    
    // Create a new connection
    return this.createNewConnection(room);
  }
  
  /**
   * Create a new WebSocket connection for a room
   */
  private async createNewConnection(room: string): Promise<WebsocketProvider> {
    this.log(`Creating new connection for room ${room}`);
    
    // Create a new Yjs document
    const doc = new Y.Doc();
    
    // Create a new provider
    const provider = new WebsocketProvider(
      this.options.wsUrl,
      room,
      doc,
      {
        connect: true,
        awareness: {
          // No custom options needed here as awareness will be
          // managed by YjsDocumentManager
        },
        params: {
          // Enable delta compression if supported
          deltaCompression: this.deltaCompressionEnabled ? 'true' : 'false'
        }
      }
    );
    
    // Create a new pooled connection
    const connection: PooledConnection = {
      provider,
      doc,
      room,
      lastUsed: Date.now(),
      inUse: true,
      createdAt: Date.now(),
      usageCount: 1
    };
    
    // Add to the connection map
    this.connections.set(room, connection);
    
    // Emit event
    this.emit('connection-created', { room });
    
    return provider;
  }
  
  /**
   * Find an idle connection for a room
   */
  private findIdleConnectionForRoom(room: string): PooledConnection | null {
    const connection = this.connections.get(room);
    if (connection && !connection.inUse) {
      return connection;
    }
    
    return null;
  }
  
  /**
   * Get the count of active connections
   */
  private getActiveConnectionCount(): number {
    return this.connections.size;
  }
  
  /**
   * Release a connection back to the pool
   * 
   * @param room The room name for the connection to release
   */
  releaseConnection(room: string): void {
    const connection = this.connections.get(room);
    if (!connection) {
      this.log(`Attempted to release non-existent connection for room ${room}`, 'warn');
      return;
    }
    
    this.log(`Releasing connection for room ${room}`);
    
    // Mark as no longer in use
    connection.inUse = false;
    connection.lastUsed = Date.now();
    
    // If someone is waiting for this room, give them this connection
    if (this.connectionQueue.has(room) && this.connectionQueue.get(room)!.length > 0) {
      const nextResolver = this.connectionQueue.get(room)!.shift()!;
      
      // Mark as in use again
      connection.inUse = true;
      connection.lastUsed = Date.now();
      connection.usageCount++;
      
      this.log(`Transferring released connection for room ${room} to waiting client`);
      
      // Resolve the waiting promise with this provider
      nextResolver(connection.provider);
      
      // Clean up the queue if it's empty
      if (this.connectionQueue.get(room)!.length === 0) {
        this.connectionQueue.delete(room);
      }
    }
    
    // Otherwise check if we need to find a connection for any other waiting room
    else if (this.getTotalQueuedClients() > 0) {
      // We'll let the cleanup timer handle this case
      // It's complex to reuse a connection for a different room,
      // as we'd need to disconnect and reconnect with a new room
    }
    
    // Emit event
    this.emit('connection-released', { room });
  }
  
  /**
   * Get the total number of clients waiting for connections
   */
  private getTotalQueuedClients(): number {
    let total = 0;
    for (const queue of this.connectionQueue.values()) {
      total += queue.length;
    }
    return total;
  }
  
  /**
   * Start the cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleConnections();
    }, this.options.cleanupIntervalMs);
  }
  
  /**
   * Cleanup idle connections
   */
  private cleanupIdleConnections(): void {
    const now = Date.now();
    const idleTimeout = this.options.idleTimeoutMs;
    
    // Find idle connections
    const idleConnections: string[] = [];
    for (const [room, connection] of this.connections.entries()) {
      if (!connection.inUse && (now - connection.lastUsed > idleTimeout)) {
        idleConnections.push(room);
      }
    }
    
    // Nothing to clean up
    if (idleConnections.length === 0) {
      return;
    }
    
    this.log(`Cleaning up ${idleConnections.length} idle connections`);
    
    // Clean up each idle connection
    for (const room of idleConnections) {
      this.destroyConnection(room);
    }
  }
  
  /**
   * Destroy a connection
   */
  private destroyConnection(room: string): void {
    const connection = this.connections.get(room);
    if (!connection) {
      return;
    }
    
    this.log(`Destroying connection for room ${room}`);
    
    // Disconnect the provider
    connection.provider.disconnect();
    
    // Destroy the document
    connection.doc.destroy();
    
    // Remove from the map
    this.connections.delete(room);
    
    // Emit event
    this.emit('connection-destroyed', { room });
  }
  
  /**
   * Destroy all connections and clean up resources
   */
  async destroy(): Promise<void> {
    this.log('Destroying all connections');
    
    // Stop the cleanup timer
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // Destroy all connections
    for (const [room] of this.connections) {
      this.destroyConnection(room);
    }
    
    // Clear the queue
    this.connectionQueue.clear();
    
    // Remove all listeners
    this.removeAllListeners();
  }
  
  /**
   * Enable or disable delta compression for new connections
   */
  setDeltaCompression(enabled: boolean): void {
    this.deltaCompressionEnabled = enabled;
    this.log(`Delta compression ${enabled ? 'enabled' : 'disabled'} for new connections`);
  }
  
  /**
   * Get the status of the connection pool
   */
  getStatus(): {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    queuedClients: number;
    oldestConnectionAge: number;
  } {
    const now = Date.now();
    
    let oldestConnectionTimestamp = now;
    let activeConnections = 0;
    
    for (const connection of this.connections.values()) {
      if (connection.inUse) {
        activeConnections++;
      }
      
      if (connection.createdAt < oldestConnectionTimestamp) {
        oldestConnectionTimestamp = connection.createdAt;
      }
    }
    
    return {
      totalConnections: this.connections.size,
      activeConnections,
      idleConnections: this.connections.size - activeConnections,
      queuedClients: this.getTotalQueuedClients(),
      oldestConnectionAge: now - oldestConnectionTimestamp
    };
  }
  
  /**
   * Log a message if debugging is enabled
   */
  private log(message: string, level: 'log' | 'warn' | 'error' = 'log'): void {
    if (this.options.debug) {
      this.options.logger[level](`[DocumentConnectionPool] ${message}`);
    }
  }
}