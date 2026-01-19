import React, { useRef, useState, useEffect, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { ComponentInstance } from "@/types/components";
import { createComponentStyles, rendererRegistry, RendererProps } from "./index";
import { useEditorState } from '@/context/EditorStateContext';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import SelectionBoundingBox from '@/components/SelectionBoundingBox';
import { useEditorStore } from '@/stores/editorStore';

// Import TypeBox registry
import { registry } from '@/registry';

// Component Interaction Hooks
import { useComponentDrag } from "@/hooks/componentInteractions/useComponentDrag";
import { useComponentResize } from "@/hooks/componentInteractions/useComponentResize";
import { useComponentRotate } from "@/hooks/componentInteractions/useComponentRotate";
import { useComponentSelection } from "@/hooks/componentInteractions/useComponentSelection";

// Import legacy renderers for compatibility
import {
  renderTable,
  renderCustomComponent,
  renderImage,
  renderVideo,
  renderBackground,
  renderChart
} from "./components/index";

// Import registry-based renderers to ensure registration
import './index';

// Utilities
import { SnapGuideInfo } from '@/utils/snapUtils';
import SnapGuides from '@/components/SnapGuides';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { useSlideElementBounds } from '@/hooks/useElementBounds';
import { useEditorSettingsStore } from '@/stores/editorSettingsStore';

type Props = {
  component: ComponentInstance;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  allComponents?: ComponentInstance[]; // All components on the current slide
  isThumbnail?: boolean; // Add isThumbnail prop
};

/**
 * Main component renderer that delegates to specialized renderers.
 * Handles positioning, selection, dragging, resizing, and rotation.
 * Wrapped in React.memo with custom comparison to prevent unnecessary re-renders.
 */
export const ComponentRenderer: React.FC<Props> = memo(({
  component,
  isSelected = false,
  onSelect = () => { }, // Provide default empty function
  allComponents = [],
  isThumbnail = false // Destructure isThumbnail
}) => {
  // --- Context and Store Access ---
  const { isEditing } = useEditorState(); // Get editing mode from context
  const { updateComponent, slideId: activeSlideId } = useActiveSlide(); // Get update function from context and slideId
  const isTextEditing = useEditorSettingsStore(state => state.isTextEditing);
  // Get full context state, then select slideSize with fallback
  const editorState = useEditorState();
  const slideSize = editorState.slideSize || { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT };

  // --- Refs ---
  const containerRef = useRef<HTMLDivElement>(null);
  const { ref: boundingBoxRef } = useSlideElementBounds(slideSize); // Bounding box ref

  // --- Component Properties ---
  const {
    id: componentId,
    type: componentType,
    props: componentProps = {} // Ensure props object exists
  } = component;

  // Look up component definition from TypeBox registry
  const componentDefinition = registry.getDefinition(componentType);

  // Check if component is selected (either single or multi-selection)
  const isComponentMultiSelected = useEditorStore(state => state.isComponentSelected(componentId));
  const selectedComponentIds = useEditorStore(state => state.selectedComponentIds);
  const isInMultiSelection = selectedComponentIds.size > 1 && isComponentMultiSelected;
  const effectiveIsSelected = isSelected || isComponentMultiSelected;

  // Extract props with fallbacks from TypeBox schema defaults or basic defaults
  let {
    position = { x: 50, y: 50 },
    width,
    height,
    opacity = 1,
    rotation = 0,
    zIndex = 0,
    textColor = "#000000",
    debug = false,
    size
  } = componentProps;

  // Also check size object and component-level size/position for width/height
  if (width === undefined || width === null || width === "auto") {
    width = size?.width ?? (component as any).size?.width ?? (component as any).width ?? "auto";
  }
  if (height === undefined || height === null || height === "auto") {
    height = size?.height ?? (component as any).size?.height ?? (component as any).height ?? "auto";
  }
  // Also check component-level position
  if (!position || position.x === undefined) {
    position = (component as any).position ?? { x: 50, y: 50 };
  }

  // PRESENTATION MODE FIX: Detect percentage-like values that weren't converted
  // If width/height are small numbers (1-100) while slideSize is large (>500),
  // they're likely percentages that should be converted to absolute pixels
  const isLikelyPercentage = (value: any, axisSize: number): boolean => {
    if (typeof value !== 'number') return false;
    // Values between 1 and 100 with a large axis size are likely percentages
    return value > 0 && value <= 100 && axisSize > 500;
  };

  // Convert percentage-like values to absolute pixels for proper rendering
  if (typeof width === 'number' && isLikelyPercentage(width, slideSize.width)) {
    width = (width / 100) * slideSize.width;
  }
  if (typeof height === 'number' && isLikelyPercentage(height, slideSize.height)) {
    height = (height / 100) * slideSize.height;
  }

  // For Lines components, calculate position/width/height from endpoints
  if (componentType === "Lines" || componentType === 'Line' || componentType === 'line') {
    // For lines, use full slide dimensions to avoid resize artifacts when endpoints move
    position = { x: 0, y: 0 };
    width = slideSize.width;
    height = slideSize.height;
  }

  const isBackground = componentType === "Background" || (componentId && componentId.toLowerCase().includes('background'));
  const isLines = componentType === "Lines" || componentType === 'Line' || componentType === 'line';
  const isGroup = componentType === "Group";
  const isDraggable = isEditing && !isBackground && !isLines; // Lines have custom drag
  const isResizable = isEditing && !isBackground && !isLines && !isGroup; // Groups don't resize directly
  const isRotatable = isEditing && !isBackground && !isLines && !isGroup; // Groups don't rotate
  const isSelectable = true; // Changed from !isBackground to allow background selection

  // Cropping state for Image components - hide selection UI when cropping this component
  const isCroppingImage = useEditorSettingsStore(state => state.isCroppingImage);
  const croppingComponentId = useEditorSettingsStore(state => state.croppingComponentId);
  const isCroppingThis = isCroppingImage && croppingComponentId === componentId && componentType === 'Image';

  // Element edit mode for CustomComponents - auto-enabled when component is selected in edit mode
  // This allows immediate text/image editing without requiring a separate "Edit Elements" click
  const isElementEditMode = isEditing && effectiveIsSelected && componentType === 'CustomComponent';

  // Function to enter element edit mode - no longer needed since it's auto-enabled, but kept for compatibility
  const enterElementEditMode = useCallback(() => {
    // No-op since element edit mode is now automatic
  }, []);

  // Clear text-edit mode when switching to a different component
  // This ensures text editing doesn't stick when user selects another component
  useEffect(() => {
    if (!effectiveIsSelected) return;

    const settings = useEditorSettingsStore.getState();
    if (!settings.isTextEditing) return;

    const activeEditor: any = useEditorStore.getState().activeTiptapEditor;
    const activeId = activeEditor?.view?.dom?.getAttribute?.('data-component-id');

    // If a different component was being edited, blur it and clear text editing state
    if (activeId && activeId !== componentId) {
      try { activeEditor.commands?.blur?.(); } catch { }
      settings.setTextEditing(false);
    }
  }, [effectiveIsSelected, componentId]);

  // --- Interaction Hooks ---

  // Local snap guides state for sharing guides between resize and drag hooks
  const [localSnapGuides, setLocalSnapGuides] = useState<SnapGuideInfo[]>([]);

  // Check if we're in a group and whether we should drag individually
  const { editingGroupId } = useEditorStore.getState();
  const isInGroup = component.props.parentId && component.type !== 'Group';
  const isEditingThisGroup = isInGroup && editingGroupId === component.props.parentId;

  // Always allow dragging - the drag handler will determine if it should drag the group or individual
  const effectiveDraggable = isDraggable;

  // Use component drag hook with proper interface
  const { isDragging, visualDragOffset, snapGuides: dragSnapGuides, handleDragStart, didJustDrag } = useComponentDrag({
    component,
    componentPosition: component.props.position,
    isDraggable: effectiveDraggable,
    isSelected,
    isTextEditing,
    containerRef,
    slideSize,
    allComponents,
    onSelect,
    updateComponent,
  });

  // Use component resize hook with proper interface
  const { isResizing, handleResize } = useComponentResize({
    component,
    slideSize,
    allComponents,
    updateComponent,
    setSnapGuides: setLocalSnapGuides, // Pass setter for resize guides
  });

  // Use component rotate hook with proper interface
  useComponentRotate({
    componentId,
    component,
    isRotatable,
    isSelected,
    updateComponent,
  });

  // Selection handling
  const { handleClick, handleDoubleClick } = useComponentSelection({
    componentId,
    componentType,
    isEditing,
    isSelected: effectiveIsSelected,
    onSelect: (id) => {
      // Quiet noisy selection logs
      onSelect(id);
    },
    containerRef,
    didJustDrag,
  });

  // Listen for selection requests from CustomComponent iframes
  useEffect(() => {
    if (componentType !== 'CustomComponent') return;

    const handleIframeSelectRequest = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.componentId === componentId) {
        onSelect(componentId);
      }
    };

    const container = containerRef.current;
    container?.addEventListener('customcomponent:request-select', handleIframeSelectRequest);
    return () => container?.removeEventListener('customcomponent:request-select', handleIframeSelectRequest);
  }, [componentId, componentType, onSelect]);

  // Combine snap guides from drag and resize
  const snapGuides = isDragging ? dragSnapGuides : isResizing ? localSnapGuides : [];

  // Ensure snap guides are cleared when resize/drag ends
  useEffect(() => {
    if (!isResizing && !isDragging && localSnapGuides.length > 0) {
      setLocalSnapGuides([]);
    }
  }, [isResizing, isDragging, localSnapGuides.length]);

  // Use the component's current position for all calculations
  const effectivePosition = position as any;
  // Normalize missing/invalid positions to avoid runtime errors
  const normalizedPosition = (
    effectivePosition &&
    typeof effectivePosition.x === 'number' &&
    typeof effectivePosition.y === 'number'
  ) ? effectivePosition : { x: 0, y: 0 };

  // Properly calculate positions and dimensions (guard slideSize)
  const slideWidth = slideSize?.width || DEFAULT_SLIDE_WIDTH;
  const slideHeight = slideSize?.height || DEFAULT_SLIDE_HEIGHT;
  const positionX = (normalizedPosition.x / slideWidth) * 100;
  const positionY = (normalizedPosition.y / slideHeight) * 100;

  // Use component's actual dimensions (they're being updated in real-time during resize)
  const effectiveWidth = width;
  const effectiveHeight = height;

  const widthPercentage = typeof effectiveWidth === 'number' ? (effectiveWidth / slideWidth * 100) : effectiveWidth;
  const heightPercentage = typeof effectiveHeight === 'number' ? (effectiveHeight / slideHeight * 100) : effectiveHeight;

  // Check if this is a placeholder image
  const isPlaceholderImage = componentType === 'Image' && (
    !componentProps.src ||
    componentProps.src === 'placeholder' ||
    componentProps.src === '/placeholder.svg' ||
    componentProps.src === '/placeholder.png' ||
    (typeof componentProps.src === 'string' && (componentProps.src.includes('/api/placeholder/') || componentProps.src.includes('via.placeholder.com')))
  );
  const isLogoComponent = componentType === 'Image' && (
    (componentProps?.metadata?.kind === 'logo') || (componentProps?.alt === 'Logo')
  );

  // If it's a placeholder image, use a high z-index for the selection button except for logos
  const effectiveZIndex = isBackground
    ? 0
    : (isPlaceholderImage && !isLogoComponent)
      ? 999999
      : (Number(zIndex) || 0);

  // Style for the main component wrapper div
  const componentWrapperStyle: React.CSSProperties = isBackground ? {
    // Special handling for Background components - they should fill the entire slide
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    zIndex: 0,
    opacity,
    pointerEvents: isEditing ? 'none' : 'auto',
    boxSizing: 'border-box',
  } : {
    position: 'absolute',
    left: `${positionX}%`,
    top: `${positionY}%`,
    width: typeof widthPercentage === 'number' ? `${widthPercentage}%` : widthPercentage,
    height: typeof heightPercentage === 'number' ? `${heightPercentage}%` : heightPercentage,
    // Use CSS variables for zero-lag drag transforms; avoids React re-render per mousemove
    transform: `translateX(var(--drag-x, 0px)) translateY(var(--drag-y, 0px)) rotate(${rotation}deg)`,
    transformOrigin: 'center center',
    // NO transitions - components should move instantly
    transition: 'none',
    zIndex: isBackground ? 0 : effectiveZIndex, // Maintain original z-index without boost
    opacity,
    cursor: effectiveDraggable ? (isDragging ? 'grabbing' : 'move') : 'default',
    boxSizing: 'border-box',
    willChange: (isDragging || isResizing) ? 'transform' : 'auto',
    // For Lines and Background components, disable pointer events on the wrapper
    pointerEvents: (isLines || (isBackground && isEditing)) ? 'none' : 'auto',
    // Allow overflow for resize handles to be visible
    overflow: 'visible',
    // No outline in debug mode, we'll show the actual content bounds instead
  };

  // Style for the inner content container
  const contentContainerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'visible', // Allow content to render properly without clipping
    // CRITICAL: Ensure this container is a valid click target
    // even when children have pointerEvents: none
    background: 'transparent',
  };

  // Style applied directly to the specific renderer's output
  const componentContentStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    border: debug ? '1px dashed #aaa' : 'none', // Only show border if explicit debug prop
    color: textColor,
    // In edit mode: CustomComponent needs pointerEvents: none so clicks reach wrapper for selection
    // In non-edit mode: CustomComponent can be interactive
    // Other interactive components (TextBlock, TiptapTextBlock, Table, Video) keep auto for their editing needs
    pointerEvents: isEditing && componentType === 'CustomComponent'
      ? 'none'
      : ['TextBlock', 'TiptapTextBlock', 'Table', 'Video', 'Background'].includes(componentType)
        ? 'auto'
        : 'none',
  };

  // --- Rendering Logic ---
  // Declare refs/hooks at top level to follow Hooks rules
  const textUpdateAppliedRef = React.useRef(false);
  const renderSpecificComponent = () => {
    // First check if the renderer exists in the registry
    if (rendererRegistry[componentType]) {
      const Renderer = rendererRegistry[componentType];

      // Ensure all necessary props, including interaction states are passed
      const rendererProps: RendererProps = {
        component,
        isSelected: effectiveIsSelected,
        isEditing,
        isResizing,
        isDragging,
        isThumbnail,
        containerRef,
        styles: componentContentStyle,
        slideId: activeSlideId,
      };

      // Special handling for TextBlock component
      if (componentType === "TextBlock") {
        // Add text editing specific props
        Object.assign(rendererProps, {
          isTextEditing: isTextEditing && effectiveIsSelected,
          // When text changes during editing
          onTextChange: (text: string) => {
            textUpdateAppliedRef.current = true;

            // Ensure we have valid text (defensive programming)
            const safeText = text || '';

            // Use try-catch to ensure we don't lose updates
            try {
              updateComponent(componentId, {
                props: { ...componentProps, text: safeText }
              }, true); // Skip history for intermediate changes

              // Also mark the slide as changed to ensure it gets saved
              if (activeSlideId) {
                useEditorStore.getState().markSlideAsChanged(activeSlideId);
              }
            } catch (err) {
              console.error(`Error updating text for ${componentId}: `, err);
            }
          },
          // When editing starts
          onStartTextEdit: () => {
            // Reset our tracking flag at the start of editing
            textUpdateAppliedRef.current = false;
            // Set global editing state
            useEditorSettingsStore.getState().setTextEditing(true);
          },
          // When editing finishes
          onFinishTextEdit: () => {
            const currentNode = containerRef.current;
            if (!currentNode) {
              useEditorSettingsStore.getState().setTextEditing(false);
              return;
            }

            // Get the final text from the DOM element
            const finalText = currentNode.innerText || '';

            // CRITICAL FIX: Always apply the update with a setTimeout to ensure it happens after
            // any state transitions that might be occurring during click handling
            setTimeout(() => {
              try {
                // Create a final update with history tracking
                updateComponent(componentId, {
                  props: { ...componentProps, text: finalText }
                }, false); // Don't skip history for final change
              } catch (err) {
                console.error(`Error updating text for ${componentId}: `, err);
              }
            }, 10);

            // Exit text editing mode
            useEditorSettingsStore.getState().setTextEditing(false);

            // CRITICAL FIX: Directly save when finishing text editing
            // This ensures text changes are committed when clicking away
            setTimeout(() => {
              try {
                // Correctly call applyDraftChanges via getState()
                useEditorStore.getState().applyDraftChanges();
              } catch (error) {
                console.error('Error in text saving operation:', error);
              }
            }, 100);
          },
        });
      }

      // Special handling for TiptapTextBlock and CustomComponent to pass isThumbnail
      if (componentType === "TiptapTextBlock" || componentType === "CustomComponent") {
        (rendererProps as any).isThumbnail = isThumbnail;
      }

      // For CustomComponent, only enable element editing when isElementEditMode is true
      // This prevents hover outlines from showing until user clicks "Edit Elements"
      if (componentType === "CustomComponent") {
        (rendererProps as any).isEditing = isElementEditMode;
      }

      // Also pass isThumbnail to Table renderer so it can adjust spacing logic
      if (componentType === "Table") {
        (rendererProps as any).isThumbnail = isThumbnail;
      }

      // Check if we have a validated component definition from TypeBox
      if (componentDefinition) {
        // Attach TypeBox schema to renderer props as a custom property
        (rendererProps as any).typeBoxSchema = componentDefinition.schema;
      }

      // For logo images, render nothing if it's a placeholder/no real src
      if (isLogoComponent && isPlaceholderImage) {
        return null;
      }
      return <Renderer {...rendererProps} />;
    }

    // If renderer not found in registry
    return (
      <div style={componentContentStyle}>
        <div style={{ padding: '10px', backgroundColor: '#f8f9fa', color: '#333', fontFamily: 'monospace', fontSize: '12px' }}>
          <h3>Component Creation Adaptation</h3>
          <p>Component type: <strong>{componentType}</strong></p>
          <p>Registered renderers: {Object.keys(rendererRegistry).join(', ')}</p>

          {componentDefinition ?
            <div>
              <p>Has TypeBox definition with {Object.keys(componentDefinition.schema.properties || {}).length} props</p>
              <p>Schema type: {componentDefinition.schema.type}</p>
            </div>
            : <div>No TypeBox definition found</div>
          }

          <p>This likely indicates a mismatch between TypeBox registry and component renderers.</p>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      style={componentWrapperStyle}
      className={`component - wrapper component - type - ${componentType} `}
      data-component-id={componentId}
      data-component-type={componentType}
      data-position-x={(normalizedPosition as any).x}
      data-position-y={(normalizedPosition as any).y}
      data-slide-size={`${slideSize?.width}x${slideSize?.height}`}
      data-position-percent={`${positionX.toFixed(1)}%,${positionY.toFixed(1)}%`}
      data-is-dragging={isDragging ? 'true' : 'false'}
      onClick={(e) => {
        // Check if the click is on the button, link, or button area
        const target = e.target as HTMLElement;
        const isButton = target.tagName === 'BUTTON' || target.closest('button');
        const isButtonArea = target.closest('[data-button-area="true"]');
        const isLink = target.tagName === 'A' || target.closest('a');

        if (isButton || isButtonArea || isLink) {
          // Don't handle the click if it's on the button or link
          return;
        }

        // Always handle clicks, including for background components
        handleClick(e);
      }}
      onDoubleClick={handleDoubleClick}
      onMouseDown={(e) => {
        const targetElement = e.target as HTMLElement;
        if (targetElement.closest('[data-rotation-handle="true"]')) {
          return;
        }

        // Check if the mousedown is on the button, link, or button area
        const isButton = targetElement.tagName === 'BUTTON' || targetElement.closest('button');
        const isButtonArea = targetElement.closest('[data-button-area="true"]');
        const isLink = targetElement.tagName === 'A' || targetElement.closest('a');

        if (isButton || isButtonArea || isLink) {
          // Don't start drag if it's on the button or link
          return;
        }

        // Don't start component-level drag for CustomComponents in element edit mode
        // Element-level dragging is handled by CustomComponentEditOverlay
        if (componentType === 'CustomComponent' && isElementEditMode) {
          return;
        }

        if (isEditing && e.button === 0 && !isBackground) {
          handleDragStart(e);
        }
      }}
      tabIndex={isEditing && !isTextEditing ? 0 : -1}
    >
      {/* Render snap guides within the slide container */}
      {isDragging && snapGuides.length > 0 && createPortal(
        <SnapGuides guides={snapGuides} />,
        document.getElementById('snap-guide-portal') || document.querySelector('.slide-container') || document.body
      )}
      {isResizing && localSnapGuides.length > 0 && createPortal(
        <SnapGuides guides={localSnapGuides} />,
        document.getElementById('snap-guide-portal') || document.querySelector('.slide-container') || document.body
      )}

      {/*
        CLICK CAPTURE OVERLAY for CustomComponents in edit mode
        This invisible overlay captures clicks since iframes have pointerEvents: none.
        Only render when NOT selected - when selected, SelectionBoundingBox handles interactions.
        Click to select, then drag from bounding box.
      */}
      {isEditing && componentType === 'CustomComponent' && !effectiveIsSelected && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 5, // Below selection UI but above content
            background: 'transparent',
            cursor: 'pointer',
            pointerEvents: 'auto',
          }}
          onClick={handleClick}
          onMouseDown={(e) => {
            // Just select on click - don't start drag
            // Drag is handled by SelectionBoundingBox after selection
            e.stopPropagation();
          }}
        />
      )}

      {/* Element edit mode is now automatic for CustomComponents when selected in edit mode */}

      {/* Render selection bounding box only when editing and selected, OR when text editing is active (to prevent unmount during blur) */}
      {isEditing && (effectiveIsSelected || isTextEditing) && !isBackground && !isLines && !isCroppingThis && (
        <SelectionBoundingBox
          component={component}
          isSelected={effectiveIsSelected}
          onDragStart={handleDragStart}
          onDragEnd={() => { }}
          onResize={handleResize}
          isResizable={isResizable}
          isRotatable={isRotatable}
          isDraggable={effectiveDraggable}
          isTextEditing={isTextEditing}
          isMultiSelected={isInMultiSelection} // Pass multi-selection state
          hideSelectionUI={isElementEditMode} // Hide outer selection for CustomComponent element editing
        >
          <div style={contentContainerStyle}>
            {renderSpecificComponent()}
          </div>
        </SelectionBoundingBox>
      )}

      {/* Render component directly if not editing/selected, background/lines, or actively cropping this image */}
      {((!isEditing || (!effectiveIsSelected && !isTextEditing) || isBackground || isLines) || isCroppingThis) && (
        <div style={contentContainerStyle}>
          {renderSpecificComponent()}
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for performance - only re-render when necessary
  if (prevProps.isSelected !== nextProps.isSelected) return false;
  if (prevProps.isThumbnail !== nextProps.isThumbnail) return false;
  if (prevProps.component.id !== nextProps.component.id) return false;
  if (prevProps.component.type !== nextProps.component.type) return false;

  // Deep compare props that affect rendering
  const prevComponentProps = prevProps.component.props || {};
  const nextComponentProps = nextProps.component.props || {};

  // Check position changes
  if (prevComponentProps.position?.x !== nextComponentProps.position?.x) return false;
  if (prevComponentProps.position?.y !== nextComponentProps.position?.y) return false;
  if (prevComponentProps.width !== nextComponentProps.width) return false;
  if (prevComponentProps.height !== nextComponentProps.height) return false;
  if (prevComponentProps.rotation !== nextComponentProps.rotation) return false;

  // For most visual changes, compare the stringified props (fast enough for most cases)
  // This catches content changes, style changes, etc.
  if (JSON.stringify(prevComponentProps) !== JSON.stringify(nextComponentProps)) return false;

  // Skip allComponents comparison - it's used for snapping which doesn't need re-render
  return true;
});

