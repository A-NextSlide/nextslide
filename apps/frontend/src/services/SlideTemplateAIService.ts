import { API_CONFIG } from '@/config/environment';
import { TranslatedSlide } from '@/pages/SlideTagging';

/**
 * Service for AI-powered slide template analysis and tagging
 */
export class SlideTemplateAIService {
  /**
   * Generate AI-powered tags and analysis for a slide template
   */
  static async analyzeSlide(slideData: TranslatedSlide): Promise<{
    tags: string[];
    description: string;
    purpose: string;
    success: boolean;
    confidence?: number;
    error?: any;
  }> {
    try {
      // Extract slide information to send to OpenAI
      const slideInfo = this.prepareSlideDataForAnalysis(slideData);

      // Define the system prompt
      const systemPrompt = `You are an expert slide template analyzer specializing in professional presentation design. 
Your task is to analyze slide content and generate highly specific, searchable tags and metadata.

ANALYSIS OBJECTIVES:
1. Generate 8-12 highly specific tags that would help someone find this exact type of slide
2. Write a concise but informative description highlighting key elements
3. Identify the primary business/presentation purpose

TAG GENERATION RULES:
- Be SPECIFIC and ACTIONABLE - tags should describe exact use cases
- Include industry/domain tags when content suggests them (e.g., "saas-metrics", "financial-report", "product-roadmap")
- Include design pattern tags (e.g., "three-column-comparison", "hero-image-left", "data-dashboard")
- Include audience tags when appropriate (e.g., "executive-summary", "technical-deep-dive", "investor-pitch")
- Include emotional/tone tags (e.g., "professional", "playful", "minimalist", "data-driven")
- Avoid generic tags like "slide", "presentation", "content"
- If numbers/statistics are present, include "data-driven", "metrics-focused", etc.

Format your response as valid JSON:
{
  "tags": ["specific-tag1", "specific-tag2", ...],
  "description": "A comprehensive 1-2 sentence description",
  "purpose": "The specific business/presentation context where this slide would be used"
}

Remember: Tags should answer "What would someone search for to find this exact slide?"`;

      // Create the user message
      const userPrompt = `Please analyze this slide template and provide appropriate tags, description, and purpose:
      
${JSON.stringify(slideInfo, null, 2)}`;

      // Call OpenAI API
      const response = await fetch(API_CONFIG.OPENAI_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_CONFIG.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: API_CONFIG.OPENAI_MODEL || 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API Error: ${response.status} ${errorText}`);
      }

      const responseData = await response.json();
      const aiResponseContent = responseData.choices?.[0]?.message?.content;
      
      if (!aiResponseContent) {
        throw new Error('Invalid response from OpenAI API');
      }

      // Parse the JSON response
      const analysisResult = JSON.parse(aiResponseContent);

      return {
        tags: analysisResult.tags || [],
        description: analysisResult.description || 'No description provided',
        purpose: analysisResult.purpose || 'General purpose slide',
        success: true,
        confidence: 0.8 // Default confidence for text-based analysis
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        tags: [],
        description: '',
        purpose: ''
      };
    }
  }

  /**
   * Prepare slide data for AI analysis by extracting relevant information
   */
  private static prepareSlideDataForAnalysis(slideData: TranslatedSlide): any {
    // Extract text content from all text components
    const textComponents = slideData.components.filter(comp => comp.type === 'TiptapTextBlock');
    const textContent = textComponents
      .map(comp => {
        try {
          return this.extractTextFromTiptap(comp.props?.texts?.content || {});
        } catch (e) {
          return '';
        }
      })
      .filter(Boolean)
      .join('\n\n');

    // Count components by type (excluding background)
    const componentCounts: Record<string, number> = {};
    slideData.components.forEach(comp => {
      if (comp.type !== 'Background') { // Don't count background
        componentCounts[comp.type] = (componentCounts[comp.type] || 0) + 1;
      }
    });

    // Extract image information
    const imageComponents = slideData.components.filter(comp => comp.type === 'Image');
    
    // Get background info
    const backgroundComp = slideData.components.find(comp => comp.type === 'Background');
    const backgroundInfo = backgroundComp ? {
      type: backgroundComp.props.backgroundType || 'color',
      color: backgroundComp.props.color || 'transparent',
      hasImage: !!backgroundComp.props.backgroundImageUrl
    } : {};

    // Analyze text characteristics
    const wordCount = textContent.split(/\s+/).filter(Boolean).length;
    const hasTitle = slideData.title && slideData.title.trim().length > 0;
    
    // Determine layout characteristics
    const layoutInfo = {
      hasImages: imageComponents.length > 0,
      imageCount: imageComponents.length,
      textBlockCount: textComponents.length,
      totalVisibleComponents: Object.values(componentCounts).reduce((sum, count) => sum + count, 0)
    };

    // Put it all together with clear structure
    return {
      title: slideData.title || 'Untitled',
      hasTitle,
      textContent: textContent || 'No text content',
      wordCount,
      layout: layoutInfo,
      background: backgroundInfo,
      // Only include component details if they're meaningful
      components: Object.keys(componentCounts).length > 0 ? componentCounts : { none: 'No visible components' }
    };
  }

  /**
   * Extract text from Tiptap content
   */
  private static extractTextFromTiptap(content: any): string {
    if (!content) return '';
    
    // Handle array of content
    if (Array.isArray(content)) {
      return content.map(item => this.extractTextFromTiptap(item)).join(' ');
    }
    
    // Handle text node directly
    if (content.type === 'text' && content.text) {
      return content.text;
    }
    
    // Handle nested content
    if (content.content && Array.isArray(content.content)) {
      return content.content.map(item => this.extractTextFromTiptap(item)).join(' ');
    }
    
    return '';
  }

  /**
   * Analyze a slide image using vision AI to generate tags
   */
  static async analyzeSlideImage(imageDataUrl: string): Promise<{
    success: boolean;
    tags: string[];
    description?: string;
    error?: string;
  }> {
    try {
      if (!API_CONFIG.OPENAI_API_KEY) {
        return {
          success: false,
          tags: [],
          error: 'OpenAI API key not configured'
        };
      }

      // Prepare the image for analysis
      const base64Image = imageDataUrl.split(',')[1] || imageDataUrl;
      
      const requestBody = {
        model: 'gpt-4o',
        messages: [
          {
            role: "system",
            content: `You are a presentation design expert analyzing slides for a template library.

            ANALYSIS FOCUS:
            1. Visual hierarchy and layout patterns
            2. Color schemes and visual style
            3. Content structure and information architecture
            4. Professional quality and polish
            5. Specific industry/use case indicators
            6. Emotional tone and brand personality

            TAG GENERATION:
            - Create 8-12 specific, searchable tags
            - Include layout patterns (e.g., "split-screen", "centered-title", "grid-layout")
            - Include visual style (e.g., "gradient-background", "flat-design", "corporate-blue")
            - Include content type (e.g., "comparison-chart", "process-flow", "team-photos")
            - Include use cases (e.g., "quarterly-review", "product-launch", "company-values")
            - Be specific about colors, shapes, and visual elements

            Return JSON:
            {
              "tags": ["specific-visual-tag1", "use-case-tag2", ...],
              "description": "A visual-focused description of the slide's design and content"
            }`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this slide and generate specific tags focusing on its visual design, layout, and potential use cases. Be very specific about what you see."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${base64Image}`,
                  detail: "high"
                }
              }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
        response_format: { type: "json_object" }
      };
      
