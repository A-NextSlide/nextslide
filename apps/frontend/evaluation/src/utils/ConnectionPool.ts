/**
 * A generic connection pool implementation for managing service connections
 * This ensures we don't overwhelm services with too many concurrent connections
 * and properly reuse connections when possible.
 */

import EventEmitter from 'events';

interface PooledResource<T> {
  resource: T;
  lastUsed: number;
  inUse: boolean;
}

export interface ConnectionPoolOptions {
  /**
   * Maximum number of connections to keep in the pool
   */
  maxConnections: number;

  /**
   * Time in milliseconds after which an idle connection is considered stale and can be cleaned up
   * Default: 60000 (1 minute)
   */
  idleTimeoutMs?: number;

  /**
   * How often to check for stale connections in milliseconds
   * Default: 30000 (30 seconds)
   */
  cleanupIntervalMs?: number;

  /**
   * Maximum time in milliseconds to wait for a connection before timing out
   * Default: 30000 (30 seconds)
   */
  connectionTimeoutMs?: number;

  /**
   * Time to wait in milliseconds before retrying to get a connection when pool is full
   * Default: 100ms
   */
  retryDelayMs?: number;

  /**
   * Whether to validate connections before returning them from the pool
   * Default: true
   */
  validateOnBorrow?: boolean;

  /**
   * Maximum time a connection can be used before it's automatically released back to the pool
   * (to prevent connection hogging)
   * Default: 5 minutes
   */
  maxConnectionUseTimeMs?: number;

  /**
   * Logger to use for pool events
   */
  logger?: Console | { log: (...args: any[]) => void, error: (...args: any[]) => void, warn: (...args: any[]) => void };
}

/**
 * Generic connection pool for managing service connections
 */
export class ConnectionPool<T> extends EventEmitter {
  private resources: PooledResource<T>[] = [];
  private factory: () => Promise<T>;
  private destroyer: (resource: T) => Promise<void>;
  private validator: (resource: T) => Promise<boolean>;
  private waitingQueue: ((resource: T) => void)[] = [];
  private cleanupInterval: NodeJS.Timeout | null = null;
  private options: Required<ConnectionPoolOptions>;
  private name: string;
  private closed = false;

  /**
   * Create a new connection pool
   * 
   * @param name Name of the pool for logging and diagnostics
   * @param factory Function that creates a new connection
   * @param destroyer Function that properly closes a connection
   * @param validator Function that checks if a connection is still valid
   * @param options Pool configuration options
   */
  constructor(
    name: string,
    factory: () => Promise<T>,
    destroyer: (resource: T) => Promise<void>,
    validator: (resource: T) => Promise<boolean>,
    options: ConnectionPoolOptions
  ) {
    super();
    this.name = name;
    this.factory = factory;
    this.destroyer = destroyer;
    this.validator = validator;
    this.options = {
      maxConnections: options.maxConnections,
      idleTimeoutMs: options.idleTimeoutMs ?? 60000,
      cleanupIntervalMs: options.cleanupIntervalMs ?? 30000,
      connectionTimeoutMs: options.connectionTimeoutMs ?? 30000,
      retryDelayMs: options.retryDelayMs ?? 100,
      validateOnBorrow: options.validateOnBorrow ?? true,
      maxConnectionUseTimeMs: options.maxConnectionUseTimeMs ?? 300000,
      logger: options.logger ?? console
    };

    // Start periodic cleanup of idle connections
    this.startCleanupTimer();
    this.options.logger.log(`Created connection pool '${name}' with max ${this.options.maxConnections} connections`);
  }

  /**
   * Get a connection from the pool, or create a new one if needed
   */
  async getConnection(timeoutMs?: number): Promise<T> {
    if (this.closed) {
      throw new Error(`Cannot get connection from closed pool '${this.name}'`);
    }

    const timeout = timeoutMs ?? this.options.connectionTimeoutMs;
    const startTime = Date.now();

    // First, try to get an existing idle connection
    const existingResource = this.resources.find(r => !r.inUse);
    if (existingResource) {
      // If we need to validate, check the connection first
      if (this.options.validateOnBorrow) {
        try {
          const isValid = await this.validator(existingResource.resource);
          if (isValid) {
            existingResource.inUse = true;
            existingResource.lastUsed = Date.now();
            this.options.logger.log(`Reusing connection from pool '${this.name}', ${this.getResourceCount()}`);
            return existingResource.resource;
          } else {
            // Connection is no longer valid, remove it and create a new one
            this.options.logger.warn(`Invalid connection found in pool '${this.name}', removing and creating new one`);
            await this.removeAndDestroyResource(existingResource);
          }
        } catch (error) {
          // Error during validation, remove the connection
          this.options.logger.error(`Error validating connection from pool '${this.name}':`, error);
          await this.removeAndDestroyResource(existingResource);
        }
      } else {
        // No validation needed, just return the connection
        existingResource.inUse = true;
        existingResource.lastUsed = Date.now();
        this.options.logger.log(`Reusing connection from pool '${this.name}', ${this.getResourceCount()}`);
        return existingResource.resource;
      }
    }

    // If we can create a new connection, do so
    if (this.resources.length < this.options.maxConnections) {
      try {
        const newResource = await this.factory();
        const pooledResource: PooledResource<T> = {
          resource: newResource,
          lastUsed: Date.now(),
          inUse: true
        };
        this.resources.push(pooledResource);
        this.options.logger.log(`Created new connection for pool '${this.name}', ${this.getResourceCount()}`);
        
        // Set up auto-release for this connection if needed
        if (this.options.maxConnectionUseTimeMs > 0) {
          setTimeout(() => {
            if (pooledResource.inUse) {
              this.options.logger.warn(`Auto-releasing connection from pool '${this.name}' that was used too long (${this.options.maxConnectionUseTimeMs}ms)`);
              this.releaseConnection(pooledResource.resource).catch(err => {
                this.options.logger.error(`Error auto-releasing connection from pool '${this.name}':`, err);
              });
            }
          }, this.options.maxConnectionUseTimeMs);
        }
        
        return newResource;
      } catch (error) {
        this.options.logger.error(`Error creating connection for pool '${this.name}':`, error);
        throw error;
      }
    }

    // If we're here, pool is full and all connections are in use
    // Add to the waiting queue and wait for a connection to be released
    return new Promise<T>((resolve, reject) => {
      const checkTimeout = () => {
        if (Date.now() - startTime >= timeout) {
          // Remove from queue
          const index = this.waitingQueue.indexOf(resolver);
          if (index !== -1) {
            this.waitingQueue.splice(index, 1);
          }
          reject(new Error(`Timeout waiting for connection from pool '${this.name}' after ${timeout}ms`));
        } else {
          // Schedule another check
          setTimeout(checkTimeout, 1000);
        }
      };

      // Start timeout checker
      checkTimeout();

      // Add to the waiting queue
      const resolver = (resource: T) => {
        resolve(resource);
      };
      
      this.waitingQueue.push(resolver);
      this.options.logger.log(`Waiting for connection from pool '${this.name}', ${this.getResourceCount()} (queue: ${this.waitingQueue.length})`);
    });
  }

