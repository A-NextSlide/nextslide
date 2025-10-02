/**
 * GoogleSlideService.ts
 * 
 * This service provides functionality for parsing Google Slides files locally.
 */

import JSZip from 'jszip';
// import { parseString } from 'xml2js';

// Define types we need
export interface GoogleSlideParsingOptions {
  includeStyles?: boolean;
  includeImages?: boolean;
  includeNotes?: boolean;
}

export interface SlideContent {
  id: string;
  title?: string;
  elements: SlideElement[];
}

export interface SlideElement {
  type: string;
  content?: string;
  properties?: any;
  rawProperties?: any; // Store the raw OpenXML properties for later detailed mapping
  id?: string; // Ensure elements have an ID
  name?: string;
}

// Helper to convert EMU to pixels
const EMU_PER_INCH = 914400;
const DPI = 96; // Standard DPI for web

const emuToPx = (emu: number): number => {
  return (emu / EMU_PER_INCH) * DPI;
};

// Function to look up a color in the theme XML
const getThemeColor = async (zip: JSZip, schemeClrNode: any): Promise<string | null> => {
  if (!schemeClrNode || !schemeClrNode.val) return null;
  const schemeColorName = schemeClrNode.val;

  // Assuming only one theme file, common case
  const themePath = Object.keys(zip.files).find(path => path.startsWith('ppt/theme/theme') && path.endsWith('.xml'));
  if (!themePath) return null;

  try {
    const themeXml = await getFileFromZip(zip, themePath);
    if (!themeXml) return null;
    const themeData = await parseXml(themeXml);

    const clrScheme = themeData?.['a:theme']?.['a:themeElements']?.[0]?.['a:clrScheme']?.[0];
    if (!clrScheme) return null;

    const colorElement = clrScheme[`a:${schemeColorName}`]?.[0];
    if (colorElement) {
      const srgbClr = colorElement['a:srgbClr']?.[0]?.$?.val;
      if (srgbClr) return `#${srgbClr}`;
      // TODO: Handle other color types like sysClr if necessary
    }
  } catch (error) {
    console.error(`Error parsing theme color for ${schemeColorName}:`, error);
  }
  return null; // Return black or a default if not found or error
};

const getColorFromNode = async (zip: JSZip, colorNodeContainer: any, defaultColor: string = '000000'): Promise<string> => {
  if (!colorNodeContainer) return `#${defaultColor}FF`;

  let colorHex = defaultColor;
  let alpha = 'FF'; // Default to full opacity

  const srgbClr = colorNodeContainer['a:srgbClr']?.[0];
  const schemeClr = colorNodeContainer['a:schemeClr']?.[0];
  // TODO: Add other color types like prstClr, scrgbClr, hslClr, sysClr

  if (srgbClr?.$?.val) {
    colorHex = srgbClr.$.val;
  } else if (schemeClr?.$) {
    const themeColor = await getThemeColor(zip, schemeClr.$);
    if (themeColor) {
      colorHex = themeColor.startsWith('#') ? themeColor.substring(1) : themeColor;
    }
  }

  // Check for alpha modifiers within the color definition
  const alphaNodes = srgbClr?.['a:alpha'] || schemeClr?.['a:alpha'];
  if (alphaNodes && alphaNodes[0]?.$?.val) {
    const alphaPercentage = parseInt(alphaNodes[0].$.val, 10) / 1000; // val is 0-100000 for percentage
    alpha = Math.round(alphaPercentage * 255).toString(16).padStart(2, '0');
  }

  return `#${colorHex}${alpha}`.toUpperCase();
};

// Overload for slide dimension conversion to target 1920x1080
const convertDimension = (valueEmu: number, slideDimensionEmu: number, targetDimensionPx: number): number => {
  if (slideDimensionEmu === 0) return 0; // Avoid division by zero
  return (valueEmu / slideDimensionEmu) * targetDimensionPx;
};

