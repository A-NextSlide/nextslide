import { API_CONFIG } from '@/config/environment';

export interface EmbeddingContent {
  title: string;
  description: string;
  textContent: string;
  tags: string[];
  layout: string;
  componentTypes: string[];
  designDescription?: string;
}

/**
 * Service for generating and managing embeddings for slide templates
 */
export class EmbeddingsService {
  
  /**
   * Check if an error is due to API quota limits
   */
  private static isQuotaError(error: any): boolean {
    if (typeof error === 'string') {
      return error.includes('429') || error.includes('quota') || error.includes('insufficient_quota');
    }
    if (error instanceof Error) {
      return error.message.includes('429') || error.message.includes('quota') || error.message.includes('insufficient_quota');
    }
    return false;
  }
  
  /**
   * Generate embedding for slide content
   */
  static async generateEmbedding(content: EmbeddingContent): Promise<{ 
    success: boolean, 
    embedding?: number[], 
    error?: any,
    isQuotaError?: boolean
  }> {
    try {
      // Check if we have an API key
      if (!API_CONFIG.OPENAI_API_KEY) {
        throw new Error('OpenAI API key is not set');
      }
      
      // Create a comprehensive text representation of the slide
      const embeddingText = this.createEmbeddingText(content);
      
      // Generate embedding using OpenAI API
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_CONFIG.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small', // More cost-effective model
          input: embeddingText,
          encoding_format: 'float'
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage = `OpenAI Embeddings API Error: ${response.status} ${errorText}`;
        const isQuota = response.status === 429 || this.isQuotaError(errorText);
        
        throw new Error(errorMessage);
      }
      
      const responseData = await response.json();
      
      if (responseData.data && responseData.data.length > 0) {
        return { 
          success: true, 
          embedding: responseData.data[0].embedding 
        };
      } else {
        return { 
          success: false, 
          error: 'No embedding returned from OpenAI' 
        };
      }
      
    } catch (error) {
      const isQuota = this.isQuotaError(error);
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error),
        isQuotaError: isQuota
      };
    }
  }
  
  /**
   * Create a comprehensive text representation for embedding
   */
  private static createEmbeddingText(content: EmbeddingContent): string {
    const parts: string[] = [];
    
    // Add title (weighted heavily for search relevance)
    if (content.title) {
      parts.push(`Title: ${content.title}`);
      parts.push(`Slide Title: ${content.title}`); // Add duplicate for weight
      parts.push(`Template Name: ${content.title}`); // Additional weight
    }
    
    // Add description (high weight for search)
    if (content.description) {
      parts.push(`Description: ${content.description}`);
      parts.push(`Summary: ${content.description}`); // Duplicate for weight
    }
    
    // Add design description (new - high weight for visual search)
    if (content.designDescription) {
      parts.push(`Design: ${content.designDescription}`);
      parts.push(`Visual Design: ${content.designDescription}`);
      parts.push(`Layout Description: ${content.designDescription}`);
    }
    
    // Add text content
    if (content.textContent) {
      parts.push(`Content: ${content.textContent}`);
      parts.push(`Text: ${content.textContent}`);
    }
    
    // Add layout information (weighted for design search)
    if (content.layout) {
      parts.push(`Layout: ${content.layout}`);
      parts.push(`Structure: ${content.layout}`);
      parts.push(`Format: ${content.layout}`);
    }
    
    // Add component types (weighted for functionality search)
    if (content.componentTypes && content.componentTypes.length > 0) {
      const components = content.componentTypes.join(', ');
      parts.push(`Components: ${components}`);
      parts.push(`Elements: ${components}`);
      parts.push(`Contains: ${components}`);
      parts.push(`Features: ${components}`);
    }
    
    // Add tags (heavily weighted for searchability)
    if (content.tags && content.tags.length > 0) {
      const tags = content.tags.join(', ');
      parts.push(`Tags: ${tags}`);
      parts.push(`Keywords: ${tags}`);
      parts.push(`Categories: ${tags}`);
      parts.push(`Labels: ${tags}`);
      parts.push(`Topics: ${tags}`);
      // Add each tag individually for better matching
      content.tags.forEach(tag => {
        parts.push(`Tag: ${tag}`);
        parts.push(`Category: ${tag}`);
      });
    }
    
    return parts.join('. ');
  }
  
  /**
   * Generate embedding for search query
   */
  static async generateQueryEmbedding(query: string): Promise<{ 
    success: boolean, 
    embedding?: number[], 
    error?: any 
  }> {
    try {
      if (!API_CONFIG.OPENAI_API_KEY) {
        throw new Error('OpenAI API key is not set');
      }
      
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_CONFIG.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: query,
          encoding_format: 'float'
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI Embeddings API Error: ${response.status} ${errorText}`);
      }
      
      const responseData = await response.json();
      
      if (responseData.data && responseData.data.length > 0) {
        return { 
          success: true, 
          embedding: responseData.data[0].embedding 
        };
      } else {
        return { 
          success: false, 
          error: 'No embedding returned for query' 
        };
      }
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Batch generate embeddings for multiple contents
   */
  static async generateBatchEmbeddings(contents: EmbeddingContent[]): Promise<{
    success: boolean,
    embeddings?: number[][],
    error?: any
  }> {
    try {
      if (!API_CONFIG.OPENAI_API_KEY) {
        throw new Error('OpenAI API key is not set');
      }
      
      // Create embedding texts for all contents
      const embeddingTexts = contents.map(content => this.createEmbeddingText(content));
      
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_CONFIG.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: embeddingTexts,
          encoding_format: 'float'
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI Embeddings API Error: ${response.status} ${errorText}`);
      }
      
      const responseData = await response.json();
      
      if (responseData.data && responseData.data.length === contents.length) {
        return {
          success: true,
          embeddings: responseData.data.map((item: any) => item.embedding)
        };
      } else {
        return {
          success: false,
          error: 'Mismatch in embedding count'
        };
      }
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
} 