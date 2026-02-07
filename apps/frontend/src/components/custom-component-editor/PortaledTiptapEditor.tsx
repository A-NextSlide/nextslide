/**
 * PortaledTiptapEditor - Rich text editing for elements inside custom components
 *
 * Creates a Tiptap editor that is portaled to document.body and positioned
 * exactly over the element being edited. The original element in the iframe
 * is hidden during editing.
 */

import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Underline from '@tiptap/extension-underline';
import Strike from '@tiptap/extension-strike';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { motion } from 'framer-motion';
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  X,
  Check,
  Type,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { VirtualElement } from './types';
import { CoordinateTranslator } from './coordinateTranslator';

interface PortaledTiptapEditorProps {
  element: VirtualElement;
  coordinator: CoordinateTranslator;
  iframeRef: React.RefObject<HTMLIFrameElement>;
  onFinish: (newHtml: string, newText: string) => void;
  onCancel: () => void;
}

// Selection color for the editor border
const SELECTION_COLOR = '#FF4301';
const BRAND_ORANGE = '#FF4301';

// Common font families grouped by category
const FONT_FAMILIES = [
  { label: 'System Default', value: 'system-ui' },
  { label: 'Inter', value: 'Inter' },
  { label: 'Poppins', value: 'Poppins' },
  { label: 'Roboto', value: 'Roboto' },
  { label: 'Open Sans', value: 'Open Sans' },
  { label: 'Montserrat', value: 'Montserrat' },
  { label: 'Lato', value: 'Lato' },
  { label: 'Playfair Display', value: 'Playfair Display' },
  { label: 'Merriweather', value: 'Merriweather' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Times New Roman', value: 'Times New Roman' },
  { label: 'Arial', value: 'Arial' },
  { label: 'Helvetica', value: 'Helvetica' },
];

// Font sizes
const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96];

// Font weights
const FONT_WEIGHTS = [
  { label: 'Lt', value: '300', title: 'Light' },
  { label: 'Rg', value: '400', title: 'Regular' },
  { label: 'Md', value: '500', title: 'Medium' },
  { label: 'Sb', value: '600', title: 'Semibold' },
  { label: 'Bd', value: '700', title: 'Bold' },
];

