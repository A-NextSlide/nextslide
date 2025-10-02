import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { flushSync } from 'react-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw } from 'lucide-react';

// UI Components
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// Types
import { CompleteDeckData } from '@/types/DeckTypes';
import { 
  DeckOutline as FrontendDeckOutline, 
  SlideOutline as FrontendSlideOutline, 
  TaggedMedia as FrontendTaggedMedia, 
  DiscardedFile as FrontendDiscardedFile,
  ColorConfig
} from '@/types/SlideTypes';
import ChatInputView from './ChatInputView';
import OutlineDisplayView from './OutlineDisplayView';
import ThinkingProcess from './ThinkingProcess';
import { useOutlineChat } from '../../hooks/useOutlineChat';
import { useOutlineFilesWrapper } from '../../hooks/useOutlineFilesWrapper';
import { useOutlineDragDrop } from '../../hooks/useOutlineDragDrop';
import { API_CONFIG } from '@/config/environment';
import StarAnimation from '../common/StarAnimation';
import { Loader2 } from 'lucide-react';

export type InteractionStage =
  | 'initial'
  | 'collectingStyleVibe'
  | 'typingMessage'
  | 'showOptions';

interface OutlineEditorProps {
  createDefaultDeck: () => Promise<CompleteDeckData>;
  updateDeckData: (deck: CompleteDeckData) => void;
  navigate: ReturnType<typeof useNavigate>;
  toast: ReturnType<typeof useToast>['toast'];
  dismiss: ReturnType<typeof useToast>['dismiss'];
  setIsOutlineProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  initialUploadedFiles?: File[];
  initialChatInput?: string;

  // Props from useOutlineManager (lifted to parent)
  currentOutline: FrontendDeckOutline | null;
  setCurrentOutline: React.Dispatch<React.SetStateAction<FrontendDeckOutline | null>>;
  handleAddSlide: () => void;
  handleSlideTitleChange: (slideId: string, title: string) => void;
  handleSlideContentChange: (slideId: string, content: string) => void;
  handleSlideReorder: (draggedSlideId: string, targetSlideId: string) => void;
  handleToggleDeepResearch: (slideId: string, event?: React.MouseEvent) => void;
  handleDeleteSlide: (slideId: string) => void;

  // New props that were previously internal or from local hooks
  isDeckGenerating: boolean; // This is for the overall deck generation process, passed from parent
  researchingSlides: string[]; // Passed from parent
  
  // Callback to inform parent about internal outline chat generation state
  onOutlineChatGeneratingChange: (isGenerating: boolean) => void;
  // Callback to inform parent about progress updates
  onProgressUpdate?: (stage: string | null, progress: { current: number; total: number } | null) => void;
  // Callback to inform parent about style preference updates
  onStylePreferencesUpdate?: (preferences: {
    initialIdea?: string;
    vibeContext?: string;
    font?: string | null;
    colors?: ColorConfig | null;
    autoSelectImages?: boolean;
    enableResearch?: boolean;
  }) => void;
  // Callback to inform parent about uploaded files changes
  onUploadedFilesChange?: (files: File[]) => void;
  // New prop for deck list ready state
  isDeckListReady?: boolean;
  // Bubble research streaming events to parent (for left Thinking tab)
  onResearchEventsUpdate?: (events: any[]) => void;
}

