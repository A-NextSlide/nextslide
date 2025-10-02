import React, { createContext, useContext, ReactNode, useEffect, useMemo } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { Theme } from '@/types/themes';
import { themeToCssVariables } from '@/utils/themeUtils';

interface ThemeContextType {
  currentTheme: Theme;
  setTheme: (themeId: string) => void;
  availableThemes: Theme[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const {
    getWorkspaceTheme,
    setWorkspaceTheme,
    availableThemes
  } = useThemeStore();
  const isThemeReady = useThemeStore(state => state.isThemeReady);

  // Memoize the current theme to avoid too many re-renders
  const currentTheme = useMemo(() => getWorkspaceTheme(), [
    // Using getWorkspaceTheme directly since it will always return the latest theme
    getWorkspaceTheme
  ]);

  // Apply theme CSS variables and load fonts when ready
  useEffect(() => {
    if (!currentTheme || !isThemeReady) return;
    
    // Apply theme CSS variables to document root
    const cssVars = themeToCssVariables(currentTheme);
    Object.entries(cssVars).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
    
    // Load paragraph font
    if (currentTheme?.typography?.paragraph?.fontFamily) {
      const fontFamily = currentTheme.typography.paragraph.fontFamily.replace(/\s+/g, '+');
      const linkId = `font-${fontFamily}`;
      
      // Only add if not already present
      if (!document.getElementById(linkId)) {
        const link = document.createElement('link');
        link.id = linkId;
        link.href = `https://fonts.googleapis.com/css2?family=${fontFamily}:wght@400;700&display=swap`;
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
    }

    // Load heading font if different from paragraph font
    if (currentTheme?.typography?.heading?.fontFamily && 
        currentTheme.typography.heading.fontFamily !== currentTheme.typography.paragraph.fontFamily) {
      const fontFamily = currentTheme.typography.heading.fontFamily.replace(/\s+/g, '+');
      const linkId = `font-${fontFamily}`;
      
      // Only add if not already present
      if (!document.getElementById(linkId)) {
        const link = document.createElement('link');
        link.id = linkId;
        link.href = `https://fonts.googleapis.com/css2?family=${fontFamily}:wght@400;700&display=swap`;
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
    }
  }, [currentTheme, isThemeReady]);

  // When not ready, clear previously applied theme CSS variables to avoid placeholder flash
  useEffect(() => {
    if (isThemeReady) return;
    if (!currentTheme) return;
    const cssVars = themeToCssVariables(currentTheme);
    Object.keys(cssVars).forEach((key) => {
      document.documentElement.style.removeProperty(key);
    });
  }, [isThemeReady, currentTheme]);

  return (
    <ThemeContext.Provider
      value={{
        currentTheme,
        setTheme: setWorkspaceTheme,
        availableThemes
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  
  return context;
};