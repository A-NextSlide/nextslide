import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { ToolPageConfig } from '@/config/toolPages';

interface TextInputAreaProps {
  config: ToolPageConfig;
  onSubmit: (text: string) => void;
  disabled?: boolean;
}

const placeholders: Record<string, string> = {
  'notes-to-presentation': 'Paste your notes, bullet points, or rough ideas here...',
  'pitch-deck-generator':
    'Describe your startup: What problem do you solve? Who are your customers? What makes you different?',
  'text-to-ppt': 'Paste any text — an article, essay, email, or report — and AI will turn it into slides...',
};

export default function TextInputArea({ config, onSubmit, disabled }: TextInputAreaProps) {
  const [text, setText] = useState('');
  const placeholder = placeholders[config.slug] || 'Enter your text here...';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim().length >= 10) {
      onSubmit(text.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-3">
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          rows={6}
          className="
            w-full px-4 py-4 rounded-xl border border-zinc-300
            text-zinc-900 placeholder:text-zinc-400
            focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/40 focus:border-[#FF6B00]
            transition-all text-base bg-white resize-y min-h-[140px]
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        />
        <div className="absolute bottom-3 right-3 text-xs text-zinc-400">
          {text.length.toLocaleString()} characters
        </div>
      </div>
      <button
        type="submit"
        disabled={disabled || text.trim().length < 10}
        className="
          flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-3.5 rounded-xl
          bg-[#FF6B00] text-white font-semibold text-base
          hover:bg-[#e56000] active:scale-[0.98]
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all
        "
      >
        Generate Presentation
        <ArrowRight className="w-4 h-4" />
      </button>
    </form>
  );
}
