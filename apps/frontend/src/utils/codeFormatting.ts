/**
 * Utility functions for formatting JavaScript code
 */

/**
 * Formats JavaScript code with proper indentation and line breaks
 * @param code The JavaScript code to format
 * @returns Formatted code string
 */
export function formatJavaScript(code: string): string {
  if (!code) return '';
  
  try {
    // Basic formatting - this is a simple implementation
    // For production, consider using a proper parser like prettier
    
    let formatted = code;
    
    // First, try to detect if it's minified (all on one line)
    if (!code.includes('\n') || code.split('\n').length < 3) {
      // Add line breaks after common patterns
      formatted = formatted
        // Add line breaks after { and before }
        .replace(/\{/g, '{\n')
        .replace(/\}/g, '\n}')
        // Add line breaks after semicolons
        .replace(/;/g, ';\n')
        // Add line breaks after commas in objects
        .replace(/,(?=\s*['"])/g, ',\n')
        // Fix function declarations
        .replace(/function\s+(\w+)\s*\(/g, 'function $1(')
        .replace(/\)\s*\{/g, ') {')
        // Fix arrow functions
        .replace(/=>\s*\{/g, '=> {')
        // Fix return statements
        .replace(/return\s+/g, 'return ');
    }
    
    // Now apply indentation
    const lines = formatted.split('\n');
    let indentLevel = 0;
    const indentSize = 2;
    
    const formattedLines = lines.map((line, index) => {
      const trimmedLine = line.trim();
      
      // Skip empty lines
      if (!trimmedLine) return '';
      
      // Decrease indent for closing braces
      if (trimmedLine.startsWith('}') || trimmedLine.startsWith(')')) {
        indentLevel = Math.max(0, indentLevel - 1);
      }
      
      // Apply indentation
      const indentedLine = ' '.repeat(indentLevel * indentSize) + trimmedLine;
      
      // Increase indent after opening braces
      if (trimmedLine.endsWith('{') || trimmedLine.endsWith('(')) {
        indentLevel++;
      }
      
      // Handle inline braces
      const openBraces = (trimmedLine.match(/\{/g) || []).length;
      const closeBraces = (trimmedLine.match(/\}/g) || []).length;
      
      if (openBraces > closeBraces) {
        indentLevel += openBraces - closeBraces;
      } else if (closeBraces > openBraces && !trimmedLine.startsWith('}')) {
        indentLevel = Math.max(0, indentLevel - (closeBraces - openBraces));
      }
      
      return indentedLine;
    }).filter(line => line !== ''); // Remove empty lines
    
    return formattedLines.join('\n');
  } catch (error) {
    console.error('Error formatting JavaScript:', error);
    return code; // Return original code if formatting fails
  }
}

/**
 * Minifies JavaScript code by removing unnecessary whitespace
 * @param code The JavaScript code to minify
 * @returns Minified code string
 */
export function minifyJavaScript(code: string): string {
  if (!code) return '';
  
  try {
    // Basic minification - remove extra whitespace
    return code
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\s*{\s*/g, '{') // Remove spaces around braces
      .replace(/\s*}\s*/g, '}')
      .replace(/\s*;\s*/g, ';') // Remove spaces around semicolons
      .replace(/\s*,\s*/g, ',') // Remove spaces around commas
      .replace(/\s*:\s*/g, ':') // Remove spaces around colons
      .trim();
  } catch (error) {
    console.error('Error minifying JavaScript:', error);
    return code;
  }
} 