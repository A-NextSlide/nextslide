import React, { useState, useEffect, useCallback } from 'react';
import { ComponentInstance } from '@/types/components';
import { getComponentInfo } from '@/utils/componentUtils';
import { registry } from '@/registry';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { MousePointer, Layout, Settings } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { ScrollArea } from './ui/scroll-area';
import { COLORS } from '@/utils/colors';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { useEditorStore } from '@/stores/editorStore';

// Import refactored settings editors
import LayoutSettingsEditor from './settings/LayoutSettingsEditor';
import TiptapTextBlockSettingsEditor from './settings/TiptapTextBlockSettingsEditor';
import BackgroundSettingsEditor from './settings/BackgroundSettingsEditor';
import { ChartSettingsEditor } from '@/charts/components';
import ShadowSettingsEditor from './settings/ShadowSettingsEditor';
import TableSettingsEditor from './settings/TableSettingsEditor';
import ShapeSettingsEditor from './settings/ShapeSettingsEditor';
import ImageSettingsEditor from './settings/ImageSettingsEditor';
import PropertyControlRenderer from './settings/PropertyControlRenderer';

interface MultiComponentSettingsEditorProps {
  components: ComponentInstance[];
  onUpdate?: (componentId: string, updates: Partial<ComponentInstance>) => void;
  onDelete?: () => void;
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  className?: string;
}

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

