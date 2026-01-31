export interface LandingPageConfig {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  headline: string;
  subheadline: string;
  features: { icon: string; title: string; description: string }[];
  useCases: string[];
  ctaText: string;
  ctaSubtext: string;
  templateCategory?: string; // Links to template gallery category
  communityCategory?: string; // Maps to community/showcase category for featured decks
  heroGradient: string; // Tailwind gradient classes
}

// Use-Case Landing Pages
export const useCaseLandingPages: LandingPageConfig[] = [
  {
    slug: 'pitch-deck',
    title: 'AI Pitch Deck Maker',
    metaTitle: 'Create a Pitch Deck in 60 Seconds with AI | NextSlide',
    metaDescription: 'Generate professional pitch decks instantly with AI. Perfect for startups, fundraising, and investor presentations. Free to start.',
    headline: 'Create a Pitch Deck in 60 Seconds',
    subheadline: 'AI-powered pitch decks that impress investors. Just describe your startup and watch the magic happen.',
    features: [
      { icon: 'Zap', title: 'Instant Generation', description: 'Describe your startup and get a complete pitch deck in seconds' },
      { icon: 'TrendingUp', title: 'Investor-Ready', description: 'Professional layouts designed for fundraising success' },
      { icon: 'Palette', title: 'Fully Customizable', description: 'Edit every slide, chart, and visual to match your brand' },
      { icon: 'Share2', title: 'Easy Sharing', description: 'Share with investors via link or export to PowerPoint' },
    ],
    useCases: ['Seed Round Pitch', 'Series A Deck', 'Demo Day Presentation', 'Investor Update'],
    ctaText: 'Create Your Pitch Deck Free',
    ctaSubtext: 'No credit card required. Generate your first deck in 60 seconds.',
    templateCategory: 'business',
    communityCategory: 'business',
    heroGradient: 'from-blue-600 via-purple-600 to-indigo-700',
  },
  {
    slug: 'sales-deck',
    title: 'AI Sales Deck Maker',
    metaTitle: 'AI-Powered Sales Presentations | NextSlide',
    metaDescription: 'Create compelling sales decks with AI. Close more deals with professional presentations that highlight your value proposition.',
    headline: 'Sales Presentations That Close Deals',
    subheadline: 'AI creates persuasive sales decks tailored to your product, audience, and goals.',
    features: [
      { icon: 'Target', title: 'Audience-Focused', description: 'AI tailors messaging to your target customer persona' },
      { icon: 'BarChart3', title: 'Data-Driven', description: 'Automatic charts and metrics that prove your value' },
      { icon: 'Sparkles', title: 'Professional Design', description: 'Polished slides that reflect enterprise quality' },
      { icon: 'Clock', title: 'Save Hours', description: 'What takes hours manually, AI does in seconds' },
    ],
    useCases: ['Product Demo', 'Quarterly Business Review', 'Client Proposal', 'Partnership Pitch'],
    ctaText: 'Build Your Sales Deck',
    ctaSubtext: 'Start free. Upgrade when you need more.',
    templateCategory: 'business',
    communityCategory: 'business',
    heroGradient: 'from-emerald-600 via-teal-600 to-cyan-700',
  },
  {
    slug: 'education',
    title: 'AI Presentations for Education',
    metaTitle: 'Create Course Materials with AI | NextSlide for Education',
    metaDescription: 'Generate engaging educational presentations with AI. Perfect for lectures, courses, workshops, and training materials.',
    headline: 'Create Course Materials in Minutes',
    subheadline: 'AI-powered presentations for educators who want to focus on teaching, not slide design.',
    features: [
      { icon: 'GraduationCap', title: 'Educational Layouts', description: 'Designs optimized for learning and retention' },
      { icon: 'BookOpen', title: 'Content-Rich', description: 'AI generates comprehensive, accurate content' },
      { icon: 'Users', title: 'Student-Friendly', description: 'Clear, engaging visuals that keep students focused' },
      { icon: 'Download', title: 'Multi-Format', description: 'Export as slides, PDF handouts, or web pages' },
    ],
    useCases: ['University Lectures', 'Online Courses', 'Workshop Materials', 'Training Programs'],
    ctaText: 'Create Your First Lesson',
    ctaSubtext: 'Free for educators. No design skills needed.',
    templateCategory: 'education',
    communityCategory: 'education',
    heroGradient: 'from-amber-500 via-orange-500 to-red-500',
  },
  {
    slug: 'marketing',
    title: 'AI Marketing Presentations',
    metaTitle: 'Marketing Presentation Templates | NextSlide AI',
    metaDescription: 'Create stunning marketing presentations with AI. Strategy decks, campaign reports, social media plans, and more.',
    headline: 'Marketing Presentations That Stand Out',
    subheadline: 'From strategy decks to campaign reports, AI creates presentations that make your marketing shine.',
    features: [
      { icon: 'Megaphone', title: 'Brand-Aligned', description: 'AI matches your brand colors, fonts, and voice' },
      { icon: 'LineChart', title: 'Metrics & Analytics', description: 'Beautiful charts showing campaign performance' },
      { icon: 'Lightbulb', title: 'Creative Layouts', description: 'Eye-catching designs that capture attention' },
      { icon: 'Repeat', title: 'Easy Updates', description: 'Quickly update decks for weekly or monthly reports' },
    ],
    useCases: ['Marketing Strategy', 'Campaign Report', 'Social Media Plan', 'Content Calendar'],
    ctaText: 'Create Marketing Deck',
    ctaSubtext: 'Professional presentations in seconds.',
    templateCategory: 'marketing',
    communityCategory: 'marketing',
    heroGradient: 'from-pink-600 via-rose-600 to-red-600',
  },
];

