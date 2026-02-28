/**
 * ThemeChatBlock
 * Clean theme card with logo, 3 color bars, and font selectors
 */

import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Image, X, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import EnhancedColorPicker from '@/components/EnhancedColorPicker';
import { FontLoadingService } from '@/services/FontLoadingService';
import { useFontCatalog } from '@/hooks/useFontCatalog';
import LazyFontItem from '@/components/LazyFontItem';

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
  loadingLabel?: string;
  className?: string;
  hideHeader?: boolean;
}

// Helper to normalize color values (handle arrays from backend)
const normalizeColor = (color: string | string[] | undefined, fallback = '#000000'): string => {
  if (!color) return fallback;
  if (Array.isArray(color)) return color[0] || fallback;
  return typeof color === 'string' ? color : fallback;
};

const ThemeChatBlock: React.FC<ThemeChatBlockProps> = ({
  data: rawData,
  onColorChange,
  onFontChange,
  onLogoChange,
  isEditable = true,
  isLoading = false,
  loadingLabel,
  className,
  hideHeader = false,
}) => {
  // Normalize color data in case backend sends arrays
  const data = {
    ...rawData,
    colors: {
      background: normalizeColor(rawData.colors?.background, '#FFFFFF'),
      text: normalizeColor(rawData.colors?.text, '#000000'),
      accent: normalizeColor(rawData.colors?.accent, '#6366f1'),
      accent2: rawData.colors?.accent2 ? normalizeColor(rawData.colors.accent2) : undefined,
    },
  };

  const [activeColor, setActiveColor] = useState<'background' | 'text' | 'accent' | null>(null);
  const [activeFontType, setActiveFontType] = useState<'heading' | 'body' | null>(null);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const { groups: fontGroups } = useFontCatalog();
  const [loadingFont, setLoadingFont] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    setLogoLoadFailed(false);
  }, [data.logo]);

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
    setActiveFontType(null);
  };

  // Determine text color for labels based on background brightness
  const getLabelColor = (bgColor: string | string[]) => {
    const color = Array.isArray(bgColor) ? bgColor[0] : bgColor;
    if (!color || typeof color !== 'string') return 'rgba(0,0,0,0.7)';
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)';
  };

  const toggleColorPicker = (colorKey: 'background' | 'text' | 'accent') => {
    if (!isEditable) return;
    setActiveColor(prev => prev === colorKey ? null : colorKey);
    setActiveFontType(null);
  };

  const toggleFontPicker = (fontType: 'heading' | 'body') => {
    if (!isEditable) return;
    setActiveFontType(prev => prev === fontType ? null : fontType);
    setActiveColor(null);
  };

  return (
    <div className={cn(
      "relative w-full max-w-[360px] rounded-2xl overflow-hidden border border-zinc-200/80 dark:border-zinc-800/80 bg-white/95 dark:bg-zinc-900/90 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.45)]",
      "before:content-[''] before:absolute before:inset-0 before:rounded-2xl before:bg-[radial-gradient(circle_at_top,rgba(251,146,60,0.12),transparent_55%)] before:pointer-events-none",
      className
    )}>
      <div className="relative z-10">
        {!hideHeader && (
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100/80 dark:border-zinc-800/80">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Theme
              </span>
              {data.brandName && (
                <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 truncate">
                  {data.brandName}
                </span>
              )}
            </div>
            <span className={cn(
              "text-[10px] font-medium",
              isEditable ? "text-emerald-500" : "text-zinc-400"
            )}>
              {isEditable ? 'Editable' : 'Locked'}
            </span>
          </div>
        )}

        {/* Color bars with logo */}
        <div className="flex h-14">
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
                "flex-1 flex items-center justify-center bg-gradient-to-br from-zinc-100 via-white to-zinc-200 dark:from-zinc-800 dark:via-zinc-900 dark:to-zinc-900 shadow-inner",
                isEditable && "cursor-pointer hover:from-zinc-200 hover:to-zinc-100 dark:hover:from-zinc-700 dark:hover:to-zinc-800"
              )}
              onClick={() => isEditable && fileInputRef.current?.click()}
            >
              {data.logo && !logoLoadFailed ? (
                <img
                  src={data.logo}
                  alt="Logo"
                  className="w-7 h-7 object-contain drop-shadow-sm"
                  onError={() => setLogoLoadFailed(true)}
                />
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
          <button
            type="button"
            className={cn(
              "flex-1 flex flex-col transition-all border-none outline-none",
              isEditable && "hover:brightness-95 cursor-pointer",
              activeColor === 'background' && "ring-2 ring-inset ring-blue-500"
            )}
            onClick={() => toggleColorPicker('background')}
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

          {/* Accent color bar */}
          <button
            type="button"
            className={cn(
              "flex-1 flex flex-col transition-all border-none outline-none",
              isEditable && "hover:brightness-95 cursor-pointer",
              activeColor === 'accent' && "ring-2 ring-inset ring-blue-500"
            )}
            onClick={() => toggleColorPicker('accent')}
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

          {/* Text color bar */}
          <button
            type="button"
            className={cn(
              "flex-1 flex flex-col transition-all border-none outline-none",
              isEditable && "hover:brightness-95 cursor-pointer",
              activeColor === 'text' && "ring-2 ring-inset ring-blue-500"
            )}
            onClick={() => toggleColorPicker('text')}
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
        </div>

        {/* Inline Color Picker - shows below color bars when active */}
        {activeColor && isEditable && (
          <div className="border-t border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50 dark:bg-zinc-900">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium text-zinc-500 uppercase">
                {activeColor === 'background' ? 'Background' : activeColor === 'accent' ? 'Accent' : 'Text'} Color
              </span>
              <button
                type="button"
                onClick={() => setActiveColor(null)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
            <EnhancedColorPicker
              color={data.colors[activeColor]}
              onChange={(hex) => onColorChange?.(activeColor, hex)}
              onChangeComplete={() => {}}
            />
          </div>
        )}

        {/* Font selectors row */}
        <div className="flex border-t border-zinc-200 dark:border-zinc-800">
          {/* Heading font */}
          <button
            type="button"
            className={cn(
              "flex-1 flex items-center justify-between px-2 py-2 border-r border-zinc-200 dark:border-zinc-800 border-none outline-none",
              isEditable && "hover:bg-zinc-50/80 dark:hover:bg-zinc-800/70 cursor-pointer",
              activeFontType === 'heading' && "bg-zinc-100 dark:bg-zinc-800"
            )}
            onClick={() => toggleFontPicker('heading')}
            disabled={!isEditable}
          >
            <div className="flex flex-col items-start min-w-0">
              <span className="text-[8px] text-zinc-400 uppercase tracking-wide">Heading</span>
              <span
                className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 truncate max-w-[100px]"
                style={{ fontFamily: data.fonts.heading }}
              >
                {data.fonts.heading}
              </span>
            </div>
            {isEditable && (activeFontType === 'heading' ? <ChevronUp className="w-3 h-3 text-zinc-400 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 text-zinc-400 flex-shrink-0" />)}
          </button>

          {/* Body font */}
          <button
            type="button"
            className={cn(
              "flex-1 flex items-center justify-between px-2 py-2 border-none outline-none",
              isEditable && "hover:bg-zinc-50/80 dark:hover:bg-zinc-800/70 cursor-pointer",
              activeFontType === 'body' && "bg-zinc-100 dark:bg-zinc-800"
            )}
            onClick={() => toggleFontPicker('body')}
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
            {isEditable && (activeFontType === 'body' ? <ChevronUp className="w-3 h-3 text-zinc-400 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 text-zinc-400 flex-shrink-0" />)}
          </button>
        </div>

        {/* Inline Font Picker - shows below font selectors when active */}
        {activeFontType && isEditable && (
          <div className="border-t border-zinc-200 dark:border-zinc-800 p-2 bg-zinc-50 dark:bg-zinc-900 max-h-[200px] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium text-zinc-500 uppercase">
                {activeFontType === 'heading' ? 'Heading' : 'Body'} Font
              </span>
              <button
                type="button"
                onClick={() => setActiveFontType(null)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
            {Object.entries(fontGroups).map(([category, fonts]) => (
              <div key={category} className="mb-2 last:mb-0">
                <div className="text-[9px] font-medium text-zinc-400 uppercase tracking-wider px-2 py-1">
                  {category}
                </div>
                {fonts.map(font => (
                  <div key={font} className="relative">
                    <LazyFontItem
                      fontName={font}
                      isActive={data.fonts[activeFontType] === font}
                      onClick={() => handleFontSelect(activeFontType, font)}
                      category={category}
                      className={cn(
                        "w-full text-left px-2 py-1.5 text-xs rounded transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700",
                        data.fonts[activeFontType] === font && "bg-zinc-200 dark:bg-zinc-700"
                      )}
                    />
                    {loadingFont === font && (
                      <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin" />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 dark:bg-zinc-900/70 backdrop-blur-[1px]">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/95 dark:bg-zinc-900/95 px-3 py-1 text-[11px] text-zinc-600 dark:text-zinc-300 shadow-sm">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>{loadingLabel || 'Updating theme...'}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThemeChatBlock;
