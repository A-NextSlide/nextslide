/**
 * HTML generation utilities that use the templates
 */
import { SlideData, DeckDiff } from '../types';
import { 
  generateExperimentHtml, 
  generateErrorHtml,
  generateQualityScoreHtml
} from './templates';
import { renderSlideToHTML, renderSlideToImage } from '@ssr/index.js';
import { QualityEvaluation, ExperimentResult } from './types';
import path from 'path';
import fs from 'fs/promises';

/**
 * Generates HTML for experiment results
 */
export function generateExperimentResultHtml(params: {
  id: string;
  description: string;
  prompt: string;
  beforeSlide: SlideData;
  afterSlide: SlideData;
  beforeDeckSlides: SlideData[];
  afterDeckSlides: SlideData[];
  deckDiff: DeckDiff;
  messages: string[];
  metadata: Record<string, any>;
  outputPath: string;
  experimentDeckId?: string;
  qualityEvaluation?: QualityEvaluation;
}): string {
  const {
    id,
    description,
    prompt,
    beforeSlide,
    afterSlide,
    beforeDeckSlides,
    afterDeckSlides,
    deckDiff,
    messages,
    metadata,
    experimentDeckId,
    qualityEvaluation
  } = params;

  // Generate timestamp
  const timestamp = new Date().toISOString();

  // Generate the Before slides HTML
  const beforeDeckId = `${experimentDeckId || id}-before-deck`;
  const beforeSlidesHtml = generateSlidesHtml({ slides: beforeDeckSlides, deckId: beforeDeckId });
  
  // Generate the After slides HTML
  const afterDeckId = `${experimentDeckId || id}-after-deck`;
  const afterSlidesHtml = generateSlidesHtml({ slides: afterDeckSlides, deckId: afterDeckId });
  
  // Generate messages HTML
  const messagesHtml = messages.map(m => `<div class="message">${m}</div>`).join('');
  
  // Generate metadata table rows
  const metadataEntriesHtml = Object.entries(metadata)
    .filter(([key]) => key !== 'qualityEvaluation')
    .map(([key, value]) => `
      <tr>
        <th>${key}</th>
        <td>${typeof value === 'object' ? JSON.stringify(value) : value}</td>
      </tr>
    `).join('');
  
  // Generate quality score HTML if available
  const qualityScoreHtml = qualityEvaluation ? generateQualityScoreHtml(qualityEvaluation) : '';
  
  // Generate the final HTML
  return generateExperimentHtml({
    id,
    description,
    prompt,
    beforeSlidesHtml,
    afterSlidesHtml,
    beforeDeckDataJson: JSON.stringify({ slides: beforeDeckSlides }, null, 2),
    afterDeckDataJson: JSON.stringify({ slides: afterDeckSlides }, null, 2),
    deckDiffJson: JSON.stringify(deckDiff, null, 2),
    messagesHtml,
    metadataEntriesHtml,
    timestamp,
    qualityScoreHtml
  });
}

/**
 * Generates HTML for experiment errors
 */
export function generateExperimentErrorHtml(params: {
  id: string;
  description: string;
  prompt: string;
  beforeSlide: SlideData;
  beforeDeckSlides: SlideData[];
  errorMessage: string;
  metadata: Record<string, any>;
  apiLatency?: number;
}): string {
  const {
    id,
    description,
    prompt,
    beforeSlide,
    beforeDeckSlides,
    errorMessage,
    metadata,
    apiLatency
  } = params;

  // Generate timestamp
  const timestamp = new Date().toISOString();

  // Generate the Before slides HTML
  const beforeDeckId = `${id}-before-deck`;
  const beforeSlidesHtml = generateSlidesHtml({ slides: beforeDeckSlides, deckId: beforeDeckId });
  
  // Generate metadata table rows
  const metadataEntriesHtml = Object.entries(metadata).map(([key, value]) => `
    <tr>
      <th>${key}</th>
      <td>${typeof value === 'object' ? JSON.stringify(value) : value}</td>
    </tr>
  `).join('');
  
  // Generate the final HTML
  return generateErrorHtml({
    id,
    description,
    prompt,
    beforeSlidesHtml,
    errorMessage,
    metadataEntriesHtml,
    timestamp,
    beforeDeckDataJson: JSON.stringify({ slides: beforeDeckSlides }, null, 2),
    apiLatency
  });
}

/**
 * Helper function to generate HTML for slides
 */
export function generateSlidesHtml(params: { slides: SlideData[], deckId: string }): string {
  const { slides, deckId } = params;
  return slides.map((slide, index) => {
    const slideHtml = renderSlideToHTML(
      slide, 
      { 
        width: 1920,
        height: 1080,
        debug: false,
        includeDimensions: true
      },
      true // inlineMode as third parameter
    );

    
    return `
    <!-- START SLIDE CONTAINER: Slide #${index + 1} | ID: ${slide.id} | Deck: ${deckId} -->
    <div class="slide-item">
      <div class="slide-label">Slide ${index + 1}: ${slide.title || slide.id}</div>
      <div class="slide-container">
        ${slideHtml}
      </div>
    </div>
    <!-- END SLIDE CONTAINER: Slide #${index + 1} | ID: ${slide.id} -->
    `;
  }).join('');
}

/**
 * Generates images for slides and saves them in the experiment directory
 * 
 * @param slides The slide data to render
 * @param outputDir Directory to save the images in
 * @param prefix Prefix for the image filenames
 * @param scale Scale factor for the images (0.25-1.0)
 * @returns Array of paths to the generated images
 */
export async function generateSlideImages(
  slides: SlideData[], 
  outputDir: string, 
  prefix: string = '',
  scale: number = 0.75
): Promise<string[]> {
  // Ensure the images directory exists
  const imagesDir = path.join(outputDir, 'images');
  await fs.mkdir(imagesDir, { recursive: true });
  
  const imagePaths: string[] = [];
  
  // Render each slide to an image
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const slideIndex = i + 1;
    const filename = `${prefix}slide-${slideIndex}-${slide.id}.png`;
    const imagePath = path.join(imagesDir, filename);
    
    try {
      // Render the slide to an image
      await renderSlideToImage(slide, imagePath, {
        width: 1920,
        height: 1080,
        scale,
        format: 'png',
        quality: 90
      });
      
      imagePaths.push(imagePath);
    } catch (error) {
      console.error(`Error generating image for slide ${slide.id}:`, error);
    }
  }
  
  return imagePaths;
} 