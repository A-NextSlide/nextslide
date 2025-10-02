/**
 * Improved Service Connection Manager
 * 
 * This manages connection pools for various services used throughout the application.
 * It ensures we reuse connections efficiently and don't overwhelm services with 
 * too many concurrent connections.
 * 
 * This implementation uses the generic-pool library for more robust connection pooling.
 */

import { GenericPoolAdapter } from './GenericPoolAdapter';
import { ChatApiService } from '../api/ChatApiService';
import { ApiClientAdapter, ApiClientConfig } from './ApiClientAdapter';
import { Logger } from './logging';
import { defaults } from './config';

// Type for chat API config
interface ChatApiConfig {
  apiKey?: string;
  mockResponses?: boolean;
  baseUrl?: string;
}

/**
 * This class manages service connections and pools them
 * to avoid creating too many connections.
 */
export class ImprovedServiceConnectionManager {
  private chatApiPool: GenericPoolAdapter<ChatApiService>;
  private apiClientPools: Map<string, GenericPoolAdapter<ApiClientAdapter>> = new Map();
  private logger: Console;
  private static instance: ImprovedServiceConnectionManager;

  /**
   * Get the singleton instance of the connection manager
   */
  public static getInstance(logger: Console = console): ImprovedServiceConnectionManager {
    if (!ImprovedServiceConnectionManager.instance) {
      ImprovedServiceConnectionManager.instance = new ImprovedServiceConnectionManager(logger);
    }
    return ImprovedServiceConnectionManager.instance;
  }

  /**
   * Create a new service connection manager
   * @param logger Logger to use for connection events
   */
  private constructor(logger: Console) {
    this.logger = logger;
    
    // Initialize the chat API pool
    this.chatApiPool = this.createChatApiPool();
    
    this.logger.info('Improved Service Connection Manager initialized');
  }

  /**
   * Create a connection pool for the ChatApiService
   */
  private createChatApiPool(): GenericPoolAdapter<ChatApiService> {
    const defaultConfig: ChatApiConfig = {
      mockResponses: false
    };
    
    // Get configuration values from our config defaults
    const apiMaxConnections = defaults.chatApi.maxConnections || 5;
    const apiPoolTimeout = 180000; // 3 minutes - from defaultStepConfig for 'Generate Deck Diff'
    
    this.logger.info(`Creating ChatApiService pool with max=${apiMaxConnections} connections and timeout=${apiPoolTimeout}ms`);
    
    return new GenericPoolAdapter<ChatApiService>(
      // Factory function to create a new ChatApiService
      async () => new ChatApiService(defaultConfig),
      // Destroyer function to clean up a ChatApiService
      async (service: ChatApiService) => {
        // Just a no-op cleanup since ChatApiService doesn't have a cleanup method
      },
      // Pool options
      {
        name: 'ChatApiService',
        max: apiMaxConnections,
        min: 1,
        idleTimeoutMillis: defaults.chatApi.idleTimeoutMs || 5 * 60 * 1000, // 5 minutes
        acquireTimeoutMillis: apiPoolTimeout,
        maxWaitingClients: 10, // Allow a reasonable number of waiting clients
        logger: this.logger,
        validator: async (service: ChatApiService) => {
          try {
            // Try a simple operation to verify the service is working
            // For now, just assume it's valid
            return true;
          } catch (error) {
            return false;
          }
        }
      }
    );
  }

  /**
   * Create or get a connection pool for the ApiClientAdapter with a specific baseUrl
   * This ensures we have separate pools for different base URLs
   */
  private getOrCreateApiClientPool(baseUrl: string): GenericPoolAdapter<ApiClientAdapter> {
    // Check if we already have a pool for this baseUrl
    const poolKey = `ApiClient:${baseUrl}`;
    if (this.apiClientPools.has(poolKey)) {
      return this.apiClientPools.get(poolKey)!;
    }
    
    // Get configuration values from our config defaults
    const apiMaxConnections = defaults.apiServer?.maxConnections || 3;
    const apiPoolTimeout = 60000; // 1 minute - from renderingOptions.requestTimeoutMs in defaultStepConfig
    
    // Create a new pool for this baseUrl
    this.logger.info(`Creating new ApiClientAdapter pool for baseUrl: ${baseUrl} with max=${apiMaxConnections} connections and timeout=${apiPoolTimeout}ms`);
    
    const pool = new GenericPoolAdapter<ApiClientAdapter>(
      // Factory function to create a new ApiClientAdapter
      async () => {
        return new ApiClientAdapter({
          baseUrl: baseUrl,
          logger: this.logger
        });
      },
      // Destroyer function to clean up an ApiClientAdapter
      async (client: ApiClientAdapter) => {
        // Call close method to clean up
        await client.close();
      },
      // Pool options
      {
        name: `ApiClient:${baseUrl}`,
        max: apiMaxConnections,
        min: 1, // Keep at least 1 connection ready
        idleTimeoutMillis: defaults.apiServer?.idleTimeoutMs || 5 * 60 * 1000, // 5 minutes
        acquireTimeoutMillis: apiPoolTimeout,
        maxWaitingClients: 10, // Allow a reasonable number of waiting clients
        logger: this.logger,
        validator: async (client: ApiClientAdapter) => {
          try {
            // Check if the API server is available
            return await client.isAvailable();
          } catch (error) {
            return false;
          }
        }
      }
    );
    
    // Add the pool to our map
    this.apiClientPools.set(poolKey, pool);
    return pool;
  }

