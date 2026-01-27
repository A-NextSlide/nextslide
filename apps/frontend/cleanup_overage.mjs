import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

// User ID for abeshry@gmail.com
const USER_ID = '942ccba7-5346-4f99-8189-82284dafb255';

console.log('Cleaning up stale overage records for user with unlimited credits...\n');

// First verify user has unlimited credits
const { data: balance } = await supabase
  .from('credit_balances')
  .select('monthly_credits, used_credits')
  .eq('user_id', USER_ID)
  .single();

console.log('User balance:', balance);

if (balance?.monthly_credits !== -1) {
  console.log('\nUser does NOT have unlimited credits (-1). Aborting cleanup.');
  process.exit(1);
}

console.log('\nUser has unlimited credits (-1). Proceeding with cleanup...\n');

// Delete overage_accumulated records for this user
const { data: deleted, error } = await supabase
  .from('credit_transactions')
  .delete()
  .eq('user_id', USER_ID)
  .eq('transaction_type', 'overage_accumulated')
  .select();

if (error) {
  console.log('Error deleting overage records:', error);
} else {
  console.log(`Deleted ${deleted?.length || 0} overage_accumulated records.`);
}

// Also check for any transactions with overage metadata and clean them
const { data: overageTx } = await supabase
  .from('credit_transactions')
  .select('id, transaction_type, metadata')
  .eq('user_id', USER_ID)
  .not('metadata->overage', 'is', null);

if (overageTx && overageTx.length > 0) {
  console.log(`\nFound ${overageTx.length} transactions with overage metadata:`);
  for (const tx of overageTx) {
    console.log(`  - ${tx.transaction_type}: overage=${tx.metadata?.overage_credits || tx.metadata?.overage}`);
    // Remove overage metadata from these transactions
    const cleanMetadata = { ...tx.metadata };
    delete cleanMetadata.overage;
    delete cleanMetadata.overage_credits;
    delete cleanMetadata.overage_cost_cents;
    await supabase
      .from('credit_transactions')
      .update({ metadata: cleanMetadata })
      .eq('id', tx.id);
  }
  console.log('Cleaned overage metadata from transactions.');
}

console.log('\nDone! User should no longer see overage charges.');
