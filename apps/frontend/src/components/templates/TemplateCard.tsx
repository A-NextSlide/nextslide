import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Template, TEMPLATE_CATEGORIES } from '@/services/templateApi';

const HK = '"HK Grotesk", "Hanken Grotesk", sans-serif';

interface TemplateCardProps {
  template: Template;
  onUse?: (slug: string) => void;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

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

  return (
    <div onClick={handleClick} className="group relative cursor-pointer">
      <div
        className={cn(
          'relative aspect-[16/9] w-full overflow-hidden rounded-xl transition-all duration-300',
          'ring-1 ring-black/[0.06] dark:ring-white/[0.08]',
          'group-hover:ring-[#FF4301]/30 group-hover:shadow-xl group-hover:shadow-orange-500/[0.06]',
        )}
      >
        {/* Background gradient from category */}
        <div className={cn('absolute inset-0 bg-gradient-to-br', catMeta.gradient)} />

        {/* Thumbnail image (if available) */}
        {template.thumbnailUrl ? (
          <img
            src={template.thumbnailUrl}
            alt={template.title}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="text-sm font-bold text-white/90 text-center px-8 line-clamp-2 leading-snug"
              style={{ fontFamily: HK }}
            >
              {template.title.replace(/^Free\s+/i, '')}
            </span>
          </div>
        )}

        {/* Bottom gradient scrim */}
        <div className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-black/80 via-black/40 to-transparent z-[1] pointer-events-none" />

        {/* Category pill (top-left) */}
        <div className="absolute top-2.5 left-2.5 z-[2]">
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase backdrop-blur-md"
            style={{
              fontFamily: HK,
              backgroundColor: `${catMeta.color}dd`,
              color: 'white',
              letterSpacing: '0.06em',
            }}
          >
            {catMeta.name}
          </span>
        </div>

        {/* Use count (top-right) */}
        {template.useCount > 0 && (
          <div className="absolute top-2.5 right-2.5 z-[2]">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-white/80 bg-black/40 backdrop-blur-md">
              <Users className="h-2.5 w-2.5" />
              {formatCount(template.useCount)}
            </span>
          </div>
        )}

        {/* Bottom metadata */}
        <div className="absolute inset-x-0 bottom-0 px-3 pb-2.5 pt-6 z-[2]">
          <h3
            className="text-[13px] font-bold text-white truncate leading-tight"
            title={template.title}
            style={{ fontFamily: HK }}
          >
            {template.title}
          </h3>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-white/60" style={{ fontFamily: HK }}>
            <span className="capitalize">{catMeta.name}</span>
            {template.useCount > 0 && (
              <>
                <span className="text-white/30">&middot;</span>
                <span className="flex items-center gap-0.5">
                  <Users className="h-2 w-2" />
                  {formatCount(template.useCount)} uses
                </span>
              </>
            )}
          </div>
        </div>

        {/* Use Template button (appears on hover) */}
        <button
          onClick={handleUse}
          className={cn(
            'absolute bottom-2.5 right-2.5 z-[3] h-7 px-2.5',
            'inline-flex items-center gap-1',
            'bg-white hover:bg-zinc-50 text-zinc-900 text-[11px] font-semibold rounded-lg shadow-lg',
            'opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0',
          )}
          style={{ fontFamily: HK }}
        >
          Use Template
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
};

export default TemplateCard;
