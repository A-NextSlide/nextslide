/**
 * Test component for Yjs collaboration
 */
import React, { useRef, useState, useEffect } from 'react';
import { YjsProvider, useYjs } from './YjsProvider';
import CollaborationStatus from './components/CollaborationStatus';
import CollaborativeCursors from './components/CollaborativeCursors';
import { DeckStoreInitializer } from '../components/DeckStoreInitializer';
import { LockDemo } from './components/LockDemo';
import { LockRequestHandler } from './components/LockRequestHandler';
import * as Y from 'yjs';

// Safe JSON stringify to handle circular references
const safeStringify = (obj: any): string => {
  try {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    });
  } catch (err) {
    return `[Error stringifying: ${err.message}]`;
  }
};

// Simple slide editor for testing collaboration
const SimpleEditor: React.FC<{ slideId: string }> = ({ slideId }) => {
  const { 
    isConnected, 
    clientId, 
    updateCursor,
    users,
    docManager
  } = useYjs();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [components, setComponents] = useState<Array<{
    id: string;
    type: string;
    props: { text?: string; x: number; y: number; color?: string };
  }>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreatingSlide, setIsCreatingSlide] = useState(false);
  const [ready, setReady] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');

  // Track cursor position
  useEffect(() => {
    if (!isConnected || !containerRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current || !isConnected) return;
      
      try {
        // Get position relative to container
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Only broadcast if cursor is within the container
        if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
          // Ensure we're passing valid numbers
          updateCursor(slideId, Math.round(x), Math.round(y));
        }
      } catch (err) {
        console.error('Error tracking cursor:', err);
      }
    };
    
    containerRef.current.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      if (containerRef.current) {
        containerRef.current.removeEventListener('mousemove', handleMouseMove);
      }
    };
  }, [isConnected, containerRef, updateCursor, slideId]);
  
  // Immediate document initialization
  useEffect(() => {
    if (isConnected && docManager) {
      setReady(true);
    }
  }, [isConnected, docManager]);
  
  // Ensure slide exists when connected and ready
  useEffect(() => {
    if (!isConnected || !docManager || !ready) return;
    
    console.log("Checking for slide on connect:", slideId);
    setIsCreatingSlide(true);
    
    try {
      const deckData = docManager.toDeckData();
      const existingSlide = deckData.slides.find(s => s.id === slideId);
      
      if (!existingSlide) {
        console.log("Creating initial slide on connection:", slideId);
        const slide = {
          id: slideId,
          title: 'Collaborative Test Slide',
          components: [],
          background: {
            id: 'bg-1',
            type: 'background',
            props: { color: '#ffffff' }
          }
        };
        
        // Add the slide via Yjs
        docManager.addSlide(slide);
        
        // Force an update after adding the slide
        setTimeout(() => {
          const updatedDeckData = docManager.toDeckData();
          console.log("After adding slide:", updatedDeckData.slides.map(s => s.id));
        }, 500);
      } else {
        console.log("Found existing slide:", slideId, 
          "with", existingSlide.components?.length || 0, "components");
        
        // Update our local state with the components
        setComponents((existingSlide.components || []).map(comp => ({
          id: comp.id,
          type: comp.type,
          props: {
            text: comp.props.text,
            x: comp.props.position?.x ?? comp.props.x ?? 0,
            y: comp.props.position?.y ?? comp.props.y ?? 0,
            color: comp.props.textColor ?? comp.props.color
          }
        })));
      }
    } catch (err) {
      console.error("Error initializing slide:", err);
      setErrorMessage(`Error initializing slide: ${err.message}`);
    } finally {
      setIsCreatingSlide(false);
    }
  }, [isConnected, docManager, slideId, ready]);

  // Listen for document changes
  useEffect(() => {
    if (!isConnected) return;
    
    const handleDocumentChanged = (event: any) => {
      try {
        const data = event.detail;
        if (!data || !data.deckData) return;
        
        // Log the document data for debugging
        setDebugInfo(prev => `${new Date().toISOString().slice(11, 19)} - Received document change\n${prev}`);
        
        const slide = data.deckData.slides.find((s: any) => s.id === slideId);
        if (slide && slide.components) {
          console.log(`Document changed: ${slide.components.length} components`);
          setDebugInfo(prev => `${new Date().toISOString().slice(11, 19)} - Found ${slide.components.length} components in slide ${slideId}\n${prev}`);
          
          // Ensure no duplicate component IDs by creating a map and processing components
          const idMap = new Map();
          const dedupedComponents = slide.components
            .filter(comp => {
              // Validate component has required fields
              if (!comp || !comp.id || !comp.type) {
                console.warn('Invalid component detected, filtering out', comp);
                return false;
              }
              
              // Check for duplicate IDs and only keep the first occurrence
              if (idMap.has(comp.id)) {
                console.warn(`Duplicate component ID detected: ${comp.id}, filtering out`);
                return false;
              }
              
              idMap.set(comp.id, true);
              return true;
            })
            .map(comp => ({
              id: comp.id,
              type: comp.type,
              props: {
                text: comp.props.text,
                x: comp.props.position?.x ?? comp.props.x ?? 0,
                y: comp.props.position?.y ?? comp.props.y ?? 0,
                color: comp.props.textColor ?? comp.props.color
              }
            }));
            
          console.log(`Processing ${slide.components.length} components, resulted in ${dedupedComponents.length} after deduplication`);
          setComponents(dedupedComponents);
        } else {
          setDebugInfo(prev => `${new Date().toISOString().slice(11, 19)} - No slide found with ID ${slideId} in document change\n${prev}`);
        }
      } catch (err) {
        console.error("Error processing document change:", err);
        setErrorMessage(`Error processing document change: ${err.message}`);
      }
    };
    
    // Listen for the custom event from YjsDocumentManager
    document.addEventListener('yjs-document-changed', handleDocumentChanged);
    
    return () => {
      document.removeEventListener('yjs-document-changed', handleDocumentChanged);
    };
  }, [isConnected, slideId]);

  // Add a text component manually with error handling
  const handleAddText = () => {
    if (!text.trim() || !isConnected || !docManager || !ready) return;
    
    setErrorMessage(null);
    
    try {
      // Create a new component
      const componentId = `text-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const component = {
        id: componentId,
        type: 'TextBlock',
        props: {
          text,
          x: Math.random() * 300,
          y: Math.random() * 300,
          color: getRandomColor()
        }
      };
      
      // Log
      console.log(`Adding component ${componentId} to slide ${slideId}`);
      setDebugInfo(prev => `${new Date().toISOString().slice(11, 19)} - Adding component ${componentId}\n${prev}`);
      
      // Get document structure for direct access (needed for collaboration)
      const docStruct = docManager.getDocumentStructure();
      const doc = docStruct.doc;
      
      try {
        // Use transaction for atomic changes
        doc.transact(() => {
          // Find the slide in the slides array
          let slideIndex = -1;
          let slideYMap = null;
          
          // Look for the slide ID in the slides array
          for (let i = 0; i < docStruct.slidesArray.length; i++) {
            try {
              const slide = docStruct.slidesArray.get(i);
              if (slide && slide.get('id') === slideId) {
                slideYMap = slide;
                slideIndex = i;
                break;
              }
            } catch (err) {
              console.warn(`Error accessing slide at index ${i}:`, err);
            }
          }
          
          // If no slide found, create one
          if (!slideYMap) {
            console.log(`Creating slide ${slideId} for component`);
            
            // Create new slide
            slideYMap = new Y.Map();
            slideYMap.set('id', slideId);
            slideYMap.set('title', 'Collaborative Test Slide');
            
            // Add a background
            const bgMap = new Y.Map();
            bgMap.set('id', 'bg-1');
            bgMap.set('type', 'background');
            
            const bgProps = new Y.Map();
            bgProps.set('color', '#ffffff');
            bgMap.set('props', bgProps);
            
            slideYMap.set('background', bgMap);
            
            // Create empty components array
            const componentsArray = new Y.Array();
            slideYMap.set('components', componentsArray);
            
            // Add slide to document
            docStruct.slidesArray.push([slideYMap]);
            slideIndex = docStruct.slidesArray.length - 1;
          }
          
          // Get components array from slide
          let componentsArray = slideYMap.get('components');
          if (!componentsArray) {
            componentsArray = new Y.Array();
            slideYMap.set('components', componentsArray);
          }
          
          // Create component map
          const componentMap = new Y.Map();
          componentMap.set('id', component.id);
          componentMap.set('type', component.type);
          
          // Create props map
          const propsMap = new Y.Map();
          for (const [key, value] of Object.entries(component.props)) {
            propsMap.set(key, value);
          }
          componentMap.set('props', propsMap);
          
          // Add component to array
          componentsArray.push([componentMap]);
        });
        
        // Emit a document-changed event to update all clients
        const deckData = docManager.toDeckData();
        const event = new CustomEvent('yjs-document-changed', { 
          detail: { 
            isLocal: true, 
            deckData: deckData 
          } 
        });
        document.dispatchEvent(event);
      } catch (err) {
        console.error("Error adding component to slide:", err);
        throw err;
      }
      
      // Update local state immediately for responsiveness
      setComponents(prev => [...prev, component]);
      
      // Clear input
      setText('');
      
      // Log completion
      setDebugInfo(prev => `${new Date().toISOString().slice(11, 19)} - Successfully added component ${componentId}\n${prev}`);
      
      // Send a sync message to ensure all clients get the update
      setTimeout(() => {
        handleForceSync();
      }, 500);
      
    } catch (err) {
      console.error("Error adding component:", err);
      setErrorMessage(`Error adding component: ${err.message}`);
      
      // Try an even simpler approach as a last resort
      try {
        const componentId = `text-retry-${Date.now()}`;
        
        // Update only local state
        const newComponent = {
          id: componentId,
          type: 'TextBlock',
          props: {
            text,
            x: Math.random() * 300,
            y: Math.random() * 300,
            color: getRandomColor()
          }
        };
        
        // Add to local state
        setComponents(prev => [...prev, newComponent]);
        
        // Try to send via API
        docManager.addComponent(slideId, newComponent);
        
        // Clear input
        setText('');
        
      } catch (retryErr) {
        console.error("Recovery also failed:", retryErr);
      }
    }
  };

  // Helper function to find slide index (using the public deck data API)
  const findSlideIndex = (docManager: any, slideId: string): number => {
    try {
      // Use the public API to get the deck data and find the slide
      const deckData = docManager.toDeckData();
      const slideIndex = deckData.slides.findIndex(slide => slide.id === slideId);
      return slideIndex;
    } catch (err) {
      console.error("Error finding slide index:", err);
      return -1;
    }
  };

  // Update text of selected component locally first
  const handleUpdateText = () => {
    if (!selectedId || !text.trim() || !isConnected) return;
    
    setErrorMessage(null);
    
    try {
      // Update local state first for immediate feedback
      setComponents(prev => prev.map(comp => 
        comp.id === selectedId 
          ? { ...comp, props: { ...comp.props, text } } 
          : comp
      ));
      
      // Use the public API to update the component
      docManager!.updateComponent(slideId, selectedId, { text });
      
      // Check if update was successful by verifying the component exists
      const deckData = docManager!.toDeckData();
      const slide = deckData.slides.find(s => s.id === slideId);
      
      if (!slide) {
        throw new Error("Slide not found when updating component");
      }
      
      const component = slide.components?.find(c => c.id === selectedId);
      if (!component) {
        throw new Error(`Component ${selectedId} not found in Yjs document`);
      }
      
      // Force update
      setTimeout(() => {
        handleForceSync();
      }, 500);
      
      // Clear selection and text input
      setText('');
      setSelectedId(null);
    } catch (err) {
      console.error("Error updating component:", err);
      setErrorMessage(`Error updating component: ${err.message}`);
    }
  };

  // Select a component
  const handleSelect = (id: string) => {
    setSelectedId(id);
    const component = components.find(c => c.id === id);
    if (component?.props.text) {
      setText(component.props.text);
    }
  };

  // Random color generator
  const getRandomColor = () => {
    const colors = ['#ff5555', '#55ff55', '#5555ff', '#ffff55', '#ff55ff', '#55ffff'];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  // Force sync with server
  const handleForceSync = () => {
    if (docManager && docManager.wsProvider) {
      try {
        // Send a special sync message to the server
        const syncRequest = new Uint8Array([0, 0, 1, 0]);
        
        // Get direct access to the WebSocket
        const wsProvider = docManager.wsProvider;
        
        // Send the sync request directly through the WebSocket
        if ((wsProvider as any).ws && (wsProvider as any).ws.readyState === WebSocket.OPEN) {
          (wsProvider as any).ws.send(syncRequest);
          console.log("Sent sync request via WebSocket");
        }
        
        // Also emit a document-changed event to update the UI
        const deckData = docManager.toDeckData();
        const event = new CustomEvent('yjs-document-changed', { 
          detail: { 
            isLocal: true, 
            deckData: deckData 
          } 
        });
        document.dispatchEvent(event);
        
        setDebugInfo(prev => `${new Date().toISOString().slice(11, 19)} - Sent sync request and emitted update event\n${prev}`);
        setErrorMessage(null);
      } catch (err) {
        console.error("Error sending sync request:", err);
        setErrorMessage(`Error sending sync request: ${err.message}`);
      }
    }
  };

  // Reset the whole collaboration
  const handleReset = () => {
    if (!docManager) return;
    
    try {
      setDebugInfo(prev => `${new Date().toISOString().slice(11, 19)} - Resetting document\n${prev}`);
      
      // Get current slides
      const deckData = docManager.toDeckData();
      
      // Remove all existing slides one by one
      for (const slide of deckData.slides) {
        docManager.removeSlide(slide.id);
      }
      
      // Then add the standard test slide
      const slide = {
        id: 'slide-test-1',
        title: 'Fresh Test Slide',
        components: [],
        background: {
          id: 'bg-reset',
          type: 'background',
          props: { color: '#ffffff' }
        }
      };
      
      docManager.addSlide(slide);
      
      // Clear local state
      setComponents([]);
      setSelectedId(null);
      setText('');
      setErrorMessage(null);
      
      // Force sync to propagate changes
      handleForceSync();
      
      console.log("Reset complete");
      setDebugInfo(prev => `${new Date().toISOString().slice(11, 19)} - Reset complete\n${prev}`);
    } catch (err) {
      console.error("Error during reset:", err);
      setErrorMessage(`Reset failed: ${err.message}`);
    }
  };
  
  return (
    <div className="p-4 text-gray-900 dark:text-gray-100">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Collaborative Slide Editor</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Client ID: {clientId || 'Not connected'} 
            {isConnected ? ' (Connected)' : ' (Disconnected)'}
            {ready ? ' (Ready)' : ' (Initializing...)'}
          </p>
        </div>
        <CollaborationStatus showUsers={true} />
      </div>
      
      {/* Error message display */}
      {errorMessage && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          <h3 className="font-bold">Error Occurred</h3>
          <pre className="text-xs overflow-auto max-h-40">{errorMessage}</pre>
          <div className="mt-2 flex space-x-2">
            <button 
              onClick={() => setErrorMessage(null)}
              className="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded"
            >
              Dismiss
            </button>
            <button
              onClick={handleForceSync}
              className="text-xs px-2 py-1 bg-blue-100 hover:bg-blue-200 rounded"
            >
              Force Sync
            </button>
            <button
              onClick={handleReset}
              className="text-xs px-2 py-1 bg-red-100 hover:bg-red-200 rounded"
            >
              Reset All
            </button>
          </div>
        </div>
      )}
      
      <div className="mb-4 flex space-x-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 rounded border p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          placeholder="Enter text"
        />
        <button
          onClick={handleAddText}
          disabled={!isConnected || isCreatingSlide || !ready}
          className="rounded bg-blue-500 px-4 py-2 text-white disabled:opacity-50"
        >
          {isCreatingSlide ? 'Initializing...' : ready ? 'Add Text' : 'Waiting...'}
        </button>
        {selectedId && (
          <button
            onClick={handleUpdateText}
            className="rounded bg-green-500 px-4 py-2 text-white"
          >
            Update Selected
          </button>
        )}
      </div>
      
      <div className="mb-4">
        <h3 className="font-bold">Connected Users: {users.length}</h3>
        <div className="flex space-x-2">
          {users.map(user => (
            <div 
              key={user.id} 
              className="rounded px-2 py-1 text-white"
              style={{ backgroundColor: user.color }}
            >
              {user.name} {user.id === String(clientId) ? '(you)' : ''}
            </div>
          ))}
        </div>
      </div>
      
      <div
        ref={containerRef}
        className="relative min-h-[400px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-4"
        data-slide-id={slideId}
      >
        {components.map(comp => (
          <div
            key={comp.id}
            className={`absolute cursor-pointer rounded border p-2 ${
              selectedId === comp.id ? 'border-blue-500' : 'border-gray-300 dark:border-gray-600'
            } bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100`}
            style={{
              left: `${comp.props.x}px`,
              top: `${comp.props.y}px`,
              backgroundColor: comp.props.color ? `${comp.props.color}20` : undefined
            }}
            onClick={() => handleSelect(comp.id)}
          >
            {comp.props.text}
          </div>
        ))}
        
        <CollaborativeCursors 
          slideId={slideId} 
          containerRef={containerRef} 
        />
      </div>
      
      <div className="mt-4 bg-muted/50 border border-border rounded-md text-xs">
        <div className="flex items-center justify-between bg-muted/70 px-3 py-1.5 border-b border-border">
          <h3 className="font-medium text-xs">Debug Information</h3>
          <button
            onClick={handleForceSync}
            className="text-xs px-2 py-0.5 bg-primary/90 text-primary-foreground rounded"
          >
            Sync Now
          </button>
        </div>
        
        <div className="p-2 space-y-0.5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Components:</span>
              <span>{components.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Connection:</span>
              <span className={isConnected ? "text-green-500 dark:text-green-400" : "text-red-500 dark:text-red-400"}>
                {isConnected ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ready:</span>
              <span>{ready ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Selected ID:</span>
              <span className="font-mono">{selectedId ? selectedId.substring(0, 8) : 'None'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Slide ID:</span>
              <span className="font-mono">{slideId.substring(0, 12)}</span>
            </div>
          </div>
          
          <div className="flex space-x-2 pt-1.5">
            <button
              onClick={handleForceSync}
              className="rounded bg-primary/90 px-2.5 py-1 text-primary-foreground text-xs flex-1"
            >
              Force Sync
            </button>
            <button
              onClick={handleReset}
              className="rounded bg-destructive/90 px-2.5 py-1 text-destructive-foreground text-xs flex-1"
            >
              Reset All
            </button>
          </div>
        </div>
        
        {/* Debug log */}
        <details className="group">
          <summary className="text-xs cursor-pointer px-3 py-1.5 bg-muted/70 border-t border-border flex items-center">
            <span className="font-medium">Debug Log</span>
            <span className="ml-1 opacity-60 group-open:opacity-0">▼</span>
          </summary>
          <pre className="text-xs bg-background text-foreground border-t border-border p-2 rounded-b-md h-24 overflow-auto font-mono">
            {debugInfo || "No debug information available"}
          </pre>
        </details>
      </div>
    </div>
  );
};

// Random name generator
function getRandomName() {
  const names = [
    'Alex', 'Blake', 'Casey', 'Dana', 'Evan', 
    'Frankie', 'Glenn', 'Harper', 'Indigo', 'Jordan'
  ];
  return names[Math.floor(Math.random() * names.length)];
}

// Test component for Yjs collaboration
const TestCollaboration: React.FC = () => {
  // Use a fixed slide ID for testing
  const slideId = 'slide-test-1';
  const [userName] = useState(getRandomName());
  const [userId] = useState(`user-${Math.floor(Math.random() * 10000)}`);

  // Standardized document ID for collaboration
  const sharedDocId = "shared-test-document";
  
  // State to toggle between editor and lock demo
  const [showLockDemo, setShowLockDemo] = useState(false);
  
  return (
    <>
      {/* Disable Supabase sync for the collaboration test */}
      <DeckStoreInitializer 
        syncEnabled={false} 
        useRealtimeSubscription={false} 
        autoSyncInterval={0}
        collaborationEnabled={true}
        collaborationUrl={import.meta.env.VITE_WEBSOCKET_URL || 'wss://slide-websocket.onrender.com'}
      />
      
      <YjsProvider
        docId={sharedDocId}
        userName={userName}
        userId={userId}
        wsUrl={import.meta.env.VITE_WEBSOCKET_URL || 'wss://slide-websocket.onrender.com'}
        autoConnect={true}
      >
        <div className="p-4">
          {/* Horizontal tabs above content */}
          <div className="flex space-x-2 mb-4">
            <button
              onClick={() => setShowLockDemo(false)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                !showLockDemo 
                  ? 'bg-muted font-medium' 
                  : 'text-muted-foreground hover:bg-muted/50'
              }`}
            >
              Collaborative Editor
            </button>
            <button
              onClick={() => setShowLockDemo(true)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                showLockDemo 
                  ? 'bg-muted font-medium' 
                  : 'text-muted-foreground hover:bg-muted/50'
              }`}
            >
              Lock Demo
            </button>
          </div>
          
          {/* Main content area */}
          <div>
            {showLockDemo ? (
              <LockDemo />
            ) : (
              <SimpleEditor slideId={slideId} />
            )}
          </div>
        </div>
        
        {/* Always show lock request handler */}
        <LockRequestHandler />
      </YjsProvider>
    </>
  );
};

export default TestCollaboration;