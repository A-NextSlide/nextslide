/**
 * SlideTranslator.ts
 * 
 * This service provides functionality for translating parsed Google Slides data 
 * into our internal format based on the TypeBox schema.
 */

import { v4 as uuidv4 } from 'uuid';

// PowerPoint slide dimensions (standard 4:3 format)
const POWERPOINT_WIDTH = 720;
const POWERPOINT_HEIGHT = 540;

// Our presentation dimensions
const TARGET_WIDTH = 1920;
const TARGET_HEIGHT = 1080;

// Scaling factors to convert PowerPoint coordinates to our format
const SCALE_X = TARGET_WIDTH / POWERPOINT_WIDTH;
const SCALE_Y = TARGET_HEIGHT / POWERPOINT_HEIGHT;

// Default values for components
const DEFAULT_BACKGROUND = {
  backgroundType: "color",
  color: "#ffffffff",
  gradient: null,
  backgroundImageUrl: null,
  backgroundImageSize: "cover",
  backgroundImageRepeat: "no-repeat",
  backgroundImageOpacity: 1,
  patternType: null,
  patternColor: "#ccccccff",
  patternScale: 5,
  patternOpacity: 0.5,
  isAnimated: false,
  animationSpeed: 1
};

const DEFAULT_CHART = {
  position: { x: 500, y: 200 },
  width: 1000,
  height: 600,
  opacity: 1,
  rotation: 0,
  zIndex: 1,
  textColor: "#000000",
  chartType: "bar",
  colors: [
    "#61cdbb", "#97e3d5", "#e8c1a0", "#f47560", "#f1e15b", 
    "#e8a838", "#a7cee3", "#b2df8a", "#fb9a99", "#fdbf6f"
  ],
  animate: true,
  enableLabel: true,
  showLegend: false,
  theme: "light",
  margin: {
    top: 40,
    right: 80,
    bottom: 50,
    left: 60
  },
  verticalAnimation: true,
  borderRadius: 3,
  enableAxisTicks: true,
  enableGrid: true,
  showAxisLegends: true,
  axisBottom: {
    legend: "Category",
    legendOffset: 36,
    tickRotation: 0,
    legendPosition: "middle"
  },
  axisLeft: {
    legend: "Value",
    legendOffset: -40,
    tickRotation: 0,
    legendPosition: "middle"
  },
  mediaSourceId: "",
  originalFilename: "",
  aiInterpretation: "",
  mediaSlideId: ""
};

const DEFAULT_SHAPE = {
  position: { x: 500, y: 200 },
  width: 300,
  height: 200,
  opacity: 1,
  rotation: 0,
  zIndex: 1,
  textColor: "#000000",
  shapeType: "rectangle",
  fill: "#00000000", // default transparent
  stroke: "#00000000",
  strokeWidth: 0
};

const DEFAULT_IMAGE = {
  position: { x: 500, y: 200 },
  width: 500,
  height: 300,
  opacity: 1,
  rotation: 0,
  zIndex: 1,
  textColor: "#000000",
  src: "",
  alt: "",
  objectFit: "cover",
  borderRadius: 0,
  borderWidth: 0,
  borderColor: "#000000ff",
  shadow: false,
  shadowBlur: 10,
  shadowColor: "#0000004D",
  shadowOffsetX: 0,
  shadowOffsetY: 4,
  shadowSpread: 0,
  mediaSourceId: "",
  originalFilename: "",
  aiInterpretation: "",
  mediaSlideId: ""
};

const DEFAULT_TABLE = {
  position: { x: 500, y: 200 },
  width: 800,
  height: 400,
  opacity: 1,
  rotation: 0,
  zIndex: 1,
  textColor: "#000000",
  data: [
    ["Cell 1,1", "Cell 1,2", "Cell 1,3"],
    ["Cell 2,1", "Cell 2,2", "Cell 2,3"],
    ["Cell 3,1", "Cell 3,2", "Cell 3,3"]
  ],
  headers: ["Column 1", "Column 2", "Column 3"],
  showHeader: true,
  tableStyles: {
    fontFamily: "Inter",
    fontSize: 13,
    borderColor: "#e2e8f0",
    borderWidth: 1,
    cellPadding: 10,
    headerBackgroundColor: "#f8fafc",
    headerTextColor: "#334155",
    cellBackgroundColor: "#ffffff",
    textColor: "#334155",
    alignment: "left"
  },
  cellStyles: []
};

