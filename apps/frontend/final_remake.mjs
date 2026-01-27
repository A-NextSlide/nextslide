import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

const API_KEY = 'ns_live_4h8RdLo6Ek0AHn8Wa1V0PEwdiRpR8Wn2';
const API_URL = 'https://nextslide-backend.onrender.com/api/v1/decks';

// Simplified prompts - less text, more direct
const DECKS = [
  { topic: "VC pitch deck for AI startup NeuraPilot", slides: 8 },
  { topic: "Fun algebra lesson for middle school students", slides: 8 },
  { topic: "The history of coffee around the world", slides: 8 },
  { topic: "3-minute demo day pitch for FlowStack", slides: 6 },
  { topic: "AP Biology: Cellular Respiration and ATP", slides: 10 },
  { topic: "The French Revolution visual history", slides: 10 },
  { topic: "Corporate consulting proposal template", slides: 8 },
  { topic: "2000s internet culture and nostalgia", slides: 8 }
];

async function createAndWait(config, index) {
  console.log(`\n[${index + 1}/8] Creating: ${config.topic}`);

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
    body: JSON.stringify(config)
  });

  if (!response.ok) {
    console.log('  ✗ API error');
    return null;
  }

  const { deck_id } = await response.json();
  console.log(`  Created: ${deck_id}`);

  // Wait up to 5 minutes
  const maxWait = 5 * 60 * 1000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const { data } = await supabase
      .from('decks')
      .select('name, slides')
      .eq('uuid', deck_id)
      .single();

    const completed = data?.slides?.filter(s => s.components?.length > 0).length || 0;
    process.stdout.write(`\r  ${completed}/${config.slides} slides`);

    // Accept if we have at least 60% of slides
    if (completed >= config.slides * 0.6) {
      console.log(' ✓');
      return { uuid: deck_id, name: data?.name, slides: data?.slides, order: index };
    }

    await new Promise(r => setTimeout(r, 5000));
  }

  // Timeout - use what we have
  const { data } = await supabase
    .from('decks')
    .select('name, slides')
    .eq('uuid', deck_id)
    .single();

  const completed = data?.slides?.filter(s => s.components?.length > 0).length || 0;
  console.log(` (${completed}/${config.slides})`);

  if (completed >= 3) {
    return { uuid: deck_id, name: data?.name, slides: data?.slides, order: index };
  }

  return null;
}

async function main() {
  console.log('FINAL REMAKE - Simplified prompts\n');

  // Clear featured_decks
  await supabase.from('featured_decks').delete().neq('uuid', '00000000-0000-0000-0000-000000000000');

  const results = [];

  for (let i = 0; i < DECKS.length; i++) {
    const result = await createAndWait(DECKS[i], i);
    if (result) results.push(result);
    await new Promise(r => setTimeout(r, 3000)); // Pause between decks
  }

  // Add to featured_decks
  console.log('\n\nAdding to featured_decks...');

  for (const r of results) {
    const completed = r.slides?.filter(s => s.components?.length > 0).length || 0;

    await supabase.from('featured_decks').insert({
      uuid: r.uuid,
      name: r.name,
      slides: r.slides,
      slide_count: r.slides?.length || 0,
      display_order: r.order,
      is_active: true
    });

    console.log(`${r.order}: ${r.name?.substring(0, 40)} (${completed} slides)`);
  }

  console.log(`\n✅ Added ${results.length}/8 decks`);
}

main().catch(console.error);