// Function to parse an uploaded PowerPoint file
export const parseGoogleSlide = async (
  file: File, 
  options: GoogleSlideParsingOptions = {}
): Promise<any> => {
  // console.log('Parsing uploaded file:', file.name);

  if (file.name.endsWith('.pptx')) {
    try {
      return await parsePptx(file, options);
    } catch (error) {
      console.error('Error parsing PPTX:', error);
      throw new Error(`Failed to parse PPTX: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    // Fallback to mock data for unsupported file types
    console.warn('File type not directly supported. Returning mock data.');
  }
};

// Parse PPTX file using JSZip
const parsePptx = async (file: File, options: GoogleSlideParsingOptions): Promise<any> => {
  // Read the file as an ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  
  // Use JSZip to extract contents
  const zip = new JSZip();
  const contents = await zip.loadAsync(arrayBuffer);
  
  // Start building the result
  const result = {
    presentationId: file.name,
    title: file.name,
    slides: [] as any[],
    slideWidthPx: 1920, // Default, will be updated
    slideHeightPx: 1080, // Default, will be updated
    slideWidthEmu: 0, // Raw EMU width of the slide from PPTX
    slideHeightEmu: 0, // Raw EMU height of the slide from PPTX
  };
  
  // Debug: List all files in the zip to understand the structure
  // console.log('Files in PPTX:', Object.keys(contents.files));
  
  // Process presentation.xml for metadata
  const presentationXml = await getFileFromZip(contents, 'ppt/presentation.xml');
  if (presentationXml) {
    // console.log('Found presentation.xml');
    const presentationData = await parseXml(presentationXml);
    // console.log('Presentation data structure:', JSON.stringify(presentationData).substring(0, 500) + '...');
    
    // Extract default slide size
    const sldSz = presentationData?.['p:presentation']?.['p:sldSz']?.[0]?.$ || presentationData?.presentation?.sldSz?.[0]?.$;
    if (sldSz && sldSz.cx && sldSz.cy) {
      result.slideWidthEmu = parseInt(sldSz.cx, 10);
      result.slideHeightEmu = parseInt(sldSz.cy, 10);
      // We don't convert to pixels here, because we want to use these EMUs for relative calculations
      // The final conversion to 1920x1080 target happens per element.
      // console.log(`PPTX slide dimensions (EMU): ${result.slideWidthEmu} x ${result.slideHeightEmu}`);
    } else {
      console.warn('Could not find default slide size in presentation.xml. Using defaults for EMU calculations, but this might lead to inaccuracies.');
      // Default to 16:9 aspect ratio if not found, common for modern PPTX
      // 10 inches wide, 5.625 inches high for 16:9 (common default)
      // or 13.333 inches wide, 7.5 inches high for 16:9
      result.slideWidthEmu = 12192000; // Approx 13.33 inches in EMU for 16:9
      result.slideHeightEmu = 6858000; // Approx 7.5 inches in EMU for 16:9
    }
    
    // Try to find slides in multiple ways
    let slideCount = 0;
    
    // Method 1: Extract slide IDs from presentation.xml
    const slideIds = extractSlideIds(presentationData);
    // console.log('Found slide IDs:', slideIds);
    
    // Method 2: Directly look for slide files in the zip
    const slideFiles = Object.keys(contents.files).filter(path => 
      path.startsWith('ppt/slides/slide') && path.endsWith('.xml')
    );
    // console.log('Found slide files:', slideFiles);
    
    // Process each slide file we found directly
    for (const slidePath of slideFiles) {
      slideCount++;
      const slideIndex = parseInt(slidePath.replace(/\D/g, '')) || slideCount;
      const slideId = `slide${slideIndex}`;
      
      try {
        const slideXml = await getFileFromZip(contents, slidePath);
        if (slideXml) {
          const slideData = await parseXml(slideXml);
          const slideLayoutXmlPath = await getSlideLayoutPath(contents, slidePath);
          let slideLayoutData = null;
          if (slideLayoutXmlPath) {
            const slideLayoutXml = await getFileFromZip(contents, slideLayoutXmlPath);
            if (slideLayoutXml) slideLayoutData = await parseXml(slideLayoutXml);
          }

          const masterXmlPath = await getMasterPathForSlide(contents, slidePath, slideLayoutXmlPath);
          let masterSlideData = null;
          if (masterXmlPath) {
              const masterXml = await getFileFromZip(contents, masterXmlPath);
              if (masterXml) masterSlideData = await parseXml(masterXml);
          }

          result.slides.push({
            objectId: slideId,
            slideId: slideId,
            index: slideIndex,
            background: await extractBackground(slideData, slideLayoutData, masterSlideData, contents, result.slideWidthEmu, result.slideHeightEmu),
            pageElements: await extractSlideElements(slideData, result.slideWidthEmu, result.slideHeightEmu, contents, slidePath, slideLayoutData, masterSlideData)
          });
        }
      } catch (error) {
        console.error(`Error processing slide file ${slidePath}:`, error);
      }
    }
    
    // If we didn't find any slides using direct file search, try using the slide IDs
    if (result.slides.length === 0 && slideIds.length > 0) {
      for (let i = 0; i < slideIds.length; i++) {
        const slideId = slideIds[i];
        const slideData = await processSlide(contents, slideId, i + 1);
        if (slideData) {
          result.slides.push(slideData);
        }
      }
    }
  }
  
  // If we still have no slides, try a more aggressive approach
  if (result.slides.length === 0) {
    // console.log('No slides found using standard methods, trying alternative approach');
    await tryAlternativeSlideExtraction(contents, result);
  }
  
  return result;
};

// Alternative method to extract slides when standard methods fail
const tryAlternativeSlideExtraction = async (zip: JSZip, result: any): Promise<void> => {
  // Look for any XML files that might contain slide data
  const allXmlFiles = Object.keys(zip.files).filter(path => path.endsWith('.xml'));
  
  // Try to find relationship files that might point to slides
  const relsFiles = allXmlFiles.filter(path => path.includes('_rels') || path.endsWith('.rels'));
  
  for (const relsPath of relsFiles) {
    try {
      const relsXml = await getFileFromZip(zip, relsPath);
      if (relsXml) {
        const relsData = await parseXml(relsXml);
        // console.log(`Relationship file ${relsPath}:`, JSON.stringify(relsData).substring(0, 200) + '...');
        
        // Look for slide references in relationships
        const relationships = relsData?.Relationships?.Relationship || [];
        for (const rel of Array.isArray(relationships) ? relationships : [relationships]) {
          if (rel?.$?.Type?.includes('slide')) {
            const target = rel?.$?.Target;
            if (target) {
              // Try to resolve the target path
              const slidePath = target.startsWith('/') ? target.substring(1) : `ppt/${target}`;
              // console.log(`Found potential slide reference: ${slidePath}`);
              
              try {
                const slideXml = await getFileFromZip(zip, slidePath);
                if (slideXml) {
                  const slideData = await parseXml(slideXml);
                  const slideIndex = result.slides.length + 1;
                  result.slides.push({
                    objectId: `slide${slideIndex}`,
                    slideId: `slide${slideIndex}`,
                    index: slideIndex,
                    background: await extractBackground(slideData, null, null, zip, result.slideWidthEmu, result.slideHeightEmu),
                    pageElements: await extractSlideElements(slideData, result.slideWidthEmu, result.slideHeightEmu, zip, null, null)
                  });
                }
              } catch (error) {
                console.error(`Error processing potential slide ${slidePath}:`, error);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error processing relationship file ${relsPath}:`, error);
    }
  }
  
  // If we still don't have slides, try a brute force approach
  if (result.slides.length === 0) {
    // Try to guess slide numbers
    for (let i = 1; i <= 50; i++) { // Try up to 50 slides
      const slidePath = `ppt/slides/slide${i}.xml`;
      try {
        const slideXml = await getFileFromZip(zip, slidePath);
        if (slideXml) {
          const slideData = await parseXml(slideXml);
          result.slides.push({
            objectId: `slide${i}`,
            slideId: `slide${i}`,
            index: i,
            background: await extractBackground(slideData, null, null, zip, result.slideWidthEmu, result.slideHeightEmu),
            pageElements: await extractSlideElements(slideData, result.slideWidthEmu, result.slideHeightEmu, zip, null, null)
          });
        }
      } catch (error) {
        // Ignore errors here, we're just trying possible files
      }
    }
  }
};

// Helper to get file content from zip as text
const getFileFromZip = async (zip: JSZip, path: string): Promise<string | null> => {
  const file = zip.file(path);
  if (!file) return null;
  const content = await file.async('text');
  return content;
};

