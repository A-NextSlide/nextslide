import { useState, useRef, useCallback } from 'react';
import { DeckOutline, SlideOutline, TaggedMedia, ColorConfig } from '@/types/SlideTypes';
import { outlineApi, ProgressUpdate, StreamingEvent } from '@/services/outlineApi';
import { useToast } from '@/hooks/use-toast';
import { useDeckStore } from '@/stores/deckStore';
import { v4 as uuidv4 } from 'uuid';
import { useThemeStore } from '@/stores/themeStore';
import { initialWorkspaceTheme } from '@/types/themes';

interface UseOutlineChatProps {
  initialIdea: string; // Main presentation idea/prompt
  styleVibeText?: string; // Additional context for style/vibe
  selectedFont?: string | null;
  colorConfig?: ColorConfig | null;
  autoSelectImages?: boolean;
  enableResearch?: boolean;
  referenceLinks?: string[];
  uploadedFiles: File[];
  setCurrentOutline: React.Dispatch<React.SetStateAction<DeckOutline | null>>;
  setUploadedFiles?: React.Dispatch<React.SetStateAction<File[]>>;
  detailLevel?: 'quick' | 'standard' | 'detailed';
  slideCount?: number | null;
  onOutlineStructure?: (title: string, slideTitles: string[]) => void;
  onSlideComplete?: (slideIndex: number, slide: any) => void;
  setNarrativeFlow?: React.Dispatch<React.SetStateAction<any>>;
}

