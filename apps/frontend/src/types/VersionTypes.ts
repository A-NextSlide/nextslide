import { CompleteDeckData } from './DeckTypes';

export interface DeckVersion {
  id: string;                   // UUID for the version
  deck_id: string;              // Reference to the parent deck
  version_name: string;         // User-friendly name for the version
  version_number: number;       // Sequential number for ordering
  data: CompleteDeckData;       // Complete snapshot of the deck at this version
  created_at: string;           // Timestamp when version was created
  created_by: string | null;    // User who created the version
  is_auto_save: boolean;        // Whether this was an auto-saved version
  parent_version_id: string | null; // Reference to parent version (for branching)
  metadata: {                   // Additional metadata about the version
    description: string | null;
    tags: string[];
    thumbnail_url: string | null;
    bookmarked?: boolean;            // Whether this version is bookmarked
    notes?: string;                  // User notes about this version
  }
}

export interface VersionDiff {
  addedSlides: string[];              // IDs of slides added
  removedSlides: string[];            // IDs of slides removed
  modifiedSlides: {                   // Information about modifications
    slideId: string;
    addedComponents: string[];
    removedComponents: string[];
    modifiedComponents: string[];
  }[];
  deckPropertyChanges: string[];      // Names of deck properties that changed
}