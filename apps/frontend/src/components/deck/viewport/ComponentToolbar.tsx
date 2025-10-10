import React, { useState, useRef } from 'react';
import { useEditor } from '@/hooks/useEditor';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { 
  Type, Image, Square, LineChart, Video, MousePointer, Magnet, Circle, Triangle, 
  Hexagon, Pentagon, Diamond, ArrowRight, Heart, Star, BarChart, PieChart, 
  ScatterChart, LucideIcon, Grid, Palette, Slash, Ellipsis, Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createComponent } from '@/utils/componentUtils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useEditorSettingsStore } from '@/stores/editorSettingsStore';
import { useThemeStore } from '@/stores/themeStore';
import { registry } from '@/registry';
import { CHART_TYPES } from '@/registry/library/chart-properties';
import { SHAPE_TYPES } from '@/registry/components/shape';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { MediaHub, OnMediaSelect } from '@/components/media/MediaHub';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ThemePanel } from '@/components/theme';
import { ReactBitsButton } from '@/components/reactbits/ReactBitsButton';

// Table size selector component for the dropdown
interface TableSizeSelectorProps {
  onSelectSize: (rows: number, cols: number) => void;
  maxRows?: number;
  maxCols?: number;
}

const TableSizeSelector: React.FC<TableSizeSelectorProps> = ({ 
  onSelectSize, 
  maxRows = 5, 
  maxCols = 5 
}) => {
  const [hoveredSize, setHoveredSize] = useState<{ rows: number, cols: number }>({ rows: 0, cols: 0 });
  
  const handleMouseOver = (row: number, col: number) => {
    setHoveredSize({ rows: row + 1, cols: col + 1 });
  };
  
  const handleCellClick = () => {
    onSelectSize(hoveredSize.rows, hoveredSize.cols);
  };
  
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="grid grid-cols-5 gap-0.5">
        {Array.from({ length: maxRows }).map((_, rowIndex) => (
          Array.from({ length: maxCols }).map((_, colIndex) => (
            <div 
              key={`${rowIndex}-${colIndex}`}
              className={`w-6 h-6 border border-border transition-colors cursor-pointer ${
                rowIndex < hoveredSize.rows && colIndex < hoveredSize.cols 
                  ? 'bg-primary/20 border-primary' 
                  : 'hover:bg-muted'
              }`}
              onMouseOver={() => handleMouseOver(rowIndex, colIndex)}
              onClick={handleCellClick}
            />
          ))
        ))}
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        {hoveredSize.rows} × {hoveredSize.cols}
      </div>
    </div>
  );
};

interface ComponentToolbarProps {
  slideId: string;
  onComponentSelected?: (componentId: string) => void;
}

