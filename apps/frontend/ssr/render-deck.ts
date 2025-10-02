/**
 * Script for rendering a deck to images and HTML
 * 
 * This script uses the API server renderer to process a deck from Supabase
 * and save rendered slides as PNG images and HTML files.
 * 
 * Usage: 
 *   npx tsx api-server/render-deck.ts <deck-id> [options]
 * 
 * Options:
 *   --api-url URL       - API server URL (default: http://localhost:3333)
 *   --output-dir DIR    - Output directory (default: exports/timestamp)
 *   --format png|jpeg   - Image format (default: png)
 *   --slide INDEX       - Render specific slide (optional)
 *   --verbose           - Show detailed logs
 *   --env-file PATH     - Path to .env file (default: .env)
 *   --timeout SECONDS   - Timeout in seconds (default: 120)
 *   --retries NUMBER    - Number of API request retries (default: 3)
 * 
 * Environment Variables:
 *   SUPABASE_URL        - Supabase project URL
 *   SUPABASE_KEY        - Supabase anon key
 * 
 * Example:
 *   npx tsx api-server/render-deck.ts 12345-uuid-67890 --output-dir exports/my-deck
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import { deckSyncService } from '../src/lib/deckSyncService';
import type { CompleteDeckData } from '../src/types/DeckTypes';

// Configure environment first if needed based on env file
configureEnvironment();

// Types
interface RenderOptions {
  apiUrl: string;
  outputDir?: string;
  slideIndex?: number | null;
  format: 'png' | 'jpeg';
  verbose: boolean;
  timeout: number;
  retries: number;
}

interface SlideRenderResponse {
  slideId: string;
  html: string;
  screenshot: string;
}

interface RenderResult {
  success: boolean;
  slides?: number;
  outputPath?: string;
  totalSize?: number;
  totalTime?: number;
  avgRenderTime?: number;
  files?: string[];
  error?: string;
}

interface CommandLineArgs {
  apiUrl: string;
  outputDir: string | null;
  format: 'png' | 'jpeg';
  deckId: string | null;
  slideIndex: number | null;
  verbose: boolean;
  envFile: string;
  timeout: number;
  retries: number;
}

interface EnvVars {
  [key: string]: string;
}

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Configure environment variables from .env file if needed
 */
function configureEnvironment(envFilePath: string = '.env'): void {
  const envVars = loadEnvFile(envFilePath);
  
  // Set environment variables if not already set
  if (envVars.SUPABASE_URL && !process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = envVars.SUPABASE_URL;
  }
  
  if (envVars.SUPABASE_KEY && !process.env.SUPABASE_KEY) {
    process.env.SUPABASE_KEY = envVars.SUPABASE_KEY;
  }
}

/**
 * Try to load environment variables from .env file
 */
function loadEnvFile(envFilePath: string): EnvVars {
  try {
    if (existsSync(envFilePath)) {
      console.log(`Loading environment variables from ${envFilePath}`);
      const envFile = readFileSync(envFilePath, 'utf-8');
      const envVars: EnvVars = {};
      
      // Simple .env parser
      envFile.split('\n').forEach(line => {
        // Skip comments and empty lines
        if (!line || line.startsWith('#')) return;
        
        // Extract key and value
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let value = match[2] || '';
          
          // Remove quotes if present
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          } else if (value.startsWith("'") && value.endsWith("'")) {
            value = value.slice(1, -1);
          }
          
          envVars[key] = value;
        }
      });
      
      return envVars;
    }
  } catch (error) {
    console.warn(`Warning: Could not load .env file: ${(error as Error).message}`);
  }
  
  return {};
}

/**
 * Parse command line arguments
 */
function parseArgs(): CommandLineArgs {
  const args: CommandLineArgs = {
    apiUrl: 'http://localhost:3333',
    outputDir: null,
    format: 'png',
    deckId: null,
    slideIndex: null,
    verbose: false,
    envFile: '.env',
    timeout: 120, // Default timeout of 120 seconds
    retries: 3    // Default 3 retries
  };

  // First non-flag argument is the deck ID
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    
    if (arg.startsWith('--')) {
      if (arg === '--api-url' && i + 1 < process.argv.length) {
        args.apiUrl = process.argv[++i];
      } 
      else if (arg === '--output-dir' && i + 1 < process.argv.length) {
        args.outputDir = process.argv[++i];
      }
      else if (arg === '--format' && i + 1 < process.argv.length) {
        const format = process.argv[++i].toLowerCase();
        if (['png', 'jpeg', 'jpg'].includes(format)) {
          args.format = format === 'jpg' ? 'jpeg' : 'png';
        } else {
          console.error('Invalid format. Use png or jpeg.');
          process.exit(1);
        }
      }
      else if (arg === '--slide' && i + 1 < process.argv.length) {
        args.slideIndex = parseInt(process.argv[++i], 10);
        if (isNaN(args.slideIndex) || args.slideIndex < 0) {
          console.error('Invalid slide index. Must be a non-negative number.');
          process.exit(1);
        }
      }
      else if (arg === '--verbose') {
        args.verbose = true;
      }
      else if (arg === '--timeout' && i + 1 < process.argv.length) {
        args.timeout = parseInt(process.argv[++i], 10);
        if (isNaN(args.timeout) || args.timeout < 10) {
          console.error('Invalid timeout. Must be at least 10 seconds.');
          process.exit(1);
        }
      }
      else if (arg === '--retries' && i + 1 < process.argv.length) {
        args.retries = parseInt(process.argv[++i], 10);
        if (isNaN(args.retries) || args.retries < 0) {
          console.error('Invalid retries. Must be a non-negative number.');
          process.exit(1);
        }
      }
      else if (arg === '--env-file' && i + 1 < process.argv.length) {
        args.envFile = process.argv[++i];
        
        // Immediately load this env file to update environment variables
        configureEnvironment(args.envFile);
      }
      else {
        console.error(`Unknown option: ${arg}`);
      }
    } else if (!args.deckId) {
      args.deckId = arg;
    }
  }

  // Validate required arguments
  if (!args.deckId) {
    console.error('Error: No deck ID specified');
    console.error('Usage: npx tsx api-server/render-deck.ts <deck-id> [options]');
    process.exit(1);
  }
  
  return args;
}

