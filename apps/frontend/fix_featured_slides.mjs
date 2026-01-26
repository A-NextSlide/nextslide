import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

console.log('Copying slides from decks table to featured_decks...\n');

// Get all featured decks
const { data: featured, error: fetchError } = await supabase
  .from('featured_decks')
  .select('id, uuid, name');

if (fetchError) {
  console.error('Error:', fetchError);
  process.exit(1);
}

for (const feat of featured) {
  // Get slides from decks table
  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .select('slides')
    .eq('uuid', feat.uuid)
    .single();

  if (deckError || !deck) {
    console.log(`✗ ${feat.name.substring(0, 40)}: Could not find deck`);
    continue;
  }

  // Update featured_decks with slides
  const { error: updateError } = await supabase
    .from('featured_decks')
    .update({
      slides: deck.slides,
      slide_count: deck.slides?.length || 0
    })
    .eq('id', feat.id);

  if (updateError) {
    console.log(`✗ ${feat.name.substring(0, 40)}: ${updateError.message}`);
  } else {
    console.log(`✓ ${feat.name.substring(0, 40)} (${deck.slides?.length} slides)`);
  }
}

console.log('\nDone! Verifying...');

// Verify
const { data: verify } = await supabase
  .from('featured_decks')
  .select('display_order, name, slide_count, slides')
  .order('display_order');

verify?.forEach(d => {
  const hasSlides = d.slides && d.slides.length > 0;
  console.log(`${d.display_order}: ${d.name.substring(0, 45)} - ${hasSlides ? '✓' : '✗'} (${d.slide_count} slides)`);
});
