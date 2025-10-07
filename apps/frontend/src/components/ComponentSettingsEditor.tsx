import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { ActiveSlideContext } from '@/context/ActiveSlideContext';
import { ComponentInstance } from '@/types/components';
import { getComponentInfo } from '@/utils/componentUtils';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { MousePointer, TableProperties, Layout, Trash2, Plus } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { IconButton } from './ui/IconButton';
import { ScrollArea } from './ui/scroll-area';
import { useHistoryStore } from '@/stores/historyStore';
import { useEditorStore } from '@/stores/editorStore';
import { motion } from 'framer-motion';
import { COLORS } from '@/utils/colors';

// Import from TypeBox registry
import { registry } from '@/registry';
import { TObject, TProperties, TSchema } from '@sinclair/typebox';
import { 
  getControlMetadata, 
  hasUIControl,
  LAYOUT_PROPERTIES,
  BACKGROUND_PROPERTIES,
  SHADOW_PROPERTIES,
  BORDER_PROPERTIES,
  TEXT_PROPERTIES,
  CHART_PROPERTIES,
  TABLE_PROPERTIES,
  isCategorizedProperty
} from '@/registry';

// Import refactored settings editors
import LayoutSettingsEditor from './settings/LayoutSettingsEditor';
import TiptapTextBlockSettingsEditor from './settings/TiptapTextBlockSettingsEditor';
import BackgroundSettingsEditor from './settings/BackgroundSettingsEditor';
// Use the chart-specific settings editor for charts
import { ChartSettingsEditor } from '@/charts/components';
import ShadowSettingsEditor from './settings/ShadowSettingsEditor';
import TableSettingsEditor from './settings/TableSettingsEditor';
import LinesSettingsEditor from './settings/LinesSettingsEditor';
import PropertyControlRenderer from './settings/PropertyControlRenderer';
import ShapeSettingsEditor from './settings/ShapeSettingsEditor';
import CustomComponentSettingsEditor from './settings/CustomComponentSettingsEditor';
import ImageSettingsEditor from './settings/ImageSettingsEditor';
import IconSettingsEditor from './settings/IconSettingsEditor';
import { ReactBitsSettingsEditor } from './reactbits/ReactBitsSettingsEditor';

// Types for component properties and the editor itself
interface ComponentSettingsEditorProps {
  component?: ComponentInstance | null;
  onUpdate?: (updates: Partial<ComponentInstance>) => void;
  onDelete?: () => void;
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  className?: string;
}

