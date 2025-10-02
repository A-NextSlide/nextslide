/**
 * Centralized API endpoints configuration
 */
export const API_ENDPOINTS = {
  // Base URL - can be configured via environment variable
  // In development, default to the full localhost URL instead of just /api
  BASE_URL: import.meta.env.VITE_API_URL || (
    import.meta.env.DEV 
      ? 'http://localhost:9090/api'  // Full URL in development
      : 'https://nextslide-backend.onrender.com/api'  // Production default
  ),
  
  // Outline generation endpoints
  GENERATE_OUTLINE: '/openai/generate-outline',
  GENERATE_OUTLINE_STREAM: '/openai/generate-outline-stream',
  
  // Deck composition endpoints  
  COMPOSE_DECK_STREAM: '/deck/compose-stream',
  // Theme endpoints
  THEME_FROM_OUTLINE_SSE: '/theme/from-outline',
  THEME_FROM_OUTLINE_JSON: '/theme/from-outline/json',
  
  // Content enhancement
  ENHANCE_CONTENT: '/openai/enhance-content',
  
  // Media interpretation
  INTERPRET_MEDIA: '/openai/interpret-media',
  
  // Deck status
  DECK_STATUS: (deckId: string) => `/deck/${deckId}/status`,
  
  // Image search
  SEARCH_IMAGES: '/images/search',
  
  // Full URLs for convenience
  getFullUrl(endpoint: string): string {
    const base = this.BASE_URL.replace(/\/$/, ''); // Remove trailing slash
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${base}${path}`;
  }
};

// Type-safe endpoint builder
export function buildApiUrl(endpoint: keyof typeof API_ENDPOINTS | string, ...params: any[]): string {
  const endpointValue = API_ENDPOINTS[endpoint as keyof typeof API_ENDPOINTS];
  
  if (typeof endpointValue === 'function') {
    return API_ENDPOINTS.getFullUrl(endpointValue(...params));
  }
  
  if (typeof endpointValue === 'string') {
    return API_ENDPOINTS.getFullUrl(endpointValue);
  }
  
  // If it's a custom endpoint string
  return API_ENDPOINTS.getFullUrl(endpoint);
} 