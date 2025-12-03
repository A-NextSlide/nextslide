/**
 * ElementHitArea - Invisible clickable area positioned over an iframe element
 *
 * This component creates a transparent overlay that captures mouse events
 * for element selection, without interfering with the iframe's visual rendering.
 */

import React from 'react';
import { VirtualElement } from './types';

interface ElementHitAreaProps {
  element: VirtualElement;
  isSelected: boolean;
  onSelect: () => void;
  onDoubleClick: () => void;
  disabled?: boolean;
}

export const ElementHitArea: React.FC<ElementHitAreaProps> = ({
  element,
  isSelected,
  onSelect,
  onDoubleClick,
  disabled = false,
}) => {
  if (disabled) return null;

  return (
    <div
      className="absolute"
      style={{
        left: element.bounds.x,
        top: element.bounds.y,
        width: element.bounds.width,
        height: element.bounds.height,
        pointerEvents: 'auto',
        cursor: element.type === 'text' ? 'text' : 'pointer',
        zIndex: isSelected ? 25 : 20,
        // Debug: uncomment to see hit areas
        backgroundColor: 'rgba(255, 0, 0, 0.1)',
      }}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onDoubleClick();
      }}
      data-element-id={element.id}
      data-element-type={element.type}
    />
  );
};

export default ElementHitArea;
