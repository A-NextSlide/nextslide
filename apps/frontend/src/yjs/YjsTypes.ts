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

