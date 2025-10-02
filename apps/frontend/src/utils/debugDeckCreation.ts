import { supabase } from '../integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';

export async function debugDeckCreation() {
  console.log('=== Debug Deck Creation ===');
  
  // 1. Check authentication
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    console.error('❌ Not authenticated:', userError);
    return;
  }
  console.log('✅ Authenticated as:', user.id, user.email);
  
  // 2. Test direct deck creation with user_id
  const testDeckId = uuidv4();
  console.log('\n📝 Testing deck creation with ID:', testDeckId);
  
  const testDeck = {
    uuid: testDeckId,
    name: 'Debug Test Deck',
    user_id: user.id,
    slides: [],
    version: uuidv4(),
    last_modified: new Date().toISOString()
  };
  
  console.log('Deck data:', testDeck);
  
  const { data, error } = await supabase
    .from('decks')
    .insert(testDeck)
    .select()
    .single();
    
  if (error) {
    console.error('❌ Failed to create deck:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Error details:', error.details);
    console.error('Error hint:', error.hint);
  } else {
    console.log('✅ Deck created successfully:', data);
    
    // Try to read it back
    const { data: readData, error: readError } = await supabase
      .from('decks')
      .select('*')
      .eq('uuid', testDeckId)
      .single();
      
    if (readError) {
      console.error('❌ Failed to read deck back:', readError);
    } else {
      console.log('✅ Deck read successfully:', readData);
    }
    
    // Clean up
    const { error: deleteError } = await supabase
      .from('decks')
      .delete()
      .eq('uuid', testDeckId);
      
    if (deleteError) {
      console.error('⚠️ Failed to clean up test deck:', deleteError);
    } else {
      console.log('🧹 Test deck cleaned up');
    }
  }
  
  // 3. Test upsert (what deckSyncService uses)
  console.log('\n📝 Testing deck upsert...');
  const upsertDeckId = uuidv4();
  const upsertDeck = {
    uuid: upsertDeckId,
    name: 'Debug Upsert Deck',
    user_id: user.id,
    slides: [],
    version: uuidv4(),
    last_modified: new Date().toISOString()
  };
  
  const { data: upsertData, error: upsertError } = await supabase
    .from('decks')
    .upsert(upsertDeck, { onConflict: 'uuid' });
    
  if (upsertError) {
    console.error('❌ Failed to upsert deck:', upsertError);
  } else {
    console.log('✅ Deck upserted successfully');
    
    // Clean up
    await supabase.from('decks').delete().eq('uuid', upsertDeckId);
  }
  
  console.log('\n=== Debug Complete ===');
}

// Export to window for easy access
if (typeof window !== 'undefined') {
  (window as any).debugDeckCreation = debugDeckCreation;
} 