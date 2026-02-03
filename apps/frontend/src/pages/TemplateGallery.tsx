import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { BROWSER } from '@/utils/browser';
import { useQuery } from '@tanstack/react-query';
import { Search, X, Loader2, Sparkles, ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import DynamicMeta from '@/components/seo/DynamicMeta';
import TemplateCard from '@/components/templates/TemplateCard';
import { templateApi, TEMPLATE_CATEGORIES } from '@/services/templateApi';
import { trackEvent } from '@/services/analytics';
import { useAuth } from '@/context/SupabaseAuthContext';

const FONT_HEADING = '"HK Grotesk Wide", "Hanken Grotesk", sans-serif';

const TemplateGallery: React.FC = () => {
  const navigate = useNavigate();
  const { category: categoryParam } = useParams<{ category?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [sort, setSort] = useState<'popular' | 'newest'>(
    (searchParams.get('sort') as 'popular' | 'newest') || 'popular',
  );
  const activeCategory = categoryParam || searchParams.get('category') || undefined;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (debouncedSearch) trackEvent('template_searched', { query: debouncedSearch });
  }, [debouncedSearch]);

  useEffect(() => {
    trackEvent('template_gallery_viewed', { category: activeCategory || 'all' });
  }, [activeCategory]);

  // Enable scrolling
  useEffect(() => {
    document.documentElement.style.position = '';
    document.documentElement.style.overflow = '';
    document.body.style.position = '';
    document.body.style.overflow = '';
  }, []);

  // Fetch templates
  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ['templates', activeCategory, debouncedSearch, sort],
    queryFn: () =>
      templateApi.getTemplates({
        category: activeCategory,
        search: debouncedSearch || undefined,
        sort,
        limit: 40,
      }),
    staleTime: 60_000,
  });

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ['template-categories'],
    queryFn: () => templateApi.getCategories(),
    staleTime: 300_000,
  });

  const handleCategorySelect = useCallback(
    (cat: string | undefined) => {
      if (cat) {
        navigate(`/templates/category/${cat}`);
      } else {
        navigate('/templates');
      }
    },
    [navigate],
  );

  const handleSortChange = useCallback(
    (newSort: 'popular' | 'newest') => {
      setSort(newSort);
      const params = new URLSearchParams(searchParams);
      params.set('sort', newSort);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const handleUseTemplate = useCallback(
    async (slug: string) => {
      trackEvent('template_used', { slug, category: activeCategory || 'gallery' });
      if (!user) {
        navigate(`/templates/${slug}`);
        return;
      }
      try {
        const result = await templateApi.useTemplate(slug);
        if (result.success && result.deckData) {
          sessionStorage.setItem('templateDeckData', JSON.stringify(result.deckData));
          sessionStorage.setItem('templateTitle', result.title);
          navigate('/app?from=template');
        }
      } catch {
        navigate(`/templates/${slug}`);
      }
    },
    [navigate, user, activeCategory],
  );

  // SEO
  const activeCatMeta = activeCategory ? TEMPLATE_CATEGORIES[activeCategory] : null;
  const seoTitle = activeCategory
    ? `Free ${activeCatMeta?.name || activeCategory} Presentation Templates | NextSlide AI`
    : 'Free Presentation Templates | NextSlide AI';
  const seoDescription = activeCategory
    ? `Browse free ${activeCatMeta?.name?.toLowerCase() || activeCategory} presentation templates. Customize with AI in seconds using NextSlide.`
    : 'Browse free AI presentation templates. Start with a professional template and customize with AI in seconds using NextSlide.';

  const templates = templatesData?.templates || [];
  const hasActiveFilters = !!debouncedSearch || !!activeCategory;

  return (
    <div className="min-h-screen bg-[#FCFBF8]">
      <DynamicMeta
        title={seoTitle}
        description={seoDescription}
        url={
          activeCategory
            ? `https://nextslide.ai/templates/category/${activeCategory}`
            : 'https://nextslide.ai/templates'
        }
      />

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-[#FCFBF8]/90 backdrop-blur-xl border-b border-black/5">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8 py-4 flex items-center justify-between">
          <Link
            to={BROWSER.isNativeApp ? '/app' : '/'}
            className="text-lg font-black tracking-tight text-black"
            style={{ fontFamily: FONT_HEADING }}
          >
            NextSlide
          </Link>
          <div className="flex items-center gap-3">
            {user ? (
              <Button
                onClick={() => navigate('/app')}
                className="bg-[#FF4301] hover:bg-[#E63901] text-white text-sm font-semibold rounded-xl px-5 shadow-lg shadow-orange-500/15"
              >
                My Slides
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={() => navigate('/login')}
                  className="text-sm text-black/50 hover:text-black/70"
                >
                  Sign In
                </Button>
                <Button
                  onClick={() => navigate('/signup')}
                  className="bg-[#FF4301] hover:bg-[#E63901] text-white text-sm font-semibold rounded-xl px-5 shadow-lg shadow-orange-500/15"
                >
                  Get Started
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="pt-16 pb-10 px-6 sm:px-8">
        <div className="max-w-[800px] mx-auto text-center">
          <h1
            className="text-3xl sm:text-4xl md:text-5xl font-black text-black tracking-tight mb-4"
            style={{ fontFamily: FONT_HEADING, letterSpacing: '-0.02em' }}
          >
            {activeCategory
              ? `${activeCatMeta?.name || activeCategory} Templates`
              : 'Presentation Templates'}
          </h1>
          <p className="text-base sm:text-lg text-black/50 max-w-xl mx-auto font-light mb-8">
            {activeCategory
              ? `Browse free ${activeCatMeta?.name?.toLowerCase() || activeCategory} templates. Customize with AI in seconds.`
              : 'Start with a professional template, customize with AI in seconds.'}
          </p>

          {/* Search */}
          <div className="max-w-md mx-auto relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/25" />
            <input
              type="text"
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-10 py-3 rounded-xl bg-white text-black text-sm placeholder:text-black/30 border border-black/8 focus:outline-none focus:ring-2 focus:ring-[#FF4301]/20 focus:border-[#FF4301]/40 transition-all"
              style={{ fontFamily: FONT_HEADING }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-black/30 hover:text-black/60 hover:bg-black/5 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── Category + Sort Controls ────────────────────────────────────── */}
      <div className="sticky top-[65px] z-40 bg-[#FCFBF8]/95 backdrop-blur-sm border-b border-black/5">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
          <div className="flex items-center justify-between py-3 gap-4">
            {/* Category pills */}
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -my-1 py-1">
              <button
                onClick={() => handleCategorySelect(undefined)}
                className={cn(
                  'px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all',
                  !activeCategory
                    ? 'bg-[#FF4301] text-white shadow-md shadow-orange-500/20'
                    : 'bg-white text-black/50 border border-black/5 hover:border-black/10 hover:text-black/70',
                )}
              >
                All Templates
              </button>
              {(categories || []).map((cat) => {
                const meta = TEMPLATE_CATEGORIES[cat.name];
                const isActive = activeCategory === cat.name;
                return (
                  <button
                    key={cat.name}
                    onClick={() => handleCategorySelect(isActive ? undefined : cat.name)}
                    className={cn(
                      'px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all',
                      isActive
                        ? 'text-white shadow-md'
                        : 'bg-white text-black/50 border border-black/5 hover:border-black/10 hover:text-black/70',
                    )}
                    style={
                      isActive && meta
                        ? { backgroundColor: meta.color, boxShadow: `0 4px 12px ${meta.color}33` }
                        : undefined
                    }
                  >
                    {meta?.name || cat.displayName}
                    <span className={cn('ml-1.5 text-[10px]', isActive ? 'text-white/70' : 'text-black/30')}>
                      {cat.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Sort pills */}
            <div className="flex gap-1.5 shrink-0">
              <button
                onClick={() => handleSortChange('popular')}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-full font-semibold transition-all',
                  sort === 'popular'
                    ? 'bg-black text-white'
                    : 'bg-white text-black/40 border border-black/5 hover:border-black/10 hover:text-black/60',
                )}
              >
                Popular
              </button>
              <button
                onClick={() => handleSortChange('newest')}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-full font-semibold transition-all',
                  sort === 'newest'
                    ? 'bg-black text-white'
                    : 'bg-white text-black/40 border border-black/5 hover:border-black/10 hover:text-black/60',
                )}
              >
                Newest
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Count ───────────────────────────────────────────────────────── */}
      <div className="max-w-[1200px] mx-auto px-6 sm:px-8 pt-6 pb-2">
        <p
          className="text-xs font-bold text-black/25 uppercase tracking-widest"
          style={{ fontFamily: FONT_HEADING }}
        >
          {templatesLoading && templates.length === 0
            ? 'Loading...'
            : `${templates.length} of ${templatesData?.total || 0} template${templates.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* ── Grid ────────────────────────────────────────────────────────── */}
      <main className="max-w-[1200px] mx-auto px-6 sm:px-8 pb-20">
        {templatesLoading && templates.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-[#FF4301]" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 rounded-2xl bg-[#FF4301]/5 flex items-center justify-center mx-auto mb-5">
              <Sparkles className="w-7 h-7 text-[#FF4301]" />
            </div>
            <h3
              className="text-lg font-bold text-black mb-2"
              style={{ fontFamily: FONT_HEADING }}
            >
              {hasActiveFilters ? 'No templates found' : 'No templates yet'}
            </h3>
            <p className="text-sm text-black/40 mb-6 max-w-sm mx-auto">
              {debouncedSearch
                ? `No templates match "${debouncedSearch}". Try a different search term.`
                : hasActiveFilters
                  ? 'No templates available in this category yet.'
                  : 'Templates will appear here soon. Create your own presentation with AI.'}
            </p>
            {hasActiveFilters ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch('');
                  navigate('/templates');
                }}
                className="rounded-xl border-black/10 text-black/50 hover:border-black/20 hover:text-black/70 text-xs font-semibold px-6"
              >
                Clear filters
              </Button>
            ) : (
              <Link to={user ? '/app' : '/signup'}>
                <Button className="bg-[#FF4301] hover:bg-[#E63901] text-white font-semibold rounded-xl shadow-lg shadow-orange-500/15">
                  Create with AI
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {templates.map((tpl) => (
                <TemplateCard
                  key={tpl.id}
                  template={tpl}
                  onUse={handleUseTemplate}
                />
              ))}
            </div>

            <div className="text-center mt-8">
              <p className="text-[11px] text-black/25 font-medium" style={{ fontFamily: FONT_HEADING }}>
                Showing {templates.length} of {templatesData?.total || 0} templates
              </p>
            </div>
          </>
        )}
      </main>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="border-t border-black/5 bg-white py-16 px-6 sm:px-8">
        <div className="max-w-[600px] mx-auto text-center">
          <h2
            className="text-2xl sm:text-3xl font-black text-black mb-3"
            style={{ fontFamily: FONT_HEADING, letterSpacing: '-0.02em' }}
          >
            Don't see what you need?
          </h2>
          <p className="text-sm text-black/50 mb-6">
            Describe any topic and let AI build a beautiful presentation for you in seconds.
          </p>
          <Link to={user ? '/app' : '/signup'}>
            <Button className="bg-[#FF4301] hover:bg-[#E63901] text-white text-base font-bold rounded-xl px-8 py-5 shadow-lg shadow-orange-500/20">
              Create with AI
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
            <div className="flex items-center gap-2">
              <Check className="w-3 h-3 text-[#FF4301]" />
              <span className="text-xs font-bold text-black/40 uppercase tracking-wider">40+ templates</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-black/5 py-8 px-6 sm:px-8">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between text-xs text-black/30">
          <Link
            to={BROWSER.isNativeApp ? '/app' : '/'}
            className="font-bold hover:text-black/50 transition-colors"
            style={{ fontFamily: FONT_HEADING }}
          >
            NextSlide
          </Link>
          <div className="flex gap-4">
            <Link to="/presentations" className="hover:text-black/50 transition-colors">
              Browse
            </Link>
            <Link to="/pricing" className="hover:text-black/50 transition-colors">
              Pricing
            </Link>
            <span>&copy; {new Date().getFullYear()} NextSlide</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default TemplateGallery;
