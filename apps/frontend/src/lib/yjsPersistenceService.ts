/**
 * YjsPersistenceService
 * 
 * Handles persistence of Yjs documents to Supabase, including:
 * - Binary encoding for efficient storage
 * - Periodic snapshot creation
 * - Recovery mechanism for failed syncs
 * - Version tracking
 */
import * as Y from 'yjs';
import { supabase } from '@/integrations/supabase/client';
import { YjsDocumentManager } from '@/yjs/YjsDocumentManager';
import { CompleteDeckData } from '@/types/DeckTypes';
import { v4 as uuidv4 } from 'uuid';
import { debounce } from 'lodash-es';

// Default options for persistence service
const DEFAULT_OPTIONS = {
  // How often to take snapshots (in milliseconds)
  snapshotInterval: 15000, // 15 seconds
  // How long to wait after changes before taking a snapshot
  snapshotDebounce: 2000, // 2 seconds
  // Max number of versions to keep per document
  maxVersionsPerDoc: 50,
  // Enable/disable automatic snapshots - DISABLED to prevent conflicts
  autoSnapshot: false,
};

// Type definitions
export interface YjsPersistenceOptions {
  snapshotInterval?: number;
  snapshotDebounce?: number;
  maxVersionsPerDoc?: number;
  autoSnapshot?: boolean;
}

export interface YjsSnapshot {
  id: string;
  deckId: string;
  version: string;
  data: Uint8Array;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface SnapshotInfo {
  id: string;
  deckId: string;
  version: string;
  timestamp: string;
  clientId?: number;
  userName?: string;
  size: number;
}

/**
 * Service for persisting Yjs documents to Supabase
 */
export class YjsPersistenceService {
  private options: Required<YjsPersistenceOptions>;
  private snapshotIntervalId: number | null = null;
  private pendingSave = false;
  private docManager: YjsDocumentManager | null = null;
  private deckId: string | null = null;
  private lastSnapshotTime: Date | null = null;
  
  // Debounced snapshot function to avoid too many saves
  private debouncedSnapshot: Function;
  
  /**
   * Create a new YjsPersistenceService
   */
  constructor(options?: YjsPersistenceOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    
    // Create debounced snapshot function
    this.debouncedSnapshot = debounce(
      this.createSnapshot.bind(this),
      this.options.snapshotDebounce
    );
  }
  
  /**
   * Initialize the persistence service with a document manager
   */
  initialize(docManager: YjsDocumentManager, deckId: string): void {
    this.docManager = docManager;
    this.deckId = deckId;
    
    // Set up event listeners for document changes
    docManager.on('document-changed', this.handleDocumentChanged.bind(this));
    
    // Start automatic snapshots if enabled
    if (this.options.autoSnapshot) {
      this.startAutomaticSnapshots();
    }
  }
  
  /**
   * Handle document changes
   */
  private handleDocumentChanged(event: any): void {
    if (!this.docManager || !this.deckId || event.isLocal === false) {
      return;
    }
    
    // Trigger debounced snapshot on local changes
    this.debouncedSnapshot();
  }
  
  /**
   * Start automatic snapshot interval
   */
  startAutomaticSnapshots(): void {
    // Clear any existing interval
    this.stopAutomaticSnapshots();
    
    // Set up a new interval
    this.snapshotIntervalId = window.setInterval(() => {
      this.createSnapshot();
    }, this.options.snapshotInterval);
    
    console.log(`[YjsPersistenceService] Started automatic snapshots every ${this.options.snapshotInterval}ms`);
  }
  
  /**
   * Stop automatic snapshot interval
   */
  stopAutomaticSnapshots(): void {
    if (this.snapshotIntervalId !== null) {
      clearInterval(this.snapshotIntervalId);
      this.snapshotIntervalId = null;
      console.log('[YjsPersistenceService] Stopped automatic snapshots');
    }
  }
  
