import React from 'react';
import {
  Zap, FileText, Sparkles, Palette, Layout, Paintbrush, Clock,
  Brain, Pencil, Rocket, TrendingUp, Globe, ArrowRightLeft,
  Download, BarChart3, Table, Image, Layers, Type,
} from 'lucide-react';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Zap, FileText, Sparkles, Palette, Layout, Paintbrush, Clock,
  Brain, Pencil, Rocket, TrendingUp, Globe, ArrowRightLeft,
  Download, BarChart3, Table, Image, Layers, Type,
};

interface BenefitCardsProps {
  benefits: { icon: string; title: string; description: string }[];
}

export default function BenefitCards({ benefits }: BenefitCardsProps) {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 text-center mb-12">
          Why Use This Tool
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {benefits.map((benefit, idx) => {
            const Icon = iconMap[benefit.icon] || Sparkles;
            return (
              <div
                key={idx}
                className="rounded-2xl border border-zinc-200 bg-white p-6 hover:shadow-md transition-shadow"
              >
                <div className="w-11 h-11 rounded-xl bg-[#FF6B00]/10 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-[#FF6B00]" />
                </div>
                <h3 className="text-lg font-semibold text-zinc-900 mb-2">{benefit.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{benefit.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
