import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

const ids = [
  'd16a9ffd-8ce5-46fe-9065-035c02749f0e',
  '45d632cb-90a7-48b3-bcee-eb7aa307c12a',
  '693a7ea6-cbfc-4450-9a86-debf41b2f0bc',
  '4ab78cad-9dc9-4bb0-966b-514bd20f9dbc',
  '1e3d90fc-f170-4d26-9dc9-7fad77537772',
  'fae9b7b9-39bb-48a2-9a89-fc00a4b4f381',
  '8cf7fbb2-78c5-490f-a631-46f21fa463b8',
  'b0915bfc-3bb4-4fb9-b0b5-1a339e25b783'
];

for (const uuid of ids) {
  const { data } = await supabase.from('decks').select('name, status, slides').eq('uuid', uuid).single();
  const slides = data?.slides?.length || 0;
  const msg = data?.status?.message || data?.status?.state || 'unknown';
  console.log(`${uuid.substring(0,8)}: ${slides} slides - ${msg}`);
}
