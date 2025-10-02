import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import BrandWordmark from '@/components/common/BrandWordmark';
import { cn } from '@/lib/utils';
import { ArrowRight, Sparkles, Zap, Users, BarChart3, Clock, Check, Menu, X } from 'lucide-react';
import { useTheme } from 'next-themes';

const Landing: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [scrollY, setScrollY] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  // Refs for scroll animations
  const heroRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const [activeFeature, setActiveFeature] = useState(0);
  
  // Subtle noise texture for glass header background
  const NAV_NOISE_BG = "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")";

  // Handle scroll events for parallax and animations
  useEffect(() => {
    // Enable scrolling on this page
    document.documentElement.style.position = '';
    document.documentElement.style.overflow = '';
    document.body.style.position = '';
    document.body.style.overflow = '';
    
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      // Reset to fixed positioning when leaving the page (for editor)
      document.documentElement.style.position = 'fixed';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.overflow = 'hidden';
    };
  }, []);

  // Intersection observer for fade-in animations
  useEffect(() => {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');
        }
      });
    }, observerOptions);

    document.querySelectorAll('.fade-in-section').forEach(el => {
      observer.observe(el);
    });

    // Observe feature sections for parallax and scale effects
    const featureObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const target = entry.target as HTMLElement;
        const scrolled = entry.intersectionRatio;
        
        // Apply parallax to feature images
        const image = target.querySelector('.feature-image');
        if (image) {
          (image as HTMLElement).style.transform = `translateY(${(1 - scrolled) * 50}px) scale(${0.9 + scrolled * 0.1})`;
        }
        
        // Apply opacity to feature content
        const content = target.querySelector('.feature-content');
        if (content) {
          (content as HTMLElement).style.opacity = `${scrolled}`;
          (content as HTMLElement).style.transform = `translateY(${(1 - scrolled) * 30}px)`;
        }
      });
    }, { threshold: Array.from({ length: 101 }, (_, i) => i / 100) });

    document.querySelectorAll('.feature-section').forEach(el => {
      featureObserver.observe(el);
    });

    // How It Works Section Animations
    const howItWorksObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const header = document.querySelector('.how-it-works-header');
          if (header && !header.classList.contains('animated')) {
            header.classList.add('animated');
            // Animate header
            const h2 = header.querySelector('h2');
            const p = header.querySelector('p');
            const progressLine = document.querySelector('.progress-line') as HTMLElement;
            
            setTimeout(() => {
              if (h2) {
                h2.classList.remove('opacity-0');
                (h2 as HTMLElement).style.transition = 'all 0.8s ease-out';
                (h2 as HTMLElement).style.opacity = '1';
                (h2 as HTMLElement).style.transform = 'translateY(0)';
              }
            }, 100);
            
            setTimeout(() => {
              if (p) {
                p.classList.remove('opacity-0');
                (p as HTMLElement).style.transition = 'all 0.8s ease-out';
                (p as HTMLElement).style.opacity = '1';
                (p as HTMLElement).style.transform = 'translateY(0)';
              }
            }, 300);
            
            setTimeout(() => {
              if (progressLine) {
                progressLine.style.height = '200px';
                progressLine.style.transition = 'height 1s ease-out';
              }
            }, 500);
          }
        }
      });
    }, { threshold: 0.2 });

    const howItWorksHeader = document.querySelector('.how-it-works-header');
    if (howItWorksHeader) {
      howItWorksObserver.observe(howItWorksHeader);
    }

    // Observe each step
    const stepObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !entry.target.classList.contains('animated')) {
          entry.target.classList.add('animated');
          const step = entry.target as HTMLElement;
          const stepNumber = step.dataset.step;
          
          // Animate step number
          const numberEl = step.querySelector('.step-number') as HTMLElement;
          if (numberEl) {
            setTimeout(() => {
              numberEl.classList.remove('scale-0');
              numberEl.style.transition = 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
              numberEl.style.opacity = '1';
              numberEl.style.transform = 'scale(1)';
            }, 100);
          }
          
          // Animate content
          const content = step.querySelector('.step-content') as HTMLElement;
          if (content) {
            setTimeout(() => {
              content.classList.remove('opacity-0');
              content.style.transition = 'all 0.8s ease-out';
              content.style.opacity = '1';
              content.style.transform = 'translateX(0)';
            }, 300);
          }
          
          // Animate image
          const image = step.querySelector('.step-image') as HTMLElement;
          if (image) {
            setTimeout(() => {
              image.classList.remove('opacity-0');
              image.style.transition = 'all 0.8s ease-out';
              image.style.opacity = '1';
              image.style.transform = 'translateX(0)';
            }, 500);
          }
          
          // Step-specific animations
          if (stepNumber === '1') {
            // Typing animation
            const typingText = step.querySelector('.typing-text') as HTMLElement;
            const typingCursor = step.querySelector('.typing-cursor') as HTMLElement;
            
            if (typingText && typingCursor) {
              const text = typingText.textContent?.trim() || typingText.getAttribute('data-text') || '';
              typingText.textContent = '';
              typingText.style.opacity = '1';
              
              setTimeout(() => {
                // Show cursor with blinking animation
                typingCursor.style.transition = 'opacity 0.3s ease-out';
                typingCursor.style.opacity = '1';
                
                // Type out the text character by character
                let charIndex = 0;
                const typeInterval = setInterval(() => {
                  if (charIndex < text.length) {
                    typingText.textContent += text[charIndex];
                    charIndex++;
                  } else {
                    clearInterval(typeInterval);
                  }
                }, 50); // 50ms per character
              }, 800);
            }
            
            // Pills animation
            const pills = step.querySelectorAll('.pill');
            pills.forEach((pill, index) => {
              setTimeout(() => {
                const pillEl = pill as HTMLElement;
                pillEl.classList.remove('opacity-0');
                pillEl.style.transition = 'all 0.6s ease-out';
                pillEl.style.opacity = '1';
                pillEl.style.transform = 'translateY(0)';
              }, 1000 + index * 100);
            });
          }
          
          if (stepNumber === '2') {
            // Stats count up
            const countUps = step.querySelectorAll('.count-up');
            countUps.forEach((el) => {
              const target = parseInt(el.getAttribute('data-target') || '0');
              const duration = 2000;
              const increment = target / (duration / 16);
              let current = 0;
              
              setTimeout(() => {
                const timer = setInterval(() => {
                  current += increment;
                  if (current >= target) {
                    current = target;
                    clearInterval(timer);
                  }
                  el.textContent = Math.floor(current).toString();
                }, 16);
              }, 800);
            });
            
            // Stats items animation
            const statItems = step.querySelectorAll('.stat-item');
            statItems.forEach((item, index) => {
              setTimeout(() => {
                const statEl = item as HTMLElement;
                statEl.classList.remove('opacity-0');
                statEl.style.transition = 'all 0.6s ease-out';
                statEl.style.opacity = '1';
                statEl.style.transform = 'translateY(0)';
              }, 800 + index * 100);
            });
            
            // Progress bar animation
            const progressBar = step.querySelector('.progress-bar') as HTMLElement;
            if (progressBar) {
              setTimeout(() => {
                progressBar.style.transition = 'width 3s ease-out';
                progressBar.style.width = '100%';
              }, 1000);
            }
          }
          
          if (stepNumber === '3') {
            // Interactive icons animation
            const iconItems = step.querySelectorAll('.icon-item');
            const arrowIcon = step.querySelector('.arrow-icon') as HTMLElement;
            
            iconItems.forEach((icon, index) => {
              setTimeout(() => {
                const iconEl = icon as HTMLElement;
                iconEl.classList.remove('opacity-0', 'scale-0');
                iconEl.style.transition = 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
                iconEl.style.opacity = '1';
                iconEl.style.transform = 'scale(1)';
              }, 800 + index * 200);
            });
            
            if (arrowIcon) {
              setTimeout(() => {
                arrowIcon.classList.remove('opacity-0');
                arrowIcon.style.transition = 'opacity 0.6s ease-out';
                arrowIcon.style.opacity = '1';
              }, 1200);
            }
            
            // Export options animation
            const exportOptions = step.querySelectorAll('.export-option');
            exportOptions.forEach((option, index) => {
              setTimeout(() => {
                const optionEl = option as HTMLElement;
                optionEl.classList.remove('opacity-0');
                optionEl.style.transition = 'all 0.6s ease-out';
                optionEl.style.opacity = '1';
                optionEl.style.transform = 'translateY(0)';
              }, 1000 + index * 100);
            });
          }
        }
      });
    }, { threshold: 0.3 });

    document.querySelectorAll('.how-it-works-step').forEach(el => {
      stepObserver.observe(el);
    });

    return () => {
      observer.disconnect();
      featureObserver.disconnect();
      howItWorksObserver.disconnect();
      stepObserver.disconnect();
    };
  }, []);

  const features = [
    {
      icon: Sparkles,
      title: "AI-Powered Creation",
      description: "Transform your ideas into stunning presentations with advanced AI that understands context and design.",
      color: "text-orange-500"
    },
    {
      icon: Zap,
      title: "Lightning Fast",
      description: "Generate complete presentations in seconds, not hours. Focus on your message while AI handles the design.",
      color: "text-blue-500"
    },
    {
      icon: Users,
      title: "Real-time Collaboration",
      description: "Work together seamlessly with your team. See changes instantly and iterate faster than ever.",
      color: "text-green-500"
    },
    {
      icon: BarChart3,
      title: "Data Visualization",
      description: "Turn complex data into compelling visual stories with intelligent chart and graph generation.",
      color: "text-purple-500"
    }
  ];

  const useCases = [
    { 
      title: "Sales Teams", 
      description: "Close more deals with presentations that adapt to your prospect's needs in real-time.",
      gradient: "from-blue-500 to-purple-500"
    },
    { 
      title: "Marketing Professionals", 
      description: "Create brand-consistent decks that tell your story with impact and style.",
      gradient: "from-orange-500 to-pink-500"
    },
    { 
      title: "Educators", 
      description: "Engage students with interactive, visually rich presentations that enhance learning.",
      gradient: "from-green-500 to-teal-500"
    }
  ];

  return (
    <div className="min-h-screen bg-[#F5F5DC] dark:bg-zinc-900">
      {/* Noise overlay */}
      <div className="noise-overlay pointer-events-none"></div>

      {/* Navigation */}
      <nav
        className={cn(
          "fixed top-0 w-full z-50 transition-all duration-300",
          scrollY > 4
            ? "supports-[backdrop-filter]:backdrop-blur-sm backdrop-saturate-150 bg-white/6 dark:bg-zinc-900/8 border-b border-zinc-300/40 dark:border-zinc-600/30 shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
            : "bg-transparent dark:bg-transparent"
        )}
      >
        {scrollY > 4 && (
          <>
            <div
              className="absolute inset-0 pointer-events-none opacity-[0.01]"
              style={{ backgroundImage: NAV_NOISE_BG }}
            />
            <div className="absolute top-0 left-0 right-0 h-px bg-white/40 dark:bg-white/5 pointer-events-none" />
          </>
        )}
        <div className="relative z-10 max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div
            className="text-[#383636] dark:text-gray-300 cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              window.location.reload();
            }}
            style={{
              fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
              fontWeight: 900,
              lineHeight: '100%',
              letterSpacing: '0%',
              textTransform: 'uppercase',
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale'
            }}
          >
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

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Features</a>
            <a href="#how-it-works" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">How it Works</a>
            <a href="#pricing" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Pricing</a>
            <Button 
              variant="ghost" 
              className="text-zinc-600 dark:text-zinc-400"
              onClick={() => navigate('/login')}
            >
              Sign In
            </Button>
            <Button 
              className="bg-[#FF4301] hover:bg-[#E63901] text-white"
              onClick={() => navigate('/signup')}
            >
              Get Started Free
            </Button>
          </div>

          {/* Mobile menu button */}
          <button 
            className="md:hidden"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-[#F5F5DC] dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex flex-col p-6 gap-4">
              <a href="#features" className="text-zinc-600 dark:text-zinc-400">Features</a>
              <a href="#how-it-works" className="text-zinc-600 dark:text-zinc-400">How it Works</a>
              <a href="#pricing" className="text-zinc-600 dark:text-zinc-400">Pricing</a>
              <Button variant="ghost" onClick={() => navigate('/login')}>Sign In</Button>
              <Button className="bg-[#FF4301] hover:bg-[#E63901] text-white" onClick={() => navigate('/signup')}>
                Get Started Free
              </Button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section 
        ref={heroRef}
        className="relative min-h-screen flex items-center justify-center px-6 pt-20"
        style={{
          transform: `translateY(${scrollY * 0.5}px)`
        }}
      >
        <div className="max-w-5xl mx-auto text-center">
          <div className="mb-6 inline-flex items-center gap-2 px-4 py-2 bg-orange-100 dark:bg-orange-900/20 rounded-full">
            <Sparkles className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-medium text-orange-600 dark:text-orange-400">
              AI-Powered Presentation Magic
            </span>
          </div>
          
          <h1 
            className="text-[#383636] dark:text-gray-100 mb-6"
            style={{
              fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
              fontWeight: 900,
              fontSize: 'clamp(48px, 8vw, 96px)',
              lineHeight: '90%',
              letterSpacing: '-2%',
              textTransform: 'uppercase'
            }}
          >
            Create Stunning
            <br />
            <span className="text-[#FF4301]">Presentations</span>
            <br />
            In Seconds
          </h1>

          <p className="text-xl md:text-2xl text-zinc-600 dark:text-zinc-400 mb-8 max-w-3xl mx-auto leading-relaxed">
            Transform your ideas into professional presentations with AI that understands design, 
            narrative flow, and your unique style. No more starting from scratch.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button 
              size="lg"
              className="bg-[#FF4301] hover:bg-[#E63901] text-white px-8 py-6 text-lg"
              onClick={() => navigate('/signup')}
            >
              Start Creating Free
              <ArrowRight className="ml-2" />
            </Button>
            <Button 
              size="lg"
              variant="outline"
              className="px-8 py-6 text-lg border-zinc-300 dark:border-zinc-700"
              onClick={() => document.getElementById('demo-video')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Watch Demo
            </Button>
          </div>

          <div className="flex items-center justify-center gap-8 text-sm text-zinc-500 dark:text-zinc-400">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-500" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-500" />
              <span>5 free presentations</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-500" />
              <span>Export to PowerPoint</span>
            </div>
          </div>
        </div>

        {/* Animated background elements */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div 
            className="absolute top-20 left-10 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl"
            style={{ transform: `translateY(${scrollY * 0.2}px)` }}
          />
          <div 
            className="absolute bottom-20 right-10 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"
            style={{ transform: `translateY(${scrollY * -0.2}px)` }}
          />
        </div>
      </section>

      {/* Demo Video Placeholder */}
      <section id="demo-video" className="py-20 px-6 fade-in-section opacity-0">
        <div className="max-w-6xl mx-auto">
          <div className="bg-zinc-200 dark:bg-zinc-800 rounded-2xl aspect-video flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 bg-zinc-300 dark:bg-zinc-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <div className="w-0 h-0 border-l-[20px] border-l-zinc-500 border-y-[12px] border-y-transparent ml-2" />
              </div>
              <p className="text-zinc-500 dark:text-zinc-400 text-xl">Product Demo Video</p>
              <p className="text-zinc-400 dark:text-zinc-500 text-sm mt-2">2:30 minute overview</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section - Full Screen Interactive */}
      <section id="features" ref={featuresRef} className="relative">
        {/* Title Section */}
        <div className="min-h-screen flex items-center justify-center px-6 fade-in-section opacity-0">
          <div className="text-center">
            <h2 
              className="text-[#383636] dark:text-gray-100 mb-6"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(48px, 10vw, 120px)',
                lineHeight: '90%',
                letterSpacing: '-2%',
                textTransform: 'uppercase'
              }}
            >
              Features That
              <br />
              <span className="text-[#FF4301]">Matter</span>
            </h2>
            <p className="text-2xl md:text-3xl text-zinc-600 dark:text-zinc-400 max-w-4xl mx-auto">
              Powerful tools designed to help you create better presentations, faster.
            </p>
          </div>
        </div>

        {/* Feature 1: AI-Powered Creation */}
        <div className="min-h-screen flex items-center relative overflow-hidden feature-section">
          <div className="w-full max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1 feature-image transition-transform duration-300 ease-out">
              <div className="bg-gradient-to-br from-orange-100 to-orange-50 dark:from-zinc-800 dark:to-zinc-900 rounded-3xl aspect-[4/3] flex items-center justify-center shadow-2xl">
                <div className="text-center p-12">
                  <Sparkles className="w-24 h-24 text-orange-500 mx-auto mb-6" />
                  <p className="text-2xl text-zinc-600 dark:text-zinc-400 font-medium">AI Creation Demo</p>
                  <p className="text-lg text-zinc-500 dark:text-zinc-500 mt-2">Watch AI build your presentation</p>
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2 feature-content transition-all duration-300 ease-out">
              <div className="mb-6">
                <span className="text-orange-500 font-bold text-xl">01</span>
              </div>
              <h3 
                className="text-[#383636] dark:text-gray-100 mb-6"
                style={{
                  fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                  fontWeight: 900,
                  fontSize: 'clamp(36px, 6vw, 72px)',
                  lineHeight: '90%',
                  textTransform: 'uppercase'
                }}
              >
                AI That
                <br />
                <span className="text-[#FF4301]">Gets You</span>
              </h3>
              <p className="text-xl md:text-2xl text-zinc-600 dark:text-zinc-400 mb-8 leading-relaxed">
                Our AI doesn't just generate slides. It understands your message, 
                your audience, and your goals to create presentations that resonate.
              </p>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                  <Check className="w-5 h-5 text-green-500" />
                  <span>Context-aware content</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                  <Check className="w-5 h-5 text-green-500" />
                  <span>Perfect narratives</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                  <Check className="w-5 h-5 text-green-500" />
                  <span>Brand consistency</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Feature 2: Lightning Fast */}
        <div className="min-h-screen flex items-center relative overflow-hidden bg-zinc-50 dark:bg-zinc-900/50 feature-section">
          <div className="w-full max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
            <div className="feature-content transition-all duration-300 ease-out">
              <div className="mb-6">
                <span className="text-blue-500 font-bold text-xl">02</span>
              </div>
              <h3 
                className="text-[#383636] dark:text-gray-100 mb-6"
                style={{
                  fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                  fontWeight: 900,
                  fontSize: 'clamp(36px, 6vw, 72px)',
                  lineHeight: '90%',
                  textTransform: 'uppercase'
                }}
              >
                Speed That
                <br />
                <span className="text-blue-500">Shocks</span>
              </h3>
              <p className="text-xl md:text-2xl text-zinc-600 dark:text-zinc-400 mb-8 leading-relaxed">
                Generate complete presentations in under 30 seconds. 
                No more spending hours on design and formatting.
              </p>
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
                    <Clock className="w-8 h-8 text-blue-500" />
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">30 seconds</div>
                    <div className="text-zinc-600 dark:text-zinc-400">Average generation time</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
                    <Zap className="w-8 h-8 text-green-500" />
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">10x faster</div>
                    <div className="text-zinc-600 dark:text-zinc-400">Than traditional methods</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="feature-image transition-transform duration-300 ease-out">
              <div className="bg-gradient-to-br from-blue-100 to-blue-50 dark:from-zinc-800 dark:to-zinc-900 rounded-3xl aspect-[4/3] flex items-center justify-center shadow-2xl">
                <div className="text-center p-12">
                  <div className="relative">
                    <div className="w-32 h-32 border-8 border-blue-200 dark:border-blue-800 rounded-full mx-auto animate-spin"></div>
                    <Zap className="w-16 h-16 text-blue-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <p className="text-2xl text-zinc-600 dark:text-zinc-400 font-medium mt-8">Speed Demo</p>
                  <p className="text-lg text-zinc-500 dark:text-zinc-500 mt-2">Real-time generation</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Feature 3: Collaboration */}
        <div className="min-h-screen flex items-center relative overflow-hidden feature-section">
          <div className="w-full max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1 feature-image transition-transform duration-300 ease-out">
              <div className="bg-gradient-to-br from-green-100 to-green-50 dark:from-zinc-800 dark:to-zinc-900 rounded-3xl aspect-[4/3] flex items-center justify-center shadow-2xl">
                <div className="text-center p-12">
                  <div className="flex justify-center -space-x-4 mb-6">
                    <div className="w-16 h-16 bg-green-300 rounded-full border-4 border-white dark:border-zinc-800"></div>
                    <div className="w-16 h-16 bg-green-400 rounded-full border-4 border-white dark:border-zinc-800"></div>
                    <div className="w-16 h-16 bg-green-500 rounded-full border-4 border-white dark:border-zinc-800"></div>
                  </div>
                  <Users className="w-24 h-24 text-green-500 mx-auto mb-6" />
                  <p className="text-2xl text-zinc-600 dark:text-zinc-400 font-medium">Collaboration Demo</p>
                  <p className="text-lg text-zinc-500 dark:text-zinc-500 mt-2">Work together seamlessly</p>
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2 feature-content transition-all duration-300 ease-out">
              <div className="mb-6">
                <span className="text-green-500 font-bold text-xl">03</span>
              </div>
              <h3 
                className="text-[#383636] dark:text-gray-100 mb-6"
                style={{
                  fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                  fontWeight: 900,
                  fontSize: 'clamp(36px, 6vw, 72px)',
                  lineHeight: '90%',
                  textTransform: 'uppercase'
                }}
              >
                Teams That
                <br />
                <span className="text-green-500">Thrive</span>
              </h3>
              <p className="text-xl md:text-2xl text-zinc-600 dark:text-zinc-400 mb-8 leading-relaxed">
                Real-time collaboration that feels magical. See changes instantly, 
                leave comments, and work together from anywhere.
              </p>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Live edits</div>
                  <p className="text-zinc-600 dark:text-zinc-400">See changes as they happen</p>
                </div>
                <div>
                  <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Comments</div>
                  <p className="text-zinc-600 dark:text-zinc-400">Contextual feedback</p>
                </div>
                <div>
                  <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Version control</div>
                  <p className="text-zinc-600 dark:text-zinc-400">Never lose work</p>
                </div>
                <div>
                  <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Permissions</div>
                  <p className="text-zinc-600 dark:text-zinc-400">Control who sees what</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Feature 4: Data Visualization */}
        <div className="min-h-screen flex items-center relative overflow-hidden bg-zinc-50 dark:bg-zinc-900/50 feature-section">
          <div className="w-full max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
            <div className="feature-content transition-all duration-300 ease-out">
              <div className="mb-6">
                <span className="text-purple-500 font-bold text-xl">04</span>
              </div>
              <h3 
                className="text-[#383636] dark:text-gray-100 mb-6"
                style={{
                  fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                  fontWeight: 900,
                  fontSize: 'clamp(36px, 6vw, 72px)',
                  lineHeight: '90%',
                  textTransform: 'uppercase'
                }}
              >
                Data That
                <br />
                <span className="text-purple-500">Dazzles</span>
              </h3>
              <p className="text-xl md:text-2xl text-zinc-600 dark:text-zinc-400 mb-8 leading-relaxed">
                Transform boring numbers into compelling visual stories. 
                Our AI automatically creates the perfect chart for your data.
              </p>
              <div className="flex flex-wrap gap-6">
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-8 h-8 text-purple-500" />
                  <span className="text-lg text-zinc-700 dark:text-zinc-300">Smart charts</span>
                </div>
                <div className="flex items-center gap-3">
                  <Sparkles className="w-8 h-8 text-purple-500" />
                  <span className="text-lg text-zinc-700 dark:text-zinc-300">Auto-design</span>
                </div>
                <div className="flex items-center gap-3">
                  <Zap className="w-8 h-8 text-purple-500" />
                  <span className="text-lg text-zinc-700 dark:text-zinc-300">Live data</span>
                </div>
              </div>
            </div>
            <div className="feature-image transition-transform duration-300 ease-out">
              <div className="bg-gradient-to-br from-purple-100 to-purple-50 dark:from-zinc-800 dark:to-zinc-900 rounded-3xl aspect-[4/3] flex items-center justify-center shadow-2xl">
                <div className="p-12 w-full h-full flex flex-col justify-center">
                  <div className="space-y-4">
                    <div className="flex items-end gap-2 h-32">
                      <div className="flex-1 bg-purple-500 rounded-t-lg" style={{ height: '40%' }}></div>
                      <div className="flex-1 bg-purple-400 rounded-t-lg" style={{ height: '70%' }}></div>
                      <div className="flex-1 bg-purple-500 rounded-t-lg" style={{ height: '100%' }}></div>
                      <div className="flex-1 bg-purple-400 rounded-t-lg" style={{ height: '60%' }}></div>
                      <div className="flex-1 bg-purple-500 rounded-t-lg" style={{ height: '85%' }}></div>
                    </div>
                  </div>
                  <p className="text-2xl text-zinc-600 dark:text-zinc-400 font-medium mt-8 text-center">Data Viz Demo</p>
                  <p className="text-lg text-zinc-500 dark:text-zinc-500 mt-2 text-center">Beautiful charts instantly</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Big Statement */}
        <div className="min-h-screen flex items-center justify-center px-6 bg-[#FF4301] text-white">
          <div className="text-center">
            <h2 
              className="mb-8"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(48px, 12vw, 160px)',
                lineHeight: '80%',
                letterSpacing: '-3%',
                textTransform: 'uppercase'
              }}
            >
              Start
              <br />
              Creating
              <br />
              Today
            </h2>
            <p className="text-2xl md:text-3xl opacity-90 max-w-3xl mx-auto">
              Join thousands already building better presentations.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works Section - Interactive */}
      <section id="how-it-works" className="py-32 px-6 bg-zinc-50 dark:bg-zinc-900/50 relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-32 how-it-works-header">
            <h2 
              className="text-[#383636] dark:text-gray-100 mb-6 opacity-0"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(36px, 5vw, 72px)',
                lineHeight: '100%',
                letterSpacing: '-1%',
                textTransform: 'uppercase'
              }}
            >
              How It Works
            </h2>
            <p className="text-xl md:text-2xl text-zinc-600 dark:text-zinc-400 max-w-3xl mx-auto opacity-0">
              Three simple steps to amazing presentations
            </p>
            
            {/* Progress line */}
            <div className="mt-16 relative">
              <div className="absolute left-1/2 transform -translate-x-1/2 w-1 h-0 bg-gradient-to-b from-[#FF4301] to-transparent progress-line"></div>
            </div>
          </div>

          {/* Steps Container */}
          <div className="space-y-40 relative">
            {/* Connection line */}
            <div className="absolute left-1/2 transform -translate-x-1/2 w-1 h-full bg-gradient-to-b from-zinc-300 via-zinc-300 to-transparent dark:from-zinc-700 dark:via-zinc-700 -z-10"></div>
            
            {/* Step 1 */}
            <div className="relative how-it-works-step" data-step="1">
              <div className="grid lg:grid-cols-2 gap-16 items-center">
                <div className="order-2 lg:order-1 step-image opacity-0">
                  <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8 hover:shadow-3xl transition-all duration-500 hover:scale-[1.02]">
                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-zinc-800 dark:to-zinc-700 rounded-2xl aspect-video flex items-center justify-center relative overflow-hidden group">
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <div className="text-center p-12 relative z-10">
                        <Sparkles className="w-24 h-24 text-orange-500 mx-auto mb-6 step-icon" />
                        <p className="text-2xl text-zinc-600 dark:text-zinc-400 font-medium">Input Interface</p>
                        <p className="text-lg text-zinc-500 dark:text-zinc-500 mt-2">Natural language input</p>
                        
                        {/* Typing animation placeholder */}
                        <div className="mt-6 w-full">
                          <div className="mx-auto" style={{ width: '400px', maxWidth: '90vw' }}>
                            <div className="border border-zinc-300 dark:border-zinc-600 rounded-lg px-6 py-4" style={{ minHeight: '72px' }}>
                              <div className="typing-container flex items-start font-mono text-sm">
                                <span className="text-zinc-500 dark:text-zinc-500 mr-2 flex-shrink-0">&gt;</span>
                                <div className="flex-1">
                                  <span className="typing-text text-zinc-600 dark:text-zinc-400" style={{ opacity: 0 }} data-text="Create a sales presentation for our new product launch...">
                                    Create a sales presentation for our new product launch...
                                  </span>
                                  <span className="typing-cursor text-[#FF4301] font-bold" style={{ opacity: 0 }}>|</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="order-1 lg:order-2 step-content opacity-0">
                  <div className="mb-8 relative">
                    <div className="step-number w-24 h-24 bg-[#FF4301] rounded-full flex items-center justify-center mb-8 scale-0">
                      <span className="text-white text-4xl font-bold">1</span>
                    </div>
                    <h3 
                      className="text-[#383636] dark:text-gray-100 mb-6"
                      style={{
                        fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                        fontWeight: 900,
                        fontSize: 'clamp(36px, 5vw, 56px)',
                        lineHeight: '100%',
                        textTransform: 'uppercase'
                      }}
                    >
                      Describe Your Vision
                    </h3>
                    <p className="text-xl md:text-2xl text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      Simply tell our AI what you want to present. Use natural language to describe your goals, 
                      audience, and key messages. No templates, no restrictions.
                    </p>
                    
                    {/* Feature pills */}
                    <div className="mt-8 flex flex-wrap gap-3">
                      <div className="pill opacity-0 px-4 py-2 bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-full text-sm font-medium">
                        Natural Language
                      </div>
                      <div className="pill opacity-0 px-4 py-2 bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-full text-sm font-medium">
                        No Templates
                      </div>
                      <div className="pill opacity-0 px-4 py-2 bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-full text-sm font-medium">
                        Context Aware
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative how-it-works-step" data-step="2">
              <div className="grid lg:grid-cols-2 gap-16 items-center">
                <div className="step-content opacity-0">
                  <div className="mb-8 relative">
                    <div className="step-number w-24 h-24 bg-[#FF4301] rounded-full flex items-center justify-center mb-8 scale-0">
                      <span className="text-white text-4xl font-bold">2</span>
                    </div>
                    <h3 
                      className="text-[#383636] dark:text-gray-100 mb-6"
                      style={{
                        fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                        fontWeight: 900,
                        fontSize: 'clamp(36px, 5vw, 56px)',
                        lineHeight: '100%',
                        textTransform: 'uppercase'
                      }}
                    >
                      AI Generates & Designs
                    </h3>
                    <p className="text-xl md:text-2xl text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      Watch as our AI creates a complete presentation with stunning visuals, 
                      perfect layouts, and compelling content in seconds.
                    </p>
                    
                    {/* Stats */}
                    <div className="mt-8 grid grid-cols-3 gap-4">
                      <div className="stat-item opacity-0 text-center">
                        <div className="text-3xl font-bold text-[#FF4301] count-up" data-target="30">0</div>
                        <div className="text-sm text-zinc-500">Seconds</div>
                      </div>
                      <div className="stat-item opacity-0 text-center">
                        <div className="text-3xl font-bold text-[#FF4301] count-up" data-target="15">0</div>
                        <div className="text-sm text-zinc-500">Slides</div>
                      </div>
                      <div className="stat-item opacity-0 text-center">
                        <div className="text-3xl font-bold text-[#FF4301] count-up" data-target="100">0</div>
                        <div className="text-sm text-zinc-500">% Quality</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="step-image opacity-0">
                  <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8 hover:shadow-3xl transition-all duration-500 hover:scale-[1.02]">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-zinc-800 dark:to-zinc-700 rounded-2xl aspect-video flex items-center justify-center relative overflow-hidden group">
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <div className="text-center p-12 relative z-10">
                        <div className="relative">
                          <div className="w-32 h-32 border-8 border-blue-200 dark:border-blue-800 rounded-full mx-auto loading-spinner"></div>
                          <Zap className="w-16 h-16 text-blue-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pulse-icon" />
                        </div>
                        <p className="text-2xl text-zinc-600 dark:text-zinc-400 font-medium mt-8">AI Generation</p>
                        <p className="text-lg text-zinc-500 dark:text-zinc-500 mt-2">Real-time processing</p>
                        
                        {/* Progress bar */}
                        <div className="mt-6 w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2 overflow-hidden">
                          <div className="h-full bg-blue-500 progress-bar rounded-full" style={{ width: '0%' }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative how-it-works-step" data-step="3">
              <div className="grid lg:grid-cols-2 gap-16 items-center">
                <div className="order-2 lg:order-1 step-image opacity-0">
                  <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8 hover:shadow-3xl transition-all duration-500 hover:scale-[1.02]">
                    <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-zinc-800 dark:to-zinc-700 rounded-2xl aspect-video flex items-center justify-center relative overflow-hidden group">
                      <div className="absolute inset-0 bg-gradient-to-br from-green-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <div className="text-center p-12 relative z-10">
                        <div className="flex items-center justify-center gap-4 mb-8 interactive-icons">
                          <div className="icon-item w-20 h-20 bg-green-200 dark:bg-green-800 rounded-lg flex items-center justify-center opacity-0 scale-0">
                            <Users className="w-10 h-10 text-green-600 dark:text-green-400" />
                          </div>
                          <ArrowRight className="arrow-icon w-8 h-8 text-green-500 opacity-0" />
                          <div className="icon-item w-20 h-20 bg-green-200 dark:bg-green-800 rounded-lg flex items-center justify-center opacity-0 scale-0">
                            <Check className="w-10 h-10 text-green-600 dark:text-green-400" />
                          </div>
                        </div>
                        <p className="text-2xl text-zinc-600 dark:text-zinc-400 font-medium">Editor & Present</p>
                        <p className="text-lg text-zinc-500 dark:text-zinc-500 mt-2">Polish and deliver</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="order-1 lg:order-2 step-content opacity-0">
                  <div className="mb-8 relative">
                    <div className="step-number w-24 h-24 bg-[#FF4301] rounded-full flex items-center justify-center mb-8 scale-0">
                      <span className="text-white text-4xl font-bold">3</span>
                    </div>
                    <h3 
                      className="text-[#383636] dark:text-gray-100 mb-6"
                      style={{
                        fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                        fontWeight: 900,
                        fontSize: 'clamp(36px, 5vw, 56px)',
                        lineHeight: '100%',
                        textTransform: 'uppercase'
                      }}
                    >
                      Customize & Present
                    </h3>
                    <p className="text-xl md:text-2xl text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      Fine-tune every detail with our intuitive editor. Present directly from the platform 
                      or export to your favorite format.
                    </p>
                    
                    {/* Export options */}
                    <div className="mt-8 grid grid-cols-2 gap-4">
                      <div className="export-option opacity-0 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center hover:scale-105 transition-transform cursor-pointer">
                        <div className="text-2xl mb-2">📊</div>
                        <div className="text-sm font-medium text-green-700 dark:text-green-300">PowerPoint</div>
                      </div>
                      <div className="export-option opacity-0 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center hover:scale-105 transition-transform cursor-pointer">
                        <div className="text-2xl mb-2">📄</div>
                        <div className="text-sm font-medium text-green-700 dark:text-green-300">PDF</div>
                      </div>
                      <div className="export-option opacity-0 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center hover:scale-105 transition-transform cursor-pointer">
                        <div className="text-2xl mb-2">🔗</div>
                        <div className="text-sm font-medium text-green-700 dark:text-green-300">Share Link</div>
                      </div>
                      <div className="export-option opacity-0 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center hover:scale-105 transition-transform cursor-pointer">
                        <div className="text-2xl mb-2">🎥</div>
                        <div className="text-sm font-medium text-green-700 dark:text-green-300">Present Live</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20 fade-in-section opacity-0">
            <h2 
              className="text-[#383636] dark:text-gray-100 mb-6"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(36px, 5vw, 56px)',
                lineHeight: '100%',
                letterSpacing: '-1%',
                textTransform: 'uppercase'
              }}
            >
              Built for
              <br />
              <span className="text-[#FF4301]">Every Team</span>
            </h2>
            <p className="text-xl text-zinc-600 dark:text-zinc-400 max-w-3xl mx-auto">
              From startups to enterprises, nextslide adapts to your unique needs.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {useCases.map((useCase, index) => (
              <div 
                key={index}
                className="fade-in-section opacity-0 group cursor-pointer"
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-800 p-8 h-full transition-transform group-hover:scale-[1.02]">
                  <div className={cn("absolute inset-0 opacity-10 bg-gradient-to-br", useCase.gradient)} />
                  <div className="relative z-10">
                    <h3 className="text-2xl font-bold mb-4 text-zinc-900 dark:text-zinc-100">
                      {useCase.title}
                    </h3>
                    <p className="text-zinc-600 dark:text-zinc-400 mb-6">
                      {useCase.description}
                    </p>
                    <div className="bg-zinc-100 dark:bg-zinc-700 rounded-lg aspect-video flex items-center justify-center">
                      <p className="text-zinc-400 dark:text-zinc-500">Use Case Example</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 px-6 bg-[#FF4301] text-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 text-center">
            <div className="fade-in-section opacity-0">
              <div className="text-5xl font-bold mb-2">500K+</div>
              <div className="text-orange-100">Presentations Created</div>
            </div>
            <div className="fade-in-section opacity-0" style={{ transitionDelay: '100ms' }}>
              <div className="text-5xl font-bold mb-2">50K+</div>
              <div className="text-orange-100">Active Users</div>
            </div>
            <div className="fade-in-section opacity-0" style={{ transitionDelay: '200ms' }}>
              <div className="text-5xl font-bold mb-2">4.9/5</div>
              <div className="text-orange-100">User Rating</div>
            </div>
            <div className="fade-in-section opacity-0" style={{ transitionDelay: '300ms' }}>
              <div className="text-5xl font-bold mb-2">90%</div>
              <div className="text-orange-100">Time Saved</div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20 fade-in-section opacity-0">
            <h2 
              className="text-[#383636] dark:text-gray-100 mb-6"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(36px, 5vw, 56px)',
                lineHeight: '100%',
                letterSpacing: '-1%',
                textTransform: 'uppercase'
              }}
            >
              Loved by
              <br />
              <span className="text-[#FF4301]">Thousands</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[1, 2, 3].map((i) => (
              <div 
                key={i}
                className="fade-in-section opacity-0 bg-white dark:bg-zinc-800 rounded-2xl p-8 shadow-lg"
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div className="flex items-center mb-4">
                  {[...Array(5)].map((_, j) => (
                    <span key={j} className="text-yellow-500">★</span>
                  ))}
                </div>
                <p className="text-zinc-600 dark:text-zinc-400 mb-6 italic">
                  "nextslide has transformed how our team creates presentations. 
                  What used to take hours now takes minutes, and the results are stunning."
                </p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-zinc-200 dark:bg-zinc-700 rounded-full" />
                  <div>
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100">Alex Johnson</div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400">Marketing Director, TechCorp</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-32 px-6 bg-zinc-50 dark:bg-zinc-800/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20 fade-in-section opacity-0">
            <h2 
              className="text-[#383636] dark:text-gray-100 mb-6"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(36px, 5vw, 56px)',
                lineHeight: '100%',
                letterSpacing: '-1%',
                textTransform: 'uppercase'
              }}
            >
              Simple Pricing
              <br />
              <span className="text-[#FF4301]">Big Value</span>
            </h2>
            <p className="text-xl text-zinc-600 dark:text-zinc-400 max-w-3xl mx-auto">
              Start free and scale as you grow. No hidden fees, no surprises.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Free Plan */}
            <div className="fade-in-section opacity-0 bg-white dark:bg-zinc-900 rounded-2xl p-8 border border-zinc-200 dark:border-zinc-700">
              <h3 className="text-2xl font-bold mb-2">Starter</h3>
              <div className="text-4xl font-bold mb-6">
                $0<span className="text-lg font-normal text-zinc-500">/month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-500" />
                  <span>5 presentations/month</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-500" />
                  <span>Basic templates</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-500" />
                  <span>Export to PDF</span>
                </li>
              </ul>
              <Button className="w-full" variant="outline">Get Started</Button>
            </div>

            {/* Pro Plan */}
            <div className="fade-in-section opacity-0 bg-[#FF4301] text-white rounded-2xl p-8 transform scale-105 shadow-xl" style={{ transitionDelay: '100ms' }}>
              <div className="bg-white/20 text-sm font-semibold px-3 py-1 rounded-full inline-block mb-4">
                MOST POPULAR
              </div>
              <h3 className="text-2xl font-bold mb-2">Professional</h3>
              <div className="text-4xl font-bold mb-6">
                $29<span className="text-lg font-normal opacity-80">/month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5" />
                  <span>Unlimited presentations</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5" />
                  <span>Premium templates</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5" />
                  <span>Real-time collaboration</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5" />
                  <span>Export to PowerPoint</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5" />
                  <span>Priority support</span>
                </li>
              </ul>
              <Button className="w-full bg-white text-[#FF4301] hover:bg-zinc-100">Get Started</Button>
            </div>

            {/* Enterprise Plan */}
            <div className="fade-in-section opacity-0 bg-white dark:bg-zinc-900 rounded-2xl p-8 border border-zinc-200 dark:border-zinc-700" style={{ transitionDelay: '200ms' }}>
              <h3 className="text-2xl font-bold mb-2">Enterprise</h3>
              <div className="text-4xl font-bold mb-6">
                Custom
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-500" />
                  <span>Everything in Pro</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-500" />
                  <span>Custom branding</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-500" />
                  <span>SSO & advanced security</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-500" />
                  <span>Dedicated account manager</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-500" />
                  <span>Custom integrations</span>
                </li>
              </ul>
              <Button className="w-full" variant="outline">Contact Sales</Button>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 px-6">
        <div className="max-w-4xl mx-auto text-center fade-in-section opacity-0">
          <h2 
            className="text-[#383636] dark:text-gray-100 mb-6"
            style={{
              fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
              fontWeight: 900,
              fontSize: 'clamp(36px, 5vw, 72px)',
              lineHeight: '100%',
              letterSpacing: '-1%',
              textTransform: 'uppercase'
            }}
          >
            Ready to
            <br />
            <span className="text-[#FF4301]">Transform</span>
            <br />
            Your Presentations?
          </h2>
          <p className="text-xl text-zinc-600 dark:text-zinc-400 mb-8 max-w-2xl mx-auto">
            Join thousands of professionals who are already creating better presentations in less time.
          </p>
          <Button 
            size="lg"
            className="bg-[#FF4301] hover:bg-[#E63901] text-white px-12 py-6 text-lg"
            onClick={() => navigate('/signup')}
          >
            Start Your Free Trial
            <ArrowRight className="ml-2" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-zinc-900 text-zinc-400 py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="text-white mb-4" style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif' }}>
                <BrandWordmark tag="h3" sizePx={18} textColor="#ffffff" />
              </div>
              <p className="text-sm">
                AI-powered presentations that make an impact.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Templates</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Integrations</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-zinc-800 pt-8 text-center text-sm">
            <p>&copy; 2025 NextSlide. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* CSS for animations */}
      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes slide-in-left {
          from {
            opacity: 0;
            transform: translateX(-50px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes slide-in-right {
          from {
            opacity: 0;
            transform: translateX(50px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes typing {
          from {
            opacity: 0;
            width: 0;
          }
          to {
            opacity: 1;
            width: 100%;
          }
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.8;
            transform: scale(1.1);
          }
        }

        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }

        .animate-spin {
          animation: spin 3s linear infinite;
        }



        .loading-spinner {
          animation: spin 2s linear infinite;
        }

        .pulse-icon {
          animation: pulse 2s ease-in-out infinite;
        }

        .step-icon {
          transition: transform 0.3s ease;
        }

        .how-it-works-step:hover .step-icon {
          transform: rotate(15deg) scale(1.1);
        }

        .fade-in-section {
          transition: opacity 0.6s ease-out, transform 0.6s ease-out;
        }

        .fade-in-section.animate-in {
          opacity: 1 !important;
          animation: fade-in 0.6s ease-out forwards;
        }

        .feature-content {
          opacity: 0;
          transform: translateY(30px);
        }

        .feature-image {
          transform: translateY(50px) scale(0.9);
        }

        .noise-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          opacity: 0.03;
          z-index: 1;
          pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
        }
        
        html, body {
          overflow-x: hidden;
        }
        
        /* Smooth scrolling for the page */
        html {
          scroll-behavior: smooth;
        }

        /* Progress line animation */
        .progress-line {
          transition: height 1s ease-out;
        }

        /* How it works specific styles */
        .how-it-works-header h2,
        .how-it-works-header p {
          transition: opacity 0.6s ease-out, transform 0.6s ease-out;
        }

        .step-number {
          transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .pill, .stat-item, .export-option {
          transition: opacity 0.6s ease-out, transform 0.6s ease-out;
        }

        .icon-item {
          transition: opacity 0.5s ease-out, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .arrow-icon {
          transition: opacity 0.6s ease-out;
        }

        /* Initial hidden states for animations */
        .how-it-works-header h2.opacity-0,
        .how-it-works-header p.opacity-0 {
          opacity: 0;
          transform: translateY(10px);
        }

        .step-number.scale-0 {
          opacity: 0;
          transform: scale(0);
        }

        .step-content.opacity-0 {
          opacity: 0;
          transform: translateX(50px);
        }

        .step-image.opacity-0 {
          opacity: 0;
          transform: translateX(-50px);
        }

        /* Reverse for even steps */
        .how-it-works-step:nth-child(even) .step-content.opacity-0 {
          transform: translateX(-50px);
        }

        .how-it-works-step:nth-child(even) .step-image.opacity-0 {
          transform: translateX(50px);
        }

        .typing-text.opacity-0 {
          opacity: 0;
        }

        .typing-text {
          min-height: 1.2em;
          display: inline-block;
        }

        .typing-cursor {
          animation: blink 1s infinite;
          color: #FF4301;
          font-weight: bold;
        }

        .pill.opacity-0 {
          opacity: 0;
          transform: translateY(20px);
        }

        .stat-item.opacity-0 {
          opacity: 0;
          transform: translateY(20px);
        }

        .icon-item.opacity-0 {
          opacity: 0;
          transform: scale(0);
        }

        .icon-item.scale-0 {
          opacity: 0;
          transform: scale(0);
        }

        .arrow-icon.opacity-0 {
          opacity: 0;
        }

        .export-option.opacity-0 {
          opacity: 0;
          transform: translateY(20px);
        }
      `}</style>
    </div>
  );
};

export default Landing; 