// Parse XML string to JS object
const parseXml = async (xmlString: string): Promise<any> => {
  const { parseString } = await import('xml2js');
  return new Promise((resolve, reject) => {
    parseString(xmlString, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
};

// Extract slide IDs from presentation.xml
const extractSlideIds = (presentationData: any): string[] => {
  try {
    const slideIds: string[] = [];
    
    // Try different possible structures
    const sldIdLst = presentationData?.presentation?.['p:sldIdLst']?.[0]?.['p:sldId'] || 
                     presentationData?.presentation?.sldIdLst?.[0]?.sldId ||
                     [];
    
    for (const sldId of sldIdLst) {
      if (sldId?.$?.id) {
        slideIds.push(sldId.$.id);
      } else if (sldId?.$?.['r:id']) {
        slideIds.push(sldId.$['r:id']);
      }
    }
    
    return slideIds;
  } catch (error) {
    console.error('Error extracting slide IDs:', error);
    return [];
  }
};

// Process a single slide
const processSlide = async (zip: JSZip, slideId: string, index: number): Promise<any | null> => {
  try {
    // Find the slide XML file
    const slideXml = await getFileFromZip(zip, `ppt/slides/slide${index}.xml`);
    if (!slideXml) return null;
    
    // Parse the slide XML
    const slideData = await parseXml(slideXml);
    
    // Extract text and other content
    return {
      objectId: `slide${index}`,
      slideId: slideId,
      index: index,
      rawSlideData: slideData, // Return raw data for background processing later
      pageElements: await extractSlideElements(slideData, 0,0, zip, `ppt/slides/slide${index}.xml`) 
    };
  } catch (error) {
    console.error(`Error processing slide ${index}:`, error);
    return null;
  }
};

// Extract elements from a slide
const extractSlideElements = async (slideData: any, slideWidthEmu: number, slideHeightEmu: number, zip: JSZip, slidePath: string, slideLayoutData?: any, masterSlideData?: any): Promise<any[]> => {
  const elements: any[] = [];
  const slideRelsPath = slidePath.replace('slides/', 'slides/_rels/') + '.rels';
  let slideRelsData: any = null;
  try {
    const slideRelsXml = await getFileFromZip(zip, slideRelsPath);
    if (slideRelsXml) slideRelsData = await parseXml(slideRelsXml);
  } catch (e) { console.error('Could not parse slide rels an error', e); }
  
  try {
    // console.log('Slide data structure:', JSON.stringify(slideData).substring(0, 500) + '...');
    
    // Find all possible shape containers
    const shapes = findShapesInSlide(slideData);
    // console.log(`Found ${shapes.length} shapes in slide`);
    
    // Process each shape
    for (const shape of shapes) {
      try {
        // Extract shape ID and name
        const nvSpPr = shape?.['p:nvSpPr']?.[0] || shape?.nvSpPr?.[0];
        const cNvPr = nvSpPr?.['p:cNvPr']?.[0] || nvSpPr?.cNvPr?.[0];
        const objectId = cNvPr?.$?.id || `element${elements.length + 1}`;
        const name = cNvPr?.$?.name || '';
        const ph = nvSpPr?.['p:nvPr']?.[0]?.['p:ph']?.[0]; // Placeholder info

        // Extract transform (position and size)
        const spPrNode = shape?.['p:spPr']?.[0] || shape?.spPr?.[0];
        const xfrm = spPrNode?.['a:xfrm']?.[0] || spPrNode?.xfrm?.[0];
        let position = { x: 0, y: 0 };
        let size = { width: 0, height: 0 };

        if (xfrm) {
          const off = xfrm?.['a:off']?.[0]?.$ || xfrm?.off?.[0]?.$;
          const ext = xfrm?.['a:ext']?.[0]?.$ || xfrm?.ext?.[0]?.$;
          if (off && off.x && off.y) {
            position = {
              x: convertDimension(parseInt(off.x, 10), slideWidthEmu, 1920),
              y: convertDimension(parseInt(off.y, 10), slideHeightEmu, 1080),
            };
          }
          if (ext && ext.cx && ext.cy) {
            size = {
              width: convertDimension(parseInt(ext.cx, 10), slideWidthEmu, 1920),
              height: convertDimension(parseInt(ext.cy, 10), slideHeightEmu, 1080),
            };
          }
        }
        
        // Extract rotation from xfrm
        const rotation = xfrm?.$?.rot ? parseInt(xfrm.$.rot, 10) / 60000 : 0; // Rotation in 60000ths of a degree

        // Extract shape geometry
        const prstGeom = spPrNode?.['a:prstGeom']?.[0];
        const shapeType = prstGeom?.$?.prst || 'rect'; // Default to rectangle

        // Extract fill properties
        let fillProps = { type: 'solid', color: '#00000000' }; // Default: transparent
        if (spPrNode?.['a:solidFill']?.[0]) {
          fillProps.color = await getColorFromNode(zip, spPrNode['a:solidFill'][0], 'FFFFFF'); // Default white if color not specified
        } else if (spPrNode?.['a:noFill']?.[0]) {
          fillProps.type = 'none';
        } // TODO: Add gradFill, pattFill, blipFill for shapes here too

        // Extract stroke (outline) properties
        let strokeProps = { width: 0, color: '#00000000', type: 'solid' }; // Default: no stroke
        const lnNode = spPrNode?.['a:ln']?.[0];
        if (lnNode) {
          strokeProps.width = convertDimension(parseInt(lnNode.$?.w || '0', 10), Math.min(slideWidthEmu, slideHeightEmu), Math.min(1920,1080)); // Width in EMUs, rough conversion for now
          if (lnNode['a:solidFill']?.[0]) {
            strokeProps.color = await getColorFromNode(zip, lnNode['a:solidFill'][0]);
          } else if (lnNode['a:noFill']?.[0]) {
            strokeProps.width = 0; // No fill means no visible stroke
            strokeProps.color = '#00000000';
          } // TODO: Add other line fill types (gradFill, etc.) and dash styles (prstDash)
        }
        
        // Extract text content and detailed styling
        const { textRuns, overallAlignment } = await extractTextFromShape(shape, zip);

        let elementType = 'Unknown';
        let elementProps: any = {
            id: objectId,
            name: name,
            position,
            width: size.width,
            height: size.height,
            rotation: rotation,
            opacity: 1, // TODO: Parse opacity from alpha values in fills/lines or overall shape alpha
            zIndex: elements.length + 1, // Basic zIndex
            isPlaceholder: !!ph, // Mark if it's a placeholder
            placeholderType: ph?.$?.type || null
        };

        if (textRuns.length > 0) {
          elementType = 'TiptapTextBlock'; 
          elementProps.texts = convertRunsToTiptap(textRuns);
          elementProps.alignment = overallAlignment || 'left'; // Default from paragraph or run
          // Apply first run's font style as a default for the block, can be overridden by Tiptap internal styles
          if (textRuns[0]) {
            elementProps.fontFamily = textRuns[0].style.fontFamily || 'Arial';
            elementProps.fontSize = textRuns[0].style.fontSize || 18;
            elementProps.textColor = textRuns[0].style.textColor || '#000000';
            elementProps.fontWeight = textRuns[0].style.bold ? 'bold' : 'normal';
            elementProps.fontStyle = textRuns[0].style.italic ? 'italic' : 'normal';
            // TODO: backgroundColor, letterSpacing, lineHeight, verticalAlignment, padding (from spPr -> bodyPr?)
            elementProps.backgroundColor = '#00000000';
            elementProps.letterSpacing = 0;
            elementProps.lineHeight = 1.5;
            elementProps.verticalAlignment = 'top';
            elementProps.padding = 0;
          }
        } else if (shape['p:pic']?.[0]) { // Check for Picture element
          // This is a picture element
            elementType = 'Image';
          
          // Extract picture properties
          const pic = shape['p:pic'][0];
          const nvPicPr = pic['p:nvPicPr']?.[0];
          const blipFill = pic['p:blipFill']?.[0];
          const spPr = pic['p:spPr']?.[0];
          
          // Get the image relationship ID
          const blip = blipFill?.['a:blip']?.[0];
          const rId = blip?.$?.['r:embed'] || blip?.$?.['r:link'];
            
            // console.log(`Processing image element with ID: ${objectId}, name: ${name}`);
          // console.log(`Image has relationship ID: ${rId}`);
            
            if (rId && slideRelsData) {
                const target = getRelationshipTarget(slideRelsData, rId);
            // console.log(`Image relationship target: ${target}`);
                
                if (target) {
              // Resolve the image path
                    const imagePath = target.startsWith('../') ? `ppt/${target.substring(3)}` : `ppt/media/${target}`;
                    // console.log(`Resolved image path: ${imagePath}`);
                    
              // Try to get the image from the zip
                        const imageFile = zip.file(imagePath);
                        if (imageFile) {
                            // console.log(`Found image file in zip at path: ${imagePath}`);
                const base64 = await imageFile.async('base64');
                // console.log(`Successfully converted image to base64, length: ${base64.length} chars`);
                            const mimeType = getMimeTypeFromPath(imagePath);
                elementProps.src = `data:${mimeType};base64,${base64}`;
                        } else {
                // console.log(`Could not find image file in zip at path: ${imagePath}`);
                elementProps.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; // 1x1 transparent pixel
              }
            }
          }
          
          // Handle image cropping from srcRect
          const srcRect = blipFill?.['a:srcRect']?.[0]?.$;
          if (srcRect) {
            // console.log(`Image crop detected:`, srcRect);
            const cropRect = {
              left: parseInt(srcRect.l || '0') / 100000, // Convert from 100,000ths
              top: parseInt(srcRect.t || '0') / 100000,
              right: parseInt(srcRect.r || '0') / 100000,
              bottom: parseInt(srcRect.b || '0') / 100000,
            };
            elementProps.cropRect = cropRect;
          }
          
          // Handle image shape clipping
          const prstGeom = spPr?.['a:prstGeom']?.[0];
          if (prstGeom?.$?.prst) {
            const mappedShape = mapOpenXmlShapeToAppShape(prstGeom.$.prst);
            // console.log(`Image has clip shape: ${prstGeom.$.prst} (mapped to ${mappedShape})`);
            elementProps.clipShape = mappedShape;
            
            // Rounded rect hint
            if (prstGeom.$.prst === 'roundRect') {
              // TODO: Extract actual corner radius from adjustments
              elementProps.borderRadius = 10;
            }
          }
          
          // Extract other image properties
          elementProps.alt = nvPicPr?.['p:cNvPr']?.[0]?.$?.descr || 'Image';
          elementProps.objectFit = 'cover'; // Default to cover to avoid visible letterboxing with crops
          
          // Check for stretch or tile
          const stretch = blipFill?.['a:stretch']?.[0];
          const tile = blipFill?.['a:tile']?.[0];
          if (stretch) {
            elementProps.objectFit = 'cover';
          } else if (tile) {
            elementProps.objectFit = 'repeat'; // Not standard, but indicates tiling
          }
        } else if (shape['p:cxnSp']) {
          // This is a connector shape (line)
          elementType = 'Line';
          const cxnSp = shape['p:cxnSp'][0] || shape['p:cxnSp'];
          
          // Extract line-specific properties from nvCxnSpPr
          const nvCxnSpPr = cxnSp['p:nvCxnSpPr']?.[0];
          const cNvPr = nvCxnSpPr?.['p:cNvPr']?.[0];
          elementProps.id = cNvPr?.$?.id || `line${elements.length + 1}`;
          elementProps.name = cNvPr?.$?.name || '';
          
          // Extract line properties from spPr
          const spPr = cxnSp['p:spPr']?.[0];
          
          // Get transform for start/end points
          const xfrm = spPr?.['a:xfrm']?.[0];
          if (xfrm) {
            const off = xfrm?.['a:off']?.[0]?.$;
            const ext = xfrm?.['a:ext']?.[0]?.$;
            
            if (off && ext) {
              const startX = convertDimension(parseInt(off.x, 10), slideWidthEmu, 1920);
              const startY = convertDimension(parseInt(off.y, 10), slideHeightEmu, 1080);
              const width = convertDimension(parseInt(ext.cx, 10), slideWidthEmu, 1920);
              const height = convertDimension(parseInt(ext.cy, 10), slideHeightEmu, 1080);
              
              // Lines are defined by start and end points
              elementProps.startPoint = { x: startX, y: startY };
              elementProps.endPoint = { x: startX + width, y: startY + height };
              
              // Also store position and size for compatibility
              elementProps.position = { x: startX, y: startY };
              elementProps.width = width;
              elementProps.height = height;
            }
            
            // Extract rotation if present
            elementProps.rotation = xfrm?.$?.rot ? parseInt(xfrm.$.rot, 10) / 60000 : 0;
          }
          
          // Extract line style
          const ln = spPr?.['a:ln']?.[0];
          if (ln) {
            elementProps.strokeWidth = convertDimension(parseInt(ln.$?.w || '12700', 10), Math.min(slideWidthEmu, slideHeightEmu), Math.min(1920, 1080));
            
            // Line color
            if (ln['a:solidFill']?.[0]) {
              elementProps.stroke = await getColorFromNode(zip, ln['a:solidFill'][0]);
                } else {
              elementProps.stroke = '#000000FF';
                }
            
            // Line style (dash pattern)
            const prstDash = ln['a:prstDash']?.[0];
            if (prstDash?.$?.val) {
              elementProps.lineStyle = prstDash.$.val; // 'solid', 'dash', 'dot', etc.
            } else {
              elementProps.lineStyle = 'solid';
            }
            
            // Line end markers (arrows)
            const headEnd = ln['a:headEnd']?.[0];
            const tailEnd = ln['a:tailEnd']?.[0];
            if (headEnd?.$?.type) {
              elementProps.endMarker = headEnd.$.type; // 'arrow', 'diamond', etc.
            }
            if (tailEnd?.$?.type) {
              elementProps.startMarker = tailEnd.$.type;
            }
            }
            
          // Connector type (straight, elbow, curved)
          const prstGeom = spPr?.['a:prstGeom']?.[0];
          elementProps.connectorType = prstGeom?.$?.prst || 'line';
          
        } else if (shape['p:graphicFrame']) {
          // This is a graphic frame (table, chart, etc.)
          const graphicFrame = shape['p:graphicFrame'][0] || shape['p:graphicFrame'];
          const graphic = graphicFrame['a:graphic']?.[0];
          const graphicData = graphic?.['a:graphicData']?.[0];
          
          // Check the URI to determine the type
          const uri = graphicData?.$?.uri;
          // console.log(`Graphic frame URI: ${uri}`);
          
          if (uri && uri.includes('table')) {
            // This is a table
            elementType = 'Table';
            
            // Extract table properties
            const tbl = graphicData?.['a:tbl']?.[0];
            if (tbl) {
              // Extract table grid (columns)
              const tblGrid = tbl['a:tblGrid']?.[0];
              const gridCols = tblGrid?.['a:gridCol'] || [];
              elementProps.columns = gridCols.map((col: any) => ({
                width: convertDimension(parseInt(col.$?.w || '0', 10), slideWidthEmu, 1920)
              }));
              
              // Extract table rows
              const rows = tbl['a:tr'] || [];
              elementProps.rows = [];
              
              for (const row of rows) {
                const cells = row['a:tc'] || [];
                const rowData: any[] = [];
                
                for (const cell of cells) {
                  // Extract cell text
                  const txBody = cell['a:txBody']?.[0];
                  const { textRuns } = await extractTextFromShape({ 'p:txBody': [txBody] }, zip);
                  
                  // Cell properties
                  const tcPr = cell['a:tcPr']?.[0];
                  const cellData = {
                    content: textRuns.map(run => run.text).join(''),
                    textRuns: textRuns,
                    // Cell styling
                    fill: tcPr?.['a:solidFill'] ? await getColorFromNode(zip, tcPr['a:solidFill'][0]) : '#FFFFFF00',
                    borders: {
                      top: tcPr?.['a:lnT'] ? await extractLineStyle(tcPr['a:lnT'][0], zip) : null,
                      right: tcPr?.['a:lnR'] ? await extractLineStyle(tcPr['a:lnR'][0], zip) : null,
                      bottom: tcPr?.['a:lnB'] ? await extractLineStyle(tcPr['a:lnB'][0], zip) : null,
                      left: tcPr?.['a:lnL'] ? await extractLineStyle(tcPr['a:lnL'][0], zip) : null,
                    },
                    rowSpan: parseInt(tcPr?.$?.rowSpan || '1', 10),
                    colSpan: parseInt(tcPr?.$?.gridSpan || '1', 10),
                  };
                  
                  rowData.push(cellData);
                }
                
                elementProps.rows.push(rowData);
              }
              
              // Table styling
              const tblPr = tbl['a:tblPr']?.[0];
              elementProps.tableStyle = {
                firstRow: tblPr?.$?.firstRow === '1',
                firstCol: tblPr?.$?.firstCol === '1',
                lastRow: tblPr?.$?.lastRow === '1',
                lastCol: tblPr?.$?.lastCol === '1',
                bandRow: tblPr?.$?.bandRow === '1',
                bandCol: tblPr?.$?.bandCol === '1',
              };
            }
          } else if (uri && uri.includes('chart')) {
            // This is a chart
            elementType = 'Chart';
            // Chart parsing would be complex, for now just mark it
            elementProps.chartType = 'unknown';
            elementProps.chartData = null;
          }
          
          // Extract frame properties
          const nvGraphicFramePr = graphicFrame['p:nvGraphicFramePr']?.[0];
          const cNvPr = nvGraphicFramePr?.['p:cNvPr']?.[0];
          elementProps.id = cNvPr?.$?.id || `graphic${elements.length + 1}`;
          elementProps.name = cNvPr?.$?.name || '';
          
          // Extract transform
          const xfrm = graphicFrame['p:xfrm']?.[0];
          if (xfrm) {
            const off = xfrm?.['a:off']?.[0]?.$;
            const ext = xfrm?.['a:ext']?.[0]?.$;
            
            if (off) {
              elementProps.position = {
                x: convertDimension(parseInt(off.x, 10), slideWidthEmu, 1920),
                y: convertDimension(parseInt(off.y, 10), slideHeightEmu, 1080),
              };
            }
            
            if (ext) {
              elementProps.width = convertDimension(parseInt(ext.cx, 10), slideWidthEmu, 1920);
              elementProps.height = convertDimension(parseInt(ext.cy, 10), slideHeightEmu, 1080);
            }
          }
          
        } else {
          // Check for regular shape with geometry
          const prstGeom = spPrNode?.['a:prstGeom']?.[0];
          if (prstGeom?.$?.prst) {
            elementType = 'Shape';
            elementProps.shapeType = mapOpenXmlShapeToAppShape(prstGeom.$.prst);
            elementProps.fill = fillProps.color;
            elementProps.stroke = strokeProps.color;
            elementProps.strokeWidth = strokeProps.width;
          }
        }

        // TODO: Add more element type detection (Chart, Table etc.)
        // and populate their specific props.
        // For charts/tables, look for p:graphicFrame -> a:graphic -> a:graphicData -> specific URIs

        if (elementType !== 'Unknown') {
            elements.push({
              id: objectId,
              type: elementType,
              name: name,
              props: elementProps,
              rawProperties: shape // Store raw shape for deeper inspection if needed
            });
        } else {
            // console.log('Skipping unknown element type for shape:', shape);
        }

      } catch (error) {
        console.error('Error processing shape:', error);
      }
    }
  } catch (error) {
    console.error('Error extracting slide elements:', error);
  }
  
  return elements;
};

// Helper to find shapes in different slide structures
const findShapesInSlide = (slideData: any): any[] => {
  const shapes: any[] = [];
  
  try {
    // Get the shape tree
    const spTree = slideData?.['p:sld']?.['p:cSld']?.[0]?.['p:spTree']?.[0] || 
                   slideData?.sld?.cSld?.[0]?.spTree?.[0];
    
    if (spTree) {
    // Standard PPTX format for shapes
      const standardShapes = spTree['p:sp'] || [];
      shapes.push(...(Array.isArray(standardShapes) ? standardShapes : [standardShapes]));
    
      // Find picture elements (p:pic)
      const standardPics = spTree['p:pic'] || [];
      // console.log(`Found ${Array.isArray(standardPics) ? standardPics.length : 1} picture elements`);
      shapes.push(...(Array.isArray(standardPics) ? standardPics : [standardPics]));
    
      // Find connector shapes (lines) - p:cxnSp
      const connectorShapes = spTree['p:cxnSp'] || [];
      // console.log(`Found ${Array.isArray(connectorShapes) ? connectorShapes.length : 1} connector shapes (lines)`);
      shapes.push(...(Array.isArray(connectorShapes) ? connectorShapes : [connectorShapes]));
    
      // Find graphic frames (tables, charts) - p:graphicFrame
      const graphicFrames = spTree['p:graphicFrame'] || [];
      // console.log(`Found ${Array.isArray(graphicFrames) ? graphicFrames.length : 1} graphic frames (tables/charts)`);
      shapes.push(...(Array.isArray(graphicFrames) ? graphicFrames : [graphicFrames]));
    }
    
    // Try to find any shape-like elements with text or picture elements
    const findShapesRecursive = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;
      
      // Check if this object looks like a shape with text
      if (obj['p:txBody'] || obj.txBody) {
        shapes.push(obj);
      }
      
      // Check if this is a picture element
      if (obj['p:pic'] || obj.pic || obj.tagName === 'p:pic') {
        // console.log('Found picture element during recursive search');
        shapes.push(obj);
      }
      
      // Check if this is a connector shape (line)
      if (obj['p:cxnSp'] || obj.cxnSp || obj.tagName === 'p:cxnSp') {
        // console.log('Found connector shape during recursive search');
        shapes.push(obj);
      }
      
      // Check if this is a graphic frame (table/chart)
      if (obj['p:graphicFrame'] || obj.graphicFrame || obj.tagName === 'p:graphicFrame') {
        // console.log('Found graphic frame during recursive search');
        shapes.push(obj);
      }
      
      // Check all arrays and objects recursively
      for (const key in obj) {
        if (Array.isArray(obj[key])) {
          obj[key].forEach((item: any) => findShapesRecursive(item));
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          findShapesRecursive(obj[key]);
        }
      }
    };
    
    // Always use recursive search to find more elements
      findShapesRecursive(slideData);
  } catch (error) {
    console.error('Error finding shapes in slide:', error);
  }
  
  // Remove any undefined/null elements that might have been added
  const validShapes = shapes.filter(shape => shape && typeof shape === 'object');
  
  // Log total found elements for debugging
  // console.log(`Total slide elements found: ${validShapes.length}`);
  // console.log(`Found ${validShapes.length} shapes in slide`);
  
  return validShapes;
};

// Helper to extract shape ID
const extractShapeId = (nvSpPr: any): string | null => {
  if (!nvSpPr) return null;
  
  try {
    // Try different possible paths
    return nvSpPr?.['p:cNvPr']?.[0]?.$?.id || 
           nvSpPr?.cNvPr?.[0]?.$?.id ||
           nvSpPr?.['p:cNvPr']?.$?.id ||
           nvSpPr?.cNvPr?.$?.id ||
           null;
  } catch (error) {
    return null;
  }
};

// Helper to extract shape name
const extractShapeName = (nvSpPr: any): string | null => {
  if (!nvSpPr) return null;
  
  try {
    // Try different possible paths
    return nvSpPr?.['p:cNvPr']?.[0]?.$?.name || 
           nvSpPr?.cNvPr?.[0]?.$?.name ||
           nvSpPr?.['p:cNvPr']?.$?.name ||
           nvSpPr?.cNvPr?.$?.name ||
           null;
  } catch (error) {
    return null;
  }
};

// Extract text from a shape
const extractTextFromShape = async (shape: any, zip: JSZip): Promise<{ textRuns: any[], overallAlignment: string | null }> => {
  const textRuns: any[] = [];
  let overallAlignment: string | null = null;
  try {
    // Try different possible paths to text body
    const textBody = shape?.['p:txBody']?.[0] || shape?.txBody?.[0] || shape?.['p:txBody'] || shape?.txBody;
    if (!textBody) return { textRuns: [], overallAlignment: null };
    
    // Try different possible paths to paragraphs
    const paragraphs = textBody['a:p'] || textBody?.p || [];
    
    for (const paragraph of Array.isArray(paragraphs) ? paragraphs : [paragraphs]) {
      // Try different possible paths to text runs
      const runs = paragraph['a:r'] || paragraph?.r || [];
      const pPr = paragraph?.['a:pPr']?.[0] || paragraph?.pPr?.[0]; // Paragraph properties
      if (pPr && pPr.$?.algn) {
          if (!overallAlignment) overallAlignment = pPr.$.algn; // Take first paragraph alignment as overall
          // Could also collect all and decide, or pass per-paragraph alignment to Tiptap
      }
      
      for (const run of Array.isArray(runs) ? runs : [runs]) {
        // Try different possible paths to text
        const textContent = run['a:t']?.[0] || run?.t?.[0] || run['a:t'] || run?.t;
        const rPr = run?.['a:rPr']?.[0] || run?.rPr?.[0]; // Run properties

        if (textContent !== undefined) {
          const currentText = (typeof textContent === 'string' ? textContent : textContent._) || '';
          let style: any = {
            fontSize: parseInt(rPr?.$?.sz || '1800', 10) / 100, // Size in 100ths of a point
            bold: rPr?.$?.b === '1' || rPr?.$?.b === 'true',
            italic: rPr?.$?.i === '1' || rPr?.$?.i === 'true',
            underline: rPr?.$?.u && rPr.$.u !== 'none', // various underline styles exist
            strike: rPr?.$?.strike && rPr.$.strike !== 'noStrike', // e.g., sngStrike, dblStrike
            fontFamily: rPr?.['a:latin']?.[0]?.$?.typeface || rPr?.['a:ea']?.[0]?.$?.typeface || rPr?.['a:cs']?.[0]?.$?.typeface || 'Arial',
            textColor: '#000000FF', // Default black
            backgroundColor: '#00000000', // Default transparent background for text run
          };

          if (rPr?.['a:solidFill']?.[0]) {
            style.textColor = await getColorFromNode(zip, rPr['a:solidFill'][0]);
          } else if (rPr?.['a:noFill']?.[0]) {
            style.textColor = '#000000FF'; // Or inherit from a higher level
          }
          // TODO: Handle highlight color (rPr -> highlight)

          textRuns.push({ text: currentText, style });
        }
      }
      
      // Also check for direct text in paragraph (less common for styled text)
      const directText = paragraph?.['a:t'] || paragraph?.t;
      if (directText && runs.length === 0) { // Only if no runs, to avoid duplication
        const currentText = (typeof directText === 'string' ? directText : directText._) || '';
        // Basic style for direct text, can inherit from pPr default run properties (defRPr)
        const defRPr = pPr?.['a:defRPr']?.[0] || pPr?.defRPr?.[0];
        textRuns.push({ 
            text: currentText, 
            style: { 
                fontSize: parseInt(defRPr?.$?.sz || '1800', 10) / 100, 
                bold: defRPr?.$?.b === '1',
                italic: defRPr?.$?.i === '1',
                // ... other default styles ...
                fontFamily: defRPr?.['a:latin']?.[0]?.$?.typeface || 'Arial',
                textColor: '#000000FF',
                backgroundColor: '#00000000',
            }
        });
      }
      
      // text += '\n'; // Handled by Tiptap structure
    }
    
    return { textRuns, overallAlignment };
  } catch (error) {
    console.error('Error extracting text from shape:', error);
    return { textRuns: [], overallAlignment: null };
  }
};

const convertRunsToTiptap = (textRuns: any[]): any => {
  // Basic conversion: assumes all runs belong to a single paragraph for now.
  // More sophisticated logic would group runs by their original paragraphs.
  if (textRuns.length === 0) {
    return { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
  }

  const paragraphContent = textRuns.map(run => ({
    type: 'text',
    text: run.text,
    marks: [
      ...(run.style.bold ? [{ type: 'bold' }] : []),
      ...(run.style.italic ? [{ type: 'italic' }] : []),
      ...(run.style.underline ? [{ type: 'underline' }] : []),
      ...(run.style.strike ? [{ type: 'strike' }] : []),
      // TODO: Add marks for color, font family, font size if they differ from block defaults
      // This requires comparing to the TiptapTextBlock's main props.
      // For now, these are applied directly to the text node style in Tiptap if supported, or via block props.
      {
        type: 'textStyle', // Custom mark for more detailed styling if needed
        attrs: {
          textColor: run.style.textColor,
          backgroundColor: run.style.backgroundColor, // If you support text background highlight
          // fontFamily: run.style.fontFamily, // Usually handled by block or specific font marks
          // fontSize: run.style.fontSize, // Usually handled by block or specific size marks
        }
      }
    ].filter(mark => mark !== null)
  }));

  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        // TODO: Add paragraph alignment here if available and different from block default
        content: paragraphContent,
      },
    ],
  };
};

