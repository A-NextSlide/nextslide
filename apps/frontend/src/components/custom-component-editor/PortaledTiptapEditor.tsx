/**
 * PortaledTiptapEditor - Rich text editing for elements inside custom components
 *
 * Creates a Tiptap editor that is portaled to document.body and positioned
 * exactly over the element being edited. The original element in the iframe
 * is hidden during editing.
 */

import React, { useEffect, useRef, useMemo, useCallback } from 'react';
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
const SELECTION_COLOR = '#FF007B';

export const PortaledTiptapEditor: React.FC<PortaledTiptapEditorProps> = ({
  element,
  coordinator,
  iframeRef,
  onFinish,
  onCancel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasFinishedRef = useRef(false);

  // Extract typography from element's computed style
  const typography = useMemo(() => {
    const style = element.computedStyle;
    return {
      fontSize: style.fontSize || '16px',
      fontFamily: style.fontFamily || 'inherit',
      fontWeight: style.fontWeight || 'normal',
      color: style.color || '#000000',
      textAlign: (style.textAlign as 'left' | 'center' | 'right' | 'justify') || 'left',
      lineHeight: style.lineHeight || '1.5',
      letterSpacing: style.letterSpacing || 'normal',
    };
  }, [element.computedStyle]);

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
  });

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
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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
    left: element.bounds.x - 4, // Padding offset
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

  if (!editor) return null;

  return createPortal(
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.1 }}
      style={editorStyle}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Editor content */}
      <EditorContent editor={editor} />

      {/* Mini toolbar - basic formatting */}
      <div
        className="absolute -top-8 left-0 flex items-center gap-1 px-1 py-0.5 bg-white rounded shadow border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`px-1.5 py-0.5 text-xs rounded hover:bg-gray-100 ${editor.isActive('bold') ? 'bg-gray-200 font-bold' : ''}`}
          title="Bold (Cmd+B)"
        >
          B
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`px-1.5 py-0.5 text-xs rounded hover:bg-gray-100 italic ${editor.isActive('italic') ? 'bg-gray-200' : ''}`}
          title="Italic (Cmd+I)"
        >
          I
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`px-1.5 py-0.5 text-xs rounded hover:bg-gray-100 underline ${editor.isActive('underline') ? 'bg-gray-200' : ''}`}
          title="Underline (Cmd+U)"
        >
          U
        </button>
        <div className="w-px h-4 bg-gray-200 mx-0.5" />
        <button
          onClick={handleFinish}
          className="px-2 py-0.5 text-xs rounded bg-[#FF007B] text-white hover:bg-[#E0006B]"
          title="Save (Cmd+Enter)"
        >
          Done
        </button>
      </div>

      {/* Hint text */}
      <div className="absolute -bottom-6 left-0 text-[10px] text-gray-400">
        Press Escape to cancel, Cmd+Enter to save
      </div>
    </motion.div>,
    document.body
  );
};

export default PortaledTiptapEditor;
