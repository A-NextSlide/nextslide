/**
 * ThemeChatBlock
 * Clean theme card with logo, 3 color bars, and font selectors
 */

import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Image, X, Loader2, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import EnhancedColorPicker from '@/components/EnhancedColorPicker';
import { FontLoadingService } from '@/services/FontLoadingService';
import { FONT_CATEGORIES } from '@/registry/library/fonts';

export interface ThemeBlockData {
  colors: {
    background: string;
    text: string;
    accent: string;
    accent2?: string;
  };
  fonts: {
    heading: string;
    body: string;
  };
  logo?: string;
  brandName?: string;
}

interface ThemeChatBlockProps {
  data: ThemeBlockData;
  onColorChange?: (key: 'background' | 'text' | 'accent', hex: string) => void;
  onFontChange?: (type: 'heading' | 'body', font: string) => void;
  onLogoChange?: (url: string | null) => void;
  onBrandNameChange?: (name: string) => void;
  isEditable?: boolean;
  isLoading?: boolean;
  className?: string;
}

// Build font groups
const getFontGroups = (): Record<string, string[]> => {
  try {
    if (FontLoadingService?.getDedupedFontGroups) {
      return FontLoadingService.getDedupedFontGroups();
    }
    const groups: Record<string, string[]> = {};
    for (const [category, fonts] of Object.entries(FONT_CATEGORIES)) {
      if (Array.isArray(fonts)) {
        groups[category] = fonts.map((font: any) => font.name);
      }
    }
    return groups;
  } catch {
    return {
      'Sans Serif': ['Inter', 'Roboto', 'Open Sans', 'Poppins', 'Montserrat'],
      'Serif': ['Playfair Display', 'Merriweather', 'Lora'],
      'Display': ['Oswald', 'Bebas Neue', 'Anton'],
    };
  }
};

