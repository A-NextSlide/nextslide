import React from 'react';

interface HowToSectionProps {
  steps: string[];
}

export default function HowToSection({ steps }: HowToSectionProps) {
  return (
    <section className="py-16 sm:py-20 bg-zinc-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 text-center mb-12">
          How It Works
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, idx) => (
            <div key={idx} className="relative flex flex-col items-center text-center">
              {/* Connector line (hidden on first item) */}
              {idx > 0 && (
                <div className="hidden lg:block absolute -left-3 top-7 w-6 h-0.5 bg-zinc-200" />
              )}

              <div className="w-14 h-14 rounded-2xl bg-white border border-zinc-200 flex items-center justify-center mb-4 shadow-sm">
                <span className="text-lg font-bold text-[#FF6B00]">{idx + 1}</span>
              </div>

              <p className="text-sm sm:text-base text-zinc-700 leading-relaxed max-w-[220px]">
                {step}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
