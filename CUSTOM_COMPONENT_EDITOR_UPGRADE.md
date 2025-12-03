# Custom Component Editor Upgrade - Implementation Plan

## Implementation Status: ✅ COMPLETE

**Date Completed**: December 2, 2024

All core components have been implemented and the build compiles successfully. Manual testing is required to verify functionality.

### What Was Built:
- **CoordinateTranslator**: Maps coordinates between scaled iframe and parent viewport
- **ElementHitArea**: Invisible clickable areas for element selection
- **ElementSelectionOverlay**: Pink selection border with 8 resize handles (matching slide-level design)
- **useElementDrag**: Zero-lag drag using CSS variables (`--drag-x`, `--drag-y`)
- **useElementResize**: 8-direction resize with proper coordinate translation
- **styleMutator**: Generates CSS based on positioning strategy (absolute/relative/flex/grid/static)
- **PortaledTiptapEditor**: Rich text editing with Tiptap, portaled to document.body
- **CustomComponentEditOverlay**: Main orchestrator integrating all components

### Key Technical Features:
- CSS variable technique for zero-lag visual feedback during drag
- Throttled iframe updates (50ms for drag, 33ms for resize)
- Positioning strategy detection (absolute, relative, flex-item, grid-item, static)
- PostMessage communication between iframe and parent
- Tiptap editor inherits typography from element's computed styles

---

## Overview

Transform the custom component editor from basic click-to-edit into a full slide-level editing experience with drag, resize, and Tiptap-powered text editing - all while maintaining 100% rendering fidelity.

## Architecture: Overlay Transform System

```
┌─────────────────────────────────────────────────────────────────┐
│  INTERACTION LAYER (Parent React - Full Capabilities)           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  VirtualElementOverlay                                     │  │
│  │  - Element hit areas (for selection)                       │  │
│  │  - SelectionBoundingBox (pink border, 8 handles)           │  │
│  │  - Drag via CSS variables (--drag-x, --drag-y)             │  │
│  │  - Resize handles                                          │  │
│  │  - Portaled Tiptap editors for text                        │  │
│  │  - Snap guides                                             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              │  Positioned exactly over iframe   │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  IFRAME (Visual Rendering - pointer-events: none in edit)  │  │
│  │  - HTML/CSS/JS runs normally                               │  │
│  │  - Animations work                                         │  │
│  │  - Elements hidden when being edited                       │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Principles

1. **Zero Degradation**: Iframe renders exactly the same - all HTML/CSS/JS intact
2. **Reuse Existing**: Same interaction patterns as slide-level (CSS variables, throttling)
3. **Smooth Transitions**: No jarring mode switches - seamless experience
4. **Consistent UX**: Pink selection borders, same handles, same feel

---

## Implementation Phases

### Phase 1: Enhanced Element Detection & Virtual Elements

**Goal**: Extract rich layout information from iframe elements

**Files to Create**:
- `apps/frontend/src/components/custom-component-editor/types.ts`
- `apps/frontend/src/components/custom-component-editor/coordinateTranslator.ts`

**Changes to Existing Files**:
- `apps/frontend/src/components/custom-component-editor/CustomComponentEditOverlay.tsx`

#### 1.1 Virtual Element Type Definition

```typescript
// types.ts
export interface VirtualElement {
  id: string;
  type: 'text' | 'image' | 'container' | 'shape';
  tagName: string;

  // Iframe-local coordinates
  iframeBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  // Parent viewport coordinates (computed)
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  // CSS positioning strategy
  positioningStrategy: 'absolute' | 'relative' | 'flex-item' | 'grid-item' | 'static';

  // Current CSS properties
  computedStyle: {
    position: string;
    top: string;
    left: string;
    right: string;
    bottom: string;
    width: string;
    height: string;
    transform: string;
    margin: string;
  };

  // Content
  textContent?: string;
  htmlContent?: string;
  src?: string;
  alt?: string;

  // For re-finding the element
  selector: string;
}

export interface ElementLayoutUpdate {
  elementId: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  transform?: string;
}
```

#### 1.2 Coordinate Translator

```typescript
// coordinateTranslator.ts
export class CoordinateTranslator {
  private iframeRect: DOMRect;
  private scale: number;
  private iframeScroll: { x: number; y: number };

