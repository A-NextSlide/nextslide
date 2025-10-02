/**
 * useDocumentSharding - Hook for accessing document sharding functionality
 * 
 * This hook provides:
 * - Performance statistics for sharded documents
 * - Document loading/unloading control
 * - Connection management utilities
 */

import { useCallback, useEffect, useState } from 'react';
import { useShardedYjs } from '../ShardedYjsProvider';
import { PerformanceMonitor, OperationType } from '../PerformanceMonitor';

export interface ShardingStats {
  /**
   * Performance metrics
   */
  performance: {
    /**
     * Average document load time in milliseconds
     */
    avgLoadTimeMs: number;
    
    /**
     * Average component update time in milliseconds
     */
    avgUpdateTimeMs: number;
    
    /**
     * Network compression ratio
     */
    compressionRatio: number;
  };
  
  /**
   * Connection statistics
   */
  connections: {
    /**
     * Number of active connections
     */
    active: number;
    
    /**
     * Total number of connections in the pool
     */
    total: number;
    
    /**
     * Number of clients waiting for connections
     */
    queued: number;
  };
  
  /**
   * Memory usage in bytes (if available)
   */
  memoryUsage: number | null;
}

/**
 * Options for the useDocumentSharding hook
 */
export interface UseDocumentShardingOptions {
  /**
   * Whether to track performance metrics
   * Default: true
   */
  trackPerformance?: boolean;
  
  /**
   * Interval in milliseconds for stats updates
   * Default: 5000 (5 seconds)
   */
  statsUpdateIntervalMs?: number;
  
  /**
   * Whether to track memory usage
   * Default: true
   */
  trackMemory?: boolean;
}

/**
 * Hook for working with document sharding
 */
export function useDocumentSharding(options: UseDocumentShardingOptions = {}) {
  // Default options
  const {
    trackPerformance = true,
    statsUpdateIntervalMs = 5000,
    trackMemory = true
  } = options;
  
  // Context from ShardedYjsProvider
  const { 
    setVisibleSlides,
    isConnected,
    connectionStats
  } = useShardedYjs();
  
  // Performance monitor for metrics
  const [performanceMonitor] = useState(() => new PerformanceMonitor({
    enableLogging: false,
    trackMemory,
    maxHistorySize: 100
  }));
  
  // Sharding stats
  const [stats, setStats] = useState<ShardingStats>({
    performance: {
      avgLoadTimeMs: 0,
      avgUpdateTimeMs: 0,
      compressionRatio: 1.0
    },
    connections: {
      active: connectionStats.activeConnections,
      total: connectionStats.totalConnections,
      queued: connectionStats.queuedConnections
    },
    memoryUsage: null
  });
  
  // Function to manually preload slides
  const preloadSlides = useCallback(async (slideIds: string[]) => {
    if (!isConnected) return;
    
    // Track performance
    if (trackPerformance) {
      const opId = performanceMonitor.startOperation(
        OperationType.DOCUMENT_LOAD,
        slideIds.join(',')
      );
      
      try {
        await setVisibleSlides(slideIds);
        performanceMonitor.endOperation(opId, true, {
          additionalMetadata: { slideCount: slideIds.length }
        });
      } catch (error) {
        performanceMonitor.endOperation(opId, false, {
          errorMessage: error.message
        });
        throw error;
      }
    } else {
      await setVisibleSlides(slideIds);
    }
  }, [setVisibleSlides, isConnected, trackPerformance, performanceMonitor]);
  
  // Update stats periodically
  useEffect(() => {
    if (!trackPerformance) return;
    
    const updateStats = () => {
      const loadStats = performanceMonitor.getStats(OperationType.DOCUMENT_LOAD, 60000);
      const updateStats = performanceMonitor.getStats(OperationType.COMPONENT_UPDATE, 60000);
      const compressionStats = performanceMonitor.getStats(OperationType.COMPRESSION, 60000);
      
      // Get memory usage if available
      const memoryUsage = trackMemory
        ? performanceMonitor.getMemoryUsage()[0]?.usageBytes ?? null
        : null;
      
      setStats({
        performance: {
          avgLoadTimeMs: loadStats.avgDurationMs || 0,
          avgUpdateTimeMs: updateStats.avgDurationMs || 0,
          compressionRatio: compressionStats.avgCompressionRatio || 1.0
        },
        connections: {
          active: connectionStats.activeConnections,
          total: connectionStats.totalConnections,
          queued: connectionStats.queuedConnections
        },
        memoryUsage
      });
    };
    
    // Initial update
    updateStats();
    
    // Schedule periodic updates
    const interval = setInterval(updateStats, statsUpdateIntervalMs);
    
    return () => {
      clearInterval(interval);
    };
  }, [
    trackPerformance,
    trackMemory,
    statsUpdateIntervalMs,
    performanceMonitor,
    connectionStats
  ]);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      performanceMonitor.destroy();
    };
  }, [performanceMonitor]);
  
  return {
    // Stats
    stats,
    
    // Actions
    preloadSlides,
    
    // Raw access to performance monitor
    performanceMonitor
  };
}