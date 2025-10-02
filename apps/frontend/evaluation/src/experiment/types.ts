import { DeckDiff, SlideData, ComponentInstance } from '../types';

// Define a structure for experiment input
export interface ExperimentInput {
  id: string;
  description: string;
  currentSlideId?: string; // ID of the current slide being viewed/edited
  prompt: string;       // Prompt to send to the API
  slides: SlideData[]; // Slides with their components
  deckDiff?: DeckDiff;  // Can be null if we're generating the diff from the API
  apiConfig?: any;      // Any configuration for the API call
}

// Define a structure for API response
export interface ApiResponse {
  deckDiff: DeckDiff;
  messages: string[];   // Messages returned by the API
  metadata: Record<string, any>; // Any additional metadata
}

// Define structure for LLM quality evaluation response
export interface QualityEvaluation {
  score: number;        // Score from 1-5
  explanation: string;  // Explanation for the score
  metadata?: Record<string, any>; // Any additional metadata from evaluation
}

// Define a structure for experiment results with runtime metrics
export interface ExperimentResult {
  experiment: ExperimentInput;
  resultPath: string;   // Path to the generated HTML file
  runtime: number;      // Runtime in milliseconds (now represents diff generation time)
  success: boolean;     // Whether the experiment was successful
  error?: string;       // Error message if not successful
  apiLatency?: number;  // Time spent waiting for API response in milliseconds
  timestamp: number;    // When the experiment was run
  qualityScore?: number; // Quality score from 1-5 evaluated by LLM
  qualityEvaluation?: QualityEvaluation; // Full evaluation data
  totalRuntime?: number; // Total experiment runtime in milliseconds
  qualityEvaluationTime?: number; // Time spent evaluating quality in milliseconds
  label?: string;       // Category label for the experiment
  runName?: string;     // Name of the experiment run
  run_uuid?: string;     // UUID for tracking the experiment run
  beforeImagePaths?: string[]; // Paths to generated images for before slides
  afterImagePaths?: string[]; // Paths to generated images for after slides
}

// Enhanced slide data for our implementation
export interface EnhancedSlideData extends SlideData {
  width?: number;
  height?: number;
  background?: any;
  components?: any[];
} 