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

async function grantAdminAccess() {
  console.log('=== GRANTING ADMIN ACCESS ===\n');

  // Get the current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    console.error('❌ Not authenticated. Please log in first at localhost:8080');
    return;
  }

  console.log('Found user:', user.email);
  console.log('User ID:', user.id);

  // Check if user exists in public.users
  const { data: existingUser, error: checkError } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  if (checkError && checkError.code === 'PGRST116') {
    // User doesn't exist, create them
    console.log('\n📝 Creating user record...');
    
    const { error: insertError } = await supabase
      .from('users')
      .insert({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || null,
        role: 'admin',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('❌ Error creating user:', insertError);
      return;
    }

    console.log('✅ User created with admin role!');
  } else if (existingUser) {
    // User exists, update their role
    console.log('\n📝 Updating user role to admin...');
    console.log('Current role:', existingUser.role);
    
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        role: 'admin',
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('❌ Error updating user:', updateError);
      return;
    }

    console.log('✅ User role updated to admin!');
  } else if (checkError) {
    console.error('❌ Error checking user:', checkError);
    return;
  }

  // Verify the change
  const { data: updatedUser } = await supabase
    .from('users')
    .select('id, email, role, updated_at')
    .eq('id', user.id)
    .single();

  console.log('\n✅ SUCCESS! Admin access granted');
  console.log('User details:', updatedUser);
  console.log('\n🎉 You can now access /admin');
  console.log('   Note: You may need to refresh the page or log out and back in');
}

grantAdminAccess();