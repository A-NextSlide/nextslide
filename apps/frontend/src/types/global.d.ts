// Extend the global Window interface for custom properties

type TestComponentLayoutFn = (componentId: string, slideId: string, layout?: Partial<RemoteComponentLayout['layout']>) => string;
type MonitorWebSocketsFn = () => string | void;

// Definition for the remote component layout stored in the global registry
interface RemoteComponentLayout {
  componentId: string;
  slideId: string;
  layout: {
    position: { x: number; y: number };
    size?: { width: number; height: number };
    rotation?: number;
  };
  timestamp: number;
  lastApplied?: number;
  isInteracting?: boolean; 
}

interface SlideImageCacheEntry {
  slideId: string;
  slideIndex: number;
  slideTitle: string;
  topics?: string[];
  images?: any[];
  images_by_topic?: Record<string, any[]>;
  images_by_search_term?: Record<string, any[]>;
  search_terms?: string[];
  images_count?: number;
}

interface TopicImageCacheEntry {
  [imageUrl: string]: any[];
}

declare global {
  interface Window {
    // Component layout testing
    _testComponentLayout?: TestComponentLayoutFn;

    // WebSocket monitoring
    _monitorWebSockets?: MonitorWebSocketsFn;
    _wsMonitoringActive?: boolean;
    
    // Remote component layout tracking for real-time updates
    // __remoteComponentPositions?: Map<string, any>; // Old, keeping structure similar for now
    __remoteComponentLayouts?: Map<string, RemoteComponentLayout>; // New

    _yProviders?: any[];

    // Yjs provider registry for cursor and component position tracking
    // _yProviders?: any[]; // Already declared above
    
    // Cursor tracking functionality
    _awareness?: any;
    _updateCursorDirectly?: (slideId: string, x: number, y: number) => void;
    _shouldBroadcastCursor?: (slideId: string) => boolean;
    
    // Component position tracking (used by the drag hook)
    __isDragging?: boolean; // This might become __isInteracting or similar
    __lastSlideAnimationTimes?: Record<string, number>;
    __skipNonVisibleSlideLoading?: boolean;
    __chartAnimationsEnabled?: boolean;
    
    // Add function to register Yjs document manager for tracking
    _registerYjsDocManager?: (manager: any) => void;

    __slideImageCache?: Record<string, SlideImageCacheEntry>;
    __topicImageCache?: Record<string, any[]>;
    debugImageCache?: () => void;
    testImageLoading?: (slideId: string) => void;
    testPopulateImageCache?: (slideId: string, images: any[]) => void;
  }
}

// Export {} to ensure this file is treated as a module
export {}; 