export const useOutlineChat = ({
  initialIdea,      // Now a direct prop for the core prompt
  styleVibeText,
  selectedFont,
  colorConfig,
  autoSelectImages = false,
  enableResearch = false,
  referenceLinks = [],
  uploadedFiles,
  setCurrentOutline,
  setUploadedFiles,
  detailLevel = 'standard',
  slideCount,
  onOutlineStructure,
  onSlideComplete,
  setNarrativeFlow,
}: UseOutlineChatProps) => {
  // This chatInput state is primarily for the temporary input field in ChatInputView if OutlineEditor
  // doesn't directly control ChatInputView's input field prop for each step.
  // Given our current setup where OutlineEditor *does* control ChatInputView's input via its own chatInput state,
  // this internal chatInput here might be redundant or only used for the initial value passed to OutlineEditor.
  const [chatInput, setChatInput] = useState(''); 
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingStage, setLoadingStage] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<{ message: string; stage: string } | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [outlineStructureInfo, setOutlineStructureInfo] = useState<{ title: string; slideTitles: string[], expectedCount: number } | null>(null);
  const [processedSlidesCount, setProcessedSlidesCount] = useState(0);
  // Track which slide indices have completed (to handle out-of-order and avoid duplicates)
  const completedSlideIndicesRef = useRef<Set<number>>(new Set());
  const [isAnalyzingFiles, setIsAnalyzingFiles] = useState(false);
  const [currentAnalyzingFile, setCurrentAnalyzingFile] = useState<string>('');
  const [analyzingFileProgress, setAnalyzingFileProgress] = useState<{ current: number; total: number } | undefined>();
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null); // Keep ref for auto-resize if needed
  const { toast } = useToast();
  
  // Track research events and theme events for the thinking process display
  const [researchEvents, setResearchEvents] = useState<any[]>([]);

  const handleResetInput = () => {
    setChatInput('');
    setProgress(null);
    setOutlineStructureInfo(null);
    setProcessedSlidesCount(0);
    completedSlideIndicesRef.current = new Set();
    // Don't reset research events - keep them visible until manual reset
    // setResearchEvents([]); // Reset research events
    // If these setters are provided, also reset files
    if (setUploadedFiles) {
        setUploadedFiles([]);
    }
    if (chatTextareaRef.current) {
      chatTextareaRef.current.style.height = 'auto'; // Reset height
    }
  };

  // Progress update handler with structure callback
  const handleProgressUpdate = useCallback((event: ProgressUpdate | StreamingEvent) => {
    console.warn('[useOutlineChat] Progress update received:', event);
    console.warn('[useOutlineChat] Event type:', (event as any).type);
    console.warn('[useOutlineChat] Full event object:', JSON.stringify(event, null, 2));
    
    // Ensure we process the event
    try {
      // console.log('[useOutlineChat] Event message:', (event as any).message);
      // console.log('[useOutlineChat] Event stage:', (event as any).stage);
    
    // Handle both old ProgressUpdate and new StreamingEvent formats
    if ('type' in event) {
      // New StreamingEvent format
      console.warn('[useOutlineChat] Event received:', event.type, 'full event:', JSON.stringify(event).substring(0, 200));
      
      // Track research/theme events FIRST before any other processing
      // Also check if event has a message that looks like research
      const looksLikeResearch = event.type && (
        event.type.startsWith('research_') || 
        ['agent_event', 'tool_call', 'tool_result', 'artifact'].includes(event.type) ||
        (event.type === 'progress' && event.message && (
          event.message.toLowerCase().includes('research') ||
          event.message.toLowerCase().includes('searching') ||
          event.message.toLowerCase().includes('analyzing')
        ))
      );
      
      if (looksLikeResearch) {
        console.warn('[useOutlineChat] Got research event:', event.type, event);
        setResearchEvents(prev => {
          const updated = [...prev, event];
          // Store in window for debugging without console spam
          if (typeof window !== 'undefined') {
            (window as any).__DEBUG_RESEARCH_EVENTS__ = updated;
            console.warn('[useOutlineChat] Set window.__DEBUG_RESEARCH_EVENTS__:', updated.length, 'events:', updated);
          }
          return updated;
        });
      }
      
      switch (event.type as any) {
        case 'research_plan':
          // Optimistically show placeholder outline cards during research phase
          try {
            setCurrentOutline(prev => {
              if (prev && prev.slides && prev.slides.length > 0) return prev;
              const estimatedCount = (slideCount && slideCount > 0)
                ? slideCount
                : (detailLevel === 'detailed' ? 10 : detailLevel === 'quick' ? 3 : 6);
              const placeholderSlides: SlideOutline[] = Array.from({ length: estimatedCount }).map((_, idx) => ({
                id: uuidv4(),
                title: `Slide ${idx + 1}`,
                content: '',
                deepResearch: false,
                taggedMedia: []
              }));
              const newOutline: DeckOutline = {
                id: uuidv4(),
                title: 'Generating your outline…',
                slides: placeholderSlides
              };
              return newOutline;
            });
          } catch {}
          // Also track the event for thinking UI
          setResearchEvents(prev => [...prev, event]);
          break;
        case 'progress':
          // Heuristic: infer research thinking events from progress stage/message
          try {
            const lowerStage = (event.stage || '').toLowerCase();
            const lowerMsg = (event.message || '').toLowerCase();
            const looksLikeResearch = lowerStage.includes('research') || lowerMsg.includes('research') || lowerMsg.includes('search') || lowerMsg.includes('synthesis');
            if (looksLikeResearch) {
              setResearchEvents(prev => {
                // avoid runaway duplicates by only adding if last different
                const last = prev[prev.length - 1];
                if (!last || last.type !== 'research_started') {
                  return [...prev, { type: 'research_started', message: event.message || 'Starting research...', progress: event.percent ?? event.progress }];
                }
                return prev;
              });
            }
          } catch {}

          setLoadingStatus({
            message: event.message || 'Processing...',
            stage: event.stage || 'processing'
          });
          if (event.percent !== undefined) {
            setProgress({ current: event.percent, total: 100 });
          } else if (event.progress !== undefined) {
            setProgress({ current: event.progress, total: 100 });
          }
          
          // Track file analysis
          if (event.message) {
                          // console.log('[useOutlineChat] Checking message for file analysis:', event.message);
            
            // Check for stage pattern with file processing
            const stageMatch = event.message.match(/^(Stage \d+\/\d+):?\s*(.*)$/);
            if (stageMatch) {
              const remainingText = stageMatch[2];
                              // console.log('[useOutlineChat] Stage match found, remaining text:', remainingText);
              
              // Check if it's file processing
              if (remainingText.includes('Uploaded file') || remainingText.includes('Processing file') || remainingText.includes('Analyzing')) {
                                  // console.log('[useOutlineChat] Setting isAnalyzingFiles to true');
                setIsAnalyzingFiles(true);
                
                // Extract filename if present
                const fileMatch = remainingText.match(/^(.*?)\s*-\s*(.+)$/);
                if (fileMatch) {
                  setCurrentAnalyzingFile(fileMatch[2].trim());
                }
                
                // Extract file progress
                const progressMatch = remainingText.match(/(\d+)\s*\/\s*(\d+)/);
                if (progressMatch) {
                  setAnalyzingFileProgress({ current: parseInt(progressMatch[1]), total: parseInt(progressMatch[2]) });
                }
              }
            } else if (event.stage === 'analyzing' || 
                       event.message.toLowerCase().includes('analyzing') || 
                       event.message.toLowerCase().includes('processing file')) {
              setIsAnalyzingFiles(true);
            } else if (event.message.includes('File analysis complete') || 
                       event.message.includes('Generating outline structure') ||
                       event.stage === 'outline_structure' ||
                       event.stage === 'generating_slides') {
              setIsAnalyzingFiles(false);
              setCurrentAnalyzingFile('');
              setAnalyzingFileProgress(undefined);
            }
          }
          break;
          
        case 'outline_structure':
          console.warn('[useOutlineChat] Received outline structure:', event);
          // Mark research complete when structure arrives
          setResearchEvents(prev => {
            // Check if we already have a research_complete event
            const hasComplete = prev.some(e => e.type === 'research_complete');
            if (!hasComplete) {
              return [...prev, { type: 'research_complete', findings: [], progress: 100 }];
            }
            return prev;
          });
          if (onOutlineStructure && event.title && event.slideTitles) {
            // Extract slide titles, handling both string array and object array formats
            const extractedTitles = event.slideTitles.map((slideTitle: any) => {
              if (typeof slideTitle === 'string') {
                return slideTitle;
              } else if (typeof slideTitle === 'object' && slideTitle !== null) {
                // Handle object format - extract title from common properties
                return slideTitle.slide_title || slideTitle.title || 'Untitled';
              }
              return 'Untitled';
            });
            
            console.log('[useOutlineChat] Extracted slide titles:', extractedTitles);
            onOutlineStructure(event.title, extractedTitles);
          }
          setOutlineStructureInfo({
            title: event.title || '',
            slideTitles: event.slideTitles || [],
            expectedCount: event.slideCount || 0
          });
          // Initialize slide-based progress for outline generation
          if (event.slideCount && event.slideCount > 0) {
            setProgress({ current: 0, total: event.slideCount });
          }

          // **NEW: Initialize outline with placeholder slides immediately**
          if (event.title && event.slideTitles && event.slideCount > 0) {
            console.warn('[useOutlineChat] Creating placeholder outline with', event.slideCount, 'slides');
            setCurrentOutline(prev => {
              // If we already have an outline, preserve it (e.g., during re-generation)
              if (prev && prev.slides.length > 0) return prev;

              // Create initial outline with placeholder slides
              const placeholderSlides: SlideOutline[] = event.slideTitles.map((slideTitle: any, idx: number) => {
                const title = typeof slideTitle === 'string' 
                  ? slideTitle 
                  : (slideTitle?.slide_title || slideTitle?.title || `Slide ${idx + 1}`);
                
                return {
                  id: uuidv4(),
                  title,
                  content: '',
                  deepResearch: false,
                  taggedMedia: []
                };
              });

              const newOutline: DeckOutline = {
                id: uuidv4(),
                title: event.title,
                slides: placeholderSlides
              };

              console.log('[useOutlineChat] Created placeholder outline:', newOutline);
              return newOutline;
            });
          }
          break;
          
        case 'slide_complete':
          console.warn('[useOutlineChat] Slide complete:', event);
          console.warn('[useOutlineChat] Slide data:', event.slide);
          console.warn('[useOutlineChat] Slide index:', event.slideIndex);
          if (event.slideIndex !== undefined && event.slide) {
            // Emit the update to the OutlineEditor
            if (onSlideComplete) {
              onSlideComplete(event.slideIndex, event.slide);
            }

            // Update completed slide tracking
            if (!completedSlideIndicesRef.current.has(event.slideIndex)) {
              completedSlideIndicesRef.current.add(event.slideIndex);
              setProcessedSlidesCount(prev => prev + 1);
            }

            // Update slide-based progress (current/total) if we know the total
            const totalSlides = outlineStructureInfo?.expectedCount || null;
            if (totalSlides && totalSlides > 0) {
              const currentCompleted = completedSlideIndicesRef.current.size;
              setProgress({ current: Math.min(currentCompleted, totalSlides), total: totalSlides });
            }

            // **NEW: Progressively build the outline by updating slides as they complete**
            setCurrentOutline(prev => {
              console.warn('[useOutlineChat] Updating outline with slide', event.slideIndex, '- previous outline:', prev);
              
              if (!prev) {
                console.log('[useOutlineChat] No previous outline, creating new one');
                // If no outline exists yet, create one with structure info
                const newOutline: DeckOutline = {
                  id: outlineStructureInfo?.title ? uuidv4() : '',
                  title: outlineStructureInfo?.title || 'Untitled Presentation',
                  slides: Array(totalSlides || event.slideIndex + 1).fill(null).map((_, idx) => ({
                    id: uuidv4(),
                    title: outlineStructureInfo?.slideTitles?.[idx] || `Slide ${idx + 1}`,
                    content: '',
                    deepResearch: false,
                    taggedMedia: []
                  }))
                };
                // Update the specific slide with the completed data
                if (newOutline.slides[event.slideIndex]) {
                  newOutline.slides[event.slideIndex] = {
                    ...event.slide,
                    id: event.slide.id || newOutline.slides[event.slideIndex].id,
                    deepResearch: (event.slide as any).deepResearch || false
                  };
                }
                console.log('[useOutlineChat] Created new outline with slide content:', newOutline);
                return newOutline;
              }

              // Update existing outline with the completed slide
              const updatedSlides = [...prev.slides];
              
              // Ensure array is large enough
              while (updatedSlides.length <= event.slideIndex) {
                updatedSlides.push({
                  id: uuidv4(),
                  title: outlineStructureInfo?.slideTitles?.[updatedSlides.length] || `Slide ${updatedSlides.length + 1}`,
                  content: '',
                  deepResearch: false,
                  taggedMedia: []
                });
              }

              // Update the specific slide with streaming data
              console.log('[useOutlineChat] Updating slide at index', event.slideIndex, 'with content');
              updatedSlides[event.slideIndex] = {
                ...updatedSlides[event.slideIndex],
                ...event.slide,
                id: event.slide.id || updatedSlides[event.slideIndex].id,
                // Preserve existing tagged media if present
                taggedMedia: (updatedSlides[event.slideIndex].taggedMedia && updatedSlides[event.slideIndex].taggedMedia.length > 0)
                  ? updatedSlides[event.slideIndex].taggedMedia
                  : (event.slide.taggedMedia || [])
              };

              const updatedOutline = {
                ...prev,
                slides: updatedSlides
              };
              
              console.log('[useOutlineChat] Updated outline:', updatedOutline);
              return updatedOutline;
            });
          }
          break;
          
        case 'outline_complete':
          // Merge final outline data to avoid remounting cards and losing edit state
          // Ensure research visually completes
          setResearchEvents(prev => ([...prev, { type: 'research_complete', findings: [], progress: 100 }]));
          if (event.outline && setCurrentOutline) {
            const finalOutline = event.outline as any;
            setCurrentOutline(prev => {
              if (!prev) return finalOutline;
              // Build a merged outline that preserves existing slide IDs/content and augments media/narrative
              const byId = new Map(prev.slides.map(s => [s.id, s] as const));
              const finalSlides: any[] = Array.isArray(finalOutline.slides) ? finalOutline.slides : [];
              const hasFinalSlides = finalSlides.length > 0;
              const mergedSlides = hasFinalSlides
                ? finalSlides.map((finalSlide: any, index: number) => {
                    const existingById = finalSlide?.id ? byId.get(finalSlide.id) : undefined;
                    const existingByIndex = prev.slides[index];
                    const base = existingById || existingByIndex || finalSlide;
                    // Prefer existing id to avoid remounts
                    const id = base.id || finalSlide.id;
                    // Keep existing content if present; otherwise use final content
                    const content = (base.content && base.content.trim() !== '') ? base.content : (finalSlide.content || '');
                    // Preserve deepResearch flag from existing
                    const deepResearch = Boolean(base.deepResearch);
                    // Merge tagged media, preferring existing if already present
                    const taggedMedia = (base.taggedMedia && base.taggedMedia.length > 0)
                      ? base.taggedMedia
                      : (finalSlide.taggedMedia || []);
                    // Carry extractedData from either side
                    const extractedData = base.extractedData || finalSlide.extractedData;
                    return {
                      ...base,
                      id,
                      title: finalSlide.title || base.title,
                      content,
                      deepResearch,
                      taggedMedia,
                      extractedData,
                    };
                  })
                : prev.slides; // Do NOT clear slides if backend returned an empty array
              return {
                ...prev,
                id: prev.id || finalOutline.id,
                title: finalOutline.title || prev.title,
                slides: mergedSlides,
                narrativeFlow: (event as any).narrative_flow || prev.narrativeFlow,
                // Prefer backend-provided stylePreferences when available
                stylePreferences: (finalOutline as any).stylePreferences || prev.stylePreferences,
              };
            });
          }

          // If we have a narrative flow in the event, save it also to deck notes
          if (event.narrative_flow) {
            const currentDeck = useDeckStore.getState().deckData;
            if (currentDeck && currentDeck.uuid) {
              useDeckStore.getState().updateDeckData({
                ...currentDeck,
                notes: event.narrative_flow
              });
            }
          }

          // Immediately apply brand theme derived from stylePreferences (only if real palette exists)
          try {
            const outline: any = (event as any).outline;
            const sp = outline?.stylePreferences || {};
            const colors = sp.colors || {};
            const allColorValues: string[] = [];
            const pushIfValid = (v?: string) => {
              if (typeof v === 'string' && v.trim() && !allColorValues.includes(v)) allColorValues.push(v);
            };
            pushIfValid(colors.accent1);
            pushIfValid(colors.accent2);
            pushIfValid(colors.accent3);
            pushIfValid(colors.background);
            pushIfValid(colors.text);

            // Determine if palette is meaningful (not just black/white/greys)
            const isNeutralHex = (hex?: string) => {
              if (!hex || typeof hex !== 'string') return false;
              const h = hex.trim().replace('#','');
              if (h.length !== 6) return false;
              const r = parseInt(h.slice(0,2), 16);
              const g = parseInt(h.slice(2,4), 16);
              const b = parseInt(h.slice(4,6), 16);
              const sum = r + g + b;
              if (sum >= 3*240) return true; // near-white
              if (sum <= 3*20) return true;  // near-black
              const maxc = Math.max(r,g,b), minc = Math.min(r,g,b);
              return (maxc - minc) <= 8;     // low chroma grey
            };
            const uniqueUpper = (arr: string[]) => Array.from(new Set(arr.map(c => (c || '').toUpperCase())));
            const meaningful = uniqueUpper(allColorValues.filter(c => !isNeutralHex(c)));
            // Prefer explicit palette colors if provided by backend in stylePreferences (if ever present)
            const spPaletteColors: string[] = Array.isArray((sp as any)?.palette?.colors)
              ? (((sp as any).palette.colors as any[]).filter(x => typeof x === 'string') as string[])
              : [];
            const accentsCandidate: Array<string | undefined> = [
              (colors as any).accent1,
              (colors as any).accent2,
              (colors as any).accent3,
            ];
            const combinedAccents = accentsCandidate
              .concat(spPaletteColors)
              .filter((c): c is string => typeof c === 'string' && c.trim().length > 0);
            const meaningfulAccents = uniqueUpper(combinedAccents.filter(c => !isNeutralHex(c)));
            const hasMeaningfulPalette = (meaningfulAccents.length >= 1) || (meaningful.length >= 2);

            if (hasMeaningfulPalette) {
              const palette: any = { metadata: sp.logoUrl ? { logo_url: sp.logoUrl } : {} };
              if (colors.background) palette.primary_background = colors.background;
              if (colors.text) palette.primary_text = colors.text;
              const extraColors: string[] = (meaningfulAccents.length > 0 ? meaningfulAccents : meaningful).slice(0, 6);
              if (extraColors.length > 0) palette.colors = extraColors;
              const resolvedFont = (typeof sp.font === 'string' && sp.font.trim() && !sp.font.includes('var(')) ? sp.font : 'Inter';
              const typography = {
                hero_title: { family: resolvedFont },
                body_text: { family: resolvedFont }
              };
              const themePayload = {
                theme_name: sp.vibeContext ? `${String(sp.vibeContext).replace('.com','').replace('www.','').trim().replace(/\b\w/g, (c: string) => c.toUpperCase())} Brand Theme` : 'Brand Theme',
                color_palette: palette,
                typography,
                brandInfo: sp.logoUrl ? { logoUrl: sp.logoUrl } : {},
                visual_style: {}
              };
              try {
                const count = Array.isArray(palette.colors) ? palette.colors.length : 0;
                console.warn('[useOutlineChat] Dispatching initial theme_preview_update', { count, palette, typography });
              } catch {}
              const detail = { theme: themePayload, palette, typography, ...(sp.logoUrl ? { logo: { url: sp.logoUrl, source: 'style_preferences' as const } } : {}) };
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('theme_preview_update', { detail }));
              }

              // If we only have 1–2 colors, immediately request a full theme to enrich extras
              const colorCount = Array.isArray(palette.colors) ? palette.colors.length : 0;
              if (colorCount < 3 && outline) {
                try {
                  void outlineApi.generateThemeFromOutline(outline, undefined, (evt) => {
                    try {
                      let d: any = null;
                      if ((evt as any).type === 'artifact' && String((evt as any).kind).toLowerCase() === 'theme_json') {
                        const theme = (evt as any)?.content?.deck_theme || (evt as any)?.content?.theme || (evt as any)?.content;
                        const palette2 = theme?.color_palette || (evt as any)?.content?.palette;
                        d = { theme, palette: palette2, typography: theme?.typography };
                        try {
                          const colors = (palette2?.colors || theme?.color_palette?.colors || []) as any[];
                          console.warn('[useOutlineChat] Received theme artifact', { colorsCount: colors.length, palette: palette2 });
                        } catch {}
                      } else if ((evt as any).type === 'theme_generated') {
                        d = { theme: (evt as any).theme, palette: (evt as any).palette, typography: (evt as any).theme?.typography };
                        try {
                          const colors = ((evt as any).palette?.colors || (evt as any).theme?.color_palette?.colors || []) as any[];
                          console.warn('[useOutlineChat] Received theme_generated', { colorsCount: colors.length, palette: (evt as any).palette });
                        } catch {}
                      }
                      if (d) {
                        window.dispatchEvent(new CustomEvent('theme_preview_update', { detail: d }));
                      }
                    } catch {}
                  });
                } catch {}
              }
            }

            // If backend didn't include a meaningful brand palette, fall back to client theme generation
            const needsTheme = !hasMeaningfulPalette;
            if (needsTheme && outline) {
              try {
                // Kick off client-side theme generation without blocking
                void outlineApi.generateThemeFromOutline(outline, undefined, (evt) => {
                  try {
                    let d: any = null;
                    if ((evt as any).type === 'artifact' && String((evt as any).kind).toLowerCase() === 'theme_json') {
                      const theme = (evt as any)?.content?.deck_theme || (evt as any)?.content?.theme || (evt as any)?.content;
                      const palette2 = theme?.color_palette || (evt as any)?.content?.palette;
                      d = { theme, palette: palette2, typography: theme?.typography };
                      try {
                        const colors = (palette2?.colors || theme?.color_palette?.colors || []) as any[];
                        console.warn('[useOutlineChat] Received theme artifact (no-meaningful fallback)', { colorsCount: colors.length, palette: palette2 });
                      } catch {}
                    } else if ((evt as any).type === 'theme_generated') {
                      d = { theme: (evt as any).theme, palette: (evt as any).palette, typography: (evt as any).theme?.typography };
                      try {
                        const colors = ((evt as any).palette?.colors || (evt as any).theme?.color_palette?.colors || []) as any[];
                        console.warn('[useOutlineChat] Received theme_generated (no-meaningful fallback)', { colorsCount: colors.length, palette: (evt as any).palette });
                      } catch {}
                    }
                    if (d) {
                      window.dispatchEvent(new CustomEvent('theme_preview_update', { detail: d }));
                    }
                  } catch {}
                });
              } catch {}
            }
          } catch (err) {
            // Swallow theme derivation errors
          }

          break;

        case 'narrative_flow_started':
          setLoadingStatus({ message: 'Analyzing narrative flow…', stage: 'narrative' });
          break;

        case 'narrative_flow_ready':
          // Render narrative flow immediately in outline page and save to store
          if ((event as any).notes) {
            if (setCurrentOutline) {
              setCurrentOutline(prev => prev ? { ...prev, narrativeFlow: (event as any).notes } : prev);
            }
            const currentDeck = useDeckStore.getState().deckData;
            if (currentDeck && currentDeck.uuid) {
              useDeckStore.getState().updateDeckData({ ...currentDeck, notes: (event as any).notes });
            }
          }
          setLoadingStatus({ message: 'Narrative ready', stage: 'narrative_ready' });
          break;

        case 'narrative_flow_pending':
          setLoadingStatus({ message: 'Narrative is still generating…', stage: 'narrative_pending' });

          break;
          // Finalize slide-based progress to all slides completed if we know expectedCount
          if (outlineStructureInfo?.expectedCount) {
            setProgress({ current: outlineStructureInfo.expectedCount, total: outlineStructureInfo.expectedCount });
          } else {
            // Fallback to percent format if slide count is unknown
            setProgress({ current: 100, total: 100 });
          }
          setIsGenerating(false);
          break;
          
        case 'data':
          // Handle new deck creation events
          if (event.data) {
            const data = event.data;
            // Capture nested agent/tool/research events from event bus
            try {
              if (data.type && (data.type.startsWith?.('research_') || ['agent_event', 'tool_call', 'tool_result', 'artifact'].includes(data.type))) {
                setResearchEvents(prev => ([...prev, data]));
              }
            } catch {}
            switch (data.type) {
              case 'deck_creation_started':
                setLoadingStatus({
                  message: data.message || 'Creating deck...',
                  stage: 'deck_init'
                });
                break;
                
              case 'progress':
                // Handle nested progress events
                setLoadingStatus({
                  message: data.message || 'Processing...',
                  stage: data.stage || 'processing'
                });
                if (data.progress !== undefined) {
                  setProgress({ current: data.progress, total: 100 });
                }
                break;
                
              default:
                // Log other data events
// console.log('[useOutlineChat] Data event:', data);
            }
          }
          break;
          
        case 'complete':
          setLoadingStatus({
            message: event.message || 'Complete',
            stage: 'complete'
          });
          setProgress({ current: 100, total: 100 });
          setIsGenerating(false);
          break;
          
        case 'error':
          console.error('[useOutlineChat] Error event:', event);
          setLoadingStatus({
            message: event.error || event.message || 'An error occurred',
            stage: 'error'
          });
          setIsGenerating(false);
          break;
          
        default:
          // Handle other event types with minimal logging
          if (event.message) {
            setLoadingStatus({
              message: event.message,
              stage: event.type
            });
          }
      }
    } else {
      // Handle legacy progress update format (shouldn't happen with new backend)
      const progressUpdate = event as ProgressUpdate;
      const displayMessage = progressUpdate.message || `Processing: ${progressUpdate.stage}`;
      
      setLoadingStage(displayMessage);
      setLoadingStatus({
        message: displayMessage,
        stage: progressUpdate.stage || 'unknown'
      });
      
      if (progressUpdate.progress !== undefined) {
        setProgress({ current: progressUpdate.progress, total: 100 });
      }
      
      // Track file analysis in legacy format
      if (progressUpdate.message) {
        // Check for stage pattern with file processing
        const stageMatch = progressUpdate.message.match(/^(Stage \d+\/\d+):?\s*(.*)$/);
        if (stageMatch) {
          const remainingText = stageMatch[2];
          // Check if it's file processing
          if (remainingText.includes('Uploaded file') || remainingText.includes('Processing file') || remainingText.includes('Analyzing')) {
            setIsAnalyzingFiles(true);
            
            // Extract filename if present
            const fileMatch = remainingText.match(/^(.*?)\s*-\s*(.+)$/);
            if (fileMatch) {
              setCurrentAnalyzingFile(fileMatch[2].trim());
            }
            
            // Extract file progress
            const progressMatch = remainingText.match(/(\d+)\s*\/\s*(\d+)/);
            if (progressMatch) {
              setAnalyzingFileProgress({ current: parseInt(progressMatch[1]), total: parseInt(progressMatch[2]) });
            }
          }
        } else if (progressUpdate.stage === 'analyzing' || 
                   progressUpdate.message.toLowerCase().includes('analyzing') || 
                   progressUpdate.message.toLowerCase().includes('processing file')) {
          setIsAnalyzingFiles(true);
        } else if (progressUpdate.message.includes('File analysis complete') || 
                   progressUpdate.message.includes('Generating outline structure')) {
          setIsAnalyzingFiles(false);
          setCurrentAnalyzingFile('');
          setAnalyzingFileProgress(undefined);
        }
      }
    }
    } catch (error) {
      console.error('[useOutlineChat] Error in handleProgressUpdate:', error);
    }
  }, [onOutlineStructure, onSlideComplete, setCurrentOutline]);

  // Generate outline with streaming
  const handleChatSubmit = useCallback(async (overrides?: {
    slideCount?: number | null;
    detailLevel?: 'quick' | 'standard' | 'detailed';
  }) => {
    console.warn('[useOutlineChat] handleChatSubmit called with:', { initialIdea, uploadedFilesCount: uploadedFiles.length, overrides });
    
    if (!initialIdea.trim() && uploadedFiles.length === 0) {
      console.warn('⚠️ No idea or files provided');
      return;
    }

    // Use overrides if provided, otherwise fall back to hook values
    const actualSlideCount = overrides?.slideCount !== undefined ? overrides.slideCount : slideCount;
    const actualDetailLevel = overrides?.detailLevel || detailLevel;

// console.log('[useOutlineChat] Starting outline generation, setting isGenerating to true');
// console.log('[useOutlineChat] Files to process:', uploadedFiles.length);
// console.log('[useOutlineChat] File names:', uploadedFiles.map(f => f.name));
    
    console.warn('[useOutlineChat] Starting generation, setting isGenerating to true');
    // Reset Theme Store for new outline to avoid reusing old colors/fonts
    try {
      const outlineId = useDeckStore.getState().deckData?.outline?.id || undefined;
      useThemeStore.getState().resetForNewOutline?.(outlineId);
    } catch {}
    setIsGenerating(true);
    setLoadingStage('Starting outline generation...');
    setOutlineStructureInfo(null); // Reset
    setProcessedSlidesCount(0);   // Reset
    setLoadingStatus({ message: 'Starting outline generation...', stage: 'initializing' });
    setProgress(null);
    
    // Get current outline ID if exists (for preserving when updating)
    let existingOutlineId: string | undefined;
    setCurrentOutline(prev => {
      if (prev?.id) {
        existingOutlineId = prev.id;
// console.log('[useOutlineChat] Preserving existing outline ID:', existingOutlineId);
      }
      return prev;
    });
    
    try {
      console.warn('[useOutlineChat] Calling generateOutlineStream...');
      console.warn('[useOutlineChat] slideCount value:', actualSlideCount);
      console.warn('[useOutlineChat] Using streaming endpoint');
      console.warn('[useOutlineChat] handleProgressUpdate callback:', typeof handleProgressUpdate);
      
      // Clear previous research events when starting new generation; seed only if enabled
      setResearchEvents([]);
      if (enableResearch) {
        const initialEvent = { type: 'research_started', message: 'Initializing AI research...', progress: 1 };
        setResearchEvents([initialEvent]);
        if (typeof window !== 'undefined') {
          (window as any).__DEBUG_RESEARCH_EVENTS__ = [initialEvent];
        }
      }
      
      // Build combined style context including any user-provided reference links
      const combinedStyleContext = [
        styleVibeText && styleVibeText.trim().length > 0 ? styleVibeText.trim() : '',
        Array.isArray(referenceLinks) && referenceLinks.length > 0
          ? `Reference links (prioritize these for research and styling):\n${referenceLinks.map(u => `- ${u}`).join('\n')}`
          : ''
      ].filter(Boolean).join('\n\n');

      const result = await outlineApi.generateOutlineStream(
        initialIdea,
        uploadedFiles,
        {
          detailLevel: actualDetailLevel,
          styleContext: combinedStyleContext,
          fontPreference: selectedFont,
          colorPreference: colorConfig,
          slideCount: actualSlideCount !== null ? actualSlideCount : undefined,
          enableResearch: !!enableResearch,
        },
        (event) => {
          console.warn('[useOutlineChat] Inline callback received event:', (event as any)?.type, event);
          
          // Track ALL events including research events directly here
          if (enableResearch && event && 'type' in event && (event as any).type) {
            const eventType = (event as any).type;
            console.warn('[useOutlineChat] Event type:', eventType);
            
            // Check if it's a research event
            if (eventType.startsWith('research_') || 
                ['agent_event', 'tool_call', 'tool_result', 'artifact'].includes(eventType)) {
              console.warn('[useOutlineChat] Detected research event, updating state');
              setResearchEvents(prev => {
                const updated = [...prev, event];
                // Also update window for immediate visibility
                if (typeof window !== 'undefined') {
                  (window as any).__DEBUG_RESEARCH_EVENTS__ = updated;
                  (window as any).__outlineEnableResearch = true;
                  console.warn('[useOutlineChat] Updated window.__DEBUG_RESEARCH_EVENTS__:', updated.length);
                }
                return updated;
              });
            }
          }
          
          try {
            handleProgressUpdate(event);
          } catch (error) {
            console.error('[useOutlineChat] Error calling handleProgressUpdate:', error);
          }
        }
      );
      
      console.warn('[useOutlineChat] generateOutlineStream returned, result has', result.slides.length, 'slides');
      
// console.log('[useOutlineChat] generateOutlineStream completed, result:', result);
// console.log('[useOutlineChat] Result narrative flow:', result.narrativeFlow);
// console.log('[useOutlineChat] Result slides with taggedMedia:', result.slides.map((s, i) => ({
//         index: i,
//         title: s.title,
//         hasTaggedMedia: !!s.taggedMedia,
//         taggedMediaCount: s.taggedMedia?.length || 0
//       })));
      
      // NEW: Log the complete result structure to see all fields
// console.log('[useOutlineChat] Complete result structure:', JSON.stringify(result, null, 2));
      
      // EMERGENCY DEBUG: Check each slide for taggedMedia
// console.log('[useOutlineChat] EMERGENCY DEBUG - Checking each slide in result:');
      result.slides.forEach((slide, index) => {
// console.log(`Slide ${index}:`, {
//           id: slide.id,
//           title: slide.title,
//           hasTaggedMedia: !!slide.taggedMedia,
//           taggedMediaLength: slide.taggedMedia?.length || 0,
//           taggedMediaContent: slide.taggedMedia
//         });
      });
      
      // Do not add local style preferences; rely only on backend-provided values
      const outlineWithPreferences = {
        ...result,
        id: existingOutlineId || result.id,
        narrativeFlow: result.narrativeFlow
      };
      
      // Log tagged media in result
// console.log('[useOutlineChat] Tagged media in API result:');
      result.slides.forEach((slide, index) => {
        if (slide.taggedMedia && slide.taggedMedia.length > 0) {
// console.log(`  - Slide ${index} "${slide.title}": ${slide.taggedMedia.length} media items`);
//           console.log(`    First media item:`, slide.taggedMedia[0]);
        }
      });
      
      // Only set the outline if we don't already have one from progressive updates
      // The callbacks (onOutlineStructure and onSlideComplete) should have already
      // built the outline progressively
      setCurrentOutline(prevOutline => {
        // If we already have an outline being built progressively, check if it has content
        if (prevOutline && prevOutline.slides.length > 0) {
          // Check if slides have content (meaning they were progressively updated)
          const hasProgressiveContent = prevOutline.slides.some(slide => slide.content && slide.content.trim() !== '');
          console.warn('[useOutlineChat] Checking progressive outline:', {
            hasOutline: !!prevOutline,
            slideCount: prevOutline.slides.length,
            hasProgressiveContent,
            slidesWithContent: prevOutline.slides.filter(s => s.content).length
          });
          
          if (hasProgressiveContent) {
            console.warn('[useOutlineChat] Keeping progressive outline, not overwriting with final result');
            // Just merge metadata and return the existing outline (no local style prefs)
            return {
              ...prevOutline,
              id: existingOutlineId || prevOutline.id,
              narrativeFlow: result.narrativeFlow,
              // Keep backend-provided stylePreferences only
            };
          }
// console.log('[useOutlineChat] Merging data from API result into progressively built outline');
// console.log('[useOutlineChat] Previous outline has tagged media:', 
//             prevOutline.slides.filter(s => s.taggedMedia && s.taggedMedia.length > 0).length, 'slides with media');
          
          // Create a new outline with merged data (no local style prefs)
          const mergedOutline = {
            ...prevOutline,
            id: existingOutlineId || prevOutline.id, // Preserve outline ID
            // Update slides to include tagged media from the result OR preserve existing tagged media
            slides: prevOutline.slides.map((slide, index) => {
              const resultSlide = result.slides[index];
              
              // Log what we're merging
// console.log(`[useOutlineChat] Merging slide ${index}:`, {
//                 hasResultSlide: !!resultSlide,
//                 prevTaggedMedia: slide.taggedMedia?.length || 0,
//                 resultTaggedMedia: resultSlide?.taggedMedia?.length || 0
//               });
              
              // Preserve existing tagged media if present, otherwise use result
              const taggedMedia = (slide.taggedMedia && slide.taggedMedia.length > 0) 
                ? slide.taggedMedia 
                : (resultSlide?.taggedMedia || []);
              
              if (taggedMedia.length > 0) {
// console.log(`[useOutlineChat] Slide ${index} "${slide.title}" has ${taggedMedia.length} tagged media`);
              }
              
              return {
                ...slide,
                taggedMedia
              };
            }),
            // Add narrative flow if it exists in the result
            narrativeFlow: result.narrativeFlow
          };
          
          return mergedOutline;
        }
        // Otherwise use the complete result from the API (fallback for non-streaming)
// console.log('[useOutlineChat] Using complete result from API');
// console.log('[useOutlineChat] Result narrative flow:', result.narrativeFlow);
        
        // Log what we're about to set
// console.log('[useOutlineChat] Setting outline with taggedMedia:', outlineWithPreferences.slides.map((s, i) => ({
//           index: i,
//           title: s.title,
//           hasTaggedMedia: !!s.taggedMedia,
//           taggedMediaCount: s.taggedMedia?.length || 0,
//           firstTaggedMedia: s.taggedMedia?.[0]
//         })));
        
        return outlineWithPreferences;
      });
      
      // Don't clear uploaded files after successful generation - keep them available for manual tagging
      // if (setUploadedFiles) {
      //   setUploadedFiles([]);
      // }
      
// console.log('[useOutlineChat] Successfully completed outline generation');
    } catch (error) {
      console.error('❌ Outline generation failed:', error);
      setIsGenerating(false); // Set to false on catch error
      toast({
        title: "Error generating outline",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      // Removed setIsGenerating(false) from here as events should control it.
      // Keep other cleanup like setLoadingStage(null) if appropriate after all events.
      // For now, let 'outline_complete' or 'error' handle the final state changes.
      setLoadingStage(null);
      setLoadingStatus(null);
      setProgress(null);
    }
  }, [initialIdea, styleVibeText, selectedFont, colorConfig, uploadedFiles, setCurrentOutline, setUploadedFiles, toast, handleProgressUpdate, detailLevel, slideCount]);

  // NEW: Two-step deck generation
  const handleTwoStepGeneration = useCallback(async (
    topic: string,
    options: {
      target_slide_count?: number;
      depth?: 'auto' | 'quick' | 'standard' | 'deep';
      tone?: string;
      additional_context?: string;
      additional_instructions?: string;
      style_preferences?: any;
    } = {}
  ) => {
    if (!topic.trim()) {
      console.warn('⚠️ No topic provided');
      return null;
    }

// console.log('[useOutlineChat] Starting two-step generation, setting isGenerating to true');
    setIsGenerating(true);
    setLoadingStage('Generating outline...');
    setOutlineStructureInfo(null);
    setProcessedSlidesCount(0);
    setLoadingStatus({ message: 'Generating outline...', stage: 'initializing' });
    setProgress(null);
    
    try {
      // Step 1: Generate outline
// console.log('[useOutlineChat] Calling generateOutline2Step...');
      const outline = await outlineApi.generateOutline2Step(topic, options);
      
// console.log('[useOutlineChat] Outline generated successfully:', outline);
      
      // Convert new outline format to existing DeckOutline format
      const deckOutline: DeckOutline = {
        id: outline.title.replace(/\s+/g, '-').toLowerCase(),
        title: outline.title,
        slides: outline.slides.map(slide => ({
          id: slide.id,
          title: slide.title,
          content: slide.content,
          taggedMedia: [],
          deepResearch: false,
          extractedData: slide.chart_data ? {
            source: 'ai_generated',
            chartType: slide.chart_data.chart_type || 'bar',
            compatibleChartTypes: [slide.chart_data.chart_type || 'bar'],
            data: slide.chart_data.data || []
          } : undefined
        })),
        stylePreferences: options.style_preferences
      };
      
      setCurrentOutline(deckOutline);
      setIsGenerating(false);
      setLoadingStage(null);
      setLoadingStatus(null);
      setProgress(null);
      
      return deckOutline;
      
    } catch (error) {
      console.error('❌ Two-step generation failed:', error);
      setIsGenerating(false);
      setLoadingStage(null);
      setLoadingStatus(null);
      setProgress(null);
      toast({
        title: "Error generating outline",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
      return null;
    }
  }, [setCurrentOutline, toast]);

  // NEW: Create deck from outline (Step 2)
  const handleCreateDeckFromOutline = useCallback(async (
    outline: any,
    stylePreferences?: any,
    onDeckCreated?: (deckId: string, deckUrl?: string) => void
  ) => {
    if (!outline) {
      toast({
        title: "Error",
        description: "No outline available to create deck",
        variant: "destructive",
      });
      return null;
    }

// console.log('[useOutlineChat] Starting deck creation from outline');
    setIsGenerating(true);
    setLoadingStage('Creating deck...');
    setProgress({ current: 0, total: 100 });
    
    try {
      const result = await outlineApi.createDeckFromOutline(
        outline,
        stylePreferences,
        handleProgressUpdate
      );
      
// console.log('[useOutlineChat] Deck created successfully:', result);
      
      if (onDeckCreated) {
        onDeckCreated(result.deck_id, result.deck_url);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ Deck creation failed:', error);
      setIsGenerating(false);
      setLoadingStage(null);
      setProgress(null);
      toast({
        title: "Error creating deck",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
      return null;
    }
  }, [handleProgressUpdate, toast]);

  return {
    chatInput,
    setChatInput,
    isGenerating,
    loadingStage,
    loadingStatus,
    progress,
    outlineStructureInfo,
    handleChatSubmit,
    handleResetInput,
    chatTextareaRef, // Expose ref if ChatInputView needs it directly
    // NEW: Two-step methods
    handleTwoStepGeneration,
    handleCreateDeckFromOutline,
    // File analysis states
    isAnalyzingFiles,
    currentAnalyzingFile,
    analyzingFileProgress,
    // Research events for thinking process
    researchEvents,
  };
}; 