// Check if a file appears to be a Google Slides file
export const isGoogleSlideFile = (file: File): boolean => {
  const fileName = file.name.toLowerCase();
  // Only accept .pptx files for direct parsing
  return fileName.endsWith('.pptx');
};

// Extract text content from a parsed Google Slides presentation
export const extractTextContent = (slideData: any): Record<string, string[]> => {
  const textBySlide: Record<string, string[]> = {};
  
  if (slideData?.slides && Array.isArray(slideData.slides)) {
    slideData.slides.forEach((slide: any, index: number) => {
      const slideId = slide.objectId || `slide${index + 1}`;
      const texts: string[] = [];
      
      if (slide.pageElements && Array.isArray(slide.pageElements)) {
        slide.pageElements.forEach((element: any) => {
          // Handle Google Slides API structure
          if (element.shape?.text?.textElements) {
            element.shape.text.textElements.forEach((textElement: any) => {
              if (textElement.textRun?.content) {
                texts.push(textElement.textRun.content);
              }
            });
          }
        });
      }
      
      textBySlide[slideId] = texts;
    });
  }
  
  return textBySlide;
};

// Helper to get relationship target
const getRelationshipTarget = (relsData: any, relationshipId: string): string | null => {
  if (!relsData) {
    // console.log('getRelationshipTarget: No relationship data provided');
    return null;
  }
  
  if (!relsData.Relationships || !relsData.Relationships.Relationship) {
    // console.log(`getRelationshipTarget: Relationship structure not found in data: ${JSON.stringify(Object.keys(relsData))}`);
    return null;
  }
  
  const relationships = Array.isArray(relsData.Relationships.Relationship) 
    ? relsData.Relationships.Relationship 
    : [relsData.Relationships.Relationship];
  
  // console.log(`Searching for relationship ID: ${relationshipId} among ${relationships.length} relationships`);
  
  // First try exact match
  const exactRel = relationships.find(r => r.$ && r.$["Id"] === relationshipId);
  if (exactRel) {
    // console.log(`Found exact relationship match for ID ${relationshipId}: ${exactRel.$.Target}`);
    return exactRel.$.Target;
  }
  
  // Try case insensitive match as fallback
  const caseInsensitiveRel = relationships.find(r => r.$ && r.$["Id"] && r.$["Id"].toLowerCase() === relationshipId.toLowerCase());
  if (caseInsensitiveRel) {
    // console.log(`Found case-insensitive relationship match for ID ${relationshipId}: ${caseInsensitiveRel.$.Target}`);
    return caseInsensitiveRel.$.Target;
  }
  
  // If still not found, try to identify what relationships are available
  // console.log(`Relationship ID ${relationshipId} not found. Available relationship IDs:`);
  relationships.forEach((rel, idx) => {
    if (rel.$ && rel.$["Id"]) {
      // console.log(`[${idx}] ID: ${rel.$["Id"]}, Target: ${rel.$.Target || 'undefined'}, Type: ${rel.$.Type || 'undefined'}`);
    } else {
      // console.log(`[${idx}] Relationship without proper structure: ${JSON.stringify(rel)}`);
    }
  });
  
  return null;
};

