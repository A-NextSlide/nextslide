import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';

// UI Components
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from '@/components/ui/input';
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import GradientPicker from "@/components/GradientPicker";
import { Card } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SplatterLoadingOverlay from '@/components/common/SplatterLoadingOverlay';
import { useToast } from '@/hooks/use-toast';
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Icons
import { 
  Loader2, Upload, ImageIcon, FilePlus, Trash2, ArrowRight, RotateCcw, 
  ChevronDown, ChevronLeft, CheckCircle2, Plus, Link, ChevronRight, Presentation
} from 'lucide-react';
import { InteractionStage } from './OutlineEditor'; // Import the type
import { ALL_FONT_NAMES, FONT_CATEGORIES } from '@/registry/library/fonts'; // For font dropdown
import GroupedDropdown from '@/components/settings/GroupedDropdown'; // For font dropdown
import { FontLoadingService } from '@/services/FontLoadingService';
import { ColorConfig } from '@/types/SlideTypes'; // ADDED IMPORT

// Add this import
import FileAnalysisLoader from '@/components/common/FileAnalysisLoader';
// Removed inline research outline view

interface ChatInputViewProps {
  chatInput: string;
  setChatInput: React.Dispatch<React.SetStateAction<string>>;
  uploadedFiles: File[];
  setUploadedFiles: React.Dispatch<React.SetStateAction<File[]>>;
  isGenerating: boolean;
  loadingStage: string | null;
  loadingStatus?: { message: string; stage: string } | null;
  handleChatSubmit: (overrides?: {
    slideCount?: number | null;
    detailLevel?: 'quick' | 'standard' | 'detailed';
  }) => Promise<void>;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleUploadClick: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  chatTextareaRef: React.RefObject<HTMLTextAreaElement>;
  isDraggingOver: boolean;
  handleResetInput: () => void;
  getFileKey: (file: File) => string;
  animatingOutUploadedFileKeys: Set<string>;
  handleRemoveUploadedFile: (fileKey: string) => void;
  handleClearAllUploadedFiles: () => void;
  onDragOverChatZone?: (e: React.DragEvent) => void;
  onDragLeaveChatZone?: (e: React.DragEvent) => void;
  onDropChatZone?: (e: React.DragEvent) => void;
  // New props for interactive chat
  interactionStage: InteractionStage;
  setInteractionStage: React.Dispatch<React.SetStateAction<InteractionStage>>;
  handleInitiateOutline: (detailLevel: 'quick' | 'standard' | 'detailed', slideCount?: number) => Promise<void>;
  // New callbacks for multi-step input
  handleInitialIdeaSubmitted: () => void;
  handleStyleVibeSubmitted: () => void;
  // New props for color/font selection
  selectedFont?: string | null;
  setSelectedFont: React.Dispatch<React.SetStateAction<string | null>>;
  // New color config props
  colorConfig: ColorConfig | null;
  setColorConfig: React.Dispatch<React.SetStateAction<ColorConfig | null>>;
  // Reference links for research/style context
  referenceLinks?: string[];
  setReferenceLinks?: React.Dispatch<React.SetStateAction<string[]>>;
  // Back navigation handlers
  onBackToInitial: () => void;
  onBackToStyleVibe: () => void;
  outlineStructure?: { title: string; slideTitles: string[] };
  progress?: { current: number; total: number };
  // Test outline creation
  onCreateTestOutline?: () => void;
  // Auto select images toggle
  autoSelectImages?: boolean;
  setAutoSelectImages?: React.Dispatch<React.SetStateAction<boolean>>;
  // Research removed
}

