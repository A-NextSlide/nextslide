/**
 * Types for Deck Outline structure
 */

export interface ExtractedDataItem {
  source: string;           // REQUIRED - Filename or source description
  chartType?: string;       // Optional - 'bar', 'line', 'pie', etc.
  data: Array<any>;        // REQUIRED - The actual data
  title?: string;          // Optional - Chart title
  compatibleChartTypes?: string[]; // Optional - Compatible chart types
  metadata?: any;          // Optional - Additional metadata
}

export interface TaggedMediaItem {
  id: string;
  url: string;
  alt?: string;
  caption?: string;
  mediaType?: 'image' | 'video' | 'gif';
}

export interface SlideOutline {
  id: string;
  title: string;
  content: string;
  deepResearch?: boolean;
  taggedMedia?: TaggedMediaItem[];
  extractedData?: ExtractedDataItem;
}

export interface DeckOutline {
  topic: string;
  description?: string;
  prompt?: string;
  narrativeFlow?: any;
  slides: SlideOutline[];
}

/**
 * Helper function to create valid ExtractedData
 */
export function createExtractedData(
  data: any[],
  metadata: {
    source?: string;
    title?: string;
    chartType?: string;
    filename?: string;
    [key: string]: any;
  } = {}
): ExtractedDataItem {
  return {
    source: metadata.source || metadata.filename || metadata.title || 'Manual Entry',
    chartType: metadata.chartType || 'bar',
    data: Array.isArray(data) ? data : [],
    title: metadata.title || 'Data Visualization',
    compatibleChartTypes: metadata.compatibleChartTypes,
    metadata
  };
}

/**
 * Validate and fix ExtractedData to ensure required fields
 */
export function validateExtractedData(
  extractedData: any,
  fallbackSource: string = 'User Data'
): ExtractedDataItem | undefined {
  if (!extractedData) {
    return undefined;
  }
  
  return {
    ...extractedData,
    source: extractedData.source || extractedData.title || fallbackSource,
    data: Array.isArray(extractedData.data) ? extractedData.data : []
  };
}