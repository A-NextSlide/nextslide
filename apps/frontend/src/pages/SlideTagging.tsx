import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  parseGoogleSlide, 
  extractTextContent,
  isGoogleSlideFile
} from '@/services/GoogleSlideService';
import { Loader2, FileText, CheckCircle2, XCircle, DownloadCloud, UploadCloud, ChevronLeft, ChevronRight, Plus, Save, X, Tag, Edit2, Check, Brain, Zap, List, Eye, Search, Trash2, FileImage, Camera, Image, SkipBack, SkipForward, Clock } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
// Import the schema from our local file instead of an external path
import typeboxSchemas from '@/config/typeboxSchemas';
import SlideComponent from '@/components/Slide';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { ActiveSlideProvider } from '@/context/ActiveSlideContext';
import { EditorStateProvider } from '@/context/EditorStateContext';
import { NavigationProvider } from '@/context/NavigationContext';
import { SlideTemplateService } from '@/services/SlideTemplateService';
import { SlideTemplateAIService } from '@/services/SlideTemplateAIService';
import { Badge } from '@/components/ui/badge';
import { captureSlideScreenshot } from '@/utils/slideScreenshot';
import { PPTXScreenshotService, SlideScreenshot } from '@/services/PPTXScreenshotService';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TooltipProvider } from '@/components/ui/tooltip';

interface ParsedResult {
  fileName: string;
  jsonData: any;
  error?: string;
}

// Simplified Deck and Slide types for the renderer based on Renderer.tsx
interface RenderableComponent {
  id: string;
  type: string;
  props: any;
}

interface RenderableSlide {
  id: string;
  title: string;
  components: RenderableComponent[];
  width?: number;
  height?: number;
  preview?: string;
  thumbnail?: string;
}

interface RenderableDeck {
  id: string;
  name: string;
  slides: RenderableSlide[];
  width: number;
  height: number;
}

// Define a type for your translated slide data structure based on the example
export interface TranslatedSlideComponent {
  id: string;
  type: string; // e.g., "Background", "TiptapTextBlock", "Image"
  props: any;   // This will conform to the props in typeboxSchemas for that type
}

export interface TranslatedSlide {
  id: string;
  title: string;
  components: TranslatedSlideComponent[];
}

export interface TranslatedDeck {
  slides: TranslatedSlide[];
  // Add other deck-level properties if necessary
}

// Helper to get default props for a component type from the schema
const getDefaultProps = (componentType: string): any => {
  const schema = (typeboxSchemas as any)[componentType];
  return schema ? schema.defaultProps || {} : {};
};

