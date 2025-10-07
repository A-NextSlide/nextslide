/**
 * ReactBits Settings Editor Component
 *
 * Dynamic property editor for ReactBits components
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HexColorPicker } from 'react-colorful';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Info, Palette } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { REACTBITS_CATALOG } from '@/integrations/reactbits/catalog';
import { PropDefinition, ReactBitsComponentInstance } from '@/integrations/reactbits/types';

interface ReactBitsSettingsEditorProps {
  component: ReactBitsComponentInstance;
  onChange: (props: Record<string, any>) => void;
}

/**
 * Individual prop control renderer
 */
const PropControl: React.FC<{
  propKey: string;
  propDef: PropDefinition;
  value: any;
  onChange: (value: any) => void;
}> = ({ propKey, propDef, value, onChange }) => {
  const currentValue = value !== undefined ? value : propDef.default;

  // Render different controls based on prop type and control hint
  switch (propDef.control || propDef.type) {
    case 'checkbox':
    case 'boolean':
      return (
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <Label htmlFor={propKey} className="text-sm font-medium">
              {propDef.label}
            </Label>
            {propDef.description && (
              <p className="text-xs text-muted-foreground mt-1">{propDef.description}</p>
            )}
          </div>
          <Switch
            id={propKey}
            checked={currentValue === true}
            onCheckedChange={(checked) => onChange(checked)}
          />
        </div>
      );

    case 'slider':
    case 'number':
      if (propDef.min !== undefined && propDef.max !== undefined) {
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={propKey} className="text-sm font-medium">
                {propDef.label}
              </Label>
              <span className="text-xs text-muted-foreground font-mono">{currentValue}</span>
            </div>
            {propDef.description && (
              <p className="text-xs text-muted-foreground">{propDef.description}</p>
            )}
            <Slider
              id={propKey}
              min={propDef.min}
              max={propDef.max}
              step={propDef.step || 1}
              value={[Number(currentValue) || propDef.default || 0]}
              onValueChange={(values) => onChange(values[0])}
              className="w-full"
            />
          </div>
        );
      }
      // Fall through to input for numbers without min/max
      return (
        <div className="space-y-2">
          <Label htmlFor={propKey} className="text-sm font-medium">
            {propDef.label}
          </Label>
          {propDef.description && (
            <p className="text-xs text-muted-foreground">{propDef.description}</p>
          )}
          <Input
            id={propKey}
            type="number"
            value={currentValue || ''}
            onChange={(e) => onChange(Number(e.target.value))}
            placeholder={propDef.default?.toString()}
            className="w-full"
          />
        </div>
      );

    case 'dropdown':
    case 'enum':
      return (
        <div className="space-y-2">
          <Label htmlFor={propKey} className="text-sm font-medium">
            {propDef.label}
          </Label>
          {propDef.description && (
            <p className="text-xs text-muted-foreground">{propDef.description}</p>
          )}
          <Select value={currentValue?.toString()} onValueChange={(val) => onChange(val)}>
            <SelectTrigger id={propKey} className="w-full">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {propDef.options?.map((option) => (
                <SelectItem key={option.toString()} value={option.toString()}>
                  {option.toString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case 'colorpicker':
    case 'color':
      return (
        <div className="space-y-2">
          <Label htmlFor={propKey} className="text-sm font-medium">
            {propDef.label}
          </Label>
          {propDef.description && (
            <p className="text-xs text-muted-foreground">{propDef.description}</p>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <div className="flex items-center gap-2 p-2 rounded-lg border border-border hover:border-primary/50 transition-colors cursor-pointer bg-background">
                <div
                  className="w-10 h-10 rounded-md border-2 border-border shadow-sm"
                  style={{
                    backgroundColor: currentValue || propDef.default,
                  }}
                />
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">Color</div>
                  <div className="font-mono text-sm font-medium">{currentValue || propDef.default}</div>
                </div>
                <Palette className="w-4 h-4 text-muted-foreground" />
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-4" side="left">
              <div className="space-y-3">
                <HexColorPicker color={currentValue || propDef.default} onChange={onChange} />
                <div className="flex items-center gap-2">
                  <Input
                    value={currentValue || propDef.default}
                    onChange={(e) => onChange(e.target.value)}
                    className="font-mono text-sm"
                    placeholder="#000000"
                  />
                </div>
                <div className="flex gap-1 flex-wrap">
                  {['#000000', '#ffffff', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'].map((color) => (
                    <button
                      key={color}
                      onClick={() => onChange(color)}
                      className="w-8 h-8 rounded border-2 border-border hover:scale-110 transition-transform"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      );

    case 'textarea':
      return (
        <div className="space-y-2">
          <Label htmlFor={propKey} className="text-sm font-medium">
            {propDef.label}
          </Label>
          {propDef.description && (
            <p className="text-xs text-muted-foreground">{propDef.description}</p>
          )}
          <Textarea
            id={propKey}
            value={currentValue || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={propDef.default}
            rows={3}
            className="w-full resize-none"
          />
        </div>
      );

    case 'input':
    case 'string':
    default:
      return (
        <div className="space-y-2">
          <Label htmlFor={propKey} className="text-sm font-medium">
            {propDef.label}
          </Label>
          {propDef.description && (
            <p className="text-xs text-muted-foreground">{propDef.description}</p>
          )}
          <Input
            id={propKey}
            type="text"
            value={currentValue || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={propDef.default}
            className="w-full"
          />
        </div>
      );
  }
};

/**
 * Main ReactBits Settings Editor
 */
export const ReactBitsSettingsEditor: React.FC<ReactBitsSettingsEditorProps> = ({
  component,
  onChange,
}) => {
  const reactBitsId = component.props?.reactBitsId;
  const catalogEntry = reactBitsId ? REACTBITS_CATALOG[reactBitsId] : undefined;

  if (!catalogEntry) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Component definition not found: {reactBitsId || 'unknown'}
      </div>
    );
  }

  const handlePropChange = (propKey: string, value: any) => {
    const newProps = {
      ...component.props,
      [propKey]: value,
    };
    onChange(newProps);
  };

  // Group props by their group field
  const groupedProps: Record<string, [string, PropDefinition][]> = {};
  Object.entries(catalogEntry.propsSchema).forEach(([key, def]) => {
    const group = def.group || 'General';
    if (!groupedProps[group]) {
      groupedProps[group] = [];
    }
    groupedProps[group].push([key, def]);
  });

  return (
    <div className="space-y-4 p-1">
      {/* Header with gradient accent */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent rounded-lg" />
        <div className="relative p-4 flex items-start gap-3">
          <div className="flex-1">
            <h3 className="text-lg font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              {catalogEntry.displayName}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">{catalogEntry.description}</p>
          </div>
          {catalogEntry.quality && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    className="gap-1 bg-primary/10 border-primary/20 text-primary font-semibold"
                  >
                    <span className="text-xs">★</span>
                    <span>{catalogEntry.quality}/10</span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Component quality rating</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Tags with better styling */}
      {catalogEntry.tags && catalogEntry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-1">
          {catalogEntry.tags.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="text-xs bg-muted/50 hover:bg-muted transition-colors"
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}

      <Separator className="bg-border/50" />

      {/* Properties with improved layout */}
      <ScrollArea className="h-[500px] pr-4">
        <div className="space-y-6 px-1">
          {Object.entries(groupedProps).map(([groupName, props]) => (
            <div key={groupName} className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
                <h4 className="text-xs font-bold text-primary uppercase tracking-wider">
                  {groupName}
                </h4>
                <div className="h-px flex-1 bg-gradient-to-l from-border to-transparent" />
              </div>
              <div className="space-y-4 pl-1">
                {props.map(([propKey, propDef]) => (
                  <PropControl
                    key={propKey}
                    propKey={propKey}
                    propDef={propDef}
                    value={component.props[propKey]}
                    onChange={(value) => handlePropChange(propKey, value)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <Separator className="bg-border/50" />

      {/* Dependencies with icon */}
      {catalogEntry.dependencies.length > 0 && (
        <div className="rounded-lg bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="w-4 h-4 text-primary" />
            <span className="font-medium">Dependencies:</span>
            <span>{catalogEntry.dependencies.join(', ')}</span>
          </div>
        </div>
      )}
    </div>
  );
};
