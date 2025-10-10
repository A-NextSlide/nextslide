import React, { useState, useEffect, useRef } from "react";
import { ComponentInstance } from "../../types/components";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';
import { LogoPlaceholder } from '@/components/common/LogoPlaceholder';
import { useThemeStore } from '@/stores/themeStore';
import { useEditorSettingsStore } from '@/stores/editorSettingsStore';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { useEditorStore } from '@/stores/editorStore';

/**
 * Get filter string from preset or custom values
 */
const getFilterString = (props: any): string => {
  const filters: string[] = [];
  
  // Apply preset filters
  switch (props.filterPreset) {
    case 'grayscale':
      filters.push('grayscale(100%)');
      break;
    case 'sepia':
      filters.push('sepia(100%)');
      break;
    case 'vintage':
      filters.push('sepia(50%) contrast(120%) brightness(90%)');
      break;
    case 'noir':
      filters.push('grayscale(100%) contrast(150%) brightness(90%)');
      break;
    case 'vivid':
      filters.push('saturate(150%) contrast(120%)');
      break;
    case 'dramatic':
      filters.push('contrast(150%) brightness(90%) saturate(80%)');
      break;
    case 'cool':
      filters.push('hue-rotate(180deg) saturate(80%)');
      break;
    case 'warm':
      filters.push('hue-rotate(-30deg) saturate(120%) brightness(110%)');
      break;
    case 'cyberpunk':
      filters.push('hue-rotate(270deg) saturate(150%) contrast(120%)');
      break;
    case 'dreamy':
      filters.push('blur(0.5px) brightness(110%) saturate(80%)');
      break;
    case 'custom':
    case 'none':
    default:
      // Apply individual filter values
      // Handle both percentage (0-100) and decimal (0-1) values with safe defaults
      const brightnessRaw = typeof props.brightness === 'number' ? props.brightness : 100;
      const contrastRaw = typeof props.contrast === 'number' ? props.contrast : 100;
      const saturationRaw = typeof props.saturation === 'number' ? props.saturation : 100;
      const grayscaleRaw = typeof props.grayscale === 'number' ? props.grayscale : 0;
      const sepiaRaw = typeof props.sepia === 'number' ? props.sepia : 0;
      const hueRotateRaw = typeof props.hueRotate === 'number' ? props.hueRotate : 0;
      const blurRaw = typeof props.blur === 'number' ? props.blur : 0;
      const invertRaw = typeof props.invert === 'number' ? props.invert : 0;

      const brightnessValue = brightnessRaw <= 2 ? brightnessRaw * 100 : brightnessRaw;
      const contrastValue = contrastRaw <= 2 ? contrastRaw * 100 : contrastRaw;
      const saturationValue = saturationRaw <= 2 ? saturationRaw * 100 : saturationRaw;
      
      if (brightnessValue !== 100) filters.push(`brightness(${brightnessValue}%)`);
      if (contrastValue !== 100) filters.push(`contrast(${contrastValue}%)`);
      if (saturationValue !== 100) filters.push(`saturate(${saturationValue}%)`);
      if (grayscaleRaw > 0) filters.push(`grayscale(${grayscaleRaw}%)`);
      if (sepiaRaw > 0) filters.push(`sepia(${sepiaRaw}%)`);
      if (hueRotateRaw !== 0) filters.push(`hue-rotate(${hueRotateRaw}deg)`);
      if (blurRaw > 0) filters.push(`blur(${blurRaw}px)`);
      if (invertRaw > 0) filters.push(`invert(${invertRaw}%)`);
      break;
  }
  
  return filters.join(' ');
};

/**
 * Get transform string from transform properties
 */
const getTransformString = (props: any): string => {
  const transforms: string[] = [];
  
  if (props.scale !== 1 && props.scale !== undefined) transforms.push(`scale(${props.scale})`);
  if (props.rotate !== 0 && props.rotate !== undefined) transforms.push(`rotate(${props.rotate}deg)`);
  if (props.skewX !== 0 && props.skewX !== undefined) transforms.push(`skewX(${props.skewX}deg)`);
  if (props.skewY !== 0 && props.skewY !== undefined) transforms.push(`skewY(${props.skewY}deg)`);
  
  return transforms.join(' ');
};

/**
 * Get animation keyframes
 */
const getAnimationKeyframes = (animationType: string): string => {
  const animations: Record<string, string> = {
    'fade-in': `
      @keyframes fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `,
    'slide-in': `
      @keyframes slide-in {
        from { transform: translateY(30px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `,
    'zoom-in': `
      @keyframes zoom-in {
        from { transform: scale(0.8); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }
    `,
    'rotate-in': `
      @keyframes rotate-in {
        from { transform: rotate(-45deg) scale(0.9); opacity: 0; }
        to { transform: rotate(0) scale(1); opacity: 1; }
      }
    `,
    'bounce-in': `
      @keyframes bounce-in {
        0% { transform: scale(0.3); opacity: 0; }
        50% { transform: scale(1.05); }
        70% { transform: scale(0.9); }
        100% { transform: scale(1); opacity: 1; }
      }
    `,
    'flip-in': `
      @keyframes flip-in {
        from { transform: perspective(400px) rotateY(90deg); opacity: 0; }
        to { transform: perspective(400px) rotateY(0); opacity: 1; }
      }
    `
  };
  
  return animations[animationType] || '';
};

/**
 * Get mask clip path
 */
