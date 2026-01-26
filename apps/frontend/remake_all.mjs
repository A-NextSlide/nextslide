import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

const API_KEY = 'ns_live_4h8RdLo6Ek0AHn8Wa1V0PEwdiRpR8Wn2';
const API_URL = 'https://nextslide-backend.onrender.com/api/v1/decks';

const DECKS = [
  {
    topic: "Pitch deck for VCs who've already seen 500 this month",
    slides: 10,
    additional_instructions: `Create a stunning VC pitch deck for "NeuraPilot" - AI copilots for enterprise.

STYLE: Dark theme (#0A1628), electric blue (#3B82F6), orange accents (#FF6B35). Montserrat bold headlines, Inter body. Modern, sleek, animated elements.

SLIDES: 1) Hook with particle animation 2) Problem stats 3) Solution mockups 4) How it works 5) $47B market 6) Traction dashboard 7) Pricing tiers 8) Competitive matrix 9) Team grid 10) $12M ask`
  },
  {
    topic: "Algebra for kids who ask 'when will I use this'",
    slides: 10,
    additional_instructions: `Fun educational deck making algebra exciting for middle schoolers.

STYLE: Bright colors (#8B5CF6 purple, #14B8A6 teal, #FBBF24 yellow). Poppins headlines, playful. Gamification, badges, progress bars.

SLIDES: 1) Why care? memes 2) Video game damage calc 3) Shopping discounts 4) Sports stats 5) Social media growth 6) Cooking recipes 7) Road trip math 8) Pattern reveal 9) Quiz 10) Challenge`
  },
  {
    topic: "How coffee conquered the world",
    slides: 10,
    additional_instructions: `Cinematic documentary-style presentation on coffee history.

STYLE: Warm palette (#78350F brown, #FEF3C7 cream, #166534 green). Playfair Display headlines, elegant. Beautiful photography, animated maps.

SLIDES: 1) 2.25B cups daily 2) Ethiopian origin 3) Arabian trade 4) European cafes 5) Colonial expansion 6) Industrial era 7) Modern culture 8) Coffee belt map 9) Economic impact 10) Your cup journey`
  },
  {
    topic: "Demo day pitch that fits in 3 minutes",
    slides: 8,
    additional_instructions: `Punchy demo day pitch for "FlowStack" workflow automation.

STYLE: Minimal black/white with violet (#7C3AED) accent. Space Grotesk bold. ONE big idea per slide, max 10 words. Dramatic reveals.

SLIDES: 1) $4.5T problem 2) One-liner + product 3) Traction metric 4) Demo screenshot 5) Why now 6) Team 7) Market 8) The ask`
  },
  {
    topic: "Cellular Respiration: From Glucose to ATP",
    slides: 12,
    additional_instructions: `Comprehensive AP Biology presentation.

STYLE: Scientific (#1E3A5F blue, #6B21A8 purple, #F59E0B orange). Roboto fonts. Detailed diagrams, molecular structures, process animations.

SLIDES: 1) ATP overview 2) Equation 3-4) Glycolysis 5) Pyruvate 6-7) Krebs cycle 8-9) Electron transport 10) ATP synthase 11) Energy count 12) Connections`
  },
  {
    topic: "The French Revolution: From Monarchy to Republic",
    slides: 12,
    additional_instructions: `Dramatic visual history for students.

STYLE: Revolutionary (#991B1B red, #1E40AF blue, #F59E0B gold). Libre Baskerville serif. Historical paintings, timelines, maps.

SLIDES: 1) July 14 1789 2) Old Regime 3) Financial crisis 4) Estates General 5) Tennis Court Oath 6) Bastille 7) Declaration 8) Key figures 9) The Terror 10) Napoleon 11) Impact 12) Legacy`
  },
  {
    topic: "Enterprise Client Proposal - Digital Transformation",
    slides: 10,
    additional_instructions: `Polished consulting proposal for "Meridian Partners".

STYLE: Corporate (#0F172A navy, #94A3B8 silver, #D97706 gold). Clean Proxima Nova. Professional charts, premium whitespace.

SLIDES: 1) Cover 2) Executive summary 3) Challenges 4) Approach 5) Solution roadmap 6) Deliverables 7) ROI 8) Case study 9) Team 10) Next steps`
  },
  {
    topic: "2000s Internet Culture - From Dial-Up to YouTube",
    slides: 10,
    additional_instructions: `Fun nostalgic presentation about early internet.

STYLE: Retro web (#245EDC XP blue, #FFD700 AOL yellow, #FF69B4 hot pink). Pixel fonts mixed with 2000s web style. Recreate old UIs.

SLIDES: 1) Dial-up connection 2) AIM buddy lists 3) MySpace 4) Early YouTube 5) Flash games 6) Early memes 7) Social beginnings 8) Limewire 9) Web 1.0 design 10) Legacy`
  }
];

async function createDeck(config) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
    body: JSON.stringify(config)
  });
  const data = await response.json();
  return response.ok ? data.deck_id : null;
}

async function waitForSlides(uuid, expectedSlides) {
  const maxWait = 8 * 60 * 1000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const { data } = await supabase
      .from('decks')
      .select('slides')
      .eq('uuid', uuid)
      .single();

    const completed = data?.slides?.filter(s => s.components?.length > 0).length || 0;
    process.stdout.write(`\r  ${completed}/${expectedSlides} slides`);

    if (completed >= expectedSlides) {
      return true;
    }

    await new Promise(r => setTimeout(r, 5000));
  }
  return false;
}

async function main() {
  console.log('REMAKING ALL SHOWCASE DECKS\n');

  // Clear
  await supabase.from('featured_decks').delete().neq('uuid', '00000000-0000-0000-0000-000000000000');

  const results = [];

  for (let i = 0; i < DECKS.length; i++) {
    const config = DECKS[i];
    console.log(`\n[${i + 1}/8] ${config.topic.substring(0, 45)}...`);

    const uuid = await createDeck(config);
    if (!uuid) {
      console.log('  ✗ Failed to create');
      continue;
    }
    console.log(`  Created: ${uuid}`);

    const success = await waitForSlides(uuid, config.slides);
    console.log(success ? ' ✓' : ' (partial)');

    results.push({ uuid, order: i, expected: config.slides });

    // Small delay between decks
    await new Promise(r => setTimeout(r, 2000));
  }

  // Add to featured_decks
  console.log('\n\nAdding to featured_decks...');

  for (const r of results) {
    await supabase.from('decks').update({
      status: { phase: 'completed', state: 'completed', progress: 100 }
    }).eq('uuid', r.uuid);

    const { data: deck } = await supabase
      .from('decks')
      .select('name, slides')
      .eq('uuid', r.uuid)
      .single();

    const completed = deck?.slides?.filter(s => s.components?.length > 0).length || 0;

    await supabase.from('featured_decks').insert({
      uuid: r.uuid,
      name: deck?.name,
      slides: deck?.slides,
      slide_count: deck?.slides?.length || 0,
      display_order: r.order,
      is_active: true
    });

    console.log(`${r.order}: ${deck?.name?.substring(0, 40)} - ${completed}/${r.expected} slides`);
  }

  console.log('\n✅ Done!');
}

main().catch(console.error);