// Get path to slide layout
const getSlideLayoutPath = async (zip: JSZip, slidePath: string): Promise<string | null> => {
  const slideRelsPath = slidePath.replace('slides/', 'slides/_rels/') + '.rels';
  const slideRelsXml = await getFileFromZip(zip, slideRelsPath);
  if (!slideRelsXml) return null;
  const slideRelsData = await parseXml(slideRelsXml);
  const layoutRel = (Array.isArray(slideRelsData?.Relationships?.Relationship) ? slideRelsData.Relationships.Relationship : [slideRelsData?.Relationships?.Relationship])
    .find(r => r?.$?.Type.endsWith('/slideLayout'));
  return layoutRel?.$?.Target ? `ppt/slides/${layoutRel.$.Target.replace('../', '')}` : null;
};

const getMasterPathForSlide = async (zip: JSZip, slidePath: string, slideLayoutPath?: string | null): Promise<string | null> => {
    let layoutRelsPath: string | null = null;
    if (slideLayoutPath) {
        layoutRelsPath = slideLayoutPath.replace('layouts/', 'layouts/_rels/') + '.rels';
    } else {
        // Fallback if slideLayoutPath is not directly available, try to deduce from slidePath
        const slideRelsPath = slidePath.replace('slides/', 'slides/_rels/') + '.rels';
        const slideRelsXml = await getFileFromZip(zip, slideRelsPath);
        if (slideRelsXml) {
            const slideRelsData = await parseXml(slideRelsXml);
            const layoutRel = (Array.isArray(slideRelsData?.Relationships?.Relationship) ? slideRelsData.Relationships.Relationship : [slideRelsData?.Relationships?.Relationship])
                .find(r => r?.$?.Type.endsWith('/slideLayout'));
            if (layoutRel?.$?.Target) {
                const resolvedLayoutPath = `ppt/layouts/${layoutRel.$.Target.replace('../layouts/', '')}`;
                layoutRelsPath = resolvedLayoutPath.replace('layouts/', 'layouts/_rels/') + '.rels';
            }
        }
    }

    if (!layoutRelsPath) return null;

    const layoutRelsXml = await getFileFromZip(zip, layoutRelsPath);
    if (!layoutRelsXml) return null;

    const layoutRelsData = await parseXml(layoutRelsXml);
    const masterRel = (Array.isArray(layoutRelsData?.Relationships?.Relationship) ? layoutRelsData.Relationships.Relationship : [layoutRelsData?.Relationships?.Relationship])
        .find(r => r?.$?.Type.endsWith('/slideMaster'));

    return masterRel?.$?.Target ? `ppt/slideMasters/${masterRel.$.Target.replace('../slideMasters/', '')}` : null;
};

