import React, { useEffect, useRef } from "react";
import { ComponentInstance } from "../../types/components";
import { generateGradientCSS, generateAnimatedGradientCSS } from "../../registry/library/gradient-properties";

/**
 * Renders a background component with support for solid colors, gradients, images, and patterns
 *
 * Gradient Configuration Example:
 * {
 *   "type": "linear", // or "radial"
 *   "angle": 90,      // degrees (for linear gradients)
 *   "stops": [
 *     {"color": "#FFD700", "position": 0},    // Position values from 0-1 are preferred
 *     {"color": "#00FF00", "position": 0.5},  // But values from 0-100 also work
 *     {"color": "#0000FF", "position": 1}
 *   ]
 * }
 *
 * Example usage in component props:
 * {
 *   "color": "#ffffff",
 *   "gradient": {
 *     "type": "linear",
 *     "angle": 90,
 *     "stops": [
 *       {"color": "#FFD700", "position": 0},
 *       {"color": "#00FF00", "position": 0.5},
 *       {"color": "#0000FF", "position": 1}
 *     ]
 *   }
 * }
 *
 * Note: When specifying gradient stops, both 0-1 range (0, 0.5, 1) and 0-100 range (0, 50, 100) 
 * are supported for position values, but 0-1 is preferred.
 */

// Define the possible background types explicitly
type BackgroundType = 'color' | 'gradient' | 'image' | 'pattern';

// Helper function to generate CSS backgroundImage for patterns using SVG Data URLs
const generatePatternCss = (
    type: string | null | undefined,
    color: string | null | undefined,
    scale: number | null | undefined
): string => {
    if (!type) return 'none';

    const pColor = color || '#cccccc'; // Default pattern color
    // Ensure scale is a reasonable number, default to 5 -> 10px size
    const safeScale = typeof scale === 'number' && scale > 0 ? scale : 5;
    const size = safeScale * 2; // Base size in pixels, e.g., scale 5 => 10px

    let svgString = '';

    switch (type) {
        case 'dots': {
            const dotRadius = Math.max(1, Math.round(size / 10)); // Adjust dot size relative to scale
            svgString = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><circle fill='${pColor}' cx='${size / 2}' cy='${size / 2}' r='${dotRadius}'/></svg>`;
            break;
        }
        case 'lines': {
            // Diagonal lines
            const lineThickness = Math.max(1, Math.round(size / 15));
            svgString = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><path d='M-${size / 4},${size / 4} l${size / 2},-${size / 2} M0,${size} l${size},-${size} M${size * 3 / 4},${size * 5 / 4} l${size / 2},-${size / 2}' stroke='${pColor}' stroke-width='${lineThickness}'/></svg>`;
            break;
        }
        case 'checkered': {
            const checkSize = size / 2;
            svgString = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><rect width='${checkSize}' height='${checkSize}' fill='${pColor}'/><rect x='${checkSize}' y='${checkSize}' width='${checkSize}' height='${checkSize}' fill='${pColor}'/></svg>`;
            break;
        }
        case 'grid': {
            const gridThickness = Math.max(1, Math.round(size / 20));
            // Draw lines slightly offset from edges to avoid clipping issues
            svgString = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><path d='M ${size / 2} 0 L ${size / 2} ${size} M 0 ${size / 2} L ${size} ${size / 2}' stroke='${pColor}' stroke-width='${gridThickness}'/></svg>`;
            break;
        }
        default:
            return 'none';
    }

    // Encode the SVG string for use in a data URL
    // Use encodeURIComponent for broader compatibility, though encodeSVG might be slightly smaller
    const encodedSvg = encodeURIComponent(svgString);
    return `url("data:image/svg+xml,${encodedSvg}")`;
};

