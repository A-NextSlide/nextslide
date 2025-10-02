import { SlideData } from "@/types/SlideTypes";
import { CompleteDeckData } from "@/types/DeckTypes";
import { extractDeckComponents } from "./componentExtractor";
import { supabase } from "@/integrations/supabase/client";
import { Json } from "@/integrations/supabase/types";
import { ComponentInstance } from "@/types/components";
import { createComponent } from "@/utils/componentUtils";

/**
 * Service to handle synchronization of slide edits with the backend
 */
export class SlideSyncService {
  private baseUrl: string;
  private useSupabase: boolean;
  
  constructor(apiBaseUrl: string = "/api", useSupabase: boolean = true) {
    this.baseUrl = apiBaseUrl;
    this.useSupabase = useSupabase;
  }

  /**
   * Records an edit to the slide_edits table in Supabase
   * @param slideId The ID of the slide being edited
   * @param componentId Optional ID of the specific component being edited
   * @param payload The data payload being sent
   * @param editType The type of edit being performed (e.g., 'slide_update', 'component_update')
   * @returns Promise with the result of the database insertion
   */
  private async recordEdit(slideId: string, payload: any, editType: string, componentId?: string) {
    if (!this.useSupabase) return;
    
    try {
      console.log(`Recording edit to Supabase: ${editType} for slide ${slideId}`, {
        slideId,
        componentId,
        editType,
        payloadSummary: JSON.stringify(payload).substring(0, 100) + '...'
      });

      const { data, error } = await supabase
        .from('deck_versions')
        .insert({
          deck_id: slideId,
          data: payload as Json,
          metadata: { editType, componentId }
        });

      if (error) {
        console.error('Error recording edit:', error);
      }
      
      return { data, error };
    } catch (err) {
      console.error('Failed to record edit to Supabase:', err);
    }
  }

  /**
   * Formats a slide for storage in Supabase
   */
  private formatSlideForSupabase(slide: SlideData): {
    id: string;
    title: string;
    components: Json;
  } {
    // Ensure background is included in components if not already present
    const componentsWithBg = [...(slide.components || [])];
    const hasBg = componentsWithBg.some(c => c.props?.isBackground || c.type === 'Background');
    if (!hasBg) {
      // Add a default background component if missing
      componentsWithBg.unshift(createComponent('Background', {}, `background-${slide.id}`));
    }

    return {
      id: slide.id,
      title: slide.title,
      components: componentsWithBg as unknown as Json
    };
  }

  /**
   * Formats a record from Supabase into a SlideData object
   */
  private formatSupabaseToSlide(record: any): SlideData {
    const components = (record.components || []) as ComponentInstance[];

    // Ensure there IS a background component
    let background = components.find(c => c.props?.isBackground || c.type === 'Background');
    if (!background) {
      background = createComponent('Background', {}, `background-${record.id}`);
      // Add the created background to the components list if it wasn't found
      components.unshift(background);
    }

    return {
      id: record.id,
      title: record.title,
      components: components
    };
  }

  /**
   * Saves a slide by updating the slides array in the deck
   * This method is now updated to work with the decks table instead of the slides table
   */
  private async saveSlideToTable(slide: SlideData): Promise<{ data: any, error: any } | undefined> {
    if (!this.useSupabase) return;
    
    try {
      // We need to find which deck contains this slide
      const { data: deckData, error: deckError } = await supabase
        .from('decks')
        .select('*');
      
      if (deckError) {
        console.error('Error fetching decks to update slide:', deckError);
        return { data: null, error: deckError };
      }
      
      // Find the deck that contains this slide
      let targetDeck = null;
      let slideIndex = -1;
      
      for (const deck of deckData) {
        // Ensure deck.slides is an array before using findIndex
        if (!deck.slides || !Array.isArray(deck.slides)) continue;
        
        slideIndex = deck.slides.findIndex((s: any) => s.id === slide.id);
        if (slideIndex !== -1) {
          targetDeck = deck;
          break;
        }
      }
      
      if (!targetDeck) {
        console.error(`Slide ${slide.id} not found in any deck`);
        return { data: null, error: new Error(`Slide ${slide.id} not found in any deck`) };
      }
      
      // Update the slide in the deck
      const updatedSlides = [...targetDeck.slides];
      updatedSlides[slideIndex] = slide;
      
      // Update the deck in Supabase
      const { data, error } = await supabase
        .from('decks')
        .update({ 
          slides: updatedSlides,
          lastModified: new Date().toISOString()
        })
        .eq('uuid', targetDeck.uuid);
      
      if (error) {
        console.error(`Error updating slide ${slide.id} in deck:`, error);
        return { data: null, error };
      }
      
      return { data, error: null };
    } catch (err) {
      console.error('Failed to save slide to deck in Supabase:', err);
      return { data: null, error: err };
    }
  }

