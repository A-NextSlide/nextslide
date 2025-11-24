import React from 'react';
import { RendererProps, registerRenderer } from '../index';
import { StatCard } from '@/components/smart/elements/data/StatCard';

export const StatCardRenderer: React.FC<RendererProps> = ({ component, styles }) => {
    const { label, value, trend, trendDirection } = component.props;

    return (
        <div style={{ ...styles, width: '100%', height: '100%' }}>
            <StatCard
                label={label || 'Label'}
                value={value || '0'}
                trend={trend}
                trendDirection={trendDirection}
            />
        </div>
    );
};

// Register the renderer
registerRenderer('StatCard', StatCardRenderer);
