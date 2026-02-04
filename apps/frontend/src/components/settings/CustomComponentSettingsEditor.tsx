import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ComponentInstance } from '@/types/components';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Code, Zap, Type, Image, ChevronDown, ChevronRight, Maximize2, Square, AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react';
import { parseCustomComponentCode, ParsedVariable, convertToPropsBasedCode } from '@/utils/customComponentParser';
import AdvancedCodeEditor from '@/components/ui/AdvancedCodeEditor';
import { Textarea } from '@/components/ui/textarea';
import { FontLoadingService } from '@/services/FontLoadingService';
import { useFontCatalog } from '@/hooks/useFontCatalog';
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
import ImageCardGrid from '@/components/settings/ImageCardGrid';
import { Checkbox } from '@/components/ui/checkbox';
import { useCustomComponentEditStore } from '@/stores/customComponentEditStore';
import { VirtualElement } from '@/components/custom-component-editor/types';
import { LayersPanel } from '@/components/settings/LayersPanel';
import { getElementDisplayName, getImagePropLabel, isGenericImageLabel } from '@/utils/customComponentLabels';
import { parseJsArrayImages, updateJsArrayImage, JsArrayImage } from '@/utils/jsArrayImageParser';

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
      <Label className="text-[11px] text-muted-foreground">{variable.label}</Label>
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

// Helper to convert RGB/RGBA to hex
const rgbToHex = (color: string | undefined): string => {
  if (!color) return '#000000';
  if (color.startsWith('#')) return color;
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
    const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
    const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  return '#000000';
};