  /**
   * Sends a slide update to the backend
   * @param slide The slide with updated data
   * @param allSlides All slides in the deck (for component extraction)
   * @returns Response from the backend
   */
  async sendSlideUpdate(slide: SlideData, allSlides: SlideData[]): Promise<Response> {
    // Record the edit in Supabase
    await this.recordEdit(slide.id, slide, 'slide_update');
    
    // Save the actual slide
    const saveResult = await this.saveSlideToTable(slide);
    
    if (this.useSupabase) {
      // If we're using Supabase, return a mock response
      if (saveResult?.error) {
        return new Response(JSON.stringify({ error: saveResult.error }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ success: true, slide }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Extract components from all slides for the update
    const componentData = extractDeckComponents(allSlides);
    
    // Use the REST API if not using Supabase
    try {
      const response = await fetch(`${this.baseUrl}/slides/${slide.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slide,
          componentData
        }),
      });
      
      return response;
    } catch (err) {
      console.error('Error sending slide update:', err);
      return new Response(JSON.stringify({ error: 'Failed to send slide update' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * Sends a component update to the backend
   * @param slideId The ID of the slide containing the component
   * @param componentId The ID of the component being updated
   * @param componentData The updated component data
   * @param allSlides All slides in the deck (for component extraction)
   * @returns Response from the backend
   */
  async sendComponentUpdate(
    slideId: string, 
    componentId: string, 
    componentData: Partial<ComponentInstance>,
    allSlides: SlideData[]
  ): Promise<Response> {
    // Record the edit in Supabase
    await this.recordEdit(slideId, componentData, 'component_update', componentId);
    
    if (this.useSupabase) {
      // Find the slide
      const slide = allSlides.find(s => s.id === slideId);
      if (!slide) {
        return new Response(JSON.stringify({ error: 'Slide not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Update the component in the slide
      const updatedSlide = {
        ...slide,
        components: slide.components?.map(comp => 
          comp.id === componentId ? { ...comp, ...componentData } : comp
        )
      };
      
      // Save the updated slide
      const saveResult = await this.saveSlideToTable(updatedSlide);
      
      if (saveResult?.error) {
        return new Response(JSON.stringify({ error: saveResult.error }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ success: true, slide: updatedSlide }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Extract components from all slides for the update
    const fullComponentData = extractDeckComponents(allSlides);
    
    // Use the REST API if not using Supabase
    try {
      const response = await fetch(`${this.baseUrl}/slides/${slideId}/components/${componentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          componentData,
          fullComponentData
        }),
      });
      
      return response;
    } catch (err) {
      console.error('Error sending component update:', err);
      return new Response(JSON.stringify({ error: 'Failed to send component update' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * Gets all slides from all decks
   * @returns Array of SlideData objects
   */
  async getSlides(): Promise<SlideData[]> {
    if (this.useSupabase) {
      try {
        // Fetch all decks and extract slides
        const { data: decks, error } = await supabase
          .from('decks')
          .select('*');
        
        if (error) {
          console.error('Error fetching decks from Supabase:', error);
          return [];
        }
        
        // Collect all slides from all decks
        let allSlides: SlideData[] = [];
        
        for (const deck of decks) {
          if (deck.slides && Array.isArray(deck.slides)) {
            // Add slides from this deck to the collection
            // Format each slide to ensure consistent structure
            const formattedSlides = deck.slides.map((slide: any) => this.formatSupabaseToSlide(slide));
            allSlides = [...allSlides, ...formattedSlides];
          }
        }
        
        return allSlides;
      } catch (err) {
        console.error('Failed to fetch slides from Supabase decks:', err);
        return [];
      }
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/slides`);
      const data = await response.json();
      return data.slides;
    } catch (err) {
      console.error('Error fetching slides:', err);
      return [];
    }
  }

  /**
   * Gets a specific slide from a deck
   * @param slideId The ID of the slide to fetch
   * @returns The SlideData object
   */
  async getSlide(slideId: string): Promise<SlideData> {
    if (this.useSupabase) {
      try {
        // Fetch all decks
        const { data: decks, error } = await supabase
          .from('decks')
          .select('*');
        
        if (error) {
          console.error('Error fetching decks from Supabase:', error);
          throw new Error(`Error fetching decks: ${error.message}`);
        }
        
        // Find the slide in any deck
        for (const deck of decks) {
          if (!deck.slides || !Array.isArray(deck.slides)) continue;
          
          const slide = deck.slides.find((s: any) => s.id === slideId);
          if (slide) {
            return this.formatSupabaseToSlide(slide);
          }
        }
        
        // If we get here, the slide wasn't found
        throw new Error(`Slide ${slideId} not found in any deck`);
      } catch (err) {
        console.error(`Failed to fetch slide ${slideId} from Supabase:`, err);
        throw err;
      }
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/slides/${slideId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch slide ${slideId}: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.slide;
    } catch (err) {
      console.error(`Error fetching slide ${slideId}:`, err);
      throw err;
    }
  }

  /**
   * Gets the complete deck data including all slides and components
   * @returns CompleteDeckData object
   */
  async getCompleteDeck(): Promise<CompleteDeckData> {
    const slides = await this.getSlides();
    
    if (slides.length === 0) {
      // Return a complete CompleteDeckData object with all required properties
      // Ensure this matches the actual type definition
      return {
        uuid: '', // Provide a default UUID or handle appropriately
        name: 'Empty Deck',
        slides: [],
        version: '1.0.0',
        lastModified: new Date().toISOString()
        // size is optional, omit if not needed
      };
    }
    
    // Construct the return object based on the FIRST deck found containing slides
    // This assumes all slides belong to one conceptual deck for this function's purpose
    // A more robust implementation might require passing a deckId
    const deckInfo = await this.findDeckForSlides(slides);

    return {
      uuid: deckInfo?.uuid || '', // Use found deck UUID or default
      name: deckInfo?.name || 'Deck', // Use found deck name or default
      slides: slides, // The slides fetched earlier
      version: deckInfo?.version || '1.0.0', // Use found deck version or default
      lastModified: deckInfo?.lastModified || new Date().toISOString(), // Use found deck timestamp or default
      // size is optional
    };
  }

  /**
   * Gets the edit history for a slide
   * @param slideId Optional slide ID to filter by
   * @param limit Number of edits to fetch
   * @returns Array of edit history records
   */
  async getEditHistory(slideId?: string, limit: number = 20) {
    if (!this.useSupabase) {
      return [];
    }
    
    try {
      let query = supabase
        .from('deck_versions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (slideId) {
        query = query.eq('deck_id', slideId);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching edit history:', error);
        return [];
      }
      
      return data;
    } catch (err) {
      console.error('Failed to fetch edit history:', err);
      return [];
    }
  }

  /**
   * Deletes a slide from its deck
   * @param slideId The ID of the slide to delete
   * @returns True if successful, false otherwise
   */
  async deleteSlide(slideId: string) {
    // Record the delete operation
    await this.recordEdit(slideId, { id: slideId }, 'slide_delete');
    
    if (this.useSupabase) {
      try {
        // Find which deck contains this slide
        const { data: decks, error: deckError } = await supabase
          .from('decks')
          .select('*');
        
        if (deckError) {
          console.error('Error fetching decks to delete slide:', deckError);
          return false;
        }
        
        // Find the deck containing the slide
        let targetDeck = null;
        let targetSlideIndex = -1;
        
        for (const deck of decks) {
          if (!deck.slides || !Array.isArray(deck.slides)) continue;
          
          const slideIndex = deck.slides.findIndex((s: any) => s.id === slideId);
          if (slideIndex !== -1) {
            targetDeck = deck;
            targetSlideIndex = slideIndex;
            break;
          }
        }
        
        if (!targetDeck) {
          console.error(`Slide ${slideId} not found in any deck for deletion`);
          return false;
        }
        
        // Remove the slide from the deck's slides array
        const updatedSlides = [...targetDeck.slides];
        updatedSlides.splice(targetSlideIndex, 1);
        
        // Update the deck with the modified slides array
        const { error } = await supabase
          .from('decks')
          .update({ 
            slides: updatedSlides,
            lastModified: new Date().toISOString()
          })
          .eq('uuid', targetDeck.uuid);
        
        if (error) {
          console.error(`Error updating deck after deleting slide ${slideId}:`, error);
          return false;
        }
        
        return true;
      } catch (err) {
        console.error(`Failed to delete slide ${slideId}:`, err);
        return false;
      }
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/slides/${slideId}`, {
        method: 'DELETE',
      });
      
      return response.ok;
    } catch (err) {
      console.error(`Error deleting slide ${slideId}:`, err);
      return false;
    }
  }

  // Helper function to find the deck associated with the first slide
  private async findDeckForSlides(slides: SlideData[]): Promise<{ uuid: string; name: string; version: string; lastModified: string } | null> {
    if (!slides || slides.length === 0) return null;
    const firstSlideId = slides[0].id;

    try {
      const { data: decks, error } = await supabase
        .from('decks')
        .select('uuid, name, version, lastModified, slides');

      if (error) {
        console.error('Error fetching decks to find deck info:', error);
        return null;
      }

      for (const deck of decks) {
        if (deck.slides && Array.isArray(deck.slides)) {
          if (deck.slides.some((s: any) => s.id === firstSlideId)) {
            return {
              uuid: deck.uuid,
              name: deck.name || 'Untitled Deck',
              version: deck.version || '1.0',
              lastModified: deck.lastModified || new Date().toISOString()
            };
          }
        }
      }
      return null; // Deck not found
    } catch (err) {
      console.error('Error in findDeckForSlides:', err);
      return null;
    }
  }
}

// Create a singleton instance
// Create a singleton instance with a warning about using the decks table
export const slideSyncService = new SlideSyncService();

// Add console warning about slide operations using decks table
// console.warn(
//   'SlideSyncService is now using the decks table instead of the slides table. ' +
//   'Slides are stored as arrays within deck objects. The slides table no longer exists.'
// );

