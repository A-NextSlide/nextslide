import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

const ids = [
  'ced8e8be-43f6-4b75-a496-b41df1364be9',
  '79bad965-e713-46a8-97bd-575c4e2c144a',
  '87424cd4-9d67-4ee2-bd90-00a7420634fd'
];

for (const uuid of ids) {
  const { data } = await supabase.from('decks').select('name, status, slides').eq('uuid', uuid).single();
  const total = data?.slides?.length || 0;
  const completed = data?.slides?.filter(s => s.components?.length > 0).length || 0;
  const msg = data?.status?.message || data?.status || 'unknown';
  console.log(`${data?.name?.substring(0,40)}: ${completed}/${total} - ${msg}`);
}