  /**
   * Create a snapshot of the current document state
   * DISABLED: Snapshots are disabled to prevent database conflicts
   */
  async createSnapshot(): Promise<SnapshotInfo | null> {
    // Snapshots are disabled to prevent 409 conflicts
    return null;
    
    if (!this.docManager || !this.deckId || this.pendingSave) {
      return null;
    }
    
    this.pendingSave = true;
    
    try {
      // Get document structure
      const doc = this.docManager.getDocumentStructure().doc;
      
      // Create snapshot of the entire document
      const snapshot = Y.encodeStateAsUpdate(doc);
      
      // Check if we have a previous snapshot to compare with
      if (this.deckId) {
        try {
          const { data, error } = await supabase
            .from('yjs_snapshots')
            .select('data')
            .eq('deck_id', this.deckId)
            .order('timestamp', { ascending: false })
            .limit(1);
            
          if (!error && data && data.length > 0) {
            // Convert base64 data back to Uint8Array
            const base64Data = data[0].data;
            const binaryString = atob(base64Data);
            const previousSnapshot = new Uint8Array(binaryString.length);
            
            for (let i = 0; i < binaryString.length; i++) {
              previousSnapshot[i] = binaryString.charCodeAt(i);
            }
            
            // Compare snapshots - basic byte comparison
            if (snapshot.length === previousSnapshot.length) {
              let identical = true;
              for (let i = 0; i < snapshot.length; i++) {
                if (snapshot[i] !== previousSnapshot[i]) {
                  identical = false;
                  break;
                }
              }
              
              if (identical) {
                console.log('[YjsPersistenceService] Skipping snapshot creation - content unchanged');
                this.pendingSave = false;
                return null;
              }
            }
          }
        } catch (err) {
          // If comparison fails, continue with saving the snapshot
          console.warn('[YjsPersistenceService] Error comparing snapshots:', err);
        }
      }
      
      // Get version (from deck or generate new one with timestamp to ensure uniqueness)
      const deckData = this.docManager.toDeckData();
      const timestamp = Date.now();
      const version = deckData.version ? `${deckData.version}-${timestamp}` : `v${timestamp}-${uuidv4().slice(0, 8)}`;
      
      // Don't update the deck metadata version to avoid conflicts
      
      // Generate UUID for the snapshot
      const snapshotId = uuidv4();
      
      // Convert binary data to base64 for storage using a chunked approach to avoid stack overflow
      const chunkSize = 8192; // Process 8KB chunks to avoid call stack limits
      let binary = '';
      
      // Safely process the snapshot in chunks
      if (snapshot && snapshot.length) {
        for (let i = 0; i < snapshot.length; i += chunkSize) {
          const chunk = snapshot.slice(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, Array.from(chunk));
        }
      } else {
        console.warn('[YjsPersistenceService] Warning: Empty or invalid snapshot data');
      }
      
      const base64Data = btoa(binary || '');
      
      // Include metadata for tracking
      const metadata: any = {
        clientId: doc.clientID,
        transactionCount: (doc as any).store.transactionCount || 0,
        userName: 'Unknown', // We don't seem to have a getUserName method
      };
      
      // Save to Supabase
      try {
        const { data, error } = await supabase.from('yjs_snapshots').insert({
          id: snapshotId,
          deck_id: this.deckId,
          version: version,
          data: base64Data,
          timestamp: new Date().toISOString(),
          metadata: metadata,
        });
        
        if (error) {
          // Check if this is a constraint violation error (duplicate version)
          if (error.code === '23505' && error.message.includes('yjs_snapshots_deck_id_version_unique')) {
            // This is a duplicate version error, but we've already successfully saved a snapshot for this version
            // So we can consider this operation a success and suppress the error
            console.warn('[YjsPersistenceService] Snapshot already exists for this version');
            return {
              id: snapshotId,
              deckId: this.deckId,
              version: version,
              timestamp: new Date().toISOString(),
              clientId: doc.clientID,
              size: snapshot.byteLength,
            };
          } else {
            console.error('[YjsPersistenceService] Failed to save snapshot:', error);
            throw error;
          }
        }
        
        console.log(
          `[YjsPersistenceService] Created snapshot for deck ${this.deckId} (${snapshot.byteLength} bytes)`
        );
        
        // Clean up old snapshots after successful save
        this.cleanupOldSnapshots(this.deckId);
        
        // Store time for reference
        this.lastSnapshotTime = new Date();
        
        // Return info about the snapshot
        return {
          id: snapshotId,
          deckId: this.deckId,
          version: version,
          timestamp: new Date().toISOString(),
          clientId: doc.clientID,
          size: snapshot.byteLength,
        };
      } catch (error) {
        if (error.code === '23505' && error.message.includes('yjs_snapshots_deck_id_version_unique')) {
          // This is a duplicate version error, but we've already successfully saved a snapshot for this version
          // So we can consider this operation a success and suppress the error
          console.warn('[YjsPersistenceService] Snapshot already exists for this version');
          return {
            id: snapshotId,
            deckId: this.deckId,
            version: version,
            timestamp: new Date().toISOString(),
            clientId: doc.clientID,
            size: snapshot.byteLength,
          };
        } else {
          console.error('[YjsPersistenceService] Failed to save snapshot:', error);
          return null;
        }
      }
    } catch (error) {
      console.error('[YjsPersistenceService] Failed to create snapshot:', error);
      return null;
    } finally {
      this.pendingSave = false;
    }
  }
  
