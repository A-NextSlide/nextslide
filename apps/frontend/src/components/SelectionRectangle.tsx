import React from 'react';

interface SelectionRectangleProps {
  rectangle: { x: number; y: number; width: number; height: number } | null;
}

const SelectionRectangle: React.FC<SelectionRectangleProps> = ({ rectangle }) => {
  if (!rectangle) return null;

  return (
    <div
      className="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-none"
      style={{
        left: `${rectangle.x}px`,
        top: `${rectangle.y}px`,
        width: `${rectangle.width}px`,
        height: `${rectangle.height}px`,
        zIndex: 1000,
        pointerEvents: 'none'
      }}
    />
  );
};

export default SelectionRectangle; 