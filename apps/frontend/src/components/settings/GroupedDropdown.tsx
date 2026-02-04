import React, { useState, forwardRef, useEffect, useRef, useMemo } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Button } from '../ui/button';
import { ChevronDown, Search, Check, Type } from 'lucide-react';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '@/lib/utils';

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

const GroupedDropdown = forwardRef<HTMLButtonElement, GroupedDropdownProps>(({
  value,
  options,
  groups,
  onChange,
  placeholder = 'Select a font',
  label,
  disabled = false,
}, ref) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [inputValue, setInputValue] = useState<string>(String(value ?? ''));
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const categoryScrollRef = useRef<HTMLDivElement | null>(null);

  const effectiveGroups = groups;

  // Call hook for the *selected* value unconditionally for the trigger
  const isSelectedValueLoaded = useFontLoading(value);

  // Find which group the current value belongs to
  const findGroupForValue = (candidateGroups?: Record<string, string[]>) => {
    if (!candidateGroups) return null;
    for (const [groupName, groupOptions] of Object.entries(candidateGroups)) {
      if (groupOptions.includes(value)) {
        return groupName;
      }
    }
    return null;
  };

  const currentGroup = findGroupForValue(effectiveGroups || undefined);

  // Auto-position dropdown to selected font when it opens
  useEffect(() => {
    if (open && value && effectiveGroups) {
      // Set active category to the one containing the current value
      if (currentGroup && !activeCategory) {
        setActiveCategory(currentGroup);
      }
      setTimeout(() => {
        const selectedElement = document.querySelector(`[data-font-option="${value}"]`) as HTMLElement;
        if (selectedElement) {
          const scrollContainer = selectedElement.closest('[data-radix-scroll-area-viewport]') as HTMLElement;
          if (scrollContainer) {
            const elementTop = selectedElement.offsetTop;
            const containerHeight = scrollContainer.clientHeight;
            const elementHeight = selectedElement.clientHeight;
            const centerPosition = elementTop - (containerHeight / 2) + (elementHeight / 2);
            scrollContainer.scrollTop = Math.max(0, centerPosition);
          }
        }
      }, 100);
    }
  }, [open, value, effectiveGroups]);

  // Reset active category when dropdown closes
  useEffect(() => {
    if (!open) {
      setActiveCategory(null);
      setFilter('');
      setInputValue(String(value ?? ''));
    }
  }, [open, value]);

  // Smart font loading when dropdown opens
  useEffect(() => {
    if (open && effectiveGroups) {
      (async () => {
        try {
          await FontLoadingService.preloadForDropdown?.(effectiveGroups, currentGroup || undefined);
        } catch {}
      })();

      if (value && !FontLoadingService.isFontLoaded(value)) {
        FontLoadingService.loadFont(value);
      }
    }
  }, [open, effectiveGroups, value, currentGroup]);

  // Ensure the search input retains focus while typing
  useEffect(() => {
    if (open && searchInputRef.current) {
      const input = searchInputRef.current;
      if (document.activeElement !== input) {
        setTimeout(() => input.focus(), 0);
      }
    }
  }, [open, filter]);

  const orderedCategories = useMemo(() => {
    if (!effectiveGroups) return [];
    const preferred = [
      'Featured',
      'Essentials',
      'Awwwards Picks',
      'Designer',
      'Designer Local',
      'Premium',
      'Sans-Serif',
      'Serif',
      'Elegant',
      'Bold',
      'Design',
      'Contemporary',
      'Modern',
      'Monospace',
      'Variable',
      'Unique',
      'Editorial',
      'Geometric',
      'Tech & Startup',
      'Luxury',
      'Retro',
      'Pixel & Retro Display',
      'Branding'
    ];
    return [
      ...preferred.filter(cat => effectiveGroups[cat]?.length > 0),
      ...Object.keys(effectiveGroups).filter(cat => !preferred.includes(cat) && effectiveGroups[cat]?.length > 0)
    ];
  }, [effectiveGroups]);

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
      return optLower === searchTerm ||
             optLower.startsWith(searchTerm) ||
             optLower.includes(searchTerm);
    }).sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      const searchLower = searchTerm;
      if (aLower === searchLower && bLower !== searchLower) return -1;
      if (bLower === searchLower && aLower !== searchLower) return 1;
      const aStarts = aLower.startsWith(searchLower);
      const bStarts = bLower.startsWith(searchLower);
      if (aStarts && !bStarts) return -1;
      if (bStarts && !aStarts) return 1;
      return a.localeCompare(b);
    });
  };

  // Get fonts to display based on active category
  const displayFonts = useMemo(() => {
    if (filter) {
      const allOptions = Object.values(effectiveGroups || {}).flat();
      return filterOptions(allOptions);
    }
    if (activeCategory && effectiveGroups?.[activeCategory]) {
      return effectiveGroups[activeCategory];
    }
    // Show all fonts grouped
    return null;
  }, [filter, activeCategory, effectiveGroups]);

  // Render font preview for dropdown trigger
  const renderValuePreview = () => {
    return (
      <div className="flex items-center gap-1.5 w-full min-w-0">
        <Type className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span
          className="truncate text-[13px]"
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

    useEffect(() => {
      if (!elementRef.current) return;
      const scrollViewport = elementRef.current.closest('[data-radix-scroll-area-viewport]');
      const observer = new IntersectionObserver(
        (entries) => {
          const [entry] = entries;
          if (entry.isIntersecting) {
            setIsVisible(true);
          }
        },
        {
          root: scrollViewport,
          rootMargin: '100px',
          threshold: 0
        }
      );
      observer.observe(elementRef.current);
      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      if ((isVisible || isActive) && !fontLoaded) {
        FontLoadingService.loadFont(option).then(() => {
          setFontLoaded(true);
        }).catch(() => {
          setFontLoaded(true);
        });
      }
    }, [isVisible, isActive, option, fontLoaded]);

    const handleSelect = () => {
      onChange(option);
      setInputValue(option);
      setOpen(false);
      setFilter('');
      FontLoadingService.loadFont(option).catch(() => {});
    };

    return (
      <DropdownMenuItem
        ref={elementRef}
        key={option}
        data-font-option={option}
        onSelect={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleSelect();
        }}
        className={cn(
          "flex items-center justify-between px-2.5 py-0 rounded-md cursor-pointer transition-colors",
          "hover:bg-accent/60",
          isActive && "bg-accent/40"
        )}
        style={{
          height: '36px',
          lineHeight: '36px',
          position: 'relative',
          zIndex: 1
        }}
      >
        <span
          className={cn(
            "truncate transition-opacity",
            fontLoaded ? "opacity-100" : "opacity-40"
          )}
          style={{
            fontFamily: fontLoaded ? getFontFamilyWithFallback(option) : 'system-ui, sans-serif',
            fontSize: '14px',
          }}
        >
          {option}
        </span>
        {isActive && (
          <Check className="ml-2 h-3.5 w-3.5 shrink-0 text-primary" />
        )}
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
            <ChevronDown className="ml-2 h-3.5 w-3.5 opacity-40 shrink-0" />
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

  // Grouped dropdown with category pills
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild disabled={disabled} ref={ref}>
        <Button
          variant="outline"
          className="w-full justify-between h-9 text-xs font-normal"
        >
          {renderValuePreview()}
          <ChevronDown className="ml-2 h-3.5 w-3.5 opacity-40 shrink-0" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-[300px] p-0 overflow-hidden"
        align="start"
        sideOffset={4}
      >
        {/* Search */}
        <div className="p-2 pb-1.5 border-b border-border/60">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
            <Input
              placeholder="Search fonts..."
              className="pl-8 h-8 text-xs bg-muted/30 border-0 focus-visible:ring-1 focus-visible:ring-ring/40"
              value={inputValue}
              ref={searchInputRef}
              onChange={(e) => {
                const newValue = e.target.value;
                setInputValue(newValue);
                setFilter(newValue);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (inputValue && inputValue !== value) {
                    onChange(inputValue);
                    FontLoadingService.loadFont(inputValue).catch(() => {});
                  }
                  setOpen(false);
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  setOpen(false);
                } else {
                  e.stopPropagation();
                }
              }}
            />
          </div>
        </div>

        {/* Category Pills */}
        {!filter && (
          <div className="border-b border-border/60">
            <div
              ref={categoryScrollRef}
              className="flex gap-1 px-2 py-1.5 overflow-x-auto no-scrollbar"
              style={{ scrollbarWidth: 'none' }}
            >
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className={cn(
                  "shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all",
                  !activeCategory
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                All
              </button>
              {orderedCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(activeCategory === category ? null : category)}
                  className={cn(
                    "shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all whitespace-nowrap",
                    activeCategory === category
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Font List */}
        <ScrollArea className="h-[340px]">
          <div className="p-1">
            {filter ? (
              // Search results
              displayFonts && displayFonts.length > 0 ? (
                <>
                  <div className="px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">
                    {displayFonts.length} {displayFonts.length === 1 ? 'result' : 'results'}
                  </div>
                  <div className="space-y-px">
                    {displayFonts.map(option => (
                      <LazyFontOption key={option} option={option} isActive={option === value} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="py-12 text-center">
                  <Type className="h-6 w-6 mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground/60">No fonts found</p>
                </div>
              )
            ) : activeCategory && displayFonts ? (
              // Single category view
              <div className="space-y-px">
                {displayFonts.map(option => (
                  <LazyFontOption key={option} option={option} isActive={option === value} />
                ))}
              </div>
            ) : (
              // All categories view
              orderedCategories.map((categoryName) => {
                const categoryFonts = effectiveGroups?.[categoryName] || [];
                return (
                  <div key={categoryName} className="mb-1">
                    <div
                      id={`category-${categoryName}`}
                      className="sticky top-0 z-10 bg-popover/95 backdrop-blur-sm px-2.5 py-1.5"
                    >
                      <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">
                        {categoryName}
                      </span>
                      <span className="text-[10px] text-muted-foreground/40 ml-1.5">
                        {categoryFonts.length}
                      </span>
                    </div>
                    <div className="space-y-px">
                      {categoryFonts.map((option) => (
                        <LazyFontOption key={option} option={option} isActive={option === value} />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

GroupedDropdown.displayName = "GroupedDropdown";

export default GroupedDropdown;
