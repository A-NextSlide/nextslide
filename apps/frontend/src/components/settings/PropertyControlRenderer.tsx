import React, { useState, useEffect } from 'react';
import { TSchema } from '@sinclair/typebox';
import { ControlMetadata, getControlMetadata } from '@/registry/schemas';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import GradientPicker from '@/components/GradientPicker';
import GroupedDropdown from './GroupedDropdown';
import EditableDropdown from './EditableDropdown';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getAvailableFontWeights } from '@/utils/fontCapabilities';
import { formatJavaScript } from '@/utils/codeFormatting';
import { FontLoadingService } from '@/services/FontLoadingService';

type ControlTypes = 'input' | 'textarea' | 'slider' | 'checkbox' | 'dropdown' | 'grouped-dropdown' | 'editable-dropdown' | 'colorpicker' | 'gradientpicker' | 'code-editor' | 'custom';

interface PropertyControlRendererProps {
  propName: string;
  schema: TSchema;
  currentValue: any;
  onUpdate: (propName: string, value: any, skipHistory?: boolean) => void;
  saveComponentToHistory: (message?: string) => void;
  icon?: React.ReactNode;
  componentProps?: Record<string, any>; // Add this to access other component properties
}

const PropertyControlRenderer: React.FC<PropertyControlRendererProps> = ({
  propName,
  schema,
  currentValue,
  onUpdate,
  saveComponentToHistory,
  icon,
  componentProps
}) => {
  const [isSliding, setIsSliding] = useState(false);
  const [isPickingColor, setIsPickingColor] = useState(false);
  
  // Get control metadata from schema
  const metadata = getControlMetadata(schema) || {
    control: 'input',
    controlProps: {}
  };
  
  const controlType = metadata.control as ControlTypes;
  const controlProps = metadata.controlProps || {};
  const label = schema.title as string || propName;

  // Helper for creating transparency background pattern
  const getTransparencyPattern = () => `
    linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%)
  `;

  // Check if value is a gradient
  const isGradient = (val: any): boolean => 
    typeof val === 'string' && val.includes('gradient');

  // Determine the control type from the schema
  const schemaType = schema.type as string;

  // Dynamically augment font groups/options to include Designer fonts from backend
  const [dynamicFontGroups, setDynamicFontGroups] = useState<Record<string, string[]> | null>(null);
  const [dynamicFontOptions, setDynamicFontOptions] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (propName === 'fontFamily') {
      (async () => {
        try {
          await FontLoadingService.syncDesignerFonts();
        } catch {}
        if (!cancelled) {
          try {
            setDynamicFontGroups(FontLoadingService.getDedupedFontGroups());
            setDynamicFontOptions(FontLoadingService.getAllFontNames());
          } catch {}
        }
      })();
    }
    return () => { cancelled = true; };
  }, [propName]);

  switch (controlType) {
    case 'input':
      return (
        <Input 
          value={currentValue ?? ''} 
          onChange={e => onUpdate(propName, e.target.value, true)} 
          onBlur={() => saveComponentToHistory(`Updated ${propName}`)}
          className="w-full h-8 text-xs" 
        />
      );

    case 'textarea':
      return (
        <Textarea 
          value={currentValue ?? ''} 
          onChange={e => onUpdate(propName, e.target.value, true)} 
          onBlur={() => saveComponentToHistory(`Updated ${propName}`)}
          className="w-full" 
          rows={controlProps.rows || 3}
        />
      );

    case 'slider': {
      const handleSlideStart = () => {
        setIsSliding(true);
        saveComponentToHistory(`Saved initial ${propName} state`);
      };
      
      const handleSlideEnd = () => {
        setIsSliding(false);
      };
      
      const min = controlProps.min !== undefined ? controlProps.min : (schema.minimum as number || 0);
      const max = controlProps.max !== undefined ? controlProps.max : (schema.maximum as number || 100);
      const step = controlProps.step !== undefined ? controlProps.step : (schema.multipleOf as number || 1);
      
      const handleValueChange = (values: number[]) => {
        const newValue = values[0];
        
        // Special handling for strokeWidth - automatically make stroke opaque when strokeWidth > 0
        if (propName === 'strokeWidth' && componentProps) {
          const currentStrokeWidth = currentValue || 0;
          const currentStroke = componentProps.stroke || '#00000000';
          
          // If changing from 0 to positive value and stroke is transparent, make it opaque
          if (currentStrokeWidth === 0 && newValue > 0) {
            // Check if stroke is transparent (ends with '00' for alpha)
            if (typeof currentStroke === 'string' && currentStroke.endsWith('00')) {
              // Make stroke opaque by changing alpha to 'ff'
              const opaqueStroke = currentStroke.slice(0, -2) + 'ff';
              // Update both strokeWidth and stroke
              onUpdate('strokeWidth', newValue, true);
              onUpdate('stroke', opaqueStroke, true);
              return;
            }
          }
        }
        
        onUpdate(propName, newValue, true);
      };
      
      return (
        <div className="flex items-center h-8">
          <Slider 
            min={min} 
            max={max} 
            step={step} 
            value={[currentValue ?? min]} 
            onValueChange={handleValueChange}
            onPointerDown={handleSlideStart}
            onPointerUp={handleSlideEnd}
            className="flex-grow" 
          />
          <span className="text-xs ml-2 w-6 text-right">{currentValue ?? min}</span>
        </div>
      );
    }

    case 'checkbox':
      return (
        <div className="flex items-center justify-between space-x-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Switch 
            checked={currentValue ?? false} 
            onCheckedChange={checked => {
              // Save history before change
              saveComponentToHistory(`Toggle ${label}`);
              // Update with skipHistory=true for real-time update
              onUpdate(propName, checked, true);
            }}
            className="data-[state=checked]:bg-primary" 
          />
        </div>
      );
      
    case 'grouped-dropdown': {
      return (
        <GroupedDropdown
          value={String(currentValue ?? '')}
          options={(propName === 'fontFamily' && dynamicFontOptions) || controlProps.enumValues || schema.enum as string[] || []}
          groups={(propName === 'fontFamily' && dynamicFontGroups) || controlProps.enumGroups}
          onChange={value => {
            // Save history before change
            saveComponentToHistory(`Change ${label}`);
            // Update with skipHistory=true for real-time update
            onUpdate(propName, value, true);
          }}
          placeholder={`Select ${label}`}
          label={label}
        />
      );
    }

    case 'editable-dropdown': {
      return (
        <EditableDropdown
          value={currentValue ?? (schemaType === 'number' ? 0 : '')}
          options={controlProps.enumValues || schema.enum as string[] || []}
          onChange={value => {
            saveComponentToHistory(`Change ${label}`);
            // Update with skipHistory=true for real-time update
            onUpdate(propName, value, true);
          }}
          placeholder={`Select or enter ${label}`}
          type={schemaType as 'string' | 'number'}
          propName={propName}
          icon={icon}
        />
      );
    }

    case 'dropdown': {
      const isFontFamily = propName === 'fontFamily';
      const isFontWeight = propName === 'fontWeight';
      
      // Get available options based on context
      let availableOptions = controlProps.enumValues || schema.enum as string[] || [];
      
      // For fontWeight, filter based on the current font family
      if (isFontWeight && componentProps?.fontFamily) {
        const availableWeights = getAvailableFontWeights(componentProps.fontFamily);
        
        // Filter the schema enum to only include available weights
        availableOptions = availableOptions.filter(weight => 
          availableWeights.includes(String(weight))
        );
        
        // If no weights match, fall back to available weights
        if (availableOptions.length === 0) {
          availableOptions = availableWeights;
        }
      }
      
      // If this is a fontFamily dropdown but schema marked it as 'dropdown', upgrade to grouped dropdown
      if (isFontFamily) {
        return (
          <GroupedDropdown
            value={String(currentValue ?? '')}
            options={dynamicFontOptions || availableOptions}
            groups={dynamicFontGroups || undefined}
            onChange={value => {
              saveComponentToHistory(`Change ${label}`);
              onUpdate(propName, value, true);
            }}
            placeholder={`Select ${label}`}
            label={label}
          />
        );
      }

      return (
        <Select 
          value={String(currentValue ?? '')} 
          onValueChange={value => {
            // Save history before change
            saveComponentToHistory(`Change ${label}`);
            // Convert value if necessary
            let finalValue: any = value;
            if (schemaType === 'number') {
              const num = parseFloat(value);
              if (!isNaN(num)) {
                finalValue = num;
              }
            }
            // Update with skipHistory=true for real-time update
            onUpdate(propName, finalValue, true);
          }}
        >
          <SelectTrigger className="w-full h-8 text-xs px-2">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            {availableOptions.map(value => (
              <SelectItem 
                key={value} 
                value={value} 
                className="text-xs py-2"
              >
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    case 'colorpicker':
    case 'gradientpicker': {
      // Throttle rapid color updates to reduce re-render load
      const lastEmitTimeRef = React.useRef<number>(0);
      const pendingValueRef = React.useRef<any>(null);
      const throttleTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
      const THROTTLE_MS = 50; // ~20 FPS

      const emitColorUpdate = (value: string | any) => {
        if (typeof value === 'object' && value && value.type && value.stops) {
          // Switch to gradient: set gradient first, then clear fill
          onUpdate('gradient', value, true);
          if (propName === 'fill') {
            queueMicrotask(() => onUpdate('fill', null, true));
          }
        } else {
          if (propName === 'fill') {
            // Ensure gradient is cleared before applying solid fill to avoid stale gradient display
            onUpdate('gradient', null, true);
            queueMicrotask(() => onUpdate('fill', value, true));
          } else {
            onUpdate(propName, value, true);
          }
        }
      };

      const queueThrottledUpdate = (value: string | any) => {
        const now = Date.now();
        const elapsed = now - (lastEmitTimeRef.current || 0);
        pendingValueRef.current = value;
        if (elapsed >= THROTTLE_MS) {
          lastEmitTimeRef.current = now;
          const toEmit = pendingValueRef.current;
          pendingValueRef.current = null;
          if (throttleTimerRef.current) {
            clearTimeout(throttleTimerRef.current);
            throttleTimerRef.current = null;
          }
          emitColorUpdate(toEmit);
        } else if (!throttleTimerRef.current) {
          throttleTimerRef.current = setTimeout(() => {
            lastEmitTimeRef.current = Date.now();
            const toEmit = pendingValueRef.current;
            pendingValueRef.current = null;
            throttleTimerRef.current = null;
            if (toEmit !== null) emitColorUpdate(toEmit);
          }, THROTTLE_MS - elapsed);
        }
      };

      const flushThrottledUpdate = () => {
        if (throttleTimerRef.current) {
          clearTimeout(throttleTimerRef.current);
          throttleTimerRef.current = null;
        }
        if (pendingValueRef.current !== null) {
          emitColorUpdate(pendingValueRef.current);
          pendingValueRef.current = null;
          lastEmitTimeRef.current = Date.now();
        }
      };
      const handleColorPickStart = () => {
        // Do not push to history on every drag; only at completion
        setIsPickingColor(true);
        // If parent provided, signal start of transient operation for perf
        if (typeof (componentProps as any)?.onColorPickStart === 'function') {
          try { (componentProps as any).onColorPickStart(); } catch {}
        }
      };
      
      // Determine default value based on property name and control type
      let defaultValue = '#000000';
      if (controlType === 'gradientpicker') {
        defaultValue = '#4287f5ff'; // Default to solid color for gradientpicker
      } else if (propName === 'fill') {
        defaultValue = '#4287f5ff'; // Shape fill default
      } else if (propName === 'stroke') {
        // For stroke, check if strokeWidth > 0, if so default to opaque black, otherwise transparent
        const strokeWidth = componentProps?.strokeWidth || 0;
        defaultValue = strokeWidth > 0 ? '#000000ff' : '#00000000';
      }
      
      // Get the current value - could be a gradient object or string
      // If gradient object exists, prefer it; else use currentValue; if transparent, show checkerboard preview
      const currentDisplayValue = (componentProps?.gradient && typeof componentProps.gradient === 'object')
        ? componentProps.gradient
        : (currentValue ?? defaultValue);
      
      // Generate preview style based on the value
      // Build preview style; show transparency pattern if fill is fully transparent
      const isHex8Transparent = typeof currentValue === 'string' && /^#([0-9a-f]{8})$/i.test(currentValue) && currentValue.slice(-2).toLowerCase() === '00';
      let previewStyle: React.CSSProperties = isHex8Transparent && propName === 'fill' ? {
        backgroundImage: getTransparencyPattern(),
        backgroundSize: '8px 8px',
        backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
        backgroundColor: '#fff'
      } : { backgroundColor: (typeof currentValue === 'string' ? currentValue : defaultValue) };
      if (componentProps?.gradient && typeof componentProps.gradient === 'object') {
        // Generate gradient CSS from object
        const gradient = componentProps.gradient;
        const sortedStops = [...gradient.stops].sort((a: any, b: any) => a.position - b.position);
        if (gradient.type === 'linear') {
          const angle = gradient.angle || 90;
          previewStyle = { 
            backgroundImage: `linear-gradient(${angle}deg, ${sortedStops.map(
              (stop: any) => `${stop.color} ${stop.position}%`
            ).join(', ')})` 
          };
        } else if (gradient.type === 'radial') {
          previewStyle = { 
            backgroundImage: `radial-gradient(circle, ${sortedStops.map(
              (stop: any) => `${stop.color} ${stop.position}%`
            ).join(', ')})` 
          };
        }
      } else if (isGradient(currentValue)) {
        previewStyle = { backgroundImage: currentValue };
      }
      
      const initialTab = controlType === 'gradientpicker' ? 'solid' : 'solid';
      
      // Show transparency pattern for stroke colors to visualize transparency
      const isStrokeColor = propName === 'stroke';
      const isFillColor = propName === 'fill';
      
      // Handle onChange to update both the color and gradient properties
      const handleChange = (value: string | any) => {
        // Throttle to avoid excessive store updates while dragging
        queueThrottledUpdate(value);
      };
      
      return (
        <Popover>
          <PopoverTrigger asChild>
            <div 
              className="w-6 h-6 rounded-md border cursor-pointer" 
              style={isStrokeColor ? {
                // Show transparency pattern for stroke to visualize transparency
                backgroundImage: getTransparencyPattern(),
                backgroundSize: "8px 8px",
                backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
                backgroundColor: "#fff"
              } : isFillColor ? {
                // No transparency pattern for fill colors
                backgroundColor: "#fff"
              } : { 
                backgroundImage: getTransparencyPattern(),
                backgroundSize: "8px 8px",
                backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
                backgroundColor: "#fff"
              }}
              onClick={handleColorPickStart}
            >
              <div 
                className="w-full h-full rounded-[0.3rem]" 
                style={previewStyle} 
              />
            </div>
          </PopoverTrigger>
          <PopoverContent className="p-0" onClick={(e) => e.stopPropagation()} onPointerUp={flushThrottledUpdate} onMouseUp={flushThrottledUpdate} onTouchEnd={flushThrottledUpdate}>
            <div onClick={(e) => e.stopPropagation()}>
              <GradientPicker 
                value={currentDisplayValue} 
                onChange={handleChange}
                onChangeComplete={() => {
                  setIsPickingColor(false);
                  // Ensure final value is flushed to store and history saved
                  flushThrottledUpdate();
                  saveComponentToHistory(`Updated ${propName}`);
                }}
                initialTab={initialTab}
              />
            </div>
          </PopoverContent>
        </Popover>
      );
    }

    case 'code-editor': {
      // Format the code for display
      const [formattedCode, setFormattedCode] = useState(() => formatJavaScript(currentValue || ''));
      
      // Update formatted code when currentValue changes
      useEffect(() => {
        setFormattedCode(formatJavaScript(currentValue || ''));
      }, [currentValue]);
      
      // Count lines for line numbers
      const lines = formattedCode.split('\n');
      const lineCount = lines.length;
      
      return (
        <div className="w-full">
          <div className="relative rounded-md overflow-hidden border border-gray-300">
            {/* Header with format button */}
            <div className="flex items-center justify-between bg-gray-100 px-3 py-1 border-b border-gray-300">
              <span className="text-xs text-gray-600 font-mono">JavaScript Editor</span>
              <button
                onClick={() => {
                  const formatted = formatJavaScript(formattedCode);
                  setFormattedCode(formatted);
                  onUpdate(propName, formatted, true);
                  saveComponentToHistory('Formatted code');
                }}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Format Code
              </button>
            </div>
            
            {/* Code editor area */}
            <div className="flex bg-gray-50">
              {/* Line numbers */}
              <div className="text-right pr-2 pl-3 py-3 bg-gray-100 select-none border-r border-gray-300">
                {Array.from({ length: Math.max(lineCount, 10) }, (_, i) => (
                  <div key={i} className="text-xs leading-5 text-gray-500 font-mono">
                    {i + 1}
                  </div>
                ))}
              </div>
              
              {/* Code content */}
              <div className="flex-1 relative">
                <textarea 
                  value={formattedCode} 
                  onChange={e => {
                    setFormattedCode(e.target.value);
                    onUpdate(propName, e.target.value, true);
                  }} 
                  onBlur={() => saveComponentToHistory(`Updated ${propName}`)}
                  className="w-full bg-transparent border-0 p-3 focus:outline-none focus:ring-0 resize-none text-gray-800 font-mono"
                  style={{
                    minHeight: '200px',
                    maxHeight: '400px',
                    lineHeight: '20px',
                    fontSize: '13px',
                    tabSize: 2,
                    fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
                    overflowX: 'auto',
                    overflowY: 'auto'
                  }}
                  placeholder="// Write your React component function here..."
                  spellCheck={false}
                  wrap="off"
                />
              </div>
            </div>
          </div>
        </div>
      );
    }

    default:
      return <div>Unsupported control type: {controlType}</div>;
  }
};

export default PropertyControlRenderer;