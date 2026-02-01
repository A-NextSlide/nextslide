import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, ArrowRight, Sparkles, Briefcase, TrendingUp, Megaphone, GraduationCap, Cpu, DollarSign, Palette, Users, FlaskConical, HeartHandshake, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DynamicMeta from '@/components/seo/DynamicMeta';
import { templateApi, Template, TEMPLATE_CATEGORIES } from '@/services/templateApi';

// Category icons for visual interest
const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  business: Briefcase,
  sales: TrendingUp,
  marketing: Megaphone,
  education: GraduationCap,
  technology: Cpu,
  finance: DollarSign,
  creative: Palette,
  consulting: Users,
  research: FlaskConical,
  hr: HeartHandshake,
};

// Category SEO content for programmatic pages
const CATEGORY_SEO: Record<string, {
  title: string;
  metaTitle: string;
  metaDescription: string;
  heading: string;
  intro: string;
  useCases: string[];
}> = {
  business: {
    title: 'Business Presentation Templates',
    metaTitle: 'Free Business Presentation Templates | NextSlide AI',
    metaDescription: 'Professional business presentation templates powered by AI. Pitch decks, company overviews, quarterly reviews, and more. Customize in seconds.',
    heading: 'Business Presentation Templates',
    intro: 'Start with a professionally designed business template and customize it with AI in seconds. Perfect for pitch decks, company overviews, quarterly reviews, and boardroom presentations.',
    useCases: ['Pitch Deck', 'Company Overview', 'Quarterly Review', 'Business Plan', 'Annual Report'],
  },
  sales: {
    title: 'Sales Presentation Templates',
    metaTitle: 'Free Sales Presentation Templates | NextSlide AI',
    metaDescription: 'Sales presentation templates that close deals. Product demos, proposals, and competitive analyses designed to convert. Powered by AI.',
    heading: 'Sales Presentation Templates',
    intro: 'Close more deals with sales presentations that convert. These templates are optimized for product demos, client proposals, competitive analyses, and quarterly business reviews.',
    useCases: ['Product Demo', 'Client Proposal', 'Competitive Analysis', 'Sales Playbook', 'QBR'],
  },
  marketing: {
    title: 'Marketing Presentation Templates',
    metaTitle: 'Free Marketing Presentation Templates | NextSlide AI',
    metaDescription: 'Marketing presentation templates for strategies, campaigns, and reports. Beautiful designs powered by AI. Free to start.',
    heading: 'Marketing Presentation Templates',
    intro: 'Create marketing presentations that make an impact. From strategy decks to campaign reports, these templates help you tell your marketing story with clarity and style.',
    useCases: ['Marketing Strategy', 'Campaign Report', 'Brand Guidelines', 'Social Media Plan', 'Content Calendar'],
  },
  education: {
    title: 'Education Presentation Templates',
    metaTitle: 'Free Education Presentation Templates | NextSlide AI',
    metaDescription: 'Educational presentation templates for lectures, courses, and workshops. Designed for student engagement. Free for educators.',
    heading: 'Education Presentation Templates',
    intro: 'Engage students with professionally designed educational templates. Perfect for lectures, online courses, workshops, and training materials. Designed for clarity and retention.',
    useCases: ['Lecture Slides', 'Course Module', 'Workshop', 'Training Program', 'Research Presentation'],
  },
  technology: {
    title: 'Technology Presentation Templates',
    metaTitle: 'Free Technology Presentation Templates | NextSlide AI',
    metaDescription: 'Tech presentation templates for product launches, architecture reviews, and engineering updates. Modern designs powered by AI.',
    heading: 'Technology Presentation Templates',
    intro: 'Present technology with confidence. These templates are built for product launches, architecture reviews, engineering updates, and tech demos with clean, modern design.',
    useCases: ['Product Launch', 'Architecture Review', 'Sprint Demo', 'Technical Proposal', 'API Documentation'],
  },
  finance: {
    title: 'Finance Presentation Templates',
    metaTitle: 'Free Finance Presentation Templates | NextSlide AI',
    metaDescription: 'Finance presentation templates for reports, budgets, and investor updates. Data-driven designs powered by AI.',
    heading: 'Finance Presentation Templates',
    intro: 'Present financial data with precision and clarity. Templates designed for financial reports, budget reviews, investor updates, and economic analyses.',
    useCases: ['Financial Report', 'Budget Review', 'Investor Update', 'Economic Analysis', 'Audit Summary'],
  },
  creative: {
    title: 'Creative Presentation Templates',
    metaTitle: 'Free Creative Presentation Templates | NextSlide AI',
    metaDescription: 'Creative presentation templates for portfolios, design reviews, and brand pitches. Eye-catching designs powered by AI.',
    heading: 'Creative Presentation Templates',
    intro: 'Make your creative work shine. Templates designed for design portfolios, creative pitches, brand presentations, and visual storytelling.',
    useCases: ['Design Portfolio', 'Creative Brief', 'Brand Pitch', 'Photo Essay', 'Visual Proposal'],
  },
  consulting: {
    title: 'Consulting Presentation Templates',
    metaTitle: 'Free Consulting Presentation Templates | NextSlide AI',
    metaDescription: 'Consulting presentation templates for client deliverables, strategy analysis, and market research. Professional designs powered by AI.',
    heading: 'Consulting Presentation Templates',
    intro: 'Deliver consulting-grade presentations with professional templates. Built for client deliverables, strategy analyses, market research, and change management decks.',
    useCases: ['Client Deliverable', 'Strategy Analysis', 'Market Research', 'Change Management', 'Due Diligence'],
  },
  research: {
    title: 'Research Presentation Templates',
    metaTitle: 'Free Research Presentation Templates | NextSlide AI',
    metaDescription: 'Research presentation templates for academic papers, conference talks, and scientific reports. Clear, structured designs powered by AI.',
    heading: 'Research Presentation Templates',
    intro: 'Present research findings with impact. Templates designed for academic conferences, thesis defenses, journal presentations, and scientific reports.',
    useCases: ['Conference Talk', 'Thesis Defense', 'Literature Review', 'Lab Report', 'Grant Proposal'],
  },
  hr: {
    title: 'HR & Training Presentation Templates',
    metaTitle: 'Free HR & Training Presentation Templates | NextSlide AI',
    metaDescription: 'HR presentation templates for onboarding, training, and company culture. Engaging designs powered by AI.',
    heading: 'HR & Training Presentation Templates',
    intro: 'Build a great workplace with professional HR presentations. Templates for employee onboarding, training programs, culture decks, and performance reviews.',
    useCases: ['Employee Onboarding', 'Training Program', 'Culture Deck', 'Performance Review', 'Benefits Overview'],
  },
};

