import React, { useMemo, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import BoldExt from '@tiptap/extension-bold';
import ItalicExt from '@tiptap/extension-italic';
import StrikeExt from '@tiptap/extension-strike';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Heading from '@tiptap/extension-heading';
import Link from '@tiptap/extension-link';
import Typography from '@tiptap/extension-typography';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';

import { ComponentInstance } from '../../types/components';
import { registerRenderer, RendererProps } from '../index';
import type { RendererFunction } from '../index';
import { transformMyFormatToTiptap, transformTiptapToMyFormat, CustomDoc } from '../../utils/tiptapUtils';
import { useEditorStore } from '../../stores/editorStore';
import { useEditorSettingsStore } from '../../stores/editorSettingsStore';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { usePresentationStore } from '@/stores/presentationStore';
import { FontSize } from '@/extensions/FontSize';
import { getFontFamilyWithFallback } from '../../utils/fontUtils';
import '../../styles/TiptapStyles.css';

interface TiptapTextBlockRendererProps extends RendererProps {
  component: ComponentInstance;
}

export const TiptapTextBlockRenderer: React.FC<TiptapTextBlockRendererProps> = ({
  component,
  containerRef,
  isSelected = false,
  isThumbnail = false,
  styles = {},
  slideId,
}) => {
  const props = component.props || {} as any;
  const {
    texts,
    fontFamily = 'Poppins',
    fontSize = 24,
    fontWeight = 'normal',
    lineHeight = 1.5,
    letterSpacing = 0,
    textColor = '#000000ff',
    alignment = 'left',
    verticalAlignment = 'top',
    padding = 0,
  } = props as any;

  // Use fontSize from props
  const effectiveFontSize = props.fontSize || fontSize;

  const { updateComponent } = useActiveSlide();
  const isTextEditingGlobal = useEditorSettingsStore(state => state.isTextEditing);
  const setTextEditingGlobal = useEditorSettingsStore(state => state.setTextEditing);
  const setActiveTiptapEditor = useEditorStore((state) => state.setActiveTiptapEditor);
  const textContainerRef = useRef<HTMLDivElement>(null);
  const isCurrentlyTextEditing = isTextEditingGlobal && isSelected;

  // Slide size scale awareness
  const NATIVE_WIDTH = 1920;
  const isPresenting = usePresentationStore(state => state.isPresenting);
  const getInitialSlideWidth = () => {
    if (isThumbnail) return NATIVE_WIDTH;
    const slideContainer = document.getElementById('slide-display-container');
    if (slideContainer) {
      const rect = slideContainer.getBoundingClientRect();
      return rect.width || NATIVE_WIDTH;
    }
    return NATIVE_WIDTH;
  };
  const [currentSlideWidth, setCurrentSlideWidth] = React.useState(() => getInitialSlideWidth());
  const [containerScale, setContainerScale] = React.useState(() => getInitialSlideWidth() / NATIVE_WIDTH);
  const prevSlideWidthRef = useRef(currentSlideWidth);
  const updateScaleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasMeasuredRef = useRef(false); // Track if we've completed initial measurement

  useEffect(() => {
    if (isThumbnail) return;

    const updateScale = () => {
      // Skip updates during text editing to prevent font size changes on click
      if (isCurrentlyTextEditing) return;

      if (updateScaleTimeoutRef.current) clearTimeout(updateScaleTimeoutRef.current);
      updateScaleTimeoutRef.current = setTimeout(() => {
        const slideContainer = document.getElementById('slide-display-container');
        if (slideContainer) {
          const slideRect = slideContainer.getBoundingClientRect();
          const slideDisplayWidth = slideRect.width;

          // On first measurement, set without threshold check
          if (!hasMeasuredRef.current) {
            hasMeasuredRef.current = true;
            prevSlideWidthRef.current = slideDisplayWidth;
            setCurrentSlideWidth(slideDisplayWidth);
            setContainerScale(slideDisplayWidth / NATIVE_WIDTH);
            return;
          }

          // Only update if difference is significant (>5px) to prevent cascading updates
          if (Math.abs(slideDisplayWidth - prevSlideWidthRef.current) > 5) {
            prevSlideWidthRef.current = slideDisplayWidth;
            setCurrentSlideWidth(slideDisplayWidth);
            setContainerScale(slideDisplayWidth / NATIVE_WIDTH);
          }
        }
      }, 50);
    };

    updateScale();
    window.addEventListener('resize', updateScale);

    let resizeObserver: ResizeObserver | null = null;
    const slideContainer = document.getElementById('slide-display-container');
    if (slideContainer && 'ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(updateScale);
      resizeObserver.observe(slideContainer);
    }

    return () => {
      if (updateScaleTimeoutRef.current) clearTimeout(updateScaleTimeoutRef.current);
      window.removeEventListener('resize', updateScale);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [isThumbnail]); // CRITICAL: Don't include isCurrentlyTextEditing in dependencies!

  // Font scale factor
  const fontScaleFactor = useMemo(() => {
    if (isPresenting) return 1;
    // Thumbnails are already scaled by outer slide transform; avoid double-scaling fonts
    if (isThumbnail) return 1;
    return currentSlideWidth / NATIVE_WIDTH;
  }, [isThumbnail, currentSlideWidth, isPresenting]);

  // CRITICAL FIX: Store the stable font size to prevent resize on click/selection
  // We lock the font size based on props.fontSize and fontScaleFactor, only recalculate when they change
  const stableFontSizeRef = useRef<string | null>(null);
  const lastPropsSizeRef = useRef<number | null>(null);
  const lastScaleFactorRef = useRef<number | null>(null);

  const getFontSize = useMemo(() => {
    // Always use props.fontSize if it exists (this is the source of truth)
    const nativeSize = Math.round(props.fontSize || effectiveFontSize || 16); // Round to whole number

    // For thumbnails, apply thumbnail scaling
    if (isThumbnail) {
      return `${Math.round(nativeSize * fontScaleFactor)}px`;
    }

    // CRITICAL FIX: Use stable reference to prevent recalculation on click/selection
    // Only recalculate if props.fontSize OR fontScaleFactor actually changed
    // This prevents resize-on-click while still allowing proper scaling
    if (stableFontSizeRef.current &&
        lastPropsSizeRef.current === nativeSize &&
        lastScaleFactorRef.current === fontScaleFactor) {
      return stableFontSizeRef.current;
    }

    // Apply scaling and round to whole number (for all components)
    const calculatedSize = Math.round(nativeSize * fontScaleFactor);

    const result = `${calculatedSize}px`;
    stableFontSizeRef.current = result;
    lastPropsSizeRef.current = nativeSize;
    lastScaleFactorRef.current = fontScaleFactor;

    return result;
  }, [props.fontSize, fontScaleFactor, isThumbnail]); // Only essential dependencies to prevent unnecessary recalculations

  // Removed font optimization event listener

  const getLetterSpacing = useMemo(() => {
    return letterSpacing ? `${letterSpacing * fontScaleFactor}px` : '0px';
  }, [letterSpacing, fontScaleFactor]);

  const initialContent = useMemo(() => {
    if (!texts) {
      return {
        type: 'doc',
        content: [{ type: 'paragraph', content: [] }]
      } as any;
    }

    return transformMyFormatToTiptap(texts);
  }, [texts]);

  const getExtensions = useCallback(() => {
    const baseExtensions = [
      Document.extend({ content: 'block+' }),
      Paragraph.configure({ HTMLAttributes: { style: 'margin: 0; padding: 0;' } }),
      Text,
      TextStyle,
      Color,
      FontSize,
      BoldExt,
      ItalicExt,
      Underline,
      StrikeExt,
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      Typography,
      TextAlign.configure({
        types: ['paragraph', 'heading'],
        alignments: ['left', 'center', 'right', 'justify'],
        defaultAlignment: alignment,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-blue-600 underline cursor-pointer' },
      })
    ];

    if (!isThumbnail) {
      baseExtensions.push(
        Heading.configure({
          levels: [1, 2, 3],
          HTMLAttributes: { style: 'margin: 0; padding: 0;' }
        }),
      );
    }

    return baseExtensions;
  }, [alignment, isThumbnail]);

  const isUpdatingRef = useRef(false);

  const getEditorConfig = useMemo(() => ({
    extensions: getExtensions(),
    content: initialContent,
    editable: isCurrentlyTextEditing,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'focus:outline-none w-full h-full tiptap-editor-content',
        style: `
          display: flex;
          flex-direction: column;
          justify-content: ${
            verticalAlignment === 'middle' ? 'center' :
            verticalAlignment === 'bottom' ? 'flex-end' : 'flex-start'
          };
          text-align: ${alignment};
          min-height: 100%;
        `,
        'data-component-id': component.id,
      },
      handleKeyDown: () => false,
    },
    onCreate: ({ editor }) => {
      editor.commands.setTextAlign(alignment);
    },
    onUpdate: ({ editor }) => {
      if (!editor || editor.isDestroyed || isUpdatingRef.current) return;
      isUpdatingRef.current = true;
      try {
        const json = editor.getJSON();
        const newDocs: CustomDoc = transformTiptapToMyFormat(json);
        const currentTexts = props.texts;
        if (JSON.stringify(newDocs) !== JSON.stringify(currentTexts)) {
          updateComponent(component.id, { props: { texts: newDocs } }, true);
        }
      } finally {
        setTimeout(() => { isUpdatingRef.current = false; }, 100);
      }
    },
    onFocus: () => {
      if (slideId) {
        import('@/stores/historyStore').then(({ useHistoryStore }) => {
          useHistoryStore.getState().startTransientOperation(component.id, slideId);
        });
      }
    },
    onBlur: ({ editor }) => {
      if (!editor || editor.isDestroyed || isUpdatingRef.current) return;
      isUpdatingRef.current = true;
      try {
        const json = editor.getJSON();
        const docs: CustomDoc = transformTiptapToMyFormat(json);
        updateComponent(component.id, { props: { texts: docs } }, true);
        if (slideId) {
          import('@/stores/historyStore').then(({ useHistoryStore }) => {
            useHistoryStore.getState().endTransientOperation(component.id, slideId);
          });
        }
        if (isCurrentlyTextEditing) {
          setTimeout(() => setTextEditingGlobal(false), 0);
        }
      } finally {
        setTimeout(() => { isUpdatingRef.current = false; }, 100);
      }
    },
  }), [
    getExtensions,
    initialContent,
    isCurrentlyTextEditing,
    alignment,
    verticalAlignment,
    component.id,
    props,
    updateComponent,
    setTextEditingGlobal,
    isThumbnail,
    slideId,
  ]);

  const editor = useEditor(getEditorConfig);

  // Sync when texts prop changes
  useEffect(() => {
    if (editor && !isCurrentlyTextEditing && !isUpdatingRef.current) {
      const currentContent = editor.getJSON();
      const currentTexts = transformTiptapToMyFormat(currentContent);

      if (JSON.stringify(texts) !== JSON.stringify(currentTexts)) {
        const newContent = transformMyFormatToTiptap(texts || {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }]
        });
        editor.commands.setContent(newContent, false);
      }
    }
  }, [editor, texts, isCurrentlyTextEditing]);

  // Keep editable state in sync
  useEffect(() => {
    if (editor) {
      const currentlyEditable = editor.isEditable;
      if (currentlyEditable !== isCurrentlyTextEditing) {
        editor.setEditable(isCurrentlyTextEditing);
      }
      if (isCurrentlyTextEditing && !editor.isFocused) {
        setTimeout(() => editor.commands.focus('end'), 50);
      }
      if (editor.view && editor.view.dom) {
        editor.view.dom.setAttribute('data-component-id', component.id);
      }
    }
  }, [editor, isCurrentlyTextEditing, component.id]);

  // Update alignment on prop changes
  useEffect(() => {
    if (editor) {
      const editorElement = editor.view.dom as HTMLElement;
      if (editorElement) {
        editorElement.style.textAlign = alignment;
      }
      editor.commands.setTextAlign(alignment);
    }
  }, [editor, alignment]);

  // Manage active editor ref in store
  useEffect(() => {
    if (isSelected && editor) {
      setActiveTiptapEditor(editor);
    }
    return () => {
      const currentActiveEditor = useEditorStore.getState().activeTiptapEditor;
      if (currentActiveEditor === editor) {
        setActiveTiptapEditor(null);
      }
    };
  }, [editor, isSelected, setActiveTiptapEditor]);

  // CRITICAL FIX: Force initial sizing calculation on mount
  // This ensures proper sizing immediately without waiting for selection
  useEffect(() => {
    if (editor && containerRef.current) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        const wrapper = containerRef.current as HTMLElement;
        if (wrapper) {
          // Set initial CSS variables
          wrapper.style.setProperty('--tiptap-font-size', getFontSize);
          wrapper.style.setProperty('--tiptap-font-family', getFontFamilyWithFallback(fontFamily || 'Arial'));
          wrapper.style.setProperty('--tiptap-font-weight', String(fontWeight));
          wrapper.style.setProperty('--tiptap-line-height', String(lineHeight || 1.5));
          wrapper.style.setProperty('--tiptap-letter-spacing', getLetterSpacing);
          wrapper.style.setProperty('--tiptap-text-color', textColor);
        }
        
        // Apply to editor DOM
        if (editor.view && editor.view.dom) {
          const editorElement = editor.view.dom as HTMLElement;
          editorElement.style.fontSize = getFontSize;
          // Force layout recalculation
          void editorElement.offsetHeight;
          // Update editor state
          try {
            editor.view.dispatch(editor.state.tr);
          } catch (e) {
            // Ignore errors
          }
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]); // Only run when editor is first created

  // Force editor to update when font size or other CSS variables change
  // Store previous values to avoid unnecessary updates
  const prevStyleValuesRef = useRef<{
    fontSize: string;
    letterSpacing: string;
    fontFamily: string;
    fontWeight: string | number;
    lineHeight: number;
    textColor: string;
  } | null>(null);

  useEffect(() => {
    // Check if values actually changed
    const currentValues = {
      fontSize: getFontSize,
      letterSpacing: getLetterSpacing,
      fontFamily,
      fontWeight,
      lineHeight,
      textColor,
    };

    const hasChanged = !prevStyleValuesRef.current ||
      prevStyleValuesRef.current.fontSize !== currentValues.fontSize ||
      prevStyleValuesRef.current.letterSpacing !== currentValues.letterSpacing ||
      prevStyleValuesRef.current.fontFamily !== currentValues.fontFamily ||
      prevStyleValuesRef.current.fontWeight !== currentValues.fontWeight ||
      prevStyleValuesRef.current.lineHeight !== currentValues.lineHeight ||
      prevStyleValuesRef.current.textColor !== currentValues.textColor;

    if (!hasChanged) return;

    prevStyleValuesRef.current = currentValues;

    // Update wrapper container CSS variables
    if (containerRef.current) {
      const wrapper = containerRef.current as HTMLElement;
      wrapper.style.setProperty('--tiptap-font-size', getFontSize);
      wrapper.style.setProperty('--tiptap-font-family', getFontFamilyWithFallback(fontFamily || 'Arial'));
      wrapper.style.setProperty('--tiptap-font-weight', String(fontWeight));
      wrapper.style.setProperty('--tiptap-line-height', String(lineHeight || 1.5));
      wrapper.style.setProperty('--tiptap-letter-spacing', getLetterSpacing);
      wrapper.style.setProperty('--tiptap-text-color', textColor);
    }

    // Update editor DOM and internal state
    if (editor && editor.view && editor.view.dom) {
      const editorElement = editor.view.dom as HTMLElement;
      if (editorElement) {
        // Apply font size directly to editor DOM
        editorElement.style.fontSize = getFontSize;

        // Force layout recalculation (triggers browser reflow)
        void editorElement.offsetHeight;

        // Force TipTap to update its internal state by dispatching an empty transaction
        // This ensures the editor recognizes the style change and re-renders properly
        try {
          editor.view.dispatch(editor.state.tr);
        } catch (e) {
          // Ignore errors from dispatching transaction
        }
      }
    }
  }, [editor, getFontSize, getLetterSpacing, fontFamily, fontWeight, lineHeight, textColor]);

  const wrapperStyle: React.CSSProperties = {
    ...styles,
    position: styles?.position || 'relative',
    overflow: 'hidden',
    '--tiptap-font-size': getFontSize,
    '--tiptap-font-family': getFontFamilyWithFallback(fontFamily || 'Arial'),
    '--tiptap-font-weight': fontWeight,
    '--tiptap-line-height': lineHeight || 1.5,
    '--tiptap-letter-spacing': getLetterSpacing,
    '--tiptap-text-color': textColor,
    '--tiptap-padding': typeof padding === 'number' ? `${padding}px` : String(padding),
  } as React.CSSProperties as any;

  return (
    <div
      ref={containerRef}
      style={wrapperStyle}
      data-component-id={component.id}
      data-component-type="TiptapTextBlock"
    >
      <div
        ref={textContainerRef}
        className="tiptap-editor-wrapper"
        style={{ width: '100%', height: '100%' }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (!isCurrentlyTextEditing && isSelected) {
            setTextEditingGlobal(true);
          }
        }}
      >
        <EditorContent editor={editor} className="tiptap-editor-content h-full w-full" />
      </div>
    </div>
  );
};

// Register the renderer
const TiptapTextBlockRendererWrapper: RendererFunction = (props) => {
  return <TiptapTextBlockRenderer {...props} />;
};

registerRenderer('TiptapTextBlock', TiptapTextBlockRendererWrapper);
