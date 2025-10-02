/**
 * API Client Adapter for the new API server
 * 
 * This adapter provides a consistent interface for connecting to the API server
 * that replaced the deprecated server-side-rendering system.
 */

import { ApiClient } from '../api/ApiClient';
import { CompleteDeckData } from '../types';

/**
 * Configuration for the API client
 */
export interface ApiClientConfig {
  baseUrl: string;
  logger?: Console;
}

/**
 * Result of a rendering operation
 */
export interface RenderResult {
  slideId: string;
  html: string;
  screenshot: string;
}

/**
 * Adapter for the API client to maintain compatibility with code that used SSRClient
 */
export class ApiClientAdapter {
  private apiClient: ApiClient;
  private baseUrl: string;
  private logger: Console;
  
  /**
   * Create a new API client adapter
   * 
   * @param config Configuration for the API client
   */
  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl || 'http://localhost:3333';
    this.logger = config.logger || console;
    
    // Create the underlying API client
    this.apiClient = new ApiClient(this.baseUrl);
    
    this.logger.info(`Created ApiClientAdapter for ${this.baseUrl}`);
  }
  
  /**
   * Check if the API server is available
   * 
   * @returns Promise resolving to true if the server is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      return await this.apiClient.isAvailable();
    } catch (error) {
      this.logger.error('API server is not available:', error);
      return false;
    }
  }
  
  /**
   * Render a slide to HTML and image using the API server
   * 
   * @param slide Slide data to render
   * @param deckData Complete deck data
   * @param options Additional rendering options
   * @returns Promise resolving to the render result
   */
  async renderSlide(
    slide: any, 
    deckData: CompleteDeckData,
    options: any = {}
  ): Promise<RenderResult> {
    try {
      this.logger.info(`Rendering slide ${slide.id} via API server`);
      return await this.apiClient.renderSlide(slide, deckData, options);
    } catch (error) {
      this.logger.error(`Error rendering slide ${slide.id}:`, error);
      throw error;
    }
  }
  
  /**
   * Save a rendered slide to file
   * 
   * @param renderResponse The render response from the API
   * @param outputDir Directory to save the rendering
   * @param fileType Type of file to save (default: 'rendering')
   * @returns Promise resolving to the path of the saved file
   */
  async saveRenderedSlide(
    renderResponse: RenderResult,
    outputDir: string,
    fileType: string = 'rendering'
  ): Promise<string> {
    try {
      this.logger.info(`Saving rendered slide ${renderResponse.slideId} to ${outputDir}`);
      return await this.apiClient.saveRenderedSlide(renderResponse, outputDir, fileType);
    } catch (error) {
      this.logger.error(`Error saving rendered slide ${renderResponse.slideId}:`, error);
      throw error;
    }
  }
  
  /**
   * Clean up method - doesn't do anything but included for interface compatibility
   */
  async close(): Promise<void> {
    this.logger.info('Closing ApiClientAdapter (no-op)');
    // No actual cleanup needed
  }
} 