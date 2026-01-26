import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

const ALL_DECKS = [
  { uuid: '1df8ef5b-8c5b-49e8-84cf-fc6ec00dda67', order: 0 }, // VC Pitch
  { uuid: 'a5d0297c-778c-448a-a205-b6e2a8f8fabb', order: 1 }, // Algebra
  { uuid: '073c88ca-ebf2-4f54-95f8-72be721073d1', order: 2 }, // Coffee
  { uuid: 'f398e791-415a-4880-8e44-409182b10f4b', order: 3 }, // Demo Day
  { uuid: '7a2a82f6-5e2c-40b4-b9b7-9c14ec6aeae9', order: 4 }, // Biology
  { uuid: '15b1332d-bc84-48cb-833f-9eae2c056cfa', order: 5 }, // French Rev
  { uuid: 'a8a4400e-eb08-4f59-a743-715a6103d97d', order: 6 }, // Client Proposal
  { uuid: '12cbc688-5be4-43ec-8009-9ebd975bf050', order: 7 }, // 2000s Internet
];

// Stuck decks that need status update
const STUCK_DECKS = [
  '15b1332d-bc84-48cb-833f-9eae2c056cfa',
  'a8a4400e-eb08-4f59-a743-715a6103d97d',
  '12cbc688-5be4-43ec-8009-9ebd975bf050'
];

console.log('1. Marking stuck decks as completed...');

for (const uuid of STUCK_DECKS) {
  const { error } = await supabase
    .from('decks')
    .update({
      status: {
        phase: 'completed',
        state: 'completed',
        message: 'Deck generation complete',
        progress: 100
      }
    })
    .eq('uuid', uuid);

  if (error) {
    console.log(`  ✗ Failed to update ${uuid}: ${error.message}`);
  } else {
    console.log(`  ✓ Marked ${uuid.substring(0,8)} as completed`);
  }
}

console.log('\n2. Clearing featured_decks...');
const { error: deleteError } = await supabase
  .from('featured_decks')
  .delete()
  .neq('uuid', '00000000-0000-0000-0000-000000000000');

if (deleteError) {
  console.log('  Warning:', deleteError.message);
} else {
  console.log('  ✓ Cleared');
}

console.log('\n3. Adding all decks to featured_decks...');

for (const deck of ALL_DECKS) {
  // Get deck info
  const { data: deckData } = await supabase
    .from('decks')
    .select('name, slides')
    .eq('uuid', deck.uuid)
    .single();

  const { error: insertError } = await supabase
    .from('featured_decks')
    .insert({
      uuid: deck.uuid,
      name: deckData?.name || 'Unknown',
      display_order: deck.order,
      is_active: true,
      slide_count: deckData?.slides?.length || 0
    });

  if (insertError) {
    console.log(`  ✗ ${deck.order}: ${insertError.message}`);
  } else {
    console.log(`  ✓ ${deck.order}: ${deckData?.name?.substring(0, 50)}`);
  }
}

console.log('\n4. Verifying featured_decks...');
const { data: featured } = await supabase
  .from('featured_decks')
  .select('display_order, name, slide_count')
  .order('display_order');

console.log('\nFeatured Decks:');
featured?.forEach(d => {
  console.log(`  ${d.display_order}: ${d.name} (${d.slide_count} slides)`);
});

console.log('\n✅ Done!');
