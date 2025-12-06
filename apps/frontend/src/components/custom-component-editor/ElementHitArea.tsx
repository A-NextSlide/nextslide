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
  /** Area of the currently selected element, used to ensure smaller elements stay clickable */
  selectedElementArea?: number;
}

export const ElementHitArea: React.FC<ElementHitAreaProps> = ({
  element,
  isSelected,
  onSelect,
  onDoubleClick,
  disabled = false,
  selectedElementArea = 0,
}) => {
  if (disabled) return null;
  // Don't render hit area for the currently selected element (selection overlay handles it)
  if (isSelected) return null;

  const elementArea = element.bounds.width * element.bounds.height;

  // Calculate z-index based on element type and size
  // CRITICAL: Smaller elements must ALWAYS be on top so they're clickable
  const getZIndex = () => {
    // Use inverse area as primary factor - smaller = higher z-index
    // Max viewport area is ~2M pixels, so divide by 100 to get manageable numbers
    const areaFactor = Math.max(1, 20000 - Math.floor(elementArea / 100));

    // Type bonus (text always on top within same size tier)
    const typeBonus = element.type === 'text' ? 50000 : (element.type === 'image' ? 30000 : 10000);

    // BASE z-index that's ABOVE the selection overlay (which is at 15000)
    // This ensures unselected smaller elements can still be clicked
    const baseZ = 100000;

    return baseZ + typeBonus + areaFactor;
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
