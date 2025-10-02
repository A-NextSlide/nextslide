#!/usr/bin/env node
import { ParallelExperimentRunner } from './ParallelExperimentRunner';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { initializeRenderingApi } from './SlideRenderingApiClient';
import { ChatApiService } from '../api/ChatApiService';
import { ApiClient } from '../api/ApiClient';

// Load environment variables from .env file
dotenv.config();

// Get the current file's directory path (ES module equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options: { 
    experimentsDir: string,
    outputDir: string,
    specificFiles: string[],
    useMockResponses: boolean,
    runInParallel: boolean,
    concurrency: number,
    runName?: string,
    stepConcurrencyLimits: Record<string, number>,
    useApiServer: boolean,
    apiServerUrl?: string,
    diagnosticMode: boolean,
    disableNodeFetch: boolean,
    enableKeepAlive: boolean,
    help?: boolean
  } = {
    experimentsDir: path.resolve(process.cwd(), 'experiments'),
    outputDir: process.env.EXPERIMENT_OUTPUT_DIR || '/tmp/experiments',
    specificFiles: [],
    // Default to using real responses (false) unless env var explicitly sets to true
    useMockResponses: process.env.USE_MOCK_RESPONSES ? 
      process.env.USE_MOCK_RESPONSES.toLowerCase() === 'true' : 
      false,
    runInParallel: false,    // Default to sequential execution
    concurrency: process.env.CONCURRENCY ? parseInt(process.env.CONCURRENCY) : 3,  // Default concurrency from env or 3
    stepConcurrencyLimits: {}, // No step-specific limits by default
    // Default to using API server unless explicitly disabled
    useApiServer: process.env.USE_API_SERVER ? 
      process.env.USE_API_SERVER.toLowerCase() === 'true' : 
      true,
    apiServerUrl: process.env.API_SERVER_URL || 'http://localhost:3333',
    diagnosticMode: false, // Enable detailed diagnostics (default: false)
    disableNodeFetch: false, // Disable node-fetch keepalive (default: false)
    enableKeepAlive: false, // Enable keepalive (default: false)
    help: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--experiments' || arg === '-e') {
      const nextArg = args[++i];
      // Check if this appears to be a specific file rather than a directory
      if (nextArg.endsWith('.json')) {
        options.specificFiles.push(nextArg);
      } else {
        options.experimentsDir = path.resolve(process.cwd(), nextArg);
      }
    } else if (arg === '--output' || arg === '-o') {
      options.outputDir = path.resolve(process.cwd(), args[++i]);
    } else if (arg === '--file' || arg === '-f') {
      options.specificFiles.push(args[++i]);
    } else if (arg === '--real' || arg === '-r') {
      options.useMockResponses = false;
    } else if (arg === '--mock' || arg === '-m') {
      options.useMockResponses = true;
    } else if (arg === '--parallel' || arg === '-p') {
      options.runInParallel = true;
    } else if (arg === '--name' || arg === '-n') {
      options.runName = args[++i];
    } else if (arg === '--concurrency' || arg === '-c') {
      const concurrency = parseInt(args[++i]);
      if (isNaN(concurrency) || concurrency < 1) {
        console.error('Invalid concurrency value, must be a positive integer');
        process.exit(1);
      }
      options.concurrency = concurrency;
    } else if (arg === '--step-concurrency' || arg === '--sc') {
      // Format is --step-concurrency "Step Name:3" 
      const param = args[++i];
      const parts = param.split(':');
      if (parts.length !== 2) {
        console.error('Invalid step concurrency format. Use "Step Name:3"');
        process.exit(1);
      }
      const stepName = parts[0];
      const limit = parseInt(parts[1]);
      if (isNaN(limit) || limit < 1) {
        console.error('Invalid step concurrency limit, must be a positive integer');
        process.exit(1);
      }
      options.stepConcurrencyLimits[stepName] = limit;
    } else if (arg === '--api-server-url') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        options.apiServerUrl = args[++i];
      } else {
        console.error('--api-server-url requires a URL parameter');
        process.exit(1);
      }
    } else if (arg === '--diagnostic' || arg === '--debug') {
      options.diagnosticMode = true;
      console.log('Enabling diagnostic mode with enhanced logging');
    } else if (arg === '--disable-node-fetch') {
      options.disableNodeFetch = true;
      console.log('Disabling node-fetch keepalive');
    } else if (arg === '--enable-keepalive') {
      options.enableKeepAlive = true;
      console.log('Enabling keepalive for HTTP connections');
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (!arg.startsWith('-')) {
      // Assume it's a file if it doesn't start with -
      options.specificFiles.push(arg);
    }
  }
  
  return options;
}

