import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

const decks = [
  '15b1332d-bc84-48cb-833f-9eae2c056cfa',  // French Rev
  'a8a4400e-eb08-4f59-a743-715a6103d97d',  // Client Proposal
  '12cbc688-5be4-43ec-8009-9ebd975bf050'   // 2000s Internet
];

for (const uuid of decks) {
  const { data, error } = await supabase
    .from('decks')
    .select('name, status, slides')
    .eq('uuid', uuid)
    .single();

  if (data) {
    console.log(`${uuid.substring(0,8)}: ${data.name?.substring(0,40)}`);
    console.log(`  Status: ${JSON.stringify(data.status)}`);
    console.log(`  Slides: ${data.slides?.length || 0}`);
    console.log('');
  }
}
