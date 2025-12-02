/**
 * InlineChatThemeEditor
 * Compact, editable theme preview that appears inline in chat
 */

import React, { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  ChevronDown,
  ChevronRight,
  Palette,
  Loader2,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import EnhancedColorPicker from '@/components/EnhancedColorPicker';
import GroupedDropdown from '@/components/settings/GroupedDropdown';
import { ALL_FONT_NAMES, FONT_CATEGORIES } from '@/registry/library/fonts';
import { ThemeEditorData, ThemeColorPalette } from '@/types/chatBlocks';

interface InlineChatThemeEditorProps {
  data: ThemeEditorData;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onColorChange: (colorKey: keyof ThemeColorPalette | string, hex: string) => void;
  onFontChange: (fontType: 'heading' | 'body', fontFamily: string) => void;
  onBrandChange?: (brand: { name?: string; logoUrl?: string }) => void;
  onApply: () => void;
  onRegenerate?: () => void;
  isEditable?: boolean;
  isFontLoading?: boolean;
  className?: string;
}

// Color swatch configuration - simplified
const COLOR_SWATCHES = [
  { key: 'accent_1', label: 'Accent' },
  { key: 'primary_background', label: 'Background' },
  { key: 'primary_text', label: 'Text' },
] as const;

// Build font groups for dropdown
const fontGroups = Object.entries(FONT_CATEGORIES).reduce((acc, [category, fonts]) => {
  acc[category] = fonts.map(f => f.name);
  return acc;
}, {} as Record<string, string[]>);

const InlineChatThemeEditor: React.FC<InlineChatThemeEditorProps> = ({
  data,
  isCollapsed,
  onToggleCollapse,
  onColorChange,
  onFontChange,
  onBrandChange,
  onApply,
  onRegenerate,
  isEditable = true,
  isFontLoading = false,
  className,
}) => {
  const [activeColorPicker, setActiveColorPicker] = useState<string | null>(null);

  // Get display name for theme
  const themeName = useMemo(() => {
    if (data.branding?.brandName) return `${data.branding.brandName} Theme`;
    if (data.designStyle) return data.designStyle.charAt(0).toUpperCase() + data.designStyle.slice(1);
    return 'Custom Theme';
  }, [data.branding?.brandName, data.designStyle]);

  // Get color by key
  const getColor = useCallback((key: string): string => {
    return (data.colors as any)[key] || '#CCCCCC';
  }, [data.colors]);

  // Collapsed view - minimal color strip
  if (isCollapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg',
          'bg-zinc-50 dark:bg-zinc-800/50',
          'border border-zinc-200/70 dark:border-zinc-700/50',
          'hover:border-zinc-300 dark:hover:border-zinc-600 transition-all',
          'text-left',
          className
        )}
      >
        <div className="flex gap-0.5 rounded overflow-hidden">
          {COLOR_SWATCHES.map(({ key }) => (
            <div
              key={key}
              className="w-3 h-3"
              style={{ backgroundColor: getColor(key) }}
            />
          ))}
        </div>
        <span className="text-xs text-zinc-600 dark:text-zinc-400 flex-1">
          {themeName}
        </span>
        <ChevronRight className="w-3 h-3 text-zinc-400" />
      </button>
    );
  }

  // Expanded view - compact editor
  return (
    <div
      className={cn(
        'rounded-lg border overflow-hidden',
        'bg-white dark:bg-zinc-900',
        'border-zinc-200 dark:border-zinc-700/50',
        'shadow-sm',
        className
      )}
    >
      {/* Header - minimal */}
      <button
        onClick={onToggleCollapse}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <Palette className="w-3.5 h-3.5 text-zinc-400" />
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex-1 text-left">
          {themeName}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
      </button>

      {/* Content - compact layout */}
      <div className="px-3 pb-3 space-y-3">
        {/* Colors - horizontal row */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wide w-12">Colors</span>
          <div className="flex gap-1.5">
            {COLOR_SWATCHES.map(({ key, label }) => (
              <Popover
                key={key}
                open={activeColorPicker === key}
                onOpenChange={(open) => setActiveColorPicker(open ? key : null)}
              >
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      'w-7 h-7 rounded-md transition-all',
                      'border-2',
                      activeColorPicker === key
                        ? 'border-orange-500 scale-110'
                        : 'border-zinc-200 dark:border-zinc-700 hover:scale-105',
                      !isEditable && 'cursor-default'
                    )}
                    style={{ backgroundColor: getColor(key) }}
                    disabled={!isEditable}
                    title={label}
                  />
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto p-2"
                  side="top"
                  align="center"
                  sideOffset={4}
                >
                  <EnhancedColorPicker
                    color={getColor(key)}
                    onChange={(hex) => onColorChange(key, hex)}
                    onChangeComplete={() => setActiveColorPicker(null)}
                  />
                </PopoverContent>
              </Popover>
            ))}
          </div>
        </div>

        {/* Typography - single row with both fonts */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wide w-12">Fonts</span>
          <div className="flex gap-2 flex-1">
            <div className="flex-1 min-w-0">
              <GroupedDropdown
                value={data.typography.headingFont}
                options={ALL_FONT_NAMES}
                groups={fontGroups}
                onChange={(value) => onFontChange('heading', value)}
                placeholder="Heading"
                disabled={!isEditable || isFontLoading}
              />
            </div>
            <div className="flex-1 min-w-0">
              <GroupedDropdown
                value={data.typography.bodyFont}
                options={ALL_FONT_NAMES}
                groups={fontGroups}
                onChange={(value) => onFontChange('body', value)}
                placeholder="Body"
                disabled={!isEditable || isFontLoading}
              />
            </div>
          </div>
        </div>

        {/* Preview - minimal */}
        <div
          className="p-2 rounded-md border border-zinc-100 dark:border-zinc-800"
          style={{ backgroundColor: getColor('primary_background') }}
        >
          <p
            className="text-sm font-semibold leading-tight"
            style={{
              fontFamily: data.typography.headingFont,
              color: getColor('primary_text')
            }}
          >
            Preview
          </p>
          <p
            className="text-xs mt-0.5"
            style={{
              fontFamily: data.typography.bodyFont,
              color: getColor('primary_text'),
              opacity: 0.7
            }}
          >
            Body text in your font
          </p>
        </div>

        {/* Loading indicator */}
        {isFontLoading && (
          <div className="flex items-center justify-center gap-1.5 py-1">
            <Loader2 className="w-3 h-3 animate-spin text-orange-500" />
            <span className="text-[10px] text-zinc-400">Loading fonts...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default InlineChatThemeEditor;
