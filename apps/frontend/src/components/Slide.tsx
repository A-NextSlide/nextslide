import React, { useEffect, useState, useRef, useMemo } from 'react';
import { SlideData } from '@/types/SlideTypes';
import { ComponentInstance } from "../types/components";
import { ActiveSlideContext } from '@/context/ActiveSlideContext';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { ComponentRenderer } from "../renderers/ComponentRenderer";
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { useComponentPositionSync } from '@/hooks/useComponentPositionSync';
import LineSnapIndicators from '@/components/LineSnapIndicators';
import TextBoundingBoxOverlay from '@/components/TextBoundingBoxOverlay';
import MultiSelectionBoundingBox from '@/components/MultiSelectionBoundingBox';
import { useEditorStore } from '@/stores/editorStore';
import GroupEditIndicator from '@/components/GroupEditIndicator';

interface SlideProps {
  slide: SlideData;
  isActive: boolean;
  direction?: 'next' | 'prev' | null;
  isEditing?: boolean;
  onSave?: (updatedSlide: Partial<SlideData>) => void;
  selectedComponentId?: string;
  onComponentSelect?: (component: ComponentInstance) => void;
  onSelect?: (slideId: string) => void;
  className?: string;
  style?: React.CSSProperties;
  isThumbnail?: boolean;
  showDebugOverlay?: boolean;
  showDebugLegend?: boolean;
}