// Sample chart data
const SAMPLE_CHART_DATA = [
  { name: "Category A", color: "#61cdbb", value: 40 },
  { name: "Category B", color: "#97e3d5", value: 30 },
  { name: "Category C", color: "#e8c1a0", value: 50 },
  { name: "Category D", color: "#f47560", value: 20 },
  { name: "Category E", color: "#f1e15b", value: 35 }
];

// Helper function to create UUIDs for components and slides
const generateId = () => uuidv4();

// Set consistent default style values as fallbacks only
const DEFAULT_FONT_SIZE = 14;
const DEFAULT_FONT_FAMILY = "Inter";
const DEFAULT_TEXT_COLOR = "#333333";

// Component styling constants for visibility
const COMPONENT_BORDER = "2px solid #FF0000";
const COMPONENT_BACKGROUND = "rgba(255, 255, 255, 0.05)";
const COMPONENT_LABEL_SIZE = 9;

// ShapeType mapping and properties
// Each shape type needs to be handled with its unique properties
const SHAPE_TYPE_MAPPING = {
  // Standard shapes
  "rect": { type: "rectangle", borderRadius: 0 },
  "rectangle": { type: "rectangle", borderRadius: 0 },
  "RECTANGLE": { type: "rectangle", borderRadius: 0 },
  
  // Rounded rectangles with various roundings
  "roundRect": { type: "rectangle", borderRadius: 8 },
  "ROUND_RECTANGLE": { type: "rectangle", borderRadius: 8 },
  "round1Rect": { type: "rectangle", borderRadius: 5 },
  "round2Rect": { type: "rectangle", borderRadius: 10 },
  "round2SameRect": { type: "rectangle", borderRadius: 15 },
  "snip1Rect": { type: "rectangle", borderRadius: 5 },
  "snip2Rect": { type: "rectangle", borderRadius: 5 },
  
  // Circles and ovals
  // Treat ellipse/oval as ellipse; circle will be chosen downstream when w==h
  "ellipse": { type: "ellipse", borderRadius: 0 },
  "ELLIPSE": { type: "ellipse", borderRadius: 0 },
  "oval": { type: "ellipse", borderRadius: 0 },
  "OVAL": { type: "ellipse", borderRadius: 0 },
  
  // Triangles
  "triangle": { type: "triangle", borderRadius: 0 },
  "TRIANGLE": { type: "triangle", borderRadius: 0 },
  "rightTriangle": { type: "triangle", borderRadius: 0 },
  "RIGHT_TRIANGLE": { type: "triangle", borderRadius: 0 },
  
  // Other polygons
  "pentagon": { type: "pentagon", borderRadius: 0 },
  "PENTAGON": { type: "pentagon", borderRadius: 0 },
  "hexagon": { type: "hexagon", borderRadius: 0 },
  "HEXAGON": { type: "hexagon", borderRadius: 0 },
  
  // Stars and other shapes
  "star": { type: "star", borderRadius: 0 },
  "STAR": { type: "star", borderRadius: 0 },
  "donut": { type: "circle", borderRadius: 0 },
  "DONUT": { type: "circle", borderRadius: 0 },
  
  // Special case with custom name
  "plaque": { type: "rectangle", borderRadius: 10 }
};

// Helper to get shape properties
const getShapeProperties = (shapeTypeName: string) => {
  const lowerCaseType = shapeTypeName?.toLowerCase() || 'rect';
  
  // First check exact match
  if (SHAPE_TYPE_MAPPING[shapeTypeName]) {
    return SHAPE_TYPE_MAPPING[shapeTypeName];
  }
  
  // Try lowercase match
  if (SHAPE_TYPE_MAPPING[lowerCaseType]) {
    return SHAPE_TYPE_MAPPING[lowerCaseType];
  }
  
  // For types we don't explicitly handle, check for rounded corners by name
  if (lowerCaseType.includes('round') || lowerCaseType.includes('snip')) {
    return { type: "rectangle", borderRadius: 8 };
  }
  
  // Default to rectangle with no rounding
  return { type: "rectangle", borderRadius: 0 };
};

