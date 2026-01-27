import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

// Find all overage_accumulated transactions
const { data: overageTransactions, error } = await supabase
  .from('credit_transactions')
  .select('user_id, metadata, created_at')
  .eq('transaction_type', 'overage_accumulated')
  .order('created_at', { ascending: false });

if (error) {
  console.log('Error:', error);
  process.exit(1);
}

console.log('=== Users with Overage Charges ===\n');

if (!overageTransactions || overageTransactions.length === 0) {
  console.log('No users with overage_accumulated transactions found.');

  // Check for any transactions with overage metadata
  console.log('\nChecking for transactions with overage in metadata...');
  const { data: allTx } = await supabase
    .from('credit_transactions')
    .select('user_id, transaction_type, metadata, created_at')
    .not('metadata->overage', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (allTx && allTx.length > 0) {
    console.log(`Found ${allTx.length} transactions with overage metadata:\n`);
    for (const tx of allTx) {
      console.log('User:', tx.user_id);
      console.log('Type:', tx.transaction_type);
      console.log('Metadata:', JSON.stringify(tx.metadata, null, 2));
      console.log('---');
    }
  }
} else {
  for (const tx of overageTransactions) {
    const metadata = tx.metadata || {};
    const overageCredits = metadata.total_overage || 0;
    const costCents = metadata.cost_cents || 0;

    // Get user info from auth.users
    const { data: userData } = await supabase.auth.admin.getUserById(tx.user_id);
    const email = userData?.user?.email || 'unknown';

    // Get subscription info
    const { data: subData } = await supabase
      .from('subscriptions')
      .select('plan_id, status')
      .eq('user_id', tx.user_id)
      .single();

    console.log('User ID:', tx.user_id);
    console.log('Email:', email);
    console.log('Plan:', subData?.plan_id || 'unknown');
    console.log('Overage Credits:', overageCredits);
    console.log('Cost (cents):', costCents);
    console.log('Cost ($):', (costCents / 100).toFixed(2));
    console.log('Created:', tx.created_at);
    console.log('---');
  }
}

// Also check credit_balances for users with negative remaining
console.log('\n=== Checking Credit Balances ===\n');
const { data: balances } = await supabase
  .from('credit_balances')
  .select('user_id, monthly_credits, purchased_credits, used_credits')
  .order('used_credits', { ascending: false })
  .limit(10);

if (balances) {
  for (const b of balances) {
    const remaining = (b.monthly_credits + b.purchased_credits) - b.used_credits;
    if (remaining < 0 || b.used_credits > b.monthly_credits) {
      const { data: userData } = await supabase.auth.admin.getUserById(b.user_id);
      const email = userData?.user?.email || 'unknown';

      const { data: subData } = await supabase
        .from('subscriptions')
        .select('plan_id')
        .eq('user_id', b.user_id)
        .single();

      console.log('User:', email);
      console.log('Plan:', subData?.plan_id || 'unknown');
      console.log('Monthly:', b.monthly_credits);
      console.log('Purchased:', b.purchased_credits);
      console.log('Used:', b.used_credits);
      console.log('Remaining:', remaining);
      if (remaining < 0) {
        console.log('OVERAGE:', Math.abs(remaining), 'credits = $' + (Math.abs(remaining) * 0.03).toFixed(2));
      }
      console.log('---');
    }
  }
}
