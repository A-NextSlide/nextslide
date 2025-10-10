import React, { useEffect, useState } from 'react';
import { ComponentInstance } from '@/types/components';
import PropertyControlRenderer from '@/components/settings/PropertyControlRenderer';
import { registry } from '@/registry';
import { Type, TSchema } from '@sinclair/typebox';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import GradientPicker from '../GradientPicker';
import { SHAPE_TYPES } from '@/registry/components/shape';
import { useHistoryStore } from '@/stores/historyStore';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  Superscript,
  Subscript,
  List,
  ListOrdered,
  Heading1,
  Link,
  Type as TypeIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { useEditorStore } from '@/stores/editorStore';
import { Editor } from '@tiptap/react';
import { cn } from '@/lib/utils';

interface ShapeSettingsEditorProps {
  component: ComponentInstance;
  onUpdate: (updates: Partial<ComponentInstance>) => void;
  // New: allow per-prop updates with skipHistory for real-time sliders
  onPropUpdate?: (propName: string, value: any, skipHistory?: boolean) => void;
  saveToHistory?: () => void;
}

// Formatting button component
interface FormattingButtonProps {
  icon: React.ReactNode;
  commandName: string;
  tooltip: string;
  editor: Editor | null;
  level?: number;
  updateDraftComponent?: any;
  fontFamily?: string;
}

const FormattingButton: React.FC<FormattingButtonProps> = ({
  icon,
  commandName,
  tooltip,
  editor,
  level,
  updateDraftComponent,
  fontFamily,
}) => {
  if (!editor) return null;

  const runCommandAndUpdate = (commandFn: () => boolean) => {
    try {
      const success = commandFn();
      setTimeout(() => {
        const updatedContent = editor.getJSON();
        const { transformTiptapToMyFormat } = require('@/utils/tiptapUtils');
        const customDoc = transformTiptapToMyFormat(updatedContent);
        const componentId = editor.options.editorProps?.attributes?.['data-component-id'];
        if (componentId && typeof componentId === 'string' && updateDraftComponent) {
          updateDraftComponent(componentId, 'props.texts', customDoc, true);
        }
      }, 10);
    } catch (e) {
      console.error(`Error running editor command for ${commandName}:`, e);
    }
  };

  let isActive = commandName === 'heading' && level 
    ? editor.isActive('heading', { level }) 
    : editor.isActive(commandName);

  return (
    <Button
      title={tooltip}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        const chain = editor.chain().focus();
        const toggleCommandName = `toggle${commandName.charAt(0).toUpperCase() + commandName.slice(1)}`;
        if (editor.can() && (editor.can() as any)[toggleCommandName]()) {
          runCommandAndUpdate(() => (chain as any)[toggleCommandName]().run());
        }
      }}
      size="sm"
      variant={isActive ? 'default' : 'ghost'}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {icon}
    </Button>
  );
};