// Tab Button component
const TabButton: React.FC<TabButtonProps> = ({
  active,
  onClick,
  icon: Icon,
  label,
  className
}) => (
  <button 
    onClick={onClick}
    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors flex-1 justify-center text-xs ${
      active ? 'hover:bg-pink-500/10' : 'hover:bg-secondary/50 text-muted-foreground'
    } ${className || ''}`}
    style={{
      color: active ? COLORS.SUGGESTION_PINK : undefined
    }}
    title={label}
  >
    <Icon size={14} />
    <span>{label}</span>
  </button>
);

// Component Settings Editor
const ComponentSettingsEditor: React.FC<ComponentSettingsEditorProps> = ({
  component,
  onUpdate,
  onDelete
}) => {
  // Context and state
  const activeSlideContext = useContext(ActiveSlideContext);
  const contextUpdateComponent = activeSlideContext?.updateComponent;
  const contextRemoveComponent = activeSlideContext?.removeComponent;
  const activeSlideId = activeSlideContext?.slideId;
  
  const [activeTab, setActiveTab] = useState('component');
  const [componentInfo, setComponentInfo] = useState<any>(null);
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Load component info when component changes
  useEffect(() => {
    if (!component) {
      // This is a valid state when no component is selected, not an error
      return;
    }

    try {
      // Get component info using the getComponentInfo utility which now uses TypeBox registry
      const info = getComponentInfo(component);
      setComponentInfo(info);
    } catch (error) {
      console.error("Error loading component info:", error);
      setComponentInfo(null);
    }
  }, [component, component?.props?.color, component?.props?.gradient, component?.props?.render, component?.props?.props]);

  // Handle scroll event to control fade visibility
  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      
      // Show top fade when scrolled down
      setShowTopFade(scrollTop > 10);
      
      // Show bottom fade when there's more content below
      setShowBottomFade(scrollHeight - scrollTop - clientHeight > 10);
    }
  }, []); // No dependencies needed since scrollRef is a ref

  // Prevent scroll chaining/bounce to outer containers when at edges
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    const deltaY = e.deltaY;
    const atTop = el.scrollTop <= 0 && deltaY < 0;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight && deltaY > 0;
    if (atTop || atBottom) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);
  
  // Initialize scroll indicators when content is ready
  useEffect(() => {
    const currentRef = scrollRef.current;
    if (!currentRef) return;
    
    // Initialize scroll indicators
    const { scrollHeight, clientHeight } = currentRef;
    setShowBottomFade(scrollHeight > clientHeight);
    
    // Call once to initialize positions
    handleScroll();
  }, [handleScroll]);

  // Show empty state when no component is selected
  if (!component || !componentInfo) {
    return (
      <div className="bg-background outline outline-1 outline-border rounded-lg shadow-sm h-full w-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
        <MousePointer className="w-10 h-10 mb-3 opacity-40" />
        <h3 className="text-sm font-medium mb-1">No Component Selected</h3>
        <p className="text-xs">
          Select a component on the slide to edit its properties.
        </p>
      </div>
    );
  }

  const { definition } = componentInfo;

  // Helper function to update component properties
  const updateComponentProps = (propUpdates: Record<string, any>) => {
    if (!component) return;
    
    const updates = {
      props: {
        ...component.props,
        ...propUpdates
      }
    };
    
    if (onUpdate) {
      onUpdate(updates);
    } else {
      contextUpdateComponent?.(component.id, updates);
    }
  };

  // No-op function for backwards compatibility with components expecting saveComponentToHistory
  const saveComponentToHistory = () => {
    // History is now automatically handled by updateComponent
  };

  // Generic prop change handler
  const handlePropChange = (propName: string, value: any, skipHistory: boolean = false) => {
    if (!component) return;
    
    // IMPORTANT: Only send the changed prop to avoid overwriting
    // concurrent updates that might be happening in the same frame.
    // This prevents cases where a subsequent update (e.g., clearing
    // gradient after setting fill) reverts the earlier change due to
    // using a stale snapshot of component.props.
    const propUpdate: Record<string, any> = { [propName]: value };

    if (onUpdate) {
      // Pass only the delta so the parent can merge safely
      onUpdate({ props: propUpdate });
    } else {
      try {
        // Send only the delta to the store; it merges with current props
        contextUpdateComponent?.(component.id, { props: propUpdate }, skipHistory);
      } catch (error) {
        console.error("Error updating component:", error);
      }
    }
  };

  // Adapter function for specialized editor components expecting different function signatures
  const adaptPropChangeToRecord = (propName: string, value: any) => {
    updateComponentProps({ [propName]: value });
  };

  // Determine if a property should be shown based on conditional display rules
  const shouldShowProperty = (propName: string, schema: TSchema, currentProps: Record<string, any>): boolean => {
    const metadata = getControlMetadata(schema);
    if (!metadata || !metadata.controlProps || !metadata.controlProps.showWhen) {
      return true; // No conditional display rules, always show
    }
    
    const showWhen = metadata.controlProps.showWhen as Record<string, string | string[]>;
    
    // Check each condition
    for (const [conditionProp, conditionValues] of Object.entries(showWhen)) {
      const currentValue = currentProps[conditionProp];
      
      if (Array.isArray(conditionValues)) {
        // If the condition is an array, check if current value is in the array
        if (!conditionValues.includes(currentValue)) {
          return false;
        }
      } else {
        // If the condition is a single value, check for direct equality
        if (currentValue !== conditionValues) {
          return false; 
        }
      }
    }
    
    return true;
  };

  // Render regular component properties (those not handled by specialized editors)
  const renderComponentProps = () => {
    if (!component || !definition) return null;
    
    const schemaProperties = definition.schema?.properties || {};
    const componentProps = component.props || {};
    const componentType = definition.type || '';
    
    // Get sorted list of property names, filtering out those handled by specialized editors
    const propertyNames = Object.keys(schemaProperties)
      .filter(propName => !isCategorizedProperty(propName, componentType))
      .sort((a, b) => {
        // Get schemas for both properties
        const schemaA = schemaProperties[a] as TSchema;
        const schemaB = schemaProperties[b] as TSchema;
        
        // Get control metadata
        const metaA = getControlMetadata(schemaA);
        const metaB = getControlMetadata(schemaB);
        
        // Sort by control type first
        const orderA = getSortOrder(metaA?.control);
        const orderB = getSortOrder(metaB?.control);
        
        // If different control types, sort by type
        if (orderA !== orderB) return orderA - orderB;
        
        // Then sort alphabetically by label
        const labelA = (schemaA?.title as string) || a;
        const labelB = (schemaB?.title as string) || b;
        return labelA.localeCompare(labelB);
      });
    
    // Helper function to get sort order for control types
    function getSortOrder(controlType?: string): number {
      const order: Record<string, number> = {
        'dropdown': 1,
        'checkbox': 2,
        'colorpicker': 3,
        'slider': 4,
        'input': 5,
        'textarea': 6
      };
      return controlType ? (order[controlType] || 99) : 99;
    }
    
    const handlePropUpdates = (propUpdates: Record<string, any>) => {
      updateComponentProps(propUpdates);
    };

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4">
          {propertyNames
            .filter(propName => {
              const schema = schemaProperties[propName] as TSchema;
              const metadata = getControlMetadata(schema);
              if (metadata?.control === 'custom') {
                return false; // Don't render custom controls here
              }
              return shouldShowProperty(propName, schema, componentProps);
            })
            .map(propName => {
              const schema = schemaProperties[propName] as TSchema;
              const currentValue = componentProps[propName];
              
              // Handle special case for object types that need complex editors
              if (schema.type === 'object' && !hasUIControl(schema)) {
                // Default handling for object types without specific UI controls
                return (
                  <div key={propName} className="flex flex-col">
                    <label className="text-xs font-medium mb-1">
                      {schema.title || propName}
                    </label>
                    <div className="text-xs text-muted-foreground">
                      Object Editor Not Available
                    </div>
                  </div>
                );
              }
              
              // Normal property control rendering
              return (
                <div key={propName} className="flex flex-col">
                  <div className="flex flex-row justify-between items-center mb-1">
                    <label className="text-xs font-medium">
                      {schema.title || propName}
                    </label>
                  </div>
                  <PropertyControlRenderer
                    propName={propName}
                    schema={schema}
                    currentValue={currentValue}
                    onUpdate={handlePropChange}
                    saveComponentToHistory={saveComponentToHistory}
                    componentProps={componentProps}
                  />
                  {schema.description && (
                    <p className="text-xs text-muted-foreground mt-1">
                    </p>
                  )}
                </div>
              );
            })
          }
        </div>
      </div>
    );
  };

  // Render specialized editors for layout, background, text, etc.
  const renderLayoutSettings = () => {
    if (!component) return null;
    return (
      <LayoutSettingsEditor
        component={component}
        onUpdate={adaptPropChangeToRecord}
        saveComponentToHistory={saveComponentToHistory}
        isBackground={component.type === 'Background'}
      />
    );
  };

  // Handler for deleting the component
  const handleDeleteComponent = () => {
    if (!component) return;
    
    if (onDelete) {
      onDelete();
    } else {
      contextRemoveComponent?.(component.id);
    }
  };

  // --- Render specialized editors based on component type ---
  const renderSpecializedEditor = () => {
    const componentType = component?.type;
    const isBackground = componentType === 'Background' || component?.id?.toLowerCase().includes('background');

    switch (componentType) {
      case 'Text':
        return (
          <div className="space-y-4">
            {/* Return your text-specific settings here if needed */}
          </div>
        );
      case 'Background':
        if (component) {
          return (
            <BackgroundSettingsEditor
              component={component}
              onUpdate={updateComponentProps}
              saveComponentToHistory={saveComponentToHistory}
            />
          );
        }
        return null;
      case 'TiptapTextBlock':
        if (component) {
          return (
            <TiptapTextBlockSettingsEditor
              component={component}
              onUpdate={handlePropChange}
              saveToHistory={saveComponentToHistory}
            />
          );
        }
        return null;
      case 'Shape':
        if (component) {
          return (
            <ShapeSettingsEditor
              component={component}
              onUpdate={(updates) => {
                if (updates.props) {
                  updateComponentProps(updates.props);
                }
              }}
              onPropUpdate={(propName, value, skipHistory) => {
                // Real-time per-prop update path used by color/slider controls
                handlePropChange(propName, value, !!skipHistory);
              }}
              saveToHistory={saveComponentToHistory}
            />
          );
        }
        return null;
      case 'Image':
        if (component) {
          return (
            <ImageSettingsEditor
              component={component}
              onUpdate={updateComponentProps}
              handlePropChange={handlePropChange}
              saveComponentToHistory={saveComponentToHistory}
            />
          );
        }
        return null;
      case 'Icon':
        if (component) {
          return (
            <IconSettingsEditor
              component={component}
              onUpdate={updateComponentProps}
              handlePropChange={handlePropChange}
              saveComponentToHistory={saveComponentToHistory}
            />
          );
        }
        return null;
      case 'Chart':
        if (component) {
          return (
            <ChartSettingsEditor
              component={component}
              onUpdate={updateComponentProps}
              handlePropChange={handlePropChange}
              saveComponentToHistory={saveComponentToHistory}
            />
          );
        }
        return null;
      case 'Lines':
      case 'Line':
      case 'line':
        if (component) {
          return (
            <LinesSettingsEditor
              component={component}
              onUpdate={updateComponentProps}
              saveComponentToHistory={saveComponentToHistory}
            />
          );
        }
        return null;
      case 'Table':
        if (component) {
          return (
            <TableSettingsEditor
              component={component}
              onUpdate={updateComponentProps}
              handlePropChange={handlePropChange}
              saveComponentToHistory={saveComponentToHistory}
            />
          );
        }
        return null;
      case 'CustomComponent':
        if (component) {
          return (
            <CustomComponentSettingsEditor
              key={component.id} // Use stable key to prevent re-mounting
              component={component}
              onUpdate={updateComponentProps}
              handlePropChange={handlePropChange}
              saveComponentToHistory={saveComponentToHistory}
            />
          );
        }
        return null;
      case 'ReactBits':
        if (component) {
          return (
            <ReactBitsSettingsEditor
              component={component as any}
              onChange={updateComponentProps}
            />
          );
        }
        return null;
      default:
        if (isBackground && component) {
          return (
            <BackgroundSettingsEditor
              component={component}
              onUpdate={updateComponentProps}
              saveComponentToHistory={saveComponentToHistory}
            />
          );
        }
        // For other component types, show generic property controls
        return null;
    }
  };
  
  // Get the specialized editor once
  const specializedEditor = renderSpecializedEditor();
  
  // Complete settings editor UI with tabs
  return (
    <div className="bg-background h-full w-full flex flex-col overflow-hidden" style={{ position: 'relative', zIndex: 60, pointerEvents: 'auto' }} data-tour="component-settings">
      {/* Tab Navigation with component title and delete button */}
      <div className="flex items-center justify-between p-2 sticky top-0 z-10 bg-background">
        <div className="flex gap-1">
          <TabButton
            active={activeTab === 'component'}
            onClick={() => setActiveTab('component')}
            icon={TableProperties}
            label="Properties"
          />
          <TabButton
            active={activeTab === 'layout'}
            onClick={() => setActiveTab('layout')}
            icon={Layout}
            label="Layout"
          />
        </div>
        
        <div className="flex items-center gap-2">
          {component && !(component.type === 'Background' || (component.id && component.id.toLowerCase().includes('background'))) && (
            <button
              className="rounded-md h-8 w-8 p-0 inline-flex items-center justify-center hover:bg-pink-500/10 border-0"
              onClick={handleDeleteComponent}
              title="Delete component"
              style={{ color: COLORS.SUGGESTION_PINK }}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
      
      {/* Tab Content */}
      <div className="flex-grow overflow-hidden relative">
        {/* Top fade effect */}
        {showTopFade && (
          <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none" />
        )}
        
        <div 
          ref={scrollRef}
          className="h-full overflow-auto p-3"
          onScroll={handleScroll}
          onWheel={handleWheel}
          style={{ ['overflowAnchor' as any]: 'auto', overscrollBehavior: 'none', overscrollBehaviorY: 'none', overscrollBehaviorX: 'none', scrollbarGutter: 'stable both-edges' }}
        >
          {activeTab === 'component' && (
            <div className="space-y-6">
              {/* Specialized Editors */}
              {specializedEditor}
              
              {/* Only show the rest if no specialized editor */}
              {!specializedEditor && (
                <>
                  {/* Shadow Settings - Only show if component has shadow properties */}
                  {component.props?.shadow !== undefined && (
                    <div className="space-y-4">
                      <h4 className="text-sm font-medium">Shadow</h4>
                      <ShadowSettingsEditor
                        component={component}
                        onUpdate={adaptPropChangeToRecord}
                        saveComponentToHistory={saveComponentToHistory}
                        editorSchema={definition.schema?.properties || {}}
                      />
                    </div>
                  )}
                  
                  {/* Background Settings - Only show for components with background properties */}
                  {(component.props?.backgroundColor !== undefined || 
                    component.props?.backgroundImage !== undefined || 
                    component.props?.gradient !== undefined ||
                    component.props?.color !== undefined) && (
                    <div className="space-y-4">
                      <BackgroundSettingsEditor
                        component={component}
                        onUpdate={updateComponentProps}
                        saveComponentToHistory={saveComponentToHistory}
                      />
                    </div>
                  )}
                  
                  {/* Other Component Properties */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Properties</h4>
                    {renderComponentProps()}
                  </div>
                </>
              )}
            </div>
          )}
          
          {activeTab === 'layout' && (
            <div className="space-y-4">
              {renderLayoutSettings()}
            </div>
          )}
        </div>
        
        {/* Bottom fade effect */}
        {showBottomFade && (
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent z-10 pointer-events-none" />
        )}
      </div>
    </div>
  );
};

export default ComponentSettingsEditor;