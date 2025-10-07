// Simple script to check database presentations
import { createClient } from './apps/frontend/node_modules/@supabase/supabase-js/dist/main/index.js';

const supabase = createClient(
  'https://auth.nextslide.ai',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI0ODk3MjYsImV4cCI6MjA1ODA2NTcyNn0.2IDRKe6lC9YAB_9LG-Abxoz9KhiNuXcPVwaCm8-gF5I'
);

async function checkDecks() {
  console.log('Fetching recent decks...\n');

  // Get recent decks
  const { data: decks, error } = await supabase
    .from('decks')
    .select('uuid, title, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching decks:', error);
    return;
  }

  console.log(`Found ${decks.length} recent decks:\n`);

  for (const deck of decks) {
    console.log(`\n==== ${deck.title} ====`);
    console.log(`UUID: ${deck.uuid}`);
    console.log(`Created: ${new Date(deck.created_at).toLocaleString()}`);
    console.log(`Updated: ${new Date(deck.updated_at).toLocaleString()}`);

    // Get slide count and details for this deck
    const { data: slides, error: slideError } = await supabase
      .from('slides')
      .select('id, title, slide_type, content, components')
      .eq('deck_id', deck.uuid)
      .order('slide_order', { ascending: true });

    if (slideError) {
      console.error('Error fetching slides:', slideError);
      continue;
    }

    console.log(`Slides: ${slides.length}`);

    // Check for formatting issues
    let issues = [];
    slides.forEach((slide, idx) => {
      // Check title
      if (!slide.title || slide.title.trim() === '') {
        issues.push(`  Slide ${idx + 1}: Missing title`);
      }

      // Check components
      if (!slide.components || slide.components.length === 0) {
        issues.push(`  Slide ${idx + 1} (${slide.title}): No components`);
      } else {
        // Check for duplicate components
        const componentIds = slide.components.map(c => c.id);
        const duplicates = componentIds.filter((id, idx) => componentIds.indexOf(id) !== idx);
        if (duplicates.length > 0) {
          issues.push(`  Slide ${idx + 1} (${slide.title}): Duplicate components: ${duplicates.join(', ')}`);
        }

        // Check for text centering
        const textComponents = slide.components.filter(c => c.type === 'Text' || c.type === 'Title');
        textComponents.forEach(tc => {
          const align = tc.props?.align;
          if (slide.slide_type === 'title' && align !== 'center') {
            issues.push(`  Slide ${idx + 1} (${slide.title}): Title slide text not centered (align: ${align})`);
          }
        });
      }

      // Check slide type
      if (idx === 0 && slide.slide_type !== 'title') {
        issues.push(`  Slide 1: First slide should be 'title' type, got '${slide.slide_type}'`);
      }
    });

    if (issues.length > 0) {
      console.log('\n⚠️  Issues found:');
      issues.forEach(issue => console.log(issue));
    } else {
      console.log('✅ No formatting issues detected');
    }
  }
}

checkDecks().catch(console.error);
