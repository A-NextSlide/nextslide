/**
 * Service for creating test outlines for development/testing
 */
export class TestOutlineService {
  static createPikachuOutline(deckId: string, deckData: any) {
    const pikachuSlides = [
      {
        title: 'Pikachu: The Electric Icon',
        slide_type: 'title' as const,
        content: 'The world\'s most famous Pokémon',
        narrative_role: 'opening' as const,
        speaker_notes: 'Introduce Pikachu as a cultural phenomenon'
      },
      {
        title: 'Electric Powers & Abilities',
        slide_type: 'content' as const,
        content: 'Thunderbolt, Quick Attack, Iron Tail',
        narrative_role: 'supporting' as const,
        speaker_notes: 'Showcase Pikachu\'s signature moves'
      },
      {
        title: 'Cultural Impact',
        slide_type: 'content' as const,
        content: 'From mascot to global phenomenon',
        narrative_role: 'supporting' as const,
        speaker_notes: 'Pikachu in games, anime, and merchandise'
      },
      {
        title: 'Fun Facts',
        slide_type: 'content' as const,
        content: 'Species #025 • Loves ketchup • Says its own name',
        narrative_role: 'closing' as const,
        speaker_notes: 'End with memorable trivia'
      }
    ];
    
    const slideCount = Math.min(4, deckData.slides.length);
    
    return {
      id: deckId,
      title: 'Pikachu: The Electric Mouse Pokémon',
      topic: 'Pikachu',
      tone: 'engaging',
      narrative_arc: 'informative',
      slides: pikachuSlides.slice(0, slideCount).map((slideInfo, index) => ({
        id: deckData.slides[index]?.id || `slide-${index}`,
        title: slideInfo.title,
        slide_type: slideInfo.slide_type,
        content: slideInfo.content,
        narrative_role: slideInfo.narrative_role,
        speaker_notes: slideInfo.speaker_notes,
        extractedData: null,
        deepResearch: null
      })),
      metadata: {
        depth: 'concise',
        generation_time: new Date().toISOString(),
        slide_count: slideCount
      }
    };
  }
  
  static isTestDeck(deckData: any): boolean {
    return deckData.name?.toLowerCase().includes('test') && deckData.slides.length > 0;
  }
} 