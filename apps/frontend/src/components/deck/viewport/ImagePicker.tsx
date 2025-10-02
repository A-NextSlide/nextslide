import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, X, Sparkles, Image as ImageIcon, Search, RefreshCw, Upload, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImageTab } from '@/components/media/ImageTab';
import { SearchTab } from '@/components/media/SearchTab';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { useToast } from '@/hooks/use-toast';
import { createPortal } from 'react-dom';
import { Switch } from '@/components/ui/switch';
import { useDeckStore } from '@/stores/deckStore';

interface ImageOption {
  id: string;
  url: string;
  thumbnail: string;
  alt: string;
  photographer?: string;
  width?: number;
  height?: number;
  src?: {
    thumbnail?: string;
    small?: string;
    medium?: string;
    large?: string;
    original?: string;
  };
  topic?: string; // Added for topic filtering
  topics?: string[]; // Added for multiple topics
}

interface ImagePickerProps {
  images: ImageOption[];
  onImageSelect: (imageUrl: string) => void;
  onClose: () => void;
  onLoadMore?: (topic: string) => void;
  selectedImages?: string[];
  placeholderCount?: number;
  slideTitle?: string;
  topics?: string[];
  isLoading?: boolean;
  targetAspectRatio?: '16:9' | '1:1' | '9:16';
}

