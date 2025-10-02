/**
 * DeltaCompression - Implements efficient update compression for Yjs documents
 * 
 * This utility:
 * 1. Reduces network traffic by compressing updates between clients
 * 2. Implements efficient batch processing of updates
 * 3. Provides a compact binary format for storage
 */

import * as Y from 'yjs';
import { encodeStateAsUpdate, applyUpdate, encodeStateVector } from 'yjs';

/**
 * Optimization options for delta compression
 */
export interface DeltaCompressionOptions {
  /**
   * Maximum size of batch before forcing a flush (in bytes)
   * Default: 1024 * 50 (50KB)
   */
  maxBatchSizeBytes?: number;
  
  /**
   * Maximum time to wait before flushing updates (in ms)
   * Default: 500ms
   */
  maxBatchDelayMs?: number;
  
  /**
   * Whether to use zlib compression for large updates
   * Default: true
   */
  useZlibCompression?: boolean;
  
  /**
   * Size threshold for zlib compression (in bytes)
   * Default: 1024 * 10 (10KB)
   */
  zlibThresholdBytes?: number;
  
  /**
   * Debug mode
   * Default: false
   */
  debug?: boolean;
}

/**
 * Information about a delta compressed update
 */
export interface DeltaUpdateInfo {
  /**
   * Original size of the update in bytes
   */
  originalSize: number;
  
  /**
   * Compressed size of the update in bytes
   */
  compressedSize: number;
  
  /**
   * Compression ratio (original / compressed)
   */
  compressionRatio: number;
  
  /**
   * Whether zlib compression was used
   */
  usedZlib: boolean;
  
  /**
   * Number of operations included in this update
   */
  operationCount: number;
}

/**
 * Implements efficient delta compression for Yjs updates
 */
export class DeltaCompression {
  private options: Required<DeltaCompressionOptions>;
  private pendingUpdates: Uint8Array[] = [];
  private pendingSize = 0;
  private flushTimer: NodeJS.Timeout | null = null;
  private lastStateVector: Uint8Array | null = null;
  private updateHandler: ((update: Uint8Array, info: DeltaUpdateInfo) => void) | null = null;
  
  /**
   * Create a new DeltaCompression instance
   */
  constructor(options: DeltaCompressionOptions = {}) {
    this.options = {
      maxBatchSizeBytes: options.maxBatchSizeBytes ?? 1024 * 50,
      maxBatchDelayMs: options.maxBatchDelayMs ?? 500,
      useZlibCompression: options.useZlibCompression ?? true,
      zlibThresholdBytes: options.zlibThresholdBytes ?? 1024 * 10,
      debug: options.debug ?? false
    };
  }
  
  /**
   * Set the handler for compressed updates
   */
  setUpdateHandler(handler: (update: Uint8Array, info: DeltaUpdateInfo) => void): void {
    this.updateHandler = handler;
  }
  
  /**
   * Initialize with the current document state
   */
  initialize(doc: Y.Doc): void {
    // Store the current state vector
    this.lastStateVector = encodeStateVector(doc);
    
    // Subscribe to document updates
    doc.on('update', (update: Uint8Array) => {
      this.queueUpdate(update);
    });
    
    this.log(`Initialized delta compression for document`);
  }
  
