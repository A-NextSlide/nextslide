/**
 * Debug utility for logging slide image information
 * Used to help diagnose image loading and display issues
 */

export function debugSlideImages(slides: any[]) {
  if (!slides || !Array.isArray(slides)) {
    console.log('[DebugSlideImages] No slides provided or not an array');
    return;
  }

  console.log('[DebugSlideImages] Checking images in slides:', {
    totalSlides: slides.length,
    slidesWithComponents: slides.filter(s => s.components && s.components.length > 0).length
  });

  slides.forEach((slide, slideIndex) => {
    if (!slide.components || slide.components.length === 0) {
      return;
    }

    const imageComponents = slide.components.filter((comp: any) => 
      comp.type === 'Image' || comp.type === 'image'
    );

    if (imageComponents.length > 0) {
      console.log(`[DebugSlideImages] Slide ${slideIndex} (${slide.id || 'no-id'}) has ${imageComponents.length} images:`, {
        slideTitle: slide.title,
        slideStatus: slide.status,
        images: imageComponents.map((img: any) => ({
          id: img.id,
          type: img.type,
          src: img.props?.src,
          isExternal: img.props?.src?.startsWith('http'),
          isBase64: img.props?.src?.startsWith('data:'),
          isPlaceholder: img.props?.src?.includes('placeholder'),
          dimensions: {
            width: img.props?.width,
            height: img.props?.height,
            x: img.props?.position?.x,
            y: img.props?.position?.y
          },
          animation: img.props?.animation,
          filter: img.props?.filter
        }))
      });
    }
  });

  // Also check for background images in Shape components
  const shapesWithBackgrounds = slides.flatMap((slide, slideIndex) => 
    (slide.components || [])
      .filter((comp: any) => 
        comp.type === 'Shape' && 
        comp.props?.backgroundImage
      )
      .map((shape: any) => ({
        slideIndex,
        slideId: slide.id,
        shapeId: shape.id,
        backgroundImage: shape.props.backgroundImage
      }))
  );

  if (shapesWithBackgrounds.length > 0) {
    console.log('[DebugSlideImages] Found shapes with background images:', shapesWithBackgrounds);
  }
}
