import React from 'react';
import { useSmartTheme } from '../hooks/useSmartTheme';
import { SmartSlideData } from '../SmartSlide';

interface GridLayoutProps {
    renderSlot: (slotName: string) => React.ReactNode;
    data: SmartSlideData;
}

export const GridLayout: React.FC<GridLayoutProps> = ({ renderSlot, data }) => {
    const theme = useSmartTheme();
    const slotKeys = Object.keys(data.slots);

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: theme.spacing.lg,
                padding: theme.spacing.xl,
                height: '100%',
                width: '100%',
                backgroundColor: theme.colors.background,
                color: theme.colors.text,
                fontFamily: theme.fonts.body,
                boxSizing: 'border-box'
            }}
        >
            {slotKeys.map(key => (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    {renderSlot(key)}
                </div>
            ))}
        </div>
    );
};
