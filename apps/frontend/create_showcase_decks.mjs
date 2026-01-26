import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

const API_KEY = 'ns_live_4h8RdLo6Ek0AHn8Wa1V0PEwdiRpR8Wn2';
const API_URL = 'https://nextslide-backend.onrender.com/api/v1/decks';

// Define showcase decks with rich, detailed instructions
const SHOWCASE_DECKS = [
  {
    topic: "Pitch deck for VCs who've already seen 500 this month",
    slides: 10,
    style: "professional",
    additional_instructions: `Create a STUNNING, memorable investor pitch deck that stands out from the crowd. This is for a fictional AI startup called "NeuraPilot" that provides AI copilots for enterprise workflows.

CRITICAL DESIGN REQUIREMENTS:
- Use a DARK, sophisticated color palette (deep navy #0A1628, electric blue accents #3B82F6, vibrant orange highlights #FF6B35)
- Modern sans-serif typography: Montserrat for headlines, Inter for body
- Include animated elements: particle backgrounds, glowing effects, smooth transitions
- Use data visualizations with animated charts and graphs
- Include realistic mockups and product screenshots

SLIDE STRUCTURE:
1. OPENING HOOK - Bold statement "What if AI could do the boring parts?" with animated particles forming into a brain shape
2. THE PROBLEM - Show the pain with real statistics: "Workers spend 60% of time on repetitive tasks" with an animated counter
3. THE SOLUTION - Introduce NeuraPilot with sleek product mockups and feature highlights
4. HOW IT WORKS - Clean 3-step visual flow with icons and animations
5. MARKET OPPORTUNITY - $47B TAM with animated pie/bar charts, growth arrows
6. TRACTION - Key metrics dashboard: 150+ customers, $2.3M ARR, 340% growth, 4.8 NPS
7. BUSINESS MODEL - SaaS pricing tiers with visual comparison table
8. COMPETITIVE LANDSCAPE - 2x2 matrix positioning chart showing competitive advantages
9. THE TEAM - Professional headshots grid with brief credentials (use placeholder images)
10. THE ASK - $12M Series A, clear use of funds breakdown, call to action

Make every slide visually STUNNING with interactive elements where appropriate. This should showcase what's possible with AI-generated presentations.`
  },
  {
    topic: "Algebra for kids who ask 'when will I use this'",
    slides: 10,
    style: "educational",
    additional_instructions: `Create an ENGAGING, fun educational presentation that makes algebra exciting for middle school students. Use real-world examples they actually care about.

CRITICAL DESIGN REQUIREMENTS:
- BRIGHT, energetic color palette (purple #8B5CF6, teal #14B8A6, coral #F472B6, yellow #FBBF24)
- Playful but readable typography: Poppins for headlines, Nunito for body
- Include gamification elements: progress bars, achievement badges, point counters
- Use relatable imagery: gaming, sports, social media, money
- Interactive quiz elements and animations

SLIDE STRUCTURE:
1. OPENING - "Why should I care about algebra?" with memes/relatable teen imagery
2. VIDEO GAME EXAMPLE - "How games calculate damage: Attack × Multiplier = Total" with game UI mockup
3. MONEY & SHOPPING - "30% off that $80 hoodie: x = 80 - (80 × 0.30)" with shopping visuals
4. SPORTS STATS - "If Steph Curry makes 43% of 3-pointers, how many in 100 shots?" with basketball graphics
5. SOCIAL MEDIA - "Your follower growth: Starting + (Daily gain × Days)" with fake Instagram UI
6. COOKING & RECIPES - "Double a recipe: 2 cups × 3 = ?" with food imagery
7. DISTANCE & TRAVEL - "Road trip math: Distance ÷ Speed = Time" with map graphics
8. THE PATTERN - Visual showing how all these use the same algebraic thinking
9. MINI QUIZ - Interactive 3-question review with fun animations for right/wrong
10. CHALLENGE - "Now YOU create a real-life algebra problem" with template

Make it colorful, fun, and prove that algebra is EVERYWHERE in their daily lives. Use animations and interactive elements.`
  },
  {
    topic: "How coffee conquered the world - The journey from Ethiopian highlands to your morning cup",
    slides: 10,
    style: "storytelling",
    additional_instructions: `Create a BEAUTIFUL, cinematic presentation about the global history and impact of coffee. This should feel like a premium documentary.

CRITICAL DESIGN REQUIREMENTS:
- Rich, warm color palette (coffee brown #78350F, cream #FEF3C7, deep green #166534, burgundy #881337)
- Elegant typography: Playfair Display for headlines, Source Sans Pro for body
- Stunning coffee photography as backgrounds and accents
- Animated maps showing coffee's spread across continents
- Timeline visualizations with historical dates
- Include cultural imagery from different coffee regions

SLIDE STRUCTURE:
1. OPENING - "The World's Most Popular Drug" - steaming cup with rising stats counter (2.25 billion cups daily)
2. ETHIOPIAN ORIGIN - Legend of Kaldi the goatherd, Ethiopian landscape imagery, ~850 AD
3. ARABIAN NIGHTS - Coffee houses of Yemen, trade routes map, Sufi monks, ~15th century
4. EUROPEAN CONQUEST - Paris cafés, London coffee houses, Enlightenment thinkers, animated spread map
5. COLONIAL EXPANSION - Dutch plantations, Brazilian coffee boom, global trade visualization
6. INDUSTRIAL REVOLUTION - Espresso machine invention, instant coffee, Maxwell House
7. MODERN COFFEE CULTURE - Starbucks era, third wave coffee, specialty roasters
8. THE COFFEE BELT - World map showing growing regions, climate requirements, flavor profiles
9. ECONOMIC IMPACT - $465 billion industry, 125 million workers, fair trade movement
10. YOUR CUP - Journey visualization: farm → processing → roasting → brewing → you

Use beautiful transitions, map animations, and historical imagery. Make viewers appreciate their morning cup.`
  },
  {
    topic: "Demo day pitch that actually fits in 3 minutes - TechStart Accelerator Final Presentation",
    slides: 8,
    style: "minimal",
    additional_instructions: `Create a PUNCHY, high-impact demo day pitch for a fictional B2B SaaS startup called "FlowStack" - a workflow automation platform. Every second counts.

CRITICAL DESIGN REQUIREMENTS:
- Clean, minimal design with BOLD statements
- High-contrast colors: Pure black #000000, white, and ONE accent color (electric violet #7C3AED)
- Large, impactful typography: Space Grotesk headlines, single key number per slide
- Minimal text - maximum 10 words per slide
- Focus on ONE big idea per slide
- Use animations to reveal key metrics dramatically

SLIDE STRUCTURE (8 slides for 3 minutes = ~20 seconds each):
1. HOOK - "Manual workflows cost enterprises $4.5T yearly" - BIG number animation
2. ONE-LINER - "FlowStack: Automate any workflow in 5 clicks" with quick product GIF/mockup
3. TRACTION - Single massive metric: "347 companies, $1.2M ARR, 23% MoM growth"
4. DEMO MOMENT - Clean product screenshot showing the magic (no explanation needed)
5. WHY NOW - "AI + No-code = Perfect timing" with market trend visual
6. TEAM - 3 founders, one line each: "Ex-Google, Ex-Stripe, Ex-Figma"
7. MARKET - "$78B TAM" with simple expansion visual
8. THE ASK - "$5M Seed → $50M ARR in 24 months" with clear CTA

This is about IMPACT over information. Each slide should be immediately understandable. Use dramatic number reveals and clean, modern design.`
  },
  {
    topic: "Cellular Respiration: From Glucose to ATP - Advanced Biology",
    slides: 12,
    style: "scientific",
    additional_instructions: `Create a COMPREHENSIVE, visually stunning biology presentation for AP/college-level students about cellular respiration.

CRITICAL DESIGN REQUIREMENTS:
- Scientific color palette: Deep blue #1E3A5F, mitochondrial purple #6B21A8, ATP orange #F59E0B, chloroplast green #22C55E
- Clean, academic typography: Roboto Slab headlines, Roboto body
- Detailed scientific diagrams with labels and animations
- Molecular structures and chemical equations rendered beautifully
- Step-by-step process visualizations
- Include electron transport chain animation

SLIDE STRUCTURE:
1. OVERVIEW - "Life Runs on ATP" - intro to cellular respiration, mitochondria hero image
2. THE BIG PICTURE - Chemical equation: C6H12O6 + 6O2 → 6CO2 + 6H2O + 38 ATP (animated)
3. GLYCOLYSIS INTRO - "Splitting Sugar" - glucose molecule → 2 pyruvate, cytoplasm location
4. GLYCOLYSIS DETAIL - 10-step breakdown with enzymes, NET: 2 ATP, 2 NADH
5. PYRUVATE PROCESSING - Transition to mitochondria, acetyl-CoA formation
6. KREBS CYCLE INTRO - "The Citric Acid Cycle" - circular pathway visualization
7. KREBS CYCLE DETAIL - Key molecules, 2 ATP, 6 NADH, 2 FADH2 per glucose
8. ELECTRON TRANSPORT CHAIN - "The ATP Factory" - inner membrane diagram
9. ETC MECHANISM - Complexes I-IV, proton gradient, chemiosmosis animation
10. ATP SYNTHASE - "The World's Smallest Motor" - rotary mechanism visualization
11. FINAL COUNT - Energy balance sheet: 38 ATP total, efficiency comparison
12. CONNECTIONS - Links to photosynthesis, exercise, metabolism

Include detailed diagrams, molecular animations, and make complex processes visually clear. This should be reference-quality material.`
  },
  {
    topic: "The French Revolution: From Monarchy to Republic - A Visual History",
    slides: 12,
    style: "historical",
    additional_instructions: `Create a DRAMATIC, visually rich presentation about the French Revolution for high school/college history students.

CRITICAL DESIGN REQUIREMENTS:
- Revolutionary color palette: Deep red #991B1B, royal blue #1E40AF, gold #F59E0B, parchment cream #FEF9E7
- Elegant serif typography: Libre Baskerville headlines, Crimson Text body
- Historical paintings and imagery as backgrounds
- Timeline visualizations with key dates
- Maps of Paris and France
- Include famous figures with portraits

SLIDE STRUCTURE:
1. OPENING - "July 14, 1789: The Day Everything Changed" - Storming of Bastille painting
2. OLD REGIME - Three Estates visualization, wealth inequality statistics, causes of unrest
3. FINANCIAL CRISIS - France's debt spiral, cost of American Revolution, bread prices chart
4. ESTATES GENERAL - May 1789, voting system problem, Third Estate's demands
5. TENNIS COURT OATH - June 20, 1789, birth of National Assembly, dramatic oath scene
6. BASTILLE - The fortress, the storming, symbolism, eyewitness accounts
7. DECLARATION OF RIGHTS - "Men are born free and equal" - document visualization
8. KEY FIGURES - Louis XVI, Marie Antoinette, Robespierre, Danton - portrait gallery
9. THE TERROR - 1793-1794, executions counter, Reign of Terror timeline
10. RISE OF NAPOLEON - Military hero, coup of 18 Brumaire, empire begins
11. LASTING IMPACT - Spread of revolutionary ideas, modern democracy foundations
12. LEGACY - "Liberty, Equality, Fraternity" - French values today, visual conclusion

Use dramatic imagery, historical quotes, and clear timelines. Make history come alive.`
  },
  {
    topic: "Enterprise Solutions Client Proposal - Digital Transformation Partnership",
    slides: 10,
    style: "corporate",
    additional_instructions: `Create a POLISHED, professional client proposal for a fictional consulting firm "Meridian Partners" pitching digital transformation services to a Fortune 500 company.

CRITICAL DESIGN REQUIREMENTS:
- Sophisticated corporate palette: Navy #0F172A, silver #94A3B8, gold accent #D97706, white
- Executive typography: Proxima Nova or similar modern sans-serif
- Professional charts and data visualizations
- Clean layouts with premium whitespace
- Include realistic mockups of deliverables
- ROI calculations and projections

SLIDE STRUCTURE:
1. COVER - "Digital Excellence: Your Transformation Journey" - Meridian Partners logo, client name placeholder
2. EXECUTIVE SUMMARY - 3 key points: Challenge, Solution, Expected ROI (4x return)
3. UNDERSTANDING YOUR CHALLENGES - Based on discovery: legacy systems, siloed data, customer experience gaps
4. OUR APPROACH - Proprietary "Meridian Method" framework visualization
5. PROPOSED SOLUTION - Phase 1-3 roadmap with timeline, key milestones
6. DELIVERABLES - What client gets: assessment report, implementation plan, change management, training
7. INVESTMENT & ROI - Pricing table, 3-year TCO, expected savings/gains with conservative estimates
8. WHY MERIDIAN - Case studies: "Similar client achieved 340% ROI", testimonial quotes
9. TEAM - Dedicated project team profiles: Partner, Director, Senior Consultants
10. NEXT STEPS - Clear action items, proposed timeline, contact information, call to action

Make it feel like a $500K+ proposal. Professional, confident, data-driven.`
  },
  {
    topic: "Interactive Presentation About 2000s Internet Culture - From AIM to YouTube",
    slides: 10,
    style: "nostalgic",
    additional_instructions: `Create a FUN, nostalgic, interactive presentation about early 2000s internet culture. This should make millennials smile and teach Gen Z about the old internet.

CRITICAL DESIGN REQUIREMENTS:
- Retro web palette: Windows XP blue #245EDC, AOL yellow #FFD700, hot pink #FF69B4, lime green #32CD32
- Mix of pixel fonts and early 2000s web typography
- Recreate old UI elements: AIM buddy list, MySpace profiles, old YouTube layout
- Include memes and viral content references
- Dial-up modem sounds concept (visual representation)
- Glitter GIF and "Under Construction" aesthetic

SLIDE STRUCTURE:
1. OPENING - "Welcome to the Internet (Dial-Up Required)" - mock connection screen, loading bars
2. AIM & MESSAGING - Buddy list UI, away messages, door sound effects, screenname culture
3. MYSPACE ERA - Top 8 drama, profile customization, HTML/CSS hacking, emo bands
4. EARLY YOUTUBE - "Me at the zoo", viral videos (Star Wars Kid, Numa Numa, Charlie Bit My Finger)
5. FLASH GAMES - Newgrounds, Miniclip, Neopets, AddictingGames - game screenshot collage
6. EARLY MEMES - All Your Base, Dancing Baby, Hamster Dance, O RLY owl
7. SOCIAL MEDIA BEGINNINGS - Facebook wall (pre-timeline), early Twitter, Digg
8. LIMEWIRE ERA - "Downloading... Virus" joke, music piracy culture (educational context only)
9. WEB 1.0 DESIGN - Geocities aesthetic, visitor counters, guestbooks, "Best viewed in IE"
10. LEGACY - "These weird experiments created today's internet" - connections to modern platforms

Make it interactive, funny, and packed with nostalgic references. Include Easter eggs and fun animations.`
  }
];

