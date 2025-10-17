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
    render: `function render({ props, state, updateState, isThumbnail, containerWidth, containerHeight }) {
  // Theme-aware, centered, SVG-rich default component
  var value = props.value || '92%';
  var label = props.label || 'Customer Satisfaction';
  var primaryColor = props.primaryColor || props.color || '#3B82F6';
  var secondaryColor = props.secondaryColor || '#8B5CF6';
  var textColor = props.textColor || '#111827';
  var padding = props.padding || 24;
  var width = (props.width || containerWidth || 800);
  var height = (props.height || containerHeight || 500);

  // Root container centered layout with subtle gradient background
  var rootStyle = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    overflow: 'hidden',
    borderRadius: '24px',
    background: 'linear-gradient(135deg, ' + primaryColor + '10 0%, ' + secondaryColor + '10 100%)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.08)'
  };

  return React.createElement('div', { style: rootStyle },
    React.createElement('svg', {
      viewBox: '0 0 100 100',
      preserveAspectRatio: 'xMidYMid meet',
      style: { width: '90%', height: '90%' }
    },
      React.createElement('defs', null,
        React.createElement('radialGradient', { id: 'g1', cx: '50%', cy: '50%', r: '60%' },
          React.createElement('stop', { offset: '0%', stopColor: primaryColor, stopOpacity: 0.18 }),
          React.createElement('stop', { offset: '100%', stopColor: secondaryColor, stopOpacity: 0 })
        )
      ),
      React.createElement('circle', { cx: 50, cy: 50, r: 40, fill: 'url(#g1)' }),
      React.createElement('text', {
        x: 50,
        y: 46,
        textAnchor: 'middle',
        dominantBaseline: 'central',
        fill: primaryColor,
        style: { fontSize: '28px', fontWeight: '900' }
      }, value),
      React.createElement('text', {
        x: 50,
        y: 70,
        textAnchor: 'middle',
        fill: textColor,
        style: { fontSize: '7px', fontWeight: '600', opacity: 0.85 }
      }, label)
    )
  );
}`,
    props: {},
    width: 800,
    height: 500
  },
  category: 'advanced'
}; 