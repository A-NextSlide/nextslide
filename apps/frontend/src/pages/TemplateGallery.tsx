import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal, Loader2, LayoutGrid, X, ArrowRight, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import BrandWordmark from '@/components/common/BrandWordmark';
import DynamicMeta from '@/components/seo/DynamicMeta';
import TemplateCard from '@/components/templates/TemplateCard';
import { templateApi, TEMPLATE_CATEGORIES } from '@/services/templateApi';
import { trackEvent } from '@/services/analytics';
import { useAuth } from '@/context/SupabaseAuthContext';

const TemplateGallery: React.FC = () => {
  const navigate = useNavigate();
  const { category: categoryParam } = useParams<{ category?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isSignedIn = !!user;

  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [sort, setSort] = useState<'popular' | 'newest'>(
    (searchParams.get('sort') as 'popular' | 'newest') || 'popular',
  );
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
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

  // Scroll handler for nav
  useEffect(() => {
    let lastScrolled = false;
    const handleScroll = () => {
      const scrolled = window.scrollY > 20;
      if (scrolled !== lastScrolled) {
        lastScrolled = scrolled;
        setIsScrolled(scrolled);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
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
  const seoTitle = activeCategory
    ? `Free ${TEMPLATE_CATEGORIES[activeCategory]?.name || activeCategory} Presentation Templates | NextSlide AI`
    : 'Free Presentation Templates | NextSlide AI';
  const seoDescription = activeCategory
    ? `Browse free ${TEMPLATE_CATEGORIES[activeCategory]?.name?.toLowerCase() || activeCategory} presentation templates. Customize with AI in seconds using NextSlide.`
    : 'Browse free AI presentation templates. Start with a professional template and customize with AI in seconds using NextSlide.';

  const templates = templatesData?.templates || [];

  return (
    <div className="min-h-screen bg-[#FCFBF8] dark:bg-[#0a0a0a] overflow-x-clip">
      <DynamicMeta
        title={seoTitle}
        description={seoDescription}
        url={
          activeCategory
            ? `https://nextslide.ai/templates/category/${activeCategory}`
            : 'https://nextslide.ai/templates'
        }
      />

      {/* Navigation */}
      <nav
        className={cn(
          'fixed top-0 w-full z-50 transition-all duration-300',
          isScrolled
            ? 'bg-[#FCFBF8]/90 dark:bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-black/10 dark:border-white/10'
            : 'bg-transparent'
        )}
      >
        <div className="max-w-[1400px] mx-auto px-8 py-4 flex items-center justify-between">
          <div className="cursor-pointer" onClick={() => navigate('/')}>
            <BrandWordmark
              tag="h1"
              sizePx={18.95}
              xImageUrl="/brand/nextslide-x.png"
              gapLeftPx={-3}
              gapRightPx={-8}
              liftPx={-4}
              xLiftPx={-4}
              rightLiftPx={0}
            />
          </div>

          <div className="hidden md:flex items-center gap-8">
            {isSignedIn ? (
              <Button onClick={() => navigate('/app')} className="bg-[#FF4301] hover:bg-[#E63901] text-white text-sm font-semibold">
                My Slides
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate('/login')} className="text-sm">Sign In</Button>
                <Button onClick={() => navigate('/signup')} className="bg-[#FF4301] hover:bg-[#E63901] text-white text-sm font-semibold">
                  Get Started
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </>
            )}
          </div>

          <button
            className="md:hidden p-2 min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {isMenuOpen && (
          <div className="md:hidden bg-[#FCFBF8] dark:bg-[#0a0a0a] border-b border-black/10 dark:border-white/10 max-h-[70vh] overflow-y-auto">
            <div className="px-6 py-4 flex flex-col gap-3">
              {isSignedIn ? (
                <Button className="bg-[#FF4301] hover:bg-[#E63901] text-white min-h-[44px] touch-manipulation" onClick={() => navigate('/app')}>My Slides</Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => navigate('/login')} className="justify-start min-h-[44px] touch-manipulation">Sign In</Button>
                  <Button className="bg-[#FF4301] hover:bg-[#E63901] text-white min-h-[44px] touch-manipulation" onClick={() => navigate('/signup')}>Get Started</Button>
                </>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative pt-32 sm:pt-36 pb-12 px-4 sm:px-8">
        <div className="max-w-[1000px] mx-auto text-center">
          <h1
            className="text-black dark:text-white mb-4"
            style={{
              fontFamily: '"Hanken Grotesk", sans-serif',
              fontWeight: 700,
              fontSize: 'clamp(32px, 5vw, 56px)',
              lineHeight: '1.1',
              letterSpacing: '-0.02em',
            }}
          >
            {activeCategory
              ? `${TEMPLATE_CATEGORIES[activeCategory]?.name || activeCategory} Templates`
              : 'Presentation Templates'}
          </h1>
          <p className="text-lg text-black/60 dark:text-white/60 max-w-2xl mx-auto mb-8 font-light">
            Start with a template, customize with AI in seconds.
            {activeCategory
              ? ` Browse our collection of ${TEMPLATE_CATEGORIES[activeCategory]?.name?.toLowerCase() || activeCategory} presentation templates.`
              : ' Professional templates for every occasion.'}
          </p>

          {/* Search */}
          <div className="max-w-lg mx-auto relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-black/30 dark:text-white/30" />
            <input
              type="text"
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-10 py-3.5 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900 text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#FF4301]/30 focus:border-[#FF4301]/50 transition-all"
              style={{ fontFamily: '"Hanken Grotesk", sans-serif' }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="sticky top-[72px] z-40 bg-[#FCFBF8]/95 dark:bg-[#0a0a0a]/95 backdrop-blur-sm border-b border-black/5 dark:border-white/5">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-3 flex items-center gap-4 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => handleCategorySelect(undefined)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap',
                !activeCategory
                  ? 'bg-[#FF4301] text-white shadow-sm'
                  : 'bg-white dark:bg-zinc-900 text-black/60 dark:text-white/60 border border-black/5 dark:border-white/5 hover:border-[#FF4301]/30',
              )}
              style={{ fontFamily: '"Hanken Grotesk", sans-serif' }}
            >
              All
            </button>
            {(categories || []).map((cat) => {
              const meta = TEMPLATE_CATEGORIES[cat.name];
              const isActive = activeCategory === cat.name;
              return (
                <button
                  key={cat.name}
                  onClick={() => handleCategorySelect(isActive ? undefined : cat.name)}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap',
                    isActive
                      ? 'text-white shadow-sm'
                      : 'bg-white dark:bg-zinc-900 text-black/60 dark:text-white/60 border border-black/5 dark:border-white/5 hover:border-[#FF4301]/30',
                  )}
                  style={{
                    fontFamily: '"Hanken Grotesk", sans-serif',
                    ...(isActive && meta ? { backgroundColor: meta.color } : {}),
                  }}
                >
                  {meta?.name || cat.displayName} ({cat.count})
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            <SlidersHorizontal className="w-4 h-4 text-black/40 dark:text-white/40" />
            <select
              value={sort}
              onChange={(e) => handleSortChange(e.target.value as 'popular' | 'newest')}
              className="text-sm bg-transparent border-none text-black/70 dark:text-white/70 focus:outline-none cursor-pointer"
              style={{ fontFamily: '"Hanken Grotesk", sans-serif' }}
            >
              <option value="popular">Most Popular</option>
              <option value="newest">Newest</option>
            </select>
          </div>
        </div>
      </section>

      {/* Grid */}
      <section className="max-w-[1400px] mx-auto px-4 sm:px-8 py-10">
        {templatesLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#FF4301]" />
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <LayoutGrid className="w-12 h-12 text-black/20 dark:text-white/20" />
            <h3
              className="text-lg font-semibold text-black dark:text-white"
              style={{ fontFamily: '"Hanken Grotesk", sans-serif' }}
            >
              No templates found
            </h3>
            <p className="text-black/50 dark:text-white/50 max-w-md">
              {debouncedSearch
                ? `No templates match "${debouncedSearch}". Try a different search term.`
                : 'No templates available in this category yet.'}
            </p>
            {(debouncedSearch || activeCategory) && (
              <Button
                variant="outline"
                className="border-[#FF4301] text-[#FF4301] hover:bg-[#FF4301]/5"
                onClick={() => { setSearch(''); navigate('/templates'); }}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {templates.map((tpl) => (
                <TemplateCard
                  key={tpl.id}
                  template={tpl}
                  onUse={handleUseTemplate}
                />
              ))}
            </div>

            <div className="mt-10 text-center text-sm text-black/40 dark:text-white/40">
              Showing {templates.length} of {templatesData?.total || 0} templates
            </div>
          </>
        )}
      </section>

      {/* Footer CTA */}
      <section className="py-20 px-4 sm:px-8 bg-[#FF4301] text-white">
        <div className="max-w-[800px] mx-auto text-center">
          <h2
            className="mb-4"
            style={{
              fontFamily: '"Hanken Grotesk", sans-serif',
              fontWeight: 700,
              fontSize: 'clamp(28px, 4vw, 48px)',
              lineHeight: '1.1',
              letterSpacing: '-0.02em',
            }}
          >
            Don't see what you need?
          </h2>
          <p className="text-xl opacity-90 mb-8 max-w-xl mx-auto font-light">
            Describe any presentation topic and let AI build it for you in seconds.
          </p>
          <Button
            size="lg"
            className="bg-white text-[#FF4301] hover:bg-zinc-100 px-12 py-7 text-lg font-bold shadow-xl"
            onClick={() => navigate(user ? '/app' : '/signup')}
          >
            Create with AI
            <ArrowRight className="ml-3 w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black text-white/60 py-12 px-8">
        <div className="max-w-[1400px] mx-auto text-center">
          <div className="cursor-pointer inline-block" onClick={() => navigate('/')}>
            <BrandWordmark
              tag="h3"
              sizePx={16}
              textColor="#ffffff"
              xImageUrl="/brand/nextslide-x.png"
              gapLeftPx={-3}
              gapRightPx={-8}
              liftPx={-4}
              xLiftPx={-4}
              rightLiftPx={0}
            />
          </div>
          <p className="text-sm mt-4">&copy; 2026 NextSlide. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default TemplateGallery;
