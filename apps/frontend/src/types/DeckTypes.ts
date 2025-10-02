import { SlideData, DeckOutline as FrontendDeckOutline, NarrativeFlow } from "../types/SlideTypes";

// Interface for full deck serialization including React code
export interface FullDeckExport {
  meta: {
    format: "full";
    version: string;
    timestamp: string;
  };
  deck: {
    uuid: string;
    name: string;
    lastModified: string;
  };
  slides: SlideData[];
  dependencies: string[];
}

// Interface for minimal deck export (data only, no JSX)
export interface MinimalDeckExport {
  meta: {
    format: "minimal";
    version: string;
    timestamp: string;
  };
  deck: {
    uuid: string;
    name: string;
    lastModified: string;
  };
  slides: Array<{
    id: string;
    title: string;
    components: Array<{
      id: string;
      type: string;
      props: Record<string, any>;
    }>;
  }>;
}

// Interface for presentation deck export
export interface PresentationDeckExport {
  meta: {
    format: "presentation";
    version: string;
    timestamp: string;
  };
  deck: {
    uuid: string;
    name: string;
    lastModified: string;
  };
  slides: SlideData[];
  globalStyles?: string;
  elementStyles?: Record<string, any>;
  themeOverrides?: Record<string, any>; // Consider a more specific type if known, e.g., { darkMode?: boolean }
}

// Basic deck data interface used in the store
export interface DeckData {
  uuid: string;
  name: string;
  slides: SlideData[];
  lastModified: string;
  size?: {
    width: number;
    height: number;
  };
}

// Main CompleteDeckData interface for deck storage
export interface CompleteDeckData {
  // Core fields
  uuid: string;
  name: string;
  slides: SlideData[];
  outline?: FrontendDeckOutline;
  
  // Timestamps
  lastModified: string;
  created_at: string;
  updated_at: string;
  
  // User and permissions
  user_id?: string;
  visibility?: 'private' | 'public' | 'unlisted';
  
  // Metadata
  description?: string;
  tags?: string[];
  version?: string;
  
  // Configuration
  size?: {
    width: number;
    height: number;
  };
  
  // Additional data storage
  data?: Record<string, any>;
  
  // Narrative flow data (stored in deck.notes by backend)
  notes?: NarrativeFlow;
  
  // Status for progressive loading
  status?: DeckStatus;
  
  // Internal database ID (not usually exposed to frontend)
  id?: string;
  
  // Sharing-related fields
  shared_by?: {
    id: string;
    email: string;
    name?: string;
  };
  share_type?: 'view' | 'edit';
  shared_at?: string;
  is_shared?: boolean;
  permissions?: string[];
}

export type { SlideData };

export interface DeckStatus {
  state: "creating" | "pending" | "generating" | "completed" | "error";
  currentSlide: number;
  totalSlides: number;
  message: string;
  progress: number;
  startedAt: string;
  completedAt?: string;
  currentSlideTitle?: string;
  lastCompletedSlide?: string;
  error?: string;
  errorSlide?: string;
}
