import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
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
import BulletList from '@tiptap/extension-bullet-list';
import ListItem from '@tiptap/extension-list-item';
import OrderedList from '@tiptap/extension-ordered-list';
import { ComponentInstance } from "../../types/components";
import { registerRenderer, RendererProps } from '../index';
import { transformMyFormatToTiptap, transformTiptapToMyFormat, CustomDoc, CustomBlockNode, StyledTextSegment } from '../../utils/tiptapUtils';
import { useEditorStore } from '../../stores/editorStore';
import { useEditorSettingsStore } from '../../stores/editorSettingsStore';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import type { RendererFunction } from '../index';
import '../../styles/TiptapStyles.css';
import { ShapeProps } from '@/registry/components/shape';
import { FontSize } from '@/extensions/FontSize';
import { usePresentationStore } from '../../stores/presentationStore';
import { getFontFamilyWithFallback } from '../../utils/fontUtils';
import { getSlideContainerWidth, isInEditMode } from '../../utils/slideContainerUtils';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { getContrastTextColor } from '@/utils/colorUtils';

interface ShapeWithTextRendererProps extends RendererProps {
  component: ComponentInstance;
  containerRef: React.RefObject<HTMLDivElement>;
  slideId?: string;
  isEditing?: boolean;
  isSelected?: boolean;
  isThumbnail?: boolean;
  onUpdate?: (updates: Partial<ComponentInstance>) => void;
}

/**
 * Renders a shape component with optional text using SVG and TipTap.
 */