// Update the DebugComponentVisualizer component to make image-specific details more visible
const DebugComponentVisualizer: React.FC<{components: any[]}> = ({components}) => {
  return (
    <div className="absolute inset-0 w-full h-full" style={{pointerEvents: 'none'}}>
      {components.map((comp, index) => {
        // Skip background for individual visualization
        if (comp.type === 'Background') return null;
        
        const position = comp.props.position || {x: 0, y: 0};
        const width = comp.props.width || 100;
        const height = comp.props.height || 100;
        
        // Different color for image vs text components
        const color = comp.type === 'Image' 
          ? '#ff220055' // More visible red for images
          : ['#ff000033', '#00ff0033', '#0000ff33', '#ffff0033', '#ff00ff33'][index % 5];
        
        // Note: We don't scale positions here because we're already within the 1920x1080 coordinate system
        return (
          <div 
            key={comp.id}
            style={{
              position: 'absolute',
              left: `${position.x}px`, // Already in the 1920x1080 coordinate system
              top: `${position.y}px`,
              width: `${width}px`,
              height: `${height}px`,
              backgroundColor: color,
              border: '1px dashed rgba(0, 0, 0, 0.5)',
              zIndex: 1000 + index,
              fontSize: '10px',
              overflow: 'hidden',
              paddingLeft: '2px',
              color: '#000',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start'
            }}
          >
            {comp.type} id:{comp.id.substring(0,8)}
            {comp.type === 'TiptapTextBlock' && comp.props.texts?.content && (
              <div style={{fontSize: '7px', marginTop: '2px', overflow: 'hidden'}}>
                {JSON.stringify(comp.props.texts?.content).substring(0, 50)}...
              </div>
            )}
            {comp.type === 'Image' && (
              <div style={{fontSize: '8px', marginTop: '2px', overflow: 'hidden', 
                    backgroundColor: 'rgba(255,255,255,0.8)', padding: '2px'}}>
                {comp.props.clipShape && <div>Shape: {comp.props.clipShape}</div>}
                {comp.props.cropRect && <div>Cropped: {JSON.stringify(comp.props.cropRect).substring(0, 50)}</div>}
                {comp.props.borderRadius > 0 && <div>Radius: {comp.props.borderRadius}</div>}
                <div>src: {comp.props.src ? (comp.props.src.length > 30 ? comp.props.src.substring(0, 30) + '...' : comp.props.src) : 'none'}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const translateToAppSchema = (parsedDeck: any): TranslatedDeck | null => {
  if (!parsedDeck || !parsedDeck.slides || !Array.isArray(parsedDeck.slides)) {
    console.error('Invalid parsed deck structure for translation');
    return null;
  }

  // Ensure slide dimensions are set correctly
  const slideWidth = parsedDeck.slideWidthPx || 1920;
  const slideHeight = parsedDeck.slideHeightPx || 1080;
  
  // Remove console.log
  // console.log('TRANSLATING TO APP SCHEMA - DECK INFO:', {
  //   slideCount: parsedDeck.slides.length,
  //   slideWidthPx: slideWidth,
  //   slideHeightPx: slideHeight,
  //   slideWidthEmu: parsedDeck.slideWidthEmu,
  //   slideHeightEmu: parsedDeck.slideHeightEmu
  // });

  const translatedSlides = parsedDeck.slides.map((parsedSlide: any, slideIndex: number) => {
    // Remove console.log
    // console.log(`TRANSLATING SLIDE ${slideIndex+1}/${parsedDeck.slides.length}:`, {
    //   id: parsedSlide.objectId,
    //   pageElementCount: parsedSlide.pageElements?.length || 0
    // });

    const slideId = parsedSlide.objectId || `slide-${Date.now()}-${slideIndex}`;
    let slideTitle = 'Untitled Slide';
    
    // Attempt to find a title from a placeholder or a prominent text box
    if (parsedSlide.pageElements && parsedSlide.pageElements.length > 0) {
        const titleElement = parsedSlide.pageElements.find(
            (el: any) => el.props?.isPlaceholder && (el.props.placeholderType === 'title' || el.props.placeholderType === 'ctrTitle')
        );
        if (titleElement && titleElement.props?.texts?.content?.[0]?.content?.[0]?.text) {
            slideTitle = titleElement.props.texts.content[0].content[0].text;
        } else {
            // Fallback: get the first text element content if no title placeholder
            const firstTextElement = parsedSlide.pageElements.find((el:any) => el.type === 'TiptapTextBlock' && el.props?.texts?.content?.[0]?.content?.[0]?.text);
            if (firstTextElement) {
                slideTitle = firstTextElement.props.texts.content[0].content[0].text.substring(0,50); // limit length
            }
        }
    }

    const components: TranslatedSlideComponent[] = [];

    // 1. Translate Background - with fixed properties
    const backgroundDefaults = getDefaultProps('Background');
    const backgroundProps = {
      ...backgroundDefaults,
      ...(parsedSlide.background || {}), // Parsed background props
      // Explicitly set width/height/position to ensure they're correct
      width: slideWidth,
      height: slideHeight,
      position: {x: 0, y: 0}, // Background is always at 0,0
    };
    
    components.push({
      id: `bg-${slideId}`,
      type: 'Background',
      props: backgroundProps,
    });

    // 2. Translate Page Elements
    if (parsedSlide.pageElements && Array.isArray(parsedSlide.pageElements)) {
      // Process each element
      parsedSlide.pageElements.forEach((element: any, elIndex: number) => {
        // Remove console.log
        // console.log(`  TRANSLATING ELEMENT ${elIndex+1}/${parsedSlide.pageElements.length}:`, {
        //   id: element.id,
        //   type: element.type,
        //   propKeys: Object.keys(element.props || {})
        // });
        
        const componentId = element.id || `el-${slideId}-${elIndex}`;
        let translatedType = element.type; // Directly use parsed type for now
        let specificProps = {};

        // Map parsed types to TypeBox schema types
        // This mapping will need to be robust based on parser output
        if (element.type === 'TiptapTextBlock') {
          translatedType = 'TiptapTextBlock';
          const defaultTextProps = getDefaultProps(translatedType);
          
          // Ensure all required props are present with valid defaults
          specificProps = {
            ...defaultTextProps,
            ...element.props,
            texts: element.props.texts || defaultTextProps.texts,
            fontFamily: element.props.fontFamily || 'Arial',
            fontSize: element.props.fontSize || 18,
            fontWeight: element.props.fontWeight || 'normal',
            fontStyle: element.props.fontStyle || 'normal',
            backgroundColor: element.props.backgroundColor || '#00000000',
            letterSpacing: element.props.letterSpacing || 0,
            lineHeight: element.props.lineHeight || 1.5,
            alignment: element.props.alignment || 'left',
            verticalAlignment: element.props.verticalAlignment || 'top',
            padding: element.props.padding || 10,
          };
        } else if (element.type === 'Image') {
          translatedType = 'Image';
          const defaultImageProps = getDefaultProps(translatedType);
          specificProps = {
            ...defaultImageProps,
            ...element.props,
            src: element.props.src || defaultImageProps.src || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
            alt: element.props.alt || 'Image',
            objectFit: element.props.objectFit || 'contain',
            
            // Preserve the clip shape and cropping info from the original parsed data
            clipShape: element.props.clipShape || null,
            cropRect: element.props.cropRect || null,
            
            // Set border radius based on shape if not already defined
            borderRadius: element.props.borderRadius || (element.props.clipShape === 'circle' ? '50%' : 0),
            
            borderWidth: element.props.borderWidth || 0,
            borderColor: element.props.borderColor || '#00000000',
            shadow: element.props.shadow || false,
          };
        } else if (element.type === 'Shape') {
          translatedType = 'Shape';
          const defaultShapeProps = getDefaultProps(translatedType);
          specificProps = {
            ...defaultShapeProps,
            ...element.props,
            shapeType: element.props.shapeType || defaultShapeProps.shapeType || 'rectangle',
            fill: element.props.fill || defaultShapeProps.fill || '#4287f5ff',
            stroke: element.props.stroke || defaultShapeProps.stroke || '#00000000',
            strokeWidth: element.props.strokeWidth || defaultShapeProps.strokeWidth || 0,
          };
        } else if (element.type === 'Lines') {
          translatedType = 'Lines';
          const defaultLinesProps = getDefaultProps(translatedType);
          specificProps = {
            ...defaultLinesProps,
            ...element.props,
            startPoint: element.props.startPoint || defaultLinesProps.startPoint || { x: 0, y: 100, connection: null },
            endPoint: element.props.endPoint || defaultLinesProps.endPoint || { x: 400, y: 100, connection: null },
            connectionType: element.props.connectionType || defaultLinesProps.connectionType || 'straight',
            startShape: element.props.startShape || defaultLinesProps.startShape || 'none',
            endShape: element.props.endShape || defaultLinesProps.endShape || 'arrow',
            stroke: element.props.stroke || defaultLinesProps.stroke || '#000000ff',
            strokeWidth: element.props.strokeWidth || defaultLinesProps.strokeWidth || 2,
            strokeDasharray: element.props.strokeDasharray || defaultLinesProps.strokeDasharray || '',
            controlPoints: element.props.controlPoints || defaultLinesProps.controlPoints || [],
          };
        } else {
          // For unmapped types, try to find a generic default or skip
          // console.warn(`Unmapped element type during translation: ${element.type}. Using raw props.`);
          specificProps = element.props;
        }
        
        // Common properties (position, size, rotation, opacity, zIndex)
        // These should be directly from element.props after parsing and EMU conversion
        const commonProps = {
            position: element.props.position || { x: 0, y: 0 },
            width: element.props.width || 100,
            height: element.props.height || 100,
            rotation: element.props.rotation || 0,
            opacity: element.props.opacity ?? 1, // Use nullish coalescing for opacity
            zIndex: element.props.zIndex || components.length + 1, // Simple zIndex
        };

        // Remove console.log
        // console.log(`    FINAL ELEMENT PROPS:`, {
        //   type: translatedType,
        //   position: commonProps.position,
        //   width: commonProps.width,
        //   height: commonProps.height
        // });

        if (translatedType && (typeboxSchemas as any)[translatedType]) {
             components.push({
                id: componentId,
                type: translatedType,
                props: {
                    ...(getDefaultProps(translatedType)), // Start with schema defaults
                    ...specificProps, // Add parsed specific props
                    ...commonProps, // Override with common props (position, size etc.)
                },
            });
        } else if (element.type !== 'Unknown') { // Only push if it was not an unknown type from parser
             // console.warn(`Skipping element ${element.id} due to unmappable type: ${element.type}`);
        }
      });
    }

    // Remove console.log
    // console.log(`COMPLETED SLIDE ${slideIndex+1} TRANSLATION:`, {
    //   id: slideId,
    //   title: slideTitle,
    //   componentCount: components.length,
    //   componentTypes: components.map(c => c.type).join(', ')
    // });

    return {
      id: slideId,
      title: slideTitle,
      components,
    };
  });

  return { slides: translatedSlides };
};

const SlideTagging: React.FC = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [parsedResults, setParsedResults] = useState<ParsedResult[]>([]);
  const [translatedData, setTranslatedData] = useState<TranslatedDeck | null>(null);
  const [activeTab, setActiveTab] = useState<string>("template-search");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Slide preview state
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(0);
  const slideContainerRef = useRef<HTMLDivElement>(null);
  
  // Template management state
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [savingError, setSavingError] = useState<string | null>(null);
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState<string>('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const [tagSaveError, setTagSaveError] = useState<string | null>(null);
  const [isAITagging, setIsAITagging] = useState(false);
  const [autoTags, setAutoTags] = useState<string[]>([]);
  const [isLoadingTags, setIsLoadingTags] = useState(false);
  
  // Bulk processing state
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, currentSlideTitle: '' });

  // Template search state - now primary
  const [templateSearchQuery, setTemplateSearchQuery] = useState('');
  const [templateSearchResults, setTemplateSearchResults] = useState<any[]>([]);
  const [isSearchingTemplates, setIsSearchingTemplates] = useState(false);
  const [selectedSearchTemplate, setSelectedSearchTemplate] = useState<any>(null);

  // New state for backfilling embeddings
  const [isBackfillProcessing, setIsBackfillProcessing] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState({ current: 0, total: 0, status: '', batch: 0, totalBatches: 0 });

  // State for expandable tags
  const [expandedTagRows, setExpandedTagRows] = useState<Set<string>>(new Set());

  // Add debounce timer for search
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // State for tagging functionality
  const [editingTags, setEditingTags] = useState<string | null>(null); // UUID of template being edited
  const [tempCustomTags, setTempCustomTags] = useState<string[]>([]);
  const [tempAutoTags, setTempAutoTags] = useState<string[]>([]);
  const [isGeneratingTags, setIsGeneratingTags] = useState(false);

  // State for Load More functionality
  const [hasMoreTemplates, setHasMoreTemplates] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);

  // State for slide screenshots
  const [slideScreenshots, setSlideScreenshots] = useState<Map<number, string>>(new Map());
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
  
  // State for container dimensions
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
  const [templatePreviewDimensions, setTemplatePreviewDimensions] = useState({ width: 0, height: 0 });
  const templatePreviewRef = useRef<HTMLDivElement>(null);
  const layoutVisualizationRef = useRef<HTMLDivElement>(null);
  
  // State for actual PPTX screenshots
  const [actualPptxScreenshots, setActualPptxScreenshots] = useState<SlideScreenshot[]>([]);
  const [isLoadingPptxScreenshots, setIsLoadingPptxScreenshots] = useState(false);
  const [pptxScreenshotError, setPptxScreenshotError] = useState<string | null>(null);

  // Add state for showing saved template tags
  const [savedTemplateTags, setSavedTemplateTags] = useState<{ auto: string[], custom: string[], designDescription?: string } | null>(null);
  const [showSavedTagsModal, setShowSavedTagsModal] = useState(false);

  // Reset currentSlideIndex when new file is parsed
  useEffect(() => {
    setCurrentSlideIndex(0);
  }, [translatedData]);

  // Reset all template-related state when new data is parsed
  useEffect(() => {
    if (translatedData) {
      // Clear all template state for new deck
      setCustomTags([]);
      setAutoTags([]);
      setIsEditingTags(false);
      setShowTagInput(false);
      setTagInput('');
      setSavingError(null);
      setTagSaveError(null);
      setIsAITagging(false);
      setIsSavingTemplate(false);
      setIsSavingTags(false);
      setIsLoadingTags(false);
      
      // Switch to preview tab when slides are successfully parsed
      setActiveTab('slide-preview');
      
      addLog('New deck loaded - cleared all template state');
    }
  }, [translatedData]);

  const addLog = (message: string) => {
    // Debug logging disabled for clean UI
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // Reset ALL state when new files are selected
    setDebugLogs([]);
    setError(null);
    setParsedResults([]);
    setTranslatedData(null); // Clear existing slides
    setProcessingStatus('');
    
    // Clear template state
    setCustomTags([]);
    setAutoTags([]);
    setIsEditingTags(false);
    setShowTagInput(false);
    setTagInput('');
    setSavingError(null);
    setTagSaveError(null);
    setIsAITagging(false);
    setIsSavingTemplate(false);
    setIsSavingTags(false);
    setIsLoadingTags(false);
    setSavedTemplateTags(null);
    setShowSavedTagsModal(false);
    
    // Clear screenshot state
    setSlideScreenshots(new Map());
    setActualPptxScreenshots([]);
    setPptxScreenshotError(null);
    setIsLoadingPptxScreenshots(false);
    setCurrentSlideIndex(0);
    
    // Clear bulk processing state
    setIsBulkProcessing(false);
    setBulkProgress({ current: 0, total: 0, currentSlideTitle: '' });
    
    const files = event.target.files;
    if (files && files.length > 0) {
      const validFiles: File[] = [];
      let localError = '';
      addLog(`File input changed. ${files.length} file(s) selected.`);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        addLog(`Processing selected file ${i + 1}: ${file.name}, Size: ${file.size}, Type: ${file.type}`);
        if (!isGoogleSlideFile(file)) {
          const errorMsg = `Skipping invalid file: ${file.name} (Only .pptx files are supported)`;
          localError += `${errorMsg}\n`;
          addLog(`Error: ${errorMsg}`);
        } else {
          validFiles.push(file);
        }
      }
      setSelectedFiles(validFiles);
      if (localError) setError(localError.trim());
      addLog(`${validFiles.length} valid file(s) stored in state.`);
    } else {
      setSelectedFiles([]);
      addLog('No files selected in event.');
    }
    event.target.value = '';
  };

  const handleUploadClick = () => {
    addLog('Select Files button clicked, triggering file input.');
    fileInputRef.current?.click();
  };

  const parseSelectedFiles = async () => {
    if (selectedFiles.length === 0) {
      const errorMsg = 'No valid .pptx files selected to parse';
      setError(errorMsg);
      addLog(`Error: ${errorMsg}`);
      return;
    }

    addLog(`Starting parsing process for ${selectedFiles.length} file(s).`);
    
    // Reset parsing-related state
    setIsProcessing(true);
    setError(null);
    setParsedResults([]);
    setTranslatedData(null); // Clear any existing slides
    setProcessingStatus('Preparing...');
    
    // Clear screenshot state for new parsing
    setSlideScreenshots(new Map());
    setActualPptxScreenshots([]);
    setPptxScreenshotError(null);
    setIsLoadingPptxScreenshots(false);
    setCurrentSlideIndex(0);
    
    const results: ParsedResult[] = [];
    const allSlides: TranslatedSlide[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const statusMsg = `Parsing file ${i + 1} of ${selectedFiles.length}: ${file.name}`;
      setProcessingStatus(statusMsg);
      addLog(statusMsg);
      setDebugLogs(prev => [...prev, `--- Parsing ${file.name} ---`]);
      
      try {
        const slideData = await parseGoogleSlide(file);
        addLog(`Parsing function returned for ${file.name}. Result structure: ${JSON.stringify(Object.keys(slideData || {}))}`);
        results.push({ fileName: file.name, jsonData: slideData });
        addLog(`Successfully parsed ${file.name}`);
        
        // Translate and collect slides from this deck
        if (slideData) {
          try {
            const translationOutput = translateToAppSchema(slideData);
            if (translationOutput && translationOutput.slides) {
              // Add deck name prefix to slide titles to distinguish between decks
              const deckPrefix = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
              const prefixedSlides = translationOutput.slides.map((slide, index) => ({
                ...slide,
                title: `${deckPrefix} - ${slide.title || `Slide ${index + 1}`}`,
                id: `${deckPrefix}-${slide.id}` // Ensure unique IDs
              }));
              
              allSlides.push(...prefixedSlides);
              addLog(`Added ${prefixedSlides.length} slides from ${file.name} to combined deck`);
            }
          } catch (translationError) {
            const errorMsg = `Error translating ${file.name}: ${translationError instanceof Error ? translationError.message : String(translationError)}`;
            addLog(errorMsg);
            console.error(errorMsg, translationError);
          }
        }
      } catch (err) {
        const errorMsg = `Error parsing ${file.name}: ${err instanceof Error ? err.message : String(err)}`;
        results.push({ fileName: file.name, jsonData: null, error: errorMsg });
        addLog(errorMsg);
        console.error(`Error details for ${file.name}:`, err);
      }
    }

    setParsedResults(results);
    addLog(`Finished processing all files. Stored ${results.length} results.`);
    
    // Set combined translated data with all slides from all decks
    if (allSlides.length > 0) {
      setTranslatedData({ slides: allSlides });
      addLog(`Combined deck created with ${allSlides.length} total slides from ${selectedFiles.length} file(s)`);
      setProcessingStatus(`Done - ${allSlides.length} slides from ${selectedFiles.length} deck(s)`);
        } else {
        setTranslatedData(null);
      setProcessingStatus('No slides parsed');
      if (results.some(r => r.error)) {
        setError('Some files failed to parse. Check debug logs for details.');
      }
    }
    
    setIsProcessing(false);
    addLog('Parsing process finished.');
  };

  const downloadResultsAsZip = async () => {
    if (parsedResults.length === 0) {
      addLog('Download attempted, but no parsed results available.');
      return;
    }
    
    addLog('Starting ZIP file creation...');
    const zip = new JSZip();
    let successCount = 0;

    parsedResults.forEach(result => {
      if (result.jsonData && !result.error) {
        const baseName = result.fileName.replace(/\.[^/.]+$/, '');
        const safeBaseName = baseName.replace(/[^a-z0-9_\-\.]/gi, '_');
        const jsonFileName = `${safeBaseName || 'parsed_deck'}.json`;
        
        try {
          zip.file(jsonFileName, JSON.stringify(result.jsonData, null, 2));
          addLog(`Added ${jsonFileName} to ZIP.`);
          successCount++;
        } catch (zipError) {
          addLog(`Error adding ${jsonFileName} to ZIP: ${zipError}`);
        }
      } else {
        addLog(`Skipping file ${result.fileName} due to parsing error or no data.`);
      }
    });

    if (successCount === 0) {
      addLog('No successfully parsed files to include in the ZIP.');
      setError('No successfully parsed files to download.');
      return;
    }

    try {
      addLog('Generating ZIP file content...');
      const content = await zip.generateAsync({ type: 'blob' });
      addLog('ZIP content generated. Triggering download.');
      saveAs(content, 'parsed_presentation_data.zip');
      addLog('Download initiated.');
    } catch (error) {
      const errorMsg = `Failed to generate or save ZIP file: ${error}`; 
      setError(errorMsg);
      addLog(errorMsg);
      console.error('ZIP generation/saving error:', error);
    }
  };

  // Creates the slide container with proper structure for the renderer
  const createRenderableSlide = (slideData: TranslatedSlide): RenderableSlide => {
    return {
      id: slideData.id,
      title: slideData.title || 'Untitled Slide',
      components: slideData.components.map(comp => ({
        id: comp.id,
        type: comp.type,
        props: comp.props,
      })),
      width: DEFAULT_SLIDE_WIDTH,
      height: DEFAULT_SLIDE_HEIGHT,
      preview: '',
      thumbnail: ''
    };
  };

  const createRenderableDeck = (slides: TranslatedSlide[]): RenderableDeck => {
    return {
      id: "preview-deck",
      name: "Preview Deck",
      slides: slides.map(createRenderableSlide),
      width: DEFAULT_SLIDE_WIDTH,
      height: DEFAULT_SLIDE_HEIGHT,
    };
  };

  // Add function to navigate slides
  const navigateToSlide = (index: number) => {
    if (index >= 0 && index < (translatedData?.slides.length || 0)) {
      setCurrentSlideIndex(index);
    }
  };

  const captureCurrentSlideScreenshot = async () => {
    if (!slideContainerRef.current || isCapturingScreenshot) return;
    
    setIsCapturingScreenshot(true);
    try {
      const screenshot = await captureSlideScreenshot(slideContainerRef.current);
      setSlideScreenshots(prev => new Map(prev).set(currentSlideIndex, screenshot));
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
    } finally {
      setIsCapturingScreenshot(false);
    }
  };

  // Capture screenshot after slide changes with ResizeObserver
  useEffect(() => {
    if (translatedData && slideContainerRef.current) {
      // Clear any existing content first
      const portalElement = slideContainerRef.current.querySelector('#snap-guide-portal');
      if (portalElement) {
        portalElement.innerHTML = '';
      }
      
      // Update container dimensions
      const updateDimensions = () => {
        if (slideContainerRef.current) {
          const rect = slideContainerRef.current.getBoundingClientRect();
          setContainerDimensions({ width: rect.width, height: rect.height });
        }
      };
      
      // Initial update
      updateDimensions();
      
      // Set up ResizeObserver
      const resizeObserver = new ResizeObserver(updateDimensions);
      resizeObserver.observe(slideContainerRef.current);
          
      // Small delay to ensure slide is fully rendered
      const timer = setTimeout(() => {
        captureCurrentSlideScreenshot();
      }, 500);
      
      return () => {
        clearTimeout(timer);
        resizeObserver.disconnect();
      };
    }
  }, [currentSlideIndex, translatedData]);
  
  // Reset currentSlideIndex when translatedData changes to prevent out-of-bounds access
  useEffect(() => {
    if (translatedData && translatedData.slides.length > 0) {
      // If currentSlideIndex is out of bounds, reset to 0
      if (currentSlideIndex >= translatedData.slides.length) {
        setCurrentSlideIndex(0);
      }
    }
  }, [translatedData]);
  
  // Function to generate actual PPTX screenshots
  const generateActualPptxScreenshots = async (): Promise<SlideScreenshot[]> => {
    if (selectedFiles.length === 0) {
      setPptxScreenshotError('No files selected');
      return [];
    }
    
    setIsLoadingPptxScreenshots(true);
    setPptxScreenshotError(null);
    
    try {
      const allScreenshots: SlideScreenshot[] = [];
      let totalSlideCount = 0;
      
      // Use the Python backend server running on port 9090
      const serverUrl = 'http://localhost:9090/api/pptx-convert';
      
      for (let fileIndex = 0; fileIndex < selectedFiles.length; fileIndex++) {
        const file = selectedFiles[fileIndex];
        const deckPrefix = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
        
        try {
          const screenshots = await PPTXScreenshotService.generateScreenshots(file, {
            method: 'server',
            serverUrl: serverUrl,
            format: 'png'
          });
          
          // Adjust slide numbers to be sequential across all decks
          const adjustedScreenshots = screenshots.map(screenshot => ({
            ...screenshot,
            slideNumber: totalSlideCount + screenshot.slideNumber,
            fileName: file.name // Add filename for reference
          }));
          
          allScreenshots.push(...adjustedScreenshots);
          totalSlideCount += screenshots.length;
          
        } catch (fileError) {
          const errorMsg = `Failed to generate screenshots for ${file.name}: ${fileError instanceof Error ? fileError.message : String(fileError)}`;
          console.error(errorMsg, fileError);
          // Continue with other files
        }
      }
      
      setActualPptxScreenshots(allScreenshots);
      
      if (allScreenshots.length === 0) {
        setPptxScreenshotError('No screenshots were generated from any files');
      }
      
      return allScreenshots; // Return the screenshots
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setPptxScreenshotError(errorMsg);
      console.error('Failed to generate PPTX screenshots:', errorMsg);
      
      // Provide fallback information
      console.warn('Note: Make sure the Python backend server is running on port 9090.');
      return [];
    } finally {
      setIsLoadingPptxScreenshots(false);
    }
  };

  // Helper function to determine if screenshots are ready for saving
  const areScreenshotsReadyForSaving = (): boolean => {
    // If no files are selected, we don't need screenshots
    if (selectedFiles.length === 0) {
      return true;
    }
    
    // If we're currently loading screenshots, they're not ready
    if (isLoadingPptxScreenshots) {
      return false;
    }
    
    // If we have screenshots, they're ready
    if (actualPptxScreenshots.length > 0) {
      return true;
    }
    
    // If there was an error generating screenshots, we can still save (text-only)
    if (pptxScreenshotError) {
      return true;
    }
    
    // If we have translated data but no screenshots and no error, screenshots are still needed
    if (translatedData && translatedData.slides.length > 0) {
      return false;
    }
    
    return true;
  };

  // Helper function to get the save button tooltip message
  const getSaveButtonTooltip = (): string | undefined => {
    if (selectedFiles.length === 0) {
      return undefined;
    }
    
    if (isLoadingPptxScreenshots) {
      return "Processing screenshots for better AI tagging...";
    }
    
    if (actualPptxScreenshots.length === 0 && !pptxScreenshotError && translatedData) {
      return "Waiting for screenshots to enable image-based AI analysis...";
    }
    
    return undefined;
  };

  // Improved save current slide function with screenshot readiness check
  const saveCurrentSlideAsTemplate = async () => {
    if (!translatedData?.slides || !translatedData.slides[currentSlideIndex]) {
      addLog('No slide data available to save as template');
      return;
    }
    
    const currentSlide = translatedData.slides[currentSlideIndex];
    
    try {
      setIsSavingTemplate(true);
      setIsAITagging(true);
      setSavingError(null);
      
      addLog(`Saving slide ${currentSlide.id} (${currentSlide.title}) as template...`);
      
      // Get the actual PPTX screenshot for the current slide if available
      let imageDataUrl: string | undefined;
      if (actualPptxScreenshots.length > 0) {
        const screenshot = actualPptxScreenshots.find(s => s.slideNumber === currentSlideIndex + 1);
        if (screenshot) {
          imageDataUrl = screenshot.dataUrl;
          addLog(`Using PPTX screenshot for slide ${currentSlideIndex + 1}`);
        }
      }
      
      if (!imageDataUrl) {
        addLog(`No screenshot available for slide ${currentSlideIndex + 1} - will use text-only analysis`);
      }
      
      addLog(`AI analysis and tagging in progress...`);
      
      const result = await SlideTemplateService.saveTemplate(currentSlide, {
        custom_tags: customTags.length > 0 ? customTags : undefined,
        screenshot: imageDataUrl // Pass the screenshot
      });
      
      setIsAITagging(false);
      
      if (result.success) {
        addLog(`Successfully saved slide as template with ID: ${result.data.uuid}`);
        
        // Show the generated tags
        setSavedTemplateTags({
          auto: result.data.auto_tags || [],
          custom: result.data.custom_tags || [],
          designDescription: result.data.design_description
        });
        setShowSavedTagsModal(true);
        
        // Clear custom tags for next save
        setCustomTags([]);
        setAutoTags([]);
        setShowTagInput(false);
        setTagInput('');
        
        addLog(`Template saved with ${result.data.auto_tags?.length || 0} auto-generated tags!`);
      } else {
        setSavingError(`Failed to save template: ${result.error.message || 'Unknown error'}`);
        addLog(`Error saving template: ${result.error.message || 'Unknown error'}`);
      }
    } catch (err) {
      setIsAITagging(false);
      const errorMsg = err instanceof Error ? err.message : String(err);
      setSavingError(`Exception saving template: ${errorMsg}`);
      addLog(`Exception saving template: ${errorMsg}`);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const addCustomTag = () => {
    if (tagInput.trim() && !customTags.includes(tagInput.trim())) {
      setCustomTags([...customTags, tagInput.trim()]);
      setTagInput('');
    }
  };
  
  const removeCustomTag = (tag: string) => {
    setCustomTags(customTags.filter(t => t !== tag));
  };
  
  const getTagSuggestions = (slideData: TranslatedSlide): string[] => {
    if (!slideData) return [];
    
    const suggestions: string[] = [];
    
    if (slideData.components.some(c => c.type === 'Image')) {
      suggestions.push('visual', 'product-shot');
    }
    
    if (slideData.components.filter(c => c.type === 'TiptapTextBlock').length > 2) {
      suggestions.push('detailed', 'information-rich');
    }
    
    const title = slideData.title.toLowerCase();
    if (title.includes('product')) suggestions.push('product');
    if (title.includes('service')) suggestions.push('service');
    if (title.includes('plan')) suggestions.push('plan');
    if (title.includes('strategy')) suggestions.push('strategy');
    
    return suggestions.filter(tag => !customTags.includes(tag));
  };
  
  const addSuggestedTag = (tag: string) => {
    if (!customTags.includes(tag)) {
      setCustomTags([...customTags, tag]);
    }
  };

  // Add new function for backfilling embeddings
  const backfillEmbeddings = async () => {
    setIsBackfillProcessing(true);
    setBackfillProgress({ current: 0, total: 0, status: 'Starting...', batch: 0, totalBatches: 0 });
    
    try {
      addLog('Starting to process embeddings for all templates...');
      
      // Create progress callback to update UI in real-time
      const progressCallback = (progress: {
        current: number,
        total: number,
        batch: number,
        totalBatches: number,
        status: string
      }) => {
        setBackfillProgress(progress);
        addLog(`Progress: ${progress.current}/${progress.total} - ${progress.status}`);
      };
      
      const result = await SlideTemplateService.generateMissingEmbeddings(progressCallback);
      
      if (result.success) {
        const totalProcessed = result.processed + result.skipped + result.failed;
        
        if (result.quotaExceeded) {
          addLog(`⚠️ Processing stopped due to OpenAI API quota limit. Generated: ${result.processed}, Skipped: ${result.skipped}, Failed: ${result.failed}`);
          addLog('💡 To continue processing, you can either:');
          addLog('   1. Wait for your OpenAI quota to reset');
          addLog('   2. Upgrade your OpenAI plan');
          addLog('   3. Run this process again later');
          
          setBackfillProgress({ 
            current: result.processed + result.skipped, 
            total: totalProcessed, 
            status: 'Stopped - API quota exceeded',
            batch: 0,
            totalBatches: 0
          });
        } else {
        addLog(`✅ Processing complete! Generated: ${result.processed}, Skipped: ${result.skipped}, Failed: ${result.failed}`);
        setBackfillProgress({ 
          current: totalProcessed, 
          total: totalProcessed, 
          status: 'Completed',
          batch: 0,
          totalBatches: 0
        });
        }
        
        if (result.processed === 0 && result.skipped > 0) {
          addLog('ℹ️ All templates already have embeddings.');
        } else if (result.processed === 0 && result.skipped === 0) {
          addLog('ℹ️ No templates found to process.');
        }
      } else {
        addLog(`❌ Processing failed: ${result.error}`);
        setBackfillProgress({ current: 0, total: 0, status: 'Failed', batch: 0, totalBatches: 0 });
      }
    } catch (error) {
      console.error('Error processing embeddings:', error);
      addLog(`❌ Error processing embeddings: ${error}`);
      setBackfillProgress({ current: 0, total: 0, status: 'Failed', batch: 0, totalBatches: 0 });
    } finally {
      setIsBackfillProcessing(false);
    }
  };

  // Add a function to ensure screenshots are available before bulk processing
  const ensureScreenshotsAvailable = async (): Promise<SlideScreenshot[]> => {
    if (!translatedData?.slides || translatedData.slides.length === 0) {
      return [];
    }
    
    let currentActualScreenshots = actualPptxScreenshots;
    
    // Check if we have actual PPTX screenshots
    if (currentActualScreenshots.length >= translatedData.slides.length) {
      return currentActualScreenshots;
    }
    
    // Generate actual PPTX screenshots if we don't have them
    if (currentActualScreenshots.length === 0 && selectedFiles.length > 0) {
      // Check if screenshots are already being loaded
      if (!isLoadingPptxScreenshots) {
        const newScreenshots = await generateActualPptxScreenshots();
        
        if (newScreenshots.length > 0) {
          currentActualScreenshots = newScreenshots;
          return currentActualScreenshots;
        } else {
          // Fallback: Generate HTML canvas screenshots for each slide
          const canvasScreenshots: SlideScreenshot[] = [];
          
          for (let i = 0; i < translatedData.slides.length; i++) {
            try {
              // Navigate to the slide to render it
              setCurrentSlideIndex(i);
              
              // Small delay to ensure slide is rendered
              await new Promise(resolve => setTimeout(resolve, 300));
              
              // Capture the current slide (this updates the slideScreenshots state)
              await captureCurrentSlideScreenshot();
              
              // Small delay to ensure screenshot is captured
              await new Promise(resolve => setTimeout(resolve, 200));
              
              // Get the screenshot from state - need to access the updated state
              // Since state updates are async, we need to capture directly
              if (slideContainerRef.current) {
                try {
                  const screenshotDataUrl = await captureSlideScreenshot(slideContainerRef.current);
                  
                  if (screenshotDataUrl) {
                    canvasScreenshots.push({
                      slideNumber: i + 1,
                      dataUrl: screenshotDataUrl,
                      width: 1920,
                      height: 1080
                    });
                    addLog(`  📸 Captured HTML canvas screenshot for slide ${i + 1}`);
                  } else {
                    addLog(`  ⚠️ No screenshot captured for slide ${i + 1}`);
                  }
                } catch (captureError) {
                  addLog(`  ❌ Failed to capture screenshot for slide ${i + 1}: ${captureError}`);
                }
              }
            } catch (error) {
              addLog(`  ❌ Failed to process slide ${i + 1}: ${error}`);
            }
          }
          
          if (canvasScreenshots.length > 0) {
            // Store the canvas screenshots in the actualPptxScreenshots state
            setActualPptxScreenshots(canvasScreenshots);
            addLog(`✓ Generated ${canvasScreenshots.length} HTML canvas screenshots as fallback`);
            addLog(`✓ Screenshots stored and ready for AI analysis`);
            return canvasScreenshots;
          } else {
            addLog('❌ Failed to generate any screenshots');
            return [];
          }
        }
      } else {
        // Wait for ongoing screenshot generation to complete
        addLog('⏳ Screenshot generation already in progress, waiting...');
        
        // Poll for completion (max 60 seconds)
        let waitTime = 0;
        const maxWaitTime = 60000;
        const pollInterval = 1000;
        
        while (isLoadingPptxScreenshots && waitTime < maxWaitTime) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          waitTime += pollInterval;
          
          // Check if screenshots are now available
          if (actualPptxScreenshots.length > 0) {
            currentActualScreenshots = actualPptxScreenshots;
            addLog(`✓ Screenshots ready: ${currentActualScreenshots.length} available`);
            return currentActualScreenshots;
          }
        }
        
        if (waitTime >= maxWaitTime) {
          addLog('⚠️ Timeout waiting for screenshots - proceeding with text-only analysis');
        }
      }
    }
    
    return currentActualScreenshots;
  };

  const bulkProcessAllSlides = async () => {
    if (!translatedData?.slides || translatedData.slides.length === 0) {
      addLog('No slides available for bulk processing');
      return;
    }
    
    try {
      setIsBulkProcessing(true);
      setBulkProgress({ current: 0, total: translatedData.slides.length, currentSlideTitle: '' });
      
      addLog(`🚀 Starting bulk processing of ${translatedData.slides.length} slides...`);
      
      // First, ensure all screenshots are available BEFORE processing
      addLog('📷 Preparing screenshots before processing...');
      const actualScreenshots = await ensureScreenshotsAvailable();
      
      if (actualScreenshots.length === 0) {
        addLog('⚠️ No screenshots available - will use text-only AI analysis for all slides');
      } else {
        addLog(`✅ Screenshots ready! ${actualScreenshots.length} slides will be analyzed with images`);
      }
      
      // Now process all slides with available screenshots
      addLog('🔄 Starting AI processing for all slides...');
      
      for (let i = 0; i < translatedData.slides.length; i++) {
        const slide = translatedData.slides[i];
        
        // Navigate to the slide being processed
        setCurrentSlideIndex(i);
        
        setBulkProgress({ 
          current: i + 1, 
          total: translatedData.slides.length, 
          currentSlideTitle: slide.title || 'Untitled' 
        });
        
        addLog(`\n🎯 Processing slide ${i + 1}/${translatedData.slides.length}: ${slide.title}`);
        
        try {
          // Get the screenshot for this slide
          let imageDataUrl: string | undefined;
          
          // Get actual PPTX screenshot
          if (actualScreenshots.length > 0) {
            const screenshot = actualScreenshots.find(s => s.slideNumber === i + 1);
            if (screenshot && screenshot.dataUrl) {
              imageDataUrl = screenshot.dataUrl;
              addLog(`  ✓ Using screenshot for visual analysis`);
            } else {
              addLog(`  ⚠️ No screenshot found for slide ${i + 1}`);
              
              // Fallback: try to get screenshot by index if slide numbers don't match
              if (actualScreenshots[i] && actualScreenshots[i].dataUrl) {
                imageDataUrl = actualScreenshots[i].dataUrl;
                addLog(`  ✓ Using screenshot by index`);
              }
            }
          }
          
          if (!imageDataUrl) {
            addLog(`  ⚠️ No screenshot available - using text-only AI analysis`);
          } else {
            addLog(`  🖼️ Screenshot ready - proceeding with image+text AI analysis`);
          }
          
          // Small visual delay to show the slide being processed
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // Save each slide as a template with screenshot
          addLog(`  🤖 Running AI analysis...`);
          const result = await SlideTemplateService.saveTemplate(slide, {
            custom_tags: [], // No custom tags for bulk processing
            screenshot: imageDataUrl
          });
          
          if (result.success) {
            const hasDesignDesc = result.data.design_description ? '✓' : '✗';
            const hasVisualAnalysis = result.data.visual_analysis ? '✓' : '✗';
            const hasImageUrl = result.data.image_url ? '✓' : '✗';
            
            addLog(`  ✅ Saved successfully!`);
            addLog(`     • Tags: ${result.data.auto_tags?.length || 0}`);
            addLog(`     • Design description: ${hasDesignDesc}`);
            addLog(`     • Visual analysis: ${hasVisualAnalysis}`);
            addLog(`     • Image URL: ${hasImageUrl}`);
          } else {
            addLog(`  ❌ Failed: ${result.error.message || 'Unknown error'}`);
          }
        } catch (err) {
          addLog(`  ❌ Error: ${err instanceof Error ? err.message : String(err)}`);
        }
        
        // Small delay to prevent overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      addLog(`\n🎉 Bulk processing complete! Processed ${translatedData.slides.length} slides.`);
      
      // Return to first slide after completion
      setCurrentSlideIndex(0);
      
    } catch (err) {
      addLog(`❌ Bulk processing failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsBulkProcessing(false);
      setBulkProgress({ current: 0, total: 0, currentSlideTitle: '' });
    }
  };

  // Improved search trigger function
  const triggerSearch = async (query?: string) => {
    const searchQuery = query || templateSearchQuery;
    if (!searchQuery.trim()) {
      setTemplateSearchResults([]);
      return;
    }

    // Set the query if provided
    if (query && query !== templateSearchQuery) {
      setTemplateSearchQuery(query);
    }

    try {
      setIsSearchingTemplates(true);
      
      // Use hybrid search for better results
      const result = await SlideTemplateService.hybridSearchTemplates(searchQuery, 10);
      
      if (result.success) {
        setTemplateSearchResults(result.templates);
        addLog(`Found ${result.templates.length} templates for search: "${searchQuery}"`);
      } else {
        setTemplateSearchResults([]);
        addLog(`Template search failed: ${result.error}`);
      }
    } catch (err) {
      setTemplateSearchResults([]);
      addLog(`Template search error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSearchingTemplates(false);
    }
  };

  // Function for suggestion click
  const handleSuggestionClick = (suggestion: string) => {
    setTemplateSearchQuery(suggestion);
    triggerSearch(suggestion);
  };

  // Debounced search function
  const debouncedSearch = (query: string) => {
    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Set new timeout for debounced search
    searchTimeoutRef.current = setTimeout(() => {
      if (query.trim()) {
        triggerSearch(query);
      } else {
        setTemplateSearchResults([]);
      }
    }, 300); // 300ms delay
  };

  // Handle input change with debounced search
  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setTemplateSearchQuery(query);
    debouncedSearch(query);
  };

  // Function for button click (no parameters)
  const handleSearchClick = () => {
    triggerSearch();
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Function to load all templates
  const loadAllTemplates = async () => {
    try {
      setIsSearchingTemplates(true);
      setTemplateSearchQuery(''); // Clear search query to show it's "all"
      setCurrentOffset(0); // Reset offset
      
      const batchSize = 50;
      const result = await SlideTemplateService.getAllTemplates(batchSize, 0);
      
      if (result.success) {
        setTemplateSearchResults(result.templates);
        setCurrentOffset(batchSize);
        
        // Check if there are more templates to load
        setHasMoreTemplates(result.templates.length === batchSize);
        
        addLog(`✅ Loaded ${result.templates.length} templates (showing first batch)`);
      } else {
        setTemplateSearchResults([]);
        setHasMoreTemplates(false);
        addLog(`Failed to load templates: ${result.error}`);
      }
      
    } catch (err) {
      setTemplateSearchResults([]);
      setHasMoreTemplates(false);
      addLog(`Error loading templates: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSearchingTemplates(false);
    }
  };

  // Function to load more templates
  const loadMoreTemplates = async () => {
    try {
      setIsLoadingMore(true);
      
      const batchSize = 50;
      const result = await SlideTemplateService.getAllTemplates(batchSize, currentOffset);
      
      if (result.success && result.templates.length > 0) {
        // Append new templates to existing ones
        setTemplateSearchResults(prev => [...prev, ...result.templates]);
        setCurrentOffset(prev => prev + batchSize);
        
        // Check if there are more templates to load
        setHasMoreTemplates(result.templates.length === batchSize);
        
        addLog(`✅ Loaded ${result.templates.length} more templates (total: ${templateSearchResults.length + result.templates.length})`);
      } else {
        setHasMoreTemplates(false);
        if (!result.success) {
          addLog(`Error loading more templates: ${result.error}`);
        } else {
          addLog('No more templates to load');
        }
      }
      
    } catch (err) {
      setHasMoreTemplates(false);
      addLog(`Error loading more templates: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Start editing tags for a template
  const startEditingTags = (template: any) => {
    setEditingTags(template.uuid);
    setTempCustomTags([...(template.custom_tags || [])]);
    setTempAutoTags([...(template.auto_tags || [])]);
    setTagInput('');
  };

  // Cancel editing tags
  const cancelEditingTags = () => {
    setEditingTags(null);
    setTempCustomTags([]);
    setTempAutoTags([]);
    setTagInput('');
    setIsGeneratingTags(false);
  };

  // Add a custom tag
  const addTempCustomTag = () => {
    if (tagInput.trim() && !tempCustomTags.includes(tagInput.trim())) {
      setTempCustomTags([...tempCustomTags, tagInput.trim()]);
      setTagInput('');
    }
  };

  // Remove a custom tag
  const removeTempCustomTag = (tag: string) => {
    setTempCustomTags(tempCustomTags.filter(t => t !== tag));
  };

  // Generate AI tags for the template
  const generateAITags = async (template: any) => {
    try {
      setIsGeneratingTags(true);
      
      // Use the AI service to analyze the template
      if (template.slides && template.slides.length > 0) {
        const result = await SlideTemplateAIService.analyzeSlide(template.slides[0]);
        
        if (result.success) {
          setTempAutoTags(result.tags);
          addLog(`Generated ${result.tags.length} AI tags for "${template.name}"`);
        } else {
          addLog(`Failed to generate AI tags: ${result.error}`);
        }
      }
    } catch (err) {
      addLog(`Error generating AI tags: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsGeneratingTags(false);
    }
  };

  // Save the updated tags
  const saveUpdatedTags = async () => {
    if (!editingTags) return;
    
    try {
      setIsSavingTags(true);
      
      // Update the template in the database
      const template = templateSearchResults.find(t => t.uuid === editingTags);
      if (!template) return;

      // Update via API (you'll need to implement this method in SlideTemplateService)
      const updateData = {
        custom_tags: tempCustomTags,
        auto_tags: tempAutoTags
      };

      // For now, let's update the local state and assume success
      // In a real implementation, you'd call an API to update the database
      const updatedResults = templateSearchResults.map(t => 
        t.uuid === editingTags 
          ? { ...t, custom_tags: tempCustomTags, auto_tags: tempAutoTags }
          : t
      );
      
      setTemplateSearchResults(updatedResults);
      
      // Update the selected template if it's the one being edited
      if (selectedSearchTemplate?.uuid === editingTags) {
        setSelectedSearchTemplate({
          ...selectedSearchTemplate,
          custom_tags: tempCustomTags,
          auto_tags: tempAutoTags
        });
      }
      
      addLog(`Updated tags for "${template.name}"`);
      cancelEditingTags();
      
    } catch (err) {
      addLog(`Error saving tags: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSavingTags(false);
    }
  };

  // Add template preview function for search results with smooth transition
  const previewSearchTemplate = (template: any) => {
    // Use opacity transition instead of unmounting
    if (selectedSearchTemplate?.uuid !== template?.uuid) {
      setSelectedSearchTemplate(template);
      // Clear parsed slides view when selecting a search result
      setTranslatedData(null);
      setSelectedFiles([]);
      setParsedResults([]);
    }
  };

  // Function to toggle tag expansion
  const toggleTagExpansion = (templateUuid: string) => {
    setExpandedTagRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(templateUuid)) {
        newSet.delete(templateUuid);
      } else {
        newSet.add(templateUuid);
      }
      return newSet;
    });
  };

  // Add delete template function
  const deleteTemplate = async (template: any) => {
    if (!confirm(`Are you sure you want to delete "${template.name}"?`)) {
      return;
    }

    try {
      const result = await SlideTemplateService.deleteTemplate(template.uuid);
      
      if (result.success) {
        // Remove from search results
        setTemplateSearchResults(prev => prev.filter(t => t.uuid !== template.uuid));
        // Clear preview if this template was selected
        if (selectedSearchTemplate?.uuid === template.uuid) {
          setSelectedSearchTemplate(null);
        }
        addLog(`Successfully deleted template: ${template.name}`);
      } else {
        addLog(`Failed to delete template: ${result.error}`);
      }
    } catch (err) {
      addLog(`Error deleting template: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Auto-load PPTX screenshots when parsed data is ready
  useEffect(() => {
    const loadScreenshots = async () => {
      if (translatedData && selectedFiles.length > 0 && actualPptxScreenshots.length === 0 && !pptxScreenshotError && !isLoadingPptxScreenshots) {
        // Automatically load actual PPTX screenshots for new data
        addLog('Auto-loading PPTX screenshots for new presentation...');
        const screenshots = await generateActualPptxScreenshots();
      }
    };
    
    loadScreenshots();
  }, [translatedData, selectedFiles]);

  // Update template preview dimensions when selected template changes
  useEffect(() => {
    const updateTemplateDimensions = () => {
      if (templatePreviewRef.current) {
        const rect = templatePreviewRef.current.getBoundingClientRect();
        setTemplatePreviewDimensions({ width: rect.width, height: rect.height });
      }
    };
    
    if (selectedSearchTemplate) {
      // Initial update
      updateTemplateDimensions();
      
      // Set up ResizeObserver
      const resizeObserver = new ResizeObserver(updateTemplateDimensions);
      if (templatePreviewRef.current) {
        resizeObserver.observe(templatePreviewRef.current);
      }
      if (layoutVisualizationRef.current) {
        resizeObserver.observe(layoutVisualizationRef.current);
      }
      
      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [selectedSearchTemplate]);

  return (
    <TooltipProvider>
      <div className="h-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
        {/* Compact Header - Fixed at top */}
        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
                Slide Template Library
              </h1>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                Search templates or upload PowerPoint files to create new ones
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".pptx"
                onChange={handleFileChange}
                className="hidden"
                multiple
              />
              
              {/* Stats */}
              {templateSearchResults.length > 0 && !isSearchingTemplates && (
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mr-4">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></div>
                  <span>{templateSearchResults.length} templates</span>
                </div>
              )}
              
              {/* Buttons */}
              <Button 
                onClick={backfillEmbeddings}
                disabled={isBackfillProcessing}
                variant="outline"
                size="sm"
                className="h-8 text-xs"
              >
                {isBackfillProcessing ? (
                  <>
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Brain className="mr-1.5 h-3 w-3" />
                    Generate Embeddings
                  </>
                )}
              </Button>
              
              <Button 
                onClick={handleUploadClick} 
                size="sm"
                className="h-8 text-xs bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
              >
                <UploadCloud className="mr-1.5 h-3 w-3" />
                Upload PPTX
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content Area - Flex container */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Template Search */}
          <div className="w-1/3 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
            {/* Search Header */}
            <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search templates..."
                    value={templateSearchQuery}
                    onChange={handleSearchInputChange}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchClick()}
                    className="flex-1 h-9 text-sm dark:bg-gray-800 dark:border-gray-600"
                  />
                  <Button 
                    onClick={handleSearchClick} 
                    disabled={isSearchingTemplates} 
                    size="sm"
                    className="h-9 px-3"
                  >
                    {isSearchingTemplates ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Search className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                
                <div className="flex flex-wrap gap-1">
                  {['title', 'product', 'timeline', 'thank you'].map(suggestion => (
                    <Button
                      key={suggestion}
                      variant="outline"
                      size="sm"
                      onClick={() => handleSuggestionClick(suggestion)}
                      className="text-xs h-6 px-2"
                    >
                      {suggestion}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadAllTemplates}
                    className="text-xs h-6 px-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                  >
                    <List className="h-3 w-3 mr-1" />
                    All
                  </Button>
                </div>
              </div>
            </div>
      
            {/* Search Results - Scrollable */}
            <div className="flex-1 overflow-y-auto">
              {isSearchingTemplates ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="p-3 border rounded-lg animate-pulse">
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
                      <div className="flex gap-1">
                        <div className="h-5 bg-gray-200 rounded w-12"></div>
                        <div className="h-5 bg-gray-200 rounded w-16"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : templateSearchResults.length > 0 ? (
                <div className="p-4 space-y-2">
                  {templateSearchResults.map((template, index) => (
                    <div 
                      key={template.uuid || index}
                      className={`p-3 border rounded-lg cursor-pointer transition-all duration-200 hover:shadow-sm ${
                        selectedSearchTemplate?.uuid === template.uuid 
                        ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-600 shadow-sm' 
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800 border-gray-200 dark:border-gray-700'
                      }`}
                      onClick={() => previewSearchTemplate(template)}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate flex-1">
                          {template.name}
                        </h3>
                        <div className="flex items-center gap-1 ml-2">
                          {template.similarity && (
                            <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                              {(template.similarity * 100).toFixed(0)}%
                            </div>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTemplate(template);
                            }}
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      
                      {template.description && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-1.5 line-clamp-2">
                          {template.description}
                        </p>
                      )}
                      
                      <div className="flex flex-wrap gap-1">
                        {template.auto_tags?.slice(0, 3).map((tag: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs h-4 px-1.5 py-0">
                            {tag}
                          </Badge>
                        ))}
                        {(template.auto_tags?.length > 3 || template.custom_tags?.length > 0) && (
                          <Badge variant="outline" className="text-xs h-4 px-1.5 py-0">
                            +{(template.auto_tags?.length || 0) + (template.custom_tags?.length || 0) - 3}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                      
                  {hasMoreTemplates && !templateSearchQuery && (
                    <Button
                      onClick={loadMoreTemplates}
                      disabled={isLoadingMore}
                      variant="outline"
                      className="w-full mt-4"
                      size="sm"
                    >
                      {isLoadingMore ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <Plus className="mr-2 h-3 w-3" />
                          Load More
                        </>
                      )}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <Search className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">
                    {templateSearchQuery 
                      ? `No templates found for "${templateSearchQuery}"`
                      : 'Search or browse templates'}
                  </p>
                </div>
              )}
            </div>
          </div>
                          
          {/* Right Panel - Preview & File Processing */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* File Processing Area (if files selected) */}
            {selectedFiles.length > 0 && (
              <div className="flex-shrink-0 bg-blue-50 dark:bg-blue-950/20 border-b border-blue-200 dark:border-blue-800 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-medium">{selectedFiles.length} file(s) selected</span>
                    {selectedFiles.length > 1 && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                        (will be combined)
                      </span>
                    )}
                    {isLoadingPptxScreenshots && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-blue-600 dark:text-blue-400">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Generating screenshots for AI analysis...</span>
                      </div>
                    )}
                    {!areScreenshotsReadyForSaving() && !isLoadingPptxScreenshots && translatedData && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-amber-600 dark:text-amber-400">
                        <Clock className="h-3 w-3" />
                        <span>Waiting for screenshots to enable image-based tagging</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={parseSelectedFiles} 
                      disabled={isProcessing}
                      size="sm"
                      className="h-7 text-xs"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          {processingStatus || 'Processing...'}
                        </>
                      ) : (
                        <>
                          <FileText className="h-3 w-3 mr-1" />
                          Parse Files
                        </>
                      )}
                    </Button>
                    
                    {translatedData && translatedData.slides.length > 1 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                            <Button
                              onClick={bulkProcessAllSlides}
                              disabled={isBulkProcessing || !areScreenshotsReadyForSaving()}
                              size="sm"
                              variant="secondary"
                              className="h-7 text-xs"
                            >
                              {isBulkProcessing ? (
                                <>
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                  Processing {bulkProgress.current}/{bulkProgress.total}
                                </>
                              ) : (
                                <>
                                  <Zap className="mr-1 h-3 w-3" />
                                  Save All ({translatedData.slides.length})
                                </>
                              )}
                            </Button>
                          </div>
                        </TooltipTrigger>
                        {getSaveButtonTooltip() && (
                          <TooltipContent>
                            <p>{getSaveButtonTooltip()}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    )}
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedFiles([]);
                        setTranslatedData(null);
                        setParsedResults([]);
                      }}
                      className="h-7 w-7 p-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Main Preview Area */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Content goes here - parsed slides or template preview */}
              {translatedData && translatedData.slides.length > 0 && currentSlideIndex < translatedData.slides.length ? (
                <div className="max-w-4xl mx-auto space-y-4">
                  <Card className="shadow-sm">
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Eye className="h-4 w-4" />
                          Parsed Slides
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <Button
                                  size="sm"
                                  onClick={saveCurrentSlideAsTemplate}
                                  disabled={isSavingTemplate || !areScreenshotsReadyForSaving()}
                                  className="h-7 text-xs"
                                >
                                  {isSavingTemplate ? (
                                    <>
                                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                      Saving...
                                    </>
                                  ) : (
                                    <>
                                      <Save className="h-3 w-3 mr-1" />
                                      Save Current
                                    </>
                                  )}
                                </Button>
                              </div>
                            </TooltipTrigger>
                            {getSaveButtonTooltip() && (
                              <TooltipContent>
                                <p>{getSaveButtonTooltip()}</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                          
                          {/* Navigation */}
                          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded p-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigateToSlide(0)}
                              disabled={currentSlideIndex === 0}
                              className="h-6 w-6 p-0"
                            >
                              <SkipBack className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigateToSlide(currentSlideIndex - 1)}
                              disabled={currentSlideIndex === 0}
                              className="h-6 w-6 p-0"
                            >
                              <ChevronLeft className="h-3 w-3" />
                            </Button>
                            <span className="text-xs px-2">
                              {currentSlideIndex + 1}/{translatedData.slides.length}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigateToSlide(currentSlideIndex + 1)}
                              disabled={currentSlideIndex >= translatedData.slides.length - 1}
                              className="h-6 w-6 p-0"
                            >
                              <ChevronRight className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigateToSlide(translatedData.slides.length - 1)}
                              disabled={currentSlideIndex >= translatedData.slides.length - 1}
                              className="h-6 w-6 p-0"
                            >
                              <SkipForward className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-2 gap-4">
                        {/* Actual Screenshot */}
                        <div>
                          <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">PowerPoint View</h4>
                          <div 
                            className="relative bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden"
                            style={{ aspectRatio: `${DEFAULT_SLIDE_WIDTH} / ${DEFAULT_SLIDE_HEIGHT}` }}
                          >
                            {actualPptxScreenshots.find(s => s.slideNumber === currentSlideIndex + 1) ? (
                              <img 
                                src={actualPptxScreenshots.find(s => s.slideNumber === currentSlideIndex + 1)?.dataUrl} 
                                alt={`Slide ${currentSlideIndex + 1}`}
                                className="w-full h-full object-contain"
                              />
                            ) : isLoadingPptxScreenshots ? (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="text-center">
                                  <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-blue-500 dark:text-blue-400" />
                                  <p className="text-sm text-gray-600 dark:text-gray-400">Loading screenshot...</p>
                                </div>
                              </div>
                            ) : pptxScreenshotError ? (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="text-center text-red-500 dark:text-red-400">
                                  <XCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                  <p className="text-sm">Failed to load</p>
                                </div>
                              </div>
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                                <div className="text-center">
                                  <FileImage className="h-8 w-8 opacity-50 mx-auto mb-2" />
                                  <p className="text-sm">Processing...</p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Parsed Preview */}
                        <div>
                          <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Parsed Components</h4>
                          <div 
                            ref={slideContainerRef}
                            className="relative bg-white rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700"
                            style={{ aspectRatio: `${DEFAULT_SLIDE_WIDTH} / ${DEFAULT_SLIDE_HEIGHT}` }}
                          >
                            <div id="snap-guide-portal" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
                            <div 
                              key={`parsed-slide-${currentSlideIndex}-${Date.now()}`}
                              style={{
                                width: `${DEFAULT_SLIDE_WIDTH}px`,
                                height: `${DEFAULT_SLIDE_HEIGHT}px`,
                                transformOrigin: 'top left',
                                transform: `scale(${containerDimensions.width > 0 ? containerDimensions.width / DEFAULT_SLIDE_WIDTH : 1})`,
                                position: 'absolute',
                                top: 0,
                                left: 0,
                              }}
                            >
                              <DebugComponentVisualizer 
                                components={translatedData.slides[currentSlideIndex].components} 
                              />
                              <NavigationProvider 
                                key={`nav-${currentSlideIndex}-${Date.now()}`}
                                initialSlideIndex={currentSlideIndex} 
                                onSlideChange={() => {}}
                              >
                                <EditorStateProvider key={`editor-${currentSlideIndex}-${Date.now()}`} initialEditingState={false}>
                                  <ActiveSlideProvider key={`active-${currentSlideIndex}-${Date.now()}`}>
                                    <SlideComponent
                                      key={`slide-component-${currentSlideIndex}-${Date.now()}`}
                                      slide={createRenderableSlide(translatedData.slides[currentSlideIndex])}
                                      isActive={true}
                                      direction={null}
                                      isEditing={false}
                                      isThumbnail={false}
                                    />
                                  </ActiveSlideProvider>
                                </EditorStateProvider>
                              </NavigationProvider>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Slide Info */}
                      <div className="mt-3 text-xs text-gray-600 dark:text-gray-400">
                        <span className="font-medium">Title:</span> {translatedData.slides[currentSlideIndex].title}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : selectedSearchTemplate ? (
                /* Template Preview */
                <div className="max-w-4xl mx-auto">
                  <Card className="shadow-sm">
                    <CardHeader className="py-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        {selectedSearchTemplate.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-2 gap-6">
                        {/* Left: Preview & Layout */}
                        <div className="space-y-4">
                          {/* Screenshot/Preview */}
                          <div>
                            <h4 className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2">Preview</h4>
                            <div 
                              ref={templatePreviewRef}
                              className="relative bg-white rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700"
                              style={{ aspectRatio: `${DEFAULT_SLIDE_WIDTH} / ${DEFAULT_SLIDE_HEIGHT}` }}
                            >
                              {selectedSearchTemplate.image_url ? (
                                <img 
                                  src={selectedSearchTemplate.image_url}
                                  alt={selectedSearchTemplate.name}
                                  className="w-full h-full object-contain"
                                />
                              ) : selectedSearchTemplate.slides?.[0] ? (
                                <div className="w-full h-full relative">
                                  <div 
                                    key={`template-preview-${selectedSearchTemplate.uuid}-${Date.now()}`}
                                    style={{
                                      width: `${DEFAULT_SLIDE_WIDTH}px`,
                                      height: `${DEFAULT_SLIDE_HEIGHT}px`,
                                      transformOrigin: 'top left',
                                      transform: `scale(${templatePreviewDimensions.width > 0 ? templatePreviewDimensions.width / DEFAULT_SLIDE_WIDTH : 0.18})`,
                                      position: 'absolute',
                                      top: 0,
                                      left: 0,
                                    }}
                                  >
                                    <DebugComponentVisualizer 
                                      components={selectedSearchTemplate.slides[0].components} 
                                    />
                                    <NavigationProvider 
                                      key={`template-nav-${selectedSearchTemplate.uuid}`}
                                      initialSlideIndex={0} 
                                      onSlideChange={() => {}}
                                    >
                                      <EditorStateProvider initialEditingState={false}>
                                        <ActiveSlideProvider>
                                          <SlideComponent
                                            slide={createRenderableSlide(selectedSearchTemplate.slides[0])}
                                            isActive={true}
                                            direction={null}
                                            isEditing={false}
                                            isThumbnail={false}
                                          />
                                        </ActiveSlideProvider>
                                      </EditorStateProvider>
                                    </NavigationProvider>
                                  </div>
                                </div>
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                                  <Eye className="h-8 w-8 opacity-50" />
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* Layout Visualization */}
                          {selectedSearchTemplate.slides?.[0] && (
                            <div>
                              <h4 className="text-xs font-semibold text-purple-600 dark:text-purple-400 mb-2">Layout Structure</h4>
                              <div 
                                ref={layoutVisualizationRef}
                                className="relative bg-gray-50 dark:bg-gray-800 rounded-lg overflow-hidden border-2 border-dashed border-gray-300 dark:border-gray-600"
                                style={{ aspectRatio: `${DEFAULT_SLIDE_WIDTH} / ${DEFAULT_SLIDE_HEIGHT}` }}
                              >
                                <div 
                                  key={`layout-viz-${selectedSearchTemplate.uuid}-${Date.now()}`}
                                  className="w-full h-full"
                                  style={{
                                    position: 'relative',
                                  }}
                                >
                                  <div
                                    style={{
                                      width: `${DEFAULT_SLIDE_WIDTH}px`,
                                      height: `${DEFAULT_SLIDE_HEIGHT}px`,
                                      transformOrigin: 'top left',
                                      transform: `scale(${templatePreviewDimensions.width > 0 ? templatePreviewDimensions.width / DEFAULT_SLIDE_WIDTH : 0.18})`,
                                      position: 'absolute',
                                      top: 0,
                                      left: 0,
                                    }}
                                  >
                                    <DebugComponentVisualizer 
                                      components={selectedSearchTemplate.slides[0].components} 
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {/* Right: Details */}
                        <div className="space-y-4">
                          {/* Description */}
                          {(selectedSearchTemplate.description || selectedSearchTemplate.design_description) && (
                            <div className="space-y-3">
                              {selectedSearchTemplate.description && (
                                <div>
                                  <h4 className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1">Description</h4>
                                  <p className="text-sm text-gray-700 dark:text-gray-300">
                                    {selectedSearchTemplate.description}
                                  </p>
                                </div>
                              )}
                              {selectedSearchTemplate.design_description && (
                                <div>
                                  <h4 className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-1">Design Details</h4>
                                  <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {selectedSearchTemplate.design_description}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* Tags */}
                          <div className="space-y-3">
                            {selectedSearchTemplate.auto_tags?.length > 0 && (
                              <div>
                                <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1">
                                  <Brain className="h-3 w-3" />
                                  AI-Generated Tags
                                </h4>
                                <div className="flex flex-wrap gap-1">
                                  {selectedSearchTemplate.auto_tags.map((tag: string, i: number) => (
                                    <Badge key={i} variant="outline" className="text-xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {selectedSearchTemplate.custom_tags?.length > 0 && (
                              <div>
                                <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Custom Tags</h4>
                                <div className="flex flex-wrap gap-1">
                                  {selectedSearchTemplate.custom_tags.map((tag: string, i: number) => (
                                    <Badge key={i} variant="secondary" className="text-xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                /* Empty State */
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Eye className="h-16 w-16 mx-auto mb-4 text-gray-300 dark:text-gray-700" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                      No Content Selected
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
                      Select a template from search results or upload PowerPoint files to get started
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="absolute bottom-4 right-4 max-w-sm">
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 shadow-lg">
              <div className="flex items-start gap-2">
                <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-700 dark:text-red-300">{error}</div>
              </div>
            </div>
          </div>
        )}

        {showSavedTagsModal && savedTemplateTags && (
          <div className="absolute bottom-4 right-4 max-w-sm">
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4 shadow-lg">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <h4 className="text-sm font-medium text-green-800 dark:text-green-400">Template Saved!</h4>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowSavedTagsModal(false);
                    setSavedTemplateTags(null);
                  }}
                  className="h-5 w-5 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Saved with {savedTemplateTags.auto.length} AI tags and {savedTemplateTags.custom.length} custom tags
              </div>
            </div>
          </div>
        )}

        {/* Backfill Progress */}
        {isBackfillProcessing && (
          <div className="absolute top-4 right-4 max-w-sm">
            <Card className="shadow-lg">
              <CardContent className="pt-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Processing Embeddings</div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="h-2 rounded-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${(backfillProgress.current / backfillProgress.total) * 100}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    {backfillProgress.current} of {backfillProgress.total}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

export default SlideTagging; 