const ComponentToolbar: React.FC<ComponentToolbarProps> = ({ 
  slideId,
  onComponentSelected
}) => {
  // Use both hooks, but prefer ActiveSlideContext for operations
  const { isEditing } = useEditor();
  const { activeSlide, addComponent, updateComponent, removeComponent, activeComponents } = useActiveSlide();
  
  // Get current theme for applying colors to new shapes
  const getWorkspaceTheme = useThemeStore(state => state.getWorkspaceTheme);
  const currentTheme = getWorkspaceTheme();
  
  // State for shape and chart creation mode
  const [isCreatingShape, setIsCreatingShape] = useState(false);
  const [isCreatingLine, setIsCreatingLine] = useState(false);
  const lineCleanupRef = useRef<(() => void) | null>(null);
  const [selectedShapeType, setSelectedShapeType] = useState<string>("rectangle");
  const [selectedChartType, setSelectedChartType] = useState<string>("bar");
  
  // Get snap settings from the correct store individually
  const isSnapEnabled = useEditorSettingsStore(state => state.isSnapEnabled);
  const toggleSnap = useEditorSettingsStore(state => state.toggleSnap);

  // Theme popover controlled state for reliable closing
  const [isThemeOpen, setIsThemeOpen] = useState(false);

  // Don't render if not in edit mode
  if (!isEditing) return null;

  // Helper function to get icon for a shape type
  const getShapeIcon = (shapeType: string) => {
    switch(shapeType) {
      case 'rectangle': return <Square size={16} />;
      case 'circle': return <Circle size={16} />;
      case 'ellipse': return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <ellipse cx="8" cy="8" rx="6" ry="4" />
        </svg>
      );
      case 'triangle': return <Triangle size={16} />;
      case 'hexagon': return <Hexagon size={16} />;
      case 'pentagon': return <Pentagon size={16} />;
      case 'diamond': return <Diamond size={16} />;
      case 'arrow': return <ArrowRight size={16} />;
      case 'heart': return <Heart size={16} />;
      case 'star': return <Star size={16} />;
      default: return <Square size={16} />;
    }
  };
  
  // Helper function to get icon for a chart type
  const getChartIcon = (chartType: string) => {
    switch(chartType) {
      case 'bar':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="13" height="4"/>
            <rect x="3" y="9" width="10" height="4"/>
            <rect x="3" y="15" width="15" height="4"/>
          </svg>
        );
      case 'column': 
        return <BarChart size={16} />;
      case 'pie': 
        return <PieChart size={16} />;
      case 'line':
      case 'spline':
        return <LineChart size={16} />;
      case 'area':
      case 'areaspline':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 21 L3 7 L9 14 L15 4 L21 11 L21 21 Z" fill="currentColor" fillOpacity="0.2"/>
            <path d="M3 7 L9 14 L15 4 L21 11" />
          </svg>
        );
      case 'scatter':
        return <ScatterChart size={16} />;
      case 'bubble':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="16" r="5" fill="currentColor" fillOpacity="0.1"/>
            <circle cx="16" cy="8" r="7" fill="currentColor" fillOpacity="0.1"/>
            <circle cx="14" cy="18" r="3" fill="currentColor" fillOpacity="0.1"/>
            <circle cx="6" cy="7" r="4" fill="currentColor" fillOpacity="0.1"/>
            <circle cx="19" cy="17" r="2" fill="currentColor" fillOpacity="0.1"/>
          </svg>
        );
      case 'radar':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polygon points="12,3 19,7 19,14 12,18 5,14 5,7" fill="none"/>
            <polyline points="12,3 12,10.5 5,14"/>
            <polyline points="12,10.5 19,7"/>
            <polyline points="12,10.5 19,14"/>
          </svg>
        );
      case 'waterfall':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="12" width="4" height="9"/>
            <rect x="7" y="8" width="4" height="13"/>
            <rect x="11" y="10" width="4" height="11"/>
            <rect x="15" y="6" width="4" height="15"/>
            <rect x="19" y="9" width="4" height="12"/>
          </svg>
        );
      case 'gauge':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z"/>
            <path d="M12 12 L8 6"/>
            <circle cx="12" cy="12" r="2" fill="currentColor"/>
          </svg>
        );
      case 'boxplot':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="8" y="6" width="8" height="12" fill="none"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
            <line x1="12" y1="3" x2="12" y2="6"/>
            <line x1="12" y1="18" x2="12" y2="21"/>
            <line x1="10" y1="3" x2="14" y2="3"/>
            <line x1="10" y1="21" x2="14" y2="21"/>
          </svg>
        );
      case 'errorbar':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="4" y="8" width="4" height="8" fill="currentColor" fillOpacity="0.3"/>
            <rect x="10" y="6" width="4" height="10" fill="currentColor" fillOpacity="0.3"/>
            <rect x="16" y="10" width="4" height="6" fill="currentColor" fillOpacity="0.3"/>
            <line x1="6" y1="5" x2="6" y2="11" strokeWidth="2"/>
            <line x1="12" y1="3" x2="12" y2="9" strokeWidth="2"/>
            <line x1="18" y1="7" x2="18" y2="13" strokeWidth="2"/>
            <line x1="4" y1="5" x2="8" y2="5"/>
            <line x1="4" y1="11" x2="8" y2="11"/>
            <line x1="10" y1="3" x2="14" y2="3"/>
            <line x1="10" y1="9" x2="14" y2="9"/>
            <line x1="16" y1="7" x2="20" y2="7"/>
            <line x1="16" y1="13" x2="20" y2="13"/>
          </svg>
        );
      case 'funnel':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 4 L20 4 L16 12 L16 20 L8 20 L8 12 Z"/>
          </svg>
        );
      case 'pyramid':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 4 L3 20 L21 20 Z" fill="currentColor" fillOpacity="0.1"/>
            <path d="M12 4 L3 20 L21 20 Z"/>
            <line x1="7.5" y1="12" x2="16.5" y2="12"/>
            <line x1="9.75" y1="16" x2="14.25" y2="16"/>
          </svg>
        );
      case 'treemap':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="8" height="8"/>
            <rect x="11" y="3" width="10" height="4"/>
            <rect x="11" y="7" width="5" height="4"/>
            <rect x="16" y="7" width="5" height="4"/>
            <rect x="3" y="11" width="5" height="10"/>
            <rect x="8" y="11" width="6" height="5"/>
            <rect x="14" y="11" width="7" height="5"/>
            <rect x="8" y="16" width="13" height="5"/>
          </svg>
        );
      case 'heatmap':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="4" height="4" fill="currentColor" fillOpacity="0.2"/>
            <rect x="7" y="3" width="4" height="4" fill="currentColor" fillOpacity="0.4"/>
            <rect x="11" y="3" width="4" height="4" fill="currentColor" fillOpacity="0.6"/>
            <rect x="15" y="3" width="4" height="4" fill="currentColor" fillOpacity="0.8"/>
            <rect x="3" y="7" width="4" height="4" fill="currentColor" fillOpacity="0.4"/>
            <rect x="7" y="7" width="4" height="4" fill="currentColor" fillOpacity="0.6"/>
            <rect x="11" y="7" width="4" height="4" fill="currentColor" fillOpacity="0.8"/>
            <rect x="15" y="7" width="4" height="4" fill="currentColor" fillOpacity="1"/>
          </svg>
        );
      case 'sankey':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 6 Q12 6 12 12 T21 12" fill="none" strokeWidth="3" opacity="0.3"/>
            <path d="M3 12 Q12 12 12 16 T21 16" fill="none" strokeWidth="2" opacity="0.5"/>
            <path d="M3 18 Q12 18 12 12 T21 8" fill="none" strokeWidth="2.5" opacity="0.4"/>
            <circle cx="3" cy="6" r="1.5" fill="currentColor"/>
            <circle cx="3" cy="12" r="1.5" fill="currentColor"/>
            <circle cx="3" cy="18" r="1.5" fill="currentColor"/>
            <circle cx="21" cy="8" r="1.5" fill="currentColor"/>
            <circle cx="21" cy="12" r="1.5" fill="currentColor"/>
            <circle cx="21" cy="16" r="1.5" fill="currentColor"/>
          </svg>
        );
      case 'dependencywheel':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="9" fill="none"/>
            <path d="M12 3 Q7 8 12 12 T12 21" fill="none"/>
            <path d="M3 12 Q8 7 12 12 T21 12" fill="none"/>
            <path d="M21 12 Q16 17 12 12 T3 12" fill="none"/>
            <path d="M12 21 Q17 16 12 12 T12 3" fill="none"/>
            <circle cx="12" cy="3" r="1.5" fill="currentColor"/>
            <circle cx="21" cy="12" r="1.5" fill="currentColor"/>
            <circle cx="12" cy="21" r="1.5" fill="currentColor"/>
            <circle cx="3" cy="12" r="1.5" fill="currentColor"/>
          </svg>
        );
      case 'networkgraph':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="6" cy="6" r="2"/>
            <circle cx="18" cy="6" r="2"/>
            <circle cx="12" cy="18" r="2"/>
            <path d="M8 7 L16 7 M10 17 L7 8 M14 17 L17 8"/>
          </svg>
        );
      case 'packedbubble':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="5" fill="currentColor" fillOpacity="0.2"/>
            <circle cx="16" cy="8" r="4" fill="currentColor" fillOpacity="0.3"/>
            <circle cx="12" cy="15" r="6" fill="currentColor" fillOpacity="0.25"/>
            <circle cx="6" cy="17" r="3" fill="currentColor" fillOpacity="0.35"/>
            <circle cx="18" cy="16" r="3.5" fill="currentColor" fillOpacity="0.3"/>
          </svg>
        );
      case 'streamgraph':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 12 Q6 8 9 10 T15 9 T21 12 L21 20 Q18 18 15 19 T9 18 T3 20 Z" fill="currentColor" fillOpacity="0.3"/>
            <path d="M3 8 Q6 6 9 7 T15 6 T21 8 L21 12 Q18 10 15 11 T9 10 T3 12 Z" fill="currentColor" fillOpacity="0.4"/>
            <path d="M3 4 Q6 3 9 4 T15 3 T21 4 L21 8 Q18 6 15 7 T9 6 T3 8 Z" fill="currentColor" fillOpacity="0.5"/>
          </svg>
        );
      case 'wordcloud':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <text x="4" y="10" fontSize="10" fontWeight="bold" fill="currentColor">Word</text>
            <text x="8" y="18" fontSize="7" fill="currentColor" opacity="0.7">cloud</text>
            <text x="15" y="14" fontSize="5" fill="currentColor" opacity="0.5">viz</text>
          </svg>
        );
      default:
        return <BarChart size={16} />;
    }
  };

  // Standard component creation - used for non-shape components
  const handleAddComponent = (componentType: string, props: Record<string, any> = {}) => {
    
    // Special handling for Icon component to center it in viewport
    if (componentType === 'Icon') {
      // Get the slide container
      const slideContainer = document.querySelector('#slide-display-container');
      if (slideContainer) {
        const slideRect = slideContainer.getBoundingClientRect();
        const DEFAULT_SLIDE_WIDTH = 1920;
        const DEFAULT_SLIDE_HEIGHT = 1080;
        
        // Calculate the center of the visible viewport
        const viewportCenterX = slideRect.width / 2;
        const viewportCenterY = slideRect.height / 2;
        
        // Convert to actual slide coordinates
        const displayToActualRatioX = slideRect.width / DEFAULT_SLIDE_WIDTH;
        const displayToActualRatioY = slideRect.height / DEFAULT_SLIDE_HEIGHT;
        
        const actualCenterX = Math.floor(viewportCenterX / displayToActualRatioX);
        const actualCenterY = Math.floor(viewportCenterY / displayToActualRatioY);
        
        // Get default icon size from registry
        const iconDefaults = registry.getDefinition('Icon')?.defaultProps as Record<string, any> || {};
        const iconWidth = iconDefaults.width || 100;
        const iconHeight = iconDefaults.height || 100;
        
        // Calculate position to center the icon
        props.position = {
          x: actualCenterX - Math.floor(iconWidth / 2),
          y: actualCenterY - Math.floor(iconHeight / 2)
        };
      }
    }
    
    // Create a new component with existing components for z-index calculation
    const newComponent = createComponent(componentType, {
      ...props, // Include any passed props (like src for image/video)
      existingComponents: activeComponents
    });
    
    // Add the component to the active slide using the ActiveSlideContext
    addComponent(newComponent);
    
    // Select the newly added component
    if (onComponentSelected) {
        // Add a slight delay to ensure the component is rendered before selection
        setTimeout(() => {
            onComponentSelected(newComponent.id);
        }, 10); 
    }
  };
  
  // Creates a table with the specified number of rows and columns
  const createTableWithSize = (rows: number, cols: number) => {
    
    // Generate headers for each column
    const headers = Array.from({ length: cols }, (_, index) => `Column ${index + 1}`);
    
    // Generate empty data cells for each row
    const data = Array.from({ length: rows }, () => 
      Array.from({ length: cols }, () => "")
    );
    
    // Get the Table definition from the TypeBox registry
    const tableDef = registry.getDefinition('Table');
    // Cast to any to avoid type errors with tableStyles
    const defaultTableStyles = (tableDef?.defaultProps as any)?.tableStyles || {};
    
    // Create the table component with the custom dimensions
    const newComponent = createComponent('Table', {
      headers,
      data,
      // Use default styling from the TypeBox registry
      tableStyles: defaultTableStyles,
      cellStyles: [],
      showHeader: true,
      existingComponents: activeComponents
    });
    
    // Add the component to the active slide
    addComponent(newComponent);
    
    // Select the newly created component
    if (onComponentSelected) {
      setTimeout(() => {
        onComponentSelected(newComponent.id);
      }, 10);
    }
  };
  
  // Function to start shape creation mode
  const startShapeCreation = (shapeType: string) => {
    setSelectedShapeType(shapeType);
    setIsCreatingShape(true);
    
    // Find the slide container - we need the exact display container for proper positioning
    const slideContainer = document.querySelector('#slide-display-container');
    if (!slideContainer) {
      console.error("[ShapeCreation] Could not find slide display container");
      return;
    }
    
    // Force crosshair cursor directly on the element with !important
    (slideContainer as HTMLElement).style.setProperty('cursor', 'crosshair', 'important');
    
    // Also set cursor on the body to ensure coverage
    document.body.style.setProperty('cursor', 'crosshair', 'important');
    
    // Create an overlay to capture all mouse events during creation
    const createEventCaptureOverlay = (): HTMLDivElement => {
      const overlay = document.createElement('div');
      overlay.id = 'shape-creation-overlay';
      overlay.style.position = 'absolute';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.zIndex = '9998'; // Just below feedback element
      overlay.style.backgroundColor = 'transparent'; // Invisible
      overlay.style.pointerEvents = 'auto'; // Capture all pointer events
      overlay.style.cursor = 'crosshair';
      
      // Don't add any blocking event handlers - we'll use this overlay for the actual shape creation
      
      return overlay;
    };
    
    // Define event handlers
    const clickHandler = (e: MouseEvent) => {
      // CRITICAL: Stop event propagation to prevent underlying components from being affected
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      const rect = slideContainer.getBoundingClientRect();
      
      // Calculate click position relative to the slide
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      
      // Create a shape centered at the clicked position
      const newComponentId = createInitialShape(shapeType, clickX, clickY);
      
      // Select the newly created component
      if (onComponentSelected) {
        setTimeout(() => {
          onComponentSelected(newComponentId);
        }, 10);
      }
      
      // Clean up
      cleanup();
    };
    

    
    // Create the visual feedback element for drag (NOW USING SVG)
    const createVisualFeedback = (shapeType: string): SVGElement => {
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("id", "shape-creation-feedback");
      svg.style.position = 'absolute';
      svg.style.overflow = 'visible'; // Allow stroke to exceed bounds slightly
      svg.style.pointerEvents = 'none'; // Don't interfere with mouse events
      svg.style.zIndex = '10000'; // Even higher z-index
      svg.style.left = '0px'; // Will be set in mouseMove
      svg.style.top = '0px';  // Will be set in mouseMove
      svg.style.width = '0px'; // Will be set in mouseMove
      svg.style.height = '0px';// Will be set in mouseMove
      svg.style.display = 'none'; // Initially hidden
      
      // Initialize viewBox to prevent issues
      svg.setAttribute('viewBox', '0 0 1 1');

      // Create the actual shape element (polygon, rect, circle, ellipse)
      let shapeElement;
      if (['rectangle', 'circle', 'ellipse'].includes(shapeType)) { // Simple shapes
          if (shapeType === 'circle') {
            shapeElement = document.createElementNS(svgNS, 'circle');
          } else if (shapeType === 'ellipse') {
            shapeElement = document.createElementNS(svgNS, 'ellipse');
          } else {
            shapeElement = document.createElementNS(svgNS, 'rect');
          }
      } else { // Complex shapes use polygon
          shapeElement = document.createElementNS(svgNS, 'polygon');
      }
      
      shapeElement.setAttribute("id", "feedback-shape");
      shapeElement.setAttribute("fill", "rgba(0, 123, 255, 0.2)"); // More visible fill
      shapeElement.setAttribute("stroke", "#007bff");
      shapeElement.setAttribute("stroke-width", "1"); // Thinner stroke to match final appearance
      shapeElement.setAttribute("stroke-dasharray", "3 3"); // Smaller dashes for visual parity
      shapeElement.setAttribute("vector-effect", "non-scaling-stroke"); // Important for consistent stroke width on resize

      svg.appendChild(shapeElement);
      return svg;
    };
    
    // Handle mouse events for dragging
    let isMouseDown = false;
    let isDragging = false;
    let startX = 0, startY = 0;
    let feedbackElement: SVGElement | null = null;
    let eventOverlay: HTMLDivElement | null = null;
    
    // Create the feedback element and overlay immediately when starting shape creation
    feedbackElement = createVisualFeedback(shapeType);
    eventOverlay = createEventCaptureOverlay();
    
    const mouseDownHandler = (e: MouseEvent) => {
      const rect = slideContainer.getBoundingClientRect();
      
      // Only handle events inside the slide
      if (
        e.clientX < rect.left || 
        e.clientX > rect.right || 
        e.clientY < rect.top || 
        e.clientY > rect.bottom
      ) {
        return;
      }
      
      // CRITICAL: Stop event propagation to prevent underlying components from moving
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      // Calculate position relative to the slide
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;
      
      // Set flags
      isMouseDown = true;
      isDragging = false;
    };
    
    const mouseMoveHandler = (e: MouseEvent) => {
      if (!isMouseDown) return;
      
      // CRITICAL: Stop event propagation during shape creation
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      const rect = slideContainer.getBoundingClientRect();
      
      // Get current position, constrained to slide bounds
      const currentX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const currentY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
      
      // Calculate width and height
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);
      
      // Start dragging if moved enough
      if (!isDragging && (width > 5 || height > 5)) {
        isDragging = true;
      }
      
      // If dragging, update visual feedback
      if (isDragging && feedbackElement) {
        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        
        // Update SVG position and size
        feedbackElement.style.left = `${left}px`;
        feedbackElement.style.top = `${top}px`;
        feedbackElement.style.width = `${width}px`;
        feedbackElement.style.height = `${height}px`;
        feedbackElement.setAttribute('viewBox', `0 0 ${width || 1} ${height || 1}`); // Adjust viewBox to current size
        
        const shapeElement = feedbackElement.querySelector('#feedback-shape');
        if (shapeElement) {
          // Update shape attributes based on type and dimensions
          updateFeedbackShapeAttributes(shapeElement, shapeType, width, height);
        }
        
        // Ensure it's visible
        feedbackElement.style.display = 'block';
      } else if (!feedbackElement) {
        console.error('[ShapeCreation] Feedback element is null during drag');
      }
    };
    
    const mouseUpHandler = (e: MouseEvent) => {
      if (!isMouseDown) return;
      
      // CRITICAL: Stop event propagation during shape creation
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      // Reset mouse state
      isMouseDown = false;
      
      const rect = slideContainer.getBoundingClientRect();
      
      // Get current position
      const currentX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const currentY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
      
      // If we were dragging, create a shape with the drag dimensions
      if (isDragging) {
        // Calculate width and height - these are the exact dimensions from mouse movement
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);
        
        // Calculate top-left position - this is exactly where the drag started
        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        
        // Use the exact coordinates that were used for the feedback element
        const finalLeft = left;
        const finalTop = top;
        const finalWidth = width;
        const finalHeight = height;
        
        // Create the shape with exact dimensions matching the drag area
        const newComponentId = createDragShape(shapeType, finalLeft, finalTop, finalWidth, finalHeight);
        
        // Select the component
        if (onComponentSelected) {
          setTimeout(() => {
            onComponentSelected(newComponentId);
          }, 10);
        }
      } else {
        // This was a click - create with default size
        
        // Create centered at the clicked position
        const newComponentId = createInitialShape(shapeType, startX, startY);
        
        // Select the component
        if (onComponentSelected) {
          setTimeout(() => {
            onComponentSelected(newComponentId);
          }, 10);
        }
      }
      
      // Clean up
      cleanup();
    };
    
    const escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup();
      }
    };
    
    // Cleanup function to reset everything
    const cleanup = () => {
      // Reset state
      setIsCreatingShape(false);
      isMouseDown = false;
      isDragging = false;
      
      // Remove CSS classes and attributes
      document.body.classList.remove('creating-shape');
      document.body.removeAttribute('data-shape-creation');
      document.body.removeAttribute('data-shape-type');
      
      // Reset cursor on body - must reset to properly clear important
      document.body.style.removeProperty('cursor');
      
      // Remove the cursor class from the slide display container
      const slideContainer = document.querySelector('#slide-display-container');
      if (slideContainer) {
        slideContainer.classList.remove('creating-shape-cursor');
        (slideContainer as HTMLElement).style.removeProperty('cursor');
      }
      
      // Remove the visual feedback element
      if (feedbackElement && feedbackElement.parentNode) {
        feedbackElement.parentNode.removeChild(feedbackElement);
        feedbackElement = null; // Clear the reference
      }
      
      // Remove the event capture overlay
      if (eventOverlay && eventOverlay.parentNode) {
        eventOverlay.parentNode.removeChild(eventOverlay);
        eventOverlay = null; // Clear the reference
      }
      

      
      // Remove event listeners
      slideContainer.removeEventListener('click', clickHandler);
      // The mousedown was on the overlay, not slideContainer
      if (eventOverlay) {
        eventOverlay.removeEventListener('mousedown', mouseDownHandler);
      }
      document.removeEventListener('mousemove', mouseMoveHandler);
      document.removeEventListener('mouseup', mouseUpHandler);
      document.removeEventListener('keydown', escapeHandler);
    };
    
    // Add event listeners
    slideContainer.addEventListener('click', clickHandler);
    // Remove these - we'll attach to overlay instead
    // slideContainer.addEventListener('mousedown', mouseDownHandler);
    // document.addEventListener('mousemove', mouseMoveHandler);
    // document.addEventListener('mouseup', mouseUpHandler);
    document.addEventListener('keydown', escapeHandler);

    // Add visual feedback and overlay to the container
    if (feedbackElement && eventOverlay) {
      feedbackElement.style.display = 'none'; // Initially hidden
      
      // Double-check slide container still exists
      const containerCheck = document.querySelector('#slide-display-container');
      if (!containerCheck) {
        console.error('[ShapeCreation] Slide container disappeared before appending feedback elements!');
        cleanup();
        return;
      }
      
      // Attach shape creation handlers to the overlay
      eventOverlay.addEventListener('mousedown', mouseDownHandler);
      document.addEventListener('mousemove', mouseMoveHandler);
      document.addEventListener('mouseup', mouseUpHandler);
      
      slideContainer.appendChild(eventOverlay); // Add overlay first (lower z-index)
      slideContainer.appendChild(feedbackElement); // Add feedback on top
      

    } else {
      console.error("[ShapeCreation] Failed to create visual feedback element or overlay for shape creation");
    }
  };
  
  // Create an initial shape at the specified position with default size
  const createInitialShape = (shapeType: string, x: number, y: number): string => {
    
    // Get the default props for the Shape type from the registry
    const shapeDefaults = registry.getDefinition('Shape')?.defaultProps as Record<string, any> || {};
    
    // Get slide dimensions - we need to specifically use the slide-display-container
    const slideContainer = document.querySelector('#slide-display-container');
    if (!slideContainer) {
      console.error("Could not find slide display container");
      return "";
    }
    
    // Get the actual slide dimensions
    const DEFAULT_SLIDE_WIDTH = 1920; // Same as in deckUtils.ts
    const DEFAULT_SLIDE_HEIGHT = 1080; // Same as in deckUtils.ts
    const slideRect = slideContainer.getBoundingClientRect();
    
    // Calculate the ratio between display size and actual slide size
    const displayToActualRatioX = slideRect.width / DEFAULT_SLIDE_WIDTH;
    const displayToActualRatioY = slideRect.height / DEFAULT_SLIDE_HEIGHT;
    
    // Use the registry default width and height
    let defaultWidth = shapeDefaults.width || 300;
    let defaultHeight = shapeDefaults.height || 200;
    
    // For circles, ensure equal width and height to maintain circular shape
    if (shapeType === 'circle') {
      const circleSize = Math.min(defaultWidth, defaultHeight);
      defaultWidth = circleSize;
      defaultHeight = circleSize;
    }
    
    // Calculate the position so that the center of the shape is at the clicked position
    // First convert to actual slide coordinates, then adjust for centering
    const actualClickX = x / displayToActualRatioX;
    const actualClickY = y / displayToActualRatioY;
    
    // Calculate the top-left position by subtracting half the width/height
    const actualX = actualClickX - (defaultWidth / 2);
    const actualY = actualClickY - (defaultHeight / 2);
    
    // Create the component with default size centered at the clicked position
    const newComponent = createComponent('Shape', {
      shapeType: shapeType,
      position: { x: actualX, y: actualY },
      width: defaultWidth,
      height: defaultHeight,
      fill: shapeDefaults.fill ?? "#4287f5ff",
      stroke: shapeDefaults.stroke ?? "#000000ff",
      // Use registry default exactly; avoid forcing a non-zero stroke which causes visual jump
      strokeWidth: (shapeDefaults.strokeWidth as number) ?? 0,
    });
    
    // Add the component to the active slide
    addComponent(newComponent);
    
    // Return the component ID for tracking
    return newComponent.id;
  };
  
  // Function to start line creation mode
  const startLineCreation = () => {
    setIsCreatingLine(true);
    
    // Find the slide container
    const slideContainer = document.querySelector('#slide-display-container');
    if (!slideContainer) {
      console.error("Could not find slide display container");
      setIsCreatingLine(false);
      return;
    }
    
    let isMouseDown = false;
    let startX = 0, startY = 0;
    let feedbackElement: SVGElement | null = null;
    let eventOverlay: HTMLDivElement | null = null;
    let outsideMouseDownHandler: ((e: MouseEvent) => void) | null = null;
    
    // Create visual feedback element for line
    const createLineFeedback = (): SVGElement => {
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("id", "line-creation-feedback");
      svg.style.position = 'absolute';
      svg.style.overflow = 'visible';
      svg.style.pointerEvents = 'none'; // Don't interfere with mouse events
      svg.style.zIndex = '10000'; // Increased z-index
      svg.style.left = '0px';
      svg.style.top = '0px';
      svg.style.width = '100%';
      svg.style.height = '100%';
      
      // Create a transparent rect to ensure SVG renders
      const bgRect = document.createElementNS(svgNS, "rect");
      bgRect.setAttribute("width", "100%");
      bgRect.setAttribute("height", "100%");
      bgRect.setAttribute("fill", "transparent");
      svg.appendChild(bgRect);
      
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("id", "feedback-line");
      line.setAttribute("stroke", "#007bff");
      line.setAttribute("stroke-width", "3");
      line.setAttribute("stroke-dasharray", "5 5");
      line.setAttribute("stroke-linecap", "round");
      
      svg.appendChild(line);
      return svg;
    };
    
    // Create an invisible overlay to capture all mouse events during line creation
    const createLineEventCaptureOverlay = (): HTMLDivElement => {
      const overlay = document.createElement('div');
      overlay.id = 'line-creation-overlay';
      overlay.style.position = 'absolute';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.zIndex = '9999'; // Below feedback element but above slide content
      overlay.style.backgroundColor = 'transparent'; // Fully transparent
      overlay.style.pointerEvents = 'auto'; // Capture all pointer events
      overlay.style.cursor = 'crosshair';
      
      // Don't block events in capture phase - let them bubble to parent handlers
      return overlay;
    };
    
    // Cleanup function
    const cleanup = () => {
      setIsCreatingLine(false);
      
      if (feedbackElement && feedbackElement.parentNode) {
        feedbackElement.parentNode.removeChild(feedbackElement);
      }
      feedbackElement = null;
      
      // Remove the event capture overlay
      if (eventOverlay && eventOverlay.parentNode) {
        eventOverlay.parentNode.removeChild(eventOverlay);
      }
      eventOverlay = null;
      
      // Reset cursor
      (slideContainer as HTMLElement).style.removeProperty('cursor');
      document.body.style.removeProperty('cursor');
      slideContainer.classList.remove('creating-shape-cursor');
      document.body.classList.remove('creating-shape');
      
      // Remove event handlers
      if (eventOverlay) {
        eventOverlay.removeEventListener('mousedown', mouseDownHandler);
      }
      document.removeEventListener('mousemove', mouseMoveHandler);
      document.removeEventListener('mouseup', mouseUpHandler);
      document.removeEventListener('keydown', keydownHandler);
      if (outsideMouseDownHandler) {
        document.removeEventListener('mousedown', outsideMouseDownHandler, true);
      }

      // Allow toolbar toggle to cancel
      lineCleanupRef.current = null;
    };
    
    const keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup();
      }
    };
    
    const mouseDownHandler = (e: MouseEvent) => {
      const rect = slideContainer.getBoundingClientRect();
      
      // Only handle events inside the slide
      if (
        e.clientX < rect.left || 
        e.clientX > rect.right || 
        e.clientY < rect.top || 
        e.clientY > rect.bottom
      ) {
        return;
      }
      
      // CRITICAL: Stop event propagation to prevent underlying components from moving
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      // Calculate position relative to the slide
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;
      
      isMouseDown = true;
      
      // Create and append feedback element if missing
      if (!feedbackElement) {
        feedbackElement = createLineFeedback();
        slideContainer.appendChild(feedbackElement);
      }
      
      // Initialize the line position immediately
      const feedbackLine = feedbackElement.querySelector('#feedback-line') as SVGLineElement;
      if (feedbackLine) {
        feedbackLine.setAttribute('x1', `${startX}`);
        feedbackLine.setAttribute('y1', `${startY}`);
        feedbackLine.setAttribute('x2', `${startX}`);
        feedbackLine.setAttribute('y2', `${startY}`);
        feedbackLine.setAttribute('opacity', '1');
      }
      
      // Ensure cursor stays as crosshair
      (slideContainer as HTMLElement).style.setProperty('cursor', 'crosshair', 'important');
      document.body.style.setProperty('cursor', 'crosshair', 'important');
    };
    
    const mouseMoveHandler = (e: MouseEvent) => {
      if (!isMouseDown || !feedbackElement) return;
      
      // CRITICAL: Stop event propagation during line creation
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      const rect = slideContainer.getBoundingClientRect();
      const currentX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const currentY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
      
      // Update line feedback
      const feedbackLine = feedbackElement.querySelector('#feedback-line') as SVGLineElement;
      if (feedbackLine) {
        feedbackLine.setAttribute('x1', `${startX}`);
        feedbackLine.setAttribute('y1', `${startY}`);
        feedbackLine.setAttribute('x2', `${currentX}`);
        feedbackLine.setAttribute('y2', `${currentY}`);
        
        // Make line visible
        feedbackLine.setAttribute('opacity', '1');
      }
    };
    
    const mouseUpHandler = (e: MouseEvent) => {
      if (!isMouseDown) return;
      
      // CRITICAL: Stop event propagation during line creation
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      isMouseDown = false;
      
      const rect = slideContainer.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;
      
      // Convert to slide coordinates - use exact conversion
      const slideWidth = rect.width;
      const slideHeight = rect.height;
      const actualStartX = Math.round((startX / slideWidth) * DEFAULT_SLIDE_WIDTH);
      const actualStartY = Math.round((startY / slideHeight) * DEFAULT_SLIDE_HEIGHT);
      const actualEndX = Math.round((endX / slideWidth) * DEFAULT_SLIDE_WIDTH);
      const actualEndY = Math.round((endY / slideHeight) * DEFAULT_SLIDE_HEIGHT);
      
      // Calculate the bounding box for the line
      const minX = Math.min(actualStartX, actualEndX);
      const minY = Math.min(actualStartY, actualEndY);
      const width = Math.abs(actualEndX - actualStartX);
      const height = Math.abs(actualEndY - actualStartY);
      
      // Create the line component with exact coordinates from drag
      const newComponent = createComponent('Lines', {
        startPoint: { x: actualStartX, y: actualStartY },
        endPoint: { x: actualEndX, y: actualEndY },
        existingComponents: activeComponents
      });
      
      // Add the component
      addComponent(newComponent);
      
      // Select the component with a small delay to ensure it's rendered
      if (onComponentSelected) {
        setTimeout(() => {
          onComponentSelected(newComponent.id);
        }, 50);
      }
      
      // Clean up
      cleanup();
    };
    
    // Prepare overlay upfront to intercept selection rectangle and component clicks
    eventOverlay = createLineEventCaptureOverlay();
    slideContainer.appendChild(eventOverlay);

    // Outside click (anywhere outside slide or toolbar button) cancels line creation
    outsideMouseDownHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const clickedInsideSlide = !!target.closest('#slide-display-container');
      const clickedToolbarButton = !!target.closest('[data-toolbar-line-button="true"]');
      if (!clickedInsideSlide && !clickedToolbarButton) {
        cleanup();
      }
    };

    // Set cursor immediately
    (slideContainer as HTMLElement).style.setProperty('cursor', 'crosshair', 'important');
    document.body.style.setProperty('cursor', 'crosshair', 'important');
    slideContainer.classList.add('creating-shape-cursor');
    
    // Add event handlers
    eventOverlay.addEventListener('mousedown', mouseDownHandler);
    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);
    document.addEventListener('keydown', keydownHandler);
    document.addEventListener('mousedown', outsideMouseDownHandler, true);

    // Expose cleanup for toggling
    lineCleanupRef.current = cleanup;
  };

  // Create a shape during drag operation
  const createDragShape = (shapeType: string, x: number, y: number, width: number, height: number): string => {
    
    // Get slide dimensions - we need to specifically use the slide-display-container which is the actual viewport
    // This is necessary because there are nested containers in the DOM structure
    const slideContainer = document.querySelector('#slide-display-container');
    if (!slideContainer) {
      console.error("Could not find slide display container");
      return "";
    }
    
    const slideRect = slideContainer.getBoundingClientRect();
    
    // Get the actual slide dimensions
    const DEFAULT_SLIDE_WIDTH = 1920; // Same as in deckUtils.ts
    const DEFAULT_SLIDE_HEIGHT = 1080; // Same as in deckUtils.ts
    
    // Calculate the ratio between display size and actual slide size
    const displayToActualRatioX = slideRect.width / DEFAULT_SLIDE_WIDTH;
    const displayToActualRatioY = slideRect.height / DEFAULT_SLIDE_HEIGHT;
    
    // Convert display coordinates to actual slide coordinates using edge rounding
    // to minimize any visual offset between preview and final shape
    const leftPx = x;
    const topPx = y;
    const rightPx = x + width;
    const bottomPx = y + height;

    const actualLeft = Math.round(leftPx / displayToActualRatioX);
    const actualTop = Math.round(topPx / displayToActualRatioY);
    const actualRight = Math.round(rightPx / displayToActualRatioX);
    const actualBottom = Math.round(bottomPx / displayToActualRatioY);

    let actualWidth = Math.max(10, actualRight - actualLeft); // Minimum width 10px
    let actualHeight = Math.max(10, actualBottom - actualTop); // Minimum height 10px
    
    // For circles, ensure equal width and height to maintain circular shape
    if (shapeType === 'circle') {
      const circleSize = Math.min(actualWidth, actualHeight);
      actualWidth = circleSize;
      actualHeight = circleSize;
    }
    
    // Get default shape properties from registry
    const shapeDefaults = registry.getDefinition('Shape')?.defaultProps as Record<string, any> || {};
    
    // Use theme colors for new shapes instead of hardcoded defaults
    const themeFillColor = currentTheme?.accent1 || shapeDefaults.fill || "#4287f5ff";
    const themeStrokeColor = currentTheme?.typography?.paragraph?.color || shapeDefaults.stroke || "#000000ff";
    
    // Create the component with the exact specified dimensions and theme colors
    const newComponent = createComponent('Shape', {
      shapeType: shapeType,
      position: { x: actualLeft, y: actualTop },
      width: actualWidth,
      height: actualHeight,
      fill: themeFillColor,
      stroke: themeStrokeColor,
      // Use registry default exactly; avoid forcing a non-zero stroke which causes visual jump
      strokeWidth: (shapeDefaults.strokeWidth as number) ?? 0,
    });
    
    // Add the component to the active slide
    addComponent(newComponent);
    
    // Return the component ID for tracking
    return newComponent.id;
  };

  // Map to track generating components
  const generatingComponentsRef = useRef<Map<string, string>>(new Map());

  // --- Add Media Select Handler ---
  const handleMediaSelect: OnMediaSelect = (url, type, source) => {
    console.log(`Media selected: ${type} from ${source} - ${url}`);
    
    if (type === 'image') {
      if (url === 'generating://ai-image') {
        // Create a temporary component with generating state
        const newComponent = createComponent('Image', { 
          src: url,
          isGenerating: true,
          existingComponents: activeComponents 
        });
        addComponent(newComponent);
        
        // Track this component for later update
        generatingComponentsRef.current.set('ai-generation', newComponent.id);
        
        // Select the component
        if (onComponentSelected) {
          setTimeout(() => {
            onComponentSelected(newComponent.id);
          }, 10);
        }
      } else if (url === 'failed://ai-image') {
        // Remove the generating component if it failed
        const componentId = generatingComponentsRef.current.get('ai-generation');
        if (componentId) {
          // Remove the component
          removeComponent(componentId);
          generatingComponentsRef.current.delete('ai-generation');
        }
      } else {
        // Check if this is an update to a generating component
        const generatingId = generatingComponentsRef.current.get('ai-generation');
        if (generatingId && source === 'generate') {
          // Update the existing component with the real image
          updateComponent(generatingId, { props: { src: url, isGenerating: false, userSetSrc: true } });
          generatingComponentsRef.current.delete('ai-generation');
        } else {
          // Normal image add
      handleAddComponent('Image', { src: url, userSetSrc: true });
        }
      }
    } else if (type === 'video') {
      handleAddComponent('Video', { src: url });
    } else {
        // Potentially handle other types like icons or add a generic component?
        console.warn(`Media type "${type}" not explicitly handled yet.`);
    }
  };

  // --- NEW HELPER FUNCTION --- 
  // Calculates and sets SVG attributes for the feedback shape
  const updateFeedbackShapeAttributes = (shapeElement: Element, shapeType: string, width: number, height: number) => {
    const svgNS = "http://www.w3.org/2000/svg";
    const vbWidth = width || 1; // Use 1 if zero to avoid issues
    const vbHeight = height || 1;
    
    // No padding needed for feedback shapes - they should fill the entire area
    switch(shapeType) {
      case 'rectangle':
        shapeElement.setAttribute('x', '0');
        shapeElement.setAttribute('y', '0');
        shapeElement.setAttribute('width', `${vbWidth}`);
        shapeElement.setAttribute('height', `${vbHeight}`);
        break;
      case 'circle':
        shapeElement.setAttribute('cx', `${vbWidth / 2}`);
        shapeElement.setAttribute('cy', `${vbHeight / 2}`);
        // Use the smaller dimension for radius
        shapeElement.setAttribute('r', `${Math.min(vbWidth, vbHeight) / 2}`);
        break;
      case 'ellipse':
        shapeElement.setAttribute('cx', `${vbWidth / 2}`);
        shapeElement.setAttribute('cy', `${vbHeight / 2}`);
        // Use full width and height for ellipse radii
        shapeElement.setAttribute('rx', `${vbWidth / 2}`);
        shapeElement.setAttribute('ry', `${vbHeight / 2}`);
        break;
      // Polygon points are defined assuming a 100x100 viewBox initially
      // We scale them to the current width/height viewBox
      case 'triangle': 
        shapeElement.setAttribute('points', ` 
          ${vbWidth * 0.5},0 
          0,${vbHeight} 
          ${vbWidth},${vbHeight}
        `);
        break;
      case 'star': 
        shapeElement.setAttribute('points', ` 
          ${vbWidth*0.50},${vbHeight*0.00} ${vbWidth*0.61},${vbHeight*0.35} ${vbWidth*0.98},${vbHeight*0.35} 
          ${vbWidth*0.68},${vbHeight*0.57} ${vbWidth*0.79},${vbHeight*0.91} ${vbWidth*0.50},${vbHeight*0.70} 
          ${vbWidth*0.21},${vbHeight*0.91} ${vbWidth*0.32},${vbHeight*0.57} ${vbWidth*0.02},${vbHeight*0.35} 
          ${vbWidth*0.39},${vbHeight*0.35}
        `);
        break;
      case 'hexagon':
        shapeElement.setAttribute('points', `
          ${vbWidth*0.25},0 ${vbWidth*0.75},0 ${vbWidth*1.00},${vbHeight*0.50} 
          ${vbWidth*0.75},${vbHeight*1.00} ${vbWidth*0.25},${vbHeight*1.00} 0,${vbHeight*0.50}
        `);
        break;
      case 'pentagon':
        shapeElement.setAttribute('points', `
          ${vbWidth*0.50},0 ${vbWidth*1.00},${vbHeight*0.38} ${vbWidth*0.82},${vbHeight*1.00} 
          ${vbWidth*0.18},${vbHeight*1.00} 0,${vbHeight*0.38}
        `);
        break;
      case 'diamond':
        shapeElement.setAttribute('points', `
          ${vbWidth*0.50},0 ${vbWidth*1.00},${vbHeight*0.50} ${vbWidth*0.50},${vbHeight*1.00} 
          0,${vbHeight*0.50}
        `);
        break;
      case 'arrow':
        shapeElement.setAttribute('points', `
          0,${vbHeight*0.30} ${vbWidth*0.70},${vbHeight*0.30} ${vbWidth*0.70},0 
          ${vbWidth*1.00},${vbHeight*0.50} ${vbWidth*0.70},${vbHeight*1.00} ${vbWidth*0.70},${vbHeight*0.70} 
          0,${vbHeight*0.70}
        `);
        break;
      case 'heart':
        shapeElement.setAttribute('points', `
          ${vbWidth*0.50},${vbHeight*0.15} ${vbWidth*0.65},${vbHeight*0.05} ${vbWidth*0.80},${vbHeight*0.05} 
          ${vbWidth*0.95},${vbHeight*0.20} ${vbWidth*1.00},${vbHeight*0.40} ${vbWidth*0.95},${vbHeight*0.60} 
          ${vbWidth*0.80},${vbHeight*0.80} ${vbWidth*0.50},${vbHeight*1.00} ${vbWidth*0.20},${vbHeight*0.80} 
          ${vbWidth*0.05},${vbHeight*0.60} ${vbWidth*0.00},${vbHeight*0.40} ${vbWidth*0.05},${vbHeight*0.20} 
          ${vbWidth*0.20},${vbHeight*0.05} ${vbWidth*0.35},${vbHeight*0.05}
        `);
        break;
      default: // Default to rectangle attributes
        shapeElement.setAttribute('x', '0');
        shapeElement.setAttribute('y', '0');
        shapeElement.setAttribute('width', `${vbWidth}`);
        shapeElement.setAttribute('height', `${vbHeight}`);
    }
  }

  // --- END NEW HELPER FUNCTION ---

  // Helper function to add a chart
  const addChart = (chartType: string) => {
    // Create a chart component with the selected type
    const newComponent = createComponent('Chart', {
      chartType: chartType,
      // Explicitly set smoothCurve true for line charts to fix default rendering
      ...(chartType === 'line' || chartType === 'spline' ? { smoothCurve: true } : {}),
      existingComponents: activeComponents
    });
    
    // Add the component to the active slide
    addComponent(newComponent);
    
    // Select the newly created component
    if (onComponentSelected) {
      setTimeout(() => {
        onComponentSelected(newComponent.id);
      }, 10);
    }
  };

  return (
    <div className="bg-background/95 backdrop-blur-sm rounded-md p-1 shadow-sm border border-border flex items-center gap-1 self-start" data-tour="component-toolbar" style={{ position: 'relative', zIndex: 100001 }}>
      <TooltipProvider>
        {/* Snap Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant={isSnapEnabled ? "default" : "ghost"}
              size="icon" 
              className="h-8 w-8 rounded-md"
              onClick={() => toggleSnap()}
            >
              <Magnet size={16} className={isSnapEnabled ? "text-primary-foreground" : ""} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{isSnapEnabled ? "Snap Enabled" : "Snap Disabled"}</p>
          </TooltipContent>
        </Tooltip>
        
        {/* Theme Panel (Revised Structure) */}
        <Popover open={isThemeOpen} onOpenChange={setIsThemeOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
               <PopoverTrigger asChild> 
                 <Button 
                   variant="ghost" 
                   size="icon" 
                   className="h-8 w-8 rounded-md"
                   data-tour="theme-button"
                 >
                   <Palette size={16} />
                 </Button>
               </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Theme</p>
            </TooltipContent>
          </Tooltip>
          <PopoverContent className="w-[520px] max-w-[80vw]" align="start" data-tour="theme-popover">
            <ThemePanel onClose={() => setIsThemeOpen(false)} />
          </PopoverContent>
        </Popover>

        {/* Divider */}
        <div className="h-6 w-px bg-border/50 mx-0.5"></div>

        {/* Text Component - Now TiptapTextBlock by default */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 rounded-md"
              onClick={() => handleAddComponent('TiptapTextBlock')}
            >
              <Type size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Add Text</p>
          </TooltipContent>
        </Tooltip>
        
        {/* Lines Component */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant={isCreatingLine ? "default" : "ghost"}
              size="icon" 
              className="h-8 w-8 rounded-md"
              onClick={() => {
                // Toggle line creation mode
                if (isCreatingLine) {
                  // Cancel current line creation
                  lineCleanupRef.current?.();
                } else {
                  // Apply crosshair cursor when starting line creation
                  const slideContainer = document.querySelector('#slide-display-container');
                  if (slideContainer) {
                    slideContainer.classList.add('creating-shape-cursor');
                    (slideContainer as HTMLElement).style.setProperty('cursor', 'crosshair', 'important');
                  }
                  document.body.style.setProperty('cursor', 'crosshair', 'important');
                  // Start line creation similar to shape creation
                  startLineCreation();
                }
              }}
              data-toolbar-line-button="true"
            >
              <Slash size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Add Line</p>
          </TooltipContent>
        </Tooltip>

        {/* Shape Component with Dropdown (Revised Structure) */}
        <DropdownMenu onOpenChange={(open) => {
          // Apply crosshair cursor immediately when dropdown is opened
          const slideContainer = document.querySelector('#slide-display-container');
          if (open) {
            document.body.classList.add('creating-shape');
            
            // Add the cursor class to the slide display container
            if (slideContainer) {
              slideContainer.classList.add('creating-shape-cursor');
              (slideContainer as HTMLElement).style.setProperty('cursor', 'crosshair', 'important');
            }
            
            // Set crosshair cursor on body with !important
            document.body.style.setProperty('cursor', 'crosshair', 'important');
          } else if (!isCreatingShape) {
            // Only remove if we're not already in shape creation mode
            document.body.classList.remove('creating-shape');
            
            // Remove the cursor class from the slide display container
            if (slideContainer) {
              slideContainer.classList.remove('creating-shape-cursor');
              (slideContainer as HTMLElement).style.removeProperty('cursor');
            }
            
            // Reset cursor on body
            document.body.style.removeProperty('cursor');
          }
        }}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant={isCreatingShape ? "default" : "ghost"}
                  size="icon" 
                  className="h-8 w-8 rounded-md"
                >
                  {getShapeIcon(selectedShapeType)}
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Add Shape</p>
            </TooltipContent>
          </Tooltip>
          {/* DropdownMenuContent goes here... ensure it's inside DropdownMenu */} 
          <DropdownMenuContent align="start">
             {Object.entries(SHAPE_TYPES).map(([key, shapeConfig]) => (
               <DropdownMenuItem 
                 key={key}
                 onClick={() => {
                   // Apply crosshair cursor immediately when a shape is selected
                   document.body.classList.add('creating-shape');
                   document.body.setAttribute('data-shape-type', shapeConfig.type);
                   document.body.setAttribute('data-shape-creation', 'true');
                   
                   // Add the cursor class to the slide display container
                   const slideContainer = document.querySelector('#slide-display-container');
                   if (slideContainer) {
                     slideContainer.classList.add('creating-shape-cursor');
                     (slideContainer as HTMLElement).style.setProperty('cursor', 'crosshair', 'important');
                   }
                   
                   // Set crosshair cursor on body with !important to override any other styles
                   document.body.style.setProperty('cursor', 'crosshair', 'important');
                   
                   startShapeCreation(shapeConfig.type);
                 }}
                 className="flex items-center gap-2"
               >
                 <span className="w-5 h-5 flex items-center justify-center">
                   {getShapeIcon(shapeConfig.type)}
                 </span>
                 <span className="capitalize">{shapeConfig.label}</span>
               </DropdownMenuItem>
             ))}
           </DropdownMenuContent>
        </DropdownMenu>

        {/* Icon Component */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 rounded-md"
              onClick={() => handleAddComponent('Icon')}
            >
              <Star size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Add Icon</p>
          </TooltipContent>
        </Tooltip>

        {/* Chart Component with Dropdown (Revised Structure) */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 rounded-md"
                >
                  {getChartIcon(selectedChartType)}
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Add Chart</p>
            </TooltipContent>
          </Tooltip>
           {/* DropdownMenuContent goes here... ensure it's inside DropdownMenu */} 
          <DropdownMenuContent align="start" className="w-56 max-h-[500px] overflow-y-auto">
            {/* Basic Charts */}
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Basic</DropdownMenuLabel>
            {Object.values(CHART_TYPES)
              .filter(chart => chart.category === 'basic')
              .map((chart) => (
                <DropdownMenuItem
                  key={chart.type}
                  onClick={() => {
                    setSelectedChartType(chart.type);
                    addChart(chart.type);
                  }}
                  className="flex items-center gap-2"
                >
                  {getChartIcon(chart.type)}
                  <span className="text-xs">{chart.label}</span>
                </DropdownMenuItem>
              ))}
            
            <DropdownMenuSeparator className="my-1" />
            
            {/* Advanced Charts */}
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Advanced</DropdownMenuLabel>
            {Object.values(CHART_TYPES)
              .filter(chart => chart.category === 'advanced')
              .map((chart) => (
                <DropdownMenuItem
                  key={chart.type}
                  onClick={() => {
                    setSelectedChartType(chart.type);
                    addChart(chart.type);
                  }}
                  className="flex items-center gap-2"
                >
                  {getChartIcon(chart.type)}
                  <span className="text-xs">{chart.label}</span>
                </DropdownMenuItem>
              ))}
            
            <DropdownMenuSeparator className="my-1" />
            
            {/* Specialized Charts */}
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Specialized</DropdownMenuLabel>
            {Object.values(CHART_TYPES)
              .filter(chart => chart.category === 'specialized')
              .map((chart) => (
                <DropdownMenuItem
                  key={chart.type}
                  onClick={() => {
                    setSelectedChartType(chart.type);
                    addChart(chart.type);
                  }}
                  className="flex items-center gap-2"
                >
                  {getChartIcon(chart.type)}
                  <span className="text-xs">{chart.label}</span>
                </DropdownMenuItem>
              ))}
            
            <DropdownMenuSeparator className="my-1" />
            
            {/* Flow Charts */}
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Flow</DropdownMenuLabel>
            {Object.values(CHART_TYPES)
              .filter(chart => chart.category === 'flow')
              .map((chart) => (
                <DropdownMenuItem
                  key={chart.type}
                  onClick={() => {
                    setSelectedChartType(chart.type);
                    addChart(chart.type);
                  }}
                  className="flex items-center gap-2"
                >
                  {getChartIcon(chart.type)}
                  <span className="text-xs">{chart.label}</span>
                </DropdownMenuItem>
              ))}
            
            <DropdownMenuSeparator className="my-1" />
            
            {/* Other Charts */}
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Other</DropdownMenuLabel>
            {Object.values(CHART_TYPES)
              .filter(chart => chart.category === 'other')
              .map((chart) => (
                <DropdownMenuItem
                  key={chart.type}
                  onClick={() => {
                    setSelectedChartType(chart.type);
                    addChart(chart.type);
                  }}
                  className="flex items-center gap-2"
                >
                  {getChartIcon(chart.type)}
                  <span className="text-xs">{chart.label}</span>
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
        
        {/* Table Component with Grid Selector (Revised Structure) */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 rounded-md"
                >
                  {/* Table icon SVG or component */}
                  <svg /* ... simplified table icon ... */ className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 16 16">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M1.75 1.75h12.5v12.5H1.75zM1.75 7.75h12.5M7.75 1.75v12.5" />
                  </svg>
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Add Table</p>
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" className="p-2 w-auto"> {/* Changed width */} 
            <div className="flex flex-col gap-2">
              <div className="text-xs font-medium text-center mb-1">Select table size</div>
              <TableSizeSelector onSelectSize={createTableWithSize} />
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* --- Add Media Hub (Paste here) --- */}
        <MediaHub onSelect={handleMediaSelect} />
        {/* --- End Add Media Hub --- */}

        {/* Divider */}
        <div className="h-6 w-px bg-border/50 mx-0.5"></div>

        {/* ReactBits Dynamic Components */}
        <ReactBitsButton onComponentAdded={onComponentSelected} />

      </TooltipProvider>
    </div>
  );
};

export default ComponentToolbar;