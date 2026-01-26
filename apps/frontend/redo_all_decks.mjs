import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

const API_KEY = 'ns_live_4h8RdLo6Ek0AHn8Wa1V0PEwdiRpR8Wn2';
const API_URL = 'https://nextslide-backend.onrender.com/api/v1/decks';

const SHOWCASE_DECKS = [
  {
    topic: "Pitch deck for VCs who've already seen 500 this month",
    slides: 10,
    style: "professional",
    additional_instructions: `Create a STUNNING investor pitch deck for a fictional AI startup "NeuraPilot" - AI copilots for enterprise workflows.

DESIGN: Dark sophisticated palette (#0A1628 navy, #3B82F6 electric blue, #FF6B35 orange accents). Montserrat headlines, Inter body. Animated particles, glowing effects, smooth transitions.

SLIDES:
1. HOOK - "What if AI could do the boring parts?" - animated particle brain
2. PROBLEM - "60% of work is repetitive" - animated counter
3. SOLUTION - NeuraPilot product mockups
4. HOW IT WORKS - 3-step visual flow with icons
5. MARKET - $47B TAM with animated charts
6. TRACTION - Dashboard: 150+ customers, $2.3M ARR, 340% growth
7. BUSINESS MODEL - SaaS pricing tiers table
8. COMPETITIVE - 2x2 positioning matrix
9. TEAM - Professional grid with credentials
10. THE ASK - $12M Series A, use of funds

Make every slide visually STUNNING with interactive elements.`
  },
  {
    topic: "Algebra for kids who ask 'when will I use this'",
    slides: 10,
    style: "educational",
    additional_instructions: `Create an ENGAGING educational presentation making algebra exciting for middle schoolers.

DESIGN: Bright energetic colors (#8B5CF6 purple, #14B8A6 teal, #F472B6 coral, #FBBF24 yellow). Poppins headlines, Nunito body. Gamification elements, progress bars, achievement badges.

SLIDES:
1. OPENING - "Why should I care?" with relatable teen imagery/memes
2. VIDEO GAMES - "Damage calculation: Attack × Multiplier" with game UI
3. SHOPPING - "30% off that $80 hoodie" with store visuals
4. SPORTS - "Steph Curry's 43% from 3" with basketball graphics
5. SOCIAL MEDIA - "Follower growth formula" with Instagram-style UI
6. COOKING - "Double a recipe" with food imagery
7. ROAD TRIPS - "Distance ÷ Speed = Time" with map graphics
8. THE PATTERN - Show how all examples use same algebraic thinking
9. MINI QUIZ - Interactive 3-question review with fun animations
10. CHALLENGE - "Create your own real-life algebra problem"

Make it colorful, fun, prove algebra is EVERYWHERE in daily life.`
  },
  {
    topic: "How coffee conquered the world - From Ethiopian highlands to your morning cup",
    slides: 10,
    style: "storytelling",
    additional_instructions: `Create a BEAUTIFUL cinematic presentation about coffee's global history.

DESIGN: Rich warm palette (#78350F coffee brown, #FEF3C7 cream, #166534 green, #881337 burgundy). Playfair Display headlines, Source Sans Pro body. Stunning photography, animated maps, timelines.

SLIDES:
1. OPENING - "2.25 billion cups daily" - steaming cup with counter animation
2. ETHIOPIAN ORIGIN - Legend of Kaldi, Ethiopian landscapes, ~850 AD
3. ARABIAN NIGHTS - Yemen coffee houses, trade routes map, 15th century
4. EUROPEAN CONQUEST - Paris cafés, London coffee houses, Enlightenment
5. COLONIAL EXPANSION - Dutch plantations, Brazilian boom, global trade viz
6. INDUSTRIAL REVOLUTION - Espresso invention, instant coffee, Maxwell House
7. MODERN CULTURE - Starbucks, third wave, specialty roasters
8. THE COFFEE BELT - World map of growing regions, climate, flavor profiles
9. ECONOMIC IMPACT - $465B industry, 125M workers, fair trade
10. YOUR CUP - Journey visualization: farm → roasting → brewing → you

Use beautiful transitions, map animations, historical imagery.`
  },
  {
    topic: "Demo day pitch that actually fits in 3 minutes",
    slides: 8,
    style: "minimal",
    additional_instructions: `Create a PUNCHY demo day pitch for "FlowStack" - workflow automation platform. Every second counts.

DESIGN: Clean minimal with BOLD statements. High-contrast: pure black, white, electric violet (#7C3AED) accent. Space Grotesk headlines. ONE big idea per slide, max 10 words. Dramatic number reveals.

SLIDES (8 slides for 3 min = ~20 sec each):
1. HOOK - "Manual workflows cost $4.5T yearly" - BIG animated number
2. ONE-LINER - "FlowStack: Automate any workflow in 5 clicks" - product GIF
3. TRACTION - Single massive metric: "347 companies, $1.2M ARR, 23% MoM"
4. DEMO - Clean product screenshot showing the magic
5. WHY NOW - "AI + No-code = Perfect timing" with trend visual
6. TEAM - 3 founders: "Ex-Google, Ex-Stripe, Ex-Figma"
7. MARKET - "$78B TAM" with expansion visual
8. THE ASK - "$5M Seed → $50M ARR in 24 months"

IMPACT over information. Each slide immediately understandable.`
  },
  {
    topic: "Cellular Respiration: From Glucose to ATP",
    slides: 12,
    style: "scientific",
    additional_instructions: `Create a COMPREHENSIVE biology presentation for AP/college students.

DESIGN: Scientific palette (#1E3A5F deep blue, #6B21A8 mitochondrial purple, #F59E0B ATP orange, #22C55E green). Roboto Slab headlines, Roboto body. Detailed diagrams, molecular structures, process animations.

SLIDES:
1. OVERVIEW - "Life Runs on ATP" - mitochondria hero image
2. BIG PICTURE - C6H12O6 + 6O2 → 6CO2 + 6H2O + 38 ATP (animated equation)
3. GLYCOLYSIS INTRO - "Splitting Sugar" - glucose → 2 pyruvate
4. GLYCOLYSIS DETAIL - 10-step breakdown, enzymes, NET: 2 ATP, 2 NADH
5. PYRUVATE PROCESSING - Transition to mitochondria, acetyl-CoA
6. KREBS INTRO - "Citric Acid Cycle" - circular pathway visualization
7. KREBS DETAIL - Key molecules, 2 ATP, 6 NADH, 2 FADH2
8. ETC INTRO - "The ATP Factory" - inner membrane diagram
9. ETC MECHANISM - Complexes I-IV, proton gradient, chemiosmosis
10. ATP SYNTHASE - "World's Smallest Motor" - rotary mechanism
11. FINAL COUNT - Energy balance: 38 ATP total, efficiency comparison
12. CONNECTIONS - Links to photosynthesis, exercise, metabolism

Include detailed diagrams, molecular animations, make complex processes clear.`
  },
  {
    topic: "The French Revolution: From Monarchy to Republic",
    slides: 12,
    style: "historical",
    additional_instructions: `Create a DRAMATIC visual history presentation for high school/college students.

DESIGN: Revolutionary palette (#991B1B deep red, #1E40AF royal blue, #F59E0B gold, #FEF9E7 parchment). Libre Baskerville headlines, Crimson Text body. Historical paintings, timeline visualizations, Paris maps.

SLIDES:
1. OPENING - "July 14, 1789: The Day Everything Changed" - Bastille painting
2. OLD REGIME - Three Estates visualization, wealth inequality, causes
3. FINANCIAL CRISIS - Debt spiral, American Revolution cost, bread prices
4. ESTATES GENERAL - May 1789, voting problem, Third Estate demands
5. TENNIS COURT OATH - June 20, 1789, National Assembly birth
6. BASTILLE - The fortress, the storming, symbolism, eyewitness accounts
7. DECLARATION - "Men are born free and equal" - document visualization
8. KEY FIGURES - Louis XVI, Marie Antoinette, Robespierre, Danton portraits
9. THE TERROR - 1793-1794, executions counter, Reign of Terror timeline
10. NAPOLEON RISES - Military hero, coup of 18 Brumaire, empire begins
11. LASTING IMPACT - Revolutionary ideas spread, modern democracy foundations
12. LEGACY - "Liberty, Equality, Fraternity" - French values today

Use dramatic imagery, historical quotes, clear timelines. Make history alive.`
  },
  {
    topic: "Enterprise Solutions Client Proposal - Digital Transformation Partnership",
    slides: 10,
    style: "corporate",
    additional_instructions: `Create a POLISHED client proposal for "Meridian Partners" consulting firm pitching to Fortune 500.

DESIGN: Sophisticated corporate (#0F172A navy, #94A3B8 silver, #D97706 gold accent). Proxima Nova typography. Professional charts, premium whitespace, realistic mockups, ROI calculations.

SLIDES:
1. COVER - "Digital Excellence: Your Transformation Journey" - Meridian logo
2. EXECUTIVE SUMMARY - 3 points: Challenge, Solution, Expected ROI (4x)
3. YOUR CHALLENGES - Legacy systems, siloed data, customer experience gaps
4. OUR APPROACH - "Meridian Method" proprietary framework visualization
5. SOLUTION - Phase 1-3 roadmap with timeline, milestones
6. DELIVERABLES - Assessment report, implementation plan, change management
7. INVESTMENT & ROI - Pricing table, 3-year TCO, savings projections
8. WHY MERIDIAN - Case study: "Similar client achieved 340% ROI"
9. TEAM - Dedicated project team: Partner, Director, Senior Consultants
10. NEXT STEPS - Action items, timeline, contact info, CTA

Make it feel like a $500K+ proposal. Professional, confident, data-driven.`
  },
  {
    topic: "Interactive Presentation About 2000s Internet Culture",
    slides: 10,
    style: "nostalgic",
    additional_instructions: `Create a FUN nostalgic presentation about early 2000s internet. Make millennials smile, teach Gen Z.

DESIGN: Retro web palette (#245EDC Windows XP blue, #FFD700 AOL yellow, #FF69B4 hot pink, #32CD32 lime). Mix pixel fonts with early 2000s web typography. Recreate old UI elements, memes, "Under Construction" aesthetic.

SLIDES:
1. OPENING - "Welcome to the Internet (Dial-Up Required)" - mock connection screen
2. AIM & MESSAGING - Buddy list UI, away messages, door sounds, screennames
3. MYSPACE ERA - Top 8 drama, profile customization, HTML hacking, emo bands
4. EARLY YOUTUBE - "Me at the zoo", Star Wars Kid, Numa Numa, Charlie Bit My Finger
5. FLASH GAMES - Newgrounds, Miniclip, Neopets, AddictingGames collage
6. EARLY MEMES - All Your Base, Dancing Baby, Hamster Dance, O RLY owl
7. SOCIAL BEGINNINGS - Facebook wall (pre-timeline), early Twitter, Digg
8. LIMEWIRE ERA - "Downloading... Virus" joke, music culture (educational)
9. WEB 1.0 DESIGN - Geocities aesthetic, visitor counters, guestbooks, "Best in IE"
10. LEGACY - "These weird experiments created today's internet" - modern connections

Make it interactive, funny, packed with nostalgic references and Easter eggs.`
  }
];

