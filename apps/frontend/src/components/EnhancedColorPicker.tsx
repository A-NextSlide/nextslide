import React, { useState, useEffect } from 'react';
import { HexAlphaColorPicker } from 'react-colorful';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface EnhancedColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  onChangeComplete?: () => void;
  showAlpha?: boolean;
}

// Helper functions for color conversion
const hexToRgba = (hex: string) => {
  // Remove # if present
  hex = hex.replace('#', '');
  
  // Handle 3-digit hex
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('');
  }
  
  // Handle 6-digit hex (add full alpha)
  if (hex.length === 6) {
    hex += 'ff';
  }
  
  // Handle 8-digit hex
  if (hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = parseInt(hex.slice(6, 8), 16) / 255;
    return { r, g, b, a };
  }
  
  return { r: 0, g: 0, b: 0, a: 1 };
};

const rgbaToHex = (r: number, g: number, b: number, a: number = 1) => {
  const toHex = (n: number) => {
    const hex = Math.round(Math.max(0, Math.min(255, n))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  
  const alpha = Math.round(a * 255);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(alpha)}`;
};

const EnhancedColorPicker: React.FC<EnhancedColorPickerProps> = ({
  color,
  onChange,
  onChangeComplete,
  showAlpha = true
}) => {
  const [activeTab, setActiveTab] = useState<'picker' | 'hex' | 'rgb'>('picker');
  const [hexValue, setHexValue] = useState(color);
  const [rgbaValue, setRgbaValue] = useState(() => hexToRgba(color));

  // Update internal values when color prop changes
  useEffect(() => {
    setHexValue(color);
    setRgbaValue(hexToRgba(color));
  }, [color]);

  const handleColorChange = (newColor: string) => {
    setHexValue(newColor);
    setRgbaValue(hexToRgba(newColor));
    onChange(newColor);
  };

  const handleHexChange = (value: string) => {
    setHexValue(value);
    
    // Validate and convert hex
    let cleanHex = value.replace('#', '');
    if (/^[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(cleanHex)) {
      if (cleanHex.length === 6) {
        cleanHex += 'ff'; // Add full alpha if not provided
      }
      const fullHex = '#' + cleanHex;
      setRgbaValue(hexToRgba(fullHex));
      onChange(fullHex);
    }
  };

  const handleRgbaChange = (component: 'r' | 'g' | 'b' | 'a', value: string) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;

    let newRgba = { ...rgbaValue };
    
    if (component === 'a') {
      newRgba.a = Math.max(0, Math.min(1, numValue));
    } else {
      newRgba[component] = Math.max(0, Math.min(255, Math.round(numValue)));
    }
    
    setRgbaValue(newRgba);
    const newHex = rgbaToHex(newRgba.r, newRgba.g, newRgba.b, newRgba.a);
    setHexValue(newHex);
    onChange(newHex);
  };

  return (
    <div className="w-full">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-3 h-8">
          <TabsTrigger value="picker" className="text-xs h-6 py-0">Picker</TabsTrigger>
          <TabsTrigger value="hex" className="text-xs h-6 py-0">Hex</TabsTrigger>
          <TabsTrigger value="rgb" className="text-xs h-6 py-0">RGB</TabsTrigger>
        </TabsList>
        
        <div className="relative">
          <TabsContent value="picker" className="space-y-3 absolute inset-0 data-[state=inactive]:hidden">
            <HexAlphaColorPicker
              color={color}
              onChange={handleColorChange}
              onMouseUp={onChangeComplete}
              onTouchEnd={onChangeComplete}
            />
          </TabsContent>
          
          <TabsContent value="hex" className="space-y-3 absolute inset-0 data-[state=inactive]:hidden">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Hex Color</Label>
              <Input
                type="text"
                value={hexValue}
                onChange={(e) => handleHexChange(e.target.value)}
                onBlur={onChangeComplete}
                placeholder="#000000ff"
                className="text-xs font-mono"
              />
              <div 
                className="w-full h-12 rounded border"
                style={{ backgroundColor: color }}
              />
            </div>
          </TabsContent>
          
          <TabsContent value="rgb" className="space-y-3 absolute inset-0 data-[state=inactive]:hidden">
            <div className="space-y-3">
              <Label className="text-xs font-medium">RGB{showAlpha ? 'A' : ''} Values</Label>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Red</Label>
                  <Input
                    type="number"
                    min="0"
                    max="255"
                    value={rgbaValue.r}
                    onChange={(e) => handleRgbaChange('r', e.target.value)}
                    onBlur={onChangeComplete}
                    className="text-xs"
                  />
                </div>
                
                <div>
                  <Label className="text-xs text-muted-foreground">Green</Label>
                  <Input
                    type="number"
                    min="0"
                    max="255"
                    value={rgbaValue.g}
                    onChange={(e) => handleRgbaChange('g', e.target.value)}
                    onBlur={onChangeComplete}
                    className="text-xs"
                  />
                </div>
                
                <div>
                  <Label className="text-xs text-muted-foreground">Blue</Label>
                  <Input
                    type="number"
                    min="0"
                    max="255"
                    value={rgbaValue.b}
                    onChange={(e) => handleRgbaChange('b', e.target.value)}
                    onBlur={onChangeComplete}
                    className="text-xs"
                  />
                </div>
                
                {showAlpha && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Alpha</Label>
                    <Input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={rgbaValue.a.toFixed(2)}
                      onChange={(e) => handleRgbaChange('a', e.target.value)}
                      onBlur={onChangeComplete}
                      className="text-xs"
                    />
                  </div>
                )}
              </div>
              
              <div 
                className="w-full h-12 rounded border"
                style={{ backgroundColor: color }}
              />
            </div>
          </TabsContent>
          
          {/* Invisible spacer to maintain consistent height */}
          <div className="invisible">
            <div className="space-y-2">
              <div className="h-[160px]"></div>
              <div className="h-4"></div>
              <div className="h-8"></div>
            </div>
          </div>
        </div>
      </Tabs>
    </div>
  );
};

export default EnhancedColorPicker; 