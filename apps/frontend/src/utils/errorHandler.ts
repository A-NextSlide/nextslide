/**
 * Global error handler to catch and suppress specific errors
 */

// List of error patterns to suppress in the console
const SUPPRESSED_ERRORS = [
  // Vite development logs
  '[vite] connecting',
  '[vite] connected',
  '[vite] hot updated',
  '[vite] invalidate',
  'client:495',
  'client:618',
  'connecting...',
  'connected.',
  
  // React DevTools
  'Download the React DevTools for a better development experience',
  'Download the React DevTools',
  'https://reactjs.org/link/react-devtools',
  
  // WebSocket and connection related
  'Unexpected end of array',
  'WebSocket connection failed',
  'WebSocket is closed before the connection is established',
  'WebSocket connection to',
  'The resource',
  'was preloaded using link preload but not used',
  'React Router Future Flag Warning',
  'Unable to compute message',
  
  // Database and persistence related
  'yjs_snapshots_deck_id_version_unique', // Suppress duplicate snapshot errors
  'Failed to load resource: the server responded with a status of 400', // Suppress CSS loading errors
  'Failed to load resource: the server responded with a status of 409', // Suppress snapshot conflicts
  '/rest/v1/yjs_snapshots 409 (Conflict)',  // Suppress Supabase conflicts (works with any Supabase instance)
  '@supabase_supabase-js.js', // Suppress Supabase JS logs
  'supabase-js.js', // Suppress Supabase JS logs
  '409 (Conflict)', // Suppress conflict errors
  
  // YJS related
  '[YjsDocumentManager]', // Suppress YJS document manager logs
  '[YjsOperations]', // Suppress YJS operations logs
  '[setupRealtimeSubscription]', // Suppress realtime subscription logs
  '[YjsPersistenceService]', // Suppress YJS persistence service logs
  'Invalid access: Add Yjs type', // Suppress YJS type-related errors
  'typeListPushGenerics', // Suppress YJS error details
  'typeListInsertGenericsAfter', // Suppress YJS error details
  'chunk-3X2LQAHN', // Suppress YJS chunk errors
  'chunk-NFC5BX5N', // Suppress YJS chunk errors
  'deferredYjsOperations', // Suppress deferred operations messages
  'processQueue', // Suppress queue processing messages
  '[deckSyncOperations]', // Suppress deck sync operations logs
  '[cleanupRealtimeSubscription]', // Suppress cleanup logs
  '[initialize]', // Suppress initialization logs
  'YjsDocumentManager.ts:', // Suppress YJS document manager file logs
  'closeWebsocketConnection', // Suppress WebSocket close logs
  'disconnect @', // Suppress disconnect logs
  'disconnectYjsSync', // Suppress YJS sync disconnect logs
  'setupYjsCollaboration', // Suppress YJS collaboration setup logs
  'commitHookEffectListMount', // Suppress React effect mount logs
  'commitPassiveMountOnFiber', // Suppress React passive mount logs
  'commitPassiveMountEffects', // Suppress React passive effects logs
  'flushPassiveEffectsImpl', // Suppress React flush effects logs
  'commitRootImpl', // Suppress React commit root logs
  'performSyncWorkOnRoot', // Suppress React sync work logs
  'flushSyncCallbacks', // Suppress React flush callbacks logs
  'y-websocket.js', // Suppress YJS websocket logs
  'safelyCallDestroy', // Suppress React destroy logs
  'invokePassiveEffectUnmountInDEV', // Suppress React dev unmount logs
  'invokeEffectsInDev', // Suppress React dev effects logs
  'commitDoubleInvokeEffectsInDEV', // Suppress React dev double invoke logs
  'finishConcurrentRender', // Suppress React concurrent render logs
  'performConcurrentWorkOnRoot', // Suppress React concurrent work logs
  'workLoop', // Suppress React work loop logs
  'flushWork', // Suppress React flush work logs
  'performWorkUntilDeadline', // Suppress React work deadline logs
  'has overflow, reducing search range', // Suppress search range logs
  'fits, increasing search range', // Suppress search range logs
  'Optimized from.*to.*with.*safety margin', // Suppress optimization result logs
  'No perfect fit found, using proportional minimum', // Suppress fallback logs
  'Reducing from.*px, proportional min:', // Suppress reduction logs
  'Current size.*fits, trying to increase', // Suppress size testing logs
  'Dimension overflow detected at', // Suppress overflow detection logs
  'Verified: Component.*has optimized fontSize:', // Suppress verification logs
  'Direct update: Setting component.*fontSize', // Suppress direct update logs
  
  // Slide editor and deck update logs (silence verbose app logs without affecting behavior)
  '[SlideEditor]', // Suppress general SlideEditor logs
  '[DeckUpdate]', // Suppress deck update logs
  '[DeckStatus]', // Suppress deck status logs
  '[DebugSlideImages]', // Suppress slide images debugging logs
  '[ChatPanel]', // Suppress chat panel processing logs
  '[ChatMessage]', // Suppress chat message detection logs
  '[EnhancedDeckProgress]', // Suppress enhanced deck progress logs
  '[fetchLatestDeck]', // Suppress fetchLatestDeck logs
  '[Navigation]', // Suppress navigation event logs
  'Auto-select images is disabled', // Suppress auto-select images disabled logs
  'Auto-select images is enabled', // Suppress auto-select images enabled logs
  'Applying cached images', // Suppress cached images application logs
  'Restored autoSelectImages preference', // Suppress restoration logs
  'slide_images_available event received', // Suppress slide images available event logs
  'Completion - deck data:', // Suppress completion deck data dump
  'Dispatching deck_generation_complete event', // Suppress event dispatch log
  'Processing new system message', // Suppress chat panel message processing
  'Completion message detected:', // Suppress completion detection logs
  'Processing completion message', // Suppress completion processing logs
  'Adding completion message as new', // Suppress completion message add logs
  'Setting status from real-time update', // Suppress status set logs
  'Fetching deck after completion', // Suppress post-completion fetch logs
  'Raw payload received:', // Suppress raw realtime payload logs
  'Received slides update:', // Suppress slides update logs
  'Skipping duplicate slide update', // Suppress duplicate update logs
  'Slide counts:', // Suppress slide counts logs
  'Updating slide', // Suppress per-slide update logs
  'Updated slides:', // Suppress updated slides list
  'Updated deck with slides:', // Suppress updated deck details
  
  // Share service related logs
  '[ShareService]', // Suppress all share service logs
  '[ShareLinks]', // Suppress share links logs
  'Fetching share links:', // Suppress fetching logs
  'Share links response:', // Suppress response logs
  'Creating share link:', // Suppress creation logs
  'Unexpected response structure:', // Suppress structure warnings
  
  // Generation and progress related logs
  '[GenerationStateManager]', // Suppress generation state manager logs
  '[Progress]', // Suppress progress logs
  '[SlideGeneration]', // Suppress slide generation logs
  '[useSlideGeneration]', // Suppress slide generation hook logs
  '[OutlineAPI]', // Suppress outline API logs
  '[OutlineEditor]', // Suppress outline editor logs
  '[useOutlineChat]', // Suppress outline chat logs
  '[ChatInputView]', // Suppress chat input view logs
  'Event received:', // Suppress event logs
  'Progress update received:', // Suppress progress update logs
  'Phase transition:', // Suppress phase transition logs
  'New high water mark:', // Suppress high water mark logs
  'Setting progress to.*for new phase', // Suppress progress setting logs
  'Event:.*Phase:.*Progress:.*Current:', // Suppress event details logs
  'Slide.*completed:', // Suppress slide completion logs
  'Starting periodic fetch', // Suppress periodic fetch logs
  'Sending request with slideCount:', // Suppress request logs
  'Creating outline structure with deepResearch:', // Suppress outline structure logs
  'Current outline updated:', // Suppress outline update logs
  'Using streaming outline generation API', // Suppress streaming logs
  'Tagged media in API result:', // Suppress media logs
  'Merging tagged media from API result', // Suppress merging logs
  'Image collection event details:', // Suppress image collection logs
  'Ignoring empty slide_completed event', // Suppress empty event logs
  
  // Realtime subscription logs
  '[RealtimeSubscription]', // Suppress all realtime subscription logs
  'Deck channel status:', // Suppress channel status logs
  'Channel closed', // Suppress channel closed logs
  'Successfully subscribed to deck', // Suppress subscription success logs
  
  // API and fetch logs
  '[fetchDeckStatus]', // Suppress deck status logs
  'Updating deck with slides:', // Suppress deck update logs
  'API Configuration:', // Suppress API config logs
  'Token expiring soon, refreshing', // Suppress token refresh logs
  
  // VirtualizedDeckGrid logs
  '[VirtualizedDeckGrid]', // Suppress virtualized deck grid logs
  'Initially visible cards:', // Suppress visible cards logs
  
  // Deck management logs
  '[useDeckManagement]', // Suppress deck management logs
  '[deckSyncService]', // Suppress deck sync service logs
  'Loading initial decks', // Suppress loading logs
  'Loaded decks:', // Suppress loaded decks logs
  'Fetching decks from:', // Suppress fetching logs
  'Raw response from API:', // Suppress raw response logs
  'Number of decks received:', // Suppress deck count logs
  'Formatted decks:', // Suppress formatted decks logs
  
  // Protected route logs
  '[ProtectedRoute]', // Suppress protected route logs
  'Redirecting to login', // Suppress redirect logs
  
  // Console suppressor meta-logs
  'consoleSuppressor.ts:', // Suppress console suppressor logs themselves
  
  // External modules and framework errors
  'Module "stream" has been externalized', // Suppress Vite module externalized messages
  'Module "timers" has been externalized', // Suppress Vite module externalized messages
  'structuredClone failed', // Suppress structured clone failures
  'FontPreloader', // Suppress font preloader logs
  '[vite] connecting', // Suppress Vite connection logs
  '[vite] connected', // Suppress Vite connection logs
  '📍', // Suppress location pin debug logs
  'ℹ️', // Suppress info emoji logs
  'Failed to fetch', // Suppress fetch failure logs
  'Maximum call stack size exceeded', // Suppress maximum call stack errors
  'net::ERR_', // Suppress network errors
  'node_modules', // Suppress node_modules related errors
  
  // Slide tagging and parsing related
  'Unmapped element type during translation', // Suppress unmapped element type warnings
  'Skipping element', // Suppress element skipping warnings
  'due to unmappable type', // Suppress unmappable type warnings
  'Rendering image with props', // Suppress image rendering debug logs
  'Applied crop transform', // Suppress crop transform debug logs
  'Using raw props', // Suppress raw props usage warnings
  
  // HTML2Canvas and screenshot related
  'Avoid using document.write()', // Suppress html2canvas document.write violations
  'DocumentCloner2.toIFrame', // Suppress html2canvas cloner logs
  'html2canvas.js', // Suppress html2canvas logs
  'slideScreenshot.ts', // Suppress slide screenshot logs
  'captureElementScreenshot', // Suppress screenshot capture logs
  'captureSlideScreenshot', // Suppress slide screenshot logs
  'setTimeout handler took', // Suppress setTimeout performance violations
  '[Violation]', // Suppress general performance violations
  'Processing slide template with screenshot', // Suppress screenshot processing logs
  'Uploading screenshot to storage', // Suppress screenshot upload logs
  'Screenshot uploaded successfully', // Suppress screenshot upload success logs
  'data:image/png;base64', // Suppress base64 image data logs
  
  // Hot Module Reload and development related
  '[hmr]', // Suppress HMR logs
  'Failed to reload', // Suppress HMR reload failures
  'net::ERR_ABORTED', // Suppress network errors
  'Internal Server Error', // Suppress server errors
  'importUpdatedModule', // Suppress HMR module import logs
  'fetchUpdate', // Suppress HMR fetch update logs
  'queueUpdate', // Suppress HMR queue update logs
  'warnFailedUpdate', // Suppress HMR failed update warnings
  
  // Registry and server status related
  'Error checking server status', // Suppress registry server status errors
  'TimeoutError: signal timed out', // Suppress timeout errors
  'checkServerStatus', // Suppress server status check logs
  
  // Supabase query related
  '400 (Bad Request)', // Suppress Supabase bad request errors
  'auto_tags::text.ilike', // Suppress auto tags query logs
  'custom_tags::text.ilike', // Suppress custom tags query logs
  'content::text.ilike', // Suppress content query logs
  
  // Vite and build related warnings
  'chunk-', // Suppress chunk errors
  'xml2js.js', // Suppress xml2js module warnings
  '__require2', // Suppress require warnings from bundled code
  'flushSync', // Suppress React flushSync warnings
  'act(...)', // Suppress React act() warnings
  'ReactDOM.render', // Suppress ReactDOM.render warnings
  'useLayoutEffect', // Suppress useLayoutEffect warnings
  
  // History and editor related
  'Cleared history for slide', // Suppress history clearing logs
  'initializeDraft-', // Suppress draft initialization timing logs
  'editorStore.ts', // Suppress editor store logs
  'lazy-load-draft', // Suppress draft loading logs
  
  // Interface and UI related
  '[ComponentRenderer]', // Suppress component renderer logs
  '[useComponentDrag]', // Suppress component drag logs
  'handleDragStart', // Suppress drag start logs
  'Chrome is moving towards', // Suppress Chrome cookie warnings
  'content_scripts', // Suppress content scripts messages
  'third-party cookies', // Suppress cookie-related notifications
  'safelyCallDestroy', // Suppress React component cleanup logs
  'commitHookEffectListUnmount', // Suppress React effect unmount logs
  'invokePassiveEffectUnmountInDEV', // Suppress React dev mode logs
  'performSyncWorkOnRoot', // Suppress React internals
  'flushPassiveEffects', // Suppress React passive effects
  'commitRoot', // Suppress React commit logs
  
  // Font related warnings
  'fonts.gstatic.com', // Suppress font loading warnings
  '.woff2 was preloaded', // Suppress font preload warnings
  'preloaded using link preload', // Suppress preload warnings
  'was preloaded using link preload but not used', // Suppress preload warnings
  'The resource https://fonts.gstatic.com', // Suppress Google Fonts preload warnings
  'Failed to load stylesheet:', // Suppress stylesheet loading errors
  'Stylesheet load timed out:', // Suppress stylesheet timeout warnings
  'Fontshare font loaded:', // Suppress Fontshare success logs
  'Failed to load Google Font stylesheet:', // Suppress Google Font errors
  
  // Store and state management
  'INFO  [store]', // Suppress store info logs
  'INFO  [registry]', // Only keep initial registry loaded log
  'Registry loaded successfully', // Keep only the initial registry loaded message
  'Collaboration status', // Suppress collaboration status logs
  'Preloading', // Suppress preloading logs
  'Server: connected', // Suppress connection status
  'Server has registry', // Suppress registry status
  'Updating stop color', // Suppress gradient picker debug logs
  
  // Component and editor related
  'Component not found on slide', // Suppress component not found warnings
  'updateDraftComponent', // Suppress draft component update logs
  'updateComponent', // Suppress component update logs
  'TiptapTextBlockRenderer', // Suppress Tiptap renderer logs
  'onCreate', // Suppress onCreate logs
  'onUpdate', // Suppress onUpdate logs
  '@tiptap_react.js', // Suppress Tiptap React logs
  'Table state:', // Suppress table state debug logs
  'Table clicked:', // Suppress table click debug logs
  'Table mouseDown:', // Suppress table mouse debug logs
  'Table mouseUp:', // Suppress table mouse debug logs
  'Detected drag movement:', // Suppress drag detection logs
  'Entering text editing mode', // Suppress text editing mode logs
  'NOT entering text editing mode', // Suppress text editing mode logs
  'Updating cell:', // Suppress cell update logs
  
  // Component state sync issues - more specific patterns
  'Component.*not found on slide.*for update', // Suppress component not found on slide warnings
  'commitHookEffectListMount', // Suppress React effect mount logs
  'commitPassiveMountOnFiber', // Suppress React passive mount logs
  'commitPassiveMountEffects_complete', // Suppress React passive effects logs
  'commitPassiveMountEffects_begin', // Suppress React passive effects logs
  'commitPassiveMountEffects', // Suppress React passive effects logs
  'flushPassiveEffectsImpl', // Suppress React flush effects logs
  'flushPassiveEffects', // Suppress React flush effects logs
  'commitRootImpl', // Suppress React commit root logs
  'commitRoot', // Suppress React commit root logs
  'performSyncWorkOnRoot', // Suppress React sync work logs
  'performConcurrentWorkOnRoot', // Suppress React concurrent work logs
  'finishConcurrentRender', // Suppress React concurrent render logs
  'flushSyncCallbacks', // Suppress React flush callbacks logs
  'workLoop', // Suppress React work loop logs
  'flushWork', // Suppress React flush work logs
  'performWorkUntilDeadline', // Suppress React work deadline logs
  'Editor @', // Suppress Tiptap editor logs
  'createEditor', // Suppress Tiptap create editor logs
  'refreshEditorInstance', // Suppress Tiptap refresh instance logs
  'dispatchTransaction', // Suppress Tiptap transaction logs
  'emit @', // Suppress Tiptap emit logs
  'method @', // Suppress Tiptap method logs
  'dispatch @', // Suppress Tiptap dispatch logs
  
  // Deck diff debugging logs
  'diff Object', // Suppress deck diff debug logs
  'cleanedDiff Object', // Suppress cleaned diff debug logs
  'applying slide updates', // Suppress slide update debug logs
  'applying slides to update', // Suppress slide update debug logs
  'finding slide to update', // Suppress slide search debug logs
  'found slide to update', // Suppress slide found debug logs
  'applying slide properties', // Suppress property update debug logs
  'applying component changes', // Suppress component change debug logs
  'Applying component updates to slide', // Suppress component update debug logs
  'component.id, component.type', // Suppress component identification debug logs
  'slideDiff.components_to_update', // Suppress slide diff debug logs
  'Updating component', // Suppress component update debug logs
  'BEFORE:', // Suppress before state debug logs
  'DIFF:', // Suppress diff debug logs
  'AFTER:', // Suppress after state debug logs
  '-------------------', // Suppress separator debug logs
  'updating slide in array', // Suppress slide array update debug logs
  
  // Chart renderer specific logs
  '[LineChartRenderer]', // Suppress line chart renderer logs
  'smoothCurve value:', // Suppress smoothCurve logs
  '[BarChartRenderer]', // Suppress bar chart renderer logs
  '[PieChartRenderer]', // Suppress pie chart renderer logs
  '[ChartRenderer]', // Suppress generic chart renderer logs
  
  // Image loading and placeholder errors
  'via.placeholder.com', // Suppress placeholder image errors
  'net::ERR_NAME_NOT_RESOLVED', // Suppress DNS resolution errors
  'GET https://via.placeholder.com', // Suppress placeholder GET requests
  'Failed to load resource:', // Suppress resource loading failures
  'Image @', // Suppress Image component logs
  'src/renderers/components/ImageRenderer', // Suppress image renderer logs
  
  // WebSocket specific - more patterns
  'WebSocket connection to.*failed', // Suppress WebSocket connection failures
  'WebSocket is closed before the connection is established', // Suppress WebSocket close errors
  'WebSocket connection to.*wss://.*failed', // Suppress specific WebSocket URL failures
  'slide-websocket.onrender.com', // Suppress collaboration WebSocket errors
  'Failed to construct WebSocket', // Suppress WebSocket construction errors
  'WebSocket.*Error', // Suppress general WebSocket errors
  
  // Sync and state management
  'goToSlide:', // Suppress slide navigation logs
  'Unsaved changes detected', // Suppress unsaved changes logs
  'Applying changes automatically', // Suppress auto-apply logs
  '[batchUpdateSlideComponents]', // Suppress batch update logs
  'Processing batch update', // Suppress batch processing logs
  'Successfully updated slides', // Suppress successful update logs
  '[loadDeck] Already syncing', // Suppress sync protection logs
  'skipping load', // Suppress skip load logs
  
  // AI and generation logs
  'Initiating outline with detail level', // Suppress outline initiation logs
  'Collected Initial Idea:', // Suppress idea collection logs
  'Collected Style/Vibe:', // Suppress style collection logs
  'Color Config:', // Suppress color config logs
  'Selected Font:', // Suppress font selection logs
  'Raw JSON string from Chat Completion', // Suppress raw JSON logs
  'Generated outline with extractedData', // Suppress outline generation logs
  'Found.*slides with extractedData:', // Suppress extracted data logs
  '[Auth] Getting initial session', // Suppress auth init logs
  '[Auth] Session loaded', // Suppress auth session loaded logs
  
  // Deck management
  'Deleting deck with UUID:', // Suppress deck deletion logs
  'Successfully deleted deck', // Suppress successful deletion logs
  
  // SVG and animation related
  '<stop> attribute offset: Trailing garbage', // Suppress SVG gradient offset errors
  'The arity of each "output" value must be equal', // Suppress react-spring animation errors
  'chunk-72LCKJCD.js', // Suppress react-spring chunk errors
  'createStringInterpolator2', // Suppress react-spring interpolator errors
  'createInterpolator', // Suppress react-spring interpolator errors
  'AnimatedString.reset', // Suppress react-spring animation errors
  'SpringValue._start', // Suppress react-spring animation errors
  
  // Chart renderer logs - keeping as these are verbose
  /\[LineChartRenderer\] smoothCurve value:.*/,
  
  // Raw JSON logs
  /Raw JSON string from Chat Completion/,
  
  // File reading/parsing
  /Reading file:.*\.json/,
];

