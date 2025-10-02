// Debug utility to log all fetch requests
export function enableFetchDebugging() {
  const originalFetch = window.fetch;
  
  window.fetch = async function(...args) {
    const [url, options] = args as [RequestInfo, RequestInit?];
    try {
      // Bypass for SSE/streaming endpoints to avoid any interference with ReadableStream
      const isSSEEndpoint = typeof url === 'string' && url.includes('/openai/generate-outline-stream');
      // Detect Accept: text/event-stream whether headers are a plain object or Headers instance
      // Note: headers can be undefined, a Headers object, or a plain object
      let acceptHeader: string | undefined;
      const headers = options?.headers as any;
      if (headers) {
        if (typeof headers.get === 'function') {
          acceptHeader = headers.get('Accept') || headers.get('accept');
        } else if (typeof headers === 'object') {
          acceptHeader = headers['Accept'] || headers['accept'];
        }
      }
      const isSSEAccept = acceptHeader === 'text/event-stream';
      if (isSSEEndpoint || isSSEAccept) {
        return originalFetch.apply(this, args as any);
      }
    } catch {}
    
    // Only log deck-related API calls
    if (typeof url === 'string' && (url.includes('/api/decks') || url.includes('/api/auth/decks'))) {
      console.group(`🔍 FETCH DEBUG: ${options?.method || 'GET'} ${url}`);
      
      // Log headers
      if (options?.headers) {
        console.log('Request Headers:', options.headers);
      }
      
      // Add stack trace for /full endpoints to find infinite loop source
      if (url.includes('/full')) {
        console.trace('📍 Stack trace for deck full fetch:');
      }
      
      if (options?.body) {
        try {
          const body = JSON.parse(options.body as string);
          console.log('Request Body:', body);
          console.log('Body Fields:', Object.keys(body));
          
          // Log specific field types
          if (body.slides) {
            console.log('Slides:', Array.isArray(body.slides) ? `Array[${body.slides.length}]` : typeof body.slides);
          }
          if (body.uuid) {
            console.log('UUID valid?', /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.uuid));
          }
        } catch (e) {
          console.log('Request Body (raw):', options.body);
        }
      }
      
      console.groupEnd();
    }
    
    // Make the actual request
    const response = await originalFetch.apply(this, args as any);
    
    // Log response for deck API calls
    if (typeof url === 'string' && (url.includes('/api/decks') || url.includes('/api/auth/decks')) && !response.ok) {
      console.group(`❌ FETCH RESPONSE: ${response.status} for ${url}`);
      
      try {
        // Clone the response so we can read it without consuming it
        const clonedResponse = response.clone();
        const responseText = await clonedResponse.text();
        
        try {
          const responseJson = JSON.parse(responseText);
          console.log('Error Response:', responseJson);
        } catch {
          console.log('Error Response (text):', responseText);
        }
      } catch (e) {
        console.log('Could not read response body');
      }
      
      console.groupEnd();
    }
    
    return response;
  };
  
  
}

// Enable only when explicitly requested
try {
  const shouldEnable =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_DEBUG_FETCH === 'true') ||
    (typeof window !== 'undefined' && (window as any).__DEBUG_FETCH === true);
  if (shouldEnable) {
    enableFetchDebugging();
  }
} catch {}