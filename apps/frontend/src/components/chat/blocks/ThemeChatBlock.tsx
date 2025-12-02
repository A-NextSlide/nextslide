/**
 * ThemeChatBlock
 * Rich, editable theme preview for chat - matches OutlineDisplayView quality
 * Features: Full-width color bars, font dropdowns, logo upload, loading state
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Image, X, ChevronDown, Palette, Sparkles, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import EnhancedColorPicker from '@/components/EnhancedColorPicker';
import ChatBlockContainer from './ChatBlockContainer';
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

// Build font groups from FontLoadingService or fallback to categories
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
      'Sans Serif': ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins'],
      'Serif': ['Playfair Display', 'Merriweather', 'Lora', 'Crimson Text'],
      'Display': ['Oswald', 'Bebas Neue', 'Anton', 'Archivo Black'],
      'Rounded': ['Nunito', 'Fredoka', 'Quicksand', 'Comfortaa'],
    };
  }
};

const ThemeChatBlock: React.FC<ThemeChatBlockProps> = ({
  data,
  onColorChange,
  onFontChange,
  onLogoChange,
  onBrandNameChange,
  isEditable = true,
  isLoading = false,
  className,
}) => {
  const [activeColor, setActiveColor] = useState<'background' | 'text' | 'accent' | null>(null);
  const [isEditingBrandName, setIsEditingBrandName] = useState(false);
  const [showHeadingFonts, setShowHeadingFonts] = useState(false);
  const [showBodyFonts, setShowBodyFonts] = useState(false);
  const [fontGroups, setFontGroups] = useState<Record<string, string[]>>(getFontGroups);
  const [loadingFont, setLoadingFont] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync designer fonts on mount
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

  const colorBars = [
    { key: 'background' as const, label: 'BG', color: data.colors.background },
    { key: 'accent' as const, label: 'ACCENT', color: data.colors.accent },
    { key: 'text' as const, label: 'TEXT', color: data.colors.text },
  ];

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
      if ('fonts' in document) {
        await document.fonts.load(`bold 24px "${font}"`).catch(() => {});
      }
    } catch {}
    setLoadingFont(null);
    onFontChange?.(type, font);
    if (type === 'heading') setShowHeadingFonts(false);
    else setShowBodyFonts(false);
  };

  // Render font dropdown
  const renderFontDropdown = (type: 'heading' | 'body', currentFont: string) => (
    <PopoverContent className="w-56 p-2 max-h-[280px] overflow-y-auto" align="start">
      <div className="space-y-3">
        {Object.entries(fontGroups).map(([category, fonts]) => (
          <div key={category}>
            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 px-1">
              {category}
            </div>
            <div className="space-y-0.5">
              {fonts.slice(0, 6).map(font => (
                <button
                  key={font}
                  className={cn(
                    "w-full text-left px-2 py-1.5 text-sm rounded transition-colors flex items-center justify-between",
                    "hover:bg-zinc-100 dark:hover:bg-zinc-800",
                    currentFont === font && "bg-orange-100 dark:bg-orange-900/30 text-orange-600"
                  )}
                  style={{ fontFamily: font }}
                  onClick={() => handleFontSelect(type, font)}
                  disabled={loadingFont === font}
                >
                  <span>{font}</span>
                  {loadingFont === font && <Loader2 className="w-3 h-3 animate-spin" />}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </PopoverContent>
  );

  // Loading state
  if (isLoading) {
    return (
      <ChatBlockContainer className={cn("w-full max-w-[360px]", className)}>
        <div className="p-6 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20">
          <div className="relative">
            <Palette className="w-10 h-10 text-orange-500 animate-pulse" />
            <Sparkles className="w-5 h-5 text-orange-400 absolute -top-1 -right-1 animate-bounce" />
          </div>
          <div className="text-sm font-medium text-orange-600 dark:text-orange-400">Generating theme...</div>
          <div className="text-xs text-zinc-500">Finding the perfect colors and fonts</div>
        </div>
        {/* Placeholder color bars while loading */}
        <div className="flex h-10">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="flex-1 animate-pulse"
              style={{ backgroundColor: ['#f5f5f5', '#e0e0e0', '#d0d0d0'][i] }}
            />
          ))}
        </div>
      </ChatBlockContainer>
    );
  }

  return (
    <ChatBlockContainer className={cn("w-full max-w-[360px] overflow-hidden", className)}>
      {/* Theme preview area */}
      <div
        className="p-4"
        style={{ backgroundColor: data.colors.background }}
      >
        <div className="flex items-start gap-3">
          {/* Logo */}
          <div className="relative group flex-shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
            />
            <div
              className={cn(
                "w-12 h-12 rounded-lg flex items-center justify-center overflow-hidden",
                "border-2 transition-all shadow-sm",
                data.logo
                  ? "border-transparent bg-white/90"
                  : "border-dashed",
                isEditable && "cursor-pointer hover:border-orange-400 hover:scale-105"
              )}
              style={{
                borderColor: data.logo ? 'transparent' : `${data.colors.text}30`,
                backgroundColor: data.logo ? 'rgba(255,255,255,0.95)' : `${data.colors.text}05`
              }}
              onClick={() => isEditable && fileInputRef.current?.click()}
            >
              {data.logo ? (
                <img src={data.logo} alt="Logo" className="w-full h-full object-contain p-1" />
              ) : (
                <Image className="w-5 h-5" style={{ color: `${data.colors.text}40` }} />
              )}
            </div>
            {data.logo && isEditable && (
              <button
                onClick={(e) => { e.stopPropagation(); onLogoChange?.(null); }}
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>

          {/* Title and fonts */}
          <div className="flex-1 min-w-0">
            {isEditingBrandName && isEditable ? (
              <input
                autoFocus
                className="text-base font-bold bg-white/90 dark:bg-black/50 border border-orange-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-orange-400 w-full"
                style={{ color: data.colors.text, fontFamily: data.fonts.heading }}
                value={data.brandName || ''}
                onChange={(e) => onBrandNameChange?.(e.target.value)}
                onBlur={() => setIsEditingBrandName(false)}
                onKeyDown={(e) => e.key === 'Enter' && setIsEditingBrandName(false)}
                placeholder="Theme name"
              />
            ) : (
              <h3
                className={cn(
                  "text-base font-bold truncate leading-tight",
                  isEditable && "cursor-pointer hover:opacity-70"
                )}
                style={{ color: data.colors.text, fontFamily: data.fonts.heading }}
                onClick={() => isEditable && setIsEditingBrandName(true)}
              >
                {data.brandName || 'Your Theme'}
              </h3>
            )}

            {/* Font selectors inline */}
            <div className="flex items-center gap-2 mt-1.5">
              <Popover open={showHeadingFonts} onOpenChange={setShowHeadingFonts}>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      "text-[11px] flex items-center gap-0.5 px-1.5 py-0.5 rounded transition-colors",
                      isEditable && "hover:bg-black/5 cursor-pointer"
                    )}
                    style={{ color: data.colors.text, fontFamily: data.fonts.heading }}
                    disabled={!isEditable}
                  >
                    <span className="truncate max-w-[70px]">{data.fonts.heading}</span>
                    {isEditable && <ChevronDown className="w-3 h-3 opacity-50" />}
                  </button>
                </PopoverTrigger>
                {isEditable && renderFontDropdown('heading', data.fonts.heading)}
              </Popover>

              <span style={{ color: `${data.colors.text}30` }}>·</span>

              <Popover open={showBodyFonts} onOpenChange={setShowBodyFonts}>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      "text-[11px] flex items-center gap-0.5 px-1.5 py-0.5 rounded transition-colors",
                      isEditable && "hover:bg-black/5 cursor-pointer"
                    )}
                    style={{ color: data.colors.text, fontFamily: data.fonts.body }}
                    disabled={!isEditable}
                  >
                    <span className="truncate max-w-[70px]">{data.fonts.body}</span>
                    {isEditable && <ChevronDown className="w-3 h-3 opacity-50" />}
                  </button>
                </PopoverTrigger>
                {isEditable && renderFontDropdown('body', data.fonts.body)}
              </Popover>
            </div>
          </div>
        </div>
      </div>

      {/* Full-width color bars - like OutlineDisplayView */}
      <div className="flex h-10">
        {colorBars.map((bar, idx) => (
          <Popover
            key={bar.key}
            open={activeColor === bar.key}
            onOpenChange={(open) => setActiveColor(open ? bar.key : null)}
          >
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "flex-1 flex items-center justify-center transition-all group relative",
                  idx < colorBars.length - 1 && "border-r border-white/30",
                  isEditable && "hover:brightness-110 cursor-pointer",
                  !isEditable && "cursor-default"
                )}
                style={{ backgroundColor: bar.color }}
                disabled={!isEditable}
              >
                <span
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-wider",
                    "opacity-80 group-hover:opacity-100 transition-opacity"
                  )}
                  style={{
                    color: bar.key === 'background' ? data.colors.text : '#fff',
                    textShadow: bar.key !== 'background' ? '0 1px 2px rgba(0,0,0,0.4)' : undefined
                  }}
                >
                  {bar.label}
                </span>
              </button>
            </PopoverTrigger>
            {isEditable && (
              <PopoverContent className="w-auto p-2" side="top" align="center">
                <EnhancedColorPicker
                  color={bar.color}
                  onChange={(hex) => onColorChange?.(bar.key, hex)}
                  onChangeComplete={() => setActiveColor(null)}
                />
              </PopoverContent>
            )}
          </Popover>
        ))}
      </div>
    </ChatBlockContainer>
  );
};

export default ThemeChatBlock;
