import React, { useState, useEffect, useRef, forwardRef, Ref } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, ArrowRight } from 'lucide-react';
import { COLORS } from '@/utils/colors';
import { normalizeGradientStops } from '@/registry/library/gradient-properties';
import EnhancedColorPicker from './EnhancedColorPicker';

interface GradientStop {
  color: string;
  position: number;
}

// Define the Gradient Object type
interface GradientObject {
    type: 'linear' | 'radial';
    angle: number;
    stops: GradientStop[];
}

interface GradientPickerProps {
  value: string | GradientObject | null;
  onChange: (value: string | GradientObject) => void; 
  onChangeComplete?: () => void;
  initialTab?: 'solid' | 'gradient';
  forceMode?: 'solid' | 'gradient';
  isBackgroundProp?: boolean;
}

// Define the ref type (assuming it will be attached to the main div)
type GradientPickerRef = Ref<HTMLDivElement>;

const GradientPicker = forwardRef<HTMLDivElement, GradientPickerProps>((
  { 
    value, 
    onChange,
    onChangeComplete,
    initialTab,
    forceMode,
    isBackgroundProp
  }, 
  ref // Receive the forwarded ref
) => {
  // Default gradient settings
  const defaultStops: GradientStop[] = [
    { color: '#FF0000FF', position: 0 },
    { color: '#0000FFFF', position: 100 }
  ];
  const defaultGradient: GradientObject = { type: 'linear', angle: 90, stops: defaultStops };

  // Restore a basic parseGradient function for string fallback
  const parseGradient = (gradientStr: string): GradientObject => {
    // Basic parsing - assumes linear, extracts stops if possible
    // This is a fallback, object input is preferred
    const result: GradientObject = { ...defaultGradient }; 
    try {
      if (gradientStr.includes('radial-gradient')) {
        result.type = 'radial';
      }
      const angleMatch = gradientStr.match(/linear-gradient\(([^,]+),/);
      if (result.type === 'linear' && angleMatch && angleMatch[1]?.includes('deg')) {
          result.angle = parseInt(angleMatch[1]) || 90;
      }
      const stopMatches = gradientStr.match(/(#[0-9a-fA-F]{6,8}|rgba?\([^)]+\))\s+(\d+)%/g);
      if (stopMatches) {
        const parsedStops = stopMatches.map(stop => {
          const parts = stop.trim().split(/\s+/);
          return {
            color: parts[0],
            position: parseInt(parts[1]) || 0
          };
        });
        if (parsedStops.length >= 2) { // Need at least 2 stops
             result.stops = parsedStops;
        }
      }
    } catch (e) { console.error("Error parsing gradient string:", e); }
    return result;
  };

  // Determine initial state based on value type
  const isGradientObject = typeof value === 'object' && value !== null && 
    ('stops' in value || 'gradient_type' in value || 'type' in value);
  const initialIsGradientMode = isGradientObject || (typeof value === 'string' && value.includes('gradient'));

  // Determine the active tab: forceMode takes precedence, then initial value type, then initialTab prop
  let determinedInitialTab: 'solid' | 'gradient' = 'solid';
  if (forceMode) {
      determinedInitialTab = forceMode;
  } else if (initialIsGradientMode) {
      determinedInitialTab = 'gradient';
  } else if (initialTab) {
      determinedInitialTab = initialTab;
  }
  const [activeTab, setActiveTab] = useState(determinedInitialTab);
  
  // Ensure activeTab respects forceMode if it changes
  useEffect(() => {
    if (forceMode && activeTab !== forceMode) {
      setActiveTab(forceMode);
    }
  }, [forceMode, activeTab]);

  // Initialize Solid Color State
  const [solidColor, setSolidColor] = useState(
      typeof value === 'string' && !value.includes('gradient') ? value : '#ffffff' // Default if value is object/gradient string
  );
  const prevSolidColorRef = useRef<string>(solidColor); // Ref for previous solid color
  
  // Initialize Gradient State from Object or Parsed String
  const initialGradientState = isGradientObject 
      ? {
          // Handle both 'type' and 'gradient_type' fields
          type: ((value as any).type || (value as any).gradient_type || 'linear') as 'linear' | 'radial',
          // Handle missing angle
          angle: (value as any).angle ?? 90,
          // Normalize stops to always use 'position' field and handle empty arrays
          stops: (value.stops && Array.isArray(value.stops) && value.stops.length > 0) 
            ? normalizeGradientStops(value.stops) 
            : defaultStops
        }
      : (typeof value === 'string' && value.includes('gradient') ? parseGradient(value) : defaultGradient);

  const [gradientType, setGradientType] = useState<'linear' | 'radial'>(initialGradientState.type);
  const [gradientAngle, setGradientAngle] = useState(initialGradientState.angle);
  const [gradientStops, setGradientStops] = useState<GradientStop[]>(
    Array.isArray(initialGradientState.stops) ? initialGradientState.stops : defaultStops
  );
  const prevGradientStopsRef = useRef<GradientStop[]>(gradientStops); // Ref for previous stops

  // Ref to store the gradient object state for emitting
  const gradientObjectRef = useRef<GradientObject>({ type: gradientType, angle: gradientAngle, stops: gradientStops });

  // Update ref whenever state changes
  useEffect(() => {
      gradientObjectRef.current = { type: gradientType, angle: gradientAngle, stops: gradientStops };
  }, [gradientType, gradientAngle, gradientStops]);

  // Update previous value refs AFTER render
  useEffect(() => {
    prevSolidColorRef.current = solidColor;
    prevGradientStopsRef.current = gradientStops;
  }); // No dependency array, run after every render

  // Handle active color stop
  const [activeStopIndex, setActiveStopIndex] = useState(0);
  
  // Generate the CSS gradient string
  const generateGradientString = () => {
    if (activeTab === 'solid') {
      return solidColor;
    }
    
    // Ensure gradientStops is iterable, default to empty array if not
    const stops = Array.isArray(gradientStops) ? gradientStops : [];
    const sortedStops = [...stops].sort((a, b) => a.position - b.position);
    
    if (gradientType === 'linear') {
      return `linear-gradient(${gradientAngle}deg, ${sortedStops.map(
        stop => `${stop.color} ${stop.position}%`
      ).join(', ')})`;
    } else {
      return `radial-gradient(circle, ${sortedStops.map(
        stop => `${stop.color} ${stop.position}%`
      ).join(', ')})`;
    }
  };

  // Helper to check alpha and make opaque
  const handlePotentialOpacityJump = (currentColor: string, previousColor: string): string => {
    if (!isBackgroundProp) return currentColor; // Only act on background props

    // Basic alpha check (assumes hex8 format from react-colorful)
    const prevAlpha = parseInt(previousColor.slice(7, 9) || 'FF', 16);
    const currentAlpha = parseInt(currentColor.slice(7, 9) || 'FF', 16);

    if (prevAlpha === 0 && currentAlpha > 0) {
      // Jump to opaque: replace last two hex digits with FF
      return currentColor.slice(0, 7) + 'FF';
    }
    return currentColor; // No jump needed
  };

  // Handle solid color change
  const handleSolidColorChange = (color: string) => {
    const potentiallyOpaqueColor = handlePotentialOpacityJump(color, prevSolidColorRef.current);
    // Update local state with the (potentially modified) color
    setSolidColor(potentiallyOpaqueColor);
    
    // Always update parent component if we're in solid tab
    if (activeTab === 'solid') {
      onChange(potentiallyOpaqueColor);
    }
  };

  // Handle complete change for solid color
  const handleSolidColorComplete = () => {
    if (activeTab === 'solid' && onChangeComplete) {
      onChangeComplete();
    }
  };

  // Handle gradient type change
  const handleGradientTypeChange = (type: 'linear' | 'radial') => {
    setGradientType(type);
    // Emit the updated gradient object
    onChange({ ...gradientObjectRef.current, type }); 
  };

  // Handle gradient angle change
  const handleGradientAngleChange = (value: number) => {
    const validValue = Math.max(0, Math.min(360, value));
    setGradientAngle(validValue);
    // Emit the updated gradient object only if linear
    if (gradientType === 'linear') {
        onChange({ ...gradientObjectRef.current, angle: validValue, type: 'linear' }); // Ensure type is passed
    }
    // No object emission needed for radial as angle doesn't apply
  };

  // Handle stop color change
  const handleStopColorChange = (color: string, index: number) => {
    // Ensure gradientStops is an array
    const stops = Array.isArray(gradientStops) ? gradientStops : [];
    
    const previousColor = prevGradientStopsRef.current[index]?.color || '';
    const potentiallyOpaqueColor = handlePotentialOpacityJump(color, previousColor);
    
    const newStops = [...stops];
    if (index >= 0 && index < newStops.length) {
      newStops[index] = { ...newStops[index], color: potentiallyOpaqueColor }; // Use potentially modified color
      setGradientStops(newStops);
      
      // Log for debugging
  
      
      // Emit the updated gradient object with all required properties
      onChange({ 
        type: gradientType,
        angle: gradientAngle,
        stops: newStops 
      });
    }
  };

  // Handle stop position change
  const handleStopPositionChange = (position: number, index: number) => {
    // Ensure gradientStops is an array
    const stops = Array.isArray(gradientStops) ? gradientStops : [];
    
    const newStops = [...stops];
    
    if (index >= 0 && index < newStops.length) {
      // Ensure position is clamped between 0 and 100
      const clampedPosition = Math.max(0, Math.min(100, position)); 
      newStops[index] = { ...newStops[index], position: clampedPosition };
      setGradientStops(newStops);
      

      
      // Emit the updated gradient object with all required properties
      onChange({ 
        type: gradientType,
        angle: gradientAngle,
        stops: newStops 
      });
    }
  };

  // Add new stop
  const addGradientStop = () => {
    // Ensure gradientStops is an array
    const stops = Array.isArray(gradientStops) ? gradientStops : [];
    
    const positions = stops.map(stop => stop.position);
    const minPos = positions.length > 0 ? Math.min(...positions) : 0;
    const maxPos = positions.length > 0 ? Math.max(...positions) : 100;
    
    // Add between active stop and next/previous, or middle if at end
    let insertPos = 50; 
    if(stops.length > 1) {
        const sorted = [...stops].sort((a, b) => a.position - b.position);
        const currentIdx = sorted.findIndex((s, i) => i === activeStopIndex); // Find index in sorted array
        if (currentIdx < sorted.length - 1) {
            insertPos = (sorted[currentIdx].position + sorted[currentIdx + 1].position) / 2;
        } else if (currentIdx > 0) {
             insertPos = (sorted[currentIdx].position + sorted[currentIdx - 1].position) / 2;
        } else { // Only one stop or other edge case?
             insertPos = (sorted[currentIdx].position + (sorted[currentIdx].position > 50 ? 0 : 100)) / 2;
        }
    }
    
    const newColor = stops[activeStopIndex]?.color || '#FFFFFFFF';
    const newStops = [...stops, { color: newColor, position: Math.round(insertPos) }];
    setGradientStops(newStops);
    setActiveStopIndex(newStops.length - 1); // Select the new stop
    

    
    // Emit the updated gradient object with all required properties
    onChange({ 
      type: gradientType,
      angle: gradientAngle,
      stops: newStops 
    });
  };

  // Remove stop
  const removeGradientStop = (index: number) => {
    // Ensure gradientStops is an array
    const stops = Array.isArray(gradientStops) ? gradientStops : [];
    
    if (stops.length <= 2) return;
    
    const newStops = stops.filter((_, i) => i !== index);
    setGradientStops(newStops);
    
    // Adjust active index if needed
    const newActiveIndex = activeStopIndex >= newStops.length ? newStops.length - 1 : activeStopIndex;
    setActiveStopIndex(newActiveIndex);
    

    
    // Emit the updated gradient object with all required properties
    onChange({ 
      type: gradientType,
      angle: gradientAngle,
      stops: newStops 
    });
  };

  // Handle tab change - ONLY if mode is not forced
  const handleTabChange = (value: string) => {
    if (forceMode) return; 
    const newTab = (value === 'solid' || value === 'gradient') ? value : 'solid';
    setActiveTab(newTab);
    
    if (newTab === 'solid') {
      onChange(solidColor || '#ffffffff');
    } else {
      // When switching to gradient, emit the current gradient object state
      onChange(gradientObjectRef.current);
    }
    
    // onChangeComplete?.(); // Let individual actions trigger completion/history
  };

  // Calculate the gradient preview style
  const gradientPreviewStyle = {
    backgroundImage: generateGradientString(),
    width: '100%',
    height: '24px',
    borderRadius: '4px',
    marginBottom: '8px',
  };

  // Transparency pattern for background
  const transparencyPattern = `
    linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%)
  `;

  return (
    <div className="gradient-picker w-full" ref={ref}>
      {/* Only show tabs if mode is not forced */}
      {!forceMode && (
          <div className="flex border-b mb-2 px-0.5 py-1">
            <button 
              onClick={() => handleTabChange('solid')} 
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors flex-1 justify-center text-xs ${activeTab === 'solid' ? 'text-white' : 'hover:bg-secondary/50 text-muted-foreground'}`}
              style={{
                backgroundColor: activeTab === 'solid' ? COLORS.SUGGESTION_PINK : undefined
              }}
            >
              <span>Solid</span>
            </button>
            <button 
              onClick={() => handleTabChange('gradient')} 
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors flex-1 justify-center text-xs ${activeTab === 'gradient' ? 'text-white' : 'hover:bg-secondary/50 text-muted-foreground'}`}
              style={{
                backgroundColor: activeTab === 'gradient' ? COLORS.SUGGESTION_PINK : undefined
              }}
            >
              <span>Gradient</span>
            </button>
          </div>
      )}
      
      {/* Always render Tabs structure for content management, but control visibility based on forceMode/activeTab */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="hidden">
          <TabsTrigger value="solid">Solid</TabsTrigger>
          <TabsTrigger value="gradient">Gradient</TabsTrigger>
        </TabsList>
        
        {/* Conditionally render content based on activeTab */}
        {activeTab === 'solid' && (
            <TabsContent value="solid" className="space-y-3">
              <div className="w-full">
                <EnhancedColorPicker 
                  color={solidColor} 
                  onChange={handleSolidColorChange}
                  onChangeComplete={handleSolidColorComplete}
                />
              </div>
            </TabsContent>
        )}
        
        {activeTab === 'gradient' && (
            <TabsContent value="gradient" className="space-y-3 pb-1 flex flex-col px-1">
              {/* Gradient Type Selector */}
              <div className="flex space-x-2 items-center">
                <Label className="text-xs w-12">Type</Label>
                <Select 
                  value={gradientType} 
                  onValueChange={(v: 'linear' | 'radial') => {
                    handleGradientTypeChange(v);
                    if (onChangeComplete) onChangeComplete();
                  }}
                >
                  <SelectTrigger className="h-6 text-xs min-h-0 py-0">
                    <SelectValue placeholder="Select type"/>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="linear">Linear</SelectItem>
                    <SelectItem value="radial">Radial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Angle Selector (for linear gradients) */}
              {gradientType === 'linear' && (
                <div className="flex space-x-2 items-center">
                  <Label className="text-xs w-12">Angle</Label>
                  <div className="flex-1 flex items-center">
                    <Slider
                      min={0}
                      max={360}
                      step={1}
                      value={[gradientAngle]}
                      onValueChange={(values) => {
                        // Ensure we're actually changing the value
                        if (values[0] !== gradientAngle) {
                          handleGradientAngleChange(values[0]);
                        }
                      }}
                      onPointerDown={() => {
                        if (onChangeComplete) onChangeComplete();
                      }}
                      onPointerUp={() => {
                        if (onChangeComplete) onChangeComplete();
                      }}
                      className="flex-1 mr-2"
                    />
                    <Input 
                      type="number" 
                      className="w-14 h-6 px-2 py-0 text-xs min-h-0"
                      value={gradientAngle} 
                      onChange={(e) => handleGradientAngleChange(Number(e.target.value))}
                      onBlur={() => {
                        if (onChangeComplete) onChangeComplete();
                      }}
                    />
                    <span className="text-xs ml-1">°</span>
                  </div>
                </div>
              )}
              
              {/* Color Stops */}
              <div className="space-y-3">
                {/* Color Stop Track */}
                <div 
                  className="w-full h-6 rounded-md relative overflow-hidden"
                  style={{ 
                    backgroundImage: transparencyPattern,
                    backgroundSize: "8px 8px",
                    backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
                    backgroundColor: "#fff",
                    WebkitMaskImage: "radial-gradient(black, black)",
                    maskImage: "radial-gradient(black, black)"
                  }}
                  onClick={(e) => {
                    // Check if the click was directly on the track (not on a color stop)
                    // We need to check the target carefully
                    if (e.target !== e.currentTarget && 
                        e.target !== e.currentTarget.firstChild &&
                        !(e.target as HTMLElement)?.classList?.contains('absolute')) {
                      console.log('Click was not on track', e.target);
                      return; // Click was on a stop or something else, do nothing
                    }
                    
                    // Calculate click position as percentage
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const clickPct = (clickX / rect.width) * 100;
                    
                    // Add a new stop at the clicked position
                    const newStops = [...gradientStops];
                    const newColor = gradientStops[activeStopIndex]?.color || '#000000ff';
                    newStops.push({ position: clickPct, color: newColor });
                    setGradientStops(newStops);
                    setActiveStopIndex(newStops.length - 1);
                    
                    // Update the gradient
                    const newGradient = gradientType === 'linear'
                      ? `linear-gradient(${gradientAngle}deg, ${newStops.map(s => `${s.color} ${s.position}%`).join(', ')})`
                      : `radial-gradient(circle, ${newStops.map(s => `${s.color} ${s.position}%`).join(', ')})`;
                    
                    // Update the state and notify parent
                    onChange({ 
                      type: gradientType, 
                      angle: gradientAngle, 
                      stops: newStops 
                    });
                  }}
                >
                  <div 
                    className="absolute inset-0 rounded-[0.3rem]"
                    style={{ backgroundImage: generateGradientString() }}
                  ></div>
                  
                  {/* Stop Handles */}
                  {gradientStops.map((stop, index) => (
                    <div
                      key={index}
                      className={`absolute w-3 h-6 -ml-1.5 cursor-grab transition-transform ${activeStopIndex === index ? 'scale-y-110 shadow-md ring-1 ring-primary z-10' : ''}`}
                      style={{ 
                        left: `${stop.position}%`,
                        backgroundColor: stop.color,
                        top: 0,
                        borderRadius: '2px',
                        border: '1px solid white'
                      }}
                      title={`Color stop: ${(stop.position ?? 0).toFixed(1)}%`}
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent track click
                        setActiveStopIndex(index);
                      }}
                      onMouseDown={(e) => {
                        // Prevent other events
                        e.stopPropagation();
                        // Set active stop
                        setActiveStopIndex(index);
                        
                        const startX = e.clientX;
                        const startPosition = stop.position;
                        const trackRect = e.currentTarget.parentElement?.getBoundingClientRect();
                        
                        if (!trackRect) return;
                        
                        // Function to handle mouse movement
                        const handleMouseMove = (moveEvent: MouseEvent) => {
                          // Calculate position based on track width
                          const trackWidth = trackRect.width;
                          const deltaX = moveEvent.clientX - startX;
                          const deltaPct = (deltaX / trackWidth) * 100;
                          const newPosition = Math.min(100, Math.max(0, startPosition + deltaPct));
                          
                          // Update stop position
                          handleStopPositionChange(newPosition, index);
                        };
                        
                        // Function to handle mouse up
                        const handleMouseUp = () => {
                          document.removeEventListener('mousemove', handleMouseMove);
                          document.removeEventListener('mouseup', handleMouseUp);
                          document.body.style.cursor = 'default';
                          
                          // Save to history when dragging stops
                          if (onChangeComplete) {
                            onChangeComplete();
                          }
                        };
                        
                        // Add event listeners
                        document.addEventListener('mousemove', handleMouseMove);
                        document.addEventListener('mouseup', handleMouseUp);
                        document.body.style.cursor = 'grabbing';
                        
                        // Save initial state
                        if (onChangeComplete) {
                          onChangeComplete();
                        }
                      }}
                      onTouchStart={(e) => {
                        // Prevent other events
                        e.stopPropagation();
                        // Set active stop
                        setActiveStopIndex(index);
                        
                        const startX = e.touches[0].clientX;
                        const startPosition = stop.position;
                        const trackRect = e.currentTarget.parentElement?.getBoundingClientRect();
                        
                        if (!trackRect) return;
                        
                        // Function to handle touch movement
                        const handleTouchMove = (moveEvent: TouchEvent) => {
                          // Calculate position based on track width
                          const trackWidth = trackRect.width;
                          const deltaX = moveEvent.touches[0].clientX - startX;
                          const deltaPct = (deltaX / trackWidth) * 100;
                          const newPosition = Math.min(100, Math.max(0, startPosition + deltaPct));
                          
                          // Update stop position
                          handleStopPositionChange(newPosition, index);
                          
                          // Prevent scrolling while dragging
                          moveEvent.preventDefault();
                        };
                        
                        // Function to handle touch end
                        const handleTouchEnd = () => {
                          document.removeEventListener('touchmove', handleTouchMove);
                          document.removeEventListener('touchend', handleTouchEnd);
                          
                          // Save to history when dragging stops
                          if (onChangeComplete) {
                            onChangeComplete();
                          }
                        };
                        
                        // Add event listeners
                        document.addEventListener('touchmove', handleTouchMove, { passive: false });
                        document.addEventListener('touchend', handleTouchEnd);
                        
                        // Save initial state
                        if (onChangeComplete) {
                          onChangeComplete();
                        }
                      }}
                    ></div>
                  ))}
                </div>
                
                {/* Active Stop Editor */}
                {gradientStops[activeStopIndex] && (
                  <div className="space-y-3 pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Stop Color</Label>
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="h-6 text-xs py-0 px-1.5"
                        onClick={() => {
                          removeGradientStop(activeStopIndex);
                          if (onChangeComplete) onChangeComplete();
                        }}
                        disabled={gradientStops.length <= 2}
                      >
                        <X className="w-3 h-3 mr-1" /> Remove
                      </Button>
                    </div>
                    
                    <EnhancedColorPicker 
                      color={gradientStops[activeStopIndex].color} 
                      onChange={(color) => handleStopColorChange(color, activeStopIndex)}
                      onChangeComplete={() => {
                        if (onChangeComplete) onChangeComplete();
                      }}
                    />
                    
                  </div>
                )}
              </div>
            </TabsContent>
        )}
      </Tabs>
    </div>
  );
});

// Add display name for better debugging
GradientPicker.displayName = "GradientPicker";

export default GradientPicker;