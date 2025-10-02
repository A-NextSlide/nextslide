// TypeBox Schema Definitions
// Exported from the original typebox_schemas_latest.json

// This file contains the component schemas used for translation
// from parsed PowerPoint slides to our application's format

const typeboxSchemas = {
  // Chart Component Schema
  "Chart": {
    "type": "Chart",
    "name": "Chart",
    "schema": {
      "_ui_type": "UIObject",
      "title": "Chart",
      "metadata": { "control": "none", "controlProps": {} },
      "type": "object",
      "properties": {
        "position": {
          "_ui_type": "UIObject",
          "title": "Position",
          "description": "Position on the slide (x, y coordinates)",
          "metadata": { "control": "none", "controlProps": {} },
          "type": "object",
          "properties": {
            "x": {
              "type": "number",
              "_ui_type": "UIProperty",
              "title": "X",
              "description": "X position on the slide",
              "metadata": { "control": "slider", "controlProps": {} }
            },
            "y": {
              "type": "number",
              "_ui_type": "UIProperty",
              "title": "Y",
              "description": "Y position on the slide",
              "metadata": { "control": "slider", "controlProps": {} }
            }
          },
          "required": ["x", "y"]
        },
        "width": {
          "type": "number",
          "minimum": 1,
          "maximum": 1920,
          "_ui_type": "UIProperty",
          "title": "Width",
          "description": "Width in pixels",
          "metadata": {
            "control": "slider",
            "controlProps": { "min": 1, "max": 1920, "step": 1 }
          }
        },
        "height": {
          "type": "number",
          "minimum": 1,
          "maximum": 1080,
          "_ui_type": "UIProperty",
          "title": "Height",
          "description": "Height in pixels",
          "metadata": {
            "control": "slider",
            "controlProps": { "min": 1, "max": 1080, "step": 1 }
          }
        },
        // Other chart-specific properties would continue here
        // Simplified for brevity
      },
      "required": [
        "position", "width", "height", "opacity", "rotation", "zIndex", 
        "textColor", "chartType", "data", "colors", "animate"
        // Other required properties would continue
      ]
    },
    "defaultProps": {
      "position": { "x": 500, "y": 200 },
      "width": 1000,
      "height": 600,
      "opacity": 1,
      "rotation": 0,
      "zIndex": 1,
      "textColor": "#000000",
      "chartType": "bar",
      "colors": [
        "#61cdbb", "#97e3d5", "#e8c1a0", "#f47560", "#f1e15b",
        "#e8a838", "#a7cee3", "#b2df8a", "#fb9a99", "#fdbf6f"
      ],
      "animate": true,
      "enableLabel": true,
      "showLegend": false,
      "theme": "light",
      "margin": { "top": 40, "right": 80, "bottom": 50, "left": 60 },
      // Other default properties would continue
    },
    "category": "data"
  },

  // Background Component Schema
  "Background": {
    "type": "Background",
    "name": "Background",
    "schema": {
      "_ui_type": "UIObject",
      "title": "Background",
      "metadata": { "control": "none", "controlProps": {} },
      "type": "object",
      "properties": {
        "backgroundType": {
          "anyOf": [
            { "const": "color", "type": "string" },
            { "const": "gradient", "type": "string" },
            { "const": "image", "type": "string" },
            { "const": "pattern", "type": "string" }
          ],
          "_ui_type": "UIEnum",
          "title": "Background Type",
          "description": "The type of background to display",
          "metadata": {
            "control": "dropdown",
            "controlProps": {
              "enumValues": ["color", "gradient", "image", "pattern"]
            }
          }
        },
        "color": {
          "type": "string",
          "_ui_type": "UIProperty",
          "title": "Background Color",
          "description": "Background color with alpha channel support",
          "metadata": {
            "control": "colorpicker",
            "controlProps": { "defaultValue": "#ffffffff" }
          }
        },
        // Other background-specific properties would continue here
      },
      "required": [
        "backgroundType", "isAnimated", "animationSpeed"
      ]
    },
    "defaultProps": {
      "backgroundType": "color",
      "color": "#ffffffff",
      "gradient": null,
      "backgroundImageUrl": null,
      "backgroundImageSize": "cover",
      "backgroundImageRepeat": "no-repeat",
      "backgroundImageOpacity": 1,
      "patternType": null,
      "patternColor": "#ccccccff",
      "patternScale": 5,
      "patternOpacity": 0.5,
      "isAnimated": false,
      "animationSpeed": 1
    },
    "category": "basic"
  },

  // Shape Component Schema
  "Shape": {
    "type": "Shape",
    "name": "Shape",
    "schema": {
      "_ui_type": "UIObject",
      "title": "Shape",
      "metadata": { "control": "none", "controlProps": {} },
      "type": "object",
      "properties": {
        "position": {
          "_ui_type": "UIObject",
          "title": "Position",
          "description": "Position on the slide (x, y coordinates)",
          "metadata": { "control": "none", "controlProps": {} },
          "type": "object",
          "properties": {
            "x": {
              "type": "number",
              "_ui_type": "UIProperty",
              "title": "X",
              "description": "X position on the slide",
              "metadata": { "control": "slider", "controlProps": {} }
            },
            "y": {
              "type": "number",
              "_ui_type": "UIProperty",
              "title": "Y",
              "description": "Y position on the slide",
              "metadata": { "control": "slider", "controlProps": {} }
            }
          },
          "required": ["x", "y"]
        },
        "shapeType": {
          "anyOf": [
            { "const": "rectangle", "type": "string" },
            { "const": "circle", "type": "string" },
            { "const": "triangle", "type": "string" },
            { "const": "star", "type": "string" },
            { "const": "hexagon", "type": "string" },
            { "const": "pentagon", "type": "string" },
            { "const": "diamond", "type": "string" },
            { "const": "arrow", "type": "string" },
            { "const": "heart", "type": "string" }
          ],
          "_ui_type": "UIEnum",
          "title": "Shape Type",
          "description": "The geometric shape to render",
          "metadata": {
            "control": "dropdown",
            "controlProps": {
              "enumValues": [
                "rectangle", "circle", "triangle", "star", "hexagon",
                "pentagon", "diamond", "arrow", "heart"
              ]
            }
          }
        },
        // Other shape-specific properties would continue here
      },
      "required": [
        "position", "width", "height", "opacity", "rotation", "zIndex",
        "shapeType", "fill", "stroke", "strokeWidth"
      ]
    },
    "defaultProps": {
      "position": { "x": 500, "y": 200 },
      "width": 300,
      "height": 200,
      "opacity": 1,
      "rotation": 0,
      "zIndex": 1,
      "shapeType": "rectangle",
      "fill": "#4287f5ff",
      "stroke": "#000000ff",
      "strokeWidth": 0
    },
    "category": "basic"
  },

  // TiptapTextBlock Component Schema
  "TiptapTextBlock": {
    "type": "TiptapTextBlock",
    "name": "Text",
    "schema": {
      "_ui_type": "UIObject",
      "title": "TiptapTextBlock",
      "metadata": { "control": "none", "controlProps": {} },
      "type": "object",
      "properties": {
        "position": {
          "_ui_type": "UIObject",
          "title": "Position",
          "description": "Position on the slide (x, y coordinates)",
          "metadata": { "control": "none", "controlProps": {} },
          "type": "object",
          "properties": {
            "x": {
              "type": "number",
              "_ui_type": "UIProperty",
              "title": "X",
              "description": "X position on the slide",
              "metadata": { "control": "slider", "controlProps": {} }
            },
            "y": {
              "type": "number",
              "_ui_type": "UIProperty",
              "title": "Y",
              "description": "Y position on the slide",
              "metadata": { "control": "slider", "controlProps": {} }
            }
          },
          "required": ["x", "y"]
        },
        // Other text-specific properties would continue here
      },
      "required": [
        "position", "width", "height", "opacity", "rotation", "zIndex",
        "textColor", "texts", "fontFamily", "fontSize", "fontWeight",
        "fontStyle", "backgroundColor", "letterSpacing", "lineHeight",
        "alignment", "verticalAlignment", "padding"
      ]
    },
    "defaultProps": {
      "position": { "x": 0, "y": 0 },
      "width": 800,
      "height": 130,
      "opacity": 1,
      "rotation": 0,
      "zIndex": 0,
      "textColor": "#000000ff",
      "texts": {
        "type": "doc",
        "content": [
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "New Text",
                "style": {}
              }
            ]
          }
        ]
      },
      "fontFamily": "HK Grotesk",
      "fontSize": 42,
      "fontWeight": "700",
      "fontStyle": "normal",
      "backgroundColor": "#00000000",
      "letterSpacing": 0,
      "lineHeight": 1.5,
      "alignment": "left",
      "verticalAlignment": "top",
      "padding": 20
    },
    "category": "basic"
  },

  // Image Component Schema
  "Image": {
    "type": "Image",
    "name": "Image",
    "schema": {
      "_ui_type": "UIObject",
      "title": "Image",
      "metadata": { "control": "none", "controlProps": {} },
      "type": "object",
      "properties": {
        "position": {
          "_ui_type": "UIObject",
          "title": "Position",
          "description": "Position on the slide (x, y coordinates)",
          "metadata": { "control": "none", "controlProps": {} },
          "type": "object",
          "properties": {
            "x": {
              "type": "number",
              "_ui_type": "UIProperty",
              "title": "X",
              "description": "X position on the slide",
              "metadata": { "control": "slider", "controlProps": {} }
            },
            "y": {
              "type": "number",
              "_ui_type": "UIProperty",
              "title": "Y",
              "description": "Y position on the slide",
              "metadata": { "control": "slider", "controlProps": {} }
            }
          },
          "required": ["x", "y"]
        },
        "src": {
          "type": "string",
          "_ui_type": "UIProperty",
          "title": "URL",
          "description": "URL to the image source",
          "metadata": { "control": "input", "controlProps": {} }
        },
        // Other image-specific properties would continue here
      },
      "required": [
        "position", "width", "height", "opacity", "rotation", "zIndex",
        "textColor", "src", "alt", "objectFit", "borderRadius", "borderWidth",
        "borderColor", "shadow", "shadowBlur", "shadowColor", "shadowOffsetX",
        "shadowOffsetY", "shadowSpread", "mediaSourceId", "originalFilename",
        "aiInterpretation", "mediaSlideId"
      ]
    },
    "defaultProps": {
      "position": { "x": 500, "y": 200 },
      "width": 500,
      "height": 300,
      "opacity": 1,
      "rotation": 0,
      "zIndex": 1,
      "textColor": "#000000",
      "src": "",
      "alt": "",
      "objectFit": "cover",
      "borderRadius": 0,
      "borderWidth": 0,
      "borderColor": "#000000ff",
      "shadow": false,
      "shadowBlur": 10,
      "shadowColor": "#0000004D",
      "shadowOffsetX": 0,
      "shadowOffsetY": 4,
      "shadowSpread": 0,
      "mediaSourceId": "",
      "originalFilename": "",
      "aiInterpretation": "",
      "mediaSlideId": ""
    },
    "category": "media"
  },

  // Lines Component Schema
  "Lines": {
    "type": "Lines",
    "name": "Lines",
    "schema": {
      "_ui_type": "UIObject",
      "title": "Lines",
      "metadata": { "control": "none", "controlProps": {} },
      "type": "object",
      "properties": {
        "position": {
          "_ui_type": "UIObject",
          "title": "Position",
          "description": "Position on the slide (x, y coordinates)",
          "metadata": { "control": "none", "controlProps": {} },
          "type": "object",
          "properties": {
            "x": {
              "type": "number",
              "_ui_type": "UIProperty",
              "title": "X",
              "description": "X position on the slide",
              "metadata": { "control": "slider", "controlProps": {} }
            },
            "y": {
              "type": "number",
              "_ui_type": "UIProperty",
              "title": "Y",
              "description": "Y position on the slide",
              "metadata": { "control": "slider", "controlProps": {} }
            }
          },
          "required": ["x", "y"]
        },
        "startPoint": {
          "_ui_type": "UIObject",
          "title": "Start Point",
          "description": "Starting point of the line",
          "metadata": { "control": "none", "controlProps": {} },
          "type": "object",
          "properties": {
            "x": { "type": "number" },
            "y": { "type": "number" },
            "connection": { "type": ["string", "null"] }
          },
          "required": ["x", "y"]
        },
        "endPoint": {
          "_ui_type": "UIObject",
          "title": "End Point", 
          "description": "Ending point of the line",
          "metadata": { "control": "none", "controlProps": {} },
          "type": "object",
          "properties": {
            "x": { "type": "number" },
            "y": { "type": "number" },
            "connection": { "type": ["string", "null"] }
          },
          "required": ["x", "y"]
        },
        "controlPoints": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "x": { "type": "number" },
              "y": { "type": "number" }
            },
            "required": ["x", "y"]
          },
          "_ui_type": "UIProperty",
          "title": "Control Points",
          "description": "Control points for curved lines"
        },
        "connectionType": {
          "anyOf": [
            { "const": "straight", "type": "string" },
            { "const": "curved", "type": "string" },
            { "const": "bezier", "type": "string" }
          ],
          "_ui_type": "UIEnum",
          "title": "Connection Type",
          "description": "Type of line connection",
          "metadata": {
            "control": "dropdown",
            "controlProps": {
              "enumValues": ["straight", "curved", "bezier"]
            }
          }
        },
        "startShape": {
          "anyOf": [
            { "const": "none", "type": "string" },
            { "const": "arrow", "type": "string" },
            { "const": "circle", "type": "string" },
            { "const": "square", "type": "string" }
          ],
          "_ui_type": "UIEnum",
          "title": "Start Shape",
          "description": "Shape at the start of the line"
        },
        "endShape": {
          "anyOf": [
            { "const": "none", "type": "string" },
            { "const": "arrow", "type": "string" },
            { "const": "circle", "type": "string" },
            { "const": "square", "type": "string" }
          ],
          "_ui_type": "UIEnum",
          "title": "End Shape",
          "description": "Shape at the end of the line"
        },
        "stroke": {
          "type": "string",
          "_ui_type": "UIProperty",
          "title": "Stroke Color",
          "description": "Line color",
          "metadata": {
            "control": "colorpicker",
            "controlProps": { "defaultValue": "#000000ff" }
          }
        },
        "strokeWidth": {
          "type": "number",
          "minimum": 0,
          "maximum": 50,
          "_ui_type": "UIProperty",
          "title": "Stroke Width",
          "description": "Line thickness in pixels"
        },
        "strokeDasharray": {
          "type": "string",
          "_ui_type": "UIProperty",
          "title": "Stroke Dash Array",
          "description": "Dash pattern for the line (e.g., '10,5')"
        }
      },
      "required": [
        "position", "width", "height", "opacity", "rotation", "zIndex",
        "startPoint", "endPoint", "connectionType", "startShape", "endShape",
        "stroke", "strokeWidth"
      ]
    },
    "defaultProps": {
      "position": { "x": 0, "y": 0 },
      "width": 400,
      "height": 200,
      "opacity": 1,
      "rotation": 0,
      "zIndex": 1,
      "startPoint": { "x": 0, "y": 100, "connection": null },
      "endPoint": { "x": 400, "y": 100, "connection": null },
      "controlPoints": [],
      "connectionType": "straight",
      "startShape": "none",
      "endShape": "arrow",
      "stroke": "#000000ff",
      "strokeWidth": 2,
      "strokeDasharray": ""
    },
    "category": "basic"
  }

  // Additional component schemas would follow the same pattern
  // Video, Table, CustomComponent, etc.
};

export default typeboxSchemas; 