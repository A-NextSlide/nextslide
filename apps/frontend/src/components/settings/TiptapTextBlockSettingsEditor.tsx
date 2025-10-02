import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  Type, ArrowDownUp, ArrowUpDown, Maximize, AlignLeft, AlignCenter, AlignRight, AlignJustify, 
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, 
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, ArrowLeftRight, BoxSelect, 
  MoveVertical, AlignVerticalSpaceBetween, Rows3, AlignVerticalDistributeCenter,
  Heading, Link2, Highlighter, Subscript, Superscript, Palette, MoreHorizontal 
} from 'lucide-react';
import GradientPicker from '@/components/GradientPicker';
import { ComponentInstance } from '@/types/components';
import PropertyControlRenderer from './PropertyControlRenderer';
import { getComponentDefinition } from '@/registry';
import { createControlMetadataFactory } from '@/registry/utils';
import { TSchema } from '@sinclair/typebox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { IconButton } from '@/components/ui/IconButton';
import { Label } from '@/components/ui/label';
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// --- Tiptap Imports ---
import { useEditor, Editor } from '@tiptap/react';
import { useEditorStore } from '@/stores/editorStore';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { transformTiptapToMyFormat } from '@/utils/tiptapUtils';
import { fontSupportsFormatting, fontDefaultIsBold, getAvailableFontWeights } from '@/utils/fontCapabilities';
// --- End Store Import ---

interface TiptapTextBlockSettingsEditorProps {
  component: ComponentInstance;
  onUpdate: (propName: string, value: any, skipHistory?: boolean) => void;
  saveToHistory: (message?: string) => void;
}

// --- Formatting Button Component ---
interface FormattingButtonProps {
  editor: Editor;
  commandName: 'bold' | 'italic' | 'underline' | 'strike' | 'bulletList' | 'orderedList' |
               'heading' | 'highlight' | 'subscript' | 'superscript' | 'link';
  tooltipText: string;
  Icon: React.ElementType;
  level?: number; // For heading levels
  disabled?: boolean;
}

// --- Color Picker Component (uses GradientPicker) ---
interface ColorPickerProps {
  editor: Editor;
}