// Component creation helper
const logComponentCreation = (componentType: string, geometry: any, elementIndex: number) => {
  // Logging removed for production
};

/**
 * Coordinate conversion helper
 */
const logCoordinateConversion = (sourceX: number, sourceY: number, sourceWidth: number, sourceHeight: number) => {
  const targetX = Math.round(sourceX * SCALE_X);
  const targetY = Math.round(sourceY * SCALE_Y);
  const targetWidth = Math.round(sourceWidth * SCALE_X);
  const targetHeight = Math.round(sourceHeight * SCALE_Y);
  
  return { x: targetX, y: targetY, width: targetWidth, height: targetHeight };
};

/**
 * Convert PowerPoint coordinates to our format
 * @param x The x coordinate in PowerPoint format
 * @param y The y coordinate in PowerPoint format
 * @param width The width in PowerPoint format
 * @param height The height in PowerPoint format
 * @returns Converted position and dimensions for our format
 */
const convertCoordinates = (
  x: number = 0, 
  y: number = 0, 
  width: number = 0, 
  height: number = 0,
  rotation: number = 0
) => {
  // PowerPoint uses EMUs (English Metric Units) for precise positioning
  // We need to apply exact proportional scaling to maintain the aspect ratio
  const scaledX = Math.round(x * SCALE_X);
  const scaledY = Math.round(y * SCALE_Y);
  const scaledWidth = Math.round(width * SCALE_X);
  const scaledHeight = Math.round(height * SCALE_Y);
  
  // Ensure minimum dimensions for visibility
  const finalWidth = Math.max(scaledWidth, 10);
  const finalHeight = Math.max(scaledHeight, 10);
  
  return {
    position: {
      x: scaledX,
      y: scaledY
    },
    width: finalWidth,
    height: finalHeight,
    rotation: rotation
  };
};

/**
 * Extract size and position information from an element
 */
const extractElementGeometry = (element: any, index: number) => {
  // Default position as fallback
  let x = 0;
  let y = 0;
  let width = 100;
  let height = 70;
  let rotation = 0;
  
  // PowerPoint elements typically have their positions and dimensions in the transform object
  if (element.transform) {
    x = element.transform.translateX !== undefined ? element.transform.translateX : 0;
    y = element.transform.translateY !== undefined ? element.transform.translateY : 0;
    width = element.transform.width !== undefined ? element.transform.width : 100;
    height = element.transform.height !== undefined ? element.transform.height : 70;
    
    if (element.transform.rotation !== undefined) {
      rotation = (element.transform.rotation * 180 / Math.PI) % 360;
    }
  }
  // Handle nested transform objects (rare, but can happen)
  else if (element.shape?.transform) {
    x = element.shape.transform.translateX !== undefined ? element.shape.transform.translateX : 0;
    y = element.shape.transform.translateY !== undefined ? element.shape.transform.translateY : 0;
    width = element.shape.transform.width !== undefined ? element.shape.transform.width : 100;
    height = element.shape.transform.height !== undefined ? element.shape.transform.height : 70;
    
    if (element.shape.transform.rotation !== undefined) {
      rotation = (element.shape.transform.rotation * 180 / Math.PI) % 360;
    }
  }
  // Fallback to other potential sources
  else {
    if (element.position) {
      x = element.position.x !== undefined ? element.position.x : 0;
      y = element.position.y !== undefined ? element.position.y : 0;
    }
    if (element.size) {
      width = element.size.width !== undefined ? element.size.width : 100;
      height = element.size.height !== undefined ? element.size.height : 70;
    }
    if (element.boundingBox) {
      x = element.boundingBox.x !== undefined ? element.boundingBox.x : x;
      y = element.boundingBox.y !== undefined ? element.boundingBox.y : y;
      width = element.boundingBox.width !== undefined ? element.boundingBox.width : width;
      height = element.boundingBox.height !== undefined ? element.boundingBox.height : height;
    }
  }
  
  // Ensure minimum dimensions for visibility
  width = Math.max(width, 10);
  height = Math.max(height, 10);
  
  // Convert to our format
  return convertCoordinates(x, y, width, height, rotation);
};

/**
 * Extract font properties from a text element's style
 */