async function createDeck(deckConfig) {
  console.log(`\nCreating: "${deckConfig.topic.substring(0, 50)}..."`);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify(deckConfig)
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`  ✓ Created: ${data.deck_id}`);
      return { success: true, uuid: data.deck_id, name: deckConfig.topic };
    } else {
      console.log(`  ✗ Error: ${JSON.stringify(data)}`);
      return { success: false, error: data };
    }
  } catch (error) {
    console.log(`  ✗ Network error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function waitForCompletion(uuid, maxWaitMinutes = 15) {
  const startTime = Date.now();
  const maxWaitMs = maxWaitMinutes * 60 * 1000;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch(`${API_URL}/${uuid}/status`, {
        headers: { 'X-API-Key': API_KEY }
      });
      const data = await response.json();

      if (data.status === 'completed') {
        return { success: true, status: 'completed' };
      } else if (data.status === 'failed') {
        return { success: false, status: 'failed', error: data.error };
      }

      // Log progress
      const progress = data.progress || 0;
      process.stdout.write(`\r  Progress: ${progress}% - ${data.message || 'Processing...'}`);

    } catch (error) {
      // Network hiccup, keep trying
    }

    // Wait 5 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  return { success: false, status: 'timeout' };
}

async function main() {
  console.log('='.repeat(60));
  console.log('CREATING SHOWCASE DECKS WITH DETAILED INSTRUCTIONS');
  console.log('='.repeat(60));

  // Step 1: Clear existing featured decks
  console.log('\n1. Clearing existing featured decks...');
  const { error: deleteError } = await supabase
    .from('featured_decks')
    .delete()
    .neq('uuid', '00000000-0000-0000-0000-000000000000'); // Delete all

  if (deleteError) {
    console.log('Warning: Could not clear featured_decks:', deleteError.message);
  } else {
    console.log('   ✓ Cleared existing featured decks');
  }

  // Step 2: Create all decks
  console.log('\n2. Creating decks via API...');
  const createdDecks = [];

  for (const deckConfig of SHOWCASE_DECKS) {
    const result = await createDeck(deckConfig);
    if (result.success) {
      createdDecks.push(result);
    }
    // Small delay between requests to not overwhelm the API
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\nCreated ${createdDecks.length}/${SHOWCASE_DECKS.length} decks`);

  // Step 3: Wait for all decks to complete
  console.log('\n3. Waiting for deck generation to complete...');
  console.log('   (This may take several minutes per deck)\n');

  const completedDecks = [];

  for (let i = 0; i < createdDecks.length; i++) {
    const deck = createdDecks[i];
    console.log(`\n[${i+1}/${createdDecks.length}] Waiting for: ${deck.name.substring(0, 50)}...`);

    const result = await waitForCompletion(deck.uuid);
    console.log(''); // New line after progress

    if (result.success) {
      console.log(`   ✓ Completed!`);
      completedDecks.push(deck);
    } else {
      console.log(`   ✗ ${result.status}: ${result.error || 'Unknown error'}`);
    }
  }

  // Step 4: Insert completed decks into featured_decks
  console.log('\n4. Adding completed decks to featured_decks...');

  for (let i = 0; i < completedDecks.length; i++) {
    const deck = completedDecks[i];

    // Get the deck data to get slide count
    const { data: deckData } = await supabase
      .from('decks')
      .select('name, slides')
      .eq('uuid', deck.uuid)
      .single();

    const { error: insertError } = await supabase
      .from('featured_decks')
      .insert({
        uuid: deck.uuid,
        name: deckData?.name || deck.name,
        display_order: i,
        is_active: true,
        slide_count: deckData?.slides?.length || 0
      });

    if (insertError) {
      console.log(`   ✗ Failed to add ${deck.uuid}: ${insertError.message}`);
    } else {
      console.log(`   ✓ Added: ${deckData?.name || deck.name}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total requested: ${SHOWCASE_DECKS.length}`);
  console.log(`Created: ${createdDecks.length}`);
  console.log(`Completed: ${completedDecks.length}`);
  console.log('\nFeatured deck UUIDs:');
  completedDecks.forEach((d, i) => console.log(`  ${i}: ${d.uuid}`));
}

main().catch(console.error);
