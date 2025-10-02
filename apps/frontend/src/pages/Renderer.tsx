// import '@/utils/consoleSuppressor'; // TEMPORARILY DISABLED FOR DEBUGGING
import React, { useEffect, useState, useRef } from 'react';
import { CompleteDeckData } from '@/types/DeckTypes';
import Slide from '@/components/Slide';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { toast } from 'sonner';
import { ActiveSlideProvider } from '@/context/ActiveSlideContext';
import { EditorStateProvider } from '@/context/EditorStateContext';
import { NavigationProvider } from '@/context/NavigationContext';
import { RendererWebSocket, RenderResponse } from '@/utils/rendererWebSocket';
import { captureSlide } from '@/utils/slideCapture';
import { RegistryProvider } from '@/context/RegistryContext';
import { ComponentStateProvider } from '@/context/CustomComponentStateContext';
import { ThemeProvider } from '@/context/ThemeContext';
import FontPreloader from '@/components/FontPreloader';
import { Toaster } from '@/components/ui/sonner';
import { useDeckStore } from '@/stores/deckStore';
import { DeckStoreInitializer } from '@/components/DeckStoreInitializer';

// Initialize TypeBox registry
import '@/registry';

// Import necessary styles
import '@/index.css';
import '@/styles/theme.css';
import '@/components/ColorPickerStyles.css';
import '@/fonts.css';

// Configure logging and error handling
import { configureLogging, LogLevel } from '@/utils/logging';
import { setupGlobalErrorHandlers } from '@/utils/errorHandler';

// TEMPORARILY ENABLE LOGGING FOR DEBUGGING
configureLogging({
  globalLevel: LogLevel.DEBUG, // Changed from NONE to DEBUG
  useColors: true
});

// Set up global error handlers
setupGlobalErrorHandlers();

// Force console output for critical renderer messages
const globalRendererLog = (...args: any[]) => {
  // Force output even with logging suppressed
  const originalLog = (window.console as any).log;
  if (originalLog) {
    originalLog.call(window.console, '[RENDERER]', ...args);
  }
};

