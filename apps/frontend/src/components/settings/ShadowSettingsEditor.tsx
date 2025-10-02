import React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BoxSelect } from 'lucide-react';
import GradientPicker from '@/components/GradientPicker';
import { ComponentInstance } from '@/types/components';
import { ControlMetadata } from '@/registry/schemas';

interface ShadowSettingsEditorProps {
  component: ComponentInstance;
  onUpdate: (propName: string, value: any, skipHistory?: boolean) => void;
  saveComponentToHistory: (message?: string) => void;
  editorSchema: Record<string, ControlMetadata>;
}

const ShadowSettingsEditor: React.FC<ShadowSettingsEditorProps> = ({
  component,
  onUpdate,
  saveComponentToHistory,
  editorSchema
}) => {
  // Helper for creating transparency background pattern
  const getTransparencyPattern = () => `
    linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%)
  `;

  // Check if component has shadow properties
  const hasShadowProperties = (): boolean => {
    return ['shadow', 'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY', 'shadowSpread']
      .some(prop => prop in editorSchema);
  };
  
  if (!hasShadowProperties()) return null;
  
  const shadowEnabled = component.props.shadow || false;
  
  return (
    <div className="space-y-1 mt-2">
      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-2 bg-secondary/50 rounded-md hover:bg-secondary/70 transition-colors">
          <div className="flex items-center gap-1">
            <BoxSelect size={14} />
            <span className="text-xs font-medium">Shadow</span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="px-1 py-1 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Enable Shadow</Label>
            <Switch 
              checked={shadowEnabled} 
              onCheckedChange={checked => onUpdate('shadow', checked)} 
              className="scale-75 data-[state=checked]:bg-primary" 
            />
          </div>
          
          {shadowEnabled && (
            <>
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <Label className="text-xs">Shadow Color</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <div 
                        className="w-5 h-5 rounded-md border cursor-pointer" 
                        style={{
                          backgroundImage: getTransparencyPattern(),
                          backgroundSize: "8px 8px",
                          backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
                          backgroundColor: "#fff"
                        }}
                      >
                        <div 
                          className="w-full h-full rounded-[0.3rem]" 
                          style={{
                            backgroundColor: component.props.shadowColor || 'rgba(0,0,0,0.3)'
                          }} 
                        />
                      </div>
                    </PopoverTrigger>
                    <PopoverContent className="p-0" onClick={(e) => e.stopPropagation()}>
                      <div onClick={(e) => e.stopPropagation()}>
                        <GradientPicker 
                          value={component.props.shadowColor || 'rgba(0,0,0,0.3)'} 
                          onChange={color => onUpdate('shadowColor', color, true)}
                          onChangeComplete={() => saveComponentToHistory("Saved shadow color")} 
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Shadow properties */}
              {['shadowOffsetX', 'shadowOffsetY', 'shadowBlur', 'shadowSpread'].map(prop => {
                const label = prop === 'shadowOffsetX' ? 'X Offset' :
                             prop === 'shadowOffsetY' ? 'Y Offset' :
                             prop === 'shadowBlur' ? 'Blur' : 'Spread';
                
                const min = prop === 'shadowSpread' ? -10 : 
                           prop.includes('Offset') ? -20 : 0;
                
                const max = prop === 'shadowBlur' ? 40 : 
                           prop === 'shadowSpread' ? 40 : 20;
                
                const defaultValue = prop === 'shadowOffsetY' ? 4 : 
                                     prop === 'shadowBlur' ? 10 : 0;
                
                return (
                  <div key={prop} className="space-y-1">
                    <Label className="text-xs">Shadow {label}</Label>
                    <div className="flex items-center">
                      <Slider 
                        min={min} 
                        max={max} 
                        step={1} 
                        value={[component.props[prop] ?? defaultValue]} 
                        onValueChange={values => onUpdate(prop, values[0], true)} 
                        onPointerDown={() => saveComponentToHistory(`Initial shadow ${label.toLowerCase()}`)}
                        className="flex-grow" 
                      />
                      <span className="text-xs ml-2 w-6 text-right">
                        {component.props[prop] ?? defaultValue}px
                      </span>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default ShadowSettingsEditor;