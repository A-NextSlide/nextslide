import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

// Check first featured deck has real slides
const { data } = await supabase
  .from('featured_decks')
  .select('name, slides')
  .eq('display_order', 0)
  .single();

if (data) {
  console.log('Deck:', data.name);
  console.log('Slides count:', data.slides?.length);
  console.log('First slide title:', data.slides?.[0]?.title);
  console.log('First slide has components:', data.slides?.[0]?.components?.length > 0);

  // Check for CustomComponent with HTML
  const comp = data.slides?.[0]?.components?.find(c => c.type === 'CustomComponent');
  if (comp?.props?.render) {
    console.log('Has HTML render:', comp.props.render.length, 'chars');
  }
}
