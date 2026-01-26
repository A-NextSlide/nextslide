import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

const { data: decks } = await supabase
  .from('featured_decks')
  .select('name, slides')
  .order('display_order');

decks?.forEach(deck => {
  const total = deck.slides?.length || 0;
  const completed = deck.slides?.filter(s => s.status === 'completed' && s.components?.length > 0).length || 0;
  const pending = deck.slides?.filter(s => s.status === 'pending' || s.components?.length === 0).length || 0;

  console.log(`${deck.name?.substring(0, 45)}`);
  console.log(`  Total: ${total}, Completed: ${completed}, Failed: ${pending}`);

  if (pending > 0) {
    const failedSlides = deck.slides?.map((s, i) => s.status === 'pending' || s.components?.length === 0 ? i + 1 : null).filter(Boolean);
    console.log(`  Failed slides: ${failedSlides.join(', ')}`);
  }
  console.log('');
});