  constructor(iframe: HTMLIFrameElement, designWidth: number) {
    this.update(iframe, designWidth);
  }

  update(iframe: HTMLIFrameElement, designWidth: number) {
    this.iframeRect = iframe.getBoundingClientRect();
    this.scale = this.iframeRect.width / designWidth;
    this.iframeScroll = {
      x: iframe.contentWindow?.scrollX || 0,
      y: iframe.contentWindow?.scrollY || 0,
    };
  }

  iframeToParent(iframeBounds: Bounds): Bounds {
    return {
      x: this.iframeRect.left + (iframeBounds.x - this.iframeScroll.x) * this.scale,
      y: this.iframeRect.top + (iframeBounds.y - this.iframeScroll.y) * this.scale,
      width: iframeBounds.width * this.scale,
      height: iframeBounds.height * this.scale,
    };
  }

  parentToIframe(parentBounds: Bounds): Bounds {
    return {
      x: ((parentBounds.x - this.iframeRect.left) / this.scale) + this.iframeScroll.x,
      y: ((parentBounds.y - this.iframeRect.top) / this.scale) + this.iframeScroll.y,
      width: parentBounds.width / this.scale,
      height: parentBounds.height / this.scale,
    };
  }

  deltaToIframe(dx: number, dy: number): { dx: number; dy: number } {
    return { dx: dx / this.scale, dy: dy / this.scale };
  }

  getScale(): number { return this.scale; }
  getIframeRect(): DOMRect { return this.iframeRect; }
}
```

#### 1.3 Enhanced Iframe Script

Update `generateEditModeScript` to extract full layout data:

```javascript
// Add to iframe script
function extractElementLayout(el) {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);

  return {
    iframeBounds: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    positioningStrategy: detectPositioningStrategy(el, style),
    computedStyle: {
      position: style.position,
      top: style.top,
      left: style.left,
      right: style.right,
      bottom: style.bottom,
      width: style.width,
      height: style.height,
      transform: style.transform,
      margin: style.margin,
    },
    selector: '[data-ns-id="' + el.dataset.nsId + '"]',
  };
}

function detectPositioningStrategy(el, style) {
  if (style.position === 'absolute' || style.position === 'fixed') return 'absolute';
  if (el.parentElement) {
    const parentStyle = getComputedStyle(el.parentElement);
    if (parentStyle.display === 'flex') return 'flex-item';
    if (parentStyle.display === 'grid') return 'grid-item';
  }
  if (style.position === 'relative') return 'relative';
  return 'static';
}

// Enhanced element extraction - send full data
function sendElementData(el, type) {
  const layout = extractElementLayout(el);
  sendToParent(type + '-selected', {
    element: {
      id: el.dataset.nsId,
      type: type,
      tagName: el.tagName.toLowerCase(),
      content: el.textContent?.trim().slice(0, 200),
      htmlContent: el.innerHTML,
      src: el.src,
      alt: el.alt,
      ...layout
    }
  });
}
```

---

### Phase 2: Element Selection Overlay

**Goal**: Render selection UI over iframe elements with consistent slide-level styling

**Files to Create**:
- `apps/frontend/src/components/custom-component-editor/ElementSelectionOverlay.tsx`
- `apps/frontend/src/components/custom-component-editor/ElementHitArea.tsx`

#### 2.1 Element Hit Area Component

```tsx
// ElementHitArea.tsx
interface ElementHitAreaProps {
  element: VirtualElement;
  isSelected: boolean;
  onSelect: () => void;
  onDoubleClick: () => void;
}

export const ElementHitArea: React.FC<ElementHitAreaProps> = ({
  element,
  isSelected,
  onSelect,
  onDoubleClick,
}) => {
  return (
    <div
      className="absolute cursor-pointer"
      style={{
        left: element.bounds.x,
        top: element.bounds.y,
        width: element.bounds.width,
        height: element.bounds.height,
        pointerEvents: 'auto',
        zIndex: isSelected ? 30 : 20,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick();
      }}
    />
  );
};
```

#### 2.2 Element Selection Overlay (Reuses SelectionBoundingBox pattern)

```tsx
// ElementSelectionOverlay.tsx
interface ElementSelectionOverlayProps {
  element: VirtualElement;
  coordinator: CoordinateTranslator;
  onDragStart: (e: React.MouseEvent) => void;
  onResize: (width: number, height: number, position?: { x: number; y: number }) => void;
  isResizable?: boolean;
  isDraggable?: boolean;
}

