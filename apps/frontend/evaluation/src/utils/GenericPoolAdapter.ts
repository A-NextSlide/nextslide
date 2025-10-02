/**
 * Generic Pool Adapter
 * 
 * This is an adapter that wraps the generic-pool library to provide
 * a simpler interface consistent with our application architecture.
 */

import * as genericPool from 'generic-pool';

export interface PoolOptions {
  /**
   * The name of the pool, used for logging
   */
  name: string;
  
  /**
   * Maximum number of resources to create at any given time
   */
  max: number;
  
  /**
   * Minimum number of resources to keep in pool at any given time
   */
  min?: number;
  
  /**
   * Maximum number of queued requests allowed 
   */
  maxWaitingClients?: number;
  
  /**
   * Max milliseconds a resource can stay idle in pool before being removed
   */
  idleTimeoutMillis?: number;
  
  /**
   * Max milliseconds an aquire call will wait for a resource before timing out
   */
  acquireTimeoutMillis?: number;
  
  /**
   * Function to validate a resource before it is returned from the pool
   */
  validator?: (resource: any) => Promise<boolean>;
  
  /**
   * Logger to use for pool events
   */
  logger?: Console | { log: (...args: any[]) => void, error: (...args: any[]) => void, warn: (...args: any[]) => void };
}

/**
 * A generic resource pool implementation that wraps the generic-pool library
 */
export class GenericPoolAdapter<T> {
  private pool: genericPool.Pool<T>;
  private name: string;
  private logger: Console | { log: (...args: any[]) => void, error: (...args: any[]) => void, warn: (...args: any[]) => void };
  
  /**
   * Create a new pool
   * 
   * @param factory The factory to create new resources
   * @param destroyer The function to destroy resources
   * @param options Options for the pool
   */
  constructor(
    factory: () => Promise<T>,
    destroyer: (client: T) => Promise<void>,
    options: PoolOptions
  ) {
    this.name = options.name;
    this.logger = options.logger || console;
    
    // Create the pool factory
    const poolFactory: genericPool.Factory<T> = {
      create: factory,
      destroy: destroyer
    };
    
    // Create the pool options
    const poolOptions: genericPool.Options = {
      max: options.max,
      min: options.min || 0,
      maxWaitingClients: options.maxWaitingClients,
      idleTimeoutMillis: options.idleTimeoutMillis,
      acquireTimeoutMillis: options.acquireTimeoutMillis,
      testOnBorrow: options.validator !== undefined,
      testOnReturn: false,
      autostart: true
    };
    
    // Add validator if provided
    if (options.validator) {
      // We'll use the testOnBorrow option instead of validateOnBorrow
      const originalValidator = options.validator;
      poolOptions.testOnBorrow = true;
      
      // We need to add the validator to the factory object
      (poolFactory as any).validate = async (resource: T) => {
        try {
          return await originalValidator(resource);
        } catch (error) {
          this.logger.error(`Validation error in pool ${this.name}:`, error);
          return false;
        }
      };
    }
    
    // Create the pool
    this.pool = genericPool.createPool<T>(poolFactory, poolOptions);
    
    // Add event listeners
    this.pool.on('factoryCreateError', (err) => {
      this.logger.error(`Error creating resource in pool ${this.name}:`, err);
    });
    
    this.pool.on('factoryDestroyError', (err) => {
      this.logger.error(`Error destroying resource in pool ${this.name}:`, err);
    });
    
    this.logger.log(`Created pool ${this.name} with max=${options.max}, min=${options.min || 0}`);
  }
  
  /**
   * Acquire a resource from the pool
   */
  async acquire(): Promise<T> {
    try {
      const resource = await this.pool.acquire();
      this.logger.log(`Acquired resource from pool ${this.name} (${this.getPoolStats()})`);
      return resource;
    } catch (error) {
      this.logger.error(`Error acquiring resource from pool ${this.name}:`, error);
      throw error;
    }
  }
  
  /**
   * Release a resource back to the pool
   * 
   * @param resource The resource to release
   */
  async release(resource: T): Promise<void> {
    try {
      await this.pool.release(resource);
      this.logger.log(`Released resource back to pool ${this.name} (${this.getPoolStats()})`);
    } catch (error) {
      // Check if this is a "resource not part of pool" error
      if (error instanceof Error && error.message.includes('not member of pool')) {
        this.logger.warn(`Attempted to release a resource not part of pool ${this.name}. This is likely a resource created outside the pool.`);
        // Attempt to destroy the resource gracefully without affecting the pool
        try {
          const destroyFunction = (this.pool as any).factory.destroy;
          if (typeof destroyFunction === 'function') {
            await destroyFunction(resource);
            this.logger.log(`Successfully destroyed external resource not part of pool ${this.name}`);
          }
        } catch (destroyError) {
          this.logger.error(`Error destroying external resource not part of pool ${this.name}:`, destroyError);
        }
      } else {
        this.logger.error(`Error releasing resource to pool ${this.name}:`, error);
        throw error;
      }
    }
  }
  
  /**
   * Drain the pool and shut it down
   */
  async drain(): Promise<void> {
    try {
      this.logger.log(`Draining pool ${this.name}...`);
      await this.pool.drain();
      await this.pool.clear();
      this.logger.log(`Pool ${this.name} drained and cleared`);
    } catch (error) {
      this.logger.error(`Error draining pool ${this.name}:`, error);
      throw error;
    }
  }
  
  /**
   * Get the current status of the pool
   */
  getStatus(): { name: string; size: number; available: number; borrowed: number; pending: number; max: number; min: number } {
    // generic-pool exposes these properties directly on the pool object
    return {
      name: this.name,
      size: (this.pool as any).size,
      available: (this.pool as any).available,
      borrowed: (this.pool as any).borrowed,
      pending: (this.pool as any).pending,
      max: (this.pool as any).max,
      min: (this.pool as any).min
    };
  }
  
  /**
   * Get a string representation of the pool stats
   */
  private getPoolStats(): string {
    // Get stats directly from pool properties
    const size = (this.pool as any).size || 0;
    const available = (this.pool as any).available || 0;
    const borrowed = (this.pool as any).borrowed || 0;
    const pending = (this.pool as any).pending || 0;
    const max = (this.pool as any).max || 0;
    const min = (this.pool as any).min || 0;
    
    return `size=${size}, available=${available}, borrowed=${borrowed}, pending=${pending}, max=${max}, min=${min}`;
  }
} 