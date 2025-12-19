import { ComponentInstance } from '@/types/components';
import { ComponentBounds, getBoundsArea, getBoundsCenter, getComponentBounds, getIntersectionArea } from '@/utils/componentBounds';

const isBackgroundComponent = (component: ComponentInstance): boolean =>
  component.type === 'Background' || (component.id && component.id.toLowerCase().includes('background'));

const isLineComponent = (component: ComponentInstance): boolean =>
  component.type === 'Lines' || component.type === 'Line' || component.type === 'line';

const isGroupComponent = (component: ComponentInstance): boolean =>
  component.type === 'Group';

const getComponentZIndex = (component: ComponentInstance): number => {
  const zIndex = component.props?.zIndex;
  return typeof zIndex === 'number' ? zIndex : Number(zIndex) || 0;
};

const boundsAreCompatible = (a: ComponentBounds, b: ComponentBounds): boolean => {
  const centerA = getBoundsCenter(a);
  const centerB = getBoundsCenter(b);
  const centerTolerance = 4;
  const centerAligned =
    Math.abs(centerA.x - centerB.x) <= centerTolerance &&
    Math.abs(centerA.y - centerB.y) <= centerTolerance;

  const maxWidth = Math.max(a.width, b.width);
  const maxHeight = Math.max(a.height, b.height);
  const widthTolerance = Math.max(6, maxWidth * 0.04);
  const heightTolerance = Math.max(6, maxHeight * 0.04);

  const sizeAligned =
    Math.abs(a.width - b.width) <= widthTolerance &&
    Math.abs(a.height - b.height) <= heightTolerance;

  const overlapArea = getIntersectionArea(a, b);
  const overlapRatio = overlapArea / Math.min(getBoundsArea(a), getBoundsArea(b));

  return centerAligned && sizeAligned && overlapRatio >= 0.85;
};

export const calculateGroupBounds = (
  components: ComponentInstance[],
  childIds: string[]
): ComponentBounds | null => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hasBounds = false;

  childIds.forEach((id) => {
    const component = components.find((candidate) => candidate.id === id);
    if (!component) return;
    const bounds = getComponentBounds(component);
    if (!bounds) return;
    hasBounds = true;
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  });

  if (!hasBounds) return null;

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
};

export const autoGroupComponents = (
  components: ComponentInstance[]
): { components: ComponentInstance[]; createdGroupIds: string[] } => {
  const candidates = components.filter((component) => {
    if (isBackgroundComponent(component) || isLineComponent(component) || isGroupComponent(component)) return false;
    if (component.props?.parentId) return false;
    if (component.props?.autoGroupDisabled) return false;
    return true;
  });

  if (candidates.length < 2) {
    return { components, createdGroupIds: [] };
  }

  const boundsById = new Map<string, ComponentBounds>();
  candidates.forEach((component) => {
    const bounds = getComponentBounds(component);
    if (bounds) boundsById.set(component.id, bounds);
  });

  const ids = candidates.map((component) => component.id);
  const parent = new Map<string, string>();
  ids.forEach((id) => parent.set(id, id));

  const find = (id: string): string => {
    const p = parent.get(id);
    if (!p) return id;
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };

  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  for (let i = 0; i < ids.length; i += 1) {
    const idA = ids[i];
    const boundsA = boundsById.get(idA);
    if (!boundsA) continue;
    for (let j = i + 1; j < ids.length; j += 1) {
      const idB = ids[j];
      const boundsB = boundsById.get(idB);
      if (!boundsB) continue;
      if (boundsAreCompatible(boundsA, boundsB)) {
        union(idA, idB);
      }
    }
  }

  const clusters = new Map<string, string[]>();
  ids.forEach((id) => {
    const root = find(id);
    const list = clusters.get(root) || [];
    list.push(id);
    clusters.set(root, list);
  });

  const createdGroupIds: string[] = [];
  let updatedComponents = components.map((component) => ({
    ...component,
    props: { ...component.props },
  }));

  clusters.forEach((clusterIds) => {
    if (clusterIds.length < 2) return;

    const bounds = calculateGroupBounds(updatedComponents, clusterIds);
    if (!bounds) return;

    const maxZIndex = Math.max(...clusterIds.map((id) => {
      const component = updatedComponents.find((candidate) => candidate.id === id);
      return component ? getComponentZIndex(component) : 0;
    }));

    const groupId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    createdGroupIds.push(groupId);

    updatedComponents = updatedComponents.map((component) => {
      if (!clusterIds.includes(component.id)) return component;
      return {
        ...component,
        props: {
          ...component.props,
          parentId: groupId,
        },
      };
    });

    updatedComponents.push({
      id: groupId,
      type: 'Group',
      props: {
        position: { x: bounds.x, y: bounds.y },
        width: bounds.width,
        height: bounds.height,
        size: { width: bounds.width, height: bounds.height },
        opacity: 1,
        rotation: 0,
        zIndex: maxZIndex,
        children: clusterIds,
        locked: false,
        visible: true,
        groupKind: 'compound',
        autoGroup: true,
      },
    });
  });

  return { components: updatedComponents, createdGroupIds };
};