async function createDeck(config) {
  console.log(`Creating: "${config.topic.substring(0, 50)}..."`);
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
    body: JSON.stringify(config)
  });
  const data = await response.json();
  if (response.ok) {
    console.log(`  ✓ ${data.deck_id}`);
    return data.deck_id;
  } else {
    console.log(`  ✗ ${JSON.stringify(data)}`);
    return null;
  }
}

async function waitForDeck(uuid) {
  const maxWait = 10 * 60 * 1000; // 10 minutes
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    // Check database status directly (more reliable)
    const { data } = await supabase
      .from('decks')
      .select('status, slides')
      .eq('uuid', uuid)
      .single();

    if (data?.slides?.length > 0) {
      const status = data.status;
      // Check if all slides are generated
      if (status?.message?.includes(`Generated ${status?.totalSlides} of ${status?.totalSlides}`)) {
        return true;
      }
      // Or if status is completed
      if (status?.state === 'completed' || status?.phase === 'completed') {
        return true;
      }
    }

    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 5000));
  }
  return false;
}

async function main() {
  console.log('='.repeat(60));
  console.log('RECREATING ALL SHOWCASE DECKS');
  console.log('='.repeat(60));

  // Step 1: Clear featured_decks
  console.log('\n1. Clearing featured_decks...');
  await supabase.from('featured_decks').delete().neq('uuid', '00000000-0000-0000-0000-000000000000');
  console.log('   Done');

  // Step 2: Create all decks
  console.log('\n2. Creating decks via API...');
  const deckIds = [];
  for (const config of SHOWCASE_DECKS) {
    const id = await createDeck(config);
    if (id) deckIds.push(id);
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log(`\nCreated ${deckIds.length}/${SHOWCASE_DECKS.length} decks`);

  // Step 3: Wait for completion
  console.log('\n3. Waiting for generation (this takes several minutes)...');
  for (let i = 0; i < deckIds.length; i++) {
    process.stdout.write(`   [${i+1}/${deckIds.length}] ${deckIds[i].substring(0,8)}`);
    const success = await waitForDeck(deckIds[i]);
    console.log(success ? ' ✓' : ' ✗ (timeout)');
  }

  // Step 4: Mark as completed and add to featured_decks
  console.log('\n4. Adding to featured_decks...');
  for (let i = 0; i < deckIds.length; i++) {
    const uuid = deckIds[i];

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

    // Insert into featured_decks WITH slides
    const { error } = await supabase.from('featured_decks').insert({
      uuid,
      name: deck?.name || SHOWCASE_DECKS[i].topic,
      slides: deck?.slides || [],
      slide_count: deck?.slides?.length || 0,
      display_order: i,
      is_active: true
    });

    console.log(`   ${i}: ${error ? '✗ ' + error.message : '✓ ' + (deck?.name?.substring(0, 40) || 'Unknown')}`);
  }

  // Verify
  console.log('\n5. Verifying...');
  const { data: final } = await supabase
    .from('featured_decks')
    .select('display_order, name, slide_count')
    .order('display_order');

  console.log('\nFinal featured_decks:');
  final?.forEach(d => console.log(`   ${d.display_order}: ${d.name?.substring(0,45)} (${d.slide_count} slides)`));

  console.log('\n✅ Done!');
}

main().catch(console.error);