// Helper function to format time
function formatTime(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(2)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Show progress bar in the console
 */
function showProgressBar(current: number, total: number, width = 30): void {
  const percentage = Math.round((current / total) * 100);
  const filledWidth = Math.round((current / total) * width);
  const emptyWidth = width - filledWidth;
  
  const filledChar = '█';
  const emptyChar = '░';
  
  const bar = filledChar.repeat(filledWidth) + emptyChar.repeat(emptyWidth);
  
  // Use carriage return to overwrite the same line
  process.stdout.write(`\rRendering: [${bar}] ${percentage}% (${current}/${total} slides)`);
  
  // If complete, add a newline
  if (current === total) {
    process.stdout.write('\n');
  }
}

/**
 * Make an API request with retries
 */
async function fetchWithRetry(url: string, options: any, retries: number, timeout: number): Promise<ReturnType<typeof fetch>> {
  let lastError: Error | undefined;
  
  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);
  
  // Add signal to options
  const fetchOptions = {
    ...options,
    signal: controller.signal
  };
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`Retry attempt ${attempt}/${retries}...`);
        // Exponential backoff: wait longer between each retry
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
      
      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      lastError = error as Error;
      console.error(`Request failed (attempt ${attempt + 1}/${retries + 1}):`, error);
      
      // If this was an abort (timeout), don't retry
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeout} seconds`);
      }
    }
  }
  
  clearTimeout(timeoutId);
  // This ensures lastError is always defined
  throw lastError || new Error('Unknown error occurred during fetch');
}

/**
 * Render a deck using the API server
 */
async function renderDeck(deckData: CompleteDeckData, options: RenderOptions): Promise<RenderResult> {
  const { apiUrl, outputDir, slideIndex, format, verbose, timeout, retries } = options;
  
  const startTime = performance.now();
  
  try {
    // Determine the correct API endpoint based on whether we're rendering a single slide or all slides
    let endpoint = `${apiUrl}/api/render`;
    let requestBody = { deckData };
    
    // If specific slide is requested
    if (slideIndex !== null && slideIndex !== undefined) {
      endpoint = `${apiUrl}/api/render/${slideIndex}`;
      console.log(`Rendering slide ${slideIndex} from deck "${deckData.name}"...`);
    } else {
      console.log(`Rendering all slides from deck "${deckData.name}"...`);
    }
    
    console.log(`Making API request to ${endpoint} (timeout: ${timeout}s, retries: ${retries})`);
    
    // Make the API request with retries and timeout
    const response = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }, retries, timeout);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json() as {
      success: boolean;
      results?: SlideRenderResponse[];
      result?: SlideRenderResponse;
      error?: string;
    };
    
    if (!result.success) {
      throw new Error(`Rendering failed: ${result.error || 'Unknown error'}`);
    }
    
    // Normalize results structure
    const slides = slideIndex !== null && slideIndex !== undefined 
      ? [result.result as SlideRenderResponse] 
      : (result.results as SlideRenderResponse[]);
    
    if (!slides || slides.length === 0) {
      throw new Error('No slide results returned from the renderer');
    }
    
    // Create output directory
    const timestamp = Date.now();
    const outputPath = outputDir || `/tmp/render-deck/deck-${timestamp}`;
    await fs.mkdir(outputPath, { recursive: true });
    
    if (verbose) {
      console.log(`Saving ${slides.length} slides to ${outputPath}...`);
    }
    
    // Track saved files
    const savedFiles: string[] = [];
    
    // Save each slide
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const slideNum = slideIndex !== null && slideIndex !== undefined ? slideIndex : i;
      
      // Update progress bar
      if (!verbose) {
        showProgressBar(i + 1, slides.length);
      }
      
      // Save image
      const extension = format === 'png' ? 'png' : 'jpg';
      const imgFilename = `slide-${slideNum + 1}.${extension}`;
      const imgPath = path.join(outputPath, imgFilename);
      
      // Convert base64 to file if needed
      if (slide.screenshot.startsWith(`data:image/${format};base64,`)) {
        const base64Data = slide.screenshot.replace(new RegExp(`^data:image/${format};base64,`), '');
        await fs.writeFile(imgPath, Buffer.from(base64Data, 'base64'));
      } else {
        // Download image URL
        const imgResponse = await fetch(slide.screenshot);
        const buffer = await imgResponse.buffer();
        await fs.writeFile(imgPath, buffer);
      }
      savedFiles.push(imgPath);
      
      // Save HTML
      const htmlFilename = `slide-${slideNum + 1}.html`;
      const htmlPath = path.join(outputPath, htmlFilename);
      await fs.writeFile(htmlPath, slide.html);
      savedFiles.push(htmlPath);
      
      if (verbose) {
        console.log(`Saved slide ${slideNum + 1} to ${imgPath} and ${htmlPath}`);
      }
    }
    
    // Calculate total size
    let totalSize = 0;
    for (const filePath of savedFiles) {
      try {
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
      } catch (error) {
        console.error(`Error getting file size for ${filePath}:`, error);
      }
    }
    
    // Calculate total time
    const totalTime = performance.now() - startTime;
    const avgRenderTime = totalTime / slides.length;
    
    // Log results
    console.log(`\n✅ Successfully rendered deck "${deckData.name}"`);
    console.log(`Slides: ${slides.length}`);
    console.log(`Output location: ${outputPath}`);
    console.log(`Total size: ${formatFileSize(totalSize)}`);
    console.log(`Total time: ${formatTime(totalTime)}`);
    console.log(`Average render time per slide: ${formatTime(avgRenderTime)}`);
    
    return {
      success: true,
      slides: slides.length,
      outputPath,
      totalSize,
      totalTime,
      avgRenderTime,
      files: savedFiles
    };
  } catch (error) {
    console.error('Rendering failed:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    // Parse command line arguments
    const args = parseArgs();
    
    if (args.verbose) {
      console.log('Script options:', { 
        ...args, 
      });
    }
    
    // Verify API server is running
    try {
      console.log(`Checking if API server is running at ${args.apiUrl}/health...`);
      const healthCheck = await fetch(`${args.apiUrl}/health`);
      if (!healthCheck.ok) {
        console.warn(`Warning: API server health check failed: ${healthCheck.status}`);
      } else {
        const health = await healthCheck.json() as {
          status: string;
          renderers: number;
          pendingRequests: number;
        };
        console.log(`API server status: ${JSON.stringify(health)}`);
        
        // Check if there are renderers available
        if (health.renderers === 0) {
          console.warn("Warning: No renderers are connected to the API server.");
          console.warn("Please make sure the renderer browser page is open and connected before proceeding.");
          
          // Ask user if they want to continue
          console.log("\nDo you want to continue anyway? (y/N)");
          
          // Read from stdin
          const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
          });
          
          const answer = await new Promise(resolve => {
            readline.question('', (ans: string) => {
              readline.close();
              resolve(ans.toLowerCase());
            });
          });
          
          if (answer !== 'y' && answer !== 'yes') {
            console.log("Aborting render operation.");
            process.exit(0);
          }
          
          console.log("Continuing without connected renderers...");
        }
      }
    } catch (error) {
      console.error(`Error connecting to API server at ${args.apiUrl}: ${(error as Error).message}`);
      console.error('Please make sure the API server is running.');
      process.exit(1);
    }
    
    // Use the actual deckSyncService from the project
    console.log(`Using deckSyncService to fetch deck ${args.deckId}...`);
    const deckData = await deckSyncService.getDeck(args.deckId as string);
    
    if (!deckData) {
      console.error(`Failed to fetch deck from Supabase with ID: ${args.deckId}`);
      process.exit(1);
    }
    
    // Validate deck data has slides
    if (!deckData.slides || !Array.isArray(deckData.slides) || deckData.slides.length === 0) {
      console.error('Error: Invalid deck data. The deck must contain a slides array.');
      process.exit(1);
    }
    
    // Log the deck details
    console.log(`Deck: ${deckData.name || 'Unnamed'}`);
    console.log(`Slides: ${deckData.slides.length}`);
    
    // Verify slide index is valid if specified
    if (args.slideIndex !== null && (args.slideIndex >= deckData.slides.length)) {
      console.error(`Error: Slide index ${args.slideIndex} is out of range. The deck has ${deckData.slides.length} slides.`);
      process.exit(1);
    }
    
    // Render the deck
    const result = await renderDeck(deckData, {
      apiUrl: args.apiUrl,
      outputDir: args.outputDir ?? undefined,
      slideIndex: args.slideIndex,
      format: args.format,
      verbose: args.verbose,
      timeout: args.timeout,
      retries: args.retries
    });
    
    if (!result.success) {
      process.exit(1);
    }
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch(err => {
  console.error('Unhandled error in main function:', err);
  process.exit(1);
}); 