const MultiComponentSettingsEditor: React.FC<MultiComponentSettingsEditorProps> = ({
  components,
  onUpdate,
  onDelete
}) => {
  const { updateComponent } = useActiveSlide();
  const { clearSelection } = useEditorStore();
  const [activeTab, setActiveTab] = useState('component');
  
  // Check if all components are the same type
  const componentTypes = new Set(components.map(c => c.type));
  const isSameType = componentTypes.size === 1;
  const componentType = isSameType ? components[0].type : null;
  
  // Get component definition for editor schema
  const componentDefinition = componentType ? registry.getDefinition(componentType) : null;
  const editorSchema = componentDefinition?.schema?.properties || {};
  
  // Get common properties (properties that exist on all selected components)
  const getCommonProps = useCallback(() => {
    if (components.length === 0) return {};
    
    const firstProps = components[0].props;
    const commonProps: Record<string, any> = {};
    
    // Check each property of the first component
    Object.keys(firstProps).forEach(key => {
      // Check if all components have this property and the same value
      const allSameValue = components.every(comp => {
        return comp.props[key] !== undefined && 
               JSON.stringify(comp.props[key]) === JSON.stringify(firstProps[key]);
      });
      
      if (allSameValue) {
        commonProps[key] = firstProps[key];
      } else {
        // Use undefined to indicate mixed values
        commonProps[key] = undefined;
      }
    });
    
    return commonProps;
  }, [components]);
  
  const [commonProps, setCommonProps] = useState(getCommonProps());
  
  useEffect(() => {
    setCommonProps(getCommonProps());
  }, [components, getCommonProps]);
  
  // Update all selected components
  const handleUpdateAll = (propUpdates: Record<string, any>) => {
    components.forEach(component => {
      const updates = {
        props: {
          ...component.props,
          ...propUpdates
        }
      };
      
      if (onUpdate) {
        onUpdate(component.id, updates);
      } else {
        updateComponent(component.id, updates);
      }
    });
  };
  
  // Handle property change for all components
  const handlePropChange = (propName: string, value: any) => {
    handleUpdateAll({ [propName]: value });
  };
  
  // Handle delete all
  const handleDeleteAll = () => {
    if (onDelete) {
      onDelete();
    } else {
      components.forEach(comp => {
        const isBackground = comp.type === 'Background' || 
                           (comp.id && comp.id.toLowerCase().includes('background'));
        if (!isBackground) {
          useEditorStore.getState().removeDraftComponent(comp.props.slideId || '', comp.id);
        }
      });
      clearSelection();
    }
  };
  
  if (components.length === 0) {
    return (
      <div className="bg-background outline outline-1 outline-border rounded-lg shadow-sm h-full w-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
        <MousePointer className="w-10 h-10 mb-3 opacity-40" />
        <h3 className="text-sm font-medium mb-1">No Components Selected</h3>
        <p className="text-xs">
          Select components on the slide to edit their properties.
        </p>
      </div>
    );
  }
  
  return (
    <div className="bg-background outline outline-1 outline-border rounded-lg shadow-sm h-full w-full flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">
            {isSameType 
              ? `${components.length} ${componentType} Components`
              : `${components.length} Components Selected`}
          </h3>
          <button
            onClick={clearSelection}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear Selection
          </button>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="flex gap-1 p-2 border-b border-border">
        <TabButton
          active={activeTab === 'component'}
          onClick={() => setActiveTab('component')}
          icon={Settings}
          label="Properties"
        />
        <TabButton
          active={activeTab === 'layout'}
          onClick={() => setActiveTab('layout')}
          icon={Layout}
          label="Layout"
        />
      </div>
      
      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          {activeTab === 'component' && (
            <div className="space-y-4">
              {isSameType ? (
                <>
                  {/* Show component-specific editors for same-type components */}
                  {componentType === 'TiptapTextBlock' && (
                    <TiptapTextBlockSettingsEditor
                      component={{ ...components[0], props: commonProps }}
                      onUpdate={(propName, value) => handlePropChange(propName, value)}
                      saveComponentToHistory={() => {}}
                      editorSchema={editorSchema}
                    />
                  )}
                  
                  {componentType === 'Shape' && (
                    <ShapeSettingsEditor
                      component={{ ...components[0], props: commonProps }}
                      onUpdate={(updates) => {
                        const props = (updates as any)?.props;
                        if (props) {
                          handleUpdateAll(props);
                        }
                      }}
                      onPropUpdate={(propName, value, skipHistory) => {
                        handleUpdateAll({ [propName]: value });
                      }}
                      saveComponentToHistory={() => {}}
                      editorSchema={editorSchema}
                    />
                  )}
                  
                  {componentType === 'Image' && (
                    <ImageSettingsEditor
                      component={{ ...components[0], props: commonProps }}
                      onUpdate={(propName, value) => handlePropChange(propName, value)}
                      saveComponentToHistory={() => {}}
                      editorSchema={editorSchema}
                    />
                  )}
                  
                  {componentType === 'Chart' && (
                    <ChartSettingsEditor
                      component={{ ...components[0], props: commonProps }}
                      onUpdate={(propName, value) => handlePropChange(propName, value)}
                      saveComponentToHistory={() => {}}
                      editorSchema={editorSchema}
                    />
                  )}
                  
                  {componentType === 'Table' && (
                    <TableSettingsEditor
                      component={{ ...components[0], props: commonProps }}
                      onUpdate={(propName, value) => handlePropChange(propName, value)}
                      saveComponentToHistory={() => {}}
                      editorSchema={editorSchema}
                    />
                  )}
                  
                  {/* Add shadow settings for all component types */}
                  <ShadowSettingsEditor
                    component={{ ...components[0], props: commonProps }}
                    onUpdate={(propName, value) => handlePropChange(propName, value)}
                    saveComponentToHistory={() => {}}
                    editorSchema={editorSchema}
                  />
                </>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    <p className="mb-2">Different component types selected.</p>
                    <p className="text-xs">You can still edit shared properties below.</p>
                  </div>
                  {/* Shared properties for mixed-type selection */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Opacity */}
                    <div className="flex flex-col">
                      <label className="text-xs font-medium mb-1">Opacity</label>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={(commonProps as any)?.opacity ?? ''}
                        onChange={(e) => handlePropChange('opacity', parseFloat(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    {/* zIndex */}
                    <div className="flex flex-col">
                      <label className="text-xs font-medium mb-1">Layer (z-index)</label>
                      <input
                        type="number"
                        value={(commonProps as any)?.zIndex ?? ''}
                        onChange={(e) => handlePropChange('zIndex', Number(e.target.value))}
                        className="h-7 px-2 rounded border bg-background text-xs"
                        placeholder={typeof (commonProps as any)?.zIndex === 'undefined' ? '' : undefined}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {activeTab === 'layout' && (
            <LayoutSettingsEditor
              component={{ ...components[0], props: commonProps }}
              onUpdate={(propName, value) => handlePropChange(propName, value)}
              saveComponentToHistory={() => {}}
              editorSchema={editorSchema}
            />
          )}
        </div>
      </ScrollArea>
      
      {/* Footer actions */}
      <div className="p-3 border-t border-border">
        <button
          onClick={handleDeleteAll}
          className="w-full px-3 py-2 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90"
        >
          Delete All Selected
        </button>
      </div>
    </div>
  );
};

export default MultiComponentSettingsEditor;