  /**
   * Load a document from a snapshot
   */
  async loadSnapshot(
    deckId: string,
    version?: string
  ): Promise<{ snapshot: Uint8Array; deckData: CompleteDeckData } | null> {
    try {
      // Construct query to get the latest snapshot or a specific version
      let query = supabase
        .from('yjs_snapshots')
        .select('*')
        .eq('deck_id', deckId);
      
      if (version) {
        query = query.eq('version', version);
      } else {
        query = query.order('timestamp', { ascending: false }).limit(1);
      }
      
      // Execute the query
      const { data, error } = await query;
      
      if (error) {
        console.error('[YjsPersistenceService] Error loading snapshot:', error);
        throw error;
      }
      
      if (!data || data.length === 0) {
        console.warn(`[YjsPersistenceService] No snapshots found for deck ${deckId}`);
        return null;
      }
      
      const snapshotRecord = data[0];
      
      // Convert base64 data back to Uint8Array
      const base64Data = snapshotRecord.data;
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      console.log(
        `[YjsPersistenceService] Loaded snapshot for deck ${deckId} (${bytes.byteLength} bytes)`
      );
      
      // Create a temporary document to extract deck data
      const tempDoc = new Y.Doc();
      Y.applyUpdate(tempDoc, bytes);
      
      // Create a temporary document manager to extract deck data
      const tempManager = new YjsDocumentManager({
        docId: 'temp',
        autoConnect: false,
        persistenceEnabled: false,
      });
      
      // Hack: directly set the doc and related structures
      (tempManager as any).doc = tempDoc;
      (tempManager as any).deckMap = tempDoc.getMap('deck');
      (tempManager as any).slidesArray = tempDoc.getArray('slides');
      
      // Get the deck data from the temp manager
      const deckData = tempManager.toDeckData();
      
      // Clean up temporary resources
      tempDoc.destroy();
      tempManager.destroy();
      
      return {
        snapshot: bytes,
        deckData,
      };
    } catch (error) {
      console.error('[YjsPersistenceService] Failed to load snapshot:', error);
      return null;
    }
  }
  
  /**
   * Get a list of available snapshots for a deck
   */
  async getSnapshotList(deckId: string): Promise<SnapshotInfo[]> {
    try {
      const { data, error } = await supabase
        .from('yjs_snapshots')
        .select('*')
        .eq('deck_id', deckId)
        .order('timestamp', { ascending: false });
      
      if (error) {
        console.error('[YjsPersistenceService] Error listing snapshots:', error);
        throw error;
      }
      
      return (data || []).map((snapshot) => ({
        id: snapshot.id,
        deckId: snapshot.deck_id,
        version: snapshot.version,
        timestamp: snapshot.timestamp,
        clientId: (snapshot.metadata as Record<string, any>)?.clientId,
        userName: (snapshot.metadata as Record<string, any>)?.userName,
        size: snapshot.data.length / 1.37, // Approximate size from base64
      }));
    } catch (error) {
      console.error('[YjsPersistenceService] Failed to list snapshots:', error);
      return [];
    }
  }
  
