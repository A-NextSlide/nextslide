import React, { useState, useEffect, useRef } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { DeckOutline, SlideOutline, TaggedMedia } from '@/types/SlideTypes';
import { Info, Plus, Microscope, Trash2, Loader2, Upload, ImageIcon, BarChart3, FileText, FileIcon, X } from 'lucide-react';
import SlideCard from './SlideCard'; // <-- Import the new SlideCard component
import ManualSlideCard from './ManualSlideCard'; // Import the manual mode slide card
import TypewriterText from '@/components/common/TypewriterText';
import CardCarousel from './CardCarousel';
import OutlineChatBox from './OutlineChatBox';
import CenteredProcessingLoader from '@/components/common/CenteredProcessingLoader';
import { v4 as uuidv4 } from 'uuid';
import MiniGameWidget from '@/components/common/MiniGameWidget';
import ThinkingProcess from './ThinkingProcess';
import { outlineApi } from '@/services/outlineApi';
import { useThemeStore } from '@/stores/themeStore';
import EnhancedColorPicker from '@/components/EnhancedColorPicker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import GroupedDropdown from '@/components/settings/GroupedDropdown';
import { ALL_FONT_NAMES, FONT_CATEGORIES } from '@/registry/library/fonts';
import { FontLoadingService } from '@/services/FontLoadingService';
import { X as XIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { uploadFile } from '@/utils/fileUploadUtils';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem
} from '@/components/ui/context-menu';
import type { Theme } from '@/types/themes';
import { initialWorkspaceTheme } from '@/types/themes';

// Helper function to determine file type (can be moved to utils if used elsewhere)
const determineFileTypeLocal = (file: File): 'image' | 'chart' | 'data' | 'pdf' | 'other' => {
  const mimeType = file.type.toLowerCase();
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (
    mimeType === 'text/csv' ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.apple.numbers' ||
    mimeType === 'application/vnd.oasis.opendocument.spreadsheet' ||
    extension === 'csv' || extension === 'xls' || extension === 'xlsx' ||
    extension === 'numbers' || extension === 'ods'
  ) return 'data';
  return 'other';
};


interface OutlineDisplayViewProps {
  currentOutline: DeckOutline;
  setCurrentOutline: React.Dispatch<React.SetStateAction<DeckOutline | null>>;
  isAiNotesExpanded: boolean;
  setIsAiNotesExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  handleAddSlide: () => void;
  handleSlideTitleChange: (slideId: string, title: string) => void;
  handleSlideContentChange: (slideId: string, content: string) => void;
  handleSlideReorder?: (sourceIndex: number, destinationIndex: number) => void;
  researchingSlides: string[];
  dragOverSlideId: string | null;
  setDragOverSlideId: React.Dispatch<React.SetStateAction<string | null>>;
  tooltipHostSlideId: string | null;
  setTooltipHostSlideId: React.Dispatch<React.SetStateAction<string | null>>;
  currentTooltipAlign: 'left' | 'right';
  setCurrentTooltipAlign: React.Dispatch<React.SetStateAction<'left' | 'right'>>;
  outlineScrollRef: React.RefObject<HTMLDivElement>;
  isProcessingMedia: boolean;
  animatingOutMediaIds: Set<string>;
  setAnimatingOutMediaIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  uploadedFiles: File[]; // Needed for the "Drag files here" hint
  isResearching?: boolean; // Add flag for research phase
  researchEvents?: any[]; // Research events for thinking display
  setUploadedFiles: React.Dispatch<React.SetStateAction<File[]>>; // For file drop
  handleDragStart: (slideId: string) => void;
  handleDragOver: (e: React.DragEvent, slideId: string) => void;
  handleDrop: (e: React.DragEvent, targetSlideId: string) => void;
  handleDragEnd: () => void;
  handleFilesDroppedOnSlide: (files: File[], targetSlideId: string) => Promise<void>;
  toast: (options: any) => void;
  handleToggleDeepResearch: (slideId: string, event?: React.MouseEvent) => void;
  handleDeleteSlide: (slideId: string) => void;
  completedSlides?: Set<number>; // Changed from Set<string> to Set<number>
  isGeneratingOutline?: boolean; // New prop to track if outline is being generated
  isAnalyzingFiles?: boolean; // New prop for file analysis state
  currentAnalyzingFile?: string; // Current file being analyzed
  analyzingFileProgress?: { current: number; total: number }; // File analysis progress
  loadingStage?: string; // Loading stage message
  editingSlides?: string[]; // Slides being edited via chat
  editTarget?: number | 'all'; // Target for editing
}