  /**
   * Release a connection back to the pool
   */
  async releaseConnection(resource: T): Promise<void> {
    const resourceEntry = this.resources.find(r => r.resource === resource);
    if (!resourceEntry) {
      this.options.logger.warn(`Attempted to release a connection that is not part of pool '${this.name}'`);
      return;
    }

    // Mark as no longer in use
    resourceEntry.inUse = false;
    resourceEntry.lastUsed = Date.now();

    // If someone is waiting for a connection, give it to them
    if (this.waitingQueue.length > 0) {
      const nextResolver = this.waitingQueue.shift()!;
      resourceEntry.inUse = true;
      resourceEntry.lastUsed = Date.now();
      this.options.logger.log(`Releasing connection from pool '${this.name}' directly to a waiting request, ${this.getResourceCount()} (queue: ${this.waitingQueue.length})`);
      nextResolver(resource);
    } else {
      this.options.logger.log(`Released connection back to pool '${this.name}', ${this.getResourceCount()}`);
    }

    // Emit event that a connection was released
    this.emit('connectionReleased', { resource, poolSize: this.resources.length });
  }

  /**
   * Close all connections in the pool and stop the cleanup timer
   */
  async close(): Promise<void> {
    this.closed = true;
    
    // Stop cleanup timer
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Destroy all resources
    const destroyPromises = this.resources.map(async (resource) => {
      try {
        await this.destroyer(resource.resource);
      } catch (error) {
        this.options.logger.error(`Error destroying connection from pool '${this.name}':`, error);
      }
    });

    await Promise.all(destroyPromises);
    this.resources = [];
    this.options.logger.log(`Closed connection pool '${this.name}'`);
  }

  /**
   * Get information about the current state of the pool
   */
  getStatus(): {
    name: string;
    total: number;
    inUse: number;
    idle: number;
    waitingCount: number;
    maxConnections: number;
  } {
    const inUse = this.resources.filter(r => r.inUse).length;
    return {
      name: this.name,
      total: this.resources.length,
      inUse,
      idle: this.resources.length - inUse,
      waitingCount: this.waitingQueue.length,
      maxConnections: this.options.maxConnections
    };
  }

  /**
   * Return a string with the current resource count
   */
  private getResourceCount(): string {
    const inUse = this.resources.filter(r => r.inUse).length;
    const total = this.resources.length;
    return `${inUse}/${total} in use (max: ${this.options.maxConnections})`;
  }

  /**
   * Start the timer that periodically cleans up idle connections
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleConnections().catch(err => {
        this.options.logger.error(`Error during connection pool cleanup for '${this.name}':`, err);
      });
    }, this.options.cleanupIntervalMs);
  }

  /**
   * Clean up idle connections that have been unused for too long
   */
  private async cleanupIdleConnections(): Promise<void> {
    const now = Date.now();
    const idleTimeout = this.options.idleTimeoutMs;
    const idleResources = this.resources.filter(r => !r.inUse && (now - r.lastUsed > idleTimeout));

    if (idleResources.length > 0) {
      this.options.logger.log(`Cleaning up ${idleResources.length} idle connections from pool '${this.name}'`);
      
      for (const resource of idleResources) {
        await this.removeAndDestroyResource(resource);
      }
    }
  }

  /**
   * Remove a resource from the pool and destroy it
   */
  private async removeAndDestroyResource(resource: PooledResource<T>): Promise<void> {
    // Remove from the resources array
    const index = this.resources.indexOf(resource);
    if (index !== -1) {
      this.resources.splice(index, 1);
    }

    // Destroy the resource
    try {
      await this.destroyer(resource.resource);
    } catch (error) {
      this.options.logger.error(`Error destroying connection from pool '${this.name}':`, error);
    }
  }
} 