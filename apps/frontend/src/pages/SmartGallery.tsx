import React from 'react';
import { SmartSlide, SmartSlideData } from '../components/smart/SmartSlide';
import { useThemeStore } from '../stores/themeStore';
import { defaultThemes } from '../types/themes';

const MOCK_SLIDES: SmartSlideData[] = [
    {
        layout: 'SplitLayout',
        slots: {
            'left': {
                type: 'BigTitle',
                props: { text: 'Q3 Performance Review', highlight: 'Q3' }
            },
            'right': {
                type: 'StatCard',
                props: { label: 'Total Revenue', value: '$5.2M', trend: '+12%', trendDirection: 'up' }
            }
        }
    },
    {
        layout: 'SplitLayout',
        slots: {
            'left': {
                type: 'SmartImage',
                props: {
                    src: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80',
                    caption: 'Team collaboration in the new office'
                }
            },
            'right': {
                type: 'BigTitle',
                props: { text: 'Building a Stronger Team Culture', highlight: 'Team Culture' }
            }
        }
    }
];

const SmartGallery = () => {
    const { setWorkspaceTheme } = useThemeStore();

    return (
        <div style={{ padding: 40, backgroundColor: '#f0f0f0', minHeight: '100vh' }}>
            <h1>Smart Component Gallery</h1>
            <div style={{ marginBottom: 20 }}>
                <button onClick={() => setWorkspaceTheme(defaultThemes[0].id!)}>Dark Theme</button>
                <button onClick={() => setWorkspaceTheme(defaultThemes[1].id!)} style={{ marginLeft: 10 }}>Blue Theme</button>
                <button onClick={() => setWorkspaceTheme(defaultThemes[2].id!)} style={{ marginLeft: 10 }}>Citrus Theme</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
                {MOCK_SLIDES.map((slide, i) => (
                    <div key={i} style={{
                        width: '960px',
                        height: '540px',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
                        overflow: 'hidden',
                        borderRadius: '12px'
                    }}>
                        <SmartSlide data={slide} />
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SmartGallery;
