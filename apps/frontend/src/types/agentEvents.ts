/**
 * Agent Event Types and Status Phases
 * Centralized definitions for outline agent streaming events
 */

export const STATUS_PHASES = {
  // Initial processing
  thinking: {
    icon: '',
    label: 'Processing',
    color: '#3B82F6',
    activeLabel: 'Thinking'
  },

  // File analysis
  analyzing_file: {
    icon: '',
    label: 'Reading file',
    color: '#8B5CF6',
    activeLabel: 'Reading file'
  },
  analyzing: {
    icon: '',
    label: 'Analyzing',
    color: '#8B5CF6',
    activeLabel: 'Analyzing'
  },
  files_analyzed: {
    icon: '',
    label: 'Learned from files',
    color: '#10B981',
    activeLabel: 'Learned from files'
  },
  analyzed: {
    icon: '',
    label: 'Analyzed',
    color: '#10B981',
    activeLabel: 'Analyzed'
  },
  file_analysis_error: {
    icon: '',
    label: 'Could not read file',
    color: '#EF4444',
    activeLabel: 'Could not read file'
  },

  // Research
  researching: {
    icon: '',
    label: 'Researching',
    color: '#6366F1',
    activeLabel: 'Researching'
  },
  research_complete: {
    icon: '',
    label: 'Found info',
    color: '#10B981',
    activeLabel: 'Found info'
  },
  research_failed: {
    icon: '',
    label: 'Search failed',
    color: '#EF4444',
    activeLabel: 'Search failed'
  },

  // URL scraping
  scraping: {
    icon: '',
    label: 'Reading',
    color: '#6366F1',
    activeLabel: 'Reading'
  },
  scraped: {
    icon: '',
    label: 'Gathered content',
    color: '#10B981',
    activeLabel: 'Gathered content'
  },
  scraping_media: {
    icon: '',
    label: 'Finding images',
    color: '#EC4899',
    activeLabel: 'Finding images'
  },
  media_scraped: {
    icon: '',
    label: 'Found media',
    color: '#10B981',
    activeLabel: 'Found media'
  },
  videos_found: {
    icon: '',
    label: 'Found videos',
    color: '#10B981',
    activeLabel: 'Found videos'
  },
  assigning_media: {
    icon: '',
    label: 'Assigning media',
    color: '#8B5CF6',
    activeLabel: 'Assigning media'
  },

  // Content extraction
  extracting: {
    icon: '',
    label: 'Extracting',
    color: '#6366F1',
    activeLabel: 'Extracting'
  },
  extracted: {
    icon: '',
    label: 'Extracted',
    color: '#10B981',
    activeLabel: 'Extracted'
  },
  extract_failed: {
    icon: '',
    label: 'Extraction failed',
    color: '#EF4444',
    activeLabel: 'Extraction failed'
  },

  // Compilation
  compiling: {
    icon: '',
    label: 'Compiling',
    color: '#F59E0B',
    activeLabel: 'Building outline'
  },

  // Generation phases
  generating: {
    icon: '',
    label: 'Creating',
    color: '#3B82F6',
    activeLabel: 'Creating presentation'
  },
  enriching: {
    icon: '',
    label: 'Applying theme',
    color: '#EC4899',
    activeLabel: 'Applying theme'
  },
  updating_theme: {
    icon: '',
    label: 'Updating theme',
    color: '#EC4899',
    activeLabel: 'Updating theme'
  },
  updating_slides: {
    icon: '',
    label: 'Updating slides',
    color: '#06B6D4',
    activeLabel: 'Updating slides'
  },

  // Brand detection
  detecting_brand: {
    icon: '',
    label: 'Detecting brand',
    color: '#F59E0B',
    activeLabel: 'Detecting brand'
  },
  analyzing_theme: {
    icon: '',
    label: 'Analyzing topic',
    color: '#8B5CF6',
    activeLabel: 'Analyzing topic'
  },
  fetching_brand_colors: {
    icon: '',
    label: 'Getting brand colors',
    color: '#EC4899',
    activeLabel: 'Getting brand colors'
  },

  // Theme generation
  generating_theme: {
    icon: '',
    label: 'Creating theme',
    color: '#F59E0B',
    activeLabel: 'Creating theme'
  },
  theme_complete: {
    icon: '',
    label: 'Theme ready',
    color: '#10B981',
    activeLabel: 'Theme ready'
  },

  // Outline generation
  generating_outline: {
    icon: '',
    label: 'Planning slides',
    color: '#06B6D4',
    activeLabel: 'Planning slides'
  },
  outline_complete: {
    icon: '',
    label: 'Outline ready',
    color: '#10B981',
    activeLabel: 'Outline ready'
  },

  // Error state
  error: {
    icon: '',
    label: 'Error',
    color: '#EF4444',
    activeLabel: 'Error'
  },
} as const;

export type StatusPhase = keyof typeof STATUS_PHASES;

export interface ThinkingStep {
  id: string;
  phase: StatusPhase | string;
  label: string;
  detail?: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  timestamp: Date;
  expandedContent?: string;
  citations?: string[];
}

export interface ResearchResult {
  query: string;
  content: string;
  citations: string[];
  timestamp: Date;
}

// SSE Event types from backend
export type AgentEventType =
  | 'text'
  | 'outline'
  | 'status'
  | 'error'
  | 'done'
  | 'research'
  | 'chat_block'
  | 'thinking_step';

export interface BaseAgentEvent {
  type: AgentEventType;
}

export interface TextEvent extends BaseAgentEvent {
  type: 'text';
  content: string;
}

export interface StatusEvent extends BaseAgentEvent {
  type: 'status';
  status: StatusPhase | string;
  message?: string;
  query?: string;
}

export interface ResearchEvent extends BaseAgentEvent {
  type: 'research';
  content: string;
  citations?: string[];
  query?: string;
}

export interface ThinkingStepEvent extends BaseAgentEvent {
  type: 'thinking_step';
  step: ThinkingStep;
}

export interface ChatBlockEvent extends BaseAgentEvent {
  type: 'chat_block';
  block_type: 'theme_editor' | 'outline_preview' | 'research_card';
  data: unknown;
}

export interface OutlineEvent extends BaseAgentEvent {
  type: 'outline';
  action: 'generate_outline' | 'update_outline' | 'update_slides' | 'update_theme' | 'generate_theme';
  [key: string]: unknown;
}

export interface ErrorEvent extends BaseAgentEvent {
  type: 'error';
  message: string;
  code?: string;
}

export interface DoneEvent extends BaseAgentEvent {
  type: 'done';
}

export type AgentEvent =
  | TextEvent
  | StatusEvent
  | ResearchEvent
  | ThinkingStepEvent
  | ChatBlockEvent
  | OutlineEvent
  | ErrorEvent
  | DoneEvent;
