/**
 * Test utility for deck loading
 * Run in browser console: await window.testDeckLoading()
 */

import { deckSyncService } from '@/lib/deckSyncService';
import { authService } from '@/services/authService';

export async function testDeckLoading() {
  console.log('🧪 Testing Deck Loading...');
  
  // Check authentication
  const token = authService.getAuthToken();
  console.log('✅ Auth token:', token ? `${token.substring(0, 20)}...` : 'None');
  
  if (!token) {
    console.error('❌ No authentication token found. Please log in first.');
    return;
  }
  
  try {
    // Test 1: List decks
    console.log('\n📋 Testing getAllDecks()...');
    const result = await deckSyncService.getAllDecks(5, 0);
    console.log('✅ Decks loaded:', result.decks.length);
    console.log('📊 Total count:', result.count);
    console.log('➡️ Has more:', result.has_more);
    
    if (result.decks.length > 0) {
      console.log('\n🎯 First deck:', {
        uuid: result.decks[0].uuid,
        name: result.decks[0].name,
        slides: result.decks[0].slides?.length || 0
      });
      
      // Test 2: Load specific deck
      const deckId = result.decks[0].uuid;
      console.log(`\n📖 Testing getDeck('${deckId}')...`);
      const deck = await deckSyncService.getDeck(deckId);
      
      if (deck) {
        console.log('✅ Deck loaded successfully:', {
          uuid: deck.uuid,
          name: deck.name,
          slides: deck.slides.length,
          created: deck.created_at,
          updated: deck.updated_at
        });
      } else {
        console.error('❌ Failed to load deck');
      }
    } else {
      console.log('ℹ️ No decks found to test getDeck()');
    }
    
    console.log('\n✅ All tests completed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Expose to window for testing
if (import.meta.env.DEV) {
  (window as any).testDeckLoading = testDeckLoading;
}