/**
 * Print help information
 */
function printHelp() {
  console.log(`
Experiment CLI - Run experiments with the slide evaluation system

Usage:
  experiment-cli [options] [files...]

Options:
  -e, --experiments   Directory containing experiment JSON files (default: ./experiments)
  -o, --output        Specify output directory for experiment results (default: /tmp/experiments)
  -f, --file          Specify a specific experiment file to run (can be used multiple times)
  -m, --mock          Use mock responses instead of real API
  -r, --real          Use the real API (default behavior)
  -p, --parallel      Run experiments in parallel instead of sequentially
  -c, --concurrency   Maximum number of concurrent experiments to run (default: 3)
  --sc, --step-concurrency  Step-specific concurrency limit, format "Step Name:3"
  -n, --name          Provide a name for this experiment run (stored in results)
  --api-server-url    Specify a custom URL for the API server (default: http://localhost:3333)
  --diagnostic        Enable diagnostic mode with detailed logging
  --debug             Same as --diagnostic
  --disable-node-fetch Disable node-fetch keepalive (helps with hanging issues)
  --enable-keepalive  Enable HTTP keep-alive (not recommended, may cause hanging)
  -h, --help          Show this help information

Environment Variables (in .env file):
  USE_MOCK_RESPONSES  Whether to use mock responses (true/false)
  API_BASE_URL        Base URL for the Chat API
  CONCURRENCY         Maximum number of concurrent experiments (default: 3)
  EXPERIMENT_OUTPUT_DIR Output directory for experiment results (default: /tmp/experiments)
  API_SERVER_URL      URL of the API server (default: http://localhost:3333)

Examples:
  experiment-cli                           # Run all experiments with the real API
  experiment-cli -m                        # Run all experiments with mock responses
  experiment-cli -p                        # Run all experiments in parallel
  experiment-cli -p -c 5                   # Run all experiments in parallel with max 5 concurrent jobs
  experiment-cli -m -p                     # Run all experiments with mock responses in parallel
  experiment-cli -f change-text-color.json # Run a specific experiment
  experiment-cli -m change-text-color.json # Run a specific experiment with mock responses
  experiment-cli --diagnostic -f change-text-color.json # Run with diagnostic logging
  experiment-cli --disable-node-fetch -f change-text-color.json # Run with node-fetch keepalive disabled

Troubleshooting:
  If the process hangs after completion, try these options:
  - Use --diagnostic to enable detailed diagnostics
  - Use --disable-node-fetch to prevent connection pool issues 
  - Run in mock mode (-m) to avoid API calls completely

Notes:
  - Experiments use an array of slides with full SlideData objects
  - Each slide has an id, title, and components array
  - The currentSlideId field specifies which slide is being viewed/edited
  - Even when running sequentially, the system uses a ThreadPool with concurrency=1
  - Results are saved to /tmp/experiments by default
  `);
}

/**
 * Run the experiment CLI
 */
