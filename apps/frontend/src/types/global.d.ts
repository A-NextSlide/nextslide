// Extend the global Window interface for custom debugging properties

// Define the structure for the test cursor function arguments if needed
type AddTestCursorFn = (id: string, x?: number, y?: number) => string;
type SendTestCursorFn = (slideIdToUse?: string) => string;
type TrackWebSocketFn = (ws: WebSocket) => string | void;
// type TestComponentPositionFn = (componentId: string, slideId: string) => string; // Old
type TestComponentLayoutFn = (componentId: string, slideId: string, layout?: Partial<RemoteComponentLayout['layout']>) => string; // New
// type TestComponentMoveFn = (componentId: string, slideId: string) => string; // Old, can be covered by TestComponentLayoutFn
type MonitorWebSocketsFn = () => string | void;

// Extend WebSocket to allow monitoring property
interface ExtendedWebSocket extends WebSocket {
  _monitored?: boolean;
}

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
  images_count?: number;
}

interface TopicImageCacheEntry {
  [imageUrl: string]: any[];
}

declare global {
  interface Window {
    // Debugging properties added in DirectCursors.tsx
    wsConnectionTest?: () => Promise<string | void>;
    _sendTestCursor?: SendTestCursorFn;
    _addTestCursor?: AddTestCursorFn;
    _webSocketDebugAdded?: boolean;
    _trackWebSocket?: TrackWebSocketFn;

    // Component layout testing (replaces old position testing)
    _testComponentLayout?: TestComponentLayoutFn; 
    
    // WebSocket monitoring
    _monitorWebSockets?: MonitorWebSocketsFn;
    _wsMonitoringActive?: boolean;
    
    // Remote component layout tracking for real-time updates
    // __remoteComponentPositions?: Map<string, any>; // Old, keeping structure similar for now
    __remoteComponentLayouts?: Map<string, RemoteComponentLayout>; // New

    // Debugging properties added elsewhere (ensure these are declared too)
    _directCursorInfo?: { id: string; color: string; name: string };
    _directCursorPosition?: { slideId: string; x: number; y: number; timestamp: number; zoomLevel?: number };
    _inspectDirectCursors?: () => any;
    _yProviders?: any[]; // Use a more specific type if possible

    // Yjs provider registry for cursor and component position tracking
    // _yProviders?: any[]; // Already declared above
    
    // Cursor tracking functionality
    _awareness?: any;
    // _trackWebSocket?: (ws: WebSocket) => void; // Already declared above
    _updateCursorDirectly?: (slideId: string, x: number, y: number) => void;
    _shouldBroadcastCursor?: (slideId: string) => boolean;
    // _directCursorPosition?: { // Already declared above
    //   x: number;
    //   y: number;
    //   timestamp: number;
    // };
    
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