const ColorPicker: React.FC<ColorPickerProps> = ({ editor }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { updateComponent } = useActiveSlide();

  const handleColorChange = (color: string) => {
    if (!editor) return;
    // Only apply solid colors through Tiptap's Color extension
    // Gradients are not supported by Tiptap and must be applied at the block level
    if (typeof color === 'string' && !color.includes('gradient')) {
      editor.chain().focus().setColor(color).run();
    }
  };

  const handleChangeComplete = () => {
    if (!editor) return;
    const updatedContent = editor.getJSON();
    const componentId = editor.options.editorProps?.attributes?.['data-component-id'];
    if (componentId && typeof componentId === 'string') {
      const customDoc = transformTiptapToMyFormat(updatedContent);
      // Commit final color change and record history
      updateComponent(componentId, { props: { texts: customDoc } }, true);
    }
    setIsOpen(false);
  };

  const currentColor = editor.getAttributes('textStyle').color || '#000000';
  // Commit current editor content to component draft
  const commitChange = () => {
    if (!editor) return;
    const updatedContent = editor.getJSON();
    const componentId = editor.options.editorProps?.attributes?.['data-component-id'];
    if (componentId && typeof componentId === 'string') {
      const customDoc = transformTiptapToMyFormat(updatedContent);
      // Commit text color change to history
      updateComponent(componentId, { props: { texts: customDoc } }, true);
    }
  };
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) commitChange();
  };
  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <div
                className="w-6 h-6 rounded-md border border-input cursor-pointer"
                style={{ backgroundColor: currentColor }}
                onMouseDown={(e) => e.preventDefault()}
              />
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent><p className="text-xs">Text Color</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent className="w-64 p-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col space-y-2">
          <p className="text-xs font-medium mb-1">Text Color</p>
          <GradientPicker
            value={currentColor}
            onChange={handleColorChange}
            onChangeComplete={handleChangeComplete}
            forceMode="solid"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Note: Gradients must be applied to the entire text block using the Font color selector below.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const FormattingButton: React.FC<FormattingButtonProps> = ({
  editor,
  commandName,
  tooltipText,
  Icon,
  level,
  disabled = false,
}) => {
  const updateDraftComponent = useEditorStore(state => state.updateDraftComponent);
  const { updateComponent } = useActiveSlide();
  
  // Force re-render when editor state changes (including font changes)
  const [, setTick] = useState(0);
  const draftComponents = useEditorStore(state => state.draftComponents);
  
  useEffect(() => {
    if (!editor) return;
    const updateCallback = () => setTick(tick => tick + 1);
    editor.on('transaction', updateCallback);
    return () => {
      editor.off('transaction', updateCallback);
    };
  }, [editor]);
  
  // Also re-render when draft components change (font family changes)
  useEffect(() => {
    setTick(tick => tick + 1);
  }, [draftComponents]);

  if (!editor) return null;

  // Get the current font family from the component props
  const currentFontFamily = getCurrentFontFamily(editor);

  // Check if the current font supports this formatting
  const isFormattingSupported = ['bold', 'italic', 'underline', 'strike'].includes(commandName) 
    ? fontSupportsFormatting(currentFontFamily, commandName as 'bold' | 'italic' | 'underline' | 'strike')
    : true; // Other commands (lists, headings, etc.) are always supported

  const isDisabled = disabled || !isFormattingSupported;



  const runCommandAndUpdate = (commandFn: () => boolean) => {
    try {
      const success = commandFn();
      setTimeout(() => {
        const updatedContent = editor.getJSON();
        const customDoc = transformTiptapToMyFormat(updatedContent);
        const componentId = editor.options.editorProps?.attributes?.['data-component-id'];
        if (componentId && typeof componentId === 'string' && updateDraftComponent) {
          updateDraftComponent(componentId, 'props.texts', customDoc, true);
        } else {
          console.warn("Could not update component: missing componentId or updateDraftComponent function");
        }
      }, 10);
    } catch (e) {
      console.error(`Error running editor command for ${commandName}:`, e);
    }
  };

  // Check if mark/node is active, accounting for headings with levels
  let isActive = commandName === 'heading' && level 
    ? editor.isActive('heading', { level }) 
    : editor.isActive(commandName);

  // Special handling for bold button: if font's default is bold, show bold as active by default
  if (commandName === 'bold' && !isActive && fontDefaultIsBold(currentFontFamily)) {
    isActive = true;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton
          active={isActive}
          disabled={isDisabled}
          className={isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
          onClick={() => {
            if (isDisabled) return;
            const chain = editor.chain().focus();
            const { state } = editor;
            const { selection, doc } = state;
            const isListCommand = commandName === 'bulletList' || commandName === 'orderedList';
            const isSelectAll = selection.from === 0 && selection.to === doc.content.size;
            const hasSelection = selection.from < selection.to;

            // If no text is selected, select all text first (except for list commands)
            if (!hasSelection && !isListCommand) {
              chain.selectAll();
            }

            // Special case: Toggle OFF a list when the entire document is selected
            if (isListCommand && isActive && isSelectAll) {
              // Use clearNodes only for this specific scenario
              runCommandAndUpdate(() => chain.clearNodes().unsetAllMarks().run());
            } else if (commandName === 'heading' && level) {
              // Handle heading with level
              runCommandAndUpdate(() => chain.toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run());
            } else if (commandName === 'highlight') {
              // Handle highlight
              runCommandAndUpdate(() => chain.toggleHighlight().run());
            } else if (commandName === 'subscript') {
              // Handle subscript
              runCommandAndUpdate(() => chain.toggleSubscript().run());
            } else if (commandName === 'superscript') {
              // Handle superscript
              runCommandAndUpdate(() => chain.toggleSuperscript().run());
            } else if (commandName === 'bold') {
              // Special handling for bold button with smart weight switching
              const isFontInherentlyBold = fontDefaultIsBold(currentFontFamily);
              const isBoldActive = editor.isActive('bold');
              
              if (isFontInherentlyBold) {
                // For inherently bold fonts, toggle between bold and lighter weight
                if (isBoldActive || !editor.isActive('bold')) {
                  // Currently bold or default bold - switch to lighter weight
                  const availableWeights = getAvailableFontWeights(currentFontFamily);
                  const lighterWeights = availableWeights.filter(w => {
                    const weightValue = w === 'normal' ? 400 : (w === 'bold' ? 700 : parseInt(w) || 400);
                    return weightValue < 600; // Lighter than bold
                  });
                  
                  if (lighterWeights.length > 0) {
                    // Use the lightest available weight
                    const lightestWeight = lighterWeights[0];
                    runCommandAndUpdate(() => {
                      // Remove bold mark and apply lighter weight via component props
                      const success = chain.unsetBold().run();
                      
                                             // Update component font weight
                       setTimeout(() => {
                         const componentId = editor.options.editorProps?.attributes?.['data-component-id'];
                         if (componentId && typeof componentId === 'string') {
                           updateComponent(componentId, { props: { fontWeight: lightestWeight } }, true);
                         }
                       }, 20);
                      
                      return success;
                    });
                  } else {
                    // Fallback: just toggle bold mark
                    runCommandAndUpdate(() => chain.toggleBold().run());
                  }
                } else {
                  // Currently not bold - make it bold
                  runCommandAndUpdate(() => chain.setBold().run());
                }
              } else {
                // For normal fonts, standard bold toggle
                runCommandAndUpdate(() => chain.toggleBold().run());
              }
            } else {
              // Default behavior for other commands (italic, underline, etc.)
              const toggleCommandName = `toggle${commandName.charAt(0).toUpperCase() + commandName.slice(1)}`;
              if (editor.can() && (editor.can() as any)[toggleCommandName]()) {
                runCommandAndUpdate(() => (chain as any)[toggleCommandName]().run());
              }
            }
          }}
          size="sm"
          variant={isActive ? 'default' : 'ghost'}
          onMouseDown={(e) => e.preventDefault()}
        >
          <Icon size={16} />
        </IconButton>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">
          {isDisabled && !isFormattingSupported 
            ? `${tooltipText} not supported by ${currentFontFamily}` 
            : tooltipText}
        </p>
      </TooltipContent>
    </Tooltip>
  );
};
// --- End Formatting Button Component ---

// --- Heading Button Component ---
interface HeadingButtonProps {
  editor: Editor;
  updateDraftComponent?: (id: string, key: string, value: any, skipHistory?: boolean) => void;
}

const HeadingButton: React.FC<HeadingButtonProps> = ({ editor, updateDraftComponent }) => {
  const updateHeading = (level: number) => {
    if (!editor) return;
    
    const { state } = editor;
    const { selection } = state;
    const hasSelection = selection.from < selection.to;
    
    const chain = editor.chain().focus();
    // If no text is selected, select all text first
    if (!hasSelection) {
      chain.selectAll();
    }
    // Toggle heading at the specified level
    chain.toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run();
    
    // Update component after heading change
    setTimeout(() => {
      const updatedContent = editor.getJSON();
      const componentId = editor.options.editorProps?.attributes?.['data-component-id'];
      
      if (componentId && typeof componentId === 'string' && updateDraftComponent) {
        // Import inside the function to avoid circular dependencies
        const { transformTiptapToMyFormat } = require('@/utils/tiptapUtils');
        const customDoc = transformTiptapToMyFormat(updatedContent);
        updateDraftComponent(componentId, 'props.texts', customDoc, true);
      }
    }, 10);
  };
  
  // Check if any heading level is active
  const isHeadingActive = [1, 2, 3].some(level => editor.isActive('heading', { level }));
  const activeLevel = [1, 2, 3].find(level => editor.isActive('heading', { level }));
  
  return (
    <Popover>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <IconButton
                active={isHeadingActive}
                size="sm"
                variant={isHeadingActive ? 'default' : 'ghost'}
                onMouseDown={(e) => e.preventDefault()}
              >
                <Heading size={16} />
              </IconButton>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent><p className="text-xs">Heading</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
      
      <PopoverContent className="p-0 w-24">
        <div className="flex flex-col">
          {[1, 2, 3].map(level => (
            <button
              key={level}
              className={`px-3 py-2 hover:bg-muted text-left ${activeLevel === level ? 'bg-muted font-medium' : ''}`}
              onClick={() => updateHeading(level)}
              onMouseDown={(e) => e.preventDefault()}
            >
              <span className="text-xs">Heading {level}</span>
            </button>
          ))}
          <button
            className={`px-3 py-2 hover:bg-muted text-left ${!isHeadingActive ? 'bg-muted font-medium' : ''}`}
            onClick={() => {
              const { state } = editor;
              const { selection } = state;
              const hasSelection = selection.from < selection.to;
              
              const chain = editor.chain().focus();
              // If no text is selected, select all text first
              if (!hasSelection) {
                chain.selectAll();
              }
              chain.setParagraph().run();
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <span className="text-xs">Normal Text</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

// --- Link Button Component ---
interface LinkButtonProps {
  editor: Editor;
  updateDraftComponent?: (id: string, key: string, value: any, skipHistory?: boolean) => void;
}

// Link Modal Component
interface LinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (url: string) => void;
  currentUrl?: string;
}

const LinkModal: React.FC<LinkModalProps> = ({ isOpen, onClose, onSubmit, currentUrl = '' }) => {
  const [url, setUrl] = useState(currentUrl);

  useEffect(() => {
    setUrl(currentUrl);
  }, [currentUrl]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(url);
    onClose();
  };

  const handleRemove = () => {
    onSubmit('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose}>
      <div className="absolute top-1/2 right-4 transform -translate-y-1/2 bg-background border border-border rounded-lg p-6 w-[450px]" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">Add Link</h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <Label htmlFor="url" className="text-sm font-medium">URL</Label>
              <Input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="mt-1"
                autoFocus
              />
            </div>
            <div className="flex justify-between gap-2">
              <div className="flex gap-2">
                {currentUrl && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleRemove}
                  >
                    Remove Link
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!url.trim()}
                >
                  {currentUrl ? 'Update' : 'Add'} Link
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

const LinkButton: React.FC<LinkButtonProps> = ({ editor, updateDraftComponent }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');

  const handleOpenModal = () => {
    if (!editor) return;
    
    // Get current URL and clean it
    let previousUrl = editor.getAttributes('link').href || '';
    if (typeof window !== 'undefined' && previousUrl) {
      try {
        const { origin, pathname } = window.location;
        const prefix = origin + pathname;
        if (previousUrl.startsWith(prefix)) {
          // Remove origin and base path
          previousUrl = previousUrl.slice(prefix.length);
          // Trim leading slash
          if (previousUrl.startsWith('/')) previousUrl = previousUrl.slice(1);
        }
      } catch {
        // ignore
      }
    }
    
    setCurrentUrl(previousUrl);
    setIsModalOpen(true);
  };

  const handleSubmitLink = (url: string) => {
    if (!editor) return;
    
    if (url === '') {
      // Remove link
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      // Add/update link
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
    
    // Update component
    setTimeout(() => {
      const updatedContent = editor.getJSON();
      const componentId = editor.options.editorProps?.attributes?.['data-component-id'];
      
      if (componentId && typeof componentId === 'string' && updateDraftComponent) {
        const { transformTiptapToMyFormat } = require('@/utils/tiptapUtils');
        const customDoc = transformTiptapToMyFormat(updatedContent);
        updateDraftComponent(componentId, 'props.texts', customDoc, true);
      }
    }, 10);
  };
  
  const isActive = editor.isActive('link');
  
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton
            active={isActive}
            onClick={handleOpenModal}
            size="sm"
            variant={isActive ? 'default' : 'ghost'}
            onMouseDown={(e) => e.preventDefault()}
          >
            <Link2 size={16} />
          </IconButton>
        </TooltipTrigger>
        <TooltipContent><p className="text-xs">Add Link</p></TooltipContent>
      </Tooltip>
      
      <LinkModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmitLink}
        currentUrl={currentUrl}
      />
    </>
  );
};

// Link Button for Dropdown Menu
const LinkButtonDropdown: React.FC<LinkButtonProps> = ({ editor, updateDraftComponent }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');

  const handleOpenModal = () => {
    if (!editor) return;
    
    // Get current URL and clean it
    let previousUrl = editor.getAttributes('link').href || '';
    if (typeof window !== 'undefined' && previousUrl) {
      try {
        const { origin, pathname } = window.location;
        const prefix = origin + pathname;
        if (previousUrl.startsWith(prefix)) {
          // Remove origin and base path
          previousUrl = previousUrl.slice(prefix.length);
          // Trim leading slash
          if (previousUrl.startsWith('/')) previousUrl = previousUrl.slice(1);
        }
      } catch {
        // ignore
      }
    }
    
    setCurrentUrl(previousUrl);
    setIsModalOpen(true);
  };

  const handleSubmitLink = (url: string) => {
    if (!editor) return;
    
    if (url === '') {
      // Remove link
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      // Add/update link
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
    
    // Update component
    setTimeout(() => {
      const updatedContent = editor.getJSON();
      const componentId = editor.options.editorProps?.attributes?.['data-component-id'];
      
      if (componentId && typeof componentId === 'string' && updateDraftComponent) {
        const { transformTiptapToMyFormat } = require('@/utils/tiptapUtils');
        const customDoc = transformTiptapToMyFormat(updatedContent);
        updateDraftComponent(componentId, 'props.texts', customDoc, true);
      }
    }, 10);
  };
  
  const isActive = editor.isActive('link');
  
  return (
    <>
      <button
        className={`flex items-center gap-2 px-3 py-2 rounded-sm hover:bg-muted text-sm w-full text-left ${
          isActive ? 'bg-muted font-medium' : ''
        }`}
        onClick={handleOpenModal}
        onMouseDown={(e) => e.preventDefault()}
      >
        <Link2 size={16} />
        Link
      </button>
      
      <LinkModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmitLink}
        currentUrl={currentUrl}
      />
    </>
  );
};

// Helper function to get current font family from editor
const getCurrentFontFamily = (editor: Editor): string => {
  const componentId = editor.options.editorProps?.attributes?.['data-component-id'];
  const editorStore = useEditorStore.getState();
  
  if (componentId) {
    // Search through all slides to find the component
    const allDraftComponents = Object.values(editorStore.draftComponents).flat();
    const currentComponent = allDraftComponents.find(comp => comp.id === componentId);
    const fontFamily = currentComponent?.props?.fontFamily || 'Arial';
    

    
    return fontFamily;
  }
  
  return 'Arial';
};

// --- Toolbar Component ---
const Toolbar = ({ editor }: { editor: Editor | null }) => {
  if (!editor) {
    return null;
  }
  
  const updateDraftComponent = useEditorStore(state => state.updateDraftComponent);

  // State to force re-render when editor state changes
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const updateCallback = () => setTick(tick => tick + 1);
    editor.on('transaction', updateCallback); // Update on any transaction
    editor.on('selectionUpdate', updateCallback); // Update on selection change
    return () => {
      editor.off('transaction', updateCallback);
      editor.off('selectionUpdate', updateCallback);
    };
  }, [editor]);

  // Check which extensions are available
  const hasExtension = (name: string) => {
    return editor.extensionManager.extensions.some(ext => ext.name === name);
  };

  // Basic formatting
  const hasBold = hasExtension('bold');
  const hasItalic = hasExtension('italic');
  const hasUnderline = hasExtension('underline');
  const hasStrike = hasExtension('strike');
  
  // Lists
  const hasBulletList = hasExtension('bulletList');
  const hasOrderedList = hasExtension('orderedList');
  
  // Advanced formatting
  const hasHeading = hasExtension('heading');
  const hasHighlight = hasExtension('highlight');
  const hasSubscript = hasExtension('subscript');
  const hasSuperscript = hasExtension('superscript');
  const hasLink = hasExtension('link');
  const hasTextStyle = hasExtension('textStyle');
  const hasColor = hasExtension('color');
  // Determine if there is an active text selection in the editor
  const { from, to } = editor.state.selection;
  const hasTextSelection = from < to;

  return (
    <div className="p-2 border-b border-border sticky top-0 bg-background z-10 mb-4"> {/* Sticky styles */}
       <TooltipProvider>
        <div className="flex flex-wrap items-center gap-1 mb-1">
            {/* Basic formatting */}
            {hasBold && <FormattingButton editor={editor} commandName="bold" tooltipText="Bold" Icon={Bold} />}
            {hasItalic && <FormattingButton editor={editor} commandName="italic" tooltipText="Italic" Icon={Italic} />}
            {hasUnderline && <FormattingButton editor={editor} commandName="underline" tooltipText="Underline" Icon={Underline} />}
            {hasStrike && <FormattingButton editor={editor} commandName="strike" tooltipText="Strikethrough" Icon={Strikethrough} />}
            
            {/* Add a separator before ellipsis menu */}
            {(hasHighlight || hasSubscript || hasSuperscript || hasHeading || hasLink) && (
              <div className="w-px h-5 bg-border mx-1"></div>
            )}
            
            {/* More options dropdown */}
            {(hasHighlight || hasSubscript || hasSuperscript || hasHeading || hasLink) && (
              <Popover>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <IconButton
                        size="sm"
                        variant="ghost"
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        <MoreHorizontal size={16} />
                      </IconButton>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent><p className="text-xs">More options</p></TooltipContent>
                </Tooltip>
                
                <PopoverContent className="w-56 p-1" align="start">
                  <div className="flex flex-col">
                    {/* Highlight */}
                    {hasHighlight && (
                      <button
                        className={`flex items-center gap-2 px-3 py-2 rounded-sm hover:bg-muted text-sm w-full text-left ${
                          editor.isActive('highlight') ? 'bg-muted font-medium' : ''
                        }`}
                        onClick={() => {
                          const { state } = editor;
                          const { selection } = state;
                          const hasSelection = selection.from < selection.to;
                          
                          const chain = editor.chain().focus();
                          // If no text is selected, select all text first
                          if (!hasSelection) {
                            chain.selectAll();
                          }
                          chain.toggleHighlight().run();
                          
                          // Update component
                          setTimeout(() => {
                            const updatedContent = editor.getJSON();
                            const componentId = editor.options.editorProps?.attributes?.['data-component-id'];
                            if (componentId && typeof componentId === 'string' && updateDraftComponent) {
                              const { transformTiptapToMyFormat } = require('@/utils/tiptapUtils');
                              const customDoc = transformTiptapToMyFormat(updatedContent);
                              updateDraftComponent(componentId, 'props.texts', customDoc, true);
                            }
                          }, 10);
                        }}
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        <Highlighter size={16} />
                        Highlight
                      </button>
                    )}
                    
                    {/* Superscript */}
                    {hasSuperscript && (
                      <button
                        className={`flex items-center gap-2 px-3 py-2 rounded-sm hover:bg-muted text-sm w-full text-left ${
                          editor.isActive('superscript') ? 'bg-muted font-medium' : ''
                        }`}
                        onClick={() => {
                          const { state } = editor;
                          const { selection } = state;
                          const hasSelection = selection.from < selection.to;
                          
                          const chain = editor.chain().focus();
                          // If no text is selected, select all text first
                          if (!hasSelection) {
                            chain.selectAll();
                          }
                          chain.toggleSuperscript().run();
                          
                          // Update component
                          setTimeout(() => {
                            const updatedContent = editor.getJSON();
                            const componentId = editor.options.editorProps?.attributes?.['data-component-id'];
                            if (componentId && typeof componentId === 'string' && updateDraftComponent) {
                              const { transformTiptapToMyFormat } = require('@/utils/tiptapUtils');
                              const customDoc = transformTiptapToMyFormat(updatedContent);
                              updateDraftComponent(componentId, 'props.texts', customDoc, true);
                            }
                          }, 10);
                        }}
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        <Superscript size={16} />
                        Superscript
                      </button>
                    )}
                    
                    {/* Subscript */}
                    {hasSubscript && (
                      <button
                        className={`flex items-center gap-2 px-3 py-2 rounded-sm hover:bg-muted text-sm w-full text-left ${
                          editor.isActive('subscript') ? 'bg-muted font-medium' : ''
                        }`}
                        onClick={() => {
                          const { state } = editor;
                          const { selection } = state;
                          const hasSelection = selection.from < selection.to;
                          
                          const chain = editor.chain().focus();
                          // If no text is selected, select all text first
                          if (!hasSelection) {
                            chain.selectAll();
                          }
                          chain.toggleSubscript().run();
                          
                          // Update component
                          setTimeout(() => {
                            const updatedContent = editor.getJSON();
                            const componentId = editor.options.editorProps?.attributes?.['data-component-id'];
                            if (componentId && typeof componentId === 'string' && updateDraftComponent) {
                              const { transformTiptapToMyFormat } = require('@/utils/tiptapUtils');
                              const customDoc = transformTiptapToMyFormat(updatedContent);
                              updateDraftComponent(componentId, 'props.texts', customDoc, true);
                            }
                          }, 10);
                        }}
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        <Subscript size={16} />
                        Subscript
                      </button>
                    )}
                    
                    {/* Divider */}
                    {((hasHighlight || hasSuperscript || hasSubscript) && (hasHeading || hasLink)) && (
                      <div className="h-px bg-border my-1"></div>
                    )}
                    
                    {/* Heading */}
                    {hasHeading && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            className={`flex items-center gap-2 px-3 py-2 rounded-sm hover:bg-muted text-sm w-full text-left ${
                              [1, 2, 3].some(level => editor.isActive('heading', { level })) ? 'bg-muted font-medium' : ''
                            }`}
                            onMouseDown={(e) => e.preventDefault()}
                          >
                            <Heading size={16} />
                            Heading
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-24" side="right" align="start">
                          <div className="flex flex-col">
                            {[1, 2, 3].map(level => (
                              <button
                                key={level}
                                className={`px-3 py-2 hover:bg-muted text-left text-sm ${
                                  editor.isActive('heading', { level }) ? 'bg-muted font-medium' : ''
                                }`}
                                onClick={() => {
                                  const { state } = editor;
                                  const { selection } = state;
                                  const hasSelection = selection.from < selection.to;
                                  
                                  const chain = editor.chain().focus();
                                  // If no text is selected, select all text first
                                  if (!hasSelection) {
                                    chain.selectAll();
                                  }
                                  chain.toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run();
                                  
                                  // Update component
                                  setTimeout(() => {
                                    const updatedContent = editor.getJSON();
                                    const componentId = editor.options.editorProps?.attributes?.['data-component-id'];
                                    if (componentId && typeof componentId === 'string' && updateDraftComponent) {
                                      const { transformTiptapToMyFormat } = require('@/utils/tiptapUtils');
                                      const customDoc = transformTiptapToMyFormat(updatedContent);
                                      updateDraftComponent(componentId, 'props.texts', customDoc, true);
                                    }
                                  }, 10);
                                }}
                                onMouseDown={(e) => e.preventDefault()}
                              >
                                H{level}
                              </button>
                            ))}
                            <button
                              className={`px-3 py-2 hover:bg-muted text-left text-sm ${
                                ![1, 2, 3].some(level => editor.isActive('heading', { level })) ? 'bg-muted font-medium' : ''
                              }`}
                              onClick={() => {
                                const { state } = editor;
                                const { selection } = state;
                                const hasSelection = selection.from < selection.to;
                                
                                const chain = editor.chain().focus();
                                // If no text is selected, select all text first
                                if (!hasSelection) {
                                  chain.selectAll();
                                }
                                chain.setParagraph().run();
                                
                                // Update component
                                setTimeout(() => {
                                  const updatedContent = editor.getJSON();
                                  const componentId = editor.options.editorProps?.attributes?.['data-component-id'];
                                  if (componentId && typeof componentId === 'string' && updateDraftComponent) {
                                    const { transformTiptapToMyFormat } = require('@/utils/tiptapUtils');
                                    const customDoc = transformTiptapToMyFormat(updatedContent);
                                    updateDraftComponent(componentId, 'props.texts', customDoc, true);
                                  }
                                }, 10);
                              }}
                              onMouseDown={(e) => e.preventDefault()}
                            >
                              Normal
                            </button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                    
                    {/* Link */}
                    {hasLink && (
                      <LinkButtonDropdown editor={editor} updateDraftComponent={updateDraftComponent} />
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            )}
        </div>
        
        <div className="flex items-center gap-1">
            {/* Lists */}
            {hasBulletList && <FormattingButton editor={editor} commandName="bulletList" tooltipText="Bullet List" Icon={List} />}
            {hasOrderedList && <FormattingButton editor={editor} commandName="orderedList" tooltipText="Numbered List" Icon={ListOrdered} />}
        </div>
       </TooltipProvider>
    </div>
  );
};
// --- End Toolbar Component ---

const TiptapTextBlockSettingsEditor: React.FC<TiptapTextBlockSettingsEditorProps> = ({
  component,
  onUpdate,
  saveToHistory,
}) => {
  // Get TiptapTextBlock schema definitions and properties
  const tiptapTextBlockDef = getComponentDefinition('TiptapTextBlock');
  const tiptapTextBlockSchema = tiptapTextBlockDef?.schema?.properties || {};
  
  const props = component.props;
  
  // Get the active TipTap editor from store
  const activeTiptapEditor = useEditorStore(state => state.activeTiptapEditor);
  // Local state to trigger rerender on editor selection changes
  const [, setSelectionTick] = useState(0);
  useEffect(() => {
    if (!activeTiptapEditor) return;
    // Re-render when selection changes to update color picker visibility
    const onSelectionUpdate = () => setSelectionTick(n => n + 1);
    activeTiptapEditor.on('selectionUpdate', onSelectionUpdate);
    return () => {
      activeTiptapEditor.off('selectionUpdate', onSelectionUpdate);
    };
  }, [activeTiptapEditor]);
  // Determine if there is an active text selection in the editor
  const hasTextSelection = Boolean(
    activeTiptapEditor &&
    activeTiptapEditor.state.selection.from < activeTiptapEditor.state.selection.to
  );

  const getTransparencyPattern = () => `
    linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%)
  `;

  const isGradient = (val: any): boolean => 
    typeof val === 'string' && val.includes('gradient');
  
  const renderTextAlignmentControls = () => {
    const horizontalAlignment = props.alignment || 'left'; // Use Tiptap prop
    const verticalAlignment = props.verticalAlignment || 'top'; // Use Tiptap prop
    
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-1">
          {/* Horizontal */}
          <div className="flex items-center gap-1">
            <TooltipProvider> {/* Add TooltipProvider here temporarily if needed */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton 
                    active={horizontalAlignment === 'left'} 
                    onClick={() => onUpdate('alignment', 'left')} 
                    size="sm" 
                    variant={horizontalAlignment === 'left' ? 'default' : 'ghost'}
                    onMouseDown={(e) => e.preventDefault()} // Keep preventDefault
                  >
                    <AlignLeft size={16} />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent><p className="text-xs">Align Left</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton 
                    active={horizontalAlignment === 'center'} 
                    onClick={() => onUpdate('alignment', 'center')} 
                    size="sm" 
                    variant={horizontalAlignment === 'center' ? 'default' : 'ghost'}
                    onMouseDown={(e) => e.preventDefault()} // Keep preventDefault
                  >
                    <AlignCenter size={16} />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent><p className="text-xs">Align Center</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton 
                    active={horizontalAlignment === 'right'} 
                    onClick={() => onUpdate('alignment', 'right')} 
                    size="sm" 
                    variant={horizontalAlignment === 'right' ? 'default' : 'ghost'}
                    onMouseDown={(e) => e.preventDefault()} // Keep preventDefault
                  >
                    <AlignRight size={16} />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent><p className="text-xs">Align Right</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {/* Vertical */}
          <div className="flex items-center gap-1">
             <TooltipProvider> {/* Add TooltipProvider here temporarily if needed */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton 
                    active={verticalAlignment === 'top'} 
                    onClick={() => onUpdate('verticalAlignment', 'top')} 
                    size="sm" 
                    variant={verticalAlignment === 'top' ? 'default' : 'ghost'}
                    onMouseDown={(e) => e.preventDefault()} // Keep preventDefault
                  >
                    <AlignVerticalJustifyStart size={16} />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent><p className="text-xs">Align Top</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton 
                    active={verticalAlignment === 'middle'} 
                    onClick={() => onUpdate('verticalAlignment', 'middle')} 
                    size="sm" 
                    variant={verticalAlignment === 'middle' ? 'default' : 'ghost'}
                    onMouseDown={(e) => e.preventDefault()} // Keep preventDefault
                  >
                    <AlignVerticalJustifyCenter size={16} />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent><p className="text-xs">Align Middle</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton 
                    active={verticalAlignment === 'bottom'} 
                    onClick={() => onUpdate('verticalAlignment', 'bottom')} 
                    size="sm" 
                    variant={verticalAlignment === 'bottom' ? 'default' : 'ghost'}
                    onMouseDown={(e) => e.preventDefault()} // Keep preventDefault
                  >
                    <AlignVerticalJustifyEnd size={16} />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent><p className="text-xs">Align Bottom</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    );
  };

  // Render text properties using TypeBox schemas
  const renderTextProperties = () => {
    const fontFamilySchema = tiptapTextBlockSchema['fontFamily'] as TSchema;
    const fontSizeSchema = tiptapTextBlockSchema['fontSize'] as TSchema;
    const fontWeightSchema = tiptapTextBlockSchema['fontWeight'] as TSchema;
    const letterSpacingSchema = tiptapTextBlockSchema['letterSpacing'] as TSchema;
    const lineHeightSchema = tiptapTextBlockSchema['lineHeight'] as TSchema;
    const paddingSchema = tiptapTextBlockSchema['padding'] as TSchema;
    
    if (!fontFamilySchema || !fontSizeSchema) {
      return null;
    }
    
    return (
      <div className="space-y-4">
        {/* Font Settings */}
        <div>
          <PropertyControlRenderer
            propName="fontFamily"
            schema={fontFamilySchema}
            currentValue={props.fontFamily || 'Inter'}
            onUpdate={onUpdate}
            saveComponentToHistory={saveToHistory}
            componentProps={props}
          />
        </div>
        
        {/* Size and Weight in a row */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <PropertyControlRenderer
              propName="fontSize"
              schema={fontSizeSchema}
              currentValue={props.fontSize || 16}
              onUpdate={onUpdate}
              saveComponentToHistory={saveToHistory}
            />
          </div>
          <div className="space-y-1">
            <PropertyControlRenderer
              propName="fontWeight"
              schema={fontWeightSchema}
              currentValue={props.fontWeight || 'normal'}
              onUpdate={onUpdate}
              saveComponentToHistory={saveToHistory}
              componentProps={props}
            />
          </div>
        </div>
        
        {/* Advanced Typography Controls */}
        <div className="grid grid-cols-3 gap-2">
          {/* Letter Spacing with icon inside dropdown */}
          <div className="space-y-1">
            <div className="relative rounded-md border border-input">
              <div className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground z-10 pointer-events-none">
                <ArrowLeftRight size={14} />
              </div>
              <div className="[&>*]:border-0 [&>*]:pl-7 [&>*]:w-full">
                {/* This CSS forces any child to have no border and padding-left */}
                <PropertyControlRenderer
                  propName="letterSpacing"
                  schema={letterSpacingSchema}
                  currentValue={props.letterSpacing || 0}
                  onUpdate={onUpdate}
                  saveComponentToHistory={saveToHistory}
                />
              </div>
            </div>
          </div>
          
          {/* Line Height with icon inside dropdown */}
          <div className="space-y-1">
            <div className="relative rounded-md border border-input">
              <div className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground z-10 pointer-events-none">
                <AlignVerticalSpaceBetween size={14} />
              </div>
              <div className="[&>*]:border-0 [&>*]:pl-7 [&>*]:w-full">
                <PropertyControlRenderer
                  propName="lineHeight"
                  schema={lineHeightSchema}
                  currentValue={props.lineHeight || 1.2}
                  onUpdate={onUpdate}
                  saveComponentToHistory={saveToHistory}
                />
              </div>
            </div>
          </div>
          
          {/* Padding with icon inside dropdown */}
          <div className="space-y-1">
            <div className="relative rounded-md border border-input">
              <div className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground z-10 pointer-events-none">
                <BoxSelect size={14} />
              </div>
              <div className="[&>*]:border-0 [&>*]:pl-7 [&>*]:w-full">
                <PropertyControlRenderer
                  propName="padding"
                  schema={paddingSchema}
                  currentValue={props.padding || 0}
                  onUpdate={onUpdate}
                  saveComponentToHistory={saveToHistory}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  // Render color controls
  const renderTextBlockColorControls = () => {
    const textColorPreviewStyle = isGradient(props.textColor)
      ? { backgroundImage: props.textColor }
      : { backgroundColor: props.textColor || '#000000' };
    
    const bgColorPreviewStyle = isGradient(props.backgroundColor)
      ? { backgroundImage: props.backgroundColor }
      : { backgroundColor: props.backgroundColor || 'transparent' };
    
    return (
      <div className="space-y-1">
        <Label className="text-xs">Colors</Label>
        <div className="flex items-center space-x-3">
          {/* Font color: inline picker when text selected, else block-level picker */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground block">Font</Label>
            {hasTextSelection && activeTiptapEditor ? (
              <ColorPicker editor={activeTiptapEditor} />
            ) : (
              <Popover>
                <PopoverTrigger asChild>
                  <div
                    className="w-6 h-6 rounded-md border cursor-pointer overflow-hidden"
                    style={{
                      backgroundImage: getTransparencyPattern(),
                      backgroundSize: '8px 8px',
                      backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
                      backgroundColor: '#fff',
                      WebkitMaskImage: 'radial-gradient(black, black)',
                      maskImage: 'radial-gradient(black, black)',
                    }}
                    onClick={() => saveToHistory('Saved initial font color state')}
                  >
                    <div
                      className="w-full h-full rounded-[0.3rem]"
                      style={textColorPreviewStyle}
                    />
                  </div>
                </PopoverTrigger>
                <PopoverContent className="p-0" onClick={e => e.stopPropagation()}>
                  <div onClick={e => e.stopPropagation()}>
                    <GradientPicker
                      value={props.textColor || '#000000'}
                      onChange={color => onUpdate('textColor', color, true)}
                      onChangeComplete={() => saveToHistory('Saved final font color state')}
                    />
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground block">Background</Label>
            <Popover>
              <PopoverTrigger asChild>
                <div 
                  className="w-6 h-6 rounded-md border cursor-pointer overflow-hidden" 
                  style={{ 
                    backgroundImage: getTransparencyPattern(),
                    backgroundSize: "8px 8px",
                    backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
                    backgroundColor: "#fff",
                    WebkitMaskImage: "radial-gradient(black, black)",
                    maskImage: "radial-gradient(black, black)"
                  }}
                  onClick={() => saveToHistory("Saved initial background color state")}
                >
                  <div 
                    className="w-full h-full rounded-[0.3rem]" 
                    style={bgColorPreviewStyle} 
                  />
                </div>
              </PopoverTrigger>
              <PopoverContent className="p-0" onClick={(e) => e.stopPropagation()}>
                <div onClick={(e) => e.stopPropagation()}>
                  <GradientPicker
                    value={props.backgroundColor || 'transparent'} 
                    onChange={color => onUpdate('backgroundColor', color, true)}
                    onChangeComplete={() => saveToHistory("Saved final background color state")}
                    forceMode="solid"
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Formatting Toolbar */}
      {activeTiptapEditor && (
        <div className="space-y-2">
          <Label className="text-xs">Formatting</Label>
          <Toolbar editor={activeTiptapEditor} />
        </div>
      )}
      
      {/* Text Properties */}
      {renderTextProperties()}
      
      {/* Text Alignment Controls */}
      <div className="space-y-2">
        <Label className="text-xs">Alignment</Label>
        {renderTextAlignmentControls()}
      </div>
      
      {/* Color Controls */}
      {renderTextBlockColorControls()}
    </div>
  );
};

export default TiptapTextBlockSettingsEditor; 