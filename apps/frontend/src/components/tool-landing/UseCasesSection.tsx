import React from 'react';

interface UseCasesSectionProps {
  useCases: { title: string; description: string }[];
}

export default function UseCasesSection({ useCases }: UseCasesSectionProps) {
  return (
    <section className="py-16 sm:py-20 bg-zinc-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 text-center mb-4">
          Popular Use Cases
        </h2>
        <p className="text-zinc-500 text-center mb-12 max-w-2xl mx-auto">
          See how others are using this tool to save time and create better presentations.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {useCases.map((uc, idx) => (
            <div
              key={idx}
              className="rounded-2xl bg-white border border-zinc-200 p-6 hover:shadow-md transition-shadow"
            >
              <h3 className="text-base font-semibold text-zinc-900 mb-2">{uc.title}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">{uc.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
