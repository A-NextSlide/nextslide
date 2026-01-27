import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

const { data } = await supabase
  .from('decks')
  .select('uuid, name, status, slides')
  .eq('uuid', 'ced8e8be-43f6-4b75-a496-b41df1364be9')
  .single();

console.log('Name:', data?.name);
console.log('Status:', JSON.stringify(data?.status, null, 2));
console.log('Slides:', data?.slides?.length || 0);

if (data?.slides) {
  data.slides.forEach((s, i) => {
    const comps = s.components?.length || 0;
    console.log(`  ${i+1}: ${s.status} - ${comps} components`);
  });
}