  /**
   * Get a ChatApiService from the pool
   * 
   * @param config Optional configuration for the chat API service
   * @returns A promise that resolves to a ChatApiService
   */
  async getChatApiService(config?: ChatApiConfig): Promise<ChatApiService> {
    this.logger.info('Getting ChatApiService from pool');
    return await this.chatApiPool.acquire();
  }

  /**
   * Release a ChatApiService back to the pool
   * 
   * @param service The service to release
   */
  async releaseChatApiService(service: ChatApiService): Promise<void> {
    this.logger.info('Releasing ChatApiService back to pool');
    await this.chatApiPool.release(service);
  }

  /**
   * Get an ApiClientAdapter from the appropriate pool based on baseUrl
   * 
   * @param config Configuration for the API client
   * @returns A promise that resolves to an ApiClientAdapter
   */
  async getApiClient(config: ApiClientConfig): Promise<ApiClientAdapter> {
    if (!config.baseUrl) {
      throw new Error('baseUrl is required for ApiClientAdapter');
    }
    
    this.logger.info(`Getting ApiClientAdapter for baseUrl: ${config.baseUrl}`);
    
    // Get or create the pool for this baseUrl
    const pool = this.getOrCreateApiClientPool(config.baseUrl);
    
    // Get a client from the pool
    return await pool.acquire();
  }

  /**
   * Release an ApiClientAdapter back to the pool
   * 
   * @param client The client to release
   * @param baseUrl The baseUrl of the client, required to identify the correct pool
   */
  async releaseApiClient(client: ApiClientAdapter, baseUrl?: string): Promise<void> {
    // Get baseUrl from the client if possible
    const clientBaseUrl = baseUrl || (client as any).baseUrl;
    
    if (!clientBaseUrl) {
      this.logger.warn('Attempted to release ApiClientAdapter but baseUrl is unknown. The client may not be properly released.');
      // Try to release it to all pools, since we don't know which pool it belongs to
      let released = false;
      for (const [key, pool] of this.apiClientPools.entries()) {
        try {
          await pool.release(client);
          this.logger.info(`Released ApiClientAdapter to pool ${key}`);
          released = true;
          break;
        } catch (error) {
          // This is expected if the client doesn't belong to this pool
          continue;
        }
      }
      
      if (!released) {
        this.logger.warn('ApiClientAdapter could not be released to any pool. It may be destroyed instead.');
        // Try to clean up the client as best we can
        try {
          await client.close();
        } catch (error) {
          this.logger.error('Error cleaning up ApiClientAdapter:', error);
        }
      }
      
      return;
    }
    
    const poolKey = `ApiClient:${clientBaseUrl}`;
    const pool = this.apiClientPools.get(poolKey);
    
    if (!pool) {
      this.logger.warn(`No pool found for ApiClientAdapter with baseUrl: ${clientBaseUrl}. The client may not be properly released.`);
      return;
    }
    
    this.logger.info(`Releasing ApiClientAdapter back to pool for baseUrl: ${clientBaseUrl}`);
    await pool.release(client);
  }

  /**
   * Get status information for all connection pools
   */
  getStatus(): {
    chatApi: { name: string; size: number; available: number; borrowed: number; pending: number; max: number; min: number; };
    apiClients: Array<{ name: string; size: number; available: number; borrowed: number; pending: number; max: number; min: number; }>;
  } {
    const apiClientStatus = Array.from(this.apiClientPools.values()).map(pool => pool.getStatus());
    
    return {
      chatApi: this.chatApiPool.getStatus(),
      apiClients: apiClientStatus
    };
  }

  /**
   * Close all connection pools and clean up resources
   */
  async close(): Promise<void> {
    this.logger.info('Closing all service connection pools...');
    
    const closeTasks: Promise<void>[] = [];
    
    // Close the chat API pool
    closeTasks.push(this.chatApiPool.drain());
    
    // Close all API client pools
    for (const pool of this.apiClientPools.values()) {
      closeTasks.push(pool.drain());
    }
    
    await Promise.all(closeTasks);
    this.logger.info('All service connection pools closed');
  }
  
  /**
   * @deprecated Use getApiClient instead
   */
  async getSSRClient(config: ApiClientConfig): Promise<ApiClientAdapter> {
    this.logger.warn('getSSRClient is deprecated, please use getApiClient instead');
    return this.getApiClient(config);
  }
  
  /**
   * @deprecated Use releaseApiClient instead
   */
  async releaseSSRClient(client: ApiClientAdapter, baseUrl?: string): Promise<void> {
    this.logger.warn('releaseSSRClient is deprecated, please use releaseApiClient instead');
    return this.releaseApiClient(client, baseUrl);
  }
} 