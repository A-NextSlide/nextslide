/**
 * Feedback Service for storing AI chat response feedback
 */
import { supabase } from '@/integrations/supabase/client';
import { FeedbackType } from '@/components/ChatMessage';
import { ChatMessageProps } from '@/components/ChatMessage';
import { ExtendedChatMessageProps } from '@/components/ChatPanel';
import { DeckData } from '@/types/DeckTypes';

/**
 * Interface for the feedback data to be saved
 */
export interface FeedbackData {
  messageId: string;
  feedbackType: FeedbackType;
  beforeJson?: any;
  afterJson?: any;
  chatHistory: ExtendedChatMessageProps[];
  messageText: string;
  userId?: string;
  metadata?: Record<string, any>;
}

/**
 * Save feedback for an AI message
 * @param feedbackData The feedback data to save
 */
export const saveFeedback = async (feedbackData: FeedbackData) => {
  try {
    console.log('Saving feedback to Supabase:', {
      messageId: feedbackData.messageId,
      feedbackType: feedbackData.feedbackType,
      messageText: feedbackData.messageText.substring(0, 50) + '...' // log just beginning for brevity
    });
    
    // Prepare payload with explicit nulls for debugging
    const payload = {
      message_id: feedbackData.messageId,
      feedback_type: feedbackData.feedbackType,
      before_json: feedbackData.beforeJson || null,
      after_json: feedbackData.afterJson || null,
      chat_history: feedbackData.chatHistory || [],
      message_text: feedbackData.messageText,
      user_id: feedbackData.userId || null,
      metadata: feedbackData.metadata || null
    };
    
    console.log('Supabase insert payload (structure):', 
      Object.keys(payload).reduce((acc, key) => {
        acc[key] = typeof payload[key];
        return acc;
      }, {})
    );
    
    const { data, error } = await supabase
      .from('chat_feedback')
      .insert(payload)
      .select();  // Return the inserted row for verification

    if (error) {
      console.error('Error saving feedback to Supabase:', error);
      console.error('Error details:', error.details, error.hint, error.message);
      return { success: false, error };
    }

    console.log('Feedback saved successfully:', data);
    return { success: true, data };
  } catch (error) {
    console.error('Unexpected error saving feedback:', error);
    return { success: false, error };
  }
};

/**
 * Get feedback for a specific message
 * @param messageId The ID of the message
 */
export const getFeedbackForMessage = async (messageId: string) => {
  try {
    const { data, error } = await supabase
      .from('chat_feedback')
      .select('*')
      .eq('message_id', messageId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error fetching feedback:', error);
      return { success: false, error };
    }

    return { success: true, data: data?.[0] || null };
  } catch (error) {
    console.error('Unexpected error fetching feedback:', error);
    return { success: false, error };
  }
};

/**
 * Get all feedback for analysis
 */
export const getAllFeedback = async (limit = 100, offset = 0) => {
  try {
    const { data, error } = await supabase
      .from('chat_feedback')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching all feedback:', error);
      return { success: false, error };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    console.error('Unexpected error fetching all feedback:', error);
    return { success: false, error };
  }
};

/**
 * Delete feedback entry
 * @param id The feedback ID to delete
 */
export const deleteFeedback = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('chat_feedback')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting feedback:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    console.error('Unexpected error deleting feedback:', error);
    return { success: false, error };
  }
};