export const PortaledTiptapEditor: React.FC<PortaledTiptapEditorProps> = ({
  element,
  coordinator,
  iframeRef,
  onFinish,
  onCancel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const hasFinishedRef = useRef(false);
  const [, forceUpdate] = useState(0);

  // Extract typography from element's computed style
  const typography = useMemo(() => {
    const style = element.computedStyle;
    return {
      fontSize: style.fontSize || '16px',
      fontFamily: style.fontFamily || 'system-ui',
      fontWeight: style.fontWeight || '400',
      color: style.color || '#000000',
      textAlign: (style.textAlign as 'left' | 'center' | 'right' | 'justify') || 'left',
      lineHeight: style.lineHeight || '1.5',
      letterSpacing: style.letterSpacing || 'normal',
    };
  }, [element.computedStyle]);

  // Local state for typography controls
  const [currentFontFamily, setCurrentFontFamily] = useState(typography.fontFamily.split(',')[0].trim().replace(/['"]/g, ''));
  const [currentFontSize, setCurrentFontSize] = useState(parseInt(typography.fontSize) || 16);
  const [currentFontWeight, setCurrentFontWeight] = useState(typography.fontWeight);
  const [currentColor, setCurrentColor] = useState(typography.color);
  const [currentAlign, setCurrentAlign] = useState(typography.textAlign);

  // Configure Tiptap extensions
  const extensions = useMemo(() => [
    Document,
    Paragraph.configure({
      HTMLAttributes: {
        style: 'margin: 0; padding: 0;',
      },
    }),
    Text,
    Bold,
    Italic,
    Underline,
    Strike,
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({
      types: ['paragraph'],
      alignments: ['left', 'center', 'right', 'justify'],
      defaultAlignment: typography.textAlign,
    }),
  ], [typography.textAlign]);

  // Initialize editor with element content
  const editor = useEditor({
    extensions,
    content: element.htmlContent || element.textContent || '',
    autofocus: 'end',
    editorProps: {
      attributes: {
        class: 'focus:outline-none w-full h-full',
        style: `
          font-size: ${typography.fontSize};
          font-family: ${typography.fontFamily};
          font-weight: ${typography.fontWeight};
          color: ${typography.color};
          text-align: ${typography.textAlign};
          line-height: ${typography.lineHeight};
          letter-spacing: ${typography.letterSpacing};
        `,
      },
    },
    onTransaction: () => {
      forceUpdate(n => n + 1);
    },
  });

  // Update editor style when typography changes
  useEffect(() => {
    if (!editor) return;

    const styleStr = `
      font-size: ${currentFontSize}px;
      font-family: ${currentFontFamily};
      font-weight: ${currentFontWeight};
      color: ${currentColor};
      text-align: ${currentAlign};
      line-height: ${typography.lineHeight};
      letter-spacing: ${typography.letterSpacing};
    `;

    editor.setOptions({
      editorProps: {
        attributes: {
          class: 'focus:outline-none w-full h-full',
          style: styleStr,
        },
      },
    });
  }, [editor, currentFontFamily, currentFontSize, currentFontWeight, currentColor, currentAlign, typography.lineHeight, typography.letterSpacing]);

  // Handle finish editing
  const handleFinish = useCallback(() => {
    if (hasFinishedRef.current || !editor) return;
    hasFinishedRef.current = true;

    const html = editor.getHTML();
    const text = editor.getText();
    onFinish(html, text);
  }, [editor, onFinish]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    onCancel();
  }, [onCancel]);

  // Hide the original element in iframe while editing
  useEffect(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'hide-element',
        selector: element.selector,
      }, '*');
    }

    return () => {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({
          target: 'ns-custom-component-edit',
          type: 'show-element',
          selector: element.selector,
        }, '*');
      }
    };
  }, [element.selector, iframeRef]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleCancel();
      }
      // Cmd/Ctrl + Enter to finish
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        handleFinish();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleFinish, handleCancel]);

  // Handle click outside to finish
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const isInsideEditor = containerRef.current?.contains(target);
      const isInsideToolbar = toolbarRef.current?.contains(target);

      if (!isInsideEditor && !isInsideToolbar) {
        handleFinish();
      }
    };

    // Delay adding listener to avoid immediate trigger
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [handleFinish]);

  // Position the editor over the element
  const editorStyle: React.CSSProperties = useMemo(() => ({
    position: 'fixed',
    left: element.bounds.x - 4,
    top: element.bounds.y - 4,
    width: element.bounds.width + 8,
    minHeight: element.bounds.height + 8,
    zIndex: 10000,
    backgroundColor: 'white',
    border: `2px solid ${SELECTION_COLOR}`,
    borderRadius: 4,
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
    padding: 4,
    overflow: 'auto',
    maxHeight: '50vh',
  }), [element.bounds]);

  // Position toolbar to the right of the element
  const getToolbarPosition = () => {
    const toolbarWidth = 280;
    const toolbarHeight = 380;
    const padding = 12;

    const iframe = document.querySelector(`iframe[title="Custom Component"]`);
    const iframeRect = iframe?.getBoundingClientRect();

    const elementRight = (iframeRect?.left || 0) + element.bounds.x + element.bounds.width;
    const elementTop = (iframeRect?.top || 0) + element.bounds.y;

    const maxRight = iframeRect?.right || window.innerWidth;

    let left = elementRight + padding + 8; // +8 for editor border/padding
    let top = elementTop;

    if (left + toolbarWidth > maxRight) {
      // Position to the left of the element if no room on right
      left = (iframeRect?.left || 0) + element.bounds.x - toolbarWidth - padding;
    }

    const minLeft = iframeRect?.left || padding;
    if (left < minLeft) {
      left = minLeft;
    }

    top = Math.max(padding, Math.min(top, window.innerHeight - toolbarHeight - padding));

    return { top, left };
  };

  const toolbarPosition = getToolbarPosition();

  // Handle font family change (applied via CSS, not Tiptap extension)
  const handleFontFamilyChange = (family: string) => {
    setCurrentFontFamily(family);
    // Font family is applied through editor props/CSS, no Tiptap command needed
  };

  // Handle font size change
  const handleFontSizeChange = (size: number) => {
    setCurrentFontSize(size);
  };

  // Handle font weight change
  const handleFontWeightChange = (weight: string) => {
    setCurrentFontWeight(weight);
  };

  // Handle color change
  const handleColorChange = (color: string) => {
    setCurrentColor(color);
    editor?.chain().focus().setColor(color).run();
  };

  // Handle alignment change
  const handleAlignmentChange = (align: 'left' | 'center' | 'right' | 'justify') => {
    setCurrentAlign(align);
    editor?.chain().focus().setTextAlign(align).run();
  };

  if (!editor) return null;

  return createPortal(
    <>
      {/* Editor content overlay */}
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.1 }}
        style={editorStyle}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <EditorContent editor={editor} />
      </motion.div>

      {/* Properties Toolbar Panel */}
      <motion.div
        ref={toolbarRef}
        initial={{ opacity: 0, x: -10, scale: 0.95 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: -10, scale: 0.95 }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: toolbarPosition.top,
          left: toolbarPosition.left,
          zIndex: 10001,
        }}
        className="w-[280px] bg-white rounded-xl border shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <Type size={14} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Edit Text</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleFinish}
              className="p-1.5 rounded-md text-white transition-colors"
              style={{ backgroundColor: BRAND_ORANGE }}
              title="Save (⌘+Enter)"
            >
              <Check size={14} />
            </button>
            <button
              onClick={handleCancel}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="Cancel (Esc)"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-3 space-y-3">
          {/* Font Family */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Font</label>
            <select
              value={currentFontFamily}
              onChange={(e) => handleFontFamilyChange(e.target.value)}
              className="w-full h-8 px-2 text-sm border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            >
              {FONT_FAMILIES.map((font) => (
                <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                  {font.label}
                </option>
              ))}
            </select>
          </div>

          {/* Size and Weight Row */}
          <div className="grid grid-cols-2 gap-2">
            {/* Font Size */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Size</label>
              <select
                value={currentFontSize}
                onChange={(e) => handleFontSizeChange(parseInt(e.target.value))}
                className="w-full h-8 px-2 text-sm border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              >
                {FONT_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}px
                  </option>
                ))}
              </select>
            </div>

            {/* Font Weight Buttons */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Weight</label>
              <div className="flex h-8 rounded-md border overflow-hidden">
                {FONT_WEIGHTS.map((weight) => (
                  <button
                    key={weight.value}
                    onClick={() => handleFontWeightChange(weight.value)}
                    title={weight.title}
                    className={cn(
                      "flex-1 text-[11px] font-medium transition-colors border-r last:border-r-0",
                      currentFontWeight === weight.value
                        ? "bg-gray-900 text-white"
                        : "bg-white text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    {weight.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Alignment */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Alignment</label>
            <div className="flex h-8 rounded-md border overflow-hidden">
              {[
                { align: 'left' as const, Icon: AlignLeft },
                { align: 'center' as const, Icon: AlignCenter },
                { align: 'right' as const, Icon: AlignRight },
                { align: 'justify' as const, Icon: AlignJustify },
              ].map(({ align, Icon }) => (
                <button
                  key={align}
                  onClick={() => handleAlignmentChange(align)}
                  className={cn(
                    "flex-1 flex items-center justify-center transition-colors border-r last:border-r-0",
                    currentAlign === align
                      ? "bg-gray-900 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Color</label>
            <div className="flex items-center gap-2">
              <div className="relative">
                <input
                  type="color"
                  value={currentColor}
                  onChange={(e) => handleColorChange(e.target.value)}
                  className="w-8 h-8 rounded-md border cursor-pointer"
                  style={{ padding: 0 }}
                />
              </div>
              <input
                type="text"
                value={currentColor}
                onChange={(e) => handleColorChange(e.target.value)}
                className="flex-1 h-8 px-2 text-sm border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono"
                placeholder="#000000"
              />
            </div>
          </div>

          {/* Divider */}
          <div className="border-t" />

          {/* Formatting Buttons */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Format</label>
            <div className="flex gap-1">
              <button
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={cn(
                  "flex-1 h-8 flex items-center justify-center rounded-md border transition-colors",
                  editor.isActive('bold')
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                )}
                title="Bold (⌘+B)"
              >
                <BoldIcon size={14} />
              </button>
              <button
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={cn(
                  "flex-1 h-8 flex items-center justify-center rounded-md border transition-colors",
                  editor.isActive('italic')
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                )}
                title="Italic (⌘+I)"
              >
                <ItalicIcon size={14} />
              </button>
              <button
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                className={cn(
                  "flex-1 h-8 flex items-center justify-center rounded-md border transition-colors",
                  editor.isActive('underline')
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                )}
                title="Underline (⌘+U)"
              >
                <UnderlineIcon size={14} />
              </button>
              <button
                onClick={() => editor.chain().focus().toggleStrike().run()}
                className={cn(
                  "flex-1 h-8 flex items-center justify-center rounded-md border transition-colors",
                  editor.isActive('strike')
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                )}
                title="Strikethrough"
              >
                <Strikethrough size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Footer hint */}
        <div className="px-3 py-2 bg-gray-50 border-t">
          <p className="text-[10px] text-gray-400 text-center">
            Press <kbd className="px-1 py-0.5 bg-gray-200 rounded text-[9px]">Esc</kbd> to cancel · <kbd className="px-1 py-0.5 bg-gray-200 rounded text-[9px]">⌘+Enter</kbd> to save
          </p>
        </div>
      </motion.div>
    </>,
    document.body
  );
};

export default PortaledTiptapEditor;
