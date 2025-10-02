/**
 * Demo script for TypeBox Registry
 * 
 * This demonstrates how the new TypeBox-based registry system works with all components
 */

import { v4 as uuid } from 'uuid';
import * as Registry from '../src/registry';
import { Value } from '@sinclair/typebox/value';
import { TObject, TSchema } from '@sinclair/typebox';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Print heading
console.log('='.repeat(50));
console.log('TypeBox Registry Demo');
console.log('='.repeat(50));
console.log();

// List all registered components
const components = Registry.registry.getAllDefinitions();
console.log(`Found ${components.length} registered components:`);
components.forEach(def => {
  console.log(`- ${def.type}: ${def.name} (Category: ${def.category || 'none'})`);
});
console.log();

// Print component counts by category
const categoryCounts: Record<string, number> = {};
components.forEach(def => {
  const category = def.category || 'uncategorized';
  categoryCounts[category] = (categoryCounts[category] || 0) + 1;
});

console.log('Components by category:');
Object.entries(categoryCounts).forEach(([category, count]) => {
  console.log(`- ${category}: ${count} components`);
});
console.log();

// Create an instance of each component type to demonstrate creation
console.log('\n='.repeat(50));
console.log('Component Creation Demo');
console.log('='.repeat(50));

// Create and validate a component instance for each type
let displayIndex = 1;
components.forEach(def => {
  console.log(`\n#${displayIndex++}: Creating ${def.name} component (${def.type}):`);
  
  // Create instance with minimal properties
  const id = uuid();
  const instance = Registry.createComponent(def.type, id);
  
  if (!instance) {
    console.error(`Failed to create ${def.type} instance`);
    return;
  }
  
  // Get schema properties count
  const propCount = Object.keys(def.schema.properties || {}).length;
  
  // Show just the type, id, and property count rather than all properties
  console.log(`Instance created with type '${instance.type}', id '${id.substring(0, 8)}...' and ${propCount} schema properties`);
  
  // Validate the instance
  const isValid = Value.Check(def.schema, instance.props);
  console.log(`Validation result: ${isValid ? 'Valid ✓' : 'Invalid ✗'}`);
});

// Demonstrate schema export for documentation or API purposes
console.log('\n='.repeat(50));
console.log('Schema Export Demo');
console.log('='.repeat(50));

// Get the Chart component definition
const chartDef = Registry.registry.getDefinition('Chart');
if (chartDef) {
  console.log('\nExporting Chart component schema:');
  
  // Convert TypeBox schema to JSON Schema
  const jsonSchema = chartDef.schema;
  
  // Pretty print the schema to console
  console.log('\nChart Schema Properties:');
  const propertyNames = Object.keys(jsonSchema.properties || {});
  console.log(`Found ${propertyNames.length} properties`);
  
  // Group properties by their section
  const groupedProps: Record<string, string[]> = {
    'Basic': [],
    'Chart-specific': [],
    'Bar-specific': [],
    'Pie-specific': [],
    'Line-specific': [],
    'Layout': [],
    'Other': []
  };
  
  // Categorize properties
  propertyNames.forEach(propName => {
    const prop = jsonSchema.properties[propName];
    
    // Basic component properties
    if (['position', 'width', 'height', 'opacity', 'rotation', 'zIndex'].includes(propName)) {
      groupedProps['Basic'].push(propName);
    }
    // Chart specific properties
    else if (['chartType', 'data', 'colors', 'animate', 'theme', 'showLegend', 'enableLabel'].includes(propName)) {
      groupedProps['Chart-specific'].push(propName);
    }
    // Bar-specific properties with showWhen
    else if (prop.metadata?.controlProps?.showWhen?.chartType === 'bar' || 
             propName === 'verticalAnimation' || propName === 'borderRadius') {
      groupedProps['Bar-specific'].push(propName);
    }
    // Pie-specific properties with showWhen
    else if (prop.metadata?.controlProps?.showWhen?.chartType === 'pie' || 
             ['innerRadius', 'padAngle', 'cornerRadius', 'enableArcLinkLabels'].includes(propName)) {
      groupedProps['Pie-specific'].push(propName);
    }
    // Line-specific properties with showWhen
    else if (prop.metadata?.controlProps?.showWhen?.chartType === 'line' || 
             ['startYAtZero', 'smoothCurve', 'lineWidth'].includes(propName)) {
      groupedProps['Line-specific'].push(propName);
    }
    // Layout properties
    else if (['margin', 'axisBottom', 'axisLeft', 'tickSpacing'].includes(propName)) {
      groupedProps['Layout'].push(propName);
    }
    // Other properties
    else {
      groupedProps['Other'].push(propName);
    }
  });
  
  // Print grouped properties
  Object.entries(groupedProps).forEach(([group, props]) => {
    if (props.length > 0) {
      console.log(`\n${group} properties:`);
      props.forEach(prop => {
        const propSchema = jsonSchema.properties[prop];
        const title = propSchema.title || prop;
        const type = propSchema.type || 'object';
        const control = propSchema.metadata?.control || 'none';
        console.log(`  - ${title} (${type}): control=${control}`);
      });
    }
  });
  
  // Export full schema to a file
  try {
    const outputDir = path.join(__dirname, '../out');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const schemaPath = path.join(outputDir, 'chart-schema.json');
    fs.writeFileSync(schemaPath, JSON.stringify(jsonSchema, null, 2));
    console.log(`\nFull schema exported to: ${schemaPath}`);
  } catch (error) {
    console.error('Error exporting schema:', error);
  }
} else {
  console.error('Chart component not found');
}

console.log('\n='.repeat(50));
console.log('Demo completed!');
console.log('='.repeat(50)); 