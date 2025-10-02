/**
 * Configuration utilities for the evaluation system
 * 
 * This module centralizes configuration management across the evaluation system.
 * It provides:
 * - Default configurations
 * - Environment variable handling
 * - Configuration validation
 */

import path from 'path';
import { fileURLToPath } from 'url';

// Types
export interface ApiServerConfig {
  baseUrl: string;
  maxConnections?: number;
  idleTimeoutMs?: number;
}

export interface ChatApiConfig {
  apiKey?: string;
  mockResponses?: boolean;
  baseUrl?: string;
  maxConnections?: number;
  idleTimeoutMs?: number;
}

export interface RenderingConfig {
  width: number;
  height: number;
  outputDir: string;
  includeStyles?: boolean;
  debug?: boolean;
}

/**
 * Default configurations
 */
export const defaults = {
  apiServer: {
    baseUrl: process.env.API_SERVER_URL || 'http://localhost:3333',
    maxConnections: 3,
    idleTimeoutMs: 5 * 60 * 1000, // 5 minutes
  },
  chatApi: {
    baseUrl: process.env.CHAT_API_URL,
    apiKey: process.env.CHAT_API_KEY,
    mockResponses: process.env.MOCK_RESPONSES === 'true',
    maxConnections: 5,
    idleTimeoutMs: 5 * 60 * 1000, // 5 minutes
  },
  rendering: {
    width: 1920,
    height: 1080,
    outputDir: path.join(process.cwd(), 'slide-renderings'),
    includeStyles: true,
    debug: false,
  },
  experiment: {
    outputDir: path.join(process.cwd(), 'experiment-results'),
    timeout: 60000, // 1 minute default timeout
  }
};

/**
 * Current runtime path helper (ES module equivalent of __dirname)
 */
export function getRuntimePath(metaUrl = import.meta.url): { dirname: string; filename: string } {
  const filename = fileURLToPath(metaUrl);
  const dirname = path.dirname(filename);
  return { dirname, filename };
}

/**
 * Merge config with defaults
 * 
 * @param config The user-provided config
 * @param defaultConfig The default config to merge with
 * @returns The merged config
 */
export function mergeWithDefaults<T extends Record<string, any>>(
  config: Partial<T> | undefined, 
  defaultConfig: T
): T {
  return { ...defaultConfig, ...config };
}

/**
 * Get API server configuration with defaults applied
 */
export function getApiServerConfig(config?: Partial<ApiServerConfig>): ApiServerConfig {
  return mergeWithDefaults(config, defaults.apiServer);
}

/**
 * Get Chat API configuration with defaults applied
 */
export function getChatApiConfig(config?: Partial<ChatApiConfig>): ChatApiConfig {
  return mergeWithDefaults(config, defaults.chatApi);
}

/**
 * Get rendering configuration with defaults applied
 */
export function getRenderingConfig(config?: Partial<RenderingConfig>): RenderingConfig {
  return mergeWithDefaults(config, defaults.rendering);
} 