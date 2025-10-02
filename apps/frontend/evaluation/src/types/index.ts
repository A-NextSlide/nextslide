// Import types from interactive-slide-sorcery
// Note: These are type-only imports, so they won't be included in the bundle
import type { CompleteDeckData } from '@interactive-slide-sorcery/types/DeckTypes';
import type { SlideData } from '@interactive-slide-sorcery/types/SlideTypes';
import type { ComponentInstance } from '@interactive-slide-sorcery/types/components';
import type { DeckDiff } from '@interactive-slide-sorcery/utils/apiUtils';

// Re-export the types
export type { CompleteDeckData, SlideData, ComponentInstance, DeckDiff };

// Define our own types for the evaluation system
export interface RenderingResult {
  beforeImagePath: string;
  afterImagePath: string;
  deckDiff: DeckDiff;
  timestamp: string;
}

// Define a simplified slide diff structure for our own use
export interface SlideDiff {
  slide_id: string;
  components_to_update?: ComponentInstance[];
  components_to_add?: ComponentInstance[];
  components_to_remove?: string[];
  slide_properties?: Partial<SlideData>;
}

// Define a simplified deck diff structure for our own use
export interface SimpleDeckDiff {
  slides_to_update?: SlideDiff[];
  slides_to_add?: SlideData[];
  slides_to_remove?: string[];
  deck_properties?: Record<string, any>;
}

// Configuration for the headless renderer
export interface RendererConfig {
  outputDir: string;
  width: number;
  height: number;
  format: 'html' | 'png' | 'jpeg';
  quality?: number;
}

// Experiment related types

// Define a structure for experiment input
export interface ExperimentInput {
  id: string;
  description: string;
  slideId: string;
  deckDiff?: DeckDiff;  // Can be null if we're generating the diff from the API
  apiPrompt?: string;   // Prompt to send to the API
  apiConfig?: any;      // Any configuration for the API call
}

// Define a structure for API response
export interface ApiResponse {
  deckDiff: DeckDiff;
  messages: string[];   // Messages returned by the API
  metadata: Record<string, any>; // Any additional metadata
}

// Define a structure for experiment results
export interface ExperimentResult extends RenderingResult {
  experimentId: string;
  description: string;
  slideId: string;
  apiResponse?: ApiResponse;
  combinedHtmlPath: string; // Path to the HTML file with combined before/after views
} 