// The Slide component is responsible for displaying and editing slide content
const SlideContent: React.FC<SlideProps> = ({ 
  slide, 
  isActive,
  direction = null,
  isEditing = false,
  onSave,
  selectedComponentId,
  onComponentSelect,
  onSelect,
  className = "",
  style = {},
  isThumbnail = false,
  showDebugOverlay = false,
  showDebugLegend = true
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const isDraggingRef = useRef(false);
  const [positionUpdateCounter, setPositionUpdateCounter] = useState(0);
  
  // Enable remote layout sync only when viewing (not editing) and not a thumbnail
  // This avoids background DOM writes fighting with local interactions while editing
  useComponentPositionSync(isActive && !isThumbnail && !isEditing);
  
  // Track real-time component position updates
  useEffect(() => {
    if (!isActive) return;
    
    // Listen for component position updates
    const handleComponentPosition = (event: Event) => {
      // Increment counter to force a re-render of the slide
      setPositionUpdateCounter(prev => prev + 1);
      
      // Add extra logging for debugging
      const detail = (event as CustomEvent).detail;
      if (detail) {
  
      }
    };
    
    // Listen for component position messages from old system
    document.addEventListener('component-position-message', handleComponentPosition);
    
    // ALSO listen for our new custom event
    document.addEventListener('component-position-updated', handleComponentPosition);
    
    return () => {
      document.removeEventListener('component-position-message', handleComponentPosition);
      document.removeEventListener('component-position-updated', handleComponentPosition);
    };
  }, [isActive]);
  
  // Track drag operations to prevent unnecessary rerenders
  useEffect(() => {
    const handleDragStart = () => {
      isDraggingRef.current = true;
      if (typeof window !== 'undefined') {
        (window as any).__isDragging = true;
      }
    };
    
    const handleDragEnd = () => {
      isDraggingRef.current = false;
      if (typeof window !== 'undefined') {
        (window as any).__isDragging = false;
      }
    };
    
    document.addEventListener('component:dragstart', handleDragStart);
    document.addEventListener('component:dragend', handleDragEnd);
    
    return () => {
      document.removeEventListener('component:dragstart', handleDragStart);
      document.removeEventListener('component:dragend', handleDragEnd);
    };
  }, []);
  
  // Get context if available
  let activeComponents: ComponentInstance[] = [];
  let updateComponent = (componentId: string, updates: Partial<ComponentInstance>) => {
    // Context not available, using fallback
  };
  
  // Check if we're inside an ActiveSlideProvider by trying to use the context
  // If not, just use the slide data directly without throwing errors
  const activeSlideContext = React.useContext(ActiveSlideContext);
  
  if (activeSlideContext) {
    // Context is available, use it
    activeComponents = activeSlideContext.activeComponents;
    updateComponent = activeSlideContext.updateComponent;
  } else {
    // Context not available (like in thumbnails), use slide components directly
    activeComponents = slide.components || [];
  }

  // Track slide to properly manage state
  const [slideData, setSlideData] = useState<SlideData>(slide);
  
  // Debug for real-time movement
  useEffect(() => {
    if (isActive && positionUpdateCounter > 0) {

      
      // Add visual debugging if enabled
      if (typeof window !== 'undefined' && (window as any).__remoteComponentLayouts) {
        const layouts = (window as any).__remoteComponentLayouts;
        // Debug logging removed to reduce console noise
      }
    }
  }, [isActive, positionUpdateCounter]);
  
  // Update slide data when props change
  useEffect(() => {
    setSlideData(slide);
  }, [slide]);

  // Control visibility based on active state
  useEffect(() => {
    setIsVisible(isActive);
    
    // Remove all animation triggering logic from here
    // The slidechange event should only be triggered from useSlideNavigation
    // to prevent double animations
  }, [isActive, slideData.id]);

  // Handle selection of this slide
  const handleSlideClick = () => {
    if (onSelect && !isEditing) {
      onSelect(slideData.id);
    }
  };
  
  // Handle double-click to enter edit mode
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!isEditing) {
      e.preventDefault();
      e.stopPropagation();
      
      // Dispatch custom event to enter edit mode
      if (typeof window !== 'undefined') {
        const event = new CustomEvent('slide:doubleclick', {
          detail: { slideId: slideData.id }
        });
        window.dispatchEvent(event);
      }
    }
  };

  // Handle component update (when editing)
  const handleComponentUpdate = (componentId: string, updates: Partial<ComponentInstance>) => {
    // Component update received
    
    // Update the component with the context API
    updateComponent(componentId, updates);
  };

  // Handle saving slide changes
  const handleSave = (updatedSlide: Partial<SlideData>) => {
    // Slide handleSave called
    
    if (onSave) {
      onSave(updatedSlide);
    }
  };

  // Handle cancel edit
  const handleCancel = () => {
    if (onSave) {
      onSave({}); // Empty object to just exit edit mode without changes
    }
  };

  // Handle component selection
  const handleComponentSelect = (component: ComponentInstance) => {
    if (onComponentSelect) {
      onComponentSelect(component);
    }
  };

  // Use the activeComponents when we're showing the current slide,
  // otherwise use the components from the slide prop
  // Ensure componentsToRender is always an array
  // Memoize to prevent unnecessary re-renders when references change but content is the same
  const componentsToRender = useMemo(() => {
    const components = isActive && isEditing 
      ? activeComponents 
      : (slideData.components || []);
    return Array.isArray(components) ? components : [];
  }, [isActive, isEditing, activeComponents, slideData.components]);
  
  // PERFORMANCE: Skip loading components if explicitly told to
  // This helps with edit mode performance when there are many slides in a deck
  const shouldSkipRender = typeof window !== 'undefined' && 
                          (window as any).__skipNonVisibleSlideLoading && 
                          !(isActive);

  // Remove special thumbnail effect for chart caching
  
  // Check if we have any components to render
  const noComponents = componentsToRender.length === 0;

  // Animation code removed to instantly switch slides without transitions

  // Find background component in the components array
  const backgroundComponent = componentsToRender.find(component => 
    component.type === "Background" || (component.id && component.id.toLowerCase().includes('background'))
  );
  
  // Get all components for snapping calculations
  const allComponents = Array.isArray(componentsToRender) ? componentsToRender : [];

  // Log animation state for debugging
  useEffect(() => {
    // Slide rendering with visibility and direction state
  }, [isVisible, direction, slideData.id]);

  // Ensure we have a consistent direction value
  const animationDirection = direction || null;

  // Get slide size using proper React hooks
  const [slideSize, setSlideSize] = useState({ width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT });
  
  // Try to get slide size from editor context - using useEffect to be safe
  useEffect(() => {
    try {
      const getEditorState = async () => {
        const module = await import('@/context/EditorStateContext');
        try {
          const useEditorState = module.useEditorState;
          const editorState = useEditorState();
          if (editorState && editorState.slideSize) {
            setSlideSize(editorState.slideSize);
          }
        } catch (err) {
          // Error accessing EditorStateContext, using default slide size
        }
      };
      
      getEditorState();
    } catch (error) {
      // Using default slide size 1920x1080
    }
  }, []);

  // Track line dragging state globally
  const [lineDragState, setLineDragState] = useState<{
    isDragging: boolean;
    hoveredComponentId: string | null;
    cursorPosition: { x: number; y: number } | null;
    componentId: string | null;
  }>({
    isDragging: false,
    hoveredComponentId: null,
    cursorPosition: null,
    componentId: null
  });
  
  // Listen for line drag events
  useEffect(() => {
    const handleLineDragUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail) {
        setLineDragState({
          isDragging: detail.isDragging || false,
          hoveredComponentId: detail.hoveredComponentId || null,
          cursorPosition: detail.cursorPosition || null,
          componentId: detail.componentId || null
        });
      }
    };
    
    document.addEventListener('line-drag-update', handleLineDragUpdate);
    
    return () => {
      document.removeEventListener('line-drag-update', handleLineDragUpdate);
    };
  }, []);

  // Get multi-selection state from editor store
  const { isComponentSelected } = React.useContext(ActiveSlideContext) ? {} : { isComponentSelected: () => false };
  const editorStore = typeof window !== 'undefined' ? (window as any).__editorStore : null;
  const isComponentMultiSelected = (id: string) => {
    if (editorStore?.isComponentSelected) {
      return editorStore.isComponentSelected(id);
    }
    return false;
  };
  
  // Track selected components with proper React state
  const selectedComponentIds = useEditorStore(state => state.selectedComponentIds);
  const getSelectedComponentsForBoundingBox = useMemo(() => {
    if (!isEditing || !activeSlideContext || selectedComponentIds.size <= 1) {
      return [];
    }
    // Use componentsToRender which updates during drag
    return componentsToRender.filter(comp => selectedComponentIds.has(comp.id));
  }, [selectedComponentIds, componentsToRender, isEditing, activeSlideContext]);

  // Removed citations overlay logic

  // Removed font optimization overlay/events

  return (
    <div
      className={`absolute top-0 left-0 w-full h-full ${className}`}
      style={{
        ...style,
        zIndex: isVisible ? 10 : 0,
        pointerEvents: isVisible ? 'auto' : 'none',
        cursor: 'inherit' // Inherit cursor from parent
      }}
      onClick={handleSlideClick}
      onDoubleClick={handleDoubleClick}
      data-direction={animationDirection}
      data-slide-width={slideSize.width}
      data-slide-height={slideSize.height}
      data-dragging={isDraggingRef.current ? 'true' : 'false'}
      
      data-position-update-count={positionUpdateCounter}
    >
      <AspectRatio 
        ratio={slideSize.width / slideSize.height} 
        className={`w-full h-full p-0 m-0 relative slide-container ${isDraggingRef.current ? 'dragging' : ''}`}
        data-slide-id={slideData.id}
        data-dragging={isDraggingRef.current ? 'true' : 'false'}

        id={`slide-${slideData.id}`}
      >
        {/* Line snap indicators - render above background but below components */}
        {isEditing && lineDragState.isDragging && (
          <LineSnapIndicators
            components={componentsToRender}
            isDragging={lineDragState.isDragging}
            hoveredComponentId={lineDragState.hoveredComponentId}
            cursorPosition={lineDragState.cursorPosition}
            slideSize={slideSize}
            excludeComponentId={lineDragState.componentId}
          />
        )}
        
        {/* Web Research badge removed */}
        {/* Slide Background */}
        {backgroundComponent && (
          <div 
            className="absolute inset-0 w-full h-full overflow-hidden"
            style={{
              zIndex: 0
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (isEditing && onComponentSelect) {
                handleComponentSelect(backgroundComponent);
              }
            }}
          >
            <ComponentRenderer 
              component={backgroundComponent}
              isThumbnail={isThumbnail}
              isSelected={selectedComponentId === backgroundComponent.id}
              onSelect={isEditing ? (id) => handleComponentSelect(backgroundComponent) : undefined} // Changed from undefined to allow selection
              allComponents={allComponents}
            />
          </div>
        )}
        
        {/* Slide Components (excluding background) */}
        {!shouldSkipRender && componentsToRender
          .filter(component => 
            !(component.type === "Background" || (component.id && component.id.toLowerCase().includes('background')))
          )
          .map(component => (
            <ComponentRenderer 
              key={component.id} 
              component={{
                ...component,
                props: {
                  ...component.props,
                  _originalScale: 0.0833333, // Keep scale factor for consistent sizing
                  preserveLayout: true // Ensure layout is preserved during drag operations
                }
              }}
              isThumbnail={isThumbnail}
              isSelected={selectedComponentId === component.id}
              onSelect={isEditing ? (id) => handleComponentSelect(component) : undefined}
              allComponents={allComponents}
            />
          ))}
        
        {/* Empty State */}
        {noComponents && isEditing && (
          <div className="absolute inset-0 flex items-center justify-center text-center text-gray-400 pointer-events-none">
            <div>
              <p>This slide is empty.</p>
              <p>Add components using the toolbar.</p>
            </div>
          </div>
        )}
        
        {/* Text Bounding Box Overlay - only show when not a thumbnail and active */}
        {!isThumbnail && isActive && (
          <TextBoundingBoxOverlay 
            forceVisible={showDebugOverlay}
            showLegend={showDebugLegend}
            components={componentsToRender}
          />
        )}
        
        {/* Multi-selection bounding box */}
        {getSelectedComponentsForBoundingBox.length > 0 && (
          <MultiSelectionBoundingBox 
            selectedComponents={getSelectedComponentsForBoundingBox} 
            slideSize={slideSize} 
            slideId={slideData.id}
            isEditing={isEditing}
          />
        )}
        
        {/* Group edit mode indicator */}
        {isEditing && activeSlideContext && !isThumbnail && isActive && (
          <GroupEditIndicator slideId={slideData.id} />
        )}

        {/* Citations overlay removed */}

        {/* Font optimization overlay removed */}
      </AspectRatio>
    </div>
  );
};

// Default export that wraps SlideContent
const Slide: React.FC<SlideProps> = (props) => {
  // In the wrapped version, we don't try to use the provider directly
  // Instead we let the SlideContent component handle context gracefully
  // Pass the isThumbnail prop down (Corrected: No need to pass it here again, SlideContent destructures it)
  return <SlideContent {...props} />;
};

export default Slide;
