/**
 * ChatbaseIdentify - Handles Chatbase identity verification for logged-in users
 * This component fetches a JWT token from the backend and identifies the user with Chatbase
 */
import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/SupabaseAuthContext';
import { API_CONFIG } from '@/config/environment';

declare global {
  interface Window {
    chatbase?: (...args: any[]) => void;
  }
}

export function ChatbaseIdentify() {
  const { user, session } = useAuth();
  const identifiedUserRef = useRef<string | null>(null);

  useEffect(() => {
    // Only identify if user is logged in and we haven't already identified them
    if (!user || !session?.access_token) {
      // Reset if user logs out
      if (identifiedUserRef.current && window.chatbase) {
        window.chatbase('reset');
        identifiedUserRef.current = null;
      }
      return;
    }

    // Don't re-identify the same user
    if (identifiedUserRef.current === user.id) {
      return;
    }

    const identifyUser = async () => {
      try {
        const apiBase = API_CONFIG.BASE_URL.replace(/\/$/, '');
        const response = await fetch(`${apiBase}/chatbase/identity-token`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          console.warn('[Chatbase] Failed to get identity token:', response.status);
          return;
        }

        const data = await response.json();

        if (data.token && window.chatbase) {
          window.chatbase('identify', { token: data.token });
          identifiedUserRef.current = user.id;
          console.log('[Chatbase] User identified successfully');
        }
      } catch (error) {
        console.warn('[Chatbase] Error identifying user:', error);
      }
    };

    // Wait for chatbase to be ready
    const checkAndIdentify = () => {
      if (window.chatbase) {
        identifyUser();
      } else {
        // Retry after a short delay if chatbase isn't loaded yet
        setTimeout(checkAndIdentify, 1000);
      }
    };

    checkAndIdentify();
  }, [user, session]);

  return null;
}

export default ChatbaseIdentify;
