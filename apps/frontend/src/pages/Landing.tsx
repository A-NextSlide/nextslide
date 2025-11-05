import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import BrandWordmark from '@/components/common/BrandWordmark';
import { cn } from '@/lib/utils';
import {
  ArrowRight, Check, Menu, X, Play, Star, Clock, Frown, DollarSign,
  Zap, Palette, Brain, ChevronDown, ChevronUp
} from 'lucide-react';

const Landing: React.FC = () => {
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Handle scroll events
  useEffect(() => {
    document.documentElement.style.position = '';
    document.documentElement.style.overflow = '';
    document.body.style.position = '';
    document.body.style.overflow = '';

    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.documentElement.style.position = 'fixed';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.overflow = 'hidden';
    };
  }, []);

  // Intersection observer for animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
          }
        });
      },
      { threshold: 0.1, rootMargin: '-50px' }
    );

    document.querySelectorAll('.animate-on-scroll').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const problems = [
    {
      icon: Clock,
      title: "Hours wasted on slides",
      description: "Your team spends 5-10 hours building every presentation from scratch. That's time not spent selling, closing, or shipping."
    },
    {
      icon: Frown,
      title: "Templates that don't work",
      description: "PowerPoint templates look amateur. Canva feels like homework. Nothing matches your brand or saves real time."
    },
    {
      icon: DollarSign,
      title: "Designer dependency",
      description: "You're either paying agencies thousands per deck, or settling for presentations that hurt your credibility."
    }
  ];

  const features = [
    {
      icon: Zap,
      tag: "SPEED",
      title: "30-second presentations",
      description: "Describe what you're presenting. AI generates your entire deck—slides, layouts, visuals—in 30 seconds. What used to take hours now happens instantly.",
      bullets: [
        "Complete decks in under a minute",
        "No templates to fight with",
        "Automatic layout optimization",
        "Smart content distribution"
      ]
    },
    {
      icon: Palette,
      title: "Professional design, automatically",
      tag: "DESIGN",
      description: "Every slide is perfectly balanced and on-brand. Our AI understands design principles—spacing, hierarchy, color theory—so every presentation looks like it came from an agency.",
      bullets: [
        "Pixel-perfect layouts every time",
        "Automatic brand consistency",
        "Professional typography",
        "Smart visual hierarchy"
      ]
    },
    {
      icon: Brain,
      tag: "INTELLIGENCE",
      title: "AI that understands context",
      description: "Not just template-filling. Our AI understands your industry, audience, and goals to create presentations that actually work for your specific use case.",
      bullets: [
        "Industry-specific content",
        "Audience-aware messaging",
        "Goal-oriented structure",
        "Adaptive recommendations"
      ]
    }
  ];

  const useCases = [
    {
      role: "Sales Teams",
      problem: "You're losing deals because your pitch decks look generic and take forever to customize per prospect.",
      solution: "Build adaptive pitch decks in minutes. Update data in real-time during calls. Close 38% more deals with presentations that actually match each prospect."
    },
    {
      role: "Founders",
      problem: "Investor decks are make-or-break, but you're not a designer and agencies cost $10K+.",
      solution: "Get investor-ready pitch decks from day one. Professional quality without the agency cost. Portfolio companies have raised $50M+ using NextSlide decks."
    },
    {
      role: "Marketers",
      problem: "Campaign decks, stakeholder updates, and quarterly reviews eat up your entire week.",
      solution: "Ship presentations 5x faster without sacrificing quality. More time for strategy, less time fighting with slides."
    }
  ];

  const comparison = [
    { feature: "AI-generated content", nextslide: true, powerpoint: false, canva: false },
    { feature: "Smart layout optimization", nextslide: true, powerpoint: false, canva: false },
    { feature: "30-second deck creation", nextslide: true, powerpoint: false, canva: false },
    { feature: "Professional design quality", nextslide: true, powerpoint: "partial", canva: "partial" },
    { feature: "Export to PowerPoint", nextslide: true, powerpoint: true, canva: false },
    { feature: "Real-time collaboration", nextslide: true, powerpoint: "limited", canva: true },
    { feature: "Brand consistency", nextslide: true, powerpoint: false, canva: "manual" }
  ];

  const faqs = [
    {
      question: "How is this different from ChatGPT making slides?",
      answer: "ChatGPT can generate text, but it can't design professional layouts, balance visual hierarchy, or create production-ready presentations. NextSlide's AI is purpose-built for presentations—it understands design principles, slide structure, and visual storytelling. You get finished decks, not just text you have to format yourself."
    },
    {
      question: "Can I export to PowerPoint?",
      answer: "Yes. Every NextSlide presentation exports as a fully-editable PowerPoint file (.pptx). You can also export as PDF or share with a link. Your presentations work everywhere."
    },
    {
      question: "What if I need to make changes?",
      answer: "Everything is editable. Use our intuitive editor to adjust text, images, layouts, colors—anything. The AI gives you a professional starting point, then you refine exactly what you need."
    },
    {
      question: "How accurate is the AI?",
      answer: "Very. Our AI is trained specifically on presentation design and business communication. It understands context, audience, and goals. Every deck is reviewed by our quality systems before delivery. If something's not quite right, you can regenerate individual slides or edit directly."
    },
    {
      question: "Do I need design skills?",
      answer: "No. That's the entire point. NextSlide handles all design decisions—spacing, typography, color, hierarchy, layout. You focus on your message, we handle making it look professional."
    }
  ];

  return (
    <div className="min-h-screen bg-[#FCFBF8] dark:bg-[#0a0a0a]">
      {/* Navigation */}
      <nav
        className={cn(
          "fixed top-0 w-full z-50 transition-all duration-300",
          scrollY > 20
            ? "bg-[#FCFBF8]/90 dark:bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-black/10 dark:border-white/10"
            : "bg-transparent"
        )}
      >
        <div className="max-w-[1400px] mx-auto px-8 py-4 flex items-center justify-between">
          <div className="cursor-pointer" onClick={() => window.location.reload()}>
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
            <a href="#features" className="text-sm font-medium text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors">Features</a>
            <a href="#pricing" className="text-sm font-medium text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors">Pricing</a>
            <Button variant="ghost" onClick={() => navigate('/login')} className="text-sm">Sign In</Button>
            <Button onClick={() => navigate('/signup')} className="bg-[#FF4301] hover:bg-[#E63901] text-white text-sm font-semibold">
              Get Started
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>

          <button className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {isMenuOpen && (
          <div className="md:hidden bg-[#FCFBF8] dark:bg-[#0a0a0a] border-b border-black/10 dark:border-white/10">
            <div className="px-8 py-6 flex flex-col gap-4">
              <a href="#features" onClick={() => setIsMenuOpen(false)}>Features</a>
              <a href="#pricing" onClick={() => setIsMenuOpen(false)}>Pricing</a>
              <Button variant="ghost" onClick={() => navigate('/login')}>Sign In</Button>
              <Button className="bg-[#FF4301] hover:bg-[#E63901] text-white" onClick={() => navigate('/signup')}>Get Started</Button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-8">
        <div className="max-w-[1400px] mx-auto">
          <div className="text-center max-w-4xl mx-auto mb-16 animate-on-scroll opacity-0">
            <h1
              className="text-black dark:text-white mb-6"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(48px, 6vw, 86px)',
                lineHeight: '1.05',
                letterSpacing: '-0.02em',
                textTransform: 'uppercase'
              }}
            >
              Professional presentations
              <br />
              in 30 seconds
            </h1>
            <p className="text-xl text-black/60 dark:text-white/60 mb-10 max-w-3xl mx-auto leading-relaxed">
              Stop wasting hours on slides. NextSlide's AI creates professional presentations instantly—complete with design, layout, and visuals. Your team focuses on closing deals, not building decks.
            </p>
            <div className="flex flex-wrap gap-4 justify-center mb-10">
              <Button size="lg" onClick={() => navigate('/signup')} className="bg-[#FF4301] hover:bg-[#E63901] text-white px-10 py-6 text-base font-semibold">
                Create Your First Deck
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button size="lg" variant="outline" className="px-10 py-6 text-base font-semibold border-2">
                <Play className="mr-2 w-5 h-5" />
                Watch Demo
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-black/50 dark:text-white/50">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#FF4301]" />
                <span>Free forever plan</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#FF4301]" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#FF4301]" />
                <span>Export to PowerPoint</span>
              </div>
            </div>
          </div>

          {/* Hero Image */}
          <div className="animate-on-scroll opacity-0 max-w-5xl mx-auto" style={{ transitionDelay: '200ms' }}>
            <div className="relative rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 shadow-2xl">
              <div className="aspect-[16/9] bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-900 dark:to-zinc-800 flex items-center justify-center">
                <div className="text-center p-12">
                  <div className="text-6xl mb-4">🎨</div>
                  <p className="text-sm text-black/40 dark:text-white/40 font-mono">/screenshots/hero-demo.png</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-24 px-8 bg-white dark:bg-black/30">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-16 animate-on-scroll opacity-0">
            <h2
              className="text-black dark:text-white mb-4"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(36px, 5vw, 56px)',
                lineHeight: '1.1',
                letterSpacing: '-0.02em',
                textTransform: 'uppercase'
              }}
            >
              Your presentation workflow is broken
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {problems.map((problem, index) => {
              const Icon = problem.icon;
              return (
                <div key={index} className="animate-on-scroll opacity-0 text-center" style={{ transitionDelay: `${index * 100}ms` }}>
                  <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-6">
                    <Icon className="w-8 h-8 text-red-500" />
                  </div>
                  <h3 className="text-xl font-bold text-black dark:text-white mb-3" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                    {problem.title}
                  </h3>
                  <p className="text-black/60 dark:text-white/60 leading-relaxed">
                    {problem.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features - Three Pillars */}
      <section id="features" className="py-32 px-8">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-20 animate-on-scroll opacity-0">
            <h2
              className="text-black dark:text-white mb-4"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(36px, 5vw, 64px)',
                lineHeight: '1.1',
                letterSpacing: '-0.02em',
                textTransform: 'uppercase'
              }}
            >
              Finally, AI that does something useful
            </h2>
          </div>

          <div className="space-y-32">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              const isEven = index % 2 === 0;
              return (
                <div key={index} className={cn("grid lg:grid-cols-2 gap-16 items-center", !isEven && "lg:grid-flow-dense")}>
                  <div className={cn("animate-on-scroll opacity-0", !isEven && "lg:col-start-2")}>
                    <div className="text-xs font-bold text-[#FF4301] mb-4 tracking-wider" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                      {feature.tag}
                    </div>
                    <h3
                      className="text-black dark:text-white mb-6"
                      style={{
                        fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                        fontWeight: 900,
                        fontSize: 'clamp(28px, 4vw, 42px)',
                        lineHeight: '1.1',
                        letterSpacing: '-0.02em',
                        textTransform: 'uppercase'
                      }}
                    >
                      {feature.title}
                    </h3>
                    <p className="text-lg text-black/70 dark:text-white/70 mb-8 leading-relaxed">
                      {feature.description}
                    </p>
                    <ul className="space-y-3">
                      {feature.bullets.map((bullet, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <Check className="w-5 h-5 text-[#FF4301] flex-shrink-0 mt-0.5" />
                          <span className="text-black/70 dark:text-white/70">{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className={cn("animate-on-scroll opacity-0", !isEven && "lg:col-start-1 lg:row-start-1")} style={{ transitionDelay: '200ms' }}>
                    <div className="aspect-[4/3] bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-900 dark:to-zinc-800 rounded-2xl border border-black/10 dark:border-white/10 flex items-center justify-center">
                      <Icon className="w-24 h-24 text-black/20 dark:text-white/20" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Use Cases - Role Based */}
      <section className="py-32 px-8 bg-white dark:bg-black/30">
        <div className="max-w-[1000px] mx-auto">
          <div className="text-center mb-20 animate-on-scroll opacity-0">
            <h2
              className="text-black dark:text-white mb-4"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(36px, 5vw, 64px)',
                lineHeight: '1.1',
                letterSpacing: '-0.02em',
                textTransform: 'uppercase'
              }}
            >
              Built for your team
            </h2>
          </div>

          <div className="space-y-16">
            {useCases.map((useCase, index) => (
              <div key={index} className="animate-on-scroll opacity-0" style={{ transitionDelay: `${index * 100}ms` }}>
                <div className="bg-[#FCFBF8] dark:bg-[#0a0a0a] rounded-2xl p-10 border border-black/10 dark:border-white/10">
                  <div className="text-sm font-bold text-[#FF4301] mb-4 tracking-wider" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                    {useCase.role}
                  </div>
                  <h3 className="text-2xl font-bold text-black dark:text-white mb-4" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                    {useCase.problem}
                  </h3>
                  <p className="text-lg text-black/70 dark:text-white/70 leading-relaxed">
                    <strong className="text-black dark:text-white">NextSlide fixes this:</strong> {useCase.solution}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-32 px-8">
        <div className="max-w-[1000px] mx-auto">
          <div className="text-center mb-16 animate-on-scroll opacity-0">
            <h2
              className="text-black dark:text-white mb-4"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(36px, 5vw, 56px)',
                lineHeight: '1.1',
                letterSpacing: '-0.02em',
                textTransform: 'uppercase'
              }}
            >
              See how we stack up
            </h2>
            <p className="text-xl text-black/60 dark:text-white/60">
              NextSlide makes old tools obsolete
            </p>
          </div>

          <div className="animate-on-scroll opacity-0 bg-white dark:bg-zinc-900 rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-black/10 dark:border-white/10">
                    <th className="text-left p-6 text-sm font-bold text-black dark:text-white" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                      Feature
                    </th>
                    <th className="p-6 text-center text-sm font-bold text-[#FF4301]" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                      NextSlide
                    </th>
                    <th className="p-6 text-center text-sm font-bold text-black/40 dark:text-white/40" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                      PowerPoint
                    </th>
                    <th className="p-6 text-center text-sm font-bold text-black/40 dark:text-white/40" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                      Canva
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((row, index) => (
                    <tr key={index} className="border-b border-black/5 dark:border-white/5 last:border-0">
                      <td className="p-6 text-black/70 dark:text-white/70">{row.feature}</td>
                      <td className="p-6 text-center">
                        {row.nextslide === true && <Check className="w-6 h-6 text-[#FF4301] mx-auto" />}
                      </td>
                      <td className="p-6 text-center">
                        {row.powerpoint === true && <Check className="w-6 h-6 text-green-500 mx-auto" />}
                        {row.powerpoint === false && <X className="w-6 h-6 text-red-500 mx-auto" />}
                        {typeof row.powerpoint === 'string' && <span className="text-xs text-black/40 dark:text-white/40 uppercase">{row.powerpoint}</span>}
                      </td>
                      <td className="p-6 text-center">
                        {row.canva === true && <Check className="w-6 h-6 text-green-500 mx-auto" />}
                        {row.canva === false && <X className="w-6 h-6 text-red-500 mx-auto" />}
                        {typeof row.canva === 'string' && <span className="text-xs text-black/40 dark:text-white/40 uppercase">{row.canva}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-32 px-8 bg-white dark:bg-black/30">
        <div className="max-w-[900px] mx-auto">
          <div className="text-center mb-16 animate-on-scroll opacity-0">
            <h2
              className="text-black dark:text-white mb-4"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(36px, 5vw, 56px)',
                lineHeight: '1.1',
                letterSpacing: '-0.02em',
                textTransform: 'uppercase'
              }}
            >
              Questions? We've got answers
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="animate-on-scroll opacity-0 bg-[#FCFBF8] dark:bg-[#0a0a0a] rounded-xl border border-black/10 dark:border-white/10 overflow-hidden"
                style={{ transitionDelay: `${index * 50}ms` }}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="w-full p-6 flex items-center justify-between text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <span className="text-lg font-bold text-black dark:text-white pr-8" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                    {faq.question}
                  </span>
                  {openFaq === index ? (
                    <ChevronUp className="w-6 h-6 text-[#FF4301] flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-6 h-6 text-black/40 dark:text-white/40 flex-shrink-0" />
                  )}
                </button>
                {openFaq === index && (
                  <div className="px-6 pb-6">
                    <p className="text-black/70 dark:text-white/70 leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-32 px-8">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-16 animate-on-scroll opacity-0">
            <h2
              className="text-black dark:text-white mb-4"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(36px, 5vw, 64px)',
                lineHeight: '1.1',
                letterSpacing: '-0.02em',
                textTransform: 'uppercase'
              }}
            >
              Simple Pricing
            </h2>
            <p className="text-xl text-black/60 dark:text-white/60">
              Start free. Upgrade when you're ready.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Free */}
            <div className="animate-on-scroll opacity-0 p-8 rounded-2xl border-2 border-black/10 dark:border-white/10 bg-[#FCFBF8] dark:bg-[#0a0a0a]">
              <div className="mb-8">
                <h3 className="text-xl font-bold mb-2 text-black dark:text-white" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Free</h3>
                <div className="text-5xl font-bold text-black dark:text-white mb-1" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                  $0
                </div>
                <div className="text-sm text-black/50 dark:text-white/50">Forever</div>
              </div>
              <ul className="space-y-3 mb-8 text-sm">
                {['5 presentations/month', 'All AI features', 'Export to PDF', 'Basic templates'].map((feature, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#FF4301] flex-shrink-0 mt-0.5" />
                    <span className="text-black/70 dark:text-white/70">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full" onClick={() => navigate('/signup')}>
                Get Started
              </Button>
            </div>

            {/* Pro */}
            <div className="animate-on-scroll opacity-0 p-8 rounded-2xl bg-[#FF4301] text-white transform md:scale-105 shadow-xl" style={{ transitionDelay: '100ms' }}>
              <div className="bg-white/20 text-xs font-bold px-3 py-1 rounded-full inline-block mb-6">
                MOST POPULAR
              </div>
              <div className="mb-8">
                <h3 className="text-xl font-bold mb-2" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Pro</h3>
                <div className="text-5xl font-bold mb-1" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                  $19
                </div>
                <div className="text-sm opacity-90">per month</div>
              </div>
              <ul className="space-y-3 mb-8 text-sm">
                {['Unlimited presentations', 'Priority AI', 'Export to PowerPoint', 'Premium templates', 'Real-time collaboration', 'Custom branding'].map((feature, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button className="w-full bg-white text-[#FF4301] hover:bg-zinc-100 font-semibold" onClick={() => navigate('/signup')}>
                Start Pro Trial
              </Button>
            </div>

            {/* Team */}
            <div className="animate-on-scroll opacity-0 p-8 rounded-2xl border-2 border-black/10 dark:border-white/10 bg-[#FCFBF8] dark:bg-[#0a0a0a]" style={{ transitionDelay: '200ms' }}>
              <div className="mb-8">
                <h3 className="text-xl font-bold mb-2 text-black dark:text-white" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Team</h3>
                <div className="text-5xl font-bold text-black dark:text-white mb-1" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
                  $49
                </div>
                <div className="text-sm text-black/50 dark:text-white/50">per user/month</div>
              </div>
              <ul className="space-y-3 mb-8 text-sm">
                {['Everything in Pro', 'Team workspaces', 'Advanced permissions', 'SSO & SAML', 'Custom integrations', 'Dedicated support'].map((feature, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#FF4301] flex-shrink-0 mt-0.5" />
                    <span className="text-black/70 dark:text-white/70">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full" onClick={() => navigate('/signup')}>
                Contact Sales
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 px-8 bg-[#FF4301] text-white">
        <div className="max-w-[1200px] mx-auto text-center animate-on-scroll opacity-0">
          <h2
            className="mb-6"
            style={{
              fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
              fontWeight: 900,
              fontSize: 'clamp(40px, 6vw, 72px)',
              lineHeight: '1',
              letterSpacing: '-0.02em',
              textTransform: 'uppercase'
            }}
          >
            Try NextSlide free for 30 days
          </h2>
          <p className="text-xl opacity-90 mb-10 max-w-2xl mx-auto">
            No commitments. No credit card. Start creating professional presentations in 30 seconds.
          </p>
          <Button
            size="lg"
            className="bg-white text-[#FF4301] hover:bg-zinc-100 px-12 py-7 text-lg font-bold shadow-xl"
            onClick={() => navigate('/signup')}
          >
            Start Creating for Free
            <ArrowRight className="ml-3 w-6 h-6" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black text-white/60 py-16 px-8">
        <div className="max-w-[1400px] mx-auto">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div>
              <BrandWordmark tag="h3" sizePx={18} textColor="#ffffff" />
              <p className="text-sm mt-4">Professional presentations, built by AI.</p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4 text-sm" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4 text-sm" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Company</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4 text-sm" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 pt-8 text-center text-sm">
            <p>&copy; 2025 NextSlide</p>
          </div>
        </div>
      </footer>

      {/* Animations */}
      <style>{`
        html, body {
          overflow-x: hidden;
        }

        html {
          scroll-behavior: smooth;
        }

        .animate-on-scroll {
          transition: opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1),
                      transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
          transform: translateY(30px);
        }

        .animate-on-scroll.in-view {
          opacity: 1 !important;
          transform: translateY(0);
        }
      `}</style>
    </div>
  );
};

export default Landing;