const getMaskClipPath = (shape: string, size: number): string => {
  const scale = size / 100;
  
  switch (shape) {
    case 'circle':
      return `circle(${50 * scale}% at center)`;
    case 'ellipse':
      return `ellipse(${50 * scale}% ${40 * scale}% at center)`;
    case 'triangle':
      return `polygon(50% ${50 - 50 * scale}%, ${50 - 50 * scale}% ${50 + 50 * scale}%, ${50 + 50 * scale}% ${50 + 50 * scale}%)`;
    case 'diamond':
      return `polygon(50% ${50 - 50 * scale}%, ${50 + 50 * scale}% 50%, 50% ${50 + 50 * scale}%, ${50 - 50 * scale}% 50%)`;
    case 'pentagon':
      return `polygon(50% ${50 - 50 * scale}%, ${50 + 50 * scale}% ${50 - 19 * scale}%, ${50 + 31 * scale}% ${50 + 50 * scale}%, ${50 - 31 * scale}% ${50 + 50 * scale}%, ${50 - 50 * scale}% ${50 - 19 * scale}%)`;
    case 'hexagon':
      return `polygon(${50 - 25 * scale}% ${50 - 50 * scale}%, ${50 + 25 * scale}% ${50 - 50 * scale}%, ${50 + 50 * scale}% 50%, ${50 + 25 * scale}% ${50 + 50 * scale}%, ${50 - 25 * scale}% ${50 + 50 * scale}%, ${50 - 50 * scale}% 50%)`;
    case 'star':
      return `polygon(50% ${50 - 50 * scale}%, ${50 + 15 * scale}% ${50 - 15 * scale}%, ${50 + 50 * scale}% ${50 - 15 * scale}%, ${50 + 20 * scale}% ${50 + 10 * scale}%, ${50 + 30 * scale}% ${50 + 50 * scale}%, 50% ${50 + 25 * scale}%, ${50 - 30 * scale}% ${50 + 50 * scale}%, ${50 - 20 * scale}% ${50 + 10 * scale}%, ${50 - 50 * scale}% ${50 - 15 * scale}%, ${50 - 15 * scale}% ${50 - 15 * scale}%)`;
    case 'heart':
      // Create a nicely rounded heart shape
      const s = scale * 0.85; // 85% scale as requested
      
      // Create a symmetrical heart with smooth curves
      const points = [];
      
      // Bottom point
      points.push(`50% ${50 + 40*s}%`);
      
      // Right side curve from bottom to middle
      points.push(`${50 + 10*s}% ${50 + 32*s}%`);
      points.push(`${50 + 20*s}% ${50 + 20*s}%`);
      points.push(`${50 + 28*s}% ${50 + 8*s}%`);
      points.push(`${50 + 35*s}% ${50 - 5*s}%`);
      points.push(`${50 + 38*s}% ${50 - 18*s}%`);
      
      // Right lobe - perfectly round
      points.push(`${50 + 38*s}% ${50 - 28*s}%`);
      points.push(`${50 + 35*s}% ${50 - 36*s}%`);
      points.push(`${50 + 30*s}% ${50 - 40*s}%`);
      points.push(`${50 + 23*s}% ${50 - 42*s}%`);
      points.push(`${50 + 15*s}% ${50 - 42*s}%`);
      points.push(`${50 + 8*s}% ${50 - 38*s}%`);
      
      // Center dip
      points.push(`${50 + 3*s}% ${50 - 33*s}%`);
      points.push(`50% ${50 - 30*s}%`);
      points.push(`${50 - 3*s}% ${50 - 33*s}%`);
      
      // Left lobe - mirror of right
      points.push(`${50 - 8*s}% ${50 - 38*s}%`);
      points.push(`${50 - 15*s}% ${50 - 42*s}%`);
      points.push(`${50 - 23*s}% ${50 - 42*s}%`);
      points.push(`${50 - 30*s}% ${50 - 40*s}%`);
      points.push(`${50 - 35*s}% ${50 - 36*s}%`);
      points.push(`${50 - 38*s}% ${50 - 28*s}%`);
      
      // Left side curve from middle to bottom
      points.push(`${50 - 38*s}% ${50 - 18*s}%`);
      points.push(`${50 - 35*s}% ${50 - 5*s}%`);
      points.push(`${50 - 28*s}% ${50 + 8*s}%`);
      points.push(`${50 - 20*s}% ${50 + 20*s}%`);
      points.push(`${50 - 10*s}% ${50 + 32*s}%`);
      
      return `polygon(${points.join(', ')})`;
    default:
      return 'none';
  }
};

/**
 * Renders an image component with advanced effects
 */