export const renderBackground = (
    component: ComponentInstance,
    baseStyles: React.CSSProperties,
) => {
    const props = component.props || {};
    const backgroundElementRef = useRef<HTMLDivElement>(null);

    // Determine background type with a defensive fallback:
    // If a valid gradient object is present, prefer rendering it even if backgroundType is mismatched.
    // This avoids cases where the editor updated gradient but backgroundType wasn't toggled yet.
    let type: BackgroundType = (props.backgroundType as BackgroundType) || 'color';
    const hasGradientObject = (
        props.gradient &&
        typeof props.gradient === 'object' && (
            (Array.isArray((props.gradient as any).stops) && (props.gradient as any).stops.length > 0) ||
            (Array.isArray((props.gradient as any).colors) && (props.gradient as any).colors.length > 0)
        )
    );
    
    // Prefer image mode if an image is set; don't let a stale gradient object override it
    if (hasGradientObject && !props.backgroundImageUrl && (props.backgroundType !== 'image')) {
        type = 'gradient';
    }

    // Initialize styles object
    const backgroundStyles: React.CSSProperties = {
        ...baseStyles,
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        overflow: "hidden",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        // IMPORTANT: Always reset shorthand background to avoid stale gradients overriding color
        background: 'none',
        backgroundColor: props.backgroundColor || (props as any).color || '#E8F4FD',
        backgroundImage: 'none', 
        opacity: 1,
        cursor: 'inherit',
        pointerEvents: 'auto', // Ensure background can receive clicks
    } as React.CSSProperties;

    let finalOpacity = 1;

    // If a generic CSS background string is provided, use it directly (most generic path)
    // BUT only when no explicit background image is set. This prevents overriding
    // the base color + image layering logic when in image mode.
    if (
        typeof (props as any).background === 'string' &&
        (props as any).background.trim().length > 0 &&
        !props.backgroundImageUrl &&
        type !== 'image'
    ) {
        backgroundStyles.background = (props as any).background;
        backgroundStyles.backgroundColor = 'transparent';
        backgroundStyles.opacity = finalOpacity;
        return (
            <div
                ref={backgroundElementRef}
                style={backgroundStyles}
                className="slide-background"
                data-background-type={type}
                data-background-value={(props as any).background}
            />
        );
    }

    // Apply styles based on type
    switch (type) {
        case 'color':
            // Ensure previous gradient is cleared
            backgroundStyles.background = 'none';
            backgroundStyles.backgroundColor = props.backgroundColor || props.color || '#E8F4FD';
            break;

        case 'gradient':
            // Check if we have a gradient object
            if (props.gradient && typeof props.gradient === 'object' && ((props.gradient as any).stops || (props.gradient as any).colors)) {
                // Handle gradient object format
                const gradient = props.gradient as any;
                const rawStops = Array.isArray(gradient.stops) ? gradient.stops : (Array.isArray(gradient.colors) ? gradient.colors : []);
                const sortedStops = [...rawStops].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
                
                // Validate and sanitize stops
                const validStops = sortedStops.map((stop: any, index: number) => {
                    // Ensure position is a valid number
                    let position = stop.position;
                    if (position === null || position === undefined || isNaN(position)) {
                        // Default positioning based on index if position is invalid
                        position = (index / (sortedStops.length - 1)) * 100;
                    }
                    // Convert position to percentage if it's in 0-1 range
                    if (position <= 1 && sortedStops.every((s: any) => (s.position ?? 0) <= 1)) {
                        position = position * 100;
                    }
                    // Ensure position is between 0 and 100
                    position = Math.max(0, Math.min(100, position));
                    
                    return {
                        color: stop.color || '#000000',
                        position: position
                    };
                });
                
                // Default to linear if type is not specified
                const gradientType = gradient.type || 'linear';
                
                if (gradientType === 'linear') {
                    const angle = gradient.angle !== undefined ? gradient.angle : 135; // Default to 135 deg
                    const gradientCSS = `linear-gradient(${angle}deg, ${validStops.map(
                        (stop: any) => `${stop.color} ${stop.position}%`
                    ).join(', ')})`;
                    backgroundStyles.background = gradientCSS;
                    backgroundStyles.backgroundImage = gradientCSS; // Also set backgroundImage for compatibility
                } else if (gradientType === 'radial') {
                    const gradientCSS = `radial-gradient(circle, ${validStops.map(
                        (stop: any) => `${stop.color} ${stop.position}%`
                    ).join(', ')})`;
                    backgroundStyles.background = gradientCSS;
                    backgroundStyles.backgroundImage = gradientCSS; // Also set backgroundImage for compatibility
                }
                
                backgroundStyles.backgroundColor = 'transparent';
                
                // Handle animation if enabled
                if (props.gradientAnimated || props.isAnimated) {
                    const speed = props.gradientAnimationSpeed || props.animationSpeed || 5;
                    const duration = 11 - speed; // Inverse relationship
                    backgroundStyles.animation = `gradientShift ${duration}s ease infinite`;
                    backgroundStyles.backgroundSize = '200% 200%';
                }
            } else if (props.gradientEnabled || props.backgroundType === 'gradient') {
                // Use the old gradient system as fallback
                const gradientCSS = generateGradientCSS(props);
                
                if (props.gradientAnimated) {
                    const animatedGradient = generateAnimatedGradientCSS(props);
                    backgroundStyles.background = animatedGradient.background;
                    if (animatedGradient.animation) {
                        backgroundStyles.animation = animatedGradient.animation;
                        backgroundStyles.backgroundSize = '200% 200%';
                    }
                } else {
                    backgroundStyles.background = gradientCSS;
                }
                
                backgroundStyles.backgroundColor = props.backgroundColor || props.color || '#E8F4FD';
            } else {
                // Fallback to color if gradient not enabled
                backgroundStyles.backgroundColor = props.backgroundColor || props.color || '#E8F4FD';
            }
            break;

        case 'image':
            backgroundStyles.background = 'none';
            // Always render base color on the main layer
            backgroundStyles.backgroundColor = props.backgroundColor || props.color || '#E8F4FD';
            // Do NOT apply opacity to the base color layer
            if (props.backgroundImageUrl) {
                const imageLayerStyles: React.CSSProperties = {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundImage: `url(${props.backgroundImageUrl})`,
                    backgroundSize: props.backgroundImageSize || 'cover',
                    backgroundRepeat: props.backgroundImageRepeat || 'no-repeat',
                    backgroundPosition: 'center',
                    opacity: typeof props.backgroundImageOpacity === 'number' ? props.backgroundImageOpacity : 1,
                    pointerEvents: 'auto',
                };

                // Return two layers: base color + image overlay with independent opacity
                return (
                    <>
                        <div
                            ref={backgroundElementRef}
                            style={backgroundStyles}
                            className="slide-background"
                            data-background-type={type}
                            data-background-value={props.backgroundImageUrl || 'no-image'}
                        />
                        <div
                            style={imageLayerStyles}
                            className="slide-background-image-layer"
                            data-background-type="image-layer"
                        />
                    </>
                );
            } else {
                // No image URL - show a neutral base
                backgroundStyles.backgroundColor = '#e0e0e0';
            }
            break;

        case 'pattern':
            backgroundStyles.background = 'none';
            const patternCss = generatePatternCss(props.patternType, props.patternColor, props.patternScale);
            if (patternCss !== 'none') {
                backgroundStyles.backgroundImage = patternCss;
                backgroundStyles.backgroundColor = props.backgroundColor || props.color || '#E8F4FD';
                backgroundStyles.backgroundRepeat = 'repeat';
                backgroundStyles.backgroundSize = 'auto';
                finalOpacity = typeof props.patternOpacity === 'number' ? props.patternOpacity : 0.5;
            } else {
                 backgroundStyles.backgroundColor = props.backgroundColor || props.color || '#E8F4FD';
            }
            break;

        default:
            backgroundStyles.backgroundColor = props.backgroundColor || props.color || '#E8F4FD';
            break;
    }

    backgroundStyles.opacity = finalOpacity;

    let dataBgValue = 'unknown';
    switch (type) {
        case 'color': dataBgValue = props.backgroundColor || props.color || 'white'; break;
        case 'gradient': dataBgValue = 'gradient'; break;
        case 'image': dataBgValue = props.backgroundImageUrl || 'no-image'; break;
        case 'pattern': dataBgValue = props.patternType || 'no-pattern'; break;
    }

    // Add animation keyframes if needed
    const animationStyles = (props.gradientAnimated || props.isAnimated) && type === 'gradient' ? (
        <style>
            {`
                @keyframes gradientShift {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
            `}
        </style>
    ) : null;

    return (
        <>
            {animationStyles}
            <div
                ref={backgroundElementRef}
                style={backgroundStyles}
                className="slide-background"
                data-background-type={type}
                data-background-value={dataBgValue}
            >
                {/* Content removed */}
            </div>
        </>
    );
};

// Register the renderer
import { registerRenderer } from '../utils';
import type { RendererFunction } from '../index';

// Wrapper function to match the expected signature
const BackgroundRendererWrapper: RendererFunction = (props) => {
  // Pass props.styles instead of the removed props.baseStyles
  return renderBackground(props.component, props.styles || {}); // Pass styles, fallback to empty object
};

// Register the wrapped renderer
registerRenderer('Background', BackgroundRendererWrapper);