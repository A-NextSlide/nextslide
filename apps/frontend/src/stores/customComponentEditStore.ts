/**
 * Custom Component Edit Store
 *
 * Manages state for editing elements inside custom components (HTML iframes).
 * This store is used to share data between the CustomComponentRenderer (overlay)
 * and the CustomComponentSettingsEditor (sidebar).
 */

import { create } from 'zustand';
import { VirtualElement } from '@/components/custom-component-editor/types';

type DropPosition = 'before' | 'after' | 'inside';

const resolveSelectedElement = (elements: VirtualElement[], elementId: string | null): VirtualElement | null => {
  if (!elementId) return null;
  return elements.find((element) => element.id === elementId) || null;
};

const getExplicitZIndex = (element: VirtualElement): number | null => {
  const raw = element.computedStyle?.zIndex;
  if (!raw || raw === 'auto') return null;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const getDomIndex = (element: VirtualElement): number => {
  return typeof element.domIndex === 'number' ? element.domIndex : 0;
};

const hasExplicitZIndex = (elements: VirtualElement[]): boolean => {
  return elements.some((element) => getExplicitZIndex(element) !== null);
};

const sortByStackOrderDesc = (a: VirtualElement, b: VirtualElement, useZIndex: boolean): number => {
  if (useZIndex) {
    const aZ = getExplicitZIndex(a) ?? 0;
    const bZ = getExplicitZIndex(b) ?? 0;
    if (aZ !== bZ) return bZ - aZ;
  }
  return getDomIndex(b) - getDomIndex(a);
};

const normalizeParentId = (parentId?: string | null): string | null => {
  return parentId || null;
};

const isDescendantOf = (elements: VirtualElement[], ancestorId: string, nodeId: string | null): boolean => {
  let currentId: string | null = nodeId;
  const visited = new Set<string>();
  while (currentId) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    if (currentId === ancestorId) return true;
    const node = elements.find((element) => element.id === currentId);
    if (!node) break;
    currentId = normalizeParentId(node.parentId);
  }
  return false;
};

interface CustomComponentEditState {
  // The component ID currently being edited
  activeComponentId: string | null;

  // All detected editable elements from the iframe
  detectedElements: VirtualElement[];

  // Currently selected element ID (source of truth)
  selectedElementId: string | null;

  // Currently selected element (derived from detectedElements)
  selectedElement: VirtualElement | null;

  // Element currently being edited (text edit mode) - persists even when selection is cleared
  editingElement: VirtualElement | null;

  // Reference to the iframe for sending messages
  iframeRef: React.RefObject<HTMLIFrameElement> | null;

  // Actions
  setActiveComponent: (componentId: string | null) => void;
  setDetectedElements: (elements: VirtualElement[]) => void;
  setSelectedElementId: (elementId: string | null) => void;
  setSelectedElement: (element: VirtualElement | null) => void;
  setEditingElement: (element: VirtualElement | null) => void;
  setIframeRef: (ref: React.RefObject<HTMLIFrameElement> | null) => void;

  // Select element by ID (for layers panel click)
  selectElementById: (elementId: string) => void;

  // Delete currently selected element
  deleteSelectedElement: () => void;