export const renderImage = (
  component: ComponentInstance,
  baseStyles: React.CSSProperties,
  containerRef: React.RefObject<HTMLDivElement>,
  isThumbnail?: boolean
) => {
  const props = component.props;
  const [isHovered, setIsHovered] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Searching for the perfect image...");
  const [imageLoaded, setImageLoaded] = useState(false);

  const imageRef = useRef<HTMLImageElement>(null);
  const { updateComponent, slideId: activeSlideId } = useActiveSlide();
  const isCroppingGlobal = useEditorSettingsStore(state => state.isCroppingImage);
  const croppingComponentId = useEditorSettingsStore(state => state.croppingComponentId);
  const stopImageCrop = useEditorSettingsStore(state => state.stopImageCrop);
  const startImageCrop = useEditorSettingsStore(state => state.startImageCrop);
  const isCroppingThis = isCroppingGlobal && croppingComponentId === component.id;
  const isSelected = useEditorStore(state => state.isComponentSelected(component.id));
  const theme = useThemeStore(state => state.getWorkspaceTheme());
  
  // Randomize loading messages for variety
  useEffect(() => {
    const messages = [
      "Searching for the perfect image...",
      "Finding visual magic...",
      "Loading your content...",
      "Preparing your image...",
      "Almost there...",
      "Getting things ready..."
    ];
    setLoadingMessage(messages[Math.floor(Math.random() * messages.length)]);
  }, []);

  // (moved below destructuring where src is defined)
  
  const {
    src,
    alt = "",
    objectFit = "cover",
    borderRadius = 0,
    borderWidth = 0,
    borderColor = "#000000",
    shadow = false,
    shadowBlur = 10,
    shadowColor = "rgba(0,0,0,0.3)",
    shadowOffsetX = 0,
    shadowOffsetY = 4,
    shadowSpread = 0,
    // PowerPoint-specific properties
    cropRect,
    clipShape,
    hasCustomClipPath,
    // New effect properties
    filterPreset = 'none',
    brightness = 100,
    contrast = 100,
    saturation = 100,
    grayscale = 0,
    sepia = 0,
    hueRotate = 0,
    blur = 0,
    invert = 0,
    overlayColor = '#00000000',
    overlayOpacity = 0,
    overlayBlendMode = 'normal',
    overlayPattern = 'none',
    overlayPatternOpacity = 0.5,
    gradientOverlayEnabled = false,
    gradientStartColor = '#000000',
    gradientEndColor = '#ffffff',
    gradientDirection = 0,
    animationType = 'none',
    animationDuration = 1,
    animationDelay = 0,
    scale = 1,
    rotate = 0,
    skewX = 0,
    skewY = 0,
    maskShape = 'none',
    maskSize = 100,
    duotoneEnabled = false,
    duotoneLightColor = '#ffffff',
    duotoneDarkColor = '#000000',
    glitchEnabled = false,
    glitchIntensity = 50,
    hoverEffect = 'none',
    hoverTransitionDuration = 0.3,
    width,
    height
  } = props;

  // Reset image loaded flag when source changes
  useEffect(() => {
    setImageLoaded(false);
  }, [src]);
  
  // Detect logo components early (used in styles below)
  const isLogoComponent = (props?.metadata?.kind === 'logo') || ((props?.alt || '').toLowerCase() === 'logo');
  
  // Check if image has a crop applied
  const hasCrop = cropRect && (
    (cropRect.left || 0) > 0 || 
    (cropRect.top || 0) > 0 || 
    (cropRect.right || 0) > 0 || 
    (cropRect.bottom || 0) > 0
  );


  
  // Create image-specific styles for the img element itself
  const imageStyles: React.CSSProperties = {
    display: 'block',
    width: "100%",
    height: "100%",
    objectFit: (isLogoComponent ? (objectFit || 'contain') : objectFit) as "cover" | "contain" | "fill" | "none" | "scale-down",
    filter: getFilterString(props),
    transform: getTransformString(props),
    transition: `transform 200ms ease-out, all ${hoverTransitionDuration}s ease-in-out`,
    maxWidth: 'none', // Ensure image doesn't get constrained when cropped
  };
  
  // Store hover shadow for later application
  let hoverShadow: string | undefined;
  
  // Apply hover effects
  if (isHovered && hoverEffect !== 'none') {
    const baseTransform = getTransformString(props);
    const baseFilter = getFilterString(props);
    
    switch (hoverEffect) {
      case 'zoom':
        imageStyles.transform = baseTransform ? `${baseTransform} scale(1.1)` : 'scale(1.1)';
        break;
      case 'rotate':
        imageStyles.transform = baseTransform ? `${baseTransform} rotate(5deg)` : 'rotate(5deg)';
        break;
      case 'lift':
        imageStyles.transform = baseTransform ? `${baseTransform} translateY(-10px)` : 'translateY(-10px)';
        hoverShadow = '0 10px 20px rgba(0,0,0,0.2)';
        break;
      case 'glow':
        imageStyles.filter = baseFilter ? `${baseFilter} brightness(110%)` : 'brightness(110%)';
        hoverShadow = '0 0 20px rgba(255,67,1,0.5)'; // Orange glow
        break;
      case 'blur':
        imageStyles.filter = baseFilter ? `${baseFilter} blur(2px)` : 'blur(2px)';
        break;
    }
  }
  
  // Apply container styles - this is the outer div
  const containerStyles: React.CSSProperties = {
    ...baseStyles,
    position: 'relative',
    // Allow overflow visible when using shadows or hover shadows to show drop-shadow outside bounds
    // Also keep visible during hover when hoverEffect adds a shadow
    overflow: (isCroppingThis ? 'visible' : (shadow || (isHovered && !!hoverShadow) ? 'visible' : 'hidden')),
    pointerEvents: 'auto', // Ensure hover events work
    // Improve rendering stability across browsers
    willChange: 'filter'
  };
  
  // We'll apply shadow to the inner container instead
  
  // Apply animation with proper keyframe names
  const _normalizedAnimationType = (typeof animationType === 'string' && animationType) ? animationType : 'none';
  if (_normalizedAnimationType !== 'none') {
    // Animation names were changed to use hyphens
    const animationName = _normalizedAnimationType.replace(/([A-Z])/g, '-$1').toLowerCase();
    containerStyles.animation = `${animationName} ${animationDuration}s ease-in-out ${animationDelay}s both`;
  }
  
  // Border will be on the inner container, not outer
  // This ensures borders appear around the rounded corners
  
  // Check if the image is generating
  const isGeneratingImage = src === 'generating://ai-image' || props.isGenerating;
  
  // Detect logo and placeholder per requested contract
  const isPlaceholderLogo = isLogoComponent && (!props?.src || props?.src === 'placeholder');
  // Generic placeholder detection for non-logos (legacy rules retained)
  const isPlaceholderImage = !src || 
    src === 'placeholder' || 
    src === '/placeholder.svg' || 
    src === '/placeholder.png' ||
    (typeof src === 'string' && (src.includes('/api/placeholder/') || src.includes('via.placeholder.com')));
    
  if (isGeneratingImage) {
    // Show generating state
    return (
      <div 
        ref={containerRef}
        className="relative w-full h-full overflow-hidden"
        style={{ 
          ...containerStyles,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%)',
          // Apply border and border-radius together
          border: borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : undefined,
          borderRadius: borderRadius > 0 ? `${borderRadius}px` : undefined,
          boxSizing: 'border-box'
        }}
      >
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-gradient-to-r from-orange-400 via-orange-500 to-orange-400 animate-pulse" />
        </div>
        
                <div className="relative text-center space-y-4 p-6 max-w-sm">
          {/* Animated dots in orange */}
          <div className="flex justify-center items-center space-x-2 h-12">
            <div className="w-3 h-3 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
            <div className="w-3 h-3 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-3 h-3 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
          </div>
          
          <div className="space-y-1.5">
            <p className="text-xs font-normal text-gray-500">Creating your AI image</p>
            <p className="text-xs text-gray-400">This typically takes 10-20 seconds</p>
          </div>
          
          {/* Progress bar effect in orange */}
          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden relative">
            <div className="absolute inset-0 flex">
              <div className="w-1/3 h-full bg-gradient-to-r from-transparent to-orange-400 animate-pulse" />
              <div className="w-1/3 h-full bg-gradient-to-r from-orange-400 to-orange-500 animate-pulse" style={{ animationDelay: '0.5s' }} />
              <div className="w-1/3 h-full bg-gradient-to-r from-orange-500 to-transparent animate-pulse" style={{ animationDelay: '1s' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }
    
  // Explicit branch for logo placeholders (inline: splat icon + Logo)
  if (isPlaceholderLogo) {
    const componentWidth = typeof width === 'number' ? width : 120;
    const componentHeight = typeof height === 'number' ? height : 120;
    // Force Present button color (#FF4301) to match UI
    const accent = '#FF4301';
    const primaryText = (theme as any)?.color_palette?.primary_text ?? (theme as any)?.typography?.heading?.color ?? (theme as any)?.typography?.paragraph?.color ?? '#1A1A1A';
    const heroFont = (theme as any)?.typography?.hero_title?.family ?? (theme as any)?.typography?.heading?.fontFamily ?? (theme as any)?.typography?.paragraph?.fontFamily ?? 'Prompt, Poppins, system-ui';

    return (
      <div 
        ref={containerRef}
        className="relative w-full h-full"
        style={{ 
          ...containerStyles,
          overflow: 'hidden',
        }}
        aria-label="Logo"
        data-kind={component.props?.metadata?.kind}
      >
        <LogoPlaceholder 
          width={componentWidth as number}
          height={componentHeight as number}
          primaryColor={accent}
          textColor={primaryText}
          fontFamily={heroFont}
          layout={'inline'}
        />
      </div>
    );
  }

  if (isPlaceholderImage) {
    // Handler for when the select image button is clicked
    const handleSelectImage = () => {
      // console.log('🖼️ Select image button clicked for component:', component.id);
      
      // Always dispatch the image selection event
      // The SlideContainer will handle opening the picker
      const event = new CustomEvent('image:select-placeholder', {
        detail: { 
          componentId: component.id,
          slideId: ''  // Let SlideContainer determine the current slide
        }
      });
      window.dispatchEvent(event);
      
      // Also force edit mode to ensure we can interact with the picker
      window.dispatchEvent(new CustomEvent('editor:force-edit-mode'));
    };
    
    // Determine the size based on component dimensions
    const componentWidth = typeof width === 'number' ? width : 200; // Default to medium if not specified
    const componentHeight = typeof height === 'number' ? height : 200;
    const minDimension = Math.min(componentWidth, componentHeight);
    
    // Size thresholds
    const placeholderSize: 'small' | 'medium' | 'large' = 
      minDimension < 100 ? 'small' : 
      minDimension > 300 ? 'large' : 
      'medium';
    
    return (
      <div 
        ref={containerRef}
        className="relative w-full h-full"
        style={{ 
          ...containerStyles,
          // Remove clipping from the main container
          borderRadius: undefined,
          clipPath: undefined,
          overflow: 'visible',
          position: 'relative',
          pointerEvents: 'auto',
          // Use a more reasonable z-index that won't interfere with UI elements
          zIndex: 100
        }}
        onClick={(e) => {
          // Stop propagation if clicking on the button or button area
          const target = e.target as HTMLElement;
          const isButton = target.tagName === 'BUTTON' || target.closest('button');
          const isButtonArea = target.closest('[data-button-area="true"]');
          
          if (isButton || isButtonArea) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        onMouseDown={(e) => {
          // Also handle mousedown events
          const target = e.target as HTMLElement;
          const isButton = target.tagName === 'BUTTON' || target.closest('button');
          const isButtonArea = target.closest('[data-button-area="true"]');
          
          if (isButton || isButtonArea) {
            e.stopPropagation();
          }
        }}
      >
        {/* Clipped background layer */}
        <div 
          className="absolute inset-0 bg-gray-50"
          style={{
            borderRadius: borderRadius > 0 ? `${borderRadius}px` : undefined,
            border: borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : undefined,
            boxSizing: 'border-box',
            clipPath: containerStyles.clipPath,
            overflow: 'hidden'
          }}
        />
        
        {/* Placeholder with button - not clipped */}
        <ImagePlaceholder 
          size={placeholderSize}
          onSelectImage={!isThumbnail ? handleSelectImage : undefined}
          showBackground={false}
          showAnimation={!isThumbnail} // Show animations only when not in thumbnail
        />
      </div>
    );
  }
  
  // Create pattern overlay
  const getPatternOverlay = () => {
    if (overlayPattern === 'none') return null;
    
    const patternStyles: React.CSSProperties = {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      opacity: overlayPatternOpacity,
      pointerEvents: 'none',
      mixBlendMode: overlayBlendMode as any,
      zIndex: 2,
    };
    
    switch (overlayPattern) {
      case 'dots':
        patternStyles.backgroundImage = 'radial-gradient(circle, #000 1px, transparent 1px)';
        patternStyles.backgroundSize = '10px 10px';
        break;
      case 'lines':
        patternStyles.backgroundImage = 'repeating-linear-gradient(45deg, #000, #000 1px, transparent 1px, transparent 10px)';
        break;
      case 'grid':
        patternStyles.backgroundImage = 'repeating-linear-gradient(0deg, #000, #000 1px, transparent 1px, transparent 20px), repeating-linear-gradient(90deg, #000, #000 1px, transparent 1px, transparent 20px)';
        break;
      case 'noise':
        // Remove the filter style for noise - it interferes with the pattern
        // Create a proper noise pattern using SVG with correct encoding
        patternStyles.backgroundImage = `url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.5'/%3E%3C/svg%3E")`;
        patternStyles.backgroundSize = '200px 200px';
        break;
      case 'scanlines':
        patternStyles.backgroundImage = 'repeating-linear-gradient(0deg, rgba(0,0,0,0.15), rgba(0,0,0,0.15) 1px, transparent 1px, transparent 2px)';
        break;
      case 'halftone':
        patternStyles.backgroundImage = 'radial-gradient(circle, #000 20%, transparent 20%)';
        patternStyles.backgroundSize = '5px 5px';
        break;
    }
    
    return <div style={patternStyles} />;
  };
  
  // Prepare inner container styles for clipping
  const innerContainerStyles: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    // Always clip image content in normal mode; enable overflow only during cropping
    overflow: isCroppingThis ? 'visible' : 'hidden',
    transition: `all ${hoverTransitionDuration}s ease-in-out`,
  };
  
  // Add border to inner container so it follows the border-radius
  if (borderWidth > 0) {
    innerContainerStyles.border = `${borderWidth}px solid ${borderColor}`;
    innerContainerStyles.boxSizing = 'border-box'; // Ensure border is included in dimensions
  }
  
  // Build filter string for shadow effects (use wrapper to avoid clipping by clip-path)
  let filterParts: string[] = [];
  
  // Apply shadow as filter to inner container to respect mask shapes
  if (shadow) {
    filterParts.push(`drop-shadow(${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${shadowColor})`);
  }
  
  // Apply hover shadow if present (as filter, not box-shadow)
  if (isHovered && hoverShadow) {
    // Parse the box-shadow syntax and convert to drop-shadow
    if (hoverShadow.includes('glow')) {
      filterParts.push('drop-shadow(0 0 20px rgba(255,67,1,0.5))');
    } else if (hoverShadow.includes('10px 20px')) {
      filterParts.push('drop-shadow(0 10px 20px rgba(0,0,0,0.2))');
    }
  }
  
  // Prepare an effects wrapper that holds the drop-shadow so it's not clipped by inner clip-path
  const effectsWrapperStyles: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'visible',
    backgroundColor: '#00000000',
  };
  if (filterParts.length > 0) {
    const combinedFilter = filterParts.join(' ');
    effectsWrapperStyles.filter = combinedFilter;
    (effectsWrapperStyles as any).WebkitFilter = combinedFilter; // Safari/WebKit
    effectsWrapperStyles.willChange = 'filter';
  }
  
  // Move clipping to inner container
  if (!isCroppingThis && maskShape !== 'none') {
    innerContainerStyles.clipPath = getMaskClipPath(maskShape, maskSize);
    delete containerStyles.clipPath; // Remove from outer
  }
  
  // Move border radius to inner container
  if (!isCroppingThis && clipShape === "circle") {
    innerContainerStyles.borderRadius = "50%";
  } else if (borderRadius) {
    innerContainerStyles.borderRadius = typeof borderRadius === 'number' 
      ? `${borderRadius}px` 
      : borderRadius;
  }
  
  // Move clip shapes to inner container
  if (!isCroppingThis && clipShape && clipShape !== 'rectangle' && clipShape !== 'circle') {
    switch (clipShape) {
      case 'triangle':
        innerContainerStyles.clipPath = 'polygon(50% 0%, 0% 100%, 100% 100%)';
        break;
      case 'diamond':
        innerContainerStyles.clipPath = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
        break;
      case 'hexagon':
        innerContainerStyles.clipPath = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
        break;
      case 'pentagon':
        innerContainerStyles.clipPath = 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)';
        break;
      case 'star':
        innerContainerStyles.clipPath = 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)';
        break;
      case 'arrow':
        innerContainerStyles.clipPath = 'polygon(0% 30%, 70% 30%, 70% 0%, 100% 50%, 70% 100%, 70% 70%, 0% 70%)';
        break;
      case 'heart':
        innerContainerStyles.clipPath = 'path("M 25,45 A 25,25 0 0,1 75,45 A 25,25 0 0,1 125,45 Q 125,90 75,135 Q 25,90 25,45 Z")';
        break;
      case 'polygon':
        innerContainerStyles.clipPath = 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)';
        break;
    }
  }
  
  // Apply crop using inset clip-path when not in crop mode
  if (hasCrop && !isCroppingThis) {
    const clipLeft = (cropRect?.left || 0) * 100;
    const clipTop = (cropRect?.top || 0) * 100;
    const clipRight = (cropRect?.right || 0) * 100;
    const clipBottom = (cropRect?.bottom || 0) * 100;
    imageStyles.clipPath = `inset(${clipTop}% ${clipRight}% ${clipBottom}% ${clipLeft}%)`;
  }

  // Ensure outer container has overflow visible for shadow
  if (shadow && (maskShape !== 'none' || clipShape)) {
    containerStyles.overflow = 'visible';
  }
  
  return (
    <>
      <style>
        {_normalizedAnimationType !== 'none' && getAnimationKeyframes(_normalizedAnimationType)}
        {glitchEnabled && `
          @keyframes glitch {
            0%, 100% { transform: translate(0); filter: hue-rotate(0deg); }
            20% { transform: translate(-2px, 2px); filter: hue-rotate(90deg); }
            40% { transform: translate(-2px, -2px); filter: hue-rotate(180deg); }
            60% { transform: translate(2px, 2px); filter: hue-rotate(270deg); }
            80% { transform: translate(2px, -2px); filter: hue-rotate(360deg); }
          }
        `}
      </style>
      <div 
        ref={containerRef} 
        style={containerStyles}
        data-image-type={clipShape || 'default'}
        data-has-crop={hasCrop ? 'true' : 'false'}
        onDoubleClick={() => {
          // Enter crop mode on double-click
          if (!isCroppingThis) {
            startImageCrop(component.id);
          }
        }}
        onMouseEnter={() => {
          if (!isThumbnail) {
            setIsHovered(true);
          }
        }}
        onMouseLeave={() => {
          if (!isThumbnail) {
            setIsHovered(false);
          }
        }}
        onPointerEnter={() => {
          if (!isThumbnail) {
            setIsHovered(true);
          }
        }}
        onPointerLeave={() => {
          if (!isThumbnail) {
            setIsHovered(false);
          }
        }}
      >
        <div style={effectsWrapperStyles}>
        <div style={innerContainerStyles}>
        {/* Duotone filter */}
        {duotoneEnabled && (
          <svg style={{ position: 'absolute', width: 0, height: 0 }}>
            <filter id={`duotone-${component.id}`}>
              <feColorMatrix
                type="matrix"
                values=".33 .33 .33 0 0
                        .33 .33 .33 0 0
                        .33 .33 .33 0 0
                        0 0 0 1 0"
              />
              <feComponentTransfer colorInterpolationFilters="sRGB">
                <feFuncR type="table" tableValues={`0 ${parseInt(duotoneDarkColor.slice(1, 3), 16) / 255} ${parseInt(duotoneLightColor.slice(1, 3), 16) / 255} 1`} />
                <feFuncG type="table" tableValues={`0 ${parseInt(duotoneDarkColor.slice(3, 5), 16) / 255} ${parseInt(duotoneLightColor.slice(3, 5), 16) / 255} 1`} />
                <feFuncB type="table" tableValues={`0 ${parseInt(duotoneDarkColor.slice(5, 7), 16) / 255} ${parseInt(duotoneLightColor.slice(5, 7), 16) / 255} 1`} />
              </feComponentTransfer>
            </filter>
          </svg>
        )}
        
        <img 
          ref={imageRef}
          src={src} 
          alt={isLogoComponent ? (alt || 'Company logo') : alt} 
          style={{
            ...imageStyles,
            filter: duotoneEnabled ? `url(#duotone-${component.id}) ${imageStyles.filter}` : imageStyles.filter,
            animation: glitchEnabled ? `glitch ${0.5 + (100 - glitchIntensity) / 100}s infinite` : imageStyles.animation,
            zIndex: 1,
            pointerEvents: 'auto',
          }}
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            const errorCount = parseInt(target.dataset.errorCount || '0');
            // For logo components, render the splat placeholder immediately on error
            if (isLogoComponent) {
              try {
                target.onerror = null;
                target.style.display = "none";
                const errorDiv = document.createElement('div');
                errorDiv.style.width = "100%";
                errorDiv.style.height = "100%";
                errorDiv.style.position = "absolute";
                errorDiv.style.top = "0";
                errorDiv.style.left = "0";
                if (target.parentNode) {
                  target.parentNode.appendChild(errorDiv);
                  import('react-dom/client').then(({ createRoot }) => {
                    const root = createRoot(errorDiv);
                    const componentWidth = typeof width === 'number' ? width : 120;
                    const componentHeight = typeof height === 'number' ? height : 120;
                    const accent = theme?.accent1 || '#6C5CE7';
                    const primaryText = theme?.typography?.heading?.color || theme?.typography?.paragraph?.color || '#6B6B6B';
                    const heroFont = theme?.typography?.heading?.fontFamily || theme?.typography?.paragraph?.fontFamily || 'Prompt, Poppins, system-ui';
                    root.render(
                      <LogoPlaceholder 
                        width={componentWidth as number}
                        height={componentHeight as number}
                        primaryColor={accent}
                        textColor={primaryText}
                        fontFamily={heroFont}
                      />
                    );
                  });
                }
              } catch {}
              return;
            }
            
            if (errorCount === 0 && props.thumbnail && props.thumbnail !== src) {
              console.warn(`Failed to load image: ${src}, trying thumbnail: ${props.thumbnail}`);
              target.dataset.errorCount = '1';
              target.src = props.thumbnail;
            } 
            else if (errorCount === 1 && props.fallbackSrc && props.fallbackSrc !== props.thumbnail) {
              console.warn(`Failed to load thumbnail: ${props.thumbnail}, trying fallback: ${props.fallbackSrc}`);
              target.dataset.errorCount = '2';
              target.src = props.fallbackSrc;
            }
            else if (errorCount === 2 || (!props.thumbnail && !props.fallbackSrc)) {
              // Try the placeholder as the final fallback
    
              target.dataset.errorCount = '3';
              target.src = '/placeholder.svg';
            }
            else {
              // If even the placeholder fails, hide the image and show our nice placeholder
              console.error(`Failed to load image and placeholder: ${src}`);
              target.onerror = null;
              target.style.display = "none";
              
              const errorDiv = document.createElement('div');
              errorDiv.style.width = "100%";
              errorDiv.style.height = "100%";
              errorDiv.style.position = "absolute";
              errorDiv.style.top = "0";
              errorDiv.style.left = "0";
              
              // Use React portal to render the ImagePlaceholder component
              if (target.parentNode) {
                target.parentNode.appendChild(errorDiv);
                
                // Dynamically import createRoot to avoid issues
                import('react-dom/client').then(({ createRoot }) => {
                  const root = createRoot(errorDiv);
                  root.render(
                    <ImagePlaceholder 
                      message={loadingMessage}
                      showAnimation={!isThumbnail}
                    />
                  );
                });
              }
            }
          }}
          onLoad={(e) => {
            const target = e.target as HTMLImageElement;
            if (target) {
              target.dataset.errorCount = '0';
            }
            setImageLoaded(true);
          }}
        />
        
        {/* Color overlay (render only after image loads to avoid masking during initial load) */}
          {imageLoaded ? (() => {
            // Extract RGB values and alpha from the color
            let r = 0, g = 0, b = 0, a = 0; // Default alpha to 0 when no color is provided
            if (overlayColor && overlayColor.startsWith('#')) {
              const hex = overlayColor.slice(1);
              if (hex.length === 6 || hex.length === 8) {
                r = parseInt(hex.slice(0, 2), 16);
                g = parseInt(hex.slice(2, 4), 16);
                b = parseInt(hex.slice(4, 6), 16);
                // For 6-digit hex without alpha, do not implicitly apply an opaque overlay
                a = hex.length === 8 ? (parseInt(hex.slice(6, 8), 16) / 255) : 0;
              }
            }
            
            // Use overlay opacity if it's been explicitly set; otherwise fall back to color alpha
            const finalOpacity = (overlayOpacity !== undefined && overlayOpacity !== null)
              ? overlayOpacity
              : a;
            
            // Only render overlay if opacity is greater than 0
            if (finalOpacity > 0) {
              return (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
                    backgroundColor: `rgb(${r}, ${g}, ${b})`,
                    opacity: finalOpacity,
              mixBlendMode: overlayBlendMode as any,
              pointerEvents: 'none',
              zIndex: 2,
            }}
          />
              );
            }
            return null;
          })() : null}
        
        {/* Pattern overlay */}
        {imageLoaded ? getPatternOverlay() : null}
        
        {/* Gradient overlay */}
        {imageLoaded && gradientOverlayEnabled && ((overlayOpacity ?? 0) > 0) && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: `linear-gradient(${gradientDirection}deg, ${gradientStartColor}, ${gradientEndColor})`,
              mixBlendMode: overlayBlendMode as any,
              opacity: Math.max(0, Math.min(1, overlayOpacity || 0)),
              pointerEvents: 'none',
              zIndex: 3,
            }}
          />
        )}
        
          {/* Gradient mask effect - separate from overlay */}
          {imageLoaded && props.gradientMaskEnabled && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundColor: 'black',
                mixBlendMode: 'multiply',
                maskImage: `linear-gradient(${props.gradientMaskDirection || 180}deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)`,
                WebkitMaskImage: `linear-gradient(${props.gradientMaskDirection || 180}deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)`,
                pointerEvents: 'none',
                zIndex: 4,
              }}
            />
          )}
        </div>
        </div>
        
        {/* Reset crop button when cropped and selected */}
        {!isCroppingThis && isSelected && hasCrop && (
          <button
            onClick={(e) => {
              e.stopPropagation();
                updateComponent(component.id, { 
                  props: { 
                    ...props, 
                  cropRect: { left: 0, top: 0, right: 0, bottom: 0 }
                  } 
                }, true);
            }}
            className="absolute top-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white hover:bg-black/75"
            style={{ zIndex: 50 }}
            title="Reset crop"
          >
            Reset
          </button>
        )}
        
        {/* Crop Overlay */}
        {isCroppingThis && (
            <CropOverlay
            initialCropRect={cropRect || { left: 0, top: 0, right: 0, bottom: 0 }}
            onConfirm={(newCropRect) => {
                  updateComponent(component.id, { 
                    props: { 
                      ...props,
                  cropRect: newCropRect
                } 
              }, true);
                stopImageCrop();
              }}
              onCancel={() => {
                stopImageCrop();
              }}
            />
        )}
      </div>
    </>
  );
};

