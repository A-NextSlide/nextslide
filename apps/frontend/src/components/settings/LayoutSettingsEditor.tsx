import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { ComponentInstance } from '@/types/components';
import ZIndexControls from './ZIndexControls';

interface LayoutSettingsEditorProps {
  component: ComponentInstance;
  onUpdate: (propName: string, value: any, skipHistory?: boolean) => void;
  saveComponentToHistory: (message?: string) => void;
  isBackground: boolean;
}

const LayoutSettingsEditor: React.FC<LayoutSettingsEditorProps> = ({
  component,
  onUpdate,
  saveComponentToHistory,
  isBackground
}) => {
  // Extract position and size values
  const posX = component.props.position?.x ?? 0;
  const posY = component.props.position?.y ?? 0;
  const compWidth = typeof component.props.width === 'number' ? component.props.width : 100;
  const compHeight = typeof component.props.height === 'number' ? component.props.height : 100;
  const compOpacity = (component.props.opacity ?? 1) * 100;
  const compRotation = component.props.rotation ?? 0;
  const compZIndex = component.props.zIndex ?? 0;
  
  // Format display values to 1 decimal place
  const displayPosX = posX.toFixed(1);
  const displayPosY = posY.toFixed(1);
  const displayWidth = compWidth.toFixed(1);
  const displayHeight = compHeight.toFixed(1);
  
  // Handle position updates
  const handlePositionChange = (axis: 'x' | 'y', value: number) => {
    const newPosition = {
      x: axis === 'x' ? value : posX,
      y: axis === 'y' ? value : posY
    };
    
    onUpdate('position', newPosition);
  };
  
  // Handle rotation start
  const handleRotationStart = () => {
    saveComponentToHistory("Saved initial rotation");
  };
  
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium">Position & Size</h4>
      
      {/* Position */}
      <div className="grid grid-cols-2 gap-1">
        <div className="space-y-1">
          <Label className="text-xs">X Position (px)</Label>
          <Input 
            type="number" 
            value={displayPosX} 
            onChange={e => handlePositionChange('x', parseFloat(e.target.value))} 
            className="w-full h-7 text-xs"
            disabled={isBackground}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Y Position (px)</Label>
          <Input 
            type="number" 
            value={displayPosY} 
            onChange={e => handlePositionChange('y', parseFloat(e.target.value))} 
            className="w-full h-7 text-xs"
            disabled={isBackground}
          />
        </div>
      </div>
      
      {/* Size */}
      <div className="grid grid-cols-2 gap-1">
        <div className="space-y-1">
          <Label className="text-xs">Width (px)</Label>
          <Input 
            type="number" 
            value={displayWidth} 
            onChange={e => onUpdate('width', parseFloat(e.target.value))} 
            className="w-full h-7 text-xs"
            disabled={isBackground}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Height (px)</Label>
          <Input 
            type="number" 
            value={displayHeight} 
            onChange={e => onUpdate('height', parseFloat(e.target.value))} 
            className="w-full h-7 text-xs"
            disabled={isBackground}
          />
        </div>
      </div>
      
      {/* Opacity */}
      <div className="space-y-1">
        <Label className="text-xs">Opacity</Label>
        <Slider 
          min={0} 
          max={100} 
          step={1} 
          value={[Math.round(compOpacity)]} 
          onValueChange={values => onUpdate('opacity', values[0] / 100)}
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>Transparent</span>
          <span>Opaque</span>
        </div>
      </div>
      
      {/* Rotation */}
      <div className="space-y-1">
        <Label className="text-xs">Rotation (degrees)</Label>
        <Slider 
          min={0} 
          max={360} 
          step={1} 
          value={[compRotation]} 
          onValueChange={values => onUpdate('rotation', values[0], true)} 
          onPointerDown={handleRotationStart}
          className="flex-grow"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>0°</span>
          <span>180°</span>
          <span>360°</span>
        </div>
      </div>
      
      {/* Z-Index Controls */}
      <div className="space-y-1 mt-4">
        <div className="flex justify-between items-center">
          <Label className="text-xs">Layer Controls</Label>
          <span className="text-xs text-muted-foreground">Z-Index: {compZIndex}</span>
        </div>
        <ZIndexControls 
          component={component}
          onUpdate={onUpdate}
          saveComponentToHistory={saveComponentToHistory}
          disabled={isBackground}
        />
      </div>
    </div>
  );
};

export default LayoutSettingsEditor;