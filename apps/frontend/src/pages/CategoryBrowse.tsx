import React, { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import DynamicMeta from '@/components/seo/DynamicMeta';
import { API_ENDPOINTS } from '@/config/apiEndpoints';
import { Loader2, Eye, ArrowRight, Sparkles, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MiniSlide from '@/components/deck/MiniSlide';

const FONT_HEADING = '"HK Grotesk Wide", "Hanken Grotesk", sans-serif';

const CATEGORIES = [
  { slug: 'all', name: 'All Presentations', description: 'Browse all public presentations created with NextSlide AI' },
  { slug: 'business', name: 'Business', description: 'Business presentations, pitch decks, and strategy slides' },
  { slug: 'education', name: 'Education', description: 'Educational presentations, lectures, and course materials' },
  { slug: 'marketing', name: 'Marketing', description: 'Marketing decks, campaign reports, and strategy presentations' },
  { slug: 'technology', name: 'Technology', description: 'Technology presentations, product demos, and roadmaps' },
  { slug: 'design', name: 'Design', description: 'Design portfolios, UI/UX presentations, and creative decks' },
];

interface BrowseDeck {
  type: string;
  id: string;
  shareCode?: string;
  title: string;
  description: string;
  category: string;
  viewCount: number;
  createdAt: string;
  url: string;
  firstSlide?: any;
  slideSize?: { width: number; height: number };
}

export default function CategoryBrowse() {
  const { category } = useParams<{ category?: string }>();
  const [searchParams] = useSearchParams();
  const activeCategory = category || 'all';
  const currentSort = searchParams.get('sort') || 'recent';

  const [decks, setDecks] = useState<BrowseDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const activeCategoryInfo = CATEGORIES.find(c => c.slug === activeCategory) || CATEGORIES[0];
  const pageTitle = activeCategory === 'all'
    ? 'Browse Presentations | NextSlide'
    : `${activeCategoryInfo.name} Presentations | NextSlide`;

  useEffect(() => {
    setPage(1);
    fetchDecks(1);
  }, [activeCategory, currentSort]);

  const fetchDecks = async (pageNum: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        limit: '24',
        sort: currentSort,
      });
      if (activeCategory && activeCategory !== 'all') {
        params.set('category', activeCategory);
      }

      const response = await fetch(`${API_ENDPOINTS.BASE_URL}/browse/presentations?${params}`);
      if (response.ok) {
        const data = await response.json();
        if (pageNum === 1) {
          setDecks(data.presentations || []);
        } else {
          setDecks(prev => [...prev, ...(data.presentations || [])]);
        }
        setHasMore(data.hasMore || false);
      }
    } catch (error) {
      console.error('[CategoryBrowse] Error fetching presentations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchDecks(nextPage);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  };

  const schemaOrg = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: activeCategoryInfo.name + ' Presentations',
    description: activeCategoryInfo.description,
    url: `https://nextslide.ai/presentations${activeCategory !== 'all' ? `/${activeCategory}` : ''}`,
    provider: { '@type': 'Organization', name: 'NextSlide', url: 'https://nextslide.ai' },
  };

  return (
    <div className="min-h-screen bg-[#FCFBF8]">
      <DynamicMeta
        title={pageTitle}
        description={activeCategoryInfo.description}
        url={`https://nextslide.ai/presentations${activeCategory !== 'all' ? `/${activeCategory}` : ''}`}
        canonical={`https://nextslide.ai/presentations${activeCategory !== 'all' ? `/${activeCategory}` : ''}`}
        schema={schemaOrg}
      />

      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-[#FCFBF8]/90 backdrop-blur-xl border-b border-black/5">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8 py-4 flex items-center justify-between">
          <Link
            to="/"
            className="text-lg font-black tracking-tight text-black"
            style={{ fontFamily: FONT_HEADING }}
          >
            NextSlide
          </Link>
          <Link to="/app">
            <Button className="bg-[#FF4301] hover:bg-[#E63901] text-white text-sm font-semibold rounded-xl px-5 shadow-lg shadow-orange-500/15">
              Create Presentation
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-16 pb-10 px-6 sm:px-8">
        <div className="max-w-[800px] mx-auto text-center">
          <h1
            className="text-3xl sm:text-4xl md:text-5xl font-black text-black tracking-tight mb-4"
            style={{ fontFamily: FONT_HEADING, letterSpacing: '-0.02em' }}
          >
            {activeCategory === 'all' ? 'Browse Presentations' : `${activeCategoryInfo.name} Presentations`}
          </h1>
          <p className="text-base sm:text-lg text-black/50 max-w-xl mx-auto font-light">
            {activeCategoryInfo.description}
          </p>
        </div>
      </section>

      {/* Category + Sort Controls */}
      <div className="sticky top-[65px] z-40 bg-[#FCFBF8]/95 backdrop-blur-sm border-b border-black/5">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
          <div className="flex items-center justify-between py-3 gap-4">
            {/* Category pills */}
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -my-1 py-1">
              {CATEGORIES.map((cat) => (
                <Link
                  key={cat.slug}
                  to={cat.slug === 'all' ? '/presentations' : `/presentations/${cat.slug}`}
                  className={`
                    px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all
                    ${activeCategory === cat.slug
                      ? 'bg-[#FF4301] text-white shadow-md shadow-orange-500/20'
                      : 'bg-white text-black/50 border border-black/5 hover:border-black/10 hover:text-black/70'
                    }
                  `}
                >
                  {cat.name}
                </Link>
              ))}
            </div>

            {/* Sort */}
            <div className="flex gap-1.5 shrink-0">
              <Link
                to={`/presentations${activeCategory !== 'all' ? `/${activeCategory}` : ''}?sort=recent`}
                className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-all ${
                  currentSort === 'recent'
                    ? 'bg-black text-white'
                    : 'bg-white text-black/40 border border-black/5 hover:border-black/10 hover:text-black/60'
                }`}
              >
                Recent
              </Link>
              <Link
                to={`/presentations${activeCategory !== 'all' ? `/${activeCategory}` : ''}?sort=popular`}
                className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-all ${
                  currentSort === 'popular'
                    ? 'bg-black text-white'
                    : 'bg-white text-black/40 border border-black/5 hover:border-black/10 hover:text-black/60'
                }`}
              >
                Popular
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Count */}
      <div className="max-w-[1200px] mx-auto px-6 sm:px-8 pt-6 pb-2">
        <p className="text-xs font-bold text-black/25 uppercase tracking-widest" style={{ fontFamily: FONT_HEADING }}>
          {loading && decks.length === 0 ? 'Loading...' : `${decks.length} presentation${decks.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Deck Grid */}
      <main className="max-w-[1200px] mx-auto px-6 sm:px-8 pb-20">
        {loading && decks.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-[#FF4301]" />
          </div>
        ) : decks.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 rounded-2xl bg-[#FF4301]/5 flex items-center justify-center mx-auto mb-5">
              <Sparkles className="w-7 h-7 text-[#FF4301]" />
            </div>
            <h3
              className="text-lg font-bold text-black mb-2"
              style={{ fontFamily: FONT_HEADING }}
            >
              No presentations yet
            </h3>
            <p className="text-sm text-black/40 mb-6">
              Be the first to create and share a presentation in this category.
            </p>
            <Link to="/app">
              <Button className="bg-[#FF4301] hover:bg-[#E63901] text-white font-semibold rounded-xl shadow-lg shadow-orange-500/15">
                Create the first one
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {decks.map((deck) => (
                <Link
                  key={`${deck.type}-${deck.id}`}
                  to={deck.url}
                  className="group relative"
                >
                  <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl ring-1 ring-black/5 group-hover:ring-[#FF4301]/30 group-hover:shadow-xl group-hover:shadow-orange-500/5 transition-all">
                    {/* Slide thumbnail */}
                    <div className="absolute inset-0 w-full h-full">
                      {deck.firstSlide ? (
                        <MiniSlide
                          slide={deck.firstSlide}
                          responsive
                          slideSize={deck.slideSize}
                          className="w-full h-full !rounded-none hover:!ring-0 !cursor-default"
                          renderMode="full"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-zinc-100 to-zinc-50 flex items-center justify-center">
                          <span
                            className="text-sm font-bold text-black/8 text-center px-6 line-clamp-2"
                            style={{ fontFamily: FONT_HEADING }}
                          >
                            {deck.title}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Bottom gradient overlay with title + meta */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent pt-10 pb-2.5 px-3 pointer-events-none">
                      <h3
                        className="text-[13px] font-bold text-white truncate"
                        title={deck.title}
                      >
                        {deck.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-white/60">
                        {deck.category && (
                          <span className="capitalize">{deck.category}</span>
                        )}
                        {deck.category && (deck.viewCount > 0 || deck.createdAt) && (
                          <span className="text-white/30">·</span>
                        )}
                        {deck.viewCount > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Eye size={9} />
                            {deck.viewCount}
                          </span>
                        )}
                        {deck.createdAt && <span>{formatDate(deck.createdAt)}</span>}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Load More */}
            {hasMore && (
              <div className="text-center mt-10">
                <Button
                  variant="outline"
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="rounded-xl border-black/10 text-black/50 hover:border-black/20 hover:text-black/70 text-xs font-semibold px-6"
                >
                  {loading ? (
                    <>
                      <Loader2 size={12} className="mr-1.5 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    'Load more'
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      {/* CTA */}
      <section className="border-t border-black/5 bg-white py-16 px-6 sm:px-8">
        <div className="max-w-[600px] mx-auto text-center">
          <h2
            className="text-2xl sm:text-3xl font-black text-black mb-3"
            style={{ fontFamily: FONT_HEADING, letterSpacing: '-0.02em' }}
          >
            Create your own AI presentation
          </h2>
          <p className="text-sm text-black/50 mb-6">
            Generate beautiful, professional presentations in seconds with NextSlide AI.
          </p>
          <Link to="/app">
            <Button className="bg-[#FF4301] hover:bg-[#E63901] text-white text-base font-bold rounded-xl px-8 py-5 shadow-lg shadow-orange-500/20">
              Get Started Free
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
          <div className="flex flex-wrap items-center justify-center gap-4 mt-6">
            <div className="flex items-center gap-2">
              <Check className="w-3 h-3 text-[#FF4301]" />
              <span className="text-xs font-bold text-black/40 uppercase tracking-wider">Free to start</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-3 h-3 text-[#FF4301]" />
              <span className="text-xs font-bold text-black/40 uppercase tracking-wider">No credit card</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-black/5 py-8 px-6 sm:px-8">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between text-xs text-black/30">
          <Link to="/" className="font-bold hover:text-black/50 transition-colors" style={{ fontFamily: FONT_HEADING }}>
            NextSlide
          </Link>
          <div className="flex gap-4">
            <Link to="/presentation-templates" className="hover:text-black/50 transition-colors">Templates</Link>
            <Link to="/pricing" className="hover:text-black/50 transition-colors">Pricing</Link>
            <Link to="/help" className="hover:text-black/50 transition-colors">Help</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
