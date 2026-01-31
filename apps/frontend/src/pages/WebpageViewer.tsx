import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { webpageApi, type PublishedWebpage } from '@/services/webpageApi';
import { trackWebpageViewed, trackWebpageScrollDepth, trackWebpageLeadCaptured } from '@/services/analytics';
import { Loader2, ChevronDown, Check, ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// ============================================================================
// Section Component - Each slide rendered as a full-viewport section
// ============================================================================

interface SlideSectionProps {
  slide: any;
  index: number;
  totalSlides: number;
}

function SlideSection({ slide, index, totalSlides }: SlideSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });

  // Extract slide content
  const title = slide.title || slide.name || '';
  const body = slide.body || slide.content || slide.text || '';
  const subtitle = slide.subtitle || '';
  const bgColor = slide.backgroundColor || slide.bgColor || slide.background?.color || '';
  const bgImage = slide.backgroundImage || slide.background?.image || slide.bgImage || '';
  const imageUrl = slide.imageUrl || slide.image || '';

  // Determine if this is a title/cover slide
  const isCoverSlide = index === 0;
  const isLastSlide = index === totalSlides - 1;

  // Compute contrasting text color for dark backgrounds
  const isDarkBg = bgColor && isColorDark(bgColor);
  const textColorClass = isDarkBg ? 'text-white' : 'text-gray-900';
  const subtitleColorClass = isDarkBg ? 'text-white/70' : 'text-gray-500';
  const bodyColorClass = isDarkBg ? 'text-white/80' : 'text-gray-600';

  return (
    <section
      ref={ref}
      className="relative min-h-screen w-full flex items-center justify-center overflow-hidden"
      style={{
        scrollSnapAlign: 'start',
        backgroundColor: bgColor || (isCoverSlide ? '#0f172a' : index % 2 === 0 ? '#ffffff' : '#f8fafc'),
      }}
    >
      {/* Background image overlay */}
      {bgImage && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${bgImage})` }}
        >
          <div className="absolute inset-0 bg-black/50" />
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 w-full max-w-4xl mx-auto px-6 sm:px-8 py-16 sm:py-24">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-6"
        >
          {/* Slide number indicator */}
          {!isCoverSlide && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : { opacity: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className={`text-sm font-medium tracking-widest uppercase ${subtitleColorClass}`}
            >
              {String(index).padStart(2, '0')}
            </motion.div>
          )}

          {/* Title */}
          {title && (
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ delay: 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className={`font-bold leading-tight ${
                isCoverSlide
                  ? `text-4xl sm:text-5xl md:text-6xl ${bgImage ? 'text-white' : textColorClass === 'text-white' ? 'text-white' : 'text-white'}`
                  : `text-3xl sm:text-4xl ${bgImage ? 'text-white' : textColorClass}`
              }`}
            >
              {title}
            </motion.h2>
          )}

          {/* Subtitle */}
          {subtitle && (
            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className={`text-lg sm:text-xl ${
                bgImage ? 'text-white/80' : isCoverSlide ? 'text-white/70' : subtitleColorClass
              }`}
            >
              {subtitle}
            </motion.p>
          )}

          {/* Body text */}
          {body && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className={`text-base sm:text-lg leading-relaxed max-w-3xl whitespace-pre-line ${
                bgImage ? 'text-white/80' : isCoverSlide ? 'text-white/70' : bodyColorClass
              }`}
            >
              {body}
            </motion.div>
          )}

          {/* Slide image */}
          {imageUrl && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="mt-8"
            >
              <img
                src={imageUrl}
                alt={title || 'Slide image'}
                className="w-full max-w-2xl mx-auto rounded-lg shadow-xl object-contain"
                loading="lazy"
              />
            </motion.div>
          )}
        </motion.div>

        {/* Scroll indicator on cover slide */}
        {isCoverSlide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.8 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2"
          >
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            >
              <ChevronDown className={`h-6 w-6 ${bgImage ? 'text-white/60' : 'text-white/40'}`} />
            </motion.div>
          </motion.div>
        )}
      </div>
    </section>
  );
}

// ============================================================================
// Lead Capture Section
// ============================================================================

interface LeadCaptureSectionProps {
  slug: string;
  title: string;
}

function LeadCaptureSection({ slug, title }: LeadCaptureSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setSubmitting(true);
    setError('');

    try {
      await webpageApi.submitLead(slug, email.trim(), name.trim() || undefined);
      setSubmitted(true);
      trackWebpageLeadCaptured(slug);
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      ref={ref}
      className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-gray-900 to-black"
      style={{ scrollSnapAlign: 'start' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md mx-auto px-6 text-center"
      >
        {!submitted ? (
          <>
            <h3 className="text-3xl font-bold text-white mb-3">
              Want to learn more?
            </h3>
            <p className="text-white/60 mb-8">
              Enter your email to stay updated about {title}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="text"
                placeholder="Your name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/40 h-12 rounded-lg"
              />
              <Input
                type="email"
                placeholder="your@email.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/40 h-12 rounded-lg"
              />
              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}
              <Button
                type="submit"
                disabled={submitting || !email.trim()}
                className="w-full h-12 bg-white text-gray-900 hover:bg-gray-100 font-semibold rounded-lg"
              >
                {submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  'Subscribe'
                )}
              </Button>
            </form>
          </>
        ) : (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="text-center"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">
              Thank you!
            </h3>
            <p className="text-white/60">
              We will keep you posted.
            </p>
          </motion.div>
        )}
      </motion.div>
    </section>
  );
}

// ============================================================================
// Progress Dots Navigation
// ============================================================================

interface ProgressDotsProps {
  totalSections: number;
  currentSection: number;
  onDotClick: (index: number) => void;
}

function ProgressDots({ totalSections, currentSection, onDotClick }: ProgressDotsProps) {
  return (
    <nav className="fixed right-4 sm:right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-2">
      {Array.from({ length: totalSections }).map((_, i) => (
        <button
          key={i}
          onClick={() => onDotClick(i)}
          className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
            i === currentSection
              ? 'bg-white scale-125 shadow-lg shadow-white/30'
              : 'bg-white/30 hover:bg-white/50'
          }`}
          aria-label={`Go to section ${i + 1}`}
        />
      ))}
    </nav>
  );
}

