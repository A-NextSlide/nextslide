import { ComponentInstance } from '@/types/components';
import { getComponentBounds } from '@/utils/componentBounds';

export type SlidePoint = { x: number; y: number };

const isBackgroundComponent = (component: ComponentInstance): boolean => {
  return component.type === 'Background' ||
    (component.id && component.id.toLowerCase().includes('background'));
};

const getComponentZIndex = (component: ComponentInstance): number => {
  const zIndex = component.props?.zIndex;
  return typeof zIndex === 'number' ? zIndex : Number(zIndex) || 0;
};

const isPointInBounds = (point: SlidePoint, bounds: { x: number; y: number; width: number; height: number }): boolean => {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
};

const getComponentArea = (bounds: { width: number; height: number }): number => {
  return Math.max(1, bounds.width * bounds.height);
};

const buildParentMap = (components: ComponentInstance[]): Map<string, string> => {
  const parentMap = new Map<string, string>();
  components.forEach(component => {
    const parentId = component.props?.parentId;
    if (parentId) {
      parentMap.set(component.id, parentId);
    }
  });
  return parentMap;
};

const buildComponentMap = (components: ComponentInstance[]): Map<string, ComponentInstance> => {
  const map = new Map<string, ComponentInstance>();
  components.forEach(component => {
    map.set(component.id, component);
  });
  return map;
};

export const getSelectionPathAtPoint = (
  components: ComponentInstance[],
  point: SlidePoint
): string[] => {
  const selectable = components.filter(component => !isBackgroundComponent(component));
  if (selectable.length === 0) {
    return [];
  }

  const hits = selectable
    .map(component => {
      const bounds = getComponentBounds(component);
      if (!bounds || !isPointInBounds(point, bounds)) {
        return null;
      }
      return {
        component,
        bounds,
        zIndex: getComponentZIndex(component),
        area: getComponentArea(bounds),
      };
    })
    .filter((hit): hit is NonNullable<typeof hit> => Boolean(hit));

  if (hits.length === 0) {
    return [];
  }

  const leafHits = hits.filter(hit => hit.component.type !== 'Group');
  const candidates = leafHits.length > 0 ? leafHits : hits;

  candidates.sort((a, b) => {
    if (a.zIndex !== b.zIndex) {
      return b.zIndex - a.zIndex;
    }
    return a.area - b.area;
  });

  const topCandidate = candidates[0];
  if (!topCandidate) {
    return [];
  }

  const parentMap = buildParentMap(selectable);
  const componentMap = buildComponentMap(selectable);
  const path: string[] = [];

  let currentId: string | undefined = topCandidate.component.id;
  while (currentId) {
    const currentComponent = componentMap.get(currentId);
    if (!currentComponent) {
      break;
    }
    path.push(currentId);
    currentId = parentMap.get(currentId);
  }

  return path.reverse();
};

export const getSelectionPathForComponent = (
  components: ComponentInstance[],
  componentId: string
): string[] => {
  const componentMap = buildComponentMap(components);
  if (!componentMap.has(componentId)) {
    return [];
  }

  const parentMap = buildParentMap(components);
  const path: string[] = [];
  let currentId: string | undefined = componentId;

  while (currentId) {
    if (!componentMap.has(currentId)) break;
    path.push(currentId);
    currentId = parentMap.get(currentId);
  }

  return path.reverse();
};

export const isBackgroundOnlySelection = (
  components: ComponentInstance[],
  selectedComponentIds: Set<string>
): boolean => {
  if (selectedComponentIds.size === 0) {
    return true;
  }

  const selectedComponents = components.filter(component => selectedComponentIds.has(component.id));
  if (selectedComponents.length === 0) {
    return true;
  }

  return selectedComponents.every(component => isBackgroundComponent(component));
};