export const ShapeWithTextRenderer: React.FC<ShapeWithTextRendererProps> = ({
  component,
  containerRef,
  slideId,
  isEditing = false,
  isSelected = false,
  isThumbnail = false,
  onUpdate,
}) => {
  const props = component.props;

  // Calculate automatic text color based on shape background for proper contrast
  const getAutoTextColor = (): string => {
    // Determine the background color of the shape
    let bgColor: string | undefined;

    // Check for gradient first
    const hasGradient = props.gradient && typeof props.gradient === 'object' && props.gradient.type && props.gradient.stops;
    if (hasGradient && props.gradient.stops && props.gradient.stops.length > 0) {
      // Use the first gradient stop color as the base for contrast calculation
      bgColor = props.gradient.stops[0].color;
    } else {
      // Use fill color
      bgColor = (props as any).fill ?? (props as any).fillColor ?? (props as any).backgroundColor;
    }

    // If no background color or transparent, use black text as default
    if (!bgColor || bgColor === 'none' || bgColor === 'transparent' || bgColor.toLowerCase() === '#00000000') {
      return '#000000';
    }

    // Convert to hex if needed and get contrasting color
    try {
      // Handle rgba/rgb colors - extract hex equivalent
      if (bgColor.startsWith('rgba') || bgColor.startsWith('rgb')) {
        const match = bgColor.match(/\d+/g);
        if (match && match.length >= 3) {
          const r = parseInt(match[0]);
          const g = parseInt(match[1]);
          const b = parseInt(match[2]);
          bgColor = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1, 7);
        }
      }

      // Handle 8-digit hex (remove alpha)
      if (bgColor.length === 9 && bgColor.startsWith('#')) {
        bgColor = bgColor.substring(0, 7);
      }

      return getContrastTextColor(bgColor);
    } catch (e) {
      console.warn('Failed to calculate contrast color for background:', bgColor, e);
      return '#000000';
    }
  };

  const {
    borderRadius = 0,
    shadow = false,
    shadowBlur = 10,
    shadowColor = "rgba(0,0,0,0.3)",
    shadowOffsetX = 0,
    shadowOffsetY = 4,
    shadowSpread = 0,
    strokeWidth = 0,
    hasText = false,
    texts,
    fontFamily = 'Poppins',
    fontSize = 16,
    fontWeight = 'normal',
    lineHeight = 1.5,
    letterSpacing = 0,
    textColor = props.textColor || getAutoTextColor(), // Use explicit textColor if set, otherwise auto-calculate
    alignment = 'center',
    verticalAlignment = 'middle',
    textPadding = 0
  } = props;

  // Use fontSize from props
  const effectiveFontSize = props.fontSize || fontSize;

  // Normalize shape type (support both props.shapeType and props.shape)
  const rawShapeType = String((props as any).shapeType ?? (props as any).shape ?? 'rectangle').toLowerCase();
  const shapeTypeAliasMap: Record<string, string> = {
    rect: 'rectangle',
    rectangle: 'rectangle',
    roundrect: 'rectangle',
    'round-rect': 'rectangle',
    rounded: 'rectangle',
    ellipse: 'ellipse',
    oval: 'ellipse',
    circle: 'circle',
  };
  const shapeType = shapeTypeAliasMap[rawShapeType] || rawShapeType;

  // Convert various color formats to SVG-friendly strings
  const toSvgColor = (c?: any): string | undefined => {
    if (c == null) return undefined;
    // Handle non-string inputs gracefully (objects, arrays, numbers)
    if (typeof c !== 'string') {
      try {
        if (typeof c === 'number' && Number.isFinite(c)) {
          const hex = Math.max(0, Math.min(0xffffff, c)) | 0;
          const r = (hex >> 16) & 255;
          const g = (hex >> 8) & 255;
          const b = hex & 255;
          return `rgb(${r},${g},${b})`;
        }
        if (Array.isArray(c)) {
          const [r, g, b, a] = c as any[];
          if ([r, g, b].every(v => typeof v === 'number')) {
            const alpha = typeof a === 'number' ? Math.max(0, Math.min(1, a)) : 1;
            return `rgba(${Math.max(0, Math.min(255, r|0))},${Math.max(0, Math.min(255, g|0))},${Math.max(0, Math.min(255, b|0))},${alpha})`;
          }
        }
        if (typeof c === 'object') {
          const { r, g, b, a } = c as any;
          if ([r, g, b].every((v: any) => typeof v === 'number')) {
            const alpha = typeof a === 'number' ? Math.max(0, Math.min(1, a)) : 1;
            return `rgba(${Math.max(0, Math.min(255, r|0))},${Math.max(0, Math.min(255, g|0))},${Math.max(0, Math.min(255, b|0))},${alpha})`;
          }
        }
      } catch { /* ignore and fall through */ }
      return undefined;
    }
    const lower = c.toLowerCase();
    if (lower === 'transparent' || lower === 'none') return 'none';
    // #RRGGBBAA → rgba()
    const m8 = /^#([0-9a-f]{8})$/i.exec(c);
    if (m8) {
      const hex = m8[1];
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = parseInt(hex.slice(6, 8), 16) / 255;
      if (a === 0) return 'none';
      return `rgba(${r},${g},${b},${a})`;
    }
    // #RRGGBB passthrough
    const m6 = /^#([0-9a-f]{6})$/i.exec(c);
    if (m6) return c;
    // rgb()/rgba()/named colors passthrough
    return c;
  };

  // Shape auto-resize state - removed to prevent infinite loops
  // const [contentHeight, setContentHeight] = useState<number | null>(null);
  const textContainerRef = useRef<HTMLDivElement>(null);
  
  const { updateComponent } = useActiveSlide();
  const updateDraftComponent = useEditorStore(state => state.updateDraftComponent);
  const isTextEditingGlobal = useEditorSettingsStore(state => state.isTextEditing);
  const setTextEditingGlobal = useEditorSettingsStore(state => state.setTextEditing);
  const setActiveTiptapEditor = useEditorStore((state) => state.setActiveTiptapEditor);

  // =================================================================
  // TEXT EDITING STATE MANAGEMENT  
  // =================================================================
  // Track if THIS specific shape is being edited. Decoupled from isSelected
  // to prevent premature exit when selection changes during text editing.
  const isThisComponentEditingRef = useRef(false);
  const isCurrentlyTextEditing = isTextEditingGlobal && isThisComponentEditingRef.current && hasText;
  
  // CRITICAL: Lock slideId at mount to prevent cross-slide writes after navigation
  const slideIdRef = useRef(slideId);
  useEffect(() => {
    slideIdRef.current = slideId;
  }, [slideId]);

  // Use the actual dimensions from props - don't modify them
  const actualWidth = props.width || 100;
  const actualHeight = props.height || 100;
  
  // CRITICAL FIX: Do NOT expand viewBox for shadows!
  // Shadows should extend beyond bounds using overflow: visible
  // Expanding viewBox makes the shape appear smaller/cropped
  
  // ViewBox matches actual dimensions exactly - NO padding
  const viewBoxWidth = actualWidth;
  const viewBoxHeight = actualHeight;
  const viewBox = `0 0 ${viewBoxWidth} ${viewBoxHeight}`;
  
  // Shape fills the entire viewBox - NO offset needed
  const shapeWidth = actualWidth;
  const shapeHeight = actualHeight;
  const shapeX = 0;
  const shapeY = 0;

  // Check if we're in presentation mode
  const isPresenting = usePresentationStore(state => state.isPresenting);

  // Track the slide container's width for accurate font scaling
  // Use slide container scale instead of component scale to avoid double-scaling
  const [slideContainerWidth, setSlideContainerWidth] = useState<number>(() => 
    isThumbnail ? DEFAULT_SLIDE_WIDTH : getSlideContainerWidth(DEFAULT_SLIDE_WIDTH)
  );

  const slideContainerWidthRef = useRef<number>(slideContainerWidth);

  // Measure slide container's width for font scaling
  useEffect(() => {
    if (isThumbnail || isPresenting) return;

    const updateSlideWidth = () => {
      if (isCurrentlyTextEditing) return; // Skip during text editing to prevent font size changes

      const newWidth = getSlideContainerWidth(DEFAULT_SLIDE_WIDTH);
      const widthDiff = Math.abs(newWidth - slideContainerWidthRef.current);

      // Only update if difference is significant to avoid micro-adjustments
      if (newWidth > 0 && widthDiff > 10) {
        slideContainerWidthRef.current = newWidth;
        setSlideContainerWidth(newWidth);
      }
    };

    updateSlideWidth();

    const slideContainer = document.getElementById('slide-display-container');
    if (!slideContainer) return;

    const resizeObserver = new ResizeObserver(updateSlideWidth);
    resizeObserver.observe(slideContainer);
    window.addEventListener('resize', updateSlideWidth);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateSlideWidth);
    };
  }, [isThumbnail, isPresenting]);

  // Font size calculation - scale based on slide container scale, not component scale
  // This prevents double-scaling since components are already sized as percentages
  const fontScaleFactor = useMemo(() => {
    // Thumbnails and presentation mode are already scaled by outer slide transform; keep fonts at native size
    // The entire slide (including fonts) will be CSS-scaled together
    if (isThumbnail || isPresenting) {
      return 1;
    }

    // For regular slides, calculate scale based on slide container vs native slide width
    // Backend generates fonts for 1920x1080 slides, so we scale from that
    const scaleFactor = slideContainerWidth / DEFAULT_SLIDE_WIDTH;

    // Round to 4 decimal places to prevent micro-fluctuations
    return Math.round(scaleFactor * 10000) / 10000;
  }, [isThumbnail, isPresenting, slideContainerWidth]);

  // CRITICAL FIX: Store the stable font size to prevent resize on click/selection
  // We lock the font size based on props.fontSize and fontScaleFactor, only recalculate when they change
  const stableFontSizeRef = useRef<string | null>(null);
  const lastPropsSizeRef = useRef<number | null>(null);
  const lastScaleFactorRef = useRef<number | null>(null);

  const getFontSize = useMemo(() => {
    // Always use props.fontSize if it exists (this is the source of truth)
    const nativeSize = Math.round(props.fontSize || effectiveFontSize || 16); // Round to whole number

    // For thumbnails, return scaled size
    if (isThumbnail) {
      return `${Math.round(nativeSize * fontScaleFactor)}px`;
    }

    // CRITICAL FIX: Use stable reference with threshold to prevent micro-adjustments
    // Only recalculate if props.fontSize OR fontScaleFactor changed significantly
    // This prevents resize-on-click and micro-fluctuations while still allowing proper scaling
    if (stableFontSizeRef.current &&
        lastPropsSizeRef.current === nativeSize) {
      // Check if scale factor changed significantly (more than 0.5% difference)
      const scaleFactorDiff = Math.abs(fontScaleFactor - (lastScaleFactorRef.current || 0));
      const scaleFactorThreshold = 0.005; // 0.5% threshold

      if (scaleFactorDiff < scaleFactorThreshold) {
        return stableFontSizeRef.current;
      }
    }

    // Apply scaling and round to whole number (for all components)
    const finalSize = Math.round(nativeSize * fontScaleFactor);

    const result = `${finalSize}px`;
    stableFontSizeRef.current = result;
    lastPropsSizeRef.current = nativeSize;
    lastScaleFactorRef.current = fontScaleFactor;

    return result;
  }, [props.fontSize, fontScaleFactor, isThumbnail]); // Only essential dependencies to prevent unnecessary recalculations
  
  // Removed font optimization listener

  // Letter spacing calculation - scale for non-thumbnails
  const getLetterSpacing = useMemo(() => {
    if (isThumbnail) {
      // Thumbnails don't need scaling (CSS transform handles it)
      return letterSpacing ? `${letterSpacing}px` : '0px';
    }
    
    // For non-thumbnail views, scale the letter spacing
    return letterSpacing ? `${letterSpacing * fontScaleFactor}px` : '0px';
  }, [letterSpacing, isThumbnail, fontScaleFactor]);

  // Initial content preparation
  // Freeze initial content at mount - don't recalculate when texts prop changes
  // Content updates are handled by the separate sync effect
  const initialContentRef = useRef<any>(null);
  if (!initialContentRef.current) {
    initialContentRef.current = texts 
      ? transformMyFormatToTiptap(texts)
      : { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
  }
  const initialContent = initialContentRef.current;

  // TipTap extensions
  const getExtensions = useCallback(() => {
    const baseExtensions = [
      Document.extend({
        content: 'block+'
      }),
      Paragraph.configure({
        HTMLAttributes: {
          style: `margin: 0; padding: 0;`
        }
      }),
      Text,
      TextStyle,
      Color,
      FontSize,
      BoldExt,
      ItalicExt,
      Underline,
      StrikeExt,
      Highlight.configure({
        multicolor: true,
      }),
      Subscript,
      Superscript,
      Typography,
      TextAlign.configure({
        types: ['paragraph', 'heading'],
        alignments: ['left', 'center', 'right', 'justify'],
        defaultAlignment: alignment,
      }),
      Link.extend({
        parseHTML() {
          return [
            {
              tag: 'a[href]',
              getAttrs: (dom) => {
                const href = (dom as HTMLElement).getAttribute('href');
                // Only accept valid string hrefs
                if (typeof href === 'string' && href.length > 0) {
                  return { href };
                }
                return false; // Reject invalid links
              },
            },
          ];
        },
        renderHTML({ HTMLAttributes }) {
          // Ensure href is always a string before rendering
          const href = HTMLAttributes.href;
          if (typeof href !== 'string' || !href) {
            return ['span', { class: 'text-blue-600' }, 0];
          }
          return ['a', { ...HTMLAttributes, class: 'text-blue-600 underline cursor-pointer' }, 0];
        },
      }).configure({
        openOnClick: false,
        validate: href => {
          // Ensure href is a string to prevent "uri.replace is not a function" error
          return typeof href === 'string' && href.length > 0;
        },
      }),
      // Include these even in thumbnails for proper rendering
      Heading.configure({
        levels: [1, 2, 3],
        HTMLAttributes: {
          style: 'margin: 0; padding: 0;'
        }
      }),
      BulletList.configure({
        HTMLAttributes: {
          style: 'margin: 0; padding-left: 1.5em;'
        }
      }),
      OrderedList.configure({
        HTMLAttributes: {
          style: 'margin: 0; padding-left: 1.5em;'
        }
      }),
      ListItem.configure({
        HTMLAttributes: {
          style: 'margin: 0;'
        }
      })
    ];

    return baseExtensions;
  }, [alignment]);

  // Track if we're updating to prevent loops
  const isUpdatingRef = useRef(false);
  const lastSavedContentRef = useRef<string | null>(null);
  const isBlurringRef = useRef(false);

  // Editor configuration - start with editable false, update via setEditable to prevent recreation
  const getEditorConfig = useMemo(() => ({
    extensions: getExtensions(),
    content: initialContent,
    editable: false,  // Always start false, managed via editor.setEditable() to prevent recreation
    immediatelyRender: isThumbnail,  // Render immediately for thumbnails to prevent blank state
    editorProps: {
      attributes: {
        class: 'focus:outline-none w-full h-full tiptap-editor-content',
        style: `
          display: flex;
          flex-direction: column;
          justify-content: ${
            verticalAlignment === 'middle'
              ? 'center'
              : verticalAlignment === 'bottom'
              ? 'flex-end'
              : 'flex-start'
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
    onFocus: ({ editor }) => {
      if (!editor || editor.isDestroyed) return;
      if (slideId) {
        import('@/stores/historyStore').then(({ useHistoryStore }) => {
          useHistoryStore.getState().startTransientOperation(component.id, slideId);
        });
      }
    },
    onBlur: ({ editor }) => {
      if (!editor || editor.isDestroyed || isUpdatingRef.current) return;
      
      // console.log('[ShapeWithText] onBlur START', {
      //   componentId: component.id,
      //   isCurrentlyTextEditing,
      //   isBlurring: isBlurringRef.current,
      //   isUpdating: isUpdatingRef.current
      // });
      
      // Mark that we're in blur process to prevent content sync
      isBlurringRef.current = true;
      isUpdatingRef.current = true;
      
      try {
        const json = editor.getJSON();
        const docs: CustomDoc = transformTiptapToMyFormat(json);
        const docsStr = JSON.stringify(docs);
        
        // console.log('[ShapeWithText] onBlur SAVING', {
        //   componentId: component.id,
        //   contentLength: docsStr.length,
        //   contentPreview: docsStr.substring(0, 100)
        // });
        
        // Track what we're saving - normalize the format for comparison
        const normalizedSaved = JSON.stringify(docs);
        lastSavedContentRef.current = normalizedSaved;
        
        updateComponent(component.id, { props: { texts: docs } }, true);
        
        if (slideIdRef.current) {
          import('@/stores/historyStore').then(({ useHistoryStore }) => {
            useHistoryStore.getState().endTransientOperation(component.id, slideIdRef.current);
          });
        }
        
        if (isCurrentlyTextEditing) {
          // console.log('[ShapeWithText] onBlur EXITING edit mode', { componentId: component.id });
          isThisComponentEditingRef.current = false;
          setTimeout(() => setTextEditingGlobal(false), 0);
        }
      } finally {
        setTimeout(() => {
          // console.log('[ShapeWithText] Clearing isUpdatingRef', { componentId: component.id });
          isUpdatingRef.current = false;
        }, 200); // Increased delay to ensure props have propagated
        
        // Clear blur flag after a delay to allow state to settle
        setTimeout(() => {
          // console.log('[ShapeWithText] Clearing isBlurringRef', { componentId: component.id });
          isBlurringRef.current = false;
        }, 300);
      }
    },
  }), [
    getExtensions,
    alignment,
    verticalAlignment,
    component.id,
    updateComponent,
    setTextEditingGlobal,
    isThumbnail,
    slideId,
  ]);

  const editor = useEditor(getEditorConfig);

  // Sync editor content when texts prop changes
  useEffect(() => {
    // Don't sync during blur transition or while editing
    if (!editor || isCurrentlyTextEditing || isUpdatingRef.current || isBlurringRef.current) {
      // console.log('[ShapeWithText] Content sync SKIPPED', {
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

    // console.log('[ShapeWithText] Content sync CHECK', {
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
      // console.log('[ShapeWithText] Content sync SKIPPED - matches last saved', { componentId: component.id });
      lastSavedContentRef.current = null; // Clear the flag
      return;
    }

    // Only update if content actually differs
    if (normalizedTexts !== currentTextsStr) {
      // console.log('[ShapeWithText] Content sync APPLYING', {
      //   componentId: component.id,
      //   currentPreview: currentTextsStr.substring(0, 100),
      //   newPreview: normalizedTexts.substring(0, 100)
      // });
      const newContent = transformMyFormatToTiptap(texts || {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: []
        }]
      });

      editor.commands.setContent(newContent, false);
    } else {
      // console.log('[ShapeWithText] Content sync SKIPPED - no changes', { componentId: component.id });
    }
  }, [editor, texts, isCurrentlyTextEditing]);

  // Update editor state
  useEffect(() => {
    if (editor) {
      const currentlyEditable = editor.isEditable;
      if (currentlyEditable !== isCurrentlyTextEditing) {
        editor.setEditable(isCurrentlyTextEditing);
      }
      
      if (isCurrentlyTextEditing && !editor.isFocused) {
        setTimeout(() => {
          editor.commands.focus('end');
        }, 50);
      }
      
      if (editor.view && editor.view.dom) {
        editor.view.dom.setAttribute('data-component-id', component.id);
      }
    }
  }, [editor, isCurrentlyTextEditing, component.id]);

  // Update alignment
  useEffect(() => {
    if (editor) {
      const editorElement = editor.view.dom;
      if (editorElement) {
        editorElement.style.textAlign = alignment;
      }
      
      editor.commands.setTextAlign(alignment);
    }
  }, [editor, alignment]);

  // Set active editor
  useEffect(() => {
    if (isSelected && editor && hasText) {
      setActiveTiptapEditor(editor);
    }

    return () => {
      const currentActiveEditor = useEditorStore.getState().activeTiptapEditor;
      if (currentActiveEditor === editor) {
        setActiveTiptapEditor(null);
      }
    };
  }, [editor, isSelected, hasText, setActiveTiptapEditor]);

  // Mouse tracking for double-click
  const [mouseDownPos, setMouseDownPos] = useState<{ x: number, y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHoveringText, setIsHoveringText] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setMouseDownPos({ x: e.clientX, y: e.clientY });
      setIsDragging(false);
    }
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (mouseDownPos && e.buttons === 1 && !isDragging) {
      const dx = Math.abs(e.clientX - mouseDownPos.x);
      const dy = Math.abs(e.clientY - mouseDownPos.y);
      
      if (dx > 10 || dy > 10) {
        setIsDragging(true);
      }
    }
  };
  
  const handleMouseUp = (e: React.MouseEvent) => {
    setMouseDownPos(null);
  };

  const handleTextMouseEnter = () => {
    if (!isCurrentlyTextEditing && hasText && isEditing && isSelected) {
      setIsHoveringText(true);
    }
  };

  const handleTextMouseLeave = () => {
    setIsHoveringText(false);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (isEditing && isSelected && !isCurrentlyTextEditing && !isUpdatingRef.current) {
      isUpdatingRef.current = true;
      
      try {
        // Enable text editing on the shape
        if (!hasText) {
          // Enable text for the first time
          updateComponent(component.id, { 
            props: { 
              ...props, 
              hasText: true,
              texts: {
                type: 'doc',
                content: [{
                  type: 'paragraph',
                  content: [{
                    type: 'text',
                    text: '',
                    style: {}
                  }]
                }]
              }
            } 
          }, true);
        }
        isThisComponentEditingRef.current = true;
        setTextEditingGlobal(true);
      } finally {
        setTimeout(() => {
          isUpdatingRef.current = false;
        }, 100);
      }
    }
  };

  // Handle gradient and shadow
  const hasGradient = props.gradient && typeof props.gradient === 'object' && props.gradient.type && props.gradient.stops;
  const fillGradientId = `shape-fill-gradient-${component.id}`;
  const shadowFilterId = `shape-shadow-filter-${component.id}`;
  const animationDuration = props.isAnimated && hasGradient ? 11 - (props.animationSpeed || 1) : 0;

  // Render shadow filter
  const renderSVGShadowFilter = () => {
    if (!shadow) return null;
    
    return (
      <filter id={shadowFilterId} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceAlpha" stdDeviation={shadowBlur / 2} />
        <feOffset dx={shadowOffsetX} dy={shadowOffsetY} result="offsetblur" />
        <feFlood floodColor={shadowColor} />
        <feComposite in2="offsetblur" operator="in" />
        <feComponentTransfer>
          <feFuncA type="linear" slope="1" />
        </feComponentTransfer>
        {shadowSpread > 0 && (
          <feMorphology operator="dilate" radius={shadowSpread} />
        )}
        <feMerge>
          <feMergeNode />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    );
  };
  
  // Render gradient definitions
  const renderSVGGradients = () => {
    if (!hasGradient || !props.gradient) return null;
    
    const gradient = props.gradient;
    const sortedStops = [...gradient.stops].sort((a: any, b: any) => a.position - b.position);
    
    if (gradient.type === 'radial') {
      return (
        <radialGradient 
          id={fillGradientId} 
          cx="50%" 
          cy="50%" 
          r="50%"
          gradientUnits="objectBoundingBox"
        >
          {sortedStops.map((stop: any, index: number) => (
            <stop key={index} offset={`${stop.position}%`} stopColor={toSvgColor(stop.color)} />
          ))}
        </radialGradient>
      );
    } else if (gradient.type === 'linear') {
      const angle = gradient.angle || 90;
      const angleRad = (angle - 90) * Math.PI / 180;
      const x1 = 50 + 50 * Math.cos(angleRad + Math.PI);
      const y1 = 50 + 50 * Math.sin(angleRad + Math.PI);
      const x2 = 50 + 50 * Math.cos(angleRad);
      const y2 = 50 + 50 * Math.sin(angleRad);
      
      return (
        <linearGradient 
          id={fillGradientId} 
          x1={`${x1}%`} 
          y1={`${y1}%`} 
          x2={`${x2}%`} 
          y2={`${y2}%`}
          gradientUnits="objectBoundingBox"
        >
          {sortedStops.map((stop: any, index: number) => (
            <stop key={index} offset={`${stop.position}%`} stopColor={toSvgColor(stop.color)} />
          ))}
          {props.isAnimated && (
            <animateTransform
              attributeName="gradientTransform"
              type="rotate"
              from="0 0.5 0.5"
              to="360 0.5 0.5"
              dur={`${animationDuration}s`}
              repeatCount="indefinite"
            />
          )}
        </linearGradient>
      );
    }
    
    return null;
  };

  // Determine fill value (support legacy/import synonyms)
  // Default to 'none' when no explicit fill provided
  let fillValue = (props as any).fill ?? (props as any).fillColor ?? (props as any).backgroundColor ?? 'none';

  // Debug logging removed

  if (hasGradient) {
    fillValue = `url(#${fillGradientId})`;
  } else {
    // Heuristic for PPTX imports: if fill is pure black with no effective stroke, treat as transparent
    const rawFillLower = String(fillValue || '').toLowerCase();
    const rawStrokeLower = String((props as any).stroke ?? (props as any).strokeColor ?? (props as any).borderColor ?? '#00000000').toLowerCase();
    const strokeWidthNum = Number(strokeWidth || 0);
    const hasEffectiveStroke = strokeWidthNum > 0 && rawStrokeLower !== '#00000000' && rawStrokeLower !== 'none' && rawStrokeLower !== 'transparent';
    // Some imports incorrectly report no-fill shapes as solid black.
    // For PPTX imports, coerce any pure-black fill to transparent for all shapes.
    const isFromPptx = (props as any).source === 'pptx';
    // Detect pure/near-black values from various formats
    let isNearBlackHex = false;
    const hex6 = /^#([0-9a-f]{6})$/i.exec(rawFillLower);
    if (hex6) {
      const r = parseInt(hex6[1].slice(0, 2), 16);
      const g = parseInt(hex6[1].slice(2, 4), 16);
      const b = parseInt(hex6[1].slice(4, 6), 16);
      isNearBlackHex = r <= 6 && g <= 6 && b <= 6;
    }
    const hex8 = /^#([0-9a-f]{8})$/i.exec(rawFillLower);
    if (!isNearBlackHex && hex8) {
      const r = parseInt(hex8[1].slice(0, 2), 16);
      const g = parseInt(hex8[1].slice(2, 4), 16);
      const b = parseInt(hex8[1].slice(4, 6), 16);
      const a = parseInt(hex8[1].slice(6, 8), 16);
      isNearBlackHex = a === 255 && r <= 6 && g <= 6 && b <= 6;
    }
    const isPureBlack = (
      rawFillLower === '#000000ff' ||
      rawFillLower === '#000000' ||
      rawFillLower === 'black' ||
      /^rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*1(\.0+)?\s*\)$/i.test(rawFillLower) ||
      /^rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)$/i.test(rawFillLower) ||
      isNearBlackHex
    );
    if (isFromPptx && isPureBlack) {
      fillValue = '#00000000';
    }

    const converted = toSvgColor(fillValue);
    const isTransparentRgba = typeof converted === 'string' && /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(\.0+)?\s*\)/i.test(converted);
    fillValue = isTransparentRgba ? 'none' : (converted || 'none');

    // Debug logging removed
  }

  const strokeColor = toSvgColor((props as any).stroke ?? (props as any).strokeColor ?? (props as any).borderColor ?? '#000000ff') || 'none';
  const svgAttrs = {
    fill: fillValue,
    stroke: strokeWidth > 0 ? strokeColor : 'none',
    strokeWidth: strokeWidth > 0 ? strokeWidth : 0,
    // Don't set fillOpacity - let the color's alpha channel work naturally (e.g. #FF550006 = 2.4% opacity)
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
    vectorEffect: 'non-scaling-stroke' as const,
    filter: shadow ? `url(#${shadowFilterId})` : undefined
  };

  const adjustedBorderRadius = Math.max(0, borderRadius - (strokeWidth / 2));
  const rectAttrs = shapeType === 'rectangle' && borderRadius > 0
    ? { ...svgAttrs, rx: adjustedBorderRadius, ry: adjustedBorderRadius }
    : svgAttrs;

  // Generate shape element
  let svgShapeElement: React.ReactNode = null;
  switch (shapeType) {
    case 'rectangle':
      svgShapeElement = <rect x={shapeX} y={shapeY} width={shapeWidth} height={shapeHeight} {...rectAttrs} />;
      break;
    case 'circle':
      // No inset so visual bounds match the creation outline exactly
      const circleRadius = Math.min(shapeWidth, shapeHeight) / 2;
      const circleCx = shapeX + shapeWidth / 2;
      const circleCy = shapeY + shapeHeight / 2;
      svgShapeElement = <circle cx={circleCx} cy={circleCy} r={circleRadius} {...svgAttrs} />;
      break;
    case 'ellipse':
      // No inset so visual bounds match the creation outline exactly
      const ellipseRx = shapeWidth / 2;
      const ellipseRy = shapeHeight / 2;
      const ellipseCx = shapeX + shapeWidth / 2;
      const ellipseCy = shapeY + shapeHeight / 2;
      svgShapeElement = <ellipse cx={ellipseCx} cy={ellipseCy} rx={ellipseRx} ry={ellipseRy} {...svgAttrs} />;
      break;
    case 'triangle':
      const triTop = `${shapeX + shapeWidth/2},${shapeY}`;
      const triBottomLeft = `${shapeX},${shapeY + shapeHeight}`;
      const triBottomRight = `${shapeX + shapeWidth},${shapeY + shapeHeight}`;
      svgShapeElement = <polygon points={`${triTop} ${triBottomLeft} ${triBottomRight}`} {...svgAttrs} />;
      break;
    case 'star':
      const starCx = shapeX + shapeWidth / 2;
      const starCy = shapeY + shapeHeight / 2;
      const starPoints = [
        `${starCx},${shapeY}`,
        `${shapeX + shapeWidth*0.61},${shapeY + shapeHeight*0.385}`,
        `${shapeX + shapeWidth*0.98},${shapeY + shapeHeight*0.385}`,
        `${shapeX + shapeWidth*0.68},${shapeY + shapeHeight*0.576}`,
        `${shapeX + shapeWidth*0.79},${shapeY + shapeHeight}`,
        `${starCx},${shapeY + shapeHeight*0.769}`,
        `${shapeX + shapeWidth*0.21},${shapeY + shapeHeight}`,
        `${shapeX + shapeWidth*0.32},${shapeY + shapeHeight*0.576}`,
        `${shapeX + shapeWidth*0.02},${shapeY + shapeHeight*0.385}`,
        `${shapeX + shapeWidth*0.39},${shapeY + shapeHeight*0.385}`
      ];
      svgShapeElement = <polygon points={starPoints.join(' ')} {...svgAttrs} />;
      break;
    case 'hexagon':
      const hexCy = shapeY + shapeHeight / 2;
      const hexPoints = [
        `${shapeX + shapeWidth*0.25},${shapeY}`,
        `${shapeX + shapeWidth*0.75},${shapeY}`,
        `${shapeX + shapeWidth},${hexCy}`,
        `${shapeX + shapeWidth*0.75},${shapeY + shapeHeight}`,
        `${shapeX + shapeWidth*0.25},${shapeY + shapeHeight}`,
        `${shapeX},${hexCy}`
      ];
      svgShapeElement = <polygon points={hexPoints.join(' ')} {...svgAttrs} />;
      break;
    case 'pentagon':
      const pentCx = shapeX + shapeWidth / 2;
      const pentPoints = [
        `${pentCx},${shapeY}`,
        `${shapeX + shapeWidth},${shapeY + shapeHeight*0.38}`,
        `${shapeX + shapeWidth*0.82},${shapeY + shapeHeight}`,
        `${shapeX + shapeWidth*0.18},${shapeY + shapeHeight}`,
        `${shapeX},${shapeY + shapeHeight*0.38}`
      ];
      svgShapeElement = <polygon points={pentPoints.join(' ')} {...svgAttrs} />;
      break;
    case 'diamond':
      const diamondCx = shapeX + shapeWidth / 2;
      const diamondCy = shapeY + shapeHeight / 2;
      const diamondPoints = [
        `${diamondCx},${shapeY}`,
        `${shapeX + shapeWidth},${diamondCy}`,
        `${diamondCx},${shapeY + shapeHeight}`,
        `${shapeX},${diamondCy}`
      ];
      svgShapeElement = <polygon points={diamondPoints.join(' ')} {...svgAttrs} />;
      break;
    case 'arrow':
      const arrowCy = shapeY + shapeHeight / 2;
      const arrowPoints = [
        `${shapeX},${shapeY + shapeHeight*0.30}`,
        `${shapeX + shapeWidth*0.70},${shapeY + shapeHeight*0.30}`,
        `${shapeX + shapeWidth*0.70},${shapeY}`,
        `${shapeX + shapeWidth},${arrowCy}`,
        `${shapeX + shapeWidth*0.70},${shapeY + shapeHeight}`,
        `${shapeX + shapeWidth*0.70},${shapeY + shapeHeight*0.70}`,
        `${shapeX},${shapeY + shapeHeight*0.70}`
      ];
      svgShapeElement = <polygon points={arrowPoints.join(' ')} {...svgAttrs} />;
      break;
    case 'heart':
      const heartCx = shapeX + shapeWidth / 2;
      const heartPath = `M ${heartCx} ${shapeY + shapeHeight*0.25}
        C ${heartCx} ${shapeY + shapeHeight*0.1}, ${shapeX + shapeWidth*0.3} ${shapeY}, ${shapeX + shapeWidth*0.15} ${shapeY}
        C ${shapeX} ${shapeY}, ${shapeX} ${shapeY + shapeHeight*0.15}, ${shapeX} ${shapeY + shapeHeight*0.3}
        C ${shapeX} ${shapeY + shapeHeight*0.5}, ${heartCx} ${shapeY + shapeHeight}, ${heartCx} ${shapeY + shapeHeight}
        C ${heartCx} ${shapeY + shapeHeight}, ${shapeX + shapeWidth} ${shapeY + shapeHeight*0.5}, ${shapeX + shapeWidth} ${shapeY + shapeHeight*0.3}
        C ${shapeX + shapeWidth} ${shapeY + shapeHeight*0.15}, ${shapeX + shapeWidth} ${shapeY}, ${shapeX + shapeWidth*0.85} ${shapeY}
        C ${shapeX + shapeWidth*0.7} ${shapeY}, ${heartCx} ${shapeY + shapeHeight*0.1}, ${heartCx} ${shapeY + shapeHeight*0.25}
        Z`;
      svgShapeElement = <path d={heartPath} {...svgAttrs} />;
      break;
    default:
      svgShapeElement = <rect x={shapeX} y={shapeY} width={shapeWidth} height={shapeHeight} {...svgAttrs} />;
  }

  const preserveAspectRatio = (shapeType === 'circle' || shapeType === 'ellipse') ? "xMidYMid meet" : "none";

  // Container styles
  const containerStyles: React.CSSProperties = {
    display: 'block',
    lineHeight: 0,
    position: 'relative',
    borderRadius: shapeType === 'rectangle' && borderRadius > 0 ? `${borderRadius}px` : undefined,
    cursor: isCurrentlyTextEditing ? 'text' : 
           (hasText && isSelected ? 'text' : 
           (isEditing ? 'move' : 'default')),
    width: '100%',
    height: '100%'
  };

  // Calculate text padding - scale for non-thumbnails
  const getTextPadding = useMemo(() => {
    const basePadding = textPadding || 16; // Default to 16px if not set
    
    if (isThumbnail) {
      // Thumbnails don't need scaling (CSS transform handles it)
      return `${basePadding}px`;
    }
    
    // For non-thumbnail views, scale the padding to match font scaling
    const scaledPadding = basePadding * fontScaleFactor;
    return `${scaledPadding}px`;
  }, [textPadding, isThumbnail, fontScaleFactor]);

  // Text wrapper styles - keep stable across edit/non-edit states to prevent size jumps
  const textWrapperStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    padding: getTextPadding,  // Apply padding HERE on wrapper
    boxSizing: 'border-box',
    overflow: 'hidden', // Keep text within shape bounds
    pointerEvents: isCurrentlyTextEditing ? 'auto' : (hasText ? 'auto' : 'none'),
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
    whiteSpace: 'normal',
    '--tiptap-font-size': getFontSize,
    '--tiptap-font-family': getFontFamilyWithFallback(fontFamily || 'Arial'),
    '--tiptap-font-weight': fontWeight,
    '--tiptap-line-height': lineHeight || 1.3,  // Changed default from 1.5 to 1.3 for tighter spacing
    '--tiptap-letter-spacing': getLetterSpacing,
    '--tiptap-text-color': textColor,
    // Removed hover visual feedback that was causing layout shifts
  } as React.CSSProperties;

  return (
    <div 
      ref={containerRef} 
      style={containerStyles}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      data-component-id={component.id}
      data-component-type="Shape"
    >
      <svg 
        width="100%" 
        height="100%" 
        viewBox={viewBox} 
        preserveAspectRatio={preserveAspectRatio}
        style={{ 
          display: 'block',
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 0,
          overflow: 'visible',  // CRITICAL: Allows shadows to extend beyond bounds
          pointerEvents: 'none'  // Prevent SVG from blocking text interactions
        }}
      >
        {(hasGradient || shadow) && (
          <defs>
            {renderSVGGradients()}
            {renderSVGShadowFilter()}
          </defs>
        )}
        {svgShapeElement}
      </svg>
      
      {hasText && (
        <div
          ref={textContainerRef}
          style={textWrapperStyle}
          className="tiptap-editor-wrapper"
          onMouseEnter={handleTextMouseEnter}
          onMouseLeave={handleTextMouseLeave}
          onDoubleClick={handleDoubleClick}
        >
          <EditorContent editor={editor} className="tiptap-editor-content h-full w-full" />
        </div>
      )}
    </div>
  );
};

// Register the renderer
const ShapeWithTextRendererWrapper: RendererFunction = (props) => {
  return <ShapeWithTextRenderer {...props} />;
};

registerRenderer('Shape', ShapeWithTextRendererWrapper);
// Alias: support components typed as 'ShapeWithText'
registerRenderer('ShapeWithText', ShapeWithTextRendererWrapper);