// Extract background from slide, layout, or master
const extractBackground = async (slideData: any, slideLayoutData: any, masterSlideData: any, zip: JSZip, slideWidthEmu: number, slideHeightEmu: number): Promise<any> => {
  // Order of precedence: Slide -> Slide Layout -> Slide Master
  const bgRef = slideData?.['p:sld']?.['p:cSld']?.[0]?.['p:bg']?.[0] || 
                slideData?.sld?.cSld?.[0]?.bg?.[0] ||
                slideLayoutData?.['p:sldLayout']?.['p:cSld']?.[0]?.['p:bg']?.[0] ||
                slideLayoutData?.sldLayout?.cSld?.[0]?.bg?.[0] ||
                masterSlideData?.['p:sldMaster']?.['p:cSld']?.[0]?.['p:bg']?.[0] ||
                masterSlideData?.sldMaster?.cSld?.[0]?.bg?.[0];

  if (!bgRef) return { 
      backgroundType: 'color', 
      color: '#FFFFFFFF',
      // Initialize all your Background default props from schema
      gradient: null, 
      backgroundImageUrl: null, 
      backgroundImageSize: 'cover', 
      backgroundImageRepeat: 'no-repeat', 
      backgroundImageOpacity: 1,
      patternType: null, 
      patternColor: '#ccccccff', 
      patternScale: 5, 
      patternOpacity: 0.5, 
      isAnimated: false, 
      animationSpeed: 1 
  }; 

  let backgroundProps: any = { 
      backgroundType: 'color', 
      color: '#FFFFFFFF', // Default for solid fill not specified further
      // Ensure all default background props from your schema are here
      gradient: null,
      backgroundImageUrl: null,
      backgroundImageSize: 'cover',
      backgroundImageRepeat: 'no-repeat',
      backgroundImageOpacity: 1,
      patternType: null,
      patternColor: '#ccccccff',
      patternScale: 5,
      patternOpacity: 0.5,
      isAnimated: false, // PPTX doesn't typically animate backgrounds in this way
      animationSpeed: 1
  };

  const bgPr = bgRef?.['p:bgPr']?.[0] || bgRef?.bgPr?.[0];
  if (bgPr) {
    if (bgPr['a:solidFill'] && bgPr['a:solidFill'][0]) {
      const solidFill = bgPr['a:solidFill'][0];
      backgroundProps.color = await getColorFromNode(zip, solidFill, 'FFFFFF');
      // TODO: Handle schemeClr with theme colors lookup
    } else if (bgPr['a:gradFill'] && bgPr['a:gradFill'][0]) {
      backgroundProps.backgroundType = 'gradient';
      const gradFill = bgPr['a:gradFill'][0];
      const gsLst = gradFill['a:gsLst']?.[0]?.['a:gs'] || gradFill.gsLst?.[0]?.gs || [];
      backgroundProps.gradient = {
        type: gradFill['a:lin'] ? 'linear' : 'radial', // Simplified, PPTX has more types
        angle: parseInt(gradFill['a:lin']?.[0]?.$?.ang || '0', 10) / 60000, // Angle in PPTX is in 60000ths of a degree
        stops: await Promise.all(gsLst.map(async (gs: any) => ({
          color: await getColorFromNode(zip, gs, '000000'), // Pass zip here
          position: parseInt(gs.$.pos || '0') / 100000, // Position is 0-100000
        }))),
      };
    } else if (bgPr['a:blipFill'] && bgPr['a:blipFill'][0]) {
      backgroundProps.backgroundType = 'image';
      const blipFill = bgPr['a:blipFill'][0];
      const blip = blipFill['a:blip']?.[0];
      const rId = blip?.$?.['r:embed'];
      if (rId) {
        const relsPath = await findCorrectRelsPathForImage(zip, slideData, slideLayoutData, masterSlideData);
        if (relsPath) {
            const relsXml = await getFileFromZip(zip, relsPath);
            if (relsXml) {
                const relsData = await parseXml(relsXml);
                const target = getRelationshipTarget(relsData, rId);
                if (target) {
                    const imagePath = target.startsWith('../') ? `ppt/${target.substring(3)}` : `ppt/media/${target}`;
                     try {
                        const imageFile = zip.file(imagePath);
                        if (imageFile) {
                            const base64Image = await imageFile.async('base64');
                            const mimeType = getMimeTypeFromPath(imagePath);
                            backgroundProps.backgroundImageUrl = `data:${mimeType};base64,${base64Image}`;
                        } else {
                             backgroundProps.backgroundImageUrl = `image_not_found_path:${imagePath}`;
                        }
                    } catch (e) {
                        console.error('Error reading background image from zip', e);
                        backgroundProps.backgroundImageUrl = `image_error:${imagePath}`;
                    }
                }
            }
        } else {
             backgroundProps.backgroundImageUrl = `rels_not_found_for_bg_image_rId_${rId}`;
        }
      }
      const stretch = blipFill['a:stretch']?.[0];
      if (stretch && stretch['a:fillRect']) {
        backgroundProps.backgroundImageSize = 'cover'; // fillRect is similar to cover
      }
      const tile = blipFill['a:tile']?.[0];
      if (tile) {
        backgroundProps.backgroundImageRepeat = 'repeat'; // Basic tile = repeat
        // More complex tile properties like flip, align could be parsed for finer control
      }
      // Opacity for blipFill might be in blip.$.cstate or alpha modifiers on the blip itself.

    } else if (bgPr['a:pattFill'] && bgPr['a:pattFill'][0]) {
      backgroundProps.backgroundType = 'pattern';
      const pattFill = bgPr['a:pattFill'][0];
      backgroundProps.patternType = mapOpenXmlPatternToAppPattern(pattFill.$.prst);
      if (pattFill['a:fgClr']?.[0]) {
        backgroundProps.patternColor = await getColorFromNode(zip, pattFill['a:fgClr'][0]);
      }
      if (pattFill['a:bgClr']?.[0]) {
        // If pattern has a background color, it might mean the main 'color' prop should be this.
        // Or it could be a secondary color for the pattern itself. For now, let main color be separate.
        // backgroundProps.color = await getColorFromNode(zip, pattFill['a:bgClr'][0]);
      }
      // Pattern scale and opacity are not directly available, use defaults or heuristics
    }
    // TODO: Add other fill types like grpFill, noFill
  }
  
  // Override with explicit bgRef if it's not just properties
  // (e.g., if bgRef directly contains a fill type)
  if (bgRef['a:solidFill'] && (!bgPr || !bgPr['a:solidFill'])) { // check if not already processed by bgPr
      const solidFill = bgRef['a:solidFill'][0];
      backgroundProps.color = await getColorFromNode(zip, solidFill, 'FFFFFF'); 
      backgroundProps.backgroundType = 'color';
  } else if (bgRef['a:gradFill'] && (!bgPr || !bgPr['a:gradFill'])) {
      backgroundProps.backgroundType = 'gradient';
      const gradFill = bgRef['a:gradFill'][0];
      const gsLst = gradFill['a:gsLst']?.[0]?.['a:gs'] || gradFill.gsLst?.[0]?.gs || [];
      backgroundProps.gradient = {
        type: gradFill['a:lin'] ? 'linear' : 'radial', 
        angle: parseInt(gradFill['a:lin']?.[0]?.$?.ang || '0', 10) / 60000, 
        stops: await Promise.all(gsLst.map(async (gs: any) => ({
          color: await getColorFromNode(zip, gs, '000000'),
          position: parseInt(gs.$.pos || '0') / 100000, 
        }))),
      };
  } else if (bgRef['a:blipFill'] && (!bgPr || !bgPr['a:blipFill'])) {
    backgroundProps.backgroundType = 'image';
      const blipFill = bgRef['a:blipFill'][0];
      const blip = blipFill['a:blip']?.[0];
      const rId = blip?.$?.['r:embed'];
      if (rId) {
        const relsPath = await findCorrectRelsPathForImage(zip, slideData, slideLayoutData, masterSlideData);
        if (relsPath) {
            const relsXml = await getFileFromZip(zip, relsPath);
            if (relsXml) {
                const relsData = await parseXml(relsXml);
                const target = getRelationshipTarget(relsData, rId);
                if (target) {
                    const imagePath = target.startsWith('../') ? `ppt/${target.substring(3)}` : `ppt/media/${target}`;
                    try {
                        const imageFile = zip.file(imagePath);
                        if (imageFile) {
                            const base64Image = await imageFile.async('base64');
                            const mimeType = getMimeTypeFromPath(imagePath);
                            backgroundProps.backgroundImageUrl = `data:${mimeType};base64,${base64Image}`;
                        } else {
                             backgroundProps.backgroundImageUrl = `image_not_found_path_direct:${imagePath}`;
                        }
                    } catch (e) {
                        console.error('Error reading background image (direct blipFill)', e);
                        backgroundProps.backgroundImageUrl = `image_error_direct:${imagePath}`;
                    }
                }
            }
        } else {
            backgroundProps.backgroundImageUrl = `rels_not_found_for_bg_image_direct_rId_${rId}`;
        }
      }
  } // Similar checks for pattFill directly under bgRef if bgPr is not present

  return backgroundProps;
};

