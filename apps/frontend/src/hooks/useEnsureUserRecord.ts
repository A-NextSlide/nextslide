import { useEffect } from 'react';
import { useAuth } from '@/context/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to ensure the authenticated user has a record in the public.users table
 * This is a temporary workaround until the backend handles this automatically
 */
export function useEnsureUserRecord() {
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    async function ensureUserRecord() {
      if (!isAuthenticated || !user) return;

      try {
        // Check if user exists in public.users
        const { data: existingUser, error: fetchError } = await supabase
          .from('users')
          .select('id')
          .eq('id', user.id)
          .single();

        // If user doesn't exist, create the record
        if (fetchError && fetchError.code === 'PGRST116') {
          console.log('Creating user record in public.users table...');
          
          const { error: insertError } = await supabase
            .from('users')
            .insert({
              id: user.id,
              email: user.email!,
              full_name: user.user_metadata?.full_name || null,
              avatar_url: user.user_metadata?.avatar_url || null,
              role: 'user', // Default role
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              metadata: {}
            });

          if (insertError) {
            console.error('Error creating user record:', insertError);
          } else {
            console.log('User record created successfully');
          }
        }
      } catch (error) {
        console.error('Error in useEnsureUserRecord:', error);
      }
    }

    ensureUserRecord();
  }, [user, isAuthenticated]);
}