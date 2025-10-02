import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Image, Video, Sparkles, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { API_CONFIG } from '@/config/environment';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { createPortal } from 'react-dom';

interface SearchTabProps {
    onSelect: (url: string, type: 'image' | 'video' | 'icon' | 'other') => void;
    onLoadMore?: (query: string) => Promise<any[]>;  // Add onLoadMore prop
}

// Match the ImageOption interface from recommended tab
interface SearchResult {
    id?: string;  // Make compatible with ImageOption
    title: string;
    link: string;
    thumbnail?: string;
    source?: string;
    width?: number;
    height?: number;
    alt?: string;  // Add alt for compatibility
    photographer?: string;  // Add photographer for compatibility
    src?: {  // Add src object for compatibility
        thumbnail?: string;
        small?: string;
        medium?: string;
        large?: string;
        original?: string;
    };
}

interface SearchResponse {
    results: SearchResult[];
    total: number;
    query: string;
    type: string;
}

export const SearchTab: React.FC<SearchTabProps> = ({ onSelect, onLoadMore }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [allResults, setAllResults] = useState<SearchResult[]>([]); // Store all results
    const [displayedResults, setDisplayedResults] = useState<SearchResult[]>([]); // Results currently shown
    const [totalResults, setTotalResults] = useState(0);
    const [activeTab, setActiveTab] = useState<'images' | 'videos' | 'gifs'>('images');
    const [hoveredImageId, setHoveredImageId] = useState<string | null>(null);
    const [previewImage, setPreviewImage] = useState<SearchResult | null>(null);
    const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
    const previewTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const { toast } = useToast();
    
    const ITEMS_PER_PAGE = 20;

    const searchWithBackend = async (query: string, searchType: 'images' | 'videos' | 'gifs', limit: number = 100, page: number = 1) => {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}/media/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query,
                    type: searchType,
                    limit,
                    page  // Add page parameter
                })
            });
            
            if (!response.ok) {
                throw new Error(`Search request failed: ${response.statusText}`);
            }

            const data: SearchResponse = await response.json();
            
            // Transform results to match ImageOption structure
            const transformedResults = data.results.map((result, index) => ({
                ...result,
                id: result.id || `search-${searchType}-${index}-${Date.now()}`,
                alt: result.title,
                url: result.link,  // Add url property
                src: {
                    thumbnail: result.thumbnail,
                    medium: result.link,
                    large: result.link,
                    original: result.link
                }
            }));
            
            return { ...data, results: transformedResults };
        } catch (error) {
            console.error('Search error:', error);
            throw error;
        }
    };

    const handleSearch = async () => {
        if (!searchTerm.trim()) {
            toast({ 
                title: "Missing Search Term", 
                description: "Please enter something to search for.", 
                variant: "default" 
            });
            return;
        }

        setIsLoading(true);
        setAllResults([]);
        setDisplayedResults([]);
        setTotalResults(0);
        setCurrentPage(1);

        try {
            const searchResponse = await searchWithBackend(searchTerm, activeTab, 100); // Get more results
            
            // console.log('Search response:', searchResponse); // Debug log
            
            if (!searchResponse.results || searchResponse.results.length === 0) {
                toast({ 
                    title: "No Results", 
                    description: "No results found for your search.", 
                    variant: "default" 
                });
                setAllResults([]);
                setDisplayedResults([]);
                setTotalResults(0);
            } else {
                // Store all results
                setAllResults(searchResponse.results);
                setTotalResults(searchResponse.total || searchResponse.results.length);
                
                // Display first page
                const firstPage = searchResponse.results.slice(0, ITEMS_PER_PAGE);
                setDisplayedResults(firstPage);
                
                // console.log('Client-side pagination:', {
                //     total: searchResponse.results.length,
                //     displayed: firstPage.length,
                //     hasMore: searchResponse.results.length > ITEMS_PER_PAGE
                // });
            }
        } catch (error) {
            toast({ 
                title: "Search Failed", 
                description: error instanceof Error ? error.message : "An error occurred during search.", 
                variant: "destructive" 
            });
            setAllResults([]);
            setDisplayedResults([]);
            setTotalResults(0);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLoadMore = async () => {
        if (isLoadingMore) return;

        setIsLoadingMore(true);
        
        // Simulate loading delay for better UX
        await new Promise(resolve => setTimeout(resolve, 300));

        try {
            const nextPage = currentPage + 1;
            const startIndex = (nextPage - 1) * ITEMS_PER_PAGE;
            const endIndex = startIndex + ITEMS_PER_PAGE;
            
            // Get next batch from stored results
            const nextBatch = allResults.slice(startIndex, endIndex);
            
            if (nextBatch.length > 0) {
                setDisplayedResults(prev => [...prev, ...nextBatch]);
                setCurrentPage(nextPage);
                
                // console.log('Loaded more:', {
                //     page: nextPage,
                //     added: nextBatch.length,
                //     totalDisplayed: displayedResults.length + nextBatch.length
                // });
            }
        } catch (error) {
            toast({ 
                title: "Failed to load more", 
                description: "Could not load additional results.", 
                variant: "destructive" 
            });
        } finally {
            setIsLoadingMore(false);
        }
    };

    const handleSelect = (result: SearchResult) => {
        const type = activeTab === 'videos' ? 'video' : 'image';
        onSelect(result.link, type);
    };
    
    // Check if we have more results to show
    const hasMore = displayedResults.length < allResults.length;

    return (
        <>
            <div className="flex flex-col h-full">
                {/* Tab Pills */}
                <div className="flex gap-1.5 mb-3">
                    <button
                        onClick={() => setActiveTab('images')}
                        className={cn(
                            "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all",
                            activeTab === 'images' 
                                ? "bg-primary text-primary-foreground" 
                                : "bg-muted hover:bg-muted-foreground/20"
                        )}
                    >
                        <Image className="h-3 w-3" /> Images
                    </button>
                    <button
                        onClick={() => setActiveTab('gifs')}
                        className={cn(
                            "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all",
                            activeTab === 'gifs' 
                                ? "bg-primary text-primary-foreground" 
                                : "bg-muted hover:bg-muted-foreground/20"
                        )}
                    >
                        <Sparkles className="h-3 w-3" /> GIFs
                    </button>
                    <button
                        onClick={() => setActiveTab('videos')}
                        className={cn(
                            "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all",
                            activeTab === 'videos' 
                                ? "bg-primary text-primary-foreground" 
                                : "bg-muted hover:bg-muted-foreground/20"
                        )}
                    >
                        <Video className="h-3 w-3" /> Videos
                    </button>
                </div>

                {/* Search Input */}
                <div className="flex space-x-2 mx-1 mb-3">
                    <Input 
                        type="text" 
                        placeholder={`Search ${activeTab}...`}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSearch()}
                        className="h-8 text-xs"
                        disabled={isLoading}
                    />
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleSearch} 
                        className="h-8 px-3" 
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <Search className="h-3.5 w-3.5" />
                        )}
                    </Button>
                </div>

                {/* Results Grid - Fix scrolling with proper flex container */}
                <div className="flex-1 relative overflow-hidden">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <p className="text-sm text-muted-foreground">Searching...</p>
                        </div>
                    ) : displayedResults.length > 0 ? (
                        <div className="h-full flex flex-col">
                            {/* Scrollable grid container with padding for bottom visibility */}
                            <div className="flex-1 overflow-y-auto image-picker-scroll">
                                <div className="grid grid-cols-4 gap-2 px-0.5 pb-16">
                                    {displayedResults.map((result, index) => (
                                        <motion.div
                                            key={`${result.id}-${result.link}-${index}`}
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            whileHover={{ scale: 1.05 }}
                                            onClick={() => handleSelect(result)}
                                            onMouseEnter={() => setHoveredImageId(result.id!)}
                                            onMouseLeave={() => setHoveredImageId(null)}
                                            className={cn(
                                                "relative cursor-pointer rounded-md overflow-hidden border-2 transition-all",
                                                "border-transparent hover:border-border"
                                            )}
                                            style={{ height: '85px' }}
                                        >
                                            <img
                                                src={result.src?.thumbnail || result.thumbnail || result.link}
                                                alt={result.alt || result.title}
                                                className="w-full h-full object-cover"
                                                loading="lazy"
                                                onError={(e) => {
                                                    const target = e.target as HTMLImageElement;
                                                    if (target.src !== result.link) {
                                                        target.src = result.link;
                                                    }
                                                }}
                                            />
                                            
                                            {/* Hover preview icon - Exact same as recommended */}
                                            <AnimatePresence>
                                                {hoveredImageId === result.id && (
                                                    <motion.div
                                                        initial={{ opacity: 0, scale: 0.8 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        exit={{ opacity: 0, scale: 0.8 }}
                                                        className="absolute top-1 right-1 bg-black/70 backdrop-blur-sm p-1 rounded-full cursor-pointer"
                                                        onMouseEnter={(e) => {
                                                            if (previewTimeoutRef.current) {
                                                                clearTimeout(previewTimeoutRef.current);
                                                            }
                                                            
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            const viewportHeight = window.innerHeight;
                                                            const viewportWidth = window.innerWidth;
                                                            
                                                            const previewWidth = 250;
                                                            const previewHeight = 250;
                                                            
                                                            let x = rect.right + 2;
                                                            let y = rect.top - (previewHeight / 2) + (rect.height / 2);
                                                            
                                                            if (x + previewWidth > viewportWidth - 10) {
                                                                x = rect.left - previewWidth - 2;
                                                            }
                                                            
                                                            if (y + previewHeight > viewportHeight - 10) {
                                                                y = viewportHeight - previewHeight - 10;
                                                            }
                                                            
                                                            if (y < 10) {
                                                                y = 10;
                                                            }
                                                            
                                                            setPreviewPosition({ x, y });
                                                            setPreviewImage(result);
                                                        }}
                                                        onMouseMove={(e) => {
                                                            e.stopPropagation();
                                                        }}
                                                        onMouseLeave={() => {
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
                            </div>
                            
                            {/* Load More Button */}
                            {hasMore && (
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background to-transparent pt-6 pb-2 px-2 z-10">
                                    <Button
                                        onClick={handleLoadMore}
                                        disabled={isLoadingMore}
                                        variant="outline"
                                        size="sm"
                                        className="w-full h-8 text-xs bg-background/95 hover:bg-background border-border/50"
                                    >
                                        {isLoadingMore ? (
                                            <>
                                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                                Loading...
                                            </>
                                        ) : (
                                            <>
                                                Load More 
                                                <span className="ml-1 opacity-70">
                                                    ({allResults.length - displayedResults.length} remaining)
                                                </span>
                                            </>
                                        )}
                                    </Button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full">
                            <p className="text-xs text-muted-foreground text-center">
                                Enter a search term and click search to find {activeTab}.
                            </p>
                        </div>
                    )}
                </div>
            </div>
            
            {/* Preview Popup - Exact same implementation as recommended tab */}
            {previewImage && createPortal(
                <motion.div
                    key="search-image-preview"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                    className="fixed pointer-events-none"
                    style={{
                        left: `${previewPosition.x}px`,
                        top: `${previewPosition.y}px`,
                        zIndex: 2147483647
                    }}
                >
                    <div 
                        className="relative bg-background border-2 border-border rounded-lg overflow-hidden pointer-events-auto"
                        style={{
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)'
                        }}
                        onMouseEnter={() => {
                            if (previewTimeoutRef.current) {
                                clearTimeout(previewTimeoutRef.current);
                            }
                        }}
                        onMouseLeave={() => {
                            setPreviewImage(null);
                        }}
                    >
                        <img
                            src={previewImage.src?.large || previewImage.src?.medium || previewImage.link}
                            alt={previewImage.alt || previewImage.title}
                            className="object-contain"
                            style={{
                                maxWidth: '250px',
                                maxHeight: '250px',
                                width: 'auto',
                                height: 'auto'
                            }}
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-white">
                            <p className="text-sm font-medium line-clamp-2">{previewImage.alt || previewImage.title}</p>
                            {previewImage.photographer && (
                                <p className="text-xs opacity-80">by {previewImage.photographer}</p>
                            )}
                            {previewImage.source && !previewImage.photographer && (
                                <p className="text-xs opacity-80">Source: {previewImage.source}</p>
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