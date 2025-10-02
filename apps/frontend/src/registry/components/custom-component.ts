import { Type } from '@sinclair/typebox';
import { UIObject, UIProperty, TypeFromSchema, UIRecord } from '../schemas';
import { BaseComponentSchema, baseComponentDefaults } from '../base';
import { ComponentDefinition } from '../registry';
import React from 'react';

/**
 * CustomComponent Schema
 * Allows insertion of dynamic, JavaScript-powered custom content
 */
export const CustomComponentSchema = UIObject(
  'Custom',
  {
    ...BaseComponentSchema.properties,
    
  render: UIProperty(Type.String(), {
    control: 'code-editor',
    label: 'Render Function',
    description: 'JavaScript code that returns a React component'
  }),

  props: UIRecord('Component Props', Type.String(), Type.Any(), 'Custom properties passed to the rendering function')
});

/**
 * CustomComponent properties type
 */
export type CustomComponentProps = TypeFromSchema<typeof CustomComponentSchema>;

/**
 * CustomComponent definition
 */
export const CustomComponentDefinition: ComponentDefinition<typeof CustomComponentSchema> = {
  type: 'CustomComponent',
  name: 'Custom Component',
  schema: CustomComponentSchema,
  defaultProps: {
    ...baseComponentDefaults,
    render: `function render({ props, state, updateState, isThumbnail }) {
  // Define editable properties with defaults
  const text = props.text || "Hello from custom component!";
  const fontSize = props.fontSize || 24;
  const color = props.color || "#4287f5";
  const backgroundColor = props.backgroundColor || "#f0f0f0";
  const padding = props.padding || 20;
  const borderRadius = props.borderRadius || 8;
  const isAnimated = props.isAnimated || false;
  const animationSpeed = props.animationSpeed || 1000; // ms
  const theme = props.theme || "light"; // Options: light, dark, colorful
  
  // Component state
  const count = state.count || 0;
  
  // Disable animations in thumbnail mode
  const shouldAnimate = isAnimated && !isThumbnail;
  
  // Build transition string after all variables are defined
  const transitionValue = shouldAnimate ? ('all ' + animationSpeed + 'ms ease-in-out') : 'none';
  
  // Styles based on properties
  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    padding: padding + 'px',
    backgroundColor: theme === 'dark' ? '#1a1a1a' : theme === 'colorful' ? backgroundColor : '#ffffff',
    borderRadius: borderRadius + 'px',
    transition: transitionValue,
    boxShadow: theme === 'dark' ? '0 4px 6px rgba(0, 0, 0, 0.3)' : '0 2px 4px rgba(0, 0, 0, 0.1)'
  };
  
  const textStyle = {
    fontSize: fontSize + 'px',
    color: theme === 'dark' ? '#ffffff' : color,
    fontWeight: 'bold',
    marginBottom: '10px',
    textAlign: 'center'
  };
  
  const buttonStyle = {
    padding: '8px 16px',
    fontSize: '14px',
    backgroundColor: color,
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'opacity 0.2s'
  };
  
  return React.createElement('div', { style: containerStyle },
    React.createElement('h2', { style: textStyle }, text),
    React.createElement('p', { style: { color: theme === 'dark' ? '#ccc' : '#666' } }, 
      'Count: ' + count
    ),
    React.createElement('button', {
      style: buttonStyle,
      onClick: () => updateState({ count: count + 1 }),
      onMouseEnter: (e) => e.target.style.opacity = '0.8',
      onMouseLeave: (e) => e.target.style.opacity = '1'
    }, 'Click Me!')
  );
}`,
    props: {},
    width: 400,
    height: 200
  },
  category: 'advanced'
}; 