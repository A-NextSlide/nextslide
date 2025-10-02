import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAdminStatus() {
  console.log('=== CHECKING ADMIN STATUS ===\n');

  // 1. Check current auth user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    console.error('❌ Not authenticated:', authError?.message || 'No user session');
    console.log('\n💡 Make sure you are logged in at localhost:8080');
    return;
  }

  console.log('✅ Authenticated as:', user.email);
  console.log('   User ID:', user.id);

  // 2. Check users table
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('id, email, role, created_at, updated_at')
    .eq('id', user.id)
    .single();

  if (userError) {
    console.error('\n❌ Error fetching from users table:', userError.message);
    console.log('\n💡 Run this SQL to add yourself to the users table:');
    console.log(`
INSERT INTO public.users (id, email, role, created_at, updated_at)
VALUES ('${user.id}', '${user.email}', 'admin', NOW(), NOW())
ON CONFLICT (id) DO UPDATE
SET role = 'admin', updated_at = NOW();
    `);
    return;
  }

  if (userData) {
    console.log('\n📊 User record found:');
    console.log('   Role:', userData.role);
    console.log('   Created:', userData.created_at);
    console.log('   Updated:', userData.updated_at);

    if (userData.role === 'admin') {
      console.log('\n✅ You have admin access!');
      console.log('   You should be able to access /admin');
    } else {
      console.log(`\n⚠️  Your role is '${userData.role}', not 'admin'`);
      console.log('\n💡 Run this SQL to grant admin access:');
      console.log(`
UPDATE public.users 
SET role = 'admin', updated_at = NOW()
WHERE id = '${user.id}';
      `);
    }
  } else {
    console.log('\n⚠️  No user record found in public.users table');
  }

  // 3. Check if user exists in auth.users (for debugging)
  console.log('\n📋 Auth metadata:');
  console.log('   Email confirmed:', user.email_confirmed_at ? 'Yes' : 'No');
  console.log('   Last sign in:', user.last_sign_in_at);
  console.log('   Provider:', user.app_metadata?.provider || 'email');
}

checkAdminStatus();