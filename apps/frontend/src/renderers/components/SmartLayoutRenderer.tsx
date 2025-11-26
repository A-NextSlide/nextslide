import React from 'react';
import { RendererProps, registerRenderer } from '../index';
import { SmartSlide } from '@/components/smart/SmartSlide';

export const SmartLayoutRenderer: React.FC<RendererProps> = ({ component, styles }) => {
    const { layout, slots } = component.props;

    // If no layout data, show placeholder
    if (!layout || !slots) {
        return (
            <div style={{ ...styles, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed #ccc', color: '#999' }}>
                Empty Smart Layout
            </div>
        );
    }

    return (
        <div style={{ ...styles, width: '100%', height: '100%', overflow: 'hidden', containerType: 'size' }}>
            <SmartSlide data={{ layout, slots }} />
        </div>
    );
};

// Register the renderer
registerRenderer('SmartLayout', SmartLayoutRenderer);