  // Reorder/reparent elements based on layer tree drag/drop
  moveElement: (draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;

  // Send style update to iframe
  updateElementStyle: (selector: string, property: string, value: string) => void;

  // Send text update to iframe
  updateElementText: (elementId: string, newText: string) => void;

  // Send image update to iframe
  updateElementImage: (elementId: string, newSrc: string) => void;

  // Inject font into iframe
  injectFont: (fontName: string, fontDef?: { source: string; url?: string; family?: string; id?: string }) => void;

  // Request HTML update from iframe for persistence
  requestHtmlUpdate: () => void;

  // Request a fresh element extraction from iframe
  requestElements: () => void;

  // Clear selection only
  clearSelection: () => void;

  // Clear all state
  clear: () => void;
}

export const useCustomComponentEditStore = create<CustomComponentEditState>((set, get) => ({
  activeComponentId: null,
  detectedElements: [],
  selectedElementId: null,
  selectedElement: null,
  editingElement: null,
  iframeRef: null,

  setActiveComponent: (componentId) => {
    const current = get().activeComponentId;
    if (current !== componentId) {
      set({
        activeComponentId: componentId,
        detectedElements: [],
        selectedElementId: null,
        selectedElement: null,
      });
    }
  },

  setDetectedElements: (elements) => {
    const selectedElementId = get().selectedElementId;
    const resolved = resolveSelectedElement(elements, selectedElementId);
    set({
      detectedElements: elements,
      selectedElementId: resolved ? selectedElementId : null,
      selectedElement: resolved,
    });
  },

  setSelectedElementId: (elementId) => {
    const elements = get().detectedElements;
    set({
      selectedElementId: elementId,
      selectedElement: resolveSelectedElement(elements, elementId),
    });
  },

  setSelectedElement: (element) => {
    set({
      selectedElementId: element?.id || null,
      selectedElement: element,
    });
  },

  setEditingElement: (element) => {
    set({ editingElement: element });
  },

  setIframeRef: (ref) => {
    set({ iframeRef: ref });
  },

  selectElementById: (elementId) => {
    get().setSelectedElementId(elementId);
  },

  deleteSelectedElement: () => {
    const { selectedElementId, selectedElement, iframeRef, detectedElements } = get();
    if (!selectedElementId || !selectedElement || !iframeRef?.current?.contentWindow) return;

    // Send delete command to iframe
    iframeRef.current.contentWindow.postMessage({
      target: 'ns-custom-component-edit',
      type: 'delete-element',
      selector: selectedElement.selector,
      elementId: selectedElementId,
    }, '*');

    // Remove from local state
    set({
      selectedElementId: null,
      selectedElement: null,
      detectedElements: detectedElements.filter(e => e.id !== selectedElementId),
    });

    // Persist HTML and refresh element list after deletion
    setTimeout(() => {
      get().requestHtmlUpdate();
      get().requestElements();
    }, 60);
  },

  moveElement: (draggedId, targetId, position) => {
    const { detectedElements, iframeRef } = get();
    const dragged = detectedElements.find((element) => element.id === draggedId);
    const target = detectedElements.find((element) => element.id === targetId);
    if (!dragged || !target) return;

    const targetParentId = normalizeParentId(target.parentId);
    const nextParentId =
      position === 'inside' && target.type === 'container'
        ? target.id
        : targetParentId;

    if (nextParentId && isDescendantOf(detectedElements, draggedId, nextParentId)) {
      return;
    }

    const siblings = detectedElements.filter(
      (element) => normalizeParentId(element.parentId) === nextParentId && element.id !== draggedId
    );

    const useZIndex = hasExplicitZIndex([...siblings, dragged]);
    const ordered = siblings.slice().sort((a, b) => sortByStackOrderDesc(a, b, useZIndex));

    const targetIndex = ordered.findIndex((element) => element.id === targetId);
    let insertIndex = ordered.length;
    if (position === 'inside') {
      insertIndex = 0;
    } else if (targetIndex >= 0) {
      insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
    }

    ordered.splice(insertIndex, 0, dragged);

    const reorderedBottomFirst = ordered.slice().reverse();
    const zIndexMap = new Map<string, number>();
    reorderedBottomFirst.forEach((element, index) => {
      zIndexMap.set(element.id, index + 1);
    });

    const parentChanged = normalizeParentId(dragged.parentId) !== nextParentId;

    if (iframeRef?.current?.contentWindow) {
      if (parentChanged) {
        iframeRef.current.contentWindow.postMessage({
          target: 'ns-custom-component-edit',
          type: 'reparent-element',
          elementId: draggedId,
          parentId: nextParentId,
        }, '*');
      }

      ordered.forEach((element) => {
        const zIndex = zIndexMap.get(element.id);
        if (!zIndex) return;
        iframeRef.current?.contentWindow?.postMessage({
          target: 'ns-custom-component-edit',
          type: 'apply-style-mutation',
          selector: element.selector,
          styles: {
            zIndex: String(zIndex),
            position: 'relative',
          },
        }, '*');
      });
    } else {
      console.warn('[Store] No iframeRef available for layer move!');
    }

    const updatedElements = detectedElements.map((element) => {
      if (element.id === draggedId) {
        return {
          ...element,
          parentId: nextParentId,
        };
      }
      const nextZ = zIndexMap.get(element.id);
      if (!nextZ) return element;
      return {
        ...element,
        zIndex: nextZ,
        computedStyle: {
          ...element.computedStyle,
          zIndex: String(nextZ),
        },
      };
    });

    set({
      detectedElements: updatedElements,
      selectedElement: resolveSelectedElement(updatedElements, get().selectedElementId),
    });

    if (parentChanged) {
      get().requestElements();
    }
    get().requestHtmlUpdate();
  },

  updateElementStyle: (selector, property, value) => {
    const { iframeRef } = get();
    console.log('[Store] updateElementStyle:', { selector, property, value });
    if (iframeRef?.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'apply-style-mutation',
        selector,
        styles: { [property]: value },
      }, '*');
    } else {
      console.warn('[Store] No iframeRef for style update!');
    }
  },

  updateElementText: (elementId, newText) => {
    const { iframeRef } = get();
    if (iframeRef?.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'update-text',
        elementId,
        newText,
      }, '*');
    }
  },

  updateElementImage: (elementId, newSrc) => {
    const { iframeRef } = get();
    if (iframeRef?.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'update-image-with-placeholder',
        elementId,
        newSrc,
      }, '*');
    }
  },

  injectFont: (fontName, fontDef?: { source: string; url?: string; family?: string; id?: string }) => {
    const { iframeRef } = get();
    console.log('[Store] injectFont:', { fontName, fontDef, hasIframe: !!iframeRef?.current?.contentWindow });
    if (iframeRef?.current?.contentWindow && fontName) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'inject-font',
        fontName,
        fontSource: fontDef?.source,
        fontUrl: fontDef?.url,
        fontFamily: fontDef?.family || fontName,
        fontId: fontDef?.id,
      }, '*');
    }
  },

  requestHtmlUpdate: () => {
    const { iframeRef } = get();
    if (iframeRef?.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'get-html',
      }, '*');
    }
  },

  requestElements: () => {
    const { iframeRef } = get();
    if (iframeRef?.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'extract-elements',
      }, '*');
    }
  },

  clearSelection: () => {
    set({
      selectedElementId: null,
      selectedElement: null,
    });
  },

  clear: () => {
    set({
      activeComponentId: null,
      detectedElements: [],
      selectedElementId: null,
      selectedElement: null,
      editingElement: null,
      iframeRef: null,
    });
  },
}));
