import React, { useState, forwardRef, Ref, useEffect, useRef } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Button } from '../ui/button';
import { ChevronDown, Search, Check, List } from 'lucide-react';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';

import { useFontLoading } from '../../hooks/useFontLoading';
import { FontLoadingService } from '../../services/FontLoadingService';

import { getFontFamilyWithFallback } from '../../utils/fontUtils';

// Import debug utilities in development
if (process.env.NODE_ENV === 'development') {
  import('../../utils/fontLoadingDebug').then(module => {
    (window as any).FontLoadingDebug = module.FontLoadingDebug;
  });
}

interface GroupedDropdownProps {
  value: string;
  options: string[];
  groups?: Record<string, string[]>;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
}

// Define the ref type (assuming it will be attached to the Trigger Button)
type GroupedDropdownRef = Ref<HTMLButtonElement>;

const GroupedDropdown = forwardRef<HTMLButtonElement, GroupedDropdownProps>(({
  value,
  options,
  groups,
  onChange,
  placeholder = 'Select an option',
  label,
  disabled = false,
}, ref) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [inputValue, setInputValue] = useState<string>(String(value ?? ''));
  const [loadedCategories, setLoadedCategories] = useState<Set<string>>(new Set());
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  
  // Call hook for the *selected* value unconditionally for the trigger
  const isSelectedValueLoaded = useFontLoading(value); 

  // Auto-position dropdown to selected font when it opens
  useEffect(() => {
    if (open && value && groups) {
      // Small delay to ensure DOM is rendered
      setTimeout(() => {
        const selectedElement = document.querySelector(`[data-font-option="${value}"]`) as HTMLElement;
        if (selectedElement) {
          // Get the scroll container
          const scrollContainer = selectedElement.closest('[data-radix-scroll-area-viewport]') as HTMLElement;
          if (scrollContainer) {
            // Calculate position to center the selected element
            const elementTop = selectedElement.offsetTop;
            const containerHeight = scrollContainer.clientHeight;
            const elementHeight = selectedElement.clientHeight;
            const centerPosition = elementTop - (containerHeight / 2) + (elementHeight / 2);
            
            // Set scroll position instantly without animation
            scrollContainer.scrollTop = Math.max(0, centerPosition);
          }
        }
      }, 100);
    }
  }, [open, value, groups]);

  // Smart font loading when dropdown opens
  useEffect(() => {
    if (open && groups) {
      // Load system fonts and common fonts immediately
      const systemFonts = groups['System & Web Safe'] || [];
      const sansFonts = (groups['Sans-Serif'] || []).slice(0, 5); // Only first 5
      
      // Load high priority fonts immediately
      const highPriorityFonts = [...systemFonts, ...sansFonts];
      highPriorityFonts.forEach(font => {
        if (!FontLoadingService.isFontLoaded(font)) {
          FontLoadingService.loadFont(font);
        }
      });
      
      // Load other categories progressively with delay
      const categoryOrder = [
        'Awwwards Picks', 'Designer', 'PixelBuddha', 'Designer Local', 'Pixel & Retro Display', 'Premium', 'Serif', 'Monospace', 'Design', 
        'Bold', 'Elegant', 'Contemporary', 'Sans-Serif', 'Variable', 'Modern',
        'Unique'
      ];
      const orderedCategories = [
        ...categoryOrder,
        ...Object.keys(groups).filter(cat => !categoryOrder.includes(cat))
      ];
      
      orderedCategories.forEach((category, index) => {
        if (groups[category]) {
          setTimeout(() => {
            if (open) { // Only load if dropdown is still open
              loadFontsForCategory(category);
            }
          }, (index + 1) * 500); // Stagger loading by 500ms
        }
      });
    }
  }, [open, groups]);

  // Ensure the search input retains focus while typing
  useEffect(() => {
    if (open && searchInputRef.current) {
      const input = searchInputRef.current;
      if (document.activeElement !== input) {
        setTimeout(() => input.focus(), 0);
      }
    }
  }, [open, filter]);

  // Function to load fonts for a specific category
  const loadFontsForCategory = (categoryName: string) => {
    if (!groups || loadedCategories.has(categoryName)) return;
    
    const categoryFonts = groups[categoryName] || [];
    
    // Load fonts based on priority
    const priorityOrder = {
      'System & Web Safe': 1,
      'Awwwards Picks': 2,
      'Designer': 2,
      'PixelBuddha': 3,
      'Designer Local': 3,
      'Premium': 2,
      'Sans-Serif': 2,
      'Serif': 3,
      'Contemporary': 3,
      'Variable': 3,
      'Monospace': 4,
      'Design': 5,
      'Bold': 5,
      'Elegant': 5,
      'Modern': 5,
      'Script': 6,
      'Unique': 6,
      'Editorial': 4,
      'Geometric': 3,
      'Tech & Startup': 4,
      'Luxury': 5,
      'Retro': 6,
      'Branding': 4
    };
    
    const priority = priorityOrder[categoryName as keyof typeof priorityOrder] || 7;
    
    // Load fonts with requestIdleCallback for lower priority categories
    if (priority > 3 && 'requestIdleCallback' in window) {
      window.requestIdleCallback(() => {
        // Aggressively ensure the selected value is loaded first
        const ordered = [...categoryFonts].sort((a, b) => (a === value ? -1 : b === value ? 1 : 0));
        ordered.forEach(font => {
          FontLoadingService.loadFont(font);
        });
      });
    } else {
      // Load immediately for high priority categories
      const ordered = [...categoryFonts].sort((a, b) => (a === value ? -1 : b === value ? 1 : 0));
      ordered.forEach(font => FontLoadingService.loadFont(font));
    }
    
    setLoadedCategories(prev => new Set([...prev, categoryName]));
  };

  // Find which group the current value belongs to
  const findGroupForValue = () => {
    if (!groups) return null;
    
    for (const [groupName, groupOptions] of Object.entries(groups)) {
      if (groupOptions.includes(value)) {
        return groupName;
      }
    }
    return null;
  };

  const currentGroup = findGroupForValue();
  
  // Sync inputValue with external value changes
  React.useEffect(() => {
    setInputValue(String(value ?? ''));
  }, [value]);
  
  // Filter options based on search query
  const filterOptions = (opts: string[]) => {
    if (!filter) return opts;
    const searchTerm = filter.toLowerCase().trim();
    return opts.filter(opt => {
      const optLower = opt.toLowerCase();
      // Exact match gets priority, then starts with, then contains
      return optLower === searchTerm || 
             optLower.startsWith(searchTerm) || 
             optLower.includes(searchTerm);
    }).sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      const searchLower = searchTerm;
      
      // Exact match first
      if (aLower === searchLower && bLower !== searchLower) return -1;
      if (bLower === searchLower && aLower !== searchLower) return 1;
      
      // Starts with second
      const aStarts = aLower.startsWith(searchLower);
      const bStarts = bLower.startsWith(searchLower);
      if (aStarts && !bStarts) return -1;
      if (bStarts && !aStarts) return 1;
      
      // Alphabetical for same priority
      return a.localeCompare(b);
    });
  };
  
  // Render font preview for dropdown trigger
  const renderValuePreview = () => {
    // Use the state from the top-level hook call
    return (
      <div className="flex items-center w-full">
        <span 
          className="truncate" 
          style={{ fontFamily: isSelectedValueLoaded ? getFontFamilyWithFallback(value) : 'system-ui, sans-serif' }}
        >
          {value || placeholder}
        </span>
      </div>
    );
  };
  
  // Lazy font option component with intersection observer
  const LazyFontOption = ({ option, isActive }: { option: string; isActive: boolean }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [fontLoaded, setFontLoaded] = useState(FontLoadingService.isFontLoaded(option));
    const elementRef = useRef<HTMLDivElement>(null);
    
    // Intersection observer for lazy loading
    useEffect(() => {
      if (!elementRef.current) return;
      
      const observer = new IntersectionObserver(
        (entries) => {
          const [entry] = entries;
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect(); // Stop observing once visible
          }
        },
        {
          root: null,
          rootMargin: '50px', // Load 50px before becoming visible
          threshold: 0.1
        }
      );
      
      observer.observe(elementRef.current);
      
      return () => observer.disconnect();
    }, []);
    
    // Load font when visible or if it's the active option
    useEffect(() => {
      if ((isVisible || isActive) && !fontLoaded) {
        FontLoadingService.loadFont(option).then(() => {
          setFontLoaded(true);
        });
      }
    }, [isVisible, isActive, option, fontLoaded]);

    const handleSelect = () => {
      // Ensure font is loaded before selecting
      FontLoadingService.loadFont(option).finally(() => {
        onChange(option);       
        setInputValue(option); 
        setOpen(false);         
        setFilter('');           
      });
    };
    
    return (
      <DropdownMenuItem
        ref={elementRef}
        key={option}
        data-font-option={option}
        onSelect={(e) => { 
          e.preventDefault(); 
          handleSelect(); 
        }}
        style={{ 
          fontFamily: fontLoaded ? getFontFamilyWithFallback(option) : 'system-ui, sans-serif',
          minHeight: '32px' // Prevent layout shift
        }} 
        className="text-xs h-8 flex items-center justify-between pr-2"
      >
         <span className="truncate">{option}</span>
         {isActive && <Check className="ml-2 h-3 w-3 shrink-0" />}
      </DropdownMenuItem>
    );
  };

  // If no groups provided, just render a simple dropdown
  if (!groups) {
    return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild disabled={disabled} ref={ref}>
          <Button 
            variant="outline" 
            className="w-full justify-between h-9 text-xs font-normal"
          >
            {renderValuePreview()}
            <ChevronDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[--radix-popover-trigger-width]">
           <ScrollArea className="h-[240px]">
              <div className="p-1">
                {options.map((option) => (
                  <LazyFontOption key={option} option={option} isActive={option === value} />
                ))}
              </div>
            </ScrollArea>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // For grouped dropdown with tabs
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild disabled={disabled} ref={ref}>
        <Button 
          variant="outline" 
          className="w-full justify-between h-9 text-xs font-normal"
        >
          {renderValuePreview()}
          <ChevronDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent 
        className="w-[280px] p-0"
        align="start"
        sideOffset={4}
      >
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search or enter font name..."
              className="pl-7 h-8 text-xs"
              value={inputValue}
              ref={searchInputRef}
              onChange={(e) => {
                const newValue = e.target.value;
                setInputValue(newValue);
                setFilter(newValue);
              }}
              onBlur={() => {
                // Do not change selection on blur to avoid cursor jumps while searching
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  // Explicit selection by enter: load and apply
                  if (inputValue && inputValue !== value) {
                    FontLoadingService.loadFont(inputValue).finally(() => {
                      onChange(inputValue);
                    });
                  }
                  setOpen(false);
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  setOpen(false);
                } else {
                  // Prevent Radix typeahead from stealing focus
                  e.stopPropagation();
                }
              }}
            />
          </div>
        </div>
        
        {filter ? (
          <ScrollArea className="h-[320px]">
            <div className="p-2">
              {(() => {
                const allOptions = Object.values(groups).flat();
                const filtered = filterOptions(allOptions);
                if (filtered.length === 0) {
                  return (
                    <div className="py-10 text-center text-xs text-muted-foreground">
                      No fonts match your search
                    </div>
                  );
                }
                return (
                  <>
                    <div className="text-xs text-muted-foreground mb-2 px-2">
                      Found {filtered.length} {filtered.length === 1 ? 'match' : 'matches'}
                    </div>
                    <div className="space-y-0.5">
                      {filtered.map(option => (
                        <LazyFontOption key={option} option={option} isActive={option === value} />
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          </ScrollArea>
        ) : (
          <div className="w-full">
            {/* Category Jump Dropdown */}
            <div className="p-2 border-b bg-muted/20">
              <DropdownMenu open={categoryDropdownOpen} onOpenChange={setCategoryDropdownOpen}>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="w-full h-8 px-2 text-xs justify-between font-normal"
                  >
                    <div className="flex items-center gap-2">
                      <List className="h-3 w-3" />
                      <span>Jump to category...</span>
                    </div>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[260px] max-h-[200px] overflow-y-auto">
                  {(() => {
                    const categoryOrder = [
                      'Awwwards Picks', 'Designer', 'PixelBuddha', 'Designer Local', 'Pixel & Retro Display', 'System & Web Safe', 'Premium', 'Sans-Serif',
                      'Serif', 'Monospace', 'Design', 
                      'Bold', 'Script', 'Elegant', 'Modern',
                      'Contemporary', 'Variable', 'Unique',
                      'Editorial', 'Geometric', 'Tech & Startup',
                      'Luxury', 'Retro', 'Branding'
                    ];
                    const orderedCategories = [
                      ...categoryOrder,
                      ...Object.keys(groups).filter(cat => !categoryOrder.includes(cat))
                    ];
                    
                    return orderedCategories
                      .filter(cat => groups[cat] && groups[cat].length > 0)
                      .map(category => (
                        <DropdownMenuItem
                          key={category}
                          onSelect={(e) => {
                            e.preventDefault();
                            const element = document.getElementById(`category-${category}`);
                            if (element) {
                              // Prefer native scrollIntoView to align to top of viewport
                              try {
                                element.scrollIntoView({ block: 'start', inline: 'nearest' });
                              } catch {}
                              // Ensure in case of nested Radix viewport we align correctly
                              const viewport = element.closest('[data-radix-scroll-area-viewport]') as HTMLElement | null;
                              if (viewport) {
                                const rect = element.getBoundingClientRect();
                                const vrect = viewport.getBoundingClientRect();
                                const delta = rect.top - vrect.top;
                                if (Math.abs(delta) > 2) {
                                  viewport.scrollTop = viewport.scrollTop + delta;
                                }
                              }
                            }
                            // Close the dropdown after selection
                            setCategoryDropdownOpen(false);
                          }}
                          className="text-xs cursor-pointer"
                        >
                          <div className="flex items-center justify-between w-full">
                            <span>{category}</span>
                            <span className="text-muted-foreground">({groups[category].length})</span>
                          </div>
                        </DropdownMenuItem>
                      ));
                  })()}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            
            {/* Long Scrollable Font List */}
            <ScrollArea className="h-[320px]">
              <div className="p-1">
                {(() => {
                  const categoryOrder = [
                    'Awwwards Picks', 'Designer', 'PixelBuddha', 'Designer Local', 'Pixel & Retro Display', 'System & Web Safe', 'Premium', 'Sans-Serif',
                    'Serif', 'Monospace', 'Design', 
                    'Bold', 'Script', 'Elegant', 'Modern',
                    'Contemporary', 'Variable', 'Unique',
                    'Editorial', 'Geometric', 'Tech & Startup',
                    'Luxury', 'Retro', 'Branding'
                  ];
                  const orderedCategories = [
                    ...categoryOrder,
                    ...Object.keys(groups).filter(cat => !categoryOrder.includes(cat))
                  ];
                  
                  return orderedCategories
                    .filter(cat => groups[cat] && groups[cat].length > 0)
                    .map((categoryName, categoryIndex) => {
                      const categoryFonts = groups[categoryName] || [];
                      
                      return (
                        <div key={categoryName} className="mb-4">
                          {/* Category Header */}
                          <div 
                            id={`category-${categoryName}`}
                            className="sticky top-0 bg-background px-2 py-1.5 mb-1 text-xs font-medium text-muted-foreground border-b border-border shadow-sm z-10"
                          >
                            {categoryName} ({categoryFonts.length})
                          </div>
                          
                          {/* Category Fonts */}
                          <div className="space-y-0.5 pl-1">
                            {categoryFonts.map((option) => (
                              <LazyFontOption key={option} option={option} isActive={option === value} />
                            ))}
                          </div>
                        </div>
                      );
                    });
                })()}
              </div>
            </ScrollArea>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

// Add display name for better debugging
GroupedDropdown.displayName = "GroupedDropdown";

export default GroupedDropdown;