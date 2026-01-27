import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

console.log('=== Updating Rivian fonts in brandfetch_cache ===\n');

// Find Rivian entry
const { data: rivian, error } = await supabase
  .from('brandfetch_cache')
  .select('*')
  .ilike('normalized_identifier', '%rivian%')
  .single();

if (error || !rivian) {
  console.log('Error finding Rivian:', error?.message);
  process.exit(1);
}

console.log('Current fonts:');
console.log(JSON.stringify(rivian.api_response.fonts, null, 2));

// Update the api_response with new fonts
const updatedApiResponse = {
  ...rivian.api_response,
  fonts: {
    all: [
      {
        name: "Barlow Condensed",
        type: "title",
        style: "normal",
        origin: "google",
        weight: "600"
      },
      {
        name: "Barlow",
        type: "body",
        style: "normal",
        origin: "google",
        weight: "400"
      }
    ],
    names: ["Barlow Condensed", "Barlow"],
    primary: ["Barlow Condensed"],
    secondary: ["Barlow"]
  }
};

const { data: updated, error: updateErr } = await supabase
  .from('brandfetch_cache')
  .update({
    api_response: updatedApiResponse
  })
  .eq('id', rivian.id)
  .select();

if (updateErr) {
  console.log('\nError updating:', updateErr.message);
} else {
  console.log('\n✅ Updated Rivian fonts!');
  console.log('\nNew fonts:');
  console.log(JSON.stringify(updatedApiResponse.fonts, null, 2));
}
