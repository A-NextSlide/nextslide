import React, { useState, forwardRef } from 'react';
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Image as ImageIcon, Video as VideoIcon, Clock, Search, Wand2, RefreshCw } from 'lucide-react'; // Updated icons
import { ImageTab } from './ImageTab'; // Will replace UploadTab
import { VideoTab } from './VideoTab'; // New tab for Videos
import { SearchTab } from './SearchTab'; // <-- Import SearchTab
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDeckStore } from '@/stores/deckStore';

// Updated MediaSource type
export type MediaSource = 'image' | 'video' | 'recent' | 'search' | 'generate';
// Keep OnMediaSelect as is, the types cover image/video
export type OnMediaSelect = (url: string, type: 'image' | 'video' | 'icon' | 'other', source: MediaSource) => void;

interface MediaHubProps {
    trigger?: React.ReactNode;
    onSelect: OnMediaSelect;
}

interface RecentMedia {
    id: string;
    url: string;
    type: 'image' | 'video';
    timestamp: number;
}

// Wrap with forwardRef, using the correct element type (HTMLButtonElement)
export const MediaHub = forwardRef<HTMLButtonElement, MediaHubProps>(({ trigger, onSelect }, ref) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<MediaSource>('generate'); // Default to AI Generate tab
    const [hasInteracted, setHasInteracted] = useState(false); // Track if user has clicked
    const [preventClose, setPreventClose] = useState(false); // Prevent closing during generation
    
    // Recent media state
    const [recentMedia, setRecentMedia] = useState<RecentMedia[]>(() => {
        const saved = localStorage.getItem('recentMedia');
        return saved ? JSON.parse(saved).slice(0, 12) : [];
    });
    
    // AI Generation state
    const [generatePrompt, setGeneratePrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const { activeSlide } = useActiveSlide();
    const { toast } = useToast();
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

    const handleSelect = (url: string, type: 'image' | 'video' | 'icon' | 'other', source: MediaSource) => {
        onSelect(url, type, source);
        
        // Add to recent media
        if (type === 'image' || type === 'video') {
            const newRecent: RecentMedia = {
                id: `recent-${Date.now()}`,
                url,
                type: type as 'image' | 'video',
                timestamp: Date.now()
            };
            
            const updated = [newRecent, ...recentMedia.filter(m => m.url !== url)].slice(0, 12);
            setRecentMedia(updated);
            localStorage.setItem('recentMedia', JSON.stringify(updated));
        }
        
        setIsOpen(false); // Close popover on selection
    }
    
    // Handle AI image generation
    const handleGenerate = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (!generatePrompt.trim()) {
            toast({
                title: "Please enter a prompt",
                description: "Describe what image you'd like to generate",
                variant: "destructive"
            });
            return;
        }

        // Create a temporary image component with generating state
        const tempImageUrl = 'generating://ai-image';
        
        // Close the popup immediately and let user continue
        setIsOpen(false);
        
        // Clear the prompt for next time
        const promptToUse = generatePrompt;
        setGeneratePrompt('');
        
        // Notify parent to create component with temporary URL
        onSelect(tempImageUrl, 'image', 'generate');
        
        // Start generating in the background
        setIsGenerating(true);
        
        try {
            // Gather slide context
            const slideContext = {
                title: activeSlide?.title || '',
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

            // Determine target aspect ratio using editor selection box if available
            let targetAspectRatio: '16:9' | '1:1' | '9:16' = '16:9';
            try {
                const selected = document.querySelector('[data-component-id].selected') as HTMLElement | null;
                const slideContainer = document.querySelector('#slide-display-container') as HTMLElement | null;
                if (selected && slideContainer) {
                    const rect = selected.getBoundingClientRect();
                    const slideRect = slideContainer.getBoundingClientRect();
                    const w = Math.max(1, Math.round((rect.width / (slideRect.width || 1)) * 1920));
                    const h = Math.max(1, Math.round((rect.height / (slideRect.height || 1)) * 1080));
                    const ratio = w / h;
                    const candidates: Array<{ key: '16:9' | '1:1' | '9:16'; value: number }> = [
                        { key: '16:9', value: 16 / 9 },
                        { key: '1:1', value: 1 },
                        { key: '9:16', value: 9 / 16 },
                    ];
                    let best: '16:9' | '1:1' | '9:16' = '16:9';
                    let bestDelta = Number.POSITIVE_INFINITY;
                    for (const c of candidates) {
                        const d = Math.abs(ratio - c.value);
                        if (d < bestDelta) { bestDelta = d; best = c.key; }
                    }
                    targetAspectRatio = best;
                }
            } catch {}

            const response = await fetch('/api/images/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: buildGuidedPrompt(promptToUse),
                    slideContext,
                    style: 'photorealistic',
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
            
            // Update the component with the actual generated image
            // The parent should handle updating components with tempImageUrl to url
            onSelect(url, 'image', 'generate');
            
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
            
            // Notify parent to remove the temporary component
            onSelect('failed://ai-image', 'image', 'generate');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <Popover 
            open={isOpen} 
            onOpenChange={(open) => {
                // Don't close if we're preventing it
                if (!open && preventClose) {
                    return;
                }
                setIsOpen(open);
            }}
        >
            <Tooltip>
                <TooltipTrigger asChild>
            <PopoverTrigger asChild ref={ref}>
                {trigger || (
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 rounded-md"
                                onClick={() => setHasInteracted(true)}
                            >
                                <ImageIcon className="h-4 w-4" />
                    </Button>
                )}
            </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>
                    <p className="text-xs">Add Media</p>
                </TooltipContent>
            </Tooltip>
            <PopoverContent 
                className="w-96 p-0" 
                side="top" 
                align="start" 
                onOpenAutoFocus={(e) => e.preventDefault()}
                onInteractOutside={(e) => {
                    // Prevent closing when interacting with tabs or generate content
                    const target = e.target as HTMLElement;
                    if (target.closest('[role="tabpanel"]') || 
                        target.closest('.generate-content') ||
                        target.closest('[role="tablist"]') || 
                        target.closest('[role="tab"]')) {
                        e.preventDefault();
                    }
                }}
            >
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as MediaSource)} className="w-full">
                    {/* Updated Tabs List */}
                    <TabsList className="grid w-full grid-cols-5 h-auto rounded-t-md rounded-b-none p-1">
                        <TabsTrigger 
                            value="generate" 
                            className={cn(
                                "text-xs flex-col h-auto py-1.5 px-1 gap-1",
                                activeTab === 'generate' && "bg-primary/10"
                            )}
                            onClick={(e) => {
                                // Prevent any bubbling that might close the popover
                                e.stopPropagation();
                            }}
                            onMouseDown={(e) => {
                                // Also prevent mousedown events
                                e.stopPropagation();
                            }}
                        >
                            <Wand2 className="h-3.5 w-3.5" /> 
                            <span className="font-medium">AI</span>
                        </TabsTrigger>
                        <TabsTrigger value="search" className="text-xs flex-col h-auto py-1.5 px-1 gap-1">
                           <Search className="h-3.5 w-3.5" /> Search
                        </TabsTrigger>
                        <TabsTrigger value="image" className="text-xs flex-col h-auto py-1.5 px-1 gap-1">
                            <ImageIcon className="h-3.5 w-3.5" /> Images
                        </TabsTrigger>
                        <TabsTrigger value="video" className="text-xs flex-col h-auto py-1.5 px-1 gap-1">
                            <VideoIcon className="h-3.5 w-3.5" /> Videos
                        </TabsTrigger>
                        <TabsTrigger value="recent" className="text-xs flex-col h-auto py-1.5 px-1 gap-1">
                            <Clock className="h-3.5 w-3.5" /> Recent
                        </TabsTrigger>
                    </TabsList>

                    {/* --- Tab Content Panes --- */}
                    <div className="p-3 min-h-[180px]"> 
                        <TabsContent value="image">
                           <ImageTab onSelect={(url, type) => handleSelect(url, type, 'image')} />
                        </TabsContent>
                         <TabsContent value="video">
                            <VideoTab onSelect={(url, type) => handleSelect(url, type, 'video')} />
                        </TabsContent>
                         <TabsContent value="search">
                             <SearchTab onSelect={(url, type) => handleSelect(url, type, 'search')} />
                         </TabsContent>
                        <TabsContent value="generate" className="space-y-3 generate-content">
                            <div className="space-y-2">
                                <label className="text-xs font-medium">Describe what you want to generate</label>
                                <Textarea
                                    value={generatePrompt}
                                    onChange={(e) => setGeneratePrompt(e.target.value)}
                                    placeholder="A professional headshot with soft lighting..."
                                    className="min-h-[70px] resize-none text-sm"
                                    disabled={isGenerating}
                                    onKeyDown={(e) => {
                                        // Prevent any key events from bubbling up
                                        e.stopPropagation();
                                    }}
                                />
                            </div>
                            
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
                        </TabsContent>
                        <TabsContent value="recent">
                            {recentMedia.length === 0 ? (
                                <div className="text-center text-sm text-muted-foreground py-6">
                                    <Clock className="w-6 h-6 mx-auto mb-2 opacity-50" />
                                    <p>No recent media</p>
                                    <p className="text-xs mt-1">Your recently used media will appear here</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 gap-2 max-h-[180px] overflow-y-auto">
                                    {recentMedia.map((media) => (
                                        <div
                                            key={media.id}
                                            onClick={() => handleSelect(media.url, media.type, 'recent')}
                                            className="relative cursor-pointer rounded border border-border hover:border-primary transition-colors overflow-hidden aspect-video"
                                        >
                                            {media.type === 'image' ? (
                                                <img
                                                    src={media.url}
                                                    alt="Recent media"
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <video
                                                    src={media.url}
                                                    className="w-full h-full object-cover"
                                                    muted
                                                />
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 hover:opacity-100 transition-opacity" />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </TabsContent>
                    </div>
                </Tabs>
            </PopoverContent>
        </Popover>
    );
});

// Add display name for better debugging
MediaHub.displayName = "MediaHub"; 