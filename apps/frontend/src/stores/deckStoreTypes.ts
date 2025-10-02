import { CompleteDeckData as DeckData } from '../types/DeckTypes';
import { SlideData } from '../types/SlideTypes';
import { DeckVersion, VersionDiff } from '../types/VersionTypes';
import { DeckDiff } from '../utils/apiUtils';
import { ComponentInstance } from '../types/components';
import { SubscriptionManager } from '../utils/SubscriptionManager';
import { UpdateOperation } from './deckCoreOperations';
import { YjsDocumentManager } from '../yjs/YjsDocumentManager';

// Core deck state interface
export interface CoreDeckState {
  deckData: DeckData;
  updateInProgress: boolean;
  updateQueue: Array<() => Promise<void>>;
  
  // Core deck operations
  updateDeckData: (data: Partial<DeckData>, options?: { skipBackend?: boolean, batchUpdate?: boolean, isRealtimeUpdate?: boolean }) => void;
  applyDeckDiff: (deckDiff: DeckDiff) => void;
  processUpdateQueue: () => Promise<void>;
  scheduleUpdate: (updateFn: UpdateOperation) => void;
  generateNewVersion: () => { version: string, lastModified: string };
  createDefaultDeck: () => Promise<DeckData>;
}

// Slide operations interface
export interface SlidesState {
  addSlide: (slide: Omit<SlideData, 'id'>) => Promise<void>;
  addSlideAfter: (afterSlideId: string, slide?: Partial<SlideData>) => Promise<void>;
  updateSlide: (id: string, data: Partial<SlideData>) => Promise<void>;
  removeSlide: (id: string) => Promise<void>;
  duplicateSlide: (id: string) => Promise<void>;
  reorderSlides: (sourceIndex: number, destinationIndex: number) => Promise<void>;
  
  // Component operations
  addComponent: (slideId: string, component: ComponentInstance) => void;
  updateComponent: (slideId: string, componentId: string, data: Partial<ComponentInstance>) => void;
  deleteComponent: (slideId: string, componentId: string) => void;
  batchUpdateComponents: (slideId: string, components: ComponentInstance[]) => void;
}

// Synchronization state interface
export interface SyncState {
  isSyncing: boolean;
  lastSyncTime: Date | null;
  supabaseSubscription: unknown | null;
  subscriptionManager: SubscriptionManager;
  
  // Sync operations
  loadDeck: () => Promise<void>;
  setupRealtimeSubscription: () => void;
  cleanupRealtimeSubscription: () => void;
  deleteDeck: (deckId: string) => Promise<boolean>;
}

// Version history state interface
export interface VersionHistoryState {
  versionHistory: {
    versions: DeckVersion[];
    currentVersionId: string | null;
    isViewingHistory: boolean;
    pendingChanges: boolean;
  };
  autoSaveIntervalId: number | null;
  
  // Version history operations
  createVersion: (name: string, description?: string, bookmarked?: boolean, notes?: string) => Promise<string | null>;
  restoreVersion: (versionId: string) => Promise<boolean>;
  getVersionHistory: () => Promise<DeckVersion[]>;
  updateVersionMetadata: (versionId: string, updates: {
    name?: string;
    description?: string;
    bookmarked?: boolean;
    notes?: string;
  }) => Promise<boolean>;
  compareVersions: (versionId1: string, versionId2: string) => Promise<VersionDiff>;
  setAutoSaveInterval: (intervalMs: number | null) => void;
}

// YJS Collaboration state and operations
export interface YjsCollaborationState {
  // Yjs document manager
  yjsDocManager: YjsDocumentManager | null;
  yjsSyncEnabled: boolean;
  yjsConnected: boolean;
  yjsLoading: boolean;
  
  // Initialize Yjs with current deck data
  initializeYjsSync: (docManager: YjsDocumentManager, initialDeckData?: DeckData) => void;
  
  // Disconnect from Yjs
  disconnectYjsSync: () => void;
  
  // Enable/disable Yjs sync
  setYjsSyncEnabled: (enabled: boolean) => void;
  
  // Direct Yjs operations (bypass Zustand)
  yjsAddComponent: (slideId: string, component: ComponentInstance) => void;
  yjsUpdateComponent: (slideId: string, componentId: string, props: Partial<ComponentInstance['props']>) => void;
  yjsRemoveComponent: (slideId: string, componentId: string) => void;
  yjsAddSlide: (slide: SlideData) => void;
  yjsUpdateSlide: (slideId: string, slideData: Partial<SlideData>) => void;
  yjsRemoveSlide: (slideId: string) => void;
  
  // Get connection status
  getYjsConnectionStatus: () => {
    isConnected: boolean;
    isEnabled: boolean;
    clientId: number | null;
  };
}

// Combined deck store state interface
export interface DeckState extends CoreDeckState, SlidesState, SyncState, VersionHistoryState, YjsCollaborationState {
  // Initialization
  initialize: (options?: { 
    syncEnabled?: boolean;
    useRealtimeSubscription?: boolean;
    autoSyncInterval?: number;
    deckId?: string;
    collaborationEnabled?: boolean;
    collaborationUrl?: string;
    isNewDeck?: boolean;
  }) => void;

  // Performance optimization - cached slides for faster access
  slidesCache: Record<string, SlideData>;
  
  // Performance optimization - get slide quickly for editing
  getSlideForEditing: (slideId: string) => SlideData | null;
  
  // Clear slide cache to ensure fresh data
  clearSlideCache: () => void;
  
  // Navigation state
  currentSlideIndex: number;

  // Batch update components for multiple slides
  batchUpdateSlideComponents: (updates: { slideId: string; components: ComponentInstance[] }[]) => void;
  
  // Create a new deck
  createNewDeck: (newDeckData: DeckData) => Promise<string | null>;
  
  // Reset the store to clean state
  resetStore: () => void;
}