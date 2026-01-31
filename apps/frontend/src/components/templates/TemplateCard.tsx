import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Template, TEMPLATE_CATEGORIES } from '@/services/templateApi';

interface TemplateCardProps {
  template: Template;
  onUse?: (slug: string) => void;
}

/**
 * TemplateCard - Displays a single template in the gallery grid.
 * Shows a category-colored gradient thumbnail, title, category badge, use count,
 * and a "Use Template" button on hover.
 */
const TemplateCard: React.FC<TemplateCardProps> = ({ template, onUse }) => {
  const navigate = useNavigate();
  const catMeta = TEMPLATE_CATEGORIES[template.category] || {
    name: template.category,
    color: '#6366F1',
    gradient: 'from-indigo-500 to-violet-400',
  };

  const handleClick = () => {
    navigate(`/templates/${template.slug}`);
  };

  const handleUse = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onUse) {
      onUse(template.slug);
    } else {
      navigate(`/templates/${template.slug}`);
    }
  };

  // Format use count
  const formatCount = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return n.toString();
  };

  return (
    <div
      onClick={handleClick}
      className="group relative flex flex-col rounded-xl border border-border bg-card overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-primary/30 hover:-translate-y-0.5"
    >
      {/* Thumbnail / Gradient */}
      <div
        className={cn(
          'relative w-full aspect-[16/10] bg-gradient-to-br',
          catMeta.gradient,
        )}
      >
        {template.thumbnailUrl ? (
          <img
            src={template.thumbnailUrl}
            alt={template.title}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white/90 text-center px-6">
              <div className="text-lg font-semibold leading-tight line-clamp-2">
                {template.title.replace(/^Free\s+/i, '')}
              </div>
              <div className="text-xs text-white/70 mt-1">{catMeta.name}</div>
            </div>
          </div>
        )}

        {/* Hover overlay with CTA */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
          <button
            onClick={handleUse}
            className="flex items-center gap-2 bg-white text-gray-900 font-medium px-4 py-2 rounded-lg shadow-md hover:bg-gray-50 transition-colors text-sm"
          >
            Use Template
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Card body */}
      <div className="flex-1 p-4 flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
          {template.title}
        </h3>

        <div className="mt-auto flex items-center justify-between">
          {/* Category badge */}
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: `${catMeta.color}15`,
              color: catMeta.color,
            }}
          >
            {catMeta.name}
          </span>

          {/* Use count */}
          {template.useCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="w-3 h-3" />
              {formatCount(template.useCount)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default TemplateCard;
