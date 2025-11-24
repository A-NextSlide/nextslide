import React from 'react';
import { useSmartTheme } from '../hooks/useSmartTheme';

interface SplitLayoutProps {
    renderSlot: (slotName: string) => React.ReactNode;
}

export const SplitLayout: React.FC<SplitLayoutProps> = ({ renderSlot }) => {
    const theme = useSmartTheme();

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                height: '100%',
                width: '100%',
                backgroundColor: theme.colors.background,
                color: theme.colors.text,
                fontFamily: theme.fonts.body
            }}
        >
            <div style={{ padding: theme.spacing.xl, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {renderSlot('left')}
            </div>
            <div style={{ padding: theme.spacing.xl, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {renderSlot('right')}
            </div>
        </div>
    );
};
