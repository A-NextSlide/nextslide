import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';

/**
 * CreateYourOwnCTA - a call-to-action section encouraging viewers to
 * create their own AI presentation on NextSlide. Displayed below
 * the related presentations on the SharedDeckView page.
 */
export default function CreateYourOwnCTA() {
  const navigate = useNavigate();

  return (
    <section className="w-full py-16 px-4 sm:px-8 bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-950 dark:to-zinc-900">
      <div className="max-w-2xl mx-auto text-center">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#FF4301]/10 mb-6">
          <Sparkles className="w-7 h-7 text-[#FF4301]" />
        </div>

        {/* Heading */}
        <h2
          className="text-2xl sm:text-4xl font-extrabold text-zinc-900 dark:text-white mb-3 tracking-tight"
          style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", system-ui, sans-serif' }}
        >
          Create your own AI presentation
        </h2>

        {/* Subtitle */}
        <p className="text-zinc-500 dark:text-zinc-400 text-base sm:text-lg mb-8 max-w-lg mx-auto leading-relaxed">
          Turn any topic into a beautiful, professional presentation in seconds. No design skills needed.
        </p>

        {/* CTA Button */}
        <Button
          size="lg"
          onClick={() => navigate('/signup')}
          className="bg-[#FF4301] hover:bg-[#E63901] text-white px-8 py-6 text-base sm:text-lg font-bold rounded-xl shadow-lg shadow-orange-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-orange-500/30"
        >
          Get Started Free
          <ArrowRight className="ml-2 w-5 h-5" />
        </Button>

        {/* Trust line */}
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-4">
          No credit card required
        </p>
      </div>
    </section>
  );
}
