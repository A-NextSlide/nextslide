import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

// Look at several completed decks to understand good slide structures
const { data: decks, error } = await supabase
  .from('decks')
  .select('uuid, name, slides, status')
  .eq('status', 'completed')
  .limit(5);

if (decks) {
  for (const deck of decks) {
    console.log('\n========================================');
    console.log('DECK:', deck.name);
    console.log('UUID:', deck.uuid);
    console.log('Total Slides:', deck.slides?.length || 0);

    if (deck.slides && deck.slides.length > 0) {
      // Look at first 2 slides in detail
      for (let i = 0; i < Math.min(2, deck.slides.length); i++) {
        const slide = deck.slides[i];
        console.log(`\n--- Slide ${i+1} ---`);
        console.log('Layout:', slide.layout);
        console.log('Theme:', slide.theme);
        console.log('Components:', slide.components?.length || 0);

        if (slide.components) {
          slide.components.forEach((comp, j) => {
            console.log(`  Component ${j+1}:`, comp.type);
            if (comp.type === 'text') {
              const text = comp.props?.content || comp.props?.text || '';
              console.log(`    Content preview: "${text.substring(0, 80)}..."`);
            }
            if (comp.type === 'image') {
              console.log(`    Image URL:`, comp.props?.src?.substring(0, 60) + '...');
            }
          });
        }
      }
    }
  }
}
