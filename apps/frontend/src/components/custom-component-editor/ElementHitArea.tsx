/**
 * ElementHitArea - Invisible clickable area positioned over an iframe element
 *
 * This component creates a transparent overlay that captures mouse events
 * for element selection, without interfering with the iframe's visual rendering.
 *
 * Z-index hierarchy (smaller elements always on top):
 * - Smaller area = higher z-index
 * - Type bonus: text > image > container
 *
 * When an element is selected, hit areas are hidden to allow drag/resize.
 * The selection overlay handles clicking to select nested elements.
 */

import React from 'react';
import { VirtualElement } from './types';

interface ElementHitAreaProps {
  element: VirtualElement;
  isSelected: boolean;
  onSelect: (cursorX: number, cursorY: number) => void;
  onDoubleClick: () => void;
  disabled?: boolean;
  /** When true, hide all hit areas (something is selected, let selection overlay handle clicks) */
  hideForSelection?: boolean;
}

export const ElementHitArea: React.FC<ElementHitAreaProps> = ({
  element,
  isSelected,
  onSelect,
  onDoubleClick,
  disabled = false,
  hideForSelection = false,
}) => {
  if (disabled) return null;
  // Don't render any hit areas when something is selected - selection overlay handles interaction
  if (hideForSelection) return null;

  const elementArea = element.bounds.width * element.bounds.height;

  // Calculate z-index based on element type and size
  // Smaller elements must ALWAYS be on top so they're clickable
  const getZIndex = () => {
    // Use inverse area as primary factor - smaller = higher z-index
    const areaFactor = Math.max(1, 20000 - Math.floor(elementArea / 100));

    // Type bonus (text always on top within same size tier)
    const typeBonus = element.type === 'text' ? 5000 : (element.type === 'image' ? 3000 : 1000);

    return 10000 + typeBonus + areaFactor;
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
        // Use pointer cursor for all - click selects, double-click edits (for text)
        cursor: 'pointer',
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
        // For text elements, single click starts editing immediately
        if (element.type === 'text') {
          onDoubleClick();
        } else {
          onSelect(e.clientX, e.clientY);
        }
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