      const response = await fetch(API_CONFIG.OPENAI_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_CONFIG.OPENAI_API_KEY}`
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API Error: ${response.status} ${errorText}`);
      }

      const responseData = await response.json();
      const content = responseData.choices[0]?.message?.content || '{}';
      
      try {
        const analysisResult = JSON.parse(content);
        
        return {
          success: true,
          tags: analysisResult.tags || [],
          description: analysisResult.description || ''
        };
      } catch (parseError) {
        // Return default values if parsing fails
        return {
          success: true,
          tags: []
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        tags: [],
        description: ''
      };
    }
  }

  /**
   * Generate a detailed design description for recreating the slide
   */
  static async generateDesignDescription(imageDataUrl: string): Promise<{
    success: boolean;
    description: string;
    visualAnalysis?: any;
    error?: string;
  }> {
    try {
      if (!API_CONFIG.OPENAI_API_KEY) {
        return {
          success: false,
          description: '',
          error: 'OpenAI API key not configured'
        };
      }

      const base64Image = imageDataUrl.split(',')[1] || imageDataUrl;
      
      const requestBody = {
        model: 'gpt-4o',
        messages: [
          {
            role: "system",
            content: `You are a UI/UX designer creating detailed specifications for recreating presentation slides.

            Your task is to provide a COMPREHENSIVE design description that another designer could use to recreate this slide exactly.

            Include ALL of these details:

            LAYOUT & STRUCTURE:
            - Overall layout pattern (e.g., "two-column with 60/40 split")
            - Component positioning (use directional terms: top-left, center, bottom-right)
            - Spacing and margins (describe as proportions: "large padding", "tight spacing")
            - Alignment of elements

            VISUAL HIERARCHY:
            - What draws attention first, second, third
            - Size relationships between elements
            - Use of contrast and emphasis

            COLORS & STYLING:
            - Background color/gradient/image
            - Text colors for different elements
            - Any accent colors or highlights
            - Shadow, border, or other effects

            TYPOGRAPHY:
            - Relative font sizes (e.g., "extra-large title", "medium body text")
            - Font weights and styles
            - Text alignment and spacing

            CONTENT ELEMENTS:
            - Type of content (text, images, charts, icons)
            - Specific details about images/graphics
            - Data visualization styles if present

            DESIGN STYLE:
            - Overall aesthetic (modern, corporate, playful, minimal)
            - Level of visual complexity
            - Professional quality indicators

            Return as JSON:
            {
              "description": "A detailed paragraph describing exactly how to recreate this slide's design",
              "visualAnalysis": {
                "layout": "specific layout description",
                "colors": ["#hex1", "#hex2", ...],
                "typography": "font hierarchy description",
                "keyElements": ["element1", "element2", ...],
                "style": "design style keywords"
              }
            }`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Provide a detailed design specification for recreating this slide. Be extremely specific about layout, colors, typography, and visual elements."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${base64Image}`,
                  detail: "high"
                }
              }
            ]
          }
        ],
        max_tokens: 1000,
        temperature: 0.5,
        response_format: { type: "json_object" }
      };
      
      const response = await fetch(API_CONFIG.OPENAI_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_CONFIG.OPENAI_API_KEY}`
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API Error: ${response.status} ${errorText}`);
      }

      const responseData = await response.json();
      const content = responseData.choices[0]?.message?.content || '{}';
      
      try {
        const result = JSON.parse(content);
        
        return {
          success: true,
          description: result.description || '',
          visualAnalysis: result.visualAnalysis || {}
        };
      } catch (parseError) {
        return {
          success: false,
          description: '',
          visualAnalysis: {},
          error: 'Failed to parse AI response'
        };
      }

    } catch (error) {
      return {
        success: false,
        description: '',
        visualAnalysis: {},
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Combine image analysis with text analysis for comprehensive tagging
   */
  static async analyzeSlideWithImage(
    slide: any,
    imageDataUrl?: string
  ): Promise<{
    success: boolean;
    tags: string[];
    description?: string;
    confidence?: number;
    error?: string;
  }> {
    try {
      // Get text-based analysis
      const textAnalysis = await this.analyzeSlide(slide);
      
      // If we have an image, get vision-based analysis
      if (imageDataUrl) {
        const imageAnalysis = await this.analyzeSlideImage(imageDataUrl);
        
        if (imageAnalysis.success && textAnalysis.success) {
          // Combine and deduplicate tags
          const allTags = [...new Set([...textAnalysis.tags, ...imageAnalysis.tags])];
          
          // Sort tags by relevance (tags appearing in both analyses come first)
          const tagCounts = new Map<string, number>();
          [...textAnalysis.tags, ...imageAnalysis.tags].forEach(tag => {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
          });
          
          const sortedTags = allTags.sort((a, b) => {
            const countA = tagCounts.get(a) || 0;
            const countB = tagCounts.get(b) || 0;
            return countB - countA;
          });
          
          return {
            success: true,
            tags: sortedTags.slice(0, 15), // Return top 15 tags
            description: imageAnalysis.description || textAnalysis.description,
            confidence: (textAnalysis.confidence || 0.5) * 0.5 + 0.5 // Boost confidence with image analysis
          };
        }
      }
      
      // Fallback to text-only analysis
      return textAnalysis;
      
    } catch (error) {
      // Fallback to text-only analysis
      return await this.analyzeSlide(slide);
    }
  }
} 