export const ElementSelectionOverlay: React.FC<ElementSelectionOverlayProps> = ({
  element,
  coordinator,
  onDragStart,
  onResize,
  isResizable = true,
  isDraggable = true,
}) => {
  // Selection border - pink, same as slide level
  // 8 resize handles - same positions and styling
  // No rotation handle (elements inside components don't rotate independently)

  return (
    <div
      className="absolute"
      style={{
        left: element.bounds.x,
        top: element.bounds.y,
        width: element.bounds.width,
        height: element.bounds.height,
        pointerEvents: 'none',
        zIndex: 40,
      }}
    >
      {/* Selection border */}
      <div
        className="absolute inset-0 border border-[#FF007B] rounded-[1px]"
        style={{
          boxShadow: '0 0 0 1px rgba(255, 0, 123, 0.3)',
          pointerEvents: 'none',
        }}
      />

      {/* Drag area */}
      {isDraggable && (
        <div
          className="absolute inset-0 cursor-move"
          style={{ pointerEvents: 'auto' }}
          onMouseDown={onDragStart}
        />
      )}

      {/* Resize handles - same as SelectionBoundingBox */}
      {isResizable && (
        <>
          {/* NW */}
          <div
            className="absolute top-0 left-0 w-3 h-3 border-2 border-[#FF007B] cursor-nw-resize"
            style={{ transform: 'translate(-50%, -50%)', backgroundColor: 'white', pointerEvents: 'auto' }}
            onMouseDown={(e) => handleResizeStart(e, 'nw')}
          />
          {/* ... other 7 handles */}
        </>
      )}
    </div>
  );
};
```

---

### Phase 3: Zero-Lag Dragging for Elements

**Goal**: Apply CSS variable drag technique to elements inside custom components

**Files to Create**:
- `apps/frontend/src/components/custom-component-editor/useElementDrag.ts`

#### 3.1 Element Drag Hook

```typescript
// useElementDrag.ts
interface UseElementDragProps {
  element: VirtualElement;
  coordinator: CoordinateTranslator;
  onPositionChange: (newIframeBounds: Bounds) => void;
  iframeRef: React.RefObject<HTMLIFrameElement>;
}