  /**
   * Apply a snapshot to the current document
   */
  async applySnapshot(snapshotId: string): Promise<boolean> {
    if (!this.docManager) {
      console.error('[YjsPersistenceService] No document manager available');
      return false;
    }
    
    try {
      // Load the snapshot
      const { data, error } = await supabase
        .from('yjs_snapshots')
        .select('*')
        .eq('id', snapshotId)
        .single();
      
      if (error || !data) {
        console.error('[YjsPersistenceService] Error loading snapshot:', error);
        return false;
      }
      
      // Convert base64 data to Uint8Array
      const base64Data = data.data;
      const binaryString = atob(base64Data);
      const snapshot = new Uint8Array(binaryString.length);
      
      for (let i = 0; i < binaryString.length; i++) {
        snapshot[i] = binaryString.charCodeAt(i);
      }
      
      // Create a transaction to apply the snapshot atomically
      this.docManager.getDocumentStructure().doc.transact(() => {
        // Apply the snapshot to the document
        const doc = this.docManager.getDocumentStructure().doc;
        Y.applyUpdate(doc, snapshot);
      });
      
      console.log(
        `[YjsPersistenceService] Applied snapshot ${snapshotId} (${snapshot.byteLength} bytes)`
      );
      
      // Emit an event to notify the application that the document has been restored
      this.docManager.getDocumentStructure().doc.emit('snapshot-applied' as any, {
        snapshotId,
        timestamp: data.timestamp,
        metadata: data.metadata
      } as any);
      
      return true;
    } catch (error) {
      console.error('[YjsPersistenceService] Failed to apply snapshot:', error);
      return false;
    }
  }
  
  /**
   * Delete a specific snapshot
   */
  async deleteSnapshot(snapshotId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('yjs_snapshots')
        .delete()
        .eq('id', snapshotId);
      
      if (error) {
        console.error('[YjsPersistenceService] Error deleting snapshot:', error);
        return false;
      }
      
      console.log(`[YjsPersistenceService] Deleted snapshot ${snapshotId}`);
      return true;
    } catch (error) {
      console.error('[YjsPersistenceService] Failed to delete snapshot:', error);
      return false;
    }
  }
  
  /**
   * Clean up old snapshots, keeping only the most recent ones
   */
  private async cleanupOldSnapshots(deckId: string): Promise<void> {
    try {
      // Get total count of snapshots for this deck
      const { count, error: countError } = await supabase
        .from('yjs_snapshots')
        .select('id', { count: 'exact', head: true })
        .eq('deck_id', deckId);
      
      if (countError) {
        console.error('[YjsPersistenceService] Error counting snapshots:', countError);
        return;
      }
      
      // If we have more snapshots than our limit, delete the oldest ones
      if (count && count > this.options.maxVersionsPerDoc) {
        const toDelete = count - this.options.maxVersionsPerDoc;
        
        const { data: oldSnapshots, error: fetchError } = await supabase
          .from('yjs_snapshots')
          .select('id')
          .eq('deck_id', deckId)
          .order('timestamp', { ascending: true })
          .limit(toDelete);
        
        if (fetchError) {
          console.error('[YjsPersistenceService] Error fetching old snapshots:', fetchError);
          return;
        }
        
        // Delete old snapshots if we found any
        if (oldSnapshots && oldSnapshots.length > 0) {
          const idsToDelete = oldSnapshots.map(snapshot => snapshot.id);
          
          const { error: deleteError } = await supabase
            .from('yjs_snapshots')
            .delete()
            .in('id', idsToDelete);
          
          if (deleteError) {
            console.error('[YjsPersistenceService] Error deleting old snapshots:', deleteError);
            return;
          }
          
          console.log(`[YjsPersistenceService] Cleaned up ${idsToDelete.length} old snapshots for deck ${deckId}`);
        }
      }
    } catch (error) {
      console.error('[YjsPersistenceService] Failed to cleanup snapshots:', error);
    }
  }
  
