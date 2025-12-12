import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import BrandWordmark from '@/components/common/BrandWordmark';
import { cn } from '@/lib/utils';
import {
  ArrowRight,
  Check,
  X,
  Zap,
  Sparkles,
  Crown,
  Building2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  ArrowLeft,
} from 'lucide-react';
import { useAuth } from '@/context/SupabaseAuthContext';
import { billingApi, type PricingPlan } from '@/services/billingApi';
import { toast } from '@/hooks/use-toast';

const Pricing: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [isAnnual, setIsAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [plans, setPlans] = useState<PricingPlan[]>([]);

  // Check if user came from settings
  const fromSettings = searchParams.get('from') === 'settings';

  // Handle back navigation
  const handleBack = () => {
    if (fromSettings && user) {
      navigate('/profile?tab=billing');
    } else if (user) {
      navigate('/app');
    } else {
      navigate('/');
    }
  };

  // Check for canceled checkout
  useEffect(() => {
    if (searchParams.get('canceled') === 'true') {
      toast({
        title: 'Checkout canceled',
        description: "No worries! You can upgrade anytime.",
      });
    }
  }, [searchParams]);

  // Enable scrolling
  useEffect(() => {
    document.documentElement.style.position = '';
    document.documentElement.style.overflow = '';
    document.body.style.position = '';
    document.body.style.overflow = '';

    return () => {
      document.documentElement.style.position = 'fixed';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.overflow = 'hidden';
    };
  }, []);

  // Load plans
  useEffect(() => {
    const loadPlans = async () => {
      try {
        const data = await billingApi.getPricingPlans();
        setPlans(data);
      } catch (err) {
        console.error('Failed to load plans:', err);
      }
    };
    loadPlans();
  }, []);

  const handleSubscribe = async (planId: string) => {
    if (!user) {
      navigate('/signup?redirect=/pricing');
      return;
    }

    if (planId === 'free') {
      navigate('/app');
      return;
    }

    if (planId === 'enterprise') {
      window.location.href = 'mailto:sales@nextslide.ai?subject=Enterprise%20Inquiry';
      return;
    }

    setLoading(planId);
    try {
      const session = await billingApi.createCheckout(planId);

      if (session.upgraded) {
        // Subscription was upgraded with proration - show success and redirect
        toast({
          title: 'Plan upgraded!',
          description: 'Your plan has been upgraded. You\'ll only be charged the prorated difference.',
        });
        navigate('/profile?tab=billing&upgraded=true');
        return;
      }

      if (session.already_subscribed) {
        toast({
          title: 'Already subscribed',
          description: 'You\'re already on this plan.',
        });
        navigate('/profile?tab=billing');
        return;
      }

      // New subscription - redirect to Stripe checkout
      window.location.href = session.url;
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to start checkout. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(null);
    }
  };

  // Pricing tiers (with more detail than DB)
  const tiers = [
    {
      id: 'free',
      name: 'Free',
      tagline: 'Try NextSlide',
      price: 0,
      credits: 50,
      cta: user ? 'Current Plan' : 'Get Started',
      icon: Sparkles,
      features: [
        '50 credits/month',
        '~10 presentations',
        'All AI features',
        'Export to PDF',
        'Nextslide watermark',
      ],
      excluded: ['Priority support', 'Custom branding', 'PowerPoint export'],
    },
    {
      id: 'starter',
      name: 'Starter',
      tagline: 'For individuals',
      price: 999,
      credits: 1000,
      cta: 'Get Starter',
      icon: Zap,
      popular: false,
      features: [
        '1,000 credits/month',
        '~200 presentations',
        'All AI features',
        'Export to PDF & PPTX',
        'No watermark',
        'Email support',
      ],
      excluded: ['Priority support', 'Custom branding'],
    },
    {
      id: 'pro',
      name: 'Pro',
      tagline: 'For professionals',
      price: 1999,
      credits: 2000,
      cta: 'Get Pro',
      icon: Crown,
      popular: true,
      features: [
        '2,000 credits/month',
        '~400 presentations',
        'Priority AI generation',
        'All export formats',
        'Custom branding',
        'Priority support',
        '$0.03/credit if you go over',
      ],
      excluded: [],
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      tagline: 'For large teams',
      price: -1,
      credits: -1,
      cta: 'Contact Sales',
      icon: Building2,
      features: [
        'Unlimited credits',
        'Dedicated support',
        'Custom integrations',
        'SSO & SAML',
        'SLA guarantee',
        'Custom AI models',
        'White-label option',
      ],
      excluded: [],
    },
  ];

  const faqs = [
    {
      question: 'What are credits?',
      answer:
        'Credits are used when you use AI features. Generating a slide costs 5 credits, AI chat costs 1 credit, and AI edits cost 2 credits. We show you estimates so you know roughly how many presentations you can create.',
    },
    {
      question: 'What happens if I run out of credits?',
      answer:
        "On Free or Starter, you'll need to wait until next month or upgrade. On Pro, you can keep going with a small per-credit fee ($0.03/credit) so you're never blocked.",
    },
    {
      question: 'Can I cancel anytime?',
      answer:
        "Yes! You can cancel your subscription anytime from your profile. You'll keep access until the end of your billing period.",
    },
    {
      question: 'Do unused credits roll over?',
      answer:
        'Currently, credits reset each month. We may add rollover in the future for annual plans.',
    },
    {
      question: 'Can I try it for free?',
      answer:
        "Yes! Our Free plan gives you 50 credits every month to try NextSlide. When you're ready for more, upgrade to Starter or Pro.",
    },
  ];

  const creditExamples = [
    { action: 'Generate slide', cost: 5 },
    { action: 'AI chat message', cost: 1 },
    { action: 'AI edit', cost: 2 },
    { action: 'Theme generation', cost: 3 },
    { action: 'Outline generation', cost: 2 },
  ];

  return (
    <div className="min-h-screen bg-[#FCFBF8] dark:bg-[#0a0a0a]">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-[#FCFBF8]/90 dark:bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-black/10 dark:border-white/10">
        <div className="max-w-[1400px] mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              {fromSettings ? 'Settings' : user ? 'Dashboard' : 'Home'}
            </Button>
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
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <Button variant="ghost" onClick={() => navigate('/profile?tab=billing')}>
                My Account
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate('/login')}>
                  Sign In
                </Button>
                <Button
                  onClick={() => navigate('/signup')}
                  className="bg-[#FF4301] hover:bg-[#E63901] text-white"
                >
                  Get Started
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-16 px-8">
        <div className="max-w-[1200px] mx-auto text-center">
          <h1
            className="text-black dark:text-white mb-4"
            style={{
              fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
              fontWeight: 900,
              fontSize: 'clamp(40px, 6vw, 72px)',
              lineHeight: '1.05',
              letterSpacing: '-0.02em',
              textTransform: 'uppercase',
            }}
          >
            Simple, transparent pricing
          </h1>
          <p className="text-xl text-black/60 dark:text-white/60 max-w-2xl mx-auto mb-4">
            Start free. Upgrade when you need more. No surprises.
          </p>
          <p className="text-sm text-black/40 dark:text-white/40 mb-8">
            Each slide uses ~5 credits
          </p>

          {/* Billing toggle - disabled for now */}
          {/* <div className="inline-flex items-center gap-3 bg-black/5 dark:bg-white/5 rounded-full p-1.5">
            <button
              onClick={() => setIsAnnual(false)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium transition-all',
                !isAnnual ? 'bg-white dark:bg-black shadow-sm' : 'text-black/60 dark:text-white/60'
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2',
                isAnnual ? 'bg-white dark:bg-black shadow-sm' : 'text-black/60 dark:text-white/60'
              )}
            >
              Annual
              <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">
                Save 20%
              </Badge>
            </button>
          </div> */}
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-24 px-8">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {tiers.map((tier) => {
              const Icon = tier.icon;
              const isPopular = tier.popular;
              const isEnterprise = tier.id === 'enterprise';

              return (
                <div
                  key={tier.id}
                  className={cn(
                    'relative rounded-2xl p-6 transition-all',
                    isPopular
                      ? 'bg-[#FF4301] text-white transform lg:scale-105 shadow-xl z-10'
                      : 'bg-white dark:bg-black/50 border-2 border-black/10 dark:border-white/10'
                  )}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-white text-[#FF4301] font-bold px-3 py-1">
                        MOST POPULAR
                      </Badge>
                    </div>
                  )}

                  <div className="mb-6">
                    <div
                      className={cn(
                        'w-12 h-12 rounded-xl flex items-center justify-center mb-4',
                        isPopular ? 'bg-white/20' : 'bg-[#FF4301]/10'
                      )}
                    >
                      <Icon className={cn('w-6 h-6', isPopular ? 'text-white' : 'text-[#FF4301]')} />
                    </div>

                    <h3
                      className={cn(
                        'text-xl font-bold mb-1',
                        isPopular ? 'text-white' : 'text-black dark:text-white'
                      )}
                      style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
                    >
                      {tier.name}
                    </h3>
                    <p
                      className={cn(
                        'text-sm',
                        isPopular ? 'text-white/80' : 'text-black/50 dark:text-white/50'
                      )}
                    >
                      {tier.tagline}
                    </p>
                  </div>

                  <div className="mb-6">
                    {isEnterprise ? (
                      <div
                        className={cn(
                          'text-3xl font-bold',
                          isPopular ? 'text-white' : 'text-black dark:text-white'
                        )}
                        style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
                      >
                        Custom
                      </div>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span
                            className={cn(
                              'text-4xl font-bold',
                              isPopular ? 'text-white' : 'text-black dark:text-white'
                            )}
                            style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
                          >
                            ${(tier.price / 100).toFixed(tier.price === 0 ? 0 : 2)}
                          </span>
                          {tier.price > 0 && (
                            <span
                              className={cn(
                                'text-sm',
                                isPopular ? 'text-white/80' : 'text-black/50 dark:text-white/50'
                              )}
                            >
                              /month
                            </span>
                          )}
                        </div>
                        <p
                          className={cn(
                            'text-sm mt-1',
                            isPopular ? 'text-white/70' : 'text-black/40 dark:text-white/40'
                          )}
                        >
                          {tier.credits} credits/month
                        </p>
                      </>
                    )}
                  </div>

                  <Button
                    className={cn(
                      'w-full mb-6 font-semibold',
                      isPopular
                        ? 'bg-white text-[#FF4301] hover:bg-zinc-100'
                        : 'bg-[#FF4301] text-white hover:bg-[#E63901]'
                    )}
                    onClick={() => handleSubscribe(tier.id)}
                    disabled={loading === tier.id}
                  >
                    {loading === tier.id ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Loading...
                      </span>
                    ) : (
                      <>
                        {tier.cta}
                        {tier.id !== 'free' && <ArrowRight className="w-4 h-4 ml-2" />}
                      </>
                    )}
                  </Button>

                  <ul className="space-y-3">
                    {tier.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check
                          className={cn(
                            'w-4 h-4 flex-shrink-0 mt-0.5',
                            isPopular ? 'text-white' : 'text-[#FF4301]'
                          )}
                        />
                        <span className={isPopular ? 'text-white/90' : 'text-black/70 dark:text-white/70'}>
                          {feature}
                        </span>
                      </li>
                    ))}
                    {tier.excluded?.map((feature, i) => (
                      <li key={`ex-${i}`} className="flex items-start gap-2 text-sm opacity-40">
                        <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span className="line-through">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Credit Costs Breakdown */}
      <section className="py-16 px-8 bg-white dark:bg-black/30">
        <div className="max-w-[800px] mx-auto">
          <div className="text-center mb-12">
            <h2
              className="text-black dark:text-white mb-4"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(28px, 4vw, 40px)',
                letterSpacing: '-0.02em',
                textTransform: 'uppercase',
              }}
            >
              How credits work
            </h2>
            <p className="text-black/60 dark:text-white/60">
              Simple, predictable pricing for every AI action
            </p>
          </div>

          <div className="bg-[#FCFBF8] dark:bg-[#0a0a0a] rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden">
            {creditExamples.map((item, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center justify-between p-4',
                  i !== creditExamples.length - 1 && 'border-b border-black/5 dark:border-white/5'
                )}
              >
                <span className="text-black dark:text-white font-medium">{item.action}</span>
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-[#FF4301]" />
                  <span className="text-black dark:text-white font-bold">{item.cost} credits</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 p-6 bg-[#FF4301]/5 rounded-2xl border border-[#FF4301]/20">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#FF4301]/10 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-[#FF4301]" />
              </div>
              <div>
                <h4 className="font-bold text-black dark:text-white mb-1">Quick estimate</h4>
                <p className="text-sm text-black/60 dark:text-white/60">
                  A typical 10-slide presentation uses about <strong>50-60 credits</strong>. On Pro (2,000 credits),
                  that's roughly <strong>30-40 full presentations per month</strong>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 px-8 bg-[#FCFBF8] dark:bg-[#0a0a0a]">
        <div className="max-w-[800px] mx-auto">
          <div className="text-center mb-12">
            <h2
              className="text-black dark:text-white mb-4"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(28px, 4vw, 40px)',
                letterSpacing: '-0.02em',
                textTransform: 'uppercase',
              }}
            >
              Questions?
            </h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="bg-white dark:bg-black/50 rounded-xl border border-black/10 dark:border-white/10 overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="w-full p-5 flex items-center justify-between text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <span
                    className="text-base font-bold text-black dark:text-white pr-8"
                    style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
                  >
                    {faq.question}
                  </span>
                  {openFaq === index ? (
                    <ChevronUp className="w-5 h-5 text-[#FF4301] flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-black/40 dark:text-white/40 flex-shrink-0" />
                  )}
                </button>
                {openFaq === index && (
                  <div className="px-5 pb-5">
                    <p className="text-black/70 dark:text-white/70 leading-relaxed">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-8 bg-[#FF4301] text-white">
        <div className="max-w-[800px] mx-auto text-center">
          <h2
            className="mb-4"
            style={{
              fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
              fontWeight: 900,
              fontSize: 'clamp(32px, 5vw, 48px)',
              letterSpacing: '-0.02em',
              textTransform: 'uppercase',
            }}
          >
            Ready to create?
          </h2>
          <p className="text-xl opacity-90 mb-8">Start free. No credit card required.</p>
          <Button
            size="lg"
            className="bg-white text-[#FF4301] hover:bg-zinc-100 px-10 py-6 text-base font-bold shadow-xl"
            onClick={() => navigate(user ? '/app' : '/signup')}
          >
            {user ? 'Go to Dashboard' : 'Get Started Free'}
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black text-white/60 py-12 px-8">
        <div className="max-w-[1400px] mx-auto text-center">
          <BrandWordmark tag="h3" sizePx={16} textColor="#ffffff" />
          <p className="text-sm mt-4">&copy; 2025 NextSlide. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Pricing;
