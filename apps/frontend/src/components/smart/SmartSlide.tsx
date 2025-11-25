import React from 'react';
import { SplitLayout } from './layouts/SplitLayout';
import { BigTitle } from './elements/typography/BigTitle';

import { GridLayout } from './layouts/GridLayout';
import { HeroLayout } from './layouts/HeroLayout';

// This would eventually come from a registry
const LAYOUTS: Record<string, any> = {
    'SplitLayout': SplitLayout,
    'SplitRight': SplitLayout, // Alias for now
    'GridLayout': GridLayout,
    'HeroLayout': HeroLayout,
};

import { StatCard } from './elements/data/StatCard';

const COMPONENTS: Record<string, any> = {
    'BigTitle': BigTitle,
    'StatCard': StatCard,
};

export interface SmartComponentData {
    type: string;
    props: any;
}

export interface SmartSlideData {
    layout: string;
    slots: Record<string, SmartComponentData>;
}

interface SmartSlideProps {
    data: SmartSlideData;
}

export const SmartSlide: React.FC<SmartSlideProps> = ({ data }) => {
    const LayoutComponent = LAYOUTS[data.layout];

    if (!LayoutComponent) {
        return (
            <div style={{ padding: 20, border: '1px solid red', color: 'red' }}>
                Unknown Layout: {data.layout}
            </div>
        );
    }

    const renderSlot = (slotName: string) => {
        const componentData = data.slots[slotName];
        if (!componentData) return null;

        const Component = COMPONENTS[componentData.type];
        if (!Component) {
            return (
                <div style={{ padding: 10, border: '1px dashed orange' }}>
                    Unknown Component: {componentData.type}
                </div>
            );
        }

        return <Component {...componentData.props} />;
    };

    return <LayoutComponent renderSlot={renderSlot} data={data} />;
};
