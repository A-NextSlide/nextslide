import React from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Palette } from 'lucide-react';
import ThemePanel from './ThemePanel';
import { useTheme } from '@/context/ThemeContext';

interface ThemeButtonProps {
  className?: string;
}

const ThemeButton: React.FC<ThemeButtonProps> = ({ className }) => {
  const { currentTheme } = useTheme();

  // Display the current theme colors as small colored squares
  const themeColorIndicators = () => {
    return (
      <div className="flex items-center ml-2 gap-1">
        <div 
          className="w-3 h-3 rounded-sm border border-border" 
          style={{ backgroundColor: currentTheme.page.backgroundColor }}
          title="Background color"
        />
        <div 
          className="w-3 h-3 rounded-sm border border-border" 
          style={{ backgroundColor: currentTheme.typography.paragraph.color }}
          title="Text color"
        />
        <div 
          className="w-3 h-3 rounded-sm border border-border" 
          style={{ backgroundColor: currentTheme.accent1 }}
          title="Accent color"
        />
      </div>
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className={`h-8 px-2 gap-1 ${className}`}
        >
          <Palette className="h-4 w-4" />
          <span className="text-xs">Theme</span>
          {themeColorIndicators()}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <ThemePanel />
      </PopoverContent>
    </Popover>
  );
};

export default ThemeButton;