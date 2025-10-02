/**
 * Environment Configuration
 * 
 * This file provides configurable environment settings for the frontend.
 * It uses Vite's environment variable approach (import.meta.env)
 * and falls back to defaults when variables are not set.
 */

// API URLs - the application can switch between development and production endpoints
interface ApiConfig {
  BASE_URL: string;
  CHAT_URL: string;
  WEBSOCKET_URL: string;
  AGENT_BASE_URL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_CHAT_COMPLETIONS_URL: string;
}

// Get environment from Vite's environment variables
const environment = import.meta.env.MODE || 'development';
const isDevelopment = environment === 'development';
const isProduction = environment === 'production';

// Get values from Vite's environment variables with intelligent defaults
const API_BASE_URL = import.meta.env.VITE_API_URL || (
  isDevelopment 
    ? '/api' // Use proxy in development
    : 'https://nextslide-backend.onrender.com/api' // Production default
);

const WEBSOCKET_URL = import.meta.env.VITE_WEBSOCKET_URL || (
  isDevelopment
    ? 'ws://localhost:1234'
    : 'wss://nextslide-websocket.onrender.com'
);

// Derive other URLs from base URL if not explicitly set
const CHAT_URL = import.meta.env.VITE_CHAT_API_URL || `${API_BASE_URL}/chat`;
// Agent backend: in dev use localhost; in prod default to nextslide-backend unless explicitly overridden
const AGENT_BASE_URL = import.meta.env.VITE_AGENT_API_URL || (
  isDevelopment ? 'http://localhost:9090' : 'https://nextslide-backend.onrender.com'
);

// OpenAI configuration
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const OPENAI_CHAT_COMPLETIONS_URL = import.meta.env.VITE_OPENAI_URL || 
  'https://api.openai.com/v1/chat/completions';

// Final configuration
export const API_CONFIG: ApiConfig = {
  BASE_URL: API_BASE_URL,
  CHAT_URL: CHAT_URL,
  WEBSOCKET_URL: WEBSOCKET_URL,
  AGENT_BASE_URL: AGENT_BASE_URL,
  OPENAI_API_KEY: OPENAI_API_KEY,
  OPENAI_CHAT_COMPLETIONS_URL: OPENAI_CHAT_COMPLETIONS_URL,
};


// Export a default config object containing all environment settings
export default {
  API: API_CONFIG,
  ENVIRONMENT: environment,
  IS_DEVELOPMENT: isDevelopment,
  IS_PRODUCTION: isProduction,
}; 