// Dynamic text element editor with font, color, size controls
const DynamicTextEditor: React.FC<{
  element: VirtualElement;
  onStyleUpdate: (selector: string, property: string, value: string) => void;
  onTextUpdate: (elementId: string, newText: string) => void;
  onSave: (message?: string) => void;
  onInjectFont?: (fontName: string, fontDef?: { source: string; url?: string; family?: string }) => void;
  onRequestHtmlUpdate?: () => void;
  hideTextInput?: boolean; // Hide the text textarea when in edit mode
}> = ({ element, onStyleUpdate, onTextUpdate, onSave, onInjectFont, onRequestHtmlUpdate, hideTextInput }) => {
  const [localText, setLocalText] = useState(element.textContent || '');
  const { groups: fontCategories } = useFontCatalog();
  const allFonts = useMemo(() => FontLoadingService.getAllFontNames(), [fontCategories]);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  // Convert RGB color to hex for the color picker
  const [textColor, setTextColor] = useState(() => rgbToHex(element.computedStyle?.color));

  // Normalize font family from computed style
  const computedFont = useMemo(() => {
    const ff = element.computedStyle?.fontFamily;
    if (!ff) return '';
    return ff.split(',')[0].trim().replace(/['"]/g, '');
  }, [element.computedStyle?.fontFamily]);

  // Local state for font - use computed as initial, update on change
  const [currentFont, setCurrentFont] = useState(computedFont);

  // Sync local font state when element changes (e.g., selecting different element)
  useEffect(() => {
    setCurrentFont(computedFont);
  }, [computedFont]);

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

  // Text alignment state
  const textAlign = useMemo(() => {
    return element.computedStyle?.textAlign || 'left';
  }, [element.computedStyle?.textAlign]);

  // Line height state
  const lineHeight = useMemo(() => {
    const lh = element.computedStyle?.lineHeight;
    if (!lh || lh === 'normal') return 1.5;
    // If it's a pixel value, convert to unitless
    if (lh.endsWith('px')) {
      const pxVal = parseFloat(lh);
      return pxVal / fontSize;
    }
    const parsed = parseFloat(lh);
    return isNaN(parsed) ? 1.5 : parsed;
  }, [element.computedStyle?.lineHeight, fontSize]);

  // Letter spacing state
  const letterSpacing = useMemo(() => {
    const ls = element.computedStyle?.letterSpacing;
    if (!ls || ls === 'normal') return 0;
    const parsed = parseFloat(ls);
    return isNaN(parsed) ? 0 : parsed;
  }, [element.computedStyle?.letterSpacing]);

  // Load the current font on mount to ensure it's available
  useEffect(() => {
    if (currentFont && currentFont.length > 0) {
      FontLoadingService.loadFont(currentFont).catch(() => {});
    }
  }, [currentFont]);

  useEffect(() => {
    setLocalText(element.textContent || '');
  }, [element.textContent]);

  return (
    <div
      className="space-y-1.5"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Text input - hidden when editing directly in the slide */}
      {!hideTextInput && (
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">Text</Label>
          <Textarea
            value={localText}
            onChange={(e) => {
              setLocalText(e.target.value);
              onTextUpdate(element.id, e.target.value);
            }}
            onBlur={() => onSave('Updated text')}
            className="w-full text-[11px] min-h-[44px] resize-none"
          />
        </div>
      )}

      <div className="space-y-0.5">
        <Label className="text-[10px] text-muted-foreground">Font</Label>
        <GroupedDropdown
          value={currentFont}
          options={allFonts}
          groups={fontCategories}
          onChange={(value) => {
            setCurrentFont(value);
            const fontDef = FontLoadingService.getFontDefinition?.(value);
            onInjectFont?.(value, fontDef ? {
              source: fontDef.source,
              url: fontDef.url,
              family: fontDef.family,
              id: (fontDef as any).id,
            } : undefined);
            onStyleUpdate(element.selector, 'fontFamily', value);
            FontLoadingService.loadFont(value).catch(() => {});
            onRequestHtmlUpdate?.();
            onSave('Changed font');
          }}
          placeholder="Select font"
        />
      </div>

      {/* Size + Color on same row */}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">Size</Label>
          <div className="flex items-center gap-1.5">
            <Slider
              min={8}
              max={maxFontSize}
              step={1}
              value={[fontSize]}
              onValueChange={(values) => onStyleUpdate(element.selector, 'fontSize', `${values[0]}px`)}
              onPointerUp={() => {
                onRequestHtmlUpdate?.();
                onSave('Changed font size');
              }}
              className="flex-grow"
            />
            <span className="text-[10px] w-8 text-right tabular-nums">{fontSize}px</span>
          </div>
        </div>
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">Color</Label>
          <Popover open={colorPickerOpen} onOpenChange={(open) => {
            setColorPickerOpen(open);
            if (!open) {
              onRequestHtmlUpdate?.();
              onSave('Changed color');
            }
          }}>
            <PopoverTrigger asChild>
              <button
                className="w-6 h-6 rounded border border-border cursor-pointer focus:outline-none focus:ring-1 focus:ring-orange-500 flex-shrink-0"
                style={{ backgroundColor: textColor }}
              />
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-2" align="end" sideOffset={5}>
              <HexColorPicker
                color={textColor}
                onChange={(color) => {
                  setTextColor(color);
                  onStyleUpdate(element.selector, 'color', color);
                }}
                className="!w-full !h-[180px]"
              />
              <Input
                value={textColor}
                onChange={(e) => {
                  setTextColor(e.target.value);
                  onStyleUpdate(element.selector, 'color', e.target.value);
                }}
                onBlur={() => onSave('Changed color')}
                className="mt-1.5 h-6 text-[10px] font-mono"
                placeholder="#000000"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Weight + Alignment on same row */}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">Weight</Label>
          <div className="flex gap-px">
            {['300', '400', '500', '600', '700'].map((weight) => (
              <Button
                key={weight}
                variant={element.computedStyle?.fontWeight === weight ? 'default' : 'outline'}
                size="sm"
                className="h-5 px-1 text-[8px] flex-1 rounded-sm"
                onClick={() => {
                  onStyleUpdate(element.selector, 'fontWeight', weight);
                  onRequestHtmlUpdate?.();
                  onSave('Changed font weight');
                }}
              >
                {weight === '300' ? 'Lt' :
                 weight === '400' ? 'Rg' :
                 weight === '500' ? 'Md' :
                 weight === '600' ? 'Sb' : 'Bd'}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">Align</Label>
          <div className="flex gap-px">
            {[
              { value: 'left', Icon: AlignLeft },
              { value: 'center', Icon: AlignCenter },
              { value: 'right', Icon: AlignRight },
              { value: 'justify', Icon: AlignJustify },
            ].map(({ value, Icon }) => (
              <Button
                key={value}
                variant={textAlign === value ? 'default' : 'outline'}
                size="sm"
                className="h-5 px-1 flex-1 rounded-sm"
                onClick={() => {
                  onStyleUpdate(element.selector, 'textAlign', value);
                  onRequestHtmlUpdate?.();
                  onSave('Changed text alignment');
                }}
              >
                <Icon className="w-2.5 h-2.5" />
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Line Height + Letter Spacing on same row */}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">Line Height</Label>
          <div className="flex items-center gap-1">
            <Slider
              min={0.8}
              max={3}
              step={0.1}
              value={[lineHeight]}
              onValueChange={(values) => onStyleUpdate(element.selector, 'lineHeight', String(values[0]))}
              onPointerUp={() => {
                onRequestHtmlUpdate?.();
                onSave('Changed line height');
              }}
              className="flex-grow"
            />
            <span className="text-[9px] w-6 text-right tabular-nums">{lineHeight.toFixed(1)}</span>
          </div>
        </div>
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">Spacing</Label>
          <div className="flex items-center gap-1">
            <Slider
              min={-2}
              max={10}
              step={0.5}
              value={[letterSpacing]}
              onValueChange={(values) => onStyleUpdate(element.selector, 'letterSpacing', `${values[0]}px`)}
              onPointerUp={() => {
                onRequestHtmlUpdate?.();
                onSave('Changed letter spacing');
              }}
              className="flex-grow"
            />
            <span className="text-[9px] w-7 text-right tabular-nums">{letterSpacing}px</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const FontVariableSelector: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ label, value, onChange }) => {
  const { groups } = useFontCatalog();
  const options = useMemo(() => FontLoadingService.getAllFontNames(), [groups]);

  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <GroupedDropdown
        value={value || ''}
        options={options}
        groups={groups}
        onChange={onChange}
        placeholder="Select font"
      />
    </div>
  );
};

// Dynamic container/box editor with background, border, padding controls
const DynamicContainerEditor: React.FC<{
  element: VirtualElement;
  onStyleUpdate: (selector: string, property: string, value: string) => void;
  onSave: (message?: string) => void;
  onRequestHtmlUpdate?: () => void;
}> = ({ element, onStyleUpdate, onSave, onRequestHtmlUpdate }) => {
  const [bgColorOpen, setBgColorOpen] = useState(false);
  const [borderColorOpen, setBorderColorOpen] = useState(false);

  // Parse current values from computed style - with local state for live updates
  const [bgColor, setBgColor] = useState(() => {
    // Try to parse background color from computed style
    // Computed style returns rgb/rgba format, we need to handle that
    const bg = (element.computedStyle as any)?.backgroundColor;
    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') return '#ffffff';
    // If it's already hex, use it
    if (bg.startsWith('#')) return bg;
    // Try to convert rgb to hex
    const rgbMatch = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
      const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
      const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
    return '#ffffff';
  });

  const [borderRadius, setBorderRadius] = useState(() => {
    const br = (element.computedStyle as any)?.borderRadius;
    if (!br) return 0;
    const parsed = parseInt(br, 10);
    return isNaN(parsed) ? 0 : parsed;
  });

  const [padding, setPadding] = useState(() => {
    const p = (element.computedStyle as any)?.padding;
    if (!p) return 0;
    const parsed = parseInt(p, 10);
    return isNaN(parsed) ? 0 : parsed;
  });

  const [borderColor, setBorderColor] = useState(() => {
    const bc = (element.computedStyle as any)?.borderColor;
    if (!bc || bc === 'rgba(0, 0, 0, 0)') return '#e0e0e0';
    if (bc.startsWith('#')) return bc;
    const rgbMatch = bc.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
      const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
      const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
    return '#e0e0e0';
  });

  const [borderWidth, setBorderWidth] = useState(() => {
    const bw = (element.computedStyle as any)?.borderWidth;
    if (!bw || bw === '0px') return 'none';
    return bw;
  });

  return (
    <div
      className="space-y-1.5"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Background Color */}
      <div className="space-y-0.5">
        <Label className="text-[10px] text-muted-foreground">Background</Label>
        <div className="flex items-center gap-1.5">
          <Popover open={bgColorOpen} onOpenChange={(open) => {
            setBgColorOpen(open);
            if (!open) {
              onRequestHtmlUpdate?.();
              onSave('Changed background');
            }
          }}>
            <PopoverTrigger asChild>
              <button
                className="w-5 h-5 rounded border border-border cursor-pointer focus:outline-none focus:ring-1 focus:ring-orange-500 flex-shrink-0"
                style={{ backgroundColor: bgColor }}
              />
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-2" align="start" sideOffset={5}>
              <HexColorPicker
                color={bgColor}
                onChange={(color) => {
                  setBgColor(color);
                  onStyleUpdate(element.selector, 'backgroundColor', color);
                }}
                className="!w-full !h-[180px]"
              />
            </PopoverContent>
          </Popover>
          <Input
            value={bgColor}
            onChange={(e) => {
              setBgColor(e.target.value);
              onStyleUpdate(element.selector, 'backgroundColor', e.target.value);
            }}
            onBlur={() => onSave('Changed background')}
            className="flex-1 h-5 text-[10px] font-mono"
            placeholder="#ffffff"
          />
        </div>
      </div>

      {/* Corner Radius + Padding on same row */}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">Radius</Label>
          <div className="flex items-center gap-1">
            <Slider
              min={0}
              max={50}
              step={1}
              value={[borderRadius]}
              onValueChange={(values) => {
                setBorderRadius(values[0]);
                onStyleUpdate(element.selector, 'borderRadius', `${values[0]}px`);
              }}
              onPointerUp={() => {
                onRequestHtmlUpdate?.();
                onSave('Changed border radius');
              }}
              className="flex-grow"
            />
            <span className="text-[9px] w-7 text-right tabular-nums">{borderRadius}px</span>
          </div>
        </div>
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">Padding</Label>
          <div className="flex items-center gap-1">
            <Slider
              min={0}
              max={100}
              step={4}
              value={[padding]}
              onValueChange={(values) => {
                setPadding(values[0]);
                onStyleUpdate(element.selector, 'padding', `${values[0]}px`);
              }}
              onPointerUp={() => {
                onRequestHtmlUpdate?.();
                onSave('Changed padding');
              }}
              className="flex-grow"
            />
            <span className="text-[9px] w-7 text-right tabular-nums">{padding}px</span>
          </div>
        </div>
      </div>

      {/* Border */}
      <div className="space-y-0.5">
        <Label className="text-[10px] text-muted-foreground">Border</Label>
        <div className="flex items-center gap-1.5">
          <Popover open={borderColorOpen} onOpenChange={(open) => {
            setBorderColorOpen(open);
            if (!open) {
              onRequestHtmlUpdate?.();
              onSave('Changed border');
            }
          }}>
            <PopoverTrigger asChild>
              <button
                className="w-5 h-5 rounded border-2 cursor-pointer focus:outline-none focus:ring-1 focus:ring-orange-500 flex-shrink-0"
                style={{ borderColor: borderColor, backgroundColor: 'transparent' }}
              />
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-2" align="start" sideOffset={5}>
              <HexColorPicker
                color={borderColor}
                onChange={(color) => {
                  setBorderColor(color);
                  onStyleUpdate(element.selector, 'borderColor', color);
                }}
                className="!w-full !h-[180px]"
              />
            </PopoverContent>
          </Popover>
          <Select
            value={borderWidth}
            onValueChange={(value) => {
              setBorderWidth(value);
              if (value === 'none') {
                onStyleUpdate(element.selector, 'border', 'none');
              } else {
                onStyleUpdate(element.selector, 'border', `${value} solid ${borderColor}`);
              }
              onSave('Changed border');
            }}
          >
            <SelectTrigger className="h-5 text-[10px] flex-1">
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
    selected: false,
    text: false,
    images: false,
    containers: false,
  });

  // Reset expanded sections when component changes (navigating slides)
  // All start collapsed - the selected section auto-expands on element click
  useEffect(() => {
    setExpandedSections({
      selected: false,
      text: false,
      images: false,
      containers: false,
    });
  }, [component.id]);

  // Get detected elements from the custom component edit store
  const { activeComponentId, detectedElements, selectedElement, editingElement, updateElementStyle, updateElementText, updateElementImage, injectFont, requestHtmlUpdate, requestElements } = useCustomComponentEditStore();

  // Only use store data if it matches this component
  const isActiveComponent = activeComponentId === component.id;
  const activeDetectedElements = isActiveComponent ? detectedElements : [];
  // Use editingElement when in edit mode (text editing), otherwise use selectedElement
  const activeSelectedElement = isActiveComponent ? (editingElement || selectedElement) : null;
  // Track if we're in text edit mode (editingElement is set but selectedElement is null)
  const isTextEditMode = isActiveComponent && editingElement && !selectedElement;

  // Auto-expand the selected section whenever an element is selected (any type)
  const activeSelectedElementRef = useRef<typeof activeSelectedElement>(null);
  useEffect(() => {
    if (activeSelectedElement && activeSelectedElement !== activeSelectedElementRef.current) {
      setExpandedSections(prev => ({ ...prev, selected: true }));
    }
    activeSelectedElementRef.current = activeSelectedElement;
  }, [activeSelectedElement]);

  // Check if this is an HTML-based component (iframe)
  const isHtmlComponent = useMemo(() => {
    const render = (component.props.render as string) || '';
    return render.trim().toLowerCase().startsWith('<!doctype') ||
           render.trim().toLowerCase().startsWith('<html');
  }, [component.props.render]);

  // Parse JS array images from HTML source (for tabs/carousels that store images in JS arrays)
  const jsArrayImages = useMemo(() => {
    if (!isHtmlComponent) return [];
    const raw = (component.props.render as string) || '';
    return parseJsArrayImages(raw);
  }, [component.props.render, isHtmlComponent]);

  // Keep a ref to the current JS array images for the handler
  const jsArrayImagesRef = useRef<JsArrayImage[]>(jsArrayImages);
  useEffect(() => {
    jsArrayImagesRef.current = jsArrayImages;
  }, [jsArrayImages]);

  // Convert JS array images to VirtualElement format for unified display
  const jsArrayImageElements = useMemo((): VirtualElement[] => {
    return jsArrayImages.map((img, index) => ({
      id: img.id,
      type: 'image' as const,
      tagName: 'IMG',
      selector: `js-array-image-${index}`,
      src: img.src,
      alt: img.label,
      label: img.label,
      textContent: '',
      iframeBounds: { x: 0, y: 0, width: 200, height: 150 },
      bounds: { x: 0, y: 0, width: 200, height: 150 },
      positioningStrategy: 'static' as const,
      computedStyle: {
        position: 'static',
        top: '0',
        left: '0',
        right: 'auto',
        bottom: 'auto',
        width: '200px',
        height: '150px',
        transform: 'none',
        margin: '0',
      },
      isDraggable: false,
      isResizable: false,
      // Mark this as a JS array image for special handling
      isJsArrayImage: true,
    }));
  }, [jsArrayImages]);

  // Merge DOM-detected images with JS array images, avoiding duplicates
  const imageElements = useMemo(() => {
    const domImages = activeDetectedElements.filter((element) => element.type === 'image');

    // Filter out JS array images that are already shown in DOM (by matching URL)
    const domImageUrls = new Set(domImages.map(img => img.src).filter(Boolean));
    const uniqueJsImages = jsArrayImageElements.filter(img => !domImageUrls.has(img.src));

    // Combine DOM images first (currently visible), then JS array images
    return [...domImages, ...uniqueJsImages];
  }, [activeDetectedElements, jsArrayImageElements]);

  const htmlSyncRef = useRef<NodeJS.Timeout | null>(null);
  const scheduleHtmlSync = useCallback(() => {
    if (!isActiveComponent) return;
    if (htmlSyncRef.current) {
      clearTimeout(htmlSyncRef.current);
    }
    htmlSyncRef.current = setTimeout(() => {
      requestHtmlUpdate();
    }, 250);
  }, [isActiveComponent, requestHtmlUpdate]);

  useEffect(() => {
    return () => {
      if (htmlSyncRef.current) {
        clearTimeout(htmlSyncRef.current);
      }
    };
  }, []);

  const handleElementStyle = useCallback((selector: string, property: string, value: string) => {
    updateElementStyle(selector, property, value);
    scheduleHtmlSync();
  }, [updateElementStyle, scheduleHtmlSync]);

  const handleElementText = useCallback((elementId: string, newText: string) => {
    updateElementText(elementId, newText);
    scheduleHtmlSync();
  }, [updateElementText, scheduleHtmlSync]);

  const handleElementImage = useCallback((elementId: string, newSrc: string) => {
    const currentHtml = (component.props.render as string) || '';

    // Check if this is a JS array image (id starts with 'js-')
    if (elementId.startsWith('js-')) {
      // Find the image in our parsed array
      const jsImage = jsArrayImagesRef.current.find(img => img.id === elementId);
      if (!jsImage) return;

      const oldSrc = jsImage.src;

      // Don't replace if URLs are the same
      if (oldSrc === newSrc) return;

      // Simple string replace of the old URL with new URL
      if (currentHtml.includes(oldSrc)) {
        const updatedHtml = currentHtml.replace(oldSrc, newSrc);
        if (updatedHtml !== currentHtml) {
          handlePropChangeRef.current('render', updatedHtml, false);
          updateElementImage(elementId, newSrc);
        }
      }
      return;
    }

    // For DOM images, also do direct HTML replacement for reliability
    // Find the image element to get its old src
    const imageElement = activeDetectedElements.find(el => el.id === elementId && el.type === 'image');
    const oldSrc = imageElement?.src;

    if (oldSrc && oldSrc !== newSrc && currentHtml.includes(oldSrc)) {
      // Direct HTML replacement (more reliable than async iframe flow)
      const updatedHtml = currentHtml.replace(oldSrc, newSrc);
      if (updatedHtml !== currentHtml) {
        handlePropChangeRef.current('render', updatedHtml, false);
      }
    }

    // Also update iframe visually
    updateElementImage(elementId, newSrc);
    scheduleHtmlSync();
  }, [updateElementImage, scheduleHtmlSync, component.props.render, activeDetectedElements]);

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
          return (
            <FontVariableSelector
              key={variable.name}
              label={variable.label || variable.name}
              value={currentValue || ''}
              onChange={(value) => {
                updateProp(variable.name, value);
                FontLoadingService.syncDesignerFonts?.().finally(() => {
                  FontLoadingService.loadFont(String(value)).catch(() => {});
                });
                saveChanges(variable.name, variable.label || variable.name);
              }}
            />
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
              <Label className="text-[11px] text-muted-foreground">{variable.label}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={currentValue || 0}
                  onChange={(e) => updateProp(variable.name, parseFloat(e.target.value) || 0)}
                  onBlur={() => saveChanges(variable.name, variable.label || variable.name)}
                  className="w-full h-7 text-[11px]"
                  min={variable.min}
                  max={variable.max}
                  step={variable.step}
                />
                {variable.unit && <span className="text-[11px] text-muted-foreground">{variable.unit}</span>}
              </div>
            </div>
          );
        }
        
        return (
          <div key={variable.name} className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">{variable.label}</Label>
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
              <span className="text-[11px] w-10 text-right">
                {currentValue || 0}{variable.unit || ''}
              </span>
            </div>
          </div>
        );
      
      case 'color':
        const isOpen = colorPickerOpen[variable.name] || false;
        
        return (
          <div key={variable.name} className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">{variable.label}</Label>
            <div className="flex items-center gap-2">
              <Popover open={isOpen} onOpenChange={(open) => {
                setColorPickerOpen(prev => ({ ...prev, [variable.name]: open }));
                if (!open) {
                  saveChanges(variable.name, variable.label || variable.name);
                }
              }}>
                <PopoverTrigger asChild>
                  <button 
                    className="w-5 h-5 rounded-md border cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500" 
                    style={{ backgroundColor: currentValue || '#000000' }}
                    aria-label={`Choose color for ${variable.label}`}
                  />
                </PopoverTrigger>
                <PopoverContent className="w-[216px] p-2" align="start">
                  <HexColorPicker
                    color={currentValue || '#000000'}
                    onChange={(color) => updateProp(variable.name, color)}
                    className="!w-full !h-[200px]"
                  />
                  <Input
                    value={currentValue || ''}
                    onChange={(e) => updateProp(variable.name, e.target.value)}
                    className="mt-2 h-6 text-[11px] font-mono"
                    placeholder="#000000"
                  />
                </PopoverContent>
              </Popover>
              <Input
                value={currentValue || ''}
                onChange={(e) => updateProp(variable.name, e.target.value)}
                onBlur={() => saveChanges(variable.name, variable.label || variable.name)}
                className="flex-1 h-6 text-[11px] font-mono"
                placeholder="#000000"
              />
            </div>
          </div>
        );
      
      case 'boolean':
        return (
          <div key={variable.name} className="flex items-center justify-between space-x-2">
            <Label className="text-[11px] text-muted-foreground">{variable.label}</Label>
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
            <Label className="text-[11px] text-muted-foreground">{variable.label}</Label>
            <Select
              value={currentValue || ''}
              onValueChange={(value) => {
                updateProp(variable.name, value);
                saveChanges(variable.name, variable.label || variable.name);
              }}
            >
              <SelectTrigger className="w-full h-7 text-[11px]">
                <SelectValue placeholder="Select option" />
              </SelectTrigger>
              <SelectContent>
                {variable.options?.map((option) => (
                  <SelectItem key={option} value={option} className="text-[11px]">
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

  const showPropImages = groupedVariables.image.length > 0 && !isHtmlComponent;

  // Detect ALL images in HTML documents (for iframe mode) - both placeholders and real images
  const htmlPlaceholderImages = useMemo(() => {
    if (!renderCode) {
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
  
  // Shared collapsible section header style
  const SectionHeader: React.FC<{
    expanded: boolean;
    onToggle: () => void;
    icon: React.ReactNode;
    label: string;
    count?: number;
    accent?: boolean;
  }> = ({ expanded, onToggle, icon, label, count, accent }) => (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-left transition-colors rounded-md ${
        accent && !expanded
          ? 'bg-orange-50 dark:bg-orange-500/10 hover:bg-orange-100 dark:hover:bg-orange-500/15'
          : 'hover:bg-muted/60'
      }`}
    >
      {expanded
        ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
        : <ChevronRight className={`w-3 h-3 ${accent ? 'text-orange-500' : 'text-muted-foreground'}`} />
      }
      {icon}
      <span className="text-[11px] font-medium flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className="text-[9px] text-muted-foreground tabular-nums">{count}</span>
      )}
    </button>
  );

  return (
    <div
      className="space-y-1"
      // CRITICAL: Stop all event propagation to prevent selecting components underneath
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Component Settings Header - minimal brand accent */}
      <div className="flex items-center gap-1.5 pb-1.5 mb-0.5">
        <div className="w-4 h-4 rounded bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center flex-shrink-0">
          <Zap className="w-2.5 h-2.5 text-white" />
        </div>
        <span className="text-[11px] font-semibold">Custom Property</span>
      </div>

      {/* Dynamic Element Editor for HTML components */}
      {isHtmlComponent && isActiveComponent && activeDetectedElements.length > 0 && (
        <div className="space-y-0.5">
          {/* Selected Element Editor */}
          {activeSelectedElement && (
            <div className={`rounded-md overflow-hidden border ${
              expandedSections.selected ? 'border-border bg-background' : 'border-orange-200 dark:border-orange-500/30 bg-orange-50/50 dark:bg-orange-500/5'
            }`}>
              <SectionHeader
                expanded={expandedSections.selected}
                onToggle={() => setExpandedSections(prev => ({ ...prev, selected: !prev.selected }))}
                accent={!expandedSections.selected}
                icon={
                  activeSelectedElement.type === 'text'
                    ? <Type className="w-3 h-3 text-blue-500" />
                    : activeSelectedElement.type === 'image'
                    ? <Image className="w-3 h-3 text-green-500" />
                    : <Maximize2 className="w-3 h-3 text-purple-500" />
                }
                label={activeSelectedElement.type === 'text'
                  ? (activeSelectedElement.textContent?.slice(0, 25) + (activeSelectedElement.textContent && activeSelectedElement.textContent.length > 25 ? '...' : ''))
                  : getElementDisplayName(activeSelectedElement)}
              />

              {expandedSections.selected && (
                <div className="px-2 pb-2 pt-1 border-t border-border/40">
                  {activeSelectedElement.type === 'text' && (
                    <DynamicTextEditor
                      element={activeSelectedElement}
                      onStyleUpdate={handleElementStyle}
                      onTextUpdate={handleElementText}
                      onSave={saveComponentToHistory}
                      onInjectFont={injectFont}
                      onRequestHtmlUpdate={requestHtmlUpdate}
                      hideTextInput={isTextEditMode}
                    />
                  )}

                  {activeSelectedElement.type === 'image' && activeSelectedElement.src && (
                    <div className="rounded-md overflow-hidden border border-border/40 bg-[repeating-conic-gradient(#f5f5f5_0_90deg,#fafafa_90deg_180deg)_0_0/10px_10px]">
                      <img
                        src={activeSelectedElement.src}
                        alt={getElementDisplayName(activeSelectedElement)}
                        className="w-full h-24 object-contain"
                      />
                    </div>
                  )}

                  {activeSelectedElement.type === 'container' && (
                    <DynamicContainerEditor
                      element={activeSelectedElement}
                      onStyleUpdate={handleElementStyle}
                      onSave={saveComponentToHistory}
                      onRequestHtmlUpdate={requestHtmlUpdate}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Collapsible sections */}
          <div className="space-y-0.5 pt-1">
            {/* Image Elements */}
            <div className={`rounded-md overflow-hidden border ${expandedSections.images ? 'border-border bg-background' : 'border-border/60'}`}>
              <SectionHeader
                expanded={expandedSections.images}
                onToggle={() => setExpandedSections(prev => ({ ...prev, images: !prev.images }))}
                icon={<Image className="w-3 h-3 text-green-500" />}
                label="Images"
                count={imageElements.length}
              />

              {expandedSections.images && (
                <div className="px-2 pb-2 border-t border-border/40">
                  <ImageCardGrid
                    images={imageElements}
                    componentId={component.id}
                    onImageUpdate={handleElementImage}
                    onStyleUpdate={handleElementStyle}
                    onSave={saveComponentToHistory}
                    onRequestHtmlUpdate={requestHtmlUpdate}
                  />
                </div>
              )}
            </div>

            {/* Text Elements */}
            {activeDetectedElements.filter(e => e.type === 'text').length > 0 && (
              <div className={`rounded-md overflow-hidden border ${expandedSections.text ? 'border-border bg-background' : 'border-border/60'}`}>
                <SectionHeader
                  expanded={expandedSections.text}
                  onToggle={() => setExpandedSections(prev => ({ ...prev, text: !prev.text }))}
                  icon={<Type className="w-3 h-3 text-blue-500" />}
                  label="Text"
                  count={activeDetectedElements.filter(e => e.type === 'text').length}
                />

                {expandedSections.text && (
                  <div className="px-2 pb-2 border-t border-border/40 space-y-2 pt-1.5">
                    {activeDetectedElements.filter(e => e.type === 'text').map((element, index) => (
                      <div key={element.id} className="space-y-1 pb-1.5 border-b border-border/30 last:border-0 last:pb-0">
                        <div className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">
                          {element.tagName} - {element.textContent?.slice(0, 20)}...
                        </div>
                        <DynamicTextEditor
                          element={element}
                          onStyleUpdate={handleElementStyle}
                          onTextUpdate={handleElementText}
                          onSave={saveComponentToHistory}
                          onInjectFont={injectFont}
                          onRequestHtmlUpdate={requestHtmlUpdate}
                          hideTextInput={isTextEditMode && editingElement?.id === element.id}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Container/Box Elements */}
            {activeDetectedElements.filter(e => e.type === 'container').length > 0 && (
              <div className={`rounded-md overflow-hidden border ${expandedSections.containers ? 'border-border bg-background' : 'border-border/60'}`}>
                <SectionHeader
                  expanded={expandedSections.containers}
                  onToggle={() => setExpandedSections(prev => ({ ...prev, containers: !prev.containers }))}
                  icon={<Square className="w-3 h-3 text-purple-500" />}
                  label="Containers"
                  count={activeDetectedElements.filter(e => e.type === 'container').length}
                />

                {expandedSections.containers && (
                  <div className="px-2 pb-2 border-t border-border/40 space-y-2 pt-1.5">
                    {activeDetectedElements.filter(e => e.type === 'container').map((element, index) => (
                      <div key={element.id} className="space-y-1 pb-1.5 border-b border-border/30 last:border-0 last:pb-0">
                        <div className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">
                          {getElementDisplayName(element, index)}
                        </div>
                        <DynamicContainerEditor
                          element={element}
                          onStyleUpdate={handleElementStyle}
                          onSave={saveComponentToHistory}
                          onRequestHtmlUpdate={requestHtmlUpdate}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Layers Panel */}
          <LayersPanel onSave={saveComponentToHistory} />
        </div>
      )}

      {/* Loading state for HTML components waiting for element detection */}
      {isHtmlComponent && !isActiveComponent && (
        <div className="flex items-center gap-2 py-3 text-[10px] text-muted-foreground">
          <div className="w-3 h-3 border-[1.5px] border-orange-400 border-t-transparent rounded-full animate-spin" />
          <span>Detecting editable elements...</span>
        </div>
      )}

      {/* Parsed Variables from props.xxx pattern */}
      {variables.length > 0 && (
        <div className="space-y-2 pt-1">
          {/* Unified Text Block */}
          {nonFontTextVariables.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Text Content</h4>
              <Textarea
                className="w-full text-[11px] min-h-[72px]"
                value={combinedTextValue}
                onChange={handleCombinedTextChange}
                placeholder={nonFontTextVariables.map(v => String(v.defaultValue ?? '')).join('\n')}
              />
              <p className="text-[9px] text-muted-foreground">Each line maps to a text property in order.</p>
            </div>
          )}

          {/* Font Properties */}
          {groupedVariables.text.filter(v => v.name.toLowerCase().includes('font')).length > 0 && (
            <div className="space-y-1">
              <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Fonts</h4>
              <div className="grid grid-cols-2 gap-1.5">
                {groupedVariables.text
                  .filter(v => v.name.toLowerCase().includes('font'))
                  .map(renderVariableControl)}
              </div>
            </div>
          )}

          {/* Image Properties (from parsed props) */}
          {showPropImages && (
            <div className="space-y-1">
              <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Images</h4>
              <div className="grid grid-cols-1 gap-2">
                {groupedVariables.image.map((variable, index) => {
                  const currentValue = (componentProps as any)[variable.name] ?? variable.defaultValue;
                  return renderVariableControl({
                    ...variable,
                    label: getImagePropLabel(variable.name, currentValue, index),
                  });
                })}
              </div>
            </div>
          )}

          {/* Numeric Properties */}
          {groupedVariables.number.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Numbers</h4>
              <div className="grid grid-cols-2 gap-1.5">
                {groupedVariables.number.map(renderVariableControl)}
              </div>
            </div>
          )}

          {/* Color Properties */}
          {groupedVariables.color.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Colors</h4>
              <div className="grid grid-cols-2 gap-1.5">
                {groupedVariables.color.map(renderVariableControl)}
              </div>
            </div>
          )}

          {/* Boolean Properties */}
          {groupedVariables.boolean.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Toggles</h4>
              <div className="grid grid-cols-2 gap-1.5">
                {groupedVariables.boolean.map(renderVariableControl)}
              </div>
            </div>
          )}

          {/* Select Properties */}
          {groupedVariables.select.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Options</h4>
              <div className="grid grid-cols-2 gap-1.5">
                {groupedVariables.select.map(renderVariableControl)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* No editable properties message */}
      {!isHtmlComponent && variables.length === 0 && htmlPlaceholderImages.length === 0 && (
        <div className="text-center py-4 space-y-2">
          <p className="text-[10px] text-muted-foreground">No editable properties detected.</p>
          <div className="space-y-0.5">
            <code className="block font-mono text-[10px] bg-muted/50 px-2 py-0.5 rounded text-left">
              const text = props.text || "Default";
            </code>
            <code className="block font-mono text-[10px] bg-muted/50 px-2 py-0.5 rounded text-left">
              const color = props.color || "#ff0000";
            </code>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomComponentSettingsEditor; 
