// Service to fetch featured/showcase decks for the landing page
// Uses the featured_decks table which has public read access (no auth required)
import { supabase } from '@/integrations/supabase/client';
import { SlideData } from '@/types/SlideTypes';

export interface ShowcaseDeck {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  slides: SlideData[];
  slideCount: number;
  createdAt: string;
  thumbnail?: string;
}

class ShowcaseService {
  /**
   * Fetch featured decks for the landing page showcase
   * Uses the dedicated featured_decks table with public read access
   */
  async getFeaturedDecks(limit: number = 6): Promise<ShowcaseDeck[]> {
    try {
      const { data, error } = await supabase
        .from('featured_decks')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .limit(limit);

      if (error) {
        console.error('[ShowcaseService] Error fetching featured decks:', error);
        return [];
      }

      if (!data || data.length === 0) {
        console.warn('[ShowcaseService] No featured decks found');
        return [];
      }

      return this.formatDecks(data);
    } catch (err) {
      console.error('[ShowcaseService] Failed to fetch featured decks:', err);
      return [];
    }
  }

  /**
   * Get a single featured deck by UUID
   */
  async getDeckById(uuid: string): Promise<ShowcaseDeck | null> {
    try {
      const { data, error } = await supabase
        .from('featured_decks')
        .select('*')
        .eq('uuid', uuid)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        console.error('[ShowcaseService] Error fetching deck:', error);
        return null;
      }

      const formatted = this.formatDecks([data]);
      return formatted[0] || null;
    } catch (err) {
      console.error('[ShowcaseService] Failed to fetch deck:', err);
      return null;
    }
  }

  private parseSlides(slidesData: any): SlideData[] {
    if (!slidesData) return [];
    
    if (Array.isArray(slidesData)) {
      return slidesData;
    }
    
    if (typeof slidesData === 'string') {
      try {
        return JSON.parse(slidesData);
      } catch {
        return [];
      }
    }
    
    return [];
  }

  private formatDecks(decks: any[]): ShowcaseDeck[] {
    return decks.map(deck => {
      const slides = this.parseSlides(deck.slides);
      
      return {
        id: deck.id,
        uuid: deck.uuid || deck.id,
        name: deck.name || 'Untitled Presentation',
        description: deck.description,
        slides,
        slideCount: slides.length,
        createdAt: deck.created_at || deck.createdAt,
        thumbnail: undefined, // Could add thumbnail URL if stored
      };
    });
  }
}

export const showcaseService = new ShowcaseService();

