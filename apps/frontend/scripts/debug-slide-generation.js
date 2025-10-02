// Debug script for slide generation - paste this in browser console

console.log('=== Starting Slide Generation Debug ===\n');

// Track all events
const eventLog = [];

// Override fetch to log SSE connections
const originalFetch = window.fetch;
window.fetch = function(...args) {
  const [url] = args;
  if (url && (url.includes('compose-deck-stream') || url.includes('generate-outline-stream'))) {
    console.log('[DEBUG] SSE Connection:', url);
  }
  return originalFetch.apply(this, args);
};

// Track SSE events in SlideGenerationService
if (window.SlideGenerationService) {
  const original = window.SlideGenerationService.prototype.handleStreamEvent;
  window.SlideGenerationService.prototype.handleStreamEvent = function(event, onProgress) {
    console.log('[DEBUG] SSE Event Received:', event);
    eventLog.push({ type: 'sse', event, time: new Date().toISOString() });
    return original.call(this, event, onProgress);
  };
}

// Track deck store updates
if (window.useDeckStore) {
  window.useDeckStore.subscribe(
    state => state.deckData.slides,
    (slides) => {
      console.log('[DEBUG] Deck Store Updated:', {
        slideCount: slides.length,
        statuses: slides.map(s => s.status),
        hasComponents: slides.map(s => s.components?.length || 0)
      });
      eventLog.push({ 
        type: 'store_update', 
        slides: slides.length, 
        time: new Date().toISOString() 
      });
    }
  );
}

// Track Supabase realtime events
const originalOn = window.supabase?.channel?.prototype?.on;
if (originalOn) {
  window.supabase.channel.prototype.on = function(event, ...args) {
    const result = originalOn.call(this, event, ...args);
    if (event === 'postgres_changes') {
      const originalCallback = args[1];
      args[1] = function(payload) {
        if (payload.table === 'decks' && payload.new?.slides) {
          console.log('[DEBUG] Realtime Update:', {
            hasSlides: !!payload.new.slides,
            slideCount: payload.new.slides?.length
          });
          eventLog.push({ 
            type: 'realtime', 
            slideCount: payload.new.slides?.length, 
            time: new Date().toISOString() 
          });
        }
        return originalCallback.call(this, payload);
      };
    }
    return result;
  };
}

// Hook into handleProgress in useSlideGeneration
let progressInterceptor = null;
Object.defineProperty(window, '__handleSlideGeneration', {
  get() { return progressInterceptor; },
  set(value) {
    progressInterceptor = function(event) {
      console.log('[DEBUG] Progress Event:', {
        type: event.type,
        stage: event.stage,
        hasSlide: !!(event.slide || event.slide_data),
        slide_index: event.slide_index
      });
      
      if (event.type === 'slide_completed' || event.type === 'slide_generated') {
        console.log('[DEBUG] SLIDE COMPLETED EVENT DETAILS:', event);
      }
      
      eventLog.push({ 
        type: 'progress', 
        eventType: event.type, 
        time: new Date().toISOString() 
      });
      
      return value.call(this, event);
    };
  }
});

// Helper functions
window.debugSlideGeneration = {
  showEventLog: () => {
    console.table(eventLog);
  },
  
  clearLog: () => {
    eventLog.length = 0;
    console.log('Event log cleared');
  },
  
  checkStatus: () => {
    const store = window.useDeckStore?.getState();
    const deckData = store?.deckData;
    
    console.log('Current Status:', {
      slides: deckData?.slides?.length || 0,
      statuses: deckData?.slides?.map(s => s.status) || [],
      hasComponents: deckData?.slides?.map(s => s.components?.length || 0) || [],
      deckStatus: store?.deckStatus,
      isGenerating: store?.isGenerating
    });
  },
  
  simulateSlideCompleted: (index = 0) => {
    const event = {
      type: 'slide_completed',
      slide_index: index,
      slide_id: `test-slide-${index}`,
      slide: {
        components: [{
          id: `comp-${Date.now()}`,
          type: 'Text',
          content: `<h1>Test Slide ${index + 1}</h1>`
        }],
        theme: { name: 'test' },
        palette: { primary: '#000' }
      }
    };
    
    if (window.__handleSlideGeneration) {
      window.__handleSlideGeneration(event);
      console.log('Simulated slide_completed event sent');
    } else {
      console.error('Handler not found - make sure generation is active');
    }
  }
};

console.log('\n=== Debug Commands ===');
console.log('debugSlideGeneration.showEventLog() - Show all captured events');
console.log('debugSlideGeneration.clearLog() - Clear event log');
console.log('debugSlideGeneration.checkStatus() - Check current deck status');
console.log('debugSlideGeneration.simulateSlideCompleted(0) - Simulate a slide completion');
console.log('\n=== What to Look For ===');
console.log('1. SSE Events with type: slide_completed');
console.log('2. Store updates after each slide_completed');
console.log('3. Whether Realtime or SSE is providing slide data');
console.log('4. Check if events have slide data with components');
