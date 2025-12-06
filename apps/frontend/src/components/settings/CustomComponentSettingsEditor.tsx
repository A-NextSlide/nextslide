import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ComponentInstance } from '@/types/components';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Code, Zap, Type, Image, ChevronDown, ChevronRight, Maximize2, Square } from 'lucide-react';
import { parseCustomComponentCode, ParsedVariable, convertToPropsBasedCode } from '@/utils/customComponentParser';
import AdvancedCodeEditor from '@/components/ui/AdvancedCodeEditor';
import { Textarea } from '@/components/ui/textarea';
import { FontLoadingService } from '@/services/FontLoadingService';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { HexColorPicker } from 'react-colorful';
import EditableDropdown from '@/components/settings/EditableDropdown';
import GroupedDropdown from '@/components/settings/GroupedDropdown';
import ImageSlotEditor from '@/components/settings/ImageSlotEditor';
import { FONT_CATEGORIES } from '@/registry/library/fonts';
import { Checkbox } from '@/components/ui/checkbox';
import { useCustomComponentEditStore } from '@/stores/customComponentEditStore';
import { VirtualElement } from '@/components/custom-component-editor/types';

interface CustomComponentSettingsEditorProps {
  component: ComponentInstance;
  onUpdate: (propUpdates: Record<string, any>) => void;
  handlePropChange: (propName: string, value: any, skipHistory?: boolean) => void;
  saveComponentToHistory: (message?: string) => void;
}

// Text input component with local state to prevent cursor jumping
const TextInput: React.FC<{
  variable: ParsedVariable;
  currentValue: any;
  updateProp: (propName: string, value: any) => void;
  saveChanges: (propName: string, label: string) => void;
}> = ({ variable, currentValue, updateProp, saveChanges }) => {
  const [localValue, setLocalValue] = useState(currentValue || '');
  const [isTyping, setIsTyping] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();
  
  // Update local value when external value changes (but not while typing)
  useEffect(() => {
    if (!isTyping) {
      setLocalValue(currentValue || '');
    }
  }, [currentValue, isTyping]);
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    setIsTyping(true);
    
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Update immediately for real-time feedback
    updateProp(variable.name, newValue);
    
    // Reset typing state after a short delay (compact debounce but still realtime)
    timeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 120);
  };
  
  const handleBlur = () => {
    // Clear timeout and update immediately on blur
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    updateProp(variable.name, localValue);
    saveChanges(variable.name, variable.label || variable.name);
    setIsTyping(false);
  };
  
  return (
    <div className="space-y-1">
      <Label className="text-xs">{variable.label}</Label>
      <Input
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        className="w-full h-7 text-[11px]"
        placeholder={String(variable.defaultValue)}
      />
    </div>
  );
};

