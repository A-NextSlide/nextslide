import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

// Check one of the current featured decks to see slide structure
const { data, error } = await supabase
  .from('decks')
  .select('uuid, name, slides')
  .eq('uuid', 'a4737ca1-6c39-4d2f-9447-8c7c567d6efc')
  .single();

if (data && data.slides) {
  console.log('Deck:', data.name);
  console.log('Slides:', data.slides.length);
  data.slides.forEach((slide, i) => {
    console.log('\n--- Slide', i+1, '---');
    console.log('Layout:', slide.layout);
    console.log('Components:', slide.components?.length || 0);
  });
}