  /**
   * Create a recovery point (forced snapshot) that can be restored later
   */
  async createRecoveryPoint(name?: string): Promise<SnapshotInfo | null> {
    if (!this.docManager || !this.deckId) {
      return null;
    }
    
    try {
      // Get the document to be saved
      const doc = this.docManager.getDocumentStructure().doc;
      const deckData = this.docManager.toDeckData();
      
      // Create binary snapshot
      const snapshot = Y.encodeStateAsUpdate(doc);
      
      // Generate a unique recovery point ID
      const recoveryPointId = uuidv4();
      
      // Prepare metadata
      const metadata = {
        clientId: doc.clientID,
        slidesCount: deckData.slides.length,
        name: deckData.name,
        recoveryName: name || `Recovery Point ${new Date().toLocaleString()}`,
        isRecoveryPoint: true,
        lastModified: new Date().toISOString(),
      };
      
      // Convert binary data to base64 using a chunked approach to avoid stack overflow
      const chunkSize = 8192; // Process 8KB chunks to avoid call stack limits
      let binary = '';
      
      // Safely process the snapshot in chunks
      if (snapshot && snapshot.length) {
        for (let i = 0; i < snapshot.length; i += chunkSize) {
          const chunk = snapshot.slice(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, Array.from(chunk));
        }
      } else {
        console.warn('[YjsPersistenceService] Warning: Empty or invalid snapshot data');
      }
      
      const base64Data = btoa(binary || '');
      
      // Save to Supabase
      try {
        const { data, error } = await supabase.from('yjs_snapshots').insert({
          id: recoveryPointId,
          deck_id: this.deckId,
          version: deckData.version || uuidv4(),
          data: base64Data,
          timestamp: new Date().toISOString(),
          metadata: metadata,
        });
        
        if (error) {
          // Check if this is a constraint violation error (duplicate version)
          if (error.code === '23505' && error.message.includes('yjs_snapshots_deck_id_version_unique')) {
            // This is a duplicate version error, but we've already successfully saved a snapshot for this version
            // So we can consider this operation a success and suppress the error
            console.warn('[YjsPersistenceService] Recovery point already exists for this version');
            return {
              id: recoveryPointId,
              deckId: this.deckId,
              version: deckData.version || '',
              timestamp: new Date().toISOString(),
              clientId: doc.clientID,
              size: snapshot.byteLength,
            };
          } else {
            console.error('[YjsPersistenceService] Error saving recovery point:', error);
            throw error;
          }
        }
        
        console.log(
          `[YjsPersistenceService] Created recovery point for deck ${this.deckId} (${
            snapshot.byteLength
          } bytes)`
        );
        
        return {
          id: recoveryPointId,
          deckId: this.deckId,
          version: deckData.version || '',
          timestamp: new Date().toISOString(),
          clientId: doc.clientID,
          size: snapshot.byteLength,
        };
      } catch (error) {
        if (error.code === '23505' && error.message.includes('yjs_snapshots_deck_id_version_unique')) {
          // This is a duplicate version error, but we've already successfully saved a snapshot for this version
          // So we can consider this operation a success and suppress the error
          console.warn('[YjsPersistenceService] Recovery point already exists for this version');
          return {
            id: recoveryPointId,
            deckId: this.deckId,
            version: deckData.version || '',
            timestamp: new Date().toISOString(),
            clientId: doc.clientID,
            size: snapshot.byteLength,
          };
        } else {
          console.error('[YjsPersistenceService] Failed to create recovery point:', error);
          return null;
        }
      }
    } catch (error) {
      console.error('[YjsPersistenceService] Failed to create recovery point:', error);
      return null;
    }
  }
  
  /**
   * Get the last snapshot time
   */
  getLastSnapshotTime(): Date | null {
    return this.lastSnapshotTime;
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopAutomaticSnapshots();
    this.docManager = null;
    this.deckId = null;
  }
}

// Export a singleton instance for the application to use
export const yjsPersistenceService = new YjsPersistenceService();