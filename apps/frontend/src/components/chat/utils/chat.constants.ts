/**
 * Chat suggestion constants
 * Extracted from ChatPanel.tsx for reusability and maintainability
 */

export interface SuggestionItem {
  label: string;
  prompt: string;
}

// Pool of suggestions for editing mode; short label shown, detailed prompt inserted on click
export const ALL_SUGGESTIONS: SuggestionItem[] = [
  // Style & Theme
  { label: 'Apple keynote style', prompt: 'Redesign this deck with a clean Apple keynote aesthetic - lots of whitespace, bold sans-serif typography, and elegant product-focused imagery' },
  { label: 'TED talk vibes', prompt: 'Transform this into a TED talk style presentation - big bold statements, minimal text per slide, and powerful visuals that support the narrative' },
  { label: 'Dark mode + neon', prompt: 'Switch to a sleek dark mode theme with vibrant neon accent colors and glowing text effects' },
  { label: 'Brutalist design', prompt: 'Apply a bold brutalist design style - raw typography, high contrast, unconventional layouts, and unapologetic visual impact' },
  { label: '90s retro aesthetic', prompt: 'Give this a nostalgic 90s vibe with retro colors, pixelated elements, and vintage computer graphics style' },
  { label: 'Magazine editorial', prompt: 'Style this like a high-end magazine spread with sophisticated typography, pull quotes, and editorial photography layouts' },
  // Content & Data
  { label: 'Add comparison table', prompt: 'Create a visually compelling comparison table that clearly shows the differences and helps the audience make a decision' },
  { label: 'Timeline of events', prompt: 'Add an elegant timeline visualization showing the key milestones and progression over time' },
  { label: 'Pros vs cons', prompt: 'Create a balanced pros and cons layout with clear visual distinction between advantages and disadvantages' },
  { label: 'Process flowchart', prompt: 'Design a clear flowchart that walks through the process step by step with visual connectors' },
  { label: 'Stats with big numbers', prompt: 'Add a statistics slide with large, bold numbers and supporting icons that make the data memorable' },
  { label: 'Before & after', prompt: 'Create a compelling before and after comparison that dramatically shows the transformation or improvement' },
  // Visual Effects
  { label: 'Gradient backgrounds', prompt: 'Add beautiful gradient backgrounds that flow naturally and create visual depth without distracting from the content' },
  { label: 'Make title pop', prompt: 'Make the title slide more dramatic and attention-grabbing - this is the first impression!' },
  { label: 'Icons for bullets', prompt: 'Replace boring bullet points with meaningful icons that visually represent each point' },
  { label: 'Full-bleed imagery', prompt: 'Create a stunning full-bleed image slide that creates an emotional impact and breaks up the content' },
  // Creative
  { label: 'Make it punchier', prompt: 'Rewrite this slide to be more concise and impactful - cut the fluff and make every word count' },
  { label: 'Add a quote slide', prompt: 'Add a memorable quote slide with beautiful typography that reinforces the key message' },
  { label: 'Surprise me ✨', prompt: 'Do something creative and unexpected with this slide - surprise me with a fresh approach I haven\'t thought of!' },
  { label: 'More visual, less text', prompt: 'This slide has too much text. Transform it to be more visual with icons, images, or diagrams instead of walls of text' },
];

// Outline mode specific suggestions for slide generation
export const OUTLINE_SUGGESTIONS: string[] = [
  'Add more detail to slide 3',
  'Expand the introduction with key statistics',
  'Create a conclusion slide summarizing main points',
  'Add a slide about implementation challenges',
  'Include more examples in the benefits section',
  'Add a timeline slide showing the roadmap',
  'Create a comparison table for alternatives',
  'Add speaker notes to all slides',
  'Rewrite slide 2 to be more concise',
  'Add a slide about next steps',
  'Include case studies or real-world examples',
  'Expand on the technical architecture',
  'Add a Q&A slide at the end',
  'Create an agenda slide after the title',
  'Add more context to the problem statement',
  'Use a professional minimalist theme',
  'Change to a dark modern theme',
  'Apply a vibrant tech startup style',
  'Use a corporate blue theme',
  'Switch to a creative gradient theme',
  'Apply a clean academic style',
  'Use a bold high-contrast theme',
  'Change to a warm earthy color palette',
];

/**
 * Sample random items from an array (Fisher-Yates shuffle)
 */
export function sampleArray<T>(items: T[], count: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, Math.min(count, copy.length)));
}