const findCorrectRelsPathForImage = async (zip: JSZip, slideData: any, slideLayoutData: any, masterSlideData: any): Promise<string | null> => {
    // Try to find the rId in slide.xml.rels, then layout.xml.rels, then master.xml.rels
    // This requires knowing which XML contained the <a:blip r:embed="rIdxxx">
    // For simplicity, we'll assume we need to check all relevant rels files if we don't know the origin.
    // A more robust solution would pass the origin of the blipFill.

    // We need the original paths to construct the .rels path
    // This is a simplification; ideally, you'd get these paths from where bgRef was sourced.
    const slideXmlPath = slideData?.fileName; // Assuming fileName is stored on slideData somehow, or pass it
    const layoutXmlPath = slideLayoutData?.fileName;
    const masterXmlPath = masterSlideData?.fileName;

    if (slideXmlPath) {
        const p = slideXmlPath.replace('slides/', 'slides/_rels/') + '.rels';
        if (zip.file(p)) return p;
    }
    if (layoutXmlPath) {
        const p = layoutXmlPath.replace('layouts/', 'layouts/_rels/') + '.rels';
        if (zip.file(p)) return p;
    }
    if (masterXmlPath) {
        const p = masterXmlPath.replace('slideMasters/', 'slideMasters/_rels/') + '.rels';
        if (zip.file(p)) return p;
    }
    // Fallback: search all .rels files (less efficient)
    const allRels = Object.keys(zip.files).filter(f => f.endsWith('.xml.rels'));
    if(allRels.length > 0) return allRels[0]; // Take the first one, highly speculative

    return null;
};