  /**
   * Queue an update for batched processing
   */
  private queueUpdate(update: Uint8Array): void {
    // Add to pending updates
    this.pendingUpdates.push(update);
    this.pendingSize += update.length;
    
    this.log(`Queued update of ${update.length} bytes (total pending: ${this.pendingSize} bytes)`);
    
    // If we've exceeded the batch size, flush immediately
    if (this.pendingSize >= this.options.maxBatchSizeBytes) {
      this.log(`Batch size limit reached (${this.pendingSize} bytes), flushing immediately`);
      this.flushUpdates();
      return;
    }
    
    // Otherwise, set a timer to flush after the delay
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushUpdates();
      }, this.options.maxBatchDelayMs);
    }
  }
  
  /**
   * Flush all pending updates
   */
  flushUpdates(): void {
    // Clear the timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    
    // Nothing to flush
    if (this.pendingUpdates.length === 0) {
      return;
    }
    
    const operationCount = this.pendingUpdates.length;
    this.log(`Flushing ${operationCount} updates (${this.pendingSize} bytes)`);
    
    // Create a temporary document to build the merged update
    const tempDoc = new Y.Doc();
    
    try {
      // Apply all pending updates to the temp doc with error handling
      for (const update of this.pendingUpdates) {
        try {
          if (update && update.byteLength > 0) {
            applyUpdate(tempDoc, update);
          } else {
            this.log(`Skipping empty update`, 'warn');
          }
        } catch (error) {
          this.log(`Error applying update: ${error}`, 'error');
          // Continue with other updates
        }
      }
      
      // Clear pending updates
      this.pendingUpdates = [];
      const originalSize = this.pendingSize;
      this.pendingSize = 0;
      
      // If we have a state vector, create a delta update
      let compressedUpdate: Uint8Array;
      let usedZlib = false;
      
      try {
        if (this.lastStateVector && this.lastStateVector.byteLength > 0) {
          // Create a delta update from the last state vector
          compressedUpdate = Y.encodeStateAsUpdate(tempDoc, this.lastStateVector);
        } else {
          // No state vector, create a full update
          compressedUpdate = Y.encodeStateAsUpdate(tempDoc);
        }
      } catch (error) {
        this.log(`Error encoding state: ${error}`, 'error');
        // Fallback to full update if delta encoding fails
        compressedUpdate = Y.encodeStateAsUpdate(tempDoc);
      }
      
      // Store the new state vector
      this.lastStateVector = encodeStateVector(tempDoc);
      
      // Use zlib compression for large updates if enabled
      if (this.options.useZlibCompression && compressedUpdate.length > this.options.zlibThresholdBytes) {
        try {
          const zlibCompressed = this.compressWithZlib(compressedUpdate);
          if (zlibCompressed.length < compressedUpdate.length) {
            compressedUpdate = zlibCompressed;
            usedZlib = true;
            this.log(`Zlib compression reduced size from ${compressedUpdate.length} to ${zlibCompressed.length} bytes`);
          }
        } catch (error) {
          this.log(`Zlib compression failed: ${error}`, 'error');
        }
      }
      
      // Create update info
      const updateInfo: DeltaUpdateInfo = {
        originalSize,
        compressedSize: compressedUpdate.length,
        compressionRatio: originalSize / compressedUpdate.length,
        usedZlib,
        operationCount
      };
      
      this.log(`Delta compression: ${originalSize} -> ${compressedUpdate.length} bytes (ratio: ${updateInfo.compressionRatio.toFixed(2)}x)`);
      
      // Send the compressed update to the handler
      if (this.updateHandler) {
        this.updateHandler(compressedUpdate, updateInfo);
      }
    } catch (error) {
      this.log(`Fatal error in delta compression: ${error}`, 'error');
      // Reset pending updates to avoid cascading failures
      this.pendingUpdates = [];
      this.pendingSize = 0;
    } finally {
      // Clean up
      tempDoc.destroy();
    }
  }
  
  /**
   * Apply a compressed update to a document
   */
  applyCompressedUpdate(doc: Y.Doc, compressedUpdate: Uint8Array, isZlibCompressed = false): void {
    if (!compressedUpdate || compressedUpdate.byteLength === 0) {
      this.log(`Attempted to apply empty update, skipping`, 'warn');
      return;
    }
    
    try {
      // Decompress if needed
      let update = compressedUpdate;
      if (isZlibCompressed) {
        try {
          update = this.decompressWithZlib(compressedUpdate);
        } catch (error) {
          this.log(`Zlib decompression failed: ${error}`, 'error');
          return;
        }
      }
      
      // Apply the update to the document
      applyUpdate(doc, update);
      
      // Update the state vector
      this.lastStateVector = encodeStateVector(doc);
      
      this.log(`Successfully applied update of ${update.byteLength} bytes to document`);
    } catch (error) {
      this.log(`Error applying update to document: ${error}`, 'error');
      // Don't rethrow to prevent crashes - document can recover in next sync
    }
  }
  
  /**
   * Compress data using zlib
   * 
   * Note: In a browser environment, we'd use the CompressionStream API
   * In Node.js, we'd use the zlib module
   */
  private compressWithZlib(data: Uint8Array): Uint8Array {
    // This is a stub implementation that would be replaced with actual zlib compression
    // For now, we'll just return the original data
    // In a real implementation, we'd use the appropriate API for the environment
    
    // Placeholder to represent where real zlib compression would be implemented
    if (typeof window !== 'undefined' && 'CompressionStream' in window) {
      // Browser environment with CompressionStream API
      // Implementation would use CompressionStream
      return data;
    } else if (typeof require !== 'undefined') {
      // Node.js environment
      try {
        // Using dynamic require to avoid bundling issues
        const zlib = require('zlib');
        return zlib.deflateSync(data);
      } catch (error) {
        this.log(`Zlib module not available: ${error}`, 'warn');
        return data;
      }
    }
    
    return data;
  }
  
  /**
   * Decompress data using zlib
   */
  private decompressWithZlib(data: Uint8Array): Uint8Array {
    // This is a stub implementation that would be replaced with actual zlib decompression
    // For now, we'll just return the original data
    // In a real implementation, we'd use the appropriate API for the environment
    
    // Placeholder to represent where real zlib decompression would be implemented
    if (typeof window !== 'undefined' && 'DecompressionStream' in window) {
      // Browser environment with DecompressionStream API
      // Implementation would use DecompressionStream
      return data;
    } else if (typeof require !== 'undefined') {
      // Node.js environment
      try {
        // Using dynamic require to avoid bundling issues
        const zlib = require('zlib');
        return zlib.inflateSync(data);
      } catch (error) {
        this.log(`Zlib module not available: ${error}`, 'warn');
        return data;
      }
    }
    
    return data;
  }
  
  /**
   * Log a message if debugging is enabled
   */
  private log(message: string, level: 'log' | 'warn' | 'error' = 'log'): void {
    if (this.options.debug) {
      console[level](`[DeltaCompression] ${message}`);
    }
  }
}