// Industry Landing Pages
export const industryLandingPages: LandingPageConfig[] = [
  {
    slug: 'startups',
    title: 'NextSlide for Startups',
    metaTitle: 'AI Presentations for Startups | NextSlide',
    metaDescription: 'The fastest way for startups to create pitch decks, investor updates, and team presentations. Used by 1000+ startups.',
    headline: 'The Startup Presentation Tool',
    subheadline: 'From pitch decks to board updates, create professional presentations as fast as your startup moves.',
    features: [
      { icon: 'Rocket', title: 'Move Fast', description: 'Generate decks in seconds, not hours' },
      { icon: 'DollarSign', title: 'Free to Start', description: 'Generous free tier for early-stage startups' },
      { icon: 'Users', title: 'Team Collaboration', description: 'Share and collaborate with your whole team' },
      { icon: 'Award', title: 'Investor-Ready', description: 'Professional designs that impress VCs' },
    ],
    useCases: ['Pitch Deck', 'Investor Update', 'Board Meeting', 'Product Demo', 'Team All-Hands'],
    ctaText: 'Start Building Free',
    ctaSubtext: 'Join 1,000+ startups using NextSlide.',
    communityCategory: 'business',
    heroGradient: 'from-violet-600 via-purple-600 to-fuchsia-600',
  },
  {
    slug: 'educators',
    title: 'NextSlide for Educators',
    metaTitle: 'AI Presentations for Educators | NextSlide',
    metaDescription: 'Save hours on lesson planning. AI creates engaging educational presentations for lectures, courses, and workshops.',
    headline: 'Presentations Made for Teaching',
    subheadline: 'Spend less time on slides, more time on students. AI creates beautiful educational content.',
    features: [
      { icon: 'Clock', title: 'Save Time', description: 'Create a full lecture in minutes, not hours' },
      { icon: 'Brain', title: 'Engaging Content', description: 'AI creates content optimized for learning' },
      { icon: 'Palette', title: 'Visual Learning', description: 'Automatic diagrams, charts, and illustrations' },
      { icon: 'Share2', title: 'Easy Distribution', description: 'Share slides with students via link or export' },
    ],
    useCases: ['Lecture Slides', 'Course Modules', 'Workshop Materials', 'Student Handouts'],
    ctaText: 'Create Your First Lesson',
    ctaSubtext: 'Free for individual educators.',
    communityCategory: 'education',
    heroGradient: 'from-sky-500 via-blue-600 to-indigo-600',
  },
  {
    slug: 'marketers',
    title: 'NextSlide for Marketers',
    metaTitle: 'AI Presentations for Marketers | NextSlide',
    metaDescription: 'Create marketing presentations, strategy decks, and campaign reports in seconds with AI.',
    headline: 'Marketing Decks, Supercharged',
    subheadline: 'Strategy presentations, campaign reports, and pitches -- all generated by AI in your brand style.',
    features: [
      { icon: 'Zap', title: 'Instant Decks', description: 'From brief to beautiful deck in 60 seconds' },
      { icon: 'BarChart3', title: 'Data Stories', description: 'Turn metrics into compelling visual narratives' },
      { icon: 'Palette', title: 'On-Brand', description: 'AI applies your brand guidelines automatically' },
      { icon: 'Repeat', title: 'Template Library', description: 'Pre-built templates for every marketing need' },
    ],
    useCases: ['Strategy Deck', 'Campaign Report', 'Client Pitch', 'Social Media Plan'],
    ctaText: 'Start Creating Free',
    ctaSubtext: 'No design skills needed.',
    communityCategory: 'marketing',
    heroGradient: 'from-orange-500 via-red-500 to-pink-600',
  },
  {
    slug: 'consultants',
    title: 'NextSlide for Consultants',
    metaTitle: 'AI Presentations for Consultants | NextSlide',
    metaDescription: 'Create polished consulting deliverables in seconds. Strategy presentations, analysis decks, and client reports.',
    headline: 'Consulting-Grade Presentations',
    subheadline: 'Deliver McKinsey-quality slides without the McKinsey timeline. AI handles the design while you focus on insights.',
    features: [
      { icon: 'Briefcase', title: 'Professional Polish', description: 'Enterprise-ready designs that impress clients' },
      { icon: 'BarChart3', title: 'Data Visualization', description: 'Beautiful charts from your analysis data' },
      { icon: 'FileText', title: 'Framework Templates', description: 'SWOT, Porter\'s Five Forces, BCG Matrix, and more' },
      { icon: 'Lock', title: 'Confidential', description: 'Your data stays private and secure' },
    ],
    useCases: ['Client Deliverable', 'Strategy Analysis', 'Market Research', 'Change Management'],
    ctaText: 'Build Your First Deck',
    ctaSubtext: 'Professional consulting decks in seconds.',
    communityCategory: 'business',
    heroGradient: 'from-slate-700 via-zinc-700 to-neutral-800',
  },
];

export function getAllLandingPages(): LandingPageConfig[] {
  return [...useCaseLandingPages, ...industryLandingPages];
}

export function getLandingPageBySlug(slug: string): LandingPageConfig | undefined {
  return getAllLandingPages().find(p => p.slug === slug);
}
