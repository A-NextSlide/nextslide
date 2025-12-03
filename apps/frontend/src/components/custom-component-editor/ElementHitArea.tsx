/**
 * ElementHitArea - Invisible clickable area positioned over an iframe element
 *
 * This component creates a transparent overlay that captures mouse events
 * for element selection, without interfering with the iframe's visual rendering.
 *
 * Z-index hierarchy (higher = on top, clickable first):
 * - Text elements: 10000 (highest priority - always clickable)
 * - Image elements: 5000
 * - Container elements: 1000 (lowest - only select if nothing else is clicked)
 */

import React from 'react';
import { VirtualElement } from './types';

interface ElementHitAreaProps {
  element: VirtualElement;
  isSelected: boolean;
  onSelect: (cursorX: number, cursorY: number) => void;
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

  // Calculate z-index based on element type and size
  // Smaller elements should be on top (more specific), larger elements below
  const getZIndex = () => {
    const area = element.bounds.width * element.bounds.height;
    // Base z-index by type
    const baseZ = element.type === 'text' ? 10000 : (element.type === 'image' ? 5000 : 1000);
    // Subtract area factor so smaller elements are on top
    // Clamp to ensure we don't go below the type's base tier
    const minZ = element.type === 'text' ? 9000 : (element.type === 'image' ? 4000 : 500);
    return Math.max(minZ, baseZ - Math.floor(area / 1000));
  };

  // Set to true to show debug colors for hit areas
  const DEBUG_HIT_AREAS = false;

  return (
    <div
      className="fixed"
      style={{
        left: element.bounds.x,
        top: element.bounds.y,
        width: element.bounds.width,
        height: element.bounds.height,
        pointerEvents: 'auto',
        cursor: element.type === 'text' ? 'text' : 'pointer',
        zIndex: getZIndex(),
        // Debug colors: green=text, blue=image, red=container
        backgroundColor: DEBUG_HIT_AREAS
          ? (element.type === 'text' ? 'rgba(0, 255, 0, 0.15)' : (element.type === 'image' ? 'rgba(0, 0, 255, 0.15)' : 'rgba(255, 0, 0, 0.1)'))
          : 'transparent',
        border: DEBUG_HIT_AREAS
          ? (element.type === 'text' ? '1px solid rgba(0, 255, 0, 0.5)' : (element.type === 'image' ? '1px solid rgba(0, 0, 255, 0.5)' : '1px dashed rgba(255, 0, 0, 0.3)'))
          : 'none',
      }}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onSelect(e.clientX, e.clientY);
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
