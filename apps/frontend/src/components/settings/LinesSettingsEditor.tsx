import React from 'react';
import { ComponentInstance } from '@/types/components';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import GradientPicker from '../GradientPicker';
import { LINE_CONNECTION_TYPES, LINE_END_SHAPES } from '@/registry/components/lines';

interface LinesSettingsEditorProps {
  component: ComponentInstance;
  onUpdate: (propUpdates: Record<string, any>) => void;
  saveComponentToHistory: (message?: string) => void;
}

// Preset dash patterns with user-friendly names
const DASH_PATTERNS = {
  solid: { value: 'none', label: 'Solid' },
  dashed: { value: '8,4', label: 'Dashed' },
  dotted: { value: '2,2', label: 'Dotted' },
  dashDot: { value: '8,4,2,4', label: 'Dash-Dot' },
  longDash: { value: '16,8', label: 'Long Dash' }
};

const LinesSettingsEditor: React.FC<LinesSettingsEditorProps> = ({
  component,
  onUpdate,
  saveComponentToHistory
}) => {
  const props = component.props;
  
  const handlePropChange = (propName: string | Record<string, any>, value?: any) => {
    if (typeof propName === 'string') {
      onUpdate({ [propName]: value });
    } else {
      onUpdate(propName);
    }
  };

  return (
    <div className="space-y-4">
      {/* Connection Type */}
      <div className="space-y-1">
        <Label className="text-xs">Connection Type</Label>
        <Select
          value={props.connectionType || 'straight'}
          onValueChange={value => {
            saveComponentToHistory('Changed line connection type');
            handlePropChange('connectionType', value);
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(LINE_CONNECTION_TYPES).map(([key, config]) => (
              <SelectItem key={key} value={config.type}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* End Shapes */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Start Shape</Label>
          <Select
            value={props.startShape || 'none'}
            onValueChange={value => {
              saveComponentToHistory('Changed line start shape');
              handlePropChange('startShape', value);
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LINE_END_SHAPES).map(([key, config]) => (
                <SelectItem key={key} value={config.type}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-1">
          <Label className="text-xs">End Shape</Label>
          <Select
            value={props.endShape || 'arrow'}
            onValueChange={value => {
              saveComponentToHistory('Changed line end shape');
              handlePropChange('endShape', value);
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LINE_END_SHAPES).map(([key, config]) => (
                <SelectItem key={key} value={config.type}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Line Styling */}
      <div className="space-y-4">
        {/* Line Color */}
        <div className="space-y-1">
          <Label className="text-xs">Line Color</Label>
          <Popover>
            <PopoverTrigger asChild>
              <div 
                className="w-full h-8 rounded-md border cursor-pointer hover:border-primary flex items-center px-2" 
                style={{ 
                  background: (() => {
                    const strokeValue = props.stroke || '#000000';
                    let gradientData = null;
                    
                    // Handle gradient data whether it's an object or JSON string
                    if (typeof strokeValue === 'object') {
                      gradientData = strokeValue;
                    } else if (typeof strokeValue === 'string' && strokeValue.includes('gradient')) {
                      try {
                        gradientData = JSON.parse(strokeValue);
                      } catch (e) {
                        return strokeValue;
                      }
                    }
                    
                    if (gradientData) {
                      const { type, stops, angle = 0 } = gradientData;
                      if (type === 'linear') {
                        const gradientStops = stops.map((stop: any) => `${stop.color} ${stop.position}%`).join(', ');
                        return `linear-gradient(${angle}deg, ${gradientStops})`;
                      } else if (type === 'radial') {
                        const gradientStops = stops.map((stop: any) => `${stop.color} ${stop.position}%`).join(', ');
                        return `radial-gradient(circle, ${gradientStops})`;
                      }
                    }
                    
                    return strokeValue;
                  })()
                }}
                onClick={() => saveComponentToHistory("Saved initial line color")}
              >
                <span className="text-xs text-white bg-black/50 px-1 rounded">
                  {(() => {
                    const strokeValue = props.stroke || '#000000';
                    if (typeof strokeValue === 'object') {
                      return 'Gradient';
                    }
                    if (typeof strokeValue === 'string' && strokeValue.includes('gradient')) {
                      return 'Gradient';
                    }
                    return strokeValue;
                  })()}
                </span>
              </div>
            </PopoverTrigger>
            <PopoverContent className="p-0">
              <GradientPicker
                value={props.stroke || '#000000'} 
                onChange={color => {
                  handlePropChange('stroke', color);
                  saveComponentToHistory("Updated line color");
                }}
                onChangeComplete={() => saveComponentToHistory("Saved final line color")}
                initialTab="solid"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Line Width */}
        <div className="space-y-1">
          <Label className="text-xs">Line Width</Label>
          <div className="flex items-center">
            <Slider 
              min={1} 
              max={20} 
              step={1} 
              value={[props.strokeWidth || 4]} 
              onValueChange={values => handlePropChange('strokeWidth', values[0])}
              onPointerDown={() => saveComponentToHistory("Saved initial line width")}
              className="flex-grow" 
            />
            <span className="text-xs ml-2 w-8 text-right">
              {props.strokeWidth || 4}px
            </span>
          </div>
        </div>

        {/* Line Style (Dash Pattern) */}
        <div className="space-y-1">
          <Label className="text-xs">Line Style</Label>
          <Select
            value={props.strokeDasharray || 'none'}
            onValueChange={value => {
              saveComponentToHistory('Changed line style');
              handlePropChange('strokeDasharray', value);
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select line style" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DASH_PATTERNS).map(([key, pattern]) => (
                <SelectItem key={key} value={pattern.value}>
                  <div className="flex items-center gap-2">
                    <svg width="40" height="2" className="overflow-visible">
                      <line 
                        x1="0" 
                        y1="1" 
                        x2="40" 
                        y2="1" 
                        stroke="currentColor" 
                        strokeWidth="2"
                        strokeDasharray={pattern.value === 'none' ? undefined : pattern.value}
                      />
                    </svg>
                    <span>{pattern.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>


      </div>
    </div>
  );
};

export default LinesSettingsEditor; 