/**
 * CSS Null Loader for Node.js ESM
 * 
 * This custom loader intercepts CSS imports and returns an empty module.
 * It's specifically designed for the experiment pipeline to prevent errors
 * when Node.js encounters CSS imports from frontend code.
 */

export function resolve(specifier, context, nextResolve) {
  // Check if this is a CSS file
  if (specifier.endsWith('.css')) {
    console.log(`[css-null-loader] Intercepted CSS import: ${specifier}`);
    
    // Return a data URL that exports an empty object
    return {
      url: 'data:text/javascript,export default {};',
      shortCircuit: true
    };
  }
  
  // For non-CSS files, continue with normal resolution
  return nextResolve(specifier, context);
}

// Log when the loader is initialized
console.log('[css-null-loader] Initialized - CSS imports will be treated as empty modules'); 