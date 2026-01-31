/**
 * LinkedIn Carousel Export API Service
 *
 * Handles exporting decks as LinkedIn carousel PDFs.
 */

import { authService } from './authService';

const rawApiBase = import.meta.env.VITE_API_URL || '';
const API_BASE = rawApiBase.replace(/\/api\/?$/, '');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CarouselExportParams {
  deckId: string;
  slides: any[];
  title: string;
  format: 'square' | 'portrait';
}

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

class CarouselExportApi {
  private getHeaders(): Record<string, string> {
    let token: string | null = null;
    try {
      token = authService.getAuthToken();
    } catch (e) {
      console.warn('[CarouselExportApi] Failed to get auth token:', e);
    }
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  /**
   * Export a deck as a LinkedIn carousel PDF.
   * Returns a Blob that can be downloaded.
   */
  async exportLinkedInCarousel(params: CarouselExportParams): Promise<Blob> {
    const response = await fetch(`${API_BASE}/api/export/linkedin-carousel`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        deck_id: params.deckId,
        slides: params.slides,
        title: params.title,
        format: params.format,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Failed to export carousel: ${response.status} - ${errorText}`);
    }

    return response.blob();
  }
}

export const carouselExportApi = new CarouselExportApi();

/**
 * Convenience function for direct imports.
 */
export async function exportLinkedInCarousel(params: CarouselExportParams): Promise<Blob> {
  return carouselExportApi.exportLinkedInCarousel(params);
}
