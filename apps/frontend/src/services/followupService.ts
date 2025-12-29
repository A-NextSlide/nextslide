/**
 * Service for generating personalized follow-up messages after deck generation.
 */

import { API_CONFIG } from '@/config/environment';

interface SlideInfo {
  title?: string;
  type?: string;
  has_images: boolean;
  has_chart: boolean;
  element_count: number;
}

interface FollowUpRequest {
  slides: SlideInfo[];
  deck_title?: string;
  topic?: string;
}

interface FollowUpResponse {
  message: string;
}

/**
 * Extracts minimal slide info for the follow-up API
 */
export function extractSlideInfo(slides: any[]): SlideInfo[] {
  return slides.map(slide => {
    const elements = slide.elements || [];

    // Detect slide type based on content
    let type = 'content';
    const title = slide.title || '';
    const titleLower = title.toLowerCase();

    if (titleLower.includes('team') || titleLower.includes('about us') || titleLower.includes('our people')) {
      type = 'team';
    } else if (titleLower.includes('contact') || titleLower.includes('get in touch')) {
      type = 'contact';
    } else if (titleLower.includes('thank') || titleLower.includes('q&a') || titleLower.includes('questions')) {
      type = 'closing';
    } else if (slide.order === 0 || titleLower.includes('intro') || titleLower.includes('welcome')) {
      type = 'title';
    }

    // Check for images and charts
    const hasImages = elements.some((el: any) =>
      el.type === 'image' || el.type === 'icon' || el.elementType === 'image'
    );
    const hasChart = elements.some((el: any) =>
      el.type === 'chart' || el.elementType === 'chart' ||
      (el.type === 'text' && el.content?.includes('chart'))
    );

    return {
      title: slide.title || `Slide ${(slide.order || 0) + 1}`,
      type,
      has_images: hasImages,
      has_chart: hasChart,
      element_count: elements.length
    };
  });
}

/**
 * Generate a personalized follow-up message based on deck slides
 */
export async function generateFollowUpMessage(
  slides: any[],
  deckTitle?: string,
  topic?: string
): Promise<string> {
  try {
    const slideInfo = extractSlideInfo(slides);

    const request: FollowUpRequest = {
      slides: slideInfo,
      deck_title: deckTitle,
      topic
    };

    const response = await fetch(`${API_CONFIG.BASE_URL}/api/generate-followup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data: FollowUpResponse = await response.json();
    return data.message;

  } catch (error) {
    console.error('[followupService] Error generating follow-up message:', error);
    // Return fallback message
    return "Your presentation is ready! I can refine, redesign, or fix anything here. Try: 'Make this cleaner,' 'Redesign this slide,' or 'Add a chart from this data.'";
  }
}