const ChatInputView: React.FC<ChatInputViewProps> = ({
  chatInput,
  setChatInput,
  uploadedFiles,
  setUploadedFiles,
  isGenerating,
  loadingStage,
  loadingStatus,
  handleChatSubmit,
  handleFileChange,
  handleUploadClick,
  fileInputRef,
  chatTextareaRef,
  isDraggingOver,
  handleResetInput,
  getFileKey,
  animatingOutUploadedFileKeys,
  handleRemoveUploadedFile,
  handleClearAllUploadedFiles,
  onDragOverChatZone,
  onDragLeaveChatZone,
  onDropChatZone,
  // New props
  interactionStage,
  setInteractionStage,
  handleInitiateOutline,
  // New callbacks
  handleInitialIdeaSubmitted,
  handleStyleVibeSubmitted,
  // New props for color/font selection
  selectedFont,
  setSelectedFont,
  // New color config props
  colorConfig,
  setColorConfig,
  referenceLinks = [],
  setReferenceLinks,
  // Back navigation handlers
  onBackToInitial,
  onBackToStyleVibe,
  outlineStructure,
  progress,
  // Test outline creation
  onCreateTestOutline,
  // Auto select images
  autoSelectImages = false,
  setAutoSelectImages,
  // Research removed
}) => {
  // State for animated sections
  const [activePromptTitle, setActivePromptTitle] = useState('');
  const [activePromptSubtitle, setActivePromptSubtitle] = useState('');
  const [typedMessage, setTypedMessage] = useState('');
  const [currentSystemMessage, setCurrentSystemMessage] = useState(''); // The message to be typed
  const [isButton1Visible, setIsButton1Visible] = useState(false);
  const [isButton2Visible, setIsButton2Visible] = useState(false);
  const [isButton3Visible, setIsButton3Visible] = useState(false);
  const [selectedSlideCount, setSelectedSlideCount] = useState<number | null>(null);
  const [selectedSlidePreset, setSelectedSlidePreset] = useState<'auto' | 'quick' | 'medium' | 'detailed' | null>('auto');
  const [isAnalyzingFiles, setIsAnalyzingFiles] = useState(false);
  const [currentAnalyzingFile, setCurrentAnalyzingFile] = useState<string>('');
  const [analyzingFileProgress, setAnalyzingFileProgress] = useState<{ current: number; total: number } | undefined>();
  
  // State for style dropdown
  const [isStyleDropdownOpen, setIsStyleDropdownOpen] = useState(false);
  const [dynamicFontGroups, setDynamicFontGroups] = useState<Record<string, string[]> | null>(null);
  
  // State for color pickers
  const [isBgPickerOpen, setIsBgPickerOpen] = useState(false);
  const [isTextPickerOpen, setIsTextPickerOpen] = useState(false);
  const [isAccentPickerOpen, setIsAccentPickerOpen] = useState(false);
  
  // State for AI-generated palettes
  const [aiGeneratedPalettes, setAiGeneratedPalettes] = useState<ColorConfig[]>([]);
  const [isGeneratingAiThemes, setIsGeneratingAiThemes] = useState(false);
  const hasRequestedAiThemesRef = useRef(false);
  
  // Add state for animation trigger
  const [animationKey, setAnimationKey] = useState(0);
  const [titleAnimationKey, setTitleAnimationKey] = useState(0);
  // Link popover state
  const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');

  const normalizeUrl = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return '';
    try {
      const hasScheme = /^https?:\/\//i.test(trimmed);
      const withScheme = hasScheme ? trimmed : `https://${trimmed}`;
      const u = new URL(withScheme);
      return u.toString();
    } catch {
      return trimmed; // fallback without validation
    }
  };

  const handleAddReferenceLink = () => {
    if (!setReferenceLinks) return;
    const normalized = normalizeUrl(linkDraft);
    if (!normalized) return;
    // dedupe
    const exists = (referenceLinks || []).some(u => u === normalized);
    if (!exists) {
      setReferenceLinks([...(referenceLinks || []), normalized]);
    }
    setLinkDraft('');
  };

  const handleRemoveReferenceLink = (url: string) => {
    if (!setReferenceLinks) return;
    setReferenceLinks((referenceLinks || []).filter(u => u !== url));
  };
  
  // Use a local state for textarea value to prevent rapid updates
  const [localChatInput, setLocalChatInput] = useState(chatInput);
  
  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Debug logging for file analysis state
  useEffect(() => {
    if (isGenerating && uploadedFiles.length > 0) {
    }
  }, [isGenerating, isAnalyzingFiles, uploadedFiles.length, outlineStructure, loadingStage, loadingStatus]);
  
  // State flags derived from interactionStage - moved after state declarations
  const showTextarea = interactionStage === 'initial' || interactionStage === 'collectingStyleVibe';
  const showInBoxMessageArea = interactionStage === 'typingMessage' || interactionStage === 'showOptions';
  const showSubmitButton = showTextarea && (
    interactionStage === 'collectingStyleVibe' || // Always show submit button for style preferences (skip option)
    localChatInput.trim() || 
    uploadedFiles.length > 0
  );
  const isSubmitButtonDisabled = interactionStage === 'initial' && !localChatInput.trim() && uploadedFiles.length === 0;

  // Disable full-screen loading overlay in favor of inline outline/thinking UI
  const ENABLE_FULL_SCREEN_OVERLAY = false;
  
  // Update local state when prop changes
  useEffect(() => {
    setLocalChatInput(chatInput);
  }, [chatInput]);
  
  // Debounced update handler
  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalChatInput(newValue);
    
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Set new timer for debounced update
    debounceTimerRef.current = setTimeout(() => {
      setChatInput(newValue);
    }, 150); // 150ms debounce
  }, [setChatInput]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const DETAIL_LEVEL_PROMPT_MESSAGE = "Lastly, how detailed should this presentation be?";
  const STYLE_VIBE_PROMPT_TITLE = "Style preference?";
  const STYLE_VIBE_PROMPT_SUBTITLE = "(Optional - click next)";

  // Auto-generate AI themes when dropdown is opened for the first time or if empty
  useEffect(() => {
    if (isStyleDropdownOpen && aiGeneratedPalettes.length === 0 && !hasRequestedAiThemesRef.current && !isGeneratingAiThemes) {
      hasRequestedAiThemesRef.current = true;
      generateAiThemes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, [isStyleDropdownOpen, isGeneratingAiThemes]); // Only trigger when dropdown opens or generation state changes

  // Adjust textarea height whenever chatInput changes (autoresize)
  useEffect(() => {
    if (chatTextareaRef.current && showTextarea) { // showTextarea is true for 'initial' or 'collectingStyleVibe'
      chatTextareaRef.current.style.height = 'auto';
      // Consider a max-height if not already handled by CSS
      chatTextareaRef.current.style.height = `${chatTextareaRef.current.scrollHeight}px`;
    }
  }, [localChatInput, showTextarea]); // Use localChatInput instead of chatInput

  // Add a ref to hold the setInteractionStage function to avoid re-running effects
  const setInteractionStageRef = useRef(setInteractionStage);
  useEffect(() => {
    setInteractionStageRef.current = setInteractionStage;
  }, [setInteractionStage]);

  // Effect for managing interaction stage animations and text changes
  useEffect(() => {
    // Don't run animations during generation to prevent infinite loops
    if (isGenerating) {
      return;
    }
    
    let nextPromptTitle = '';
    let nextPromptSubtitle = '';
    let focusTextarea = false;
    let textareaPlaceholder = "Describe your presentation idea...";

    switch (interactionStage) {
      case 'initial':
        textareaPlaceholder = "What's your presentation about? Try 'pitch deck for my startup' or 'quarterly sales review'...";
        setIsButton1Visible(false);
        setIsButton2Visible(false);
        break;
 
      case 'collectingStyleVibe':
        nextPromptTitle = STYLE_VIBE_PROMPT_TITLE;
        nextPromptSubtitle = STYLE_VIBE_PROMPT_SUBTITLE;
        focusTextarea = true;
        textareaPlaceholder = "Example: For a new product launch: a sleek, innovative vibe, perhaps with a deep blue primary color.";
        break;
 
      case 'typingMessage':
        // Start typing animation
        setCurrentSystemMessage(DETAIL_LEVEL_PROMPT_MESSAGE);
        setTypedMessage(''); // Clear message to ensure animation restarts
        break;
 
      case 'showOptions':
        setCurrentSystemMessage(DETAIL_LEVEL_PROMPT_MESSAGE);
        setTypedMessage(DETAIL_LEVEL_PROMPT_MESSAGE);
        // Immediately show all buttons when we skip to showOptions
        setIsButton1Visible(true);
        setIsButton2Visible(true);
        setIsButton3Visible(true);
        break;
    }

    setActivePromptTitle(nextPromptTitle);
    setActivePromptSubtitle(nextPromptSubtitle);
    
    // Trigger title animation when prompt changes
    if (nextPromptTitle !== activePromptTitle) {
      setTitleAnimationKey(prev => prev + 1);
    }

    // Clear message area for stages that don't need it
    if (interactionStage === 'initial' || interactionStage === 'collectingStyleVibe') {
      setCurrentSystemMessage('');
      setTypedMessage('');
    }

    if (chatTextareaRef.current) {
      if (focusTextarea) {
        chatTextareaRef.current.focus();
      }
      chatTextareaRef.current.placeholder = textareaPlaceholder;
    }
  }, [interactionStage, isGenerating, activePromptTitle]); // Removed setInteractionStage to prevent infinite loop

  // Effect for button visibility (specifically for 'showOptions' stage)
  useEffect(() => {
    let timer1: NodeJS.Timeout | undefined;
    let timer2: NodeJS.Timeout | undefined;
    let timer3: NodeJS.Timeout | undefined;
    if (interactionStage === 'showOptions') {
      // If buttons are already visible (from showOptions case), skip timers
      if (!isButton1Visible && !isButton2Visible && !isButton3Visible) {
        timer1 = setTimeout(() => setIsButton1Visible(true), 100); // Keep delays for sequential appearance
        timer2 = setTimeout(() => setIsButton2Visible(true), 250);
        timer3 = setTimeout(() => setIsButton3Visible(true), 400);
      }
    } else {
      setIsButton1Visible(false);
      setIsButton2Visible(false);
      setIsButton3Visible(false);
    }
    return () => {
      if (timer1) clearTimeout(timer1);
      if (timer2) clearTimeout(timer2);
      if (timer3) clearTimeout(timer3);
    };
  }, [interactionStage]);

  // Typing animation effect
  useEffect(() => {
    if (interactionStage === 'typingMessage' && currentSystemMessage) {
      // Clear typed message to start fresh
      setTypedMessage('');
      
      let currentIndex = 0;
      let intervalId: NodeJS.Timeout | null = null;
      
      // Use interval instead of recursive calls
      intervalId = setInterval(() => {
        if (currentIndex <= currentSystemMessage.length) {
          setTypedMessage(currentSystemMessage.slice(0, currentIndex));
          currentIndex++;
        } else {
          // Clear interval and transition to showOptions
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
          
          setTimeout(() => {
            if (setInteractionStageRef.current) {
              setInteractionStageRef.current('showOptions');
            }
          }, 200);
        }
      }, 35); // 35ms delay between characters
      
      return () => {
        if (intervalId) {
          clearInterval(intervalId);
        }
      };
    }
    
    // Reset typed message when not in typing stage
    return () => {
      setTypedMessage('');
    };
  }, [interactionStage, currentSystemMessage]); // Removed setInteractionStage from dependencies

  // Auto-start outline generation when reaching showOptions, using selected controls
  useEffect(() => {
    if (interactionStage === 'showOptions') {
      (async () => {
        try {
          let detail: 'quick' | 'standard' | 'detailed' = 'standard';
          if (selectedSlidePreset === 'quick') detail = 'quick';
          if (selectedSlidePreset === 'detailed') detail = 'detailed';
          // 'medium' and 'auto' map to 'standard'
          await handleInitiateOutline(
            detail,
            selectedSlideCount !== null ? selectedSlideCount : undefined
          );
        } catch (error) {
          console.error('Error initiating outline:', error);
        }
      })();
    }
  }, [interactionStage, selectedSlideCount, selectedSlidePreset, handleInitiateOutline]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (interactionStage === 'initial') {
        if (localChatInput.trim() || uploadedFiles.length > 0) {
          handleInitialIdeaSubmitted();
        }
      } else if (interactionStage === 'collectingStyleVibe') {
        handleStyleVibeSubmitted();
      }
    }
  };

  const handleSubmitClick = () => {
    if (interactionStage === 'initial') {
      if (localChatInput.trim() || uploadedFiles.length > 0) {
        handleInitialIdeaSubmitted();
      }
    } else if (interactionStage === 'collectingStyleVibe') {
      handleStyleVibeSubmitted();
    }
  };

  const handleUserReset = () => {
    handleResetInput(); // Prop from OutlineEditor that clears its own state
    setActivePromptTitle('');
    setActivePromptSubtitle('');
    // setInteractionStage('initial') is handled by handleResetInput from parent
  };

  // Transform FONT_CATEGORIES for GroupedDropdown
  const fontGroups = useMemo(() => {
    try {
      // Prefer deduped groups if available
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { FontLoadingService } = require('@/services/FontLoadingService');
      if (FontLoadingService?.getDedupedFontGroups) {
        return FontLoadingService.getDedupedFontGroups();
      }
    } catch {}
    const groups: Record<string, string[]> = {};
    for (const [category, fonts] of Object.entries(FONT_CATEGORIES)) {
      if (Array.isArray(fonts)) {
        groups[category] = fonts.map(font => font.name);
      } else {
        groups[category] = [];
      }
    }
    return groups;
  }, []);

  // On open, sync backend fonts and refresh groups so PixelBuddha appears
  useEffect(() => {
    let cancelled = false;
    if (isStyleDropdownOpen) {
      (async () => {
        try {
          await FontLoadingService.syncDesignerFonts?.();
        } catch {}
        if (!cancelled) {
          try {
            setDynamicFontGroups(FontLoadingService.getDedupedFontGroups?.() || null);
          } catch {}
        }
      })();
    }
    return () => { cancelled = true; };
  }, [isStyleDropdownOpen]);

  // Helper to generate the label for the style dropdown trigger
  const getStyleDropdownTriggerLabel = () => {
    let parts = [];
    if (colorConfig) {
      switch (colorConfig.type) {
        case 'ai':
          parts.push(colorConfig.name || "AI Theme");
          break;
        case 'default':
        default:
          parts.push("Default Colors");
          break;
      }
    }
    if (selectedFont) {
      parts.push(selectedFont);
    }

    if (parts.length === 0 || (parts.length === 1 && parts[0] === "Default Colors" && !selectedFont)) {
      return "Style Options (Optional)";
    }
    if (parts.length === 1 && parts[0] === "Default Colors" && selectedFont) {
      return `Font: ${selectedFont}`;
    }
     if (parts.length === 1 && parts[0] !== "Default Colors" && !selectedFont) {
      return `Palette: ${parts[0]}`;
    }
    return parts.join(" / ");
  };

  // Function to generate AI themes
  const generateAiThemes = async () => {
    setIsGeneratingAiThemes(true);
    try {
      const response = await fetch("https://api.huemint.com/color", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          mode: "transformer", num_colors: 3, temperature: "1.2",
          num_results: 5, 
          adjacency: ["0","60","50","60","0","50","50","50","0"],
          palette: ["-","-","-"]
        }),
      });
      if (!response.ok) throw new Error(`Huemint API error: ${response.statusText}`);
      const data = await response.json();
      const newThemes: ColorConfig[] = data.results.map((result: { palette: string[] }, index: number) => ({
        type: 'ai',
        name: `AI Theme ${index + 1}`,
        background: result.palette[0],
        text: result.palette[1],
        accent1: result.palette[2],
      }));
      setAiGeneratedPalettes(newThemes);
    } catch (error) { 
      console.error("Failed to generate AI themes:", error); 
      if (aiGeneratedPalettes.length === 0) setColorConfig(null); 
    } finally { 
      setIsGeneratingAiThemes(false); 
    }
  };

  // Function to render AI theme preview cards
  const renderAiThemePreview = (theme: ColorConfig, onClick: () => void) => {
    return (
      <Card
        key={theme.name}
        className={cn(
          "p-1.5 cursor-pointer transition-all hover:ring-2 hover:ring-orange-500 shrink-0 w-24 h-auto",
          colorConfig?.type === 'ai' && colorConfig.name === theme.name ? 'ring-2 ring-orange-500 bg-orange-50 dark:bg-orange-900/30' : ''
        )}
        onClick={onClick}
        title={theme.name}
      >
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-5 w-full rounded-sm overflow-hidden border border-neutral-300 dark:border-neutral-600">
            <div className="flex-1 h-full" style={{ backgroundColor: theme.background }} />
            <div className="flex-1 h-full" style={{ backgroundColor: theme.text }} />
            <div className="flex-1 h-full" style={{ backgroundColor: theme.accent1 }} />
          </div>
          <div className="text-[10px] font-medium truncate text-center mt-0.5">
            {theme.name}
          </div>
        </div>
      </Card>
    );
  };

  // Handler for updating a single custom color
  const handleCustomColorChange = (colorType: 'background' | 'text' | 'accent1', newColorValue: string) => {
    setColorConfig(prevConfig => {
      let baseConfig = prevConfig;
      // If no specific config was set (null) or it was 'default', and AI palettes exist,
      // use the first AI palette as the base for non-changed custom colors.
      if ((!baseConfig || baseConfig.type === 'default') && aiGeneratedPalettes.length > 0) {
        baseConfig = aiGeneratedPalettes[0]; // Use first AI theme as base for initial custom edits
      }

      const newCustomConfig: ColorConfig = {
        type: 'custom',
        name: 'Custom', // Or derive from baseConfig.name + " (Customized)"
        background: baseConfig?.background || '#FFFFFF', 
        text: baseConfig?.text || '#000000',
        accent1: baseConfig?.accent1 || '#FF69B4',
      };

      if (colorType === 'background') newCustomConfig.background = newColorValue;
      if (colorType === 'text') newCustomConfig.text = newColorValue;
      if (colorType === 'accent1') newCustomConfig.accent1 = newColorValue;
      
      return newCustomConfig;
    });
  };

  // Determine displayed colors for pickers (suggestion from AI or current config)
  const displayBgColor = (colorConfig && colorConfig.type !== 'default' ? colorConfig.background : (aiGeneratedPalettes[0]?.background)) || '#FFFFFF';
  const displayTextColor = (colorConfig && colorConfig.type !== 'default' ? colorConfig.text : (aiGeneratedPalettes[0]?.text)) || '#000000';
  const displayAccent1Color = (colorConfig && colorConfig.type !== 'default' ? colorConfig.accent1 : (aiGeneratedPalettes[0]?.accent1)) || '#FF69B4';

  // Function to parse and format stage messages
  const parseStageMessage = (message: string) => {
    // Check if message contains stage pattern like "Stage 1/4: ..."
    const stageMatch = message.match(/^(Stage \d+\/\d+):?\s*(.*)$/);
    if (stageMatch) {
      const [, stageText, remainingText] = stageMatch;
      
      // Check if remaining text contains file pattern like "Uploaded file 1/3 - filename"
      const fileMatch = remainingText.match(/^(.*?)\s*-\s*(.+)$/);
      if (fileMatch) {
        const [, fileProgress, filename] = fileMatch;
        return {
          stage: stageText,
          fileProgress: fileProgress.trim(),
          filename: filename.trim()
        };
      }
      
      return {
        stage: stageText,
        details: remainingText.trim()
      };
    }
    
    return { message };
  };
  
  // Extract phase from message
  const extractPhaseFromMessage = (message?: string | null): string | null => {
    if (!message) return null;
    
    // Common phase keywords
    const phaseMap: Record<string, string> = {
      'initializing': 'initialization',
      'creating deck': 'initialization',
      'theme': 'theme_generation',
      'design': 'theme_generation',
      'color': 'theme_generation',
      'finding images': 'image_collection',
      'searching images': 'image_collection',
      'image': 'image_collection',
      'generating slide': 'slide_generation',
      'creating slide': 'slide_generation',
      'slide': 'slide_generation',
      'finalizing': 'finalization',
      'completing': 'finalization'
    };
    
    const lowerMessage = message.toLowerCase();
    for (const [keyword, phase] of Object.entries(phaseMap)) {
      if (lowerMessage.includes(keyword)) {
        return phase;
      }
    }
    
    return null;
  };
  
  // Extract progress percentage from message if available
  const extractProgressFromMessage = (message?: string | null): number | null => {
    if (!message) return null;
    
    // Look for percentage pattern (e.g., "50%", "Progress: 75%")
    const percentMatch = message.match(/(\d+)%/);
    if (percentMatch) {
      return parseInt(percentMatch[1]);
    }
    
    return null;
  };

  // Parse stage message (pure)
  const parsedMessage = useMemo(() => {
    const currentMessage = loadingStatus?.message || loadingStage || 'Generating your slides with AI...';
    return parseStageMessage(currentMessage);
  }, [loadingStatus?.message, loadingStage]);

  // Drive analyzing flags from parsed message and loading state without causing render loops
  useEffect(() => {
    const lowerStage = loadingStage ? loadingStage.toLowerCase() : '';
    if (parsedMessage.stage && parsedMessage.fileProgress) {
      setIsAnalyzingFiles(true);
      if (parsedMessage.filename) {
        setCurrentAnalyzingFile(parsedMessage.filename);
      }
      const match = parsedMessage.fileProgress.match(/(\d+)\s*\/\s*(\d+)/);
      if (match) {
        setAnalyzingFileProgress({ current: parseInt(match[1], 10), total: parseInt(match[2], 10) });
      }
      return;
    }

    if (loadingStatus?.stage === 'analyzing' || lowerStage.includes('analyzing') || lowerStage.includes('processing file')) {
      setIsAnalyzingFiles(true);
      return;
    }

    if (!isGenerating) {
      setIsAnalyzingFiles(false);
      setCurrentAnalyzingFile('');
      setAnalyzingFileProgress(undefined);
    }
  }, [parsedMessage, loadingStatus?.stage, loadingStage, isGenerating]);

  return (
    <TooltipProvider>
      {/* Custom glassy tooltip styles */}
      <style>{`
        [role="tooltip"] {
          backdrop-filter: blur(16px) saturate(180%) !important;
          background: rgba(255, 255, 255, 0.7) !important;
          border: 1px solid rgba(255, 255, 255, 0.3) !important;
          box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.15) !important;
        }
        
        .dark [role="tooltip"] {
          background: rgba(0, 0, 0, 0.7) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3) !important;
        }
        
        [role="tooltip"] * {
          color: rgb(39, 39, 42) !important;
        }
        
        .dark [role="tooltip"] * {
          color: rgb(244, 244, 245) !important;
        }
        
        .custom-tooltip {
          backdrop-filter: blur(16px) saturate(180%);
          background: rgba(255, 255, 255, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.3);
          box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.15);
        }
        
        .dark .custom-tooltip {
          background: rgba(0, 0, 0, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
        }
      `}</style>
      
      {/* Conditionally apply margins. When loading, we want to rely on parent centering. */}
      <div className={cn(
        "flex flex-col overflow-visible items-center",
        !isGenerating ? "mt-40 mb-24" : "w-full h-full justify-center" // Full width/height and justify for loading
      )}>
        {!isGenerating ? (
          <>
            <div 
              className={cn(
                "w-full self-center relative max-w-xl"
              )}
            >
              {/* Back Button - Positioned absolutely, to the left of the title/input area */}
              {(interactionStage === 'collectingStyleVibe' || interactionStage === 'typingMessage' || interactionStage === 'showOptions') && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-[-32px] top-[2px] h-8 w-8 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 z-20" // Adjusted left from -40px to -32px
                  onClick={() => {
                    if (interactionStage === 'collectingStyleVibe') {
                      onBackToInitial();
                    } else if (interactionStage === 'typingMessage' || interactionStage === 'showOptions') {
                      onBackToStyleVibe();
                    }
                  }}
                  title="Go back"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
              )}
              
              {/* Prompt Area: Title + Subtitle */}
              {/* This container always takes up space to prevent layout shifts */}
              <div className="min-h-[60px] mb-1.5">
                {/* Title and Subtitle - Rendered only when activePromptTitle exists */}
                {activePromptTitle && (
                  <div className="pt-2"> {/* Title text: pt-2 (was pt-1) */}
                    <div className="flex items-baseline gap-x-2"> 
                      <h2 className="text-md text-neutral-700 dark:text-neutral-200 text-left">
                        <span 
                          key={`title-typing-${titleAnimationKey}`}
                          className="typing-animation"
                          style={{
                            '--message-length': activePromptTitle?.length || 0,
                            '--animation-duration': `${(activePromptTitle?.length || 0) * 30}ms`,
                            display: 'inline-block',
                            verticalAlign: 'baseline',
                            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                            fontWeight: 600,
                            letterSpacing: '-0.02em',
                            textTransform: 'none'
                          } as React.CSSProperties}
                        >
                          {activePromptTitle}
                        </span>
                        <span className="typing-cursor ml-0.5" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>|</span>
                      </h2>
                    </div>
                    {activePromptSubtitle && (
                      <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                        <span 
                          key={`subtitle-fade-${titleAnimationKey}`}
                          className="inline-block animate-in fade-in duration-500"
                          style={{
                            animationDelay: `${(activePromptTitle?.length || 0) * 30 + 300}ms`,
                            animationFillMode: 'both',
                            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                            fontWeight: 400,
                            letterSpacing: '-0.01em'
                          }}
                        >
                          {activePromptSubtitle}
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Input Section content */}
              <div className="relative"> {/* This was the original input section div w-full max-w-lg self-center, now just relative */}
                {/* Tooltip above input */}
                {uploadedFiles.length === 0 && interactionStage === 'initial' && (
                  <div className={cn(
                    "absolute -top-[4.25rem] left-1/2 transform translate-x-24 w-64 p-3 rounded-lg backdrop-blur-md bg-white/10 dark:bg-neutral-800/10 shadow-lg border border-[#383636] text-xs text-[#383636] dark:text-gray-100 z-50",
                    "transition-opacity duration-300 ease-out",
                    localChatInput ? "opacity-0 pointer-events-none" : "opacity-100"
                  )}>
                    <div className="absolute bottom-0 left-8 transform -translate-x-1/2 translate-y-full">
                      <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-[#383636]"></div>
                    </div>
                    Describe your presentation topic and I'll create professional slides for you.
                  </div>
                )}
                
                <div 
                  className={cn(
                    "relative group overflow-hidden backdrop-blur-md bg-white/10 dark:bg-neutral-800/10 shadow-[0_8px_32px_0_rgba(31,38,135,0.05)] border z-10 rounded-3xl pb-2",
                    isDraggingOver ? 'border-orange-500 border-dashed border-2' : 'border-[#383636]',
                    interactionStage !== 'initial' &&
                    interactionStage !== 'collectingStyleVibe' &&
                    interactionStage !== 'typingMessage' && 
                    interactionStage !== 'showOptions' && 
                    'py-4'
                  )}
                  data-chat-input-wrapper="true"
                  style={{
                    transition: interactionStage === 'typingMessage' ? 'none' : 'border-color 300ms, box-shadow 300ms'
                  }}
                  onDragOver={onDragOverChatZone} 
                  onDragLeave={onDragLeaveChatZone} 
                  onDrop={onDropChatZone}
                >
                  {/* Orange accent line */}
                  {!localChatInput && interactionStage !== 'typingMessage' && interactionStage !== 'showOptions' && (
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 w-[1px] h-10 bg-orange-500"></div>
                  )}
                  
                  {showTextarea && (
                    <div className="max-h-80 px-0 flex items-center min-h-[32px]">
                      <textarea
                        ref={chatTextareaRef}
                        value={localChatInput} 
                        onChange={handleTextareaChange}
                        onKeyDown={handleKeyDown}
                        placeholder={
                          interactionStage === 'initial'
                            ? "What's your presentation about?"
                            : interactionStage === 'collectingStyleVibe'
                            ? "Example: For a new product launch: a sleek, innovative vibe, perhaps with a deep blue primary color."
                            : "" // Default empty placeholder
                        }
                        className={cn(
                          "w-full bg-transparent border-0 text-[#383636] dark:text-gray-200 placeholder:text-[#383636] dark:placeholder:text-gray-100 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 pt-3 pb-1 pl-10 pr-14 resize-none text-lg overflow-y-auto max-h-80 min-h-[32px]"
                        )}
                        style={{
                          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                          fontWeight: 400,
                          letterSpacing: '-0.01em'
                        }}
                        disabled={!showTextarea} 
                      />
                    </div>
                  )}
                  
                  {/* In-box message area (for "Lastly...") */}
                  {showInBoxMessageArea && (
                    <div 
                      className={cn(
                         "px-6 py-2 text-neutral-700 dark:text-neutral-300 h-[52px] flex flex-col justify-center items-start w-full text-lg"
                      )}
                    >
                        <p className="w-full whitespace-nowrap overflow-hidden text-lg leading-tight" style={{
                          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                          fontWeight: 500,
                          letterSpacing: '-0.02em',
                          textTransform: 'none'
                        }}>
                          <span key={`message-${animationKey}`}>
                            {typedMessage}
                          </span>
                          {interactionStage === 'typingMessage' && (
                            <span className="typing-cursor ml-0.5" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>|</span>
                          )}
                        </p>
                    </div>
                  )}
                  
                  {/* Submit Button */}
                  {showTextarea && (
                    (() => {
                      const isMacLike = typeof navigator !== 'undefined' && /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform || '');
                      const shortcutLabel = isMacLike ? '⌘↩' : 'Ctrl ↵';
                      return (
                        <Button
                          onClick={handleSubmitClick}
                          title={`Next (${isMacLike ? 'Command' : 'Ctrl'} + Enter)`}
                          className={cn(
                            "absolute right-2 top-1/2 -translate-y-1/2 rounded-lg h-12 w-14 px-2 flex items-center justify-center",
                            "bg-[#FFF4CC] text-[#383636] border border-[#F6E7B1] shadow-sm",
                            "hover:bg-[#FFF4CC]/90",
                            "dark:bg-amber-900/30 dark:text-amber-50 dark:border-amber-700/50",
                            "transition-opacity transition-transform duration-300 ease-in-out",
                            "hover:scale-105 active:scale-95",
                            showSubmitButton ? "opacity-100 scale-100" : "opacity-0 scale-0 pointer-events-none"
                          )}
                          disabled={isSubmitButtonDisabled}
                          aria-label={`Next (${isMacLike ? 'Command' : 'Ctrl'} + Enter)`}
                        >
                          <span className="flex flex-col items-center justify-center leading-none select-none w-full">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.25em]" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>Next</span>
                            <span className="text-[12px] font-medium mt-0.5" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>{shortcutLabel}</span>
                          </span>
                        </Button>
                      );
                    })()
                  )}
                  
                  {isDraggingOver && interactionStage === 'initial' && (
                    <div className="absolute inset-0 bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center rounded-[24px] bg-opacity-70 backdrop-blur-sm">
                      <p className="text-orange-600 dark:text-orange-400 font-medium flex items-center flex-col">
                        <Upload className="h-5 w-5 mb-1" />
                        <span className="text-center">Drop images, documents, or spreadsheets here</span>
                        <span className="text-xs mt-1 text-orange-500/70">Supports Excel, CSV, and Google Sheets</span>
                      </p>
                    </div>
                  )}
                </div> {/* End Input Wrapper Div */}

                {/* Upload, Link, and compact inline controls - positioned below bottom right */}
                {interactionStage === 'initial' && (
                  <div className="absolute -bottom-10 right-0 flex items-center gap-2">
                    {/* Compact slide count inline - tooltip removed */}
                    <div className="flex items-center">
                      <div className="flex items-center h-7 rounded-full border border-[#383636]/30 dark:border-gray-600 px-1.5 bg-white/40 dark:bg-neutral-800/30 backdrop-blur-sm shadow-sm">
                        <Presentation className="h-3.5 w-3.5 mr-1 text-[#383636]/80 dark:text-gray-300/80" />
                        <span className="text-[10px] text-[#383636]/80 dark:text-gray-300/80 mr-0.5">Slides</span>
                        <Select
                          value={
                            selectedSlideCount !== null
                              ? `n_${selectedSlideCount}`
                              : (selectedSlidePreset ? (selectedSlidePreset === 'auto' ? 'auto' : `preset_${selectedSlidePreset}`) : 'auto')
                          }
                          onValueChange={(value) => {
                            if (value === 'auto') {
                              setSelectedSlidePreset('auto');
                              setSelectedSlideCount(null);
                              return;
                            }
                            if (value.startsWith('preset_')) {
                              const preset = value.replace('preset_', '') as 'quick' | 'medium' | 'detailed';
                              setSelectedSlidePreset(preset);
                              setSelectedSlideCount(null);
                              return;
                            }
                            if (value.startsWith('n_')) {
                              const num = parseInt(value.slice(2), 10);
                              setSelectedSlideCount(num);
                              setSelectedSlidePreset(null);
                              return;
                            }
                          }}
                        >
                          <SelectTrigger className="w-16 h-6 text-[10px] border-0 bg-transparent shadow-none px-1 focus:ring-0 focus:outline-none" aria-label="Slide count">
                            <SelectValue placeholder="Auto" />
                          </SelectTrigger>
                          <SelectContent className="min-w-[140px]">
                            <SelectItem value="auto">Auto</SelectItem>
                            <SelectItem value="preset_quick">Quick (1–3)</SelectItem>
                            <SelectItem value="preset_medium">Medium (4–8)</SelectItem>
                            <SelectItem value="preset_detailed">Detailed (8+)</SelectItem>
                            <div className="my-1 h-px bg-[#383636]/20 dark:bg-gray-600/50" />
                            {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                              <SelectItem key={num} value={`n_${num}`}>
                                {num}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Research toggle removed */}

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={handleUploadClick} 
                          className="h-6 w-6 rounded-full text-[#383636] dark:text-gray-300 hover:text-[#383636] dark:hover:text-gray-100 hover:bg-[#383636]/10 dark:hover:bg-gray-100/10"
                        >
                          <Upload className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="backdrop-blur-md bg-white/10 dark:bg-neutral-800/10 border border-[#383636]/30">
                        <p className="text-xs">Upload brand assets, existing slides, or reference materials</p>
                      </TooltipContent>
                    </Tooltip>
                    
                    <div className="h-4 w-px bg-[#383636]/30 dark:bg-gray-300/30"></div>
                    
                    <Popover open={isLinkPopoverOpen} onOpenChange={setIsLinkPopoverOpen}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <PopoverTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 rounded-full text-[#383636] dark:text-gray-300 hover:text-[#383636] dark:hover:text-gray-100 hover:bg-[#383636]/10 dark:hover:bg-gray-100/10"
                            >
                              <Link className="h-3.5 w-3.5" />
                            </Button>
                          </PopoverTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="backdrop-blur-md bg-white/10 dark:bg-neutral-800/10 border border-[#383636]/30">
                          <p className="text-xs">Reference websites, articles, or online resources</p>
                        </TooltipContent>
                      </Tooltip>
                      <PopoverContent className="w-80" sideOffset={6} onCloseAutoFocus={(e) => e.preventDefault()}>
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Reference links</div>
                          <div className="flex gap-2">
                            <Input
                              placeholder="https://example.com/article"
                              value={linkDraft}
                              onChange={(e) => setLinkDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddReferenceLink();
                                }
                              }}
                              className="h-8"
                            />
                            <Button size="sm" className="h-8" onClick={handleAddReferenceLink}>Add</Button>
                          </div>
                          {Array.isArray(referenceLinks) && referenceLinks.length > 0 && (
                            <div className="max-h-40 overflow-auto space-y-1">
                              {referenceLinks.map((u, idx) => (
                                <div key={`${u}-${idx}`} className="flex items-center justify-between text-xs bg-zinc-100/60 dark:bg-white/5 border border-zinc-200 dark:border-zinc-700/50 rounded px-2 py-1">
                                  <span className="truncate mr-2" title={u}>{u}</span>
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleRemoveReferenceLink(u)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}

                {/* Reset Button and Drag/Drop Hint, relative to the input section */}
                {(localChatInput.trim() || uploadedFiles.length > 0) && interactionStage === 'initial' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleUserReset}
                    className="absolute left-0 bottom-[-28px] h-6 px-2 text-xs text-zinc-500 hover:text-zinc-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-zinc-100 dark:hover:bg-neutral-800/50 rounded-md"
                    title="Clear input and files"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" /> Reset
                  </Button>
                )}
              </div> {/* End Relative Input Section Div */}

              {/* Structured controls removed in favor of compact inline controls above */}

              {/* Removed research outline box */}

              {/* Compact Custom Style trigger */}
              {interactionStage === 'collectingStyleVibe' && (
                <div className="mt-2 w-full animate-in fade-in slide-in-from-bottom-1 duration-300 fill-mode-forwards">
                  <DropdownMenu open={isStyleDropdownOpen} onOpenChange={setIsStyleDropdownOpen}>
                    <div className="flex items-center gap-3 ml-2 -mt-1">
                      <DropdownMenuTrigger asChild>
                        <span 
                          className="text-[11px] font-medium text-[#FF4301] cursor-pointer select-none inline-block"
                        >
                          Custom Style
                        </span>
                      </DropdownMenuTrigger>
                      {(localChatInput.trim() || uploadedFiles.length > 0) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleUserReset}
                          className="h-6 px-2 text-xs text-zinc-500 hover:text-zinc-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-zinc-100 dark:hover:bg-neutral-800/50 rounded-md"
                          title="Clear input and files"
                        >
                          <RotateCcw className="h-3 w-3 mr-1" /> Reset
                        </Button>
                      )}
                    </div>
                    <DropdownMenuContent 
                      className="w-80 p-0" 
                      onCloseAutoFocus={(e) => e.preventDefault()} 
                    >
                      <div className="space-y-3 p-3">
                        {/* Font Family Section */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center mb-0.5"> {/* Container for Label and Reset Button */}
                            <Label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                              Font Family
                            </Label>
                            <button
                              onClick={() => {
                                setSelectedFont(null);
                                setColorConfig(null);
                                setIsStyleDropdownOpen(false); // Close dropdown on click
                              }}
                              className="text-xs text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:underline p-0 bg-transparent border-none"
                            >
                              Use AI Styling
                            </button>
                          </div>
                          <GroupedDropdown
                            value={selectedFont || ''}
                            options={ALL_FONT_NAMES}
                            groups={dynamicFontGroups || fontGroups}
                            onChange={(value) => setSelectedFont(value === '' ? null : value)}
                            placeholder="Default Font"
                          />
                        </div>

                        <Separator className="my-3" />
                        
                        {/* AI Optimized Palettes Section */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center mb-1">
                            <Label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">AI Optimized Palettes</Label>
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={generateAiThemes}
                              disabled={isGeneratingAiThemes}
                              className="h-6 px-1.5 py-0.5 text-[10px] leading-tight"
                            >
                              {isGeneratingAiThemes ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : "Generate More"}
                            </Button>
                          </div>
                          <ScrollArea 
                            className="h-[76px] w-full"
                            style={{ WebkitMaskImage: 'none', maskImage: 'none' }}
                          >
                            <div className="flex space-x-2 p-1.5">
                              {isGeneratingAiThemes && aiGeneratedPalettes.length === 0 && <p className="text-xs text-muted-foreground p-4 text-center w-full shrink-0">Generating...</p>}
                              {!isGeneratingAiThemes && aiGeneratedPalettes.length === 0 && 
                                <p className="text-xs text-muted-foreground p-4 text-center w-full shrink-0">Click Refresh or use Presets/Default</p>} {/* Updated placeholder */}
                              {/* Display current AI palettes even if generating new ones in background */}
                              {aiGeneratedPalettes.map((theme) => renderAiThemePreview(theme, () => setColorConfig(theme)))}
                            </div>
                            <ScrollBar orientation="horizontal" />
                          </ScrollArea>
                        </div>

                        <Separator className="my-3" />

                        {/* Custom Color Pickers (BG, Text, Accent) - RE-ADDED */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                            Customize Colors
                          </Label>
                          <div className="flex space-x-2 pt-1">
                            {/* Background Picker */}
                            <div className="flex-1 space-y-1">
                              <Label className="text-[10px] text-muted-foreground block text-center">BG</Label>
                              <Popover open={isBgPickerOpen} onOpenChange={setIsBgPickerOpen}>
                                <PopoverTrigger asChild>
                                  <Button variant="outline" className="w-full h-7 p-0 justify-center border">
                                    <div className="h-full w-full rounded-sm" style={{ backgroundColor: displayBgColor }}/>
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-60" onInteractOutside={(e) => e.preventDefault()} sideOffset={5}>
                                  <GradientPicker
                                    value={displayBgColor} // Use display color for picker value
                                    onChange={(val) => handleCustomColorChange('background', typeof val === 'string' ? val : val.stops[0].color)}
                                    forceMode="solid"
                                  />
                                </PopoverContent>
                              </Popover>
                            </div>
                            {/* Text Picker */}
                            <div className="flex-1 space-y-1">
                              <Label className="text-[10px] text-muted-foreground block text-center">Text</Label>
                              <Popover open={isTextPickerOpen} onOpenChange={setIsTextPickerOpen}>
                                <PopoverTrigger asChild>
                                  <Button variant="outline" className="w-full h-7 p-0 justify-center border">
                                    <div className="h-full w-full rounded-sm" style={{ backgroundColor: displayTextColor }}/>
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-60" onInteractOutside={(e) => e.preventDefault()} sideOffset={5}>
                                  <GradientPicker
                                    value={displayTextColor} // Use display color
                                    onChange={(val) => handleCustomColorChange('text', typeof val === 'string' ? val : val.stops[0].color)}
                                    forceMode="solid"
                                  />
                                </PopoverContent>
                              </Popover>
                            </div>
                            {/* Accent Picker */}
                            <div className="flex-1 space-y-1">
                              <Label className="text-[10px] text-muted-foreground block text-center">Accent</Label>
                              <Popover open={isAccentPickerOpen} onOpenChange={setIsAccentPickerOpen}>
                                <PopoverTrigger asChild>
                                  <Button variant="outline" className="w-full h-7 p-0 justify-center border">
                                    <div className="h-full w-full rounded-sm" style={{ backgroundColor: displayAccent1Color }}/>
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-60" onInteractOutside={(e) => e.preventDefault()} sideOffset={5}>
                                  <GradientPicker
                                    value={displayAccent1Color} // Use display color
                                    onChange={(val) => handleCustomColorChange('accent1', typeof val === 'string' ? val : val.stops[0].color)}
                                    forceMode="solid"
                                  />
                                </PopoverContent>
                              </Popover>
                            </div>
                          </div>
                        </div>

                        {/* Image Options removed per requirements */}
                      </div> 
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}

              {/* Options Buttons removed: replaced by structured controls above */}
              {false && (
                <div className="mt-1 animate-in fade-in duration-300 fill-mode-forwards relative z-0">
                  <div className="flex flex-row gap-3 justify-center w-full">
                    <div
                      className={cn(
                        "relative flex-1",
                        "transition-all duration-500 ease-out",
                        isButton1Visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"
                      )}
                    >
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full rounded-lg border border-[#383636] text-[#383636] dark:text-gray-100 px-4 py-2 text-left flex flex-col h-auto shadow-[0_8px_32px_0_rgba(31,38,135,0.05)] hover:border-[#383636]/80 hover:shadow-lg",
                          "transition-all duration-300",
                          "hover:backdrop-blur-md hover:bg-white/10 dark:hover:bg-neutral-800/10"
                        )}
                        onClick={async () => {
                          try {
                            await handleInitiateOutline('quick', selectedSlideCount !== null ? selectedSlideCount : undefined);
                          } catch (error) {
                            console.error('Error initiating outline:', error);
                          }
                        }}
                      >
                        <span className="block text-base font-semibold mb-0.5">Quick</span>
                        <span className="block text-xs text-[#383636]/60 dark:text-gray-300/60 leading-relaxed">
                          1-3 slides
                        </span>
                      </Button>
                    </div>
                    <div
                      className={cn(
                        "relative flex-1",
                        "transition-all duration-500 ease-out",
                        isButton2Visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"
                      )}
                    >
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full rounded-lg border border-[#383636] text-[#383636] dark:text-gray-100 px-4 py-2 text-left flex flex-col h-auto shadow-[0_8px_32px_0_rgba(31,38,135,0.05)] hover:border-[#383636]/80 hover:shadow-lg",
                          "transition-all duration-300",
                          "hover:backdrop-blur-md hover:bg-white/10 dark:hover:bg-neutral-800/10"
                        )}
                        onClick={async () => {
                          try {
                            await handleInitiateOutline('standard', selectedSlideCount !== null ? selectedSlideCount : undefined);
                          } catch (error) {
                            console.error('Error initiating outline:', error);
                          }
                        }}
                      >
                        <span className="block text-base font-semibold mb-0.5">Standard</span>
                        <span className="block text-xs text-[#383636]/60 dark:text-gray-300/60 leading-relaxed">
                          4-8 slides
                        </span>
                      </Button>
                    </div>
                    <div
                      className={cn(
                        "relative flex-1",
                        "transition-all duration-500 ease-out",
                        isButton3Visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"
                      )}
                    >
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full rounded-lg border border-[#383636] text-[#383636] dark:text-gray-100 px-4 py-2 text-left flex flex-col h-auto shadow-[0_8px_32px_0_rgba(31,38,135,0.05)] hover:border-[#383636]/80 hover:shadow-lg",
                          "transition-all duration-300",
                          "hover:backdrop-blur-md hover:bg-white/10 dark:hover:bg-neutral-800/10"
                        )}
                        onClick={async () => {
                          try {
                            await handleInitiateOutline('detailed', selectedSlideCount !== null ? selectedSlideCount : undefined);
                          } catch (error) {
                            console.error('Error initiating outline:', error);
                          }
                        }}
                      >
                        <span className="block text-base font-semibold mb-0.5">Detailed</span>
                        <span className="block text-xs text-[#383636]/60 dark:text-gray-300/60 leading-relaxed">
                          8+ slides
                        </span>
                      </Button>
                    </div>
                  </div>
                  
                  {/* Slide count selector */}
                  <div className={cn(
                    "mt-1 flex flex-col items-center gap-3 animate-in fade-in duration-300",
                    isButton3Visible ? "opacity-100" : "opacity-0 pointer-events-none"
                  )}>
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-sm text-[#383636]/70 dark:text-gray-300/70 font-bold">Or choose exact number of slides:</span>
                      <Select value={selectedSlideCount?.toString() || "auto"} onValueChange={(value) => {
                        const newValue = value === "auto" ? null : parseInt(value);
                        setSelectedSlideCount(newValue);
                      }}>
                        <SelectTrigger className="w-24 h-8 text-sm border-[#383636]/30 dark:border-gray-600">
                          <SelectValue placeholder="Auto" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto</SelectItem>
                          {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                            <SelectItem key={num} value={num.toString()}>
                              {num} {num === 1 ? 'slide' : 'slides'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Generate button for specific slide count */}
                    {selectedSlideCount && (
                      <Button
                        variant="default"
                        className={cn(
                          "px-6 py-2 bg-[#383636] hover:bg-[#383636]/90 text-white rounded-lg shadow-lg",
                          "transition-all duration-300 animate-in fade-in slide-in-from-bottom-2"
                        )}
                        onClick={async () => {
                          try {
                            await handleInitiateOutline('standard', selectedSlideCount);
                          } catch (error) {
                            console.error('Error initiating outline:', error);
                          }
                        }}
                      >
                        Generate {selectedSlideCount} {selectedSlideCount === 1 ? 'Slide' : 'Slides'}
                      </Button>
                    )}
                  </div>

                  {/* Advanced toggles under slide count */}
                  <div className="mt-3 flex flex-col items-center gap-2">
                    {/* Research toggle removed */}
                    <div className="flex items-center gap-3 text-sm text-[#383636]/80 dark:text-gray-200/80">
                      {/*
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!!autoSelectImages}
                          onCheckedChange={(v) => setAutoSelectImages && setAutoSelectImages(!!v)}
                          aria-label="Toggle auto-generate/apply images"
                        />
                        <span className="font-medium">Auto-apply images</span>
                      </div>
                      <span className="text-xs text-[#383636]/60 dark:text-gray-300/60">Generate images per slide (simple, theme-aware)</span>
                      */}
                    </div>
                  </div>
                </div>
              )}

              {/* Tooltip on right side */}
              {uploadedFiles.length === 0 && interactionStage === 'initial' && (
                <div className={cn(
                  "absolute -bottom-12 left-[calc(100%+0.75rem)] w-64 p-3 rounded-lg backdrop-blur-md bg-white/10 dark:bg-neutral-800/10 shadow-lg border border-[#383636] text-xs text-[#383636] dark:text-gray-100 z-50",
                  "transition-opacity duration-300 ease-out",
                  localChatInput ? "opacity-0 pointer-events-none" : "opacity-100"
                )}>
                  <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-full">
                    <div className="w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-r-[8px] border-r-[#383636]"></div>
                  </div>
                  Upload or link references. I can use these to better understand your vision.
                </div>
              )}
            </div> {/* End common wrapper for Input Section and Options Buttons */}
            
            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              accept="image/*,.txt,text/plain,.csv,text/csv,.pdf,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              onChange={handleFileChange}
            />
          </>
        ) : (
          /* Loading Indicator Area - Modified to show inline loading when we have outline structure */
          <div className="flex flex-col items-center">
            {/* Show file analysis loader when we have files and are generating */}
            {isGenerating && uploadedFiles.length > 0 && !outlineStructure && (
              <>
                {/* Show the "First let's perfect your content" header */}
                <div className="w-full max-w-2xl mb-6">
                  <h2 className="text-2xl font-bold text-center text-foreground">
                    First, let's perfect your content
                  </h2>
                </div>
                
                {/* Show the FileAnalysisLoader component */}
                <FileAnalysisLoader 
                  isVisible={true}
                  currentFile={currentAnalyzingFile || uploadedFiles[0]?.name}
                  fileProgress={analyzingFileProgress || { current: 1, total: uploadedFiles.length }}
                  stage={loadingStage || "Processing your files..."}
                />
              </>
            )}
            
            {/* Full-screen overlay intentionally disabled to show outline cards and thinking steps instead */}
            {ENABLE_FULL_SCREEN_OVERLAY && isGenerating && !isAnalyzingFiles && uploadedFiles.length === 0 && 
             (!outlineStructure || (outlineStructure && progress && progress.current < progress.total)) && (
                <SplatterLoadingOverlay 
                  isVisible={isGenerating}
                  message={outlineStructure ? "Generating Your Slides" : "Generating Your Presentation"}
                  stage={loadingStage}
                  progress={progress}
                  phase={extractPhaseFromMessage(loadingStage || loadingStatus?.message)}
                  totalProgress={extractProgressFromMessage(loadingStage || loadingStatus?.message)}
                />
            )}
            
            {/* Remove inline loading indicator - now using full overlay consistently */}
            
            {/* Original loading display for when we don't have structure yet and not analyzing */}
            {!outlineStructure && !isAnalyzingFiles && (
              <>
                {parsedMessage.stage ? (
                  <div className="text-center">
                    <p className="text-xl font-semibold text-foreground mb-1">
                      {parsedMessage.stage}
                    </p>
                    {parsedMessage.fileProgress && (
                      <p className="text-sm text-muted-foreground mb-1">
                        {parsedMessage.fileProgress}
                      </p>
                    )}
                    {parsedMessage.filename && (
                      <p className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
                        {parsedMessage.filename}
                      </p>
                    )}
                    {parsedMessage.details && !parsedMessage.fileProgress && (
                      <p className="text-sm text-muted-foreground">
                        {parsedMessage.details}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-lg font-medium text-foreground text-center">
                    {parsedMessage.message}
                  </p>
                )}
                
                {/* Progress bar if available */}
                {progress && progress.total > 0 && progress.current > 0 && (
                  <div className="w-full max-w-xs mt-4">
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-orange-500 transition-all duration-300 ease-out"
                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 text-center">
                      {Math.round((progress.current / progress.total) * 100)}% complete
                    </p>
                  </div>
                )}
                
                {!isAnalyzingFiles && (
                  <p className="text-sm text-muted-foreground mt-3 text-center">
                    {/* Simple static hint message - dynamic progress is shown above */}
                    {uploadedFiles.length > 0 
                      ? 'Processing files and generating presentation...' 
                      : 'Creating your presentation...'
                    }
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Uploaded Files / Suggestions Area - Conditional on !isGenerating and interactionStage */}
        {!isGenerating && interactionStage === 'initial' && (
          <>
            {uploadedFiles.length > 0 && (
              <div className="mt-6 mb-5 p-3 w-full max-w-lg self-center rounded-xl bg-black/5 dark:bg-white/5 border border-zinc-200/80 dark:border-zinc-700/50 shadow-sm animate-in fade-in">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-400 flex items-center"><Upload className="h-4 w-4 mr-2 text-orange-500 dark:text-orange-400" /> Uploaded Files:</h3>
                  <Button variant="ghost" size="sm" onClick={handleClearAllUploadedFiles} className="h-7 text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-300">Clear All</Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {uploadedFiles.map((file, index) => {
                    const fileKey = getFileKey(file);
                    return (
                      <div
                        key={fileKey}
                        className={cn(
                          "flex items-center gap-2 bg-zinc-100/50 dark:bg-white/5 rounded-md p-1.5 text-sm text-zinc-700 dark:text-neutral-400 hover:bg-zinc-200/50 dark:hover:bg-white/10 border border-zinc-200 dark:border-zinc-700/50 shadow-sm overflow-hidden",
                          "opacity-0",
                          animatingOutUploadedFileKeys.has(fileKey) ? 'animate-media-tag-out' : 'animate-media-tag-in'
                        )}
                        style={{
                          animationDelay: animatingOutUploadedFileKeys.has(fileKey) ? '0s' : `${index * 0.05}s`
                        }}
                      >
                        {file.type.startsWith('image/') ? <ImageIcon className="h-4 w-4 text-orange-500" /> : <FilePlus className="h-4 w-4 text-blue-500" />}
                        <span className="truncate max-w-[180px]">{file.name}</span>
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0 rounded-full hover:bg-black/20 dark:hover:bg-white/20" onClick={() => handleRemoveUploadedFile(fileKey)}>
                          <Trash2 className="h-3 w-3 text-zinc-500 dark:text-neutral-400" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {uploadedFiles.length === 0 && (
              <div className="w-full max-w-lg self-center">
                <div className="mt-28 text-[#383636] dark:text-gray-100 text-base text-left">You can try something like:</div>
                <div className="mt-4 flex flex-wrap justify-start gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        className="rounded-full border-[#383636] text-white bg-[#383636] hover:bg-[#383636]/90 py-1 px-3 h-auto text-sm"
                        onClick={() =>
                          setChatInput(
                            "Create an investor pitch deck for a seed-stage SaaS startup. Include problem, solution, product demo highlights, market size (TAM/SAM/SOM), business model, competitive landscape, traction metrics, go-to-market strategy, financial projections, team, and the fundraising ask. Use clean visuals and concise copy. Aim for 10–12 slides."
                          )
                        }
                      >
                        Build an investor pitch deck
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs backdrop-blur-2xl bg-white/40 dark:bg-neutral-800/40 border border-white/30 dark:border-neutral-700/30">
                      <p className="text-xs">Problem, market, traction, GTM, team, ask</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        className="rounded-full border-[#383636] text-white bg-[#383636] hover:bg-[#383636]/90 py-1 px-3 h-auto text-sm"
                        onClick={() =>
                          setChatInput(
                            "Create a quarterly business review (QBR) for a B2B SaaS company. Include executive summary, revenue (ARR/MRR) trends, churn and expansion, pipeline and bookings, product updates, roadmap progress, top customers and case studies, support SLAs, risks with mitigations, and next-quarter OKRs. 8–12 slides with clear charts and tables."
                          )
                        }
                      >
                        Run a quarterly business review
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs backdrop-blur-2xl bg-white/40 dark:bg-neutral-800/40 border border-white/30 dark:border-neutral-700/30">
                      <p className="text-xs">ARR/MRR, churn, pipeline, OKRs</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        className="rounded-full border-[#383636] text-white bg-[#383636] hover:bg-[#383636]/90 py-1 px-3 h-auto text-sm"
                        onClick={() =>
                          setChatInput(
                            "Create a go-to-market strategy for launching a new product. Include target audience and ICP, positioning and messaging pillars, pricing and packaging, channel mix, content plan, launch timeline, budget allocation, KPIs, experiment plan, and risks with mitigations. Include timelines and scorecards. 8–10 slides."
                          )
                        }
                      >
                        Plan a go‑to‑market strategy
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs backdrop-blur-2xl bg-white/40 dark:bg-neutral-800/40 border border-white/30 dark:border-neutral-700/30">
                      <p className="text-xs">ICP, positioning, channels, KPIs, timeline</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        className="rounded-full border-[#383636] text-white bg-[#383636] hover:bg-[#383636]/90 py-1 px-3 h-auto text-sm"
                        onClick={() =>
                          setChatInput(
                            "Create a project proposal and roadmap for an internal initiative. Include problem statement, objectives and success metrics, scope and out-of-scope, milestones and timeline, dependencies, resourcing plan, budget, risks and mitigations, communications plan, and next steps. 6–10 slides."
                          )
                        }
                      >
                        Draft a project proposal
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs backdrop-blur-2xl bg-white/40 dark:bg-neutral-800/40 border border-white/30 dark:border-neutral-700/30">
                      <p className="text-xs">Goals, scope, milestones, risks, resources</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                

                

              </div>
            )}
          </>
        )}
      </div> {/* End mt-40 mb-24 flex div */}
    </TooltipProvider>
  );
};

export default ChatInputView;