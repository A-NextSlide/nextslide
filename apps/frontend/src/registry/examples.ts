import { v4 as uuid } from 'uuid';
import { Type, Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { 
  UIProperty, 
  UIObject, 
  registry, 
  createComponent,
  getComponentDefinition,
  TypeFromSchema
} from './index';
// import { TextBlockSchema } from './components/text-block';
import { ChartSchema } from './components/chart';

/**
 * Example 1: Get information about registered component types
 */
export function listRegisteredComponents() {
  const components = registry.getAllDefinitions();
  
  console.log(`Registered components (${components.length}):`);
  components.forEach(def => {
    console.log(`- ${def.type}: ${def.name} (Category: ${def.category || 'none'})`);
  });
  
  return components;
}

/**
 * Example 3: Create a Chart component with nested properties
 */
export function createChartExample() {
  // Create a new Chart instance with custom properties
  const chartComponent = createComponent<typeof ChartSchema>('Chart', uuid(), {
    chartType: 'pie',
    data: [
      { name: 'Segment 1', value: 30, color: '#ff4560' },
      { name: 'Segment 2', value: 40, color: '#008ffb' },
      { name: 'Segment 3', value: 30, color: '#00e396' }
    ],
    innerRadius: 0.6, // Make it a donut chart
    enableArcLinkLabels: true,
    position: { x: 800, y: 400 },
    width: 500,
    height: 400
  });
  
  console.log('Created Chart component:', chartComponent);
  
  return chartComponent;
}

/**
 * Example 4: Create a new schema at runtime
 */
export function createCustomSchema() {
  // Define a custom schema using TypeBox
  const CustomSchema = UIObject('Custom Object', {
    name: UIProperty(Type.String(), {
      control: 'input',
      label: 'Name',
      description: 'Name of the custom object'
    }),
    
    age: UIProperty(Type.Number(), {
      control: 'slider',
      label: 'Age',
      description: 'Age of the custom object',
      controlProps: {
        min: 0,
        max: 100
      }
    }),
    
    tags: UIProperty(Type.Array(Type.String()), {
      control: 'custom',
      label: 'Tags',
      description: 'Tags for the custom object'
    })
  });
  
  // Create a type from the schema
  type CustomType = Static<typeof CustomSchema>;
  
  // Create an instance of the custom type
  const instance: CustomType = {
    name: 'Custom Object',
    age: 25,
    tags: ['example', 'custom', 'typebox']
  };
  
  // Validate the instance
  if (Value.Check(CustomSchema, instance)) {
    console.log('Custom instance is valid');
  } else {
    console.error('Custom instance is invalid');
  }
  
  console.log('Custom schema:', CustomSchema);
  console.log('Custom instance:', instance);
  
  return { schema: CustomSchema, instance };
}

/**
 * Run all examples
 */
export function runAllExamples() {
  console.log('--- Example 1: List Registered Components ---');
  listRegisteredComponents();
  
  console.log('\n--- Example 3: Create Chart Component ---');
  createChartExample();
  
  console.log('\n--- Example 4: Create Custom Schema ---');
  createCustomSchema();
}

// Uncomment to run examples
// runAllExamples(); 