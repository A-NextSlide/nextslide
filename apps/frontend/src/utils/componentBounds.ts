import { ComponentInstance } from '@/types/components';

export type ComponentBounds = { x: number; y: number; width: number; height: number };

export const getComponentBounds = (component: ComponentInstance): ComponentBounds | null => {
  if (component.type === 'Lines' || component.type === 'Line' || component.type === 'line') {
    const start = component.props.startPoint || { x: 0, y: 0 };
    const end = component.props.endPoint || { x: 100, y: 100 };
    const minX = Math.min(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const width = Math.max(10, Math.abs(end.x - start.x));
    const height = Math.max(10, Math.abs(end.y - start.y));
    return {
      x: minX,
      y: minY,
      width,
      height,
    };
  }

  const position = component.props.position || { x: 0, y: 0 };
  const rawWidth = component.props.size?.width ?? component.props.width ?? 0;
  const rawHeight = component.props.size?.height ?? component.props.height ?? 0;
  const width = typeof rawWidth === 'number' ? rawWidth : Number(rawWidth);
  const height = typeof rawHeight === 'number' ? rawHeight : Number(rawHeight);

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }

  return {
    x: position.x || 0,
    y: position.y || 0,
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
};

export const getBoundsCenter = (bounds: ComponentBounds): { x: number; y: number } => ({
  x: bounds.x + bounds.width / 2,
  y: bounds.y + bounds.height / 2,
});

export const getBoundsArea = (bounds: ComponentBounds): number => Math.max(1, bounds.width * bounds.height);

export const getIntersectionArea = (a: ComponentBounds, b: ComponentBounds): number => {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return xOverlap * yOverlap;
};
