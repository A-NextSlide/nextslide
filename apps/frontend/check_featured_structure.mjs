import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

// Check what's in featured_decks
const { data, error } = await supabase
  .from('featured_decks')
  .select('*')
  .limit(1);

if (error) {
  console.log('Error:', error);
} else {
  console.log('Columns in featured_decks:');
  if (data && data[0]) {
    console.log(Object.keys(data[0]));
    console.log('\nFirst row:');
    console.log(JSON.stringify(data[0], null, 2));
  }
}
