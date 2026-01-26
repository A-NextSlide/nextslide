import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

// Check French Revolution deck - one of the "stuck" ones
const { data, error } = await supabase
  .from('decks')
  .select('name, slides')
  .eq('uuid', '15b1332d-bc84-48cb-833f-9eae2c056cfa')
  .single();

if (data) {
  console.log('Deck:', data.name);
  console.log('Slide count:', data.slides?.length);

  // Check if first slide has a CustomComponent with HTML
  const firstSlide = data.slides?.[0];
  if (firstSlide) {
    console.log('\nFirst slide title:', firstSlide.title);
    console.log('Components:', firstSlide.components?.length);

    const customComp = firstSlide.components?.find(c => c.type === 'CustomComponent');
    if (customComp?.props?.render) {
      console.log('Has HTML content:', customComp.props.render.length, 'chars');
      console.log('Preview:', customComp.props.render.substring(0, 200) + '...');
    }
  }
}