const ImagePicker: React.FC<ImagePickerProps> = ({
  images,
  onImageSelect,
  onClose,
  onLoadMore,
  selectedImages = [],
  placeholderCount = 1,
  slideTitle,
  topics = [],
  isLoading = false,
  targetAspectRatio = '16:9'
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hoveredImageId, setHoveredImageId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<ImageOption | null>(null);
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
  const previewTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  

  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [previousSearchQuery, setPreviousSearchQuery] = useState('');
  const { activeSlide } = useActiveSlide();
  const deckData = useDeckStore((s: any) => s.deckData);

  const buildGuidedPrompt = (base: string) => {
    const stylePrefs = (deckData?.data?.outline?.stylePreferences) || (deckData?.outline?.stylePreferences) || {};
    const text = ((deckData?.title || '') + ' ' + (stylePrefs?.initialIdea || '')).toLowerCase();
    const purpose: 'artistic' | 'educational' | 'business' = /art|portfolio|creative|illustration|design showcase/.test(text)
      ? 'artistic'
      : /school|class|lesson|course|education|tutorial|training|workshop/.test(text)
      ? 'educational'
      : 'business';
    const styleTone = purpose === 'artistic'
      ? 'Artistically expressive with tasteful lighting and composition.'
      : purpose === 'educational'
      ? 'Clear, didactic, and easy to understand.'
      : 'Polished, professional, and presentation-ready.';
    const accuracy = (purpose === 'educational' || purpose === 'business')
      ? 'Ensure visuals are factually accurate and appropriate; avoid invented labels or misleading depictions.'
      : '';
    const font = stylePrefs?.font ? `Primary font context: ${stylePrefs.font}.` : '';
    const colors = stylePrefs?.colors ? `Use deck colors where relevant: background ${stylePrefs.colors.background || ''}, text ${stylePrefs.colors.text || ''}, accent ${stylePrefs.colors.accent1 || ''}.` : '';
    const vibe = stylePrefs?.vibeContext ? `Visual vibe: ${stylePrefs.vibeContext}.` : '';
    const template = 'Match the deck template’s visual feel for brand consistency. Do not add textual labels within the image.';
    return [base, styleTone, accuracy, vibe, colors, font, template].filter(Boolean).join(' ');
  };
  const { toast } = useToast();
  
  // Add state for scroll indicator
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);
  
  // Extract unique topics from images
  const uniqueTopics = useMemo(() => {
    const topicsSet = new Set<string>();
    
    images.forEach(img => {
      if ('topic' in img && img.topic) {
        topicsSet.add(img.topic);
      }
      if ('topics' in img && Array.isArray(img.topics)) {
        img.topics.forEach(t => topicsSet.add(t));
      }
    });
    
    return Array.from(topicsSet);
  }, [images]);

  // Filter images by selected topic
  const filteredImages = useMemo(() => {
    if (!selectedTopic) return images;
    
    // If images have a 'topic' field, use that for more accurate filtering
    return images.filter(img => {
      // Check if image has explicit topic field
      if ('topic' in img && img.topic) {
        return img.topic.toLowerCase() === selectedTopic.toLowerCase();
      }
      
      // Check if image has multiple topics
      if ('topics' in img && Array.isArray(img.topics)) {
        return img.topics.some(t => t.toLowerCase() === selectedTopic.toLowerCase());
      }
      
      // Fallback to alt text search
      return img.alt.toLowerCase().includes(selectedTopic.toLowerCase());
    });
  }, [images, selectedTopic]);
  
  // Hide scroll indicator after a short delay (5% longer than before)
  useEffect(() => {
    if (showScrollIndicator && filteredImages.length > 4) {
      const timer = setTimeout(() => {
        setShowScrollIndicator(false);
      }, 2100); // Show for 2.1 seconds (5% longer than typical 2 second duration)
      
      return () => clearTimeout(timer);
    }
  }, [showScrollIndicator, filteredImages.length]);
  
  // Debug helper - expose to window for debugging
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).debugImageCache = () => {
        console.log('📸 Image Cache Contents:', window.__slideImageCache);
        if (window.__slideImageCache) {
          console.log('📸 Cached slide IDs:', Object.keys(window.__slideImageCache));
          Object.entries(window.__slideImageCache).forEach(([slideId, data]: [string, any]) => {
            console.log(`  - Slide ${slideId}:`);
            console.log(`    Title: ${data.slideTitle}`);
            console.log(`    Index: ${data.slideIndex}`);
            console.log(`    Topics: ${data.topics?.join(', ') || 'none'}`);
            console.log(`    Images (flat): ${data.images?.length || 0}`);
            console.log(`    Images by topic: ${data.images_by_topic ? Object.keys(data.images_by_topic).length + ' topics' : 'none'}`);
            if (data.images_by_topic) {
              Object.entries(data.images_by_topic).forEach(([topic, images]: [string, any]) => {
                console.log(`      - ${topic}: ${images?.length || 0} images`);
              });
            }
          });
        } else {
          console.log('📸 No image cache found');
        }
        
        // Also log current deck's slide IDs
        const deckStore = (window as any).useDeckStore?.getState();
        if (deckStore) {
          const slides = deckStore.deckData?.slides || [];
          console.log('🎯 Current deck slide IDs:', slides.map((s: any) => s.id));
        }
      };
    }
  }, []);

  // Track recently selected images
  const [recentImages, setRecentImages] = useState<ImageOption[]>(() => {
    // Load from localStorage
    const stored = localStorage.getItem('recentlySelectedImages');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return [];
      }
    }
    return [];
  });
  
  // Auto-select toggle (persisted)
  const [autoSelectEnabled, setAutoSelectEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('imagePickerAutoSelect');
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('imagePickerAutoSelect', JSON.stringify(autoSelectEnabled));
    } catch {}
  }, [autoSelectEnabled]);

  // Track used image URLs globally to avoid repeats across sessions
  const [usedImageUrls, setUsedImageUrls] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('usedImageUrls');
      const arr = saved ? JSON.parse(saved) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  });

  const markUrlUsed = (url: string) => {
    setUsedImageUrls(prev => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      try {
        localStorage.setItem('usedImageUrls', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  // Determine initial tab: Recommended is default when images available, otherwise AI Generate
  const hasImages = images && images.length > 0;
  const [activeTab, setActiveTab] = useState<'recommended' | 'search' | 'upload' | 'generate' | 'recent'>(hasImages ? 'recommended' : 'generate');

  // AI Generation state
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<ImageOption[]>([]);
  
  // Notification bubble state
  const [showNotificationBubble, setShowNotificationBubble] = useState(true);
  const [hasClickedGenerate, setHasClickedGenerate] = useState(() => {
    return localStorage.getItem('hasClickedAiGenerate') === 'true';
  });
  
  // Check scroll ability
  const checkScroll = () => {
    const container = scrollContainerRef.current;
    if (container) {
      setCanScrollLeft(container.scrollLeft > 0);
      setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth);
    }
  };

  useEffect(() => {
    checkScroll();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScroll);
      return () => container.removeEventListener('scroll', checkScroll);
    }
  }, [filteredImages]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Don't close if clicking inside the picker
      if (pickerRef.current && pickerRef.current.contains(event.target as Node)) {
        return;
      }
      
        // Check if clicking on a component or any part of the slide
        const target = event.target as HTMLElement;
        const isComponentClick = target.closest('.component-wrapper') || 
                                target.closest('.slide-container') ||
                                target.closest('[data-component-id]');
        
        // Close immediately if clicking on a component or slide
        if (isComponentClick) {
          onClose();
          return;
        }
        
        // Otherwise close normally
        onClose();
    };

    // Add both mousedown and click listeners for better coverage
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true);
      document.addEventListener('click', handleClickOutside, true);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, [onClose]);

  const scroll = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (container) {
      const scrollAmount = container.clientWidth * 0.8;
      container.scrollTo({
        left: container.scrollLeft + (direction === 'left' ? -scrollAmount : scrollAmount),
        behavior: 'smooth'
      });
    }
  };

  // Handle media selection from tabs - images, gifs, and videos
  const handleMediaSelect = (url: string, type: 'image' | 'video' | 'icon' | 'other') => {
    // Apply any visual media (images, gifs, videos) to image placeholders
    onImageSelect(url);
    
    // Add to recent images
    const selectedImage = images.find(img => img.url === url) || {
      id: `recent-${Date.now()}`,
      url,
      thumbnail: url,
      alt: 'Recent image'
    };
    
    const newRecent = [selectedImage, ...recentImages.filter(img => img.url !== url)].slice(0, 12);
    setRecentImages(newRecent);
    localStorage.setItem('recentlySelectedImages', JSON.stringify(newRecent));

    // Mark as used to avoid future auto-selection repeats
    if (type === 'image') {
      markUrlUsed(url);
    }
  };
  
  // Handle load more for search tab
  const handleSearchLoadMore = async (query: string): Promise<any[]> => {
    if (!onLoadMore) return [];
    
    try {
      // Call the original onLoadMore with the query as topic
      await onLoadMore(query);
      
      // Return empty array since onLoadMore doesn't return anything
      // The images will be updated through the parent component's state
      return [];
    } catch (error) {
      console.error('Error loading more images:', error);
      return [];
    }
  };

  // Handle AI image generation
  const handleGenerate = async (e?: React.MouseEvent) => {
    // Prevent the popup from closing
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (!generatePrompt.trim()) {
      toast({
        title: "Please enter a prompt",
        description: "Describe what image you'd like to generate",
        variant: "destructive"
      });
      return;
    }

    // Close the picker immediately and update the component to generating state
    onImageSelect('generating://ai-image');
    onClose();
    
    // Clear the prompt for next time
    const promptToUse = generatePrompt;
    setGeneratePrompt('');

    // Start generating in the background
    setIsGenerating(true);
    
    try {
      // Gather slide context
      const slideContext = {
        title: activeSlide?.title || slideTitle || '',
        content: activeSlide?.components
          ?.filter(c => c.type === 'TiptapTextBlock')
          ?.map(c => {
            // Extract text from TipTap content
            const texts = c.props?.texts?.content || [];
            return texts.map((block: any) => 
              block.content?.map((item: any) => item.text || '').join(' ')
            ).join(' ');
          })
          .join(' ') || '',
        theme: activeSlide?.components
          ?.find(c => c.type === 'Background')
          ?.props || {}
      };

      const response = await fetch('/api/images/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: buildGuidedPrompt(promptToUse),
          slideContext,
          style: 'photorealistic', // Could make this configurable
          aspectRatio: targetAspectRatio,
          deckTheme: (deckData?.theme || deckData?.data?.theme || deckData?.workspaceTheme || undefined) ?? undefined
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate image');
      }

      const { url, revised_prompt } = await response.json();
      if (!url || typeof url !== 'string') {
        throw new Error('Invalid response: missing url');
      }
      
      // Update the component with the generated image immediately
      onImageSelect(url);
      
      toast({
        title: "Image generated!",
        description: revised_prompt ? `Your AI image has been created` : "Your AI image has been created",
      });
      
    } catch (error) {
      console.error('Generation error:', error);
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Unable to generate image. Please try again.",
        variant: "destructive"
      });
      
      // Revert to placeholder on failure
      onImageSelect('placeholder');
    } finally {
      setIsGenerating(false);
    }
  };

  // Auto-select the first non-used image in the current category (topic)
  // Do this once per topic change when toggle is enabled
  const autoSelectedTopicRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoSelectEnabled) return;
    if (!selectedTopic) return; // Only auto-select when a specific category is chosen

    // Only run once per topic selection
    if (autoSelectedTopicRef.current === selectedTopic) return;

    // Find first candidate matching category that hasn't been used or already selected
    const candidate = filteredImages.find(img => !usedImageUrls.has(img.url) && !selectedImages.includes(img.url));
    if (candidate) {
      autoSelectedTopicRef.current = selectedTopic;
      handleMediaSelect(candidate.url, 'image');
    } else {
      // Even if none available, mark topic to avoid tight loops
      autoSelectedTopicRef.current = selectedTopic;
    }
  }, [autoSelectEnabled, selectedTopic, filteredImages, usedImageUrls, selectedImages]);

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="fixed top-0 inset-x-0"
      style={{ zIndex: 9999999 }} // Higher z-index than the Select Image button
    >
      <div 
        ref={pickerRef}
        className="bg-background border-b border-border shadow-lg"
        style={{ width: 'calc(100% - 2px)' }} // Account for borders
      >
        <div className="p-2.5 max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Select Media
              </h3>
              <span className="text-xs text-muted-foreground">
                {selectedImages.length}/{placeholderCount}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Auto-select</span>
                <Switch
                  checked={autoSelectEnabled}
                  onCheckedChange={(v) => setAutoSelectEnabled(!!v)}
                />
              </div>
              <button
                onClick={onClose}
                className="p-1 hover:bg-accent rounded-md transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Main Tabs - Compact Style */}
          <div className="flex gap-1 mb-2">
            {hasImages && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab('recommended');
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                  activeTab === 'recommended' 
                    ? "bg-black text-white dark:bg-white dark:text-black" 
                    : "hover:bg-accent/50"
                )}
              >
                <Sparkles className="w-3 h-3" />
                Recommended
              </button>
            )}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab('generate');
                  // Dismiss notification bubble when clicked
                  if (!hasClickedGenerate) {
                    setHasClickedGenerate(true);
                    setShowNotificationBubble(false);
                    localStorage.setItem('hasClickedAiGenerate', 'true');
                  }
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                }}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                  activeTab === 'generate' 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-primary/10 hover:bg-primary/20 text-primary"
                )}
              >
                <Wand2 className="w-3 h-3" />
                AI Generate
              </button>
              {/* Notification bubble */}
              {showNotificationBubble && !hasClickedGenerate && hasImages && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 15 }}
                  className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full ring-2 ring-background"
                  style={{ zIndex: 1 }}
                />
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveTab('search');
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                activeTab === 'search' 
                  ? "bg-black text-white dark:bg-white dark:text-black" 
                  : "hover:bg-accent/50"
              )}
            >
              <Search className="w-3 h-3" />
                Search
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveTab('recent');
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                activeTab === 'recent' 
                  ? "bg-black text-white dark:bg-white dark:text-black" 
                  : "hover:bg-accent/50"
              )}
            >
              <RefreshCw className="w-3 h-3" />
              Recent
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveTab('upload');
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                activeTab === 'upload' 
                  ? "bg-black text-white dark:bg-white dark:text-black" 
                  : "hover:bg-accent/50"
              )}
            >
              <Upload className="w-3 h-3" />
                Upload
            </button>
          </div>

          {/* Tab Content */}
          <Tabs value={activeTab} className="w-full">{/* Keep Tabs wrapper for content */}

            {/* Tab Content */}
            <div className={cn(
              "overflow-hidden transition-all duration-300",
              activeTab === 'generate' ? "h-[240px]" :
              activeTab === 'recommended' ? "h-[220px]" : "h-[320px]"
            )}>
              {/* Recommended Tab */}
              <TabsContent value="recommended" className="h-full mt-0 overflow-y-auto">
                {/* Topic Pills */}
                {uniqueTopics.length > 0 && (
                  <div className="flex gap-1.5 mb-2 px-1">
                    <button
                      onClick={() => setSelectedTopic(null)}
                      className={cn(
                        "px-2 py-0.5 text-xs rounded-full transition-colors",
                        !selectedTopic 
                          ? "bg-primary text-primary-foreground" 
                          : "bg-secondary hover:bg-secondary/80"
                      )}
                    >
                      All
                    </button>
                    {uniqueTopics.map(topic => (
                      <button
                        key={topic}
                        onClick={() => setSelectedTopic(topic)}
                        className={cn(
                          "px-2 py-0.5 text-xs rounded-full transition-colors",
                          selectedTopic === topic 
                            ? "bg-primary text-primary-foreground" 
                            : "bg-secondary hover:bg-secondary/80"
                        )}
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                )}
                
                {!images || images.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <ImageIcon className="w-8 h-8 mb-2" />
                    <p className="text-sm">Loading images...</p>
                  </div>
                ) : (
                  <div className="relative h-full">
                    {/* Images Grid */}
                    <div className="grid grid-cols-4 gap-2 h-full overflow-y-auto px-0.5 pb-4 image-picker-scroll">
                      {filteredImages.map((image, index) => (
                        <motion.div
                          key={`${image.id}-${image.url}-${index}`}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          whileHover={{ scale: 1.05 }}
                          onClick={() => onImageSelect(image.url)}
                          onMouseEnter={() => setHoveredImageId(image.id)}
                          onMouseLeave={() => setHoveredImageId(null)}
                          className={cn(
                            "relative cursor-pointer rounded-md overflow-hidden border-2 transition-all",
                            selectedImages.includes(image.url)
                              ? "border-primary shadow-md" 
                              : "border-transparent hover:border-border"
                          )}
                          style={{ height: '85px' }}
                        >
                          <img
                            src={image.src?.thumbnail || image.thumbnail || image.url}
                            alt={image.alt}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              // Fallback to main URL if thumbnail fails
                              const target = e.target as HTMLImageElement;
                              if (target.src !== image.url) {
                                target.src = image.url;
                              }
                            }}
                          />
                          
                          {/* Selected indicator */}
                          {selectedImages.includes(image.url) && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="absolute top-1 right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center"
                            >
                              <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </motion.div>
                          )}
                          
                          {/* Hover preview icon */}
                          <AnimatePresence>
                            {hoveredImageId === image.id && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className={cn(
                                  "absolute bg-black/70 backdrop-blur-sm p-1 rounded-full cursor-pointer",
                                  selectedImages.includes(image.url) ? "top-1 left-1" : "top-1 right-1"
                                )}
                                onMouseEnter={(e) => {
                                  // Clear any existing timeout
                                  if (previewTimeoutRef.current) {
                                    clearTimeout(previewTimeoutRef.current);
                                  }
                                  
                                  // Get the bounding rect of the eye icon for more accurate positioning
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  
                                  // Debug logging
                                  console.log('Eye icon rect:', {
                                    left: rect.left,
                                    right: rect.right,
                                    top: rect.top,
                                    bottom: rect.bottom,
                                    width: rect.width,
                                    height: rect.height
                                  });
                                  
                                  const viewportHeight = window.innerHeight;
                                  const viewportWidth = window.innerWidth;
                                  
                                  // Preview dimensions
                                  const previewWidth = 250;
                                  const previewHeight = 250;
                                  
                                  // Position directly next to the eye icon with minimal gap
                                  let x = rect.right + 2; // Just 2px gap from the right edge of eye icon
                                  let y = rect.top - (previewHeight / 2) + (rect.height / 2); // Center vertically with icon
                                  
                                  // Check if preview would go off right edge
                                  if (x + previewWidth > viewportWidth - 10) {
                                    x = rect.left - previewWidth - 2; // Show on left side with 2px gap
                                  }
                                  
                                  // Check if preview would go off bottom
                                  if (y + previewHeight > viewportHeight - 10) {
                                    y = viewportHeight - previewHeight - 10;
                                  }
                                  
                                  // Check if preview would go off top
                                  if (y < 10) {
                                    y = 10; // Minimum distance from top
                                  }
                                  
                                  console.log('Preview position:', { x, y });
                                  
                                  setPreviewPosition({ x, y });
                                  setPreviewImage(image);
                                }}
                                onMouseMove={(e) => {
                                  // Don't update position on mouse move - keep it stable
                                  e.stopPropagation();
                                }}
                                onMouseLeave={() => {
                                  // Hide preview immediately when leaving the eye icon
                                  setPreviewImage(null);
                                  if (previewTimeoutRef.current) {
                                    clearTimeout(previewTimeoutRef.current);
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      ))}
                    </div>
                    
                    {/* Scroll Indicator - shows briefly when picker opens */}
                    <AnimatePresence>
                      {showScrollIndicator && filteredImages.length > 4 && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          transition={{ duration: 0.3 }}
                          className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 text-white px-3 py-1.5 rounded-full text-xs font-medium pointer-events-none z-10"
                        >
                          <div className="flex items-center gap-1.5">
                            <motion.div
                              animate={{ y: [0, 3, 0] }}
                              transition={{ duration: 1.5, repeat: Infinity }}
                            >
                              ↓
                            </motion.div>
                            Scroll for more images
                            <motion.div
                              animate={{ y: [0, 3, 0] }}
                              transition={{ duration: 1.5, repeat: Infinity }}
                            >
                              ↓
                            </motion.div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </TabsContent>

              {/* Search Tab */}
              <TabsContent value="search" className="h-full mt-0 overflow-y-auto">
                <SearchTab onSelect={handleMediaSelect} onLoadMore={handleSearchLoadMore} />
              </TabsContent>

              {/* Recent Tab */}
              <TabsContent value="recent" className="h-full mt-0 overflow-y-auto">
                {recentImages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <RefreshCw className="w-8 h-8 mb-2" />
                    <p className="text-sm">No recent images</p>
                    <p className="text-xs mt-1">Your recently used images will appear here</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2 p-1">
                    {recentImages.map((image, index) => (
                      <motion.div
                        key={`recent-${image.id}-${image.url}-${index}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileHover={{ scale: 1.05 }}
                        onClick={() => handleMediaSelect(image.url, 'image')}
                        className={cn(
                          "relative cursor-pointer rounded-md overflow-hidden border-2 transition-all",
                          selectedImages.includes(image.url)
                            ? "border-primary shadow-md" 
                            : "border-transparent hover:border-border"
                        )}
                        style={{ height: '85px' }}
                      >
                        <img
                          src={image.thumbnail || image.url}
                          alt={image.alt}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {selectedImages.includes(image.url) && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute top-1 right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center"
                          >
                            <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </motion.div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Upload Tab */}
              <TabsContent value="upload" className="h-full mt-0">
                <ImageTab onSelect={handleMediaSelect} />
              </TabsContent>

              {/* Generate Tab */}
              <TabsContent value="generate" className="h-full mt-0 overflow-y-auto">
                <div 
                  className="space-y-3 p-2"
                  onClick={(e) => {
                    // Prevent any click from bubbling up
                    e.stopPropagation();
                  }}
                  onMouseDown={(e) => {
                    // Prevent mousedown from bubbling up
                    e.stopPropagation();
                  }}
                >
                  {/* Prompt Input */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium flex items-center gap-2">
                      Describe what you want to generate
                      <span className="text-[10px] font-normal text-muted-foreground">(AI-powered)</span>
                    </label>
                    <Textarea
                      value={generatePrompt}
                      onChange={(e) => setGeneratePrompt(e.target.value)}
                      placeholder="A modern office space with natural lighting and plants..."
                      className="min-h-[70px] resize-none text-sm"
                      disabled={isGenerating}
                      onKeyDown={(e) => {
                        // Prevent any key events from bubbling up
                        e.stopPropagation();
                      }}
                    />
            </div>

                  {/* Generate Button */}
                  <Button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleGenerate(e);
                    }}
                    onMouseDown={(e) => {
                      // Prevent mousedown from closing popover
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    disabled={isGenerating || !generatePrompt.trim()}
                    className="w-full"
                    variant="default"
                    size="sm"
                    type="button"
                  >
                    {isGenerating ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-3.5 h-3.5 mr-2" />
                        Generate Image
                      </>
                    )}
                  </Button>

                  {/* Generated Images */}
                  {generatedImages.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium">Generated Images</p>
                      <div className="grid grid-cols-2 gap-2">
                        {generatedImages.map((image, index) => (
                          <motion.div
                            key={`generated-${image.id}-${image.url}-${index}`}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            whileHover={{ scale: 1.05 }}
                            onClick={() => onImageSelect(image.url)}
                            className={cn(
                              "relative cursor-pointer rounded-md overflow-hidden border-2 transition-all",
                              selectedImages.includes(image.url)
                                ? "border-primary shadow-md" 
                                : "border-transparent hover:border-border"
                            )}
                            style={{ aspectRatio: targetAspectRatio === '1:1' ? '1/1' : (targetAspectRatio === '9:16' ? '9/16' : '16/9') }}
                          >
                            <img
                              src={image.url}
                              alt={image.alt}
                              className="w-full h-full object-cover"
                            />
                            {selectedImages.includes(image.url) && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="absolute top-1 right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center"
                              >
                                <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </motion.div>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>


          </Tabs>
        </div>
      </div>
    </motion.div>
    
    {/* Preview Popup - Outside the main container for proper positioning */}
    {previewImage && createPortal(
      <motion.div
        key="image-preview"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.2 }}
        className="fixed pointer-events-none"
        style={{
          left: `${previewPosition.x}px`,
          top: `${previewPosition.y}px`,
          zIndex: 2147483647 // Maximum z-index value to ensure it's above everything
        }}
      >
          <div 
            className="relative bg-background border-2 border-border rounded-lg overflow-hidden pointer-events-auto"
            style={{
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)'
            }}
            onMouseEnter={() => {
              // Clear timeout when hovering over preview
              if (previewTimeoutRef.current) {
                clearTimeout(previewTimeoutRef.current);
              }
            }}
            onMouseLeave={() => {
              // Hide preview when leaving
              setPreviewImage(null);
            }}
          >
            <img
              src={previewImage.src?.large || previewImage.src?.medium || previewImage.url}
              alt={previewImage.alt}
              className="object-contain"
              style={{
                maxWidth: '250px',
                maxHeight: '250px',
                width: 'auto',
                height: 'auto'
              }}
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-white">
              <p className="text-sm font-medium line-clamp-2">{previewImage.alt}</p>
              {previewImage.photographer && (
                <p className="text-xs opacity-80">by {previewImage.photographer}</p>
              )}
              {previewImage.width && previewImage.height && (
                <p className="text-xs opacity-60 mt-1">{previewImage.width} × {previewImage.height}</p>
              )}
            </div>
          </div>
        </motion.div>,
      document.body
    )}
    </>
  );
};

export default ImagePicker; 