// Text formatting toolbar
const TextFormattingToolbar = ({ editor }: { editor: Editor | null }) => {
  const updateDraftComponent = useEditorStore(state => state.updateDraftComponent);

  // Force re-render when editor state changes
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const updateCallback = () => setTick(tick => tick + 1);
    editor.on('transaction', updateCallback);
    editor.on('selectionUpdate', updateCallback);
    return () => {
      editor.off('transaction', updateCallback);
      editor.off('selectionUpdate', updateCallback);
    };
  }, [editor]);
  
  // Early return AFTER hooks
  if (!editor) return null;

  // Get current font size from selected text
  const getCurrentFontSize = () => {
    const marks = editor.state.selection.$from.marks();
    for (const mark of marks) {
      if (mark.type.name === 'textStyle' && mark.attrs.fontSize) {
        // Handle both string (e.g., "16px") and number (e.g., 16) formats
        const fontSize = mark.attrs.fontSize;
        if (typeof fontSize === 'string') {
          return parseInt(fontSize.replace('px', ''));
        } else if (typeof fontSize === 'number') {
          return fontSize;
        }
      }
    }
    return null; // No specific font size set
  };

  const currentFontSize = getCurrentFontSize();

  return (
    <div 
      className="flex flex-wrap gap-1 p-2 border-b"
      onMouseDown={(e) => {
        e.stopPropagation();
        // Prevent any focus changes when interacting with toolbar
        if (e.target instanceof HTMLElement && !e.target.closest('.tiptap-editor-content')) {
          e.preventDefault();
        }
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        e.stopPropagation();
        // Keep focus on editor
        if (editor && !editor.isFocused) {
          editor.commands.focus();
        }
      }}
    >
      <div className="flex gap-1">
        <FormattingButton
          icon={<Bold size={16} />}
          commandName="bold"
          tooltip="Bold"
          editor={editor}
          updateDraftComponent={updateDraftComponent}
        />
        <FormattingButton
          icon={<Italic size={16} />}
          commandName="italic"
          tooltip="Italic"
          editor={editor}
          updateDraftComponent={updateDraftComponent}
        />
        <FormattingButton
          icon={<Underline size={16} />}
          commandName="underline"
          tooltip="Underline"
          editor={editor}
          updateDraftComponent={updateDraftComponent}
        />
        <FormattingButton
          icon={<Strikethrough size={16} />}
          commandName="strike"
          tooltip="Strikethrough"
          editor={editor}
          updateDraftComponent={updateDraftComponent}
        />
      </div>
      
      <Separator orientation="vertical" className="h-8" />
      
      <div className="flex gap-1">
        {/* Font Size Dropdown */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button 
              size="sm" 
              variant="ghost" 
              className="gap-1"
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              onFocus={(e) => {
                e.preventDefault();
                editor.commands.focus();
              }}
            >
              <span className="text-xs w-8">{currentFontSize || 'Size'}</span>
              <ChevronDown size={12} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
            }}
            onInteractOutside={(e) => {
              e.preventDefault();
            }}
            onFocusOutside={(e) => {
              e.preventDefault();
            }}
          >
            {[8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72].map(size => (
              <DropdownMenuItem
                key={size}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  editor.chain().focus().setFontSize(`${size}px`).run();
                  setTimeout(() => {
                    const updatedContent = editor.getJSON();
                    const { transformTiptapToMyFormat } = require('@/utils/tiptapUtils');
                    const customDoc = transformTiptapToMyFormat(updatedContent);
                    const componentId = editor.options.editorProps?.attributes?.['data-component-id'];
                    if (componentId && typeof componentId === 'string' && updateDraftComponent) {
                      updateDraftComponent(componentId, 'props.texts', customDoc, true);
                    }
                  }, 10);
                }}
                className={currentFontSize === size ? 'bg-muted' : ''}
              >
                {size}px
              </DropdownMenuItem>
            ))}
            {currentFontSize && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    editor.chain().focus().unsetFontSize().run();
                    setTimeout(() => {
                      const updatedContent = editor.getJSON();
                      const { transformTiptapToMyFormat } = require('@/utils/tiptapUtils');
                      const customDoc = transformTiptapToMyFormat(updatedContent);
                      const componentId = editor.options.editorProps?.attributes?.['data-component-id'];
                      if (componentId && typeof componentId === 'string' && updateDraftComponent) {
                        updateDraftComponent(componentId, 'props.texts', customDoc, true);
                      }
                    }, 10);
                  }}
                >
                  Remove Size
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Heading Dropdown */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button 
              size="sm" 
              variant="ghost"
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              onFocus={(e) => {
                e.preventDefault();
                editor.commands.focus();
              }}
            >
              <TypeIcon size={16} />
              <ChevronDown size={12} className="ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
            }}
            onInteractOutside={(e) => {
              e.preventDefault();
            }}
            onFocusOutside={(e) => {
              e.preventDefault();
            }}
          >
            <DropdownMenuItem
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                editor.chain().focus().setParagraph().run();
                setTimeout(() => {
                  const updatedContent = editor.getJSON();
                  const { transformTiptapToMyFormat } = require('@/utils/tiptapUtils');
                  const customDoc = transformTiptapToMyFormat(updatedContent);
                  const componentId = editor.options.editorProps?.attributes?.['data-component-id'];
                  if (componentId && typeof componentId === 'string' && updateDraftComponent) {
                    updateDraftComponent(componentId, 'props.texts', customDoc, true);
                  }
                }, 10);
              }}
              className={!editor.isActive('heading') ? 'bg-muted' : ''}
            >
              Normal
            </DropdownMenuItem>
            {[1, 2, 3].map(level => (
              <DropdownMenuItem
                key={level}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run();
                  setTimeout(() => {
                    const updatedContent = editor.getJSON();
                    const { transformTiptapToMyFormat } = require('@/utils/tiptapUtils');
                    const customDoc = transformTiptapToMyFormat(updatedContent);
                    const componentId = editor.options.editorProps?.attributes?.['data-component-id'];
                    if (componentId && typeof componentId === 'string' && updateDraftComponent) {
                      updateDraftComponent(componentId, 'props.texts', customDoc, true);
                    }
                  }, 10);
                }}
                className={editor.isActive('heading', { level }) ? 'bg-muted' : ''}
              >
                Heading {level}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        
        <FormattingButton
          icon={<Highlighter size={16} />}
          commandName="highlight"
          tooltip="Highlight"
          editor={editor}
          updateDraftComponent={updateDraftComponent}
        />
        
        <FormattingButton
          icon={<Superscript size={16} />}
          commandName="superscript"
          tooltip="Superscript"
          editor={editor}
          updateDraftComponent={updateDraftComponent}
        />
        
        <FormattingButton
          icon={<Subscript size={16} />}
          commandName="subscript"
          tooltip="Subscript"
          editor={editor}
          updateDraftComponent={updateDraftComponent}
        />
      </div>
      
      <Separator orientation="vertical" className="h-8" />
      
      <div className="flex gap-1">
        <FormattingButton
          icon={<List size={16} />}
          commandName="bulletList"
          tooltip="Bullet List"
          editor={editor}
          updateDraftComponent={updateDraftComponent}
        />
        <FormattingButton
          icon={<ListOrdered size={16} />}
          commandName="orderedList"
          tooltip="Ordered List"
          editor={editor}
          updateDraftComponent={updateDraftComponent}
        />
      </div>
    </div>
  );
};

