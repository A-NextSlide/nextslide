/**
 * Test utilities for the evaluation system
 * 
 * This module provides common testing utilities, fixtures, and helper functions.
 */

import { SlideData, DeckDiff, ComponentInstance } from '../types';
import { useDeckStore } from '../state/DeckStateManager';
import path from 'path';
import fs from 'fs/promises';
import { ensureDirectoryExists } from './rendering';
import { defaults } from './config';
import { Logger, SilentLogger } from './logging';

/**
 * Create a test output directory with a unique timestamp
 * 
 * @param basePath Base path for the test output
 * @param prefix Optional prefix for the directory name
 * @returns Path to the created directory
 */
export async function createTestOutputDir(
  basePath: string = path.join(process.cwd(), 'test-output'),
  prefix: string = 'test'
): Promise<string> {
  const timestamp = new Date().toISOString()
    .replace(/:/g, '-')
    .replace(/\./g, '-');
  const dirPath = path.join(basePath, `${prefix}-${timestamp}`);
  
  await ensureDirectoryExists(dirPath);
  return dirPath;
}

/**
 * Create a sample slide for testing
 * 
 * @param id Optional slide ID (default: test-slide-1)
 * @param title Optional slide title (default: Test Slide)
 * @returns A sample slide with common components
 */
export function createSampleSlide(id: string = 'test-slide-1', title: string = 'Test Slide'): SlideData {
  return {
    id,
    title,
    components: [
      {
        id: 'bg-1',
        type: 'Background',
        props: {
          position: { x: 0, y: 0 },
          width: defaults.rendering.width,
          height: defaults.rendering.height,
          color: '#f5f5f5',
          opacity: 1,
          zIndex: 0
        }
      },
      {
        id: 'text-1',
        type: 'TextBlock',
        props: {
          position: { x: 200, y: 200 },
          width: 600,
          height: 200,
          text: 'This is a test slide for evaluation',
          fontSize: 48,
          fontWeight: 'bold',
          textAlign: 'center',
          textColor: '#000000'
        }
      }
    ],
    width: defaults.rendering.width,
    height: defaults.rendering.height
  };
}

/**
 * Create a sample deck diff for testing
 * 
 * @param slideId ID of the slide to update (default: test-slide-1)
 * @returns A sample DeckDiff that updates and adds components
 */
export function createSampleDeckDiff(slideId: string = 'test-slide-1'): DeckDiff {
  const componentUpdate: ComponentInstance = {
    id: 'text-1',
    type: 'TextBlock',
    props: {
      text: 'This text has been updated by a DeckDiff',
      textColor: '#0000FF',
      fontSize: 54
    }
  };
  
  const newComponent: ComponentInstance = {
    id: 'text-2',
    type: 'TextBlock',
    props: {
      position: { x: 200, y: 500 },
      width: 600,
      height: 100,
      text: 'This is a new text component added by the DeckDiff',
      fontSize: 24,
      textAlign: 'center',
      textColor: '#FF0000'
    }
  };
  
  return {
    slides_to_update: [
      {
        slide_id: slideId,
        components_to_update: [componentUpdate],
        components_to_add: [newComponent]
      }
    ]
  };
}

/**
 * Initialize the deck store with a test deck
 * 
 * @param slides Array of slides to include in the deck
 * @param deckId Optional deck ID (default: test-deck)
 * @param deckName Optional deck name (default: Test Deck)
 */
export function initializeDeckWithSlides(
  slides: SlideData[], 
  deckId: string = 'test-deck',
  deckName: string = 'Test Deck'
): void {
  const store = useDeckStore.getState();
  
  store.setDeck({
    uuid: deckId,
    name: deckName,
    size: {
      width: defaults.rendering.width,
      height: defaults.rendering.height
    },
    slides,
    version: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    components: {},
    styles: {},
    dependencies: {},
    backgroundStyles: {},
    elementStyles: {},
    themeOverrides: {
      darkMode: false
    }
  });
}

/**
 * Silent logger for tests where you want to suppress output
 */
export const silentLogger = new SilentLogger();

/**
 * Test helper for measuring execution time
 * 
 * @param fn Function to time
 * @param label Label for the timer (optional)
 * @param logger Logger to use (optional)
 * @returns Result from the function
 */
export async function timeExecution<T>(
  fn: () => Promise<T>, 
  label: string = 'Execution',
  logger: Logger = console
): Promise<{ result: T; elapsedMs: number }> {
  const startTime = Date.now();
  const result = await fn();
  const elapsedMs = Date.now() - startTime;
  
  logger.info(`${label} completed in ${elapsedMs}ms`);
  
  return { result, elapsedMs };
} 