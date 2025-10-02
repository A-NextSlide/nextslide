#!/usr/bin/env node
/**
 * Experiment Runner with CSS Null Loader
 * 
 * This script wraps the experiment CLI and runs it with a custom loader
 * that handles CSS imports in Node.js by treating them as empty modules.
 * 
 * Usage:
 *   npm run experiments -- [args]
 *   e.g., npm run experiments -- -f create-chart.json
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current file's directory path (for ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to our custom CSS loader
const loaderPath = path.resolve(__dirname, '../utils/css-null-loader.mjs');

// Get all command line arguments except the first two (node and script path)
const args = process.argv.slice(2);

console.log('=== Starting Experiment Runner with CSS Null Loader ===');
console.log(`Loader path: ${loaderPath}`);
console.log(`Arguments: ${args.join(' ')}\n`);

// Prepare the command to run the experiment CLI with the custom loader
const nodeOptions = [
  '--experimental-specifier-resolution=node',
  `--loader=${loaderPath}`,
  // Add any other Node.js options you need
];

// Path to the experiment CLI
const experimentCli = path.resolve(__dirname, './experiment-cli.ts');

// Prepare the environment variables
const env = {
  ...process.env,
  NODE_OPTIONS: nodeOptions.join(' '),
};

// Spawn the process with the environment variables set
const child = spawn('tsx', [experimentCli, ...args], {
  env,
  stdio: 'inherit', // Pipe stdout/stderr to the parent process
});

// Handle the child process events
child.on('close', (code) => {
  console.log(`\n=== Experiment Runner exited with code ${code} ===`);
  process.exit(code || 0);
});

// Handle signals to properly terminate the child process
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, terminating experiment...');
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, terminating experiment...');
  child.kill('SIGTERM');
}); 