/**
 * Improved check for suppression with more context analysis
 */
function shouldSuppressMessage(args: any[]): boolean {
  // Convert args to string for pattern matching
  let messageString = '';
  try {
    messageString = Array.from(args).map(arg => 
      // Try to convert objects to strings safely
      typeof arg === 'object' && arg !== null ? JSON.stringify(arg) : String(arg)
    ).join(' ');
  } catch (e) {
    // If stringify fails, just join the string representations
    messageString = Array.from(args).join(' ');
  }
  
  // Check against suppression patterns
  const shouldSuppress = SUPPRESSED_ERRORS.some(pattern => {
    if (typeof pattern === 'string') {
      return messageString.includes(pattern);
    } else if (pattern instanceof RegExp) {
      return pattern.test(messageString);
    }
    return false;
  });
  
  // Additional specific checks for stubborn logs
  if (!shouldSuppress) {
    // Check for specific patterns that might be formatted differently
    if (messageString.includes('WebSocket connection to') && messageString.includes('failed')) return true;
    if (messageString.includes('chunk-') && messageString.includes('.js')) return true;
    if (messageString.includes('Download the React DevTools')) return true;
    if (messageString.includes('fonts.gstatic.com')) return true;
    if (messageString.includes('was preloaded using link preload')) return true;
  }
  
  return shouldSuppress;
}

