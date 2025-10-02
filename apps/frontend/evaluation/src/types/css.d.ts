/**
 * CSS Module Declaration for TypeScript
 * 
 * This declaration file tells TypeScript how to handle CSS imports
 * when running in the Node.js environment for experiments.
 * It supports both default exports and direct imports.
 */

declare module '*.css' {
  const styles: Record<string, string>;
  export default styles;
} 