const OutlineDisplayView: React.FC<OutlineDisplayViewProps> = ({
  currentOutline,
  setCurrentOutline,
  isAiNotesExpanded,
  setIsAiNotesExpanded,
  handleAddSlide,
  handleSlideTitleChange,
  handleSlideContentChange,
  handleSlideReorder,
  researchingSlides,
  dragOverSlideId,
  setDragOverSlideId,
  tooltipHostSlideId,
  setTooltipHostSlideId,
  currentTooltipAlign,
  setCurrentTooltipAlign,
  outlineScrollRef,
  isProcessingMedia,
  animatingOutMediaIds,
  setAnimatingOutMediaIds,
  uploadedFiles,
  setUploadedFiles, // Added for onDrop on slide item
  handleDragStart,
  handleDragOver,
  handleDrop,
  handleDragEnd,
  handleFilesDroppedOnSlide, // Added for onDrop on slide item
  toast,
  handleToggleDeepResearch,
  handleDeleteSlide,
  completedSlides,
  isGeneratingOutline,
  isAnalyzingFiles,
  currentAnalyzingFile,
  analyzingFileProgress,
  loadingStage,
  editingSlides = [],
  editTarget,
  isResearching,
  researchEvents = [],
}) => {
  // Debug state to window for inspection (no console logging to avoid infinite loops)
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__DEBUG_OUTLINE_STATE__ = {
        researchEventsLength: researchEvents.length,
        isGeneratingOutline,
        isResearching,
        slideCount: currentOutline?.slides?.length || 0,
        hasOutline: !!currentOutline,
        outlineTitle: currentOutline?.title,
        shouldShowThinking: (isGeneratingOutline || researchEvents.length > 0)
      };
    }
  }, [currentOutline?.slides?.length, researchEvents.length, isGeneratingOutline, isResearching]);
  
  // RENDER DEBUG - log every render  
  // console.log('🔄 [OutlineDisplayView] RENDERING with events:', researchEvents.length, 'generating:', isGeneratingOutline);
  const [showTypewriter, setShowTypewriter] = useState(false); // Start false, will be set true when outline loads
  const [showSubtext, setShowSubtext] = useState(false);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [slidesToShow, setSlidesToShow] = useState<SlideOutline[]>([]);
  const [isEditingOutline, setIsEditingOutline] = useState(false);
  const [currentEditingSlides, setCurrentEditingSlides] = useState<string[]>([]);
  const [currentEditTarget, setCurrentEditTarget] = useState<number | 'all' | undefined>();
  const slidesAreaRef = useRef<HTMLDivElement | null>(null);
  const [widgetTop, setWidgetTop] = useState<number>(16);
  const [widgetLeft, setWidgetLeft] = useState<number>(16);
  const [showMiniGame, setShowMiniGame] = useState<boolean>(false);
  const [activePanelTab, setActivePanelTab] = useState<'thinking' | 'flow' | 'theme'>(() => {
    const hasSlides = (currentOutline?.slides?.length || 0) > 0;
    const hasEvents = (researchEvents?.length || 0) > 0;
    return !hasSlides && hasEvents ? 'thinking' : 'flow';
  });
  const [isThemeLoading, setIsThemeLoading] = useState<boolean>(false);
  const [themeError, setThemeError] = useState<string | null>(null);
  const setWorkspaceTheme = useThemeStore(state => state.setWorkspaceTheme);
  const addCustomTheme = useThemeStore(state => state.addCustomTheme);
  const setOutlineTheme = useThemeStore(state => state.setOutlineTheme);
  const getOutlineTheme = useThemeStore(state => state.getOutlineTheme);
  const setOutlineDeckTheme = useThemeStore(state => state.setOutlineDeckTheme);
  const setThemeReady = useThemeStore(state => state.setThemeReady);
  const hasOutlineThemeRequested = useThemeStore(state => state.hasOutlineThemeRequested);
  const markOutlineThemeRequested = useThemeStore(state => state.markOutlineThemeRequested);
  const outlineDeckTheme = useThemeStore(state => state.getOutlineDeckTheme?.(currentOutline.id));
  const [activeEditor, setActiveEditor] = useState<{ type: 'heading' | 'body' | 'color', index?: number } | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState<boolean>(false);
  const workspaceTheme = useThemeStore(state => state.getWorkspaceTheme());
  const isThemeReadyGlobal = useThemeStore(state => state.isThemeReady);
  const [fontSearchHeading, setFontSearchHeading] = useState('');
  const [fontSearchBody, setFontSearchBody] = useState('');
  const themePanelRef = useRef<HTMLDivElement | null>(null);
  const fontEditorRef = useRef<HTMLDivElement | null>(null);
  const colorEditorRef = useRef<HTMLDivElement | null>(null);
  const [fontEditor, setFontEditor] = useState<{ open: boolean; type: 'heading' | 'body'; x: number; y: number } | null>(null);
  const [colorEditor, setColorEditor] = useState<{ open: boolean; swatchIndex: number; x: number; y: number } | null>(null);
  const [draggedExtraIndex, setDraggedExtraIndex] = useState<number | null>(null);
  const fontGroups = React.useMemo<Record<string, string[]>>(() => {
    try {
      return Object.fromEntries(Object.entries(FONT_CATEGORIES).map(([k, arr]) => [k, arr.map(f => f.name)]));
    } catch {
      return {} as Record<string, string[]>;
    }
  }, []);

  // Parallel theme load when outline appears (only once per outline ID)
  useEffect(() => {
    if (!currentOutline) return;
    let cancelled = false;

    // Prevent duplicate calls during quick remounts by using a store/session flag per outline
    try {
      if (hasOutlineThemeRequested?.(currentOutline.id)) {
        return;
      }
      markOutlineThemeRequested?.(currentOutline.id);
    } catch {}

    try {
      const key = `__theme_requested_${currentOutline.id}`;
      if ((window as any)[key]) {
        // Already requested in this session; rely on cached theme or store
        return;
      }
      (window as any)[key] = true;
    } catch {}

    (async () => {
      try {
        try {
          const state = useThemeStore.getState();
          const previousTheme = state.getOutlineTheme?.(currentOutline.id);
          if (previousTheme?.id) {
            try { state.removeCustomTheme(previousTheme.id); } catch {}
          }
          state.setWorkspaceTheme(initialWorkspaceTheme.id);
          state.setOutlineDeckTheme?.(currentOutline.id, null);
          state.setOutlineTheme(currentOutline.id, { ...initialWorkspaceTheme, id: initialWorkspaceTheme.id, isCustom: false } as any);
        } catch {}
        setThemeError(null);
        // We don't apply a placeholder theme. Block theme application until backend finishes.
        setThemeReady(false);
        // If we already have a cached per-outline theme, show it immediately and skip network
        // Do NOT reuse cached deck theme; wait for real brand in outline_complete

        // Skip generating a new theme here; await 'outline_complete' to apply real brand palette
        setIsThemeLoading(true);
        const onThemePreview = (e: CustomEvent) => {
          try {
            const d: any = (e as any).detail || {};
            const isThemeArtifact = d?.type === 'artifact' && String(d?.kind).toLowerCase() === 'theme_json';
            const isThemeGenerated = d?.type === 'theme_generated' || (!!d?.theme && (d?.palette || d?.theme?.color_palette));
            if (!isThemeArtifact && !isThemeGenerated) return;
            const themePayload = isThemeArtifact ? (d?.content?.deck_theme || d?.content?.theme || d?.content) : (d?.theme || d);
            try {
              console.groupCollapsed('[ThemePreview] incoming event');
              console.debug({ isThemeArtifact, isThemeGenerated, rawPalette: (d as any)?.palette, themePaletteBefore: themePayload?.color_palette });
              console.groupEnd();
            } catch {}
            if (!themePayload) return;
            // Merge explicit palette payload (often richer) into themePayload.color_palette
            try {
              const payloadPalette = (d as any)?.palette || (isThemeArtifact ? (d as any)?.content?.palette : undefined);
              if (payloadPalette && typeof payloadPalette === 'object') {
                const cp = (themePayload.color_palette = (themePayload.color_palette || {}));
                // Merge backgrounds if provided
                if (Array.isArray(payloadPalette.backgrounds) && payloadPalette.backgrounds.length > 0) {
                  cp.backgrounds = Array.from(new Set([...(cp.backgrounds || []), ...payloadPalette.backgrounds])).slice(0, 6);
                }
                // Merge colors if provided
                if (Array.isArray(payloadPalette.colors) && payloadPalette.colors.length > 0) {
                  const merged = Array.from(new Set([...(cp.colors || []), ...payloadPalette.colors].map((c: string) => String(c).toUpperCase())));
                  cp.colors = merged.slice(0, 12);
                }
                // Merge text colors if present
                if (payloadPalette.text_colors && typeof payloadPalette.text_colors === 'object') {
                  cp.text_colors = { ...(cp.text_colors || {}), ...payloadPalette.text_colors };
                }
              }
              try {
                const afterCP = (themePayload?.color_palette || {}) as any;
                const afterColors = Array.isArray(afterCP.colors) ? afterCP.colors : [];
                console.groupCollapsed('[ThemePreview] after merge');
                console.debug({ themePaletteAfter: afterCP, colorsCount: afterColors.length });
                console.groupEnd();
              } catch {}
            } catch {}
            // Decide whether to override existing deck theme: prefer richer or brand-sourced palettes
            try {
              const existingTheme = useThemeStore.getState().getOutlineDeckTheme?.(currentOutline.id) || {} as any;
              const existingCP = (existingTheme?.color_palette || {}) as any;
              const existingColors: string[] = Array.isArray(existingCP.colors) ? (existingCP.colors as any[]).filter((x: any) => typeof x === 'string') : [];
              const newColors: string[] = Array.isArray((themePayload?.color_palette || {}).colors)
                ? ((themePayload.color_palette.colors as any[]).filter((x: any) => typeof x === 'string'))
                : [];
              const nn = (arr: string[]) => arr.filter(c => !isNeutralHex(c)).length;
              const existingRich = nn(existingColors);
              const newRich = nn(newColors);
              const existingSource = String((existingCP?.source || '')).toLowerCase();
              const newSource = String(((themePayload?.color_palette || {}) as any)?.source || '').toLowerCase();

              const existingIsBrand = existingSource.includes('brand');
              const newIsBrand = newSource.includes('brand');

              // Override rules:
              // - Always allow brand → brand updates
              // - Prefer brand-sourced over non-brand
              // - Prefer richer (more non-neutral) palettes
              // - If richness ties, prefer larger colors length
              let shouldOverride = false;
              if (!existingTheme || !existingCP || (!existingColors && newColors)) {
                shouldOverride = true;
              } else if (newIsBrand && !existingIsBrand) {
                shouldOverride = true;
              } else if (!newIsBrand && existingIsBrand) {
                shouldOverride = false;
              } else if (newRich > existingRich) {
                shouldOverride = true;
              } else if (newRich === existingRich && newColors.length > existingColors.length) {
                shouldOverride = true;
              }
              try {
                console.groupCollapsed('[ThemePreview] override decision');
                console.debug({ existingSource, newSource, existingColors, newColors, existingRich, newRich, shouldOverride });
                console.groupEnd();
              } catch {}

              if (shouldOverride) {
                setOutlineDeckTheme(currentOutline.id, themePayload);
              }
            } catch {}
            const colors = (themePayload?.color_palette || {}) as any;
            const typography = (themePayload?.typography || {}) as any;
            const pageBg = colors.primary_background || colors.backgrounds?.[0] || '#ffffff';
            const headingFamily = typography.hero_title?.family || 'Inter';
            const bodyFamily = typography.body_text?.family || 'Inter';
            const textColor = colors.primary_text || '#1f2937';
            const accent1 = colors.accent_1 || (colors.colors?.[0] || '#FF4301');
            const accent2 = colors.accent_2 || (colors.colors?.[1] || accent1);
            // Determine richness of palette to avoid locking in minimal (2-color) previews
            const isNeutralHex = (hex?: string) => {
              if (!hex || typeof hex !== 'string') return false;
              const h = hex.trim().replace('#','');
              if (h.length !== 6) return false;
              const r = parseInt(h.slice(0,2), 16), g = parseInt(h.slice(2,4), 16), b = parseInt(h.slice(4,6), 16);
              const sum = r + g + b;
              if (sum >= 720) return true; // near-white
              if (sum <= 60) return true;  // near-black
              const maxc = Math.max(r,g,b), minc = Math.min(r,g,b);
              return (maxc - minc) <= 8;   // grey
            };
            const cpColors: string[] = Array.isArray(colors.colors) ? (colors.colors as any[]).filter((x: any) => typeof x === 'string') : [];
            const allCandidates = [accent1, accent2, ...cpColors];
            const uniqueUpper = Array.from(new Set(allCandidates.filter(Boolean).map(c => String(c).toUpperCase())));
            const nonNeutralCount = uniqueUpper.filter(c => !isNeutralHex(c)).length;
            const isRich = nonNeutralCount >= 3;
            const builtTheme = {
              name: themePayload?.theme_name || 'AI Theme',
              page: { backgroundColor: pageBg },
              typography: {
                paragraph: { fontFamily: bodyFamily, color: textColor },
                heading: { fontFamily: headingFamily, color: textColor }
              },
              accent1,
              accent2
            } as any;
            // Apply to workspace only, without persisting per-outline custom theme locally
            try { useThemeStore.getState().setOutlineDeckTheme?.(currentOutline.id, themePayload); } catch {}
            const themeId = addCustomTheme(builtTheme);
            setWorkspaceTheme(themeId);
            if (isRich || isThemeGenerated) {
              setThemeReady(true);
            }
          } finally {
            setIsThemeLoading(false);
            // Keep listening until we receive a rich palette or a theme_generated event
          }
        };
        window.addEventListener('theme_preview_update', onThemePreview as any);
        return;
      } catch (e: any) {
        if (!cancelled) setThemeError(e?.message || 'Failed to load theme');
      } finally {
        if (!cancelled) {
          setIsThemeLoading(false);
          // Do not mark theme ready until a real theme_preview_update arrives
        }
      }
    })();
    return () => { cancelled = true; };
  }, [currentOutline?.id, currentOutline?.slides?.length]);

  useEffect(() => {
    try {
      const deckTheme = outlineDeckTheme || {} as any;
      const md = (deckTheme?.metadata || {}) as any;
      const cp = (deckTheme?.color_palette || {}) as any;
      const cpmd = (cp?.metadata || {}) as any;
      const brandInfo = (deckTheme?.brandInfo || {}) as any;
      const logoInfo = (deckTheme?.logo_info || {}) as any;
      const themeLogo = (deckTheme?.logo || {}) as any;
      let candidate =
        themeLogo.url ||
        logoInfo.url ||
        brandInfo.logoUrl || brandInfo.logo_url ||
        md.logo_url_light || md.logo_url || md.logo_url_dark ||
        cpmd.logo_url_light || cpmd.logo_url || cpmd.logo_url_dark ||
        null;
      if (!candidate) {
        // Fallback to outline stylePreferences
        const sp = (currentOutline as any)?.stylePreferences;
        if (sp && (sp as any).logoUrl) candidate = (sp as any).logoUrl;
      }
      try {
        console.groupCollapsed('[ThemeTab] resolved logo candidate');
        console.debug({
          candidate,
          sources: {
            theme_logo: themeLogo?.url,
            logo_info: logoInfo?.url,
            brandInfo: brandInfo?.logoUrl || brandInfo?.logo_url,
            metadata_logo: md?.logo_url || md?.logo_url_light || md?.logo_url_dark,
            color_palette_metadata_logo: cpmd?.logo_url || cpmd?.logo_url_light || cpmd?.logo_url_dark,
            outline_style_pref_logo: (currentOutline as any)?.stylePreferences?.logoUrl
          }
        });
      } finally {
        console.groupEnd();
      }
      setLogoUrl(candidate || null);
    } catch {}
  }, [currentOutline?.id, outlineDeckTheme, (currentOutline as any)?.stylePreferences?.logoUrl]);

  const handleClickReplaceLogo = () => {
    try { logoFileInputRef.current?.click(); } catch {}
  };

  const handleLogoFileSelected: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    try {
      const file = e.target.files?.[0];
      // Reset the input so selecting the same file again will re-trigger
      e.currentTarget.value = '';
      if (!file) return;
      setIsUploadingLogo(true);
      const url = await uploadFile(file);
      setLogoUrl(url);
      // Persist to outline stylePreferences so it is sent to backend on next actions
      setCurrentOutline(prev => {
        if (!prev) return prev;
        const prevSP = (prev as any).stylePreferences || {};
        const next = {
          ...prev,
          stylePreferences: {
            ...prevSP,
            logoUrl: url
          }
        } as DeckOutline;
        return next;
      });
    } catch (err) {
      // Silently ignore for now; parent toast system may be used elsewhere
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleRemoveLogo = () => {
    setLogoUrl(null);
    setCurrentOutline(prev => {
      if (!prev) return prev;
      const prevSP = (prev as any).stylePreferences || {};
      const { logoUrl: _removed, ...restSP } = prevSP;
      return {
        ...prev,
        stylePreferences: restSP
      } as DeckOutline;
    });
  };

  const swatches = React.useMemo(() => {
    try {
      const deckTheme = outlineDeckTheme || {} as any;
      const cp = (deckTheme.color_palette || null) as any;
      // Do not show a placeholder palette: require a real color_palette
      if (!cp || typeof cp !== 'object') return [] as Array<{ role: 'background' | 'accent1' | 'accent2' | 'extra'; label: string; color: string; realIndex?: number; extraIndex?: number }>;

      const primaryBackground = (cp.primary_background || (Array.isArray(cp.backgrounds) ? cp.backgrounds[0] : undefined)) as string | undefined;
      const primaryText = (cp.primary_text as string | undefined);
      const accent_1 = (cp.accent_1 || (Array.isArray(cp.colors) ? cp.colors[0] : undefined)) as string | undefined;
      const accent_2 = (cp.accent_2 || (Array.isArray(cp.colors) ? (cp.colors[1] || cp.colors[0]) : undefined)) as string | undefined;

      const primaries: Array<{ role: 'background' | 'accent1' | 'accent2'; label: string; color: string }> = [];
      if (primaryBackground) primaries.push({ role: 'background', label: 'Background', color: String(primaryBackground) });
      if (accent_1) primaries.push({ role: 'accent1', label: 'Accent 1', color: String(accent_1) });
      if (accent_2) primaries.push({ role: 'accent2', label: 'Accent 2', color: String(accent_2) });

      const primarySet = new Set(primaries.map(p => String(p.color || '').toLowerCase()));
      const extrasSrc: string[] = Array.isArray(cp.colors) ? cp.colors.map(String) : [];
      const extras: Array<{ role: 'extra'; label: 'Extra'; color: string; realIndex: number; extraIndex: number }>= [];
      const seen = new Set<string>();
      let extraIdx = 0;
      for (let i = 0; i < extrasSrc.length && extras.length < 12; i++) {
        const hex = String(extrasSrc[i] || '').toLowerCase();
        if (!hex) continue;
        if (primarySet.has(hex)) continue;
        if (seen.has(hex)) continue;
        seen.add(hex);
        extras.push({ role: 'extra', label: 'Extra', color: extrasSrc[i], realIndex: i, extraIndex: extraIdx++ });
      }
      return [...primaries, ...extras];
    } catch {
      // No palette if anything fails
      return [] as any;
    }
  }, [currentOutline?.id, outlineDeckTheme]);

  const updateSwatchColor = (swatchIndex: number, hex: string) => {
    const sw = swatches[swatchIndex] as any;
    if (!sw) return;
    if (sw.role === 'background') {
      applyThemeUpdate((t) => ({ ...t, page: { backgroundColor: hex }, typography: { ...t.typography } }));
      // Keep outline deck theme palette in sync so swatches update live
      try {
        const deckTheme = useThemeStore.getState().getOutlineDeckTheme?.(currentOutline.id) || ({} as any);
        const cp = { ...(deckTheme.color_palette || {}) } as any;
        cp.primary_background = hex;
        useThemeStore.getState().setOutlineDeckTheme(currentOutline.id, { ...deckTheme, color_palette: cp });
      } catch {}
      return;
    }
    if (sw.role === 'accent1') {
      applyThemeUpdate((t) => ({ ...t, accent1: hex }));
      // Keep outline deck theme palette in sync so swatches update live
      try {
        const deckTheme = useThemeStore.getState().getOutlineDeckTheme?.(currentOutline.id) || ({} as any);
        const cp = { ...(deckTheme.color_palette || {}) } as any;
        cp.accent_1 = hex;
        useThemeStore.getState().setOutlineDeckTheme(currentOutline.id, { ...deckTheme, color_palette: cp });
      } catch {}
      return;
    }
    if (sw.role === 'accent2') {
      applyThemeUpdate((t) => ({ ...t, accent2: hex }));
      // Keep outline deck theme palette in sync so swatches update live
      try {
        const deckTheme = useThemeStore.getState().getOutlineDeckTheme?.(currentOutline.id) || ({} as any);
        const cp = { ...(deckTheme.color_palette || {}) } as any;
        cp.accent_2 = hex;
        useThemeStore.getState().setOutlineDeckTheme(currentOutline.id, { ...deckTheme, color_palette: cp });
      } catch {}
      return;
    }
    if (sw.role === 'extra') {
      try {
        const deckTheme = useThemeStore.getState().getOutlineDeckTheme?.(currentOutline.id) || {} as any;
        const cp = { ...(deckTheme.color_palette || {}) };
        const colors = Array.isArray(cp.colors) ? [...cp.colors] : [];
        const real = sw.realIndex as number;
        if (real >= 0 && real < colors.length) colors[real] = hex;
        useThemeStore.getState().setOutlineDeckTheme(currentOutline.id, { ...deckTheme, color_palette: { ...cp, colors } });
      } catch {}
    }
  };

  const reorderExtras = (fromExtraIndex: number, toExtraIndex: number) => {
    try {
      const deckTheme = useThemeStore.getState().getOutlineDeckTheme?.(currentOutline.id) || {} as any;
      const cp = { ...(deckTheme.color_palette || {}) };
      const colors = Array.isArray(cp.colors) ? [...cp.colors] : [];
      // Build displayed extras (filtered + unique, max 6)
      const background = String(workspaceTheme?.page?.backgroundColor || '').toLowerCase();
      const accent1 = String(workspaceTheme?.accent1 || '').toLowerCase();
      const accent2 = String(workspaceTheme?.accent2 || workspaceTheme?.accent1 || '').toLowerCase();
      const primarySet = new Set([background, accent1, accent2].filter(Boolean));
      const uniqueExtras: string[] = [];
      const isUnique = (c: string) => {
        const lc = c.toLowerCase();
        if (primarySet.has(lc)) return false;
        if (uniqueExtras.some(u => u.toLowerCase() === lc)) return false;
        return true;
      };
      for (const c of colors) {
        if (uniqueExtras.length >= 6) break;
        if (typeof c === 'string' && c && isUnique(c)) uniqueExtras.push(c);
      }
      if (fromExtraIndex < 0 || toExtraIndex < 0 || fromExtraIndex >= uniqueExtras.length || toExtraIndex >= uniqueExtras.length) return;
      const moved = uniqueExtras.splice(fromExtraIndex, 1)[0];
      uniqueExtras.splice(toExtraIndex, 0, moved);
      // Rebuild cp.colors prioritizing the reordered displayed extras, then append the remaining others
      const remaining = colors.filter(c => !uniqueExtras.some(u => u.toLowerCase() === String(c).toLowerCase()));
      const nextColors = [...uniqueExtras, ...remaining];
      useThemeStore.getState().setOutlineDeckTheme(currentOutline.id, { ...deckTheme, color_palette: { ...cp, colors: nextColors } });
    } catch {}
  };

  const openFontPanelAt = (e: React.MouseEvent, type: 'heading' | 'body') => {
    try {
      const rect = themePanelRef.current?.getBoundingClientRect();
      const x = (e as any).clientX - (rect?.left || 0);
      const y = (e as any).clientY - (rect?.top || 0);
      setFontEditor({ open: true, type, x, y });
    } catch {
      setFontEditor({ open: true, type, x: 40, y: 40 });
    }
  };

  const openColorPanelAt = (e: React.MouseEvent, swatchIndex: number) => {
    try {
      const rect = themePanelRef.current?.getBoundingClientRect();
      const x = (e as any).clientX - (rect?.left || 0);
      const y = (e as any).clientY - (rect?.top || 0);
      setColorEditor({ open: true, swatchIndex, x, y });
    } catch {
      setColorEditor({ open: true, swatchIndex, x: 40, y: 40 });
    }
  };

  // Dismiss floating editors when clicking outside or pressing Escape
  useEffect(() => {
    const handleDocMouseDown = (ev: MouseEvent) => {
      try {
        const target = ev.target as Node;
        if (fontEditor?.open) {
          const inside = fontEditorRef.current && fontEditorRef.current.contains(target);
          if (!inside) setFontEditor(null);
        }
        if (colorEditor?.open) {
          const inside = colorEditorRef.current && colorEditorRef.current.contains(target);
          if (!inside) setColorEditor(null);
        }
      } catch {}
    };
    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        if (fontEditor?.open) setFontEditor(null);
        if (colorEditor?.open) setColorEditor(null);
      }
    };
    if (fontEditor?.open || colorEditor?.open) {
      document.addEventListener('mousedown', handleDocMouseDown, true);
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleDocMouseDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [fontEditor?.open, colorEditor?.open]);

  const applyThemeUpdate = (updater: (theme: Theme) => Theme) => {
    const theme = useThemeStore.getState().getWorkspaceTheme();
    const updated = updater(theme);
    const id = addCustomTheme(updated);
    setWorkspaceTheme(id);
    setOutlineTheme(currentOutline.id, { ...updated, id, isCustom: true });
  };

  // Respond to navigation events from the Flow panel
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const idx = e.detail?.slideIndex;
      if (typeof idx === 'number' && idx >= 0 && idx < (currentOutline?.slides?.length || 0)) {
        setCurrentSlideIndex(idx);
        try {
          window.dispatchEvent(new CustomEvent('navigate-to-slide', { detail: { slideIndex: idx } }));
        } catch {}
      }
    };
    window.addEventListener('navigate-to-slide-from-flow', handler as EventListener);
    return () => window.removeEventListener('navigate-to-slide-from-flow', handler as EventListener);
  }, [currentOutline?.slides?.length]);

  useEffect(() => {
    const hasSlides = (currentOutline?.slides?.length || 0) > 0;
    if (hasSlides && activePanelTab !== 'flow') {
      setActivePanelTab('flow');
    } else if (!hasSlides && (researchEvents?.length || 0) > 0 && activePanelTab !== 'thinking') {
      setActivePanelTab('thinking');
    }
  }, [currentOutline?.slides?.length, researchEvents?.length]);

  // Add debug logging
  useEffect(() => {
    const shouldShowFileProcessing = isAnalyzingFiles || 
      (isGeneratingOutline && uploadedFiles.length > 0 && loadingStage) ||
      (currentOutline.title === 'Processing your files...' && isGeneratingOutline);
      
  }, [isAnalyzingFiles, uploadedFiles.length, currentOutline.slides.length, currentAnalyzingFile, analyzingFileProgress, isGeneratingOutline, loadingStage, currentOutline.title]);

  // Track newly added slides for animation
  const [newSlideIds, setNewSlideIds] = useState<Set<string>>(new Set());
  const [animatedSlides, setAnimatedSlides] = React.useState<Set<string>>(new Set());
  
  // useRef must be at the top level of the component
  const previousSlideCount = React.useRef<number>(currentOutline?.slides.length || 0);
  const previousSlidesWithContent = React.useRef<Set<string>>(new Set()); // Track slides that had content
  const isUserAtBottom = React.useRef<boolean>(true); // Track if user is at bottom of scroll
  
  // Track the initial slide count when generation starts
  const initialGeneratingSlideCount = React.useRef<number>(0);
  
  // Update initial slide count when outline generation starts/stops
  React.useEffect(() => {
    if (isGeneratingOutline && initialGeneratingSlideCount.current === 0 && currentOutline) {
      // Remember how many slides exist when generation starts
      initialGeneratingSlideCount.current = currentOutline.slides.length;
    } else if (!isGeneratingOutline) {
      // Reset when generation is done
      initialGeneratingSlideCount.current = 0;
    }
  }, [isGeneratingOutline]);

  // Track outline ID to detect when we get a new outline
  const previousOutlineIdRef = React.useRef<string | null>(null);

  // Show typewriter when we first get an outline or when outline changes
  useEffect(() => {
    if (currentOutline) {
      const isNewOutline = !previousOutlineIdRef.current || previousOutlineIdRef.current !== currentOutline.id;
      
      if (isNewOutline) {
        // This is a new outline, show typewriter
        setShowTypewriter(true);
        previousOutlineIdRef.current = currentOutline.id;
      }
    }
  }, [currentOutline?.id]); // Only depend on outline ID to avoid loops

  // Show typewriter when component mounts
  useEffect(() => {
    setShowTypewriter(true);
  }, []);

  // Track scroll position to determine if user is at bottom
  React.useEffect(() => {
    const handleScroll = () => {
      if (outlineScrollRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = outlineScrollRef.current;
        const threshold = 50; // pixels from bottom to consider "at bottom"
        const isAtBottom = scrollHeight - scrollTop - clientHeight < threshold;
        isUserAtBottom.current = isAtBottom;
      }
    };

    const scrollElement = outlineScrollRef.current;
    if (scrollElement) {
      scrollElement.addEventListener('scroll', handleScroll);
      // Check initial position
      handleScroll();
    }

    return () => {
      if (scrollElement) {
        scrollElement.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  // When slides are completed progressively, mark them for animation
  React.useEffect(() => {
    const newlyCompleted = new Set<string>();
    
    // Find slides that now have content but didn't before
    currentOutline.slides.forEach((slide, index) => {
      const hasContent = slide.content && slide.content.trim() !== '';
      if (hasContent && !previousSlidesWithContent.current.has(slide.id) && !animatedSlides.has(slide.id)) {
        newlyCompleted.add(slide.id);
      }
    });
    
    if (newlyCompleted.size > 0) {
      setNewSlideIds(newlyCompleted);
      
      // Add to animated slides to prevent re-animation
      setAnimatedSlides(prev => {
        const next = new Set(prev);
        newlyCompleted.forEach(id => next.add(id));
        return next;
      });
      
      // Remove animation flag after animation completes
      const timeoutId = setTimeout(() => {
        setNewSlideIds(new Set());
      }, 600); // Match animation duration
      
      // Update previous slides with content
      previousSlidesWithContent.current = new Set(
        currentOutline.slides
          .filter(slide => slide.content && slide.content.trim() !== '')
          .map(slide => slide.id)
      );
      
      // Scroll to show the new slide
      if (outlineScrollRef.current && isGeneratingOutline) {
        setTimeout(() => {
          if (outlineScrollRef.current && isUserAtBottom.current) {
            const scrollContainer = outlineScrollRef.current;
            const scrollHeight = scrollContainer.scrollHeight;
            const clientHeight = scrollContainer.clientHeight;
            const maxScroll = scrollHeight - clientHeight;
            
            // Scroll to bottom to show new content
            scrollContainer.scrollTo({
              top: maxScroll,
              behavior: 'smooth'
            });
          }
        }, 100);
      }
      
      return () => clearTimeout(timeoutId);
    }
  }, [currentOutline.slides, animatedSlides, isGeneratingOutline]);

  // When slides are added manually (not from streaming), mark them as new for animation
  React.useEffect(() => {
    if (currentOutline) {
      const currentCount = currentOutline.slides.length;
      
      // Only process if we have more slides than before (slide was added)
      if (currentCount > previousSlideCount.current) {
        // Get the last slide(s) that were added
        const newSlides = currentOutline.slides.slice(previousSlideCount.current);
        
        // For manually added slides (which won't have content initially)
        const manuallyAddedSlideIds = newSlides
          .filter(slide => !slide.content || slide.content.trim() === '')
          .map(slide => slide.id);
        
        if (manuallyAddedSlideIds.length > 0) {
          // Set only the new slides for animation
          setNewSlideIds(new Set(manuallyAddedSlideIds));
          
          // Remove the animation flag after animation completes
          const timeoutId = setTimeout(() => {
            setNewSlideIds(new Set());
          }, 600); // Match animation duration
          
          // Cleanup timeout on unmount or next update
          return () => clearTimeout(timeoutId);
        }
      }
      
      previousSlideCount.current = currentCount;
    }
  }, [currentOutline?.slides.length]);

  // Position mini-game widget aligned with top/right of slides area
  useEffect(() => {
    // Show mini-game only for file processing (can be long). Hide during normal streaming.
    let timer: any;
    const processing = currentOutline?.title === 'Processing your files...' || (!!isAnalyzingFiles && (uploadedFiles?.length || 0) > 0);
    if (processing) {
      timer = setTimeout(() => setShowMiniGame(true), 3000);
    } else {
      setShowMiniGame(false);
    }
    return () => timer && clearTimeout(timer);
  }, [isAnalyzingFiles, uploadedFiles?.length, currentOutline?.title]);

  useEffect(() => {
    const updateWidgetPosition = () => {
      const el = slidesAreaRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const fudgeTop = 16; // raise slightly to cover header/controls row
      setWidgetTop(Math.max(8, rect.top - fudgeTop));
      // Pin to right side of the outline cards with safe inset, never overlapping left panel
      const desiredLeft = rect.right + 24; // 24px gap from cards
      const maxLeft = window.innerWidth - 260; // keep inside viewport
      setWidgetLeft(Math.min(Math.max(desiredLeft, rect.right + 24), maxLeft));
    };
    // Initial position update with a small delay to ensure layout is ready
    updateWidgetPosition();
    setTimeout(updateWidgetPosition, 100);
    setTimeout(updateWidgetPosition, 500);
    
    window.addEventListener('resize', updateWidgetPosition);
    window.addEventListener('scroll', updateWidgetPosition, { passive: true } as any);
    const scrollEl = outlineScrollRef.current;
    if (scrollEl) scrollEl.addEventListener('scroll', updateWidgetPosition, { passive: true } as any);
    return () => {
      window.removeEventListener('resize', updateWidgetPosition);
      window.removeEventListener('scroll', updateWidgetPosition as any);
      if (scrollEl) scrollEl.removeEventListener('scroll', updateWidgetPosition as any);
    };
  }, [outlineScrollRef]);

  // Handle immediate research on single slide
  const handleImmediateResearch = async (slideId: string) => {
    if (!currentOutline) return;
    
    const slide = currentOutline.slides.find(s => s.id === slideId);
    if (!slide || !slide.content || slide.content.trim() === '') {
      toast({
        title: "Cannot enhance empty slide",
        description: "Please add content before enhancing.",
        variant: "destructive"
      });
      return;
    }
    
    // Call the parent's handleToggleDeepResearch which manages the researchingSlides state
    handleToggleDeepResearch(slideId);
  };

  // Handle outline chat messages
  const handleOutlineChatMessage = async (message: string, targetSlideIndex?: number | 'all') => {
    setIsEditingOutline(true);
    setCurrentEditTarget(targetSlideIndex);
    
    // Determine which slides are being edited
    if (targetSlideIndex === 'all') {
      setCurrentEditingSlides(currentOutline.slides.map(s => s.id));
    } else if (typeof targetSlideIndex === 'number' && currentOutline.slides[targetSlideIndex]) {
      setCurrentEditingSlides([currentOutline.slides[targetSlideIndex].id]);
    }
    
    try {
      // Prepare the request body with complete outline structure
      const requestBody = {
        message,
        outline: {
          id: currentOutline.id || uuidv4(),
          title: currentOutline.title || 'Untitled',
          topic: currentOutline.title || 'Untitled',
          tone: 'professional', // Add as required field
          narrative_arc: 'standard', // Add as required field
          slides: currentOutline.slides.map((slide, index) => ({
            id: slide.id || `slide-${index}`,
            title: slide.title || `Slide ${index + 1}`,
            content: slide.content || '',
            slide_type: 'content', // Add as required field
            narrative_role: 'supporting', // Add as required field
            speaker_notes: '', // Add as required field
            deepResearch: slide.deepResearch || false,
            taggedMedia: slide.taggedMedia || [],
            // Include extracted data so backend can access citations and other metadata
            extractedData: (slide as any).extractedData || undefined,
            extractedDataList: (slide as any).extractedDataList || undefined,
            // Promote citations to top-level for backend generators
            citations: ((slide as any).citations
              || (slide as any)?.extractedData?.metadata?.citations
              || (((slide as any).extractedDataList || []).flatMap((ed: any) => ed?.metadata?.citations || []))) || undefined,
            // Include backend-provided footnotes when present; otherwise derive from citations
            footnotes: (() => {
              const fns = (slide as any)?.footnotes;
              if (Array.isArray(fns) && fns.length > 0) return fns;
              const cits = ((slide as any).citations
                || (slide as any)?.extractedData?.metadata?.citations
                || (((slide as any).extractedDataList || []).flatMap((ed: any) => ed?.metadata?.citations || []))) || [];
              if (!Array.isArray(cits) || cits.length === 0) return undefined;
              // Build numbered list in order
              const out: Array<{ index: number; label: string; url?: string }> = [];
              cits.forEach((c, idx) => {
                const label = (c?.title || c?.source || (() => { try { return new URL(String(c?.url)).hostname; } catch { return String(c?.url || '') } })()) as string;
                out.push({ index: idx + 1, label, url: c?.url });
              });
              return out.length > 0 ? out : undefined;
            })()
          })),
          metadata: {
            depth: 'standard', // Add metadata fields
            generation_time: new Date().toISOString(),
            slide_count: currentOutline.slides.length
          }
        },
        target_slide_index: targetSlideIndex === 'all' ? null : targetSlideIndex
      };
      
      
      // Call the outline edit API
      const response = await fetch('/api/outline/edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        // If 404, provide a helpful message about the feature being in development
        if (response.status === 404) {
          // For now, show a preview of what would happen
          toast({
            title: "Feature in development",
            description: "Outline editing via chat is coming soon. For now, you can edit slides directly by clicking on them.",
            variant: "default",
          });
          setIsEditingOutline(false);
          return;
        }
        
        const errorData = await response.json().catch(() => null);
        // Parse error details properly
        let errorMessage = `Failed to edit outline: ${response.statusText}`;
        if (errorData?.detail) {
          if (Array.isArray(errorData.detail)) {
            // Handle validation errors from FastAPI
            errorMessage = errorData.detail.map((err: any) => 
              typeof err === 'object' ? err.msg || JSON.stringify(err) : err
            ).join(', ');
          } else {
            errorMessage = errorData.detail;
          }
        }
        throw new Error(errorMessage);
      }
      
      const result = await response.json();
      
      // Check if we have an updated outline in the response
      // Backend returns updatedOutline directly without success field
      if (result.updatedOutline || result.outline) {
        // Update the outline with the edited version
        const updatedOutline = result.updatedOutline || result.outline;
        
        // Format the response to have structured content with bold headers
        if (updatedOutline && updatedOutline.slides) {
          updatedOutline.slides = updatedOutline.slides.map((slide: SlideOutline) => {
            // If the slide content was updated, ensure it's properly formatted for TipTap
            if (slide.content) {
              let formattedContent = slide.content;
              
              // Convert markdown bold (**text** or __text__) to HTML bold tags
              formattedContent = formattedContent.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
              formattedContent = formattedContent.replace(/__([^_]+)__/g, '<strong>$1</strong>');
              
              // Convert markdown italic (*text* or _text_) to HTML italic tags - be careful not to match bold
              formattedContent = formattedContent.replace(/(?<!\*)\*(?!\*)([^*]+)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
              formattedContent = formattedContent.replace(/(?<!_)_(?!_)([^_]+)(?<!_)_(?!_)/g, '<em>$1</em>');
              
              // Convert to proper TipTap HTML structure if not already HTML
              if (!formattedContent.includes('<p>') && !formattedContent.includes('<ul>') && !formattedContent.includes('<ol>')) {
                const lines = formattedContent.split('\n').filter(line => line.trim());
                const htmlLines = [];
                let inList = false;
                let listType = '';
                
                for (const line of lines) {
                  const trimmedLine = line.trim();
                  
                  // Check for bullet points
                  if (/^[•\-\*]/.test(trimmedLine)) {
                    const content = trimmedLine.replace(/^[•\-\*]\s*/, '');
                    if (!inList || listType !== 'ul') {
                      if (inList) htmlLines.push(`</${listType}>`);
                      htmlLines.push('<ul>');
                      inList = true;
                      listType = 'ul';
                    }
                    htmlLines.push(`<li>${content}</li>`);
                  }
                  // Check for numbered lists
                  else if (/^\d+\./.test(trimmedLine)) {
                    const content = trimmedLine.replace(/^\d+\.\s*/, '');
                    if (!inList || listType !== 'ol') {
                      if (inList) htmlLines.push(`</${listType}>`);
                      htmlLines.push('<ol>');
                      inList = true;
                      listType = 'ol';
                    }
                    htmlLines.push(`<li>${content}</li>`);
                  }
                  // Regular paragraph
                  else {
                    if (inList) {
                      htmlLines.push(`</${listType}>`);
                      inList = false;
                      listType = '';
                    }
                    // Check if it's a header-like line (short, starts with capital)
                    if (trimmedLine.length < 50 && /^[A-Z]/.test(trimmedLine) && !trimmedLine.includes(':')) {
                      htmlLines.push(`<p><strong>${trimmedLine}</strong></p>`);
                    } else {
                      htmlLines.push(`<p>${trimmedLine}</p>`);
                    }
                  }
                }
                
                // Close any open list
                if (inList) {
                  htmlLines.push(`</${listType}>`);
                }
                
                formattedContent = htmlLines.join('');
              }
              
              slide.content = formattedContent;
            }
            return slide;
          });
        }
        
        // If narrative flow was updated, merge it in
        if (result.updatedNarrativeFlow) {
          updatedOutline.narrativeFlow = result.updatedNarrativeFlow;
        }
        
        setCurrentOutline(updatedOutline);
        
        toast({
          title: "Outline updated",
          description: targetSlideIndex === 'all' 
            ? "All slides have been updated" 
            : `Slide ${targetSlideIndex + 1} has been updated`,
        });
        
        // Show additional toast if narrative flow changed significantly
        if (result.changes?.narrative_impact && result.changes.narrative_impact !== 'none') {
          setTimeout(() => {
            toast({
              title: "Narrative flow updated",
              description: result.changes.flow_adjustments?.join(', ') || 'Story arc adjusted based on your changes',
            });
          }, 1000);
        }
      } else if (result.success && (result.outline || result.updatedOutline)) {
        // Also handle if backend includes success field
        const updatedOutline = result.updatedOutline || result.outline;
        
        // If narrative flow was updated, merge it in
        if (result.updatedNarrativeFlow) {
          updatedOutline.narrativeFlow = result.updatedNarrativeFlow;
        }
        
        setCurrentOutline(updatedOutline);
        
        toast({
          title: "Outline updated",
          description: targetSlideIndex === 'all' 
            ? "All slides have been updated" 
            : `Slide ${targetSlideIndex + 1} has been updated`,
        });
      } else {
        throw new Error(result.error || 'Failed to update outline');
      }
    } catch (error) {
      console.error('Outline edit error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process your request",
        variant: "destructive",
      });
    } finally {
      setIsEditingOutline(false);
      setCurrentEditingSlides([]);
      setCurrentEditTarget(undefined);
    }
  };

  return (
    <div className={cn("flex flex-col h-full relative overflow-hidden", "animate-opacity-in", "cv-auto")}>{/* DEBUG: Research Events: {researchEvents.length} | Generating: {isGeneratingOutline ? 'YES' : 'NO'} */}
      
      {/* Global mini game widget for outline generation - delayed and pinned right of cards */}
      {showMiniGame && (
        <div className="block fixed pointer-events-auto" style={{ left: Math.max(widgetLeft, (typeof window !== 'undefined' ? window.innerWidth - 280 : widgetLeft)), top: widgetTop, zIndex: 20 }}>
          <MiniGameWidget title="While You Wait" active={true} />
        </div>
      )}
      {/* Typewriter Header - minimal spacing with reserved height */}
      {currentOutline.title !== 'Processing your files...' && !(currentOutline as any).isManualMode && (
        <div className="px-6 pt-1 pb-0 flex-shrink-0 min-h-[3.5rem]">
          {(showTypewriter || showSubtext) && (
            <div>
              <TypewriterText 
                text="First, let's perfect your content"
                delay={50}
                className="text-left text-lg"
                onComplete={() => {
                  setShowSubtext(true);
                }}
              />
              {showSubtext && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 animate-fade-in mt-1">
                  Directly edit slides, or use the chat below to make content edits
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Fallback loading banner while waiting for initial layout (prevents empty gap under header) */}
      {currentOutline && currentOutline.slides.length === 0 && !isGeneratingOutline && uploadedFiles.length === 0 && !(currentOutline as any).isManualMode && (
        <div className="px-6 pt-2 pb-4 flex-shrink-0">
          <div className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-gradient-to-br from-orange-50/60 to-white/30 dark:from-orange-900/20 dark:to-zinc-900/30 shadow-sm">
            <div className="flex items-center gap-3 p-3" role="status" aria-live="polite">
              <div className="relative">
                <div className="h-6 w-6 rounded-full border-2 border-[#FF4301]/60 border-t-transparent animate-spin" />
                <span className="sr-only">Loading slide layout</span>
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">Crafting the perfect narrative and flow</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Shaping your story — about 10 seconds.</p>
              </div>
              {/* No trailing dots indicators per request */}
            </div>
          </div>
        </div>
      )}

      {/* Removed local tabs: Thinking will be integrated into the left TabbedFlowPanel */}

      {activePanelTab === 'flow' && ((currentOutline as any).isManualMode) && (
        <div className="px-6 pt-4 pb-4 flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <input
                type="text"
                value={currentOutline.title}
                onChange={(e) => {
                  setCurrentOutline({
                    ...currentOutline,
                    title: e.target.value
                  });
                }}
                className="text-2xl font-bold bg-transparent border-none outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 -ml-2 w-full"
                placeholder="Enter your presentation title..."
              />
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 px-2">
                Create your presentation slide by slide. For each slide, enter the full content you want to appear, including the slide title, bullet points, labels, and any placeholder text. You can also add charts on each slide and edit their data.
              </p>
            </div>
            <Button
              onClick={handleAddSlide}
              className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Slide
            </Button>
          </div>
        </div>
      )}

      {/* Show file processing UI only when we have the placeholder outline with no slides, and not during streaming */}
      {(currentOutline.slides.length === 0 && currentOutline.title === 'Processing your files...' && !isGeneratingOutline) && (
        <div className="px-6 pt-2 pb-4 flex-shrink-0">
          <div className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-gradient-to-br from-orange-50/60 to-white/30 dark:from-orange-900/20 dark:to-zinc-900/30 shadow-sm">
            <div className="flex items-center gap-3 p-3" role="status" aria-live="polite">
              <div className="relative">
                <div className="h-6 w-6 rounded-full border-2 border-[#FF4301]/60 border-t-transparent animate-spin" />
                <span className="sr-only">Analyzing your files</span>
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">Analyzing your files…</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Extracting key content and planning your slides.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Show processing files message when we have files but no slides */}
      {/* REMOVED - This is now shown in the card carousel area */}

      {/* REMOVED - File processing UI is now in the carousel area */}

      {/* Flex container for chat structure with variable visibility */}
      {/* Show the main section when generating, when slides exist, or when files are present */}
      {(currentOutline.slides.length > 0 || isGeneratingOutline || uploadedFiles.length > 0) && (
        <>
          {/* AI Notes Section - using correct property names */}
          {currentOutline && 
           ('discarded_files' in currentOutline && (currentOutline as any).discarded_files?.length > 0 || 
            'source_files_used' in currentOutline && (currentOutline as any).source_files_used?.length > 0) && (
            <Collapsible
              open={isAiNotesExpanded}
              onOpenChange={setIsAiNotesExpanded}
              className="mb-3 mx-4 border border-zinc-300/60 dark:border-neutral-700/50 rounded-lg bg-zinc-50/30 dark:bg-neutral-900/20 shadow-sm hover:shadow-md"
            >
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2.5 text-xs font-medium text-left text-zinc-600 dark:text-neutral-300 hover:bg-zinc-100/50 dark:hover:bg-neutral-800/40 rounded-t-lg focus:outline-none group">
                <div className="flex items-center">
                  <Info className="h-3.5 w-3.5 mr-2 text-blue-500" />
                  <span className="group-hover:text-zinc-800 dark:group-hover:text-neutral-100 transition-colors">AI File Processing Notes</span>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="p-2.5 border-t border-zinc-300/50 dark:border-neutral-700/40 text-xs text-zinc-500 dark:text-neutral-400 space-y-2.5 bg-white dark:bg-neutral-800/10 rounded-b-lg">
                {currentOutline && 'source_files_used' in currentOutline && (currentOutline as any).source_files_used && (currentOutline as any).source_files_used.length > 0 && (
                  <div className="pt-1">
                    <p className="font-medium text-zinc-600 dark:text-neutral-300 mb-1">Files used for content generation:</p>
                    <ul className="list-disc list-inside space-y-1 pl-1 text-zinc-500 dark:text-neutral-400">
                      {(currentOutline as any).source_files_used.map((file: { file_id: string, filename: string, reasoning: string }) => (
                        <li key={file.file_id || file.filename}>
                          <span className="font-semibold text-zinc-600 dark:text-neutral-300">{file.filename || file.file_id}:</span> {file.reasoning}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {currentOutline && 'discarded_files' in currentOutline && (currentOutline as any).discarded_files && (currentOutline as any).discarded_files.length > 0 && (
                  <div className="pt-2 border-t border-zinc-200/40 dark:border-neutral-700/30 mt-2">
                    <p className="font-medium text-zinc-600 dark:text-neutral-300 mb-1">Files not used or discarded:</p>
                    <ul className="list-disc list-inside space-y-1 pl-1 text-zinc-500 dark:text-neutral-400">
                      {(currentOutline as any).discarded_files.map((file: { file_id: string, filename: string, reasoning: string }) => (
                        <li key={file.file_id || file.filename}>
                          <span className="font-semibold text-zinc-600 dark:text-neutral-300">{file.filename || file.file_id}:</span> {file.reasoning}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="pt-2 border-t border-zinc-200/40 dark:border-neutral-700/30 mt-2 text-zinc-500 dark:text-neutral-400">
                  Tip: Drag specific files onto slide cards below to assign them manually.
                </p>
              </CollapsibleContent>
            </Collapsible>
          )}
          
          {/* Show uploaded files hint only if there are uploaded files */}
          {uploadedFiles.length > 0 && (
            <div className="px-6 pt-2 pb-2 flex-shrink-0 bg-orange-50/50 dark:bg-orange-900/10 border-t border-orange-200 dark:border-orange-800">
              <p className="text-xs text-orange-600 dark:text-orange-400 font-medium mb-2">Uploaded files ready to use:</p>
              <div className="flex flex-wrap gap-2">
                {uploadedFiles.map((file, index) => {
                  const fileType = determineFileTypeLocal(file);
                  return (
                    <div
                      key={`${file.name}-${file.size}-${file.lastModified}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'copy';
                        e.dataTransfer.setData('text/plain', file.name);
                        // Store the file in a way that handleDrop can access it
                        const dt = e.dataTransfer;
                        const item = new DataTransferItem();
                        if (dt.items && dt.items.add) {
                          dt.items.clear();
                          dt.items.add(file);
                        }
                      }}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-md cursor-grab",
                        "bg-white dark:bg-neutral-800 border border-orange-300 dark:border-orange-700",
                        "hover:shadow-md hover:border-orange-400 dark:hover:border-orange-600",
                        "transition-all duration-200",
                        "animate-in fade-in"
                      )}
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      {fileType === 'image' ? (
                        <ImageIcon className="h-4 w-4 text-orange-500 dark:text-orange-400" />
                      ) : fileType === 'chart' || fileType === 'data' ? (
                        <BarChart3 className="h-4 w-4 text-purple-500 dark:text-purple-400" />
                      ) : fileType === 'pdf' ? (
                        <FileText className="h-4 w-4 text-red-500 dark:text-red-400" />
                      ) : (
                        <FileIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                      )}
                      <span className="text-sm text-zinc-700 dark:text-neutral-300 truncate max-w-[150px]">
                        {file.name}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-orange-700 dark:text-orange-300 mt-2">
                Drag files onto slides below to add them as images, charts, or data visualizations.
              </p>
            </div>
          )}
          
          {/* Card Carousel - takes most available space; lock parent scroll during generation */}
          <div
            ref={slidesAreaRef}
            className={cn(
              "flex-1 w-full",
              isGeneratingOutline ? "overflow-hidden" : "overflow-hidden"
            )}
            style={{ paddingTop: '2px', paddingBottom: '2px' }}
          >
            {/* Show a single loading card placeholder while waiting for the first streamed slide */}
            {isGeneratingOutline && currentOutline.slides.length === 0 ? (
              <div className="relative h-full flex items-center justify-center px-6">
                <div
                  className="w-[75%] max-w-[700px] bg-white/95 dark:bg-zinc-900/95 rounded-xl shadow-md border-2 border-[#FF4301]/60 dark:border-[#FF4301]/60 flex items-center justify-center"
                  style={{ height: 'calc((100vh - 300px) * 0.67)' }}
                >
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#FF4301] border-t-transparent mx-auto mb-3"></div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">Preparing your first slide…</p>
                  </div>
                </div>
              </div>
            ) : uploadedFiles.length > 0 && currentOutline.slides.length === 0 && !isGeneratingOutline ? (
              <div className="relative h-full flex items-center justify-center px-6">
                <div
                  className="w-[75%] max-w-[700px] bg-white/95 dark:bg-zinc-900/95 rounded-xl shadow-md border-2 border-[#FF4301]/60 dark:border-[#FF4301]/60 flex items-center justify-center"
                  style={{ height: 'calc((100vh - 300px) * 0.67)' }}
                >
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#FF4301] border-t-transparent mx-auto mb-3"></div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">Analyzing your files…</p>
                  </div>
                </div>
              </div>
            ) : currentOutline.slides.length === 0 ? (
              // Always show empty state when there are no slides
              <div className="flex items-center justify-center h-full px-6">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted/20 mb-4">
                    <svg className="w-8 h-8 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">No slides yet</p>
                  <p className="text-xs text-muted-foreground/70">Use the chat below to start creating your presentation</p>
                </div>
              </div>
            ) : (
              // Check if manual mode
              (currentOutline as any).isManualMode ? (
                // Manual mode - render the manual authoring cards with charts
                <div className={cn(
                  "h-full transition-opacity duration-500",
                  currentOutline.slides.length >= 0 ? "opacity-100" : "opacity-0"
                )}>
                  {currentOutline.slides.length === 0 ? (
                    <div className="px-6 py-6">
                      <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center">
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">No slides yet</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">Click New Slide to start. Enter your title and content, and add charts if needed.</p>
                        <Button onClick={handleAddSlide} className="bg-blue-600 text-white hover:bg-blue-700">
                          <Plus className="h-4 w-4 mr-2" />
                          New Slide
                        </Button>
                      </div>
                    </div>
                  ) : (
                    currentOutline.slides.map((slide, index) => (
                      <ManualSlideCard
                        key={slide.id}
                        slide={slide}
                        index={index}
                        currentOutline={currentOutline}
                        setCurrentOutline={setCurrentOutline}
                        handleSlideTitleChange={handleSlideTitleChange}
                        handleSlideContentChange={handleSlideContentChange}
                        handleSlideReorder={(sourceIdx: number, destIdx: number) => {
                          if (!handleSlideReorder) return;
                          handleSlideReorder(sourceIdx, destIdx);
                        }}
                        handleDeleteSlide={handleDeleteSlide}
                        handleAddSlide={handleAddSlide}
                        dragOverSlideId={dragOverSlideId}
                        setDragOverSlideId={setDragOverSlideId}
                        handleDragStart={handleDragStart}
                        handleDragOver={handleDragOver}
                        handleDrop={handleDrop}
                        handleDragEnd={handleDragEnd}
                        toast={toast}
                      />
                    ))
                  )}
                </div>
              ) : (
                // Normal mode - show card carousel with fade-in animation
                <div className={cn(
                  "h-full transition-opacity duration-500",
                  currentOutline.slides.length > 0 ? "opacity-100" : "opacity-0"
                )}>
                  {/* Local Flow/Theme tab switcher */}
                  <div className="px-4 py-2 flex gap-2 items-center">
                    <button
                      className={cn(
                        "text-xs px-2 py-1 rounded border",
                        activePanelTab === 'flow' ? 'border-[#FF4301] text-[#FF4301]' : 'border-transparent text-zinc-500'
                      )}
                      onClick={() => setActivePanelTab('flow')}
                    >
                      Flow
                    </button>
                    <button
                      className={cn(
                        "text-xs px-2 py-1 rounded border",
                        activePanelTab === 'theme' ? 'border-[#FF4301] text-[#FF4301]' : 'border-transparent text-zinc-500'
                      )}
                      onClick={() => setActivePanelTab('theme')}
                    >
                      Theme
                    </button>
                  </div>

                  {activePanelTab === 'theme' ? (
                    <div className="h-full p-3">
                      {themeError ? (
                        <div className="text-xs text-red-500">{themeError}</div>
                      ) : (
                        <div className="w-full border rounded-lg bg-white/60 dark:bg-zinc-900/50" style={{ height: 320 }}>
                          {isThemeLoading || !isThemeReadyGlobal ? (
                            <div className="h-full w-full flex items-center justify-center">
                              <div className="flex flex-col items-center gap-2">
                                <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
                                <span className="text-sm text-zinc-400">Loading theme...</span>
                              </div>
                            </div>
                          ) : (
                          <div ref={themePanelRef} className="h-full w-full grid grid-cols-2 relative">
                            {/* Left: Typography samples with logo controls pinned to bottom */}
                            <div className="h-full p-4 flex flex-col gap-3 overflow-hidden">
                              <div
                                className="text-[24px] font-bold whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer select-none"
                                style={{ fontFamily: useThemeStore.getState().getWorkspaceTheme().typography.heading?.fontFamily || 'Inter', color: useThemeStore.getState().getWorkspaceTheme().typography.heading?.color || '#1f2937' }}
                                onClick={(e) => openFontPanelAt(e, 'heading')}
                              >
                                Heading Sample
                              </div>
                              <div
                                className="text-sm whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer select-none"
                                style={{ fontFamily: useThemeStore.getState().getWorkspaceTheme().typography.paragraph?.fontFamily || 'Inter', color: useThemeStore.getState().getWorkspaceTheme().typography.paragraph?.color || '#1f2937' }}
                                onClick={(e) => openFontPanelAt(e, 'body')}
                              >
                                Body sample text shows the selected body font.
                              </div>
                              {/* Logo block anchored at bottom with replace/remove */}
                              <div className="mt-auto">
                                <div className="text-[10px] mb-1 opacity-70">Brand logo</div>
                                <div className="h-16 w-40 rounded-md border flex items-center justify-center overflow-hidden bg-white/70 dark:bg-zinc-800/50">
                                  {logoUrl ? (
                                    <img src={logoUrl} alt="Brand logo" className="max-h-12 max-w-[9rem] object-contain" />
                                  ) : (
                                    <div className="text-[11px] opacity-60">No logo</div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                  <button
                                    className="text-[11px] px-2 py-1 rounded border border-zinc-300 dark:border-neutral-700 hover:bg-zinc-50 dark:hover:bg-white/5 disabled:opacity-60"
                                    onClick={handleClickReplaceLogo}
                                    disabled={isUploadingLogo}
                                  >
                                    {isUploadingLogo ? 'Uploading…' : (logoUrl ? 'Replace logo' : 'Add logo')}
                                  </button>
                                  {logoUrl && (
                                    <button
                                      className="text-[11px] px-2 py-1 rounded border border-zinc-300 dark:border-neutral-700 hover:bg-zinc-50 dark:hover:bg-white/5"
                                      onClick={handleRemoveLogo}
                                    >
                                      Remove
                                    </button>
                                  )}
                                  <input
                                    ref={logoFileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleLogoFileSelected}
                                  />
                                </div>
                              </div>
                            </div>
                            {/* Right: Vertical color bars with labels */}
                            <div className="h-full p-0 overflow-x-auto overflow-y-hidden">
                              {/* Only render palette when a real theme is applied and palette exists */}
                              {swatches.length > 0 ? (
                                <div className="grid grid-flow-col auto-cols-fr h-full gap-0">
                                  {swatches.map((sw, idx) => (
                                    <div key={idx} className="relative h-full cursor-pointer" style={{ backgroundColor: sw.color }} onClick={(e) => openColorPanelAt(e, idx)}>
                                      <div
                                        className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-white whitespace-nowrap"
                                        style={{ fontFamily: 'HKGrotesk, Inter, sans-serif', fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}
                                      >
                                        {sw.label}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-[11px] text-zinc-400 select-none">
                                  {/* No palette colors available */}
                                </div>
                              )}
                            </div>
                            {/* Floating editors */}
                            {fontEditor?.open && (
                              <div
                                ref={fontEditorRef}
                                className="absolute z-50 p-2 rounded-md border bg-white shadow-md dark:bg-neutral-900 dark:border-neutral-700"
                                style={{ left: Math.max(8, Math.min((fontEditor.x || 0), (themePanelRef.current?.clientWidth || 0) - 260)), top: Math.max(8, Math.min((fontEditor.y || 0), (themePanelRef.current?.clientHeight || 0) - 200)), width: 240 }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="text-[10px] mb-1 opacity-70">
                                  {fontEditor.type === 'heading' ? 'Heading Font' : 'Body Font'}
                                </div>
                                <GroupedDropdown
                                  value={String(useThemeStore.getState().getWorkspaceTheme().typography[fontEditor.type === 'heading' ? 'heading' : 'paragraph']?.fontFamily || '')}
                                  options={ALL_FONT_NAMES}
                                  groups={fontGroups}
                                  onChange={(value) => {
                                    if (fontEditor.type === 'heading') {
                                      applyThemeUpdate((t) => ({ ...t, typography: { ...t.typography, heading: { ...(t.typography?.heading || {}), fontFamily: String(value) } } } as any));
                                    } else {
                                      applyThemeUpdate((t) => ({ ...t, typography: { ...t.typography, paragraph: { ...(t.typography?.paragraph || {}), fontFamily: String(value) } } } as any));
                                    }
                                    try { FontLoadingService.syncDesignerFonts?.().finally(() => FontLoadingService.loadFont(String(value)).catch(() => {})); } catch {}
                                    setFontEditor(null);
                                  }}
                                  placeholder="Select font"
                                />
                              </div>
                            )}
                            {colorEditor?.open && (
                              <div
                                ref={colorEditorRef}
                                className="absolute z-50 p-2 rounded-md border bg-white shadow-md dark:bg-neutral-900 dark:border-neutral-700"
                                style={{ left: Math.max(8, Math.min((colorEditor.x || 0), (themePanelRef.current?.clientWidth || 0) - 260)), top: Math.max(8, Math.min((colorEditor.y || 0), (themePanelRef.current?.clientHeight || 0) - 230)), width: 240 }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="text-[10px] mb-1 opacity-70">Color</div>
                                <EnhancedColorPicker
                                  color={String(swatches[colorEditor.swatchIndex]?.color || '#ffffff')}
                                  onChange={(hex) => {
                                    updateSwatchColor(colorEditor.swatchIndex, hex);
                                  }}
                                  onChangeComplete={() => setColorEditor(null)}
                                />
                              </div>
                            )}
                          </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <CardCarousel
                      slides={currentOutline.slides}
                      currentIndex={currentSlideIndex}
                      onIndexChange={setCurrentSlideIndex}
                      onDeepResearch={handleImmediateResearch}
                      onDeleteSlide={handleDeleteSlide}
                      onAddSlide={handleAddSlide}
                      onSlideTitleChange={handleSlideTitleChange}
                      onSlideContentChange={handleSlideContentChange}
                      onSlideReorder={handleSlideReorder}
                      researchingSlides={researchingSlides}
                      isGenerating={isGeneratingOutline}
                      completedSlides={completedSlides}
                      setCurrentOutline={setCurrentOutline}
                      editingSlides={currentEditingSlides}
                      editTarget={currentEditTarget}
                    />
                  )}
                </div>
              )
            )}
          </div>

          {/* Chat Box - fixed at bottom - hide for manual mode */}
          {!(currentOutline as any).isManualMode && (
            <div className="px-4 pb-3 pt-1 flex-shrink-0">
              <OutlineChatBox
                onSendMessage={handleOutlineChatMessage}
                isLoading={isEditingOutline}
                currentSlideIndex={currentSlideIndex}
                totalSlides={currentOutline.slides.length}
                placeholder="Ask me to edit slides, adjust content, or make changes to your outline..."
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default OutlineDisplayView; 