// Test outline creation function
const createTestOutline = (): FrontendDeckOutline => {
  return {
    id: uuidv4(),
    title: 'Pikachu: The Electric Mouse Pokémon',
    slides: [
      {
        id: uuidv4(),
        title: 'Meet Pikachu: The Face of Pokémon',
        content: '"Pika pika!"\n— The world\'s most famous electric mouse',
        deepResearch: false,
        taggedMedia: []
      },
      {
        id: uuidv4(),
        title: 'Pikachu\'s Abilities & Battle Stats',
        content: '• Electric Powers\n  - Signature move: Thunderbolt (90 power, 100% accuracy)\n  - Stores electricity in cheek pouches\n  - Can release up to 100,000-volt shocks\n  - Tail acts as grounding rod for safety\n\n• Battle Statistics\n  - HP: 35 | Attack: 55 | Defense: 40\n  - Sp. Attack: 50 | Sp. Defense: 50 | Speed: 90\n  - Total base stats: 320 (below average, but beloved!)\n  - Hidden Ability: Lightning Rod (draws Electric moves)\n\n• Notable Moves\n  - Thunder: Most powerful electric attack\n  - Quick Attack: Priority move for speed\n  - Iron Tail: Coverage against Rock/Ground types\n  - Electro Ball: Damage based on speed difference\n\n• Special Forms\n  - Gigantamax Pikachu: Becomes chonky retro design\n  - Cosplay Pikachu: 5 different outfits in Omega Ruby/Alpha Sapphire\n  - Partner Pikachu: Enhanced stats in Let\'s Go games\n  - Various hat Pikachus: Event distributions',
        deepResearch: false,
        taggedMedia: [],
        extractedData: {
          source: 'pikachu_stats',
          chartType: 'bar',
          compatibleChartTypes: ['bar', 'column', 'radar'],
          data: [
            { id: 'HP', value: 35 },
            { id: 'Attack', value: 55 },
            { id: 'Defense', value: 40 },
            { id: 'Sp. Attack', value: 50 },
            { id: 'Sp. Defense', value: 50 },
            { id: 'Speed', value: 90 }
          ]
        }
      },
      {
        id: uuidv4(),
        title: 'Evolution & Ash\'s Pikachu',
        content: '• Evolution Line\n  - Baby form: Pichu (introduced in Gen 2)\n  - Evolves to: Pikachu (via friendship)\n  - Final form: Raichu (via Thunder Stone)\n  - Alolan variant: Raichu becomes Electric/Psychic with surfing abilities\n\n• Ash\'s Special Pikachu\n  - Refused to evolve into Raichu (staying true to himself)\n  - Defeated legendary Pokémon like Regice and Latios\n  - Only Pokémon to stay with Ash through all regions\n  - Known for powerful "Thunder Armor" and Z-Move: 10,000,000 Volt Thunderbolt\n\n• Competitive History\n  - Light Ball item doubles Attack and Sp. Attack\n  - Volt Tackle: Exclusive 120 power move with recoil\n  - Popular in lower tiers due to fan favorite status\n  - Surprisingly viable with proper team support',
        deepResearch: false,
        taggedMedia: [],
        extractedData: {
          source: 'popularity_data',
          chartType: 'pie',
          compatibleChartTypes: ['pie', 'donut'],
          data: [
            { id: 'Pikachu Fans', value: 45 },
            { id: 'Charizard Fans', value: 25 },
            { id: 'Eevee Fans', value: 15 },
            { id: 'Other Pokémon', value: 15 }
          ]
        }
      },
      {
        id: uuidv4(),
        title: 'Why Pikachu is Amazing',
        content: '• Universal Appeal\n  - Cute design that transcends age and culture\n  - Simple yet memorable "Pika pika" vocalization\n  - Expressive animations and personality\n  - Perfect balance of cool and adorable\n\n• Symbol of Friendship\n  - Ash and Pikachu\'s bond defines the series\n  - Teaches loyalty, perseverance, and trust\n  - Shows that power isn\'t everything\n  - Proves small can be mighty\n\n• Economic Powerhouse\n  - Merchandise sales exceed $80 billion globally\n  - Most valuable media franchise character\n  - Featured in Olympics, airports, and museums\n  - Pikachu-themed cafés and stores worldwide\n\n• Life Lessons from Pikachu\n  - Be yourself (refused to evolve)\n  - True strength comes from friendship\n  - Never give up, even against stronger opponents\n  - A positive attitude can overcome any challenge\n\n"The bond between Pikachu and its Trainer is something special. It\'s proof that friendship is the most powerful force in the Pokémon world!"\n— Professor Oak\n\nPikachu isn\'t just a Pokémon - it\'s a global icon that brings joy to millions!',
        deepResearch: false,
        taggedMedia: [],
        extractedData: {
          source: 'merchandise_revenue',
          chartType: 'line',
          compatibleChartTypes: ['line', 'area', 'column'],
          data: [
            { id: '1996', value: 1 },
            { id: '2000', value: 15 },
            { id: '2005', value: 30 },
            { id: '2010', value: 45 },
            { id: '2015', value: 60 },
            { id: '2020', value: 75 },
            { id: '2023', value: 85 }
          ]
        }
      }
    ]
  };
};

