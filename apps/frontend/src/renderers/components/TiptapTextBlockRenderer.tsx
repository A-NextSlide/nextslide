import React, { useMemo, useEffect, useRef } from 'react';
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
import { FontSize } from '@/extensions/FontSize';
import { getFontFamilyWithFallback } from '../../utils/fontUtils';
import { getSlideContainerWidth, isInEditMode } from '../../utils/slideContainerUtils';
import { usePresentationStore } from '@/stores/presentationStore';
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

  const { updateComponent } = useActiveSlide();
  const isTextEditingGlobal = useEditorSettingsStore(state => state.isTextEditing);
  const setTextEditingGlobal = useEditorSettingsStore(state => state.setTextEditing);
  const setActiveTiptapEditor = useEditorStore((state) => state.setActiveTiptapEditor);
  
  // =================================================================
  // TEXT EDITING STATE MANAGEMENT
  // =================================================================
  // Track if THIS specific component is being edited. This decouples text editing
  // from the isSelected prop, preventing premature exit when selection changes.
  // Set to true on double-click, cleared on blur/escape.
  const isThisComponentEditingRef = useRef(false);
  const isCurrentlyTextEditing = isTextEditingGlobal && isThisComponentEditingRef.current;

  // =================================================================
  // IDENTITY TRACKING - Prevent cross-component/slide writes
  // =================================================================
  // These refs are locked at initialization and NEVER updated
  const lockedComponentId = useRef(component.id);
  const lockedSlideId = useRef(slideId);
  const isUpdatingRef = useRef(false);
  const isUnmountingRef = useRef(false);
  const lastSavedContentRef = useRef<string | null>(null);
  const isBlurringRef = useRef(false);

  // Use a key that changes when component/slide changes to force complete remount
  const instanceKey = `${component.id}_${slideId}`;

  // =================================================================
  // FONT SCALING - Scale fonts based on actual display size
  // =================================================================
  // IMPORTANT: Backend generates font sizes for 1920x1080 slides
  // We need to scale from that to the actual rendered width (950px)
  const NATIVE_WIDTH = 1920; // Width at which fonts are designed by backend
  const DEFAULT_SLIDE_DISPLAY_WIDTH = 950; // Default rendered width

  // Check if we're in presentation mode - if so, don't scale fonts
  // In presentation mode, the entire slide is CSS-scaled, so text should not be separately scaled
  const isPresenting = usePresentationStore(state => state.isPresenting);

  const [slideWidth, setSlideWidth] = React.useState(() => 
    isThumbnail ? NATIVE_WIDTH : getSlideContainerWidth(DEFAULT_SLIDE_DISPLAY_WIDTH)
  );

  useEffect(() => {
    if (isThumbnail || isPresenting) return;

    let resizeObserver: ResizeObserver | null = null;
    let mounted = true;

    const updateWidth = () => {
      if (!mounted) return;
      const width = getSlideContainerWidth(DEFAULT_SLIDE_DISPLAY_WIDTH);
      setSlideWidth(width);
    };

    // Initial measurement after a short delay to ensure mount
    const timeoutId = setTimeout(updateWidth, 50);

    // Set up ResizeObserver for better tracking
    const container = document.getElementById('slide-display-container');
    if (container && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        if (!mounted) return;
        // Use the update function which handles edit mode detection
        updateWidth();
      });
      resizeObserver.observe(container);
    }

    // Also listen for window resize as fallback
    window.addEventListener('resize', updateWidth);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', updateWidth);
    };
  }, [isThumbnail, isPresenting]);

  // Scale factor converts from backend's 1920px design to actual display width
  // In presentation mode or thumbnails, don't scale (entire slide is CSS-scaled)
  const scaleFactor = (isThumbnail || isPresenting) ? 1 : slideWidth / NATIVE_WIDTH;
  const finalFontSize = Math.round((props.fontSize || fontSize) * scaleFactor);
  const finalLetterSpacing = Math.round(letterSpacing * scaleFactor);

  // =================================================================
  // TIPTAP EDITOR CONFIGURATION
  // =================================================================
  // Freeze initial content at mount - don't recalculate when texts prop changes
  // Content updates are handled by the separate sync effect (line 394-408)
  const initialContentRef = useRef<any>(null);
  if (!initialContentRef.current) {
    initialContentRef.current = texts 
      ? transformMyFormatToTiptap(texts)
      : { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
  }
  const initialContent = initialContentRef.current;

  const extensions = useMemo(() => {
    const exts = [
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
      exts.push(Heading.configure({
        levels: [1, 2, 3],
        HTMLAttributes: { style: 'margin: 0; padding: 0;' }
      }));
    }

    return exts;
  }, [alignment, isThumbnail]);

  const editorConfig = useMemo(() => ({
    extensions,
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
      handleKeyDown: (view, event) => {
        if (event.key === 'Escape') {
          isThisComponentEditingRef.current = false;
          setTextEditingGlobal(false);
          return true;
        }
        return false;
      },
    },
    onCreate: ({ editor }) => {
      editor.commands.setTextAlign(alignment);
    },
    onFocus: () => {
      if (lockedSlideId.current) {
        import('@/stores/historyStore').then(({ useHistoryStore }) => {
          useHistoryStore.getState().startTransientOperation(
            lockedComponentId.current,
            lockedSlideId.current
          );
        });
      }
    },
    onBlur: ({ editor }) => {
      if (!editor || editor.isDestroyed || isUpdatingRef.current || isUnmountingRef.current) return;
      
      // console.log('[TiptapTextBlock] onBlur START', {
      //   componentId: component.id,
      //   isCurrentlyTextEditing,
      //   isBlurring: isBlurringRef.current,
      //   isUpdating: isUpdatingRef.current
      // });
      
      // Validate we're still on the correct slide
      if (lockedSlideId.current !== slideId) {
        // Still exit text editing mode
        if (isCurrentlyTextEditing) {
          isThisComponentEditingRef.current = false;
          setTextEditingGlobal(false);
        }
        return;
      }

      // Mark that we're in blur process to prevent content sync
      isBlurringRef.current = true;
      isUpdatingRef.current = true;
      
      try {
        const json = editor.getJSON();
        const docs: CustomDoc = transformTiptapToMyFormat(json);
        const docsStr = JSON.stringify(docs);
        
        // console.log('[TiptapTextBlock] onBlur SAVING', {
        //   componentId: component.id,
        //   contentLength: docsStr.length,
        //   contentPreview: docsStr.substring(0, 100)
        // });
        
        // Track what we're saving - normalize the format for comparison
        const normalizedSaved = JSON.stringify(docs);
        lastSavedContentRef.current = normalizedSaved;
        
        // Save the text changes
        if (!isUnmountingRef.current && lockedSlideId.current === slideId) {
          updateComponent(lockedComponentId.current, { props: { texts: docs } }, true);
        }

        if (lockedSlideId.current) {
          import('@/stores/historyStore').then(({ useHistoryStore }) => {
            useHistoryStore.getState().endTransientOperation(
              lockedComponentId.current,
              lockedSlideId.current
            );
          });
        }

        if (isCurrentlyTextEditing) {
          // Clear this component's editing flag and global flag
          // console.log('[TiptapTextBlock] onBlur EXITING edit mode', { componentId: component.id });
          isThisComponentEditingRef.current = false;
          setTimeout(() => {
            if (!isUnmountingRef.current) {
              setTextEditingGlobal(false);
            }
          }, 0);
        }
      } finally {
        setTimeout(() => { 
          if (!isUnmountingRef.current) {
            // console.log('[TiptapTextBlock] Clearing isUpdatingRef', { componentId: component.id });
            isUpdatingRef.current = false;
          }
        }, 200); // Increased delay to ensure props have propagated
        
        // Clear blur flag after a delay to allow state to settle
        setTimeout(() => {
          // console.log('[TiptapTextBlock] Clearing isBlurringRef', { componentId: component.id });
          isBlurringRef.current = false;
        }, 300);
      }
    },
  }), [
    extensions,
    isCurrentlyTextEditing,
    alignment,
    verticalAlignment,
    component.id,
    updateComponent,
    setTextEditingGlobal,
    isThumbnail,
    slideId,
  ]);

  // Recreate editor when component or slide changes
  const editor = useEditor(editorConfig, [component.id, slideId]);

  // =================================================================
  // LIFECYCLE MANAGEMENT
  // =================================================================

  // Track unmounting to prevent saves during cleanup
  useEffect(() => {
    // Reset unmounting flag on mount
    isUnmountingRef.current = false;
    
    return () => {
      isUnmountingRef.current = true;
      
      // If we have an active editor, blur it immediately without saving
      if (editor && !editor.isDestroyed) {
        try {
          editor.commands.blur();
        } catch (e) {
          // Silent - expected during cleanup
        }
      }
    };
  }, [editor]);

  // Sync text content when props change
  useEffect(() => {
    // Don't sync during blur transition or while editing
    if (!editor || isCurrentlyTextEditing || isUpdatingRef.current || isBlurringRef.current) {
      // console.log('[TiptapTextBlock] Content sync SKIPPED', {
      //   componentId: component.id,
      //   noEditor: !editor,
      //   isEditing: isCurrentlyTextEditing,
      //   isUpdating: isUpdatingRef.current,
      //   isBlurring: isBlurringRef.current
      // });
      return;
    }

    const currentContent = editor.getJSON();
    const currentTexts = transformTiptapToMyFormat(currentContent);
    const currentTextsStr = JSON.stringify(currentTexts);
    
    // Normalize incoming texts to same format for comparison
    const normalizedTexts = JSON.stringify(texts);

    // console.log('[TiptapTextBlock] Content sync CHECK', {
    //   componentId: component.id,
    //   currentLength: currentTextsStr.length,
    //   newLength: normalizedTexts.length,
    //   lastSavedMatches: lastSavedContentRef.current === normalizedTexts,
    //   contentsMatch: currentTextsStr === normalizedTexts,
    //   lastSavedPreview: lastSavedContentRef.current?.substring(0, 50),
    //   incomingPreview: normalizedTexts.substring(0, 50)
    // });

    // Skip sync if this is the content we just saved on blur
    if (lastSavedContentRef.current && lastSavedContentRef.current === normalizedTexts) {
      // console.log('[TiptapTextBlock] Content sync SKIPPED - matches last saved', { componentId: component.id });
      lastSavedContentRef.current = null; // Clear the flag
      return;
    }

    // Only update if content actually differs
    if (normalizedTexts !== currentTextsStr) {
      // console.log('[TiptapTextBlock] Content sync APPLYING', {
      //   componentId: component.id,
      //   currentPreview: currentTextsStr.substring(0, 100),
      //   newPreview: normalizedTexts.substring(0, 100)
      // });
      const newContent = transformMyFormatToTiptap(texts || {
        type: 'doc',
        content: [{ type: 'paragraph', content: [] }]
      });
      editor.commands.setContent(newContent, false);
    } else {
      // console.log('[TiptapTextBlock] Content sync SKIPPED - no changes', { componentId: component.id });
    }
  }, [editor, texts, isCurrentlyTextEditing]);

  // Manage editor editable state
  useEffect(() => {
    if (!editor) return;

    if (editor.isEditable !== isCurrentlyTextEditing) {
      editor.setEditable(isCurrentlyTextEditing);
    }

    if (isCurrentlyTextEditing && !editor.isFocused) {
      setTimeout(() => editor.commands.focus('end'), 50);
    }

    if (editor.view?.dom) {
      editor.view.dom.setAttribute('data-component-id', component.id);
    }
  }, [editor, isCurrentlyTextEditing, component.id]);

  // Update alignment
  useEffect(() => {
    if (!editor) return;

    const editorElement = editor.view?.dom as HTMLElement;
    if (editorElement) {
      editorElement.style.textAlign = alignment;
    }
    editor.commands.setTextAlign(alignment);
  }, [editor, alignment]);

  // Manage active editor in store
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

  // =================================================================
  // RENDER
  // =================================================================

  const wrapperStyle: React.CSSProperties = {
    ...styles,
    position: styles?.position || 'relative',
    overflow: 'hidden',
    fontSize: `${finalFontSize}px`,
    fontFamily: getFontFamilyWithFallback(fontFamily || 'Arial'),
    fontWeight: fontWeight,
    lineHeight: lineHeight || 1.5,
    letterSpacing: `${finalLetterSpacing}px`,
    color: textColor,
    padding: typeof padding === 'number' ? `${padding}px` : String(padding),
    cursor: isCurrentlyTextEditing ? 'text' : (isSelected ? 'text' : 'move'),
  } as React.CSSProperties;

  return (
    <div
      key={instanceKey}
      ref={containerRef}
      style={wrapperStyle}
      data-component-id={component.id}
      data-component-type="TiptapTextBlock"
    >
      <div
        className="tiptap-editor-wrapper"
        style={{ width: '100%', height: '100%' }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (!isCurrentlyTextEditing && isSelected) {
            isThisComponentEditingRef.current = true;
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
