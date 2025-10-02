// Debug script to monitor generation events and font optimization

console.log('=== Generation Events Debugger ===\n');

// Font optimization checks removed

// Monitor deck_generation_complete events
window.addEventListener('deck_generation_complete', (event) => {
  console.log('[DEBUG] deck_generation_complete event fired:', event);
});

// Monitor active generation
Object.defineProperty(window, '__activeGenerationDeckId', {
  get() { return this._activeGenId; },
  set(value) {
    console.log('[DEBUG] Active generation deck ID set to:', value);
    this._activeGenId = value;
  }
});

// Monitor SSE events in useSlideGeneration
const originalHandleGen = window.__handleSlideGeneration;
if (originalHandleGen) {
  window.__handleSlideGeneration = function(event) {
    console.log('[DEBUG] useSlideGeneration received event:', {
      type: event.type,
      hasSlide: !!event.slide,
      slideIndex: event.slide_index
    });
    return originalHandleGen.call(this, event);
  };
}

// Monitor GenerationCoordinator events
if (window.GenerationCoordinator) {
  const coordinator = window.GenerationCoordinator.getInstance();
  coordinator.addEventListener('generation:progress', (event) => {
    console.log('[DEBUG] GenerationCoordinator progress:', event.detail);
  });
}

// Test function to manually trigger font optimization
// Removed testFontOptimization command
console.log('\nWhat to watch for:');
console.log('1. Active generation deck ID being set when generation starts');
console.log('2. SSE events being received in useSlideGeneration');
console.log('3. deck_generation_complete event firing');
console.log('4. Font optimization starting after event');