async function main() {
  console.log('Starting Slide Experiment CLI');
  
  // Parse command line arguments
  const options = parseArgs();
  
  console.log('Process options:', JSON.stringify({
    experimentsDir: options.experimentsDir,
    outputDir: options.outputDir,
    specificFiles: options.specificFiles,
    useMockResponses: options.useMockResponses,
    runInParallel: options.runInParallel,
    concurrency: options.concurrency,
    stepConcurrencyLimits: options.stepConcurrencyLimits,
    runName: options.runName,
    useApiServer: options.useApiServer,
    apiServerUrl: options.apiServerUrl
  }, null, 2));
  
  // Setup API config with diagnostic options
  const apiConfig = {
    mockResponses: options.useMockResponses,
    baseUrl: process.env.API_BASE_URL || 'http://localhost:9090',
    runName: options.runName,
    // Add diagnostic settings
    diagnosticMode: options.diagnosticMode,
    disableNodeFetch: options.disableNodeFetch,
    enableKeepAlive: options.enableKeepAlive
  };
  
  // Print diagnostic info if enabled
  if (options.diagnosticMode) {
    console.log('\n===== SYSTEM DIAGNOSTICS =====');
    console.log(`Node.js version: ${process.version}`);
    console.log(`Platform: ${process.platform}`);
    console.log(`Process PID: ${process.pid}`);
    console.log(`Working directory: ${process.cwd()}`);
    console.log(`Environment variables: NODE_ENV=${process.env.NODE_ENV || 'not set'}`);
    
    // Print memory usage
    const memoryUsage = process.memoryUsage();
    console.log('Memory usage:');
    Object.entries(memoryUsage).forEach(([key, value]) => {
      console.log(`  - ${key}: ${Math.round(value / 1024 / 1024 * 100) / 100} MB`);
    });
    
    // Print network diagnostic settings
    console.log('Network settings:');
    console.log(`  - Keep-alive enabled: ${options.enableKeepAlive}`);
    console.log(`  - Node-fetch disabled: ${options.disableNodeFetch}`);
    console.log(`  - API Server URL: ${options.apiServerUrl}`);
    
    // Check if node-fetch is available
    try {
      const nodeFetch = require('node-fetch');
      console.log(`  - node-fetch version: ${nodeFetch.default.VERSION || 'Unknown'}`);
    } catch (e) {
      console.log(`  - node-fetch not found: ${e.message}`);
    }
    
    console.log('=============================\n');
  }
  
  if (options.help) {
    printHelp();
    process.exit(0);
  }
  
  const parallelExperimentRunner = new ParallelExperimentRunner(
    options.outputDir,
    apiConfig,
    options.concurrency,
    options.stepConcurrencyLimits
  );
  
  try {
    // Check Chat API server availability
    console.log(`Checking Chat API server availability at: ${apiConfig.baseUrl}`);
    let chatApiAvailable = false;
    try {
      // Create a temporary ChatApiService to check connectivity
      const chatApiService = new ChatApiService(apiConfig);
      chatApiAvailable = await chatApiService.checkHealth(console);
      if (chatApiAvailable) {
        console.log('✅ Chat API server is available');
      } else {
        console.warn('⚠️ Chat API server is not responding - experiments may fail');
      }
    } catch (apiError) {
      console.error(`❌ Error connecting to Chat API server: ${apiError instanceof Error ? apiError.message : String(apiError)}`);
      if (!options.useMockResponses) {
        console.warn('Continuing with experiments, but they may fail without API connectivity');
      } else {
        console.log('Using mock responses, so Chat API connectivity is not critical');
      }
    }

    // Always initialize HTML generator to use the API server
    console.log(`Checking Deck Rendering API server at URL: ${options.apiServerUrl}`);
    let renderApiAvailable = false;
    
    try {
      // Check if the rendering API server is available
      const apiClient = new ApiClient(options.apiServerUrl || 'http://localhost:3333');
      renderApiAvailable = await apiClient.isAvailable();
      
      if (renderApiAvailable) {
        console.log('✅ Deck Rendering API server is available');
      } else {
        console.warn('⚠️ Deck Rendering API server is not responding - experiments may fail during image generation');
      }
      
      // Initialize any renderer dependencies
      await initializeRenderingApi({
        apiBaseUrl: options.apiServerUrl || 'http://localhost:3333',
        logger: console,
        debugMode: options.diagnosticMode
      });
      
      console.log('HTML generator initialized to use API server');
    } catch (error) {
      console.error(`❌ Error connecting to Deck Rendering API server: ${error instanceof Error ? error.message : String(error)}`);
      console.warn('Continuing with experiments, but image generation may fail');
    }
    
    // Prompt the user if they want to continue with experiments when servers are unavailable
    if ((!chatApiAvailable && !options.useMockResponses) || !renderApiAvailable) {
      console.warn('\n⚠️ One or more required servers are not available:');
      if (!chatApiAvailable && !options.useMockResponses) {
        console.warn('  - Chat API server is not available (required for non-mock experiments)');
      }
      if (!renderApiAvailable) {
        console.warn('  - Deck Rendering API server is not available (required for image generation)');
      }
      
      // Only prompt in interactive mode
      if (process.stdout.isTTY) {
        console.log('\nDo you want to continue anyway? (y/N): ');
        process.stdin.setEncoding('utf8');
        const response = await new Promise<string>(resolve => {
          process.stdin.once('data', (data) => {
            const input = data.toString().trim().toLowerCase();
            resolve(input);
          });
        });
        
        if (response !== 'y' && response !== 'yes') {
          console.log('Exiting experiments due to unavailable servers.');
          process.exit(0);
        }
        
        console.log('Continuing with experiments despite server issues...');
      } else {
        // In non-interactive mode, just warn and continue
        console.warn('Running in non-interactive mode, continuing despite server issues...');
      }
    }
    
    // Run the experiments
    console.log(`\nRunning experiments with concurrency=${options.concurrency}...`);
    
    // If specificFiles is provided, we'll do substring matching within the runExperimentsFromDirectory method
    if (options.specificFiles.length > 0) {
      console.log(`Using substring matching for experiment files: ${options.specificFiles.join(', ')}`);
      
      // Get all experiment files from the directory
      const fs = await import('fs/promises');
      const path = await import('path');
      
      async function getAllFiles(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const files = await Promise.all(entries.map(async (entry) => {
          const fullPath = path.join(dir, entry.name);
          return entry.isDirectory() ? getAllFiles(fullPath) : fullPath;
        }));
        return files.flat();
      }
      
      const allFiles = await getAllFiles(options.experimentsDir);
      const jsonFiles = allFiles.filter(file => file.endsWith('.json'));
      
      // Filter files that match any of the substrings in specificFiles
      const matchedFiles = jsonFiles.filter(file => 
        options.specificFiles.some(pattern => file.includes(pattern))
      );
      
      if (matchedFiles.length === 0) {
        console.warn(`No files matched the patterns: ${options.specificFiles.join(', ')}`);
        console.warn(`Available JSON files: ${jsonFiles.map(f => path.relative(options.experimentsDir, f)).join(', ')}`);
      } else {
        console.log(`Found ${matchedFiles.length} matching files: ${matchedFiles.map(f => path.relative(options.experimentsDir, f)).join(', ')}`);
      }
      
      await parallelExperimentRunner.runExperimentsFromDirectory(
        options.experimentsDir,
        matchedFiles,
        options.runInParallel,
        options.concurrency,
        options.stepConcurrencyLimits
      );
    } else {
      // Run all experiments in the directory
      await parallelExperimentRunner.runExperimentsFromDirectory(
        options.experimentsDir,
        [],
        options.runInParallel,
        options.concurrency,
        options.stepConcurrencyLimits
      );
    }
    
    console.log('\nExperiment run completed successfully!');
    console.log(`Results saved to: ${options.outputDir}`);
    
    // Clean exit to avoid hanging
    console.log('Exiting...');
    process.exit(0);
  } catch (error) {
    console.error('Error running experiments:', error);
    // Force exit to avoid hanging
    process.exit(1);
  }
}

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Catch uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Force exit on uncaught exceptions
  process.exit(1);
});

// Run the CLI
main();