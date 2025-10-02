/**
 * Rendering utilities for the evaluation system
 * 
 * This module provides common rendering functions using the API server.
 */

import fs from 'fs/promises';
import path from 'path';
import { SlideData, CompleteDeckData } from '../types';
import { ApiClient } from '../api/ApiClient';
import { defaults } from './config';

/**
 * Generate a unique filename for a rendering
 * 
 * @param slideId ID of the slide
 * @param type Type of rendering (before/after) or custom string
 * @param extension File extension to use (default: png)
 * @returns Unique filename with timestamp
 */
export function generateUniqueFilename(
  slideId: string, 
  type: string = 'rendering',
  extension: string = 'png'
): string {
  const timestamp = new Date().toISOString()
    .replace(/:/g, '-')
    .replace(/\./g, '-');
  return `${slideId}_${type}_${timestamp}.${extension}`;
}

/**
 * Ensure that a directory exists
 * 
 * @param dirPath Directory path to ensure exists
 */
export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Options for rendering a slide
 */
export interface SlideRenderingOptions {
  outputDir: string;
  width?: number;
  height?: number;
  debug?: boolean;
  includeStyles?: boolean;
  apiBaseUrl?: string;
}

/**
 * Render a slide to file using the API server
 * 
 * @param slide Slide to render
 * @param deckData Complete deck data containing the slide
 * @param options Rendering options
 * @param fileType Optional file type indicator for the filename
 * @returns Path to the saved rendering
 */
export async function renderSlideToFile(
  slide: SlideData, 
  deckData: CompleteDeckData,
  options: SlideRenderingOptions,
  fileType: string = 'rendering'
): Promise<string> {
  // Ensure the output directory exists
  await ensureDirectoryExists(options.outputDir);
  
  // Create API client
  const apiBaseUrl = options.apiBaseUrl || defaults.apiServer.baseUrl || 'http://localhost:3333';
  const apiClient = new ApiClient(apiBaseUrl);
  
  try {
    // Check if API server is available
    const isAvailable = await apiClient.isAvailable();
    if (!isAvailable) {
      throw new Error('API server is not available');
    }
    
    // Render the slide
    const renderResponse = await apiClient.renderSlide(slide, deckData, {
      width: options.width || defaults.rendering.width,
      height: options.height || defaults.rendering.height,
      debug: options.debug || defaults.rendering.debug,
      includeStyles: options.includeStyles ?? defaults.rendering.includeStyles
    });
    
    // Save the rendered slide to file
    return await apiClient.saveRenderedSlide(renderResponse, options.outputDir, fileType);
  } catch (error) {
    throw new Error(
      `Failed to render slide ${slide.id}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Add wrapper HTML for displaying slides
 * 
 * @param slideHtml The HTML content of a slide
 * @param slideIndex Index of the slide (1-based)
 * @param slide The slide data
 * @param deckId ID of the deck
 * @returns HTML with wrapper elements
 */
export function wrapSlideHtml(
  slideHtml: string,
  slideIndex: number,
  slide: SlideData,
  deckId: string
): string {
  return `
  <!-- START SLIDE CONTAINER: Slide #${slideIndex} | ID: ${slide.id} | Deck: ${deckId} -->
  <div class="slide-item">
    <div class="slide-label">Slide ${slideIndex}: ${slide.title || slide.id}</div>
    <div class="slide-container">
      ${slideHtml}
    </div>
  </div>
  <!-- END SLIDE CONTAINER: Slide #${slideIndex} | ID: ${slide.id} -->
  `;
} 