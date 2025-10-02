export interface ParsedVariable {
  name: string;
  type: 'text' | 'number' | 'color' | 'boolean' | 'select';
  defaultValue: any;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  unit?: string;
  suggestion?: boolean; // Indicates this is a suggested variable from hardcoded values
  lineNumber?: number;
  originalCode?: string;
}

export interface ParseResult {
  variables: ParsedVariable[];
  cleanedCode: string;
  suggestions: ParsedVariable[]; // Suggested variables from hardcoded values
}

// Patterns to detect different types of variables
// Enhanced to support:
// - const/let/var
// - || or ?? fallback
// - props.prop or props?.prop or props['prop']
// - Color strings: hex, rgb(a), hsl(a)
const VARIABLE_PATTERNS = {
  // const text = props.text || "Default Text";  OR  let text = props?.text ?? "Default"; OR props['text']
  text: /(?:const|let|var)\s+(\w+)\s*=\s*(?:props\??\.(\w+)|props\[["'](\w+)["']\])\s*(?:\|\||\?\?)\s*["'`]([^"'`]*)["'`]/g,

  // const fontSize = props.fontSize || 16;  OR  var fontSize = props?.fontSize ?? 16;
  number: /(?:const|let|var)\s+(\w+)\s*=\s*(?:props\??\.(\w+)|props\[["'](\w+)["']\])\s*(?:\|\||\?\?)\s*(\d+(?:\.\d+)?)/g,

  // const color = props.color || "#4287f5"; OR rgb()/hsl()/hex
  color: /(?:const|let|var)\s+(\w+)\s*=\s*(?:props\??\.(\w+)|props\[["'](\w+)["']\])\s*(?:\|\||\?\?)\s*["'`](#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))["'`]/g,

  // const isEnabled = props.isEnabled || true;  OR  ?? true
  boolean: /(?:const|let|var)\s+(\w+)\s*=\s*(?:props\??\.(\w+)|props\[["'](\w+)["']\])\s*(?:\|\||\?\?)\s*(true|false)/g,

  // const animationSpeed = props.speed || 1000; // ms  OR  ?? 1000
  numberWithUnit: /(?:const|let|var)\s+(\w+)\s*=\s*(?:props\??\.(\w+)|props\[["'](\w+)["']\])\s*(?:\|\||\?\?)\s*(\d+(?:\.\d+)?)\s*;\s*\/\/\s*(\w+)/g,

  // const mode = props.mode || "light"; // Options: light, dark
  select: /(?:const|let|var)\s+(\w+)\s*=\s*(?:props\??\.(\w+)|props\[["'](\w+)["']\])\s*(?:\|\||\?\?)\s*["'`]([^"'`]*)["'`]\s*;\s*\/\/\s*Options:\s*([^\n]+)/g,
};

// Patterns to detect hardcoded values that could be made editable
const HARDCODED_PATTERNS = {
  // Direct color values: '#ffcb05', 'rgba(255, 203, 5, 0.5)'
  color: /#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)/g,
  
  // fontSize: '120px', width: '8px', etc.
  cssSize: /(\w+):\s*['"`]?(\d+(?:\.\d+)?)(px|em|rem|%|vh|vw)['"`]?/g,
  
  // Direct numbers in common contexts - updated to capture property name as well
  number: /(?:(fontSize|width|height|size|duration|delay|count|value|radius|margin|padding|opacity)):\s*['"`]?(\d+(?:\.\d+)?)['"`]?/g,
  
  // Text content in React elements - multiple patterns to catch different formats
  textContent: /(?:React\.createElement\s*\([^,)]+,\s*[^,)]+,\s*|}\s*,\s*)['"`]([^'"`]{3,})['"`](?:\s*[,)\]])/g,
  
  // Variable assignments that could be props - fixed to properly capture numbers without quotes
  constAssignment: /const\s+(\w+)\s*=\s*(\d+(?:\.\d+)?|['"`][^'"`]+['"`]|true|false)(?:\s*;)?/g,
};

// Helper to infer variable type from name and value
function inferVariableType(name: string, value: any): ParsedVariable['type'] {
  const lowerName = name.toLowerCase();
  
  // Check name patterns
  if (lowerName.includes('color') || lowerName.includes('background') || lowerName.includes('fill') || lowerName.includes('stroke')) {
    return 'color';
  }
  // Treat font variables as text so UI can render a font selector
  if (lowerName.includes('font') || lowerName.includes('typeface')) {
    return 'text';
  }
  if (lowerName.includes('text') || lowerName.includes('label') || lowerName.includes('title') || lowerName.includes('message') || lowerName.includes('content')) {
    return 'text';
  }
  if (lowerName.startsWith('is') || lowerName.startsWith('has') || lowerName.startsWith('show') || lowerName.includes('enabled')) {
    return 'boolean';
  }
  
  // Check value type
  if (
    typeof value === 'string' && (
      /^#[0-9a-fA-F]{3,8}$/.test(value) || /^(?:rgba?|hsla?)\([^)]+\)$/.test(value)
    )
  ) {
    return 'color';
  }
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  if (typeof value === 'number') {
    return 'number';
  }
  
  return 'text';
}

// Create a human-readable label from variable name
function createLabel(name: string): string {
  // Convert camelCase to Title Case
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

// Suggest a prop name from context
function suggestPropName(context: string, value: string, index: number): string {
  // Try to extract a meaningful name from the context
  const contextLower = context.toLowerCase();
  
  // More specific color naming based on CSS property
  if (value.startsWith('#') || value.startsWith('rgba') || value.startsWith('rgb')) {
    // Check the specific CSS property
    const bgMatch = context.match(/backgroundColor\s*:/i);
    const colorMatch = context.match(/color\s*:/i);
    const shadowMatch = context.match(/(?:boxShadow|textShadow)\s*:/i);
    const borderMatch = context.match(/border(?:Color)?\s*:/i);
    
    if (bgMatch) return 'backgroundColor';
    if (shadowMatch) {
      if (context.includes('textShadow')) return 'textShadowColor';
      return 'shadowColor';
    }
    if (borderMatch) return 'borderColor';
    if (colorMatch) {
      // Try to be more specific based on surrounding context
      if (contextLower.includes('text') || contextLower.includes('font')) return 'textColor';
      return 'color';
    }
    
    // Fallback color naming
    if (contextLower.includes('background')) return 'backgroundColor';
    if (contextLower.includes('text')) return 'textColor';
    if (contextLower.includes('shadow')) return 'shadowColor';
    if (contextLower.includes('border')) return 'borderColor';
    if (contextLower.includes('fill')) return 'fillColor';
    if (contextLower.includes('stroke')) return 'strokeColor';
    
    return 'color';
  }
  
  if (contextLower.includes('fontsize')) return 'fontSize';
  if (contextLower.includes('width')) return 'width';
  if (contextLower.includes('height')) return 'height';
  if (contextLower.includes('radius')) return 'borderRadius';
  if (contextLower.includes('duration')) return 'animationDuration';
  if (contextLower.includes('delay')) return 'animationDelay';
  if (contextLower.includes('target')) return 'targetValue';
  if (contextLower.includes('count')) return 'count';
  if (contextLower.includes('spacing')) return 'spacing';
  if (contextLower.includes('margin')) return 'margin';
  if (contextLower.includes('padding')) return 'padding';
  
  // For text content
  if (value.match(/^[A-Z\s!]+$/)) return 'title'; // All caps text
  if (value.includes('INDEX') || value.includes('LABEL')) return 'label';
  if (typeof value === 'string' && value.length > 3) return 'text';
  
  // Generic fallback
  return `prop${index + 1}`;
}

// Helper to parse destructured assignments: const { size = 12, color = "#fff", flag = true } = props;
function parseDestructuredDefaults(code: string): ParsedVariable[] {
  const results: ParsedVariable[] = [];
  const destructurePattern = /(?:const|let|var)\s*\{\s*([^}]+)\s*\}\s*=\s*props\s*;?/g;
  let match: RegExpExecArray | null;
  while ((match = destructurePattern.exec(code)) !== null) {
    const inside = match[1];
    // Split by commas at top level
    const parts = inside.split(',').map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
      // Supports: name = "text" | 12 | true | false
      const assignMatch = part.match(/^(\w+)\s*=\s*(.+)$/);
      if (!assignMatch) continue;
      const varName = assignMatch[1];
      const rawVal = assignMatch[2].trim();
      // Strip trailing commas if any
      const cleaned = rawVal.replace(/,$/, '');
      let type: ParsedVariable['type'] = 'text';
      let def: any = cleaned;
      if (/^true|false$/i.test(cleaned)) {
        type = 'boolean';
        def = cleaned.toLowerCase() === 'true';
      } else if (/^\d+(?:\.\d+)?$/.test(cleaned)) {
        type = 'number';
        def = parseFloat(cleaned);
      } else if (/^["'](.*)["']$/.test(cleaned)) {
        const strVal = cleaned.slice(1, -1);
        if (/^#[0-9a-fA-F]{3,8}$/.test(strVal) || /^(?:rgba?|hsla?)\([^)]+\)$/.test(strVal)) {
          type = 'color';
          def = strVal;
        } else {
          type = 'text';
          def = strVal;
        }
      } else {
        // Fallback: treat as text
        type = inferVariableType(varName, cleaned);
      }
      results.push({
        name: varName,
        type,
        defaultValue: def,
        label: createLabel(varName),
      });
    }
  }
  return results;
}

// Parse custom component code to extract editable variables
export function parseCustomComponentCode(code: string): ParseResult {
  const variables: ParsedVariable[] = [];
  const suggestions: ParsedVariable[] = [];
  const foundVariables = new Set<string>();
  const foundSuggestions = new Set<string>();
  
  // First, handle destructured defaults
  const destructured = parseDestructuredDefaults(code);
  for (const variable of destructured) {
    if (!foundVariables.has(variable.name)) {
      foundVariables.add(variable.name);
      variables.push(variable);
    }
  }

  // Order matters: detect more specific types before generic text
  let match;

  // Parse color variables first
  VARIABLE_PATTERNS.color.lastIndex = 0;
  while ((match = VARIABLE_PATTERNS.color.exec(code)) !== null) {
    const [, varName, dotProp, bracketProp, defaultValue] = match;
    const propName = dotProp || bracketProp;
    if (!foundVariables.has(propName)) {
      foundVariables.add(propName);
      variables.push({
        name: propName,
        type: 'color',
        defaultValue,
        label: createLabel(propName),
      });
    }
  }
  
  // Parse number variables
  VARIABLE_PATTERNS.number.lastIndex = 0;
  while ((match = VARIABLE_PATTERNS.number.exec(code)) !== null) {
    const [, varName, dotProp, bracketProp, defaultValue] = match;
    const propName = dotProp || bracketProp;
    if (!foundVariables.has(propName)) {
      foundVariables.add(propName);
      const num = parseFloat(defaultValue);
      
      // Infer min/max based on variable name
      let min = 0;
      let max = 100;
      let step = 1;
      
      const lowerName = propName.toLowerCase();
      if (lowerName.includes('size') || lowerName.includes('width') || lowerName.includes('height')) {
        min = 0;
        max = 1000;
        step = 1;
      } else if (lowerName.includes('opacity') || lowerName.includes('alpha')) {
        min = 0;
        max = 1;
        step = 0.1;
      } else if (lowerName.includes('speed') || lowerName.includes('duration')) {
        min = 0;
        max = 10000;
        step = 100;
      } else if (lowerName.includes('radius')) {
        min = 0;
        max = 500;
        step = 1;
      }
      
      variables.push({
        name: propName,
        type: 'number',
        defaultValue: num,
        label: createLabel(propName),
        min,
        max,
        step,
      });
    }
  }
  
  // Parse boolean variables
  VARIABLE_PATTERNS.boolean.lastIndex = 0;
  while ((match = VARIABLE_PATTERNS.boolean.exec(code)) !== null) {
    const [, varName, dotProp, bracketProp, defaultValue] = match;
    const propName = dotProp || bracketProp;
    if (!foundVariables.has(propName)) {
      foundVariables.add(propName);
      variables.push({
        name: propName,
        type: 'boolean',
        defaultValue: defaultValue === 'true',
        label: createLabel(propName),
      });
    }
  }
  
  // Parse numbers with units
  VARIABLE_PATTERNS.numberWithUnit.lastIndex = 0;
  while ((match = VARIABLE_PATTERNS.numberWithUnit.exec(code)) !== null) {
    const [, varName, dotProp, bracketProp, defaultValue, unit] = match;
    const propName = dotProp || bracketProp;
    if (!foundVariables.has(propName)) {
      foundVariables.add(propName);
      const num = parseFloat(defaultValue);
      
      // Set appropriate min/max based on unit
      let min = 0;
      let max = 1000;
      let step = 1;
      
      if (unit === 'ms') {
        max = 10000;
        step = 100;
      } else if (unit === 's') {
        max = 60;
        step = 0.1;
      } else if (unit === 'px') {
        max = 2000;
        step = 1;
      }
      
      variables.push({
        name: propName,
        type: 'number',
        defaultValue: num,
        label: createLabel(propName),
        min,
        max,
        step,
        unit,
      });
    }
  }
  
  // Parse select/enum variables
  VARIABLE_PATTERNS.select.lastIndex = 0;
  while ((match = VARIABLE_PATTERNS.select.exec(code)) !== null) {
    const [, varName, dotProp, bracketProp, defaultValue, optionsStr] = match;
    const propName = dotProp || bracketProp;
    if (!foundVariables.has(propName)) {
      foundVariables.add(propName);
      
      // Parse options from comment
      const options = optionsStr
        .split(',')
        .map(opt => opt.trim())
        .filter(opt => opt.length > 0);
      
      variables.push({
        name: propName,
        type: 'select',
        defaultValue,
        label: createLabel(propName),
        options,
      });
    }
  }

  // Finally parse generic text variables
  VARIABLE_PATTERNS.text.lastIndex = 0;
  while ((match = VARIABLE_PATTERNS.text.exec(code)) !== null) {
    const [, varName, dotProp, bracketProp, defaultValue] = match;
    const propName = dotProp || bracketProp;
    if (!foundVariables.has(propName)) {
      foundVariables.add(propName);
      variables.push({
        name: propName,
        type: 'text',
        defaultValue,
        label: createLabel(propName),
      });
    }
  }
  
  // Also check for any props usage that might not follow the patterns above
  // This catches things like: props.customProp without default values
  const directPropsPattern = /props\??\.(\w+)|props\[["'](\w+)["']\]/g;
  while ((match = directPropsPattern.exec(code)) !== null) {
    const propName = match[1] || match[2];
    if (!foundVariables.has(propName) && propName !== 'props' && propName !== 'id' && propName !== 'state' && propName !== 'updateState' && propName !== 'forceUpdate') {
      foundVariables.add(propName);
      
      // Try to infer type from name
      const type = inferVariableType(propName, '');
      const variable: ParsedVariable = {
        name: propName,
        type,
        defaultValue: type === 'number' ? 0 : type === 'boolean' ? false : '',
        label: createLabel(propName),
      };
      
      // Add appropriate constraints based on type and name
      if (type === 'number') {
        const lowerName = propName.toLowerCase();
        if (lowerName.includes('size') || lowerName.includes('width') || lowerName.includes('height')) {
          variable.min = 0;
          variable.max = 1000;
          variable.step = 1;
        } else {
          variable.min = 0;
          variable.max = 100;
          variable.step = 1;
        }
      }
      
      variables.push(variable);
    }
  }
  
  // Now detect hardcoded values that could be made editable
  let suggestionIndex = 0;
  
  // Detect hardcoded colors
  const colorMatches = [...code.matchAll(HARDCODED_PATTERNS.color)];
  const colorPropCounts = new Map<string, number>();
  
  colorMatches.forEach((match) => {
    const value = match[0];
    if (!foundSuggestions.has(value)) {
      // Get context around the match
      const startIndex = Math.max(0, match.index! - 50);
      const endIndex = Math.min(code.length, match.index! + 50);
      const context = code.substring(startIndex, endIndex);
      
      let propName = suggestPropName(context, value, suggestionIndex++);
      
      // Handle duplicate prop names
      if (foundVariables.has(propName) || suggestions.some(s => s.name === propName)) {
        const count = colorPropCounts.get(propName) || 0;
        colorPropCounts.set(propName, count + 1);
        propName = `${propName}${count + 1}`;
      }
      
      foundSuggestions.add(value);
      suggestions.push({
        name: propName,
        type: 'color',
        defaultValue: value,
        label: createLabel(propName),
        suggestion: true,
        originalCode: value,
      });
    }
  });
  
  // Detect CSS sizes
  const cssSizeMatches = [...code.matchAll(HARDCODED_PATTERNS.cssSize)];
  cssSizeMatches.forEach((match) => {
    const [fullMatch, property, value, unit] = match;
    
    // Check if this is part of a complex value (like text-shadow)
    const contextStart = Math.max(0, match.index! - 50);
    const contextEnd = Math.min(code.length, match.index! + 50);
    const context = code.substring(contextStart, contextEnd);
    
    // Skip if this is inside a complex CSS value string
    const complexValuePattern = /['"`][^'"`]*\s+[^'"`]*['"`]/;
    if (complexValuePattern.test(context) && context.includes(fullMatch)) {
      // This is likely part of a complex value like '0 0 2px #color'
      return;
    }
    
    const propName = property === 'fontSize' ? 'fontSize' : 
                    property === 'width' ? 'width' :
                    property === 'height' ? 'height' :
                    property === 'borderRadius' ? 'borderRadius' :
                    property + 'Size';
    
    if (!foundVariables.has(propName) && !foundSuggestions.has(propName)) {
      foundSuggestions.add(propName);
      const num = parseFloat(value);
      suggestions.push({
        name: propName,
        type: 'number',
        defaultValue: num,
        label: createLabel(propName),
        suggestion: true,
        unit: unit,
        min: 0,
        max: unit === 'px' ? 500 : 100,
        step: unit === 'px' ? 1 : 0.1,
        originalCode: fullMatch,
      });
    }
  });
  
  // Detect const assignments that could be props
  const constMatches = [...code.matchAll(HARDCODED_PATTERNS.constAssignment)];
  constMatches.forEach((match) => {
    const [fullMatch, varName, value] = match;
    
    // Skip if it's already a prop
    if (foundVariables.has(varName)) return;
    
    // Determine type and process value
    let type: ParsedVariable['type'];
    let processedValue: any = value;
    
    if (value === 'true' || value === 'false') {
      type = 'boolean';
      processedValue = value === 'true';
    } else if (value.match(/^\d+(?:\.\d+)?$/)) {
      type = 'number';
      processedValue = parseFloat(value);
    } else if (value.match(/^['"`].*['"`]$/)) {
      // Remove quotes
      processedValue = value.slice(1, -1);
      type = inferVariableType(varName, processedValue);
    } else {
      type = 'text';
    }
    
    if (!foundSuggestions.has(varName)) {
      foundSuggestions.add(varName);
      const suggestion: ParsedVariable = {
        name: varName,
        type,
        defaultValue: processedValue,
        label: createLabel(varName),
        suggestion: true,
        originalCode: fullMatch,
      };
      
      // Add constraints for numbers
      if (type === 'number') {
        const lowerName = varName.toLowerCase();
        if (lowerName.includes('duration') || lowerName.includes('delay')) {
          suggestion.min = 0;
          suggestion.max = 10000;
          suggestion.step = 100;
          suggestion.unit = 'ms';
        } else if (lowerName.includes('count') || lowerName.includes('value')) {
          suggestion.min = 0;
          suggestion.max = 1000;
          suggestion.step = 1;
        } else if (lowerName.includes('target')) {
          // Target values should be number inputs, not sliders
          suggestion.min = 0;
          suggestion.max = 10000;
          suggestion.step = 1;
        } else {
          suggestion.min = 0;
          suggestion.max = 100;
          suggestion.step = 1;
        }
      }
      
      suggestions.push(suggestion);
    }
  });
  
  // Detect text content
  const textMatches = [...code.matchAll(HARDCODED_PATTERNS.textContent)];
  // Also check for text in arrays (React.createElement with array of children)
  const arrayTextPattern = /React\.createElement\s*\([^,]+,\s*(?:\{[^}]*\}|null),\s*\[[^\]]*['"`]([^'"`]+)['"`][^\]]*\]/g;
  const arrayTextMatches = [...code.matchAll(arrayTextPattern)];
  const allTextMatches = [...textMatches, ...arrayTextMatches];
  const textPropCounts = new Map<string, number>();
  
  allTextMatches.forEach((match) => {
    const [fullMatch, content] = match;
    
    // Skip if it's too short or looks like code
    if (content.length < 3 || content.includes('{') || content.includes('}')) return;
    
    // Determine prop name based on content
    let propName = 'text';
    if (content.match(/^\d{4}\s+\w+/)) {
      propName = 'yearLabel'; // Pattern like "2024 INDEX"
    } else if (content.match(/^[A-Z\s!]+$/)) {
      propName = 'title'; // All caps text
    } else if (content.includes('INDEX') || content.includes('LABEL')) {
      propName = 'indexLabel';
    } else if (content.includes('Peak') || content.includes('Popularity')) {
      propName = 'subtitle';
    } else if (content.match(/^\d+$/)) {
      propName = 'number';
    } else if (content.length > 20) {
      propName = 'description';
    }
    
    // Handle duplicates
    if (foundVariables.has(propName) || suggestions.some(s => s.name === propName)) {
      const count = textPropCounts.get(propName) || 0;
      textPropCounts.set(propName, count + 1);
      propName = `${propName}${count + 1}`;
    }
    
    if (!foundSuggestions.has(content)) {
      foundSuggestions.add(content);
      suggestions.push({
        name: propName,
        type: 'text',
        defaultValue: content,
        label: createLabel(propName),
        suggestion: true,
        originalCode: fullMatch,
      });
    }
  });

  // Detect string literals inside array/object assignments and suggest props
  // Example: const items = [ { title: 'Text', description: 'More text' }, ... ]
  try {
    const arrayAssignPattern = /(?:const|let|var)\s+(\w+)\s*=\s*\[([\s\S]*?)\];/g;
    let arrayMatch: RegExpExecArray | null;
    while ((arrayMatch = arrayAssignPattern.exec(code)) !== null) {
      const arrayContent = arrayMatch[2];
      // Only match top-level object entries (basic heuristic)
      const objectPattern = /\{[^{}]*\}/g;
      let objIdx = 0;
      let objMatch: RegExpExecArray | null;
      while ((objMatch = objectPattern.exec(arrayContent)) !== null) {
        objIdx += 1;
        const objBody = objMatch[0].slice(1, -1);
        const propPattern = /(\w+)\s*:\s*['"`]([^'"`]+)['"`]/g;
        let propMatch: RegExpExecArray | null;
        while ((propMatch = propPattern.exec(objBody)) !== null) {
          const prop = propMatch[1];
          const val = propMatch[2];
          // Skip obvious colors
          if (/^#[0-9a-fA-F]{3,8}$/.test(val) || /^(?:rgba?|hsla?)\([^)]+\)$/.test(val)) {
            continue;
          }
          // Build a unique variable name like title1, description2, icon3
          const varName = `${prop}${objIdx}`;
          if (!foundVariables.has(varName) && !suggestions.some(s => s.name === varName)) {
            suggestions.push({
              name: varName,
              type: 'text',
              defaultValue: val,
              label: createLabel(varName),
              suggestion: true,
              originalCode: `'${val}'`,
            });
          }
        }
      }
    }
  } catch {
    // best-effort; ignore if regex fails
  }
  
  return {
    variables,
    cleanedCode: code,
    suggestions,
  };
}

// Generate TypeScript interface from parsed variables
export function generatePropsInterface(variables: ParsedVariable[]): string {
  if (variables.length === 0) return '';
  
  const lines = ['interface Props {'];
  
  for (const variable of variables) {
    let type = 'any';
    switch (variable.type) {
      case 'text':
        type = 'string';
        break;
      case 'number':
        type = 'number';
        break;
      case 'boolean':
        type = 'boolean';
        break;
      case 'color':
        type = 'string';
        break;
      case 'select':
        type = variable.options ? variable.options.map(opt => `'${opt}'`).join(' | ') : 'string';
        break;
    }
    
    lines.push(`  ${variable.name}?: ${type};`);
  }
  
  lines.push('}');
  
  return lines.join('\n');
}

// Convert code to use props instead of hardcoded values
export function convertToPropsBasedCode(code: string, acceptedSuggestions: ParsedVariable[]): string {
  let newCode = code;
  
  // Sort suggestions by their position in the code (reverse order to avoid offset issues)
  const sortedSuggestions = [...acceptedSuggestions].sort((a, b) => {
    const posA = code.indexOf(a.originalCode || '');
    const posB = code.indexOf(b.originalCode || '');
    return posB - posA;
  });
  
  // Add prop declarations at the beginning of the function
  const propDeclarations: string[] = [];

  const hasVariableDeclaration = (source: string, varName: string): boolean => {
    const pattern = new RegExp(`(?:const|let|var)\\s+${varName}\\s*=`, 's');
    return pattern.test(source);
  };
  
  sortedSuggestions.forEach((suggestion) => {
    let defaultValueStr = '';
    
    switch (suggestion.type) {
      case 'text':
        defaultValueStr = `"${suggestion.defaultValue}"`;
        break;
      case 'color':
        defaultValueStr = `"${suggestion.defaultValue}"`;
        break;
      case 'number':
        defaultValueStr = String(suggestion.defaultValue);
        break;
      case 'boolean':
        defaultValueStr = String(suggestion.defaultValue);
        break;
      default:
        defaultValueStr = `"${suggestion.defaultValue}"`;
    }
    
    // Only declare if not already declared anywhere
    if (!hasVariableDeclaration(newCode, suggestion.name)) {
      const declaration = `  const ${suggestion.name} = props.${suggestion.name} || ${defaultValueStr};${suggestion.unit ? ' // ' + suggestion.unit : ''}`;
      propDeclarations.push(declaration);
    }
    
    // Replace hardcoded values with variable references
    if (suggestion.originalCode) {
      // For const assignments, replace the entire line
      if (suggestion.originalCode.startsWith('const ')) {
        const lineRegex = new RegExp(`${suggestion.originalCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*\n?`, 'g');
        newCode = newCode.replace(lineRegex, '');
      } else {
        // For inline values in style objects, we need to handle them specially
        const escapedOriginal = suggestion.originalCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Check if this is a CSS property value (e.g., fontSize: '120px')
        // First check if it's a simple property value (not part of a complex value like text-shadow)
        const simplePropertyPattern = new RegExp(`(\\w+)\\s*:\\s*['"\`]?${escapedOriginal}['"\`]?(?:\\s*[,}])`, 'g');
        
        // Replace simple property values
        newCode = newCode.replace(simplePropertyPattern, (match, property) => {
          const ending = match.match(/[,}]$/)?.[0] || '';
          if (suggestion.unit) {
            // For values with units, use template literal
            return `${property}: \`\${${suggestion.name}}${suggestion.unit}\`${ending}`;
          } else {
            // For values without units (like colors), just use the variable
            return `${property}: ${suggestion.name}${ending}`;
          }
        });
        
        // For complex values (like text-shadow), only replace if it's the entire value
        const complexValuePattern = new RegExp(`(\\w+)\\s*:\\s*['"\`]([^'"\`]*${escapedOriginal}[^'"\`]*)['"\`]`, 'g');
        const complexMatches = [...newCode.matchAll(complexValuePattern)];
        
        complexMatches.forEach(match => {
          const [fullMatch, property, value] = match;
          // If this is a complex value with multiple parts, skip it
          if (value.includes(' ') && value !== suggestion.originalCode) {
            // Don't replace partial values in complex CSS strings
            return;
          }
        });
      }
    }

    // Special handling for text node literals used as children in React.createElement
    if (suggestion.type === 'text' && typeof suggestion.defaultValue === 'string') {
      const escapedValue = suggestion.defaultValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Replace occurrences like ..., 'Some text') with ..., textVar)
      const childLiteralPatterns: RegExp[] = [
        // Direct third argument
        new RegExp(`(React\\.createElement\\([^,]+,\\s*(?:\\{[^}]*\\}|null),\\s*)["'\`]${escapedValue}["'\`]`, 'g'),
        // In arrays of children
        new RegExp(`(\\[\\s*)["'\`]${escapedValue}["'\`]`, 'g'),
        // After props object ending
        new RegExp(`(\\},\\s*)["'\`]${escapedValue}["'\`]`, 'g')
      ];
      for (const pattern of childLiteralPatterns) {
        newCode = newCode.replace(pattern, (_m, prefix) => `${prefix}${suggestion.name}`);
      }

      // Replace object literal text fields like { title: 'X', description: 'Y' } inside arrays
      // e.g. title: 'Fast...', description: 'Energy...'
      // Replace fields anywhere inside object literals
      const keyName = suggestion.name.replace(/\d+$/, '');
      const keyPattern = new RegExp(`(\\b${keyName}\\b)\s*:\\s*["'\`]${escapedValue}["'\`]`, 'g');
      newCode = newCode.replace(keyPattern, (_m, key) => `${key}: ${suggestion.name}`);
    }
  });
  
  // Insert prop declarations after the function declaration, but ensure a props alias exists first
  const functionMatch = /function\s+render\s*\(([^)]*)\)\s*\{/;
  const match = newCode.match(functionMatch);
  if (match) {
    let insertPosition = match.index! + match[0].length;
    const marker = '\n  // __props_converted__\n';

    // Detect if there is already an alias in the body: var props = ctx.props || {}; or const props = ...
    const bodyStart = insertPosition;
    const bodySlice = newCode.slice(bodyStart, bodyStart + 400); // small window
    const hasAlias = /\b(?:const|let|var)\s+props\s*=\s*(?:ctx\.)?props\b/.test(bodySlice) || /\bprops\./.test(bodySlice);

    // If no alias and the parameter is an object destruct (e.g., { props, state }), create a local alias
    // Otherwise, safely add a local alias from ctx if available
    let prelude = '';
    if (!hasAlias) {
      // If parameter contains ctx or anything else, prefer ctx.props; else fallback to global props if used
      const params = (match[1] || '').trim();
      if (params && params.includes('ctx')) {
        prelude += '  var props = ctx.props || {};\n';
      } else if (params.startsWith('{') && params.includes('props')) {
        // destructured form already gives props; no alias needed
      } else {
        // generic safe alias, won’t break if props isn’t used
        prelude += '  var props = (typeof props !== "undefined" ? props : (ctx && ctx.props ? ctx.props : {}));\n';
      }
    }

    if (!newCode.includes('__props_converted__')) {
      newCode = newCode.slice(0, insertPosition) + '\n' + prelude + marker + propDeclarations.join('\n') + '\n' + newCode.slice(insertPosition);
    } else if (propDeclarations.length > 0) {
      newCode = newCode.slice(0, insertPosition) + '\n' + prelude + propDeclarations.join('\n') + '\n' + newCode.slice(insertPosition);
    }
  }
  
  // Deduplicate any duplicate variable declarations for the same name (keep the first)
  const dedupeNames = new Set(sortedSuggestions.map(s => s.name));
  dedupeNames.forEach((name) => {
    const declPattern = new RegExp(`((?:const|let|var)\\s+${name}\\s*=\\s*[^;]+;)`, 'gs');
    const matches = [...newCode.matchAll(declPattern)].map(m => ({ start: m.index!, end: m.index! + m[0].length }));
    if (matches.length > 1) {
      // Remove all but the first occurrence, from bottom to top to preserve indices
      for (let i = matches.length - 1; i >= 1; i--) {
        const { start, end } = matches[i];
        newCode = newCode.slice(0, start) + newCode.slice(end);
      }
    }
  });
  
  return newCode;
} 