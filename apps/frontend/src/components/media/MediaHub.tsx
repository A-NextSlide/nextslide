import React, { useState, useRef, useEffect, forwardRef } from 'react';
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Image as ImageIcon, Video as VideoIcon, Clock, Search, Wand2, RefreshCw, Loader2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { ImageTab } from './ImageTab';
import { VideoTab } from './VideoTab';
import { SearchTab } from './SearchTab';
import { Textarea } from '@/components/ui/textarea';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDeckStore } from '@/stores/deckStore';
import { trackMediaSelected } from '@/services/analytics';
import { COLORS } from '@/utils/colors';

// Updated MediaSource type
export type MediaSource = 'image' | 'video' | 'recent' | 'search' | 'generate';
// Keep OnMediaSelect as is, the types cover image/video
export type OnMediaSelect = (url: string, type: 'image' | 'video' | 'icon' | 'other', source: MediaSource) => void;

interface MediaHubProps {
    trigger?: React.ReactNode;
    onSelect: OnMediaSelect;
    defaultSearchTerm?: string; // Pre-fill search when opening
    autoSearch?: boolean; // Auto-trigger search when opening with defaultSearchTerm
    /** Which tab to open on. Defaults to 'search'. */
    defaultTab?: MediaSource;
    /** Pre-fill the AI generation prompt (used when imageMode is 'ai'). */
    defaultGeneratePrompt?: string;
    /** Controlled mode — when provided, MediaHub renders as a floating panel instead of a popover. */
    open?: boolean;
    onClose?: () => void;
}

interface RecentMedia {
    id: string;
    url: string;
    type: 'image' | 'video';
    timestamp: number;
    thumbnail?: string;
    alt?: string;
}

/** Read and merge recent media from both localStorage keys (MediaHub + ImagePicker). */
function loadRecentMedia(): RecentMedia[] {
    const items: RecentMedia[] = [];
    try {
        const raw = localStorage.getItem('recentMedia');
        if (raw) items.push(...JSON.parse(raw));
    } catch {}
    try {
        const raw = localStorage.getItem('recentlySelectedImages');
        if (raw) {
            const parsed: any[] = JSON.parse(raw);
            for (const img of parsed) {
                if (img.url && !items.some(i => i.url === img.url)) {
                    items.push({
                        id: img.id || `recent-${Date.now()}-${Math.random()}`,
                        url: img.url,
                        type: 'image',
                        timestamp: img.timestamp || Date.now(),
                        thumbnail: img.thumbnail || img.src?.thumbnail,
                        alt: img.alt,
                    });
                }
            }
        }
    } catch {}
    // Sort newest first, cap at 12
    items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return items.slice(0, 12);
}

