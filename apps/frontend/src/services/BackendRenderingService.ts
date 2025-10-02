/**
 * Backend Rendering Service
 * 
 * Use this service in your backend to render decks using the headless rendering infrastructure
 */

import type { CompleteDeckData } from '@/types/DeckTypes';

export interface RenderOptions {
  format?: 'png' | 'jpeg' | 'webp';
  quality?: number;
  slideIndexes?: number[]; // Specific slides to render, or undefined for all
}

export interface RenderResult {
  success: boolean;
  slides?: Array<{
    slideId: string;
    html: string;
    screenshot: string; // Base64 data URL
  }>;
  error?: string;
}

export class BackendRenderingService {
  private apiUrl: string;
  private timeout: number;
  
  constructor(apiUrl: string = 'http://localhost:3333', timeout: number = 30000) {
    this.apiUrl = apiUrl;
    this.timeout = timeout;
  }

  /**
   * Check if the rendering service is healthy
   */
  async checkHealth(): Promise<{ healthy: boolean; renderers?: number }> {
    try {
      const response = await fetch(`${this.apiUrl}/health`);
      if (!response.ok) {
        return { healthy: false };
      }
      
      const data = await response.json();
      return {
        healthy: true,
        renderers: data.renderers
      };
    } catch (error) {
      console.error('Health check failed:', error);
      return { healthy: false };
    }
  }

  /**
   * Render a complete deck
   */
  async renderDeck(
    deckData: CompleteDeckData,
    options?: RenderOptions
  ): Promise<RenderResult> {
    try {
      // Check health first
      const health = await this.checkHealth();
      if (!health.healthy) {
        throw new Error('Rendering service is not healthy');
      }
      
      if (health.renderers === 0) {
        throw new Error('No renderers available. Please start the rendering service.');
      }

      // Prepare request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.apiUrl}/api/render`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deckData,
          slideIndexes: options?.slideIndexes
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Render request failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Rendering failed');
      }

      return {
        success: true,
        slides: result.results
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: `Rendering timed out after ${this.timeout}ms`
        };
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Render a single slide
   */
  async renderSlide(
    deckData: CompleteDeckData,
    slideIndex: number
  ): Promise<RenderResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.apiUrl}/api/render/${slideIndex}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deckData }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Render request failed: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.success || !result.result) {
        throw new Error(result.error || 'Rendering failed');
      }

      return {
        success: true,
        slides: [result.result]
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Save rendered slides to files
   */
  async saveRenderedSlides(
    slides: RenderResult['slides'],
    outputDir: string
  ): Promise<void> {
    if (!slides) return;

    const fs = await import('fs/promises');
    const path = await import('path');
    
    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      
      // Save HTML
      const htmlPath = path.join(outputDir, `slide-${i + 1}.html`);
      await fs.writeFile(htmlPath, slide.html);
      
      // Save screenshot
      const imgData = slide.screenshot.replace(/^data:image\/\w+;base64,/, '');
      const imgBuffer = Buffer.from(imgData, 'base64');
      const imgPath = path.join(outputDir, `slide-${i + 1}.png`);
      await fs.writeFile(imgPath, imgBuffer);
    }
  }
}

// Example usage for different backend frameworks:

/**
 * Express.js Example
 */
export const expressExample = `
import express from 'express';
import { BackendRenderingService } from './BackendRenderingService';

const app = express();
const renderingService = new BackendRenderingService();

app.post('/api/decks/:deckId/render', async (req, res) => {
  try {
    // Get deck data from your database
    const deckData = await getDeckFromDatabase(req.params.deckId);
    
    // Render the deck
    const result = await renderingService.renderDeck(deckData);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    
    // Save to S3 or return directly
    res.json({
      success: true,
      slides: result.slides?.length,
      preview: result.slides?.[0]?.screenshot
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
`;

/**
 * Next.js API Route Example
 */
export const nextjsExample = `
// pages/api/render-deck.ts or app/api/render-deck/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { BackendRenderingService } from '@/services/BackendRenderingService';

const renderingService = new BackendRenderingService(
  process.env.RENDERING_SERVICE_URL || 'http://localhost:3333'
);

export async function POST(request: NextRequest) {
  try {
    const { deckData } = await request.json();
    
    // Check service health
    const health = await renderingService.checkHealth();
    if (!health.healthy) {
      return NextResponse.json(
        { error: 'Rendering service unavailable' },
        { status: 503 }
      );
    }
    
    // Render deck
    const result = await renderingService.renderDeck(deckData);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      slides: result.slides
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
`;

/**
 * Python/FastAPI Example
 */
export const pythonExample = `
import requests
from typing import Optional, List, Dict
import os

class RenderingService:
    def __init__(self, api_url: str = "http://localhost:3333"):
        self.api_url = api_url
        
    def check_health(self) -> Dict:
        """Check if rendering service is healthy"""
        try:
            response = requests.get(f"{self.api_url}/health")
            return response.json()
        except:
            return {"healthy": False}
    
    def render_deck(self, deck_data: Dict, slide_indexes: Optional[List[int]] = None) -> Dict:
        """Render a deck and return the results"""
        health = self.check_health()
        if not health.get("renderers", 0) > 0:
            raise Exception("No renderers available")
            
        response = requests.post(
            f"{self.api_url}/api/render",
            json={"deckData": deck_data, "slideIndexes": slide_indexes},
            timeout=30
        )
        
        if not response.ok:
            raise Exception(f"Render failed: {response.status_code}")
            
        return response.json()

# FastAPI usage
from fastapi import FastAPI, HTTPException

app = FastAPI()
rendering_service = RenderingService()

@app.post("/api/render-deck")
async def render_deck(deck_data: dict):
    try:
        result = rendering_service.render_deck(deck_data)
        return {"success": True, "slides": len(result.get("results", []))}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
`; 