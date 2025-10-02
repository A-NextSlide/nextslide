import React, { useMemo } from 'react';
import { ComponentInstance } from '@/types/components';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import GradientPicker from '@/components/GradientPicker';

interface WavyLinesSettingsEditorProps {
  component: ComponentInstance;
  onUpdate: (propUpdates: Record<string, any>) => void;
  saveComponentToHistory: (message?: string) => void;
}

const numberToArray = (n: number) => [n];

const WavyLinesSettingsEditor: React.FC<WavyLinesSettingsEditorProps> = ({ component, onUpdate, saveComponentToHistory }) => {
  const props = component.props || {};

  const set = (key: string, value: any, skipHistory = true) => {
    onUpdate({ [key]: value });
    if (!skipHistory) saveComponentToHistory(`Set ${key}`);
  };

  const colorValue = useMemo(() => props.lineColor || '#c32428cc', [props.lineColor]);

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium">Wavy Lines</h4>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Variant</Label>
          <Select value={props.variant || 'sine'} onValueChange={(v) => set('variant', v)}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sine">Sine</SelectItem>
              <SelectItem value="mesh">Mesh</SelectItem>
              <SelectItem value="contours">Contours</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Blend Mode</Label>
          <Select value={props.blendMode || 'screen'} onValueChange={(v) => set('blendMode', v)}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="screen">Screen</SelectItem>
              <SelectItem value="lighten">Lighten</SelectItem>
              <SelectItem value="overlay">Overlay</SelectItem>
              <SelectItem value="soft-light">Soft Light</SelectItem>
              <SelectItem value="multiply">Multiply</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Stroke Width: {props.strokeWidth ?? 2}px</Label>
          <Slider value={numberToArray(props.strokeWidth ?? 2)} min={0.5} max={12} step={0.5} onValueChange={(v) => set('strokeWidth', v[0])} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Lines: {props.linesCount ?? 36}</Label>
          <Slider value={numberToArray(props.linesCount ?? 36)} min={1} max={200} step={1} onValueChange={(v) => set('linesCount', v[0])} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Spacing: {props.spacing ?? 26}px</Label>
          <Slider value={numberToArray(props.spacing ?? 26)} min={2} max={200} step={1} onValueChange={(v) => set('spacing', v[0])} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Amplitude: {props.amplitude ?? 120}px</Label>
          <Slider value={numberToArray(props.amplitude ?? 120)} min={0} max={600} step={1} onValueChange={(v) => set('amplitude', v[0])} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Frequency: {props.frequency ?? 1.2}</Label>
          <Slider value={numberToArray(props.frequency ?? 1.2)} min={0.05} max={8} step={0.05} onValueChange={(v) => set('frequency', v[0])} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Phase: {props.phase ?? 0}</Label>
          <Slider value={numberToArray(props.phase ?? 0)} min={-12.56} max={12.56} step={0.1} onValueChange={(v) => set('phase', v[0])} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Per-line Phase: {props.phaseIncrement ?? 0.12}</Label>
          <Slider value={numberToArray(props.phaseIncrement ?? 0.12)} min={-2} max={2} step={0.01} onValueChange={(v) => set('phaseIncrement', v[0])} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Base Y: {props.baseY ?? 720}px</Label>
          <Slider value={numberToArray(props.baseY ?? 720)} min={0} max={1080} step={1} onValueChange={(v) => set('baseY', v[0])} />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Line Color</Label>
          <GradientPicker
            value={colorValue}
            onChange={(c) => set('lineColor', c, true)}
            onChangeComplete={() => saveComponentToHistory('Set line color')}
            forceMode="solid"
          />
        </div>
      </div>
    </div>
  );
};

export default WavyLinesSettingsEditor;