const OutlineEditor: React.FC<OutlineEditorProps> = ({
  createDefaultDeck,
  updateDeckData,
  navigate,
  toast,
  dismiss,
  setIsOutlineProcessing, // This is for general processing like media, different from chat generating
  initialUploadedFiles = [],
  initialChatInput = '',
  currentOutline,
  setCurrentOutline,
  handleAddSlide,
  handleSlideTitleChange,
  handleSlideContentChange,
  handleSlideReorder,
  handleToggleDeepResearch,
  handleDeleteSlide,
  isDeckGenerating,
  researchingSlides,
  onOutlineChatGeneratingChange,
  onProgressUpdate,
  onStylePreferencesUpdate,
  onUploadedFilesChange,
  isDeckListReady,
  onResearchEventsUpdate,
}) => {
 
  const [isAiNotesExpanded, setIsAiNotesExpanded] = useState(false);
  const [tooltipHostSlideId, setTooltipHostSlideId] = useState<string | null>(null);
  const [currentTooltipAlign, setCurrentTooltipAlign] = useState<'left' | 'right'>('left');
  const [animatingOutMediaIds, setAnimatingOutMediaIds] = useState<Set<string>>(new Set());

  const [interactionStage, setInteractionStage] = useState<InteractionStage>('initial');
  const [initialIdea, setInitialIdea] = useState('');
  const [styleVibeText, setStyleVibeText] = useState('');
  const [referenceLinks, setReferenceLinks] = useState<string[]>([]);
  const [selectedFont, setSelectedFont] = useState<string | null>(null);
  const [colorConfig, setColorConfig] = useState<ColorConfig | null>(null);
  const [detailLevel, setDetailLevel] = useState<'quick' | 'standard' | 'detailed'>('standard');
  const [slideCount, setSlideCount] = useState<number | null>(null);
  const [autoSelectImages, setAutoSelectImages] = useState<boolean>(false);
  const [enableResearch, setEnableResearch] = useState<boolean>(false);
  const [partialOutline, setPartialOutline] = useState<Partial<FrontendDeckOutline> | null>(null);
  const [completedSlides, setCompletedSlides] = useState<Set<number>>(() => {

    return new Set();
  });
  const [completedSlidesArray, setCompletedSlidesArray] = useState<number[]>([]);
  const [completedSlidesCount, setCompletedSlidesCount] = useState(0);
  const [isExpectingNewOutline, setIsExpectingNewOutline] = useState(false);

  const outlineScrollRef = useRef<HTMLDivElement>(null);

  // Initialize the file handling hook (NEEDS to be before useOutlineChat)
  const {
    uploadedFiles,
    setUploadedFiles,
    isProcessingMedia,
    animatingOutUploadedFileKeys,
    fileInputRef,
    getFileKey,
    handleUploadClick,
    handleFileChange,
    handleFilesDroppedOnSlide,
    handleRemoveUploadedFile,
    handleClearAllUploadedFiles,
  } = useOutlineFilesWrapper({ currentOutline, setCurrentOutline, initialUploadedFiles });

  // Handle outline structure received early
  const handleOutlineStructure = useCallback((title: string, slideTitles: string[]) => {
    
    // Clear completed slides when starting a new outline
    setCompletedSlides(new Set());
    completedSlidesRef.current = new Set();
    setIsExpectingNewOutline(true); // Mark that we're expecting a new outline
    
    // Check if we already have an outline - if so, preserve slide IDs and tagged media
    if (currentOutline && currentOutline.slides.length > 0) {
      console.log('[OutlineEditor] Updating existing outline structure, preserving IDs and tagged media');
      
      // Update existing outline while preserving IDs and tagged media
      const updatedSlides = slideTitles.map((slideTitle, index) => {
        const existingSlide = currentOutline.slides[index];
        
        // Extract title if slideTitle is an object
        let extractedTitle = slideTitle;
        if (typeof slideTitle === 'object' && slideTitle !== null) {
          // If it's an object, look for common title properties
          extractedTitle = (slideTitle as any).slide_title || (slideTitle as any).title || 'Untitled';
          console.log('[OutlineEditor] Extracted title from object:', extractedTitle, 'Original:', slideTitle);
        }
        
        if (existingSlide) {
          // Preserve existing slide data, just update title and clear content
          return {
            ...existingSlide,
            title: extractedTitle,
            content: '', // Clear content as it will be regenerated
            // Preserve these important fields:
            id: existingSlide.id,
            taggedMedia: existingSlide.taggedMedia || [],
            deepResearch: existingSlide.deepResearch || false
          };
        } else {
          // Create new slide only if we don't have one at this index
          return {
            id: uuidv4(),
            title: extractedTitle,
            content: '',
            deepResearch: false,
            taggedMedia: []
          };
        }
      });
      
      // Update the outline while preserving the ID and other metadata
      setCurrentOutline(prev => ({
        ...prev,
        id: prev?.id || currentOutline.id, // Preserve outline ID
        title: title,
        slides: updatedSlides,
        stylePreferences: prev?.stylePreferences || {
          initialIdea,
          vibeContext: styleVibeText,
          font: selectedFont,
          colors: colorConfig,
          autoSelectImages,
          referenceLinks
        }
      }));
    } else {
      // No existing outline with slides yet; upgrade placeholder to full outline while preserving its ID
      console.log('[OutlineEditor] Creating new outline structure (preserve placeholder ID if present)');
      
      const newSlides = slideTitles.map((slideTitle, index) => {
        // Extract title if slideTitle is an object
        let extractedTitle = slideTitle;
        if (typeof slideTitle === 'object' && slideTitle !== null) {
          // If it's an object, look for common title properties
          extractedTitle = (slideTitle as any).slide_title || (slideTitle as any).title || 'Untitled';
          console.log('[OutlineEditor] Extracted title from object:', extractedTitle, 'Original:', slideTitle);
        }
        
        return {
          id: uuidv4(),
          title: extractedTitle,
          content: '',
          deepResearch: false,
          taggedMedia: []
        };
      });
      
      console.log('[OutlineEditor] Creating new outline structure with deepResearch: false for all slides');
      
      // Preserve the placeholder/current outline ID if available to prevent duplicate theme generation
      const outlineIdToUse = (currentOutline && currentOutline.id) || (partialOutline && (partialOutline as any).id) || uuidv4();
      if (outlineIdToUse !== (currentOutline && currentOutline.id)) {
        console.log('[OutlineEditor] Using preserved/new outline ID:', outlineIdToUse);
      }
      setPartialOutline({
        id: outlineIdToUse,
        title,
        slides: newSlides,
        stylePreferences: {
          initialIdea,
          vibeContext: styleVibeText,
          font: selectedFont,
          colors: colorConfig,
          autoSelectImages,
          referenceLinks
        }
      });
      setCurrentOutline({
        id: outlineIdToUse,
        title,
        slides: newSlides,
        stylePreferences: {
          initialIdea,
          vibeContext: styleVibeText,
          font: selectedFont,
          colors: colorConfig,
          autoSelectImages,
          referenceLinks
        }
      });
    }
  }, [setCurrentOutline, currentOutline, initialIdea, styleVibeText, selectedFont, colorConfig, autoSelectImages]);

  // Use a ref for the callback to avoid stale closures
  const handleSlideCompleteRef = useRef<(slideIndex: number, slideData: any) => void>();
  
  // Handle individual slide completion
  const handleSlideComplete = useCallback((slideIndex: number, slideData: any) => {
    console.log(`[OutlineEditor] handleSlideComplete called for slide ${slideIndex}`, slideData);
    console.log(`[OutlineEditor] Full slideData structure:`, JSON.stringify(slideData, null, 2));
    
    // EMERGENCY: Log the exact structure of slideData
    console.log('[OutlineEditor] EMERGENCY - slideData keys:', Object.keys(slideData));
    console.log('[OutlineEditor] EMERGENCY - slideData.taggedMedia:', slideData.taggedMedia);
    console.log('[OutlineEditor] EMERGENCY - typeof slideData.taggedMedia:', typeof slideData.taggedMedia);
    console.log('[OutlineEditor] EMERGENCY - Array.isArray(slideData.taggedMedia):', Array.isArray(slideData.taggedMedia));
    
    // Add early logging to see what we receive
    if (slideData.taggedMedia) {
      console.log(`[OutlineEditor] Slide ${slideIndex} has taggedMedia:`, slideData.taggedMedia);
    }
    
    if (completedSlidesRef.current.has(slideIndex)) {
      console.log(`[OutlineEditor] Slide ${slideIndex} already completed, skipping update`);
      return;
    }
    
    completedSlidesRef.current.add(slideIndex);
    
    setCompletedSlides(prev => {
      const newSet = new Set(prev);
      newSet.add(slideIndex);
      
      const newArray = Array.from(newSet).sort((a, b) => a - b);
      setCompletedSlidesArray(newArray);
      setCompletedSlidesCount(newSet.size);
      
      return newSet;
    });
    
    setCurrentOutline(prevOutline => {
      if (!prevOutline) {
        console.warn('[OutlineEditor] No outline to update');
        return null;
      }
      
      const currentSlideId = prevOutline.slides[slideIndex]?.id;

      
      const updatedSlides = [...prevOutline.slides];
      if (updatedSlides[slideIndex]) {
        // Check if we already have tagged media (from the final merged result)
        const existingTaggedMedia = updatedSlides[slideIndex].taggedMedia;
        
        // Log tagged media preservation
        if (existingTaggedMedia && existingTaggedMedia.length > 0) {
          console.log(`[OutlineEditor] Preserving ${existingTaggedMedia.length} tagged media for slide ${slideIndex}`);
        }
        if (slideData.taggedMedia && slideData.taggedMedia.length > 0) {
          console.log(`[OutlineEditor] Received ${slideData.taggedMedia.length} tagged media from API for slide ${slideIndex}`);
        }
        
        updatedSlides[slideIndex] = {
          ...updatedSlides[slideIndex],
          id: currentSlideId || slideData.id || updatedSlides[slideIndex].id,
          title: slideData.title || updatedSlides[slideIndex].title,
          content: typeof slideData.content === 'string' ? slideData.content : '',
          // Preserve deepResearch setting - don't let API override it
          deepResearch: updatedSlides[slideIndex].deepResearch || false,
          // IMPORTANT: Use tagged media from slideData if available, otherwise preserve existing
          taggedMedia: slideData.taggedMedia || existingTaggedMedia || [],
          extractedData: slideData.extractedData || (slideData.chartData ? {
            source: `slide_${slideIndex}_data`,
            chartType: slideData.chartData.chart_type,
            compatibleChartTypes: [slideData.chartData.chart_type],
            data: slideData.chartData.data
          } : undefined)
        };
        
        // Log final tagged media state
        console.log(`[OutlineEditor] Final tagged media for slide ${slideIndex}:`, {
          existingCount: existingTaggedMedia?.length || 0,
          receivedCount: slideData.taggedMedia?.length || 0,
          finalCount: updatedSlides[slideIndex].taggedMedia?.length || 0,
          hasTaggedMedia: updatedSlides[slideIndex].taggedMedia && updatedSlides[slideIndex].taggedMedia.length > 0
        });
      }
      
      return {
        ...prevOutline, 
        slides: updatedSlides,
        // Preserve style preferences if they exist
        stylePreferences: prevOutline.stylePreferences || {
          initialIdea,
          vibeContext: styleVibeText,
          font: selectedFont,
          colors: colorConfig,
          referenceLinks
        }
      };
    });
  }, [initialIdea, styleVibeText, selectedFont, colorConfig, autoSelectImages]);
  
  // Update the ref whenever the callback changes
  handleSlideCompleteRef.current = handleSlideComplete;

  // Add a ref to track completed slides without closure issues
  const completedSlidesRef = React.useRef<Set<number>>(new Set());
  
  // Keep ref in sync with state
  React.useEffect(() => {

    completedSlidesRef.current = completedSlides;
  }, [completedSlides]);

  // Initialize the outline chat hook (uses uploadedFiles from useOutlineFilesWrapper)
  const {
    chatInput,
    setChatInput,
    isGenerating: localIsOutlineGenerating,
    loadingStage,
    loadingStatus,
    progress,
    outlineStructureInfo,
    handleChatSubmit,
    handleResetInput: originalHandleResetInput,
    chatTextareaRef,
    // NEW: Two-step methods
    handleTwoStepGeneration,
    handleCreateDeckFromOutline,
    isAnalyzingFiles,
    currentAnalyzingFile,
    analyzingFileProgress,
    researchEvents,
  } = useOutlineChat({
    initialIdea: initialIdea || initialChatInput,
    styleVibeText,
    selectedFont,
    colorConfig,
    autoSelectImages,
    enableResearch,
    referenceLinks,
    uploadedFiles,
    setCurrentOutline,
    setUploadedFiles,
    detailLevel,
    slideCount,
    onOutlineStructure: handleOutlineStructure,
    onSlideComplete: (slideIndex, slideData) => {
      console.log('[OutlineEditor] onSlideComplete callback triggered for slide', slideIndex);
      if (handleSlideCompleteRef.current) {
        handleSlideCompleteRef.current(slideIndex, slideData);
      }
    },
  });

  // Listen for a global focus request from DeckList to focus the chat input
  useEffect(() => {
    const handleFocusChat = () => {
      try {
        if (!currentOutline && chatTextareaRef?.current) {
          // Focus and scroll to the chat input
          chatTextareaRef.current.focus();
          chatTextareaRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Add a transient orange highlight class to the input wrapper
          const wrapper = chatTextareaRef.current.closest('[data-chat-input-wrapper="true"]') as HTMLElement | null;
          if (wrapper) {
            wrapper.classList.add('ring-2', 'ring-orange-500', 'ring-offset-2', 'ring-offset-orange-100');
            setTimeout(() => {
              wrapper.classList.remove('ring-2', 'ring-orange-500', 'ring-offset-2', 'ring-offset-orange-100');
            }, 1600);
          }
        }
      } catch {}
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('focus-outline-chat', handleFocusChat as EventListener);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus-outline-chat', handleFocusChat as EventListener);
      }
    };
  }, [currentOutline, chatTextareaRef]);

  // Bubble research events to parent so the left panel can render them live
  useEffect(() => {
    console.warn('[OutlineEditor] researchEvents received from hook:', researchEvents?.length || 0, researchEvents);
    if (onResearchEventsUpdate) {
      onResearchEventsUpdate(researchEvents);
      console.warn('[OutlineEditor→DeckList] Sending researchEvents:', researchEvents?.length || 0);
    }
  }, [researchEvents, onResearchEventsUpdate]);

  // Compute whether we're actively generating
  const isActivelyGenerating = React.useMemo(() => {
    // If localIsOutlineGenerating is true, we're definitely generating
    if (localIsOutlineGenerating) return true;
    
    // If we have research events, we're in the research/generation phase
    if (researchEvents.length > 0) return true;
    
    // If we're expecting a new outline and have an outline structure but not all slides completed
    if (isExpectingNewOutline && currentOutline && completedSlides.size < currentOutline.slides.length) {
      return true;
    }
    
    // If we have an outline with empty content slides (structure but no content yet)
    if (currentOutline && currentOutline.slides.some((slide, index) => !slide.content && !completedSlides.has(index))) {
      return true;
    }
    
    return false;
  }, [localIsOutlineGenerating, researchEvents.length, isExpectingNewOutline, currentOutline, completedSlides]);

  // Initialize completedSlides when currentOutline changes (e.g., loaded from storage)
  React.useEffect(() => {

    
    // Check if we're actively generating by seeing if we have slides without content
    const hasEmptySlides = currentOutline?.slides.some(slide => !slide.content || slide.content.trim() === '');
    
    // Don't run this effect if we're actively generating
    if (localIsOutlineGenerating || isExpectingNewOutline || partialOutline || hasEmptySlides) {

      return;
    }
    
    if (currentOutline && completedSlides.size === 0) {
      // If we have an outline but we're not generating and no slides are marked as completed,
      // and we're not expecting a new outline (just received structure),
      // and we don't have a partial outline (which indicates active generation),
      // and all slides have content (not actively generating),
      // this means the outline was loaded from storage or previous session
      // Only mark slides as completed if they have content
      const allIndices = new Set<number>();
      let hasAnyContent = false;
      
      for (let i = 0; i < currentOutline.slides.length; i++) {
        // Only mark slides with content as completed
        if (currentOutline.slides[i].content && currentOutline.slides[i].content.trim() !== '') {
          allIndices.add(i);
          hasAnyContent = true;
        }
      }
      
      // Only update if we found slides with actual content (not just empty structure)
      if (hasAnyContent) {

        setCompletedSlides(allIndices);
        completedSlidesRef.current = allIndices;
        
      } else {
        
      }
    }
  }, [currentOutline, localIsOutlineGenerating, isExpectingNewOutline, partialOutline]); // Removed completedSlides.size to prevent infinite loop

  // Reset isExpectingNewOutline when generation state changes
  React.useEffect(() => {
    // Only reset when we have completed slides (content is being generated)
    if (completedSlides.size > 0 && isExpectingNewOutline) {
      // We have started receiving slide content, no longer just expecting structure
      setIsExpectingNewOutline(false);
    } else if (!localIsOutlineGenerating && currentOutline && completedSlides.size === currentOutline.slides.length) {
      // Generation has completed, reset the flag
      setIsExpectingNewOutline(false);
    }
  }, [localIsOutlineGenerating, currentOutline, completedSlides, isExpectingNewOutline]);

  // Debug logging for generation state
  React.useEffect(() => {

  }, [localIsOutlineGenerating, currentOutline, completedSlides, isExpectingNewOutline, isActivelyGenerating, partialOutline]);

  // Wrapped reset function to also clear multi-step input state
  const handleResetInput = () => {
    originalHandleResetInput(); // Clears chatInput (in useOutlineChat) and uploadedFiles
    setInitialIdea('');
    setStyleVibeText('');
    setColorConfig(null);
    setSelectedFont(null);
    setInteractionStage('initial');
    setPartialOutline(null);
    setCompletedSlides(new Set());
    completedSlidesRef.current = new Set(); // Also clear the ref
    setIsExpectingNewOutline(false); // Reset the expecting flag
  };

  // Step 1: User submits initial idea
  const handleInitialIdeaSubmitted = () => {
    setInitialIdea(chatInput); // Save the current textarea content as initialIdea
    setChatInput('');           // Clear textarea for the next step (style/vibe)
    setInteractionStage('collectingStyleVibe');
  };

  // Step 2: User submits style/vibe (and implicitly color/font chosen)
  const handleStyleVibeSubmitted = () => {
    setStyleVibeText(chatInput); // Save current textarea as styleVibeText
    setChatInput('');            // Clear textarea for the next step (detail prompt)
    setInteractionStage('showOptions'); // Skip typing animation and show options immediately
  };

  // Back Navigation Handlers
  const handleBackToInitialFromStyle = () => {
    setChatInput(initialIdea); // Restore initial idea to the textarea for editing
    // styleVibeText, colorConfig, selectedFont remain as they were, initialIdea is also preserved
    setInteractionStage('initial');
  };

  const handleBackToStyleVibeFromDetailPrompt = () => {
    setChatInput(styleVibeText); // Restore style/vibe text to the textarea for editing
    // initialIdea, colorConfig, selectedFont are preserved
    setInteractionStage('collectingStyleVibe');
  };

  // Test outline handler
  const handleCreateTestOutline = () => {
    const testOutline = {
      ...createTestOutline(),
      stylePreferences: {
        initialIdea: 'A presentation about Pikachu and why this Electric-type Pokémon is amazing',
        vibeContext: 'Fun, energetic, and colorful like Pikachu!',
        font: 'playful',
        colors: null
      }
    };
    setCurrentOutline(testOutline);
    
    // Also set some test style preferences
    if (onStylePreferencesUpdate) {
      onStylePreferencesUpdate({
        initialIdea: 'A presentation about Pikachu and why this Electric-type Pokémon is amazing',
        vibeContext: 'Fun, energetic, and colorful like Pikachu!',
        font: 'playful',
        colors: null
      });
    }
    
    // Mark all slides with content as completed
    const completedIndices = new Set<number>();
    testOutline.slides.forEach((slide, index) => {
      if (slide.content && slide.content.trim() !== '') {
        completedIndices.add(index);
      }
    });
    setCompletedSlides(completedIndices);
    completedSlidesRef.current = completedIndices;
    

  };

  // Define the onFilesDropped callback for useOutlineDragDrop
  const onFilesDroppedCallback = useCallback((files: File[], targetId: string | null) => {
    const newFiles = files.filter(file => 
      !uploadedFiles.some(existingFile => getFileKey(existingFile) === getFileKey(file))
    );
    if (newFiles.length === 0) return;

    if (targetId) { // Dropped on a specific slide
      // Note: setUploadedFiles is called by handleFilesDroppedOnSlide in useOutlineFilesWrapper if needed
      handleFilesDroppedOnSlide(newFiles, targetId);
    } else { // Dropped on the general chat input area
      setUploadedFiles(prev => [...prev, ...newFiles]); 
    }
  }, [uploadedFiles, getFileKey, handleFilesDroppedOnSlide, setUploadedFiles]);

  // Create adapter function to convert indices to slide IDs for reordering
  const handleSlideReorderByIndex = useCallback((sourceIndex: number, destinationIndex: number) => {
    if (!currentOutline || !currentOutline.slides) return;
    
    const sourceSlideId = currentOutline.slides[sourceIndex]?.id;
    const destinationSlideId = currentOutline.slides[destinationIndex]?.id;
    
    if (sourceSlideId && destinationSlideId) {
      handleSlideReorder(sourceSlideId, destinationSlideId);
    }
  }, [currentOutline, handleSlideReorder]);

  // Initialize the drag and drop hook
  const {
    draggedSlideId, // Though hook manages it, child components might still need to know for UI
    dragOverSlideId,
    setDragOverSlideId, // Pass to SlideCard for onDragEnter/Leave if it directly sets this
    isDraggingOverChatInput,
    handleDragStart,
    handleDragOverSlide, // For SlideCard
    handleDragOverChatZone, // For ChatInputView
    handleDragLeaveChatZone, // For ChatInputView
    handleDrop, // Composite handler from the hook
    handleDragEnd,
  } = useOutlineDragDrop({
    onSlideReorder: handleSlideReorder, // From useOutlineManager
    onFilesDropped: onFilesDroppedCallback,
  });

  const handleInitiateOutline = async (detailLevel: 'quick' | 'standard' | 'detailed', slideCount?: number) => {
    try {
      console.log('[OutlineEditor] handleInitiateOutline called with slideCount:', slideCount);
      
      // Use flushSync to ensure state updates are applied synchronously
      flushSync(() => {
        setDetailLevel(detailLevel);
        setSlideCount(slideCount !== undefined ? slideCount : null);
      });
      
      // Clear prior thinking/research events and sync toggle to global for left panel
      try {
        if (typeof window !== 'undefined') {
          (window as any).__DEBUG_RESEARCH_EVENTS__ = [];
          (window as any).__outlineEnableResearch = !!enableResearch;
        }
      } catch {}
      
      // Also clear events in parent consumer so the Thinking panel resets immediately
      try {
        if (onResearchEventsUpdate) onResearchEventsUpdate([]);
      } catch {}
      
      console.log('[OutlineEditor] Setting slideCount state to:', slideCount !== undefined ? slideCount : null);
      
      // Create a partial outline immediately to show the outline view
      // Do this BEFORE starting generation to navigate immediately
      if (!currentOutline) {
        console.log('[OutlineEditor] Creating partial outline to show outline view');
        const placeholderOutline: FrontendDeckOutline = {
          id: uuidv4(),
          title: uploadedFiles.length > 0 ? 'Processing your files...' : 'Generating your outline...',
          slides: [], // Start with empty slides, they'll be added as we get the structure
          stylePreferences: {
            initialIdea,
            vibeContext: styleVibeText,
            font: selectedFont,
            colors: colorConfig,
            referenceLinks
          }
        };
        
        // Use flushSync to ensure the outline is set immediately
        flushSync(() => {
          setPartialOutline(placeholderOutline);
          setCurrentOutline(placeholderOutline);
        });
      }
      
      // Try new two-step process first if we have a simple text idea (no files)
      const shouldUseNewProcess = false;
      
      if (shouldUseNewProcess) {
        console.log('🔄 Attempting new two-step outline generation...');
        try {
          const outline = await handleTwoStepGeneration(initialIdea, {
            target_slide_count: slideCount || (detailLevel === 'detailed' ? 10 : 6),
            depth: detailLevel === 'detailed' ? 'standard' : 'quick',
            tone: 'professional',
            additional_context: styleVibeText || undefined,
          });
          
          if (outline) {
            console.log('✅ New two-step process successful');
            setInteractionStage('initial');
            return;
          }
        } catch (twoStepError) {
          console.warn('⚠️ New two-step process failed, falling back to legacy:', twoStepError);
          // Fall through to legacy process
        }
      }
      
      // Use streaming process directly
      console.log('🚀 Using streaming outline generation API...');
      console.log('[OutlineEditor] uploadedFiles before handleChatSubmit:', uploadedFiles.length, uploadedFiles.map(f => f.name));
      
      await handleChatSubmit({
        slideCount: slideCount !== undefined ? slideCount : null,
        detailLevel
      });
      
      // EMERGENCY: Check what's in currentOutline after generation
      setTimeout(() => {
        console.log('[OutlineEditor] EMERGENCY CHECK - currentOutline after generation:', currentOutline);
        if (currentOutline) {
          console.log('[OutlineEditor] Current outline slides with tagged media:', 
            currentOutline.slides.map((s, i) => ({
              index: i,
              title: s.title,
              hasTaggedMedia: !!s.taggedMedia,
              taggedMediaCount: s.taggedMedia?.length || 0,
              firstTaggedMedia: s.taggedMedia?.[0]
            }))
          );
        }
      }, 2000);
      
      setInteractionStage('initial');
    } catch (error) {
      // Check if this is our specific error about missing content
      if (error instanceof Error && 
          error.message.includes('Please provide a description of your presentation idea or upload relevant files')) {
        toast({
          title: "Input Required",
          description: "Please provide a description of your presentation idea or upload files within the size limits.",
          variant: "destructive"
        });
        // Reset to initial state to let user start over
        setInteractionStage('initial');
      }
      // Check if this is an error about unsupported file formats
      else if (error instanceof Error && 
              error.message.includes('unsupported formats')) {
        toast({
          title: "Unsupported File Format",
          description: error.message,
          variant: "destructive",
          duration: 7000
        });
        // Don't reset stage, let user remove/replace problematic files
      } else {
        // Handle other errors
        console.error("Error generating outline:", error);
        toast({
          title: "Error",
          description: "An error occurred while generating your presentation.",
          variant: "destructive"
        });
      }
    }
  };

  // Report chat generation status to parent
  useEffect(() => {
    onOutlineChatGeneratingChange(localIsOutlineGenerating);
  }, [localIsOutlineGenerating, onOutlineChatGeneratingChange]);

  useEffect(() => {
    // isResearching will come from parent if/when it's separated again for setIsOutlineProcessing
    // For now, isResearching is handled by DeckList for the header's isGenerating prop.
    const currentlyProcessing = localIsOutlineGenerating || isProcessingMedia || isDeckGenerating;
    setIsOutlineProcessing(currentlyProcessing);
  }, [localIsOutlineGenerating, isProcessingMedia, isDeckGenerating, setIsOutlineProcessing]);

  // Utility function to convert File/Blob to Base64 string
  const fileToBase64 = (file: File | Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file); // Reads as data URL (e.g., data:image/png;base64,iVBORw0K...)
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1]; // Get only the base64 part
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleChatSubmitWrapper = async (): Promise<void> => {
    await handleChatSubmit();
  };

  // Pass progress updates to parent
  useEffect(() => {
    if (onProgressUpdate) {
      onProgressUpdate(loadingStage, progress);
    }
  }, [loadingStage, progress, onProgressUpdate]);

  // Notify parent about style preference updates
  useEffect(() => {
    if (onStylePreferencesUpdate) {
      onStylePreferencesUpdate({
        initialIdea,
        vibeContext: styleVibeText,
        font: selectedFont,
        colors: colorConfig,
        autoSelectImages,
        enableResearch
      });
    }
  }, [initialIdea, styleVibeText, selectedFont, colorConfig, autoSelectImages, enableResearch, onStylePreferencesUpdate]);

  // Keep global generation preferences in sync for auto-apply images
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__slideGenerationPreferences = {
        ...(window as any).__slideGenerationPreferences,
        autoSelectImages: !!autoSelectImages
      };
      (window as any).__outlineEnableResearch = !!enableResearch;
    }
  }, [autoSelectImages, enableResearch]);

  // Notify parent about uploaded files changes
  useEffect(() => {
    if (onUploadedFilesChange) {
      onUploadedFilesChange(uploadedFiles);
    }
  }, [uploadedFiles, onUploadedFilesChange]);

  // Debug: Monitor currentOutline changes and tagged media
  useEffect(() => {
    if (currentOutline) {
      console.log('[OutlineEditor] Current outline updated:');
      currentOutline.slides.forEach((slide, index) => {
        if (slide.taggedMedia && slide.taggedMedia.length > 0) {
          console.log(`  - Slide ${index} "${slide.title}": ${slide.taggedMedia.length} tagged media`);
        }
      });
    }
  }, [currentOutline]);

  return (
    <>
      {/* Main content area */}
      <div className={cn(
        "absolute inset-0 flex flex-col items-center justify-center z-10 overflow-visible",
        !currentOutline && "pt-8 pb-8 px-8",
        currentOutline && (currentOutline as any)?.isManualMode ? "pt-0 pb-0 px-0" : "pt-6 pb-0 px-8"
      )}>
        {/* Star Animation - positioned behind content */}
        {!currentOutline && isDeckListReady && !localIsOutlineGenerating && (
          <div 
            className="absolute pointer-events-none z-0"
            style={{
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              marginTop: '-20px'
            }}
          >
            <div className="w-[800px] h-[800px]">
              <StarAnimation isLoading={false} isProcessing={false} isDeleting={false} isVisible={isDeckListReady && !localIsOutlineGenerating} />
            </div>
          </div>
        )}
        
        <div className={cn(
          "w-full h-full flex flex-col overflow-visible relative z-10",
          (currentOutline as any)?.isManualMode ? "max-w-5xl mx-auto" : "max-w-xl"
        )}>
          <div 
            ref={outlineScrollRef}
            className={cn(
              "flex-1 text-foreground hide-scrollbar",
              currentOutline ? 'overflow-y-auto' : 'overflow-visible'
            )}
            onScroll={(e) => {
              const target = e.currentTarget;
              if (target.scrollTop > 20) {
                target.classList.add("can-scroll-up");
              } else {
                target.classList.remove("can-scroll-up");
              }
            }}
          >
            {/* Content wrapper to prevent iOS bounce */}
            <div className="min-h-full">
              {/* Conditional Rendering: Initial View vs Outline View */} 
              {(!currentOutline && !partialOutline) ? (
                <ChatInputView
                  chatInput={chatInput}
                  setChatInput={setChatInput}
                  uploadedFiles={uploadedFiles}
                  setUploadedFiles={setUploadedFiles}
                  isGenerating={localIsOutlineGenerating}
                  loadingStage={loadingStage}
                  loadingStatus={loadingStatus}
                  handleChatSubmit={handleChatSubmit}
                  handleFileChange={handleFileChange}
                  handleUploadClick={handleUploadClick}
                  fileInputRef={fileInputRef}
                  chatTextareaRef={chatTextareaRef}
                  isDraggingOver={isDraggingOverChatInput}
                  handleResetInput={handleResetInput}
                  getFileKey={getFileKey}
                  animatingOutUploadedFileKeys={animatingOutUploadedFileKeys}
                  handleRemoveUploadedFile={handleRemoveUploadedFile}
                  handleClearAllUploadedFiles={handleClearAllUploadedFiles}
                  onDragOverChatZone={handleDragOverChatZone}
                  onDragLeaveChatZone={handleDragLeaveChatZone}
                  onDropChatZone={(e) => handleDrop(e, null)}
                  interactionStage={interactionStage}
                  setInteractionStage={setInteractionStage}
                  handleInitiateOutline={handleInitiateOutline}
                  handleInitialIdeaSubmitted={handleInitialIdeaSubmitted}
                  handleStyleVibeSubmitted={handleStyleVibeSubmitted}
                  selectedFont={selectedFont}
                  setSelectedFont={setSelectedFont}
                  colorConfig={colorConfig}
                  setColorConfig={setColorConfig}
                  referenceLinks={referenceLinks}
                  setReferenceLinks={setReferenceLinks}
                  onBackToInitial={handleBackToInitialFromStyle}
                  onBackToStyleVibe={handleBackToStyleVibeFromDetailPrompt}
                  outlineStructure={outlineStructureInfo ? { title: outlineStructureInfo.title, slideTitles: outlineStructureInfo.slideTitles } : undefined}
                  progress={progress}
                  onCreateTestOutline={handleCreateTestOutline}
                  autoSelectImages={autoSelectImages}
                  setAutoSelectImages={setAutoSelectImages}
                  enableResearch={enableResearch}
                  setEnableResearch={setEnableResearch}
                  researchEvents={researchEvents}
                />
              ) : (
                <>
                  {/* Thinking Process Display - Show research events when generating */}
                  
                  <OutlineDisplayView
                    currentOutline={currentOutline || partialOutline as FrontendDeckOutline}
                    setCurrentOutline={setCurrentOutline}
                    isAiNotesExpanded={isAiNotesExpanded}
                    setIsAiNotesExpanded={setIsAiNotesExpanded}
                    handleAddSlide={handleAddSlide}
                    handleSlideTitleChange={handleSlideTitleChange}
                    handleSlideContentChange={handleSlideContentChange}
                    handleSlideReorder={handleSlideReorderByIndex}
                    researchingSlides={researchingSlides}
                    dragOverSlideId={dragOverSlideId}
                    setDragOverSlideId={setDragOverSlideId}
                    tooltipHostSlideId={tooltipHostSlideId}
                    setTooltipHostSlideId={setTooltipHostSlideId}
                    currentTooltipAlign={currentTooltipAlign}
                    setCurrentTooltipAlign={setCurrentTooltipAlign}
                    outlineScrollRef={outlineScrollRef}
                    isProcessingMedia={isProcessingMedia}
                    animatingOutMediaIds={animatingOutMediaIds}
                    setAnimatingOutMediaIds={setAnimatingOutMediaIds}
                    uploadedFiles={uploadedFiles}
                    setUploadedFiles={setUploadedFiles}
                    handleDragStart={handleDragStart}
                    handleDragOver={handleDragOverSlide}
                    handleDrop={handleDrop}
                    handleDragEnd={handleDragEnd}
                    handleFilesDroppedOnSlide={handleFilesDroppedOnSlide}
                    toast={toast}
                    handleToggleDeepResearch={handleToggleDeepResearch}
                    handleDeleteSlide={handleDeleteSlide}
                    completedSlides={completedSlides}
                    isGeneratingOutline={isActivelyGenerating}
                    isAnalyzingFiles={isAnalyzingFiles}
                    currentAnalyzingFile={currentAnalyzingFile}
                    analyzingFileProgress={analyzingFileProgress}
                    loadingStage={loadingStage}
                    isResearching={isActivelyGenerating && researchEvents.length > 0}
                    researchEvents={researchEvents}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default OutlineEditor; 