#!/usr/bin/env node

/**
 * Debug script to check auto-select images preference state
 */

console.log('=== Auto-Select Images Preference Debug ===');
console.log('');
console.log('To debug the auto-select images preference:');
console.log('');
console.log('1. Open browser console');
console.log('2. Check current preference:');
console.log('   window.__slideGenerationPreferences');
console.log('');
console.log('3. During outline creation:');
console.log('   - Toggle should update the state');
console.log('   - Check console for: "[DeckList] Storing autoSelectImages preference"');
console.log('');
console.log('4. When deck loads:');
console.log('   - Check console for: "[SlideEditor] Restored autoSelectImages preference"');
console.log('');
console.log('5. When images are available:');
console.log('   - Toggle OFF: "[SlideImageUpdater] Auto-select images is disabled"');
console.log('   - Toggle ON: "[SlideImageUpdater] === APPLYING IMAGES ==="');
console.log('');
console.log('6. To manually test:');
console.log('   // Set preference');
console.log('   window.__slideGenerationPreferences = { autoSelectImages: false };');
console.log('');
console.log('   // Check if images would be applied');
console.log('   window.__applyImagesNow();');
console.log('');
console.log('7. Check deck data for stored preference:');
console.log('   const deckData = window.__getCurrentDeckData?.();');
console.log('   console.log(deckData?.data?.outline?.stylePreferences);');
console.log('');
