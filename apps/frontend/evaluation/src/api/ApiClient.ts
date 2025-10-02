/**
 * API Client for rendering slides using the API Server
 * 
 * This client communicates with the API server to render slides and decks.
 */

import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import type { CompleteDeckData, SlideData } from '../types';

/**
 * Interface for render options
 */
interface ApiRenderOptions {
  width?: number;
  height?: number;
  debug?: boolean;
  includeStyles?: boolean;
}

/**
 * Interface for slide render response
 */
interface SlideRenderResponse {
  slideId: string;
  html: string;
  screenshot: string;
}

/**
 * API Client for rendering slides via the API server
 */
export class ApiClient {
  private baseUrl: string;
  
  /**
   * Create a new API client
   * 
   * @param baseUrl Base URL for the API server
   */
  constructor(baseUrl: string = 'http://localhost:3333') {
    this.baseUrl = baseUrl;
  }
  
  /**
   * Check if the API server is available
   * 
   * @returns Promise resolving to true if the server is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/health`);
      return response.data.status === 'ok';
    } catch (error) {
      console.error('API server is not available:', error);
      return false;
    }
  }
  
  /**
   * Render a slide to image via the API server
   * 
   * @param slide The slide to render
   * @param options Render options
   * @returns Promise resolving to the render response
   */
  async renderSlide(
    slide: SlideData, 
    deckData: CompleteDeckData,
    options: ApiRenderOptions = {}
  ): Promise<SlideRenderResponse> {
    try {
      // Find the index of the slide in the deck
      const slideIndex = deckData.slides.findIndex(s => s.id === slide.id);
      
      if (slideIndex === -1) {
        throw new Error(`Slide with ID ${slide.id} not found in the deck`);
      }
      
      // Call the API to render the slide
      const response = await axios.post(
        `${this.baseUrl}/api/render/${slideIndex}`,
        { deckData },
        { timeout: 60000 } // 60 second timeout
      );
      
      if (!response.data.success) {
        throw new Error(`Failed to render slide: ${response.data.error || 'Unknown error'}`);
      }
      
      return response.data.result;
    } catch (error) {
      throw new Error(
        `Failed to render slide ${slide.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  
  /**
   * Save a rendered slide to file
   * 
   * @param renderResponse The render response from the API
   * @param outputPath Path to save the rendered slide
   * @param saveHtml Whether to save the HTML content (default: false)
   * @returns Promise resolving to the path of the saved file
   */
  async saveRenderedSlide(
    renderResponse: SlideRenderResponse,
    outputDir: string,
    fileType: string = 'rendering'
  ): Promise<string> {
    // Create the output directory if it doesn't exist
    await fs.mkdir(outputDir, { recursive: true });
    
    // Generate the output filename
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    const filename = `${renderResponse.slideId}_${fileType}_${timestamp}.png`;
    const outputPath = path.join(outputDir, filename);
    
    // Extract the base64 image data (remove the data:image/png;base64, prefix)
    const base64Data = renderResponse.screenshot.replace(/^data:image\/\w+;base64,/, '');
    
    // Save the image to file
    await fs.writeFile(outputPath, base64Data, { encoding: 'base64' });
    
    return outputPath;
  }
} 