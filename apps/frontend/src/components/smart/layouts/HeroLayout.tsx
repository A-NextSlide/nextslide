import React from 'react';
import { useSmartTheme } from '../hooks/useSmartTheme';
import { SmartSlideData } from '../SmartSlide';

interface HeroLayoutProps {
    renderSlot: (slotName: string) => React.ReactNode;
    data: SmartSlideData;
}

export const HeroLayout: React.FC<HeroLayoutProps> = ({ renderSlot }) => {
    const theme = useSmartTheme();

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                width: '100%',
                backgroundColor: theme.colors.background,
                color: theme.colors.text,
                fontFamily: theme.fonts.body,
                textAlign: 'center',
                padding: theme.spacing.xxl
            }}
        >
            <div style={{ marginBottom: theme.spacing.xl }}>
                {renderSlot('title')}
            </div>

            <div style={{ marginBottom: theme.spacing.lg, maxWidth: '800px' }}>
                {renderSlot('subtitle')}
            </div>

            <div style={{ marginTop: theme.spacing.xl }}>
                {renderSlot('footer')}
            </div>
        </div>
    );
};