const ThemeChatBlock: React.FC<ThemeChatBlockProps> = ({
  data,
  onColorChange,
  onFontChange,
  onLogoChange,
  isEditable = true,
  isLoading = false,
  className,
}) => {
  const [activeColor, setActiveColor] = useState<'background' | 'text' | 'accent' | null>(null);
  const [showHeadingFonts, setShowHeadingFonts] = useState(false);
  const [showBodyFonts, setShowBodyFonts] = useState(false);
  const [fontGroups, setFontGroups] = useState<Record<string, string[]>>(getFontGroups);
  const [loadingFont, setLoadingFont] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync fonts on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await FontLoadingService.syncDesignerFonts?.();
        if (!cancelled) {
          setFontGroups(getFontGroups());
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Load current fonts
  useEffect(() => {
    if (!data.fonts.heading && !data.fonts.body) return;
    (async () => {
      try {
        if (data.fonts.heading) {
          await FontLoadingService.loadFont(data.fonts.heading);
        }
        if (data.fonts.body && data.fonts.body !== data.fonts.heading) {
          await FontLoadingService.loadFont(data.fonts.body);
        }
      } catch {}
    })();
  }, [data.fonts.heading, data.fonts.body]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        onLogoChange?.(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFontSelect = async (type: 'heading' | 'body', font: string) => {
    setLoadingFont(font);
    try {
      await FontLoadingService.loadFont(font);
    } catch {}
    setLoadingFont(null);
    onFontChange?.(type, font);
    if (type === 'heading') setShowHeadingFonts(false);
    else setShowBodyFonts(false);
  };

  // Determine text color for labels based on background brightness
  const getLabelColor = (bgColor: string) => {
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)';
  };

  // Font dropdown content
  const renderFontDropdown = (type: 'heading' | 'body', currentFont: string) => (
    <PopoverContent className="w-48 p-1.5 max-h-[240px] overflow-y-auto" align="start">
      {Object.entries(fontGroups).map(([category, fonts]) => (
        <div key={category} className="mb-2 last:mb-0">
          <div className="text-[9px] font-medium text-zinc-400 uppercase tracking-wider px-2 py-1">
            {category}
          </div>
          {fonts.slice(0, 5).map(font => (
            <button
              key={font}
              className={cn(
                "w-full text-left px-2 py-1.5 text-xs rounded transition-colors flex items-center justify-between",
                "hover:bg-zinc-100 dark:hover:bg-zinc-800",
                currentFont === font && "bg-zinc-100 dark:bg-zinc-800"
              )}
              style={{ fontFamily: font }}
              onClick={() => handleFontSelect(type, font)}
              disabled={loadingFont === font}
            >
              <span className="truncate">{font}</span>
              {loadingFont === font && <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />}
            </button>
          ))}
        </div>
      ))}
    </PopoverContent>
  );

  // Loading state
  if (isLoading) {
    return (
      <div className={cn(
        "w-full max-w-[320px] rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900",
        className
      )}>
        <div className="h-20 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
          <span className="text-xs text-zinc-500">Loading theme...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "w-full max-w-[320px] rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900",
      className
    )}>
      {/* Color bars with logo */}
      <div className="flex h-12">
        {/* Logo section */}
        <div className="relative group flex-shrink-0 w-12 flex flex-col border-r border-zinc-200 dark:border-zinc-800">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleLogoUpload}
            className="hidden"
          />
          <div
            className={cn(
              "flex-1 flex items-center justify-center bg-white dark:bg-zinc-900",
              isEditable && "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800"
            )}
            onClick={() => isEditable && fileInputRef.current?.click()}
          >
            {data.logo ? (
              <img src={data.logo} alt="Logo" className="w-7 h-7 object-contain" />
            ) : (
              <Image className="w-4 h-4 text-zinc-300 dark:text-zinc-600" />
            )}
          </div>
          {data.logo && isEditable && (
            <button
              onClick={(e) => { e.stopPropagation(); onLogoChange?.(null); }}
              className="absolute top-0.5 right-0.5 w-4 h-4 bg-zinc-800/80 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>

        {/* Background color bar */}
        <Popover
          open={activeColor === 'background'}
          onOpenChange={(open) => setActiveColor(open ? 'background' : null)}
        >
          <PopoverTrigger asChild>
            <button
              className={cn(
                "flex-1 flex flex-col transition-all",
                isEditable && "hover:opacity-90 cursor-pointer"
              )}
              disabled={!isEditable}
            >
              <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: data.colors.background }}>
                <span
                  className="text-[8px] font-medium uppercase tracking-wide"
                  style={{ color: getLabelColor(data.colors.background) }}
                >
                  BG
                </span>
              </div>
            </button>
          </PopoverTrigger>
          {isEditable && (
            <PopoverContent className="w-auto p-2" side="bottom" align="center">
              <EnhancedColorPicker
                color={data.colors.background}
                onChange={(hex) => onColorChange?.('background', hex)}
                onChangeComplete={() => setActiveColor(null)}
              />
            </PopoverContent>
          )}
        </Popover>

        {/* Accent color bar */}
        <Popover
          open={activeColor === 'accent'}
          onOpenChange={(open) => setActiveColor(open ? 'accent' : null)}
        >
          <PopoverTrigger asChild>
            <button
              className={cn(
                "flex-1 flex flex-col transition-all",
                isEditable && "hover:opacity-90 cursor-pointer"
              )}
              disabled={!isEditable}
            >
              <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: data.colors.accent }}>
                <span
                  className="text-[8px] font-medium uppercase tracking-wide"
                  style={{ color: getLabelColor(data.colors.accent) }}
                >
                  Accent
                </span>
              </div>
            </button>
          </PopoverTrigger>
          {isEditable && (
            <PopoverContent className="w-auto p-2" side="bottom" align="center">
              <EnhancedColorPicker
                color={data.colors.accent}
                onChange={(hex) => onColorChange?.('accent', hex)}
                onChangeComplete={() => setActiveColor(null)}
              />
            </PopoverContent>
          )}
        </Popover>

        {/* Text color bar */}
        <Popover
          open={activeColor === 'text'}
          onOpenChange={(open) => setActiveColor(open ? 'text' : null)}
        >
          <PopoverTrigger asChild>
            <button
              className={cn(
                "flex-1 flex flex-col transition-all",
                isEditable && "hover:opacity-90 cursor-pointer"
              )}
              disabled={!isEditable}
            >
              <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: data.colors.text }}>
                <span
                  className="text-[8px] font-medium uppercase tracking-wide"
                  style={{ color: getLabelColor(data.colors.text) }}
                >
                  Text
                </span>
              </div>
            </button>
          </PopoverTrigger>
          {isEditable && (
            <PopoverContent className="w-auto p-2" side="bottom" align="center">
              <EnhancedColorPicker
                color={data.colors.text}
                onChange={(hex) => onColorChange?.('text', hex)}
                onChangeComplete={() => setActiveColor(null)}
              />
            </PopoverContent>
          )}
        </Popover>
      </div>

      {/* Font selectors row */}
      <div className="flex border-t border-zinc-200 dark:border-zinc-800">
        {/* Heading font */}
        <Popover open={showHeadingFonts} onOpenChange={setShowHeadingFonts}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "flex-1 flex items-center justify-between px-2 py-1.5 border-r border-zinc-200 dark:border-zinc-800",
                isEditable && "hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
              )}
              disabled={!isEditable}
            >
              <div className="flex flex-col items-start min-w-0">
                <span className="text-[8px] text-zinc-400 uppercase tracking-wide">Heading</span>
                <span
                  className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 truncate max-w-[100px]"
                  style={{ fontFamily: data.fonts.heading }}
                >
                  {data.fonts.heading}
                </span>
              </div>
              {isEditable && <ChevronDown className="w-3 h-3 text-zinc-400 flex-shrink-0" />}
            </button>
          </PopoverTrigger>
          {isEditable && renderFontDropdown('heading', data.fonts.heading)}
        </Popover>

        {/* Body font */}
        <Popover open={showBodyFonts} onOpenChange={setShowBodyFonts}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "flex-1 flex items-center justify-between px-2 py-1.5",
                isEditable && "hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
              )}
              disabled={!isEditable}
            >
              <div className="flex flex-col items-start min-w-0">
                <span className="text-[8px] text-zinc-400 uppercase tracking-wide">Body</span>
                <span
                  className="text-[11px] text-zinc-700 dark:text-zinc-300 truncate max-w-[100px]"
                  style={{ fontFamily: data.fonts.body }}
                >
                  {data.fonts.body}
                </span>
              </div>
              {isEditable && <ChevronDown className="w-3 h-3 text-zinc-400 flex-shrink-0" />}
            </button>
          </PopoverTrigger>
          {isEditable && renderFontDropdown('body', data.fonts.body)}
        </Popover>
      </div>
    </div>
  );
};

export default ThemeChatBlock;