const extractTextStyles = (textElement: any): {
  fontSize: number,
  fontWeight: string,
  fontFamily: string,
  fontStyle: string,
  textColor: string
} => {
  // Default style object with proper typing
  const defaultStyle = {
    fontSize: DEFAULT_FONT_SIZE,
    fontWeight: "normal",
    fontFamily: DEFAULT_FONT_FAMILY,
    fontStyle: "normal",
    textColor: DEFAULT_TEXT_COLOR
  };

  if (!textElement?.textRun?.style) {
    return defaultStyle;
  }

  const textStyle = textElement.textRun.style;
  const extractedStyle = { ...defaultStyle };

  // Font size - extract from PowerPoint content when available
  if (textStyle.fontSize) {
    // PowerPoint format gives fontSize.magnitude in points
    const fontSize = textStyle.fontSize.magnitude || DEFAULT_FONT_SIZE;
    // Convert pt to px (approximately, pt * 1.33 = px) and scale by presentation ratio
    extractedStyle.fontSize = Math.round(fontSize * 1.33 * SCALE_Y);
  } else if (typeof textStyle.fontSize === 'number') {
    // Direct font size value
    const fontSize = textStyle.fontSize;
    extractedStyle.fontSize = Math.round(fontSize * 1.33 * SCALE_Y);
  }

  // Font weight
  if (textStyle.bold) {
    extractedStyle.fontWeight = "bold";
  }

  // Font style
  if (textStyle.italic) {
    extractedStyle.fontStyle = "italic";
  }

  // Font family
  if (textStyle.fontFamily) {
    extractedStyle.fontFamily = textStyle.fontFamily;
  }

  // Text color
  if (textStyle.foregroundColor && textStyle.foregroundColor.color && textStyle.foregroundColor.color.rgbColor) {
    const rgb = textStyle.foregroundColor.color.rgbColor;
    const r = Math.round((rgb.red || 0) * 255);
    const g = Math.round((rgb.green || 0) * 255);
    const b = Math.round((rgb.blue || 0) * 255);
    const a = rgb.alpha !== undefined ? rgb.alpha : 1;
    extractedStyle.textColor = `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  return extractedStyle;
};

/**
 * Translates Google Slides format to our internal format
 * @param googleSlideData The parsed Google Slides data
 * @returns Translated deck data in our format
 */
export const translateToSlideFormat = (googleSlideData: any): any => {
  if (!googleSlideData || !googleSlideData.slides) {
    // Return empty deck if no data
    return {
      id: generateId(),
      title: googleSlideData?.title || "Untitled Presentation",
      slides: []
    };
  }
  
  // Extract basic deck information
  const deckTitle = googleSlideData.title || "Untitled Presentation";
  const deckId = generateId();
  
  // Process each slide
  const slides = googleSlideData.slides.map((slide: any, index: number) => {
    const slideId = generateId();
    let components = [];
    

    
    // Add background component as first component
    const backgroundId = generateId();
    let backgroundColor = "#ffffffff";
    
    // Try to extract background color from slide properties
    if (slide.pageBackground && slide.pageBackground.solidFill) {
      const color = slide.pageBackground.solidFill.color;
      if (color && color.rgbColor) {
        const r = Math.round((color.rgbColor.red || 1) * 255);
        const g = Math.round((color.rgbColor.green || 1) * 255);
        const b = Math.round((color.rgbColor.blue || 1) * 255);
        backgroundColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}ff`;
      }
    }
    
    // Update the background component with a more visible grid pattern
    const background = {
      id: backgroundId,
      type: "Background",
      props: {
        ...DEFAULT_BACKGROUND,
        color: "#ffffff", 
        position: { x: 0, y: 0 },
        width: TARGET_WIDTH,
        height: TARGET_HEIGHT,
        zIndex: 0,
        // Add a grid to visualize the coordinate system
        backgroundType: "pattern",
        patternType: "grid",
        patternColor: "#cccccc44",
        patternScale: 40,
        patternOpacity: 0.3
      }
    };

    // Add a slide border indicator to clearly show slide boundaries
    const slideBorder = {
      id: generateId(),
      type: "Shape",
      props: {
        ...DEFAULT_SHAPE,
        zIndex: 1,
        position: { x: 0, y: 0 },
        width: TARGET_WIDTH,
        height: TARGET_HEIGHT,
        rotation: 0,
        shapeType: "rectangle",
        fill: "transparent",
        stroke: "#FF0000",
        strokeWidth: 2,
        strokeDasharray: "10 5" // Dashed border to indicate the slide boundary
      }
    };

    components.push(background);
    components.push(slideBorder);

    // Add slide dimensions label
    const slideDimensionsLabel = {
      id: generateId(),
      type: "TiptapTextBlock",
      props: {
        texts: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  text: `Slide: ${TARGET_WIDTH}x${TARGET_HEIGHT}`,
                  type: "text",
                  marks: [{ type: "bold" }]
                }
              ]
            }
          ]
        },
        width: 160,
        height: 24,
        opacity: 1,
        rotation: 0,
        zIndex: 2,
        textColor: "#FF0000",
        position: {
          x: 10,
          y: 10
        },
        fontFamily: "Inter",
        fontSize: 12,
        fontWeight: "bold",
        fontStyle: "normal",
        backgroundColor: "rgba(255, 255, 255, 0.8)",
        letterSpacing: 0,
        lineHeight: 1.2,
        alignment: "center",
        verticalAlignment: "middle",
        padding: 4,
        border: "1px solid #FF0000"
      }
    };

    components.push(slideDimensionsLabel);
    
    // Process slide elements
    if (slide.pageElements && Array.isArray(slide.pageElements)) {
      slide.pageElements.forEach((element: any, elementIndex: number) => {

        
        const componentId = generateId();
        const zIndex = 10 + elementIndex;
        
        // Extract geometry once and use it for all component types
        const geometry = extractElementGeometry(element, elementIndex);
        
        // Handle text elements
        if (element.shape?.text?.textElements) {
          let textContent = "";
          const textElements = element.shape.text.textElements;
          
          
          // Extract text content first
          textElements.forEach((textElement: any, idx: number) => {
            if (textElement.textRun?.content) {
              textContent += textElement.textRun.content;
            }
          });
          
          // Extract styles from the first text element with style
          let textStyle = { ...extractTextStyles({}) }; // Start with empty default
          
          // Try to find an element with style
          for (let i = 0; i < textElements.length; i++) {
            if (textElements[i]?.textRun?.style) {
              textStyle = extractTextStyles(textElements[i]);
              break;
            }
          }
          
          // Display the original text content
          const displayText = textContent.trim() || "(empty text)";
          
          // Log component creation
          logComponentCreation('Text', geometry, elementIndex);
          
          // Create a text component using the original content and extracted styles
          const textComponent = {
            id: componentId,
            type: "TiptapTextBlock",
            props: {
              texts: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        text: displayText,
                        type: "text",
                        marks: textStyle.fontWeight === "bold" ? [{ type: "bold" }] : []
                      }
                    ]
                  }
                ]
              },
              width: geometry.width,
              height: geometry.height,
              opacity: 1,
              rotation: geometry.rotation,
              zIndex: zIndex,
              textColor: textStyle.textColor,
              position: geometry.position,
              fontFamily: textStyle.fontFamily,
              fontSize: textStyle.fontSize,
              fontWeight: textStyle.fontWeight,
              fontStyle: textStyle.fontStyle,
              backgroundColor: COMPONENT_BACKGROUND,
              letterSpacing: 0,
              lineHeight: 1.5,
              alignment: "left",
              verticalAlignment: "top",
              padding: 4,
              border: COMPONENT_BORDER
            }
          };
          
          components.push(textComponent);
          
          // Add a small label to identify the element type
          const labelId = generateId();
          const labelText = `text: ${textStyle.fontSize}px`;
          
          const labelComponent = {
            id: labelId,
            type: "TiptapTextBlock",
            props: {
              texts: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        text: labelText,
                        type: "text",
                        marks: []
                      }
                    ]
                  }
                ]
              },
              width: Math.min(geometry.width - 10, 70),
              height: 18,
              opacity: 0.9,
              rotation: 0,
              zIndex: zIndex + 1,
              textColor: "#FF0000",
              position: {
                x: geometry.position.x + 4,
                y: geometry.position.y + 4
              },
              fontFamily: "Inter",
              fontSize: COMPONENT_LABEL_SIZE,
              fontWeight: "bold",
              fontStyle: "normal",
              backgroundColor: "rgba(255, 255, 255, 0.8)",
              letterSpacing: 0,
              lineHeight: 1.2,
              alignment: "center",
              verticalAlignment: "middle",
              padding: 2,
              border: "none"
            }
          };
          
          components.push(labelComponent);
        } 
        // Handle image elements
        else if (element.image) {
          
          // Create a placeholder src if we don't have a valid image URL
          const imageSrc = element.image.contentUrl || element.image.sourceUrl;
          const hasValidUrl = imageSrc && !imageSrc.startsWith('rId:');
          
          // Log component creation
          logComponentCreation('Image', geometry, elementIndex);
          
          // Use a more visible placeholder image
          const placeholderSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23f5f5f5'/%3E%3Cpath d='M20,80L80,80L80,70L65,45L50,60L35,45L20,65Z' fill='%23ff000033' stroke='%23FF0000' stroke-width='2'/%3E%3Ccircle cx='30' cy='30' r='10' fill='%23ff000033' stroke='%23FF0000' stroke-width='2'/%3E%3Ctext x='50' y='95' font-family='Arial' font-size='12' text-anchor='middle' fill='%23FF0000'%3EImage: ${geometry.width}x${geometry.height}%3C/text%3E%3C/svg%3E`;
          
          const imageComponent = {
            id: componentId,
            type: "Image",
            props: {
              ...DEFAULT_IMAGE,
              zIndex: zIndex,
              position: geometry.position,
              width: geometry.width,
              height: geometry.height,
              rotation: geometry.rotation,
              src: hasValidUrl ? imageSrc : placeholderSvg,
              alt: element.description || "Image placeholder",
              borderWidth: 2,
              borderColor: "#FF0000",
              borderRadius: 0,
              borderStyle: "solid", // Solid border for image
              objectFit: "contain",
              backgroundColor: "#ffffff"
            }
          };
          
          components.push(imageComponent);

          // Add a small label to identify the image
          const labelId = generateId();
          const labelText = `image: ${Math.round(geometry.width)}x${Math.round(geometry.height)}`;
          
          const labelComponent = {
            id: labelId,
            type: "TiptapTextBlock",
            props: {
              texts: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        text: labelText,
                        type: "text",
                        marks: []
                      }
                    ]
                  }
                ]
              },
              width: Math.min(geometry.width - 10, 120),
              height: 18,
              opacity: 0.9,
              rotation: 0,
              zIndex: zIndex + 1,
              textColor: "#FF0000",
              position: {
                x: geometry.position.x + 4,
                y: geometry.position.y + 4
              },
              fontFamily: "Inter",
              fontSize: COMPONENT_LABEL_SIZE,
              fontWeight: "bold",
              fontStyle: "normal",
              backgroundColor: "rgba(255, 255, 255, 0.8)",
              letterSpacing: 0,
              lineHeight: 1.2,
              alignment: "center",
              verticalAlignment: "middle",
              padding: 2,
              border: "none"
            }
          };
          
          components.push(labelComponent);
        }
        // Handle shape elements
        else if (element.shape) {
          // Determine if it might be a chart based on content or appearance
          const isLikelyChart = element.shape.shapeType === "PIE" || 
                               element.objectId?.toLowerCase().includes("chart");
          

          
          if (isLikelyChart) {
            
            // Log component creation
            logComponentCreation('Chart', geometry, elementIndex);
            
            // Create a chart component with clear type label
            const chartComponent = {
              id: componentId,
              type: "Chart",
              props: {
                ...DEFAULT_CHART,
                zIndex: zIndex,
                position: geometry.position,
                width: geometry.width,
                height: geometry.height,
                rotation: geometry.rotation,
                data: [...SAMPLE_CHART_DATA], // Use sample data
                chartType: element.shape.shapeType === "PIE" ? "pie" : "bar",
                colors: ["#ff9999", "#99ff99", "#9999ff", "#ffff99", "#ff99ff"],
                showLegend: true,
                backgroundColor: COMPONENT_BACKGROUND,
                margin: { 
                  top: 60, // Extra space for title
                  right: 20, 
                  bottom: 50, 
                  left: 60 
                },
                // Add chart title showing dimensions
                chartTitle: `Chart: ${element.shape.shapeType === "PIE" ? "pie" : "bar"}`,
                border: COMPONENT_BORDER,
                borderRadius: 0
              }
            };
            
            components.push(chartComponent);
            
            // Add a label
            const labelId = generateId();
            const labelText = "chart";
            
            const labelComponent = {
              id: labelId,
              type: "TiptapTextBlock",
              props: {
                texts: {
                  type: "doc",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        {
                          text: labelText,
                          type: "text",
                          marks: []
                        }
                      ]
                    }
                  ]
                },
                width: Math.min(geometry.width - 10, 60),
                height: 18,
                opacity: 0.9,
                rotation: 0,
                zIndex: zIndex + 1,
                textColor: "#FF0000",
                position: {
                  x: geometry.position.x + 4,
                  y: geometry.position.y + 4
                },
                fontFamily: "Inter",
                fontSize: COMPONENT_LABEL_SIZE,
                fontWeight: "bold",
                fontStyle: "normal",
                backgroundColor: "rgba(255, 255, 255, 0.8)",
                letterSpacing: 0,
                lineHeight: 1.2,
                alignment: "center",
                verticalAlignment: "middle",
                padding: 2,
                border: "none"
              }
            };
            
            components.push(labelComponent);
          } else {
            
            // Get shape properties based on type
            const rawShapeType = element.shape.shapeType || 'rect';
            const shapeProps = getShapeProperties(rawShapeType);
            
            // Extract fill color; default to transparent when not specified
            let fillColor = '#00000000';
            if (element.shape.fill && element.shape.fill.solidFill) {
              const color = element.shape.fill.solidFill.color;
              if (color && color.rgbColor) {
                const r = Math.round(((color.rgbColor.red ?? 0) <= 1 ? (color.rgbColor.red ?? 0) * 255 : (color.rgbColor.red ?? 0)));
                const g = Math.round(((color.rgbColor.green ?? 0) <= 1 ? (color.rgbColor.green ?? 0) * 255 : (color.rgbColor.green ?? 0)));
                const b = Math.round(((color.rgbColor.blue ?? 0) <= 1 ? (color.rgbColor.blue ?? 0) * 255 : (color.rgbColor.blue ?? 0)));
                const toHex = (n: number) => n.toString(16).padStart(2, '0');
                // Use fully opaque hex with alpha channel when explicitly set in source
                fillColor = `#${toHex(r)}${toHex(g)}${toHex(b)}ff`;
              }
            }
            
            // Log component creation
            logComponentCreation('Shape', geometry, elementIndex);
            
            const shapeComponent = {
              id: componentId,
              type: "Shape",
              props: {
                ...DEFAULT_SHAPE,
                zIndex: zIndex,
                position: geometry.position,
                width: geometry.width,
                height: geometry.height,
                rotation: geometry.rotation,
                shapeType: shapeProps.type,
                fill: fillColor,
                stroke: "#00000000",
                strokeWidth: 0,
                borderRadius: shapeProps.borderRadius // Add the borderRadius property
              }
            };
            
            components.push(shapeComponent);
            
            // Add a small label to identify the shape
            const labelId = generateId();
            const labelText = `shape: ${rawShapeType.toLowerCase()}`;
            
            const labelComponent = {
              id: labelId,
              type: "TiptapTextBlock",
              props: {
                texts: {
                  type: "doc",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        {
                          text: labelText,
                          type: "text",
                          marks: []
                        }
                      ]
                    }
                  ]
                },
                width: Math.min(geometry.width - 10, 120),
                height: 18,
                opacity: 0.9,
                rotation: 0,
                zIndex: zIndex + 1,
                textColor: "#FF0000",
                position: {
                  x: geometry.position.x + 4,
                  y: geometry.position.y + 4
                },
                fontFamily: "Inter",
                fontSize: COMPONENT_LABEL_SIZE,
                fontWeight: "bold",
                fontStyle: "normal",
                backgroundColor: "rgba(255, 255, 255, 0.8)",
                letterSpacing: 0,
                lineHeight: 1.2,
                alignment: "center",
                verticalAlignment: "middle",
                padding: 2,
                border: "none"
              }
            };
            
            components.push(labelComponent);
          }
        }
        // Handle table elements
        else if (element.table) {
          // Extract table data if available or use placeholder
          const tableRows = element.table.tableRows || [];
          const headers = ["Column 1", "Column 2", "Column 3"];
          const data = [];
          
          // Create placeholder data if needed
          if (tableRows.length > 0) {
            for (let i = 0; i < Math.min(tableRows.length, 5); i++) {
              const row = [];
              const cells = tableRows[i].tableCells || [];
              for (let j = 0; j < Math.min(cells.length, 5); j++) {
                let cellText = "Cell";
                if (cells[j].text && cells[j].text.textElements) {
                  cellText = cells[j].text.textElements
                    .map((te: any) => te.textRun?.content || "")
                    .join(" ")
                    .trim() || "Cell";
                }
                row.push(cellText);
              }
              data.push(row);
            }
          } else {
            // Fallback to placeholder data
            data.push(
              ["Cell 1,1", "Cell 1,2", "Cell 1,3"],
              ["Cell 2,1", "Cell 2,2", "Cell 2,3"]
            );
          }
          
          const tableComponent = {
            id: componentId,
            type: "Table",
            props: {
              ...DEFAULT_TABLE,
              position: geometry.position,
              width: geometry.width,
              height: geometry.height,
              rotation: geometry.rotation,
              zIndex: zIndex,
              data: data, 
              headers: headers,
              showHeader: true,
              tableStyles: {
                fontFamily: "Inter",
                fontSize: 14,
                borderColor: "#dddddd",
                borderWidth: 1,
                cellPadding: 10,
                headerBackgroundColor: "#f8fafc",
                headerTextColor: "#334155",
                cellBackgroundColor: "#ffffff",
                textColor: "#334155",
                alignment: "left"
              },
              cellStyles: []
            }
          };
          
          components.push(tableComponent);
        }
      });
    }
    
    // Add a default chart if there are no other components besides background
    // This ensures we have a visible component for demonstration
    if (components.length === 1) {
      const chartId = generateId();
      const chartComponent = {
        id: chartId,
        type: "Chart",
        props: {
          ...DEFAULT_CHART,
          position: { x: TARGET_WIDTH / 2 - 400, y: TARGET_HEIGHT / 2 - 250 },
          width: 800,
          height: 500,
          data: [...SAMPLE_CHART_DATA],
          backgroundColor: "rgba(255, 255, 224, 0.7)",
          border: "2px dashed purple",
          chartTitle: "[DEFAULT CHART] No elements found in slide",
          showLegend: true
        }
      };
      components.push(chartComponent);
    }
    
    // Return slide object
    return {
      id: slideId,
      title: `Slide ${index + 1}`,
      components
    };
  });
  
  const result = {
    id: deckId,
    title: deckTitle,
    slides
  };
  

  
  // Return the complete deck data
  return result;
};