// ============================================================================
// Helper: Determine if a hex/rgb color is dark
// ============================================================================

function isColorDark(color: string): boolean {
  if (!color) return false;

  let r = 0, g = 0, b = 0;

  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }
  } else if (color.startsWith('rgb')) {
    const match = color.match(/\d+/g);
    if (match && match.length >= 3) {
      r = parseInt(match[0]);
      g = parseInt(match[1]);
      b = parseInt(match[2]);
    }
  }

  // Luminance formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

// ============================================================================
// Main WebpageViewer Component
// ============================================================================

export default function WebpageViewer() {
  const { slug } = useParams<{ slug: string }>();
  const [webpage, setWebpage] = useState<PublishedWebpage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentSection, setCurrentSection] = useState(0);
  const [maxScrolledSection, setMaxScrolledSection] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const slides = webpage?.slides_data || [];
  const settings = webpage?.settings || {};
  const showNavigation = settings.show_navigation !== false;
  const leadCaptureEnabled = settings.lead_capture_enabled !== false;
  const totalSections = slides.length + (leadCaptureEnabled ? 1 : 0);

  // Fetch webpage data
  useEffect(() => {
    if (!slug) return;

    const fetchWebpage = async () => {
      try {
        const data = await webpageApi.getWebpageBySlug(slug);
        setWebpage(data);

        // SEO: Set document title
        document.title = data.title || 'Presentation';
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc && data.description) {
          metaDesc.setAttribute('content', data.description);
        } else if (data.description) {
          const meta = document.createElement('meta');
          meta.name = 'description';
          meta.content = data.description;
          document.head.appendChild(meta);
        }
      } catch (err: any) {
        if (err.message === 'WEBPAGE_NOT_FOUND') {
          setError('This page does not exist or has been unpublished.');
        } else {
          setError('Failed to load this page. Please try again later.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchWebpage();
  }, [slug]);

  // Record view on mount
  useEffect(() => {
    if (slug && webpage) {
      webpageApi.recordView(slug);
      trackWebpageViewed(slug);
    }
  }, [slug, webpage]);

  // Track current section based on scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !webpage) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const sectionHeight = window.innerHeight;
      const newSection = Math.round(scrollTop / sectionHeight);
      const clamped = Math.min(Math.max(newSection, 0), totalSections - 1);

      setCurrentSection(clamped);

      // Track max scroll depth
      if (clamped > maxScrolledSection) {
        setMaxScrolledSection(clamped);
        if (slug) {
          trackWebpageScrollDepth({
            slug,
            depth: clamped + 1,
            totalSections,
          });
        }
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [webpage, totalSections, maxScrolledSection, slug]);

  // Keyboard navigation
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !webpage) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        const next = Math.min(currentSection + 1, totalSections - 1);
        scrollToSection(next);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        const prev = Math.max(currentSection - 1, 0);
        scrollToSection(prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSection, totalSections, webpage]);

  const scrollToSection = useCallback((index: number) => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({
      top: index * window.innerHeight,
      behavior: 'smooth',
    });
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <Loader2 className="h-8 w-8 text-white/40 animate-spin mx-auto mb-4" />
          <p className="text-white/40 text-sm">Loading...</p>
        </motion.div>
      </div>
    );
  }

  // Error state
  if (error || !webpage) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <h1 className="text-2xl font-bold text-white mb-3">Page Not Found</h1>
          <p className="text-white/50 mb-6">
            {error || 'This page could not be found.'}
          </p>
          <Button
            variant="outline"
            onClick={() => window.location.href = '/'}
            className="border-white/20 text-white hover:bg-white/10"
          >
            Go Home
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-screen overflow-y-auto"
      style={{
        scrollSnapType: 'y mandatory',
        scrollBehavior: 'smooth',
      }}
    >
      {/* Progress dots */}
      {showNavigation && totalSections > 1 && (
        <ProgressDots
          totalSections={totalSections}
          currentSection={currentSection}
          onDotClick={scrollToSection}
        />
      )}

      {/* Slide sections */}
      {slides.map((slide: any, index: number) => (
        <SlideSection
          key={index}
          slide={slide}
          index={index}
          totalSlides={slides.length}
        />
      ))}

      {/* Lead capture section */}
      {leadCaptureEnabled && slug && (
        <LeadCaptureSection
          slug={slug}
          title={webpage.title}
        />
      )}

      {/* Back to top button (visible when scrolled past first section) */}
      {currentSection > 0 && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          onClick={() => scrollToSection(0)}
          className="fixed bottom-6 right-6 z-50 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center hover:bg-white/20 transition-colors"
          aria-label="Back to top"
        >
          <ArrowUp className="h-4 w-4 text-white" />
        </motion.button>
      )}

      {/* Built with NextSlide footer */}
      <div className="fixed bottom-4 left-4 z-40">
        <a
          href="https://nextslide.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-white/20 hover:text-white/40 transition-colors"
        >
          Built with NextSlide
        </a>
      </div>
    </div>
  );
}
