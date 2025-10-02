import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { Theme, initialWorkspaceTheme, defaultThemes } from '@/types/themes';
import { useShallow } from 'zustand/react/shallow';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { ALL_FONT_NAMES, FONT_CATEGORIES } from '@/registry/library/fonts';
import { FontLoadingService } from '@/services/FontLoadingService';
import { FontApiService } from '@/services/FontApiService';
import { registry } from '@/registry';
import GroupedDropdown from '../settings/GroupedDropdown';
import GradientPicker from '../GradientPicker';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { useDeckStore } from '@/stores/deckStore';
import { useHistoryStore } from '@/stores/historyStore';
import { SlideThumbnailService } from '@/services/SlideThumbnailService';
import { Loader2, Undo2, Sparkles, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/stores/editorStore';
import TemplateSketchLoader from './TemplateSketchLoader';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { createDefaultBackground } from '@/utils/componentUtils';
import { generateColorPalette } from '@/utils/colorUtils';

export interface ThemePanelProps {
  onClose?: () => void;
}

interface HuemintResult {
    palette: string[];
}

const ThemePanel: React.FC<ThemePanelProps> = ({ onClose }) => {
  const availableThemes = useThemeStore(state => state.availableThemes);
  const workspaceThemeId = useThemeStore(state => state.workspaceThemeId);
  const setWorkspaceTheme = useThemeStore(state => state.setWorkspaceTheme);
  const addCustomTheme = useThemeStore(state => state.addCustomTheme);
  const updateCustomTheme = useThemeStore(state => state.updateCustomTheme);
  const deckData = useDeckStore(state => state.deckData);
  const updateDeckData = useDeckStore(state => state.updateDeckData);
  const allSlideIds = useDeckStore(useShallow(state => state.deckData.slides.map(slide => slide.id)));
  const batchUpdateSlideComponents = useDeckStore(state => state.batchUpdateSlideComponents);
  const { addDeckHistory, undoDeck, canUndoDeck, addToHistory } = useHistoryStore();
  const setDraftComponentsForSlide = useEditorStore(state => state.setDraftComponentsForSlide);

  const activeSlide = useActiveSlide();

  const workspaceTheme = useMemo(() => {
    return availableThemes.find(theme => theme.id === workspaceThemeId) || initialWorkspaceTheme;
  }, [availableThemes, workspaceThemeId]);

  const [currentThemeEdit, setCurrentThemeEdit] = useState<Theme>({ ...workspaceTheme });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedThemes, setGeneratedThemes] = useState<Theme[]>([]);
  const [isBgPopoverOpen, setIsBgPopoverOpen] = useState(false);
  const [isTextPopoverOpen, setIsTextPopoverOpen] = useState(false);
  const [isAccentPopoverOpen, setIsAccentPopoverOpen] = useState(false);
  const previousWorkspaceThemeId = useRef(workspaceThemeId);
  const [dbPalettes, setDbPalettes] = useState<Array<{ id: string; name: string; colors: string[] }>>([]);
  const [recommendedFonts, setRecommendedFonts] = useState<{ hero?: string; body?: string } | null>(null);

  useEffect(() => {
    generateThemes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load public palettes from DB
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('palettes')
          .select('id,name,colors,is_public')
          .eq('is_public', true)
          .limit(24);
        if (error) {
          console.warn('[ThemePanel] Failed to load palettes:', error.message);
          return;
        }
        const normalized = (data || [])
          .map((row: any) => {
            const rawColors = (row.colors as any) ?? [];
            const colors = Array.isArray(rawColors)
              ? rawColors
              : (Array.isArray((rawColors as any).palette) ? (rawColors as any).palette : []);
            return {
              id: row.id as string,
              name: row.name as string,
              colors: (colors as string[]).filter(Boolean).slice(0, 5)
            };
          })
          .filter(p => p.colors.length >= 3);
        if (isMounted) setDbPalettes(normalized);
      } catch (e: any) {
        console.warn('[ThemePanel] Error loading palettes:', e?.message || e);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    const hasUserMadeEdits = currentThemeEdit.isCustom === true ||
                              JSON.stringify(currentThemeEdit) !== JSON.stringify(workspaceTheme);

    if (workspaceThemeId !== previousWorkspaceThemeId.current &&
        (!hasUserMadeEdits || currentThemeEdit.id === previousWorkspaceThemeId.current)) {
      setCurrentThemeEdit({ ...workspaceTheme });
    }
    previousWorkspaceThemeId.current = workspaceThemeId;

  }, [workspaceTheme, workspaceThemeId, currentThemeEdit.isCustom, currentThemeEdit.id]);

  const updateThemeValue = (path: string, value: any) => {
    const keys = path.split('.');
    const newTheme = JSON.parse(JSON.stringify(currentThemeEdit));

    let current: any = newTheme;
    for (let i = 0; i < keys.length - 1; i++) {
      if (current[keys[i]] === undefined || typeof current[keys[i]] !== 'object') {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;

    const baseTheme = availableThemes.find(t => t.id === workspaceThemeId) || initialWorkspaceTheme;
    if (JSON.stringify(newTheme) !== JSON.stringify(baseTheme)) {
        newTheme.isCustom = true;
        delete newTheme.id;
        newTheme.name = baseTheme.name + " (modified)";
    } else {
        Object.assign(newTheme, baseTheme);
        newTheme.isCustom = false;
    }

    setCurrentThemeEdit(newTheme);
    // Live real-time apply without history
    try {
      applySpecificTheme(newTheme);
    } catch (e) {
      console.warn('[ThemePanel] Live apply failed:', e);
    }
  };

  const applySpecificTheme = (themeToApply: Theme, recordHistory: boolean = false) => {
    console.log(`[ThemePanel] Applying theme to ALL slides:`, themeToApply);
    if (!themeToApply?.page?.backgroundColor ||
        !themeToApply?.typography?.paragraph?.color ||
        !themeToApply?.typography?.paragraph?.fontFamily ||
        !themeToApply?.accent1) {
      console.error('Theme is missing required properties', themeToApply);
      return;
    }

    const targetSlideIds = allSlideIds;
    console.log(`[ThemePanel] Target Slide IDs:`, targetSlideIds);
    if (targetSlideIds.length === 0) {
        console.warn('ApplyTheme: No target slide ID found for scope ');
        return;
    }

    const bgColor = themeToApply.page.backgroundColor;
    const paraStyle = themeToApply.typography.paragraph;
    const accentColor = themeToApply.accent1;
    const fontFamily = themeToApply.typography.paragraph.fontFamily;

    const slideUpdatesMap: Record<string, { slideId: string; components: any[] }> = {};
    let changesMade = false;

    // Get registry component definitions to validate types
    const registeredTypes = registry.getAllDefinitions().map(def => def.type);
    console.log(`[ThemePanel] Registered component types:`, registeredTypes);

    targetSlideIds.forEach(slideId => {
      const slide = deckData.slides.find(s => s.id === slideId);
      if (!slide) {
          console.warn(`ApplyTheme: Slide not found for ID: ${slideId}`);
          return;
      }
      const originalComponents = slide.components;
      const updatedComponents = JSON.parse(JSON.stringify(originalComponents));

      // Log component types being processed for debugging
      const componentTypes = updatedComponents.map((c: any) => c.type);
      console.log(`[ThemePanel] Processing components of types:`, [...new Set(componentTypes)]);

      updatedComponents.forEach((component: any) => {
        // Use exact types from TypeBox registry
        switch (component.type) {
          case 'Background':
            component.props.backgroundColor = bgColor;
            component.props.color = bgColor;
            component.props.backgroundType = 'color';
            component.props.gradient = null;
            if (typeof component.props.background === 'string') {
              component.props.background = '';
            }
            if (component.props.backgroundImageUrl) {
              component.props.backgroundImageUrl = null;
            }
            if (component.props.patternType) {
              component.props.patternType = null;
            }
            break;
          case 'TiptapTextBlock':
            component.props.fontFamily = fontFamily;
            component.props.textColor = paraStyle.color;
            console.log(`[ThemePanel] Applying fontFamily '${fontFamily}' to ${component.type} ${component.id}`);
            break;
          case 'Icon':
            // Apply accent color to icons
            component.props.color = accentColor;
            break;
          case 'Lines':
          case 'Line':
          case 'line':
            // Apply accent color to line strokes
            component.props.stroke = accentColor;
            break;
          case 'WavyLines':
            // Apply accent color to decorative wavy lines
            component.props.lineColor = accentColor;
            break;
          case 'Shape':
            component.props.fill = accentColor;
            break;
          case 'ShapeWithText':
            // Alias of Shape; ensure text follows theme too
            component.props.fill = accentColor;
            component.props.textColor = paraStyle.color;
            component.props.fontFamily = fontFamily;
            break;
          case 'Chart':
            try {
              // Generate a theme-based palette and apply to chart colors and data
              const dataArr = Array.isArray(component.props.data) ? component.props.data : [];
              const inferredCount = dataArr.length > 0 ? dataArr.length : 8;
              const palette = generateColorPalette(accentColor, Math.max(3, Math.min(24, inferredCount)));
              component.props.colors = palette;

              if (dataArr.length > 0) {
                // If series-based (each item has a 'data' array), color per series
                if (dataArr[0] && typeof dataArr[0] === 'object' && Array.isArray((dataArr[0] as any).data)) {
                  dataArr.forEach((series: any, idx: number) => {
                    series.color = palette[idx % palette.length];
                  });
                } else {
                  // Otherwise assume bar/pie-like data points
                  dataArr.forEach((item: any, idx: number) => {
                    item.color = palette[idx % palette.length];
                  });
                }
              }
            } catch (e) {
              console.warn('[ThemePanel] Failed to apply chart palette from accent', e);
              component.props.colors = [accentColor, ...(component.props.colors?.slice(1) || [])];
            }
            break;
          case 'Table':
            component.props.tableStyles = {
              ...(component.props.tableStyles || {}),
              fontFamily,
              textColor: paraStyle.color,
              headerBackgroundColor: accentColor,
              headerTextColor: paraStyle.color,
            };
            break;
          case 'CustomComponent':
            try {
              // Best-effort: propagate theme into common custom props if present
              if (component.props && typeof component.props === 'object') {
                if (!component.props.props || typeof component.props.props !== 'object') {
                  component.props.props = {};
                }
                const customProps = component.props.props as Record<string, any>;
                customProps.color = accentColor;
                if (bgColor) customProps.backgroundColor = bgColor;
                customProps.textColor = paraStyle.color;
              }
            } catch {}
            break;
        }
      });

      // Ensure a background exists
      const hasBackground = updatedComponents.some((c: any) => c.type === 'Background');
      if (!hasBackground) {
        const bgComp = createDefaultBackground(bgColor) as any;
        bgComp.props.backgroundColor = bgColor;
        bgComp.props.backgroundType = 'color';
        bgComp.props.gradient = null;
        updatedComponents.unshift(bgComp);
      }

      if (JSON.stringify(originalComponents) !== JSON.stringify(updatedComponents)) {
          if (recordHistory) {
            try {
              // Push before state so Ctrl+Z can revert
              addToHistory(slideId, originalComponents);
            } catch (e) {
              console.warn('[ThemePanel] addToHistory (before) failed for', slideId, e);
            }
          }
          slideUpdatesMap[slideId] = { slideId, components: updatedComponents };
          changesMade = true;
      }
    });

    if (changesMade && Object.keys(slideUpdatesMap).length > 0) {
        console.log("[ThemePanel] Applying updates via batchUpdateSlideComponents for all slides");
        batchUpdateSlideComponents(Object.values(slideUpdatesMap));

        if (recordHistory) {
          // Push updated state entries
          try {
            Object.values(slideUpdatesMap).forEach(({ slideId, components }) => {
              addToHistory(slideId, components);
            });
          } catch (e) {
            console.warn('[ThemePanel] addToHistory (after) failed', e);
          }
        }

        Object.keys(slideUpdatesMap).forEach(slideId => {
          SlideThumbnailService.clearThumbnail(slideId);
        });
    } else {
         console.warn("ApplyTheme (All): No actual changes detected or updates generated.");
    }
  };

  const applyThemeWithHistory = (themeToApply: Theme) => {
      const beforeState = structuredClone(deckData);
      addDeckHistory(beforeState);
      
      applySpecificTheme(themeToApply, true);
      
      const updatedDeckData = useDeckStore.getState().deckData;
      // Update editor drafts for all slides to keep UI in sync
      try {
        updatedDeckData.slides.forEach(slide => {
          setDraftComponentsForSlide(slide.id, structuredClone(slide.components));
        });
      } catch {}

      setIsBgPopoverOpen(false);
      setIsTextPopoverOpen(false);
      setIsAccentPopoverOpen(false);
  };

  const applyCurrentThemeEdit = () => {
    applyThemeWithHistory(currentThemeEdit);
    if (onClose) {
      onClose();
    } else {
      try {
        const evt = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
        document.body.dispatchEvent(evt);
      } catch {}
    }

    if (currentThemeEdit.isCustom) {
        const existingCustom = availableThemes.find(t => t.name === currentThemeEdit.name && t.isCustom);
        let themeIdToSet: string;
        if (existingCustom?.id) {
            updateCustomTheme(existingCustom.id, {
                page: currentThemeEdit.page,
                typography: currentThemeEdit.typography,
                accent1: currentThemeEdit.accent1,
                accent2: currentThemeEdit.accent2,
            });
            themeIdToSet = existingCustom.id;
        } else {
            themeIdToSet = addCustomTheme({
                name: currentThemeEdit.name || `Custom Theme ${new Date().toLocaleTimeString()}`,
                page: currentThemeEdit.page,
                typography: currentThemeEdit.typography,
                accent1: currentThemeEdit.accent1,
                accent2: currentThemeEdit.accent2
            });
        }
        setWorkspaceTheme(themeIdToSet);
        const savedTheme = useThemeStore.getState().availableThemes.find(t => t.id === themeIdToSet);
        if (savedTheme) setCurrentThemeEdit(savedTheme);
    }
  };

  const saveAndApplyTheme = (theme: Theme) => {
    let themeIdToSet = theme.id && availableThemes.find(t => t.id === theme.id) ? theme.id : '';
    if (!themeIdToSet) {
      themeIdToSet = addCustomTheme({
        name: theme.name || `Theme ${new Date().toLocaleTimeString()}`,
        page: theme.page,
        typography: theme.typography,
        accent1: theme.accent1,
        accent2: theme.accent2
      });
    }
    setWorkspaceTheme(themeIdToSet);
    const savedTheme = useThemeStore.getState().availableThemes.find(t => t.id === themeIdToSet) || theme;
    setCurrentThemeEdit(savedTheme);
    applyThemeWithHistory(savedTheme);
    if (onClose) {
      onClose();
    } else {
      try {
        const evt = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
        document.body.dispatchEvent(evt);
      } catch {}
    }
  };

  const previewGeneratedTheme = (theme: Theme) => {
      console.log("[ThemePanel] Saving and applying generated theme:", theme);
      saveAndApplyTheme(theme);
  };

  const generateThemes = async () => {
    setIsGenerating(true);
    setGeneratedThemes([]);

    const lockedPalette = ["-", "-", "-"];

    const adjacencyMatrix = [
        "0", "60", "50",
        "60", "0", "50",
        "50", "50", "0"
    ];

    const json_data = {
      mode: "transformer",
      num_colors: 3,
      temperature: "1.2",
      num_results: 10,
      adjacency: adjacencyMatrix,
      palette: lockedPalette,
    };

    try {
      const response = await fetch("https://api.huemint.com/color", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(json_data),
      });

      if (!response.ok) {
        throw new Error(`Huemint API error: ${response.statusText}`);
      }

      const data = await response.json();

      const currentFontFamily = currentThemeEdit.typography.paragraph.fontFamily;
      const currentFontSize = currentThemeEdit.typography.paragraph.fontSize;
      const currentFontWeight = currentThemeEdit.typography.paragraph.fontWeight;

      // Request font recommendations from backend (semantic + per-slide context ready)
      let headingFont: string | undefined = undefined;
      let bodyFont: string | undefined = undefined;
      try {
        const deckTitle = useDeckStore.getState().deckData.title || 'Presentation';
        const vibe = 'modern';
        const keywords: string[] = (useDeckStore.getState().deckData.slides || [])
          .slice(0, 8)
          .flatMap(s => [s.title, s.content])
          .filter(Boolean) as string[];
        const rec = await FontApiService.recommend({ deck_title: deckTitle, vibe, content_keywords: keywords });
        headingFont = rec?.hero?.[0]?.name;
        bodyFont = rec?.body?.[0]?.name;
        // Preload recommended fonts conservatively
        const preload = Array.from(new Set([headingFont, bodyFont].filter(Boolean))) as string[];
        if (preload.length) {
          for (const fam of preload) {
            await FontApiService.findAndLoadByFamily(fam!, '400');
          }
        }
      } catch {}

      const appliedBodyFont = bodyFont || currentFontFamily;
      const appliedHeadingFont = headingFont || currentThemeEdit.typography.heading?.fontFamily || currentFontFamily;

      const newThemes: Theme[] = data.results.map((result: HuemintResult, index: number) => ({
        id: `generated-${Date.now()}-${index}`,
        name: `Generated ${index + 1}`,
        page: { backgroundColor: result.palette[0] },
        typography: {
          paragraph: {
            fontFamily: appliedBodyFont,
            fontSize: currentFontSize,
            fontWeight: currentFontWeight,
            color: result.palette[1],
          },
          heading: {
            fontFamily: appliedHeadingFont,
            color: result.palette[1],
            fontWeight: 700
          }
        },
        accent1: result.palette[2],
        accent2: currentThemeEdit.accent2,
        isCustom: true
      }));

      setGeneratedThemes(newThemes);

    } catch (error) {
      console.error("Failed to generate themes:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  // Dynamic font options/groups (runtime + backend designer)
  const [fontOptions, setFontOptions] = useState<string[]>(ALL_FONT_NAMES);
  const [fontGroups, setFontGroups] = useState<Record<string, string[]>>(() => {
    const groups: Record<string, string[]> = {};
    for (const [category, fonts] of Object.entries(FONT_CATEGORIES)) {
      groups[category] = fonts.map(font => font.name);
    }
    return groups;
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await FontLoadingService.syncDesignerFonts();
      } catch {}
      if (!cancelled) {
        try {
          setFontGroups(FontLoadingService.getDedupedFontGroups());
          setFontOptions(FontLoadingService.getAllFontNames());
        } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Preload currently selected fonts via backend service to ensure rendering
  useEffect(() => {
    const para = currentThemeEdit.typography?.paragraph?.fontFamily;
    const heading = currentThemeEdit.typography?.heading?.fontFamily;
    const toLoad = Array.from(new Set([para, heading].filter(Boolean))) as string[];
    if (toLoad.length) {
      (async () => {
        try {
          for (const family of toLoad) {
            await FontApiService.findAndLoadByFamily(family, '400');
          }
        } catch {}
      })();
    }
  }, [currentThemeEdit.typography?.paragraph?.fontFamily, currentThemeEdit.typography?.heading?.fontFamily]);

  // Fetch recommended fonts once, based on outline context
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const deckTitle = useDeckStore.getState().deckData.title || 'Presentation';
        const vibe = 'modern';
        const keywords: string[] = (useDeckStore.getState().deckData.slides || [])
          .slice(0, 8)
          .flatMap(s => [s.title, s.content])
          .filter(Boolean) as string[];
        const rec = await FontApiService.recommend({ deck_title: deckTitle, vibe, content_keywords: keywords });
        if (!cancelled && rec) {
          const hero = rec.hero?.[0]?.name;
          const body = rec.body?.[0]?.name;
          setRecommendedFonts({ hero, body });
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const renderThemePreview = (theme: Theme, onClick: () => void, isSelected: boolean) => {
      const bgColor = theme.page?.backgroundColor || '#ffffff';
      const textColor = theme.typography?.paragraph?.color || '#000000';
      const accentColor = theme.accent1 || '#007bff';

      return (
          <motion.div
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            <Card
              key={theme.id || theme.name}
              className={cn(
                  "p-1 cursor-pointer transition-all hover:ring-2 hover:ring-primary shrink-0 w-20 relative overflow-hidden group",
                  isSelected ? 'ring-2 ring-primary shadow-lg' : 'hover:shadow-md'
              )}
              onClick={onClick}
              title={theme.name}
            >
              {/* Animated background effect on hover */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-br from-transparent to-primary/5"
                initial={{ opacity: 0 }}
                whileHover={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              />
              
              <div className="relative z-10">
                <div className="flex h-6 w-full rounded-sm overflow-hidden border group-hover:border-primary/50 transition-colors">
                    <motion.div 
                      className="flex-1 h-full relative overflow-hidden" 
                      style={{ backgroundColor: bgColor }} 
                      title={`Background: ${bgColor}`}
                    >
                      <motion.div
                        className="absolute inset-0 bg-white/20"
                        initial={{ x: "-100%" }}
                        whileHover={{ x: "100%" }}
                        transition={{ duration: 0.6 }}
                      />
                    </motion.div>
                    <motion.div 
                      className="flex-1 h-full relative overflow-hidden" 
                      style={{ backgroundColor: textColor }} 
                      title={`Text: ${textColor}`}
                    >
                      <motion.div
                        className="absolute inset-0 bg-white/20"
                        initial={{ x: "-100%" }}
                        whileHover={{ x: "100%" }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                      />
                    </motion.div>
                    <motion.div 
                      className="flex-1 h-full relative overflow-hidden" 
                      style={{ backgroundColor: accentColor }} 
                      title={`Accent: ${accentColor}`}
                    >
                      <motion.div
                        className="absolute inset-0 bg-white/20"
                        initial={{ x: "-100%" }}
                        whileHover={{ x: "100%" }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                      />
                    </motion.div>
                </div>
                <div className="text-[10px] font-medium truncate text-center mt-1 px-1 relative" style={{ color: theme.typography?.paragraph?.color || '#000' }}>
                  {theme.name}
                </div>
              </div>
              
              {isSelected && (
                <motion.div
                  className="absolute -top-1 -right-1"
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                >
                  <div className="w-3 h-3 bg-primary rounded-full flex items-center justify-center">
                    <motion.div
                      className="w-1.5 h-1.5 bg-white rounded-full"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    />
                  </div>
                </motion.div>
              )}
            </Card>
          </motion.div>
      );
  };

  const themeFromPalette = (palette: { id: string; name: string; colors: string[] }): Theme => {
    const currentFontFamily = currentThemeEdit.typography.paragraph.fontFamily || 'Inter';
    return {
      id: `palette-${palette.id}`,
      name: palette.name,
      page: { backgroundColor: palette.colors[0] },
      typography: {
        paragraph: {
          fontFamily: currentFontFamily,
          fontSize: currentThemeEdit.typography.paragraph.fontSize,
          fontWeight: currentThemeEdit.typography.paragraph.fontWeight,
          lineHeight: currentThemeEdit.typography.paragraph.lineHeight,
          color: palette.colors[1]
        },
        heading: {
          fontFamily: currentThemeEdit.typography.heading?.fontFamily || currentFontFamily,
          color: palette.colors[1],
          fontWeight: currentThemeEdit.typography.heading?.fontWeight || 700
        }
      },
      accent1: palette.colors[2],
      accent2: palette.colors[3] || palette.colors[2],
      isCustom: true
    };
  };

  // New handler for the Undo button
  const handleUndoThemeChange = () => {
    if (!canUndoDeck()) return; // Guard clause

    console.log("[ThemePanel] Undoing last deck history state...");
    // 1. Revert the main deck data in deckStore
    undoDeck();

    // 2. Get the *restored* deck data from deckStore
    const restoredDeckData = useDeckStore.getState().deckData;
    // 3. Update drafts for all slides so Ctrl+Z affects the whole deck
    restoredDeckData.slides.forEach(slide => {
      setDraftComponentsForSlide(slide.id, structuredClone(slide.components));
    });
  };

  return (
    <div className="space-y-4 p-1">
      <div className="space-y-4 pb-4">

          {/* Removed Sample Designs per request */}

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-primary" />
                <Label className="text-[11px] font-medium">AI Generated Themes</Label>
              </div>
              <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[11px] px-2 group"
                  onClick={generateThemes}
                  disabled={isGenerating}
              >
                  {isGenerating ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1"/>
                  ) : (
                    <Wand2 className="h-3 w-3 mr-1 group-hover:rotate-12 transition-transform" />
                  )}
                  Generate
              </Button>
            </div>
            
            {/* Template Sketch Loader */}
            <AnimatePresence mode="wait">
              {isGenerating && (
                <TemplateSketchLoader 
                  isGenerating={isGenerating}
                  currentTheme={currentThemeEdit}
                  className="mb-2"
                />
              )}
            </AnimatePresence>
            
            <ScrollArea className="w-full rounded-md">
              <div className="flex space-x-2 p-1">
                {!isGenerating && generatedThemes.length === 0 && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-[11px] text-muted-foreground p-3 text-center w-full shrink-0 flex flex-col items-center gap-2"
                  >
                    <Wand2 className="h-8 w-8 text-muted-foreground/50" />
                    <p>Click Generate to create AI-powered themes</p>
                  </motion.div>
                )}
                {!isGenerating && generatedThemes.map((theme, index) => (
                  <motion.div
                    key={theme.id || index}
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ 
                      opacity: 1, 
                      scale: 1, 
                      y: 0,
                      transition: {
                        delay: index * 0.1,
                        duration: 0.3,
                        ease: "easeOut"
                      }
                    }}
                  >
                    {renderThemePreview(theme, () => { previewGeneratedTheme(theme); }, JSON.stringify(theme) === JSON.stringify(currentThemeEdit))}
                  </motion.div>
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>

          <Separator className="my-2" />

          {/* Recommended Fonts (from backend) */}
          {recommendedFonts && (recommendedFonts.hero || recommendedFonts.body) && (
            <div className="space-y-1">
              <Label className="text-[11px] font-medium">Recommended Fonts</Label>
              <div className="flex items-center gap-2 text-[11px]">
                {recommendedFonts.hero && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2"
                    onClick={async () => {
                      try { await FontApiService.findAndLoadByFamily(recommendedFonts.hero!, '700'); } catch {}
                      updateThemeValue('typography.heading.fontFamily', recommendedFonts.hero);
                    }}
                    title="Apply to headings"
                  >
                    H: {recommendedFonts.hero}
                  </Button>
                )}
                {recommendedFonts.body && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2"
                    onClick={async () => {
                      try { await FontApiService.findAndLoadByFamily(recommendedFonts.body!, '400'); } catch {}
                      updateThemeValue('typography.paragraph.fontFamily', recommendedFonts.body);
                    }}
                    title="Apply to body"
                  >
                    P: {recommendedFonts.body}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Palettes from DB - show all three colors per palette */}
          {dbPalettes.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-medium">Palettes</Label>
              <ScrollArea className="w-full rounded-md">
                <div className="flex space-x-2 p-2">
                  {dbPalettes.map((p) => {
                    const theme = themeFromPalette(p);
                    const bg = theme.page.backgroundColor;
                    const text = theme.typography.paragraph.color;
                    const accent = theme.accent1;
                    return (
                      <Card key={p.id} className="p-2 w-28 shrink-0 cursor-pointer hover:ring-2 hover:ring-primary"
                        onClick={() => saveAndApplyTheme(theme)}
                        title={p.name}
                      >
                        <div className="space-y-1">
                          <div className="h-5 w-full rounded" style={{ backgroundColor: bg }} />
                          <div className="h-5 w-full rounded" style={{ backgroundColor: text }} />
                          <div className="h-5 w-full rounded" style={{ backgroundColor: accent }} />
                        </div>
                        <div className="text-[10px] mt-1 truncate" style={{ color: text }}>{p.name}</div>
                      </Card>
                    );
                  })}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>
          )}

          <div className="space-y-1">
             <Label className="text-[11px] font-medium">Font</Label>
             <GroupedDropdown
               value={currentThemeEdit.typography?.paragraph?.fontFamily || ''}
               options={fontOptions}
               groups={fontGroups}
               onChange={(value) => updateThemeValue('typography.paragraph.fontFamily', value)}
               placeholder="Font family"
             />
          </div>

          {/* Heading font */}
          <div className="space-y-1">
             <Label className="text-[11px] font-medium">Heading Font</Label>
             <GroupedDropdown
               value={currentThemeEdit.typography?.heading?.fontFamily || ''}
               options={fontOptions}
               groups={fontGroups}
               onChange={(value) => updateThemeValue('typography.heading.fontFamily', value)}
               placeholder="Heading font"
             />
          </div>

          <Separator className="my-2" />

          <div className="space-y-1">
             <Label className="text-[11px] font-medium">Colors</Label>
             <div className="flex space-x-1">
                <div className="flex-1 space-y-1">
                   <Label className="text-[10px] text-muted-foreground block text-center">Background</Label>
                   <Popover open={isBgPopoverOpen} onOpenChange={setIsBgPopoverOpen}>
                     <PopoverTrigger asChild>
                       <Button variant="outline" className="w-full h-6 p-0 justify-center border">
                         <div className="h-full w-full"
                           style={{ backgroundColor: currentThemeEdit.page?.backgroundColor }}
                         />
                       </Button>
                     </PopoverTrigger>
                     <PopoverContent className="w-56">
                       <GradientPicker
                         value={currentThemeEdit.page?.backgroundColor || '#ffffff'}
                         onChange={(val) => updateThemeValue('page.backgroundColor', typeof val === 'string' ? val : val.stops[0].color)}
                         forceMode="solid"
                         isBackgroundProp={true}
                       />
                     </PopoverContent>
                   </Popover>
                </div>

                 <div className="flex-1 space-y-1">
                    <Label className="text-[10px] text-muted-foreground block text-center">Text</Label>
                    <Popover open={isTextPopoverOpen} onOpenChange={setIsTextPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full h-6 p-0 justify-center border">
                          <div className="h-full w-full"
                            style={{ backgroundColor: currentThemeEdit.typography?.paragraph?.color }}
                          />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56">
                        <GradientPicker
                          value={currentThemeEdit.typography?.paragraph?.color || '#000000'}
                          onChange={(val) => updateThemeValue('typography.paragraph.color', typeof val === 'string' ? val : val.stops[0].color)}
                          forceMode="solid"
                        />
                      </PopoverContent>
                    </Popover>
                 </div>

                 <div className="flex-1 space-y-1">
                    <Label className="text-[10px] text-muted-foreground block text-center">Accent</Label>
                    <Popover open={isAccentPopoverOpen} onOpenChange={setIsAccentPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full h-6 p-0 justify-center border">
                           <div className="h-full w-full"
                             style={{ backgroundColor: currentThemeEdit.accent1 }}
                           />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56">
                        <GradientPicker
                          value={currentThemeEdit.accent1 || '#4287f5'}
                          onChange={(val) => updateThemeValue('accent1', typeof val === 'string' ? val : val.stops[0].color)}
                          forceMode="solid"
                        />
                      </PopoverContent>
                    </Popover>
                 </div>
             </div>
          </div>
          
        </div>
      <div className="flex justify-end space-x-2 pt-2">
          <Button
            variant="outline"
            onClick={handleUndoThemeChange}
            disabled={!canUndoDeck()}
            className="h-8 text-xs"
            title="Undo last theme change"
          >
            <Undo2 className="h-3.5 w-3.5 mr-1"/> Undo
          </Button>
          <Button
            variant="default"
            onClick={applyCurrentThemeEdit}
            className="h-8 text-xs"
          >
            Apply Theme
          </Button>
      </div>
    </div>
  );
};

export default ThemePanel;