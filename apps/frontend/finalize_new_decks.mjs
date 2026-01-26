import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

const DECK_IDS = [
  'd16a9ffd-8ce5-46fe-9065-035c02749f0e',
  '45d632cb-90a7-48b3-bcee-eb7aa307c12a',
  '693a7ea6-cbfc-4450-9a86-debf41b2f0bc',
  '4ab78cad-9dc9-4bb0-966b-514bd20f9dbc',
  '1e3d90fc-f170-4d26-9dc9-7fad77537772',
  'fae9b7b9-39bb-48a2-9a89-fc00a4b4f381',
  '8cf7fbb2-78c5-490f-a631-46f21fa463b8',
  'b0915bfc-3bb4-4fb9-b0b5-1a339e25b783'
];

console.log('Finalizing new showcase decks...\n');

// Clear featured_decks
await supabase.from('featured_decks').delete().neq('uuid', '00000000-0000-0000-0000-000000000000');
console.log('✓ Cleared featured_decks\n');

// Add each deck
for (let i = 0; i < DECK_IDS.length; i++) {
  const uuid = DECK_IDS[i];

  // Mark as completed
  await supabase.from('decks').update({
    status: { phase: 'completed', state: 'completed', progress: 100 }
  }).eq('uuid', uuid);

  // Get deck data
  const { data: deck } = await supabase
    .from('decks')
    .select('name, slides')
    .eq('uuid', uuid)
    .single();

  // Insert into featured_decks
  const { error } = await supabase.from('featured_decks').insert({
    uuid,
    name: deck?.name || 'Unknown',
    slides: deck?.slides || [],
    slide_count: deck?.slides?.length || 0,
    display_order: i,
    is_active: true
  });

  const status = error ? `✗ ${error.message}` : `✓ ${deck?.slides?.length || 0} slides`;
  console.log(`${i}: ${deck?.name?.substring(0, 50)} - ${status}`);
}

// Verify
console.log('\n--- Verification ---');
const { data: final } = await supabase
  .from('featured_decks')
  .select('display_order, name, slide_count')
  .order('display_order');

final?.forEach(d => {
  console.log(`${d.display_order}: ${d.name?.substring(0, 50)} (${d.slide_count} slides)`);
});

console.log('\n✅ Done!');
