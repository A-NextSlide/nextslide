import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { Theme, initialWorkspaceTheme } from '@/types/themes';
import { useShallow } from 'zustand/react/shallow';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { FontLoadingService } from '@/services/FontLoadingService';
import { FontApiService } from '@/services/FontApiService';
import GroupedDropdown from '../settings/GroupedDropdown';
import GradientPicker from '../GradientPicker';
import { useDeckStore } from '@/stores/deckStore';
import { useHistoryStore } from '@/stores/historyStore';
import { invalidateStamp } from '@/stamps/stampCache';
import { Loader2, Undo2, Sparkles, Wand2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/stores/editorStore';
import TemplateSketchLoader from './TemplateSketchLoader';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { buildThemeSlideUpdates } from './themeApplier';
import { generateHuemintThemes } from './themeGeneration';
import { useFontCatalog } from '@/hooks/useFontCatalog';
import { normalizeThemeWeights } from '@/utils/themeTypography';

export interface ThemePanelProps {
  onClose?: () => void;
}

const cloneTheme = (theme: Theme): Theme => {
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(theme);
    }
  } catch {}
  return JSON.parse(JSON.stringify(theme));
};

const ThemePanel: React.FC<ThemePanelProps> = ({ onClose }) => {
  const availableThemes = useThemeStore(state => state.availableThemes);
  const workspaceThemeId = useThemeStore(state => state.workspaceThemeId);
  const setWorkspaceTheme = useThemeStore(state => state.setWorkspaceTheme);
  const addCustomTheme = useThemeStore(state => state.addCustomTheme);
  const updateCustomTheme = useThemeStore(state => state.updateCustomTheme);
  const deckData = useDeckStore(state => state.deckData);
  const allSlideIds = useDeckStore(useShallow(state => state.deckData.slides.map(slide => slide.id)));
  const batchUpdateSlideComponents = useDeckStore(state => state.batchUpdateSlideComponents);
  const { addDeckHistory, undoDeck, canUndoDeck, addToHistory } = useHistoryStore();
  const setDraftComponentsForSlide = useEditorStore(state => state.setDraftComponentsForSlide);

  const workspaceTheme = useMemo(() => {
    return availableThemes.find(theme => theme.id === workspaceThemeId) || initialWorkspaceTheme;
  }, [availableThemes, workspaceThemeId]);

  const [currentThemeEdit, setCurrentThemeEdit] = useState<Theme>({ ...workspaceTheme });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedThemes, setGeneratedThemes] = useState<Theme[]>([]);
  const [isBgPopoverOpen, setIsBgPopoverOpen] = useState(false);
  const [isTextPopoverOpen, setIsTextPopoverOpen] = useState(false);
  const [isAccentPopoverOpen, setIsAccentPopoverOpen] = useState(false);
  const [customColors, setCustomColors] = useState<string[]>([]);
  const [activeColorPopover, setActiveColorPopover] = useState<number | null>(null);
  const previousWorkspaceThemeId = useRef(workspaceThemeId);
  const [dbPalettes, setDbPalettes] = useState<Array<{ id: string; name: string; colors: string[] }>>([]);
  const [recommendedFonts, setRecommendedFonts] = useState<{ hero?: string; body?: string } | null>(null);
  const stylePrefs = deckData.outline?.stylePreferences;
  const vibeContext = useMemo(() => (stylePrefs?.vibeContext || stylePrefs?.initialIdea || '').trim(), [
    stylePrefs?.vibeContext,
    stylePrefs?.initialIdea
  ]);

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
    const newTheme = cloneTheme(currentThemeEdit);

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

    const normalizedTheme = normalizeThemeWeights(newTheme);
    setCurrentThemeEdit(normalizedTheme);
    // Live real-time apply without history
    try {
      applySpecificTheme(normalizedTheme);
    } catch (e) {
      console.warn('[ThemePanel] Live apply failed:', e);
    }
  };

  const applySpecificTheme = (themeToApply: Theme, recordHistory: boolean = false) => {
    if (!themeToApply?.page?.backgroundColor ||
        !themeToApply?.typography?.paragraph?.color ||
        !themeToApply?.typography?.paragraph?.fontFamily ||
        !themeToApply?.accent1) {
      console.error('Theme is missing required properties', themeToApply);
      return;
    }

    if (allSlideIds.length === 0) {
      console.warn('[ThemePanel] No slides found for theme application');
      return;
    }

    const updates = buildThemeSlideUpdates({
      theme: themeToApply,
      slides: deckData.slides,
      slideIds: allSlideIds
    });

    if (updates.length === 0) {
      console.warn('[ThemePanel] No component changes detected for theme application');
      return;
    }

    const slideById = new Map(deckData.slides.map(slide => [slide.id, slide]));

    if (recordHistory) {
      updates.forEach(({ slideId }) => {
        const slide = slideById.get(slideId);
        if (!slide) return;
        try {
          addToHistory(slideId, slide.components);
        } catch (e) {
          console.warn('[ThemePanel] addToHistory (before) failed for', slideId, e);
        }
      });
    }

    batchUpdateSlideComponents(updates);

    if (recordHistory) {
      updates.forEach(({ slideId, components }) => {
        try {
          addToHistory(slideId, components);
        } catch (e) {
          console.warn('[ThemePanel] addToHistory (after) failed for', slideId, e);
        }
      });
    }

    updates.forEach(({ slideId }) => {
      invalidateStamp(slideId);
    });
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
    saveAndApplyTheme(theme);
  };

  const generateThemes = async () => {
    setIsGenerating(true);
    setGeneratedThemes([]);

    try {
      const deckTitle = useDeckStore.getState().deckData.title || 'Presentation';
      const slideSnippets = useDeckStore.getState().deckData.slides as Array<{ title?: string; content?: string }>;
      const keywords: string[] = (slideSnippets || [])
        .slice(0, 8)
        .flatMap(s => [s.title, s.content])
        .filter(Boolean) as string[];

      const themes = (await generateHuemintThemes({
        currentTheme: currentThemeEdit,
        deckTitle,
        keywords,
        vibe: vibeContext
      })).map(normalizeThemeWeights);

      setGeneratedThemes(themes);
    } catch (error) {
      console.error('Failed to generate themes:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const { groups: fontGroups } = useFontCatalog();
  const fontOptions = useMemo(() => FontLoadingService.getAllFontNames(), [fontGroups]);

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
        const keywords: string[] = (useDeckStore.getState().deckData.slides || [])
          .slice(0, 8)
          .flatMap(s => [s.title, s.content])
          .filter(Boolean) as string[];
        const rec = await FontApiService.recommend({
          deck_title: deckTitle,
          vibe: vibeContext,
          content_keywords: keywords
        });
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

          <div className="space-y-2">
             <Label className="text-[11px] font-medium">Theme Colors</Label>
             <div className="flex items-center gap-1">
               {/* Background Color */}
               <Popover open={isBgPopoverOpen} onOpenChange={setIsBgPopoverOpen}>
                 <PopoverTrigger asChild>
                   <Button
                     variant="outline"
                     className="h-12 w-12 p-0 rounded-md border-2 hover:border-primary transition-colors"
                     title="Background Color"
                   >
                     <div
                       className="h-full w-full rounded-sm"
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

               {/* Text Color */}
               <Popover open={isTextPopoverOpen} onOpenChange={setIsTextPopoverOpen}>
                 <PopoverTrigger asChild>
                   <Button
                     variant="outline"
                     className="h-12 w-12 p-0 rounded-md border-2 hover:border-primary transition-colors"
                     title="Text Color"
                   >
                     <div
                       className="h-full w-full rounded-sm"
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

               {/* Accent Color */}
               <Popover open={isAccentPopoverOpen} onOpenChange={setIsAccentPopoverOpen}>
                 <PopoverTrigger asChild>
                   <Button
                     variant="outline"
                     className="h-12 w-12 p-0 rounded-md border-2 hover:border-primary transition-colors"
                     title="Accent Color"
                   >
                     <div
                       className="h-full w-full rounded-sm"
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

               {/* Custom Colors */}
               {customColors.map((color, index) => (
                 <Popover
                   key={index}
                   open={activeColorPopover === index}
                   onOpenChange={(open) => setActiveColorPopover(open ? index : null)}
                 >
                   <PopoverTrigger asChild>
                     <Button
                       variant="outline"
                       className="h-12 w-12 p-0 rounded-md border-2 hover:border-primary transition-colors"
                       title={`Custom Color ${index + 1}`}
                     >
                       <div
                         className="h-full w-full rounded-sm"
                         style={{ backgroundColor: color }}
                       />
                     </Button>
                   </PopoverTrigger>
                   <PopoverContent className="w-56">
                     <GradientPicker
                       value={color}
                       onChange={(val) => {
                         const newColors = [...customColors];
                         newColors[index] = typeof val === 'string' ? val : val.stops[0].color;
                         setCustomColors(newColors);
                       }}
                       forceMode="solid"
                     />
                   </PopoverContent>
                 </Popover>
               ))}

               {/* Add Color Button */}
               <Button
                 variant="outline"
                 size="icon"
                 className="h-12 w-12 rounded-md border-2 border-dashed hover:border-primary transition-colors"
                 onClick={() => setCustomColors([...customColors, '#4287f5'])}
                 title="Add Color"
               >
                 <Plus className="h-4 w-4" />
               </Button>
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
