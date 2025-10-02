// Import the ComponentInstance type
import { ComponentInstance } from './components';

export interface SlideData {
  id: string;
  deckId: string;
  title?: string;
  order: number;
  components: ComponentInstance[];
  backgroundImage?: string;
  backgroundColor?: string;
  status: 'pending' | 'generating' | 'streaming' | 'completed' | 'error';
  isLocked?: boolean;
  lastModified?: number;
  hasOptimized?: boolean;
}

/**
 * Brand guideline extracted information
 */
export interface BrandGuidelineExtracted {
  fonts: Array<{
    name: string;
    usage: string;
    weights?: string[];
  }>;
  colors: Array<{
    name: string;
    hex: string;
    usage: string;
  }>;
  designPrinciples: string[];
  visualElements: string[];
  source: string;
}

/**
 * Structure for a deck outline used in AI-generated content
 */
export interface DeckOutline {
  id: string;
  title: string;
  slides: SlideOutline[];
  uploadedMedia?: TaggedMedia[]; // All media uploaded for this deck
  discarded_files?: DiscardedFile[];
  source_files_used?: Array<{
    file_id: string;
    filename: string;
    reasoning: string;
  }>;
  brandGuidelineExtracted?: BrandGuidelineExtracted | null; // Brand guidelines extracted from files
  stylePreferences?: {
    initialIdea?: string;
    vibeContext?: string;
    font?: string | null;
    colors?: ColorConfig | null;
    autoSelectImages?: boolean;
    referenceLinks?: string[];
  };
  narrativeFlow?: NarrativeFlow; // Narrative flow analysis
}

/**
 * Narrative flow structure for presentation guidance
 */
export interface NarrativeFlow {
  story_arc: {
    type: string;
    description: string;
    phases: Array<{
      name: string;
      slides: string[];
      purpose: string;
      suggested_duration: number;
    }>;
  };
  key_themes: Array<{
    theme: string;
    description: string;
    related_slides: string[];
    importance: 'high' | 'medium' | 'low';
  }>;
  flow_recommendations: Array<{
    type: string;
    between_slides?: string[] | null;
    recommendation: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  tone_and_style: {
    overall_tone: string;
    language_level: string;
    engagement_techniques: string[];
  };
  presentation_tips: Array<{
    slide_id?: string | null;
    tip: string;
    category: 'delivery' | 'content' | 'visual' | 'interaction';
  }>;
}

/**
 * Structure for a slide outline used in AI-generated content
 */
export interface SlideOutline {
  id: string;
  title: string;
  content: string;
  deepResearch: boolean;
  extractedData?: ExtractedData;
  // Optional: explicit citations for this slide (promoted to top-level so backend can consume directly)
  citations?: Citation[];
  // Optional: numbered footnotes for sources, aligned with inline [n] tokens
  footnotes?: Footnote[];
  taggedMedia?: TaggedMedia[];
  animateReorder?: boolean;
  researchComplete?: boolean;
  // Manual mode support: multiple charts per slide
  manualCharts?: ManualChart[];
  // Flag to indicate this slide was manually added/edited
  isManual?: boolean;
  // Optional notes from research process; presence can hint citations exist
  research_notes?: string;
}

/**
 * Represents media (images, charts, data) tagged for inclusion in a slide
 */
export interface TaggedMedia {
  id: string;
  filename: string;
  type: 'image' | 'chart' | 'data' | 'pdf' | 'other';
  content?: string | File | Blob; // Original file or data content
  previewUrl?: string; // Preview URL if available
  interpretation?: string; // AI interpretation of the content
  slideId?: string; // Associated slide ID
  componentId?: string; // ID of the component created from this media
  status: 'pending' | 'processed' | 'included' | 'excluded'; // Status of the media in the slide
  metadata?: Record<string, any>; // Additional metadata about the media
}

export interface DiscardedFile {
  file_id: string;
  filename: string;
  reasoning: string;
}

export interface ColorConfig {
  type: 'default' | 'predefined' | 'ai' | 'custom';
  name?: string;      
  background?: string; 
  text?: string;       
  accent1?: string;      
  accent2?: string;
  accent3?: string;
}

export interface Citation {
  title?: string;
  source?: string;
  url: string;
}

export interface Footnote {
  index: number;
  label: string;
  url?: string;
}

export interface ExtractedData {
  source: string;
  chartType?: string;
  data: any[];
  compatibleChartTypes?: string[];
  title?: string; // Optional title for the chart
  // Optional metadata including research citations
  metadata?: {
    citations?: Citation[];
    [key: string]: any;
  } | any;
}

// Manual mode chart structure (supports multiple charts per slide)
export interface ManualChart {
  id: string;
  chartType: string;
  data: any[];
  title?: string;
}