// Register the renderer
import { registerRenderer } from '../utils';
import type { RendererFunction } from '../index';

// Wrapper function to match the expected signature
const ImageRendererWrapper: RendererFunction = (props) => {
  return renderImage(props.component, props.styles || {}, props.containerRef, props.isThumbnail);
};

// Register the wrapped renderer
registerRenderer('Image', ImageRendererWrapper); 

// --- Crop Overlay Component ---
type CropRect = { left: number; top: number; right: number; bottom: number };

const CropOverlay: React.FC<{
  initialCropRect: CropRect;
  onConfirm: (rect: CropRect) => void;
  onCancel: () => void;
}> = ({ initialCropRect, onConfirm, onCancel }) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [crop, setCrop] = useState<CropRect>(initialCropRect);
  const dragState = useRef<{
    type: 'move' | 'resize';
    handle?: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
    startX: number;
    startY: number;
    startCrop: CropRect;
  } | null>(null);

  // Clamp value between 0 and 1
  const clamp = (val: number) => Math.max(0, Math.min(1, val));

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm(crop);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [crop, onConfirm, onCancel]);

  // Handle mouse move
  const handleMouseMove = (e: MouseEvent) => {
    if (!dragState.current || !overlayRef.current) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const dx = (e.clientX - dragState.current.startX) / rect.width;
    const dy = (e.clientY - dragState.current.startY) / rect.height;
    const startCrop = dragState.current.startCrop;

    let newCrop = { ...startCrop };

    if (dragState.current.type === 'move') {
      // Move the entire crop region
      const cropWidth = 1 - startCrop.left - startCrop.right;
      const cropHeight = 1 - startCrop.top - startCrop.bottom;
      
      let newLeft = clamp(startCrop.left + dx);
      let newTop = clamp(startCrop.top + dy);
      
      // Keep within bounds
      if (newLeft + cropWidth > 1) newLeft = 1 - cropWidth;
      if (newTop + cropHeight > 1) newTop = 1 - cropHeight;
      
      newCrop.left = newLeft;
      newCrop.top = newTop;
      newCrop.right = 1 - newLeft - cropWidth;
      newCrop.bottom = 1 - newTop - cropHeight;
    } else {
      // Resize from a handle
      const handle = dragState.current.handle!;
      const minSize = 0.05; // Minimum 5% size

      if (handle.includes('n')) {
        newCrop.top = clamp(startCrop.top + dy);
        // Ensure minimum size
        if (1 - newCrop.top - startCrop.bottom < minSize) {
          newCrop.top = 1 - startCrop.bottom - minSize;
        }
      }
      if (handle.includes('s')) {
        newCrop.bottom = clamp(startCrop.bottom - dy);
        if (1 - startCrop.top - newCrop.bottom < minSize) {
          newCrop.bottom = 1 - startCrop.top - minSize;
        }
      }
      if (handle.includes('w')) {
        newCrop.left = clamp(startCrop.left + dx);
        if (1 - newCrop.left - startCrop.right < minSize) {
          newCrop.left = 1 - startCrop.right - minSize;
        }
      }
      if (handle.includes('e')) {
        newCrop.right = clamp(startCrop.right - dx);
        if (1 - startCrop.left - newCrop.right < minSize) {
          newCrop.right = 1 - startCrop.left - minSize;
        }
      }
    }

    setCrop(newCrop);
  };

  // Handle mouse up
  const handleMouseUp = () => {
    dragState.current = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  // Start dragging
  const startDrag = (e: React.MouseEvent, type: 'move' | 'resize', handle?: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w') => {
    e.preventDefault();
    e.stopPropagation();
    
    dragState.current = {
      type,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...crop }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Calculate positions
  const left = crop.left * 100;
  const top = crop.top * 100;
  const width = (1 - crop.left - crop.right) * 100;
  const height = (1 - crop.top - crop.bottom) * 100;

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-50"
      style={{ pointerEvents: 'auto' }}
    >
      {/* Dark overlay with hole for crop area */}
      <div
        className="absolute"
        style={{
          left: `${left}%`,
          top: `${top}%`,
          width: `${width}%`,
          height: `${height}%`,
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
          border: '2px solid white',
          cursor: 'move'
        }}
        onMouseDown={(e) => startDrag(e, 'move')}
      />

      {/* Corner and edge handles */}
      {[
        { pos: 'nw', cursor: 'nwse-resize', left: crop.left, top: crop.top },
        { pos: 'n', cursor: 'ns-resize', left: crop.left + (1 - crop.left - crop.right) / 2, top: crop.top },
        { pos: 'ne', cursor: 'nesw-resize', left: 1 - crop.right, top: crop.top },
        { pos: 'e', cursor: 'ew-resize', left: 1 - crop.right, top: crop.top + (1 - crop.top - crop.bottom) / 2 },
        { pos: 'se', cursor: 'nwse-resize', left: 1 - crop.right, top: 1 - crop.bottom },
        { pos: 's', cursor: 'ns-resize', left: crop.left + (1 - crop.left - crop.right) / 2, top: 1 - crop.bottom },
        { pos: 'sw', cursor: 'nesw-resize', left: crop.left, top: 1 - crop.bottom },
        { pos: 'w', cursor: 'ew-resize', left: crop.left, top: crop.top + (1 - crop.top - crop.bottom) / 2 },
      ].map(({ pos, cursor, left, top }) => (
        <div
          key={pos}
          className="absolute w-3 h-3 bg-white border-2 border-black rounded-sm"
          style={{
            left: `${left * 100}%`,
            top: `${top * 100}%`,
            transform: 'translate(-50%, -50%)',
            cursor
          }}
          onMouseDown={(e) => startDrag(e, 'resize', pos as any)}
        />
      ))}

      {/* Instructions */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/75 text-white text-xs px-3 py-2 rounded">
        Press <kbd className="px-1.5 py-0.5 bg-white/20 rounded">Enter</kbd> to apply or <kbd className="px-1.5 py-0.5 bg-white/20 rounded">Esc</kbd> to cancel
      </div>
    </div>
  );
};