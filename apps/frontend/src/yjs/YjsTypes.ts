/**
 * Type definitions for Yjs integration
 */
import * as Y from 'yjs';
import { CompleteDeckData } from '../types/DeckTypes';
import { SlideData } from '../types/SlideTypes';
import { ComponentInstance } from '../types/components';

/**
 * Represents a Yjs document structure for a deck
 */
export interface YjsDocumentStructure {
  /** Main document */
  doc: Y.Doc;
  
  /** Map containing deck metadata */
  deckMap: Y.Map<any>;
  
  /** Array containing slide data */
  slidesArray: Y.Array<any>;
}

/**
 * User presence information
 */
export interface UserPresence {
  id: string;
  name: string;
  color: string;
  cursor?: {
    slideId: string;
    x: number;
    y: number;
  };
  selection?: {
    slideId: string;
    componentIds: string[];
  };
}

/**
 * Options for initializing a Yjs document
 */
export interface YjsDocOptions {
  /** A unique ID for the document */
  docId: string;
  
  /** WebSocket server URL */
  wsUrl?: string;
  
  /** Enable automatic connection */
  autoConnect?: boolean;
  
  /** Enable IndexedDB persistence */
  persistenceEnabled?: boolean;
  
  /** User information */
  user?: {
    id: string;
    name: string;
    color?: string;
  };
}

/**
 * Synchronization events
 */
export enum YjsSyncEvent {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  SYNCED = 'synced',
  ERROR = 'error',
  USER_JOINED = 'user-joined',
  USER_LEFT = 'user-left',
  UPDATE = 'update',
}

/**
 * Operation types for Yjs actions
 */
export enum YjsOperationType {
  ADD_SLIDE = 'add-slide',
  UPDATE_SLIDE = 'update-slide',
  REMOVE_SLIDE = 'remove-slide',
  ADD_COMPONENT = 'add-component',
  UPDATE_COMPONENT = 'update-component',
  REMOVE_COMPONENT = 'remove-component',
  UPDATE_DECK = 'update-deck',
  LOCK_COMPONENT = 'lock-component',
  UNLOCK_COMPONENT = 'unlock-component',
}

/**
 * Operation payload for Yjs actions
 */
export type YjsOperationPayload = {
  type: YjsOperationType;
  data: any;
  sourceClientId?: number;
  timestamp: number;
};

/**
 * Snapshot metadata
 */
export interface YjsSnapshotMetadata {
  id: string;
  version: number;
  timestamp: number;
  clientId: number;
}

/**
 * State update from Yjs
 */
export interface YjsStateUpdate {
  deckData: CompleteDeckData;
  source: 'local' | 'remote';
  sourceClientId?: number;
  operation?: YjsOperationType;
}

/**
 * Component update payload
 */
export interface ComponentUpdatePayload {
  slideId: string;
  componentId: string;
  props: Partial<ComponentInstance['props']>;
}

/**
 * Information about a component lock
 */
export interface ComponentLock {
  /** ID of the component that is locked */
  componentId: string;
  
  /** ID of the slide containing the component */
  slideId: string;
  
  /** ID of the user who owns the lock */
  userId: string;
  
  /** Client ID of the user who owns the lock */
  clientId: number;
  
  /** Name of the user who owns the lock */
  userName: string;
  
  /** Color associated with the user for visual indication */
  userColor: string;
  
  /** Timestamp when the lock was acquired */
  timestamp: number;
  
  /** Optional expiration time for auto-release */
  expiresAt?: number;
}

/**
 * Request for a component lock
 */
export interface LockRequest {
  /** ID of the component to lock */
  componentId: string;
  
  /** ID of the slide containing the component */
  slideId: string;
  
  /** ID of the user requesting the lock */
  userId: string;
  
  /** Name of the user requesting the lock */
  userName: string;
  
  /** Timestamp of the request */
  timestamp: number;
}

/**
 * Response to a lock request
 */
export interface LockResponse {
  /** ID of the component that was requested */
  componentId: string;
  
  /** ID of the slide containing the component */
  slideId: string;
  
  /** Whether the lock was granted */
  granted: boolean;
  
  /** If not granted, the current lock holder */
  currentLockHolder?: {
    userId: string;
    userName: string;
  };
  
  /** Optional error message */
  error?: string;
}