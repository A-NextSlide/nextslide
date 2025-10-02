/**
 * Script to create the chat_feedback table in Supabase
 * 
 * Usage:
 * 1. Make sure you have Node.js installed
 * 2. Run this script with: node scripts/create_feedback_table.js
 */

#!/usr/bin/env node

// Load environment variables
import { config } from 'dotenv';
config();

import { createClient } from '@supabase/supabase-js';

// Get Supabase credentials from environment variables
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase environment variables. Please check your .env file.');
  process.exit(1);
}

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// SQL to create the feedback table
const sql = `
-- Create chat_feedback table to store user feedback on AI responses
CREATE TABLE IF NOT EXISTS public.chat_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  message_id TEXT NOT NULL, -- The ID of the specific message that received feedback
  feedback_type TEXT CHECK (feedback_type IN ('up', 'down', null)),
  before_json JSONB, -- State before the message (deck state, etc.)
  after_json JSONB, -- State after the message (deck state with changes)
  chat_history JSONB NOT NULL, -- The full chat history at the time of feedback
  message_text TEXT NOT NULL, -- The specific message that received feedback
  user_id TEXT, -- Optional user identifier
  metadata JSONB -- Additional metadata if needed
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS chat_feedback_message_id_idx ON public.chat_feedback(message_id);
CREATE INDEX IF NOT EXISTS chat_feedback_feedback_type_idx ON public.chat_feedback(feedback_type);

-- Add RLS policies
ALTER TABLE public.chat_feedback ENABLE ROW LEVEL SECURITY;

-- Grant access to anon and authenticated users
GRANT SELECT, INSERT ON public.chat_feedback TO anon, authenticated;
`;

// Function to create the table
async function createFeedbackTable() {
  console.log('Creating chat_feedback table in Supabase...');
  
  try {
    // Execute the SQL using Supabase's rpc function
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
      console.error('Error creating table:', error);
      // Try alternative approach if first method fails
      console.log('Trying alternative approach...');
      const { data: data2, error: error2 } = await supabase.from('_executesql').select('*').eq('query', sql).limit(1);
      
      if (error2) {
        console.error('Alternative approach failed:', error2);
        console.log('\nPlease run the SQL manually in the Supabase dashboard:');
        console.log('1. Go to https://app.supabase.com');
        console.log('2. Open your project');
        console.log('3. Go to the "SQL Editor" tab');
        console.log('4. Create a new query');
        console.log('5. Paste the SQL below and run it:\n');
        console.log(sql);
        return;
      }
      
      console.log('Table created successfully using alternative approach!');
      return;
    }
    
    console.log('Table created successfully!');
    console.log(data);
  } catch (err) {
    console.error('Unexpected error:', err);
    console.log('\nPlease run the SQL manually in the Supabase dashboard:');
    console.log('1. Go to https://app.supabase.com');
    console.log('2. Open your project');
    console.log('3. Go to the "SQL Editor" tab');
    console.log('4. Create a new query');
    console.log('5. Paste the SQL below and run it:\n');
    console.log(sql);
  }
}

// Run the function
createFeedbackTable();