import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Eye, Layers } from 'lucide-react';
import { API_CONFIG } from '@/config/environment';

interface RelatedPresentation {
  id: string;
  title: string;
  category: string;
  viewCount: number;
  thumbnail: string | null;
}

interface RelatedPresentationsProps {
  shareCode: string;
  limit?: number;
}

/**
 * RelatedPresentations - shows a grid of related community presentations
 * below the viewer on SharedDeckView. Provides internal links for SEO
 * and encourages further exploration.
 */
export default function RelatedPresentations({ shareCode, limit = 4 }: RelatedPresentationsProps) {
  const [presentations, setPresentations] = useState<RelatedPresentation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchRelated = async () => {
      setIsLoading(true);
      try {
        const baseUrl = API_CONFIG.BASE_URL.replace(/\/api$/, '');
        const res = await fetch(`${baseUrl}/api/presentations/related/${shareCode}?limit=${limit}`);
        if (!res.ok) throw new Error('Failed to fetch related presentations');
        const data = await res.json();
        if (!cancelled) {
          setPresentations(data.presentations || []);
        }
      } catch (err) {
        console.warn('[RelatedPresentations] Failed to load:', err);
        if (!cancelled) {
          setPresentations([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchRelated();
    return () => { cancelled = true; };
  }, [shareCode, limit]);

  // Don't render anything while loading or if there are no results
  if (isLoading || presentations.length === 0) {
    return null;
  }

  // Category display names
  const categoryLabels: Record<string, string> = {
    business: 'Business',
    education: 'Education',
    marketing: 'Marketing',
    creative: 'Creative',
    technology: 'Technology',
    personal: 'Personal',
  };

  return (
    <section className="w-full py-12 px-4 sm:px-8 bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-5xl mx-auto">
        {/* Heading */}
        <h2
          className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white mb-2 tracking-tight"
          style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", system-ui, sans-serif' }}
        >
          More presentations
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 mb-8 text-sm sm:text-base">
          Explore more AI-generated presentations from the NextSlide community
        </p>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {presentations.map((p) => (
            <Link
              key={p.id}
              to={`/community/${p.id}`}
              className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4301] rounded-xl"
            >
              <Card className="overflow-hidden border border-zinc-200 dark:border-zinc-800 hover:border-[#FF4301]/40 transition-all duration-200 h-full group-hover:shadow-lg">
                {/* Thumbnail */}
                <div className="relative aspect-video bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
                  {p.thumbnail ? (
                    <img
                      src={p.thumbnail}
                      alt={p.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Layers className="w-10 h-10 text-zinc-300 dark:text-zinc-700" />
                    </div>
                  )}

                  {/* Category badge */}
                  {p.category && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-white/90 dark:bg-zinc-900/90 text-zinc-600 dark:text-zinc-300 rounded-full backdrop-blur-sm">
                      {categoryLabels[p.category] || p.category}
                    </span>
                  )}
                </div>

                <CardContent className="p-3 sm:p-4">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white line-clamp-2 leading-snug group-hover:text-[#FF4301] transition-colors">
                    {p.title}
                  </h3>
                  <div className="flex items-center gap-1 mt-2 text-xs text-zinc-400 dark:text-zinc-500">
                    <Eye className="w-3.5 h-3.5" />
                    <span>{p.viewCount.toLocaleString()} views</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
