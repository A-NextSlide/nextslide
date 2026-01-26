import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

// Check first featured deck in detail
const { data } = await supabase
  .from('featured_decks')
  .select('uuid, name, slides')
  .eq('display_order', 0)
  .single();

console.log('Deck:', data?.name);
console.log('Total slides:', data?.slides?.length);

if (data?.slides) {
  data.slides.forEach((slide, i) => {
    console.log(`\n--- Slide ${i + 1}: ${slide.title || 'No title'} ---`);
    console.log('Status:', slide.status);
    console.log('Components:', slide.components?.length || 0);

    if (slide.components) {
      slide.components.forEach((c, j) => {
        console.log(`  ${j}: ${c.type}`);
        if (c.type === 'CustomComponent' && c.props?.render) {
          console.log(`     HTML: ${c.props.render.length} chars`);
        }
        if (c.type === 'CustomComponent' && !c.props?.render) {
          console.log(`     ⚠️ NO RENDER HTML!`);
        }
      });
    }

    // Check for errors
    if (slide.error) {
      console.log('ERROR:', slide.error);
    }
  });
}