// Dynamic text element editor with font, color, size controls
const DynamicTextEditor: React.FC<{
  element: VirtualElement;
  onStyleUpdate: (selector: string, property: string, value: string) => void;
  onTextUpdate: (elementId: string, newText: string) => void;
  onSave: (message?: string) => void;
}> = ({ element, onStyleUpdate, onTextUpdate, onSave }) => {
  const [localText, setLocalText] = useState(element.textContent || '');
  const [fontCategories, setFontCategories] = useState<Record<string, string[]>>({});
  const [allFonts, setAllFonts] = useState<string[]>([]);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try { await FontLoadingService.syncDesignerFonts?.(); } catch {}
      setFontCategories(FontLoadingService.getDedupedFontGroups?.() || FontLoadingService.getFontCategories());
      setAllFonts(FontLoadingService.getAllFontNames());
    })();
  }, []);

  useEffect(() => {
    setLocalText(element.textContent || '');
  }, [element.textContent]);

  const fontSize = useMemo(() => {
    if (!element.computedStyle?.fontSize) return 16;
    const parsed = parseInt(element.computedStyle.fontSize, 10);
    return isNaN(parsed) ? 16 : parsed;
  }, [element.computedStyle?.fontSize]);

  const maxFontSize = useMemo(() => {
    const tag = element.tagName.toLowerCase();
    if (tag === 'h1') return 200;
    if (tag === 'h2') return 150;
    if (tag === 'h3' || tag === 'h4') return 100;
    return 72;
  }, [element.tagName]);

  // Normalize font family for display
  const currentFont = useMemo(() => {
    const ff = element.computedStyle?.fontFamily;
    if (!ff) return '';
    return ff.split(',')[0].trim().replace(/['"]/g, '');
  }, [element.computedStyle?.fontFamily]);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Text</Label>
        <Textarea
          value={localText}
          onChange={(e) => {
            setLocalText(e.target.value);
            onTextUpdate(element.id, e.target.value);
          }}
          onBlur={() => onSave('Updated text')}
          className="w-full text-[11px] min-h-[60px] resize-none"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Font</Label>
        <GroupedDropdown
          value={currentFont}
          options={allFonts}
          groups={fontCategories}
          onChange={(value) => {
            onStyleUpdate(element.selector, 'fontFamily', value);
            FontLoadingService.loadFont(value).catch(() => {});
            onSave('Changed font');
          }}
          placeholder="Select font"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Size</Label>
        <div className="flex items-center gap-2">
          <Slider
            min={8}
            max={maxFontSize}
            step={1}
            value={[fontSize]}
            onValueChange={(values) => onStyleUpdate(element.selector, 'fontSize', `${values[0]}px`)}
            onPointerUp={() => onSave('Changed font size')}
            className="flex-grow"
          />
          <span className="text-xs w-12 text-right">{fontSize}px</span>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Weight</Label>
        <div className="flex gap-1 flex-wrap">
          {['300', '400', '500', '600', '700', '800'].map((weight) => (
            <Button
              key={weight}
              variant={element.computedStyle?.fontWeight === weight ? 'default' : 'outline'}
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => {
                onStyleUpdate(element.selector, 'fontWeight', weight);
                onSave('Changed font weight');
              }}
            >
              {weight === '300' ? 'Light' :
               weight === '400' ? 'Reg' :
               weight === '500' ? 'Med' :
               weight === '600' ? 'Semi' :
               weight === '700' ? 'Bold' : 'Ex'}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Color</Label>
        <div className="flex items-center gap-2">
          <Popover open={colorPickerOpen} onOpenChange={(open) => {
            setColorPickerOpen(open);
            if (!open) onSave('Changed color');
          }}>
            <PopoverTrigger asChild>
              <button
                className="w-7 h-7 rounded-md border cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500"
                style={{ backgroundColor: element.computedStyle?.color || '#000000' }}
              />
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="start">
              <HexColorPicker
                color={element.computedStyle?.color || '#000000'}
                onChange={(color) => onStyleUpdate(element.selector, 'color', color)}
              />
            </PopoverContent>
          </Popover>
          <Input
            value={element.computedStyle?.color || ''}
            onChange={(e) => onStyleUpdate(element.selector, 'color', e.target.value)}
            onBlur={() => onSave('Changed color')}
            className="flex-1 h-7 text-[11px] font-mono"
            placeholder="#000000"
          />
        </div>
      </div>
    </div>
  );
};

// Dynamic image element editor
const DynamicImageEditor: React.FC<{
  element: VirtualElement;
  componentId: string;
  onImageUpdate: (elementId: string, newSrc: string) => void;
  onStyleUpdate: (selector: string, property: string, value: string) => void;
  onSave: (message?: string) => void;
}> = ({ element, componentId, onImageUpdate, onStyleUpdate, onSave }) => {
  const searchQuery = useMemo(() => {
    if (element.alt && element.alt.length > 2 && !element.alt.toLowerCase().includes('placeholder')) {
      return element.alt.replace(/[^a-zA-Z0-9\s]/g, ' ').trim().toLowerCase();
    }
    return 'image';
  }, [element.alt]);

  return (
    <ImageSlotEditor
      propName={element.id}
      label={element.alt || 'Image'}
      value={element.src}
      searchQuery={searchQuery}
      objectFit={(element.computedStyle?.height && element.computedStyle?.width) ? 'cover' : 'contain'}
      componentId={componentId}
      onUpdate={(propName, imageUrl) => {
        onImageUpdate(element.id, imageUrl);
      }}
      onSave={(propName, label) => {
        onSave(`Updated ${label}`);
      }}
      onObjectFitChange={(fit) => {
        onStyleUpdate(element.selector, 'objectFit', fit);
        onSave('Changed image fit');
      }}
    />
  );
};

// Dynamic container/box editor with background, border, padding controls
const DynamicContainerEditor: React.FC<{
  element: VirtualElement;
  onStyleUpdate: (selector: string, property: string, value: string) => void;
  onSave: (message?: string) => void;
}> = ({ element, onStyleUpdate, onSave }) => {
  const [bgColorOpen, setBgColorOpen] = useState(false);
  const [borderColorOpen, setBorderColorOpen] = useState(false);

  // Parse current values from computed style
  const bgColor = element.computedStyle?.position ? undefined : '#ffffff'; // placeholder
  const borderRadius = useMemo(() => {
    // Try to extract from computed style or default
    return 0;
  }, []);

  return (
    <div className="space-y-3">
      {/* Background Color */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Background</Label>
        <div className="flex items-center gap-2">
          <Popover open={bgColorOpen} onOpenChange={(open) => {
            setBgColorOpen(open);
            if (!open) onSave('Changed background');
          }}>
            <PopoverTrigger asChild>
              <button
                className="w-7 h-7 rounded-md border cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500"
                style={{ backgroundColor: '#f0f0f0' }}
              />
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="start">
              <HexColorPicker
                color="#f0f0f0"
                onChange={(color) => onStyleUpdate(element.selector, 'backgroundColor', color)}
              />
            </PopoverContent>
          </Popover>
          <Input
            placeholder="#ffffff"
            onChange={(e) => onStyleUpdate(element.selector, 'backgroundColor', e.target.value)}
            onBlur={() => onSave('Changed background')}
            className="flex-1 h-7 text-[11px] font-mono"
          />
        </div>
      </div>

      {/* Border Radius */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Corner Radius</Label>
        <div className="flex items-center gap-2">
          <Slider
            min={0}
            max={50}
            step={1}
            value={[borderRadius]}
            onValueChange={(values) => onStyleUpdate(element.selector, 'borderRadius', `${values[0]}px`)}
            onPointerUp={() => onSave('Changed border radius')}
            className="flex-grow"
          />
          <span className="text-xs w-10 text-right">{borderRadius}px</span>
        </div>
      </div>

      {/* Padding */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Padding</Label>
        <div className="flex items-center gap-2">
          <Slider
            min={0}
            max={100}
            step={4}
            value={[16]}
            onValueChange={(values) => onStyleUpdate(element.selector, 'padding', `${values[0]}px`)}
            onPointerUp={() => onSave('Changed padding')}
            className="flex-grow"
          />
          <span className="text-xs w-10 text-right">16px</span>
        </div>
      </div>

      {/* Border */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Border</Label>
        <div className="flex items-center gap-2">
          <Popover open={borderColorOpen} onOpenChange={(open) => {
            setBorderColorOpen(open);
            if (!open) onSave('Changed border');
          }}>
            <PopoverTrigger asChild>
              <button
                className="w-7 h-7 rounded-md border-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500"
                style={{ borderColor: '#e0e0e0' }}
              />
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="start">
              <HexColorPicker
                color="#e0e0e0"
                onChange={(color) => onStyleUpdate(element.selector, 'borderColor', color)}
              />
            </PopoverContent>
          </Popover>
          <Select
            defaultValue="none"
            onValueChange={(value) => {
              if (value === 'none') {
                onStyleUpdate(element.selector, 'border', 'none');
              } else {
                onStyleUpdate(element.selector, 'border', `${value} solid #e0e0e0`);
              }
              onSave('Changed border');
            }}
          >
            <SelectTrigger className="h-7 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="1px">1px</SelectItem>
              <SelectItem value="2px">2px</SelectItem>
              <SelectItem value="3px">3px</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};

const CustomComponentSettingsEditor: React.FC<CustomComponentSettingsEditorProps> = ({
  component,
  onUpdate,
  handlePropChange,
  saveComponentToHistory,
}) => {
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState<Record<string, boolean>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    text: true,
    images: true,
    containers: false,
  });

  // Get detected elements from the custom component edit store
  const { activeComponentId, detectedElements, selectedElement, updateElementStyle, updateElementText, updateElementImage } = useCustomComponentEditStore();

  // Only use store data if it matches this component
  const isActiveComponent = activeComponentId === component.id;
  const activeDetectedElements = isActiveComponent ? detectedElements : [];
  const activeSelectedElement = isActiveComponent ? selectedElement : null;

  // Check if this is an HTML-based component (iframe)
  const isHtmlComponent = useMemo(() => {
    const render = (component.props.render as string) || '';
    return render.trim().toLowerCase().startsWith('<!doctype') ||
           render.trim().toLowerCase().startsWith('<html');
  }, [component.props.render]);
  // Stabilize function props for use inside effects without re-triggering deps
  const handlePropChangeRef = useRef(handlePropChange);
  const saveComponentToHistoryRef = useRef(saveComponentToHistory);
  useEffect(() => { handlePropChangeRef.current = handlePropChange; }, [handlePropChange]);
  useEffect(() => { saveComponentToHistoryRef.current = saveComponentToHistory; }, [saveComponentToHistory]);
  
  // Normalize stored code to real newlines/tabs for editing and parsing
  const renderCode = useMemo(() => {
    const raw = (component.props.render as string) || '';
    if (raw.includes('\\n') || raw.includes('\\t') || raw.includes('\\"') || raw.includes("\\'")) {
      return raw
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, '\\');
    }
    return raw;
  }, [component.props.render]);
  const { variables, suggestions } = useMemo(() => {
    if (!renderCode) {
      return { variables: [], suggestions: [] as ParsedVariable[] };
    }
    const parseResult = parseCustomComponentCode(renderCode);
    return { variables: parseResult.variables, suggestions: parseResult.suggestions };
  }, [renderCode, component.id]); // Re-parse when component changes

  // Get current props (must be defined before effects that depend on it)
  const componentProps = component.props.props || {};

  // Auto-apply disabled to avoid injecting unexpected props. Users can apply manually.

  // Track selected suggestions to convert into props
  const [selectedSuggestions, setSelectedSuggestions] = useState<Record<string, boolean>>({});
  const allSelected = useMemo(() => suggestions.length > 0 && suggestions.every(s => selectedSuggestions[s.name]), [suggestions, selectedSuggestions]);
  const toggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    for (const s of suggestions) next[s.name] = checked;
    setSelectedSuggestions(next);
  };

  const applyAcceptedSuggestions = () => {
    const renderCode = (component.props.render as string) || '';
    const accepted = suggestions.filter(s => selectedSuggestions[s.name]);
    if (accepted.length === 0) return;
    const newCode = convertToPropsBasedCode(renderCode, accepted);
    handlePropChange('render', newCode, true);
    saveComponentToHistory('Converted hardcoded values to props');
    // Clear selection after apply
    setSelectedSuggestions({});
  };
  
  // Initialize props if they don't exist
  useEffect(() => {
    if (!component.props.props) {
      handlePropChangeRef.current('props', {}, true);
    }
  }, [component.id, component.props.props]);

  // Fix HTML rendering issue: ensure blank line after <html> tag
  // This fixes iframe rendering issues with custom components
  useEffect(() => {
    const raw = (component.props.render as string) || '';
    // Check if it's an HTML document that needs fixing
    if (raw.toLowerCase().includes('<html')) {
      // Ensure blank line (two newlines) after <html> tag
      const fixed = raw.replace(/(<html[^>]*>)\s*\n?\s*/gi, '$1\n\n');
      if (fixed !== raw) {
        handlePropChangeRef.current('render', fixed, true);
      }
    }
  }, [component.id]);
  
  // Handle prop updates
  const updateProp = useCallback((propName: string, value: any) => {
    const newProps = { ...componentProps, [propName]: value };
    handlePropChange('props', newProps, true);
  }, [componentProps, handlePropChange]);
  
  // Save changes and update code
  const saveChanges = useCallback((propName: string, label: string) => {
    saveComponentToHistory(`Updated ${label}`);
  }, [saveComponentToHistory]);
  
  // Render control for a variable
  const renderVariableControl = (variable: ParsedVariable) => {
    const currentValue = componentProps[variable.name] ?? variable.defaultValue;
    
    switch (variable.type) {
      case 'text':
        // Font-family like fields should render a font selector
        if (variable.name.toLowerCase().includes('font')) {
          const [categories, setCategories] = useState<Record<string, string[]>>(FontLoadingService.getDedupedFontGroups?.() || FontLoadingService.getFontCategories());
          const [allFonts, setAllFonts] = useState<string[]>(FontLoadingService.getAllFontNames());
          useEffect(() => {
            (async () => {
              try { await FontLoadingService.syncDesignerFonts?.(); } catch {}
              setCategories(FontLoadingService.getDedupedFontGroups?.() || FontLoadingService.getFontCategories());
              setAllFonts(FontLoadingService.getAllFontNames());
            })();
          }, []);
          return (
            <div key={variable.name} className="space-y-1">
              <Label className="text-xs">{variable.label}</Label>
              <GroupedDropdown
                value={currentValue || ''}
                options={allFonts}
                groups={categories}
                onChange={(value) => {
                  updateProp(variable.name, value);
                  FontLoadingService.syncDesignerFonts?.().finally(() => {
                    FontLoadingService.loadFont(String(value)).catch(() => {});
                  });
                  saveChanges(variable.name, variable.label || variable.name);
                }}
                placeholder="Select font"
              />
            </div>
          );
        }
        return (
          <TextInput
            key={variable.name}
            variable={variable}
            currentValue={currentValue}
            updateProp={updateProp}
            saveChanges={saveChanges}
          />
        );
      
      case 'number':
        const useInput = (variable.max && variable.max >= 10000) || 
                        variable.name.toLowerCase().includes('target') ||
                        variable.name.toLowerCase().includes('index');
        
        if (useInput) {
          return (
            <div key={variable.name} className="space-y-1">
              <Label className="text-xs">{variable.label}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={currentValue || 0}
                  onChange={(e) => updateProp(variable.name, parseFloat(e.target.value) || 0)}
                  onBlur={() => saveChanges(variable.name, variable.label || variable.name)}
                  className="w-full h-8 text-xs"
                  min={variable.min}
                  max={variable.max}
                  step={variable.step}
                />
                {variable.unit && <span className="text-xs text-muted-foreground">{variable.unit}</span>}
              </div>
            </div>
          );
        }
        
        return (
          <div key={variable.name} className="space-y-1">
            <Label className="text-xs">{variable.label}</Label>
            <div className="flex items-center gap-2">
              <Slider
                min={variable.min ?? 0}
                max={variable.max ?? 100}
                step={variable.step ?? 1}
                value={[currentValue || 0]}
                onValueChange={(values) => updateProp(variable.name, values[0])}
                onPointerUp={() => saveChanges(variable.name, variable.label || variable.name)}
                className="flex-grow"
              />
              <span className="text-xs w-12 text-right">
                {currentValue || 0}{variable.unit || ''}
              </span>
            </div>
          </div>
        );
      
      case 'color':
        const isOpen = colorPickerOpen[variable.name] || false;
        
        return (
          <div key={variable.name} className="space-y-1">
            <Label className="text-xs">{variable.label}</Label>
            <div className="flex items-center gap-2">
              <Popover open={isOpen} onOpenChange={(open) => {
                setColorPickerOpen(prev => ({ ...prev, [variable.name]: open }));
                if (!open) {
                  saveChanges(variable.name, variable.label || variable.name);
                }
              }}>
                <PopoverTrigger asChild>
                  <button 
                    className="w-6 h-6 rounded-md border cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500" 
                    style={{ backgroundColor: currentValue || '#000000' }}
                    aria-label={`Choose color for ${variable.label}`}
                  />
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" align="start">
                  <HexColorPicker 
                    color={currentValue || '#000000'} 
                    onChange={(color) => updateProp(variable.name, color)}
                  />
                  <Input
                    value={currentValue || ''}
                    onChange={(e) => updateProp(variable.name, e.target.value)}
                    className="mt-2 h-7 text-[11px] font-mono"
                    placeholder="#000000"
                  />
                </PopoverContent>
              </Popover>
              <Input
                value={currentValue || ''}
                onChange={(e) => updateProp(variable.name, e.target.value)}
                onBlur={() => saveChanges(variable.name, variable.label || variable.name)}
                className="flex-1 h-7 text-[11px] font-mono"
                placeholder="#000000"
              />
            </div>
          </div>
        );
      
      case 'boolean':
        return (
          <div key={variable.name} className="flex items-center justify-between space-x-2">
            <Label className="text-xs">{variable.label}</Label>
            <Switch
              checked={currentValue || false}
              onCheckedChange={(checked) => {
                updateProp(variable.name, checked);
                saveChanges(variable.name, variable.label || variable.name);
              }}
            />
          </div>
        );
      
      case 'select':
        return (
          <div key={variable.name} className="space-y-1">
            <Label className="text-xs">{variable.label}</Label>
            <Select
              value={currentValue || ''}
              onValueChange={(value) => {
                updateProp(variable.name, value);
                saveChanges(variable.name, variable.label || variable.name);
              }}
            >
              <SelectTrigger className="w-full h-8 text-xs">
                <SelectValue placeholder="Select option" />
              </SelectTrigger>
              <SelectContent>
                {variable.options?.map((option) => (
                  <SelectItem key={option} value={option} className="text-xs">
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      case 'image':
        const imageFitKey = `${variable.name}_objectFit`;
        const currentFit = componentProps[imageFitKey] || variable.objectFit || 'cover';
        return (
          <ImageSlotEditor
            key={variable.name}
            propName={variable.name}
            label={variable.label || variable.name}
            value={currentValue}
            searchQuery={variable.searchQuery}
            objectFit={currentFit}
            componentId={component.id}
            onUpdate={updateProp}
            onSave={saveChanges}
            onObjectFitChange={(fit) => {
              updateProp(imageFitKey, fit);
              saveChanges(imageFitKey, `${variable.label || variable.name} fit`);
            }}
          />
        );

      default:
        return null;
    }
  };
  
  // Group variables by type
  const groupedVariables = useMemo(() => {
    const groups: Record<string, ParsedVariable[]> = {
      text: [],
      number: [],
      color: [],
      boolean: [],
      select: [],
      image: [],
    };

    variables.forEach((variable) => {
      if (groups[variable.type]) {
        groups[variable.type].push(variable);
      }
    });

    return groups;
  }, [variables]);

  // Detect ALL images in HTML documents (for iframe mode) - both placeholders and real images
  const htmlPlaceholderImages = useMemo(() => {
    if (!renderCode) {
      console.log('[CustomComponentSettings] No renderCode');
      return [];
    }

    // Clean up the code for detection - remove leading whitespace, comments, etc.
    const trimmedCode = renderCode.trim().toLowerCase();

    // More flexible HTML detection - check for doctype, html tag, or common HTML elements
    const isHtmlDoc =
      trimmedCode.startsWith('<!doctype html') ||
      trimmedCode.startsWith('<html') ||
      trimmedCode.includes('<!doctype html') ||
      trimmedCode.includes('<html') ||
      (trimmedCode.includes('<head') && trimmedCode.includes('<body')) ||
      (trimmedCode.includes('<style') && trimmedCode.includes('<img'));

    console.log('[CustomComponentSettings] Checking HTML document:', {
      isHtmlDoc,
      hasDoctype: trimmedCode.includes('<!doctype html'),
      hasHtmlTag: trimmedCode.includes('<html'),
      hasHead: trimmedCode.includes('<head'),
      hasBody: trimmedCode.includes('<body'),
      hasImg: trimmedCode.includes('<img'),
      codeLength: trimmedCode.length,
      first100Chars: trimmedCode.slice(0, 100)
    });

    // Only process HTML documents
    if (!isHtmlDoc) return [];

    const images: Array<{ alt: string; searchQuery: string; currentSrc: string; index: number }> = [];
    const imgRegex = /<img[^>]*>/gi;
    let match;
    let index = 0;

    while ((match = imgRegex.exec(renderCode)) !== null) {
      const imgTag = match[0];
      const srcMatch = imgTag.match(/src=["']([^"']*)["']/i);
      const altMatch = imgTag.match(/alt=["']([^"']*)["']/i);
      const src = srcMatch?.[1] || '';
      const alt = altMatch?.[1] || `Image ${index + 1}`;

      // Convert alt to search query
      const searchQuery = alt
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .trim()
        .toLowerCase() || 'image';

      // Include ALL images - whether placeholder or real URL
      // This allows users to swap any image
      images.push({
        alt,
        searchQuery,
        currentSrc: src.startsWith('http') || src.startsWith('data:') || src.startsWith('//') ? src : '',
        index,
      });

      index++;
    }

    console.log('[CustomComponentSettings] Found HTML images:', images.length, images);
    return images;
  }, [renderCode]);

  // Unified text editor: combine all text props into a single textarea separated by newlines
  const nonFontTextVariables = useMemo(() => groupedVariables.text.filter(v => !v.name.toLowerCase().includes('font')), [groupedVariables.text]);
  const [combinedTextValue, setCombinedTextValue] = useState<string>('');
  const bulkTypingRef = useRef<NodeJS.Timeout | null>(null);
  const isBulkTypingRef = useRef<boolean>(false);
  useEffect(() => {
    if (isBulkTypingRef.current) return; // don't override while user is typing
    const value = nonFontTextVariables
      .map(v => String(componentProps[v.name] ?? v.defaultValue ?? ''))
      .join('\n');
    setCombinedTextValue(value);
  }, [componentProps, nonFontTextVariables]);

  const handleCombinedTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setCombinedTextValue(text);
    isBulkTypingRef.current = true;
    if (bulkTypingRef.current) clearTimeout(bulkTypingRef.current);

    const lines = text.split('\n');
    // Build a single props update with only changed values
    const changes: Record<string, any> = {};
    nonFontTextVariables.forEach((v, idx) => {
      const nextVal = lines[idx] ?? '';
      const currentVal = String(componentProps[v.name] ?? v.defaultValue ?? '');
      if (nextVal !== currentVal) {
        changes[v.name] = nextVal;
      }
    });
    if (Object.keys(changes).length > 0) {
      handlePropChange('props', { ...componentProps, ...changes }, true);
    }

    // Small debounce to re-enable syncing from props
    bulkTypingRef.current = setTimeout(() => {
      isBulkTypingRef.current = false;
    }, 150);
  };
  
  return (
    <div className="space-y-3">
      {/* Component Settings Header */}
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-blue-500" />
        <h3 className="text-xs font-medium">Custom Property</h3>
      </div>
      <Dialog open={showCodeEditor} onOpenChange={setShowCodeEditor}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px] mt-2"
          >
            <Code className="w-3 h-3 mr-1" />
            code editor
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto overscroll-contain">
          <DialogHeader>
            <DialogTitle>Custom Component Code Editor</DialogTitle>
            <DialogDescription>
              Edit your custom component's React code.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <AdvancedCodeEditor
              value={renderCode}
              onChange={(value) => {
                // Store exactly what user types (unescaped newlines)
                handlePropChangeRef.current('render', value, true);
              }}
              onBlur={() => saveComponentToHistoryRef.current('Updated component code')}
              minHeight="400px"
              maxHeight="60vh"
            />
            <div className="mt-4 text-xs text-muted-foreground space-y-1">
              <p>• Use <code className="bg-muted px-1 rounded">const propName = props.propName || defaultValue;</code> to create editable properties</p>
              <p>• The component must define a <code className="bg-muted px-1 rounded">render</code> function</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dynamic Element Editor for HTML components */}
      {isHtmlComponent && isActiveComponent && activeDetectedElements.length > 0 && (
        <div className="space-y-3 border-t pt-3">
          {/* Selected Element Editor */}
          {activeSelectedElement && (
            <div className="space-y-2 p-2 bg-muted/30 rounded-lg border border-pink-200">
              <div className="flex items-center gap-2 pb-1 border-b border-pink-200/50">
                {activeSelectedElement.type === 'text' && <Type className="w-3 h-3 text-blue-500" />}
                {activeSelectedElement.type === 'image' && <Image className="w-3 h-3 text-green-500" />}
                {activeSelectedElement.type === 'container' && <Maximize2 className="w-3 h-3 text-purple-500" />}
                <span className="text-[10px] font-medium text-pink-600">
                  Selected: {activeSelectedElement.type === 'text'
                    ? (activeSelectedElement.textContent?.slice(0, 25) + (activeSelectedElement.textContent && activeSelectedElement.textContent.length > 25 ? '...' : ''))
                    : activeSelectedElement.alt || `${activeSelectedElement.tagName}`}
                </span>
              </div>

              {activeSelectedElement.type === 'text' && (
                <DynamicTextEditor
                  element={activeSelectedElement}
                  onStyleUpdate={updateElementStyle}
                  onTextUpdate={updateElementText}
                  onSave={saveComponentToHistory}
                />
              )}

              {activeSelectedElement.type === 'image' && (
                <DynamicImageEditor
                  element={activeSelectedElement}
                  componentId={component.id}
                  onImageUpdate={updateElementImage}
                  onStyleUpdate={updateElementStyle}
                  onSave={saveComponentToHistory}
                />
              )}

              {activeSelectedElement.type === 'container' && (
                <DynamicContainerEditor
                  element={activeSelectedElement}
                  onStyleUpdate={updateElementStyle}
                  onSave={saveComponentToHistory}
                />
              )}
            </div>
          )}

          {/* All Detected Elements - collapsible sections */}
          {!activeSelectedElement && (
            <>
              {/* Text Elements */}
              {activeDetectedElements.filter(e => e.type === 'text').length > 0 && (
                <div className="space-y-2">
                  <button
                    onClick={() => setExpandedSections(prev => ({ ...prev, text: !prev.text }))}
                    className="flex items-center gap-2 w-full text-left py-1 hover:bg-muted/50 rounded px-1 -mx-1"
                  >
                    {expandedSections.text ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    <Type className="w-3 h-3 text-blue-500" />
                    <span className="text-xs font-medium">Text ({activeDetectedElements.filter(e => e.type === 'text').length})</span>
                  </button>

                  {expandedSections.text && (
                    <div className="space-y-3 pl-4">
                      {activeDetectedElements.filter(e => e.type === 'text').map((element, index) => (
                        <div key={element.id} className="space-y-2 pb-2 border-b last:border-0">
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                            {element.tagName} - {element.textContent?.slice(0, 20)}...
                          </div>
                          <DynamicTextEditor
                            element={element}
                            onStyleUpdate={updateElementStyle}
                            onTextUpdate={updateElementText}
                            onSave={saveComponentToHistory}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Image Elements */}
              {activeDetectedElements.filter(e => e.type === 'image').length > 0 && (
                <div className="space-y-2">
                  <button
                    onClick={() => setExpandedSections(prev => ({ ...prev, images: !prev.images }))}
                    className="flex items-center gap-2 w-full text-left py-1 hover:bg-muted/50 rounded px-1 -mx-1"
                  >
                    {expandedSections.images ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    <Image className="w-3 h-3 text-green-500" />
                    <span className="text-xs font-medium">Images ({activeDetectedElements.filter(e => e.type === 'image').length})</span>
                  </button>

                  {expandedSections.images && (
                    <div className="space-y-3 pl-4">
                      {activeDetectedElements.filter(e => e.type === 'image').map((element, index) => (
                        <div key={element.id} className="space-y-2 pb-2 border-b last:border-0">
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                            {element.alt || `Image ${index + 1}`}
                          </div>
                          <DynamicImageEditor
                            element={element}
                            componentId={component.id}
                            onImageUpdate={updateElementImage}
                            onStyleUpdate={updateElementStyle}
                            onSave={saveComponentToHistory}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Container/Box Elements */}
              {activeDetectedElements.filter(e => e.type === 'container').length > 0 && (
                <div className="space-y-2">
                  <button
                    onClick={() => setExpandedSections(prev => ({ ...prev, containers: !prev.containers }))}
                    className="flex items-center gap-2 w-full text-left py-1 hover:bg-muted/50 rounded px-1 -mx-1"
                  >
                    {expandedSections.containers ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    <Square className="w-3 h-3 text-purple-500" />
                    <span className="text-xs font-medium">Boxes ({activeDetectedElements.filter(e => e.type === 'container').length})</span>
                  </button>

                  {expandedSections.containers && (
                    <div className="space-y-3 pl-4">
                      {activeDetectedElements.filter(e => e.type === 'container').map((element, index) => (
                        <div key={element.id} className="space-y-2 pb-2 border-b last:border-0">
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                            {element.tagName} {index + 1}
                          </div>
                          <DynamicContainerEditor
                            element={element}
                            onStyleUpdate={updateElementStyle}
                            onSave={saveComponentToHistory}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Hint when no element selected */}
          {!activeSelectedElement && (
            <p className="text-[10px] text-muted-foreground text-center py-1">
              Click an element on the slide to edit it
            </p>
          )}
        </div>
      )}

      {/* Loading state for HTML components waiting for element detection */}
      {isHtmlComponent && !isActiveComponent && (
        <div className="space-y-2 border-t pt-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-3 h-3 border-2 border-pink-300 border-t-transparent rounded-full animate-spin" />
            <span>Detecting editable elements...</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Click on the slide to edit text, images, and styles.
          </p>
        </div>
      )}

      {/* HTML Slide Images - shown for HTML documents regardless of parsed variables */}
      {htmlPlaceholderImages.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground">
            Slide Images ({htmlPlaceholderImages.length})
          </h4>
          <div className="grid grid-cols-1 gap-4">
            {htmlPlaceholderImages.map((imageInfo, idx) => {
              const htmlFitKey = `htmlImage${idx}_objectFit`;
              const htmlImageFit = componentProps[htmlFitKey] || 'cover';
              return (
                <ImageSlotEditor
                  key={`html-image-${idx}-${imageInfo.alt}`}
                  propName={`Image${idx + 1}`}
                  label={imageInfo.alt}
                  value={imageInfo.currentSrc}
                  searchQuery={imageInfo.searchQuery}
                  objectFit={htmlImageFit}
                  componentId={component.id}
                  onUpdate={(propName, imageUrl) => {
                    // Update the HTML directly by replacing the image src
                    let currentHtml = component.props.render as string;
                    let currentIndex = 0;
                    let replaced = false;

                    currentHtml = currentHtml.replace(/<img([^>]*)>/gi, (imgMatch, attrs) => {
                      if (replaced) {
                        currentIndex++;
                        return imgMatch;
                      }

                      if (currentIndex === imageInfo.index) {
                        replaced = true;
                        if (attrs.includes('src=')) {
                          const newAttrs = attrs.replace(/src=["'][^"']*["']/i, `src="${imageUrl}"`);
                          return `<img${newAttrs}>`;
                        } else {
                          return `<img src="${imageUrl}"${attrs}>`;
                        }
                      }
                      currentIndex++;
                      return imgMatch;
                    });

                    if (replaced) {
                      handlePropChange('render', currentHtml, true);
                    }
                  }}
                  onSave={(propName, label) => {
                    saveComponentToHistory(`Updated image: ${label}`);
                  }}
                  onObjectFitChange={(fit) => {
                    // Update object-fit in HTML style attribute
                    let currentHtml = component.props.render as string;
                    let currentIndex = 0;
                    let replaced = false;

                    currentHtml = currentHtml.replace(/<img([^>]*)>/gi, (imgMatch, attrs) => {
                      if (replaced) {
                        currentIndex++;
                        return imgMatch;
                      }

                      if (currentIndex === imageInfo.index) {
                        replaced = true;
                        // Check if style attribute exists
                        if (attrs.includes('style=')) {
                          // Update or add object-fit in existing style
                          const newAttrs = attrs.replace(
                            /style=["']([^"']*)["']/i,
                            (styleMatch, styleContent) => {
                              const hasObjectFit = /object-fit\s*:\s*[^;]+;?/i.test(styleContent);
                              if (hasObjectFit) {
                                return `style="${styleContent.replace(/object-fit\s*:\s*[^;]+;?/i, `object-fit: ${fit};`)}"`;
                              } else {
                                return `style="${styleContent}; object-fit: ${fit};"`;
                              }
                            }
                          );
                          return `<img${newAttrs}>`;
                        } else {
                          // Add style attribute
                          return `<img style="object-fit: ${fit};"${attrs}>`;
                        }
                      }
                      currentIndex++;
                      return imgMatch;
                    });

                    if (replaced) {
                      handlePropChange('render', currentHtml, true);
                      updateProp(htmlFitKey, fit);
                      saveComponentToHistory(`Updated image fit: ${imageInfo.alt}`);
                    }
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Parsed Variables from props.xxx pattern */}
      {variables.length > 0 && (
        <div className="space-y-4">
          {/* Unified Text Block */}
          {nonFontTextVariables.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">All Text Content</h4>
              <Textarea
                className="w-full text-[11px] min-h-[120px]"
                value={combinedTextValue}
                onChange={handleCombinedTextChange}
                placeholder={nonFontTextVariables.map(v => String(v.defaultValue ?? '')).join('\n')}
              />
              <p className="text-[10px] text-muted-foreground">Each line maps to a text property in order.</p>
            </div>
          )}
          {/* Font Properties (show font-related text props only) */}
          {groupedVariables.text.filter(v => v.name.toLowerCase().includes('font')).length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">Font Properties</h4>
              <div className="grid grid-cols-2 gap-2">
                {groupedVariables.text
                  .filter(v => v.name.toLowerCase().includes('font'))
                  .map(renderVariableControl)}
              </div>
            </div>
          )}

          {/* Image Properties (from parsed props) */}
          {groupedVariables.image.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">Image Properties</h4>
              <div className="grid grid-cols-1 gap-3">
                {groupedVariables.image.map(renderVariableControl)}
              </div>
            </div>
          )}

          {/* Numeric Properties */}
          {groupedVariables.number.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">Numeric Properties</h4>
              <div className="grid grid-cols-2 gap-2">
                {groupedVariables.number.map(renderVariableControl)}
              </div>
            </div>
          )}

          {/* Color Properties */}
          {groupedVariables.color.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">Color Properties</h4>
              <div className="grid grid-cols-2 gap-2">
                {groupedVariables.color.map(renderVariableControl)}
              </div>
            </div>
          )}

          {/* Boolean Properties */}
          {groupedVariables.boolean.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">Toggle Properties</h4>
              <div className="grid grid-cols-2 gap-2">
                {groupedVariables.boolean.map(renderVariableControl)}
              </div>
            </div>
          )}

          {/* Select Properties */}
          {groupedVariables.select.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">Select Properties</h4>
              <div className="grid grid-cols-2 gap-2">
                {groupedVariables.select.map(renderVariableControl)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* No editable properties message - only show if BOTH no parsed variables AND no HTML images */}
      {variables.length === 0 && htmlPlaceholderImages.length === 0 && (
        <div className="text-xs text-muted-foreground text-center py-4">
          <p>No editable properties detected in the component code.</p>
          <p className="mt-1">To make your component editable, add property definitions like:</p>
          <div className="mt-2 space-y-1">
            <code className="block font-mono text-xs bg-muted px-2 py-1 rounded text-left">
              const text = props.text || "Default text";
            </code>
            <code className="block font-mono text-xs bg-muted px-2 py-1 rounded text-left">
              const color = props.color || "#ff0000";
            </code>
            <code className="block font-mono text-xs bg-muted px-2 py-1 rounded text-left">
              const size = props.size || 24; // px
            </code>
            <code className="block font-mono text-xs bg-muted px-2 py-1 rounded text-left">
              const heroImage = props.heroImage || "placeholder";
            </code>
          </div>
          <Button
            variant="link"
            size="sm"
            className="mt-2 text-xs"
            onClick={() => setShowCodeEditor(true)}
          >
            Open Code Editor
          </Button>
        </div>
      )}
    </div>
  );
};

export default CustomComponentSettingsEditor; 