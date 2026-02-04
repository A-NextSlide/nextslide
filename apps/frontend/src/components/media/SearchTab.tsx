import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { API_CONFIG } from '@/config/environment';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { createPortal } from 'react-dom';

interface SearchTabProps {
    onSelect: (url: string, type: 'image' | 'video' | 'icon' | 'other') => void;
    onLoadMore?: (query: string) => Promise<any[]>;  // Add onLoadMore prop
    defaultSearchTerm?: string; // Auto-fill search with this term
    autoSearchToken?: string | number; // Triggers one-time auto search per picker open
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

export const SearchTab: React.FC<SearchTabProps> = ({ onSelect, onLoadMore, defaultSearchTerm, autoSearchToken }) => {
    const [searchTerm, setSearchTerm] = useState(defaultSearchTerm || '');
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [allResults, setAllResults] = useState<SearchResult[]>([]);
    const [displayedResults, setDisplayedResults] = useState<SearchResult[]>([]);
    const [totalResults, setTotalResults] = useState(0);
    const [hoveredImageId, setHoveredImageId] = useState<string | null>(null);
    const [previewImage, setPreviewImage] = useState<SearchResult | null>(null);
    const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
    const previewTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const { toast } = useToast();

    const ITEMS_PER_PAGE = 20;

    // Auto-run search exactly once per picker open using token
    const lastTokenRef = React.useRef<string | number | null>(null);
    React.useEffect(() => {
        if (!defaultSearchTerm) return;
        if (autoSearchToken == null) return;
        if (lastTokenRef.current === autoSearchToken) return; // already ran for this open
        lastTokenRef.current = autoSearchToken;
        setSearchTerm(defaultSearchTerm);
        // Run search after state update - use the defaultSearchTerm directly
        const runSearch = async () => {
            setIsLoading(true);
            setAllResults([]);
            setDisplayedResults([]);
            setTotalResults(0);
            setCurrentPage(1);
            try {
                const searchResponse = await searchWithBackend(defaultSearchTerm, 'images', 100);
                if (searchResponse.results && searchResponse.results.length > 0) {
                    setAllResults(searchResponse.results);
                    setTotalResults(searchResponse.total || searchResponse.results.length);
                    setDisplayedResults(searchResponse.results.slice(0, ITEMS_PER_PAGE));
                }
            } catch (error) {
                console.error('Auto-search error:', error);
            } finally {
                setIsLoading(false);
            }
        };
        const t = setTimeout(runSearch, 50);
        return () => clearTimeout(t);
    }, [autoSearchToken, defaultSearchTerm]);

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
            const searchResponse = await searchWithBackend(searchTerm, 'images', 100);
            
            console.log('[SearchTab] Search response:', searchResponse); // Debug log
            console.log('[SearchTab] Results count:', searchResponse.results?.length);
            console.log('[SearchTab] First result:', searchResponse.results?.[0]);
            
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
                console.log('[SearchTab] Setting displayedResults to:', firstPage.length, 'items');
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

    const handleSelect = async (result: SearchResult) => {
        // Proxy through our backend to avoid broken external links
        try {
            toast({
                title: "Processing image...",
                description: "Uploading to our servers for reliability",
            });

            const response = await fetch(`${API_CONFIG.BASE_URL}/media/proxy`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: result.link })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.url) {
                    onSelect(data.url, 'image');
                    return;
                }
            }

            console.warn('Image proxy failed, using original URL');
            onSelect(result.link, 'image');
        } catch (error) {
            console.error('Error proxying image:', error);
            onSelect(result.link, 'image');
        }
    };
    
    // Check if we have more results to show
    const hasMore = displayedResults.length < allResults.length;

    return (
        <>
            <div className="flex flex-col h-full">
                {/* Results Grid */}
                <div className="flex-1 relative overflow-hidden">
                    {isLoading && displayedResults.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-2">
                            <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                            <p className="text-xs text-muted-foreground">Searching...</p>
                        </div>
                    ) : displayedResults.length > 0 ? (
                        <div className="h-full flex flex-col">
                            <div className="flex-1 overflow-y-auto image-picker-scroll">
                                <div className="grid grid-cols-4 gap-1.5 pb-14">
                                    {displayedResults.map((result, index) => (
                                        <motion.div
                                            key={`${result.id}-${result.link}-${index}`}
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.3) }}
                                            whileHover={{ scale: 1.04 }}
                                            onClick={() => handleSelect(result)}
                                            onMouseEnter={() => setHoveredImageId(result.id!)}
                                            onMouseLeave={() => setHoveredImageId(null)}
                                            className="relative cursor-pointer rounded overflow-hidden border border-transparent hover:border-primary/40 transition-colors"
                                            style={{ height: '80px' }}
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

                                            {/* Hover preview icon */}
                                            <AnimatePresence>
                                                {hoveredImageId === result.id && (
                                                    <motion.div
                                                        initial={{ opacity: 0, scale: 0.8 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        exit={{ opacity: 0, scale: 0.8 }}
                                                        className="absolute top-1 right-1 bg-black/60 backdrop-blur-sm p-1 rounded-full cursor-pointer"
                                                        onMouseEnter={(e) => {
                                                            if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);

                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            const viewportHeight = window.innerHeight;
                                                            const viewportWidth = window.innerWidth;
                                                            const previewWidth = 250;
                                                            const previewHeight = 250;

                                                            let x = rect.right + 2;
                                                            let y = rect.top - (previewHeight / 2) + (rect.height / 2);

                                                            if (x + previewWidth > viewportWidth - 10) x = rect.left - previewWidth - 2;
                                                            if (y + previewHeight > viewportHeight - 10) y = viewportHeight - previewHeight - 10;
                                                            if (y < 10) y = 10;

                                                            setPreviewPosition({ x, y });
                                                            setPreviewImage(result);
                                                        }}
                                                        onMouseMove={(e) => e.stopPropagation()}
                                                        onMouseLeave={() => {
                                                            setPreviewImage(null);
                                                            if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
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

                            {/* Load More */}
                            {hasMore && (
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background to-transparent pt-6 pb-1.5 px-1 z-10">
                                    <Button
                                        onClick={handleLoadMore}
                                        disabled={isLoadingMore}
                                        variant="outline"
                                        size="sm"
                                        className="w-full h-7 text-xs bg-background/95 hover:bg-background border-border/50"
                                    >
                                        {isLoadingMore ? (
                                            <>
                                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                                Loading...
                                            </>
                                        ) : (
                                            <>
                                                Load More
                                                <span className="ml-1 opacity-60">
                                                    ({allResults.length - displayedResults.length})
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
                                Search for images to add to your slide.
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