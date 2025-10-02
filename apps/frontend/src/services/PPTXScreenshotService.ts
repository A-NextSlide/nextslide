/**
 * Service for generating screenshots from PPTX files
 * Provides both client-side (approximation) and server-side (accurate) options
 */

export interface PPTXScreenshotOptions {
  method?: 'client' | 'server' | 'demo';
  serverUrl?: string; // URL of the conversion service
  quality?: number; // 0-1 for JPEG quality
  format?: 'png' | 'jpeg';
  slideNumbers?: number[]; // Specific slides to capture, or all if not specified
}

export interface SlideScreenshot {
  slideNumber: number;
  dataUrl: string;
  width: number;
  height: number;
}

export class PPTXScreenshotService {
  /**
   * Generate screenshots from a PPTX file
   */
  static async generateScreenshots(
    file: File,
    options: PPTXScreenshotOptions = {}
  ): Promise<SlideScreenshot[]> {
    const { method = 'server', serverUrl, format = 'png' } = options;

    if (method === 'server') {
      // Use the main chat server with PPTX conversion integrated
      const url = serverUrl || 'http://localhost:9090/api/pptx-convert';
      
      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch(url, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Server error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        
        if (result.success && result.screenshots) {
          return result.screenshots;
        } else {
          throw new Error(result.error || 'Conversion failed');
        }
      } catch (error) {
        console.error('Error calling PPTX conversion server:', error);
        throw error;
      }
    } else if (method === 'demo') {
      return this.generateDemoScreenshots();
    } else {
      return this.generateClientSideScreenshots(file, options);
    }
  }

  /**
   * Client-side screenshot generation (approximation)
   * This uses the parsed slide data to create a rough preview
   */
  private static async generateClientSideScreenshots(
    file: File,
    options: PPTXScreenshotOptions
  ): Promise<SlideScreenshot[]> {
    // This would use the existing parsing logic to render slides
    // and then capture them using html2canvas
    console.warn(
      'Client-side screenshot generation provides only an approximation. ' +
      'For accurate screenshots, use server-side conversion.'
    );
    
    // For now, return empty array as this would require integration
    // with the existing parsing and rendering logic
    return [];
  }

  /**
   * Demo mode - shows placeholder with comparison information
   */
  private static async generateDemoScreenshots(): Promise<SlideScreenshot[]> {
    // Create a canvas with demo information
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // Background
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Border
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
      
      // Title
      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 72px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Actual PPTX Screenshot', canvas.width / 2, 200);
      
      // Subtitle
      ctx.font = '48px Arial';
      ctx.fillStyle = '#4b5563';
      ctx.fillText('Server-side rendering required', canvas.width / 2, 300);
      
      // Info box
      const boxY = 400;
      const boxHeight = 500;
      const boxPadding = 100;
      
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(boxPadding, boxY, canvas.width - boxPadding * 2, boxHeight);
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 2;
      ctx.strokeRect(boxPadding, boxY, canvas.width - boxPadding * 2, boxHeight);
      
      // Comparison text
      ctx.fillStyle = '#374151';
      ctx.font = '36px Arial';
      ctx.textAlign = 'left';
      
      const lines = [
        '✅ Parsed Preview (Current View):',
        '   • Fast, works in browser',
        '   • May not match PowerPoint exactly',
        '',
        '🎯 Actual PPTX View (This Feature):',
        '   • Exact PowerPoint rendering',
        '   • Requires server setup',
        '   • See docs/PPTX_SCREENSHOTS.md'
      ];
      
      let y = boxY + 80;
      lines.forEach(line => {
        ctx.fillText(line, boxPadding + 50, y);
        y += 50;
      });
      
      // Footer
      ctx.font = 'italic 32px Arial';
      ctx.fillStyle = '#6b7280';
      ctx.textAlign = 'center';
      ctx.fillText('This is a demo showing where actual screenshots would appear', canvas.width / 2, canvas.height - 100);
    }
    
    return [{
      slideNumber: 1,
      dataUrl: canvas.toDataURL('image/png'),
      width: 1920,
      height: 1080
    }];
  }
}