import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';
import { TranslatedSlide } from '@/pages/SlideTagging';
import { DEFAULT_SLIDE_WIDTH } from '@/utils/deckUtils';
import { SlideTemplateAIService } from './SlideTemplateAIService';
import { EmbeddingsService, EmbeddingContent } from './EmbeddingsService';
import { API_CONFIG } from '@/config/environment';

// Define interface for slide template
export interface SlideTemplate {
  uuid?: string;
  created_at?: string;
  name: string;
  slides: any; // JSONB in DB
  description?: string;
  content?: any; // JSONB in DB
  auto_tags?: string[]; // JSONB in DB
  custom_tags?: string[]; // JSONB in DB
  lastmodified?: string; // Match database column name and TypeScript types
  size?: any; // JSONB in DB
  embedding?: any;
  design_embedding?: any; // New field for design description embeddings
  similarity?: number; // For search results
  searchType?: 'vector' | 'text'; // For hybrid search results
  design_description?: string; // Detailed AI-generated description of the slide design
  visual_analysis?: any; // JSONB containing detailed visual analysis
  image_url?: string; // URL to image stored in Supabase Storage
}

/**
 * Service for managing slide templates
 */
export class SlideTemplateService {
  /**
   * Save a slide as a template
   */
  static async saveTemplate(slideData: TranslatedSlide, additionalInfo: Partial<SlideTemplate> & { screenshot?: string } = {}): Promise<{ success: boolean, data?: any, error?: any }> {
    try {
      let slideName = slideData.title?.trim() || 'Untitled Template';
      
      // Extract content details for auto-tagging
      const contentInfo = this.extractContentInfo(slideData);
      
      // Use AI service for intelligent tagging - now with optional image analysis
      let aiAnalysis;
      let designDescription = '';
      let visualAnalysis = {};
      let imageUrl = '';
      
      // Log screenshot info
      if (additionalInfo.screenshot) {
        const screenshotPreview = additionalInfo.screenshot.substring(0, 100);
    
        
        // Validate screenshot data
        if (!additionalInfo.screenshot.startsWith('data:image/')) {
          console.warn('Invalid screenshot format - missing data:image/ prefix');
        }
        
        // Upload screenshot to Supabase Storage
        try {
  
          imageUrl = await this.uploadScreenshotToStorage(additionalInfo.screenshot, slideName);
                      if (!imageUrl) {
              // Screenshot upload returned null URL - continuing without image
            } else {

          }
        } catch (uploadError) {
          // Continue without image - not critical
        }
        
        // Check if OpenAI API key is configured
        if (!API_CONFIG.OPENAI_API_KEY) {
          // OpenAI API key is not configured! Please set VITE_OPENAI_API_KEY in your .env file
          // Use text-only analysis
          aiAnalysis = await SlideTemplateAIService.analyzeSlide(slideData);
        } else {
          // Use the enhanced image + text analysis for better tagging
          aiAnalysis = await SlideTemplateAIService.analyzeSlideWithImage(slideData, additionalInfo.screenshot);
          if (!aiAnalysis.success) {
            // AI analysis failed
          }
          
          // Generate detailed design description
          try {
            const designResult = await SlideTemplateAIService.generateDesignDescription(additionalInfo.screenshot);
            
            if (designResult.success) {
              designDescription = designResult.description;
              visualAnalysis = designResult.visualAnalysis || {};
            } else {
              // Failed to generate design description
            }
          } catch (designError) {
            // Exception generating design description
          }
        }
      } else {
        // Fallback to text-only analysis
        aiAnalysis = await SlideTemplateAIService.analyzeSlide(slideData);
      }
      
      // If AI analysis fails, fall back to our rule-based tagging
      const autoTags = aiAnalysis.success ? 
        aiAnalysis.tags : 
        this.generateAutoTags(slideData, contentInfo);
      
      const description = aiAnalysis.success ? 
        aiAnalysis.description : 
        (additionalInfo.description || this.generateDescription(slideData, contentInfo));
      
      // Generate AI-powered title from description (more efficient than separate API call)
      if (description && description !== 'No description provided') {
        const generatedTitle = this.generateTitleFromDescription(description);
        if (generatedTitle && generatedTitle !== 'Untitled Template') {
          slideName = generatedTitle;
        }
      }
      
      // Prepare content for embedding generation - now includes design description
      const embeddingContent: EmbeddingContent = {
        title: slideName,
        description: description,
        textContent: contentInfo.totalTextContent,
        tags: [...autoTags, ...(additionalInfo.custom_tags || [])],
        layout: contentInfo.layout,
        componentTypes: Object.keys(contentInfo.componentCounts).filter(type => type !== 'Background'),
        designDescription: designDescription || undefined // Include design description in embedding
      };
      
      // Generate embedding
      const embeddingResult = await EmbeddingsService.generateEmbedding(embeddingContent);
      
      if (!embeddingResult.success) {
        // Continue without embedding - it's not critical for basic functionality
      }
      
      // Generate design embedding if we have design description
      let designEmbeddingResult = null;
      if (designDescription && designDescription.trim().length > 0) {
        const designEmbeddingContent: EmbeddingContent = {
          title: '', // Empty for design embeddings
          description: '', // Empty for design embeddings
          textContent: '',
          tags: [],
          layout: '',
          componentTypes: [],
          designDescription: designDescription // Only design description
        };
        
        designEmbeddingResult = await EmbeddingsService.generateEmbedding(designEmbeddingContent);
        
        if (!designEmbeddingResult.success) {
          // Continue without design embedding - it's not critical
        }
      }
      
      // Format template data (excluding screenshot to avoid database size issues)
      const { screenshot, ...otherAdditionalInfo } = additionalInfo;
      const templateData: SlideTemplate = {
        name: slideName, // Use generated title
        slides: [slideData],
        description: description,
        content: contentInfo,
        auto_tags: autoTags,
        custom_tags: additionalInfo.custom_tags || [],
        lastmodified: new Date().toISOString(),
        size: { width: 1920, height: 1080 }, // Default size
        embedding: embeddingResult.success ? JSON.stringify(embeddingResult.embedding) : null, // Store as JSON string
        design_embedding: designEmbeddingResult?.success ? JSON.stringify(designEmbeddingResult.embedding) : null, // Store design embedding
        design_description: designDescription || null, // Save the design description
        visual_analysis: Object.keys(visualAnalysis).length > 0 ? visualAnalysis : null, // Save visual analysis
        image_url: imageUrl || null, // Save the image URL
        ...otherAdditionalInfo // Spread other additional info but exclude screenshot
      };
      
      // Save to database
      const { data, error } = await supabase
        .from('slide_templates')
        .insert(templateData)
        .select('*')
        .single();
      
      if (error) {
        return { success: false, error };
      }
      
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err };
    }
  }
  
  /**
   * Upload screenshot to Supabase Storage
   */
  private static async uploadScreenshotToStorage(base64Screenshot: string, slideName: string): Promise<string | null> {
    try {
      // Convert base64 to blob
      const base64Data = base64Screenshot.replace(/^data:image\/[a-z]+;base64,/, '');
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });
      
      // Generate unique filename
      const timestamp = Date.now();
      const sanitizedName = slideName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
      const fileName = `slide_screenshots/${sanitizedName}_${timestamp}.png`;
      
      // Upload to Supabase Storage - using the correct 'slide-media' bucket
      const { data, error } = await supabase.storage
        .from('slide-media')
        .upload(fileName, blob, {
          contentType: 'image/png',
          upsert: false
        });
      
      if (error) {
        return null;
      }
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('slide-media')
        .getPublicUrl(fileName);
      
      return urlData.publicUrl;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Check if a slide is already saved as a template (by name/title)
   */
  static async isTemplateSaved(slideName: string): Promise<boolean> {
    try {
      // Clean up the slide name for comparison
      const cleanSlideName = (slideName || '').trim();
      
      if (!cleanSlideName) {
        return false; // Can't check for empty names
      }
      
      const { data, error } = await supabase
        .from('slide_templates')
        .select('uuid')
        .eq('name', cleanSlideName)
        .limit(1);
      
      if (error) {
        return false;
      }
      
      return data && data.length > 0;
    } catch (err) {
      return false;
    }
  }
  
  /**
   * Extract content information from slide
   */
  private static extractContentInfo(slideData: TranslatedSlide): any {
    // Count components by type
    const componentCounts: Record<string, number> = {};
    let totalTextContent = '';
    
    slideData.components.forEach(component => {
      // Count by component type
      componentCounts[component.type] = (componentCounts[component.type] || 0) + 1;
      
      // Extract text content
      if (component.type === 'TiptapTextBlock' && component.props?.texts?.content) {
        try {
          this.extractTextFromTiptap(component.props.texts.content, (text) => {
            totalTextContent += text + ' ';
          });
        } catch (e) {
          // Error extracting text from component
        }
      }
    });
    
    return {
      componentCounts,
      totalTextContent: totalTextContent.trim(),
      layout: this.identifyLayout(slideData),
      wordCount: totalTextContent.split(/\s+/).filter(Boolean).length
    };
  }
  
  /**
   * Extract text from Tiptap content
   */
  private static extractTextFromTiptap(content: any, textCallback: (text: string) => void): void {
    // Handle array of content
    if (Array.isArray(content)) {
      content.forEach(item => this.extractTextFromTiptap(item, textCallback));
      return;
    }
    
    // Handle text node directly
    if (content.type === 'text' && content.text) {
      textCallback(content.text);
      return;
    }
    
    // Handle nested content
    if (content.content && Array.isArray(content.content)) {
      content.content.forEach(item => this.extractTextFromTiptap(item, textCallback));
    }
  }
  
  /**
   * Identify the slide layout
   */
  private static identifyLayout(slideData: TranslatedSlide): string {
    const components = slideData.components;
    const types = components.map(c => c.type);
    
    // Count text and image components
    const textCount = components.filter(c => c.type === 'TiptapTextBlock').length;
    const imageCount = components.filter(c => c.type === 'Image').length;
    
    // Identify common layouts
    if (textCount === 1 && imageCount === 0) {
      return 'text-only';
    } else if (textCount === 0 && imageCount === 1) {
      return 'image-only';
    } else if (textCount === 1 && imageCount === 1) {
      return 'text-and-image';
    } else if (textCount >= 2 && imageCount === 0) {
      return 'multi-text';
    } else if (textCount === 0 && imageCount >= 2) {
      return 'multi-image';
    } else if (textCount >= 1 && imageCount >= 1) {
      return 'mixed-content';
    }
    
    return 'custom';
  }
  
  /**
   * Generate auto tags based on slide content
   */
  private static generateAutoTags(slideData: TranslatedSlide, contentInfo: any): string[] {
    const tags: Set<string> = new Set();
    
    // Add layout as a tag
    tags.add(contentInfo.layout);
    
    // Add component-based tags
    Object.entries(contentInfo.componentCounts).forEach(([type, count]) => {
      if (type !== 'Background') { // Skip background component
        tags.add(`has-${type.toLowerCase()}`);
        if ((count as number) > 1) {
          tags.add(`multiple-${type.toLowerCase()}`);
        }
      }
    });
    
    // Add content-based tags
    if (contentInfo.wordCount > 100) {
      tags.add('text-heavy');
    } else if (contentInfo.wordCount < 20) {
      tags.add('minimal-text');
    }
    
    // Add color-based tags from background
    const backgroundComp = slideData.components.find(c => c.type === 'Background');
    if (backgroundComp) {
      if (backgroundComp.props.backgroundType === 'color') {
        const bgColor = backgroundComp.props.color || '';
        if (bgColor.includes('#fff') || bgColor.includes('#FFF') || bgColor === 'white') {
          tags.add('white-background');
        } else if (bgColor.includes('#000') || bgColor.includes('#000') || bgColor === 'black') {
          tags.add('dark-background');
        }
        
        // Add generic color tags
        if (bgColor) {
          const colorName = this.identifyColorName(bgColor);
          if (colorName) tags.add(`${colorName}-theme`);
        }
      } else if (backgroundComp.props.backgroundType === 'gradient') {
        tags.add('gradient-background');
      } else if (backgroundComp.props.backgroundType === 'image') {
        tags.add('image-background');
      }
    }
    
    // Analyze text styling
    const textComps = slideData.components.filter(c => c.type === 'TiptapTextBlock');
    if (textComps.length > 0) {
      // Check for font sizes
      const largeTextExists = textComps.some(c => (c.props.fontSize || 0) > 32);
      if (largeTextExists) tags.add('large-text');
      
      // Check for text alignment
      const centeredTextExists = textComps.some(c => c.props.alignment === 'center');
      if (centeredTextExists) tags.add('centered-text');
      
      // Check for text styles
      const boldTextExists = textComps.some(c => c.props.fontWeight === 'bold');
      if (boldTextExists) tags.add('emphasizes-text');
    }
    
    // Check for image attributes
    const imageComps = slideData.components.filter(c => c.type === 'Image');
    if (imageComps.length > 0) {
      // Check for image shapes
      const circleImageExists = imageComps.some(c => c.props.clipShape === 'circle');
      if (circleImageExists) tags.add('circle-images');
      
      // Check for image sizes
      const largeImageExists = imageComps.some(c => (c.props.width || 0) > DEFAULT_SLIDE_WIDTH / 2);
      if (largeImageExists) tags.add('large-images');
    }
    
    // Add complexity tags 
    const totalComponents = slideData.components.length;
    if (totalComponents > 10) {
      tags.add('complex-layout');
    } else if (totalComponents < 4) {
      tags.add('simple-layout');
    }
    
    // Add slide position/purpose tags
    if (slideData.title) {
      const title = slideData.title.toLowerCase();
      
      // Common slide types based on title
      if (title.includes('title') || title.includes('cover')) {
        tags.add('title-slide');
      } else if (title.includes('agenda') || title.includes('contents') || title.includes('overview')) {
        tags.add('agenda-slide');
      } else if (title.includes('thank') || title.includes('end') || title.includes('contact') || title.includes('questions')) {
        tags.add('closing-slide');
      } else if (title.includes('intro') || title.includes('introduction')) {
        tags.add('intro-slide');
      } else if (title.includes('summary') || title.includes('conclusion')) {
        tags.add('summary-slide');
      } else if (title.includes('team') || title.includes('about us')) {
        tags.add('team-slide');
      }
      
      // Content-based tags
      if (title.includes('data') || title.includes('chart') || title.includes('graph') || title.includes('stats')) {
        tags.add('data-visualization');
      } else if (title.includes('process') || title.includes('flow') || title.includes('steps')) {
        tags.add('process-slide');
      } else if (title.includes('timeline')) {
        tags.add('timeline-slide');
      } else if (title.includes('quote')) {
        tags.add('quote-slide');
      } else if (title.includes('compare') || title.includes('vs') || title.includes('versus')) {
        tags.add('comparison-slide');
      }
    }
    
    // Add text content-based tags by analyzing the content
    if (contentInfo.totalTextContent) {
      const text = contentInfo.totalTextContent.toLowerCase();
      
      // Look for buzzwords/keywords in the content
      if (text.includes('goal') || text.includes('objective') || text.includes('aim')) {
        tags.add('goals-objectives');
      }
      if (text.includes('problem') || text.includes('challenge')) {
        tags.add('problem-statement');
      }
      if (text.includes('solution') || text.includes('approach')) {
        tags.add('solution-slide');
      }
      if (text.includes('feature') || text.includes('benefit')) {
        tags.add('features-benefits');
      }
      if (text.includes('market') || text.includes('customer')) {
        tags.add('market-focused');
      }
      if (text.includes('research') || text.includes('study') || text.includes('analysis')) {
        tags.add('research-data');
      }
    }
    
    return [...tags];
  }
  
  /**
   * Identify a color name from a hex code
   */
  private static identifyColorName(hexColor: string): string | null {
    // Strip # if present
    hexColor = hexColor.replace('#', '');
    
    // Parse color
    let r = 0, g = 0, b = 0;
    
    // Parse RGB
    if (hexColor.length === 6) {
      r = parseInt(hexColor.substring(0, 2), 16);
      g = parseInt(hexColor.substring(2, 4), 16);
      b = parseInt(hexColor.substring(4, 6), 16);
    } else if (hexColor.length === 3) {
      // For shorthand #RGB
      r = parseInt(hexColor[0] + hexColor[0], 16);
      g = parseInt(hexColor[1] + hexColor[1], 16);
      b = parseInt(hexColor[2] + hexColor[2], 16);
    } else {
      return null; // Invalid format
    }
    
    // Simplified color naming
    if (r > 200 && g < 100 && b < 100) return 'red';
    if (r < 100 && g > 200 && b < 100) return 'green';
    if (r < 100 && g < 100 && b > 200) return 'blue';
    if (r > 200 && g > 200 && b < 100) return 'yellow';
    if (r > 200 && g < 100 && b > 200) return 'purple';
    if (r < 100 && g > 200 && b > 200) return 'teal';
    if (r > 200 && g > 100 && b < 100) return 'orange';
    if (r > 180 && g > 180 && b > 180) return 'light';
    if (r < 80 && g < 80 && b < 80) return 'dark';
    
    return 'colorful'; // Default
  }
  
  /**
   * Generate a description based on slide content
   */
  private static generateDescription(slideData: TranslatedSlide, contentInfo: any): string {
    const { componentCounts, wordCount, layout } = contentInfo;
    
    // Format component counts in a readable way
    const componentsDesc = Object.entries(componentCounts)
      .filter(([type]) => type !== 'Background')
      .map(([type, count]) => `${count} ${type}${(count as number) > 1 ? 's' : ''}`)
      .join(', ');
    
    // Create a description based on the layout and components
    let description = `${slideData.title} - A ${layout} slide with ${componentsDesc}`;
    
    // Add text description if available
    if (wordCount > 0) {
      description += ` containing ${wordCount} words`;
    }
    
    return description;
  }
  
  /**
   * Generate a concise title from a description using simple text processing
   */
  private static generateTitleFromDescription(description: string): string {
    if (!description || description.length < 10) {
      return 'Untitled Template';
    }
    
    // Clean up the description
    const cleanDesc = description
      .replace(/^.*?-\s*/, '') // Remove "Title - " prefix if present
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    // Extract key phrases and words
    const words = cleanDesc.split(' ');
    
    // Look for key business/presentation terms
    const keyTerms = [
      'overview', 'summary', 'introduction', 'agenda', 'timeline', 'roadmap',
      'strategy', 'plan', 'goals', 'objectives', 'metrics', 'results',
      'analysis', 'report', 'dashboard', 'comparison', 'features',
      'benefits', 'process', 'workflow', 'team', 'about', 'contact',
      'thank you', 'questions', 'conclusion', 'next steps'
    ];
    
    // Find important words
    const importantWords = words.filter(word => {
      const lowerWord = word.toLowerCase().replace(/[^\w]/g, '');
      return keyTerms.includes(lowerWord) || 
             (word.length > 4 && !['with', 'that', 'this', 'slide', 'template', 'presentation'].includes(lowerWord));
    });
    
    // Generate title based on content
    if (importantWords.length > 0) {
      // Take first 2-3 important words
      const titleWords = importantWords.slice(0, 3);
      let title = titleWords.join(' ');
      
      // Capitalize first letter of each word
      title = title.replace(/\b\w/g, l => l.toUpperCase());
      
      // Clean up common patterns
      title = title
        .replace(/\bA\s+/g, '') // Remove standalone "A"
        .replace(/\bAn\s+/g, '') // Remove standalone "An"
        .replace(/\bThe\s+/g, '') // Remove standalone "The"
        .trim();
      
      if (title.length > 3 && title.length < 50) {
        return title;
      }
      }
      
    // Fallback: take first few words of description
    const firstWords = words.slice(0, 4).join(' ');
    if (firstWords.length > 3 && firstWords.length < 50) {
      return firstWords.replace(/\b\w/g, l => l.toUpperCase());
      }
      
    return 'Untitled Template';
  }
  
  /**
   * Get all slide templates with pagination
   */
  static async getAllTemplates(limit: number = 50, offset: number = 0): Promise<{ 
    templates: SlideTemplate[], 
    total: number,
    success: boolean, 
    error?: any 
  }> {
    try {
      // Get templates with pagination
      const { data, error, count } = await supabase
        .from('slide_templates')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      
      if (error) {
        return { templates: [], total: 0, success: false, error };
      }
      
      // Convert database format to SlideTemplate format
      const templates: SlideTemplate[] = (data || []).map(row => ({
        uuid: row.uuid,
        created_at: row.created_at,
        name: row.name,
        slides: row.slides,
        description: row.description,
        content: row.content,
        auto_tags: Array.isArray(row.auto_tags) ? row.auto_tags as string[] : [],
        custom_tags: Array.isArray(row.custom_tags) ? row.custom_tags as string[] : [],
        lastmodified: row.lastmodified,
        size: row.size,
        embedding: row.embedding,
        design_embedding: row.design_embedding,
        design_description: (row as any).design_description || null,
        visual_analysis: (row as any).visual_analysis || null,
        image_url: (row as any).image_url || null
      }));
      
      return { 
        templates, 
        total: count || 0, 
        success: true 
      };
    } catch (err) {
      return { templates: [], total: 0, success: false, error: err };
    }
  }
  
  /**
   * Delete a slide template by UUID
   */
  static async deleteTemplate(templateUuid: string): Promise<{ success: boolean, error?: any }> {
    try {
      const { error } = await supabase
        .from('slide_templates')
        .delete()
        .eq('uuid', templateUuid);
      
      if (error) {
        return { success: false, error };
      }
      
      return { success: true };
    } catch (err) {
      return { success: false, error: err };
    }
  }
  
  /**
   * Search templates by tags or name
   */
  static async searchTemplates(searchQuery: string): Promise<{ 
    templates: SlideTemplate[], 
    success: boolean, 
    error?: any 
  }> {
    try {
      // First try a comprehensive search across main fields and JSONB arrays
      let { data, error } = await supabase
        .from('slide_templates')
        .select('*')
        .or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%,design_description.ilike.%${searchQuery}%`)
        .order('created_at', { ascending: false })
        .limit(50);
      
      // If no results, try searching in tags using different methods
      if (!error && (!data || data.length === 0)) {
        // Try searching in JSON arrays by converting to text
        const { data: tagData, error: tagError } = await supabase
          .from('slide_templates')
          .select('*')
          .or(`auto_tags::text.ilike.%${searchQuery}%,custom_tags::text.ilike.%${searchQuery}%`)
          .order('created_at', { ascending: false })
          .limit(50);
        
        if (!tagError && tagData && tagData.length > 0) {
          data = tagData;
        }
      }
      
      // If still no results, try a broader content search
      if (!error && (!data || data.length === 0)) {
        const { data: contentData, error: contentError } = await supabase
          .from('slide_templates')
          .select('*')
          .or(`content::text.ilike.%${searchQuery}%`)
          .order('created_at', { ascending: false })
          .limit(50);
        
        if (!contentError && contentData && contentData.length > 0) {
          data = contentData;
        }
      }
      
      if (error) {
        return { templates: [], success: false, error };
      }
      
      // Convert database format to SlideTemplate format
      const templates: SlideTemplate[] = (data || []).map(row => ({
        uuid: row.uuid,
        created_at: row.created_at,
        name: row.name,
        slides: row.slides,
        description: row.description,
        content: row.content,
        auto_tags: Array.isArray(row.auto_tags) ? row.auto_tags as string[] : [],
        custom_tags: Array.isArray(row.custom_tags) ? row.custom_tags as string[] : [],
        lastmodified: row.lastmodified,
        size: row.size,
        embedding: row.embedding,
        design_embedding: row.design_embedding,
        design_description: (row as any).design_description || null,
        visual_analysis: (row as any).visual_analysis || null,
        image_url: (row as any).image_url || null
      }));
      
      return { templates, success: true };
    } catch (err) {
      return { templates: [], success: false, error: err };
    }
  }
  
  /**
   * Search templates using vector similarity (semantic search)
   */
  static async vectorSearchTemplates(query: string, limit: number = 20): Promise<{
    templates: SlideTemplate[],
    success: boolean,
    error?: any
  }> {
    try {
      // Generate embedding for the search query
      const queryEmbeddingResult = await EmbeddingsService.generateQueryEmbedding(query);
      
      if (!queryEmbeddingResult.success) {
        return await this.searchTemplates(query);
      }
      
      // Perform vector similarity search - convert embedding to string for the function
      const { data, error } = await supabase.rpc('search_templates_by_embedding', {
        query_embedding: JSON.stringify(queryEmbeddingResult.embedding),
        match_threshold: 0.5, // Lowered threshold from 0.7 to 0.5 for better matches
        match_count: limit
      });
      
      if (error) {
        // Check if it's a function not found error (production database doesn't have the function)
        if (error.code === '42883' || error.message?.includes('function') || error.message?.includes('does not exist')) {
          // Function doesn't exist, fall back to text search
          return await this.searchTemplates(query);
        }
        // Fall back to regular text search for other errors too
        return await this.searchTemplates(query);
      }
      
      // Convert results to SlideTemplate format
      const templates: SlideTemplate[] = (data || []).map((row: any) => ({
        uuid: row.uuid,
        created_at: row.created_at,
        name: row.name,
        slides: row.slides,
        description: row.description,
        content: row.content,
        auto_tags: Array.isArray(row.auto_tags) ? row.auto_tags as string[] : [],
        custom_tags: Array.isArray(row.custom_tags) ? row.custom_tags as string[] : [],
        lastmodified: row.lastmodified,
        size: row.size,
        embedding: row.embedding,
        design_embedding: row.design_embedding,
        similarity: row.similarity, // Include similarity score
        design_description: row.design_description || null,
        visual_analysis: row.visual_analysis || null,
        image_url: (row as any).image_url || null
      }));
      
      return { templates, success: true };
      
    } catch (err) {
      // Fall back to regular text search
      return await this.searchTemplates(query);
    }
  }
  
  /**
   * Hybrid search combining vector similarity and text matching
   */
  static async hybridSearchTemplates(query: string, limit: number = 20): Promise<{
    templates: SlideTemplate[],
    success: boolean,
    error?: any
  }> {
    try {
      const results = await Promise.allSettled([
        this.vectorSearchTemplates(query, Math.ceil(limit * 0.7)), // 70% from vector search
        this.searchTemplates(query) // 30% from text search
      ]);
      
      const vectorResults = results[0].status === 'fulfilled' ? results[0].value.templates : [];
      const textResults = results[1].status === 'fulfilled' ? results[1].value.templates : [];
      
      // Combine and deduplicate results
      const combinedResults = new Map<string, SlideTemplate>();
      
      // Add vector search results first (higher priority)
      vectorResults.forEach(template => {
        if (template.uuid) {
          combinedResults.set(template.uuid, { ...template, searchType: 'vector' });
        }
      });
      
      // Add text search results if not already included
      textResults.slice(0, Math.floor(limit * 0.3)).forEach(template => {
        if (template.uuid && !combinedResults.has(template.uuid)) {
          combinedResults.set(template.uuid, { ...template, searchType: 'text' });
        }
      });
      
      const finalResults = Array.from(combinedResults.values()).slice(0, limit);
      
      return { templates: finalResults, success: true };
      
    } catch (err) {
      return { templates: [], success: false, error: err };
    }
  }
  
  /**
   * Find similar templates to a given template
   */
  static async findSimilarTemplates(templateUuid: string, limit: number = 10): Promise<{
    templates: SlideTemplate[],
    success: boolean,
    error?: any
  }> {
    try {
      // Get the template's embedding
      const { data: sourceTemplate, error: fetchError } = await supabase
        .from('slide_templates')
        .select('embedding, name')
        .eq('uuid', templateUuid)
        .single();
      
      if (fetchError || !sourceTemplate?.embedding) {
        return { templates: [], success: false, error: 'Template not found or has no embedding' };
      }
      
      // Find similar templates using the embedding
      const { data, error } = await supabase.rpc('search_templates_by_embedding', {
        query_embedding: sourceTemplate.embedding,
        match_threshold: 0.6, // Lower threshold for similarity
        match_count: limit + 1 // +1 because we'll exclude the source template
      });
      
      if (error) {
        return { templates: [], success: false, error };
      }
      
      // Convert results and exclude the source template
      const templates: SlideTemplate[] = (data || [])
        .filter((row: any) => row.uuid !== templateUuid) // Exclude source template
        .slice(0, limit) // Ensure we don't exceed the limit
        .map((row: any) => ({
          uuid: row.uuid,
          created_at: row.created_at,
          name: row.name,
          slides: row.slides,
          description: row.description,
          content: row.content,
          auto_tags: Array.isArray(row.auto_tags) ? row.auto_tags as string[] : [],
          custom_tags: Array.isArray(row.custom_tags) ? row.custom_tags as string[] : [],
          lastmodified: row.lastmodified,
          size: row.size,
          embedding: row.embedding,
          design_embedding: row.design_embedding,
          similarity: row.similarity,
          design_description: row.design_description || null,
          visual_analysis: row.visual_analysis || null,
          image_url: (row as any).image_url || null
        }));
      
      return { templates, success: true };
      
    } catch (err) {
      return { templates: [], success: false, error: err };
    }
  }
  
  /**
   * Generate embeddings for templates that don't have them yet
   */
  static async generateMissingEmbeddings(progressCallback?: (progress: {
    current: number,
    total: number,
    batch: number,
    totalBatches: number,
    status: string
  }) => void): Promise<{
    success: boolean,
    processed: number,
    skipped: number,
    failed: number,
    quotaExceeded?: boolean,
    error?: any
  }> {
    try {
      // First, get the total count of templates
      const { count: totalCount, error: countError } = await supabase
        .from('slide_templates')
        .select('*', { count: 'exact', head: true });
      
      if (countError) {
        return { success: false, processed: 0, skipped: 0, failed: 0, error: countError };
      }
      
      let processed = 0;
      let skipped = 0;
      let failed = 0;
      let offset = 0;
      let quotaExceeded = false;
      const batchSize = 25; // Reduced batch size to avoid timeouts
      const totalBatches = Math.ceil(totalCount / batchSize);
      
      // Update progress callback with initial state
      progressCallback?.({
        current: 0,
        total: totalCount,
        batch: 0,
        totalBatches,
        status: 'Starting...'
      });
      
      // Process all templates in batches
      while (offset < totalCount && !quotaExceeded) {
        const currentBatch = Math.floor(offset / batchSize) + 1;
        
        // Update progress
        progressCallback?.({
          current: offset,
          total: totalCount,
          batch: currentBatch,
          totalBatches,
          status: `Processing batch ${currentBatch}/${totalBatches}`
        });
        
        try {
          // Get current batch of templates with timeout handling
          const { data: batchTemplates, error } = await supabase
            .from('slide_templates')
            .select('*')
            .order('created_at', { ascending: false })
            .range(offset, offset + batchSize - 1);
          
          if (error) {
            // If it's a timeout, try a smaller batch
            if (error.code === '57014' || error.message?.includes('timeout')) {
              failed += batchSize; // Count as failed for this batch
              offset += batchSize;
              continue;
            } else {
              // For other errors, still try to continue
              failed += batchSize;
              offset += batchSize;
              continue;
            }
          }
          
          if (!batchTemplates || batchTemplates.length === 0) {
            break; // No more templates
          }
          
          // Process each template in the current batch
          for (let i = 0; i < batchTemplates.length; i++) {
            const template = batchTemplates[i];
            
            // Update progress for individual template
            const currentProcessed = offset + i + 1;
            progressCallback?.({
              current: currentProcessed,
              total: totalCount,
              batch: currentBatch,
              totalBatches,
              status: `Processing "${template.name}"`
            });
            
            try {
              // Check what embeddings need to be generated
              const needsSearchEmbedding = !template.embedding || template.embedding === null;
              const needsDesignEmbedding = !template.design_embedding || template.design_embedding === null;
              const hasDesignDescription = template.design_description && template.design_description.trim().length > 0;
              
              // Skip if no embeddings needed
              if (!needsSearchEmbedding && !needsDesignEmbedding) {
                skipped++;
                continue;
              }
              
              let searchEmbeddingResult = null;
              let designEmbeddingResult = null;
              
              // Generate search embedding (tags + description + content)
              if (needsSearchEmbedding) {
                // Extract content info for embedding - safely cast JSONB
                const contentInfo = (template.content && typeof template.content === 'object') ? template.content as any : {};
                
                // Prepare content for search embedding generation (no design description)
                const searchEmbeddingContent: EmbeddingContent = {
                  title: template.name,
                  description: template.description || '',
                  textContent: contentInfo.totalTextContent || '',
                  tags: [
                    ...(Array.isArray(template.auto_tags) ? template.auto_tags as string[] : []),
                    ...(Array.isArray(template.custom_tags) ? template.custom_tags as string[] : [])
                  ],
                  layout: contentInfo.layout || 'unknown',
                  componentTypes: Object.keys(contentInfo.componentCounts || {}).filter(type => type !== 'Background')
                  // Note: Intentionally NOT including designDescription here
                };
                
                searchEmbeddingResult = await EmbeddingsService.generateEmbedding(searchEmbeddingContent);
                
                // Check for quota error
                if (!searchEmbeddingResult.success && searchEmbeddingResult.isQuotaError) {
                  quotaExceeded = true;
                  break;
                }
              }
              
              // Generate design embedding (design description only)
              if (needsDesignEmbedding && hasDesignDescription) {
                // Prepare content for design embedding generation (design description only)
                const designEmbeddingContent: EmbeddingContent = {
                  title: '', // Empty title for design embeddings
                  description: '', // Empty description for design embeddings  
                  textContent: '',
                  tags: [],
                  layout: '',
                  componentTypes: [],
                  designDescription: template.design_description // Only design description
                };
                
                designEmbeddingResult = await EmbeddingsService.generateEmbedding(designEmbeddingContent);
                
                // Check for quota error
                if (!designEmbeddingResult.success && designEmbeddingResult.isQuotaError) {
                  quotaExceeded = true;
                  break;
                }
              }
              
              // Update the template with the embeddings
              const updateData: any = {};
              
              if (needsSearchEmbedding && searchEmbeddingResult?.success) {
                updateData.embedding = JSON.stringify(searchEmbeddingResult.embedding);
              }
              
              if (needsDesignEmbedding && designEmbeddingResult?.success) {
                updateData.design_embedding = JSON.stringify(designEmbeddingResult.embedding);
              }
              
              // Only update if we have something to update
              if (Object.keys(updateData).length > 0) {
                const { error: updateError } = await supabase
                  .from('slide_templates')
                  .update(updateData)
                  .eq('uuid', template.uuid);
                
                if (updateError) {
                  failed++;
                } else {
                  processed++;
                }
              } else {
                // Nothing to update but we didn't fail
                if (needsSearchEmbedding && !searchEmbeddingResult?.success) failed++;
                if (needsDesignEmbedding && !designEmbeddingResult?.success) failed++;
              }
              
              // Small delay to prevent overwhelming the API
              await new Promise(resolve => setTimeout(resolve, 200)); // Slightly longer delay for two API calls
              
            } catch (err) {
              failed++;
            }
            
            // Break out of template loop if quota exceeded
            if (quotaExceeded) {
              break;
            }
          }
          
        } catch (batchError) {
          failed += batchSize;
        }
        
        // Move to next batch
        offset += batchSize;
        
        // Longer delay between batches to be API-friendly and avoid timeouts
        if (offset < totalCount && !quotaExceeded) {
          await new Promise(resolve => setTimeout(resolve, 1500)); // Increased delay for dual embeddings
        }
      }
      
      // Final progress update
      const finalStatus = quotaExceeded ? 
        'Stopped due to API quota limit' : 
        'Completed';
        
      progressCallback?.({
        current: quotaExceeded ? offset : totalCount,
        total: totalCount,
        batch: totalBatches,
        totalBatches,
        status: finalStatus
      });
      
      return { 
        success: !quotaExceeded || processed > 0, // Success if we processed some or didn't hit quota
        processed, 
        skipped, 
        failed,
        quotaExceeded
      };
      
    } catch (err) {
      return { success: false, processed: 0, skipped: 0, failed: 0, error: err };
    }
  }
} 