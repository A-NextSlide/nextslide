import React from 'react';
import { Link } from 'react-router-dom';
import { toolPages } from '@/config/toolPages';

interface ToolLinksFooterProps {
  currentSlug: string;
}

export default function ToolLinksFooter({ currentSlug }: ToolLinksFooterProps) {
  const otherTools = toolPages.filter((t) => t.slug !== currentSlug);

  return (
    <section className="py-16 sm:py-20 bg-zinc-50 border-t border-zinc-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 text-center mb-8">
          More AI Presentation Tools
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {otherTools.map((tool) => (
            <Link
              key={tool.slug}
              to={`/${tool.slug}`}
              className="
                flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-5 py-4
                hover:border-[#FF6B00]/40 hover:shadow-sm transition-all group
              "
            >
              <div className="w-2 h-2 rounded-full bg-[#FF6B00]/40 group-hover:bg-[#FF6B00] transition-colors flex-shrink-0" />
              <span className="text-sm font-medium text-zinc-700 group-hover:text-zinc-900 transition-colors">
                {tool.title}
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link
            to="/"
            className="text-sm text-zinc-500 hover:text-[#FF6B00] transition-colors"
          >
            NextSlide AI &mdash; Create presentations with artificial intelligence
          </Link>
        </div>
      </div>
    </section>
  );
}