/**
 * Utility function to extract information about elements in Google Slide format
 * This can be used for debugging or enhanced parsing
 */
export const analyzeSlideStructure = (googleSlideData: any): any => {
  if (!googleSlideData || !googleSlideData.slides) {
    return { elementTypes: [], slideCount: 0 };
  }
  
  const elementTypes = new Set<string>();
  let elementCount = 0;
  
  googleSlideData.slides.forEach((slide: any) => {
    if (slide.pageElements && Array.isArray(slide.pageElements)) {
      slide.pageElements.forEach((element: any) => {
        elementCount++;
        
        // Detect element type
        if (element.shape) elementTypes.add('shape');
        if (element.image) elementTypes.add('image');
        if (element.table) elementTypes.add('table');
        if (element.video) elementTypes.add('video');
        if (element.line) elementTypes.add('line');
        if (element.shape?.text) elementTypes.add('text');
        
        // Detect specific shape types
        if (element.shape?.shapeType) {
          elementTypes.add(`shape:${element.shape.shapeType}`);
        }
        
        // Log the structure of one element of each type for debugging
        const elementStructure = JSON.stringify(element, null, 2);
  
      });
    }
    
    // Look for slide background information
    if (slide.pageBackground) {
      
    }
  });
  
  return {
    elementTypes: Array.from(elementTypes),
    slideCount: googleSlideData.slides.length,
    elementCount: elementCount,
    slideWidthHeightRatio: POWERPOINT_WIDTH / POWERPOINT_HEIGHT,
    targetFormat: `${TARGET_WIDTH}x${TARGET_HEIGHT}`,
    scalingFactors: { x: SCALE_X, y: SCALE_Y }
  };
};

export default {
  translateToSlideFormat,
  analyzeSlideStructure
};