/**
 * Check if the deck is currently generating
 * Used to suppress certain warnings during deck generation
 */
export function isDeckGenerating(): boolean {
  if (typeof window === 'undefined') return false;
  
  const deckStatus = (window as any).__deckStatus;
  return deckStatus?.state === 'generating' || deckStatus?.state === 'creating';
}

/**
 * Log a warning only if the deck is not generating
 * Helps reduce console noise during deck generation
 */
export function warnIfNotGenerating(message: string, ...args: any[]): void {
  if (!isDeckGenerating()) {
    console.warn(message, ...args);
  }
}

/**
 * Log an error only if the deck is not generating
 * Helps reduce console noise during deck generation
 */
export function errorIfNotGenerating(message: string, ...args: any[]): void {
  if (!isDeckGenerating()) {
    console.error(message, ...args);
  }
}

/**
 * Set up global error handlers to suppress specific errors
 */
export function setupGlobalErrorHandlers() {
  // Store the original console methods
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const originalConsoleLog = console.log;
  const originalConsoleDebug = console.debug;
  const originalConsoleInfo = console.info;
  const originalConsoleTime = console.time;
  const originalConsoleTimeEnd = console.timeEnd;

  // Override console.error
  console.error = function(...args: any[]) {
    if (!shouldSuppressMessage(args)) {
      originalConsoleError.apply(console, args);
    }
  };
  
  // Override console.warn
  console.warn = function(...args: any[]) {
    if (!shouldSuppressMessage(args)) {
      originalConsoleWarn.apply(console, args);
    }
  };

  // Override console.log
  console.log = function(...args: any[]) {
    if (!shouldSuppressMessage(args)) {
      originalConsoleLog.apply(console, args);
    }
  };

  // Override console.debug
  console.debug = function(...args: any[]) {
    if (!shouldSuppressMessage(args)) {
      originalConsoleDebug.apply(console, args);
    }
  };
  
  // Override console.info
  console.info = function(...args: any[]) {
    if (!shouldSuppressMessage(args)) {
      originalConsoleInfo.apply(console, args);
    }
  };
  
  // Override console timing methods
  console.time = function(label?: string) {
    if (label) {
      const shouldSuppress = SUPPRESSED_ERRORS.some(pattern => {
        if (typeof pattern === 'string') {
          return label.includes(pattern);
        } else if (pattern instanceof RegExp) {
          return pattern.test(label);
        }
        return false;
      });
      
      if (!shouldSuppress) {
        originalConsoleTime.apply(console, [label]);
      }
    }
  };
  
  console.timeEnd = function(label?: string) {
    if (label) {
      const shouldSuppress = SUPPRESSED_ERRORS.some(pattern => {
        if (typeof pattern === 'string') {
          return label.includes(pattern);
        } else if (pattern instanceof RegExp) {
          return pattern.test(label);
        }
        return false;
      });
      
      if (!shouldSuppress) {
        originalConsoleTimeEnd.apply(console, [label]);
      }
    }
  };

  // Add window error handler to suppress specific errors
  window.addEventListener('error', (event) => {
    // Check if this is an error we want to suppress
    const shouldSuppress = event.message && shouldSuppressMessage([event.message]);
    
    if (shouldSuppress) {
      // Prevent the error from appearing in console
      event.preventDefault();
      return true;
    }
    
    // Let other errors pass through
    return false;
  }, true);
  
  // Override console methods more aggressively to catch all logs
  const originalMethods = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug
  };
  
  // Create a more aggressive filter
  const aggressiveFilter = (method: string, args: any[]) => {
    const messageString = args.join(' ');
    
    // Specific patterns that are hard to catch
    const aggressivePatterns = [
      /client:\d+.*\[vite\]/,
      /chunk-[A-Z0-9]+\.js/,
      /Download the React DevTools/,
      /fonts\.gstatic\.com/,
      /was preloaded using link preload/,
      /WebSocket connection.*failed/,
      /WebSocket.*is closed before.*connection.*established/,
      /WebSocket connection to.*wss:\/\/.*failed/,
      /slide-websocket\.onrender\.com/,
      /YjsDocumentManager\.ts/,
      /closeWebsocketConnection/,
      /The resource.*was preloaded/,
      /\[Violation\].*document\.write/,
      /\[Violation\].*setTimeout.*handler.*took/,
      /DocumentCloner2\.toIFrame/,
      /html2canvas\.js/,
      /slideScreenshot\.ts/,
      /Processing slide template with screenshot/,
      /Uploading screenshot to storage/,
      /Screenshot uploaded successfully/,
      /data:image\/png;base64/,
      /\[hmr\]/,
      /Failed to reload/,
      /net::ERR_ABORTED/,
      /net::ERR_NAME_NOT_RESOLVED/,
      /Internal Server Error/,
      /Error checking server status/,
      /TimeoutError.*signal timed out/,
      /GET.*supabase\.co.*400.*Bad Request/,
      /auto_tags::text\.ilike/,
      /custom_tags::text\.ilike/,
      /content::text\.ilike/,
      /Component.*not found on slide.*for update/,
      /\[LineChartRenderer\].*smoothCurve value:/,
      /\[LineChartRenderer\]/,
      /\[BarChartRenderer\]/,
      /\[PieChartRenderer\]/,
      /\[ChartRenderer\]/,
      /via\.placeholder\.com/,
      /GET https:\/\/via\.placeholder\.com.*net::ERR_NAME_NOT_RESOLVED/,
      /goToSlide:.*Unsaved changes detected/,
      /\[batchUpdateSlideComponents\]/,
      /Processing batch update for \d+ slides/,
      /Successfully updated slides/,
      /commitHookEffectListMount/,
      /commitPassiveMountOnFiber/,
      /commitPassiveMountEffects/,
      /flushPassiveEffectsImpl/,
      /flushPassiveEffects/,
      /commitRootImpl/,
      /commitRoot/,
      /performSyncWorkOnRoot/,
      /performConcurrentWorkOnRoot/,
      /finishConcurrentRender/,
      /flushSyncCallbacks/,
      /workLoop/,
      /flushWork/,
      /performWorkUntilDeadline/,
      /Editor @.*chunk-[A-Z0-9]+\.js/,
      /createEditor @.*@tiptap_react\.js/,
      /refreshEditorInstance @.*@tiptap_react\.js/,
      /dispatchTransaction @.*chunk-[A-Z0-9]+\.js/,
      /emit @.*chunk-[A-Z0-9]+\.js/,
      /method @.*chunk-[A-Z0-9]+\.js/,
      /dispatch @.*chunk-[A-Z0-9]+\.js/,
      /Initiating outline with detail level:/,
      /Collected Initial Idea:/,
      /Collected Style\/Vibe:/,
      /Color Config:/,
      /Selected Font:/,
      /\[OpenAIService\].*Raw JSON string/,
      /Generated outline with extractedData/,
      /Found \d+ slides with extractedData/,
      /Deleting deck with UUID:/,
      /Successfully deleted deck/,
      /\[loadDeck\] Already syncing/,
      /Chrome is moving towards.*third-party cookies/,
      
      // Add new aggressive patterns for noisy components
      /\[FontOptimization\]/,
      /\[FontOptimizationService\]/,
      /\[AutoOptimize\]/,
      /\[ManualOptimization\]/,
      /Testing \d+px: overflow=/,
      /\d+px has overflow, reducing search range/,
      /\d+px fits, increasing search range/,
      /Optimized from \d+px to \d+px/,
      /No perfect fit found, using proportional minimum/,
      /Reducing from \d+px, proportional min:/,
      /Current size \d+px fits, trying to increase/,
      /Verified: Component .* has optimized fontSize:/,
      /Direct update: Setting component .* fontSize/,
      
      /\[ShareService\]/,
      /\[GenerationStateManager\]/,
      /\[Progress\]/,
      /\[SlideGeneration\]/,
      /\[useSlideGeneration\]/,
      /\[OutlineAPI\]/,
      /\[OutlineEditor\]/,
      /\[useOutlineChat\]/,
      /\[ChatInputView\]/,
      /Event received:/,
      /Progress update received:/,
      /Phase transition:/,
      /New high water mark:/,
      /Setting progress to \d+ for new phase/,
      /Event: .* Phase: .* Progress: .* Current:/,
      /Slide \d+ completed:/,
      
      /\[RealtimeSubscription\]/,
      /Deck channel status:/,
      /Channel closed/,
      /Successfully subscribed to deck/,
      
      /\[fetchDeckStatus\]/,
      /Updating deck with slides:/,
      /API Configuration:/,
      /Token expiring soon, refreshing/,
      
      /\[VirtualizedDeckGrid\]/,
      /Initially visible cards:/,
      
      /\[useDeckManagement\]/,
      /\[deckSyncService\]/,
      /Loading initial decks/,
      /Loaded decks:/,
      /Fetching decks from:/,
      /Raw response from API:/,
      /Number of decks received:/,
      /Formatted decks:/,
      
      /\[ProtectedRoute\]/,
      /Redirecting to login/,
      
      /consoleSuppressor\.ts:\d+/,
      
      // Also add patterns to catch the TiptapTextBlock and ShapeWithText font optimization logs
      /\[TiptapTextBlock\] Font optimization detected for component/,
      /\[ShapeWithText\] Font optimization detected for component/,
      /\[ChatMessage\] Font optimization completed/,
      
      // Suppress specific generation messages
      /🚀 Using streaming outline generation API/,
      /🚫 Skipping raw completion message/,
      /Dimension overflow detected at \d+px:/
    ];
    
    const shouldSuppress = aggressivePatterns.some(pattern => pattern.test(messageString)) || 
                          shouldSuppressMessage(args);
    
    if (!shouldSuppress) {
      originalMethods[method as keyof typeof originalMethods]?.apply(console, args);
    }
  };
  
  // Apply aggressive filtering
  console.log = (...args) => aggressiveFilter('log', args);
  console.warn = (...args) => aggressiveFilter('warn', args);
  console.error = (...args) => aggressiveFilter('error', args);
  console.info = (...args) => aggressiveFilter('info', args);
  console.debug = (...args) => aggressiveFilter('debug', args);
  
  // Suppress unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const rejectReason = event.reason?.toString() || '';
    const shouldSuppress = shouldSuppressMessage([rejectReason]);
    
    if (shouldSuppress) {
      event.preventDefault();
      return true;
    }
    
    return false;
  }, true);
}