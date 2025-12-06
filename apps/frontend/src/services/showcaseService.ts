// Service to fetch featured/showcase decks for the landing page
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

// Hardcoded featured deck IDs - curated showcase presentations (ordered)
const FEATURED_DECK_IDS = [
  '88a6a5c6-035e-4ab0-9415-7e735bcc7aec', // 1. NextSlide.ai: The Future of Presentation Storytelling
  '2cb6a421-5751-465d-bc48-a9e943a127f6', // 2. Proving Trigonometric Identities: Math 30-1 Pure Mathematics
  '3990e7b6-7bf4-48a9-bd6c-e0de06bddb62', // 3. Badminton Skills Test - Henry Wise Wood High School
  '78e58c26-8133-407e-ac21-dab87edce4c6', // 4. Pinky and the Brain: Tonight's Plan to Take Over the World
  'e52311b1-f957-4873-b9ec-1cf285e05a87', // 5. Long Division Made Fun and Colorful
];

class ShowcaseService {
  /**
   * Fetch featured decks for the landing page showcase
   * This queries public/unlisted decks or specific featured decks
   */
  async getFeaturedDecks(limit: number = 6): Promise<ShowcaseDeck[]> {
    try {
      // First try to get decks by featured IDs if configured
      if (FEATURED_DECK_IDS.length > 0) {
        const { data, error } = await supabase
          .from('decks')
          .select('*')
          .in('uuid', FEATURED_DECK_IDS)
          .limit(limit);

        if (!error && data && data.length > 0) {
          // Sort results to match FEATURED_DECK_IDS order
          const sortedData = [...data].sort((a, b) => {
            const indexA = FEATURED_DECK_IDS.indexOf(a.uuid);
            const indexB = FEATURED_DECK_IDS.indexOf(b.uuid);
            return indexA - indexB;
          });
          return this.formatDecks(sortedData);
        }
      }

      // Fallback: Get recent public decks or just recent decks with content
      const { data, error } = await supabase
        .from('decks')
        .select('*')
        .not('slides', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(limit * 2); // Get more to filter

      if (error) {
        console.error('[ShowcaseService] Error fetching decks:', error);
        return [];
      }

      // Filter to only include decks with actual slide content
      const validDecks = (data || [])
        .filter(deck => {
          const slides = this.parseSlides(deck.slides);
          return slides.length > 0 && this.hasVisibleContent(slides[0]);
        })
        .slice(0, limit);

      return this.formatDecks(validDecks);
    } catch (err) {
      console.error('[ShowcaseService] Failed to fetch featured decks:', err);
      return [];
    }
  }

  /**
   * Get a single deck by UUID for detailed showcase view
   */
  async getDeckById(uuid: string): Promise<ShowcaseDeck | null> {
    try {
      const { data, error } = await supabase
        .from('decks')
        .select('*')
        .eq('uuid', uuid)
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

  private hasVisibleContent(slide: SlideData): boolean {
    if (!slide || !slide.components) return false;
    
    return slide.components.some(component => 
      component.type !== 'Background' && 
      component.props?.src !== '/placeholder.svg'
    );
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