// Wrap with forwardRef, using the correct element type (HTMLButtonElement)
export const MediaHub = forwardRef<HTMLButtonElement, MediaHubProps>(({ trigger, onSelect, defaultSearchTerm, autoSearch, defaultTab, defaultGeneratePrompt, open: controlledOpen, onClose }, ref) => {
    const isControlled = controlledOpen !== undefined;
    const [internalOpen, setInternalOpen] = useState(false);
    const isOpen = isControlled ? controlledOpen : internalOpen;
    const setIsOpen = (v: boolean) => {
        if (isControlled) { if (!v && onClose) onClose(); }
        else setInternalOpen(v);
    };

    const [activeTab, setActiveTab] = useState<MediaSource>(defaultTab || 'search');
    const [searchToken, setSearchToken] = useState<number | null>(null);
    const [hasInteracted, setHasInteracted] = useState(false);
    const [preventClose, setPreventClose] = useState(false);
    const [hubSearchTerm, setHubSearchTerm] = useState(defaultSearchTerm || '');
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Recent media state — merged from both storage keys
    const [recentMedia, setRecentMedia] = useState<RecentMedia[]>(loadRecentMedia);

    // Sync search term + recents when controlled open changes or search term prop updates
    useEffect(() => {
        if (isControlled && controlledOpen) {
            setRecentMedia(loadRecentMedia());
            setHubSearchTerm(defaultSearchTerm || '');
            if (defaultTab) setActiveTab(defaultTab);
            if (defaultGeneratePrompt) setGeneratePrompt(defaultGeneratePrompt);
            setTimeout(() => searchInputRef.current?.focus(), 50);
        }
    }, [controlledOpen, defaultSearchTerm, defaultTab, defaultGeneratePrompt]);

    // AI Generation state
    const [generatePrompt, setGeneratePrompt] = useState(defaultGeneratePrompt || '');
    const [isGenerating, setIsGenerating] = useState(false);
    const { activeSlide } = useActiveSlide();
    const { toast } = useToast();
    const deckData = useDeckStore((s: any) => s.deckData);

    const buildGuidedPrompt = (base: string) => {
        const stylePrefs = (deckData?.data?.outline?.stylePreferences) || (deckData?.outline?.stylePreferences) || {};
        const colors = stylePrefs?.colors ? `Color palette hint: ${stylePrefs.colors.accent1 || ''}.` : '';
        const vibe = stylePrefs?.vibeContext ? `Visual vibe: ${stylePrefs.vibeContext}.` : '';
        // User's prompt is the primary instruction — style hints are secondary and must not override it.
        return [base, 'Do not add textual labels within the image.', vibe, colors].filter(Boolean).join(' ');
    };

    const handleSelect = (url: string, type: 'image' | 'video' | 'icon' | 'other', source: MediaSource) => {
        // Track media selection in PostHog
        trackMediaSelected({
            source: source === 'generate' ? 'upload' : source === 'recent' ? 'upload' : source as any,
            mediaType: type === 'icon' || type === 'other' ? 'image' : type,
        });

        onSelect(url, type, source);

        // Add to recent media (write to both storage keys for cross-component sync)
        if (type === 'image' || type === 'video') {
            const newRecent: RecentMedia = {
                id: `recent-${Date.now()}`,
                url,
                type: type as 'image' | 'video',
                timestamp: Date.now(),
                thumbnail: url,
                alt: 'Recent media',
            };

            const updated = [newRecent, ...recentMedia.filter(m => m.url !== url)].slice(0, 12);
            setRecentMedia(updated);
            localStorage.setItem('recentMedia', JSON.stringify(updated));

            // Also write to ImagePicker's key so it stays in sync
            try {
                const pickerRecent = JSON.parse(localStorage.getItem('recentlySelectedImages') || '[]');
                const pickerEntry = { id: newRecent.id, url, thumbnail: url, alt: 'Recent image' };
                const pickerUpdated = [pickerEntry, ...pickerRecent.filter((i: any) => i.url !== url)].slice(0, 12);
                localStorage.setItem('recentlySelectedImages', JSON.stringify(pickerUpdated));
            } catch {}
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

        // Keep popup open to show processing state
        const promptToUse = generatePrompt;
        setIsGenerating(true);

        // Notify parent to set placeholder on the component
        onSelect('generating://ai-image', 'image', 'generate');

        try {
            // Minimal slide context — don't let slide text override the user's prompt
            const slideContext = {
                title: activeSlide?.title || '',
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
            onSelect(url, 'image', 'generate');

            // Clear prompt and close on success
            setGeneratePrompt('');
            setIsOpen(false);

            toast({
                title: "Image generated!",
                description: "Your AI image has been created",
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

    // ── Shared inner panel content ──
    const panelContent = (
        <>
            {/* Search bar */}
            <div className="flex items-center gap-1 px-2 pt-2 pb-1.5">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-[1px] h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search images..."
                        value={hubSearchTerm}
                        onChange={(e) => setHubSearchTerm(e.target.value)}
                        onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter' && hubSearchTerm.trim()) {
                                setActiveTab('search');
                                setSearchToken(prev => (prev ?? 0) + 1);
                            }
                        }}
                        className={cn(
                            "flex h-7 w-full rounded-md border border-input bg-background pl-8 pr-3 py-1 text-[11px]",
                            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        )}
                    />
                </div>
                <button
                    onClick={() => {
                        if (hubSearchTerm.trim()) {
                            setActiveTab('search');
                            setSearchToken(prev => (prev ?? 0) + 1);
                        }
                    }}
                    className="flex items-center justify-center h-7 w-7 rounded-md border border-input bg-background hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
                >
                    <Search className="h-3.5 w-3.5" />
                </button>
                {isControlled && (
                    <button
                        onClick={() => setIsOpen(false)}
                        className="flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>

            {/* Tab bar */}
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as MediaSource)} className="w-full">
                <div className="flex items-center px-2 py-1 border-b border-border/40">
                    <div className="flex gap-0.5">
                        {([
                            { value: 'generate' as MediaSource, icon: Wand2, label: 'AI' },
                            { value: 'search' as MediaSource, icon: Search, label: 'Search' },
                            { value: 'image' as MediaSource, icon: ImageIcon, label: 'Images' },
                            { value: 'video' as MediaSource, icon: VideoIcon, label: 'Videos' },
                            { value: 'recent' as MediaSource, icon: Clock, label: 'Recent' },
                        ]).map(({ value, icon: Icon, label }) => (
                            <button
                                key={value}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveTab(value);
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className={cn(
                                    "flex items-center gap-1 px-2 py-1 rounded-md transition-all text-[11px] font-medium",
                                    activeTab === value
                                        ? "bg-orange-50 dark:bg-orange-500/10"
                                        : "hover:bg-muted/60 text-muted-foreground"
                                )}
                                style={{
                                    color: activeTab === value ? COLORS.SUGGESTION_PINK : undefined
                                }}
                            >
                                <Icon size={13} strokeWidth={activeTab === value ? 2.2 : 1.8} />
                                <span>{label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-2 min-h-[180px] max-h-[400px] overflow-y-auto">
                    <TabsContent value="image" className="flex-1 flex flex-col min-h-0">
                       <ImageTab onSelect={(url, type) => handleSelect(url, type, 'image')} />
                    </TabsContent>
                     <TabsContent value="video" className="flex-1 flex flex-col min-h-0">
                        <VideoTab onSelect={(url, type) => handleSelect(url, type, 'video')} />
                    </TabsContent>
                     <TabsContent value="search" className="flex-1 flex flex-col min-h-0">
                         <SearchTab
                             onSelect={(url, type) => handleSelect(url, type, 'search')}
                             defaultSearchTerm={hubSearchTerm}
                             autoSearchToken={searchToken}
                         />
                     </TabsContent>
                    <TabsContent value="generate" className="flex-1 flex flex-col min-h-0 generate-content">
                        {isGenerating ? (
                            <div className="flex flex-col items-center justify-center py-8 gap-3">
                                <Loader2 className="h-6 w-6 animate-spin" style={{ color: COLORS.SUGGESTION_PINK }} />
                                <div className="text-center space-y-1">
                                    <p className="text-[11px] font-medium text-foreground">Creating your image...</p>
                                    <p className="text-[10px] text-muted-foreground">This may take a moment</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                <label className="text-[11px] text-muted-foreground">Describe the image</label>
                                <Textarea
                                    value={generatePrompt}
                                    onChange={(e) => setGeneratePrompt(e.target.value)}
                                    placeholder="A professional headshot with soft lighting..."
                                    className="min-h-[56px] resize-none text-[11px]"
                                    onKeyDown={(e) => {
                                        e.stopPropagation();
                                        if (e.key === 'Enter' && !e.shiftKey && generatePrompt.trim()) {
                                            e.preventDefault();
                                            handleGenerate(e as any);
                                        }
                                    }}
                                />
                                <Button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleGenerate(e);
                                    }}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                    }}
                                    disabled={!generatePrompt.trim()}
                                    className="w-full h-7 text-[11px]"
                                    size="sm"
                                    type="button"
                                    style={{
                                        backgroundColor: generatePrompt.trim() ? COLORS.SUGGESTION_PINK : undefined,
                                        color: generatePrompt.trim() ? 'white' : undefined,
                                    }}
                                >
                                    <Wand2 className="w-3 h-3 mr-1.5" />
                                    Generate
                                </Button>
                            </div>
                        )}
                    </TabsContent>
                    <TabsContent value="recent" className="flex-1 flex flex-col min-h-0">
                        {recentMedia.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                                <Clock className="w-5 h-5 mb-1.5 opacity-40" />
                                <p className="text-[11px]">No recent media</p>
                                <p className="text-[10px] mt-0.5 opacity-60">Selected images will appear here</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-4 gap-1.5 max-h-[280px] overflow-y-auto image-picker-scroll">
                                {recentMedia.map((media) => (
                                    <div
                                        key={media.id}
                                        onClick={() => handleSelect(media.url, media.type, 'recent')}
                                        className="relative cursor-pointer rounded overflow-hidden border border-transparent hover:border-primary/40 transition-colors"
                                        style={{ height: '80px' }}
                                    >
                                        {media.type === 'image' ? (
                                            <img
                                                src={media.thumbnail || media.url}
                                                alt={media.alt || 'Recent media'}
                                                className="w-full h-full object-cover"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <video
                                                src={media.url}
                                                className="w-full h-full object-cover"
                                                muted
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </TabsContent>
                </div>
            </Tabs>
        </>
    );

    // ── Controlled mode: floating centered card via portal ──
    if (isControlled) {
        if (!isOpen) return null;
        return createPortal(
            <div
                className="fixed inset-0 flex items-center justify-center"
                style={{ zIndex: 9999999 }}
                onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false); }}
                onMouseDown={(e) => { if (e.target === e.currentTarget) e.stopPropagation(); }}
            >
                <div
                    className="w-96 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    {panelContent}
                </div>
            </div>,
            document.body
        );
    }

    // ── Default mode: popover with trigger ──
    return (
        <Popover
            open={isOpen}
            onOpenChange={(open) => {
                if (!open && preventClose) return;
                setIsOpen(open);
                if (open) {
                    setRecentMedia(loadRecentMedia());
                    if (defaultSearchTerm) {
                        setHubSearchTerm(defaultSearchTerm);
                    }
                    if (defaultTab) setActiveTab(defaultTab);
                    if (defaultGeneratePrompt) setGeneratePrompt(defaultGeneratePrompt);
                }
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
                style={{ zIndex: 99999 }}
                onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    setTimeout(() => searchInputRef.current?.focus(), 0);
                }}
                onInteractOutside={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest('[role="tabpanel"]') ||
                        target.closest('.generate-content') ||
                        target.closest('[role="tablist"]') ||
                        target.closest('[role="tab"]')) {
                        e.preventDefault();
                    }
                }}
            >
                {panelContent}
            </PopoverContent>
        </Popover>
    );
});

// Add display name for better debugging
MediaHub.displayName = "MediaHub"; 