const ShapeSettingsEditor: React.FC<ShapeSettingsEditorProps> = ({
  component,
  onUpdate,
  onPropUpdate,
  saveToHistory,
}) => {
  const shapeDef = registry.getDefinition('Shape');
  const shapeSchema = shapeDef?.schema?.properties || {};
  
  const props = component.props;
  const isRectangle = props.shapeType === 'rectangle';
  const { slideId } = useActiveSlide();
  const { startTransientOperation, endTransientOperation } = useHistoryStore();
  
  // Track if we're currently picking colors to prevent history saves
  const [isPickingColor, setIsPickingColor] = React.useState(false);
  
  // Handle color picker start - start transient operation
  const handleColorPickerStart = () => {
    if (slideId) {
      startTransientOperation(component.id, slideId);
      setIsPickingColor(true);
    }
  };
  
  // Handle color picker complete - end transient operation
  const handleColorPickerComplete = () => {
    if (slideId && isPickingColor) {
      endTransientOperation(component.id, slideId);
      setIsPickingColor(false);
    }
  };
  
  // Direct color change handler - updates immediately without history
  const handleColorChange = (value: any) => {
    // Emit only prop deltas to avoid overwriting concurrent updates
    if (typeof value === 'object' && value !== null && 'type' in value) {
      onPropUpdate?.('gradient', value, true);
      onPropUpdate?.('fill', null, true);
    } else {
      onPropUpdate?.('fill', value, true);
      onPropUpdate?.('gradient', null, true);
    }
  };
  
  // Get the active TipTap editor from store
  const activeTiptapEditor = useEditorStore(state => state.activeTiptapEditor);
  
  // Local state to trigger rerender on editor selection changes
  const [, setSelectionTick] = useState(0);
  useEffect(() => {
    if (!activeTiptapEditor) return;
    const onSelectionUpdate = () => setSelectionTick(n => n + 1);
    activeTiptapEditor.on('selectionUpdate', onSelectionUpdate);
    return () => {
      activeTiptapEditor.off('selectionUpdate', onSelectionUpdate);
    };
  }, [activeTiptapEditor]);

  const handleUpdate = (propName: string, value: any, skipHistory?: boolean) => {
    if (onPropUpdate) {
      onPropUpdate(propName, value, skipHistory);
      return;
    }
    const updates = { props: { ...props, [propName]: value } };
    onUpdate(updates);
  };

  const renderShapeProperties = () => {
  return (
    <div className="space-y-4">
      {/* Shape Type */}
        <div>
          <PropertyControlRenderer
            propName="shapeType"
            schema={shapeSchema.shapeType}
            currentValue={props.shapeType || 'rectangle'}
            onUpdate={(propName, value) => handleUpdate(propName, value)}
            saveComponentToHistory={saveToHistory}
          />
      </div>

        {/* Enable Text Switch */}
        <div className="flex items-center justify-between py-2">
          <Label htmlFor="enable-text">Enable Text</Label>
          <Switch
            id="enable-text"
            checked={props.hasText || false}
            onCheckedChange={(checked) => {
              handleUpdate('hasText', checked);
              if (checked && !props.texts) {
                // Initialize with empty text
                handleUpdate('texts', {
                  type: 'doc',
                  content: [{
                    type: 'paragraph',
                    content: [{
                      type: 'text',
                      text: '',
                      style: {}
                    }]
                  }]
                });
              }
            }}
          />
      </div>

        <Separator />
        
        {/* Fill and Stroke */}
        <div className="space-y-3">
          <PropertyControlRenderer
            propName="fill"
            schema={shapeSchema.fill}
            currentValue={props.fill || '#4287f5ff'}
            onUpdate={(propName, value, skip) => handleUpdate(propName, value, skip)}
            saveComponentToHistory={saveToHistory}
            componentProps={props}
          />
          <PropertyControlRenderer
            propName="stroke"
            schema={shapeSchema.stroke}
            currentValue={props.stroke || '#000000ff'}
            onUpdate={(propName, value, skip) => handleUpdate(propName, value, skip)}
            saveComponentToHistory={saveToHistory}
            componentProps={props}
          />
          <PropertyControlRenderer
            propName="strokeWidth"
            schema={shapeSchema.strokeWidth}
            currentValue={props.strokeWidth || 0}
            onUpdate={(propName, value, skip) => handleUpdate(propName, value, skip)}
            saveComponentToHistory={saveToHistory}
            componentProps={props}
          />
        </div>

        {/* Border Radius (for rectangles) */}
        {isRectangle && (
          <div>
            <PropertyControlRenderer
              propName="borderRadius"
              schema={shapeSchema.borderRadius}
              currentValue={props.borderRadius || 0}
              onUpdate={(propName, value) => handleUpdate(propName, value)}
              saveComponentToHistory={saveToHistory}
            />
          </div>
        )}

        {/* Shadow */}
        <div className="space-y-3">
          <PropertyControlRenderer
            propName="shadow"
            schema={shapeSchema.shadow}
            currentValue={props.shadow || false}
            onUpdate={(propName, value) => handleUpdate(propName, value)}
            saveComponentToHistory={saveToHistory}
          />
          {props.shadow && (
            <>
              <PropertyControlRenderer
                propName="shadowColor"
                schema={shapeSchema.shadowColor}
                currentValue={props.shadowColor || '#0000004D'}
                onUpdate={(propName, value) => handleUpdate(propName, value)}
                saveComponentToHistory={saveToHistory}
              />
              <div className="grid grid-cols-2 gap-2">
                <PropertyControlRenderer
                  propName="shadowOffsetX"
                  schema={shapeSchema.shadowOffsetX}
                  currentValue={props.shadowOffsetX || 0}
                  onUpdate={(propName, value) => handleUpdate(propName, value)}
                  saveComponentToHistory={saveToHistory}
                />
                <PropertyControlRenderer
                  propName="shadowOffsetY"
                  schema={shapeSchema.shadowOffsetY}
                  currentValue={props.shadowOffsetY || 4}
                  onUpdate={(propName, value) => handleUpdate(propName, value)}
                  saveComponentToHistory={saveToHistory}
                  />
                </div>
              <PropertyControlRenderer
                propName="shadowBlur"
                schema={shapeSchema.shadowBlur}
                currentValue={props.shadowBlur || 10}
                onUpdate={(propName, value) => handleUpdate(propName, value)}
                saveComponentToHistory={saveToHistory}
              />
            </>
          )}
        </div>
      </div>
    );
  };

  const renderTextProperties = () => {
    if (!props.hasText) return null;
    
    return (
      <div className="space-y-4">
        {/* Text Formatting Toolbar */}
        {activeTiptapEditor && (
          <>
            <Label className="text-xs font-medium mb-1">Selected Text Formatting</Label>
            <TextFormattingToolbar editor={activeTiptapEditor} />
          </>
        )}
        
        <Separator />
        
        {/* Font Settings */}
        <div className="space-y-3">
          <PropertyControlRenderer
            propName="fontFamily"
            schema={shapeSchema.fontFamily}
            currentValue={props.fontFamily || 'Poppins'}
            onUpdate={(propName, value) => handleUpdate(propName, value)}
            saveComponentToHistory={saveToHistory}
          />
          <div className="grid grid-cols-2 gap-2">
            <PropertyControlRenderer
              propName="fontSize"
              schema={shapeSchema.fontSize}
              currentValue={props.fontSize || 16}
              onUpdate={(propName, value) => handleUpdate(propName, value)}
              saveComponentToHistory={saveToHistory}
            />
            <PropertyControlRenderer
              propName="fontWeight"
              schema={shapeSchema.fontWeight}
              currentValue={props.fontWeight || 'normal'}
              onUpdate={(propName, value) => handleUpdate(propName, value)}
              saveComponentToHistory={saveToHistory}
            />
          </div>
      </div>

        {/* Text Color */}
        <div>
          <PropertyControlRenderer
            propName="textColor"
            schema={shapeSchema.textColor}
            currentValue={props.textColor || '#000000ff'}
            onUpdate={(propName, value) => handleUpdate(propName, value)}
            saveComponentToHistory={saveToHistory}
          />
        </div>
        
        {/* Typography */}
        <div className="grid grid-cols-2 gap-2">
          <PropertyControlRenderer
            propName="letterSpacing"
            schema={shapeSchema.letterSpacing}
            currentValue={props.letterSpacing || 0}
            onUpdate={(propName, value) => handleUpdate(propName, value)}
            saveComponentToHistory={saveToHistory}
          />
          <PropertyControlRenderer
            propName="lineHeight"
            schema={shapeSchema.lineHeight}
            currentValue={props.lineHeight || 1.5}
            onUpdate={(propName, value) => handleUpdate(propName, value)}
            saveComponentToHistory={saveToHistory}
          />
        </div>
          
        {/* Alignment */}
        <div className="grid grid-cols-2 gap-2">
          <PropertyControlRenderer
            propName="alignment"
            schema={shapeSchema.alignment}
            currentValue={props.alignment || 'center'}
            onUpdate={(propName, value) => handleUpdate(propName, value)}
            saveComponentToHistory={saveToHistory}
          />
          <PropertyControlRenderer
            propName="verticalAlignment"
            schema={shapeSchema.verticalAlignment}
            currentValue={props.verticalAlignment || 'middle'}
            onUpdate={(propName, value) => handleUpdate(propName, value)}
            saveComponentToHistory={saveToHistory}
          />
        </div>
        
        {/* Text Padding */}
        <PropertyControlRenderer
          propName="textPadding"
          schema={shapeSchema.textPadding}
          currentValue={props.textPadding || 16}
          onUpdate={(propName, value) => handleUpdate(propName, value)}
          saveComponentToHistory={saveToHistory}
        />
    </div>
  );
  };

  // Move useState outside of conditional - must be at top level
  const [activeTab, setActiveTab] = useState<'shape' | 'text'>('shape');

  if (props.hasText) {
    return (
      <div className="w-full">
        {/* Tab Pills - Compact Style matching ImagePicker */}
        <div className="flex gap-1 mb-3">
          <button
            onClick={() => setActiveTab('shape')}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
              activeTab === 'shape' 
                ? "bg-black text-white dark:bg-white dark:text-black" 
                : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
            )}
          >
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            </svg>
            Shape
          </button>
          <button
            onClick={() => setActiveTab('text')}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
              activeTab === 'text' 
                ? "bg-black text-white dark:bg-white dark:text-black" 
                : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
            )}
          >
            <TypeIcon className="w-3 h-3" />
            Text
          </button>
        </div>
        
        {/* Tab Content */}
        <div className="w-full">
          {activeTab === 'shape' && renderShapeProperties()}
          {activeTab === 'text' && renderTextProperties()}
        </div>
      </div>
    );
  }
  
  return renderShapeProperties();
};

export default ShapeSettingsEditor; 