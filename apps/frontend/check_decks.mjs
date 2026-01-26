import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

// First, look at one of our featured decks in more detail
const { data: featuredDeck, error: e1 } = await supabase
  .from('decks')
  .select('*')
  .eq('uuid', 'a4737ca1-6c39-4d2f-9447-8c7c567d6efc')
  .single();

if (e1) {
  console.log('Error:', e1);
} else if (featuredDeck) {
  console.log('Featured Deck Details:');
  console.log('Name:', featuredDeck.name);
  console.log('Status:', featuredDeck.status);
  console.log('Created:', featuredDeck.created_at);
  console.log('\nFirst Slide Full Structure:');
  console.log(JSON.stringify(featuredDeck.slides?.[0], null, 2));
}
