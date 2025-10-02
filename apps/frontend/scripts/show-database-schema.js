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

async function showDatabaseSchema() {
  console.log('=== SUPABASE DATABASE SCHEMA ===\n');

  try {
    // Query to get all tables and their columns from information_schema
    const { data: tables, error: tablesError } = await supabase
      .rpc('get_table_info', {});

    if (tablesError) {
      // If the function doesn't exist, let's try a direct query approach
      console.log('Note: To get full schema information, you may need to run this SQL in Supabase SQL Editor:\n');
      console.log(`
-- Get all tables with their columns
SELECT 
  t.table_schema,
  t.table_name,
  STRING_AGG(
    c.column_name || ' (' || c.data_type || 
    CASE 
      WHEN c.is_nullable = 'NO' THEN ' NOT NULL' 
      ELSE '' 
    END || ')', 
    ', ' ORDER BY c.ordinal_position
  ) as columns
FROM information_schema.tables t
JOIN information_schema.columns c 
  ON t.table_schema = c.table_schema 
  AND t.table_name = c.table_name
WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
  AND t.table_type = 'BASE TABLE'
GROUP BY t.table_schema, t.table_name
ORDER BY t.table_schema, t.table_name;
      `);
    }

    // Let's at least show what we can access through the client
    console.log('\n=== ACCESSIBLE TABLES ===\n');

    // Check known tables
    const knownTables = [
      'decks',
      'deck_versions',
      'chat_feedback',
      'palettes',
      'slide_templates',
      'yjs_snapshots'
    ];

    for (const tableName of knownTables) {
      console.log(`\n📊 TABLE: ${tableName}`);
      console.log('─'.repeat(50));
      
      try {
        // Get a sample row to see the structure
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);

        if (error) {
          console.log(`   ❌ Cannot access table: ${error.message}`);
        } else if (data && data.length > 0) {
          const columns = Object.keys(data[0]);
          console.log(`   Columns (${columns.length}):`);
          columns.forEach(col => {
            const value = data[0][col];
            const type = value === null ? 'unknown' : 
                        typeof value === 'object' ? 'jsonb' : 
                        typeof value;
            console.log(`   - ${col} (${type})`);
          });
        } else {
          console.log(`   ℹ️  Table exists but is empty`);
          
          // Try to get table structure another way
          const { error: structError } = await supabase
            .from(tableName)
            .select('*')
            .limit(0);
            
          if (!structError) {
            console.log('   Table is accessible but has no data to infer structure');
          }
        }
      } catch (err) {
        console.log(`   ❌ Error accessing table: ${err.message}`);
      }
    }

    // Also check auth schema (if accessible)
    console.log(`\n\n📊 AUTH TABLES (if accessible)`);
    console.log('─'.repeat(50));
    
    try {
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
      if (!authError && authUsers) {
        console.log('auth.users table is accessible via auth.admin API');
        console.log(`Total users: ${authUsers.users.length}`);
      } else {
        console.log('auth.users - Requires service role key for full access');
      }
    } catch (err) {
      console.log('auth.users - Not accessible with current credentials');
    }

    // Show SQL commands to get full schema
    console.log('\n\n=== SQL COMMANDS FOR FULL SCHEMA ===\n');
    console.log('Run these in your Supabase SQL Editor for complete information:\n');

    console.log('-- 1. List all tables with row counts:');
    console.log(`
SELECT 
  schemaname,
  tablename,
  n_live_tup as row_count
FROM pg_stat_user_tables
ORDER BY schemaname, tablename;
    `);

    console.log('\n-- 2. Get detailed column information for a specific table:');
    console.log(`
SELECT 
  column_name,
  data_type,
  character_maximum_length,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'decks'  -- Change table name here
ORDER BY ordinal_position;
    `);

    console.log('\n-- 3. Get all foreign key relationships:');
    console.log(`
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public';
    `);

    console.log('\n-- 4. Get all indexes:');
    console.log(`
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
    `);

  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the script
showDatabaseSchema();