import React from 'react';

interface FaqSectionProps {
  faqs: { question: string; answer: string }[];
  toolTitle: string;
}

export default function FaqSection({ faqs, toolTitle }: FaqSectionProps) {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 text-center mb-12">
          Frequently Asked Questions
        </h2>

        <div className="space-y-3">
          {faqs.map((faq, idx) => (
            <details
              key={idx}
              className="group rounded-xl border border-zinc-200 bg-white overflow-hidden"
            >
              <summary className="flex items-center justify-between cursor-pointer px-6 py-4 text-left select-none hover:bg-zinc-50 transition-colors">
                <span className="text-base font-medium text-zinc-900 pr-4">
                  {faq.question}
                </span>
                <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-zinc-400 group-open:rotate-45 transition-transform duration-200">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M7 1V13M1 7H13"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </summary>
              <div className="px-6 pb-5 text-sm text-zinc-600 leading-relaxed">
                {faq.answer}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