// Add global error handler for uncaught errors
window.addEventListener('error', (event) => {
  globalRendererLog('Uncaught error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  globalRendererLog('Unhandled promise rejection:', event.reason);
});

// Import font loading utilities
import { FontLoadingService } from '@/services/FontLoadingService';
import { extractFontFamiliesFromDeck } from '@/utils/fontLoaderUtils';

// Import the debug capture utility
import { captureSlideWithDebugInfo, DebugCaptureOptions } from '@/utils/debugSlideCapture';

/**
 * Renderer Component
 * 
 * This component serves as a standalone slide renderer that can:
 * 1. Receive deck data via WebSocket
 * 2. Render slides using the existing component system
 * 3. Capture screenshots of rendered slides
 * 4. Return both HTML and screenshots to the API server
 * 
 * This is an automated service component with minimal UI.
 */

// Custom deck store initializer for renderer
const RendererDeckInitializer: React.FC<{ deckData: CompleteDeckData | null }> = ({ deckData }) => {
  const updateDeckData = useDeckStore(state => state.updateDeckData);
  const resetStore = useDeckStore(state => state.resetStore);
  const initialize = useDeckStore(state => state.initialize);
  
  // Initialize store on mount
  useEffect(() => {
    // Initialize the store for renderer mode (no sync needed)
    initialize({ 
      deckId: null,
      isNewDeck: false,
      syncEnabled: false // Disable sync for renderer
    });
    
    return () => {
      // Clean up on unmount
      resetStore();
    };
  }, [initialize, resetStore]);
  
  // Update deck data when it changes
  useEffect(() => {
    if (deckData) {
      // Update the deck store with the received data
      updateDeckData(deckData);
    }
  }, [deckData, updateDeckData]);
  
  return null;
};

const RendererContent: React.FC = () => {
  // Force console output for critical renderer messages
  const rendererLog = (...args: any[]) => {
    // Force output even with logging suppressed
    (console as any)._log = console.log;
    (console as any)._log('[RENDERER]', ...args);
  };

  // Core state
  const [localDeckData, setLocalDeckData] = useState<CompleteDeckData | null>(null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const [renderStatus, setRenderStatus] = useState<'idle' | 'rendering' | 'ready'>('idle');
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false); // Add debug mode state
  
  // Refs
  const slideContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<RendererWebSocket | null>(null);
  
  // Queue for pending render requests
  const [pendingRequests, setPendingRequests] = useState<Array<{
    type: string;
    requestId: string;
    slideIndexes?: number[];
    debug?: boolean;
  }>>([]);

  // Get deck store methods
  const updateDeckData = useDeckStore(state => state.updateDeckData);
  const deckDataFromStore = useDeckStore(state => state.deckData);

  // Capture the current slide and return the result
  const captureCurrentSlide = async (requestId: string, slideIndex?: number, options?: { debug?: boolean }): Promise<RenderResponse | null> => {
    // Use passed slideIndex or fall back to currentSlideIndex
    const indexToCapture = slideIndex !== undefined ? slideIndex : currentSlideIndex;
    
    if (!localDeckData || !slideContainerRef.current || !localDeckData.slides[indexToCapture]) {
      rendererLog('Cannot capture: missing data', {
        hasLocalDeckData: !!localDeckData,
        hasSlideContainer: !!slideContainerRef.current,
        slideExists: !!(localDeckData?.slides?.[indexToCapture]),
        slideIndex: indexToCapture
      });
      return null;
    }

    try {
      setRenderStatus('rendering');
      const slide = localDeckData.slides[indexToCapture];
      const slideElement = slideContainerRef.current;
      
      rendererLog(`Starting capture for slide ${indexToCapture + 1} (${slide.id}) - debug mode: ${options?.debug || false}`);
      
      // Wait for fonts to load if not already loaded
      if (!fontsLoaded) {
        let waitTime = 0;
        while (!fontsLoaded && waitTime < 100) { // Reduced from 2000ms
          await new Promise(resolve => setTimeout(resolve, 10)); // Reduced from 50ms
          waitTime += 10;
        }
      }
      
      // Ensure the slide container has the correct slide ID
      const containerSlideId = slideElement.getAttribute('data-slide-id');
      if (containerSlideId !== slide.id) {
        rendererLog(`Slide ID mismatch: expected ${slide.id}, got ${containerSlideId}`);
        const isReady = await waitForSlideReady(slide.id, 500); // Reduced from 2000ms
        if (!isReady) {
          rendererLog(`Slide ${slide.id} did not become ready in time`);
          return null;
        }
      }
      
      // Wait a short time for rendering to complete
      await new Promise(resolve => setTimeout(resolve, 50)); // Reduced from 500ms
      
      // Check for empty TiptapTextBlock components
      const tiptapElements = slideElement.querySelectorAll('[data-component-type="TiptapTextBlock"]');
      if (tiptapElements.length > 0) {
        const emptyTiptaps = Array.from(tiptapElements).filter(el => {
          const textContent = el.textContent?.trim() || '';
          return textContent === '' || textContent === 'Text content';
        });
        
        if (emptyTiptaps.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 20)); // Reduced from 200ms
        }
      }
      
      rendererLog(`Calling captureSlide for slide ${indexToCapture + 1}`);
      
      let renderResponse: RenderResponse | null = null;
      
      // Use debug capture if requested
      if (options?.debug) {
        const debugResult = await captureSlideWithDebugInfo(
          slideElement,
          slide.id,
          indexToCapture,
          localDeckData.slides.length,
          { showOverlay: true, showLegend: false }
        );
        
        if (debugResult) {
          // Convert debug result to standard RenderResponse format
          renderResponse = {
            slideId: debugResult.slideId,
            html: debugResult.html,
            screenshot: debugResult.screenshot,
            // Include debug info in the response
            metadata: {
              debug: true,
              debugInfo: debugResult.debugInfo
            }
          } as any; // Type assertion for now, should update RenderResponse type
        }
      } else {
        // Standard capture
        renderResponse = await captureSlide(
          slideElement, 
          slide.id, 
          indexToCapture, 
          localDeckData.slides.length
        );
      }
      
      if (renderResponse && wsRef.current) {
        wsRef.current.sendSlideRendered(
          requestId, 
          indexToCapture, 
          slide.id, 
          renderResponse
        );
      } else if (!renderResponse) {
        rendererLog(`captureSlide returned null for slide ${indexToCapture + 1}`);
      }
      
      return renderResponse;
    } catch (error) {
      rendererLog('Error in captureCurrentSlide:', error);
      if (wsRef.current) {
        wsRef.current.sendRenderError(
          requestId, 
          indexToCapture, 
          error instanceof Error ? error.message : String(error)
        );
      }
      return null;
    }
  };

  // Render a single slide
  const renderSlide = async (slideIndex: number, requestId: string, options?: { debug?: boolean }): Promise<void> => {
    if (!localDeckData || slideIndex >= localDeckData.slides.length) {
      if (wsRef.current) {
        wsRef.current.sendRenderError(requestId, slideIndex, 'Invalid slide index or missing deck data');
      }
      return;
    }
    
    setActiveRequestId(requestId);
    setCurrentSlideIndex(slideIndex);
    setDebugMode(options?.debug || false); // Set debug mode
    
    // Ensure deck store has the latest data
    const currentDeckData = useDeckStore.getState().deckData;
    if (currentDeckData?.slides?.[slideIndex]) {
      useDeckStore.getState().updateDeckData(currentDeckData);
    }
    
    // Wait a short time for React to update
    await new Promise(resolve => setTimeout(resolve, 10)); // Reduced from 100ms
    
    const result = await captureCurrentSlide(requestId, slideIndex, options);
    
    if (result && wsRef.current) {
      wsRef.current.sendDeckRendered(requestId, [result]);
    }
    
    // No need to wait before resetting for single slide
    setActiveRequestId(null);
    
    if (!activeRequestId || activeRequestId === requestId) {
      setLocalDeckData(null);
      setRenderStatus('idle');
      setFontsLoaded(false);
      setDebugMode(false); // Reset debug mode
    }
  };

  // Helper function to wait for slide to be ready
  const waitForSlideReady = async (slideId: string, maxWaitTime: number = 2000): Promise<boolean> => {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const container = slideContainerRef.current;
      if (container) {
        const containerSlideId = container.getAttribute('data-slide-id');
        const hasContent = container.children.length > 0;
        
        if (containerSlideId === slideId && hasContent) {
          return true;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    return false;
  };

  // Render multiple slides
  const renderMultipleSlides = async (slideIndexes: number[], requestId: string): Promise<void> => {
    if (!localDeckData) {
      setPendingRequests(prev => [...prev, {
        type: 'render-multiple-slides',
        requestId,
        slideIndexes
      }]);
      return;
    }
    
    if (!slideIndexes.length) return;

    rendererLog(`Starting to render ${slideIndexes.length} slides`);
    const startTime = Date.now();
    const results: RenderResponse[] = [];

    try {
      for (const slideIndex of slideIndexes) {
        if (slideIndex >= 0 && slideIndex < localDeckData.slides.length) {
          rendererLog(`Rendering slide ${slideIndex + 1}/${slideIndexes.length}`);
          setCurrentSlideIndex(slideIndex);
          
          // Force update the deck store to ensure components get the right slide
          const currentDeckData = useDeckStore.getState().deckData;
          if (currentDeckData) {
            useDeckStore.getState().updateDeckData(currentDeckData);
          }
          
          // Wait minimal time for React updates
          await new Promise(resolve => setTimeout(resolve, 20)); // Reduced from 300ms
          
          const result = await captureCurrentSlide(requestId, slideIndex);
          if (result) {
            results.push(result);
            rendererLog(`Successfully captured slide ${slideIndex + 1}`);
          } else {
            rendererLog(`Failed to capture slide ${slideIndex + 1}`);
          }
        }
      }

      const totalTime = Date.now() - startTime;
      rendererLog(`Finished rendering ${results.length} slides in ${totalTime}ms (${Math.round(totalTime/results.length)}ms per slide)`);

      if (wsRef.current) {
        wsRef.current.sendDeckRendered(requestId, results);
      }

      toast.success(`Rendered ${results.length} slides successfully`);
    } finally {
      setCurrentSlideIndex(0);
      setLocalDeckData(null);
      setRenderStatus('idle');
      setFontsLoaded(false);
    }
  };

  // Render all slides
  const renderAllSlides = async (requestId: string): Promise<void> => {
    if (!localDeckData?.slides.length) {
      toast.error('No deck data available to render');
      return;
    }

    const slideIndexes = Array.from({ length: localDeckData.slides.length }, (_, i) => i);
    await renderMultipleSlides(slideIndexes, requestId);
  };

  // Process pending requests when deck data is available
  useEffect(() => {
    if (localDeckData && pendingRequests.length > 0) {
      setTimeout(() => {
        const requestsToProcess = [...pendingRequests];
        setPendingRequests([]);
        
        requestsToProcess.forEach(request => {
          if (request.type === 'render-slide' && typeof request.slideIndexes?.[0] === 'number') {
            renderSlide(request.slideIndexes[0], request.requestId, { debug: request.debug });
          } else if (request.type === 'render-all-slides') {
            renderAllSlides(request.requestId);
          } else if (request.type === 'render-multiple-slides' && request.slideIndexes) {
            renderMultipleSlides(request.slideIndexes, request.requestId);
          }
        });
      }, 100);
    }
  }, [localDeckData, pendingRequests]);

  // Setup WebSocket connection
  useEffect(() => {
    const handlers = {
      onDeckReceived: (receivedDeckData: CompleteDeckData, requestId: string) => {
        try {
          rendererLog(`Received deck with ${receivedDeckData.slides.length} slides`);
          setCurrentSlideIndex(0);
          setLocalDeckData(receivedDeckData);
          setRenderStatus('ready');
          
          // Update the deck store immediately
          useDeckStore.getState().updateDeckData(receivedDeckData);
          
          // Preload fonts
          if (receivedDeckData?.slides?.length > 0) {
            const fontFamilies = extractFontFamiliesFromDeck(receivedDeckData);
            if (fontFamilies.length > 0) {
              FontLoadingService.loadFonts(fontFamilies)
                .then(() => setFontsLoaded(true))
                .catch(() => setFontsLoaded(true)); // Continue even on error
            } else {
              setFontsLoaded(true);
            }
          } else {
            setFontsLoaded(true);
          }
        } catch (error) {
          rendererLog('Error in onDeckReceived:', error);
        }
      },
      
      onRenderSlide: (slideIndex: number, requestId: string, options?: { debug?: boolean }) => {
        try {
          rendererLog(`Received render-slide request for slide ${slideIndex} - debug: ${options?.debug || false}`);
          if (!localDeckData) {
            setPendingRequests(prev => [...prev, { 
              type: 'render-slide', 
              requestId, 
              slideIndexes: [slideIndex],
              debug: options?.debug 
            } as any]);
            return;
          }
          
          renderSlide(slideIndex, requestId, options);
        } catch (error) {
          rendererLog('Error in onRenderSlide:', error);
        }
      },
      
      onRenderAllSlides: (requestId: string) => {
        try {
          rendererLog(`Received render-all-slides request`);
          if (!localDeckData) {
            setPendingRequests(prev => [...prev, { 
              type: 'render-all-slides', 
              requestId 
            }]);
            return;
          }
          
          renderAllSlides(requestId);
        } catch (error) {
          rendererLog('Error in onRenderAllSlides:', error);
        }
      },
      
      onRenderMultipleSlides: (slideIndexes: number[], requestId: string) => {
        try {
          rendererLog(`Received render-multiple-slides request for ${slideIndexes.length} slides`);
          if (!localDeckData) {
            setPendingRequests(prev => [...prev, { 
              type: 'render-multiple-slides', 
              requestId, 
              slideIndexes 
            }]);
            return;
          }
          
          renderMultipleSlides(slideIndexes, requestId);
        } catch (error) {
          rendererLog('Error in onRenderMultipleSlides:', error);
        }
      },
      
      onRenderCanceled: (requestId: string) => {
        toast.error(`Render request canceled by server`);
        
        setCurrentSlideIndex(0);
        setLocalDeckData(null);
        setRenderStatus('idle');
        setFontsLoaded(false);
        
        setPendingRequests(prev => prev.filter(req => req.requestId !== requestId));
        
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
    };
    
    const ws = new RendererWebSocket(handlers);
    wsRef.current = ws;
    ws.connect();
    
    // Expose for testing/debugging
    if (typeof window !== 'undefined') {
      (window as any).rendererWsHandlers = handlers;
      (window as any).rendererWsRef = wsRef;
    }
    
    const connectionCheckInterval = setInterval(() => {
      setWsConnected(ws.isConnected());
    }, 1000);
    
    return () => {
      clearInterval(connectionCheckInterval);
      if (wsRef.current) {
        wsRef.current.disconnect();
      }
    };
  }, []);

  const handleSlideChange = (index: number) => {
    setCurrentSlideIndex(index);
  };

  // Calculate slide dimensions - use fixed size like the old version
  const slideWidth = 800;
  const slideHeight = slideWidth * (DEFAULT_SLIDE_HEIGHT / DEFAULT_SLIDE_WIDTH);

  return (
    <div className="renderer-container flex flex-col min-h-screen">
      <Toaster />
      <RendererDeckInitializer deckData={localDeckData} />
      <div className="header bg-slate-100 p-4 border-b flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">Slide Renderer Service</h1>
          <span className={`px-2 py-1 text-xs rounded-full ${wsConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {wsConnected ? 'Connected' : 'Disconnected'}
          </span>
          <span className={`px-2 py-1 text-xs rounded-full ${
            renderStatus === 'rendering' ? 'bg-yellow-100 text-yellow-800' : 
            renderStatus === 'ready' ? 'bg-green-100 text-green-800' : 
            'bg-slate-100 text-slate-800'
          }`}>
            {renderStatus === 'rendering' ? 'Rendering...' : 
             renderStatus === 'ready' ? 'Ready' : 'Idle'}
          </span>
        </div>
      </div>

      <div className="content flex-1 p-8 flex justify-center items-center bg-slate-50">
        <div className="flex justify-center items-center w-full h-full relative">
          <div id="snap-guide-portal" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
          
          <div 
            ref={slideContainerRef}
            id="slide-display-container"
            className="slide-container relative rounded-sm overflow-hidden flex-shrink-0 border border-border"
            data-slide-id={localDeckData?.slides?.[currentSlideIndex]?.id || 'unknown'}
            data-slide-width={DEFAULT_SLIDE_WIDTH}
            data-slide-height={DEFAULT_SLIDE_HEIGHT}
            style={{
              width: `${slideWidth}px`,
              height: `${slideHeight}px`,
              aspectRatio: `${DEFAULT_SLIDE_WIDTH} / ${DEFAULT_SLIDE_HEIGHT}`,
              position: 'relative',
              margin: '0 auto',
              zIndex: 10,
              backgroundColor: 'white',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
            }}
          >
            <div className="absolute inset-0 w-full h-full overflow-hidden">
              {localDeckData?.slides?.length > 0 && 
               currentSlideIndex < localDeckData.slides.length && 
               fontsLoaded ? (
                <NavigationProvider initialSlideIndex={currentSlideIndex} onSlideChange={handleSlideChange}>
                  <EditorStateProvider initialEditingState={false}>
                    <ActiveSlideProvider>
                      <Slide
                        key={`${localDeckData.slides[currentSlideIndex].id}-${currentSlideIndex}`}
                        slide={localDeckData.slides[currentSlideIndex]}
                        isActive={true}
                        direction={null}
                        isEditing={false}
                        isThumbnail={false}
                        showDebugOverlay={debugMode}
                        showDebugLegend={false}
                      />
                    </ActiveSlideProvider>
                  </EditorStateProvider>
                </NavigationProvider>
              ) : (
                <div className="flex justify-center items-center h-full">
                  <p className="text-slate-400">
                    {!localDeckData?.slides?.length
                      ? "Waiting for deck data..."
                      : !fontsLoaded
                      ? "Loading fonts..."
                      : "Preparing slide..."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="status-bar bg-slate-100 p-2 border-t text-sm text-slate-500">
        {localDeckData?.slides?.length > 0 ? (
          <div className="flex justify-between">
            <span>Deck: {localDeckData.name}</span>
            <span>Slide {currentSlideIndex + 1} of {localDeckData.slides.length}</span>
            <span>{renderStatus === 'rendering' ? 'Rendering in progress...' : 'Ready'}</span>
          </div>
        ) : (
          <span>Ready for deck data</span>
        )}
      </div>
    </div>
  );
};

// Main Renderer component that wraps content with necessary providers
const Renderer: React.FC = () => {
  return (
    <RegistryProvider>
      <ComponentStateProvider>
        <ThemeProvider>
          <FontPreloader />
          <RendererContent />
        </ThemeProvider>
      </ComponentStateProvider>
    </RegistryProvider>
  );
};

export default Renderer; 