// Simulate progressive slide generation for testing

console.log('Simulating Progressive Slide Generation\n');

// Check if we're on the editor page with a deck
const deckStore = window.useDeckStore?.getState?.();
if (!deckStore || !deckStore.deckData?.uuid) {
  console.error('❌ Please run this on the deck editor page with an active deck');
  return;
}

const deckId = deckStore.deckData.uuid;
console.log('Using deck:', deckId);

// Create test slides with pending status
const testSlides = [
  { title: 'Introduction', delay: 1000 },
  { title: 'Problem Statement', delay: 2000 },
  { title: 'Solution Overview', delay: 3000 },
  { title: 'Key Features', delay: 4000 },
  { title: 'Implementation', delay: 5000 },
  { title: 'Results', delay: 6000 },
  { title: 'Next Steps', delay: 7000 },
  { title: 'Thank You', delay: 8000 }
];

// Step 1: Create slides with pending status
console.log('Step 1: Creating slides with pending status...');
const pendingSlides = testSlides.map((slide, index) => ({
  id: `test-slide-${Date.now()}-${index}`,
  title: slide.title,
  components: [],
  order: index,
  deckId: deckId,
  status: 'pending'
}));

// Update deck with pending slides
window.useDeckStore.getState().updateDeckData({
  ...deckStore.deckData,
  slides: pendingSlides
});

console.log('✅ Created', pendingSlides.length, 'pending slides');

// Step 2: Simulate progressive completion
console.log('\nStep 2: Simulating progressive slide completion...');

testSlides.forEach((testSlide, index) => {
  setTimeout(() => {
    console.log(`\n[${index + 1}/${testSlides.length}] Completing slide: ${testSlide.title}`);
    
    // Get current slides
    const currentDeckData = window.useDeckStore.getState().deckData;
    const currentSlides = [...currentDeckData.slides];
    
    // Update this slide to completed with sample content
    currentSlides[index] = {
      ...currentSlides[index],
      status: 'completed',
      components: [
        {
          id: `comp-${Date.now()}`,
          type: 'Text',
          content: `<h1>${testSlide.title}</h1>`,
          position: { x: 100, y: 100 },
          size: { width: 720, height: 100 },
          style: {
            fontSize: 48,
            fontWeight: 'bold',
            color: '#333333'
          }
        }
      ]
    };
    
    // Update deck store
    window.useDeckStore.getState().updateDeckData({
      ...currentDeckData,
      slides: currentSlides
    });
    
    // Also dispatch DOM event for tracking
    window.dispatchEvent(new CustomEvent('slide_completed', {
      detail: {
        slide_index: index,
        slide_id: currentSlides[index].id,
        slide_data: currentSlides[index]
      }
    }));
    
    console.log(`✅ Slide ${index + 1} completed`);
    
    // Update deck status
    window.setDeckStatus?.({
      state: 'generating',
      currentSlide: index + 1,
      totalSlides: testSlides.length,
      progress: Math.round(((index + 1) / testSlides.length) * 100),
      message: `Generated slide ${index + 1} of ${testSlides.length}`
    });
    
  }, testSlide.delay);
});

// Step 3: Complete generation after all slides
setTimeout(() => {
  console.log('\n🎉 Deck generation complete!');
  
  window.setDeckStatus?.({
    state: 'completed',
    currentSlide: testSlides.length,
    totalSlides: testSlides.length,
    progress: 100,
    message: 'Deck generation completed!'
  });
  
  window.dispatchEvent(new CustomEvent('deck_complete', {
    detail: { deck_id: deckId }
  }));
  
}, testSlides[testSlides.length - 1].delay + 1000);

console.log('\n📝 Watch the slides appear progressively over the next 8 seconds...');