const mapOpenXmlPatternToAppPattern = (pattPrst: string): string | null => {
    // Based on Office Open XML Part 4 - Markup Language Reference - Section 5.1.10.42 ST_PresetPatternVal
    // This is a partial mapping. Your app might have different pattern names.
    const mapping: { [key: string]: string } = {
        'pct5': 'dots', // Assuming 'dots' is like a 5% pattern
        'pct10': 'dots',
        'pct20': 'dots',
        'pct25': 'dots',
        'horz': 'lines', // Horizontal lines
        'vert': 'lines', // Vertical lines
        'ltHorz': 'lines',
        'ltVert': 'lines',
        'dkHorz': 'lines',
        'dkVert': 'lines',
        'smGrid': 'grid', // Small grid
        'lgGrid': 'grid', // Large grid
        'diagCross': 'grid', // Diagonal cross, could be a type of grid or specific pattern
        'checker': 'checkered',
        // Add more mappings as needed based on your app's supported patterns and OpenXML ST_PresetPatternVal
    };
    return mapping[pattPrst] || null; // Return null if no direct match
};

const mapOpenXmlShapeToAppShape = (geomPrst: string): string => {
    // Based on Office Open XML Part 4 - Markup Language Reference - Section 5.1.10.52 ST_ShapeType
    const mapping: { [key: string]: string } = {
        'rect': 'rectangle',
        'roundRect': 'rectangle', // Rounded rectangle maps to rectangle with borderRadius
        'ellipse': 'ellipse',
        'triangle': 'triangle',
        'rtTriangle': 'triangle', // Right triangle
        'parallelogram': 'polygon',
        'trapezoid': 'polygon',
        'hexagon': 'hexagon',
        'octagon': 'polygon',
        'star4': 'star',
        'star5': 'star', // 5-point star
        'star6': 'star',
        'star7': 'star',
        'star8': 'star',
        'star10': 'star',
        'star12': 'star',
        'star16': 'star',
        'star24': 'star',
        'star32': 'star',
        'pentagon': 'pentagon',
        'heptagon': 'polygon',
        'decagon': 'polygon',
        'dodecagon': 'polygon',
        'pie': 'circle', // Pie shape - partial circle
        'chord': 'circle', // Chord shape - partial circle
        'teardrop': 'circle', // Teardrop shape
        'frame': 'rectangle', // Frame shape
        'halfFrame': 'rectangle', // Half frame shape
        'corner': 'rectangle', // Corner shape
        'diagStripe': 'polygon', // Diagonal stripe
        'diamond': 'diamond',
        'isoscelesTriangle': 'triangle',
        'mathPlus': 'plus',
        'mathMinus': 'rectangle', // Minus shape
        'mathMultiply': 'x', // Multiply shape
        'mathDivide': 'divide', // Divide shape
        'mathEqual': 'equals', // Equal shape
        'mathNotEqual': 'not-equals', // Not equal shape
        'heart': 'heart',
        'cube': 'rectangle', // 3D cube mapped to rectangle
        'moon': 'circle', // Moon shape mapped to circle
        'sun': 'circle', // Sun shape mapped to circle
        'arc': 'rectangle', // Arc shape mapped to rectangle
        'bracketPair': 'rectangle', // Bracket pair mapped to rectangle
        'bracePair': 'rectangle', // Brace pair mapped to rectangle
        'plaque': 'rectangle', // Plaque mapped to rectangle
        'cloud': 'cloud', // Cloud shape
        'arrow': 'arrow',
        'leftArrow': 'arrow',
        'rightArrow': 'arrow',
        'upArrow': 'arrow',
        'downArrow': 'arrow',
        'leftRightArrow': 'arrow',
        'upDownArrow': 'arrow',
        'quadArrow': 'arrow',
        'leftRightUpArrow': 'arrow',
        'bentArrow': 'arrow',
        'uturnArrow': 'arrow',
        'bentUpArrow': 'arrow',
        'curvedRightArrow': 'arrow',
        'curvedLeftArrow': 'arrow',
        'curvedUpArrow': 'arrow',
        'curvedDownArrow': 'arrow',
        'stripedRightArrow': 'arrow',
        'circularArrow': 'arrow',
        'line': 'rectangle', // Or handle as a specific line type if your app supports it
        'oval': 'ellipse',
    };
    return mapping[geomPrst] || 'rectangle'; // Return rectangle as default
};

const getMimeTypeFromPath = (path: string): string => {
  const ext = path.toLowerCase().split('.').pop() || '';
  const mimeTypes: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg', 
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp',
    'ico': 'image/x-icon',
  };
  return mimeTypes[ext] || 'image/png'; // Default to PNG
};

// Helper to extract line style properties
const extractLineStyle = async (lnNode: any, zip: JSZip): Promise<any> => {
  if (!lnNode) return null;
  
  const lineStyle: any = {
    width: 1,
    color: '#000000FF',
    style: 'solid'
  };
  
  // Line width
  if (lnNode.$?.w) {
    lineStyle.width = emuToPx(parseInt(lnNode.$.w, 10));
  }
  
  // Line color
  if (lnNode['a:solidFill']?.[0]) {
    lineStyle.color = await getColorFromNode(zip, lnNode['a:solidFill'][0]);
  }
  
  // Line style (dash pattern)
  const prstDash = lnNode['a:prstDash']?.[0];
  if (prstDash?.$?.val) {
    lineStyle.style = prstDash.$.val; // 'solid', 'dash', 'dot', etc.
  }
  
  return lineStyle;
};

export default {
  parseGoogleSlide,
  isGoogleSlideFile,
  extractTextContent
}; 