export function useElementDrag({
  element,
  coordinator,
  onPositionChange,
  iframeRef,
}: UseElementDragProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; bounds: Bounds } | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    document.body.style.userSelect = 'none';
    document.body.classList.add('dragging-component');

    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      bounds: { ...element.bounds },
    };

    // Initialize CSS variables on the overlay element
    if (overlayRef.current) {
      overlayRef.current.style.setProperty('--drag-x', '0px');
      overlayRef.current.style.setProperty('--drag-y', '0px');
      overlayRef.current.style.transform = 'translateX(var(--drag-x)) translateY(var(--drag-y))';
    }

    setIsDragging(true);
  }, [element.bounds]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current || !overlayRef.current) return;

      const deltaX = e.clientX - dragStartRef.current.mouseX;
      const deltaY = e.clientY - dragStartRef.current.mouseY;

      // Update CSS variables for zero-lag visual feedback
      overlayRef.current.style.setProperty('--drag-x', `${deltaX}px`);
      overlayRef.current.style.setProperty('--drag-y', `${deltaY}px`);

      // Also update iframe element position (throttled)
      // ... throttle logic same as useComponentDrag
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!dragStartRef.current) return;

      const deltaX = e.clientX - dragStartRef.current.mouseX;
      const deltaY = e.clientY - dragStartRef.current.mouseY;

      // Convert delta to iframe coordinates
      const iframeDelta = coordinator.deltaToIframe(deltaX, deltaY);

      // Calculate new iframe bounds
      const newIframeBounds = {
        x: element.iframeBounds.x + iframeDelta.dx,
        y: element.iframeBounds.y + iframeDelta.dy,
        width: element.iframeBounds.width,
        height: element.iframeBounds.height,
      };

      // Update element position
      onPositionChange(newIframeBounds);

      // Cleanup
      document.body.style.userSelect = '';
      document.body.classList.remove('dragging-component');

      if (overlayRef.current) {
        overlayRef.current.style.removeProperty('--drag-x');
        overlayRef.current.style.removeProperty('--drag-y');
        overlayRef.current.style.transform = '';
      }

      setIsDragging(false);
      dragStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, coordinator, element, onPositionChange]);

  return { isDragging, handleDragStart, overlayRef };
}
```

---

### Phase 4: Element Resize

**Goal**: Add resize capability to elements

**Files to Create**:
- `apps/frontend/src/components/custom-component-editor/useElementResize.ts`

#### 4.1 Element Resize Hook

```typescript
// useElementResize.ts - Similar pattern to useComponentResize
// Key differences:
// 1. Works in iframe coordinate space
// 2. Sends updates via postMessage
// 3. Generates CSS style mutations
```

---

### Phase 5: Style Mutation Pipeline

**Goal**: Convert drag/resize operations into CSS style changes

**Files to Create**:
- `apps/frontend/src/components/custom-component-editor/styleMutator.ts`

#### 5.1 Style Mutation Generator

```typescript
// styleMutator.ts
export function generateStyleMutation(
  element: VirtualElement,
  newBounds: Bounds
): Record<string, string> {
  const originalBounds = element.iframeBounds;

  switch (element.positioningStrategy) {
    case 'absolute':
      return {
        top: `${newBounds.y}px`,
        left: `${newBounds.x}px`,
        width: `${newBounds.width}px`,
        height: `${newBounds.height}px`,
      };

    case 'relative':
      const deltaX = newBounds.x - originalBounds.x;
      const deltaY = newBounds.y - originalBounds.y;
      return {
        transform: `translate(${deltaX}px, ${deltaY}px)`,
        width: `${newBounds.width}px`,
        height: `${newBounds.height}px`,
      };

    case 'flex-item':
    case 'grid-item':
      // Can only resize, not move
      return {
        width: `${newBounds.width}px`,
        height: `${newBounds.height}px`,
        flexShrink: '0',
        flexGrow: '0',
      };

    case 'static':
      // Convert to relative positioning
      const dx = newBounds.x - originalBounds.x;
      const dy = newBounds.y - originalBounds.y;
      return {
        position: 'relative',
        transform: `translate(${dx}px, ${dy}px)`,
        width: `${newBounds.width}px`,
        height: `${newBounds.height}px`,
      };
  }
}

export function applyStyleMutationToHtml(
  html: string,
  selector: string,
  styles: Record<string, string>
): string {
  // Parse HTML, find element by selector, update inline styles
  // This is for persisting changes to the component's HTML source
}
```

---

### Phase 6: Tiptap Text Editing

**Goal**: Replace contentEditable with full Tiptap for text elements

**Files to Create**:
- `apps/frontend/src/components/custom-component-editor/PortaledTiptapEditor.tsx`

#### 6.1 Portaled Tiptap Editor

```tsx
// PortaledTiptapEditor.tsx
interface PortaledTiptapEditorProps {
  element: VirtualElement;
  coordinator: CoordinateTranslator;
  iframeRef: React.RefObject<HTMLIFrameElement>;
  onFinish: (newHtml: string) => void;
  onCancel: () => void;
}

