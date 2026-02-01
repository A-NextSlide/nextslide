import React, { useState } from 'react';
import { Globe, ArrowRight } from 'lucide-react';

interface UrlInputFieldProps {
  onSubmit: (url: string) => void;
  disabled?: boolean;
}

export default function UrlInputField({ onSubmit, disabled }: UrlInputFieldProps) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onSubmit(url.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste any website URL..."
            disabled={disabled}
            className="
              w-full pl-12 pr-4 py-4 rounded-xl border border-zinc-300
              text-zinc-900 placeholder:text-zinc-400
              focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/40 focus:border-[#FF6B00]
              transition-all text-base bg-white
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          />
        </div>
        <button
          type="submit"
          disabled={disabled || !url.trim()}
          className="
            flex items-center justify-center gap-2 px-6 py-4 rounded-xl
            bg-[#FF6B00] text-white font-semibold text-base
            hover:bg-[#e56000] active:scale-[0.98]
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all whitespace-nowrap
          "
        >
          Convert to Slides
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
}
