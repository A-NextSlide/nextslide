import React, { useState } from 'react';
import { ComponentInstance } from '@/types/components';
import { Database, Palette, Settings, Square, BoxSelect } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import GradientPicker from '@/components/GradientPicker';

export interface BaseSettingsEditorProps {
  component: ComponentInstance;
  onUpdate: (propUpdates: Record<string, any>) => void;
  handlePropChange: (propName: string, value: any, skipHistory?: boolean) => void;
  saveComponentToHistory: (message?: string) => void;
}

export interface SpecificEditorProps extends BaseSettingsEditorProps {
  isOpen?: Record<string, boolean>;
  setIsOpen?: (sectionId: string, value: boolean) => void;
}

export interface BaseSettingsOptions {
  includeBorderControls?: boolean;
  includeShadowControls?: boolean;
  includeTextControls?: boolean;
  includeColorControls?: boolean;
}

export const createSettingsEditor = (
  specificEditor: React.FC<SpecificEditorProps>,
  options: BaseSettingsOptions = {}
) => {
  return function SettingsEditor({
    component,
    onUpdate,
    handlePropChange,
    saveComponentToHistory
  }: BaseSettingsEditorProps) {
    const [sectionState, setSectionState] = useState<Record<string, boolean>>({
      border: false,
      shadow: false,
      text: false,
      color: false
    });

    const toggleSection = (section: string, value: boolean) => {
      setSectionState(prev => ({ ...prev, [section]: value }));
    };

    // Border Controls
    const renderBorderControls = () => {
      if (!options.includeBorderControls) return null;
      
      return (
        <div className="space-y-2 mt-2">
          <Collapsible 
            defaultOpen={sectionState.border} 
            open={sectionState.border}
            onOpenChange={(value) => toggleSection('border', value)}
          >
            <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-2 bg-secondary/50 rounded-md hover:bg-secondary/70 transition-colors">
              <div className="flex items-center gap-2">
                <Square size={16} />
                <span className="text-sm font-medium">Border</span>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-1 py-2 space-y-4">
              {/* Border Radius */}
              <div className="space-y-1">
                <Label className="text-xs">Border Radius</Label>
                <div className="flex items-center">
                  <Slider 
                    min={0} 
                    max={20} 
                    step={1} 
                    value={[component.props.borderRadius || 0]} 
                    onValueChange={values => handlePropChange('borderRadius', values[0])} 
                    className="flex-grow" 
                  />
                  <span className="text-xs ml-2 w-8 text-right">{component.props.borderRadius || 0}px</span>
                </div>
              </div>
              
              {/* Border Width */}
              <div className="space-y-1">
                <Label className="text-xs">Border Width</Label>
                <div className="flex items-center">
                  <Slider 
                    min={0} 
                    max={10} 
                    step={1} 
                    value={[component.props.borderWidth || 0]} 
                    onValueChange={values => handlePropChange('borderWidth', values[0])} 
                    className="flex-grow" 
                  />
                  <span className="text-xs ml-2 w-8 text-right">{component.props.borderWidth || 0}px</span>
                </div>
              </div>
              
              {/* Border Color */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-xs">Border Color</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <div 
                        className="w-6 h-6 rounded-md border cursor-pointer" 
                        style={{ 
                          backgroundImage: `
                            linear-gradient(45deg, #ccc 25%, transparent 25%),
                            linear-gradient(-45deg, #ccc 25%, transparent 25%),
                            linear-gradient(45deg, transparent 75%, #ccc 75%),
                            linear-gradient(-45deg, transparent 75%, #ccc 75%)
                          `,
                          backgroundSize: "8px 8px",
                          backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
                          backgroundColor: "#fff"
                        }}
                        onClick={() => saveComponentToHistory("Before changing border color")}
                      >
                        <div 
                          className="w-full h-full rounded-[0.3rem]" 
                          style={{
                            backgroundColor: component.props.borderColor || "#000000"
                          }}
                        />
                      </div>
                    </PopoverTrigger>
                    <PopoverContent className="p-0" onClick={(e) => e.stopPropagation()}>
                      <div onClick={(e) => e.stopPropagation()}>
                        <GradientPicker 
                          value={component.props.borderColor || "#000000"} 
                          onChange={color => handlePropChange('borderColor', color)}
                          onChangeComplete={() => saveComponentToHistory("After changing border color")}
                          initialTab="solid"
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      );
    };

    // Shadow Controls
    const renderShadowControls = () => {
      if (!options.includeShadowControls) return null;
      
      const shadowEnabled = component.props.shadow || false;
      
      return (
        <div className="space-y-2 mt-2">
          <Collapsible 
            defaultOpen={sectionState.shadow} 
            open={sectionState.shadow}
            onOpenChange={(value) => toggleSection('shadow', value)}
          >
            <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-2 bg-secondary/50 rounded-md hover:bg-secondary/70 transition-colors">
              <div className="flex items-center gap-2">
                <BoxSelect size={16} />
                <span className="text-sm font-medium">Shadow</span>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-1 py-2 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Enable Shadow</Label>
                <Switch 
                  checked={shadowEnabled} 
                  onCheckedChange={checked => handlePropChange('shadow', checked)} 
                  className="scale-75 data-[state=checked]:bg-primary" 
                />
              </div>
              
              {shadowEnabled && (
                <>
                  {/* Shadow color control */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs">Shadow Color</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <div 
                            className="w-6 h-6 rounded-md border cursor-pointer" 
                            style={{
                              backgroundColor: component.props.shadowColor || 'rgba(0,0,0,0.3)'
                            }}
                          />
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-3">
                          <GradientPicker 
                            value={component.props.shadowColor || 'rgba(0,0,0,0.3)'} 
                            onChange={color => handlePropChange('shadowColor', color)}
                            onChangeComplete={() => saveComponentToHistory("After changing shadow color")}
                            initialTab="solid"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  {/* Shadow blur control */}
                  <div className="space-y-1">
                    <Label className="text-xs">Shadow Blur</Label>
                    <div className="flex items-center">
                      <Slider 
                        min={0} 
                        max={40} 
                        step={1} 
                        value={[component.props.shadowBlur || 10]} 
                        onValueChange={values => handlePropChange('shadowBlur', values[0])} 
                        className="flex-grow" 
                      />
                      <span className="text-xs ml-2 w-8 text-right">{component.props.shadowBlur || 10}px</span>
                    </div>
                  </div>
                </>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      );
    };

    // Specific editor with common sections
    return (
      <div className="space-y-3">
        {specificEditor({
          component,
          onUpdate,
          handlePropChange,
          saveComponentToHistory,
          isOpen: sectionState,
          setIsOpen: toggleSection
        })}
        
        {renderBorderControls()}
        {renderShadowControls()}
      </div>
    );
  };
};

export default createSettingsEditor; 