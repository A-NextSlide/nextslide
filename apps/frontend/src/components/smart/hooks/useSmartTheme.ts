import { useThemeStore } from '@/stores/themeStore';
import { useMemo } from 'react';

export interface SmartTheme {
    colors: {
        background: string;
        text: string;
        primary: string;
        secondary: string;
        accent: string;
        muted: string;
    };
    fonts: {
        heading: string;
        body: string;
    };
    spacing: {
        xs: string;
        sm: string;
        md: string;
        lg: string;
        xl: string;
        xxl: string;
    };
    borderRadius: {
        sm: string;
        md: string;
        lg: string;
        full: string;
    };
    shadows: {
        sm: string;
        md: string;
        lg: string;
    };
}

export const useSmartTheme = (): SmartTheme => {
    const { getWorkspaceTheme } = useThemeStore();
    const theme = getWorkspaceTheme();

    return useMemo(() => {
        return {
            colors: {
                background: theme.page.backgroundColor,
                text: theme.typography.paragraph.color,
                primary: theme.accent1,
                secondary: theme.accent2 || theme.accent1, // Fallback
                accent: theme.accent1,
                muted: theme.typography.paragraph.color + '80', // 50% opacity
            },
            fonts: {
                heading: theme.typography.heading?.fontFamily || theme.typography.paragraph.fontFamily,
                body: theme.typography.paragraph.fontFamily,
            },
            // Standardized spacing system (can be scaled later)
            spacing: {
                xs: '8px',
                sm: '16px',
                md: '24px',
                lg: '32px',
                xl: '48px',
                xxl: '64px',
            },
            borderRadius: {
                sm: '8px',
                md: '16px',
                lg: '24px',
                full: '9999px',
            },
            shadows: {
                sm: '0 2px 4px rgba(0,0,0,0.05)',
                md: '0 4px 12px rgba(0,0,0,0.1)',
                lg: '0 12px 24px rgba(0,0,0,0.15)',
            },
        };
    }, [theme]);
};
