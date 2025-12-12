import React from 'react';
import { RendererProps, registerRenderer, createComponentStyles } from '../index';
import { useNavigate } from 'react-router-dom';
import { Lock, Sparkles, Zap, Crown, ArrowRight } from 'lucide-react';
import BrandWordmark from '@/components/common/BrandWordmark';

export const UpgradePaywallRenderer: React.FC<RendererProps> = ({ component, styles, isThumbnail }) => {
    const navigate = useNavigate();
    const {
        hidden_count = 0,
        total_slides = 0,
        visible_slides = 0,
        message = "Unlock more slides",
    } = component.props || {};

    const handleUpgrade = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        navigate('/pricing');
    };

    const handleFreeDeck = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        navigate('/decks');
    };

    // Calculate scale factor for thumbnail vs full view
    const scale = isThumbnail ? 0.5 : 1;

    const containerStyles = createComponentStyles({
        ...styles,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0f0f23 100%)',
        color: 'white',
        padding: isThumbnail ? '16px' : '48px',
        boxSizing: 'border-box',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        textAlign: 'center',
        overflow: 'hidden',
        position: 'relative',
    });

    return (
        <div style={containerStyles}>
            {/* Subtle gradient overlay */}
            <div style={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(circle at 30% 20%, rgba(139, 92, 246, 0.15) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 50%)',
                pointerEvents: 'none'
            }} />

            {/* Content */}
            <div style={{
                position: 'relative',
                zIndex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                maxWidth: isThumbnail ? '100%' : '500px'
            }}>
                {/* Lock icon with gradient ring */}
                <div style={{
                    width: isThumbnail ? '48px' : '88px',
                    height: isThumbnail ? '48px' : '88px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: isThumbnail ? '12px' : '28px',
                    boxShadow: '0 0 60px rgba(139, 92, 246, 0.4), 0 0 100px rgba(236, 72, 153, 0.2)',
                    animation: 'pulse 2s ease-in-out infinite'
                }}>
                    <Lock size={isThumbnail ? 24 : 40} strokeWidth={1.5} color="white" />
                </div>

                {/* Title */}
                <h2 style={{
                    fontSize: isThumbnail ? '18px' : '36px',
                    fontWeight: 700,
                    margin: 0,
                    marginBottom: isThumbnail ? '8px' : '16px',
                    background: 'linear-gradient(90deg, #fff 0%, #e0e7ff 50%, #c4b5fd 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    letterSpacing: '-0.02em',
                    lineHeight: 1.2
                }}>
                    {hidden_count} More Slides Await
                </h2>

                {/* Subtitle */}
                {!isThumbnail && (
                    <p style={{
                        fontSize: '17px',
                        color: 'rgba(255,255,255,0.7)',
                        margin: 0,
                        marginBottom: '32px',
                        lineHeight: 1.6,
                        maxWidth: '400px'
                    }}>
                        You've previewed <span style={{ color: '#a78bfa', fontWeight: 600 }}>{visible_slides}</span> of{' '}
                        <span style={{ color: '#f472b6', fontWeight: 600 }}>{total_slides}</span> slides.
                        Upgrade to unlock the complete presentation.
                    </p>
                )}

                {/* Stats badges */}
                {!isThumbnail && (
                    <div style={{
                        display: 'flex',
                        gap: '16px',
                        marginBottom: '36px'
                    }}>
                        <div style={{
                            padding: '12px 20px',
                            borderRadius: '12px',
                            background: 'rgba(139, 92, 246, 0.15)',
                            border: '1px solid rgba(139, 92, 246, 0.3)'
                        }}>
                            <div style={{ fontSize: '28px', fontWeight: 700, color: '#a78bfa' }}>{visible_slides}</div>
                            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Previewed</div>
                        </div>
                        <div style={{
                            padding: '12px 20px',
                            borderRadius: '12px',
                            background: 'rgba(236, 72, 153, 0.15)',
                            border: '1px solid rgba(236, 72, 153, 0.3)'
                        }}>
                            <div style={{ fontSize: '28px', fontWeight: 700, color: '#f472b6' }}>{hidden_count}</div>
                            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Locked</div>
                        </div>
                    </div>
                )}

                {/* CTA Buttons */}
                {!isThumbnail && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '320px' }}>
                        <button
                            onClick={handleUpgrade}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '10px',
                                padding: '16px 28px',
                                fontSize: '16px',
                                fontWeight: 600,
                                color: 'white',
                                background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
                                border: 'none',
                                borderRadius: '14px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                boxShadow: '0 4px 24px rgba(139, 92, 246, 0.4), 0 2px 8px rgba(0,0,0,0.2)'
                            }}
                        >
                            <Sparkles size={18} />
                            Upgrade to Starter
                            <ArrowRight size={18} />
                        </button>

                        <button
                            onClick={handleFreeDeck}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                padding: '12px 20px',
                                fontSize: '14px',
                                fontWeight: 500,
                                color: 'rgba(255,255,255,0.7)',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '10px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <Zap size={16} />
                            Create a new presentation
                        </button>
                    </div>
                )}

                {/* Pricing hint */}
                {!isThumbnail && (
                    <p style={{
                        marginTop: '28px',
                        fontSize: '13px',
                        color: 'rgba(255,255,255,0.4)'
                    }}>
                        Starter plan: <span style={{ color: 'rgba(255,255,255,0.6)' }}>$9.99/mo</span> for 1,000 credits (~200 presentations)
                    </p>
                )}

                {/* Thumbnail simplified */}
                {isThumbnail && (
                    <div style={{
                        fontSize: '11px',
                        color: 'rgba(255,255,255,0.5)',
                        marginTop: '4px'
                    }}>
                        Upgrade to unlock all slides
                    </div>
                )}
            </div>

            {/* CSS animation for pulse effect */}
            <style>{`
                @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }
            `}</style>
        </div>
    );
};

// Register the renderer for the upgrade_paywall component type
registerRenderer('upgrade_paywall', UpgradePaywallRenderer);
