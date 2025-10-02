import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ComponentInstance } from '@/types/components';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Code, Zap } from 'lucide-react';
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
import { FONT_CATEGORIES } from '@/registry/library/fonts';
import { Checkbox } from '@/components/ui/checkbox';

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

const CustomComponentSettingsEditor: React.FC<CustomComponentSettingsEditorProps> = ({
  component,
  onUpdate,
  handlePropChange,
  saveComponentToHistory,
}) => {
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState<Record<string, boolean>>({});
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
    };
    
    variables.forEach((variable) => {
      if (groups[variable.type]) {
        groups[variable.type].push(variable);
      }
    });
    
    return groups;
  }, [variables]);

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
      
      {/* Suggestions UI removed - auto-apply handled in effect */}

      {/* Parsed Variables */}
      {variables.length > 0 ? (
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
      ) : (
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