const ALL_CATEGORIES = Object.keys(CATEGORY_SEO);

const FONT_HEADING = '"HK Grotesk Wide", "Hanken Grotesk", sans-serif';

// ─────────────────────────────────────────────────────────────────────
// Index page — shown when no slug is provided
// ─────────────────────────────────────────────────────────────────────
function TemplateIndexPage() {
  const navigate = useNavigate();

  const canonicalUrl = 'https://nextslide.ai/presentation-templates';
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Presentation Templates',
    description: 'Free AI-powered presentation templates for every use case. Business, sales, marketing, education, and more.',
    url: canonicalUrl,
    provider: { '@type': 'Organization', name: 'NextSlide', url: 'https://nextslide.ai' },
  };

  return (
    <div className="min-h-screen bg-[#FCFBF8]">
      <DynamicMeta
        title="Free Presentation Templates | NextSlide AI"
        description="Professional presentation templates for every use case. Business, sales, marketing, education, technology, and more. Powered by AI."
        url={canonicalUrl}
        canonical={canonicalUrl}
        schema={schema}
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
      <section className="pt-20 pb-16 px-6 sm:px-8">
        <div className="max-w-[800px] mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-black/5 text-xs font-bold text-black/50 uppercase tracking-widest mb-8">
            <Sparkles className="w-3.5 h-3.5 text-[#FF4301]" />
            AI-Powered Templates
          </div>
          <h1
            className="text-4xl sm:text-5xl md:text-6xl font-black text-black tracking-tight mb-6"
            style={{ fontFamily: FONT_HEADING, letterSpacing: '-0.02em' }}
          >
            Presentation Templates
          </h1>
          <p className="text-lg sm:text-xl text-black/50 max-w-xl mx-auto mb-10 font-light">
            Pick a category, choose a template, and let AI customize it for your content in seconds.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-white/50 backdrop-blur-sm rounded-full border border-black/5">
              <Check className="w-3 h-3 text-[#FF4301]" />
              <span className="text-xs font-bold text-black/50 uppercase tracking-wider">Free to start</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white/50 backdrop-blur-sm rounded-full border border-black/5">
              <Check className="w-3 h-3 text-[#FF4301]" />
              <span className="text-xs font-bold text-black/50 uppercase tracking-wider">Fully customizable</span>
            </div>
          </div>
        </div>
      </section>

      {/* Category Grid */}
      <section className="pb-20 px-6 sm:px-8">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {ALL_CATEGORIES.map((cat) => {
              const seo = CATEGORY_SEO[cat];
              const Icon = CATEGORY_ICONS[cat] || Briefcase;
              return (
                <Link
                  key={cat}
                  to={`/presentation-templates/${cat}`}
                  className="group relative bg-white rounded-2xl border border-black/5 p-6 hover:border-[#FF4301]/30 hover:shadow-xl hover:shadow-orange-500/5 transition-all"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#FF4301]/5 flex items-center justify-center mb-4 group-hover:bg-[#FF4301]/10 transition-colors">
                    <Icon className="w-5 h-5 text-[#FF4301]" />
                  </div>
                  <h2
                    className="text-sm font-bold text-black mb-1.5 group-hover:text-[#FF4301] transition-colors"
                    style={{ fontFamily: FONT_HEADING }}
                  >
                    {seo.heading}
                  </h2>
                  <p className="text-xs text-black/40 line-clamp-2 mb-4">
                    {seo.intro}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {seo.useCases.slice(0, 3).map((uc) => (
                      <span
                        key={uc}
                        className="px-2 py-0.5 rounded-md bg-black/[0.03] text-[10px] font-medium text-black/40"
                      >
                        {uc}
                      </span>
                    ))}
                  </div>
                  <ArrowRight className="absolute top-6 right-6 w-4 h-4 text-black/10 group-hover:text-[#FF4301] transition-colors" />
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 sm:px-8 bg-white border-t border-black/5">
        <div className="max-w-[600px] mx-auto text-center">
          <h2
            className="text-2xl sm:text-3xl font-black text-black mb-4"
            style={{ fontFamily: FONT_HEADING, letterSpacing: '-0.02em' }}
          >
            Or just describe what you need
          </h2>
          <p className="text-sm text-black/50 mb-8">
            Skip templates entirely. Tell AI your topic and get a complete, custom presentation in seconds.
          </p>
          <Button
            size="lg"
            onClick={() => navigate('/app')}
            className="bg-[#FF4301] hover:bg-[#E63901] text-white text-base font-bold rounded-xl px-10 py-6 shadow-lg shadow-orange-500/20"
          >
            Generate with AI
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-black/5 py-8 px-6 sm:px-8">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between text-xs text-black/30">
          <Link to="/" className="font-bold hover:text-black/50 transition-colors" style={{ fontFamily: FONT_HEADING }}>
            NextSlide
          </Link>
          <div className="flex gap-4">
            <Link to="/templates" className="hover:text-black/50 transition-colors">Templates</Link>
            <Link to="/presentations" className="hover:text-black/50 transition-colors">Browse</Link>
            <Link to="/pricing" className="hover:text-black/50 transition-colors">Pricing</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Category page — shown when a valid slug is provided
// ─────────────────────────────────────────────────────────────────────
export default function PresentationTemplateLanding() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  const category = slug || '';
  const seo = CATEGORY_SEO[category];
  const categoryMeta = TEMPLATE_CATEGORIES[category];
  const Icon = CATEGORY_ICONS[category] || Briefcase;

  useEffect(() => {
    if (!category || !seo) {
      setLoading(false);
      return;
    }

    const fetchTemplates = async () => {
      setLoading(true);
      try {
        const result = await templateApi.getTemplates({ category, limit: 12, sort: 'popular' });
        setTemplates(result.templates);
      } catch (err) {
        console.error('[PresentationTemplateLanding] Failed to load templates:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTemplates();
  }, [category, seo]);

  // No slug → render the index page
  if (!slug) return <TemplateIndexPage />;

  // Unknown category
  if (!seo) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FCFBF8] px-4">
        <h1
          className="text-2xl font-black text-black mb-2"
          style={{ fontFamily: FONT_HEADING }}
        >
          Category not found
        </h1>
        <p className="text-sm text-black/50 mb-6">
          This template category does not exist.
        </p>
        <Button
          variant="outline"
          onClick={() => navigate('/presentation-templates')}
          className="rounded-xl"
        >
          Browse all categories
        </Button>
      </div>
    );
  }

  const canonicalUrl = `https://nextslide.ai/presentation-templates/${category}`;
  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: seo.title,
    description: seo.metaDescription,
    url: canonicalUrl,
    provider: { '@type': 'Organization', name: 'NextSlide', url: 'https://nextslide.ai' },
  };

  const otherCategories = ALL_CATEGORIES.filter(c => c !== category);

  return (
    <div className="min-h-screen bg-[#FCFBF8]">
      <DynamicMeta
        title={seo.metaTitle}
        description={seo.metaDescription}
        url={canonicalUrl}
        canonical={canonicalUrl}
        schema={collectionSchema}
      />

      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-[#FCFBF8]/90 backdrop-blur-xl border-b border-black/5">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="text-lg font-black tracking-tight text-black"
              style={{ fontFamily: FONT_HEADING }}
            >
              NextSlide
            </Link>
            <span className="text-black/10">/</span>
            <Link
              to="/presentation-templates"
              className="text-sm font-medium text-black/40 hover:text-black/60 transition-colors"
            >
              Templates
            </Link>
          </div>
          <Link to="/app">
            <Button className="bg-[#FF4301] hover:bg-[#E63901] text-white text-sm font-semibold rounded-xl px-5 shadow-lg shadow-orange-500/15">
              Create with AI
              <Sparkles className="ml-2 w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-20 pb-16 px-6 sm:px-8">
        <div className="max-w-[800px] mx-auto text-center">
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-white border border-black/5 text-xs font-bold text-black/50 uppercase tracking-widest mb-8">
            <Icon className="w-3.5 h-3.5 text-[#FF4301]" />
            {categoryMeta?.name || category}
          </div>
          <h1
            className="text-3xl sm:text-4xl md:text-5xl font-black text-black tracking-tight mb-5"
            style={{ fontFamily: FONT_HEADING, letterSpacing: '-0.02em' }}
          >
            {seo.heading}
          </h1>
          <p className="text-base sm:text-lg text-black/50 max-w-2xl mx-auto mb-10 font-light">
            {seo.intro}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              size="lg"
              onClick={() => navigate('/app')}
              className="bg-[#FF4301] hover:bg-[#E63901] text-white font-bold rounded-xl px-8 py-6 text-base shadow-lg shadow-orange-500/20"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Create with AI
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate('/templates')}
              className="rounded-xl px-8 py-6 text-base border-black/10 hover:border-black/20 text-black/60"
            >
              Browse All Templates
            </Button>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-12 px-6 sm:px-8">
        <div className="max-w-[800px] mx-auto">
          <h2
            className="text-xs font-bold text-black/30 uppercase tracking-widest mb-5 text-center"
            style={{ fontFamily: FONT_HEADING }}
          >
            Popular Use Cases
          </h2>
          <div className="flex flex-wrap justify-center gap-2.5">
            {seo.useCases.map((uc) => (
              <span
                key={uc}
                className="px-4 py-2 rounded-full bg-white border border-black/5 text-sm font-medium text-black/60"
              >
                {uc}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Templates Grid */}
      <section className="py-12 px-6 sm:px-8">
        <div className="max-w-[1200px] mx-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-[#FF4301]" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-[#FF4301]/5 flex items-center justify-center mx-auto mb-5">
                <Sparkles className="w-7 h-7 text-[#FF4301]" />
              </div>
              <h3
                className="text-lg font-bold text-black mb-2"
                style={{ fontFamily: FONT_HEADING }}
              >
                Templates coming soon
              </h3>
              <p className="text-sm text-black/40 max-w-md mx-auto mb-6">
                We're building templates for this category. In the meantime, describe your {categoryMeta?.name?.toLowerCase() || category} presentation and AI will generate it from scratch.
              </p>
              <Button
                onClick={() => navigate('/app')}
                className="bg-[#FF4301] hover:bg-[#E63901] text-white font-semibold rounded-xl shadow-lg shadow-orange-500/15"
              >
                Generate with AI
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          ) : (
            <>
              <h2
                className="text-xs font-bold text-black/30 uppercase tracking-widest mb-6"
                style={{ fontFamily: FONT_HEADING }}
              >
                {templates.length} Templates
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {templates.map((template) => (
                  <Link
                    key={template.id}
                    to={`/templates/${template.slug}`}
                    className="group bg-white rounded-2xl border border-black/5 overflow-hidden hover:border-[#FF4301]/30 hover:shadow-xl hover:shadow-orange-500/5 transition-all"
                  >
                    <div className="aspect-video bg-gradient-to-br from-black/[0.02] to-black/[0.05] relative overflow-hidden">
                      {template.thumbnailUrl ? (
                        <img
                          src={template.thumbnailUrl}
                          alt={template.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span
                            className="text-base font-bold text-black/10 text-center px-6 line-clamp-2 group-hover:text-black/20 transition-colors"
                            style={{ fontFamily: FONT_HEADING }}
                          >
                            {template.title}
                          </span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="p-4">
                      <h3 className="text-sm font-semibold text-black truncate group-hover:text-[#FF4301] transition-colors">
                        {template.title}
                      </h3>
                      {template.description && (
                        <p className="text-xs text-black/40 mt-1 line-clamp-2">{template.description}</p>
                      )}
                      <div className="flex items-center justify-between text-[10px] text-black/30 mt-3">
                        <span className="capitalize px-2 py-0.5 rounded-md bg-black/[0.03]">{template.category}</span>
                        <span>{template.useCount} uses</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 sm:px-8 bg-white border-t border-black/5">
        <div className="max-w-[600px] mx-auto text-center">
          <h2
            className="text-2xl sm:text-3xl font-black text-black mb-4"
            style={{ fontFamily: FONT_HEADING, letterSpacing: '-0.02em' }}
          >
            Don't see what you need?
          </h2>
          <p className="text-sm text-black/50 mb-8">
            Describe any presentation topic and AI will generate a complete deck for you in seconds.
          </p>
          <Button
            size="lg"
            onClick={() => navigate('/app')}
            className="bg-[#FF4301] hover:bg-[#E63901] text-white text-base font-bold rounded-xl px-10 py-6 shadow-lg shadow-orange-500/20"
          >
            Generate with AI
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Cross-links */}
      <section className="py-14 px-6 sm:px-8 border-t border-black/5">
        <div className="max-w-[1200px] mx-auto">
          <h2
            className="text-xs font-bold text-black/30 uppercase tracking-widest mb-6"
            style={{ fontFamily: FONT_HEADING }}
          >
            More Template Categories
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {otherCategories.map((cat) => {
              const catSeo = CATEGORY_SEO[cat];
              const catMeta = TEMPLATE_CATEGORIES[cat];
              const CatIcon = CATEGORY_ICONS[cat] || Briefcase;
              return (
                <Link
                  key={cat}
                  to={`/presentation-templates/${cat}`}
                  className="group flex items-center gap-2.5 p-3.5 rounded-xl bg-white border border-black/5 hover:border-[#FF4301]/20 hover:shadow-md hover:shadow-orange-500/5 transition-all text-sm"
                >
                  <CatIcon className="w-3.5 h-3.5 text-black/20 group-hover:text-[#FF4301] shrink-0 transition-colors" />
                  <span className="truncate text-black/60 group-hover:text-black transition-colors font-medium text-xs">
                    {catMeta?.name || cat}
                  </span>
                </Link>
              );
            })}
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
            <Link to="/presentation-templates" className="hover:text-black/50 transition-colors">Categories</Link>
            <Link to="/templates" className="hover:text-black/50 transition-colors">Templates</Link>
            <Link to="/presentations" className="hover:text-black/50 transition-colors">Browse</Link>
            <Link to="/pricing" className="hover:text-black/50 transition-colors">Pricing</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
