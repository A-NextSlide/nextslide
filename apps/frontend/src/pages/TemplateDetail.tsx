import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight, ChevronLeft, Users, Sparkles, ArrowRight, Copy,
  Loader2, Home, LayoutGrid,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import DynamicMeta from '@/components/seo/DynamicMeta';
import TemplateCard from '@/components/templates/TemplateCard';
import { templateApi, TEMPLATE_CATEGORIES, TemplateDetail as TemplateDetailType } from '@/services/templateApi';
import { trackEvent } from '@/services/analytics';
import { useAuth } from '@/context/SupabaseAuthContext';

/**
 * TemplateDetail - Individual template page (/templates/:slug)
 *
 * Features:
 *   - Full slide preview carousel
 *   - SEO-optimized meta tags with Schema.org
 *   - "Use this template" CTA (auth-gated)
 *   - "Customize with AI" CTA
 *   - Related templates section
 *   - Breadcrumb navigation
 *   - Use count display
 */
const TemplateDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isUsing, setIsUsing] = useState(false);

  // Fetch template
  const {
    data: template,
    isLoading,
    error,
  } = useQuery<TemplateDetailType>({
    queryKey: ['template', slug],
    queryFn: () => templateApi.getTemplate(slug!),
    enabled: !!slug,
    staleTime: 120_000,
  });

  // Fetch related templates (same category)
  const { data: relatedData } = useQuery({
    queryKey: ['templates', template?.category, 'related'],
    queryFn: () =>
      templateApi.getTemplates({
        category: template!.category,
        limit: 4,
        sort: 'popular',
      }),
    enabled: !!template?.category,
    staleTime: 120_000,
  });

  // Track page view
  useEffect(() => {
    if (slug) {
      trackEvent('template_viewed', { slug });
    }
  }, [slug]);

  // Slides from deck_data
  const slides = template?.deckData?.slides || [];

  // Carousel navigation
  const goNext = useCallback(() => {
    setCurrentSlide((prev) => (prev < slides.length - 1 ? prev + 1 : 0));
  }, [slides.length]);

  const goPrev = useCallback(() => {
    setCurrentSlide((prev) => (prev > 0 ? prev - 1 : slides.length - 1));
  }, [slides.length]);

  // Use template handler
  const handleUseTemplate = useCallback(async () => {
    if (!template) return;

    trackEvent('template_used', { slug: template.slug, category: template.category });

    if (!user) {
      // Store intent, redirect to signup
      sessionStorage.setItem('pendingTemplateSlug', template.slug);
      navigate('/signup');
      return;
    }

    setIsUsing(true);
    try {
      const result = await templateApi.useTemplate(template.slug);
      if (result.success && result.deckData) {
        sessionStorage.setItem('templateDeckData', JSON.stringify(result.deckData));
        sessionStorage.setItem('templateTitle', result.title);
        navigate('/app?from=template');
      }
    } catch (err) {
      console.error('Failed to use template:', err);
    } finally {
      setIsUsing(false);
    }
  }, [template, user, navigate]);

  // Customize with AI handler
  const handleCustomizeWithAI = useCallback(() => {
    if (!template) return;
    trackEvent('template_used', { slug: template.slug, category: template.category, method: 'ai_customize' });
    const topic = template.title.replace(/^Free\s+/i, '').replace(/\s+Template$/i, '');
    if (user) {
      navigate(`/app?prompt=${encodeURIComponent(topic)}`);
    } else {
      navigate(`/signup?redirect=${encodeURIComponent(`/app?prompt=${encodeURIComponent(topic)}`)}`);
    }
  }, [template, user, navigate]);

  // Category metadata
  const catMeta = template
    ? TEMPLATE_CATEGORIES[template.category] || { name: template.category, color: '#6366F1', gradient: 'from-indigo-500 to-violet-400' }
    : null;

  // SEO
  const seoTitle = template
    ? `${template.title} | NextSlide AI`
    : 'Template | NextSlide AI';
  const seoDescription = template?.description
    || `Use this free presentation template. Customize with AI in seconds using NextSlide.`;

  // Related templates (exclude current)
  const relatedTemplates = (relatedData?.templates || []).filter((t) => t.slug !== slug).slice(0, 3);

  // Format use count
  const formatCount = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return n.toString();
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error state
  if (error || !template) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <h1 className="text-xl font-bold text-foreground">Template not found</h1>
        <p className="text-muted-foreground">This template may have been removed or does not exist.</p>
        <Button variant="outline" onClick={() => navigate('/templates')}>
          Browse templates
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DynamicMeta
        title={seoTitle}
        description={seoDescription}
        url={`https://nextslide.ai/templates/${slug}`}
        image={template.thumbnailUrl}
      />

      {/* Breadcrumb */}
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-2">
        <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <li>
            <Link to="/" className="hover:text-foreground transition-colors flex items-center gap-1">
              <Home className="w-3.5 h-3.5" />
              Home
            </Link>
          </li>
          <ChevronRight className="w-3.5 h-3.5" />
          <li>
            <Link to="/templates" className="hover:text-foreground transition-colors">
              Templates
            </Link>
          </li>
          <ChevronRight className="w-3.5 h-3.5" />
          {catMeta && (
            <>
              <li>
                <Link
                  to={`/templates/category/${template.category}`}
                  className="hover:text-foreground transition-colors"
                >
                  {catMeta.name}
                </Link>
              </li>
              <ChevronRight className="w-3.5 h-3.5" />
            </>
          )}
          <li className="text-foreground font-medium truncate max-w-[200px]">
            {template.title}
          </li>
        </ol>
      </nav>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Slide preview */}
          <div className="lg:col-span-2">
            {/* Carousel */}
            <div className="relative rounded-xl overflow-hidden border border-border bg-card shadow-sm">
              <div
                className={cn(
                  'aspect-[16/10] flex items-center justify-center bg-gradient-to-br p-8',
                  catMeta?.gradient || 'from-indigo-500 to-violet-400',
                )}
              >
                {slides.length > 0 ? (
                  <div className="w-full h-full bg-white/95 dark:bg-gray-900/95 rounded-lg shadow-xl p-8 flex flex-col justify-center">
                    <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
                      {slides[currentSlide]?.title || `Slide ${currentSlide + 1}`}
                    </h2>
                    {slides[currentSlide]?.subtitle && (
                      <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
                        {slides[currentSlide].subtitle}
                      </p>
                    )}
                    {slides[currentSlide]?.content && (
                      <ul className="mt-4 space-y-2">
                        {(slides[currentSlide].content || []).map((block: any, idx: number) => (
                          <li key={idx} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                            {block.text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <div className="text-white/80 text-center">
                    <LayoutGrid className="w-12 h-12 mx-auto mb-2 opacity-60" />
                    <p>Preview not available</p>
                  </div>
                )}
              </div>

              {/* Navigation arrows */}
              {slides.length > 1 && (
                <>
                  <button
                    onClick={goPrev}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center transition-colors"
                    aria-label="Previous slide"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={goNext}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center transition-colors"
                    aria-label="Next slide"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}

              {/* Slide indicator */}
              {slides.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
                  {slides.map((_: any, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentSlide(idx)}
                      className={cn(
                        'w-2 h-2 rounded-full transition-all',
                        idx === currentSlide
                          ? 'bg-white w-6'
                          : 'bg-white/50 hover:bg-white/70',
                      )}
                      aria-label={`Go to slide ${idx + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Slide thumbnails */}
            {slides.length > 1 && (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {slides.map((slide: any, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentSlide(idx)}
                    className={cn(
                      'flex-shrink-0 w-28 h-18 rounded-lg border-2 p-2 text-left transition-all',
                      idx === currentSlide
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/30 bg-card',
                    )}
                  >
                    <p className="text-[10px] font-medium text-foreground line-clamp-2 leading-tight">
                      {slide.title || `Slide ${idx + 1}`}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Details + CTAs */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            {/* Title & meta */}
            <div>
              <h1 className="text-2xl font-bold text-foreground">{template.title}</h1>

              <div className="mt-3 flex items-center gap-3 flex-wrap">
                {catMeta && (
                  <span
                    className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium"
                    style={{
                      backgroundColor: `${catMeta.color}15`,
                      color: catMeta.color,
                    }}
                  >
                    {catMeta.name}
                  </span>
                )}

                {template.useCount > 0 && (
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Users className="w-4 h-4" />
                    {formatCount(template.useCount)} uses
                  </span>
                )}

                <span className="text-sm text-muted-foreground">
                  {slides.length} slides
                </span>
              </div>

              {template.description && (
                <p className="mt-4 text-muted-foreground leading-relaxed">{template.description}</p>
              )}

              {/* Tags */}
              {template.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {template.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-block rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* CTAs */}
            <div className="flex flex-col gap-3">
              <Button
                size="lg"
                className="w-full gap-2"
                onClick={handleUseTemplate}
                disabled={isUsing}
              >
                {isUsing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                Use this template
              </Button>

              <Button
                size="lg"
                variant="outline"
                className="w-full gap-2"
                onClick={handleCustomizeWithAI}
              >
                <Sparkles className="w-4 h-4" />
                Customize with AI
              </Button>
            </div>

            {/* Related templates */}
            {relatedTemplates.length > 0 && (
              <div className="mt-2">
                <h3 className="text-lg font-semibold text-foreground mb-3">Related Templates</h3>
                <div className="grid grid-cols-1 gap-3">
                  {relatedTemplates.map((rel) => (
                    <Link
                      key={rel.id}
                      to={`/templates/${rel.slug}`}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/50 transition-colors"
                    >
                      <div
                        className={cn(
                          'w-12 h-8 rounded flex-shrink-0 bg-gradient-to-br flex items-center justify-center',
                          TEMPLATE_CATEGORIES[rel.category]?.gradient || 'from-indigo-500 to-violet-400',
                        )}
                      >
                        <LayoutGrid className="w-4 h-4 text-white/80" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{rel.title}</p>
                        <p className="text-xs text-muted-foreground">{rel.useCount} uses</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </Link>
                  ))}
                </div>

                <Link
                  to={`/templates/category/${template.category}`}
                  className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  View all {catMeta?.name} templates
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplateDetailPage;