export const PortaledTiptapEditor: React.FC<PortaledTiptapEditorProps> = ({
  element,
  coordinator,
  iframeRef,
  onFinish,
  onCancel,
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      // Same extensions as TiptapTextBlockRenderer
    ],
    content: element.htmlContent || element.textContent,
    autofocus: true,
    onBlur: ({ editor }) => {
      const html = editor.getHTML();
      onFinish(html);
    },
  });

  // Hide original element in iframe
  useEffect(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'hide-element',
        selector: element.selector,
      }, '*');
    }

    return () => {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({
          target: 'ns-custom-component-edit',
          type: 'show-element',
          selector: element.selector,
        }, '*');
      }
    };
  }, [element.selector, iframeRef]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  // Position exactly over element
  const style: React.CSSProperties = {
    position: 'fixed',
    left: element.bounds.x,
    top: element.bounds.y,
    width: element.bounds.width,
    minHeight: element.bounds.height,
    zIndex: 9999,
    backgroundColor: 'white',
    border: '2px solid #FF007B',
    borderRadius: 4,
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    padding: 4,
    // Inherit typography from element
    fontSize: element.computedStyle.fontSize,
    fontFamily: element.computedStyle.fontFamily,
    color: element.computedStyle.color,
    textAlign: element.computedStyle.textAlign as any,
    lineHeight: element.computedStyle.lineHeight,
  };

  return createPortal(
    <div style={style}>
      <EditorContent editor={editor} />
    </div>,
    document.body
  );
};
```

---

### Phase 7: Main Integration Component

**Goal**: Orchestrate all the pieces together

**Files to Modify**:
- `apps/frontend/src/components/custom-component-editor/CustomComponentEditOverlay.tsx`

#### 7.1 Updated CustomComponentEditOverlay

```tsx
// CustomComponentEditOverlay.tsx - Major refactor
export const CustomComponentEditOverlay: React.FC<Props> = ({
  componentId,
  slideId,
  isEditing,
  isSelected,
  srcDoc,
  scale,
  containerWidth,
  onHtmlUpdate,
  onImageSelect,
  iframeRef,
}) => {
  const [virtualElements, setVirtualElements] = useState<VirtualElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const coordinatorRef = useRef<CoordinateTranslator | null>(null);

  // Initialize/update coordinator
  useEffect(() => {
    if (iframeRef.current) {
      coordinatorRef.current = new CoordinateTranslator(iframeRef.current, containerWidth);
    }
  }, [iframeRef, containerWidth, scale]);

  // Listen for element data from iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      // ... handle element-selected, update virtualElements
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Get selected element
  const selectedElement = virtualElements.find(e => e.id === selectedElementId);

  // Handle element drag
  const handleElementDrag = useCallback((element: VirtualElement, newIframeBounds: Bounds) => {
    // 1. Generate style mutation
    const styles = generateStyleMutation(element, newIframeBounds);

    // 2. Send to iframe to apply immediately
    iframeRef.current?.contentWindow?.postMessage({
      target: 'ns-custom-component-edit',
      type: 'apply-style-mutation',
      selector: element.selector,
      styles,
    }, '*');

    // 3. Update HTML source
    const newHtml = applyStyleMutationToHtml(srcDoc, element.selector, styles);
    onHtmlUpdate(newHtml);

    // 4. Update virtual element bounds
    setVirtualElements(prev => prev.map(e =>
      e.id === element.id
        ? { ...e, iframeBounds: newIframeBounds, bounds: coordinatorRef.current!.iframeToParent(newIframeBounds) }
        : e
    ));
  }, [srcDoc, onHtmlUpdate, iframeRef]);

  // Handle text edit finish
  const handleTextEditFinish = useCallback((elementId: string, newHtml: string) => {
    // Update the HTML in the iframe
    iframeRef.current?.contentWindow?.postMessage({
      target: 'ns-custom-component-edit',
      type: 'update-element-html',
      selector: virtualElements.find(e => e.id === elementId)?.selector,
      html: newHtml,
    }, '*');

    // Update source HTML
    // ... find and replace element content

    setEditingTextId(null);
  }, [virtualElements, iframeRef]);

  if (!isEditing || !isSelected) return null;

  return createPortal(
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 100 }}>
      {/* Element hit areas - for click detection */}
      {virtualElements.map(element => (
        <ElementHitArea
          key={element.id}
          element={element}
          isSelected={element.id === selectedElementId}
          onSelect={() => setSelectedElementId(element.id)}
          onDoubleClick={() => {
            if (element.type === 'text') {
              setEditingTextId(element.id);
            }
          }}
        />
      ))}

      {/* Selection overlay with handles */}
      {selectedElement && !editingTextId && (
        <ElementSelectionOverlay
          element={selectedElement}
          coordinator={coordinatorRef.current!}
          onDragStart={/* useElementDrag */}
          onResize={/* useElementResize */}
          isResizable={selectedElement.positioningStrategy === 'absolute'}
          isDraggable={selectedElement.positioningStrategy !== 'static'}
        />
      )}

      {/* Tiptap editor for text */}
      {editingTextId && (
        <PortaledTiptapEditor
          element={virtualElements.find(e => e.id === editingTextId)!}
          coordinator={coordinatorRef.current!}
          iframeRef={iframeRef}
          onFinish={(html) => handleTextEditFinish(editingTextId, html)}
          onCancel={() => setEditingTextId(null)}
        />
      )}

      {/* Existing floating chat input - keep for AI suggestions */}
      <FloatingChatInput /* existing props */ />
    </div>,
    document.body
  );
};
```

---

## File Checklist

### New Files Created ✅
- [x] `apps/frontend/src/components/custom-component-editor/types.ts` - VirtualElement, Bounds, PositioningStrategy, message types
- [x] `apps/frontend/src/components/custom-component-editor/coordinateTranslator.ts` - CoordinateTranslator class with iframe↔parent coordinate mapping
- [x] `apps/frontend/src/components/custom-component-editor/ElementHitArea.tsx` - Invisible clickable areas for element selection
- [x] `apps/frontend/src/components/custom-component-editor/ElementSelectionOverlay.tsx` - Pink selection border with 8 resize handles
- [x] `apps/frontend/src/components/custom-component-editor/useElementDrag.ts` - Zero-lag drag with CSS variables (--drag-x, --drag-y)
- [x] `apps/frontend/src/components/custom-component-editor/useElementResize.ts` - 8-direction resize with coordinate translation
- [x] `apps/frontend/src/components/custom-component-editor/styleMutator.ts` - CSS style generation based on positioning strategy
- [x] `apps/frontend/src/components/custom-component-editor/PortaledTiptapEditor.tsx` - Tiptap editor portaled to document.body

### Files Modified ✅
- [x] `apps/frontend/src/components/custom-component-editor/CustomComponentEditOverlay.tsx` - Major refactor integrating all new components
- [x] `apps/frontend/src/components/custom-component-editor/index.ts` - Updated exports for all new components
- [x] `apps/frontend/src/renderers/components/CustomComponentRenderer.tsx` - Added `handleHtmlUpdate` callback and rendered `CustomComponentEditOverlay` with all required props

---

## Implementation Order (All Complete ✅)

1. ✅ **Phase 1**: Types + CoordinateTranslator + Enhanced iframe script
2. ✅ **Phase 2**: ElementHitArea + ElementSelectionOverlay (selection UI)
3. ✅ **Phase 3**: useElementDrag (drag capability)
4. ✅ **Phase 4**: useElementResize (resize capability)
5. ✅ **Phase 5**: styleMutator (persist changes)
6. ✅ **Phase 6**: PortaledTiptapEditor (text editing)
7. ✅ **Phase 7**: Integration in CustomComponentEditOverlay + CustomComponentRenderer

---

## Testing Checklist

### Core Functionality (Manual Testing Required)
- [ ] Elements can be selected by clicking on hit areas
- [ ] Selection shows pink border (#FF007B, same as slide level)
- [ ] Elements can be dragged with zero-lag feedback (CSS variables)
- [ ] Absolutely positioned elements can be resized via 8 handles
- [ ] Double-click on text opens Tiptap editor
- [ ] Tiptap editor positioned correctly over element
- [ ] Tiptap inherits font/color from element's computed styles
- [ ] Text changes persist to HTML via postMessage
- [ ] Position/size changes apply via postMessage to iframe
- [ ] Escape cancels text editing, Cmd+Enter saves
- [ ] Click outside Tiptap editor saves changes

### Visual Quality
- [ ] All animations/JS in iframe still work
- [ ] No jarring visual jumps during interactions
- [ ] Works at different zoom/scale levels
- [ ] Element type badge shows correctly (Text/Image/Container)
- [ ] Mini formatting toolbar appears above Tiptap editor

### Build Verification ✅
- [x] TypeScript compiles without errors
- [x] Build completes successfully
