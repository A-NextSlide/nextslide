import React from 'react';
import { SlideData } from '@/types/SlideTypes';
import { extractSlideTexts } from '@/utils/slideTextExtractor';

interface SlideTranscriptProps {
  slides: SlideData[];
  deckTitle?: string;
}

/**
 * Renders slide text content as semantic HTML for SEO crawlers.
 * Always in the DOM (for Googlebot), but collapsed for human visitors.
 * Uses <details> element for native accordion behavior.
 */
export default function SlideTranscript({ slides, deckTitle }: SlideTranscriptProps) {
  const slideTexts = extractSlideTexts(slides);

  // Don't render if no text content
  const hasContent = slideTexts.some(s => s.title || s.texts.length > 0);
  if (!hasContent) return null;

  return (
    <article className="max-w-4xl mx-auto px-4 py-8">
      <details className="group">
        <summary className="cursor-pointer text-lg font-semibold text-zinc-700 hover:text-zinc-900 flex items-center gap-2 list-none">
          <svg
            className="w-5 h-5 transition-transform group-open:rotate-90"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Slide Content Transcript
        </summary>

        <div className="mt-4 space-y-6 text-zinc-600">
          {deckTitle && (
            <h2 className="text-xl font-bold text-zinc-800">{deckTitle}</h2>
          )}

          {slideTexts.map((slide) => {
            if (!slide.title && slide.texts.length === 0) return null;

            return (
              <section key={slide.slideNumber} className="border-l-2 border-zinc-200 pl-4">
                <h3 className="font-semibold text-zinc-700 mb-1">
                  {slide.title || `Slide ${slide.slideNumber}`}
                </h3>
                {slide.texts.map((text, i) => (
                  <p key={i} className="text-sm leading-relaxed mb-1">{text}</p>
                ))}
              </section>
            );
          })}
        </div>
      </details>
    </article>
  );
}
