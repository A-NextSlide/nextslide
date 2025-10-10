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
      console.log(`[TiptapTextBlock] getInitialSlideWidth:`, {
        componentId: component.id,
        containerWidth: rect.width,
        slideContainer
      });
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
    if (isThumbnail || isCurrentlyTextEditing) return;
    const updateScale = () => {
      if (updateScaleTimeoutRef.current) clearTimeout(updateScaleTimeoutRef.current);
      updateScaleTimeoutRef.current = setTimeout(() => {
        const slideContainer = document.getElementById('slide-display-container');
        if (slideContainer) {
          const slideRect = slideContainer.getBoundingClientRect();
          const slideDisplayWidth = slideRect.width;

          console.log(`[TiptapTextBlock] updateScale:`, {
            componentId: component.id,
            isSelected,
            slideDisplayWidth,
            prevWidth: prevSlideWidthRef.current,
            hasMeasured: hasMeasuredRef.current,
            willUpdate: Math.abs(slideDisplayWidth - prevSlideWidthRef.current) > 5
          });

          // On first measurement, set without threshold check
          if (!hasMeasuredRef.current) {
            hasMeasuredRef.current = true;
            prevSlideWidthRef.current = slideDisplayWidth;
            setCurrentSlideWidth(slideDisplayWidth);
            setContainerScale(slideDisplayWidth / NATIVE_WIDTH);
            return;
          }

          // Only update if difference is significant (>5px) to prevent cascading updates
          // ALSO: Don't update on selection change (when isSelected changes from false to true)
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
  }, [isThumbnail, isCurrentlyTextEditing]);

  // Font scale factor
  const fontScaleFactor = useMemo(() => {
    if (isPresenting) return 1;
    // Thumbnails are already scaled by outer slide transform; avoid double-scaling fonts
    if (isThumbnail) return 1;
    return currentSlideWidth / NATIVE_WIDTH;
  }, [isThumbnail, currentSlideWidth, isPresenting]);

  // Store calculated font size in a ref to prevent unnecessary recalculations
  const calculatedFontSizeRef = useRef<string | null>(null);
  // Store the font size when NOT editing to use during edit mode
  const nonEditingFontSizeRef = useRef<string | null>(null);
  
  const getFontSize = useMemo(() => {
    // Always use props.fontSize if it exists (this is the source of truth)
    const nativeSize = props.fontSize || effectiveFontSize || 16;

    // For thumbnails, apply thumbnail scaling
    if (isThumbnail) {
      return `${nativeSize * fontScaleFactor}px`;
    }

    // For regular slides, apply scaling without rounding to prevent pixel jumps
    const calculatedSize = nativeSize * fontScaleFactor;

    // CRITICAL: When entering edit mode, use the last known non-editing font size
    // This prevents font size changes when transitioning to edit mode
    if (isCurrentlyTextEditing && nonEditingFontSizeRef.current) {
      console.log(`[TiptapTextBlock] Using non-editing font size during edit mode:`, {
        componentId: component.id,
        editModeSize: nonEditingFontSizeRef.current
      });
      return nonEditingFontSizeRef.current;
    }

    // If we already have a calculated size and the native size hasn't changed, use it
    // This prevents recalculation when only scale factor changes slightly
    if (calculatedFontSizeRef.current && Math.abs(parseFloat(calculatedFontSizeRef.current) - calculatedSize) < 1) {
      console.log(`[TiptapTextBlock] Using cached font size:`, {
        componentId: component.id,
        cached: calculatedFontSizeRef.current,
        newCalculation: calculatedSize
      });
      return calculatedFontSizeRef.current;
    }

    const result = `${calculatedSize}px`;
    calculatedFontSizeRef.current = result;

    // Store as non-editing size if we're not currently editing
    if (!isCurrentlyTextEditing) {
      nonEditingFontSizeRef.current = result;
    }

    // Debug logging
    console.log(`[TiptapTextBlock] Font size calculation:`, {
      componentId: component.id,
      isSelected,
      nativeSize,
      fontScaleFactor,
      calculatedSize,
      currentSlideWidth,
      NATIVE_WIDTH,
      props_fontSize: props.fontSize,
      effectiveFontSize,
      isEditing: isCurrentlyTextEditing
    });

    return result;
  }, [props.fontSize, effectiveFontSize, fontScaleFactor, isThumbnail, component.id, currentSlideWidth, isCurrentlyTextEditing]);

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

  // Log CSS variable changes and DOM structure
  useEffect(() => {
    console.log(`[TiptapTextBlock] CSS variables update:`, {
      componentId: component.id,
      isSelected,
      getFontSize,
      styles: styles,
      containerRef: containerRef.current,
      parentElement: containerRef.current?.parentElement,
      parentClassName: containerRef.current?.parentElement?.className,
    });
  }, [getFontSize, isSelected, component.id, styles]);

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
