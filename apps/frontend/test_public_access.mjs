import { createClient } from '@supabase/supabase-js';

// Test as anonymous user with correct credentials
const supabase = createClient(
  'https://auth.nextslide.ai',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI0ODk3MjYsImV4cCI6MjA1ODA2NTcyNn0.2IDRKe6lC9YAB_9LG-Abxoz9KhiNuXcPVwaCm8-gF5I'
);

console.log('Testing public (anon) access to featured_decks...\n');

const { data, error } = await supabase
  .from('featured_decks')
  .select('*')
  .eq('is_active', true)
  .order('display_order', { ascending: true })
  .limit(8);

if (error) {
  console.log('ERROR:', error.message);
  console.log('Code:', error.code);
  console.log('Details:', error.details);
  console.log('Hint:', error.hint);
} else {
  console.log('SUCCESS! Found', data?.length, 'decks');
  data?.forEach((d, i) => {
    console.log(`${i}: ${d.name?.substring(0, 40)} - slides: ${d.slides?.length || 0}`);
  });
}
