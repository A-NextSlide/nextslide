/**
 * YJS Performance Monitor
 * Simplified implementation for performance tracking
 */

// Operation types for the sharded document system
export enum OperationType {
  DOCUMENT_LOAD = 'document_load',
  COMPONENT_UPDATE = 'component_update',
  COMPRESSION = 'compression',
  NETWORK = 'network',
}

// Options for the performance monitor
export interface PerformanceMonitorOptions {
  enableLogging?: boolean;
  trackMemory?: boolean;
  maxHistorySize?: number;
}

// Operation record
interface OperationRecord {
  id: string;
  type: OperationType;
  label: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  success?: boolean;
  metadata?: Record<string, any>;
}

// Type for operation statistics
interface OperationStats {
  avgDurationMs: number;
  totalOperations: number;
  successRate: number;
  avgCompressionRatio?: number;
}

// Memory usage record
interface MemoryUsageRecord {
  timestamp: number;
  usageBytes: number;
}

/**
 * Performance monitoring utility for document sharding operations
 */
export class PerformanceMonitor {
  private operations: Map<string, OperationRecord> = new Map();
  private completedOperations: OperationRecord[] = [];
  private memoryUsage: MemoryUsageRecord[] = [];
  private options: Required<PerformanceMonitorOptions>;

  constructor(options: PerformanceMonitorOptions = {}) {
    this.options = {
      enableLogging: options.enableLogging ?? false,
      trackMemory: options.trackMemory ?? true,
      maxHistorySize: options.maxHistorySize ?? 1000,
    };
    
    // Start memory tracking if enabled
    if (this.options.trackMemory) {
      this.trackMemoryUsage();
    }
  }

  /**
   * Start tracking a new operation
   */
  startOperation(type: OperationType, label: string): string {
    const id = `${type}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    this.operations.set(id, {
      id,
      type,
      label,
      startTime: performance.now(),
    });
    
    return id;
  }

  /**
   * End a tracked operation
   */
  endOperation(
    id: string, 
    success: boolean = true, 
    data: { errorMessage?: string; additionalMetadata?: Record<string, any> } = {}
  ): number {
    const operation = this.operations.get(id);
    if (!operation) {
      console.warn(`[PerformanceMonitor] No operation found with id: ${id}`);
      return 0;
    }
    
    const endTime = performance.now();
    const durationMs = endTime - operation.startTime;
    
    const completedOperation: OperationRecord = {
      ...operation,
      endTime,
      durationMs,
      success,
      metadata: {
        ...data.additionalMetadata,
        error: data.errorMessage,
      },
    };
    
    this.operations.delete(id);
    this.completedOperations.push(completedOperation);
    
    // Trim history if exceeded
    if (this.completedOperations.length > this.options.maxHistorySize) {
      this.completedOperations = this.completedOperations.slice(-this.options.maxHistorySize);
    }
    
    // Log if enabled
    if (this.options.enableLogging) {
      console.log(
        `[${completedOperation.type}] ${completedOperation.label} - ${durationMs.toFixed(2)}ms - ${success ? 'SUCCESS' : 'FAILED'}`
      );
    }
    
    return durationMs;
  }

  /**
   * Get statistics for operations of a specific type
   */
  getStats(type: OperationType, timeRangeMs: number = 60000): OperationStats {
    const now = performance.now();
    const relevantOperations = this.completedOperations.filter(
      op => op.type === type && op.endTime && (now - op.endTime) <= timeRangeMs
    );
    
    if (relevantOperations.length === 0) {
      return {
        avgDurationMs: 0,
        totalOperations: 0,
        successRate: 0,
        avgCompressionRatio: type === OperationType.COMPRESSION ? 1 : undefined,
      };
    }
    
    const totalOperations = relevantOperations.length;
    const successfulOperations = relevantOperations.filter(op => op.success).length;
    const totalDurationMs = relevantOperations.reduce((sum, op) => sum + (op.durationMs || 0), 0);
    
    let avgCompressionRatio;
    if (type === OperationType.COMPRESSION) {
      const ratioOperations = relevantOperations.filter(
        op => op.metadata?.compressionRatio && op.metadata.compressionRatio > 0
      );
      
      if (ratioOperations.length > 0) {
        const totalRatio = ratioOperations.reduce(
          (sum, op) => sum + (op.metadata?.compressionRatio || 1), 0
        );
        avgCompressionRatio = totalRatio / ratioOperations.length;
      } else {
        avgCompressionRatio = 1;
      }
    }
    
    return {
      avgDurationMs: totalDurationMs / totalOperations,
      totalOperations,
      successRate: totalOperations > 0 ? successfulOperations / totalOperations : 0,
      avgCompressionRatio,
    };
  }

  /**
   * Track memory usage over time
   */
  private trackMemoryUsage() {
    const checkMemory = () => {
      try {
        // Check if performance.memory is available (Chrome only)
        if ('memory' in performance) {
          const memory = (performance as any).memory;
          if (memory && memory.usedJSHeapSize) {
            this.memoryUsage.push({
              timestamp: Date.now(),
              usageBytes: memory.usedJSHeapSize,
            });
            
            // Trim memory history
            if (this.memoryUsage.length > this.options.maxHistorySize) {
              this.memoryUsage = this.memoryUsage.slice(-this.options.maxHistorySize);
            }
          }
        }
      } catch (e) {
        // Ignore errors in memory tracking
      }
    };
    
    // Check every 5 seconds
    const intervalId = setInterval(checkMemory, 5000);
    
    // Store interval ID for cleanup
    (this as any)._memoryInterval = intervalId;
    
    // Initial check
    checkMemory();
  }

  /**
   * Get memory usage records
   */
  getMemoryUsage(): MemoryUsageRecord[] {
    return [...this.memoryUsage];
  }

  /**
   * Clean up resources
   */
  destroy() {
    if ((this as any)._memoryInterval) {
      clearInterval((this as any)._memoryInterval);
    }
    this.operations.clear();
    this.completedOperations = [];
    this.memoryUsage = [];
  }
}